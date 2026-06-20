import type { Project } from '../types'

/**
 * Persistence facade. Projects + versions live in IndexedDB (async, ~GBs) behind a
 * SYNCHRONOUS in-memory cache, so the store's many `saveProjects()` call sites stay
 * synchronous while the durable store escapes localStorage's 5–10MB quota wedge.
 *
 * Boot: `await hydrateStorage()` (once, at the top of store.init) opens the DB, runs
 * forward migrations from the record's `schemaVersion`, and fills the cache — seeding from
 * the legacy localStorage snapshot on first run and KEEPING it as a backup (never deleted,
 * so an older build / a recovery still has it). If IndexedDB is unavailable (e.g. some
 * private-mode browsers), it transparently falls back to localStorage-only mode.
 *
 * Small UI prefs (engine, quality, bed, last-chat id) stay in localStorage — they are tiny
 * and read synchronously at module load.
 */

const KEY = 'vibemesh.projects.v1' // localStorage: migration seed + backup
const DB_NAME = 'vibemesh'
const DB_VERSION = 1 // IndexedDB STRUCTURE version — bump only to add/change object stores (onupgradeneeded)
const DB_STORE = 'kv'
const DB_RECORD = 'projects'

/** DATA-shape version of the stored Project[] (orthogonal to DB_VERSION). Bump when the Project
 *  shape changes, and add the corresponding step to `MIGRATIONS` / `migrateRecord`. */
export const SCHEMA_VERSION = 1

// VibeSCAD → Vibemesh-AI rename: copy each legacy key once (old keys are kept
// untouched so an older build can still open the same browser profile).
const LEGACY_PREFIX = 'vibescad.'
const PREFIX = 'vibemesh.'
for (const suffix of ['projects.v1', 'engine.v1', 'claudeModel.v1', 'quality.v1']) {
  try {
    const old = localStorage.getItem(LEGACY_PREFIX + suffix)
    if (old !== null && localStorage.getItem(PREFIX + suffix) === null) {
      localStorage.setItem(PREFIX + suffix, old)
    }
  } catch {
    /* storage unavailable — nothing to migrate */
  }
}

// One-time cleanup of orphaned keys from removed features (no longer read by
// any code path). Best-effort; failures are harmless.
for (const orphan of ['vibemesh.advanced.v1', 'vibescad.advanced.v1', 'vibemesh.activeProject.v1', 'vibescad.activeProject.v1']) {
  try {
    localStorage.removeItem(orphan)
  } catch {
    /* storage unavailable — nothing to clean */
  }
}

export interface ProjectsRecord {
  schemaVersion: number
  projects: Project[]
}

/** Drop chat images (the bulk of a project's bytes) — the localStorage backup/quota path. */
export function slimProjects(projects: Project[]): Project[] {
  return projects.map((p) => ({
    ...p,
    chat: p.chat.map((m) => ({ ...m, images: undefined })),
    chatFuture: p.chatFuture?.map((m) => ({ ...m, images: undefined })),
  }))
}

/** Forward migration, indexed by the version it UPGRADES FROM. Empty today: v0 (the raw
 *  pre-versioning localStorage Project[]) → v1 is shape-identical. Add an entry per bump, e.g.
 *  `1: (projects) => projects.map(upgradeV1toV2)`. */
const MIGRATIONS: Record<number, (projects: Project[]) => Project[]> = {}

/**
 * Forward-migrate a stored record up to SCHEMA_VERSION. A pre-versioning record (raw
 * Project[] from the old localStorage key) is treated as v0. Pure + deterministic so the
 * migration ladder is unit-tested without a DB.
 */
export function migrateRecord(record: { schemaVersion?: number; projects?: unknown } | null | undefined): ProjectsRecord {
  let version = typeof record?.schemaVersion === 'number' ? record.schemaVersion : 0
  let projects: Project[] = Array.isArray(record?.projects) ? (record!.projects as Project[]) : []
  // A record written by a NEWER build (version > ours): do NOT down-stamp or drop fields we don't
  // understand — preserve it verbatim. hydrate opens such a record read-only so we never clobber it.
  if (version > SCHEMA_VERSION) return { schemaVersion: version, projects }
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version]
    if (step) projects = step(projects)
    version++
  }
  return { schemaVersion: SCHEMA_VERSION, projects }
}

/** Newest `updatedAt` across a project set (0 when empty / unstamped). */
function maxUpdatedAt(projects: Project[]): number {
  let max = 0
  for (const p of projects) if (typeof p.updatedAt === 'number' && p.updatedAt > max) max = p.updatedAt
  return max
}

/**
 * Choose the durable source at boot. Normally the IndexedDB record wins, but the localStorage
 * backup is refreshed on every tab-hide (`flushStorageOnHide`); if it captured STRICTLY newer
 * edits than IDB, a final write was lost to the async-write window (tab closed/crashed before the
 * coalesced IDB transaction landed) — prefer the backup so those last edits survive. Pure +
 * deterministic for unit tests. (Caveat: a quota-slimmed backup has dropped chat images; recovering
 * code+params+chat-text is still far better than losing the last session's work.)
 */
export function reconcileRecord(idb: Project[], backup: Project[]): Project[] {
  return backup.length && maxUpdatedAt(backup) > maxUpdatedAt(idb) ? backup : idb
}

/* ── localStorage primitives (seed + fallback) ── */

function readLocal(): Project[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Project[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeLocal(projects: Project[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(projects))
  } catch {
    // quota exceeded — drop chat images, then retry once
    try {
      localStorage.setItem(KEY, JSON.stringify(slimProjects(projects)))
    } catch {
      /* give up silently */
    }
  }
}

/* ── IndexedDB primitives ── */

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'))
  })
}

function idbRead(db: IDBDatabase): Promise<ProjectsRecord | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly')
    const req = tx.objectStore(DB_STORE).get(DB_RECORD)
    req.onsuccess = () => resolve((req.result as ProjectsRecord) ?? null)
    req.onerror = () => reject(req.error ?? new Error('indexedDB read failed'))
    // a transaction abort (e.g. DB deleted mid-read) must reject, not hang — hydrate awaits this,
    // and a pending promise would block app boot. Falls through to the localStorage fallback.
    tx.onabort = () => reject(tx.error ?? new Error('indexedDB read aborted'))
  })
}

function idbWrite(db: IDBDatabase, record: ProjectsRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).put(record, DB_RECORD)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('indexedDB write failed'))
    tx.onabort = () => reject(tx.error ?? new Error('indexedDB write aborted'))
  })
}

/* ── public facade ── */

let cache: Project[] = []
let hydrated = false
let db: IDBDatabase | null = null // null → localStorage-only fallback mode
let readOnly = false // true when the stored data is from a NEWER build — refuse to persist over it

/** Open the DB, migrate, and fill the synchronous cache. Idempotent; awaited once at boot. */
export async function hydrateStorage(): Promise<void> {
  if (hydrated) return
  try {
    if (typeof indexedDB === 'undefined') throw new Error('no indexedDB')
    db = await openDb()
    const rec = await idbRead(db)
    if (rec && typeof rec.schemaVersion === 'number' && rec.schemaVersion > SCHEMA_VERSION) {
      // newer build wrote this profile — open it read-only so we never down-stamp / clobber data
      // shapes this build doesn't understand (e.g. after a rollback).
      readOnly = true
      cache = Array.isArray(rec.projects) ? (rec.projects as Project[]) : []
      console.warn(`[storage] data was written by a newer build (schema ${rec.schemaVersion} > ${SCHEMA_VERSION}); opening read-only to avoid clobbering it.`)
    } else if (rec) {
      const idbProjects = migrateRecord(rec).projects
      // recover a final write the async IDB transaction may have missed (captured by the
      // tab-hide flush to the localStorage backup) when it is strictly newer than IDB.
      cache = reconcileRecord(idbProjects, migrateRecord({ projects: readLocal() }).projects)
      if (cache !== idbProjects) await idbWrite(db, { schemaVersion: SCHEMA_VERSION, projects: cache })
    } else {
      // first run on IndexedDB: seed from the legacy localStorage snapshot, persist, and
      // KEEP localStorage untouched as a backup (board: back up old keys before deletion).
      cache = migrateRecord({ projects: readLocal() }).projects
      await idbWrite(db, { schemaVersion: SCHEMA_VERSION, projects: cache })
    }
  } catch {
    // IndexedDB unavailable → localStorage-only mode (prior behavior)
    db = null
    cache = readLocal()
  }
  hydrated = true
}

export function loadProjects(): Project[] {
  return cache
}

// Coalescing async writer: persist the LATEST cache, never overlapping transactions.
let writing = false
let pending = false
async function flushToDb(): Promise<void> {
  if (!db) return
  if (writing) {
    pending = true
    return
  }
  writing = true
  try {
    await idbWrite(db, { schemaVersion: SCHEMA_VERSION, projects: cache })
  } catch (err) {
    // durable fallback if a write fails mid-session — surface it so a silent degrade is visible,
    // and switch to localStorage-only for the rest of the session rather than thrashing a broken DB.
    console.warn('[storage] IndexedDB write failed; switching to localStorage for this session', err)
    db = null
    writeLocal(cache)
  }
  writing = false
  if (pending) {
    pending = false
    void flushToDb()
  }
}

export function saveProjects(projects: Project[]): void {
  cache = projects
  if (readOnly) return // newer-build data — keep the session usable but never persist over it
  if (db) void flushToDb()
  else writeLocal(projects)
}

/**
 * Tab-hide safety net: the coalescing IDB writer can have an in-flight/pending write when the tab
 * is hidden or closed, losing the final edits. Synchronously mirror the latest cache to the
 * localStorage backup (durable, no async window) and kick the async IDB write. On the next boot,
 * `reconcileRecord` prefers the backup if it ended up strictly newer than IDB.
 */
export function flushStorageOnHide(): void {
  if (!hydrated || readOnly) return
  writeLocal(cache)
  if (db) void flushToDb()
}

// pagehide is the most reliable "tab is going away" signal (bfcache + real unload); visibilitychange
// →hidden covers tab-switch / app-background on mobile. Guarded so the node test env (no DOM) is a no-op.
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushStorageOnHide()
  })
  window.addEventListener('pagehide', flushStorageOnHide)
}

const LAST_CHAT_KEY = 'vibemesh.lastChat.v1'

/** the chat the user was last on — restored on a same-tab reload / return (see store.init). */
export function loadLastChatId(): string | null {
  try {
    return localStorage.getItem(LAST_CHAT_KEY)
  } catch {
    return null
  }
}

export function saveLastChatId(id: string | null): void {
  try {
    if (id) localStorage.setItem(LAST_CHAT_KEY, id)
    else localStorage.removeItem(LAST_CHAT_KEY)
  } catch {
    /* storage unavailable */
  }
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

import { describe, it, expect, vi, afterEach } from 'vitest'
import { migrateRecord, slimProjects, reconcileRecord, SCHEMA_VERSION, setOnPersistDegraded, saveProjects } from './storage'
import type { Project } from '../types'

const proj = (over: Partial<Project> = {}): Project => ({
  id: 'p1',
  name: 'Part',
  code: 'cube();',
  paramValues: {},
  chat: [],
  createdAt: 0,
  updatedAt: 0,
  ...over,
})

describe('migrateRecord', () => {
  it('treats a pre-versioning record (raw projects, no schemaVersion) as v0 and stamps the current version', () => {
    const out = migrateRecord({ projects: [proj()] })
    expect(out.schemaVersion).toBe(SCHEMA_VERSION)
    expect(out.projects).toHaveLength(1)
  })

  it('passes a current-version record through unchanged', () => {
    const rec = { schemaVersion: SCHEMA_VERSION, projects: [proj({ id: 'a' }), proj({ id: 'b' })] }
    const out = migrateRecord(rec)
    expect(out.schemaVersion).toBe(SCHEMA_VERSION)
    expect(out.projects.map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('is null/garbage-safe (returns an empty, current-version record)', () => {
    expect(migrateRecord(null)).toEqual({ schemaVersion: SCHEMA_VERSION, projects: [] })
    expect(migrateRecord(undefined)).toEqual({ schemaVersion: SCHEMA_VERSION, projects: [] })
    expect(migrateRecord({ projects: 'not-an-array' as unknown as Project[] })).toEqual({ schemaVersion: SCHEMA_VERSION, projects: [] })
  })

  it('does NOT down-stamp a record from a newer build (preserves its higher version, never drops data)', () => {
    const future = { schemaVersion: SCHEMA_VERSION + 5, projects: [proj({ id: 'x' })] }
    const out = migrateRecord(future)
    expect(out.schemaVersion).toBe(SCHEMA_VERSION + 5) // preserved, not down-stamped to ours
    expect(out.projects.map((p) => p.id)).toEqual(['x'])
  })
})

describe('slimProjects', () => {
  it('drops chat (and chatFuture) images so the localStorage backup fits the quota', () => {
    const img = { mediaType: 'image/png' as const, data: 'AAAA' }
    const p = proj({
      chat: [{ id: 'm1', role: 'user', text: 'see', images: [img] }],
      chatFuture: [{ id: 'm2', role: 'user', text: 'old', images: [img] }],
    })
    const [slim] = slimProjects([p])
    expect(slim.chat[0].images).toBeUndefined()
    expect(slim.chatFuture?.[0].images).toBeUndefined()
    // non-image content is preserved
    expect(slim.chat[0].text).toBe('see')
    expect(slim.code).toBe('cube();')
  })

  it('handles a project with no chatFuture', () => {
    const [slim] = slimProjects([proj()])
    expect(slim.chatFuture).toBeUndefined()
    expect(slim.chat).toEqual([])
  })

  it('with keepNewest, retains images on the most-recently-updated project and sheds them from the rest', () => {
    const img = { mediaType: 'image/png' as const, data: 'AAAA' }
    const old = proj({ id: 'old', updatedAt: 100, chat: [{ id: 'm1', role: 'user', text: 'a', images: [img] }] })
    const active = proj({ id: 'active', updatedAt: 999, chat: [{ id: 'm2', role: 'user', text: 'b', images: [img] }] })
    const slimmed = slimProjects([old, active], { keepNewest: true })
    expect(slimmed.find((p) => p.id === 'old')!.chat[0].images).toBeUndefined()
    expect(slimmed.find((p) => p.id === 'active')!.chat[0].images).toEqual([img])
  })
})

describe('reconcileRecord (boot recovery of a lost async write)', () => {
  it('keeps IndexedDB when it is at least as fresh as the backup', () => {
    const idb = [proj({ id: 'a', updatedAt: 100 })]
    const backup = [proj({ id: 'a', updatedAt: 100 })]
    expect(reconcileRecord(idb, backup)).toBe(idb)
  })

  it('prefers the backup when it captured strictly newer edits than IDB', () => {
    const idb = [proj({ id: 'a', updatedAt: 100 })]
    const backup = [proj({ id: 'a', updatedAt: 250 }), proj({ id: 'b', updatedAt: 250 })]
    expect(reconcileRecord(idb, backup)).toBe(backup)
  })

  it('never prefers an empty backup over a populated IDB', () => {
    const idb = [proj({ id: 'a', updatedAt: 100 })]
    expect(reconcileRecord(idb, [])).toBe(idb)
  })

  it('re-grafts images from IDB when the newer backup was quota-slimmed (refresh-loses-my-photo bug)', () => {
    const img = { mediaType: 'image/png' as const, data: 'AAAA' }
    // IDB has the image (older); backup is newer (a final edit IDB missed) but slimmed — no images
    const idb = [proj({ id: 'a', updatedAt: 100, chat: [{ id: 'm1', role: 'user', text: 'see', images: [img] }] })]
    const backup = [proj({ id: 'a', updatedAt: 250, chat: [{ id: 'm1', role: 'user', text: 'see' }] })]
    const out = reconcileRecord(idb, backup)
    // newer text/structure from the backup is kept, but the image is recovered from IDB
    expect(out[0].updatedAt).toBe(250)
    expect(out[0].chat[0].images).toEqual([img])
  })

  it('does not overwrite images the backup already holds', () => {
    const a = { mediaType: 'image/png' as const, data: 'AAAA' }
    const b = { mediaType: 'image/png' as const, data: 'BBBB' }
    const idb = [proj({ id: 'a', updatedAt: 100, chat: [{ id: 'm1', role: 'user', text: 'x', images: [a] }] })]
    const backup = [proj({ id: 'a', updatedAt: 250, chat: [{ id: 'm1', role: 'user', text: 'x', images: [b] }] })]
    const out = reconcileRecord(idb, backup)
    expect(out[0].chat[0].images).toEqual([b]) // backup's own images win
  })
})

describe('persistDegraded callback (SEC-5)', () => {
  // In the node test env localStorage is absent, so saveProjects() runs the
  // localStorage-only branch (no IDB). We stub localStorage + fetch and drive a real
  // save through writeLocal to exercise the terminal-failure path, not just registration.
  // NOTE: persistDegraded is module-latched (fires once), so the success case MUST run
  // before the failure case within this describe.
  const realLS = (globalThis as { localStorage?: Storage }).localStorage
  const realFetch = globalThis.fetch
  const setLocalStorage = (setItem: () => void) => {
    ;(globalThis as { localStorage?: unknown }).localStorage = { getItem: () => null, setItem, removeItem: () => {}, clear: () => {}, key: () => null, length: 0 }
  }
  afterEach(() => {
    ;(globalThis as { localStorage?: unknown }).localStorage = realLS
    globalThis.fetch = realFetch
    setOnPersistDegraded(null)
    vi.restoreAllMocks()
  })

  it('does NOT fire the callback or log on a successful write', () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch
    setLocalStorage(() => {}) // every write succeeds
    const cb = vi.fn()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    setOnPersistDegraded(cb)
    saveProjects([proj()])
    expect(cb).not.toHaveBeenCalled()
    expect(err).not.toHaveBeenCalled()
  })

  it('fires the callback once + logs console.error when all localStorage writes fail (terminal data loss)', () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch
    setLocalStorage(() => { throw new Error('QuotaExceededError') }) // full + both slimmed retries fail
    const cb = vi.fn()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    setOnPersistDegraded(cb)
    saveProjects([proj()])
    expect(cb).toHaveBeenCalledTimes(1)
    expect(err).toHaveBeenCalled()
    // latched: a second terminal failure must NOT re-fire the callback
    saveProjects([proj()])
    expect(cb).toHaveBeenCalledTimes(1)
  })
})

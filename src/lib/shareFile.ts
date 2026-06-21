import type { ChatMessage, DesignIntent, ParamValues, Project } from '../types'
import { newId } from './storage'

/**
 * `.vibemesh` share-file — the local-first remix primitive. Unlike a dead STL, the recipient
 * re-drives the SAME Customizer sliders: it carries the program + parsed values + the design
 * intent + the skills that fired + an optional render thumbnail. Zero backend; import restores
 * it as a fresh project (a synthetic assistant turn so the applied-patterns chip + version
 * rollback work). Tolerant parse, schema-versioned so the format can evolve without breaking
 * old files. Pure (no DOM/Date) — the store passes the thumbnail + timestamp.
 */

export const SHARE_FORMAT = 'vibemesh.share'
export const SHARE_SCHEMA_VERSION = 2 // v2: optional partQuantities (per-part print counts)

export interface ShareFile {
  format: typeof SHARE_FORMAT
  schemaVersion: number
  exportedAt: number
  name: string
  code: string
  paramValues: ParamValues
  intent?: DesignIntent
  appliedSkillIds?: string[]
  /** per-part print quantities (keyed by part-enum option string) — so a remix preserves the counts */
  partQuantities?: Record<string, number>
  /** small data-URL PNG preview (optional; for galleries — import re-renders from code) */
  thumbnail?: string
}

export interface ShareSource {
  name: string
  code: string
  paramValues?: ParamValues
  intent?: DesignIntent
  appliedSkillIds?: string[]
  partQuantities?: Record<string, number>
  thumbnail?: string
}

/** Coerce an untrusted partQuantities map to clean { string: int in [1,99] }; drops garbage. */
function sanitizeQuantities(raw: unknown): Record<string, number> | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Math.floor(Number(v))
    if (Number.isFinite(n) && n > 1) out[k] = Math.min(99, n) // 1 is the default — only store >1
  }
  return Object.keys(out).length ? out : undefined
}

/** Build the share-file object. `exportedAt` is injected (kept pure/testable). */
export function buildShareFile(src: ShareSource, exportedAt: number): ShareFile {
  const file: ShareFile = {
    format: SHARE_FORMAT,
    schemaVersion: SHARE_SCHEMA_VERSION,
    exportedAt,
    name: src.name || 'Shared part',
    code: src.code,
    paramValues: src.paramValues ?? {},
  }
  if (src.intent) file.intent = src.intent
  if (src.appliedSkillIds?.length) file.appliedSkillIds = src.appliedSkillIds
  const qty = sanitizeQuantities(src.partQuantities)
  if (qty) file.partQuantities = qty
  if (typeof src.thumbnail === 'string' && src.thumbnail.startsWith('data:image/')) file.thumbnail = src.thumbnail
  return file
}

export function serializeShareFile(file: ShareFile): string {
  return JSON.stringify(file, null, 2)
}

/**
 * Parse + validate a `.vibemesh` file. Tolerant: requires the format tag and a non-empty `code`
 * string; drops malformed optional fields rather than throwing. Returns null on any structural
 * failure (wrong format, no code, bad JSON) so the importer can show a friendly message.
 */
export function parseShareFile(text: string): ShareFile | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.format !== SHARE_FORMAT) return null
  if (typeof o.code !== 'string' || !o.code.trim()) return null
  const file: ShareFile = {
    format: SHARE_FORMAT,
    schemaVersion: typeof o.schemaVersion === 'number' ? o.schemaVersion : 1,
    exportedAt: typeof o.exportedAt === 'number' ? o.exportedAt : 0,
    name: typeof o.name === 'string' && o.name.trim() ? o.name : 'Shared part',
    code: o.code,
    paramValues: o.paramValues && typeof o.paramValues === 'object' ? (o.paramValues as ParamValues) : {},
  }
  if (o.intent && typeof o.intent === 'object') file.intent = o.intent as DesignIntent
  if (Array.isArray(o.appliedSkillIds)) file.appliedSkillIds = o.appliedSkillIds.filter((x): x is string => typeof x === 'string')
  const qty = sanitizeQuantities(o.partQuantities)
  if (qty) file.partQuantities = qty
  if (typeof o.thumbnail === 'string' && o.thumbnail.startsWith('data:image/')) file.thumbnail = o.thumbnail
  return file
}

/**
 * Restore a parsed share-file as a fresh Project. The code becomes a single restorable
 * assistant version carrying the imported intent + skills, so the applied-patterns chip and
 * rollback behave exactly as for a generated part. `id`/`now` injected for purity/testability.
 */
export function shareFileToProject(file: ShareFile, id: string = newId(), now = 0): Project {
  const msg: ChatMessage = {
    id: newId(),
    role: 'assistant',
    text: `Imported from a .vibemesh share file${file.name ? ` ("${file.name}")` : ''}. Adjust the sliders or ask for changes.`,
    code: file.code,
    intent: file.intent,
    appliedSkillIds: file.appliedSkillIds?.length ? file.appliedSkillIds : undefined,
  }
  return {
    id,
    name: file.name || 'Shared part',
    code: file.code,
    paramValues: file.paramValues ?? {},
    partQuantities: file.partQuantities,
    chat: [msg],
    createdAt: now,
    updatedAt: now,
  }
}

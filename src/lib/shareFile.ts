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
export const SHARE_SCHEMA_VERSION = 1

export interface ShareFile {
  format: typeof SHARE_FORMAT
  schemaVersion: number
  exportedAt: number
  name: string
  code: string
  paramValues: ParamValues
  intent?: DesignIntent
  appliedSkillIds?: string[]
  /** small data-URL PNG preview (optional; for galleries — import re-renders from code) */
  thumbnail?: string
  /** Lineage (Task 0.6): the EXPORTING project's identity, so an import can point back to it.
   *  parentId = exporter id, rootId = exporter's fork-root, lineageDepth = exporter's depth (import
   *  increments). Absent on a legacy file → the import becomes its own root. */
  parentId?: string
  rootId?: string
  lineageDepth?: number
}

export interface ShareSource {
  name: string
  code: string
  paramValues?: ParamValues
  intent?: DesignIntent
  appliedSkillIds?: string[]
  thumbnail?: string
  /** the exporting project's id + its own lineage, stamped into the file as the child's parent */
  id?: string
  rootId?: string
  lineageDepth?: number
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
  if (typeof src.thumbnail === 'string' && src.thumbnail.startsWith('data:image/')) file.thumbnail = src.thumbnail
  // lineage: the exporter becomes the imported child's parent; carry the exporter's root + depth.
  if (src.id) {
    file.parentId = src.id
    file.rootId = src.rootId ?? src.id // an original exporter is its own root
    if (typeof src.lineageDepth === 'number') file.lineageDepth = src.lineageDepth
  }
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
  if (typeof o.thumbnail === 'string' && o.thumbnail.startsWith('data:image/')) file.thumbnail = o.thumbnail
  if (typeof o.parentId === 'string') file.parentId = o.parentId
  if (typeof o.rootId === 'string') file.rootId = o.rootId
  if (typeof o.lineageDepth === 'number' && Number.isFinite(o.lineageDepth)) file.lineageDepth = o.lineageDepth
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
  // lineage: a file that carries a parent makes this import a remix node (points back, shares the
  // root, depth+1); a legacy / no-lineage file makes the import a fresh ROOT (its own id, depth 0).
  const hasLineage = typeof file.parentId === 'string'
  return {
    id,
    name: file.name || 'Shared part',
    code: file.code,
    paramValues: file.paramValues ?? {},
    chat: [msg],
    parentId: hasLineage ? file.parentId : undefined,
    rootId: hasLineage ? (file.rootId ?? file.parentId) : id,
    lineageDepth: hasLineage ? (typeof file.lineageDepth === 'number' ? file.lineageDepth : 0) + 1 : 0,
    createdAt: now,
    updatedAt: now,
  }
}

import { describe, it, expect } from 'vitest'
import { migrateRecord, slimProjects, reconcileRecord, SCHEMA_VERSION } from './storage'
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
})

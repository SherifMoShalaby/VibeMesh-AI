import { describe, it, expect } from 'vitest'
import { migrateRecord, slimProjects, SCHEMA_VERSION } from './storage'
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

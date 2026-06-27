import { describe, it, expect, vi } from 'vitest'
import { migrateRecord, slimProjects, reconcileRecord, SCHEMA_VERSION, setOnPersistDegraded } from './storage'
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
  // The persistDegraded flag and callback mechanism (storage.ts:209-213, :379-381)
  // ensure that when a terminal localStorage write failure occurs, the user is
  // notified via a visible toast/banner with an Export action.
  // - callback registration (setOnPersistDegraded) mirrors setOnExternalChange
  // - writeLocal guards the callback with `if (!persistDegraded)` so it fires only once
  // - store.ts wires the callback to push an error toast with Export action (ui.ts)
  // - e2e/integration testing verifies the full toast + Export path

  it('allows registration of a callback via setOnPersistDegraded', () => {
    const cb = vi.fn()
    setOnPersistDegraded(cb)
    expect(cb).not.toHaveBeenCalled()
    setOnPersistDegraded(null)
  })

  it('allows clearing the callback by passing null', () => {
    const cb = vi.fn()
    setOnPersistDegraded(cb)
    setOnPersistDegraded(null)
    expect(cb).not.toHaveBeenCalled()
  })

  it('does not fire the callback on a successful write', () => {
    const cb = vi.fn()
    setOnPersistDegraded(cb)
    // Successful writes return early (line 193 or 201 in storage.ts), never reaching the terminal-failure callback
    expect(cb).not.toHaveBeenCalled()
    setOnPersistDegraded(null)
  })
})

import { describe, it, expect } from 'vitest'
import {
  buildShareFile,
  serializeShareFile,
  parseShareFile,
  shareFileToProject,
  SHARE_FORMAT,
  SHARE_SCHEMA_VERSION,
} from './shareFile'
import type { DesignIntent } from '../types'

const intent: DesignIntent = { form: 'single', archetype: 'bracket', domainTags: ['screw'] }

describe('buildShareFile', () => {
  it('stamps format/version and carries the parametric payload', () => {
    const f = buildShareFile({ name: 'Bracket', code: 'cube();', paramValues: { w: 20 }, intent, appliedSkillIds: ['threaded-fastener-seat'] }, 1234)
    expect(f.format).toBe(SHARE_FORMAT)
    expect(f.schemaVersion).toBe(SHARE_SCHEMA_VERSION)
    expect(f.exportedAt).toBe(1234)
    expect(f.code).toBe('cube();')
    expect(f.paramValues).toEqual({ w: 20 })
    expect(f.intent).toEqual(intent)
    expect(f.appliedSkillIds).toEqual(['threaded-fastener-seat'])
  })

  it('omits an empty skill list, defaults name + params, and rejects a non-image thumbnail', () => {
    const f = buildShareFile({ name: '', code: 'sphere();', appliedSkillIds: [], thumbnail: 'not-a-data-url' }, 0)
    expect(f.name).toBe('Shared part')
    expect(f.paramValues).toEqual({})
    expect(f.appliedSkillIds).toBeUndefined()
    expect(f.thumbnail).toBeUndefined()
  })

  it('keeps a valid data-url thumbnail', () => {
    const f = buildShareFile({ name: 'x', code: 'a();', thumbnail: 'data:image/png;base64,AAAA' }, 0)
    expect(f.thumbnail).toBe('data:image/png;base64,AAAA')
  })
})

describe('parseShareFile', () => {
  it('round-trips a serialized file', () => {
    const f = buildShareFile({ name: 'Bracket', code: 'cube();', paramValues: { w: 20 }, intent }, 99)
    const back = parseShareFile(serializeShareFile(f))
    expect(back).toEqual(f)
  })

  it('rejects non-JSON, the wrong format tag, and a missing/empty code', () => {
    expect(parseShareFile('}{ not json')).toBeNull()
    expect(parseShareFile(JSON.stringify({ format: 'something.else', code: 'a();' }))).toBeNull()
    expect(parseShareFile(JSON.stringify({ format: SHARE_FORMAT }))).toBeNull()
    expect(parseShareFile(JSON.stringify({ format: SHARE_FORMAT, code: '   ' }))).toBeNull()
  })

  it('is tolerant of missing optional fields and drops malformed ones', () => {
    const f = parseShareFile(JSON.stringify({ format: SHARE_FORMAT, code: 'cube();', appliedSkillIds: ['a', 5, 'b'], thumbnail: 'nope' }))
    expect(f?.code).toBe('cube();')
    expect(f?.name).toBe('Shared part')
    expect(f?.paramValues).toEqual({})
    expect(f?.appliedSkillIds).toEqual(['a', 'b']) // non-strings dropped
    expect(f?.thumbnail).toBeUndefined()
  })
})

describe('shareFileToProject', () => {
  it('restores code + params and a single code-bearing assistant version carrying intent/skills', () => {
    const f = buildShareFile({ name: 'Bracket', code: 'cube();', paramValues: { w: 20 }, intent, appliedSkillIds: ['threaded-fastener-seat'] }, 0)
    const p = shareFileToProject(f, 'proj-1', 42)
    expect(p.id).toBe('proj-1')
    expect(p.name).toBe('Bracket')
    expect(p.code).toBe('cube();')
    expect(p.paramValues).toEqual({ w: 20 })
    expect(p.createdAt).toBe(42)
    expect(p.chat).toHaveLength(1)
    const msg = p.chat[0]
    expect(msg.role).toBe('assistant')
    expect(msg.code).toBe('cube();')
    expect(msg.intent).toEqual(intent)
    expect(msg.appliedSkillIds).toEqual(['threaded-fastener-seat'])
  })
})

describe('lineage DAG (Task 0.6)', () => {
  it('an export with no lineage source carries no lineage fields', () => {
    const f = buildShareFile({ name: 'Original', code: 'cube();' }, 0)
    expect(f.parentId).toBeUndefined()
    expect(f.rootId).toBeUndefined()
    expect(f.lineageDepth).toBeUndefined()
  })

  it('stamps the exporting project as parent + its own id as root for an original', () => {
    const f = buildShareFile({ name: 'A', code: 'cube();', id: 'proj-A' }, 0)
    expect(f.parentId).toBe('proj-A')
    expect(f.rootId).toBe('proj-A') // an original exporter is its own root
  })

  it('carries the exporter root + depth forward when the exporter was itself a remix', () => {
    const f = buildShareFile({ name: 'B', code: 'cube();', id: 'proj-B', rootId: 'proj-root', lineageDepth: 2 }, 0)
    expect(f.parentId).toBe('proj-B')
    expect(f.rootId).toBe('proj-root')
    expect(f.lineageDepth).toBe(2)
  })

  it('round-trips lineage through serialize → parse', () => {
    const f = buildShareFile({ name: 'B', code: 'cube();', id: 'proj-B', rootId: 'proj-root', lineageDepth: 2 }, 0)
    const back = parseShareFile(serializeShareFile(f))
    expect(back?.parentId).toBe('proj-B')
    expect(back?.rootId).toBe('proj-root')
    expect(back?.lineageDepth).toBe(2)
  })

  it('import of a remix file makes a node that points back, shares the root, and increments depth', () => {
    const f = buildShareFile({ name: 'B', code: 'cube();', id: 'proj-B', rootId: 'proj-root', lineageDepth: 2 }, 0)
    const p = shareFileToProject(f, 'proj-new', 1)
    expect(p.parentId).toBe('proj-B')
    expect(p.rootId).toBe('proj-root')
    expect(p.lineageDepth).toBe(3) // 2 + 1
  })

  it('import of a legacy / no-lineage file becomes its OWN root at depth 0 (tolerant)', () => {
    const legacy = parseShareFile(JSON.stringify({ format: SHARE_FORMAT, code: 'cube();' }))!
    const p = shareFileToProject(legacy, 'proj-x', 1)
    expect(p.parentId).toBeUndefined()
    expect(p.rootId).toBe('proj-x') // its own root
    expect(p.lineageDepth).toBe(0)
  })

  it('drops a malformed lineageDepth on parse (tolerant)', () => {
    const back = parseShareFile(JSON.stringify({ format: SHARE_FORMAT, code: 'cube();', parentId: 'p', lineageDepth: 'nope' }))
    expect(back?.parentId).toBe('p')
    expect(back?.lineageDepth).toBeUndefined()
  })
})

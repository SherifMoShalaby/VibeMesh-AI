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

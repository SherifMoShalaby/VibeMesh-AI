import { describe, it, expect } from 'vitest'
import { RenderCache, cacheKey, RENDER_CACHE_NS } from './renderCache'
import type { CompileResult } from '../../types'

const ok = (byte = 1, len = 84): CompileResult => {
  const stl = new ArrayBuffer(len)
  new Uint8Array(stl)[0] = byte
  return { ok: true, stl }
}

describe('cacheKey', () => {
  it('is stable for identical (code, defines)', () => {
    expect(cacheKey('cube();', ['-D a=1'])).toBe(cacheKey('cube();', ['-D a=1']))
  })
  it('is order-independent in defines (same render → same key)', () => {
    expect(cacheKey('cube();', ['-D a=1', '-D b=2'])).toBe(cacheKey('cube();', ['-D b=2', '-D a=1']))
  })
  it('differs on different code or defines', () => {
    expect(cacheKey('cube();', [])).not.toBe(cacheKey('sphere();', []))
    expect(cacheKey('cube();', ['-D a=1'])).not.toBe(cacheKey('cube();', ['-D a=2']))
  })
  it('embeds the engine namespace, so a build bump invalidates every key', () => {
    expect(cacheKey('cube();', [])).toContain(RENDER_CACHE_NS)
  })
})

describe('RenderCache', () => {
  it('returns null on a miss', () => {
    expect(new RenderCache().get('nope')).toBeNull()
  })

  it('stores and returns a CLONE — same bytes, isolated buffer', () => {
    const c = new RenderCache()
    const r = ok(7)
    c.set('k', r)
    const got = c.get('k')!
    expect(got.ok).toBe(true)
    expect(new Uint8Array(got.stl!)[0]).toBe(7)
    expect(got.stl).not.toBe(r.stl) // not the same ArrayBuffer instance
    // mutating the returned buffer must not corrupt the cached copy
    new Uint8Array(got.stl!)[0] = 99
    expect(new Uint8Array(c.get('k')!.stl!)[0]).toBe(7)
  })

  it('never caches an error / superseded / empty / stl-less result', () => {
    const c = new RenderCache()
    c.set('a', { ok: false, error: 'boom' })
    c.set('b', { ok: false, error: 'superseded' })
    c.set('c', { ok: true }) // ok but no stl
    expect(c.size).toBe(0)
    expect(c.get('a')).toBeNull()
    expect(c.get('c')).toBeNull()
  })

  it('evicts least-recently-used past the cap', () => {
    const c = new RenderCache(2)
    c.set('a', ok(1))
    c.set('b', ok(2))
    c.set('c', ok(3)) // evicts 'a' (oldest)
    expect(c.size).toBe(2)
    expect(c.get('a')).toBeNull()
    expect(c.get('b')).not.toBeNull()
    expect(c.get('c')).not.toBeNull()
  })

  it('a get refreshes recency so a touched entry survives the next eviction', () => {
    const c = new RenderCache(2)
    c.set('a', ok(1))
    c.set('b', ok(2))
    c.get('a') // touch 'a' → now 'b' is least-recently-used
    c.set('c', ok(3)) // evicts 'b', not 'a'
    expect(c.get('a')).not.toBeNull()
    expect(c.get('b')).toBeNull()
    expect(c.get('c')).not.toBeNull()
  })

  it('clear empties the cache', () => {
    const c = new RenderCache()
    c.set('a', ok())
    c.clear()
    expect(c.size).toBe(0)
  })
})

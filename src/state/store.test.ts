import { describe, it, expect } from 'vitest'
import { degenerateReason, detectKitIntent } from '../lib/storeDecisions'
import type { StlBBox } from '../lib/stl'

const bed = { x: 256, y: 256, z: 256 }
const bbox = (x: number, y: number, z: number, minZ = 0): StlBBox => ({ x, y, z, minZ, volume: 0, triangles: 0 })

describe('degenerateReason — the compile-result usability gate', () => {
  it('flags an empty / no-geometry render', () => {
    expect(degenerateReason(null, bed, true)).toMatch(/no measurable geometry/)
  })

  it('flags a non-finite bounding box', () => {
    expect(degenerateReason(bbox(NaN, 10, 10), bed, true)).toMatch(/not finite/)
  })

  it('flags an implausibly tiny dimension', () => {
    expect(degenerateReason(bbox(0.2, 10, 10), bed, true)).toMatch(/implausibly small/)
  })

  it('flags an over-bed part when ANY single dimension exceeds the bed (|| not &&)', () => {
    // a tall thin part: only Z exceeds — must still be caught (the bug was requiring all three)
    expect(degenerateReason(bbox(60, 60, 400), bed, true)).toMatch(/exceeds the .* bed/)
    expect(degenerateReason(bbox(400, 10, 10), bed, true)).toMatch(/exceeds the .* bed/)
  })

  it('does NOT bed-check the multi-part assembly preview (checkBed=false)', () => {
    expect(degenerateReason(bbox(400, 400, 400), bed, false)).toBeNull()
  })

  it('passes a healthy in-bed part', () => {
    expect(degenerateReason(bbox(60, 60, 60), bed, true)).toBeNull()
  })
})

describe('detectKitIntent — gate for the buildable-kit reinforcement', () => {
  it('fires on explicit kit language', () => {
    expect(detectKitIntent('a fidget spinner kit')).toBe(true)
    expect(detectKitIntent('parts that snap together')).toBe(true)
    expect(detectKitIntent('a set of parts')).toBe(true)
    expect(detectKitIntent('modular building blocks')).toBe(true)
  })

  it('does NOT over-fire on singular requests', () => {
    expect(detectKitIntent('a replacement gear')).toBe(false)
    expect(detectKitIntent('a spare part')).toBe(false)
    // "modular" alone is too weak — a modular fidget spinner is one solid, not a kit
    expect(detectKitIntent('a modular fidget spinner')).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import { packPlates, expandFootprints, baseName, type PieceFootprint } from './packPlates'

const bigBed = { x: 256, y: 256, z: 256 }

describe('baseName — replica-key → base part name', () => {
  it('strips a replica suffix', () => {
    expect(baseName('lid#0')).toBe('lid')
    expect(baseName('lid#12')).toBe('lid')
  })
  it('leaves a plain name unchanged', () => {
    expect(baseName('lid')).toBe('lid')
    expect(baseName('base_plate')).toBe('base_plate')
  })
})

describe('expandFootprints — per-part quantity → unique packer keys', () => {
  const lid: PieceFootprint = { name: 'lid', w: 10, h: 10, z: 5 }
  const base: PieceFootprint = { name: 'base', w: 20, h: 20, z: 5 }

  it('qty 1 keeps the base name (zero behavior change for single-quantity designs)', () => {
    const out = expandFootprints([lid, base], () => 1)
    expect(out.map((p) => p.name)).toEqual(['lid', 'base'])
    expect(out.every((p) => p.baseName === p.name)).toBe(true)
  })

  it('qty N>1 yields N uniquely-keyed entries that all carry the base name', () => {
    const out = expandFootprints([lid], () => 3)
    expect(out.map((p) => p.name)).toEqual(['lid#0', 'lid#1', 'lid#2'])
    expect(out.every((p) => p.baseName === 'lid')).toBe(true)
    expect(out.every((p) => p.w === 10 && p.h === 10 && p.z === 5)).toBe(true)
  })

  it('clamps quantity to [1,99] and treats garbage as 1', () => {
    expect(expandFootprints([lid], () => 0)).toHaveLength(1)
    expect(expandFootprints([lid], () => -5)).toHaveLength(1)
    expect(expandFootprints([lid], () => NaN)).toHaveLength(1)
    expect(expandFootprints([lid], () => 1000)).toHaveLength(99)
  })

  it('mixes per-part counts', () => {
    const out = expandFootprints([lid, base], (n) => (n === 'lid' ? 2 : 1))
    expect(out.map((p) => p.name)).toEqual(['lid#0', 'lid#1', 'base'])
  })
})

describe('packPlates + expandFootprints — N copies pack as N placements (byName→byKey regression)', () => {
  it('4× one piece yields 4 distinct placements, never collapsed to 1', () => {
    const expanded = expandFootprints([{ name: 'lid', w: 10, h: 10, z: 5 }], () => 4)
    const plan = packPlates(expanded, bigBed)
    const placed = plan.plates.flat()
    expect(placed).toHaveLength(4) // the bug collapsed duplicate names to a single placement
    expect(new Set(placed.map((p) => p.name)).size).toBe(4) // unique keys
    expect(placed.every((p) => baseName(p.name) === 'lid')).toBe(true) // all resolve to the base piece
  })

  it('oversize is reported per replica (caller dedupes by base name for display)', () => {
    const expanded = expandFootprints([{ name: 'huge', w: 999, h: 999, z: 5 }], () => 3)
    const plan = packPlates(expanded, bigBed)
    expect(plan.plates.flat()).toHaveLength(0)
    expect(plan.oversize).toHaveLength(3)
    expect([...new Set(plan.oversize.map((o) => baseName(o.name)))]).toEqual(['huge'])
  })
})

import { describe, it, expect } from 'vitest'
import { packPlates, expandFootprints, effectivePlacements, baseName, type PieceFootprint, type PieceOverride } from './packPlates'

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

describe('effectivePlacements — shared packer+override selector (Phase 4 Arrange)', () => {
  const pieces: PieceFootprint[] = [
    { name: 'lid', w: 30, h: 20, z: 5 },
    { name: 'base', w: 40, h: 25, z: 5 },
  ]
  const qty1 = () => 1

  it('with NO overrides returns exactly the pure packer plan (zero behavior change)', () => {
    const packer = packPlates(expandFootprints(pieces, qty1), bigBed)
    const eff = effectivePlacements(pieces, qty1, bigBed, {})
    expect(eff).toEqual(packer)
  })

  it('WYSIWYG: the preview plan deep-equals the export plan for identical (pieces, qty, bed, overrides)', () => {
    // both the Viewport memo and BOTH .3mf export paths call this same function with the same args —
    // this is the export-parity guard. Calling it twice with identical inputs must be byte-identical.
    const overrides: Record<string, PieceOverride> = {
      lid: { dx: 7, dy: -3, rot: 90 },
      base: { dx: 0, dy: 12, rot: 0 },
    }
    const preview = effectivePlacements(pieces, qty1, bigBed, overrides)
    const exported = effectivePlacements(pieces, qty1, bigBed, overrides)
    expect(preview).toEqual(exported)
  })

  it('applies dx/dy as a delta over the packer corner', () => {
    const base = effectivePlacements(pieces, qty1, bigBed, {})
    const lid0 = base.plates.flat().find((p) => p.name === 'lid')!
    const moved = effectivePlacements(pieces, qty1, bigBed, { lid: { dx: 5, dy: 9, rot: lid0.rot } })
    const lid1 = moved.plates.flat().find((p) => p.name === 'lid')!
    expect(lid1.x).toBeCloseTo(lid0.x + 5)
    expect(lid1.y).toBeCloseTo(lid0.y + 9)
  })

  it('rot REPLACES the packer rot (absolute) and re-swaps the placed footprint', () => {
    const base = effectivePlacements(pieces, qty1, bigBed, {})
    const lid0 = base.plates.flat().find((p) => p.name === 'lid')!
    // force the opposite rotation; w/h must swap to match (vs lid0's as-drawn 30×20)
    const target: 0 | 90 = lid0.rot === 90 ? 0 : 90
    const rotated = effectivePlacements(pieces, qty1, bigBed, { lid: { dx: 0, dy: 0, rot: target } })
    const lid1 = rotated.plates.flat().find((p) => p.name === 'lid')!
    expect(lid1.rot).toBe(target)
    expect(lid1.w).toBeCloseTo(lid0.h)
    expect(lid1.h).toBeCloseTo(lid0.w)
  })

  it('snaps an off-axis override rot to the nearest of {0,90}', () => {
    const a = effectivePlacements(pieces, qty1, bigBed, { lid: { dx: 0, dy: 0, rot: 80 as unknown as 0 | 90 } })
    const b = effectivePlacements(pieces, qty1, bigBed, { lid: { dx: 0, dy: 0, rot: 10 as unknown as 0 | 90 } })
    expect(a.plates.flat().find((p) => p.name === 'lid')!.rot).toBe(90)
    expect(b.plates.flat().find((p) => p.name === 'lid')!.rot).toBe(0)
  })

  it('ignores overrides for keys that no longer name a placement (stale-key tolerance)', () => {
    const eff = effectivePlacements(pieces, qty1, bigBed, { ghost: { dx: 99, dy: 99, rot: 90 } })
    const pure = effectivePlacements(pieces, qty1, bigBed, {})
    expect(eff).toEqual(pure)
  })
})

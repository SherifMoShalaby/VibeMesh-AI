import { describe, it, expect } from 'vitest'
import { dimDiscrepancies, clampStatedDimensions, geometryConverged } from './refineProxy'
import type { StlBBox } from './stl'

const bbox = (x: number, y: number, z: number): StlBBox => ({ x, y, z, minZ: 0, volume: 0, triangles: 0 })

describe('dimDiscrepancies', () => {
  it('returns [] with no dims or no stated dimensions', () => {
    expect(dimDiscrepancies(null, [{ value: 50, unit: 'mm', feature: 'height' }])).toEqual([])
    expect(dimDiscrepancies(bbox(10, 10, 10), [])).toEqual([])
    expect(dimDiscrepancies(bbox(10, 10, 10), undefined)).toEqual([])
  })

  it('flags a height (→Z) mismatch beyond tolerance', () => {
    const out = dimDiscrepancies(bbox(10, 10, 30), [{ value: 50, unit: 'mm', feature: 'height' }])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatch(/height/i)
    expect(out[0]).toMatch(/Z axis/)
    expect(out[0]).toMatch(/30\.0mm/)
    expect(out[0]).toMatch(/50mm/)
  })

  it('does NOT flag a within-tolerance render', () => {
    expect(dimDiscrepancies(bbox(10, 10, 50), [{ value: 50, unit: 'mm', feature: 'height' }])).toEqual([])
  })

  it('requires BOTH the absolute and fractional tolerance to be exceeded', () => {
    // off 3mm on a 100mm target: abs 3 > 2 but frac 0.03 < 0.1 → no flag
    expect(dimDiscrepancies(bbox(103, 10, 10), [{ value: 100, unit: 'mm', feature: 'width' }])).toEqual([])
    // off 1mm on a 5mm target: frac 0.2 > 0.1 but abs 1 < 2 → no flag (the abs guard)
    expect(dimDiscrepancies(bbox(6, 10, 10), [{ value: 5, unit: 'mm', feature: 'width' }])).toEqual([])
  })

  it('converts units before comparing (cm → mm)', () => {
    // 5cm = 50mm; render x=10 → off 40 → flag
    const out = dimDiscrepancies(bbox(10, 10, 10), [{ value: 5, unit: 'cm', feature: 'width' }])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatch(/50mm/)
  })

  it('maps diameter to BOTH planar axes', () => {
    const out = dimDiscrepancies(bbox(10, 10, 5), [{ value: 30, unit: 'mm', feature: 'diameter' }])
    expect(out).toHaveLength(2)
    expect(out.join(' ')).toMatch(/X axis/)
    expect(out.join(' ')).toMatch(/Y axis/)
  })

  it('maps an unknown feature to the longest axis', () => {
    const out = dimDiscrepancies(bbox(80, 10, 10), [{ value: 30, unit: 'mm', feature: 'overall length' }])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatch(/longest dimension/)
  })

  it('dedupes the same axis+target', () => {
    const out = dimDiscrepancies(bbox(10, 10, 30), [
      { value: 50, unit: 'mm', feature: 'height' },
      { value: 50, unit: 'mm', feature: 'tall' }, // also → Z, same target
    ])
    expect(out).toHaveLength(1)
  })

  it('skips non-finite / non-positive stated values', () => {
    expect(dimDiscrepancies(bbox(10, 10, 10), [{ value: NaN, unit: 'mm', feature: 'height' }])).toEqual([])
    expect(dimDiscrepancies(bbox(10, 10, 10), [{ value: -5, unit: 'mm', feature: 'height' }])).toEqual([])
  })
})

describe('clampStatedDimensions', () => {
  it('returns empty for undefined input', () => {
    expect(clampStatedDimensions(undefined)).toEqual({ dimensions: [], notes: [] })
  })

  it('passes an in-range dimension through unchanged', () => {
    const d = { value: 50, unit: 'mm', feature: 'height' }
    const out = clampStatedDimensions([d])
    expect(out.dimensions).toEqual([d])
    expect(out.notes).toEqual([])
  })

  it('drops a non-finite / non-positive value with a note', () => {
    const out = clampStatedDimensions([
      { value: NaN, unit: 'mm', feature: 'width' },
      { value: 0, unit: 'mm', feature: 'depth' },
    ])
    expect(out.dimensions).toEqual([])
    expect(out.notes).toHaveLength(2)
    expect(out.notes[0]).toMatch(/unreadable/i)
  })

  it('clamps an over-large dimension to the max envelope and normalizes to mm', () => {
    const out = clampStatedDimensions([{ value: 2000, unit: 'mm', feature: 'length' }])
    expect(out.dimensions).toHaveLength(1)
    expect(out.dimensions[0].value).toBe(1000)
    expect(out.dimensions[0].unit).toBe('mm')
    expect(out.notes[0]).toMatch(/Clamped/i)
  })

  it('clamps a sub-feature-size dimension up to the min envelope', () => {
    const out = clampStatedDimensions([{ value: 0.5, unit: 'mm', feature: 'wall' }])
    expect(out.dimensions[0].value).toBe(0.8)
    expect(out.notes[0]).toMatch(/Clamped/i)
  })

  it('converts units before clamping (2m → 2000mm → clamped to 1000mm)', () => {
    const out = clampStatedDimensions([{ value: 2, unit: 'm', feature: 'span' }])
    expect(out.dimensions[0].value).toBe(1000)
  })
})

describe('geometryConverged — self-relative refine convergence', () => {
  it('returns false when there is no previous baseline (first pass) — keep refining', () => {
    expect(geometryConverged(undefined, { volume: 100, triangles: 500 })).toBe(false)
    expect(geometryConverged(null, { volume: 100, triangles: 500 })).toBe(false)
    expect(geometryConverged({ volume: 100, triangles: 500 }, null)).toBe(false)
  })

  it('converged when volume AND tri-count are both within 3% (the model stopped reshaping → stop)', () => {
    expect(geometryConverged({ volume: 1000, triangles: 800 }, { volume: 1010, triangles: 805 })).toBe(true)
    expect(geometryConverged({ volume: 1000, triangles: 800 }, { volume: 1000, triangles: 800 })).toBe(true)
  })

  it('NOT converged when the model is still meaningfully reshaping (volume OR tris move >3%)', () => {
    expect(geometryConverged({ volume: 1000, triangles: 800 }, { volume: 1300, triangles: 805 })).toBe(false) // +30% volume
    expect(geometryConverged({ volume: 1000, triangles: 800 }, { volume: 1010, triangles: 1200 })).toBe(false) // +50% tris
  })

  it('is thin-part SAFE: a flat part that converges immediately stops (nothing punished for being thin)', () => {
    // a 1.6mm bracket: tiny volume, but pass 2 ≈ pass 1 → converged → stop, no thrash
    expect(geometryConverged({ volume: 24, triangles: 120 }, { volume: 24.3, triangles: 120 })).toBe(true)
  })

  it('guards divide-by-zero on a zero-volume baseline', () => {
    expect(geometryConverged({ volume: 0, triangles: 100 }, { volume: 0, triangles: 100 })).toBe(true)
    expect(geometryConverged({ volume: 0, triangles: 100 }, { volume: 5, triangles: 100 })).toBe(false)
  })
})

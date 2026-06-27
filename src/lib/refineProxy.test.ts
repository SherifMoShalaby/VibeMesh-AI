import { describe, it, expect } from 'vitest'
import { dimDiscrepancies, clampStatedDimensions, geometryConverged, fillRatioNote, iouRefineDecision, textRefineDecision, proxyRefineDecision } from './refineProxy'
import type { StlBBox } from './stl'

const bbox = (x: number, y: number, z: number): StlBBox => ({ x, y, z, minZ: 0, volume: 0, triangles: 0 })
const solid = (x: number, y: number, z: number, volume: number): StlBBox => ({ x, y, z, minZ: 0, volume, triangles: 0 })

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

describe('iouRefineDecision — reference-IoU refine gate (OC-2)', () => {
  it('refines on the first below-floor measurement (no baseline to beat)', () => {
    expect(iouRefineDecision(0.4, undefined)).toBe(true)
  })

  it('does NOT refine when already at/above the floor', () => {
    expect(iouRefineDecision(0.55, undefined)).toBe(false)
    expect(iouRefineDecision(0.7, 0.5)).toBe(false) // even though it improved, it cleared the floor
  })

  it('continues while a pass keeps raising IoU below the floor', () => {
    expect(iouRefineDecision(0.45, 0.4)).toBe(true) // rose >0.01, still below floor
  })

  it('STOPS the loop when a pass does not raise IoU (the key acceptance criterion)', () => {
    expect(iouRefineDecision(0.4, 0.4)).toBe(false) // no gain → stop
    expect(iouRefineDecision(0.35, 0.4)).toBe(false) // regressed → stop
    expect(iouRefineDecision(0.405, 0.4)).toBe(false) // gain below minGain → stop
  })

  it('respects custom floor / minGain', () => {
    expect(iouRefineDecision(0.6, undefined, 0.7)).toBe(true) // below the raised floor
    expect(iouRefineDecision(0.45, 0.4, 0.55, 0.1)).toBe(false) // 0.05 gain < 0.1 minGain → stop
  })
})

describe('textRefineDecision — defect-justified text refine gate (OC-4)', () => {
  it('fires ZERO passes with no measured defect (no island, no dim mismatch)', () => {
    // the key acceptance: a text turn with no stated dims and no defect never arms a blind pass
    expect(textRefineDecision(false, false)).toBe(false)
  })

  it('arms a pass on a measured island (connectivity) defect', () => {
    expect(textRefineDecision(true, false)).toBe(true)
  })

  it('arms a pass on a dimension-vs-stated mismatch', () => {
    expect(textRefineDecision(false, true)).toBe(true)
  })

  it('arms a pass when both defects are present', () => {
    expect(textRefineDecision(true, true)).toBe(true)
  })

  it('never depends on self-relative reshaping — only a measured defect can START it', () => {
    // there is no "still reshaping" parameter: the only inputs are MEASURED defects, so geometry
    // that is merely unsettled (but has no defect) cannot arm a pass.
    expect(textRefineDecision(false, false)).toBe(false)
  })
})

describe('fillRatioNote — advisory hollow-fill self-diagnosis', () => {
  it('returns "" for unusable input (null/undefined, zero bbox, non-positive/non-finite volume)', () => {
    expect(fillRatioNote(null)).toBe('')
    expect(fillRatioNote(undefined)).toBe('')
    expect(fillRatioNote(solid(0, 10, 10, 5))).toBe('') // zero bbox dimension → zero bbox volume
    expect(fillRatioNote(solid(10, 10, 10, 0))).toBe('') // zero volume
    expect(fillRatioNote(solid(10, 10, 10, NaN))).toBe('') // non-finite volume
  })

  it('stays silent when the part fills a plausible share of its bounding box', () => {
    // a solid-ish cylinder ~78% fill, well above the 10% default threshold
    expect(fillRatioNote(solid(10, 10, 10, 785))).toBe('')
    // exactly at the threshold is NOT flagged (>=)
    expect(fillRatioNote(solid(10, 10, 10, 100))).toBe('')
  })

  it('flags a suspiciously hollow result with the measured percentage, phrased as advisory', () => {
    const note = fillRatioNote(solid(10, 10, 10, 30)) // 3% fill
    expect(note).toMatch(/SOLIDITY CHECK/)
    expect(note).toMatch(/~3%/)
    expect(note).toMatch(/Ignore this if/) // hedged, never a hard directive
  })

  it('respects a custom threshold', () => {
    // 30% fill: silent at default 0.1, flagged when the caller demands 0.5
    expect(fillRatioNote(solid(10, 10, 10, 300))).toBe('')
    expect(fillRatioNote(solid(10, 10, 10, 300), 0.5)).toMatch(/~30%/)
  })

  it('never reports 0% (floors the displayed percentage at 1)', () => {
    expect(fillRatioNote(solid(100, 100, 100, 50))).toMatch(/~1%/) // 0.005% rounds up to a readable 1%
  })
})

describe('proxyRefineDecision — composed refine gate', () => {
  const base = {
    visionWantsRefine: false,
    kitWantsRefine: false,
    iouWantsRefine: undefined as boolean | undefined,
    dimMismatch: false,
    hasIslandDefect: false,
    converged: false,
  }

  // OC-12 acceptance #2 — the worst kit piece must DRIVE a targeted refine even when the whole-render
  // IoU is fine (the assembly averages a single featureless piece away → iouWantsRefine === false).
  it('a worst kit piece arms a refine even when whole-render IoU is at/above the floor', () => {
    expect(proxyRefineDecision({ ...base, kitWantsRefine: true, iouWantsRefine: false })).toBe(true)
  })

  it('without a worst piece a satisfied whole-render IoU does NOT refine (no false positive)', () => {
    expect(proxyRefineDecision({ ...base, kitWantsRefine: false, iouWantsRefine: false })).toBe(false)
  })

  // OC-6 — an absent named feature arms regardless of the IoU/convergence gate.
  it('an absent named feature (vision judge) arms even with a satisfied IoU', () => {
    expect(proxyRefineDecision({ ...base, visionWantsRefine: true, iouWantsRefine: false })).toBe(true)
  })

  it('image turn: a below-floor-and-improving IoU refines; a dimension mismatch refines too', () => {
    expect(proxyRefineDecision({ ...base, iouWantsRefine: true })).toBe(true)
    expect(proxyRefineDecision({ ...base, iouWantsRefine: false, dimMismatch: true })).toBe(true)
  })

  it('text turn (no IoU): a measured defect arms, and convergence stops it', () => {
    expect(proxyRefineDecision({ ...base, hasIslandDefect: true })).toBe(true)
    expect(proxyRefineDecision({ ...base, hasIslandDefect: true, converged: true })).toBe(false)
    expect(proxyRefineDecision({ ...base, dimMismatch: true })).toBe(true)
    // no defect at all → zero passes (OC-4: never burn a blind self-grading pass)
    expect(proxyRefineDecision({ ...base })).toBe(false)
  })
})

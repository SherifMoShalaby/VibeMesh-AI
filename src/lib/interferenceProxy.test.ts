import { describe, it, expect } from 'vitest'
import {
  voxelOverlapMm3,
  interferenceScore,
  hasDebugContract,
  setDebugVariant,
  INTERFERENCE_OK_MM3,
} from './interferenceProxy'

/** 12 triangles (flat [x,y,z]×3 per tri) of an axis-aligned box — the side faces are vertical and
 *  harmlessly skipped by the voxelizer; the top/bottom caps drive the z-parity fill. */
function boxTris(min: [number, number, number], max: [number, number, number]): Float32Array {
  const [x0, y0, z0] = min
  const [x1, y1, z1] = max
  const a = [x0, y0, z0], b = [x1, y0, z0], c = [x1, y1, z0], d = [x0, y1, z0]
  const e = [x0, y0, z1], f = [x1, y0, z1], g = [x1, y1, z1], h = [x0, y1, z1]
  const faces = [
    [a, b, c], [a, c, d], // bottom
    [e, f, g], [e, g, h], // top
    [a, b, f], [a, f, e], // sides (vertical → skipped, included for realism)
    [d, c, g], [d, g, h],
    [a, d, h], [a, h, e],
    [b, c, g], [b, g, f],
  ]
  const out = new Float32Array(faces.length * 9)
  faces.forEach((tri, i) => tri.forEach((v, j) => { out[i * 9 + j * 3] = v[0]; out[i * 9 + j * 3 + 1] = v[1]; out[i * 9 + j * 3 + 2] = v[2] }))
  return out
}

describe('voxelOverlapMm3', () => {
  it('measures the overlap volume of two intersecting boxes (~125 mm³)', () => {
    const a = boxTris([0, 0, 0], [10, 10, 10])
    const b = boxTris([5, 5, 5], [15, 15, 15]) // overlap = 5×5×5 = 125 mm³
    const vol = voxelOverlapMm3(a, b)
    expect(vol).toBeGreaterThan(90)
    expect(vol).toBeLessThan(160)
  })

  it('reports ~0 for disjoint solids (a deconflicted part)', () => {
    const a = boxTris([0, 0, 0], [4, 4, 4])
    const b = boxTris([8, 8, 8], [12, 12, 12])
    expect(voxelOverlapMm3(a, b)).toBeLessThan(INTERFERENCE_OK_MM3)
  })

  it('returns 0 when either side is empty', () => {
    expect(voxelOverlapMm3(new Float32Array(0), boxTris([0, 0, 0], [4, 4, 4]))).toBe(0)
  })
})

describe('interferenceScore', () => {
  it('1.0 when clean (≤ OK threshold), null when N/A', () => {
    expect(interferenceScore(0)).toBe(1)
    expect(interferenceScore(INTERFERENCE_OK_MM3)).toBe(1)
    expect(interferenceScore(null)).toBeNull()
  })
  it('decays to 0 as overlap grows', () => {
    expect(interferenceScore(14.5)).toBeCloseTo(0.5, 2) // OK(2) + half of the 25mm³ span
    expect(interferenceScore(27)).toBe(0) // OK(2) + full span → 0
    expect(interferenceScore(100)).toBe(0)
  })
})

describe('hasDebugContract', () => {
  const probe = '_debug = "off"; // [off, positives, negatives]\nif (_debug == "positives") a();\nelse if (_debug == "negatives") b();'
  it('detects the probe contract', () => {
    expect(hasDebugContract(probe)).toBe(true)
  })
  it('is false for a plain solid', () => {
    expect(hasDebugContract('cube(10);')).toBe(false)
  })
})

describe('setDebugVariant', () => {
  it('patches the _debug default to a variant', () => {
    expect(setDebugVariant('part = "all";\n_debug = "off"; // [off, positives, negatives]', 'positives'))
      .toContain('_debug = "positives"')
    expect(setDebugVariant('  _debug = "off";', 'negatives')).toContain('_debug = "negatives"')
  })
  it('returns null when there is no _debug assignment', () => {
    expect(setDebugVariant('cube(10);', 'positives')).toBeNull()
  })
  it('does not patch a commented-out _debug line', () => {
    expect(setDebugVariant('// _debug = "off" is a probe knob', 'positives')).toBeNull()
  })
})

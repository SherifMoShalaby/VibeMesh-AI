import { describe, it, expect } from 'vitest'
import { notFlatOnBedReason } from './storeDecisions'
import type { StlBBox } from './stl'

const bbox = (minZ: number): StlBBox => ({ x: 50, y: 50, z: 20, minZ, volume: 1000, triangles: 200 })

describe('notFlatOnBedReason — flat-on-bed design flag (OC-13)', () => {
  it('does NOT flag a part authored flat on the bed (minZ ≈ 0)', () => {
    expect(notFlatOnBedReason(bbox(0))).toBeNull()
    expect(notFlatOnBedReason(bbox(0.3))).toBeNull() // within rounding tolerance
    expect(notFlatOnBedReason(bbox(-0.4))).toBeNull()
  })

  it('flags a part sunk below the bed (t2-soapdish minZ=-3)', () => {
    const r = notFlatOnBedReason(bbox(-3))
    expect(r).toMatch(/below the bed/)
    expect(r).toMatch(/3\.0mm/)
  })

  it('flags a part floating above the bed', () => {
    const r = notFlatOnBedReason(bbox(5))
    expect(r).toMatch(/floats/)
    expect(r).toMatch(/5\.0mm/)
  })

  it('returns null for missing / non-finite geometry', () => {
    expect(notFlatOnBedReason(null)).toBeNull()
    expect(notFlatOnBedReason({ x: 10, y: 10, z: 10, minZ: NaN, volume: 1, triangles: 1 })).toBeNull()
  })

  it('respects a custom tolerance', () => {
    expect(notFlatOnBedReason(bbox(-1), 2)).toBeNull() // 1mm under a 2mm tol → not flagged
    expect(notFlatOnBedReason(bbox(-3), 2)).toMatch(/below the bed/)
  })
})

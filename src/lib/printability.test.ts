import { describe, it, expect } from 'vitest'
import { analyzePrintability, overhangFraction, DEFAULT_NOZZLE } from './printability'

type Tri = [[number, number, number], [number, number, number], [number, number, number]]
function makeStl(tris: Tri[]): ArrayBuffer {
  const buf = new ArrayBuffer(84 + tris.length * 50)
  const dv = new DataView(buf)
  dv.setUint32(80, tris.length, true)
  tris.forEach((t, i) => {
    const base = 84 + i * 50
    t.forEach((v, k) => {
      const off = base + 12 + k * 12
      dv.setFloat32(off, v[0], true)
      dv.setFloat32(off + 4, v[1], true)
      dv.setFloat32(off + 8, v[2], true)
    })
  })
  return buf
}

const bed = { x: 220, y: 220, z: 250 }

describe('analyzePrintability', () => {
  it('passes a sane part flat on the bed', () => {
    const r = analyzePrintability({ size: { x: 40, y: 30, z: 20 }, minZ: 0, bed })
    expect(r.level).toBe('ok')
  })

  it('fails a part that exceeds the bed', () => {
    const r = analyzePrintability({ size: { x: 300, y: 30, z: 20 }, minZ: 0, bed })
    expect(r.level).toBe('fail')
    expect(r.checks.find((c) => c.id === 'bed')?.level).toBe('fail')
  })

  it('skips the bed check for an assembly preview', () => {
    const r = analyzePrintability({ size: { x: 300, y: 30, z: 20 }, minZ: 0, bed, isAssembly: true })
    expect(r.checks.find((c) => c.id === 'bed')).toBeUndefined()
  })

  it('warns when the part is not flat on the bed', () => {
    const below = analyzePrintability({ size: { x: 40, y: 30, z: 20 }, minZ: -3, bed })
    expect(below.checks.find((c) => c.id === 'flat')?.level).toBe('warn')
    const above = analyzePrintability({ size: { x: 40, y: 30, z: 20 }, minZ: 4, bed })
    expect(above.checks.find((c) => c.id === 'flat')?.label).toMatch(/Floats/)
  })

  it('fails a feature thinner than two nozzle lines', () => {
    const r = analyzePrintability({ size: { x: 40, y: 30, z: 0.5 }, minZ: 0, bed })
    expect(r.level).toBe('fail')
    const f = r.checks.find((c) => c.id === 'feature')
    expect(f?.level).toBe('fail')
    expect(f?.detail).toContain(`${DEFAULT_NOZZLE}`)
  })

  it('warns on a tall, narrow part (tip-over risk)', () => {
    const r = analyzePrintability({ size: { x: 8, y: 8, z: 120 }, minZ: 0, bed })
    expect(r.checks.find((c) => c.id === 'aspect')?.level).toBe('warn')
  })

  it('worst-of: a fit part with a thin feature still fails overall', () => {
    const r = analyzePrintability({ size: { x: 0.6, y: 50, z: 50 }, minZ: 0, bed })
    expect(r.level).toBe('fail')
  })
})

describe('overhangFraction', () => {
  it('counts a steep down-facing elevated face but not a vertical wall', () => {
    // tri1: horizontal face at z=10 wound to face DOWN (overhang); tri2: vertical wall (nz≈0)
    const overhangTri: Tri = [[0, 0, 10], [0, 10, 10], [10, 0, 10]]
    const wallTri: Tri = [[0, 0, 0], [10, 0, 0], [0, 0, 10]]
    const frac = overhangFraction(makeStl([overhangTri, wallTri]))
    expect(frac).toBeGreaterThan(0.4)
    expect(frac).toBeLessThan(0.6)
  })

  it('excludes the bed-contact bottom (a down-face at z≈minZ is supported)', () => {
    const bedFace: Tri = [[0, 0, 0], [0, 10, 0], [10, 0, 0]] // down-facing at the bed
    const wallTri: Tri = [[0, 0, 0], [10, 0, 0], [0, 0, 10]]
    const frac = overhangFraction(makeStl([bedFace, wallTri]))
    expect(frac).toBe(0)
  })

  it('returns 0 for a malformed buffer', () => {
    expect(overhangFraction(new ArrayBuffer(40))).toBe(0)
  })
})

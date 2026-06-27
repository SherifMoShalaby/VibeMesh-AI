import { describe, it, expect } from 'vitest'
import { stlBBox, transformStl, islandCount } from './stl'

type Tri = [[number, number, number], [number, number, number], [number, number, number]]

/** Build a minimal valid binary STL (80-byte header + uint32 count + 50 bytes/triangle). */
function makeStl(tris: Tri[]): ArrayBuffer {
  const buf = new ArrayBuffer(84 + tris.length * 50)
  const dv = new DataView(buf)
  dv.setUint32(80, tris.length, true)
  tris.forEach((t, i) => {
    const base = 84 + i * 50
    // leave the normal (12 bytes) zeroed; write the 3 vertices
    t.forEach((v, k) => {
      const off = base + 12 + k * 12
      dv.setFloat32(off, v[0], true)
      dv.setFloat32(off + 4, v[1], true)
      dv.setFloat32(off + 8, v[2], true)
    })
  })
  return buf
}

/** Header claims `count` triangles but the payload only carries `tris`. */
function makeUndersizedStl(count: number, tris: Tri[]): ArrayBuffer {
  const buf = makeStl(tris)
  new DataView(buf).setUint32(80, count, true)
  return buf
}

/** A closed axis-aligned box (12 triangles) at origin+offset, side `s`. All 8 corners are shared
 *  across its faces, so it welds into ONE island. Volume = s³. */
function makeBox(ox: number, oy: number, oz: number, s = 10): Tri[] {
  const p = (x: number, y: number, z: number): [number, number, number] => [ox + x * s, oy + y * s, oz + z * s]
  const v = [p(0, 0, 0), p(1, 0, 0), p(1, 1, 0), p(0, 1, 0), p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1)]
  const q = (a: number, b: number, c: number, d: number): Tri[] => [
    [v[a], v[b], v[c]],
    [v[a], v[c], v[d]],
  ]
  return [
    ...q(0, 3, 2, 1), // bottom
    ...q(4, 5, 6, 7), // top
    ...q(0, 1, 5, 4), // front
    ...q(2, 3, 7, 6), // back
    ...q(1, 2, 6, 5), // right
    ...q(0, 4, 7, 3), // left
  ]
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

describe('stlBBox', () => {
  it('computes the bounding box of a known triangle', () => {
    const bb = stlBBox(makeStl([[[0, 0, 0], [10, 0, 0], [0, 20, 5]]]))
    // a single triangle with a vertex at the origin encloses zero volume (a·(b×c)=0 when a=0)
    expect(bb).toEqual({ x: 10, y: 20, z: 5, minZ: 0, volume: 0, triangles: 1 })
  })

  it('returns null for a too-short buffer', () => {
    expect(stlBBox(new ArrayBuffer(40))).toBeNull()
  })

  it('returns null when the header count exceeds the payload', () => {
    expect(stlBBox(makeUndersizedStl(5, [[[0, 0, 0], [1, 0, 0], [0, 1, 0]]]))).toBeNull()
  })
})

describe('islandCount', () => {
  it('reports 1 for a single fused solid (a closed box)', () => {
    const r = islandCount(makeStl(makeBox(0, 0, 0)))
    expect(r?.count).toBe(1)
    expect(r?.largestVolumeFraction).toBeCloseTo(1, 5)
  })

  it('reports >=2 for two disjoint solids (a detached-handle fixture)', () => {
    // two equal boxes far apart → 2 islands, each holding ~half the volume
    const r = islandCount(makeStl([...makeBox(0, 0, 0, 10), ...makeBox(100, 0, 0, 10)]))
    expect(r?.count).toBe(2)
    expect(r?.largestVolumeFraction).toBeCloseTo(0.5, 5)
  })

  it('reports 1 for a hollow ring/tube (a connected shell stays one island)', () => {
    // a square annulus prism: 4 outer walls + 4 inner walls + a top & bottom rim band, all welded
    // along shared rim edges → topologically ONE connected surface, so count must be 1, not 2.
    const outer = makeBox(0, 0, 0, 30)
    const inner = makeBox(10, 10, 0, 10) // an inner block; its faces share no vertices with outer…
    // …so to make a TRUE single-shell ring we connect them at the top rim by reusing a shared vertex.
    // Simpler faithful check: an open square tube whose 4 walls share their vertical edges = 1 island.
    void outer; void inner
    const s = 10
    const o = 0
    const t = 30 // tube outer span
    const p = (x: number, y: number, z: number): [number, number, number] => [o + x, o + y, o + z]
    // 4 vertical walls of a hollow square tube (no top/bottom) — adjacent walls share an edge.
    const c0 = p(0, 0, 0), c1 = p(t, 0, 0), c2 = p(t, t, 0), c3 = p(0, t, 0)
    const c0h = p(0, 0, s), c1h = p(t, 0, s), c2h = p(t, t, s), c3h = p(0, t, s)
    const wall = (a: [number, number, number], b: [number, number, number], ah: [number, number, number], bh: [number, number, number]): Tri[] => [
      [a, b, bh],
      [a, bh, ah],
    ]
    const tube = [
      ...wall(c0, c1, c0h, c1h),
      ...wall(c1, c2, c1h, c2h),
      ...wall(c2, c3, c2h, c3h),
      ...wall(c3, c0, c3h, c0h),
    ]
    const r = islandCount(makeStl(tube))
    expect(r?.count).toBe(1)
  })

  it('returns null for a too-short buffer and {count:0} for zero triangles', () => {
    expect(islandCount(new ArrayBuffer(40))).toBeNull()
    expect(islandCount(makeStl([]))).toEqual({ count: 0, largestVolumeFraction: 0 })
  })
})

describe('transformStl', () => {
  it('is a no-op under the identity matrix', () => {
    const src = makeStl([[[0, 0, 0], [10, 0, 0], [0, 20, 5]]])
    const out = transformStl(src, IDENTITY)
    expect(stlBBox(out)).toMatchObject({ x: 10, y: 20, z: 5, minZ: 0 })
  })

  it('applies a scale (column-major m[0]=2 doubles the X span)', () => {
    const m = [...IDENTITY]
    m[0] = 2
    const out = transformStl(makeStl([[[0, 0, 0], [10, 0, 0], [0, 20, 5]]]), m)
    expect(stlBBox(out)).toMatchObject({ x: 20, y: 20, z: 5, minZ: 0 })
  })

  it('applies a translation (m[14]=3 lifts every vertex in Z)', () => {
    const m = [...IDENTITY]
    m[14] = 3
    const out = transformStl(makeStl([[[0, 0, 0], [10, 0, 0], [0, 20, 5]]]), m)
    expect(stlBBox(out)).toMatchObject({ minZ: 3, z: 5 })
  })

  it('throws LOUDLY on a malformed STL whose count exceeds the buffer (no silent skip)', () => {
    const bad = makeUndersizedStl(99, [[[0, 0, 0], [1, 0, 0], [0, 1, 0]]])
    expect(() => transformStl(bad, IDENTITY)).toThrow(/Malformed STL/)
  })
})

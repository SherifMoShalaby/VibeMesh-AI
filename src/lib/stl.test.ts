import { describe, it, expect } from 'vitest'
import { stlBBox, transformStl } from './stl'

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

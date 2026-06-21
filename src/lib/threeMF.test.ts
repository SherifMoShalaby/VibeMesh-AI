import { describe, it, expect } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { buildThreeMF } from './threeMF'

/** Minimal valid binary STL from flat triangles ([x0,y0,z0, x1,y1,z1, x2,y2,z2] each). */
function makeStl(tris: number[][]): ArrayBuffer {
  const buf = new ArrayBuffer(84 + tris.length * 50)
  const v = new DataView(buf)
  v.setUint32(80, tris.length, true)
  tris.forEach((t, i) => {
    const base = 84 + i * 50 + 12 // skip the 12-byte normal
    for (let k = 0; k < 9; k++) v.setFloat32(base + k * 4, t[k], true)
  })
  return buf
}

const tri = [0, 0, 0, 10, 0, 0, 0, 10, 0]
const modelXml = (out: Uint8Array): string => strFromU8(unzipSync(out)['3D/3dmodel.model'])

describe('buildThreeMF — per-part color (R3)', () => {
  it('embeds a basematerials group with a distinct display color per part', () => {
    const xml = modelXml(buildThreeMF([
      { name: 'base', stl: makeStl([tri]) },
      { name: 'lid', stl: makeStl([tri]) },
    ]))
    expect(xml).toContain('<basematerials id="3">')
    expect(xml).toContain('displaycolor="#4F8FBAFF"') // part 0
    expect(xml).toContain('displaycolor="#E8A33DFF"') // part 1
  })

  it('points each object at its material via pid/pindex in enum order', () => {
    const xml = modelXml(buildThreeMF([
      { name: 'base', stl: makeStl([tri]) },
      { name: 'lid', stl: makeStl([tri]) },
    ]))
    expect(xml).toMatch(/<object id="1"[^>]*pid="3" pindex="0"/)
    expect(xml).toMatch(/<object id="2"[^>]*pid="3" pindex="1"/)
  })

  it('is deterministic — same parts produce the same colors on re-export (remix-safe)', () => {
    const a = modelXml(buildThreeMF([{ name: 'p', stl: makeStl([tri]) }]))
    const b = modelXml(buildThreeMF([{ name: 'p', stl: makeStl([tri]) }]))
    expect(a).toBe(b)
    expect(a).toContain('displaycolor="#4F8FBAFF"')
  })

  it('cycles the palette for a kit larger than 8 pieces (color reused, still one base per part)', () => {
    const parts = Array.from({ length: 9 }, (_, i) => ({ name: `p${i}`, stl: makeStl([tri]) }))
    const colors = [...modelXml(buildThreeMF(parts)).matchAll(/displaycolor="(#[0-9A-F]{8})"/g)].map((m) => m[1])
    expect(colors).toHaveLength(9)
    expect(colors[8]).toBe(colors[0]) // 9th part wraps to palette[0]
  })

  it('replicas sharing a colorKey read as ONE color, N instances (per-part quantities)', () => {
    // 2 lids + 1 base — lids share a colorKey so they get one swatch, base gets its own
    const xml = modelXml(buildThreeMF([
      { name: 'lid 1 of 2', colorKey: 'lid', stl: makeStl([tri]) },
      { name: 'lid 2 of 2', colorKey: 'lid', stl: makeStl([tri]) },
      { name: 'base', colorKey: 'base', stl: makeStl([tri]) },
    ]))
    const colors = [...xml.matchAll(/displaycolor="(#[0-9A-F]{8})"/g)].map((m) => m[1])
    expect(colors).toHaveLength(3)
    expect(colors[0]).toBe(colors[1]) // the two lid replicas share a color
    expect(colors[2]).not.toBe(colors[0]) // base is distinct
  })
})

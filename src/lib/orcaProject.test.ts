import { describe, it, expect } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { buildOrcaProject } from './orcaProject'
import { resolveBed } from '../types'

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

function unzipProject(out: Uint8Array) {
  return unzipSync(out)
}

function getText(files: ReturnType<typeof unzipSync>, path: string): string {
  const entry = files[path]
  if (!entry) throw new Error(`File not found in zip: ${path}`)
  return strFromU8(entry)
}

describe('buildOrcaProject', () => {
  const stl = makeStl([tri])
  const bed = resolveBed('ender3', null)
  const out = buildOrcaProject([{ name: 'part', stl }], { bed })
  const files = unzipProject(out)

  it('zip contains exactly 5 files', () => {
    const keys = Object.keys(files)
    expect(keys).toHaveLength(5)
    expect(keys).toContain('[Content_Types].xml')
    expect(keys).toContain('_rels/.rels')
    expect(keys).toContain('3D/3dmodel.model')
    expect(keys).toContain('Metadata/project_settings.config')
    expect(keys).toContain('Metadata/model_settings.config')
  })

  it('3D/3dmodel.model contains Application recognition tag', () => {
    const xml = getText(files, '3D/3dmodel.model')
    // metadata tag: <metadata name="Application">BambuStudio-01.09.05.51</metadata>
    expect(xml).toContain('"Application">BambuStudio-01.09.05.51<')
  })

  it('Metadata/project_settings.config is valid JSON with required header fields', () => {
    const raw = getText(files, 'Metadata/project_settings.config')
    const parsed = JSON.parse(raw)
    expect(parsed.version).toBeDefined()
    expect(parsed.name).toBe('project_settings')
    expect(parsed.from).toBe('project')
    // at least 5 additional keys beyond the 3-field header
    const extra = Object.keys(parsed).filter((k) => !['version', 'name', 'from'].includes(k))
    expect(extra.length).toBeGreaterThanOrEqual(5)
  })

  it('filament_colour is present in project_settings.config', () => {
    const parsed = JSON.parse(getText(files, 'Metadata/project_settings.config'))
    expect(parsed.filament_colour).toBeDefined()
    expect(Array.isArray(parsed.filament_colour)).toBe(true)
  })

  it('printable_area matches bed dims for ender3', () => {
    const b = resolveBed('ender3', null)
    const parsed = JSON.parse(getText(files, 'Metadata/project_settings.config'))
    expect(parsed.printable_area).toEqual([
      '0x0',
      `${b.x}x0`,
      `${b.x}x${b.y}`,
      `0x${b.y}`,
    ])
  })

  it('printable_area matches bed dims for bambu-a1', () => {
    const b = resolveBed('bambu-a1', null)
    const out2 = buildOrcaProject([{ name: 'part', stl }], { bed: b })
    const parsed = JSON.parse(getText(unzipProject(out2), 'Metadata/project_settings.config'))
    expect(parsed.printable_area).toEqual([
      '0x0',
      `${b.x}x0`,
      `${b.x}x${b.y}`,
      `0x${b.y}`,
    ])
  })

  it('printable_height matches bed.z as string', () => {
    const parsed = JSON.parse(getText(files, 'Metadata/project_settings.config'))
    expect(parsed.printable_height).toBe(String(bed.z))
  })

  it('gcode_flavor is present in project_settings.config', () => {
    const parsed = JSON.parse(getText(files, 'Metadata/project_settings.config'))
    expect(typeof parsed.gcode_flavor).toBe('string')
    expect(parsed.gcode_flavor.length).toBeGreaterThan(0)
  })

  it('no Production Extension namespace in 3D/3dmodel.model', () => {
    const xml = getText(files, '3D/3dmodel.model')
    expect(xml).not.toContain('xmlns:p=')
  })

  it('no slice_info.config in the zip', () => {
    expect(Object.keys(files)).not.toContain('Metadata/slice_info.config')
  })

  it('no compatible_printers key in project_settings.config', () => {
    const parsed = JSON.parse(getText(files, 'Metadata/project_settings.config'))
    expect(parsed.compatible_printers).toBeUndefined()
  })

  it('printer_settings_id matches known bed preset for ender3', () => {
    const parsed = JSON.parse(getText(files, 'Metadata/project_settings.config'))
    expect(parsed.printer_settings_id).toBe('Creality Ender-3 0.4 nozzle')
  })

  it('gcode_flavor is bambu for bambu-a1 bed', () => {
    const b = resolveBed('bambu-a1', null)
    const out2 = buildOrcaProject([{ name: 'part', stl }], { bed: b })
    const parsed = JSON.parse(getText(unzipProject(out2), 'Metadata/project_settings.config'))
    expect(parsed.gcode_flavor).toBe('bambu')
  })
})

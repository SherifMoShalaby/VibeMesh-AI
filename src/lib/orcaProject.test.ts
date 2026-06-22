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

describe('buildOrcaProject — P3 multi-object + thumbnails', () => {
  const stl = makeStl([tri])
  const bed = resolveBed('ender3', null)

  it('multi-object zip has 5 files when no thumbnail provided', () => {
    const out = buildOrcaProject([{ name: 'body', stl }, { name: 'cap', stl }], { bed })
    const files = unzipProject(out)
    expect(Object.keys(files)).toHaveLength(5)
    expect(Object.keys(files)).not.toContain('Metadata/plate_1.png')
  })

  it('3D/3dmodel.model contains one <object> per part with correct ids', () => {
    const out = buildOrcaProject([{ name: 'body', stl }, { name: 'cap', stl }], { bed })
    const xml = getText(unzipProject(out), '3D/3dmodel.model')
    expect(xml).toContain('<object id="1"')
    expect(xml).toContain('<object id="2"')
  })

  it('model_settings.config has one <model_instance> per part', () => {
    const out = buildOrcaProject([{ name: 'body', stl }, { name: 'cap', stl }], { bed })
    const xml = getText(unzipProject(out), 'Metadata/model_settings.config')
    // count occurrences of <model_instance>
    const matches = xml.match(/<model_instance>/g) ?? []
    expect(matches).toHaveLength(2)
  })

  it('object_id in model_settings matches object ids in 3dmodel.model and build items', () => {
    const out = buildOrcaProject([{ name: 'body', stl }, { name: 'cap', stl }], { bed })
    const files = unzipProject(out)
    const modelXml = getText(files, '3D/3dmodel.model')
    const settingsXml = getText(files, 'Metadata/model_settings.config')
    // both <item objectid="1"> and <item objectid="2"> in build section
    expect(modelXml).toContain('objectid="1"')
    expect(modelXml).toContain('objectid="2"')
    // model_settings references the same ids
    expect(settingsXml).toContain('"object_id" value="1"')
    expect(settingsXml).toContain('"object_id" value="2"')
  })

  it('thumbnail: zip has 6 files, Metadata/plate_1.png present, Content_Types has png, _rels/.rels has plate_1.png', () => {
    const thumbnailPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]) // 5 fake bytes
    const out = buildOrcaProject([{ name: 'body', stl }], { bed, thumbnailPng })
    const files = unzipProject(out)
    expect(Object.keys(files)).toHaveLength(6)
    expect(Object.keys(files)).toContain('Metadata/plate_1.png')
    const ct = getText(files, '[Content_Types].xml')
    expect(ct).toContain('png')
    const rels = getText(files, '_rels/.rels')
    expect(rels).toContain('plate_1.png')
  })

  it('no thumbnail: zip does NOT contain Metadata/plate_1.png', () => {
    const out = buildOrcaProject([{ name: 'body', stl }], { bed })
    const files = unzipProject(out)
    expect(Object.keys(files)).not.toContain('Metadata/plate_1.png')
  })
})

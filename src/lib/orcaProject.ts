import { zipSync, strToU8 } from 'fflate'
import { indexMesh, fmt, escapeXml } from './threeMFCore'
import type { OrcaMaterial, PrinterBed } from '../types'

export const ORCA_BAMBU_VERSION = '01.09.05.51' // pinned low-major; confirmed safe in Bambu 02.07 + Orca 2.4

// Per-bed config table — confirmed from OrcaSlicer 2.4 profile directory
// preset: exact filename stem for the 0.4-nozzle profile (OrcaSlicer resolves this from its local DB)
// flavor: gcode_flavor value for the project_settings.config
interface BedEntry {
  preset: string
  flavor: string
}
const BED_CONFIG: Record<string, BedEntry> = {
  'ender3':          { preset: 'Creality Ender-3 0.4 nozzle',         flavor: 'marlin'   },
  'k1':              { preset: 'Creality K1 (0.4 nozzle)',             flavor: 'klipper'  },
  'k1-max':          { preset: 'Creality K1 Max (0.4 nozzle)',         flavor: 'klipper'  },
  'a1-mini':         { preset: 'Bambu Lab A1 mini 0.4 nozzle',         flavor: 'bambu'    },
  'bambu-a1':        { preset: 'Bambu Lab A1 0.4 nozzle',              flavor: 'bambu'    },
  'bambu-p1':        { preset: 'Bambu Lab P1S 0.4 nozzle',             flavor: 'bambu'    },
  'prusa-mini':      { preset: 'Prusa MINI 0.4 nozzle',                flavor: 'marlin2'  },
  'prusa-mk4':       { preset: 'Prusa MK4 0.4 nozzle',                 flavor: 'marlin2'  },
  'prusa-core-one':  { preset: 'Prusa CORE One 0.4 nozzle',            flavor: 'marlin2'  },
  'prusa-xl':        { preset: 'Prusa XL 0.4 nozzle',                  flavor: 'marlin2'  },
  'neptune4-pro':    { preset: 'Elegoo Neptune 4 Pro 0.4 nozzle',      flavor: 'klipper'  },
  'centauri-carbon': { preset: 'Elegoo Centauri Carbon 0.4 nozzle',    flavor: 'klipper'  },
  'adventurer-5m':   { preset: 'Flashforge Adventurer 5M 0.4 Nozzle',  flavor: 'klipper'  },
  'qidi-q1-pro':     { preset: 'Qidi Q1 Pro 0.4 nozzle',               flavor: 'klipper'  },
}

interface MaterialEntry {
  nozzle: number
  bed: number
  colour: string
  filamentSettingsId: string
}
const MATERIAL_CONFIG: Record<OrcaMaterial, MaterialEntry> = {
  PLA:  { nozzle: 220, bed: 65,  colour: '#4CAF50FF', filamentSettingsId: 'Bambu PLA Basic @BBL A1M'       },
  PETG: { nozzle: 240, bed: 80,  colour: '#2196F3FF', filamentSettingsId: 'Bambu PETG Basic @BBL A1M'      },
  ABS:  { nozzle: 250, bed: 105, colour: '#FF5722FF', filamentSettingsId: 'Bambu ABS Basic @BBL A1M'       },
  TPU:  { nozzle: 220, bed: 40,  colour: '#9C27B0FF', filamentSettingsId: 'Bambu TPU for AMS @BBL A1M'     },
}

// Minimal authored Marlin/Marlin2 start+end G-code.
// Uses OrcaSlicer placeholder syntax: [variable].
// Klipper and Bambu flavors are left absent (their presets provide macros; wrong G-code is
// worse than absent, especially Klipper PRINT_START/END which varies per machine config).
const MARLIN_START_GCODE = 'G28\nM190 S[bed_temperature_initial_layer_single]\nM109 S[nozzle_temperature_initial_layer]\nG92 E0'
const MARLIN_END_GCODE = 'M104 S0\nM140 S0\nG91\nG1 E-2 F1800\nG28 X Y\nM84'

/** Per-part display palette — duplicated from threeMF.ts PART_PALETTE so orcaProject.ts
 *  has no runtime import from threeMF (different bundle path). Must stay in sync. */
export const ORCA_PART_PALETTE = [
  '#4F8FBAFF', // blue
  '#E8A33DFF', // amber
  '#3DAE8BFF', // teal
  '#D45D5DFF', // red
  '#7E6BC4FF', // purple
  '#9CB04AFF', // olive
  '#D98AB5FF', // pink
  '#6B7280FF', // slate
]

export interface OrcaProjectOptions {
  bed: PrinterBed
  thumbnailPng?: Uint8Array // best-effort canvas PNG; omit to skip thumbnail
  material?: OrcaMaterial
}

/**
 * Build a slice-ready OrcaSlicer/BambuStudio .3mf from one or more STL parts.
 * The zip opens with printer, filament, and process pre-selected — the Slice
 * button is live immediately. Recognition gate: Application=BambuStudio-<version>.
 *
 * Each part becomes a named <object> in the 3D model. When `part.place` is
 * provided the packer's bed-local placement (including rot=90 CCW bake) is
 * applied; otherwise the mesh's own coordinates are preserved (single-piece
 * export path where placement is already baked into the STL by exportActions).
 *
 * When `thumbnailPng` is provided it is stored as `Metadata/plate_1.png` and
 * wired into Content_Types + _rels. When absent the zip stays at 5 files.
 */
export function buildOrcaProject(
  parts: Array<{ name: string; stl: ArrayBuffer; place?: { x: number; y: number; rot?: 0 | 90 } }>,
  { bed, thumbnailPng, material = 'PLA' }: OrcaProjectOptions,
): Uint8Array<ArrayBuffer> {
  const materialId = parts.length + 1 // basematerials group id — sits after every object id (1..N)
  const objects: string[] = []
  const items: string[] = []
  const bases: string[] = []
  const modelInstances: string[] = []

  parts.forEach((part, index) => {
    const { vertices, triangles, bbox } = indexMesh(part.stl)
    const id = index + 1
    const color = ORCA_PART_PALETTE[index % ORCA_PART_PALETTE.length]
    bases.push(`<base name="${escapeXml(part.name)}" displaycolor="${color}"/>`)
    objects.push(
      `<object id="${id}" name="${escapeXml(part.name)}" type="model" pid="${materialId}" pindex="${index}">` +
      `<mesh><vertices>${vertices}</vertices><triangles>${triangles}</triangles></mesh>` +
      `</object>`,
    )
    const tz = -bbox.minZ
    if (part.place) {
      // explicit packed placement: drop the piece's min corner onto the packer's bed-local (x,y)
      // and seat it on z=0, matching the on-screen slicer pack.
      if (part.place.rot === 90) {
        // 90° CCW about Z (p → (−y, x)); seat the ROTATED bbox min (−maxY, minX) to the corner
        const tx = part.place.x + bbox.maxY
        const ty = part.place.y - bbox.minX
        items.push(`<item objectid="${id}" transform="0 1 0 -1 0 0 0 0 1 ${fmt(tx)} ${fmt(ty)} ${fmt(tz)}"/>`)
      } else {
        const tx = part.place.x - bbox.minX
        const ty = part.place.y - bbox.minY
        items.push(`<item objectid="${id}" transform="1 0 0 0 1 0 0 0 1 ${fmt(tx)} ${fmt(ty)} ${fmt(tz)}"/>`)
      }
    } else {
      // preserve mesh coordinates — placement is already baked into the STL by exportActions
      const tx = -bbox.minX
      const ty = -bbox.minY
      items.push(`<item objectid="${id}" transform="1 0 0 0 1 0 0 0 1 ${fmt(tx)} ${fmt(ty)} ${fmt(tz)}"/>`)
    }
    modelInstances.push(
      `<model_instance>` +
      `<metadata key="object_id" value="${id}"/>` +
      `<metadata key="instance_id" value="0"/>` +
      `<metadata key="loaded" value="1"/>` +
      `</model_instance>`,
    )
  })

  const model =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">` +
    `<metadata name="Application">BambuStudio-${ORCA_BAMBU_VERSION}</metadata>` +
    `<metadata name="BambuStudio:3mfVersion">1</metadata>` +
    `<resources>` +
    `<basematerials id="${materialId}">${bases.join('')}</basematerials>` +
    `${objects.join('')}` +
    `</resources>` +
    `<build>${items.join('')}</build>` +
    `</model>`

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>` +
    (thumbnailPng ? `<Default Extension="png" ContentType="image/png"/>` : ``) +
    `</Types>`

  const rels =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>` +
    (thumbnailPng
      ? `<Relationship Target="/Metadata/plate_1.png" Id="rel-2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail"/>`
      : ``) +
    `</Relationships>`

  const bedConfig = BED_CONFIG[bed.id]
  const flavor = bedConfig?.flavor ?? 'marlin'
  const printerPreset = bedConfig?.preset ?? ''

  // printable_area corners: "0x0", "<x>x0", "<x>x<y>", "0x<y>"
  const printableArea = [
    '0x0',
    `${bed.x}x0`,
    `${bed.x}x${bed.y}`,
    `0x${bed.y}`,
  ]

  const mat = MATERIAL_CONFIG[material]

  const projectSettings: Record<string, unknown> = {
    version: ORCA_BAMBU_VERSION,
    name: 'project_settings',
    from: 'project',
    layer_height: '0.2',
    initial_layer_print_height: '0.2',
    wall_loops: '2',
    top_shell_layers: '4',
    bottom_shell_layers: '4',
    sparse_infill_density: '15%',
    sparse_infill_pattern: 'grid',
    enable_support: '0',
    support_type: 'normal(auto)',
    brim_type: 'no_brim',
    brim_width: '0',
    filament_type: [material],
    filament_colour: [mat.colour],
    nozzle_temperature: [String(mat.nozzle)],
    nozzle_temperature_initial_layer: [String(mat.nozzle)],
    bed_temperature: [String(mat.bed)],
    bed_temperature_initial_layer: [String(mat.bed)],
    hot_plate_temp: [String(mat.bed)],
    hot_plate_temp_initial_layer: [String(mat.bed)],
    nozzle_diameter: ['0.4'],
    printable_area: printableArea,
    printable_height: String(bed.z),
    gcode_flavor: flavor,
    print_settings_id: '0.20mm Standard @BBL',
    filament_settings_id: [mat.filamentSettingsId],
  }

  // only include printer_settings_id when we have a known preset (not custom)
  if (printerPreset) {
    projectSettings.printer_settings_id = printerPreset
  }

  // Marlin/Marlin2 only: inject minimal authored start+end G-code.
  // Klipper and Bambu flavors are intentionally excluded — their presets supply machine macros;
  // injecting wrong G-code (especially Klipper's PRINT_START which varies per config) is worse
  // than absent.
  if (flavor === 'marlin' || flavor === 'marlin2') {
    projectSettings.machine_start_gcode = MARLIN_START_GCODE
    projectSettings.machine_end_gcode = MARLIN_END_GCODE
  }

  const modelSettings =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<config>` +
    `<plate>` +
    `<metadata key="plater_id" value="1"/>` +
    `<metadata key="plater_name" value="Plate 1"/>` +
    `${modelInstances.join('')}` +
    `</plate>` +
    `</config>`

  const zipEntries: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(rels),
    '3D/3dmodel.model': strToU8(model),
    'Metadata/project_settings.config': strToU8(JSON.stringify(projectSettings, null, 2)),
    'Metadata/model_settings.config': strToU8(modelSettings),
  }
  if (thumbnailPng) {
    zipEntries['Metadata/plate_1.png'] = thumbnailPng
  }

  const zipped = zipSync(zipEntries, { level: 6 })
  // copy into a plain ArrayBuffer-backed view (Blob typing rejects ArrayBufferLike)
  const out = new Uint8Array(new ArrayBuffer(zipped.byteLength))
  out.set(zipped)
  return out
}

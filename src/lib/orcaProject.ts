import { zipSync, strToU8 } from 'fflate'
import { indexMesh, fmt, escapeXml } from './threeMFCore'
import type { PrinterBed } from '../types'

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

// Single color for the single-part display (first entry of threeMF.ts PART_PALETTE)
const SINGLE_PART_COLOR = '#4F8FBAFF'

export interface OrcaProjectOptions {
  bed: PrinterBed
}

/**
 * Build a slice-ready OrcaSlicer/BambuStudio .3mf from a single STL part.
 * The 5-file zip opens with printer, filament, and process pre-selected —
 * the Slice button is live immediately. Recognition gate: Application=BambuStudio-<version>.
 *
 * Single-part only in P1; multi-part comes in P3.
 */
export function buildOrcaProject(
  parts: Array<{ name: string; stl: ArrayBuffer }>,
  { bed }: OrcaProjectOptions,
): Uint8Array<ArrayBuffer> {
  // P1 single-part: use first part only
  const part = parts[0]
  const { vertices, triangles, bbox } = indexMesh(part.stl)
  const id = 1
  const materialId = 2 // basematerials sits after object id 1

  // Preserve mesh coordinates — placement is already baked into the STL by exportActions
  const tz = -bbox.minZ
  const tx = -bbox.minX
  const ty = -bbox.minY

  const model =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">` +
    `<metadata name="Application">BambuStudio-${ORCA_BAMBU_VERSION}</metadata>` +
    `<metadata name="BambuStudio:3mfVersion">1</metadata>` +
    `<resources>` +
    `<basematerials id="${materialId}"><base name="${escapeXml(part.name)}" displaycolor="${SINGLE_PART_COLOR}"/></basematerials>` +
    `<object id="${id}" name="${escapeXml(part.name)}" type="model" pid="${materialId}" pindex="0">` +
    `<mesh><vertices>${vertices}</vertices><triangles>${triangles}</triangles></mesh>` +
    `</object>` +
    `</resources>` +
    `<build><item objectid="${id}" transform="1 0 0 0 1 0 0 0 1 ${fmt(tx)} ${fmt(ty)} ${fmt(tz)}"/></build>` +
    `</model>`

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>` +
    `</Types>`

  const rels =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>` +
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
    filament_type: ['PLA'],
    filament_colour: ['#4CAF50FF'],
    nozzle_temperature: ['220'],
    nozzle_temperature_initial_layer: ['220'],
    bed_temperature: ['65'],
    bed_temperature_initial_layer: ['65'],
    hot_plate_temp: ['65'],
    hot_plate_temp_initial_layer: ['65'],
    nozzle_diameter: ['0.4'],
    printable_area: printableArea,
    printable_height: String(bed.z),
    gcode_flavor: flavor,
    print_settings_id: '0.20mm Standard @BBL',
    filament_settings_id: ['Bambu PLA Basic @BBL A1M'],
  }

  // only include printer_settings_id when we have a known preset (not custom)
  if (printerPreset) {
    projectSettings.printer_settings_id = printerPreset
  }

  const modelSettings =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<config>` +
    `<plate>` +
    `<metadata key="plater_id" value="1"/>` +
    `<metadata key="plater_name" value="Plate 1"/>` +
    `<model_instance>` +
    `<metadata key="object_id" value="1"/>` +
    `<metadata key="instance_id" value="0"/>` +
    `<metadata key="loaded" value="1"/>` +
    `</model_instance>` +
    `</plate>` +
    `</config>`

  const zipped = zipSync(
    {
      '[Content_Types].xml': strToU8(contentTypes),
      '_rels/.rels': strToU8(rels),
      '3D/3dmodel.model': strToU8(model),
      'Metadata/project_settings.config': strToU8(JSON.stringify(projectSettings, null, 2)),
      'Metadata/model_settings.config': strToU8(modelSettings),
    },
    { level: 6 },
  )
  // copy into a plain ArrayBuffer-backed view (Blob typing rejects ArrayBufferLike)
  const out = new Uint8Array(new ArrayBuffer(zipped.byteLength))
  out.set(zipped)
  return out
}

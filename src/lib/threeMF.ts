import { zipSync, strToU8 } from 'fflate'

/** Deterministic, print-friendly, visually-distinct per-part palette (sRGB #RRGGBBAA, opaque).
 *  Keyed by part-enum order so a .vibemesh re-import reproduces identical swatches and each part
 *  shows in its own color in Bambu/Prusa/Orca. (basematerials is core 3MF and carries the per-part
 *  DISPLAY color; auto-assigning a distinct FILAMENT slot per part in Bambu needs the production/
 *  color extension, not core displaycolor — a later add.) Cycles past 8 pieces. */
const PART_PALETTE = [
  '#4F8FBAFF', // blue
  '#E8A33DFF', // amber
  '#3DAE8BFF', // teal
  '#D45D5DFF', // red
  '#7E6BC4FF', // purple
  '#9CB04AFF', // olive
  '#D98AB5FF', // pink
  '#6B7280FF', // slate
]

/**
 * Build a spec-conformant 3MF package (the format Bambu Studio / PrusaSlicer /
 * Orca open natively) from one or more binary STLs. Each part becomes a named
 * object; build items lay the parts side by side on the plate with a gap, each
 * sitting at z=0, so the slicer opens a ready-to-arrange plate.
 */
export function buildThreeMF(
  // `place` is the per-plate packed position; `rot` (the packer's single source of truth) is the
  // Z-spin to bake — absent/undefined means identity (rot 0). Callers without `place` arrange normally.
  // `colorKey` groups display color: replicas of one part (same key) share a swatch instead of getting
  // a per-index color; absent ⇒ keyed by name (distinct parts keep distinct colors, as before).
  parts: Array<{ name: string; stl: ArrayBuffer; colorKey?: string; place?: { x: number; y: number; rot?: 0 | 90 } }>,
  { arrange = true }: { arrange?: boolean } = {},
): Uint8Array<ArrayBuffer> {
  const objects: string[] = []
  const items: string[] = []
  const bases: string[] = []
  const materialId = parts.length + 1 // basematerials group id — sits after every object id (1..N)
  let cursorX = 0
  // assign a palette swatch per distinct colorKey in first-appearance order, so N replicas of one
  // part read as one color, N instances — not N different colors. Distinct parts (key = name) keep
  // their prior index-order colors.
  const colorIndex = new Map<string, number>()
  const colorFor = (key: string): string => {
    let i = colorIndex.get(key)
    if (i === undefined) {
      i = colorIndex.size
      colorIndex.set(key, i)
    }
    return PART_PALETTE[i % PART_PALETTE.length]
  }

  parts.forEach((part, index) => {
    const { vertices, triangles, bbox } = indexMesh(part.stl)
    const id = index + 1
    // per-part display color, deterministic by part-enum order — so a .vibemesh re-import reproduces
    // the same swatches and each part shows in its own color in Bambu/Prusa/Orca. basematerials is
    // core 3MF, so this needs no extension namespace (a distinct filament slot per part is a later add).
    bases.push(`<base name="${escapeXml(part.name)}" displaycolor="${colorFor(part.colorKey ?? part.name)}"/>`)
    objects.push(
      `<object id="${id}" name="${escapeXml(part.name)}" type="model" pid="${materialId}" pindex="${index}"><mesh><vertices>${vertices}</vertices><triangles>${triangles}</triangles></mesh></object>`,
    )
    if (part.place) {
      // explicit packed placement (per-plate slicer export): drop the piece's min corner onto the
      // packer's bed-local (x,y) and seat it on z=0, matching the on-screen slicer pack. The `rot`
      // is the packer's single source of truth — SlicerScene applies the same spin in the view.
      const tz = -bbox.minZ
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
    } else if (arrange) {
      // arrange: side by side along X with 10mm gaps, centered in Y, flat on z=0
      const tx = cursorX - bbox.minX
      const ty = -(bbox.minY + bbox.maxY) / 2
      const tz = -bbox.minZ
      cursorX += bbox.maxX - bbox.minX + 10
      items.push(`<item objectid="${id}" transform="1 0 0 0 1 0 0 0 1 ${fmt(tx)} ${fmt(ty)} ${fmt(tz)}"/>`)
    } else {
      // preserve the mesh's own coordinates — placement is already baked into the
      // STL (single-piece export), so re-centering would disagree with the .stl path
      items.push(`<item objectid="${id}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>`)
    }
  })

  const model =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">` +
    `<metadata name="Application">Vibemesh-AI</metadata>` +
    `<resources>${bases.length ? `<basematerials id="${materialId}">${bases.join('')}</basematerials>` : ''}${objects.join('')}</resources>` +
    `<build>${items.join('')}</build>` +
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

  const zipped = zipSync(
    {
      '[Content_Types].xml': strToU8(contentTypes),
      '_rels/.rels': strToU8(rels),
      '3D/3dmodel.model': strToU8(model),
    },
    { level: 6 },
  )
  // copy into a plain ArrayBuffer-backed view (Blob typing rejects ArrayBufferLike)
  const out = new Uint8Array(new ArrayBuffer(zipped.byteLength))
  out.set(zipped)
  return out
}

/** Binary STL triangle soup → indexed mesh XML fragments + bbox. */
function indexMesh(stl: ArrayBuffer): {
  vertices: string
  triangles: string
  bbox: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }
} {
  const view = new DataView(stl)
  const count = view.getUint32(80, true)
  if (stl.byteLength < 84 + count * 50) throw new Error('Malformed STL: triangle count exceeds buffer.')
  const index = new Map<string, number>()
  const verts: string[] = []
  const tris: string[] = []
  const bbox = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity }
  const ids = [0, 0, 0]

  for (let i = 0; i < count; i++) {
    const base = 84 + i * 50 + 12
    for (let k = 0; k < 3; k++) {
      const x = view.getFloat32(base + k * 12, true)
      const y = view.getFloat32(base + k * 12 + 4, true)
      const z = view.getFloat32(base + k * 12 + 8, true)
      // snap the dedup KEY to a 0.001mm weld grid (coords below keep full precision)
      // so near-coincident vertices at boolean seams merge — slicers stop flagging
      // the mesh "not watertight".
      const key = `${snapKey(x)} ${snapKey(y)} ${snapKey(z)}`
      let id = index.get(key)
      if (id === undefined) {
        id = index.size
        index.set(key, id)
        verts.push(`<vertex x="${fmt(x)}" y="${fmt(y)}" z="${fmt(z)}"/>`)
        if (x < bbox.minX) bbox.minX = x
        if (x > bbox.maxX) bbox.maxX = x
        if (y < bbox.minY) bbox.minY = y
        if (y > bbox.maxY) bbox.maxY = y
        if (z < bbox.minZ) bbox.minZ = z
        if (z > bbox.maxZ) bbox.maxZ = z
      }
      ids[k] = id
    }
    // skip degenerate triangles (3MF validators reject repeated indices)
    if (ids[0] !== ids[1] && ids[1] !== ids[2] && ids[0] !== ids[2]) {
      tris.push(`<triangle v1="${ids[0]}" v2="${ids[1]}" v3="${ids[2]}"/>`)
    }
  }
  return { vertices: verts.join(''), triangles: tris.join(''), bbox }
}

function fmt(n: number): string {
  return Number(n.toFixed(4)).toString()
}

/** Weld grid (0.001mm) for the vertex dedup KEY only — written coords keep full
 *  precision; this merges near-coincident vertices from boolean seams. */
function snapKey(n: number): number {
  return Math.round(n / 1e-3) * 1e-3
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!)
}

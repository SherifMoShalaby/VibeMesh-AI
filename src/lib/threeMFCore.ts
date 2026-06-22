/** Binary STL triangle soup → indexed mesh XML fragments + bbox. */
export function indexMesh(stl: ArrayBuffer): {
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

export function fmt(n: number): string {
  return Number(n.toFixed(4)).toString()
}

/** Weld grid (0.001mm) for the vertex dedup KEY only — written coords keep full
 *  precision; this merges near-coincident vertices from boolean seams. */
export function snapKey(n: number): number {
  return Math.round(n / 1e-3) * 1e-3
}

export function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!)
}

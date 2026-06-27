import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { mergeVertices, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const loader = new STLLoader()

/** Auto-smooth crease angle: faces meeting at a SHALLOWER angle than this are smoothed
 *  together (curved surfaces read smooth), sharper edges stay crisp — Blender's
 *  "shade smooth + auto-smooth". 35° smooths cylinders / fillets / rotate_extrude bodies
 *  while keeping box corners and chamfers hard. */
const CREASE_ANGLE_DEG = 35

/** Above this triangle count, the synchronous vertex-weld + creased-normal pass (run in a
 *  React useMemo on the main thread, on every successful compile AND every param tweak) janks
 *  the frame for hundreds of ms right when the model appears. Heavy boolean assemblies are
 *  exactly the case that overruns it, and at this density facets are already sub-pixel — so we
 *  fall back to cheap flat normals on the raw geometry rather than freeze the tab. Smaller
 *  models (the common case) keep the high-quality smoothed path. */
const WELD_TRIANGLE_LIMIT = 250_000

export interface ModelGeometry {
  geometry: THREE.BufferGeometry
  /** size in mm along x/y/z */
  size: { x: number; y: number; z: number }
  /** lowest z of the model (to check it sits on the bed) */
  minZ: number
  center: { x: number; y: number }
  triangles: number
}

export function parseStl(buffer: ArrayBuffer): ModelGeometry {
  const raw = loader.parse(buffer)
  // STLLoader returns a NON-indexed geometry (every triangle has its own 3 vertices) with
  // per-FACE normals, so computeVertexNormals alone just reproduces those facets. Drop the
  // face normals (they'd otherwise block position-based welding), weld coincident vertices,
  // then derive angle-thresholded smooth normals so curves read smooth but hard edges stay.
  // (Above WELD_TRIANGLE_LIMIT the weld+crease is too slow for the main thread — see below.)
  raw.deleteAttribute('normal')
  const rawTris = raw.getAttribute('position').count / 3
  let geometry: THREE.BufferGeometry
  if (rawTris > WELD_TRIANGLE_LIMIT) {
    // too heavy to weld+crease on the main thread without a visible stall — keep the raw
    // (non-indexed) geometry and give it cheap per-face normals. Facets are sub-pixel at
    // this density, so the visual cost is negligible next to the avoided freeze.
    raw.computeVertexNormals()
    geometry = raw
  } else {
    const welded = mergeVertices(raw)
    geometry = toCreasedNormals(welded, THREE.MathUtils.degToRad(CREASE_ANGLE_DEG))
    raw.dispose()
    welded.dispose()
  }
  geometry.computeBoundingBox()
  const box = geometry.boundingBox!
  const size = {
    x: box.max.x - box.min.x,
    y: box.max.y - box.min.y,
    z: box.max.z - box.min.z,
  }
  return {
    geometry,
    size,
    minZ: box.min.z,
    center: { x: (box.min.x + box.max.x) / 2, y: (box.min.y + box.max.y) / 2 },
    triangles: geometry.getAttribute('position').count / 3,
  }
}

export interface StlBBox {
  x: number
  y: number
  z: number
  minZ: number
  /** Mesh volume in mm³ (absolute value of the signed-tetrahedron sum) and triangle count —
   *  reference-free geometry-CONTENT signals beyond the bounding box. The refine loop uses them to
   *  detect SELF-RELATIVE convergence (the model has stopped reshaping) and "false convergence"
   *  (right bbox, hollow/thin shape). Computed in the same single byte pass as the bbox, so cheap. */
  volume: number
  triangles: number
}

/** Lightweight binary-STL bounding box + volume + triangle count (no three.js geometry allocation). */
export function stlBBox(buffer: ArrayBuffer): StlBBox | null {
  if (buffer.byteLength < 84) return null
  const view = new DataView(buffer)
  const count = view.getUint32(80, true)
  if (buffer.byteLength < 84 + count * 50) return null
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  let vol6 = 0 // 6× the signed mesh volume: Σ a·(b×c); divided by 6 at the end
  for (let i = 0; i < count; i++) {
    const base = 84 + i * 50 + 12
    const ax = view.getFloat32(base, true)
    const ay = view.getFloat32(base + 4, true)
    const az = view.getFloat32(base + 8, true)
    const bx = view.getFloat32(base + 12, true)
    const by = view.getFloat32(base + 16, true)
    const bz = view.getFloat32(base + 20, true)
    const cx = view.getFloat32(base + 24, true)
    const cy = view.getFloat32(base + 28, true)
    const cz = view.getFloat32(base + 32, true)
    min[0] = Math.min(min[0], ax, bx, cx)
    max[0] = Math.max(max[0], ax, bx, cx)
    min[1] = Math.min(min[1], ay, by, cy)
    max[1] = Math.max(max[1], ay, by, cy)
    min[2] = Math.min(min[2], az, bz, cz)
    max[2] = Math.max(max[2], az, bz, cz)
    // signed tetrahedron volume × 6 = a · (b × c)
    vol6 += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)
  }
  const r = (n: number) => Math.round(n * 100) / 100
  return {
    x: r(max[0] - min[0]),
    y: r(max[1] - min[1]),
    z: r(max[2] - min[2]),
    minZ: r(min[2]),
    volume: r(Math.abs(vol6) / 6),
    triangles: count,
  }
}

export interface IslandReport {
  /** number of connected solids (triangle clusters sharing a welded vertex) */
  count: number
  /** the largest island's share of total mesh volume — a near-1 value means the rest are
   *  negligible specks; a sizeable secondary fraction means a genuinely detached feature. */
  largestVolumeFraction: number
}

/** Snap a coordinate to ~1e-3 mm so coincident-but-not-bit-identical vertices (the norm in an
 *  STL where every triangle carries its own copy of shared corners) weld into one node. */
const VERT_QUANT = 1000 // 1/0.001mm

/**
 * Connected-components count over a binary STL — a reference-free "is this ONE solid?" signal.
 * Triangles that share a quantized vertex are unioned (union-find); the number of resulting sets is
 * the island count. Pure DataView math (no three.js), so it runs in the client AND the bench/node.
 *
 * Used by the text success gate: a single-solid part that renders as >=2 disjoint islands (a mug
 * handle floating off the wall) is physically broken even though its bbox is sane and it compiled.
 * A hollow ring/tube is still ONE island (its inner + outer walls share the rim triangles), so this
 * does NOT false-positive legitimate hollow bodies.
 */
export function islandCount(buffer: ArrayBuffer): IslandReport | null {
  if (buffer.byteLength < 84) return null
  const view = new DataView(buffer)
  const count = view.getUint32(80, true)
  if (count === 0) return { count: 0, largestVolumeFraction: 0 }
  if (buffer.byteLength < 84 + count * 50) return null

  // union-find over triangles, keyed by a shared quantized vertex.
  const parent = new Int32Array(count)
  for (let i = 0; i < count; i++) parent[i] = i
  const find = (a: number): number => {
    let r = a
    while (parent[r] !== r) r = parent[r]
    while (parent[a] !== r) { const n = parent[a]; parent[a] = r; a = n } // path compression
    return r
  }
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb }

  // map vertex key → first triangle that touched it; subsequent touchers union to it.
  const seen = new Map<string, number>()
  const triVol6 = new Float64Array(count) // 6× signed volume per triangle (for the fraction)
  for (let i = 0; i < count; i++) {
    const base = 84 + i * 50 + 12
    const coords: number[] = []
    for (let k = 0; k < 3; k++) {
      const x = Math.round(view.getFloat32(base + k * 12, true) * VERT_QUANT)
      const y = Math.round(view.getFloat32(base + k * 12 + 4, true) * VERT_QUANT)
      const z = Math.round(view.getFloat32(base + k * 12 + 8, true) * VERT_QUANT)
      coords.push(x, y, z)
      const key = `${x},${y},${z}`
      const prev = seen.get(key)
      if (prev === undefined) seen.set(key, i)
      else union(i, prev)
    }
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = coords
    triVol6[i] = ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)
  }

  // accumulate the SIGNED tetrahedron sum per root set, count distinct roots. Summing signed (not
  // absolute) values makes a closed surface's enclosed volume telescope correctly regardless of how
  // far the island sits from the origin — the per-triangle |value| would otherwise scale with offset.
  const setVol = new Map<number, number>()
  for (let i = 0; i < count; i++) {
    const r = find(i)
    setVol.set(r, (setVol.get(r) ?? 0) + triVol6[i])
  }
  let total = 0
  let largest = 0
  for (const v of setVol.values()) { const vol = Math.abs(v) / 6; total += vol; if (vol > largest) largest = vol }
  return {
    count: setVol.size,
    largestVolumeFraction: total > 0 ? largest / total : 0,
  }
}

/**
 * Apply a 4×4 transform (column-major, THREE.Matrix4.elements) to every vertex
 * of a binary STL, recomputing facet normals. Pure DataView math — used to bake
 * viewport move/rotate into exports so what you see is what you print.
 */
export function transformStl(buffer: ArrayBuffer, m: number[]): ArrayBuffer {
  const src = new DataView(buffer)
  const count = src.getUint32(80, true)
  // guard a header count that exceeds the payload (mirrors stlBBox) so a malformed
  // STL can't read past the buffer and throw mid-export
  if (buffer.byteLength < 84 + count * 50) throw new Error('Malformed STL: triangle count exceeds buffer.')
  const out = buffer.slice(0)
  const dst = new DataView(out)
  const v: [number, number, number][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  for (let i = 0; i < count; i++) {
    const base = 84 + i * 50
    for (let k = 0; k < 3; k++) {
      const off = base + 12 + k * 12
      const x = src.getFloat32(off, true)
      const y = src.getFloat32(off + 4, true)
      const z = src.getFloat32(off + 8, true)
      v[k][0] = m[0] * x + m[4] * y + m[8] * z + m[12]
      v[k][1] = m[1] * x + m[5] * y + m[9] * z + m[13]
      v[k][2] = m[2] * x + m[6] * y + m[10] * z + m[14]
      dst.setFloat32(off, v[k][0], true)
      dst.setFloat32(off + 4, v[k][1], true)
      dst.setFloat32(off + 8, v[k][2], true)
    }
    // facet normal = normalize((v1-v0) × (v2-v0))
    const ax = v[1][0] - v[0][0]
    const ay = v[1][1] - v[0][1]
    const az = v[1][2] - v[0][2]
    const bx = v[2][0] - v[0][0]
    const by = v[2][1] - v[0][1]
    const bz = v[2][2] - v[0][2]
    let nx = ay * bz - az * by
    let ny = az * bx - ax * bz
    let nz = ax * by - ay * bx
    const len = Math.hypot(nx, ny, nz) || 1
    nx /= len
    ny /= len
    nz /= len
    dst.setFloat32(base, nx, true)
    dst.setFloat32(base + 4, ny, true)
    dst.setFloat32(base + 8, nz, true)
  }
  return out
}

export function downloadBlob(data: BlobPart, filename: string, type: string): void {
  const blob = new Blob([data], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

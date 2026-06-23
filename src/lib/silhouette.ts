/**
 * Browser-side silhouette twin of the bench rasterizer (bench/render.mjs + bench/silhouette.mjs).
 *
 * This is a FAITHFUL, math-identical port of the bench's `renderMasks` + `maskIoU` so the live
 * loop (best-of-N tiebreak / refine gate) can compute the SAME placement- and scale-normalized
 * SHAPE signal the bench ratchets on — without pulling in three.js, a GPU, or the WASM compiler.
 * Orthographic projection + a z-buffer + a foreground/background threshold, exactly as the bench.
 *
 * IMPORTANT — preserved behavior (do NOT "fix" here): each model is framed to its OWN bbox, so the
 * IoU is SCALE-BLIND by design. It answers "is this the same SHAPE?", not "is it the same size?".
 * Correcting that is the silhouette-spike's job downstream, not this port's. The numbers this module
 * emits MUST stay bit-identical to bench/render.mjs + bench/silhouette.mjs (guarded by
 * bench/silhouette-live.selftest.mjs).
 *
 * Triangles are read with a dependency-free flat DataView reader (the same logic as the bench's
 * `parseStl` in bench/compare.mjs and the byte loop in src/lib/stl.ts's `stlBBox`) — NOT through
 * src/lib/stl.ts's three.js `parseStl`, which welds/creases normals and builds a BufferGeometry.
 */

// camera DIRECTION (target→camera) per pose, matching Viewport.tsx setView() / bench render.mjs
export const POSES: Record<string, { dir: [number, number, number]; up: [number, number, number] }> = {
  iso: { dir: [1, -1, 0.75], up: [0, 0, 1] },
  front: { dir: [0, -1, 0.0001], up: [0, 0, 1] },
  top: { dir: [0.0001, -0.0001, 1], up: [0, 1, 0] }, // Y-up to avoid gimbal lock looking down -Z
  right: { dir: [1, 0, 0.001], up: [0, 0, 1] }, // down -X — exposes depth + side asymmetry
}

export type PoseName = keyof typeof POSES

type Vec3 = [number, number, number]

const LIGHT = norm([0.4, -0.5, 0.85]) // soft key light, roughly over the viewer's shoulder
const SIZE = 256
const BG = 18 // dark background gray
const AMBIENT = 0.22

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
function norm(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

/**
 * Binary STL bytes → flat triangle array [x0,y0,z0,x1,y1,z1,x2,y2,z2, …].
 * Dependency-free DataView reader — identical math to bench/compare.mjs `parseStl` and the byte
 * loop in src/lib/stl.ts `stlBBox`. Throws on a too-short / size-mismatched (e.g. ASCII) STL,
 * mirroring the bench so renderMasks's try/catch reproduces the bench's empty-safe behavior.
 */
export function parseStlTriangles(buffer: ArrayBuffer): Float64Array {
  if (buffer.byteLength < 84) throw new Error('not a binary STL (too short)')
  const view = new DataView(buffer)
  const count = view.getUint32(80, true)
  if (buffer.byteLength < 84 + count * 50) {
    throw new Error('not a binary STL (size mismatch — ASCII STL is not supported)')
  }
  const tris = new Float64Array(count * 9)
  for (let i = 0; i < count; i++) {
    const base = 84 + i * 50 + 12 // skip facet normal
    for (let k = 0; k < 9; k++) tris[i * 9 + k] = view.getFloat32(base + k * 4, true)
  }
  return tris
}

/** Render one pose to a grayscale Uint8Array (SIZE×SIZE). Faithful port of render.mjs renderPose. */
function renderPose(tris: Float64Array, center: Vec3, radius: number, pose: { dir: Vec3; up: Vec3 }): Uint8Array {
  const zAxis = norm(pose.dir) // points target→camera
  const xAxis = norm(cross(pose.up, zAxis))
  const yAxis = cross(zAxis, xAxis)
  const scale = (SIZE * 0.45) / (radius || 1)
  const img = new Uint8Array(SIZE * SIZE).fill(BG)
  const depth = new Float32Array(SIZE * SIZE).fill(-Infinity)

  const project = (vx: number, vy: number, vz: number): Vec3 => {
    const p: Vec3 = [vx - center[0], vy - center[1], vz - center[2]]
    const cx = dot(p, xAxis),
      cy = dot(p, yAxis),
      cz = dot(p, zAxis)
    return [SIZE / 2 + cx * scale, SIZE / 2 - cy * scale, cz] // screen x,y + camera-space depth (bigger = nearer)
  }

  for (let i = 0; i < tris.length; i += 9) {
    const ax = tris[i],
      ay = tris[i + 1],
      az = tris[i + 2]
    const bx = tris[i + 3],
      by = tris[i + 4],
      bz = tris[i + 5]
    const cxw = tris[i + 6],
      cyw = tris[i + 7],
      czw = tris[i + 8]
    const n = norm(cross(sub([bx, by, bz], [ax, ay, az]), sub([cxw, cyw, czw], [ax, ay, az])))
    const shade = AMBIENT + (1 - AMBIENT) * Math.abs(dot(n, LIGHT)) // abs: light both faces, no black backfaces
    const gray = Math.max(BG + 1, Math.min(255, Math.round(40 + shade * 215)))

    const A = project(ax, ay, az),
      B = project(bx, by, bz),
      C = project(cxw, cyw, czw)
    const minX = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0])))
    const maxX = Math.min(SIZE - 1, Math.ceil(Math.max(A[0], B[0], C[0])))
    const minY = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1])))
    const maxY = Math.min(SIZE - 1, Math.ceil(Math.max(A[1], B[1], C[1])))
    const det = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1])
    if (Math.abs(det) < 1e-9) continue

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const w0 = ((B[1] - C[1]) * (x - C[0]) + (C[0] - B[0]) * (y - C[1])) / det
        const w1 = ((C[1] - A[1]) * (x - C[0]) + (A[0] - C[0]) * (y - C[1])) / det
        const w2 = 1 - w0 - w1
        if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue
        const z = w0 * A[2] + w1 * B[2] + w2 * C[2]
        const idx = y * SIZE + x
        if (z > depth[idx]) {
          depth[idx] = z
          img[idx] = gray
        }
      }
    }
  }
  return img
}

/**
 * Foreground SILHOUETTE masks (1 = part, 0 = background) per pose. Faithful port of render.mjs
 * renderMasks. Each model is framed to its OWN bbox (scale-/placement-normalized — see module note).
 * Accepts an ArrayBuffer (browser-native). Returns {} for an empty/unparseable STL (empty-safe).
 */
export function renderMasks(stlBytes: ArrayBuffer): Record<string, Uint8Array> {
  let tris: Float64Array
  try {
    tris = parseStlTriangles(stlBytes)
  } catch {
    return {} // malformed/too-short STL → no masks (empty-safe)
  }
  if (!tris.length) return {}
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < tris.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const v = tris[i + a]
      if (v < min[a]) min[a] = v
      if (v > max[a]) max[a] = v
    }
  }
  const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
  const radius = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2
  const out: Record<string, Uint8Array> = {}
  for (const name of Object.keys(POSES)) {
    const img = renderPose(tris, center, radius, POSES[name])
    const mask = new Uint8Array(img.length)
    for (let i = 0; i < img.length; i++) mask[i] = img[i] > BG ? 1 : 0
    out[name] = mask
  }
  return out
}

/** IoU of two equal-length 0/1 masks. Faithful port of silhouette.mjs maskIoU (0 on null/mismatch). */
export function maskIoU(maskA: Uint8Array | null | undefined, maskB: Uint8Array | null | undefined): number {
  if (!maskA || !maskB || maskA.length !== maskB.length) return 0
  let inter = 0
  let uni = 0
  for (let i = 0; i < maskA.length; i++) {
    const a = maskA[i]
    const b = maskB[i]
    if (a || b) uni++
    if (a && b) inter++
  }
  return uni ? inter / uni : 0
}

/**
 * Silhouette-IoU of two STLs at one pose ('front' | 'iso' | 'top' | 'right'). Each STL is framed to
 * its own bbox, so this is a pure SHAPE comparison (1 = same outline). Returns 0 if either is empty.
 */
export function silhouetteIoU(stlA: ArrayBuffer, stlB: ArrayBuffer, pose: PoseName = 'front'): number {
  const A = renderMasks(stlA)
  const B = renderMasks(stlB)
  return maskIoU(A[pose], B[pose])
}

/** Best silhouette-IoU across all poses — robust to a piece reading right from one angle but not another. */
export function silhouetteIoUMax(stlA: ArrayBuffer, stlB: ArrayBuffer): number {
  const A = renderMasks(stlA)
  const B = renderMasks(stlB)
  let best = 0
  for (const pose of Object.keys(A)) {
    const v = maskIoU(A[pose], B[pose])
    if (v > best) best = v
  }
  return best
}

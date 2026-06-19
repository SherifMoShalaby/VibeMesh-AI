/**
 * Dependency-light CPU rasterizer: a compiled STL → small PNGs from the same three
 * fixed poses the app's refine capture uses (isometric / front / top / right, Viewport.tsx
 * CaptureRig). Feeds the advisory vision-judge (judgeVision) so it can compare the
 * generated geometry against a reference image — turning "is the spinner's stepped
 * arm actually there?" into something a model can check. No GPU, no native deps:
 * orthographic projection + a z-buffer + flat Lambert shading + a zlib PNG encoder.
 *
 * Used only by the BENCH_JUDGE lane; normal bench runs never call it.
 */
import zlib from 'node:zlib'
import { parseStl } from './compare.mjs'

// camera DIRECTION (target→camera) per pose, matching Viewport.tsx setView()
const POSES = {
  iso: { dir: [1, -1, 0.75], up: [0, 0, 1] },
  front: { dir: [0, -1, 0.0001], up: [0, 0, 1] },
  top: { dir: [0.0001, -0.0001, 1], up: [0, 1, 0] }, // Y-up to avoid gimbal lock looking down -Z
  right: { dir: [1, 0, 0.001], up: [0, 0, 1] }, // down -X — exposes depth + side asymmetry
}
const LIGHT = norm([0.4, -0.5, 0.85]) // soft key light, roughly over the viewer's shoulder
const SIZE = 256
const BG = 18 // dark background gray
const AMBIENT = 0.22

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]] }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]] }
function norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] }

/** Render one pose to a grayscale Uint8Array (SIZE×SIZE). */
function renderPose(tris, center, radius, pose) {
  const zAxis = norm(pose.dir) // points target→camera
  const xAxis = norm(cross(pose.up, zAxis))
  const yAxis = cross(zAxis, xAxis)
  const scale = (SIZE * 0.45) / (radius || 1)
  const img = new Uint8Array(SIZE * SIZE).fill(BG)
  const depth = new Float32Array(SIZE * SIZE).fill(-Infinity)

  const project = (vx, vy, vz) => {
    const p = [vx - center[0], vy - center[1], vz - center[2]]
    const cx = dot(p, xAxis), cy = dot(p, yAxis), cz = dot(p, zAxis)
    return [SIZE / 2 + cx * scale, SIZE / 2 - cy * scale, cz] // screen x,y + camera-space depth (bigger = nearer)
  }

  for (let i = 0; i < tris.length; i += 9) {
    const ax = tris[i], ay = tris[i + 1], az = tris[i + 2]
    const bx = tris[i + 3], by = tris[i + 4], bz = tris[i + 5]
    const cxw = tris[i + 6], cyw = tris[i + 7], czw = tris[i + 8]
    const n = norm(cross(sub([bx, by, bz], [ax, ay, az]), sub([cxw, cyw, czw], [ax, ay, az])))
    const shade = AMBIENT + (1 - AMBIENT) * Math.abs(dot(n, LIGHT)) // abs: light both faces, no black backfaces
    const gray = Math.max(BG + 1, Math.min(255, Math.round(40 + shade * 215)))

    const A = project(ax, ay, az), B = project(bx, by, bz), C = project(cxw, cyw, czw)
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

/** Grayscale Uint8Array (SIZE×SIZE) → PNG Buffer (colorType 0, 8-bit). */
function encodePng(gray) {
  const raw = Buffer.alloc((SIZE + 1) * SIZE)
  for (let y = 0; y < SIZE; y++) {
    raw[y * (SIZE + 1)] = 0 // filter: none
    raw.set(gray.subarray(y * SIZE, (y + 1) * SIZE), y * (SIZE + 1) + 1)
  }
  const idat = zlib.deflateSync(raw)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(SIZE, 0)
  ihdr.writeUInt32BE(SIZE, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 0 // color type: grayscale
  // 10..12 = compression/filter/interlace = 0
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length)
    out.writeUInt32BE(data.length, 0)
    out.write(type, 4, 'ascii')
    data.copy(out, 8)
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)) >>> 0, 8 + data.length)
    return out
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/**
 * Compile-agnostic: given binary STL bytes, return the three poses as PNGs.
 * @returns Array<{ name, pngBase64, mediaType }> — ready for Anthropic image blocks.
 */
export function renderViews(stlBytes) {
  const tris = parseStl(stlBytes)
  if (!tris.length) return []
  let min = [Infinity, Infinity, Infinity]
  let max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < tris.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const v = tris[i + a]
      if (v < min[a]) min[a] = v
      if (v > max[a]) max[a] = v
    }
  }
  const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
  const radius = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2
  return Object.entries(POSES).map(([name, pose]) => ({
    name,
    mediaType: 'image/png',
    pngBase64: encodePng(renderPose(tris, center, radius, pose)).toString('base64'),
  }))
}

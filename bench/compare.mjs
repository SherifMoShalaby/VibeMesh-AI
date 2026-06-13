/**
 * Geometric similarity vs gold references — voxel IoU/Dice/precision/recall.
 * (Inspired by VibeCAD's model-compare skill, reimplemented mesh-native in JS
 * so the bench stays dependency-free.)
 *
 * Gold references live in bench/gold/<task-id>.scad — only tasks whose geometry
 * is fully determined by the prompt have one (T2/T3 are open-ended designs).
 *
 * Method: both meshes are placement-normalized (bbox XY-centered, floor at z=0),
 * voxelized on a shared grid by casting a +Z ray per voxel column (even-odd fill
 * between surface crossings), and compared. The candidate is tried at 0/90/180/270°
 * around Z and the best IoU wins — axis choice is not a modeling error.
 *
 * CLI: node bench/compare.mjs <gold.scad|.stl> <candidate.scad|.stl>
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createOpenSCAD } from 'openscad-wasm'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const RENDER_TIMEOUT = 90_000
/** target voxels along the longest axis (pitch never below MIN_PITCH mm) */
const RESOLUTION = 192
const MIN_PITCH = 0.2

/* ── compile .scad → binary STL bytes (same engine the app/bench use) ── */

export async function compileScad(code) {
  const job = (async () => {
    const o = await createOpenSCAD({ noInitialRun: true, print: () => {}, printErr: () => {} })
    const inst = o.getInstance()
    inst.FS.writeFile('/in.scad', code)
    try {
      inst.callMain(['/in.scad', '-o', '/out.stl', '--export-format=binstl'])
    } catch {
      /* abnormal exit — check for output anyway */
    }
    try {
      return inst.FS.readFile('/out.stl', { encoding: 'binary' })
    } catch {
      return null
    }
  })()
  const timeout = new Promise((resolve) => setTimeout(() => resolve('TIMEOUT'), RENDER_TIMEOUT))
  const result = await Promise.race([job, timeout])
  if (result === 'TIMEOUT' || !result || result.length === 0) return null
  return result
}

/* ── binary STL → flat triangle array [x0,y0,z0,x1,y1,z1,x2,y2,z2, …] ── */

export function parseStl(bytes) {
  if (bytes.byteLength < 84) throw new Error('not a binary STL (too short)')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const count = view.getUint32(80, true)
  if (bytes.byteLength < 84 + count * 50) {
    throw new Error('not a binary STL (size mismatch — ASCII STL is not supported)')
  }
  const tris = new Float64Array(count * 9)
  for (let i = 0; i < count; i++) {
    const base = 84 + i * 50 + 12 // skip facet normal
    for (let k = 0; k < 9; k++) tris[i * 9 + k] = view.getFloat32(base + k * 4, true)
  }
  return tris
}

/* ── mesh helpers ── */

function bboxOf(tris) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < tris.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const v = tris[i + a]
      if (v < min[a]) min[a] = v
      if (v > max[a]) max[a] = v
    }
  }
  return { min, max }
}

/** placement-normalize: bbox center → x=y=0, lowest point → z=0 */
function normalize(tris) {
  const { min, max } = bboxOf(tris)
  const tx = -(min[0] + max[0]) / 2
  const ty = -(min[1] + max[1]) / 2
  const tz = -min[2]
  const out = new Float64Array(tris.length)
  for (let i = 0; i < tris.length; i += 3) {
    out[i] = tris[i] + tx
    out[i + 1] = tris[i + 1] + ty
    out[i + 2] = tris[i + 2] + tz
  }
  return out
}

/** rotate k × 90° around Z: (x, y) → (−y, x) per step */
function rotateZ90(tris, k) {
  if (k % 4 === 0) return tris
  const out = new Float64Array(tris.length)
  for (let i = 0; i < tris.length; i += 3) {
    let x = tris[i]
    let y = tris[i + 1]
    for (let s = 0; s < k % 4; s++) {
      const nx = -y
      y = x
      x = nx
    }
    out[i] = x
    out[i + 1] = y
    out[i + 2] = tris[i + 2]
  }
  return out
}

/** exact signed mesh volume (divergence theorem) — diagnostic, voxels do the scoring */
export function meshVolume(tris) {
  let six = 0
  for (let i = 0; i < tris.length; i += 9) {
    const [x0, y0, z0, x1, y1, z1, x2, y2, z2] = tris.subarray(i, i + 9)
    six += x0 * (y1 * z2 - z1 * y2) - y0 * (x1 * z2 - z1 * x2) + z0 * (x1 * y2 - y1 * x2)
  }
  return Math.abs(six / 6)
}

/* ── voxelization: one +Z ray per column, even-odd fill between crossings ── */

function makeGrid(bboxA, bboxB) {
  const min = bboxA.min.map((v, i) => Math.min(v, bboxB.min[i]))
  const max = bboxA.max.map((v, i) => Math.max(v, bboxB.max[i]))
  const maxDim = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2])
  const pitch = Math.max(MIN_PITCH, maxDim / RESOLUTION)
  // pad one voxel; nudge the origin so sample columns never align exactly with
  // mesh edges/vertices (which would double- or zero-count crossings)
  const jitter = pitch * 0.0137
  const ox = min[0] - pitch + jitter
  const oy = min[1] - pitch + jitter * 1.31
  const oz = min[2] - pitch
  return {
    ox,
    oy,
    oz,
    pitch,
    nx: Math.ceil((max[0] - ox) / pitch) + 1,
    ny: Math.ceil((max[1] - oy) / pitch) + 1,
    nz: Math.ceil((max[2] - oz) / pitch) + 1,
  }
}

function voxelize(tris, grid) {
  const { ox, oy, oz, pitch, nx, ny, nz } = grid
  const crossings = new Array(nx * ny).fill(null)

  for (let t = 0; t < tris.length; t += 9) {
    const x0 = tris[t], y0 = tris[t + 1], z0 = tris[t + 2]
    const x1 = tris[t + 3], y1 = tris[t + 4], z1 = tris[t + 5]
    const x2 = tris[t + 6], y2 = tris[t + 7], z2 = tris[t + 8]
    const det = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
    if (Math.abs(det) < 1e-9) continue // vertical face — no XY-projected area

    const ix0 = Math.max(0, Math.floor((Math.min(x0, x1, x2) - ox) / pitch - 0.5))
    const ix1 = Math.min(nx - 1, Math.ceil((Math.max(x0, x1, x2) - ox) / pitch - 0.5))
    const iy0 = Math.max(0, Math.floor((Math.min(y0, y1, y2) - oy) / pitch - 0.5))
    const iy1 = Math.min(ny - 1, Math.ceil((Math.max(y0, y1, y2) - oy) / pitch - 0.5))

    for (let iy = iy0; iy <= iy1; iy++) {
      const py = oy + (iy + 0.5) * pitch
      for (let ix = ix0; ix <= ix1; ix++) {
        const px = ox + (ix + 0.5) * pitch
        const w0 = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) / det
        if (w0 < -1e-9) continue
        const w1 = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) / det
        if (w1 < -1e-9 || w0 + w1 > 1 + 1e-9) continue
        const z = w0 * z0 + w1 * z1 + (1 - w0 - w1) * z2
        const col = iy * nx + ix
        ;(crossings[col] ??= []).push(z)
      }
    }
  }

  const vox = new Uint8Array(nx * ny * nz)
  let filled = 0
  let suspect = 0
  for (let col = 0; col < crossings.length; col++) {
    const zs = crossings[col]
    if (!zs) continue
    zs.sort((a, b) => a - b)
    // collapse coincident hits (shared edges/vertices report once per triangle)
    const uniq = []
    for (const z of zs) {
      if (uniq.length === 0 || z - uniq[uniq.length - 1] > 1e-6) uniq.push(z)
    }
    if (uniq.length % 2 !== 0) {
      suspect++
      uniq.pop()
    }
    for (let p = 0; p < uniq.length; p += 2) {
      const izStart = Math.max(0, Math.ceil((uniq[p] - oz) / pitch - 0.5))
      const izEnd = Math.min(nz - 1, Math.floor((uniq[p + 1] - oz) / pitch - 0.5))
      for (let iz = izStart; iz <= izEnd; iz++) {
        const idx = col * nz + iz
        if (!vox[idx]) {
          vox[idx] = 1
          filled++
        }
      }
    }
  }
  return { vox, filled, suspect }
}

/* ── comparison ── */

const r3 = (n) => Math.round(n * 1000) / 1000

/**
 * Compare two triangle meshes. Returns the best-scoring Z-rotation of the
 * candidate: { iou, dice, precision, recall, volumeRatio, rotationDeg, … }.
 * precision = how much of the candidate lies inside the gold;
 * recall    = how much of the gold the candidate covers.
 */
export function compareTriangles(goldTris, candTris) {
  if (goldTris.length === 0 || candTris.length === 0) return { error: 'empty mesh' }
  const gold = normalize(goldTris)
  const goldBBox = bboxOf(gold)
  const goldVolume = meshVolume(gold)
  const candVolume = meshVolume(candTris)

  let best = null
  for (let k = 0; k < 4; k++) {
    const cand = normalize(rotateZ90(candTris, k))
    const grid = makeGrid(goldBBox, bboxOf(cand))
    const a = voxelize(gold, grid)
    const b = voxelize(cand, grid)
    let inter = 0
    for (let i = 0; i < a.vox.length; i++) inter += a.vox[i] & b.vox[i]
    const union = a.filled + b.filled - inter
    const iou = union > 0 ? inter / union : 0
    if (!best || iou > best.iou) {
      best = {
        iou: r3(iou),
        dice: r3(a.filled + b.filled > 0 ? (2 * inter) / (a.filled + b.filled) : 0),
        precision: r3(b.filled > 0 ? inter / b.filled : 0),
        recall: r3(a.filled > 0 ? inter / a.filled : 0),
        volumeRatio: r3(goldVolume > 0 ? candVolume / goldVolume : 0),
        rotationDeg: k * 90,
        pitch: r3(grid.pitch),
        suspectColumns: a.suspect + b.suspect,
      }
    }
  }
  return best
}

/* ── gold-reference scoring for the bench ── */

const goldCache = new Map()

export function goldExistsFor(taskId) {
  return fs.existsSync(path.join(ROOT, 'gold', `${taskId}.scad`))
}

async function goldTrisFor(taskId) {
  if (goldCache.has(taskId)) return goldCache.get(taskId)
  const file = path.join(ROOT, 'gold', `${taskId}.scad`)
  const stl = await compileScad(fs.readFileSync(file, 'utf8'))
  if (!stl) throw new Error(`gold reference ${taskId} failed to compile — fix bench/gold/${taskId}.scad`)
  const tris = parseStl(stl)
  goldCache.set(taskId, tris)
  return tris
}

/** Score a candidate STL against the task's gold reference; null if the task has none. */
export async function scoreAgainstGold(taskId, candStlBytes) {
  if (!goldExistsFor(taskId)) return null
  const goldTris = await goldTrisFor(taskId)
  return compareTriangles(goldTris, parseStl(candStlBytes))
}

/* ── CLI: compare any two .scad/.stl files ── */

async function loadTris(file) {
  if (file.endsWith('.scad')) {
    const stl = await compileScad(fs.readFileSync(file, 'utf8'))
    if (!stl) throw new Error(`${file}: OpenSCAD produced no geometry`)
    return parseStl(stl)
  }
  return parseStl(fs.readFileSync(file))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [goldFile, candFile] = process.argv.slice(2)
  if (!goldFile || !candFile) {
    console.error('usage: node bench/compare.mjs <gold.scad|.stl> <candidate.scad|.stl>')
    process.exit(1)
  }
  const result = compareTriangles(await loadTris(goldFile), await loadTris(candFile))
  console.log(JSON.stringify(result, null, 2))
}

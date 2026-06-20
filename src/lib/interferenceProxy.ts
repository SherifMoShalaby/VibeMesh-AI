/**
 * Runtime interference proxy (C1) — the browser-native twin of bench/interference.mjs.
 *
 * A kit can COMPILE to a manifold solid yet be physically broken: a bore/pocket guts the very
 * feature that makes it work (an axle bore drilled through the clutch tubes, a weight pocket
 * opened into a bearing seat). voxel-IoU, bbox, dimScore and the buildability keyword checks are
 * all blind to it — the damage is fused into one per-part solid. This catches it.
 *
 * A program opts in via the hidden probe contract the system prompt already mandates:
 *     _debug = "off"; // [off, positives, negatives]
 * `positives` renders ONLY the protected internal structure, `negatives` ONLY the cutters as
 * solids, in the SAME coordinate frame. We render both, voxelize on a shared grid, and measure
 * the overlap volume (mm³): ~0 = deconflicted; tens of mm³ = a real slice.
 *
 * The bench's voxelizer (bench/compare.mjs) is Node-only (node:fs + a direct callMain), so this
 * RE-implements the identical algorithm against the in-browser openscad worker. The signal is
 * REFERENCE-FREE — no gold model is needed — so unlike voxel-IoU it is safe to drive the live
 * auto-fix loop. Constants mirror the bench so the runtime verdict matches the offline ratchet.
 *
 * The openscad client is imported DYNAMICALLY inside interferenceVol so the pure voxel maths stays
 * importable (and unit-testable) without pulling the wasm worker into a node test runner.
 */
import type { ComputeBudget } from './openscad/budget'

// voxel grid — mirror bench/compare.mjs
const RESOLUTION = 192
const MIN_PITCH = 0.2
// overlap below this (mm³) is voxel-quantization noise → treated as clean — mirror bench/interference.mjs
export const INTERFERENCE_OK_MM3 = 2.0
const INTERFERENCE_FAIL_SPAN_MM3 = 25.0
// probe renders are small (just the tubes, or just the cutters), so keep the watchdog tight: the
// loop stays responsive and two stacked probes can't approach the worker's budget.
const PROBE_TIMEOUT_MS = 30_000

/** Does this program expose the probe contract? (kits / structured parts; plain solids won't.) */
export function hasDebugContract(code: string): boolean {
  return (
    /_debug\s*=\s*"off"/.test(code) &&
    /_debug\s*==\s*"positives"/.test(code) &&
    /_debug\s*==\s*"negatives"/.test(code)
  )
}

/**
 * Patch the `_debug` Customizer default in source (the probe render takes no -D). Anchored to a
 * real line-start assignment via the `m` flag, so a `// _debug = "x"` comment line can never be
 * patched in place of the actual parameter. Returns null if there is no such assignment.
 */
export function setDebugVariant(code: string, val: 'positives' | 'negatives'): string | null {
  const re = /^(\s*_debug\s*=\s*)"[^"]*"/m
  return re.test(code) ? code.replace(re, `$1"${val}"`) : null
}

/** Flat [x,y,z]×3-per-triangle vertex array from a binary STL (raw DataView, no three.js). */
function readTriangles(buffer: ArrayBuffer): Float32Array | null {
  if (buffer.byteLength < 84) return null
  const view = new DataView(buffer)
  const count = view.getUint32(80, true)
  if (!count || buffer.byteLength < 84 + count * 50) return null
  const out = new Float32Array(count * 9)
  for (let i = 0; i < count; i++) {
    const base = 84 + i * 50 + 12 // skip the 12-byte facet normal
    for (let v = 0; v < 9; v++) out[i * 9 + v] = view.getFloat32(base + v * 4, true)
  }
  return out
}

function bboxOf(tris: Float32Array): { min: number[]; max: number[] } {
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

interface Grid {
  ox: number
  oy: number
  oz: number
  pitch: number
  nx: number
  ny: number
  nz: number
}

function makeGrid(a: { min: number[]; max: number[] }, b: { min: number[]; max: number[] }): Grid {
  const min = a.min.map((v, i) => Math.min(v, b.min[i]))
  const max = a.max.map((v, i) => Math.max(v, b.max[i]))
  const maxDim = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2])
  const pitch = Math.max(MIN_PITCH, maxDim / RESOLUTION)
  // pad one voxel; nudge the origin so sample columns never align exactly with mesh edges
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

/** Solid voxelization by XY-column z-parity ray casting — mirror bench/compare.mjs. */
function voxelize(tris: Float32Array, grid: Grid): Uint8Array {
  const { ox, oy, oz, pitch, nx, ny, nz } = grid
  const crossings: (number[] | null)[] = new Array(nx * ny).fill(null)

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
  for (let col = 0; col < crossings.length; col++) {
    const zs = crossings[col]
    if (!zs) continue
    zs.sort((p, q) => p - q)
    // collapse coincident hits (shared edges/vertices report once per triangle)
    const uniq: number[] = []
    for (const z of zs) if (uniq.length === 0 || z - uniq[uniq.length - 1] > 1e-6) uniq.push(z)
    if (uniq.length % 2 !== 0) uniq.pop() // odd crossing count → drop the unpaired hit
    for (let p = 0; p < uniq.length; p += 2) {
      const izStart = Math.max(0, Math.ceil((uniq[p] - oz) / pitch - 0.5))
      const izEnd = Math.min(nz - 1, Math.floor((uniq[p + 1] - oz) / pitch - 0.5))
      for (let iz = izStart; iz <= izEnd; iz++) vox[col * nz + iz] = 1
    }
  }
  return vox
}

/** Overlap volume (mm³) between two solids given their flat triangle arrays. Pure — unit-tested. */
export function voxelOverlapMm3(posTris: Float32Array, negTris: Float32Array): number {
  if (posTris.length === 0 || negTris.length === 0) return 0
  const grid = makeGrid(bboxOf(posTris), bboxOf(negTris))
  const a = voxelize(posTris, grid)
  const b = voxelize(negTris, grid)
  let inter = 0
  for (let i = 0; i < a.length; i++) inter += a[i] & b[i]
  return inter * grid.pitch ** 3
}

/** 1.0 = clean; decays to 0 as a cutter eats more protected structure. null = N/A. Mirror bench. */
export function interferenceScore(vol: number | null): number | null {
  if (vol == null) return null
  if (vol <= INTERFERENCE_OK_MM3) return 1
  return Math.round(Math.max(0, 1 - (vol - INTERFERENCE_OK_MM3) / INTERFERENCE_FAIL_SPAN_MM3) * 1000) / 1000
}

/**
 * Render the probe's positives + negatives in the browser and measure their overlap (mm³).
 * Returns null when there is nothing trustworthy to measure: no probe contract, a variant that
 * won't compile or was superseded by a newer render, an empty positives/negatives set (so a
 * mis-authored probe can never masquerade as a clean 0), or an exhausted per-generation budget.
 *
 * The two probe renders are BACKGROUND jobs (queued, never coalesced away by the user's live
 * render) and consult the shared ComputeBudget so the loop degrades gracefully under load.
 */
export async function interferenceVol(code: string, budget?: ComputeBudget): Promise<number | null> {
  if (!hasDebugContract(code)) return null
  const posCode = setDebugVariant(code, 'positives')
  const negCode = setDebugVariant(code, 'negatives')
  if (!posCode || !negCode) return null
  if (budget && !budget.canSpend()) return null
  const { openscad } = await import('./openscad/client')
  const posR = await openscad.compile(posCode, [], PROBE_TIMEOUT_MS, { background: true })
  budget?.spend()
  if (!posR.ok || !posR.stl) return null
  if (budget && !budget.canSpend()) return null
  const negR = await openscad.compile(negCode, [], PROBE_TIMEOUT_MS, { background: true })
  budget?.spend()
  if (!negR.ok || !negR.stl) return null
  const pos = readTriangles(posR.stl)
  const neg = readTriangles(negR.stl)
  if (!pos || !neg || pos.length === 0 || neg.length === 0) return null
  return voxelOverlapMm3(pos, neg)
}

/**
 * Reference-free interference issue for the live auto-fix loop: a one-line repair instruction when
 * a cutter slices protected structure, else null (clean, or nothing measurable). Drives the same
 * bounded MAX_AUTO_FIX turn as the structural / skill-validator checks — no gold reference needed.
 */
export async function interferenceIssue(code: string, budget?: ComputeBudget): Promise<string | null> {
  const vol = await interferenceVol(code, budget)
  if (vol == null || vol <= INTERFERENCE_OK_MM3) return null
  return (
    `A cutter slices a protected internal feature (~${Math.round(vol)} mm³ of overlap between the ` +
    `structure and the bores/pockets): the part compiles, but a bore, pocket, or slot guts a clutch ` +
    `tube, bearing seat, or boss. Re-route the cutters onto a clear corridor — separate columns from ` +
    `the protected features (e.g. cross-bores BETWEEN the tube lattice, not through it) — so every ` +
    `functional feature survives intact, then return the corrected complete program.`
  )
}

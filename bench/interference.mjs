/**
 * Interference / functional-integrity probe (geometric-consistency ratchet).
 *
 * A part can COMPILE to a manifold solid yet be physically illogical — a cutter
 * (bore/slot/pocket) gutting the very feature that makes the part work (an axle
 * bore drilled through the clutch tubes, a weight bore broken into a bearing
 * seat). voxel-IoU, bbox and buildability keyword checks are all blind to this:
 * the damage is baked into one fused per-part solid (see docs/GEOMETRIC-CONSISTENCY-DIAGNOSIS.md §3).
 *
 * The probe makes it measurable WITHOUT any API call. A part opts in by exposing
 * a hidden `_debug = "off"; // [off, positives, negatives]` enum that renders, in
 * the SAME coordinate frame:
 *   - positives → ONLY the protected internal structure (tubes/bosses/bearing
 *     walls) — never the pierced outer shell, or every legitimate hole false-fails;
 *   - negatives → ONLY the cutters, as solids (their swept volume).
 * We compile both, voxelize on a shared grid, and measure the overlap volume.
 * A deconflicted part has ~0 overlap; a slice shows tens of mm³.
 *
 * Deterministic (openscad-wasm, no live API) → tight tolerance, unlike the
 * live-API quality metrics. Reuses compare.mjs so there is one voxelizer.
 */
import { compileScad, parseStl, bboxOf, makeGrid, voxelize } from './compare.mjs'

/** overlap below this (mm³) is voxel-quantization noise, treated as clean. */
export const INTERFERENCE_OK_MM3 = 2.0
/** overlap this far past OK scores 0 — a real slice is tens of mm³. */
const INTERFERENCE_FAIL_SPAN_MM3 = 25.0

/** Does this program expose the probe contract? (kit/structured parts; solids won't.) */
export function hasDebugContract(code) {
  return (
    /_debug\s*=\s*"off"/.test(code) &&
    /_debug\s*==\s*"positives"/.test(code) &&
    /_debug\s*==\s*"negatives"/.test(code)
  )
}

/** Set a string-valued Customizer param's default in source (compileScad takes no -D). */
function setStringParam(code, name, val) {
  const re = new RegExp(`(\\b${name}\\s*=\\s*)"[^"]*"`)
  return re.test(code) ? code.replace(re, `$1"${val}"`) : null
}

async function trisFor(code, debugVal) {
  const variant = setStringParam(code, '_debug', debugVal)
  if (!variant) return null
  try {
    const stl = await compileScad(variant)
    return parseStl(stl)
  } catch {
    return null // a debug variant that won't compile is reported as such (vol=null), not 0
  }
}

/**
 * Overlap volume (mm³) between the protected structure and the cutters.
 * Returns null if the part has no probe contract or a variant failed to compile;
 * 0 (clean) if there is nothing to protect or no cutters.
 */
export async function interferenceVol(code) {
  if (!hasDebugContract(code)) return null
  const pos = await trisFor(code, 'positives')
  const neg = await trisFor(code, 'negatives')
  if (pos === null || neg === null) return null
  if (pos.length === 0 || neg.length === 0) return 0 // nothing to protect, or no cutters → clean
  const grid = makeGrid(bboxOf(pos), bboxOf(neg))
  const a = voxelize(pos, grid)
  const b = voxelize(neg, grid)
  let inter = 0
  for (let i = 0; i < a.vox.length; i++) inter += a.vox[i] & b.vox[i]
  return inter * grid.pitch ** 3
}

/** 1.0 = clean; decays to 0 as a cutter eats more protected structure. null = N/A. */
export function interferenceScore(vol) {
  if (vol == null) return null
  if (vol <= INTERFERENCE_OK_MM3) return 1
  return Math.round(Math.max(0, 1 - (vol - INTERFERENCE_OK_MM3) / INTERFERENCE_FAIL_SPAN_MM3) * 1000) / 1000
}

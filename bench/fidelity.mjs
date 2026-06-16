/**
 * Fidelity / functional metrics the voxel-IoU + buildability checks can't see —
 * built for the failures the diagnoses surfaced (docs/FIDELITY-DIAGNOSIS.md,
 * docs/GEOMETRIC-CONSISTENCY-DIAGNOSIS.md, docs/VIEWPORT-VIEWS-FEASIBILITY.md):
 *
 *   - asymmetryScore  — a generic symmetric cross self-matches under rotation, so
 *                       IoU-best-of-4 literally CANNOT tell 4 identical arms from 4
 *                       distinct ones. We measure self-similarity at n-fold Z rotation;
 *                       asymmetryScore = 1 - maxSelfSimilarity (HIGHER = more asymmetric).
 *   - moduleDistinctness — a spinner with one arm() looped 4× has few distinct modules;
 *                       four bespoke arms have many. Counts distinct instantiated modules.
 *   - assembledScore  — the "all" preview should read as the assembled object, not a
 *                       scattered layout. Derived in run.mjs from the all-bbox vs piece
 *                       sizes (scatterSpan); kept here as the scoring curve.
 *
 * All deterministic and dependency-free; they reuse compare.mjs's voxel grid.
 */
import { parseStl, normalize, bboxOf, makeGrid, voxelize } from './compare.mjs'

const r3 = (n) => Math.round(n * 1000) / 1000

/** rotate triangles by an arbitrary angle (degrees) around the Z axis (origin) */
function rotateZ(tris, deg) {
  const a = (deg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  const out = new Float64Array(tris.length)
  for (let i = 0; i < tris.length; i += 3) {
    const x = tris[i]
    const y = tris[i + 1]
    out[i] = x * c - y * s
    out[i + 1] = x * s + y * c
    out[i + 2] = tris[i + 2]
  }
  return out
}

function selfIoU(baseTris, rotTris) {
  const grid = makeGrid(bboxOf(baseTris), bboxOf(rotTris))
  const a = voxelize(baseTris, grid)
  const b = voxelize(rotTris, grid)
  let inter = 0
  for (let i = 0; i < a.vox.length; i++) inter += a.vox[i] & b.vox[i]
  const union = a.filled + b.filled - inter
  return union > 0 ? inter / union : 0
}

/**
 * Rotational self-similarity at n-fold symmetry (n = 2..6). A part with n identical
 * arms self-matches near 1.0 when rotated 360/n; a genuinely asymmetric part matches
 * poorly at every n. Returns { maxSelfSimilarity, asymmetryScore, perN }.
 */
export function symmetryScore(stlBytes, ns = [2, 3, 4, 5, 6]) {
  const base = normalize(parseStl(stlBytes))
  const perN = {}
  let maxSim = 0
  for (const n of ns) {
    const rot = normalize(rotateZ(base, 360 / n))
    const sim = selfIoU(base, rot)
    perN[n] = r3(sim)
    if (sim > maxSim) maxSim = sim
  }
  return { maxSelfSimilarity: r3(maxSim), asymmetryScore: r3(1 - maxSim), perN }
}

/**
 * Count distinct modules that are DEFINED and actually INSTANTIATED (called by name
 * somewhere other than their own definition). A symmetric spinner that loops one
 * arm() scores low; four bespoke arm modules score high. Helper modules add a roughly
 * constant offset, so this is meaningful as a relative (gated) metric.
 */
export function moduleDistinctness(code) {
  const defined = new Set()
  // module defs always have a parameter list: `module name(...)` — match anywhere, not only line-start
  for (const m of code.matchAll(/\bmodule\s+([A-Za-z_]\w*)\s*\(/g)) defined.add(m[1])
  let count = 0
  for (const name of defined) {
    const calls = (code.match(new RegExp(`\\b${name}\\s*\\(`, 'g')) || []).length
    if (calls > 1) count++ // >1 because the definition itself contributes one match
  }
  return count
}

/**
 * assembledScore from scatterSpan = max(all-view bbox dim) / max(single-piece bbox dim).
 * Assembled previews are compact (~1-2); a scattered side-by-side layout blows up
 * (the reported bracket was 548mm for ~40mm pieces → ~13). HIGHER score = more assembled.
 */
export function assembledScore(scatterSpan) {
  if (typeof scatterSpan !== 'number' || !Number.isFinite(scatterSpan)) return null
  if (scatterSpan <= 2) return 1
  if (scatterSpan <= 4) return 0.5
  return 0
}

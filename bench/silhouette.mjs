/**
 * Silhouette-IoU — the placement/scale-normalized SHAPE signal the loop has been missing.
 *
 * The refine loop and best-of-N were render-/shape-BLIND: refineProxy keys on bbox vs stated
 * dimensions, and bestOfN's scoreCandidate has no shape term — so a faithful bishop and a featureless
 * spike with the same bounding box scored identically, and 7-10 refine passes could not converge a
 * silhouette. This computes the intersection-over-union of two models' rendered SILHOUETTES at a pose
 * (each framed to its own bbox by bench/render.mjs, so size and placement are normalized out): 1.0 =
 * the same outline, lower = a different one. It is the instrument that LOCKS IN the silhouette-trace
 * win — a regression that reverts a traced bishop back to a canonical spike drops the IoU vs the gold,
 * which a ratchet (or a future live best-of-N tiebreak) can catch.
 */
import { renderMasks } from './render.mjs'

/** IoU of two equal-length 0/1 masks. */
export function maskIoU(maskA, maskB) {
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
export function silhouetteIoU(stlA, stlB, pose = 'front') {
  const A = renderMasks(stlA)
  const B = renderMasks(stlB)
  return maskIoU(A[pose], B[pose])
}

/** Best silhouette-IoU across all poses — robust to a piece reading right from one angle but not another. */
export function silhouetteIoUMax(stlA, stlB) {
  const A = renderMasks(stlA)
  const B = renderMasks(stlB)
  let best = 0
  for (const pose of Object.keys(A)) {
    const v = maskIoU(A[pose], B[pose])
    if (v > best) best = v
  }
  return best
}

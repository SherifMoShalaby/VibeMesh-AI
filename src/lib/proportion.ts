/**
 * OC-10 — proportion-aware shape term for the live image score + refine discrepancy.
 *
 * The silhouette-IoU in silhouette.ts is SCALE-BLIND BY DESIGN (each model is framed to its own
 * bbox, then maxed over 4 poses × 8 photo orientations) — a bit-identical port of the bench, which
 * must NOT change (bench/silhouette-live.selftest.mjs). That makes it answer "same SHAPE?" but blind
 * to PROPORTION: a funnel whose flare is too steep, an hourglass that's really a straight taper, all
 * score a high IoU.
 *
 * This is a SEPARATE term (NOT a mutation of the IoU). It compares two 0/1 masks of the SAME SIZE on
 * three scale-shared, normalized properties of their foreground 2D bounding box:
 *   - ASPECT  — bbox width/height ratio (the dominant proportion error: a too-wide / too-tall form)
 *   - FILL    — foreground area / bbox area (a solid vs a sparse/spindly outline of the same envelope)
 *   - CENTROID— normalized centroid offset within the bbox (mass distribution: top-heavy vs bottom-heavy)
 *
 * Each is turned into a 0..1 similarity (1 = identical proportion) and averaged. It is intentionally
 * coarse and orientation-NAIVE (no dihedral search) — it is a TIEBREAK below the harder signals, not a
 * registration metric. Both masks are inputs framed to their own pose; this reads "do their 2D
 * proportions agree?", which is exactly what the scale-blind IoU cannot see.
 *
 * Pure + deterministic. No three.js, no WASM, no opencv. refMask is a bare Uint8Array (audit Q10), so
 * its 2D bbox is derived here from the flat y*SIZE+x layout that silhouette.ts / refSegment.ts use.
 */

/** Mask side length — MUST match silhouette.ts SIZE so a refMask and a pose mask are comparable. */
const SIZE = 256

/** Foreground 2D bbox + area + centroid of a flat (y*SIZE+x) 0/1 mask. Null when empty/unusable. */
export interface MaskExtent {
  /** bbox width / height in cells (≥1) */
  w: number
  h: number
  /** lit (foreground) cell count */
  area: number
  /** centroid in [0,1] relative to the bbox (0 = bbox min edge, 1 = bbox max edge) */
  cx: number
  cy: number
}

/** Derive the foreground 2D bbox extent of a bare mask (the refMask is a bare Uint8Array — Q10). */
export function maskExtent(mask: Uint8Array | null | undefined, size = SIZE): MaskExtent | null {
  if (!mask || mask.length !== size * size) return null
  let minX = size
  let minY = size
  let maxX = -1
  let maxY = -1
  let area = 0
  let sumX = 0
  let sumY = 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!mask[y * size + x]) continue
      area++
      sumX += x
      sumY += y
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (area === 0 || maxX < minX) return null
  const w = maxX - minX + 1
  const h = maxY - minY + 1
  // centroid relative to the bbox span (guard the 1-cell-span degenerate → 0.5, the bbox center)
  const cx = w > 1 ? (sumX / area - minX) / (w - 1) : 0.5
  const cy = h > 1 ? (sumY / area - minY) / (h - 1) : 0.5
  return { w, h, area, cx, cy }
}

/** 0..1 similarity of two positive ratios (1 = identical, → 0 as they diverge). min/max is symmetric
 *  and scale-shared, so a 2:1 vs 1:1 aspect scores 0.5 regardless of absolute size. */
function ratioSim(a: number, b: number): number {
  if (!(a > 0) || !(b > 0)) return 0
  return Math.min(a, b) / Math.max(a, b)
}

/**
 * Proportion similarity (0..1, 1 = identical proportions) of two equal-size masks. Compares aspect,
 * fill fraction, and centroid placement — all scale-shared / normalized, so it sees a proportion error
 * the scale-blind IoU cannot. Returns 0 when either mask is empty/unusable (a TOTAL no-op for the
 * caller, exactly like a missing reference). Pure + deterministic.
 */
export function proportionMatch(
  maskA: Uint8Array | null | undefined,
  maskB: Uint8Array | null | undefined,
  size = SIZE,
): number {
  const a = maskExtent(maskA, size)
  const b = maskExtent(maskB, size)
  if (!a || !b) return 0
  const aspectSim = ratioSim(a.w / a.h, b.w / b.h)
  const fillSim = ratioSim(a.area / (a.w * a.h), b.area / (b.w * b.h))
  // centroid: 1 minus the normalized offset distance (each axis already in [0,1]); clamp to ≥0.
  const centroidSim = Math.max(0, 1 - Math.hypot(a.cx - b.cx, a.cy - b.cy))
  return (aspectSim + fillSim + centroidSim) / 3
}

/**
 * Best proportion match of a candidate's pose masks against a reference photo mask — the proportion
 * analogue of refSegment.bestRefIoU, but WITHOUT the dihedral orientation search (proportion is an
 * axis-shared property; rotating a mask 90° would falsely "fix" an aspect error). For each candidate
 * pose, the reference is taken as-is plus its h-flip (mirror leaves aspect/fill unchanged but corrects
 * a left/right centroid), and the max proportionMatch over pose × {ref, mirror} is returned.
 * @param candidateMasks renderMasks(stl) output (pose → 256×256 0/1 mask). {} → 0.
 * @param refMask the segmented photo mask (256×256 0/1). Falsy / wrong-length → 0.
 */
export function bestProportionMatch(
  candidateMasks: Record<string, Uint8Array>,
  refMask: Uint8Array | null | undefined,
  size = SIZE,
): number {
  if (!refMask || refMask.length !== size * size) return 0
  const refMirror = hflip(refMask, size)
  let best = 0
  for (const pose of Object.keys(candidateMasks)) {
    const pm = candidateMasks[pose]
    if (!pm) continue
    for (const ref of [refMask, refMirror]) {
      const v = proportionMatch(pm, ref, size)
      if (v > best) best = v
    }
  }
  return best
}

/** Horizontal mirror of a flat (y*size+x) mask — aspect/fill invariant, centroid-X mirrored. */
function hflip(m: Uint8Array, size = SIZE): Uint8Array {
  const o = new Uint8Array(m.length)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) o[y * size + x] = m[y * size + (size - 1 - x)]
  return o
}

/**
 * Verifier-guided best-of-N selection (A2) — REFERENCE-FREE scoring only.
 *
 * For ambiguous / kit / image requests, the model is non-deterministic: one sample compiles, the
 * next doesn't (the bench shows exactly this on kits). Best-of-N fans out N independent generations
 * and adopts the one that scores best on signals that need NO gold reference — so, unlike voxel-IoU
 * (which has no runtime gold), this is safe to run live. The signals, in priority order:
 *   1. has exactly one scad block            (a usable program at all)
 *   2. compiles to non-empty geometry        (the dominant signal — a part that renders beats one that doesn't)
 *   3. not degenerate                         (not tiny / NaN / off-bed)
 *   4. fewer structural/assembly issues       (structuralReport)
 *   5. fewer dimension-vs-stated mismatches   (when the prompt stated dimensions)
 *
 * The score is lexicographic: a compiling candidate ALWAYS beats a non-compiling one, and a clean
 * one always beats a degenerate one, before the softer issue counts ever matter — so the selector
 * can never prefer "compiles-but-wrong" over "clean".
 */

export interface CandidateSignals {
  /** exactly one ```scad block was extracted */
  hasScad: boolean
  /** a compile was actually run for this candidate. False when the shared compute budget was
   *  exhausted before reaching it — an ENVIRONMENTAL miss, not a fault, so it must not be scored
   *  as a non-compile (that would bias selection toward whichever candidates compiled first). */
  compileAttempted: boolean
  /** compiled to non-empty geometry (only meaningful when compileAttempted) */
  compiled: boolean
  /** degenerateReason fired (tiny / NaN / over-bed) — only meaningful when compiled */
  degenerate: boolean
  /** structuralReport().issues.length */
  structuralIssues: number
  /** dimension-vs-stated discrepancy count (0 when the prompt stated no dimensions) */
  dimMismatches: number
  /** mesh volume / bbox volume for the compiled candidate (a SELF-RELATIVE solidity signal —
   *  undefined when the candidate didn't compile / wasn't measured). A vanishingly low ratio is a
   *  thin shell / sliver that reads as the right SIZE but isn't a solid body. Used ONLY as a
   *  below-everything tiebreak, so it can never reorder candidates that differ on a harder signal. */
  fillRatio?: number
  /** REFERENCE-grounded silhouette-IoU (0..1) of this candidate's rendered outline against the
   *  attached reference PHOTO's segmented mask — max over 4 poses × 8 photo orientations (Phase 2).
   *  Undefined when there's no reference photo, segmentation failed/was low-confidence, or the
   *  candidate didn't compile. Applied as a SOFT tiebreak below dimMismatches and above the hollow
   *  tiebreak, so a registration miss can never cross a harder signal — only break a true tie toward
   *  the candidate whose outline matches the user's photo. */
  shapeMatch?: number
}

/** Default fan-out. Kept small: each candidate is a paid generation + a compile through one worker. */
export const BEST_OF_N_COUNT = 3

/** Solidity tiebreak ceiling. Strictly LESS than one `dimMismatches` (100) so the shape tiebreak can
 *  NEVER cross a harder signal — it only resolves ties the scorer above leaves arbitrary. */
const TIEBREAK_MAX = 50
/** Below this fill (mesh-volume / bbox-volume) a compiled part is suspiciously hollow/thin for its
 *  envelope; the penalty ramps from 0 at this threshold to TIEBREAK_MAX as fill → 0. Conservative on
 *  purpose — legitimately hollow forms (rings, frames, walled enclosures) sit above it. */
const PLAUSIBLE_FILL = 0.1

/** Graded, capped penalty for an implausibly hollow compiled candidate. 0 when fill is fine or the
 *  signal is absent (so a non-best-of-N / non-compiling candidate is never touched). */
function hollowPenalty(fillRatio: number | undefined): number {
  if (fillRatio === undefined || !Number.isFinite(fillRatio) || fillRatio <= 0) return 0
  if (fillRatio >= PLAUSIBLE_FILL) return 0
  return TIEBREAK_MAX * (1 - fillRatio / PLAUSIBLE_FILL)
}

/** Reference-free candidate score. Higher is better. Compile + degenerate dominate the issue counts. */
export function scoreCandidate(s: CandidateSignals): number {
  if (!s.hasScad) return -1_000_000 // no program at all — always last
  // Budget ran out before this candidate could be compiled: UNKNOWN, not a failure. Give it the
  // benefit of the doubt — above a confirmed non-compile / degenerate, below a confirmed clean
  // compile — and score only the softer signals we did compute. Without this, a budget-starved
  // (but possibly compilable) later candidate would be demoted below whoever compiled first.
  if (s.compileAttempted && !s.compiled) {
    // confirmed non-compile (a real fault) — scored on the softer signals from a 0 base
    return 0 - s.structuralIssues * 1_000 - s.dimMismatches * 100
  }
  if (!s.compileAttempted) {
    return 750_000 - s.structuralIssues * 1_000 - s.dimMismatches * 100
  }
  let score = 1_000_000 // compiled — dominates every softer signal
  score += s.degenerate ? -500_000 : 0 // a compiling-but-degenerate part is far worse than a clean one
  score -= s.structuralIssues * 1_000 // then: fewer assembly/structural faults
  score -= s.dimMismatches * 100 // then: closer to the stated dimensions
  // SOFT tiebreak tier — below dimMismatches and bounded so the soft signals can NEVER cross a harder
  // tier, even when BOTH fire. shapeMatch (reference-photo outline match) is weighted ABOVE the
  // self-relative hollow heuristic (a measured match against the user's photo beats a solidity guess),
  // but the COMBINED soft penalty is CLAMPED < 100 (one dimMismatch) so two tiebreaks together can't
  // reorder a harder signal. With no reference, shapeMatch is undefined → shapePenalty 0 → the clamp is
  // inert (hollow ≤ TIEBREAK_MAX=50) → the score is byte-identical to the reference-free path.
  const shapePenalty = s.shapeMatch !== undefined ? (1 - s.shapeMatch) * 75 : 0
  score -= Math.min(shapePenalty + hollowPenalty(s.fillRatio), 95)
  return score
}

/** Index of the best-scoring candidate. Ties keep the EARLIEST (strict >), so a no-better fan-out
 *  is a no-op that adopts the first candidate. */
export function pickBestIndex(scores: number[]): number {
  let best = 0
  for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i
  return best
}

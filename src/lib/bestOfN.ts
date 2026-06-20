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
}

/** Default fan-out. Kept small: each candidate is a paid generation + a compile through one worker. */
export const BEST_OF_N_COUNT = 3

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
  return score
}

/** Index of the best-scoring candidate. Ties keep the EARLIEST (strict >), so a no-better fan-out
 *  is a no-op that adopts the first candidate. */
export function pickBestIndex(scores: number[]): number {
  let best = 0
  for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i
  return best
}

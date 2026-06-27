/**
 * OC-12 — per-piece reference-IoU for image KITS, and worst-piece selection.
 *
 * OC-2's reference-IoU oracle scores the ASSEMBLED render against the user's photo — whole-render
 * only. For a kit (a `part` enum whose first option is 'all'), a single piece (the classic example:
 * the i2 knight reading as a featureless block) can be wrong while the rest of the set is fine; the
 * assembled IoU averages that away.
 *
 * This module is the PURE selection half: given a per-piece score map (each piece's best silhouette-IoU
 * against the reference mask, computed by the caller via renderMasks + bestRefIoU on each part's STL),
 * pick the WORST piece below a floor so the caller can queue a targeted refine citing it. Keeping the
 * selection pure makes it unit-testable without the WASM compiler.
 *
 * The whole-render single-part path (OC-2) NEVER calls this — it is gated on isMultiPart at the call
 * site, so a single part is byte-identical to today.
 */

export interface PieceScore {
  /** the part-enum option name (e.g. 'knight', 'lid') — never 'all' */
  piece: string
  /** best silhouette-IoU of this piece's render against the reference mask (0..1), or undefined when
   *  it couldn't be measured (compile miss / no mask / budget) — excluded from worst-piece selection. */
  iou: number | undefined
}

/**
 * The WORST measured piece below `floor`, or null when every measured piece is at/above the floor (no
 * targeted refine needed) or nothing was measured. Ties keep the FIRST (stable, deterministic) so the
 * choice doesn't flap between equal-scoring pieces. Pure + deterministic.
 */
export function worstPiece(scores: PieceScore[], floor = 0.55): { piece: string; iou: number } | null {
  let worst: { piece: string; iou: number } | null = null
  for (const s of scores) {
    if (s.iou === undefined || !Number.isFinite(s.iou)) continue
    if (s.iou >= floor) continue
    if (worst === null || s.iou < worst.iou) worst = { piece: s.piece, iou: s.iou }
  }
  return worst
}

/**
 * The targeted-refine discrepancy string for the worst piece — names the piece + its measured overlap
 * and asks the model to fix THAT piece's signature features (the rest of the set is fine). Pure.
 * `signatureHint` is an optional advisory feature name (e.g. from OC-6's vision judge) to call out.
 */
export function worstPieceDiscrepancy(piece: string, iou: number, floor = 0.55, signatureHint?: string): string {
  const featureClause = signatureHint
    ? `Its signature feature "${signatureHint}" appears to be missing or collapsed to a generic stand-in. `
    : ''
  return (
    `PER-PIECE VISUAL CHECK — in this kit, the "${piece}" piece is the worst match to your reference: ` +
    `an independent silhouette comparison scores only ${(iou * 100).toFixed(0)}% overlap (a faithful match is well above ${(floor * 100).toFixed(0)}%). ` +
    featureClause +
    `Reshape the "${piece}" piece so its outline and prominent features match the reference; leave the other pieces as they are. `
  )
}

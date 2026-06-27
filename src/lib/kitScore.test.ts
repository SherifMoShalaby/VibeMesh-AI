import { describe, it, expect } from 'vitest'
import { worstPiece, worstPieceDiscrepancy, type PieceScore } from './kitScore'

describe('worstPiece — OC-12 worst-piece selection', () => {
  it('picks the lowest-scoring piece below the floor', () => {
    const scores: PieceScore[] = [
      { piece: 'pawn', iou: 0.8 },
      { piece: 'knight', iou: 0.3 },
      { piece: 'rook', iou: 0.5 },
    ]
    expect(worstPiece(scores, 0.55)).toEqual({ piece: 'knight', iou: 0.3 })
  })

  it('returns null when every measured piece is at/above the floor (no targeted refine)', () => {
    const scores: PieceScore[] = [
      { piece: 'pawn', iou: 0.7 },
      { piece: 'knight', iou: 0.6 },
    ]
    expect(worstPiece(scores, 0.55)).toBeNull()
  })

  it('ignores unmeasured pieces (undefined / non-finite iou)', () => {
    const scores: PieceScore[] = [
      { piece: 'pawn', iou: undefined },
      { piece: 'knight', iou: NaN },
      { piece: 'rook', iou: 0.4 },
    ]
    expect(worstPiece(scores, 0.55)).toEqual({ piece: 'rook', iou: 0.4 })
  })

  it('returns null when nothing was measured at all', () => {
    const scores: PieceScore[] = [
      { piece: 'pawn', iou: undefined },
      { piece: 'knight', iou: undefined },
    ]
    expect(worstPiece(scores, 0.55)).toBeNull()
  })

  it('ties keep the FIRST (stable, no flapping between equal-scoring pieces)', () => {
    const scores: PieceScore[] = [
      { piece: 'a', iou: 0.2 },
      { piece: 'b', iou: 0.2 },
    ]
    expect(worstPiece(scores, 0.55)).toEqual({ piece: 'a', iou: 0.2 })
  })

  it('returns null on an empty score list', () => {
    expect(worstPiece([], 0.55)).toBeNull()
  })
})

describe('worstPieceDiscrepancy — piece-specific refine string', () => {
  it('names the piece and its measured overlap', () => {
    const s = worstPieceDiscrepancy('knight', 0.3, 0.55)
    expect(s).toContain('"knight"')
    expect(s).toContain('30%')
    expect(s).toContain('55%')
    expect(s).toContain('leave the other pieces as they are')
  })

  it('folds in an optional signature-feature hint (OC-6 advisory)', () => {
    const s = worstPieceDiscrepancy('knight', 0.3, 0.55, 'horse head')
    expect(s).toContain('horse head')
  })

  it('omits the feature clause when no hint is given', () => {
    const s = worstPieceDiscrepancy('knight', 0.3, 0.55)
    expect(s).not.toContain('signature feature')
  })
})

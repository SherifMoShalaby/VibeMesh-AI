import { describe, it, expect } from 'vitest'
import { maskExtent, proportionMatch, bestProportionMatch } from './proportion'

const SIZE = 256

/** Build a SIZE×SIZE 0/1 mask from a predicate on (x,y). */
function mk(pred: (x: number, y: number) => boolean): Uint8Array {
  const m = new Uint8Array(SIZE * SIZE)
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) m[y * SIZE + x] = pred(x, y) ? 1 : 0
  return m
}
/** A filled axis-aligned rectangle mask [x0,x1) × [y0,y1). */
const rect = (x0: number, x1: number, y0: number, y1: number) => mk((x, y) => x >= x0 && x < x1 && y >= y0 && y < y1)

describe('maskExtent', () => {
  it('derives the 2D bbox, area and centroid of a bare mask (audit Q10)', () => {
    const m = rect(50, 100, 60, 120) // 50 wide, 60 tall, centered in its own bbox
    const e = maskExtent(m)!
    expect(e.w).toBe(50)
    expect(e.h).toBe(60)
    expect(e.area).toBe(50 * 60)
    expect(e.cx).toBeCloseTo(0.5, 6)
    expect(e.cy).toBeCloseTo(0.5, 6)
  })
  it('returns null for an empty / wrong-length mask (total no-op upstream)', () => {
    expect(maskExtent(new Uint8Array(SIZE * SIZE))).toBeNull()
    expect(maskExtent(null)).toBeNull()
    expect(maskExtent(new Uint8Array(10))).toBeNull()
  })
})

describe('proportionMatch — scale-shared, sees what the scale-blind IoU cannot', () => {
  it('is SCALE-invariant: the same shape at two sizes scores ~1', () => {
    const small = rect(100, 140, 100, 180) // aspect 40:80 = 1:2
    const big = rect(40, 120, 40, 200) // aspect 80:160 = 1:2 (twice the size, same proportions)
    expect(proportionMatch(small, big)).toBeGreaterThan(0.99)
  })

  it('a wrong-PROPORTION mask scores below a correct-proportion one (aspect)', () => {
    const reference = rect(100, 140, 60, 180) // tall: aspect 40:120 = 1:3
    const correct = rect(80, 160, 30, 210) // same 1:3 aspect, bigger
    const wrong = rect(60, 200, 100, 160) // squat: aspect 140:60 ≈ 2.3:1
    expect(proportionMatch(reference, correct)).toBeGreaterThan(proportionMatch(reference, wrong))
  })

  it('catches a fill (solid vs sparse) difference at the same bbox', () => {
    const solid = rect(80, 176, 80, 176) // fully filled square
    const sparse = mk((x, y) => (x === 80 || x === 175 || y === 80 || y === 175) && x >= 80 && x <= 175 && y >= 80 && y <= 175) // hollow outline, same bbox
    expect(proportionMatch(solid, solid)).toBeCloseTo(1, 6)
    expect(proportionMatch(solid, sparse)).toBeLessThan(1)
  })

  it('returns 0 for an empty/unusable mask (a total no-op, like a missing reference)', () => {
    const m = rect(80, 176, 80, 176)
    expect(proportionMatch(m, null)).toBe(0)
    expect(proportionMatch(m, new Uint8Array(SIZE * SIZE))).toBe(0)
  })
})

describe('bestProportionMatch — candidate pose masks vs a reference photo mask', () => {
  const square = rect(96, 160, 96, 160)
  const candidate = { iso: square, front: square, top: square, right: square }

  it('a candidate matching the reference proportion scores ~1', () => {
    const refSameProp = rect(60, 196, 60, 196) // same 1:1 aspect, bigger
    expect(bestProportionMatch(candidate, refSameProp)).toBeGreaterThan(0.99)
  })

  it('OC-10 acceptance: correct-shape WRONG-proportion candidate scores below a correct-proportion one', () => {
    // Reference is a tall 1:3 form.
    const refTall = rect(110, 146, 40, 216) // 36 wide × 176 tall ≈ 1:5 → tall
    const tallCand = { front: rect(100, 130, 40, 200) } // ~1:5 tall — right proportions
    const squatCand = { front: rect(40, 220, 100, 150) } // 180 × 50 — squat, WRONG proportions
    const tallScore = bestProportionMatch(tallCand, refTall)
    const squatScore = bestProportionMatch(squatCand, refTall)
    expect(tallScore).toBeGreaterThan(squatScore)
  })

  it('returns 0 (no-op) for a null reference or empty candidate masks', () => {
    expect(bestProportionMatch(candidate, null)).toBe(0)
    expect(bestProportionMatch({}, square)).toBe(0)
  })
})

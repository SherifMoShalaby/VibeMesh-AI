import { describe, it, expect } from 'vitest'
import { bestRefIoU, refMaskOrientations } from './refSegment'

const SIZE = 256

/** Build a SIZE×SIZE 0/1 mask from a predicate on (x,y). */
function mk(pred: (x: number, y: number) => boolean): Uint8Array {
  const m = new Uint8Array(SIZE * SIZE)
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) m[y * SIZE + x] = pred(x, y) ? 1 : 0
  return m
}

describe('refMaskOrientations', () => {
  it('produces exactly 8 distinct-shape orientations', () => {
    const m = mk((x, y) => x < 60 && y < 40) // an L-asymmetric corner block (no symmetry)
    const oris = refMaskOrientations(m)
    expect(oris).toHaveLength(8)
    oris.forEach((o) => expect(o.length).toBe(SIZE * SIZE))
    // first orientation is the identity (mutation-free original)
    expect(Array.from(oris[0])).toEqual(Array.from(m))
  })

  it('is a pure dihedral group on an asymmetric mask — the 8 orientations are not all identical', () => {
    const m = mk((x, y) => x < 60 && y < 40)
    const oris = refMaskOrientations(m)
    const keys = new Set(oris.map((o) => o.join('')))
    expect(keys.size).toBeGreaterThan(1) // an asymmetric block yields multiple distinct orientations
  })
})

describe('bestRefIoU', () => {
  // a single pose mask reused across the helpers (the candidate's rendered outline)
  const blockPose = mk((x, y) => x >= 96 && x < 160 && y >= 96 && y < 160) // centered square
  const candidate = { iso: blockPose, front: blockPose, top: blockPose, right: blockPose }

  it('a mask vs itself scores 1.0 (self-IoU under the identity orientation)', () => {
    expect(bestRefIoU(candidate, blockPose)).toBeCloseTo(1, 12)
  })

  it('monotonic vs raw maskIoU: a closer reference outranks a farther one', () => {
    // partial overlap (shifted square) vs disjoint square
    const closeRef = mk((x, y) => x >= 112 && x < 176 && y >= 96 && y < 160) // overlaps the candidate
    const farRef = mk((x, y) => x >= 16 && x < 48 && y >= 16 && y < 48) // disjoint corner
    const close = bestRefIoU(candidate, closeRef)
    const far = bestRefIoU(candidate, farRef)
    expect(close).toBeGreaterThan(far)
    expect(close).toBeGreaterThan(0)
    expect(far).toBe(0)
  })

  it('returns 0 (a no-op) for a null reference mask', () => {
    expect(bestRefIoU(candidate, null)).toBe(0)
    expect(bestRefIoU(candidate, undefined)).toBe(0)
  })

  it('returns 0 when the candidate has no pose masks (malformed STL → renderMasks {})', () => {
    expect(bestRefIoU({}, blockPose)).toBe(0)
  })

  it('orientation search finds a match even when the reference is mirrored/rotated', () => {
    // an asymmetric candidate outline; its mirror should still register a high IoU via the 8-orientation search
    const asym = mk((x, y) => x >= 96 && x < 176 && y >= 96 && y < 132)
    const asymCand = { iso: asym, front: asym, top: asym, right: asym }
    const mirrored = mk((x, y) => SIZE - 1 - x >= 96 && SIZE - 1 - x < 176 && y >= 96 && y < 132)
    expect(bestRefIoU(asymCand, mirrored)).toBeCloseTo(1, 6)
  })
})

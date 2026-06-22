import { describe, it, expect } from 'vitest'
import { scoreCandidate, pickBestIndex, type CandidateSignals } from './bestOfN'

const sig = (o: Partial<CandidateSignals>): CandidateSignals => ({
  hasScad: true,
  compileAttempted: true,
  compiled: true,
  degenerate: false,
  structuralIssues: 0,
  dimMismatches: 0,
  ...o,
})

describe('scoreCandidate — reference-free priority', () => {
  it('a compiling candidate always beats a non-compiling one', () => {
    const compiling = scoreCandidate(sig({ compiled: true, structuralIssues: 5 }))
    const notCompiling = scoreCandidate(sig({ compiled: false, structuralIssues: 0 }))
    expect(compiling).toBeGreaterThan(notCompiling)
  })

  it('a clean candidate beats a compiling-but-degenerate one regardless of issue counts', () => {
    const clean = scoreCandidate(sig({ degenerate: false, structuralIssues: 9 }))
    const degenerate = scoreCandidate(sig({ degenerate: true, structuralIssues: 0 }))
    expect(clean).toBeGreaterThan(degenerate)
  })

  it('among equally-clean candidates, fewer structural issues wins', () => {
    expect(scoreCandidate(sig({ structuralIssues: 1 }))).toBeGreaterThan(scoreCandidate(sig({ structuralIssues: 4 })))
  })

  it('dim mismatches break ties when structural issues are equal', () => {
    expect(scoreCandidate(sig({ dimMismatches: 0 }))).toBeGreaterThan(scoreCandidate(sig({ dimMismatches: 2 })))
  })

  it('a candidate with no scad block is always last', () => {
    const noScad = scoreCandidate(sig({ hasScad: false, compiled: false }))
    const worstReal = scoreCandidate(sig({ compiled: false, structuralIssues: 99 }))
    expect(noScad).toBeLessThan(worstReal)
  })

  it('a budget-starved (not-attempted) candidate beats a confirmed fail/degenerate but loses to a clean compile', () => {
    const notAttempted = scoreCandidate(sig({ compileAttempted: false, compiled: false }))
    const confirmedFail = scoreCandidate(sig({ compileAttempted: true, compiled: false }))
    const degenerate = scoreCandidate(sig({ compileAttempted: true, compiled: true, degenerate: true }))
    const clean = scoreCandidate(sig({ compileAttempted: true, compiled: true }))
    expect(notAttempted).toBeGreaterThan(confirmedFail) // an environmental miss is not a fault
    expect(notAttempted).toBeGreaterThan(degenerate) // and beats a known-bad render
    expect(notAttempted).toBeLessThan(clean) // but a confirmed clean compile is still preferred
  })
})

describe('scoreCandidate — hollow fill-ratio tiebreak (below every harder signal)', () => {
  it('breaks an otherwise-exact tie toward the more plausibly-solid candidate', () => {
    const solid = scoreCandidate(sig({ fillRatio: 0.4 }))
    const hollow = scoreCandidate(sig({ fillRatio: 0.02 }))
    expect(solid).toBeGreaterThan(hollow)
  })

  it('a plausibly-solid candidate (fill ≥ threshold) is scored identically to one with no fill signal', () => {
    expect(scoreCandidate(sig({ fillRatio: 0.5 }))).toBe(scoreCandidate(sig({ fillRatio: undefined })))
    // and an absent/degenerate fill signal is never penalized (non-best-of-N candidates untouched)
    expect(scoreCandidate(sig({ fillRatio: 0 }))).toBe(scoreCandidate(sig({ fillRatio: undefined })))
    expect(scoreCandidate(sig({ fillRatio: NaN }))).toBe(scoreCandidate(sig({ fillRatio: undefined })))
  })

  it('NEVER reorders a harder signal: even the hollowest candidate beats one with one more dim mismatch', () => {
    const hollowButCloser = scoreCandidate(sig({ fillRatio: 0.001, dimMismatches: 0 }))
    const solidButFarther = scoreCandidate(sig({ fillRatio: 0.9, dimMismatches: 1 }))
    expect(hollowButCloser).toBeGreaterThan(solidButFarther) // dimMismatch (100) dominates the ≤50 tiebreak
  })

  it('a hollow but compiling candidate still beats a non-compiling / degenerate one', () => {
    const hollowClean = scoreCandidate(sig({ compiled: true, degenerate: false, fillRatio: 0.001 }))
    expect(hollowClean).toBeGreaterThan(scoreCandidate(sig({ compiled: false })))
    expect(hollowClean).toBeGreaterThan(scoreCandidate(sig({ compiled: true, degenerate: true, fillRatio: 0.9 })))
  })

  it('the tiebreak is bounded under one dim mismatch (penalty magnitude < 100)', () => {
    const clean = scoreCandidate(sig({ fillRatio: 0.5 }))
    const hollowest = scoreCandidate(sig({ fillRatio: 1e-6 }))
    expect(clean - hollowest).toBeLessThan(100)
    expect(clean - hollowest).toBeGreaterThan(0)
  })
})

describe('pickBestIndex', () => {
  it('picks the highest score', () => {
    expect(pickBestIndex([1, 5, 3])).toBe(1)
  })
  it('ties keep the earliest candidate (no-better fan-out is a no-op)', () => {
    expect(pickBestIndex([10, 10, 10])).toBe(0)
  })
  it('picks the only compiling candidate out of three', () => {
    const scores = [
      scoreCandidate(sig({ compiled: false })),
      scoreCandidate(sig({ compiled: true, structuralIssues: 2 })),
      scoreCandidate(sig({ hasScad: false, compiled: false })),
    ]
    expect(pickBestIndex(scores)).toBe(1)
  })
})

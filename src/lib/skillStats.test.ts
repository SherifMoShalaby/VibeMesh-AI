import { describe, it, expect } from 'vitest'
import { recordUses, recordRemovals, skillHealth, quarantineSuggestions, flaggedSkillIds } from './skillStats'
import type { SkillStats } from './skillStats'

describe('recordUses / recordRemovals', () => {
  it('accumulates immutably', () => {
    const s0: SkillStats = {}
    const s1 = recordUses(s0, ['spur-gear', 'snap-fit'])
    expect(s0).toEqual({}) // original untouched
    expect(s1['spur-gear']).toEqual({ uses: 1, removals: 0 })
    const s2 = recordUses(s1, ['spur-gear'])
    expect(s2['spur-gear'].uses).toBe(2)
    const s3 = recordRemovals(s2, ['spur-gear'])
    expect(s3['spur-gear']).toEqual({ uses: 2, removals: 1 })
  })
  it('no-ops on an empty id list', () => {
    const s: SkillStats = { 'spur-gear': { uses: 1, removals: 0 } }
    expect(recordUses(s, [])).toBe(s)
    expect(recordRemovals(s, [])).toBe(s)
  })
})

describe('skillHealth', () => {
  it('is 1 for unused or never-removed skills, lower as removals climb', () => {
    expect(skillHealth({ uses: 0, removals: 0 })).toBe(1)
    expect(skillHealth({ uses: 4, removals: 0 })).toBe(1)
    expect(skillHealth({ uses: 4, removals: 2 })).toBe(0.5)
    expect(skillHealth({ uses: 4, removals: 4 })).toBe(0)
  })
})

describe('quarantineSuggestions', () => {
  it('flags only skills below threshold with enough uses', () => {
    const stats: SkillStats = {
      'spur-gear': { uses: 10, removals: 7 }, // health 0.3 < 0.6, uses ≥ 5 → flagged
      'snap-fit': { uses: 10, removals: 1 }, // healthy
      ratchet: { uses: 3, removals: 3 }, // unhealthy but too few uses → not flagged
    }
    const sug = quarantineSuggestions(stats)
    expect(sug.map((s) => s.id)).toEqual(['spur-gear'])
    expect(sug[0].reason).toMatch(/quarantining/)
    expect(flaggedSkillIds(stats).has('spur-gear')).toBe(true)
    expect(flaggedSkillIds(stats).has('ratchet')).toBe(false)
  })
  it('respects custom minUses/threshold', () => {
    const stats: SkillStats = { ratchet: { uses: 3, removals: 3 } }
    expect(quarantineSuggestions(stats, { minUses: 2, threshold: 0.5 }).map((s) => s.id)).toEqual(['ratchet'])
  })
})

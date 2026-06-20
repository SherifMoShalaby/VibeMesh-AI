import { describe, it, expect } from 'vitest'
import { ComputeBudget } from './budget'

describe('ComputeBudget', () => {
  it('allows up to maxRenders, then stops on count', () => {
    const t = 0
    const b = new ComputeBudget({ wallMs: 1000, maxRenders: 2, now: () => t })
    expect(b.canSpend()).toBe(true)
    b.spend()
    expect(b.canSpend()).toBe(true)
    b.spend()
    expect(b.canSpend()).toBe(false)
    expect(b.rendersSpent).toBe(2)
  })

  it('stops once the wall-clock deadline passes', () => {
    let t = 0
    const b = new ComputeBudget({ wallMs: 100, maxRenders: 10, now: () => t })
    expect(b.canSpend()).toBe(true)
    t = 150
    expect(b.canSpend()).toBe(false)
    expect(b.remainingMs()).toBe(0)
  })

  it('reports remaining wall-clock', () => {
    let t = 0
    const b = new ComputeBudget({ wallMs: 100, maxRenders: 10, now: () => t })
    t = 30
    expect(b.remainingMs()).toBe(70)
  })
})

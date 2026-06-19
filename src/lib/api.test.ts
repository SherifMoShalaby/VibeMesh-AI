import { describe, it, expect } from 'vitest'
import {
  toApiMessages,
  estTokens,
  estImageTokens,
  imageBudgetFor,
  historyBudgetTokens,
  type ProviderInfo,
} from './api'
import type { ChatImage, ChatMessage } from '../types'

let seq = 0
const um = (text: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({ id: `u${seq++}`, role: 'user', text, ...extra })
const am = (text: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({ id: `a${seq++}`, role: 'assistant', text, ...extra })
const img = (data: string, role?: ChatImage['role']): ChatImage => ({ mediaType: 'image/png', data, role })

describe('toApiMessages — role normalization (Anthropic-protocol gotchas)', () => {
  it('drops leading assistant message(s) so the first message is a user', () => {
    const out = toApiMessages([am('hello'), um('make a cube')])
    expect(out).toHaveLength(1)
    expect(out[0].role).toBe('user')
    expect(out[0].content).toBe('make a cube')
  })

  it('merges consecutive same-role messages (happens after an aborted generation)', () => {
    const out = toApiMessages([um('first'), um('second')])
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({ role: 'user', content: 'first\n\nsecond' })
  })

  it('wraps assistant code back into a scad fence', () => {
    const out = toApiMessages([um('q'), am('here', { code: 'cube([1,1,1]);' })])
    expect(out).toHaveLength(2)
    expect(out[1].content).toBe('here\n\n```scad\ncube([1,1,1]);\n```')
  })

  it('filters out error messages', () => {
    const out = toApiMessages([um('q'), am('boom', { error: true })])
    expect(out).toHaveLength(1)
    expect(out[0].content).toBe('q')
  })

  it('applies the HISTORY_LIMIT message cap when no budget is given', () => {
    const chat: ChatMessage[] = []
    for (let i = 0; i < 20; i++) chat.push(i % 2 === 0 ? um(`u${i}`) : am(`a${i}`))
    const out = toApiMessages(chat)
    expect(out.length).toBeLessThanOrEqual(12)
    expect(out[0].role).toBe('user')
  })

  it('keeps at least the latest message under a tiny token budget', () => {
    const out = toApiMessages([um('x'.repeat(4000)), am('mid'), um('latest')], { budgetTokens: 1 })
    expect(out).toHaveLength(1)
    expect(out[0].content).toBe('latest')
  })
})

describe('toApiMessages — images', () => {
  it('emits image blocks plus a text block for an image-bearing user turn', () => {
    const out = toApiMessages([um('see this', { images: [img('AAA')] })])
    expect(out).toHaveLength(1)
    const content = out[0].content as Array<{ type: string; text?: string }>
    expect(Array.isArray(content)).toBe(true)
    expect(content[0].type).toBe('image')
    expect(content.at(-1)).toEqual({ type: 'text', text: 'see this' })
  })

  it('enforces the per-engine image cap, dropping tiles before global/view', () => {
    const out = toApiMessages(
      [um('refs', { images: [img('G', 'global'), img('V', 'view'), img('T1', 'tile'), img('T2', 'tile'), img('T3', 'tile')] })],
      { maxImages: 4 },
    )
    const content = out[0].content as Array<{ type: string; source?: { data: string } }>
    const datas = content.filter((b) => b.type === 'image').map((b) => b.source!.data)
    expect(datas).toHaveLength(4)
    expect(datas).toContain('G') // global kept
    expect(datas).toContain('V') // view kept
    expect(datas.filter((d) => d.startsWith('T'))).toHaveLength(2) // one tile dropped
  })
})

describe('token estimators', () => {
  it('estTokens ≈ chars/4', () => {
    expect(estTokens('abcd')).toBe(1)
    expect(estTokens('')).toBe(0)
    expect(estTokens('a'.repeat(40))).toBe(10)
  })

  it('estImageTokens is size-aware and clamped 1000..3000, with a 1500 fallback', () => {
    expect(estImageTokens(img('x'))).toBe(1500) // no pixel dims
    expect(estImageTokens({ mediaType: 'image/png', data: 'x', width: 1000, height: 1000 })).toBe(1333)
    expect(estImageTokens({ mediaType: 'image/png', data: 'x', width: 100, height: 100 })).toBe(1000) // clamp up
    expect(estImageTokens({ mediaType: 'image/png', data: 'x', width: 4000, height: 4000 })).toBe(3000) // clamp down
  })

  it('imageBudgetFor: explicit maxImages wins, else vision→4 / non-vision→0', () => {
    expect(imageBudgetFor({ vision: true } as ProviderInfo)).toBe(4)
    expect(imageBudgetFor({ vision: true, maxImages: 2 } as ProviderInfo)).toBe(2)
    expect(imageBudgetFor({ vision: false } as ProviderInfo)).toBe(0)
    expect(imageBudgetFor(undefined)).toBe(0)
  })

  it('historyBudgetTokens caps at SANE_CONTEXT_CAP, subtracts system+reservation, applies the discount', () => {
    expect(historyBudgetTokens({ contextWindow: 200000, outputReservation: 8000 } as ProviderInfo, 7000)).toBe(64800)
    expect(historyBudgetTokens(undefined, undefined)).toBe(71200)
  })
})

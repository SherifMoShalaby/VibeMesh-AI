// UIUX-9: ContextChip — compact AI-memory gauge merged with session spend
// (extracted from ChatPanel.tsx). History is bound to the ACTIVE ENGINE's context
// window (a token budget), not a fixed message count. The ring shows how full that
// budget is. The spend info (calls × tokens) is folded into the tooltip so the
// header carries ONE chip instead of two near-identical rings.
import { memo } from 'react'
import { estHistoryTokens, historyBudgetTokens, type ProviderInfo } from '../lib/api'
import type { ChatMessage } from '../types'

export const ContextChip = memo(function ContextChip({
  chat, provider, systemTokens, calls, tokens,
}: {
  chat: ChatMessage[]
  provider?: ProviderInfo
  systemTokens?: number
  calls: number
  tokens: number
}) {
  const nonError = chat.filter((m) => !m.error).length
  if (nonError === 0 && !calls) return null
  const used = estHistoryTokens(chat)
  const budget = historyBudgetTokens(provider, systemTokens)
  const C = 2 * Math.PI * 6
  const kb = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${n}`)
  // spend suffix folded into the title
  const spendSuffix = calls
    ? ` · ${calls} generation call${calls === 1 ? '' : 's'} this session (≈${tokens.toLocaleString()} generated tokens)`
    : ''
  // unknown capacity (demo / no backend): show a raw token count, neutral ring
  if (budget <= 0) {
    return (
      <span
        className="ctx-chip"
        title={`≈${used.toLocaleString()} tokens of chat history (engine context unknown)${spendSuffix}`}
        role="status"
      >
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><circle cx="8" cy="8" r="6" className="ctx-track" /></svg>
        <span className="ctx-num">≈{kb(used)}</span>
      </span>
    )
  }
  const frac = used / budget
  const trimming = used > budget
  const win = provider?.contextWindow
  const title = trimming
    ? `Chat history is past the ~${kb(budget)}-token budget — the oldest turns are no longer sent (your reference image is always kept). Budget = the engine's context window capped for cost.${spendSuffix}`
    : `Chat history: ~${kb(used)} of ~${kb(budget)} tokens in context${win ? ` (${provider?.label?.split(' · ')[0]} window ${kb(win)}, capped for cost)` : ''}. The reference image is always kept.${spendSuffix}`
  return (
    <span className={`ctx-chip${trimming ? ' trimming' : ''}`} title={title} role="status">
      <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
        <circle cx="8" cy="8" r="6" className="ctx-track" />
        <circle cx="8" cy="8" r="6" className="ctx-arc" strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, frac))} transform="rotate(-90 8 8)" />
      </svg>
      <span className="ctx-num">{Math.round(Math.min(frac, 9.99) * 100)}%</span>
    </span>
  )
})

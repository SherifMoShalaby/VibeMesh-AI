import type { ChatImage, ChatMessage, DesignIntent } from '../types'

export interface ProviderConnect {
  envKey: string
  placeholder: string
  url: string
  urlLabel: string
}

export interface ProviderInfo {
  id: string
  label: string
  available: boolean
  detail: string
  model: string | null
  vision: boolean
  connect?: ProviderConnect
  /** selectable model variants (claude-code engine) */
  models?: Array<{ id: string; label: string }>
  /** UI grouping: subscription/CLI login, pasted API key, or a local server */
  group?: 'cli' | 'apikey' | 'local'
  /** selectable reasoning-effort levels (Claude engines only) */
  efforts?: Array<{ id: string; label: string }>
  /** current configured base URL (local engine) — pre-fills the editable URL field */
  baseUrl?: string
  /** total context window of this engine's model, in tokens (drives the history budget) */
  contextWindow?: number
  /** tokens this engine reserves for its OWN output (subtracted from the history budget) */
  outputReservation?: number
  /** max image blocks this engine accepts per request (claude-code CAP=4; local non-vision=0).
   *  toApiMessages drops lowest-priority images (tiles first) before exceeding it. */
  maxImages?: number
}

/** Per-engine image cap. Unknown → no cap (Infinity); a non-vision engine reports 0. */
export function imageBudgetFor(provider: ProviderInfo | undefined): number {
  if (provider?.maxImages != null) return provider.maxImages
  return provider?.vision ? 4 : 0
}

export interface HealthInfo {
  ok: boolean
  providers: ProviderInfo[]
  /** token size of the shared system prompt — subtracted from each engine's context window */
  systemTokens?: number
}

export async function fetchHealth(): Promise<HealthInfo | null> {
  try {
    const res = await fetch('/api/health')
    if (!res.ok) return null
    return (await res.json()) as HealthInfo
  } catch {
    return null
  }
}

/** Save an engine setting (API key / base URL); returns refreshed providers. */
export async function connectEngine(key: string, value: string): Promise<{ ok: boolean; message?: string; providers?: ProviderInfo[] }> {
  const res = await fetch('/api/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  })
  return (await res.json()) as { ok: boolean; message?: string; providers?: ProviderInfo[] }
}

/** 1-token connectivity test. */
export async function testEngine(engine: string): Promise<{ ok: boolean; message: string }> {
  const res = await fetch('/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ engine }),
  })
  return (await res.json()) as { ok: boolean; message: string }
}

type ApiContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }

interface ApiMessage {
  role: 'user' | 'assistant'
  content: string | ApiContentBlock[]
}

/** Hard message-count ceiling used only when no token budget is supplied (back-compat
 *  fallback). With a budget, the engine's context window is the real limit. */
export const HISTORY_LIMIT = 12

/** Rough token estimate (chars/4). Cheap + client-side; the budget's safety margin +
 *  discount absorb its ~15-30% under-count on dense code/JSON. The chip uses the SAME
 *  helpers as the assembler so the gauge never drifts from what's actually sent. */
export const estTokens = (s: string): number => Math.ceil((s?.length ?? 0) / 4)
/** Per-image token cost — size-aware (Anthropic tile model ≈ w*h/750), clamped 1000..3000.
 *  NEVER chars/4 of the base64 blob. Falls back to a flat ~1500 when pixel dims are unknown
 *  (legacy/persisted images), so the gauge and eviction share one consistent per-image cost. */
export const estImageTokens = (img?: ChatImage): number => {
  const px = (img?.width ?? 0) * (img?.height ?? 0)
  if (!px) return 1500
  return Math.max(1000, Math.min(3000, Math.round(px / 750)))
}

/** Token cost of one message AS SENT (assistant code re-wrapped; images only when kept). */
export function msgTokens(m: ChatMessage, keepImages: boolean): number {
  let t = estTokens(m.text || '') + 4
  if (m.role === 'assistant' && m.code) t += estTokens(m.code) + 8
  if (keepImages && m.images?.length) t += m.images.reduce((s, img) => s + estImageTokens(img), 0)
  return t
}

/** Cost cap on history tokens. We bind history to the engine's REAL context window but
 *  never fill a 1M window every turn (~$5/turn input). Bump to 160000 for longer memory at
 *  proportionally higher cost. The 0.8 discount below is the proportional safety margin that
 *  absorbs the chars/4 under-count on dense code/JSON. */
export const SANE_CONTEXT_CAP = 96000
const BUDGET_DISCOUNT = 0.8

/** Net history-token budget for an engine: min(window, cap) minus the shared system prompt and
 *  the engine's own output reservation, times the safety discount. 0 when capacity is unknown
 *  enough to be unusable (caller then keeps just the latest turn). */
export function historyBudgetTokens(provider: ProviderInfo | undefined, systemTokens: number | undefined): number {
  const cap = Math.min(provider?.contextWindow ?? SANE_CONTEXT_CAP, SANE_CONTEXT_CAP)
  const net = cap - (systemTokens ?? 7000) - (provider?.outputReservation ?? 0)
  return Math.max(0, Math.round(net * BUDGET_DISCOUNT))
}

/** Estimated tokens the FULL conversation would cost as sent (stale refine renders stripped,
 *  like the assembler) — drives the context gauge. Same estimators as toApiMessages, no drift. */
export function estHistoryTokens(chat: ChatMessage[]): number {
  const clean = chat.filter((m) => !m.error)
  const lastRefine = [...clean].reverse().find((m) => m.role === 'user' && m.action === 'Refine pass' && (m.images?.length ?? 0) > 0)
  return clean.reduce((sum, m) => sum + msgTokens(m, (m.images?.length ?? 0) > 0 && !(m.role === 'user' && m.action === 'Refine pass' && m !== lastRefine)), 0)
}

/** Choose a contiguous suffix of recent messages whose estimated tokens fit `budget`,
 *  always keeping the latest message and reserving the pinned reference image's cost so
 *  prepending it later can't blow the budget. Mirrors the assembler's keep-images rule. */
function recentWithinBudget(clean: ChatMessage[], budget: number): ChatMessage[] {
  if (clean.length <= 1) return clean
  const firstRef = clean.find((m) => m.role === 'user' && (m.images?.length ?? 0) > 0)
  const lastRefine = [...clean].reverse().find((m) => m.role === 'user' && m.action === 'Refine pass' && (m.images?.length ?? 0) > 0)
  const cost = (m: ChatMessage): number =>
    msgTokens(m, (m.images?.length ?? 0) > 0 && !(m.role === 'user' && m.action === 'Refine pass' && m !== lastRefine))
  // seed `used` with firstRef's cost: it's always sent (included in the suffix below if the
  // walk reaches it, else prepended downstream), so reserving it here leaves room either way.
  let used = firstRef ? cost(firstRef) : 0
  let start = clean.length - 1 // always keep the latest message, even if it alone exceeds budget
  if (clean[start] !== firstRef) used += cost(clean[start])
  for (let i = clean.length - 2; i >= 0; i--) {
    if (clean[i] === firstRef) { start = i; break } // reached the reserved reference contiguously — include + stop
    const c = cost(clean[i])
    if (used + c > budget) break
    used += c
    start = i
  }
  return clean.slice(start)
}

/** Pick which images survive the per-engine cap. null = no cap (bench/back-compat — don't
 *  filter). Keeps the pinned reference first, then by role (global > view > tile — tiles drop
 *  first), then most-recent, up to maxImages. */
function imagesWithinCap(
  windowed: ChatMessage[],
  firstRef: ChatMessage | undefined,
  lastRefine: ChatMessage | undefined,
  maxImages: number | undefined,
): Set<ChatImage> | null {
  if (maxImages == null || !Number.isFinite(maxImages)) return null
  const ROLE_RANK: Record<string, number> = { global: 3, view: 2, tile: 1 }
  const sendable: { img: ChatImage; rank: number; idx: number; pinned: boolean }[] = []
  windowed.forEach((msg, idx) => {
    const stale = msg.role === 'user' && msg.action === 'Refine pass' && msg !== lastRefine
    if (msg.role !== 'user' || !msg.images?.length || stale) return
    for (const img of msg.images) sendable.push({ img, rank: ROLE_RANK[img.role ?? 'global'] ?? 3, idx, pinned: msg === firstRef })
  })
  if (sendable.length <= maxImages) return new Set(sendable.map((s) => s.img))
  sendable.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.rank - a.rank || b.idx - a.idx)
  return new Set(sendable.slice(0, Math.max(0, maxImages)).map((s) => s.img))
}

/** Convert UI chat history into Anthropic messages, keeping code context. With
 *  opts.budgetTokens, history is trimmed by the engine's context-window token budget;
 *  without it, the legacy HISTORY_LIMIT message count applies (back-compat / bench).
 *  opts.maxImages caps image blocks (drops tiles first); omit for no cap. */
export function toApiMessages(chat: ChatMessage[], opts?: { budgetTokens?: number; maxImages?: number }): ApiMessage[] {
  const clean = chat.filter((m) => !m.error)
  const recent = opts?.budgetTokens === undefined ? clean.slice(-HISTORY_LIMIT) : recentWithinBudget(clean, opts.budgetTokens)
  // Pin the original reference image to the front: it is GROUND TRUTH for every
  // refine pass and must not be evicted by the rolling window once several refine
  // turns have accumulated. If the first image-bearing user message isn't already
  // inside the window, prepend it (it's a user message, so the first-must-be-user
  // and role-merge passes below stay valid).
  const firstRef = clean.find((m) => m.role === 'user' && (m.images?.length ?? 0) > 0)
  // If the window starts on a user turn, splice a tiny assistant ack between the
  // pinned reference and it, so the role-merge below doesn't fuse the reference
  // images into an unrelated user turn (which would mis-attribute the images).
  const refSep: ChatMessage = { id: 'pinned-ref-separator', role: 'assistant', text: 'Noted the reference image above.' }
  const windowed =
    firstRef && !recent.includes(firstRef)
      ? recent[0]?.role === 'user'
        ? [firstRef, refSep, ...recent]
        : [firstRef, ...recent]
      : recent
  // Keep render screenshots only on the MOST RECENT refine pass — strip older
  // intermediate refine renders to text so the model corrects toward the reference,
  // not toward its own earlier render, and stale shots don't crowd the window.
  const lastRefine = [...windowed].reverse().find((m) => m.role === 'user' && m.action === 'Refine pass' && (m.images?.length ?? 0) > 0)
  // Enforce the per-engine image cap (e.g. claude-code=4): when the sendable images exceed it,
  // KEEP the pinned reference first, then by role (global > view > tile — drop tiles first), then
  // by recency. Returns the set of ChatImage objects to send; null = no cap (bench/back-compat).
  const keep = imagesWithinCap(windowed, firstRef, lastRefine, opts?.maxImages)
  const messages: ApiMessage[] = []
  for (const msg of windowed) {
    let text = msg.text
    if (msg.role === 'assistant' && msg.code) {
      text = `${msg.text}\n\n\`\`\`scad\n${msg.code}\n\`\`\``
    }
    const staleRender = msg.role === 'user' && msg.action === 'Refine pass' && msg !== lastRefine
    const imgs = msg.images?.length ? (keep ? msg.images.filter((i) => keep.has(i)) : msg.images) : []
    if (msg.role === 'user' && imgs.length && !staleRender) {
      const blocks: ApiContentBlock[] = imgs.map((img) => ({
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: img.mediaType, data: img.data },
      }))
      blocks.push({ type: 'text', text: text || 'See attached image.' })
      messages.push({ role: 'user', content: blocks })
    } else {
      messages.push({ role: msg.role, content: text })
    }
  }
  // API requires the first message to be from the user
  while (messages.length && messages[0].role !== 'user') messages.shift()

  // merge consecutive same-role messages (happens after an aborted generation) —
  // Anthropic-protocol providers reject non-alternating roles
  const merged: ApiMessage[] = []
  for (const m of messages) {
    const prev = merged[merged.length - 1]
    if (prev && prev.role === m.role) {
      prev.content = mergeContent(prev.content, m.content)
    } else {
      merged.push({ ...m })
    }
  }
  return merged
}

function mergeContent(a: ApiMessage['content'], b: ApiMessage['content']): ApiMessage['content'] {
  if (typeof a === 'string' && typeof b === 'string') return `${a}\n\n${b}`
  const blocks = (c: ApiMessage['content']): ApiContentBlock[] =>
    typeof c === 'string' ? [{ type: 'text', text: c }] : c
  return [...blocks(a), ...blocks(b)]
}

export interface GenerateContext {
  bed?: { x: number; y: number; z: number; label?: string }
  /** the latest prompt reads as a buildable kit — reinforces the multi-part/connector rules */
  kit?: boolean
  /** explicit skill ids to inject (server skills registry); takes precedence over `kit`
   *  when set. Forward-compat for the selectSkills router; unset on the byte-identical path. */
  skillIds?: string[]
  /** the PRIOR turn's parsed design intent — its domainTags carry mechanism context forward
   *  so a follow-up that drops the keyword ("make it bigger") still retains the skill. */
  intent?: DesignIntent
  /** coarse first-turn source classification from the attached image roles (tiles → multiview,
   *  ≥2 globals → multiobject); routes the vision build fragment until the model's own
   *  sourceType (carried via `intent`) takes over on later turns. */
  sourceHint?: DesignIntent['sourceType']
}

/** A skill's advisory verdict on the generated code (server-side, post-generation). */
export interface SkillIssue {
  id: string
  issues: string[]
}

export interface StreamCallbacks {
  onDelta: (text: string) => void
  signal?: AbortSignal
  model?: string
  /** reasoning-effort level (Claude engines) — low|medium|high|xhigh|max */
  effort?: string
  context?: GenerateContext
  /** the skills that fired for this request + their advisory mechanism-check verdict */
  onSkillReport?: (info: { skillIds: string[]; report: SkillIssue[] }) => void
}

/** POST /api/generate and consume the SSE stream. Returns the full reply text. */
export async function streamGenerate(
  engine: string,
  messages: ApiMessage[],
  { onDelta, signal, model, effort, context, onSkillReport }: StreamCallbacks,
): Promise<string> {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ engine, model, effort, messages, context }),
    signal,
  })

  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const body = (await res.json()) as { message?: string }
      if (body.message) message = body.message
    } catch {
      /* not json */
    }
    throw new Error(message)
  }

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''
    for (const event of events) {
      const line = event.trim()
      if (!line.startsWith('data: ')) continue
      const payload = JSON.parse(line.slice(6)) as
        | { type: 'delta'; text: string }
        | { type: 'done'; stopReason?: string; skillIds?: string[]; skillReport?: SkillIssue[] }
        | { type: 'error'; message: string }
      if (payload.type === 'delta') {
        full += payload.text
        onDelta(payload.text)
      } else if (payload.type === 'done') {
        if (payload.skillIds?.length || payload.skillReport?.length) {
          onSkillReport?.({ skillIds: payload.skillIds ?? [], report: payload.skillReport ?? [] })
        }
      } else if (payload.type === 'error') {
        throw new Error(payload.message)
      }
    }
  }
  return full
}

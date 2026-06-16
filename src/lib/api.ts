import type { ChatMessage } from '../types'

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
}

export interface HealthInfo {
  ok: boolean
  providers: ProviderInfo[]
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

/** How many recent non-error chat messages are sent as context each turn. The
 *  UI context chip reads this so the indicator and the actual window never drift. */
export const HISTORY_LIMIT = 12

/** Convert UI chat history into Anthropic messages, keeping code context. */
export function toApiMessages(chat: ChatMessage[]): ApiMessage[] {
  const clean = chat.filter((m) => !m.error)
  const recent = clean.slice(-HISTORY_LIMIT)
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
  const messages: ApiMessage[] = []
  for (const msg of windowed) {
    let text = msg.text
    if (msg.role === 'assistant' && msg.code) {
      text = `${msg.text}\n\n\`\`\`scad\n${msg.code}\n\`\`\``
    }
    const staleRender = msg.role === 'user' && msg.action === 'Refine pass' && msg !== lastRefine
    if (msg.role === 'user' && msg.images?.length && !staleRender) {
      const blocks: ApiContentBlock[] = msg.images.map((img) => ({
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
}

export interface StreamCallbacks {
  onDelta: (text: string) => void
  signal?: AbortSignal
  model?: string
  /** reasoning-effort level (Claude engines) — low|medium|high|xhigh|max */
  effort?: string
  context?: GenerateContext
}

/** POST /api/generate and consume the SSE stream. Returns the full reply text. */
export async function streamGenerate(
  engine: string,
  messages: ApiMessage[],
  { onDelta, signal, model, effort, context }: StreamCallbacks,
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
        | { type: 'done'; stopReason: string }
        | { type: 'error'; message: string }
      if (payload.type === 'delta') {
        full += payload.text
        onDelta(payload.text)
      } else if (payload.type === 'error') {
        throw new Error(payload.message)
      }
    }
  }
  return full
}

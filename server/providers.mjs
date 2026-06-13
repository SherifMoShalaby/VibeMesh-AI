import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import { SYSTEM_PROMPT } from './prompt.mjs'

const ENV_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env')

/** Settings the UI may write at runtime (persisted to .env, applied immediately). */
const SETTABLE_KEYS = new Set(['KIMI_API_KEY', 'ANTHROPIC_API_KEY', 'LOCAL_LLM_BASE_URL'])

export function applyRuntimeSetting(key, value) {
  if (!SETTABLE_KEYS.has(key)) throw new UserFacingError(`Setting "${key}" is not configurable.`)
  const trimmed = String(value ?? '').trim()
  if (trimmed) process.env[key] = trimmed
  else delete process.env[key]

  // persist to .env: replace the line if present, append otherwise
  let lines = []
  try {
    lines = fs.readFileSync(ENV_PATH, 'utf8').split('\n')
  } catch {
    /* no .env yet */
  }
  const filtered = lines.filter((l) => !l.startsWith(`${key}=`))
  while (filtered.length && filtered[filtered.length - 1].trim() === '') filtered.pop()
  if (trimmed) filtered.push(`${key}=${trimmed}`)
  fs.writeFileSync(ENV_PATH, filtered.join('\n') + '\n', { mode: 0o600 })
}

const kimiBaseUrl = () => process.env.KIMI_BASE_URL || 'https://api.kimi.com/coding'
const kimiModel = () => process.env.KIMI_MODEL || 'kimi-for-coding'
const localBaseUrl = () => process.env.LOCAL_LLM_BASE_URL || 'http://localhost:11434'
const anthropicModel = () => process.env.VIBEMESH_MODEL || process.env.VIBESCAD_MODEL || 'claude-opus-4-8'

/* ────────────────────────────────────────────────────────────────
   Kimi login token discovery — reads the Kimi Code CLI's stored
   credential from ~/.kimi at request time. The token never leaves
   this process except toward api.kimi.com, and is never logged.
   ──────────────────────────────────────────────────────────────── */

function findKimiLoginToken() {
  const home = os.homedir()
  const candidates = [
    path.join(home, '.kimi', 'credentials'),
    path.join(home, '.kimi', 'credentials.json'),
    path.join(home, '.kimi', 'kimi.json'),
  ]
  const files = []
  for (const c of candidates) {
    try {
      const stat = fs.statSync(c)
      if (stat.isDirectory()) {
        for (const f of fs.readdirSync(c)) files.push(path.join(c, f))
      } else {
        files.push(c)
      }
    } catch {
      /* missing */
    }
  }
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'))
      const token = pickToken(data)
      if (token) return token
    } catch {
      /* not json / unreadable */
    }
  }
  return null
}

function pickToken(node, depth = 0) {
  if (depth > 4 || typeof node !== 'object' || node === null) return null
  const keys = ['access_token', 'accessToken', 'api_key', 'apiKey', 'token']
  for (const key of keys) {
    const v = node[key]
    if (typeof v === 'string' && v.length > 20) return v
  }
  for (const v of Object.values(node)) {
    const found = pickToken(v, depth + 1)
    if (found) return found
  }
  return null
}

function kimiAuth() {
  if (process.env.KIMI_API_KEY) return { kind: 'api-key', apiKey: process.env.KIMI_API_KEY }
  const token = findKimiLoginToken()
  if (token) return { kind: 'login', token }
  return null
}

/* ────────────────────────────────────────────────────────────────
   Claude Code (subscription login) availability
   ──────────────────────────────────────────────────────────────── */

let claudeBinaryCache = null

/** The model Claude Code is configured to use (label for the "default" option). */
function claudeCliDefaultModel() {
  try {
    const settings = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude', 'settings.json'), 'utf8'))
    if (typeof settings.model === 'string') {
      return settings.model.replace(/^claude-/, '').replace(/\[.*\]$/, '')
    }
  } catch {
    /* no settings */
  }
  return null
}

function claudeBinaryAvailable() {
  if (claudeBinaryCache !== null) return Promise.resolve(claudeBinaryCache)
  return new Promise((resolve) => {
    execFile('claude', ['--version'], { timeout: 5000 }, (err) => {
      claudeBinaryCache = !err
      resolve(claudeBinaryCache)
    })
  })
}

/* ────────────────────────────────────────────────────────────────
   Local (Ollama / LM Studio — OpenAI-compatible) discovery
   ──────────────────────────────────────────────────────────────── */

async function listLocalModels() {
  // Ollama native first (richer), then OpenAI-compatible /v1/models
  try {
    const res = await fetch(`${localBaseUrl()}/api/tags`, { signal: AbortSignal.timeout(1500) })
    if (res.ok) {
      const body = await res.json()
      return (body.models ?? []).map((m) => m.name)
    }
  } catch {
    /* not ollama */
  }
  try {
    const res = await fetch(`${localBaseUrl()}/v1/models`, { signal: AbortSignal.timeout(1500) })
    if (res.ok) {
      const body = await res.json()
      return (body.data ?? []).map((m) => m.id)
    }
  } catch {
    /* not running */
  }
  return null
}

/* ────────────────────────────────────────────────────────────────
   Provider status for /api/health
   ──────────────────────────────────────────────────────────────── */

export async function providerStatus() {
  const [claudeBin, localModels] = await Promise.all([claudeBinaryAvailable(), listLocalModels()])
  const kimi = kimiAuth()

  const providers = [
    {
      id: 'claude-code',
      label: 'Claude · login',
      available: claudeBin,
      detail: claudeBin ? 'uses your Claude Code login' : 'claude CLI not found — install Claude Code and /login',
      model: 'default',
      vision: true,
      models: [
        { id: 'default', label: claudeCliDefaultModel() ? `default (${claudeCliDefaultModel()})` : 'default' },
        { id: 'opus', label: 'opus — best quality' },
        { id: 'sonnet', label: 'sonnet — fast' },
        { id: 'haiku', label: 'haiku — fastest' },
      ],
    },
    {
      id: 'anthropic',
      label: 'Claude · API key',
      available: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
      detail: process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? anthropicModel() : 'connect with an API key',
      model: anthropicModel(),
      vision: true,
      connect: { envKey: 'ANTHROPIC_API_KEY', placeholder: 'sk-ant-…', url: 'https://console.anthropic.com/settings/keys', urlLabel: 'Get a key at console.anthropic.com' },
    },
    {
      id: 'kimi',
      label: 'Kimi K2.6',
      // the CLI login token is rejected by Kimi's coding API — only console keys work
      available: Boolean(process.env.KIMI_API_KEY),
      detail: process.env.KIMI_API_KEY
        ? 'using your Kimi Code key'
        : kimi?.kind === 'login'
          ? 'Kimi CLI login found, but their API only accepts console keys — paste one to connect (included in your subscription)'
          : 'connect with a Kimi Code console key (included in the Kimi subscription)',
      model: kimiModel(),
      vision: true,
      connect: { envKey: 'KIMI_API_KEY', placeholder: 'Kimi Code console key…', url: 'https://www.kimi.com/code', urlLabel: 'Get a key in the Kimi Code console' },
    },
  ]

  if (localModels && localModels.length > 0) {
    for (const m of localModels) {
      providers.push({
        id: `local:${m}`,
        label: `Local · ${m}`,
        available: true,
        detail: localBaseUrl(),
        model: m,
        vision: /vl|vision|llava|moondream|gemma3|qwen.*vl/i.test(m),
      })
    }
  } else {
    providers.push({
      id: 'local',
      label: 'Local LLM',
      available: false,
      detail: `nothing answering at ${localBaseUrl()} — start Ollama or LM Studio`,
      model: null,
      vision: false,
      connect: { envKey: 'LOCAL_LLM_BASE_URL', placeholder: 'http://localhost:11434', url: 'https://ollama.com', urlLabel: 'Install Ollama' },
    })
  }

  return providers
}

/* ────────────────────────────────────────────────────────────────
   Cheap connection tests for the Engines panel (1-token pings)
   ──────────────────────────────────────────────────────────────── */

export async function testEngine(engine) {
  try {
    if (engine === 'anthropic') {
      const client = new Anthropic()
      await client.messages.create({ model: anthropicModel(), max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] })
      return { ok: true, message: `Connected — ${anthropicModel()} responded.` }
    }
    if (engine === 'kimi') {
      const auth = kimiAuth()
      if (!process.env.KIMI_API_KEY) return { ok: false, message: 'No Kimi key saved yet.' }
      const client = new Anthropic({ baseURL: kimiBaseUrl(), apiKey: auth.apiKey })
      await client.messages.create({ model: kimiModel(), max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] })
      return { ok: true, message: `Connected — ${kimiModel()} responded.` }
    }
    if (engine === 'claude-code') {
      const ok = await claudeBinaryAvailable()
      return ok
        ? { ok: true, message: 'claude CLI found — login is verified on first generation.' }
        : { ok: false, message: 'claude CLI not found on PATH.' }
    }
    if (engine === 'local' || engine.startsWith('local:')) {
      const models = await listLocalModels()
      return models && models.length
        ? { ok: true, message: `Found ${models.length} model(s): ${models.join(', ')}` }
        : { ok: false, message: `Nothing answering at ${localBaseUrl()}.` }
    }
    return { ok: false, message: `Unknown engine "${engine}".` }
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return { ok: false, message: 'Rejected: invalid key.' }
    if (error instanceof Anthropic.APIError) return { ok: false, message: `API error (${error.status}): ${error.message?.slice(0, 160)}` }
    return { ok: false, message: error instanceof Error ? error.message.slice(0, 160) : String(error) }
  }
}

/* ────────────────────────────────────────────────────────────────
   Streaming generation — one entry point, dispatched by engine id.
   Each returns when the stream completes; deltas go to onDelta.
   ──────────────────────────────────────────────────────────────── */

/** Per-request context (bed size etc.) appended to the system prompt. */
function contextText(context) {
  if (!context?.bed) return ''
  const { x, y, z, label } = context.bed
  if (![x, y, z].every((n) => Number.isFinite(n))) return ''
  return `\n\n# Session context\n\nTarget printer bed: ${x} × ${y} × ${z} mm${label ? ` (${label})` : ''}. Every individually printed piece must fit it.`
}

export async function streamChat({ engine, model, messages, context, onDelta, signal }) {
  const ctx = contextText(context)
  if (engine === 'anthropic') return streamAnthropic({ messages, ctx, onDelta, signal })
  if (engine === 'kimi') return streamKimi({ messages, ctx, onDelta, signal })
  if (engine === 'claude-code') return streamClaudeCode({ messages, model, ctx, onDelta, signal })
  if (engine.startsWith('local:')) return streamLocal({ model: engine.slice(6), messages, ctx, onDelta, signal })
  throw new UserFacingError(`Unknown engine "${engine}".`)
}

export class UserFacingError extends Error {}

/* ── Claude first-party API ── */

async function streamAnthropic({ messages, ctx, onDelta, signal }) {
  const client = new Anthropic()
  const system = [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }]
  if (ctx) system.push({ type: 'text', text: ctx })
  const stream = client.messages.stream(
    {
      model: anthropicModel(),
      max_tokens: 32000,
      thinking: { type: 'adaptive' },
      system,
      messages,
    },
    { signal },
  )
  stream.on('text', onDelta)
  try {
    await stream.finalMessage()
  } catch (error) {
    throw translateAnthropicError(error, 'Anthropic')
  }
}

/* ── Kimi K2.6 via Anthropic-compatible endpoint ── */

async function streamKimi({ messages, ctx, onDelta, signal }) {
  const auth = kimiAuth()
  if (!auth) {
    throw new UserFacingError('Kimi is not connected. Log in with the kimi CLI, or create an API key in the Kimi Code console and set KIMI_API_KEY in .env.')
  }
  const secret = auth.kind === 'api-key' ? auth.apiKey : auth.token
  // Kimi's Anthropic-compatible endpoint: API keys go in x-api-key; the CLI's
  // login token may need Authorization: Bearer — try both before giving up.
  const headerStyles = auth.kind === 'api-key' ? ['x-api-key', 'bearer'] : ['bearer', 'x-api-key']

  let lastAuthError = null
  for (const style of headerStyles) {
    const client = new Anthropic(
      style === 'x-api-key' ? { baseURL: kimiBaseUrl(), apiKey: secret } : { baseURL: kimiBaseUrl(), apiKey: null, authToken: secret },
    )
    // keep the payload protocol-portable: no thinking, no cache_control
    const stream = client.messages.stream(
      {
        model: kimiModel(),
        max_tokens: 16000,
        system: SYSTEM_PROMPT + ctx,
        messages,
      },
      { signal },
    )
    stream.on('text', onDelta)
    try {
      await stream.finalMessage()
      return
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError || error?.status === 403) {
        lastAuthError = error
        continue
      }
      throw translateAnthropicError(error, 'Kimi')
    }
  }
  if (auth.kind === 'login') {
    throw new UserFacingError(
      'Kimi rejected the CLI login token. Their coding API needs a key from the Kimi Code console (kimi.com → Kimi Code → API keys, included in your subscription) — put it in .env as KIMI_API_KEY and restart.',
    )
  }
  throw translateAnthropicError(lastAuthError, 'Kimi')
}

function translateAnthropicError(error, who) {
  if (error instanceof Anthropic.AuthenticationError) {
    return new UserFacingError(`${who} rejected the credentials — check your .env / login.`)
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new UserFacingError(`${who} rate limit hit — wait a moment and retry.`)
  }
  if (error instanceof Anthropic.APIError) {
    return new UserFacingError(`${who} API error (${error.status}): ${error.message}`)
  }
  return error
}

/* ── Claude Code subscription login (Agent SDK) ── */

async function streamClaudeCode({ messages, model, ctx, onDelta, signal }) {
  let query
  try {
    ;({ query } = await import('@anthropic-ai/claude-agent-sdk'))
  } catch {
    throw new UserFacingError('Claude Agent SDK is not installed — run `npm install` again.')
  }

  // The Agent SDK drives the locally installed claude binary and uses its
  // login (subscription OAuth). Strip ANTHROPIC_API_KEY so the subscription
  // login always wins over any stray key in the environment.
  const env = { ...process.env }
  delete env.ANTHROPIC_API_KEY

  const prompt = agentPromptFromMessages(messages)

  const response = query({
    prompt,
    options: {
      systemPrompt: SYSTEM_PROMPT + ctx,
      ...(model && model !== 'default' ? { model } : {}),
      allowedTools: [],
      disallowedTools: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Task', 'NotebookEdit'],
      maxTurns: 1,
      includePartialMessages: true,
      env,
      abortController: signalToController(signal),
    },
  })

  let gotText = false
  try {
    for await (const message of response) {
      if (message.type === 'stream_event') {
        const event = message.event
        if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          gotText = true
          onDelta(event.delta.text)
        }
      } else if (message.type === 'result') {
        if (message.subtype !== 'success') {
          const errText = message.subtype === 'error_max_turns' ? 'hit max turns' : (message.errorMessage ?? message.subtype)
          throw new UserFacingError(`Claude Code session failed: ${errText}`)
        }
        // fallback: if partial streaming produced nothing, emit the final result text
        if (!gotText && typeof message.result === 'string') onDelta(message.result)
      }
    }
  } catch (error) {
    if (error instanceof UserFacingError) throw error
    const msg = error instanceof Error ? error.message : String(error)
    if (/not logged in|authentication|login/i.test(msg)) {
      throw new UserFacingError('Claude Code is not logged in — run `claude` in a terminal and use /login first.')
    }
    throw new UserFacingError(`Claude Code error: ${msg}`)
  }
}

function signalToController(signal) {
  const controller = new AbortController()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', () => controller.abort(), { once: true })
  }
  return controller
}

/** Flatten chat history into a single prompt (the Agent SDK session is single-turn). */
function agentPromptFromMessages(messages) {
  const last = messages[messages.length - 1]
  const prior = messages.slice(0, -1)
  let prompt = ''
  if (prior.length > 0) {
    prompt += 'Conversation so far:\n\n'
    for (const m of prior) {
      prompt += `${m.role === 'user' ? 'User' : 'You'}: ${contentToText(m.content)}\n\n`
    }
    prompt += '---\n\nNow respond to the latest user message:\n\n'
  }
  prompt += contentToText(last.content)

  const images = collectImages(last.content)
  if (images.length === 0) return prompt

  // stream a single user message with image blocks
  return (async function* () {
    yield {
      type: 'user',
      message: {
        role: 'user',
        content: [
          ...images.map((img) => ({ type: 'image', source: img.source })),
          { type: 'text', text: prompt },
        ],
      },
    }
  })()
}

function contentToText(content) {
  if (typeof content === 'string') return content
  return content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
}

function collectImages(content) {
  if (typeof content === 'string') return []
  return content.filter((b) => b.type === 'image')
}

/* ── Local LLM (Ollama / LM Studio, OpenAI-compatible) ── */

async function streamLocal({ model, messages, ctx, onDelta, signal }) {
  const body = {
    model,
    stream: true,
    messages: [{ role: 'system', content: SYSTEM_PROMPT + ctx }, ...messages.map(toOpenAiMessage)],
  }

  let res
  try {
    res = await fetch(`${localBaseUrl()}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    throw new UserFacingError(`Could not reach the local LLM at ${localBaseUrl()} — is Ollama/LM Studio running?`)
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new UserFacingError(`Local LLM error (${res.status}): ${text.slice(0, 300)}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') return
      try {
        const chunk = JSON.parse(payload)
        const delta = chunk.choices?.[0]?.delta?.content
        if (delta) onDelta(delta)
      } catch {
        /* keep-alive or partial line */
      }
    }
  }
}

function toOpenAiMessage(message) {
  if (typeof message.content === 'string') return { role: message.role, content: message.content }
  const parts = []
  for (const block of message.content) {
    if (block.type === 'text') parts.push({ type: 'text', text: block.text })
    if (block.type === 'image') {
      parts.push({
        type: 'image_url',
        image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` },
      })
    }
  }
  return { role: message.role, content: parts }
}

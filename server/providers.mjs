import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import { SYSTEM_PROMPT } from './prompt.mjs'
import { SKILLS, selectSkills } from './skills.mjs'

const ENV_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env')

/** Settings the UI may write at runtime (persisted to .env, applied immediately). */
const SETTABLE_KEYS = new Set(['KIMI_API_KEY', 'KIMI_MODELS', 'ANTHROPIC_API_KEY', 'LOCAL_LLM_BASE_URL'])

export function applyRuntimeSetting(key, value) {
  if (!SETTABLE_KEYS.has(key)) throw new UserFacingError(`Setting "${key}" is not configurable.`)
  const trimmed = String(value ?? '').trim()
  // Reject control chars / newlines so a value can't inject extra KEY=value lines into .env.
  if (Array.from(trimmed).some((c) => c.charCodeAt(0) < 0x20)) throw new UserFacingError('Value contains invalid characters.')
  // The base URL is used as a server-side fetch target — require a real http(s) URL (SSRF guard).
  if (key === 'LOCAL_LLM_BASE_URL' && trimmed) {
    let u
    try {
      u = new URL(trimmed)
    } catch {
      throw new UserFacingError('Base URL must be a valid http(s) URL.')
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new UserFacingError('Base URL must use http or https.')
  }
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

/** Live model list from Kimi's /v1/models — so new models appear with NO code change.
 *  The coding endpoint advertises an auto-updating alias (kimi-for-coding) that already
 *  tracks the latest coding model; any models it lists are picked up automatically. */
async function listKimiModels() {
  const key = process.env.KIMI_API_KEY
  if (!key) return null // listing needs a console key (the CLI login token can't list)
  try {
    const res = await fetch(`${kimiBaseUrl()}/v1/models`, { headers: { 'x-api-key': key }, signal: AbortSignal.timeout(2500) })
    if (!res.ok) return null
    const body = await res.json()
    return (body.data ?? body.models ?? []).map((m) => m.id ?? m.name).filter(Boolean)
  } catch {
    return null
  }
}

/** Build the Kimi picker: 'default' + live-discovered ∪ KIMI_MODELS env ∪ known pins, deduped.
 *  No code change needed as Kimi ships models — they arrive via the endpoint or KIMI_MODELS. */
function kimiModelChoices(discovered) {
  const envExtra = (process.env.KIMI_MODELS || '').split(',').map((s) => s.trim()).filter(Boolean)
  const known = ['kimi-k2.7-code'] // pinnable specific versions the alias endpoint may not list
  const out = [{ id: 'default', label: `default (${kimiModel()})` }]
  const seen = new Set(['default'])
  for (const id of [...(discovered ?? []), ...envExtra, ...known]) {
    if (id && !seen.has(id)) {
      seen.add(id)
      out.push({ id, label: id })
    }
  }
  return out
}
const localBaseUrl = () => process.env.LOCAL_LLM_BASE_URL || 'http://localhost:11434'
const anthropicModel = () => process.env.VIBEMESH_MODEL || process.env.VIBESCAD_MODEL || 'claude-opus-4-8'

// ── Engine output / context budgets ──
// Output-token reservations, referenced by BOTH the stream functions AND providerStatus, so the
// client's history-token budget can never drift from what the server actually sends.
const ANTHROPIC_MAX_TOKENS = 64000
const KIMI_MAX_TOKENS = 16000
// claude-code runs through the Agent SDK (no max_tokens literal) — reserve a conservative output budget.
const CLAUDE_CODE_OUTPUT_RESERVE = 32000
// local (Ollama/LM Studio): num_ctx is the WHOLE window (input+output) and is RAM/latency-linear, so keep
// it overridable. The old 8192 default oversubscribed the window — the ~6.7K system prompt + an 8192 output
// reservation left no room for history, so Ollama silently left-truncated the printability rules.
const LOCAL_NUM_CTX = Number(process.env.LOCAL_LLM_NUM_CTX) || 16384
const LOCAL_NUM_PREDICT = Number(process.env.LOCAL_LLM_MAX_TOKENS) || 4096
// rough token size of the shared system prompt (chars/4), published to the client so its budget
// subtracts the REAL amount rather than a hardcoded guess that drifts as the prompt grows.
export const SYSTEM_PROMPT_TOKENS = Math.ceil(SYSTEM_PROMPT.length / 4)

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

/** Reasoning-effort levels (GA on Opus 4.6+/Sonnet 4.6). Both Claude engines accept it:
 *  the API engine via output_config.effort, the login engine via the Agent SDK query option.
 *  xhigh is the documented sweet spot for coding/agentic work (and Claude Code's own default). */
export const EFFORT_CHOICES = [
  { id: 'low', label: 'low — fastest' },
  { id: 'medium', label: 'medium' },
  { id: 'high', label: 'high — balanced' },
  { id: 'xhigh', label: 'xhigh — best for code' },
  { id: 'max', label: 'max — exhaustive' },
]
const EFFORT_IDS = new Set(EFFORT_CHOICES.map((e) => e.id))
export const DEFAULT_EFFORT = EFFORT_IDS.has(process.env.VIBEMESH_EFFORT) ? process.env.VIBEMESH_EFFORT : 'xhigh'
/** Resolve a request-supplied effort to a valid level, falling back to the default. */
function resolveEffort(effort) {
  return typeof effort === 'string' && EFFORT_IDS.has(effort) ? effort : DEFAULT_EFFORT
}

export async function providerStatus() {
  const [claudeBin, localModels, kimiModelIds] = await Promise.all([claudeBinaryAvailable(), listLocalModels(), listKimiModels()])
  const kimi = kimiAuth()

  const providers = [
    {
      id: 'claude-code',
      label: 'Claude · login',
      group: 'cli',
      available: claudeBin,
      detail: claudeBin ? 'uses your Claude Code login' : 'claude CLI not found — install Claude Code and /login',
      model: 'default',
      contextWindow: 200000, // conservative login floor (the Agent SDK won't compact a flattened single-turn prompt)
      outputReservation: CLAUDE_CODE_OUTPUT_RESERVE,
      vision: true,
      models: [
        { id: 'default', label: claudeCliDefaultModel() ? `default (${claudeCliDefaultModel()})` : 'default' },
        { id: 'opus', label: 'opus — best quality' },
        { id: 'sonnet', label: 'sonnet — fast' },
        { id: 'haiku', label: 'haiku — fastest' },
      ],
      efforts: EFFORT_CHOICES,
    },
    {
      id: 'anthropic',
      label: 'Claude · API key',
      group: 'apikey',
      available: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
      detail: process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? anthropicModel() : 'connect with an API key',
      model: anthropicModel(),
      contextWindow: 1000000,
      outputReservation: ANTHROPIC_MAX_TOKENS,
      vision: true,
      connect: { envKey: 'ANTHROPIC_API_KEY', placeholder: 'sk-ant-…', url: 'https://console.anthropic.com/settings/keys', urlLabel: 'Get a key at console.anthropic.com' },
      efforts: EFFORT_CHOICES,
    },
    {
      id: 'kimi',
      label: 'Kimi',
      group: 'apikey',
      // the CLI login token is rejected by Kimi's coding API — only console keys work
      available: Boolean(process.env.KIMI_API_KEY),
      detail: process.env.KIMI_API_KEY
        ? 'using your Kimi Code key'
        : kimi?.kind === 'login'
          ? 'Kimi CLI login found, but their API only accepts console keys — paste one to connect (included in your subscription)'
          : 'connect with a Kimi Code console key (included in the Kimi subscription)',
      model: kimiModel(),
      contextWindow: 200000, // model-dependent; stay conservative — Kimi 400s readily
      outputReservation: KIMI_MAX_TOKENS,
      vision: true,
      models: kimiModelChoices(kimiModelIds),
      connect: { envKey: 'KIMI_API_KEY', placeholder: 'Kimi Code console key…', url: 'https://www.kimi.com/code', urlLabel: 'Get a key in the Kimi Code console' },
    },
  ]

  // the local server's URL is configurable from the UI whether or not it's currently up — the
  // user may point it at a server they're about to start. `baseUrl` carries the current value so
  // the panel pre-fills it; the `connect` block makes it editable even when a server IS answering.
  const localConnect = { envKey: 'LOCAL_LLM_BASE_URL', placeholder: 'http://localhost:11434', url: 'https://ollama.com', urlLabel: 'Install Ollama' }
  if (localModels && localModels.length > 0) {
    for (const m of localModels) {
      providers.push({
        id: `local:${m}`,
        label: `Local · ${m}`,
        group: 'local',
        available: true,
        detail: localBaseUrl(),
        baseUrl: localBaseUrl(),
        model: m,
        contextWindow: LOCAL_NUM_CTX,
        outputReservation: LOCAL_NUM_PREDICT,
        vision: /vl|vision|llava|moondream|gemma|qwen.*vl/i.test(m),
        connect: localConnect,
      })
    }
  } else {
    providers.push({
      id: 'local',
      label: 'Local LLM',
      group: 'local',
      available: false,
      detail: `nothing answering at ${localBaseUrl()} — set the URL below, then start Ollama or LM Studio`,
      baseUrl: localBaseUrl(),
      model: null,
      contextWindow: LOCAL_NUM_CTX,
      outputReservation: LOCAL_NUM_PREDICT,
      vision: false,
      connect: localConnect,
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

/** Per-request context appended to the abstract SYSTEM_PROMPT: bed size + the selected
 *  skill fragments (server/skills.mjs). Generalizes the former hard-coded kit appendix
 *  into a keyed-skills assembler. Exported so the prompt-assembly snapshot test
 *  (bench/prompt-snapshot.mjs) can prove the assembly is byte-identical. */
export function contextText(context, engine) {
  let out = ''
  if (context?.bed) {
    const { x, y, z, label } = context.bed
    if ([x, y, z].every((n) => Number.isFinite(n))) {
      out += `\n\n# Session context\n\nTarget printer bed: ${x} × ${y} × ${z} mm${label ? ` (${label})` : ''}. Every individually printed piece must fit it.`
    }
  }
  // append each selected skill's fragment; the skill decides per-engine budget rules
  // (e.g. the kit skill drops its heavy exemplar on tiny-context local models).
  for (const id of selectSkills(context)) out += SKILLS[id].fragment(engine)
  return out
}

export async function streamChat({ engine, model, effort, messages, context, onDelta, signal }) {
  const ctx = contextText(context, engine)
  // effort applies only to the Claude engines (Kimi 400s on it, local is OpenAI-shaped)
  if (engine === 'anthropic') return streamAnthropic({ messages, ctx, onDelta, signal, effort })
  if (engine === 'kimi') return streamKimi({ messages, ctx, onDelta, signal, model })
  if (engine === 'claude-code') return streamClaudeCode({ messages, model, ctx, onDelta, signal, effort })
  if (engine.startsWith('local:')) return streamLocal({ model: engine.slice(6), messages, ctx, onDelta, signal })
  throw new UserFacingError(`Unknown engine "${engine}".`)
}

export class UserFacingError extends Error {}

/* ── Claude first-party API ── */

async function streamAnthropic({ messages, ctx, onDelta, signal, effort }) {
  const client = new Anthropic()
  const system = [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }]
  if (ctx) system.push({ type: 'text', text: ctx })
  const stream = client.messages.stream(
    {
      model: anthropicModel(),
      // 64k: thinking + output share one budget on Opus 4.8 with adaptive thinking,
      // so a rich design plus its reasoning can crowd a 32k ceiling — give headroom.
      max_tokens: ANTHROPIC_MAX_TOKENS,
      thinking: { type: 'adaptive' },
      // effort is GA on Opus 4.8 (no beta header) and coexists with adaptive thinking; xhigh is
      // the documented sweet spot for coding/agentic work. The level is chosen in the Engines UI
      // (per request) and falls back to DEFAULT_EFFORT (VIBEMESH_EFFORT or xhigh) when unset.
      output_config: { effort: resolveEffort(effort) },
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

async function streamKimi({ messages, ctx, onDelta, signal, model }) {
  const auth = kimiAuth()
  const useModel = model && model !== 'default' ? model : kimiModel()
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
        model: useModel,
        max_tokens: KIMI_MAX_TOKENS,
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

async function streamClaudeCode({ messages, model, ctx, onDelta, signal, effort }) {
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
      // the Agent SDK accepts a named effort level (low|medium|high|xhigh|max); the binary
      // silently downgrades it for a model that doesn't support that level
      effort: resolveEffort(effort),
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

  // Collect images from ALL user turns, not just the last — otherwise an
  // image-grounded refine on claude-code loses the original reference photo. But
  // take the LATEST user turn's images FIRST (those are the render snapshots a
  // refine actually compares — and the iso/front/top order the prompt promises),
  // then backfill earlier reference images oldest-first up to the cap, so a
  // multi-reference history can't starve the renders. De-duped by payload.
  const images = []
  const seen = new Set()
  const CAP = 4
  const add = (m) => {
    if (!m) return
    for (const img of collectImages(m.content)) {
      const key = img.source?.data
      if (key && !seen.has(key) && images.length < CAP) {
        seen.add(key)
        images.push(img)
      }
    }
  }
  const userTurns = messages.filter((m) => m.role === 'user')
  add(userTurns[userTurns.length - 1]) // latest turn (renders) first
  for (const m of userTurns.slice(0, -1)) {
    if (images.length >= CAP) break
    add(m) // earlier reference photos, oldest-first
  }
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
  // Without these, Ollama's ~2-4K default context truncates the system prompt
  // before the model sees the multi-part/connector rules, and its ~128-token
  // output default cuts programs off mid-module — guaranteeing blobs. Both knobs
  // are belt-and-suspenders: LM Studio honors top-level max_tokens; Ollama reads
  // options.num_ctx/num_predict and ignores unknown keys.
  const body = {
    model,
    stream: true,
    // set BOTH: LM Studio honors top-level max_tokens, Ollama reads options.num_ctx/num_predict
    max_tokens: LOCAL_NUM_PREDICT,
    temperature: 0.2,
    options: { num_ctx: LOCAL_NUM_CTX, num_predict: LOCAL_NUM_PREDICT, temperature: 0.2 },
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

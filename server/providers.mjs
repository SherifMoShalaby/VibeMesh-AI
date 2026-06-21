import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import { SYSTEM_PROMPT } from './prompt.mjs'
import { SKILLS, selectSkills, selectSkillsDetailed, composePlan } from './skills.mjs'
import { billOfMaterials } from './hardware.mjs'
import { getConnection, listConnections, catalogEntry, validateFetchUrl } from './connections.mjs'

const ENV_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env')

/** Settings the UI may write at runtime (persisted to .env, applied immediately). */
const SETTABLE_KEYS = new Set(['KIMI_API_KEY', 'KIMI_MODELS', 'ANTHROPIC_API_KEY', 'LOCAL_LLM_BASE_URL'])

/** Pure validation for a runtime setting: throws UserFacingError on a bad key/value,
 *  returns the trimmed value on success. No I/O — split out from applyRuntimeSetting so the
 *  security-sensitive guards (key allowlist, control-char/newline injection, SSRF on the
 *  base URL) are unit-testable without writing the real .env (bench/server.selftest.mjs). */
/** Marketplace connection-secret keys (CONN_<id>_KEY) are allowed alongside the fixed built-ins.
 *  The control-char/newline guard below still applies, so a value can't inject extra .env lines. */
const CONN_KEY_RE = /^CONN_[a-z0-9]{3,24}_KEY$/

export function validateRuntimeSetting(key, value) {
  if (!SETTABLE_KEYS.has(key) && !CONN_KEY_RE.test(key)) throw new UserFacingError(`Setting "${key}" is not configurable.`)
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
  return trimmed
}

export function applyRuntimeSetting(key, value) {
  const trimmed = validateRuntimeSetting(key, value)
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

// ── Per-model capability table (single source for context window + output ceiling) ──
// context = total tokens the model accepts (input+output) — the "1M" number; maxOutput = the
// SEPARATE, smaller completion cap (the max_tokens we actually send), never the context window.
// Fact-checked 2026-06-20 (docs/ENGINE-MARKETPLACE-DESIGN.md §3). Unknown models fall back below.
const MODEL_CAPS = {
  'claude-opus-4-8': { context: 1000000, maxOutput: 128000 },
  'claude-sonnet-4-6': { context: 1000000, maxOutput: 64000 },
  'claude-haiku-4-5': { context: 200000, maxOutput: 64000 },
  'claude-fable-5': { context: 1000000, maxOutput: 128000 },
}
const ANTHROPIC_CAPS_DEFAULT = { context: 1000000, maxOutput: 64000 }

/** Context window + output ceiling for an Anthropic model (table-driven, not a flat constant). */
export function anthropicCaps(model) {
  return MODEL_CAPS[model] || ANTHROPIC_CAPS_DEFAULT
}

// Default output budget for the Anthropic stream. The model's REAL ceiling (anthropicCaps) is the
// hard cap; VIBEMESH_MAX_OUTPUT_TOKENS overrides it but is CLAMPED to that ceiling (asking for 1M
// output just gets you the model max, never an API rejection). The default stays 64k so a full
// program plus its adaptive thinking fits and bench output is unchanged — while Opus's true 128k
// ceiling is now reachable via the override instead of being silently hardcoded away.
const DEFAULT_ANTHROPIC_OUTPUT = 64000

/** Resolved max_tokens for an Anthropic model: min(real ceiling, configured budget). Referenced by
 *  BOTH the anthropic-protocol adapter AND providerStatus so the client's history budget can never
 *  drift from what is actually sent. Pure (env-only) → unit-tested in bench/server.selftest.mjs. */
export function anthropicMaxTokens(model) {
  const ceiling = anthropicCaps(model).maxOutput
  const override = Number(process.env.VIBEMESH_MAX_OUTPUT_TOKENS)
  const want = Number.isFinite(override) && override > 0 ? Math.floor(override) : DEFAULT_ANTHROPIC_OUTPUT
  return Math.min(ceiling, Math.max(1, want))
}

const KIMI_MAX_TOKENS = 16000
// claude-code runs through the Agent SDK (no max_tokens literal) — reserve a conservative output budget.
const CLAUDE_CODE_OUTPUT_RESERVE = 32000
// local (Ollama/LM Studio): num_ctx is the WHOLE window (input+output) and is RAM/latency-linear, so keep
// it overridable. The old 8192 default oversubscribed the window — the ~6.7K system prompt + an 8192 output
// reservation left no room for history, so Ollama silently left-truncated the printability rules.
const LOCAL_NUM_CTX = Number(process.env.LOCAL_LLM_NUM_CTX) || 16384
const LOCAL_NUM_PREDICT = Number(process.env.LOCAL_LLM_MAX_TOKENS) || 4096

// ── Generation request timeout + retries ──
// The Anthropic SDK defaults to a 10-min per-request timeout AND auto-retries (×2), so a slow
// xhigh/max run could be cut mid-think or silently stretch to ~30 min (the "it timed out at ~15
// min while I was fine to wait" symptom). Replace that with ONE explicit, generous, configurable
// budget and at most one retry. Threaded to the Anthropic/Kimi/local clients, published to the
// client for the Engines UI, and used to widen Node's server.requestTimeout (server/index.mjs).
export const GEN_TIMEOUT_MS = Math.max(60000, Number(process.env.VIBEMESH_GEN_TIMEOUT_MS) || 60 * 60000)
export const GEN_MAX_RETRIES = (() => {
  const n = Number(process.env.VIBEMESH_GEN_MAX_RETRIES)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 1
})()
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
  // Resolve the Anthropic model + caps ONCE so model/contextWindow/outputReservation/maxOutput can
  // never describe different models if process.env is rewritten mid-build (no-drift, airtight).
  const anthModel = anthropicModel()
  const anthCaps = anthropicCaps(anthModel)

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
      maxImages: 10, // a global + up to 9 region tiles (the tiler degrades resolution before dropping tiles)
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
      detail: process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? anthModel : 'connect with an API key',
      model: anthModel,
      contextWindow: anthCaps.context,
      outputReservation: anthropicMaxTokens(anthModel),
      maxOutput: anthCaps.maxOutput,
      vision: true,
      maxImages: 10, // 1M window + strong vision → room for a global + several tiles
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
      maxImages: 10,
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
        maxImages: /vl|vision|llava|moondream|gemma|qwen.*vl/i.test(m) ? 2 : 0, // 0 unless a vision model
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

  // Marketplace connections (P2): the user-added providers. Only added connections appear — the
  // catalog of addable providers is served separately (GET /api/catalog). Each reuses the SAME
  // protocol adapters as the built-ins, so availability is just "is the secret present".
  for (const conn of listConnections()) {
    const secret = process.env[conn.auth?.envKey]
    const available = Boolean(secret)
    const desc = resolveConnectionDescriptor(conn)
    const cat = catalogEntry(conn.catalogId)
    providers.push({
      id: `conn:${conn.id}`,
      label: conn.label,
      group: 'apikey',
      available,
      detail: available ? `${conn.model} · ${conn.baseUrl}` : 'add an API key to connect',
      model: conn.model,
      contextWindow: conn.caps?.contextWindow,
      outputReservation: desc?.maxTokens ?? CONNECTION_DEFAULT_OUTPUT,
      maxOutput: conn.caps?.maxOutputTokens,
      vision: !!conn.caps?.vision,
      maxImages: conn.caps?.vision ? 4 : 0,
      efforts: conn.caps?.thinking ? EFFORT_CHOICES : undefined,
      connection: true,
      catalogId: conn.catalogId,
      baseUrl: conn.baseUrl,
      connect: { envKey: conn.auth.envKey, placeholder: cat?.connect?.placeholder ?? 'API key…', url: cat?.connect?.url ?? '', urlLabel: cat?.connect?.urlLabel ?? '' },
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
    if (engine.startsWith('conn:')) {
      // a marketplace connection: 1-token ping via the same adapter protocol it generates through.
      const desc = resolveEngineDescriptor(engine)
      if (!desc) return { ok: false, message: 'Connection not found.' }
      // http(s)-only + metadata/link-local blocked before any outbound request
      try { if (desc.baseURL) validateFetchUrl(desc.baseURL) } catch { return { ok: false, message: 'That base URL is not allowed.' } }
      if (desc.protocol === 'anthropic') {
        if (!desc.auth?.secret) return { ok: false, message: 'No API key saved yet.' }
        const client = new Anthropic({ baseURL: desc.baseURL, apiKey: desc.auth.secret })
        await client.messages.create({ model: desc.model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] })
        return { ok: true, message: `Connected — ${desc.model} responded.` }
      }
      // openai-protocol connection: a minimal /v1/chat/completions call
      const headers = { 'Content-Type': 'application/json' }
      if (desc.auth?.secret) headers.Authorization = `Bearer ${desc.auth.secret}`
      const res = await fetch(chatCompletionsUrl(desc.baseURL), {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: desc.model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
        signal: AbortSignal.timeout(8000),
      })
      if (res.ok) return { ok: true, message: `Connected — ${desc.model} responded.` }
      const text = await res.text().catch(() => '')
      return { ok: false, message: `Rejected (${res.status}): ${text.slice(0, 140)}` }
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
  const sel = selectSkills(context)
  for (const id of sel) out += SKILLS[id].fragment(engine)
  // real-hardware dims (catalog) for any token in THIS prompt — independent of skill
  // selection, so "fits the M3/608 you already own" holds even when no skill fires.
  out += hardwareDirective(context)
  // composition (P7): when >=2 skills share a concept (clearance, wall, …) via paramAliases,
  // tell the model to emit ONE Customizer parameter per shared concept, not one per mechanism;
  // and (kit intent) mandate a correctly-mated assembled all-view so the pieces don't scatter.
  out += compositionDirective(sel)
  out += matingDirective(sel, context?.kit)
  // source-type-routed vision guidance (P6 ws3): the model-emitted sourceType (carried from
  // the prior turn's intent) takes precedence; on the first image turn the client's coarse
  // sourceHint (derived from attached image roles) routes it. Text-only requests add nothing.
  out += visionSourceFragment(context?.intent?.sourceType ?? context?.sourceHint)
  return out
}

/** Inject the real catalog dimensions for any hardware named in the prompt, regardless of
 *  which skills fired — so a clearance hole / bearing pocket is correct by construction, not
 *  by the model's recall. '' when the prompt names no hardware (byte-identical otherwise). */
export function hardwareDirective(context) {
  const items = billOfMaterials(context?.prompt ?? '')
  if (!items.length) return ''
  const lines = items.map((it) => `- ${it.note}.`).join('\n')
  return `\n\n# Real hardware dimensions\n\nThe request names real hardware — use these EXACT dimensions (mm), never guess a hole or pocket size:\n${lines}`
}

/** Source-type-specific build guidance for image-grounded requests. Routed, NOT always-on —
 *  a text request or an un-classified single image adds nothing. */
const VISION_FRAGMENTS = {
  drawing:
    '\n\n# Working from a drawing\n\nThe reference is a line drawing / CAD sketch — its lines and LABELED dimensions are exact, so build to the numbers, never eyeball. If several orthographic views are shown, reconcile them into ONE solid (front = width × height, side = depth, top = plan), not separate pieces.',
  orthographic:
    '\n\n# Working from orthographic views\n\nThe reference shows orthographic projections of ONE object. Reconcile them into a single solid — front = width × height, side = depth, top = plan — and honor every labeled dimension exactly. Never model the views as separate parts.',
  multiview:
    '\n\n# Working from multiple views\n\nThe images are several views of ONE object (a global plus cropped regions, or front/side/top). Reconcile them into ONE coherent solid; use the crops for detail the global is too coarse to show, and do not duplicate a feature visible in two views.',
  multiobject:
    '\n\n# Working from multiple objects\n\nThe reference shows several distinct objects. Model EACH as its own part (a multi-part kit with a `part` enum) unless asked for only one — do not fuse them or model just the most prominent.',
  photo:
    '\n\n# Working from a photo\n\nThe reference is a photograph — perspective distorts proportions and there are no exact dimensions. Estimate scale from any in-frame reference and state the assumption; prioritize the silhouette and distinctive features over absolute size.',
}
export function visionSourceFragment(sourceType) {
  return (typeof sourceType === 'string' && VISION_FRAGMENTS[sourceType]) || ''
}

/** Composition merge directive (P7): when >=2 selected skills declare the SAME concept in their
 *  paramAliases (e.g. both expose a 'clearance'), tell the model to emit ONE Customizer parameter
 *  per shared concept and reconcile ranges — never one per mechanism. '' for <2 skills / no overlap
 *  (so single-/zero-skill assembly stays byte-identical). Concept names are resolved, not hardcoded. */
export function compositionDirective(skillIds) {
  if (!Array.isArray(skillIds) || skillIds.length < 2) return ''
  const count = {}
  for (const id of skillIds) for (const concept of Object.keys(SKILLS[id]?.paramAliases ?? {})) count[concept] = (count[concept] || 0) + 1
  const shared = Object.keys(count).filter((c) => count[c] >= 2)
  if (!shared.length) return ''
  return `\n\n# Merge shared parameters\n\nThese mechanisms share concepts (${shared.join(', ')}). Emit ONE Customizer parameter for each shared concept — not one per mechanism — reconciling the [min:step:max] ranges to the tightest safe band; keep genuinely distinct concepts distinct.`
}

/** Composition mating directive (P7): when >=2 skills compose into a kit, mandate the multi-part
 *  convention with a CORRECTLY-MATED all-view (coincident joint axes + explode knob), so composed
 *  kits assemble instead of scattering. '' unless >=2 skills AND kit intent (keeps non-kit/single
 *  assembly byte-identical). Principle-only — no named object. */
/** Phrase one derived mate as a concrete instruction (the model resolves the fit mm from the FIT ladder). */
function describeMate({ provider, consumer, port, fit }) {
  switch (port) {
    case 'shaft':
      return `${provider}'s shaft/pin seats into ${consumer}'s bore on ONE shared axis — a ${fit} clearance (bore = shaft + clearance) so it turns freely without slop`
    case 'mesh':
      return `${provider} meshes with ${consumer} — they MUST share the module and sit at the correct centre distance, with backlash > 0`
    case 'peg':
      return `${provider}'s peg/clip engages ${consumer}'s socket/keeper — a ${fit} fit`
    case 'spring':
      return `${consumer} houses the ${provider} — size the pocket so the spring compresses freely (pitch > wire)`
    default:
      return `${provider} mates with ${consumer} (${fit} fit)`
  }
}

export function matingDirective(skillIds, isKit) {
  if (!isKit || !Array.isArray(skillIds) || skillIds.length < 2) return ''
  const generic = `\n\n# Assemble the kit\n\nThis is a multi-mechanism KIT. Use a single \`part\` enum with \`all\` FIRST, then one option per piece. In the \`all\` view, place every piece on ONE shared datum with their JOINT AXES COINCIDENT (an axle bore on the axle's axis, a snap male in its socket) so the pieces MATE — assembled, never scattered. Expose an \`explode\` parameter (default 0 = fully assembled) that fans the pieces apart along their joint axes for preview.`
  // derive specific mates from the port graph; fall back to the generic directive when none apply
  const { mates, conflicts } = composePlan(skillIds)
  if (!mates.length && !conflicts.length) return generic
  let out = generic + `\n\nMate these specific joints:`
  for (const m of mates) out += `\n- ${describeMate(m)}.`
  for (const [a, b] of conflicts) out += `\n- NOTE: ${a} and ${b} are flagged as conflicting — reconcile or drop one.`
  return out
}

/** Text of the most recent user turn, for prompt-intent skill retrieval. Handles both
 *  plain-string content and the structured array form (image turns carry text parts). */
function latestUserText(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m?.role !== 'user') continue
    if (typeof m.content === 'string') return m.content
    if (Array.isArray(m.content)) return m.content.filter((p) => p?.type === 'text').map((p) => p.text).join(' ')
    return ''
  }
  return ''
}

/** Largest ```scad fenced block in the model's reply (a server-side mirror of the client
 *  extractor) — used only for the advisory post-generation skill review. */
export function extractScadBlock(text) {
  const re = /```(?:scad|openscad)?\s*\n([\s\S]*?)```/g
  let best = null
  let len = 0
  for (const m of String(text).matchAll(re)) if (m[1].length > len) { len = m[1].length; best = m[1].trim() }
  return best
}

/** Resolve which skills a request selected (same logic streamChat used to build the prompt)
 *  and run their validators on the generated code. ADVISORY ONLY — never blocks or rewrites.
 *  Returns { skillIds } (everything that fired), { droppedSkillIds } (matched but cut by the
 *  cap, so the client can offer to promote one instead of silently losing it), and { report }
 *  ([{id, issues}] for the ones that flagged something). */
export function reviewWithSkills({ context, messages, code }) {
  const { selected: skillIds, dropped: droppedSkillIds } = selectSkillsDetailed({
    ...context,
    prompt: context?.prompt ?? latestUserText(messages || []),
  })
  const report = []
  if (code) {
    for (const id of skillIds) {
      const issues = SKILLS[id]?.validate ? SKILLS[id].validate(code) : []
      if (issues.length) report.push({ id, issues })
    }
  }
  return { skillIds, droppedSkillIds, report }
}

/* ────────────────────────────────────────────────────────────────
   Engine dispatch — resolve an engine id to a PROTOCOL descriptor,
   then run the matching adapter. Adding a provider becomes a
   descriptor (a catalog row), not a new branch in a switch. The
   built-ins below are the seam the connection store (P2) plugs into:
   resolveConnectionDescriptor() returns the same shape for a saved
   connection, so streamChat dispatches both through ADAPTERS.
   ──────────────────────────────────────────────────────────────── */

/** Protocol adapters, keyed by descriptor.protocol. Each takes
 *  { desc, messages, ctx, onDelta, signal, effort } and resolves when the stream completes. */
const ADAPTERS = {
  anthropic: streamAnthropicProtocol,
  openai: streamOpenAiProtocol,
  cli: streamClaudeCodeAdapter,
}

/** Map a built-in engine id to its protocol descriptor. `null` for an unknown id.
 *  Exported so the dispatch is unit-testable (bench/server.selftest.mjs). */
export function resolveEngineDescriptor(engine, model) {
  if (engine === 'anthropic') {
    const m = anthropicModel()
    return { protocol: 'anthropic', who: 'Anthropic', model: m, baseURL: null, auth: { kind: 'default' }, maxTokens: anthropicMaxTokens(m), thinking: true, caching: true, effort: true }
  }
  if (engine === 'kimi') {
    // Anthropic-compatible endpoint, payload kept portable: no thinking, no cache_control.
    return { protocol: 'anthropic', who: 'Kimi', model: model && model !== 'default' ? model : kimiModel(), baseURL: kimiBaseUrl(), auth: { kind: 'kimi' }, maxTokens: KIMI_MAX_TOKENS, thinking: false, caching: false, effort: false }
  }
  if (engine === 'claude-code') {
    return { protocol: 'cli', who: 'Claude Code', model }
  }
  if (typeof engine === 'string' && engine.startsWith('local:')) {
    return { protocol: 'openai', who: 'Local LLM', model: engine.slice(6), baseURL: localBaseUrl(), auth: null, maxTokens: LOCAL_NUM_PREDICT, numCtx: LOCAL_NUM_CTX }
  }
  if (typeof engine === 'string' && engine.startsWith('conn:')) {
    const conn = getConnection(engine.slice(5))
    return conn ? resolveConnectionDescriptor(conn) : null
  }
  return null
}

// SENT max_tokens for a marketplace connection: the model's real ceiling clamped to a sane default.
// A SCAD program + reasoning fits well under it, and reserving a model's full 128k would starve the
// history budget (the ceiling itself stays visible in the UI as the informational maxOutput).
const CONNECTION_DEFAULT_OUTPUT = 32000

function isLocalhostUrl(url) {
  try {
    const h = new URL(url).hostname.replace(/^\[|\]$/g, '')
    return h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '::1'
  } catch {
    return false
  }
}

/** Resolve a saved-connection payload (P2 marketplace) to a protocol descriptor. The client sends
 *  the NON-secret connection record; the secret is read here from process.env (the .env line keyed
 *  by auth.envKey) so it never round-trips to the browser. `null` for an unsupported protocol. */
export function resolveConnectionDescriptor(conn) {
  if (!conn || typeof conn !== 'object') return null
  const who = (typeof conn.label === 'string' && conn.label) || conn.catalogId || 'Provider'
  const model = typeof conn.model === 'string' ? conn.model : undefined
  const baseURL = (typeof conn.baseUrl === 'string' && conn.baseUrl) || null
  const caps = conn.caps && typeof conn.caps === 'object' ? conn.caps : {}
  const secret = conn.auth?.envKey ? process.env[conn.auth.envKey] : undefined
  const ceiling = Math.max(1, Math.floor(Number(caps.maxOutputTokens) || CONNECTION_DEFAULT_OUTPUT))
  const maxTokens = Math.min(CONNECTION_DEFAULT_OUTPUT, ceiling)
  // a connection pointed at a localhost server (e.g. custom-openai → Ollama) needs the num_ctx
  // options block; a hosted API must NOT receive it. Detect by hostname, not a catalog flag.
  const isLocal = isLocalhostUrl(baseURL)
  if (conn.protocol === 'anthropic') {
    return { protocol: 'anthropic', who, model, baseURL, auth: { kind: 'apikey', secret }, maxTokens, thinking: !!caps.thinking, caching: !!caps.promptCaching, effort: !!caps.thinking }
  }
  if (conn.protocol === 'openai') {
    // num_ctx is an Ollama-only knob — send it ONLY for a local connection, never to a hosted API.
    return { protocol: 'openai', who, model, baseURL, auth: secret ? { secret } : null, maxTokens, numCtx: isLocal ? caps.contextWindow || LOCAL_NUM_CTX : undefined }
  }
  return null
}

export async function streamChat({ engine, model, effort, messages, context, onDelta, signal }) {
  // seed prompt-intent retrieval from the latest user turn unless the caller pinned skillIds
  const ctx = contextText({ ...context, prompt: context?.prompt ?? latestUserText(messages) }, engine)
  // built-in id OR a saved-connection id (conn:<id>); resolveEngineDescriptor handles both, reading
  // the connection's secret server-side from .env — the client only ever sends the id, never the key
  const desc = resolveEngineDescriptor(engine, model)
  if (!desc) throw new UserFacingError(`Unknown engine "${engine}".`)
  const adapter = ADAPTERS[desc.protocol]
  if (!adapter) throw new UserFacingError(`No adapter for protocol "${desc.protocol}".`)
  return adapter({ desc, messages, ctx, onDelta, signal, effort })
}

export class UserFacingError extends Error {}

/* ── Anthropic-protocol adapter — first-party Claude AND Anthropic-compatible providers (Kimi, and
   P2's GLM / DeepSeek / custom). Capability-driven: thinking / effort / the cache_control'd system
   block are sent ONLY when the descriptor opts in, so a portable provider gets a plain payload (no
   thinking, no cache_control) while first-party Claude keeps adaptive thinking + prompt caching. ── */
async function streamAnthropicProtocol({ desc, messages, ctx, onDelta, signal, effort }) {
  const { attempts, kimiLogin } = anthropicAuthAttempts(desc)
  // first-party caches the system prompt (block array + cache_control); portable providers take the
  // plain concatenated string so the payload stays protocol-portable.
  let system
  if (desc.caching) {
    system = [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }]
    if (ctx) system.push({ type: 'text', text: ctx })
  } else {
    system = SYSTEM_PROMPT + ctx
  }
  const body = {
    model: desc.model,
    // table-driven output ceiling (anthropicMaxTokens); for Kimi/compat it's the descriptor's cap.
    max_tokens: desc.maxTokens,
    ...(desc.thinking ? { thinking: { type: 'adaptive' } } : {}),
    // effort is GA on Opus 4.8 (no beta header) and coexists with adaptive thinking; falls back to
    // DEFAULT_EFFORT (VIBEMESH_EFFORT or xhigh) when unset. Only sent for effort-capable engines.
    ...(desc.effort ? { output_config: { effort: resolveEffort(effort) } } : {}),
    system,
    messages,
  }

  let lastAuthError = null
  for (const attempt of attempts) {
    const client = new Anthropic({ ...attempt.clientOpts, timeout: GEN_TIMEOUT_MS, maxRetries: GEN_MAX_RETRIES })
    const stream = client.messages.stream(body, { signal })
    stream.on('text', onDelta)
    try {
      const final = await stream.finalMessage()
      // Forward stop_reason so the client can tell a complete reply from one cut off at the
      // output-token ceiling ('max_tokens') instead of feeding half a program to the parser.
      return { stopReason: final?.stop_reason ?? undefined }
    } catch (error) {
      // multi-attempt providers (Kimi: x-api-key vs Bearer) fall through to the next auth style on
      // an auth/403; every other error — and the final attempt — is surfaced.
      if (attempts.length > 1 && (error instanceof Anthropic.AuthenticationError || error?.status === 403)) {
        lastAuthError = error
        continue
      }
      throw translateAnthropicError(error, desc.who)
    }
  }
  if (kimiLogin) {
    throw new UserFacingError(
      'Kimi rejected the CLI login token. Their coding API needs a key from the Kimi Code console (kimi.com → Kimi Code → API keys, included in your subscription) — put it in .env as KIMI_API_KEY and restart.',
    )
  }
  throw translateAnthropicError(lastAuthError, desc.who)
}

/** Ordered Anthropic-client auth attempts for a descriptor. A list so Kimi's CLI login token can
 *  fall back between x-api-key and Authorization: Bearer. Throws UserFacingError when not connected.
 *  Returns { attempts, kimiLogin } (kimiLogin → the login-only rejection message above). */
function anthropicAuthAttempts(desc) {
  const kind = desc.auth?.kind
  if (kind === 'default') {
    // first-party: the SDK reads ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN from the environment.
    return { attempts: [{ clientOpts: {} }], kimiLogin: false }
  }
  if (kind === 'kimi') {
    const auth = kimiAuth()
    if (!auth) throw new UserFacingError('Kimi is not connected. Log in with the kimi CLI, or create an API key in the Kimi Code console and set KIMI_API_KEY in .env.')
    const secret = auth.kind === 'api-key' ? auth.apiKey : auth.token
    const styles = auth.kind === 'api-key' ? ['x-api-key', 'bearer'] : ['bearer', 'x-api-key']
    const attempts = styles.map((style) => ({
      clientOpts: style === 'x-api-key' ? { baseURL: desc.baseURL, apiKey: secret } : { baseURL: desc.baseURL, apiKey: null, authToken: secret },
    }))
    return { attempts, kimiLogin: auth.kind === 'login' }
  }
  if (kind === 'apikey') {
    // generic Anthropic-compatible provider (P2: GLM / DeepSeek / custom-anthropic). Key passed inline.
    if (!desc.auth.secret) throw new UserFacingError(`${desc.who} is not connected — add its API key.`)
    return { attempts: [{ clientOpts: { baseURL: desc.baseURL, apiKey: desc.auth.secret } }], kimiLogin: false }
  }
  throw new UserFacingError(`Unsupported auth kind for ${desc.who}.`)
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

/* ── CLI adapter — Claude Code subscription login (Agent SDK) ── */

async function streamClaudeCodeAdapter({ desc, messages, ctx, onDelta, signal, effort }) {
  const model = desc.model
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

/* ── OpenAI-protocol adapter — local (Ollama / LM Studio) AND hosted OpenAI-compatible providers
   (P2: OpenAI / OpenRouter / DeepSeek / custom). Differences are descriptor-driven: a local engine
   carries numCtx (sends Ollama's options block) and no auth; a hosted engine carries a Bearer key
   and no numCtx (a clean OpenAI payload). ── */

/** Build the chat-completions URL, tolerant of base URLs WITH a version segment (hosted APIs:
 *  `https://api.openai.com/v1`, OpenRouter `…/api/v1`, Gemini's OpenAI shim `…/v1beta/openai`) OR
 *  WITHOUT one (bare hosts: Ollama `http://localhost:11434`, `https://api.deepseek.com`). Prevents a
 *  double `/v1` on hosted providers while still adding `/v1` for bare hosts. */
/** Strip trailing slashes without a regex (avoids the ReDoS a `/\/+$/` over attacker-controlled
 *  input would carry). */
function trimTrailingSlashes(s) {
  let i = String(s).length
  while (i > 0 && s[i - 1] === '/') i--
  return String(s).slice(0, i)
}
function openAiApiUrl(baseURL, apiPath) {
  const b = trimTrailingSlashes(baseURL)
  // `\d\w*` (single digit + word chars), NOT `\d+\w*` — the latter has two adjacent quantifiers over
  // overlapping classes (\d ⊂ \w), which backtracks polynomially on a crafted host (ReDoS).
  return /\/v\d\w*(\/openai)?$/.test(b) ? `${b}/${apiPath}` : `${b}/v1/${apiPath}`
}
export function chatCompletionsUrl(baseURL) {
  return openAiApiUrl(baseURL, 'chat/completions')
}

/** Live model discovery for a connection (generalizes the Kimi/local listers): query the provider's
 *  models endpoint with the supplied key. Returns model ids (newest-first as the API gives them) or
 *  null on any failure. Used by POST /api/discover-models to populate the add-form picker. */
export async function discoverModels({ protocol, baseUrl, secret }) {
  if (!baseUrl) return null
  try {
    // re-validate at the fetch site (defense-in-depth beyond the route guard): http(s)-only,
    // cloud-metadata + link-local blocked. Throws on a bad/blocked host → caught → null.
    validateFetchUrl(baseUrl)
    if (protocol === 'anthropic') {
      const url = `${trimTrailingSlashes(baseUrl)}/v1/models`
      const res = await fetch(url, { headers: { 'x-api-key': secret || '', 'anthropic-version': '2023-06-01' }, signal: AbortSignal.timeout(6000) })
      if (!res.ok) return null
      const body = await res.json()
      return (body.data ?? body.models ?? []).map((m) => m.id ?? m.name).filter(Boolean)
    }
    const headers = {}
    if (secret) headers.Authorization = `Bearer ${secret}`
    const res = await fetch(openAiApiUrl(baseUrl, 'models'), { headers, signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    const body = await res.json()
    return (body.data ?? body.models ?? []).map((m) => m.id ?? m.name).filter(Boolean)
  } catch {
    return null
  }
}

async function streamOpenAiProtocol({ desc, messages, ctx, onDelta, signal }) {
  const baseURL = desc.baseURL
  const who = desc.who
  // http(s)-only + cloud-metadata/link-local blocked (localhost IS allowed — local LLMs live there).
  // Connections are pre-validated on save; this guards the fetch site itself.
  try { validateFetchUrl(baseURL) } catch { throw new UserFacingError(`Invalid base URL for ${who}.`) }
  // Bound the whole request by the same generation timeout as the SDK engines, combined with the
  // caller's abort (client disconnect). AbortSignal.timeout fires a TimeoutError we translate; the
  // merged signal also aborts mid-stream if the model stalls past the budget.
  const timeoutSignal = AbortSignal.timeout(GEN_TIMEOUT_MS)
  const fetchSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
  const isTimeout = (err) => err?.name === 'TimeoutError' || (timeoutSignal.aborted && !signal?.aborted)
  const timeoutError = () =>
    new UserFacingError(
      `${who} did not respond within ${Math.round(GEN_TIMEOUT_MS / 60000)} min — raise VIBEMESH_GEN_TIMEOUT_MS${desc.numCtx ? ' or use a smaller model' : ''}.`,
    )

  // For local (Ollama) the options.num_ctx/num_predict knobs are belt-and-suspenders: without them
  // Ollama's ~2-4K default context truncates the system prompt and its ~128-token output default
  // cuts programs off mid-module. LM Studio + hosted OpenAI-compatible APIs honor top-level
  // max_tokens and ignore `options`; we send `options` ONLY when numCtx is set (a local engine).
  const body = {
    model: desc.model,
    stream: true,
    max_tokens: desc.maxTokens,
    temperature: 0.2,
    ...(desc.numCtx ? { options: { num_ctx: desc.numCtx, num_predict: desc.maxTokens, temperature: 0.2 } } : {}),
    messages: [{ role: 'system', content: SYSTEM_PROMPT + ctx }, ...messages.map(toOpenAiMessage)],
  }
  const headers = { 'Content-Type': 'application/json' }
  // hosted OpenAI-compatible providers take a Bearer key; a local server (no auth) sends none.
  if (desc.auth?.secret) headers.Authorization = `Bearer ${desc.auth.secret}`

  let res
  try {
    res = await fetch(chatCompletionsUrl(baseURL), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: fetchSignal,
    })
  } catch (err) {
    if (isTimeout(err)) throw timeoutError()
    if (err?.name === 'AbortError') throw err
    throw new UserFacingError(`Could not reach ${who} at ${baseURL}${desc.numCtx ? ' — is Ollama/LM Studio running?' : '.'}`)
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new UserFacingError(`${who} error (${res.status}): ${text.slice(0, 300)}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  // OpenAI-shaped finish_reason: 'length' means the output hit num_predict/max_tokens and the
  // program is truncated. Normalize to 'max_tokens' so the client's single truncation check works
  // across engines (the 4096-token local default is the most likely to trip this).
  let finishReason
  const result = () => ({ stopReason: finishReason === 'length' ? 'max_tokens' : undefined })
  try {
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
        if (payload === '[DONE]') return result()
        try {
          const chunk = JSON.parse(payload)
          const delta = chunk.choices?.[0]?.delta?.content
          if (delta) onDelta(delta)
          if (chunk.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason
        } catch {
          /* keep-alive or partial line */
        }
      }
    }
  } catch (err) {
    // a mid-stream timeout aborts reader.read() with a TimeoutError — translate it. A client
    // disconnect rethrows; the generate route's `abort.signal.aborted` guard then ends quietly.
    if (isTimeout(err)) throw timeoutError()
    throw err
  }
  return result()
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

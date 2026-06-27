import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/* ────────────────────────────────────────────────────────────────
   Connection marketplace (P2). The user adds provider connections;
   only added connections (plus the zero-config built-ins) appear in
   the Engines panel. This module owns the NON-SECRET metadata store
   (a JSON file beside .env); the API key for each connection lives
   in .env as CONN_<id>_KEY and is written by providers.applyRuntimeSetting
   (kept here-free to avoid a circular import). The two protocol
   families reuse the SAME adapters as the built-ins, so a new
   provider is a catalog row + a saved record — never new dispatch code.
   ──────────────────────────────────────────────────────────────── */

const STORE_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.connections.json')
const ID_RE = /^[a-z0-9]{3,24}$/

/** Catalog of known providers — defaults for the "Add connection" gallery. Base URLs / caps
 *  fact-checked 2026-06-20 (docs/ENGINE-MARKETPLACE-DESIGN.md §3/§8). `caps.maxOutputTokens` is the
 *  model's REAL ceiling (shown in the UI); the SENT max_tokens is clamped to a sane default. A
 *  `custom: true` entry is a fully user-defined endpoint (the user supplies base URL + model). */
export const CATALOG = [
  {
    id: 'openai', label: 'OpenAI · GPT', protocol: 'openai', baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.5', models: ['gpt-5.5', 'gpt-5.5-pro', 'gpt-5.4', 'gpt-5.4-mini'],
    caps: { contextWindow: 1050000, maxOutputTokens: 128000, vision: true, thinking: false },
    connect: { placeholder: 'sk-…', url: 'https://platform.openai.com/api-keys', urlLabel: 'Get a key at platform.openai.com' },
  },
  {
    id: 'openrouter', label: 'OpenRouter · any model', protocol: 'openai', baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'x-ai/grok-4.3', models: ['x-ai/grok-4.3', 'deepseek/deepseek-chat', 'mistralai/mistral-large', 'google/gemini-3-flash', 'anthropic/claude-opus-4.8'],
    caps: { contextWindow: 256000, maxOutputTokens: 32000, vision: true, thinking: false },
    connect: { placeholder: 'sk-or-…', url: 'https://openrouter.ai/keys', urlLabel: 'Get a key at openrouter.ai' },
  },
  {
    id: 'deepseek', label: 'DeepSeek', protocol: 'openai', baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat', models: ['deepseek-chat', 'deepseek-reasoner'],
    caps: { contextWindow: 128000, maxOutputTokens: 64000, vision: false, thinking: false },
    connect: { placeholder: 'sk-…', url: 'https://platform.deepseek.com/api_keys', urlLabel: 'Get a key at deepseek.com' },
  },
  {
    id: 'glm', label: 'Zhipu GLM', protocol: 'anthropic', baseUrl: 'https://api.z.ai/api/anthropic',
    defaultModel: 'glm-5.2', models: ['glm-5.2', 'glm-4.6'],
    caps: { contextWindow: 1000000, maxOutputTokens: 128000, vision: true, thinking: true },
    connect: { placeholder: 'API key…', url: 'https://z.ai', urlLabel: 'Get a coding-plan key at z.ai' },
  },
  {
    id: 'grok', label: 'xAI · Grok', protocol: 'openai', baseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-4.3', models: ['grok-4.3'],
    caps: { contextWindow: 1000000, maxOutputTokens: 32000, vision: true, thinking: false },
    connect: { placeholder: 'xai-…', url: 'https://console.x.ai', urlLabel: 'Get a key at console.x.ai' },
  },
  {
    id: 'mistral', label: 'Mistral', protocol: 'openai', baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-large-2512', models: ['mistral-large-2512'],
    caps: { contextWindow: 256000, maxOutputTokens: 32000, vision: true, thinking: false },
    connect: { placeholder: 'API key…', url: 'https://console.mistral.ai/api-keys', urlLabel: 'Get a key at mistral.ai' },
  },
  {
    // Gemini rides its OpenAI-compatible shim (…/v1beta/openai) — no native generateContent adapter
    // needed for text+image → text. `gemini-3-pro-preview` was retired 2026-03-09 (fact-check §3).
    id: 'gemini', label: 'Google · Gemini', protocol: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3.5-flash', models: ['gemini-3.5-flash', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite'],
    caps: { contextWindow: 1048576, maxOutputTokens: 65536, vision: true, thinking: false },
    connect: { placeholder: 'AI Studio API key…', url: 'https://aistudio.google.com/apikey', urlLabel: 'Get a key at aistudio.google.com' },
  },
  {
    id: 'custom-openai', label: 'Custom · OpenAI-compatible', protocol: 'openai', baseUrl: '', custom: true,
    defaultModel: '', models: [],
    caps: { contextWindow: 128000, maxOutputTokens: 32000, vision: false, thinking: false },
    connect: { placeholder: 'API key (blank if none)…', url: '', urlLabel: '' },
  },
  {
    id: 'custom-anthropic', label: 'Custom · Anthropic-compatible', protocol: 'anthropic', baseUrl: '', custom: true,
    defaultModel: '', models: [],
    caps: { contextWindow: 200000, maxOutputTokens: 64000, vision: false, thinking: false },
    connect: { placeholder: 'API key…', url: '', urlLabel: '' },
  },
]

export function catalogEntry(id) {
  return CATALOG.find((c) => c.id === id) || null
}

/** The .env key that holds a connection's secret. Pattern-allowlisted in providers.validateRuntimeSetting. */
export function connectionEnvKey(id) {
  return `CONN_${id}_KEY`
}

let cache = null
function load() {
  if (cache) return cache
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'))
    cache = Array.isArray(parsed) ? parsed : []
  } catch {
    cache = []
  }
  return cache
}
function persist() {
  // 0o600: the file holds no secrets (those are in .env) but keep it owner-only for tidiness.
  fs.writeFileSync(STORE_PATH, JSON.stringify(cache ?? [], null, 2) + '\n', { mode: 0o600 })
}

/** Non-secret connection records (a copy, so callers can't mutate the cache). */
export function listConnections() {
  return load().map((c) => ({ ...c }))
}
export function getConnection(id) {
  const c = load().find((x) => x.id === id)
  return c ? { ...c } : null
}

class ConnectionError extends Error {}
export { ConnectionError }

const METADATA_HOSTS = new Set(['metadata.google.internal', 'metadata.goog'])

/** Is this hostname a private / loopback / CGNAT address that should be DEFAULT-denied for a
 *  non-loopback deployment (RFC1918 + 127.x + 0.0.0.0 + 100.64/10 CGNAT + IPv6 loopback/ULA)?
 *  These are re-permitted by ALLOW_PRIVATE_FETCH=1 for the local-LLM (Ollama/LM Studio) use case.
 *  Cloud-metadata + link-local (169.254 / fe80:) are handled separately and are ALWAYS blocked. */
function isPrivateHost(h) {
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  if (h === '0.0.0.0' || h === '::' || h === '::1') return true
  if (h.startsWith('::ffff:')) return isPrivateHost(h.slice(7)) // IPv4-mapped IPv6
  if (/^fc|^fd/.test(h)) return true // IPv6 ULA fc00::/7
  if (/^127\./.test(h)) return true // IPv4 loopback
  if (/^10\./.test(h)) return true // RFC1918 10/8
  if (/^192\.168\./.test(h)) return true // RFC1918 192.168/16
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true // RFC1918 172.16/12
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return true // CGNAT 100.64/10
  return false
}

/** http(s)-only SSRF guard. ALWAYS blocks the cloud metadata service (169.254.x link-local /
 *  metadata hostnames) — the highest-value SSRF target when HOST=0.0.0.0. By DEFAULT it also blocks
 *  private/loopback ranges (RFC1918, 127.x, IPv6 ULA, 0.0.0.0, 100.64/10 CGNAT) so a non-loopback
 *  deployment can't be turned into an internal-network probe via /api/discover-models. Set
 *  ALLOW_PRIVATE_FETCH=1 to re-permit those ranges for a local LLM (Ollama/LM Studio) — see SECURITY.md.
 *  LIMITATION: this is a URL-SHAPE guard (it inspects the literal hostname), NOT a DNS-rebinding
 *  defense — a hostname that resolves to a private IP at fetch time is not caught here.
 *  Throws ConnectionError on a bad/blocked URL; returns the trimmed value. Shared by saveConnection
 *  and POST /api/discover-models. */
export function validateFetchUrl(value) {
  const v = String(value ?? '').trim()
  let u
  try {
    u = new URL(v)
  } catch {
    throw new ConnectionError('Base URL must be a valid http(s) URL.')
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new ConnectionError('Base URL must use http or https.')
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  // Metadata + link-local are NEVER allowed, even under the opt-in.
  if (METADATA_HOSTS.has(h) || /^169\.254\./.test(h) || h.startsWith('fe80:')) {
    throw new ConnectionError('That host is not allowed.')
  }
  // Private/loopback ranges are denied by default; ALLOW_PRIVATE_FETCH=1 re-permits them (local LLMs).
  const allowPrivate = process.env.ALLOW_PRIVATE_FETCH === '1' || process.env.ALLOW_PRIVATE_FETCH === 'true'
  if (!allowPrivate && isPrivateHost(h)) {
    throw new ConnectionError('Private/loopback addresses are blocked. Set ALLOW_PRIVATE_FETCH=1 to allow a local LLM.')
  }
  return v
}

function safeUrl(value, { required }) {
  const v = String(value ?? '').trim()
  if (!v) {
    if (required) throw new ConnectionError('A base URL is required for a custom endpoint.')
    return ''
  }
  return validateFetchUrl(v)
}

/** Add or update a connection's NON-SECRET metadata. Returns the stored record (the caller writes
 *  the secret to .env separately, via providers.applyRuntimeSetting on record.auth.envKey). Throws
 *  ConnectionError on a bad catalog id / model / base URL (the SSRF http(s) guard lives here too). */
export function saveConnection(input) {
  const cat = catalogEntry(input?.catalogId)
  if (!cat) throw new ConnectionError(`Unknown provider "${input?.catalogId}".`)
  const id = typeof input.id === 'string' && ID_RE.test(input.id) ? input.id : newConnId()
  const baseUrl = safeUrl(input.baseUrl || cat.baseUrl, { required: !!cat.custom })
  const model = String(input.model || cat.defaultModel || '').trim()
  if (!model) throw new ConnectionError('A model is required.')
  const label = String(input.label || cat.label || cat.id).trim().slice(0, 60) || cat.label
  const caps = {
    contextWindow: posInt(input.caps?.contextWindow, cat.caps.contextWindow),
    maxOutputTokens: posInt(input.caps?.maxOutputTokens, cat.caps.maxOutputTokens),
    vision: input.caps?.vision != null ? !!input.caps.vision : !!cat.caps.vision,
    thinking: input.caps?.thinking != null ? !!input.caps.thinking : !!cat.caps.thinking,
    promptCaching: false, // portable: never cache_control on a third-party endpoint
  }
  const record = {
    id,
    catalogId: cat.id,
    label,
    protocol: cat.protocol,
    transport: 'http',
    baseUrl,
    model,
    auth: { method: 'api-key', envKey: connectionEnvKey(id) },
    caps,
  }
  const list = load()
  const i = list.findIndex((c) => c.id === id)
  if (i >= 0) list[i] = record
  else list.push(record)
  persist()
  return { ...record }
}

/** Remove a connection's metadata. Returns the removed record (so the caller can clear its .env
 *  key) or null if it wasn't found. */
export function removeConnection(id) {
  const list = load()
  const i = list.findIndex((c) => c.id === id)
  if (i < 0) return null
  const [removed] = list.splice(i, 1)
  persist()
  return removed
}

function posInt(value, fallback) {
  const n = Math.floor(Number(value))
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function newConnId() {
  // short, .env-safe, collision-resistant enough for a single-user local store
  return 'c' + Date.now().toString(36).slice(-6) + Math.floor(Math.random() * 1e6).toString(36)
}

# Vibemesh-AI — Engine Connection Marketplace & AI-Config Reality Check

> Design output by a two-member senior board (Senior Architect + Senior Lead, 2026-06-20),
> grounded against the real code and verified by the orchestrator. **Design only — no code changed.**
> Provider figures **fact-checked via live web search on 2026-06-20** (10-provider, 21-agent
> dual-verification workflow); §3 and §8 carry the corrected numbers and §8's closing note lists the
> volatile surfaces to re-verify at implementation time.
> Driving asks: (1) "why is `max_tokens` not bound to the model — Opus can do 1M"; (2) "support
> almost all famous CLIs/APIs in a marketplace where the user adds only the connections he needs";
> (3) "let me control the timeout — a 15-min cutoff fired while I was fine to wait."
>
> Verdict: the marketplace direction is **right and the codebase is ~80% there**; the two config
> pains are **real and cheap to fix**; MCP is the **wrong primitive** for adding a provider; and
> "ride every CLI" should become **"ride API keys, treat CLI logins as personal-use-only."**

---

## 1. Executive summary

The product owner wants Vibemesh-AI to talk to most frontier providers (Anthropic, OpenAI, Gemini,
Kimi, GLM, DeepSeek, …) and to manage them like a marketplace: add a connection, and only added
connections show up. The board agrees with the destination. Three corrections and two upgrades:

1. **`max_tokens` reality check.** The owner conflates two different numbers. **Context window** (the
   "200k / 1M" figure) is total input+output the model *accepts*; **max output** (the `max_tokens`
   we send) is a separate, much smaller cap on what it can *write back* — never ~1M on any model.
   But he's half-right: our `ANTHROPIC_MAX_TOKENS = 64000` is a **flat constant not bound to the
   model** (`server/providers.mjs:96`, used at `:558`), and Opus 4.8 actually permits **128k**
   output today — so we leave half the ceiling on the table. Fix = a per-model capability table with
   a user override clamped to the model's real max. (§3)

2. **The 15-minute timeout — root-caused.** There is **no wall-clock timeout in our code** (only the
   AbortController on client disconnect, `server/index.mjs:76`). The cutoff comes from the
   **`@anthropic-ai/sdk` default request timeout of 600000 ms (10 min)** which we never override
   (`new Anthropic()` at `server/providers.mjs:550`), **× its 2 automatic retries** → the ~15-min
   total. At **Opus 4.8 + xhigh** the danger is a long *time-to-first-token* while the model thinks,
   which trips the SDK's per-request timer and triggers a retry. Fix = an explicit, configurable
   `timeout` + `maxRetries: 1` + a deliberate Node `server.requestTimeout`. (§4)

3. **MCP is the wrong layer.** "Add a provider via MCP" is a category error — MCP governs *what a
   model can do* (tools/resources it calls out to), not *which model answers* or how to authenticate
   to it. The right primitive for "one connection, many models" is an **LLM gateway** (OpenRouter /
   LiteLLM), which in this design is just *another OpenAI-compatible catalog entry — zero new code*.
   (§6)

The big build is two refactors, not a rewrite: **collapse the hardcoded `switch(engine)` dispatch
into a protocol-family adapter** (`server/providers.mjs:538`), and **promote the hardcoded provider
array into a catalog + a persisted user-connections store** (`server/providers.mjs:249`). Because
Kimi already proves an Anthropic-compatible provider needs only `{baseURL, apiKey, model}`, and the
`local:*` path already proves the OpenAI-compatible shape, **most named providers become a catalog
row, not a code branch.** Only Gemini's native protocol needs a genuinely new adapter — and even it
publishes an OpenAI-compatible endpoint that sidesteps that work.

**Recommended sequence:** quick config wins (§3+§4, ~1 day) → adapter refactor (§5, behavior-identical,
bench is the safety net) → marketplace UX + API-key catalog (§7) → Gemini native + live model
discovery (optional). API keys ship first; CLI logins are a ToS trap and stay personal-use-only (§8).

---

## 2. What exists today (the seams we refactor)

- **Dispatch is a hardcoded chain.** `streamChat` branches `anthropic` / `kimi` / `claude-code` /
  `local:*` (`server/providers.mjs:534-542`) into four bespoke stream functions. Adding a provider =
  a new code branch.
- **The provider list is a hardcoded array** rebuilt each `/api/health` (`server/providers.mjs:249`),
  each entry carrying `contextWindow` / `outputReservation` / `efforts` / `vision` / `models`. The
  Engines UI (`src/components/EnginesModal.tsx`, `src/components/ModelMenu.tsx`) is **already
  data-driven over this array** — it buckets by group and renders connect forms from data.
- **Settable keys are a fixed 4-entry allowlist** (`SETTABLE_KEYS` in `server/providers.mjs`), all
  funnelled through one `.env` line-rewrite (`applyRuntimeSetting`) guarded by control-char /
  SSRF checks (`validateRuntimeSetting`).
- **Client model/effort resolution is hardcoded too** — a per-engine ternary in
  `src/state/generationActions.ts` picks the model id. This brittleness dies with the refactor.
- **The protocol family is already latent.** Kimi reuses the Anthropic SDK with a `baseURL` override;
  `local:*` uses raw OpenAI `/v1/chat/completions`. The adapter pattern is implicit — we make it
  explicit.
- **Capabilities already feed the history budget.** `historyBudgetTokens` (`src/lib/api.ts:122`)
  reads `provider.contextWindow` / `outputReservation`; a wrong value silently truncates the system
  prompt (the documented Ollama `num_ctx` failure). Per-connection caps must be correct.

---

## 3. `max_tokens`: bind output to the model (reality check)

**The two numbers, made unambiguous:**

- **Context window** = total input + output the model accepts. This is the "200k / 1M" headline.
- **Max output (`max_tokens`)** = a separate, smaller per-request cap on the completion. **This is
  what we send. It is never ~1M on any frontier model.**

Current figures, **fact-checked 2026-06-20** (output ≠ context; "preview"/flagship ids drift — re-check at integration, see §8 note):

| Model | Context window | **Max output** | Notes |
|---|---|---|---|
| Claude Opus 4.8 | 1M | **128k** | sync default, no beta header; 300k via Batches only |
| Claude Sonnet 4.6 | 1M | **64k** | — |
| Claude Haiku 4.5 | 200k | **64k** | not 1M context |
| Claude Fable 5 | 1M | **128k** | newer tier above Opus |
| OpenAI GPT-5.5 | ~1.05M | **128k** | **entire GPT-5.x line is 128k output regardless of context** |
| Gemini 3.1 Pro (`-preview`) | 1,048,576 | **65,536** | current Pro; `gemini-3-pro-preview` **shut down 2026-03-09** |
| Gemini 3.5 Flash | 1,048,576 | **65,536** | current GA Flash (default output ~8k — set it explicitly) |
| Kimi K2.6 | 256k (262,144) | **shares window** | no fixed cap; ignore aggregator max-output (LiteLLM bug) |
| GLM-5.2 | 1M | **128k** | current flagship; GLM-4.6 is a cheaper 200k / 128k tier |
| DeepSeek V4 (`-pro`/`-flash`) | 1M | **384k** | 1M/384k is the **default** across V4 |
| DeepSeek V3.2 (legacy) | 128k | **64k** | `deepseek-chat`/`-reasoner`, **retires 2026-07-24** |

**Never extrapolate output from context** — the GPT-5.x line is the clearest proof (128k output at every context size). For Grok / Mistral / Kimi, output "shares the window" (no published completion cap): bound it by `context − prompt`, don't hardcode a number.

**Honest nuance:** our `64000` is not purely arbitrary — the comment at `server/providers.mjs:556`
notes that on Opus 4.8 with *adaptive thinking*, **thinking and output share one budget**, so 64k was
a deliberate floor, not an oversight. The defect is that it's a **flat constant** rather than derived
from the model, and Opus 4.8 now supports 128k.

**Design:**

- Replace the magic constant with a per-model capability table keyed by model id:
  `{ contextWindow, maxOutput }`. This becomes the **single source** for both the history budget
  (`contextWindow`) and the request cap (`maxOutput`), so output stops being a separate magic number.
- Default `max_tokens` to a sane fraction (e.g. `min(maxOutput, 64k)` — enough for a full program +
  adaptive thinking), with a **user override clamped to the model's real `maxOutput`**. A slider that
  lets the user request more must hard-clamp, or the API rejects the call.
- **UI copy that kills the confusion:** show *both* numbers in the Engines panel — *"1M is the
  context window (what you can send); the model still only writes up to ~128k tokens back."*
- **Beta-gating note:** the old `output-128k` / `context-1m` Anthropic beta headers are retired; 128k
  output and the 1M window are now sync-API defaults. We send no `anthropic-beta` headers today, which
  is correct. Only Batch-API 300k remains gated, and we don't use it.

---

## 4. The 15-minute timeout: root cause and the fix

**It is not our code.** No `AbortSignal.timeout`, no `server.requestTimeout` / `headersTimeout` /
`server.setTimeout` override exists on the generate path (the only `setTimeout` is the 5 s SIGTERM
drain at `server/index.mjs:150`). Ranked by evidence:

1. **MOST LIKELY — the Anthropic SDK default timeout × retries.** `@anthropic-ai/sdk` ships
   `DEFAULT_TIMEOUT = 600000` (10 min) and `maxRetries = 2`. We construct `new Anthropic()` with no
   `timeout` (`server/providers.mjs:550`), inheriting both. A timeout is **retryable**, so one stuck
   attempt becomes 10 min + a retry + backoff ≈ **the ~15 min observed**. For streaming the SDK's
   timer effectively guards **time-to-first-token**; at **Opus 4.8 + xhigh** the model can think for
   a long time *before* the first token, trip the timer, abort the fetch, and retry.
2. **Node/Express defaults (secondary).** Unoverridden, Node's `http.Server` applies
   `requestTimeout` (~300 s) and `headersTimeout` — a latent second guillotine on the incoming
   client→server request that would fire at ~5 min, not 15, but should still be set deliberately.
3. **Vite dev proxy (dev-only).** `/api → :5175` with no timeout configured; unlikely the cause, and
   irrelevant in production (`npm start` serves from Express directly).

**Design:**

- Pass an explicit `timeout` to the Anthropic/Kimi/local clients from a knob (env
  `VIBEMESH_GEN_TIMEOUT_MS`, default ~20–30 min) **surfaced in the Engines UI**.
- Set `maxRetries: 1` (or 0) on long-generation calls so a silent retry can't triple the wall clock —
  otherwise "I waited 15 min" is actually *attempt #2*.
- Set Node's `server.requestTimeout` deliberately (large or 0) for the generate route so the 5-min
  default can't pre-empt a long generation. Keep the SIGTERM drain and the `res.on('close')` abort
  wiring intact.
- **UI copy:** *"higher effort = longer wait before the first token; raise the timeout for
  xhigh/max."* (`DEFAULT_EFFORT` is `xhigh` — `server/providers.mjs:239`.)
- **Caveat:** if the slow run was the `claude-code` login engine rather than the `anthropic` API
  engine, the Agent SDK has its own timeout surface; the configurable-timeout knob must thread to
  whichever adapter runs.

---

## 5. The Connection model + adapter pattern

A single record describes any provider connection, separating **catalog identity** (what kind of
provider) from **instance config** (this user's connection). Secrets never live in this record — only
a reference to the server-held `.env` key.

```ts
/** A user-added provider connection. Non-secret fields persist client-side (localStorage);
 *  the secret stays server-side in .env, referenced by auth.envKey. */
interface Connection {
  id: string                  // stable uuid (multiple connections to one catalog entry allowed)
  catalogId: string           // 'anthropic'|'openai'|'gemini'|'deepseek'|'glm'|'kimi'|'local'
                              //   |'openrouter'|'custom-openai'|'custom-anthropic'
  label: string               // user-editable display name ("My GPT-5", "Work Claude")

  // ── transport + protocol (the dispatch keys) ──
  transport: 'http' | 'cli'   // HTTP API vs a local CLI subscription login
  protocol: 'anthropic' | 'openai' | 'google' | 'cli'
  baseUrl?: string            // override; defaults from catalog. Required for custom-*

  // ── auth (resolved server-side; client holds only the reference) ──
  auth: {
    method: 'api-key' | 'cli-login' | 'none'
    envKey?: string           // e.g. 'CONN_<id>_KEY' — the .env line the server reads
    hasSecret?: boolean       // client-visible redaction flag (never the secret itself)
    cliId?: string            // for cli-login: which CLI plugin resolves creds
  }

  // ── model selection ──
  model: string               // 'claude-opus-4-8' | 'gpt-5' | 'gemini-3-pro' | ...
  modelsEndpoint?: boolean    // provider exposes /v1/models for live discovery

  // ── capability metadata (feeds the EXISTING budgeting paths) ──
  caps: {
    contextWindow: number     // → historyBudgetTokens()  (src/lib/api.ts:122)
    maxOutputTokens: number   // → the request max_tokens (replaces ANTHROPIC_MAX_TOKENS)
    vision: boolean
    maxImages: number         // → imageBudgetFor()  (src/lib/api.ts)
    thinking?: boolean        // anthropic adaptive thinking + effort
    promptCaching?: boolean   // anthropic cache_control — MUST be off for kimi/openai/google
    effortLevels?: boolean
  }
}
```

This is a strict superset of today's `ProviderInfo` (`src/lib/api.ts:10-33`) — `contextWindow`,
`outputReservation`, `maxImages`, `vision`, `models` already exist; we promote them onto a persisted,
user-owned record and add `protocol` / `transport` as the dispatch keys.

**Adapter dispatch** replaces the `switch(engine)`:

```
streamChat(connection, messages, ctx, …) → ADAPTERS[connection.protocol](connection, …)

  anthropic-adapter → @anthropic-ai/sdk w/ {baseURL, apiKey}   // anthropic, kimi, deepseek, glm, custom-anthropic
  openai-adapter    → /v1/chat/completions (streamLocal, generalized)  // openai, local, openrouter, custom-openai
  google-adapter    → @google/genai generateContent           // gemini (the ONE bespoke shape)
  cli-adapter       → per-CLI plugin (claude-code Agent SDK)   // transport:'cli'
```

**Critical adapter responsibilities (the gotchas — see CLAUDE.md):**

- `anthropic-adapter` sends `thinking` / `output_config.effort` / `cache_control` **only when**
  `caps.thinking` / `caps.promptCaching`. Kimi already gates these (no thinking, no `cache_control`,
  `server/providers.mjs:598`); this becomes capability-driven instead of hardcoded-per-engine.
- `openai-adapter` is `streamLocal` generalized — it already normalizes `finish_reason:'length' →
  'max_tokens'` and converts image blocks to `image_url`. Reuse verbatim; add an `Authorization`
  header for hosted OpenAI-compatible providers (OpenRouter, etc.).
- `google-adapter` is the only genuinely new translation layer (Anthropic message shape →
  `contents`/`parts`, `system` → `systemInstruction`, base64 → `inlineData`). Gemini's
  OpenAI-compatible endpoint can defer this entirely if we choose.

---

## 6. MCP reality check — wrong primitive for "add a provider"

**Do not use MCP to add an LLM provider connection.** MCP (Model Context Protocol) gives *a model*
access to **tools, resources, and prompts** it calls out to. It has **no notion** of "here is a base
URL + API key, route my chat completions to it." "Add an OpenAI/Gemini connection via MCP" is a
category error: it's the wrong layer (what the model can *do* vs. which model *answers*).

**The right primitive for "one connection, many models" is an LLM gateway** (OpenRouter / LiteLLM /
AgentRouter). In this design that's just **another OpenAI-compatible catalog entry** — a
`custom-openai` connection pointed at the gateway's base URL. Zero new protocol code; it reaches
Grok, DeepSeek, Mistral, GPT, Gemini, GLM, and more through a single key.

**Legitimate adjacent MCP uses (note, don't build now):**

- Vibemesh could *expose* an MCP server (e.g. a `generate_cad` / `render_scad` tool) so Claude
  Desktop or other agents drive Vibemesh. That's an *outbound* product surface, orthogonal to
  connections.
- Vibemesh could *consume* MCP tools to enrich generation — but this is risky given the deliberately
  tool-disabled `claude-code` path and is out of scope here.

**Crisp line:** MCP = what the model can *do*. Connections = which model *answers*. Don't conflate.

---

## 7. Marketplace UX & persistence ("only added connections visible")

The inversion is one line of intent: instead of `providerStatus()` always emitting all four built-in
engines, the server emits **only the user's saved `Connection` records** (resolved with live
availability), plus the **catalog** as a "＋ Add connection" gallery.

**Persistence (local-first, respects the two-process split):**

- **Connection records** (non-secret: id, catalogId, label, model, caps) → **localStorage** under a
  new versioned key `vibemesh.connections.v1`. Matches the existing engine-pref pattern; small, no
  IndexedDB needed.
- **Secrets** → stay server-side, one `.env` line per connection: `CONN_<id>_KEY=…`. Generalize
  `SETTABLE_KEYS` from a fixed allowlist to a **pattern allowlist** (`/^CONN_[a-z0-9]+_(KEY|BASE_URL)$/`),
  keeping the existing control-char / newline-injection / SSRF guards in `validateRuntimeSetting`
  unchanged (they're unit-tested).
- **Redaction:** the client never receives a secret back — only `auth.hasSecret: true`. The panel
  shows "Connected" / masked exactly as today.
- **Flow:** Add (pick catalog entry or custom → label + key/baseUrl → Save → reuse the existing 1-token
  `testEngine` ping at `server/providers.mjs:348`) · Edit (relabel, swap model, re-key) · Remove
  (clears the `.env` line via the existing `connectEngine(envKey, '')`) · Default selection stays the
  active engine id, now a `Connection.id`.

**Invariant preservation:**

- Two-process split intact — all adapters server-side; the browser only sends a key to `/api/connect`
  to be saved, never holds long-lived secrets; geometry stays in the browser.
- `toApiMessages` role-merge must become **protocol-conditional**: correct for Anthropic *and*
  OpenAI, but Gemini needs its own normalization (roles `user`/`model`, separate `systemInstruction`).
  Keep `toApiMessages` as the Anthropic/OpenAI path; the google-adapter post-processes — do **not**
  push Gemini quirks into the shared client function.
- Per-connection `contextWindow` feeds `historyBudgetTokens` unchanged.

---

## 8. Provider / CLI catalog (ride keys, not CLIs)

The owner asked specifically about CLIs. The 2026-06-20 fact-check found the CLI-login landscape is
**the most volatile surface in this whole design** and mostly closed: **Anthropic's** OAuth is now
barred from the Agent SDK (Claude Code / native app only, ~2026-02), **Gemini's** Login-with-Google
for the CLI was **discontinued 2026-06-18** (use an AI Studio key), **OpenAI's** Codex CLI OAuth is a
**ToS gray area** (not a documented ban, but OpenAI won't bless third-party reuse), and **Kimi's**
OAuth CLI still requires a separate console key for third-party tools. **xAI (Grok Build CLI)** and
**Mistral (Vibe)** do expose subscription logins, but third-party **rideability is unverified** for
both. Net: riding CLIs is fragile and ToS-risky across the board — **ship API keys, treat every CLI
login as personal-use-only and re-verify it immediately before relying on it.**

| Provider | Rideable CLI login? | API protocol | Base URL | Ctx / Max-out (flagship) | Lift |
|---|---|---|---|---|---|
| Anthropic | No — OAuth barred from Agent SDK (~2026-02); Claude Code/native only | Anthropic | `api.anthropic.com/v1` | 1M / 128k | exists |
| OpenAI | Codex CLI OAuth — **ToS gray area**, not a documented ban | OpenAI chat **+ Responses** | `api.openai.com/v1` | ~1.05M / 128k | small (reasoning params) |
| Gemini | **No — Login-with-Google for CLI killed 2026-06-18; AI Studio key only** | Google-native **+ OpenAI-compat** | native `…/v1beta`; OpenAI `…/v1beta/openai/` | 1.05M / 65,536 | native adapter, or ride OpenAI-compat |
| Kimi | No — OAuth CLI exists but needs a console key | **Anthropic-compat** + OpenAI | `api.moonshot.ai/v1` (+ `/anthropic`) | 256k / shares | exists |
| GLM / Zhipu | No browser-OAuth (API-key / coding-plan) | **Anthropic-compat** + OpenAI | intl `api.z.ai/api/anthropic`; CN `open.bigmodel.cn/api/anthropic` | 1M / 128k (5.2) | **catalog row** |
| DeepSeek | No | **OpenAI-compat** (+ Anthropic endpoint) | `api.deepseek.com` | 1M / 384k (V4) | catalog row |
| xAI Grok | **Grok Build CLI OAuth exists — rideability unverified** | **OpenAI-compat only** (Anthropic `/v1/messages` **deprecated**) | `api.x.ai/v1` | 1M / shares (4.3) | catalog row |
| Mistral | **Mistral Vibe browser login — rideability unverified** | OpenAI-compatible | `api.mistral.ai/v1` | 256k / shares (Large 3) | catalog row |
| OpenRouter | n/a — OAuth PKCE, **third-party intended** | OpenAI-compatible | `openrouter.ai/api/v1` | per model | **catalog row — reaches all of the above** |
| Ollama / LM Studio | n/a (local) | OpenAI-compatible | `localhost:11434/v1` · `:1234/v1` | per model | exists |

> **Local-runtime gotcha (corrected):** `num_ctx` / `num_predict` are **Ollama-native names, ignored
> over the `/v1` OpenAI path** — over `/v1` use `max_tokens`, and bake context via the Modelfile or
> the native `/api`. **LM Studio** uses a load-time `contextLength` (covers prompt+response), not
> `num_ctx`. **OpenRouter** reports `top_provider.max_completion_tokens` that is **frequently NULL**
> (all Grok, most Mistral) — treat NULL as "no separate cap, fall back to `context_length`," never as zero.

**The two highest-leverage new adds, both nearly free given existing code:**

- **OpenRouter** — one key, every model. Drops into the existing `streamLocal` (OpenAI-compatible)
  path with a base-URL swap + `Authorization` header. Covers most named providers at once.
- **GLM / Zhipu** — Anthropic-compatible, drops into the Kimi/Anthropic path with a base-URL + key.

**Recommendation:** don't chase CLI logins for distribution. Ride keys. Keep `claude-code` (and any
future codex/gemini-CLI engine) flagged personal-use-only as today.

> **Volatile surfaces — re-verify immediately before shipping any engine that depends on them**
> (these moved within months, some within days, of the 2026-06-20 fact-check):
> 1. **CLI-login policy** — the fastest-moving of all: Gemini's CLI login was killed **2026-06-18**,
>    Anthropic's Agent-SDK OAuth ban landed **~2026-02-20**. Re-check every "rideable login" claim.
> 2. **"preview" model ids** — Gemini 3.1 Pro and DeepSeek V4 are preview-labeled; Gemini already
>    retired `gemini-3-pro-preview` mid-cycle. Pin explicit dated ids, never "latest"/"4.x".
> 3. **Flagship pointers churn** — GLM 4.6→5.2, Grok 4.x→4.3 (Grok 5 reportedly training), Gemini
>    Flash 3→3.5, DeepSeek V3.2→V4 — all within months.
> 4. **Imminent retirements** — DeepSeek `deepseek-chat`/`-reasoner` **2026-07-24**; Grok legacy slugs
>    **2026-08-15**; Gemini 2.5 Pro/Flash **2026-10-16**.
> 5. **Max-output ≠ context** is the single most error-prone metric across aggregators (the GLM
>    2^17 rounding, the Kimi/Bedrock 262,144 LiteLLM bug, the Gemini 65,535/65,536 off-by-one,
>    OpenRouter's NULL `max_completion_tokens`). Always prefer the vendor's own number.

---

## 9. Phased plan

> **STATUS (2026-06-20): Phases 0–3 IMPLEMENTED** on `audit/p1-fixes` (not committed). All gates
> green — lint, build, 164 unit, 17 server selftest cases, full bench:selftests, 19/19 e2e, plus
> live preview verification (real add→remove→generate cycles, live model discovery, SSRF block) and
> two architecture-reviewer passes. Phase 4 (CLI logins) deferred per the recommendation. The one
> unverified path is live generation through a *newly-added* provider (needs a real third-party key);
> it runs the same proven adapter code as the built-ins.

### Phase 0 — Quick config wins *(no architecture change; fixes both concrete pains)* — ✅ DONE

**Goal.** Per-model `max_tokens` table + configurable generation timeout + `maxRetries` fix.
**Exit.** `max_tokens` derives from a `{contextWindow, maxOutput}` table (Opus 4.8 → 128k), with a
user override clamped to the model max; an env/UI `VIBEMESH_GEN_TIMEOUT_MS` (default ~20–30 min)
threads to the Anthropic/Kimi/local clients; `maxRetries` is explicit; Node `server.requestTimeout`
set deliberately; UI shows both context/output numbers + the effort/timeout note. Bench green.
**Effort.** ~1 day.

### Phase 1 — Adapter refactor *(behavior-identical; bench is the safety net)* — ✅ DONE

**Goal.** Collapse `switch(engine)` (`server/providers.mjs:538`) → `ADAPTERS[protocol]`; make
`thinking` / `caching` capability-driven; kill the per-engine model ternary in
`src/state/generationActions.ts` by sending `connection.model` generically.
**Exit.** The four existing engines behave byte-identically (bench + e2e green); no remaining
hardcoded engine ids in dispatch or client model resolution.
**Effort.** ~2–3 days.

### Phase 2 — Catalog + persisted connections + marketplace UX — ✅ DONE

**Goal.** Add `CATALOG`; the `vibemesh.connections.v1` store; the pattern-allowlist `.env` keys; the
Add/Edit/Remove flow; "only added connections visible." Ship **API-key providers**: Anthropic,
OpenAI, DeepSeek, GLM, Kimi, OpenRouter, custom-OpenAI/Anthropic.
**Exit.** A user can add/remove an arbitrary OpenAI- or Anthropic-compatible connection from the UI;
only added connections render; secrets are redacted; `/api/connect` stays loopback-only.
**Effort.** ~3–4 days.

### Phase 3 *(optional)* — Gemini native adapter + live model discovery — ✅ DONE (via OpenAI-compat shim, no native adapter)

**Goal.** `google-adapter` (or ride Gemini's OpenAI-compat endpoint) + `/v1/models` discovery
generalized from the existing Kimi/local listers.
**Effort.** ~2–3 days.

### Phase 4 *(defer)* — CLI-login plugins beyond claude-code

Each is bespoke cred-handling and personal-use-only by ToS. Add by demand only.

---

## 10. Guardrails & top risks

**Guardrails (non-negotiable):**

1. **Two-process split sacred** — all provider dispatch server-side; the browser never holds
   long-lived keys; geometry stays in the browser.
2. **Protocol portability** — preserve the Anthropic `cache_control` ephemeral split; the Kimi
   plain-string variant (no thinking/cache); the claude-code single-turn flatten + image cap; the
   local exemplar-drop budget rule. `thinking`/`caching` become capability-gated, never global.
3. **Role normalization is protocol-conditional** — `toApiMessages` stays the Anthropic/OpenAI path;
   Gemini gets its own pass.
4. **`/api/connect` stays loopback-only** — a marketplace that writes arbitrary `CONN_*` keys over an
   exposed bind is a credential-exfil vector. Enforce the pattern allowlist server-side regardless of
   client.
5. **Capabilities must be correct** — a wrong per-connection `contextWindow` / `maxOutputTokens`
   silently truncates the system prompt; the Add form requires them with safe defaults for custom
   endpoints.
6. **Bench-gate the refactor** — Phase 1 must regress nothing; the bench + e2e suites are the proof.

**Top 3 risks:**

1. **Gemini protocol translation** — the one place the clean adapter abstraction leaks; budget real
   time, or ride its OpenAI-compatible endpoint to avoid it.
2. **`.env` as an unbounded plaintext secret store** — fine for 4 keys, degrades with a marketplace.
   Keep `0o600` + guards, cap connection count, document the posture, keep the route loopback-only.
3. **Capability drift** — model token limits change; the table needs a maintenance owner and the UI
   must never imply "1M output."

---

## 11. Where the board agrees vs. pushes back

**Agree:** marketplace model; "only added connections visible"; user-extensible custom endpoints;
supporting the major API providers; making `max_tokens` and the timeout configurable. The architecture
already leans this way.

**Push back / better idea:**

1. **Drop MCP for provider-add** — wrong layer. For "one connection, all models," use an **LLM gateway
   as a custom-OpenAI entry** — same outcome, zero new protocol.
2. **API keys before CLI logins** — "almost all famous CLIs" is the expensive, fragile, ToS-risky 20%.
   Ship keys first; add CLI plugins by demand.
3. **Don't over-build the data model** — reuse `ProviderInfo`'s existing cap fields; the only
   genuinely new code is the google-adapter and the persisted-connections store.

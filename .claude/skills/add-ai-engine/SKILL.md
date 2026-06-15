---
name: add-ai-engine
description: Use when adding a new AI provider/engine to Vibemesh or modifying an existing one (anthropic, kimi, claude-code, local). Covers the streamChat dispatch, the per-engine stream functions, providerStatus detection + /api/health, runtime key persistence (applyRuntimeSetting/.env), and the client-side history rules that all Anthropic-protocol engines depend on.
---

# Adding or modifying an AI engine

All AI dispatch lives in `server/providers.mjs` (plain JS ESM — there is no TypeScript on the server). The server's only jobs are provider dispatch and serving the built frontend; it never sees or runs OpenSCAD. Existing engine ids: `anthropic`, `kimi`, `claude-code`, and `local` / `local:<model>`.

## 1. Wire the dispatch — `streamChat`

`streamChat({ engine, model, messages, context, onDelta, signal })` in `server/providers.mjs` is the single entry point. It builds `ctx` from `contextText(context)` (bed size + kit intent appended to the system prompt) and dispatches on `engine`. Add your branch alongside the others:

```js
if (engine === 'myengine') return streamMyEngine({ messages, ctx, onDelta, signal, model })
```

Unknown engines throw `UserFacingError` (rendered to the user, not a 500). The route `POST /api/generate` (`server/index.mjs`) calls `streamChat`, forwards each `onDelta` as an SSE `delta` event, and aborts upstream via `res.on('close')` + an AbortController on client disconnect — your `streamMyEngine` MUST accept and honor `signal`.

## 2. Write the per-engine stream function

Mirror an existing one:

- **Anthropic-protocol providers** (`streamAnthropic`, `streamKimi`): use `@anthropic-ai/sdk`'s `client.messages.stream(...)`, wire `stream.on('text', onDelta)`, `await stream.finalMessage()`, and translate errors through `translateAnthropicError(error, 'Name')`. `streamAnthropic` uses `system` as a cached block array + `thinking: { type: 'adaptive' }` + `output_config: { effort: 'xhigh' }`. **Do not copy those onto a portable endpoint** — Kimi 400s on `effort` and rejects `thinking`/`cache_control`, so `streamKimi` keeps the payload protocol-portable: plain `system: SYSTEM_PROMPT + ctx`, no `thinking`, no `cache_control`. Match Kimi's portability for any other Anthropic-compatible third party.
- **OpenAI-compatible** (`streamLocal`): POST to `/v1/chat/completions` with `stream: true`, parse `data:` lines, emit `chunk.choices[0].delta.content`. Note the Ollama belt-and-suspenders knobs (`max_tokens` + `options.num_ctx`/`num_predict`) that stop the system prompt being truncated. Messages go through `toOpenAiMessage` (text + `image_url` blocks).
- **Agent SDK** (`streamClaudeCode`): single-turn `query()` with all tools disabled, history flattened by `agentPromptFromMessages`, and `ANTHROPIC_API_KEY` stripped from `env` so the subscription login wins.

In all cases: prepend the shared `SYSTEM_PROMPT` (from `server/prompt.mjs`) + `ctx` as the system message, feed the `messages` array through, and stream text via `onDelta`. The system prompt is the response contract (see the `openscad-contract` skill) — never fork it per engine.

## 3. Advertise the engine — `providerStatus` + `/api/health`

`providerStatus()` returns the array the Engines UI renders; `GET /api/health` exposes it. Push an entry shaped like the others (fields typed by `ProviderInfo` in `src/lib/api.ts`):

```js
{
  id: 'myengine',
  label: 'My Engine',
  available: Boolean(process.env.MYENGINE_API_KEY),   // auto-detect: env key, CLI binary, or a live probe
  detail: '...',                                        // human hint shown under the label
  model: myModel(),
  vision: true,                                         // does it accept image blocks?
  models: [...],                                        // optional selectable variants
  connect: { envKey: 'MYENGINE_API_KEY', placeholder: '…', url: 'https://…', urlLabel: '…' },
}
```

Availability is auto-detected: an env key (`anthropic`/`kimi`), a CLI binary probe (`claudeBinaryAvailable`), or a live HTTP probe (`listLocalModels`, `listKimiModels`). Detection probes run in `Promise.all` — keep them fast and timeout-guarded (`AbortSignal.timeout(...)`) so `/api/health` stays snappy. Add a cheap 1-token check to `testEngine(engine)` for the panel's "Test" button.

## 4. Runtime keys — `applyRuntimeSetting` / `.env`

If the engine takes a key/URL the UI should save, add the env var name to the `SETTABLE_KEYS` set. The UI saves via `POST /api/connect` → `connectEngine` (`src/lib/api.ts`) → `applyRuntimeSetting(key, value)`, which validates (control-char + SSRF/URL guard), sets `process.env[key]`, and rewrites `.env` (mode `0o600`, line replace-or-append). **`.env` is rewritten at runtime — treat it as mutable, not static config.** The `connect` block in your provider entry drives this form; its `envKey` must be in `SETTABLE_KEYS`.

## 5. Client history rules (you inherit these for free — don't break them)

The client builds the `messages` array in `toApiMessages` (`src/lib/api.ts`) before it ever reaches your engine:

- History is capped at `HISTORY_LIMIT = 12` messages; errored messages are dropped.
- Assistant messages are re-wrapped with their stored ` ```scad ` code block (keeps code context across turns — symmetric with `extractScadBlock`).
- Leading assistant messages are shifted off so the **first** message is always `user`.
- **Consecutive same-role messages are merged** (happens after an aborted generation) because **Anthropic-protocol providers reject non-alternating roles**. If your engine speaks the Anthropic protocol you depend on this; if it's more lenient you still receive the merged, alternating array.

Any new engine consumes this already-normalized array — don't re-implement role handling server-side, and don't assume raw, un-merged history.

## Verify

No test suite. Run `npm run lint && npm run build`, start `npm run dev`, open the Engines panel to confirm your provider shows up via `/api/health` with correct `available`/`detail`, run its Test button, then generate once end to end (prose + one `scad` block must still parse and render). For a fuller pass: `node bench/run.mjs` with the dev API on :5175.

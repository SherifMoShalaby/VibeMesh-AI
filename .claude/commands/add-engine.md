---
description: Guide adding a new AI provider/engine end-to-end
argument-hint: <engine-id> [display name]
allowed-tools: Read, Grep, Glob, Edit
---
Help the contributor add a new AI provider engine to Vibemesh. The engine id (and
optional display label) is: **$ARGUMENTS**.

All AI dispatch lives in the small ESM server — the browser never sees it. Work through
these wiring points in `server/providers.mjs` (read it first), then the docs:

1. **Dispatch** — in `streamChat({ engine, model, messages, context, onDelta, signal })`,
   add a branch to the engine-id chain for the new id and implement a `stream<Name>(…)`
   function alongside the existing ones. Study the four shapes already there and reuse
   whichever matches:
   - Anthropic-protocol (like `streamAnthropic` / `streamKimi`): use `@anthropic-ai/sdk`.
     Keep the payload **protocol-portable** for non-first-party endpoints — no `thinking`,
     no `cache_control` (those are Anthropic-first-party only; Kimi 400s on them).
   - OpenAI-compatible (like `streamLocal`): POST `/v1/chat/completions`, parse the SSE
     `data:` lines, call `onDelta(delta)` per text chunk.
   The system prompt is always `SYSTEM_PROMPT + ctx` (`ctx` = per-request bed/kit context)
   — do not fork or rewrite `server/prompt.mjs`; it's the shared response contract.
   Honor `signal` for abort, and throw `UserFacingError` for anything the user should see.

2. **Availability** — add an entry in `providerStatus()` so the engine appears (or shows
   as unavailable with a helpful `detail`) in the Engines UI via `GET /api/health`.
   Detect availability the same way as siblings (presence of a key, a reachable base URL,
   a CLI on PATH). Set `vision: true/false` honestly — the Refine/image surfaces gate on
   it. If it has selectable model variants, populate `models: [{ id, label }]`.

3. **Runtime key handling** — if the engine takes a key/URL the UI should be able to save:
   - Add its env key to the `SETTABLE_KEYS` set so `applyRuntimeSetting` will accept it
     and persist it to `.env` (`POST /api/connect` → `applyRuntimeSetting`).
   - Give the provider a `connect: { envKey, placeholder, url, urlLabel }` block in
     `providerStatus()` so the Engines panel renders the connect form.
   - Add a branch to `testEngine(engine)` for the 1-token connectivity ping.
   - If it's a server-side fetch **base URL**, keep the existing SSRF guard pattern
     (validate it's a real http(s) URL — see `LOCAL_LLM_BASE_URL`).

4. **Docs / config** — update `README.md` (engines section) and `.env.example` with the
   new env var(s), commented out, matching the existing style. If the engine changes the
   image / refine / versioning / multi-part behavior, update `docs/SPEC.md` too.

5. **Verify** — run the gate (`npm run lint && npm run build`). Note the server `*.mjs`
   files aren't typechecked, so also sanity-read your new branch for obvious mistakes.

Show the contributor each edit and explain the reasoning; don't invent SDK calls — match
what the existing providers actually do.

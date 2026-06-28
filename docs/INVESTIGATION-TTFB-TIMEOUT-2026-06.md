# Investigation — "produced no output within 240s" on almost every prompt

**Date:** 2026-06-28
**Engine in scope:** `claude-code` (Claude Opus via the Agent SDK login — the only shippable engine; kimi dropped)
**Status:** Root cause CONFIRMED. The failure is a **regression introduced by LAT-4 this session**. The applied 12-min stopgap unblocks the user but does NOT fix the design; the cap must be redesigned.

---

## 1. Single root cause

**The LAT-4 TTFB watchdog uses the wrong stall signal for the `claude-code` engine: it measures *time-to-first-answer-text*, but the Agent SDK emits no answer text while the model is thinking. So "TTFB" == full think time, and the cap aborts HEALTHY long-thinking generations as if the stream were dead.**

Precise mechanism, in code:

- `server/providers.mjs:1134` — the watchdog arms a TTFB timer (`ttfb = arm(ttfbMs, 'ttfb')`) at request start.
- `server/providers.mjs:1138` — `firstDelta()` is the ONLY thing that clears that TTFB timer.
- `server/providers.mjs:1085-1086` — `firstDelta()` is called only on `event.type === 'content_block_delta' && event.delta?.type === 'text_delta'` — i.e. the first **answer-text** byte.
- The model streams nothing parseable as text during extended thinking, so the TTFB timer counts down through the entire think phase.
- `server/providers.mjs:1124-1128` — when it fires it calls `controller.abort()`.
- `server/providers.mjs:1143-1146` — the abort surfaces as the verbatim user-facing string: `"Claude Code produced no output within {secs}s — the stream timed out. Try again, or raise VIBEMESH_GEN_TIMEOUT_MS."` (`reason === 'ttfb'` → `produced no output within Ns`).

**The liveness signal needed to tell "thinking" from "stalled" is already in the loop and already discarded for the TTFB decision.** `server/providers.mjs:1082` calls `watchdog.tick()` on **every** message, but `tick()` (`:1139-1141`) refreshes only the *overall* timer — it deliberately does not touch the TTFB timer. The SDK digests thinking progress into `SDKThinkingTokensMessage` (`type:'system', subtype:'thinking_tokens'`, `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:4098-4105`), which the doc-comment at `sdk.d.ts:4096` describes as the running thinking-token estimate emitted "during the redacted-thinking phase (where the API otherwise streams only pings)". Those messages flow through the `for await` loop and hit `tick()` — proving the asymmetry is the bug: the same messages that keep the overall timer alive are denied to the TTFB timer.

---

## 2. Is this a regression from LAT-4? — YES

`server/providers.mjs:159-172` (comments) state the pre-LAT-4 behavior: there was no TTFB/soft cap, only a ~61-min outer request budget. So these exact prompts **completed (slowly)** before LAT-4. The bench confirms the affected tasks are not broken generations — they compile fine when they finish (T10-spinner / T11-technic `compiledRate:1`). LAT-4 added `makeStreamWatchdog` (`:1114`) to catch a rare *hung CLI stream*, and in doing so traded that rare catch for a **common false-positive on the primary happy path**.

The 12-min stopgap (`DEFAULT_GEN_TIMEOUT_MS = 12 * 60000`, `server/providers.mjs:163`) widens the same broken window. Because `CLAUDE_CODE_TTFB_TIMEOUT_MS` defaults to `GEN_TIMEOUT_MS` (`:174-176`), raising the global budget also blunts genuine-stall detection to 12 min — the exact opposite of LAT-4's stated goal of catching hung streams *fast*.

---

## 3. Evidence table — claude-code generation times (on-disk: `bench/results/results.json`)

For this engine `genMs ≈ TTFB`: the single ```scad block streams fast once answer text begins, so almost all elapsed time is pre-first-token thinking.

| Task | genMs | compiledRate | transportErrors | Note |
|---|---|---|---|---|
| T16-composed | **242,007** | null (0 evaluable) | 2/2 | Carries the **literal** `"produced no output within 240s — the stream timed out"` string (`results.json:753`); mislabeled `errorClass:"transport"` |
| T2-stand | **228,245** | 1 | 1/2 | One sample crossed the cap; the other compiled fine — median hides the kill |
| T11-technic | 86,923 | 1 | — | Healthy, high end |
| T10-spinner | 85,392 | 1 | — | Healthy, high end |
| T3-clip | 54,194 | 1 | — | |
| T7-kit | 52,646 | 1 | — | |
| T12-fidget-interference | 52,215 | 1 | — | |
| T9-pressfit | 45,162 | 1 | — | |
| T17-hardsurface | 40,611 | 1 | — | ~median |
| T15-snap-fit | 25,525 | 1 | — | |

**Distribution (n=18):** min 8.5s · median **40.6s** · max **242s** · >240s: **1/18** · >60s: **4/18** · <30s: **9/18**.

The shape is **bimodal**, not uniform: simple/iterate/fix/primitive prompts finish <60s and never trip; the slow class (composition kits, multi-mechanism, big retrieved skills/exemplar context) clusters 85-242s and sits *at or across* the old 240s line.

> **Note on the corpus.** The brief cited `scratchpad/corpus/corpus.json` with per-prompt TTFBs (scifichess 206s, knight 80s, funnel 79s, nameplate 42s). **That file does not exist on disk** (the scratchpad/corpus dir is absent). Those four numbers are unverifiable here and are NOT relied on. The mechanism and the slow-class tail are fully established by `results.json` alone (the literal timeout string on T16, the one crossed sample on T2, the ~85s healthy thinkers).

### Why the user sees "almost all" when the bench shows only 1/18 over 240s

Two compounding effects the bench medians hide:

1. **Per-sample vs. median.** The cap fires *per generation*; `genMs` in `results.json` is a 2-sample median. T2-stand's 228s median already contains one sample that crossed the cap (`transportErrors:1`). A median understates how often a single interactive shot trips.
2. **Usage-mix selection.** The bench corpus is benign-skewed (primitives + single mechanisms). Real interactive prompts skew to exactly the slow figurative / image-referenced / kit / composition class, and add flattened **chat history** + per-request **contextText** (retrieved skills + exemplars) that the cold bench tasks lack — pushing think time higher and more variable. "Almost all of MY prompts" = "almost all of the slow class."

---

## 4. Contributing amplifier — effort is silently pinned at `xhigh`; `.env VIBEMESH_EFFORT=high` is dead config

- `src/state/store.ts:668` — `claudeEffort` defaults to `'xhigh'` (localStorage-persisted).
- `src/state/generationActions.ts:336` — every request sends `effort: provider?.efforts?.length ? get().claudeEffort : undefined` — an explicit `xhigh` on every interactive call for effort-capable engines.
- `server/providers.mjs:387-389` — `resolveEffort(effort)` returns the request value when valid; `DEFAULT_EFFORT` (from `VIBEMESH_EFFORT`, `:385`) is the fallback used **only when no effort is sent**.
- `server/providers.mjs:1069` — the claude-code `query()` passes `effort: resolveEffort(effort)`.

Because the client always sends `xhigh`, the server fallback never engages, so the user's `.env VIBEMESH_EFFORT=high` **does not govern the app** — they are silently running `xhigh`, the single largest multiplier on Opus think time. A trivial "cube" prompt thinks at the same level as a planetary gearbox. There is no per-prompt tiering.

---

## 5. Ruled-out / minor

- **No prompt caching on the claude-code path** — `cache_control` breakpoints exist only in the anthropic-protocol path (`server/providers.mjs:953`, system cache at `:925-927`); the `query()` call passes `systemPrompt` as a plain string (`:1065`) with no `resume`/`sessionId`, so the ~7-12k-token system+context prefill is reprocessed each call. **Minor for the 240s cap** — prefill of that size is seconds, dwarfed by `xhigh` think time. Real cost is on refine/best-of-N re-sends, not why the cap fires.
- **No SSE heartbeat** — `server/index.mjs:146` `send()` only writes on actual deltas; no periodic ping. **Not the cause:** the server-side TTFB watchdog aborts upstream (`providers.mjs:1127`) and surfaces its own message verbatim *before* any proxy/browser idle timeout matters. A heartbeat is a UX nicety, not a fix.
- **The `!gotText` result fallback** (`providers.mjs:1096`) would emit the completed text even with no partial streaming — but the TTFB abort fires *before* the `result` message arrives on a long think, so the fallback never gets the chance. Reinforces that the abort, not a missing-output path, is the failure.

---

## 6. Ranked fixes (root-cause first)

### Fix 1 — DO FIRST: make the silence timer reset on ANY message, not just answer text (turns the cap into a true stall detector)
Reset the TTFB/silence timer inside `tick()` (`server/providers.mjs:1139`), which already fires on every message (`:1082`). The cap then measures **silence** (no SDK message of any kind for N seconds = dead CLI), invariant to total think time, so it never kills a model that is actively emitting `thinking_tokens`/pings.

- **Do NOT** make the primary mechanism a branch on `event.delta?.type === 'thinking_delta'`. Per `sdk.d.ts:4096`, when thinking display is `omitted` the API "otherwise streams only pings" and progress arrives as the digested `system/thinking_tokens` message — no `thinking_delta` content-block events. The `query()` call (`providers.mjs:1062-1077`) sets no `thinking_display`, so it inherits the session default, which may be `omitted`. Resetting inside `tick()` (any message) is robust to this; a `thinking_delta` branch may silently never fire.
- Keep `firstDelta()` only as the optional point to switch to a different post-first-token policy if desired.
- **Effort: S.** `server/providers.mjs` — a one-method change to `makeStreamWatchdog`.

### Fix 2 — Decouple the silence cap from the overall budget; give it a small default; revert the 12-min stopgap
`CLAUDE_CODE_TTFB_TIMEOUT_MS` (`:174-176`) currently inherits `GEN_TIMEOUT_MS`. Give the silence cap its own small default (~60-90s of true no-message silence) independent of the overall budget; keep `CLAUDE_CODE_SOFT_TIMEOUT_MS`/`GEN_TIMEOUT_MS` as the generous outer ceiling. Once Fix 1 lands, revert `DEFAULT_GEN_TIMEOUT_MS` (`:163`) toward a sane interactive value, and stop the error message (`:1146`) from advising users to raise the global budget for what is a stall-tuning problem.

- **Effort: S.** `server/providers.mjs:163, 174-181, 1146`.

### Fix 3 — Per-prompt effort tiering + fix the dead `VIBEMESH_EFFORT` config
Classify trivial/iterate/fix prompts to `medium`/`high` and escalate only kits/multi-mechanism/composition to `xhigh`, before `generationActions.ts:336`. Independently, fix the dead-config surprise: either default the client `claudeEffort` to `undefined` so the server `DEFAULT_EFFORT` (the user's `.env`) actually governs, or set the client default to `'high'`. A/B with `VIBEMESH_EFFORT=high npm run bench`.

- **Effort: M.** `src/state/generationActions.ts:336`, `src/state/store.ts:668`.

### Fix 4 — Add a regression test for the watchdog
Server-selftest feeding a synthetic stream of NON-text messages (`system/thinking_tokens` + pings) past the old TTFB window, then a `text_delta`, asserting NO trip; plus an all-silence stream that DOES trip in ~75s. The bench `genMs` distribution (max 242s, median 40.6s) is the oracle for picking the silence window.

- **Effort: S.** `bench/server.selftest.mjs` (or a new selftest).

### Fix 5 — (lower priority) Re-classify a watchdog abort distinctly from transport, and optional UX heartbeat
T16's kill is mislabeled `errorClass:"transport"` (`results.json:752`), which inflates transport counts and lets the gate go INCONCLUSIVE (exit 2) instead of flagging a real regression. Separately, forward a lightweight `{type:'thinking'}` SSE event (driven off `system/thinking_tokens`) so the user sees progress during the 80-240s think instead of a blank wait. Neither is required to stop the timeouts.

- **Effort: M.**

---

## 7. Stopgap assessment

**The applied 12-min `DEFAULT_GEN_TIMEOUT_MS` raise is an adequate temporary UNBLOCK but is NOT a fix — the cap *design* must change.** Two reasons it can't be the answer:

1. Any fixed TTFB-from-start cap on a think-then-answer engine has a long right tail (composition kits at 242s+ with history+context). Growing the number keeps clipping the slowest healthy prompts forever while doing nothing to catch a *fast* true stall.
2. Because the silence cap inherits `GEN_TIMEOUT_MS` (`:174-176`), the 12-min raise simultaneously means a genuinely hung CLI now stalls ~12 min before the user gets a recoverable error — defeating LAT-4's own purpose.

Land Fix 1 + Fix 2 (make the cap a silence detector reset by `tick()`, decoupled, ~60-90s default), then revert the 12-min stopgap.

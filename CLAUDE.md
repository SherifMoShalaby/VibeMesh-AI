# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vibemesh-AI (package name `vibemesh-ai`; the directory keeps the legacy "VibeSCAD" name) — AI text/image-to-CAD for 3D printing. Plain-language prompts become parametric OpenSCAD programs, rendered entirely in the browser via openscad-wasm, with live parameter sliders and slicer-ready `.3mf`/`.stl` export. Local-first: projects live in localStorage, AI keys in `.env`.

## Commands

```sh
npm run dev          # web (Vite, :5173) + API (Express, :5175) together
npm run dev:server   # API only
npm run dev:web      # web only (proxies /api → :5175)
npm run build        # tsc -b && vite build
npm run lint         # eslint
npm start            # production: serves dist/ + API on :5175
```

Tests come in two layers. A zero-API **client-seam unit net** (`npm test` / `npm run test:run`, Vitest, `src/**/*.test.ts`, `node` env) covers the deterministic pure functions the bench never imports — `refineProxy` dim math, the `params.ts`/intent parsers, `toApiMessages` role-merge/leading-assistant-drop/image-cap normalization, and `stl.ts` bbox/transform incl. its loud malformed-buffer throw; it runs in CI (lint → test → build) and as the first step of `bench:gate`. The deeper layer is the model benchmark: `node bench/run.mjs` (engine × task matrix; needs the dev API running on :5175; writes `bench/results/`). Tasks whose geometry is fully determined by the prompt also get a voxel-IoU score against a gold reference in `bench/gold/<task>.scad` — `node bench/score.mjs` re-scores saved results without re-running generation, and `node bench/compare.mjs <a.scad|stl> <b.scad|stl>` diffs any two models ad hoc (placement-normalized, best of four Z-rotations; method in `bench/compare.mjs`).

The bench is a **ratchet**, not just a thermometer: `node bench/gate.mjs` diffs the latest `bench/results/results.json` against the committed `bench/baseline.json` (top-level, since `bench/results/` is gitignored). Its exit code is **three-valued** so a flaky live run never masquerades as a verdict — `0` PASS, `1` REGRESSION (a real quality drop: a *generation* `compiled ✓→✗`, a numeric metric below tolerance, a new `overSplit`, a multi-block reply — these are zero-tolerance; IoU/dim/placement/kit have small tolerances, wide on IoU), `2` INCONCLUSIVE/CONFIG (the run can't be trusted: a gated task ran with `<2` samples, an entire shippable baseline engine is absent, or a task's samples ALL hit **transport** errors). The gate classifies each failure as **transport** (rate-limit/5xx/timeout — environmental, never a `compiled ✓→✗`, excluded from `compiledRate`'s denominator) vs **generation** (no scad block / non-manifold / compile error — a real fault), and **refuses to gate `<2` samples** (override with `--allow-single-sample` or `BENCH_MIN_SAMPLES=1`). Engines in `BENCH_ADVISORY_ENGINES` (default `claude-code` — personal-use-only, can't ship, rotates its CLI token) are reported but **never gate**, so the shippable kimi/anthropic baseline is authoritative. The comparison logic lives in an exported `evaluate()` ratcheted by the zero-API `bench/gate.selftest.mjs` (alias `bench:gatelogic`, in the `bench:gate` chain). `node bench/gate.mjs --update-baseline` re-seeds the baseline from the current results (commit it). npm aliases: `bench`, `bench:score`, `bench:gate`, `bench:gatelogic`, `bench:baseline`. The intended loop around any prompt/geometry change: `npm run bench` → `npm run bench:gate` to confirm the change lifted quality without regressing another task. `BENCH_SAMPLES=k npm run bench` runs each task k times and aggregates (median quality scores, `compiledRate`) so the gate can trust tight tolerances despite the non-deterministic API. `VIBEMESH_EFFORT=high npm run bench` A/Bs the Anthropic effort level without a code change. `bench/fidelity.mjs` adds metrics the voxel-IoU + buildability checks can't see — `asymmetryScore` (rotational self-similarity: a generic symmetric cross self-matches and IoU can't tell it from a distinct-armed one), `moduleDistinctness` (distinct instantiated modules), and `assembledScore` (the `all` view reads as the assembled object, not a scattered layout) — gated on tasks tagged `expect.asymmetric` / kits (e.g. `T10-spinner`). `bench/interference.mjs` adds the geometric-consistency probe: a part opts in via a hidden `_debug = "off"; // [off, positives, negatives]` enum (rendering protected structure vs. cutters in isolation), and the probe voxelizes both and reports the overlap volume + `interferenceScore` (1 = no cutter slices a functional feature). `bench/interference.selftest.mjs` is a static, zero-API ratchet over the committed `KIT_EXEMPLAR` (asserts tubes∩bores ≈ 0 and that a `skip_r=0` control is caught) — it runs ahead of `bench:gate` (alias `bench:interference`). `_`-prefixed Customizer names are hidden probe knobs: filtered from the slider UI (`src/lib/params.ts`) and bench param counts. `bench/render.mjs` is a dependency-light CPU rasterizer (STL → iso/front/top PNGs, same poses as the refine capture) feeding `judgeVision` in `bench/judge.mjs` — an advisory multimodal fidelity check (per-feature present/faithful + `asymmetryPreserved`), gated like the text judge on `ANTHROPIC_API_KEY` + `BENCH_JUDGE=1`, never gating pass/fail.

`docs/SPEC.md` is the behavioral contract for the image/refine/versioning/multi-part surfaces — consult and update it when changing those behaviors.

## Architecture

Two processes. The frontend is React 19 + zustand + react-three-fiber (TypeScript, `src/`). The backend is a small plain-JS ESM Express server (`server/*.mjs`, no TS) whose only jobs are AI provider dispatch and serving the built frontend in production. All geometry work happens in the browser — the server never sees OpenSCAD code.

### AI generation flow

1. `src/state/store.ts` `sendPrompt` → `src/lib/api.ts` `streamGenerate` → `POST /api/generate` (SSE: `delta`/`done`/`error` events).
2. `server/providers.mjs` `streamChat` dispatches on engine id:
   - `claude-code` — Claude Code subscription login via `@anthropic-ai/claude-agent-sdk` (single-turn, all tools disabled, history flattened into one prompt; `ANTHROPIC_API_KEY` is stripped from env so the login wins)
   - `anthropic` — `@anthropic-ai/sdk` with adaptive thinking + prompt caching
   - `kimi` — Anthropic SDK pointed at Kimi's Anthropic-compatible endpoint (console API keys only; the CLI login token is rejected by their API)
   - `local:<model>` — OpenAI-compatible `/v1/chat/completions` (Ollama / LM Studio)
3. `server/prompt.mjs` holds the system prompt — the response contract: short prose + exactly ONE ```scad fenced block containing the COMPLETE program, starting with an OpenSCAD Customizer parameter block. Printability rules (manifold, flat on bed, mm, wall thickness, no global `$fn`, no `import`/`text()`/external libs) and mandatory safety caveats live here. Changing this prompt changes model behavior across every engine.
4. Client side, `extractScadBlock` (`src/lib/params.ts`) splits prose from code; the code is adopted, parsed, compiled, and stored as a restorable version on the chat message.

Provider availability is auto-detected (`providerStatus`) and exposed via `GET /api/health`; the Engines UI can save keys at runtime via `POST /api/connect`, which writes them into `.env` (`applyRuntimeSetting`).

### Geometry pipeline (no AI involved)

- `src/lib/params.ts` parses Customizer-style annotations (`// [min:step:max]`, `// [a, b, c]`, group headers) from the top of the program into typed parameters → sliders/dropdowns/checkboxes in `RightPanel`.
- Parameter changes re-render via OpenSCAD `-D name=value` defines — no code rewrite, no AI round-trip (~100–500ms, debounced 350ms).
- `src/lib/openscad/client.ts` is a singleton facade over a Web Worker: serializes renders, coalesces (a queued job is superseded by newer requests — resolved with `error: 'superseded'`), and a 90s watchdog terminates + respawns a hung worker.
- `src/lib/openscad/worker.ts`: **openscad-wasm is single-shot** — `callMain` may run only once per instance, so a fresh instance is created per render (cheap after first load; the WASM is base64-embedded in a ~14MB JS chunk, hence the raised `chunkSizeWarningLimit`). Renders pass `--backend=Manifold` (this build is OpenSCAD 2025.07.18) — 100–700× faster than the default CGAL backend on boolean-heavy models; needs manifold input (the prompt mandates it), Minkowski auto-falls-back to CGAL. The bench (`bench/run.mjs`, `bench/compare.mjs`) uses the same flag.
- Quality presets (Draft/Standard/Fine/Ultra) are root-scope `-D '$fn=0' -D $fa=… -D $fs=…` overrides — generated code must never set a global `$fn` (per-call `$fn` for hex sockets etc. is intentionally preserved). Timeouts at higher quality get one automatic retry at Draft, surfaced as a `compileNote`.

### State

One zustand store, `src/state/store.ts`, owns nearly everything: projects + chat, code, params, the compile lifecycle, viewport placement with its own undo/redo snapshot history (`vpPast`/`vpFuture`, cleared on every re-render), and all export paths. Ephemeral UI state (modals, toasts) lives in `src/state/ui.ts`. Two guard patterns recur in `compile()`: a stale-render check (results landing after a project switch are dropped) and `fitVersion` (camera auto-fits only when the viewport was empty, never mid-iteration).

Persistence is localStorage under `vibemesh.*` keys (`vibemesh.projects.v1` etc.); `src/lib/storage.ts` migrates legacy `vibescad.*` keys on startup.

### Multi-part convention

An enum parameter literally named `part` with first option `all` marks a multi-part design: `all` is the assembly preview (bed-fit warnings suppressed), other options compile per-piece for the PARTS bar and exports. Exports: `src/lib/threeMF.ts` (one `.3mf`, each part a named object), `src/lib/stl.ts` (binary STL bbox/transform — viewport move/rotate is baked into single-STL export). Partial export failures must be loud (alert + HUD note) — silent skips are a spec violation.

## Gotchas

- SSE client disconnects: `server/index.mjs` aborts upstream generation via `res.on('close')` + AbortController — keep this wiring intact when touching the generate route.
- Anthropic-protocol providers reject non-alternating roles; `toApiMessages` (`src/lib/api.ts`) merges consecutive same-role messages (happens after aborted generations) and drops leading assistant messages. History is capped at 12 messages.
- The Kimi stream keeps its payload protocol-portable: no `thinking`, no `cache_control` blocks.
- `.env` is rewritten at runtime by the server when the UI saves a key — don't treat it as static config.
- The Claude · login engine is for personal/local use only per Anthropic's Agent SDK terms; a distributed build must use API keys.

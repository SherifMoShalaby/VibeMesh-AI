# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vibemesh (package name `vibemesh`; the directory keeps the legacy "VibeSCAD" name) — AI text/image-to-CAD for 3D printing. Plain-language prompts become parametric OpenSCAD programs, rendered entirely in the browser via openscad-wasm, with live parameter sliders and slicer-ready `.3mf`/`.stl` export. Local-first: projects live in localStorage, AI keys in `.env`.

## Commands

```sh
npm run dev          # web (Vite, :5173) + API (Express, :5175) together
npm run dev:server   # API only
npm run dev:web      # web only (proxies /api → :5175)
npm run build        # tsc -b && vite build
npm run lint         # eslint
npm start            # production: serves dist/ + API on :5175
```

There is no test suite. The closest thing is the model benchmark: `node bench/run.mjs` (engine × task matrix; needs the dev API running on :5175; writes `bench/results/`). Tasks whose geometry is fully determined by the prompt also get a voxel-IoU score against a gold reference in `bench/gold/<task>.scad` — `node bench/score.mjs` re-scores saved results without re-running generation, and `node bench/compare.mjs <a.scad|stl> <b.scad|stl>` diffs any two models ad hoc (placement-normalized, best of four Z-rotations; method in `bench/compare.mjs`).

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

# Vibemesh

**Describe a part. Get a print-ready part.** — AI parametric CAD for 3D-printing folks.

Vibemesh turns plain-language descriptions (optionally with reference photos) into parametric
3D models, renders them **entirely in your browser**, exposes every dimension as a live slider,
and exports slicer-ready files (`.3mf` / `.stl`). Local-first: your projects, keys and models
never leave your machine.

> **Origins.** Vibemesh began as a quick experiment inspired by an existing text-to-CAD project
> (and was briefly named "VibeSCAD"). It has since been redesigned and rebuilt end-to-end — its
> own UX and design system, multi-engine AI integration, refine loop, viewport tooling and export
> pipeline — and is an independent product that does not track, share code with, or rely on any
> other codebase.

## Features

- **Text → CAD** — Claude writes complete, manifold, printability-aware OpenSCAD programs
  (flat base on the bed, mm units, minimum wall thickness, hardware clearances, self-supporting
  geometry preferences baked into the system prompt).
- **Image as prompt** — paste (⌘V), drag & drop, or attach photos/dimensioned sketches; send
  image-only (no text needed) and the AI models the part, using labeled dimensions exactly.
  A warning appears if the selected engine can't see images.
- **Live parameters** — Customizer-style annotations are parsed into grouped sliders, dropdowns
  and checkboxes; changes re-render via OpenSCAD `-D` overrides in ~100–500ms with **no AI round-trip**.
- **In-browser geometry engine** — OpenSCAD compiled to WebAssembly runs in a Web Worker
  (fresh single-shot instance per render, watchdog respawn on hangs). No installs, no cloud.
- **Print-bed preview** — Ender 3 / Bambu A1 / Prusa MK4 / A1 mini bed sizes with
  exceeds-bed and below-bed warnings, part dimensions HUD.
- **Surface quality presets** — Draft / Standard / Fine / Ultra in the viewport HUD. Implemented
  as adaptive `$fa`/`$fs` overrides (`-D '$fn=0'`), so large curves get smooth automatically while
  intentional low-poly features (`$fn=6` hex sockets) are preserved. Applies to viewport and export.
- **Iterate by chat** — "make the hook deeper", "add a third screw hole"; the AI returns the full
  updated program. Render errors get an **Ask AI to fix** button.
- **Export** — one-click `.3mf` (every part a named object, arranged slicer-ready for Bambu
  Studio / PrusaSlicer / Orca), binary `.stl` (single or one per part), `.scad` (with your
  current slider values substituted).
- **Projects** — saved to localStorage, switchable, renameable; works offline.
- **Built-in examples** — storage box, hex bit holder, wall hook — fully usable without an API key.

## Quickstart

```sh
npm install
npm run dev              # web on :5173, api on :5175
```

No API key needed if you're already logged into Claude Code — the engine menu (next to Send)
lists every connected engine. Without any engine the app still runs: examples, sliders, code
editing and STL export all work.

## AI engines

The server auto-detects what's available on your machine and the UI lets you switch per-message:

| Engine | Auth | Setup |
|---|---|---|
| **Claude · login** | your Claude Code subscription login | install Claude Code, `claude` → `/login`. Nothing else. A model picker (default/opus/sonnet/haiku) appears next to the engine menu. |
| **Claude · API key** | `ANTHROPIC_API_KEY` in `.env` | key from console.anthropic.com |
| **Kimi K2.6** | `KIMI_API_KEY` in `.env` | key from the Kimi Code console (included in the Kimi subscription). The CLI's `/login` token is tried automatically but Kimi's coding API currently rejects it. |
| **Local · model** | none | start Ollama (or LM Studio with `LOCAL_LLM_BASE_URL=http://localhost:1234`). Every installed model appears in the menu; vision models (qwen-vl, llava…) accept reference images. |

> **Heads-up for distribution:** Anthropic's Agent SDK terms do not allow third-party products
> to offer claude.ai subscription login to *their* users. The Claude · login engine is for
> personal/local use; a shipped product should use API keys (each user brings their own) or
> request approval from Anthropic. Kimi has no third-party OAuth either — console keys are the
> supported route.

Local models: 7B-class models produce simple parts fine but struggle with complex assemblies —
`qwen2.5-coder:14b`+ via Ollama or Kimi K2.6 via API give noticeably better OpenSCAD.

### Production

```sh
npm run build
npm start                # serves dist/ + API on :5175
```

## Architecture

```
browser ─────────────────────────────────────────────
  React 19 + Vite + zustand
  ├─ ChatPanel ── SSE ──► Express (server/index.mjs)
  │                         └─ providers.mjs dispatch:
  │                             ├─ claude-code: @anthropic-ai/claude-agent-sdk (subscription login)
  │                             ├─ anthropic:   @anthropic-ai/sdk (API key, adaptive thinking, prompt cache)
  │                             ├─ kimi:        @anthropic-ai/sdk → api.kimi.com/coding (Anthropic-compatible)
  │                             └─ local:*      OpenAI-compatible /v1/chat/completions (Ollama / LM Studio)
  ├─ params.ts: Customizer annotation parser ─► sliders
  ├─ Web Worker: openscad-wasm ─► binary STL (-D overrides for param changes)
  └─ react-three-fiber viewport: STLLoader ─► mesh + print-bed grid
```

| Piece | Choice |
|---|---|
| Geometry engine | `openscad-wasm` in a Web Worker, fresh instance per render |
| AI | pluggable engines (table above), all streamed over one SSE protocol |
| Param round-trip | OpenSCAD `-D name=value` CLI overrides — no code rewrite, no AI call |
| Persistence | localStorage (`vibemesh.projects.v1`, legacy `vibescad.*` keys auto-migrated), engine choice in `vibemesh.engine.v1` |

## Roadmap ideas

- Manifold-backend OpenSCAD build (openscad-playground fork) for 10–100× faster renders
- BOSL2/MCAD library support (mount into the worker FS)
- Per-part print quantities (`wheel ×4`) baked into the 3MF
- Supabase auth + cloud project sync for sharing
- STL/STEP import as reference geometry

---
description: Start the Vibemesh dev environment (web :5173 + API :5175)
allowed-tools: Bash(npm run dev:*), Bash(npm install:*)
---
Start the Vibemesh dev environment by running `npm run dev`. This launches both
processes together via `concurrently`:

- **API** (`dev:server`) — the plain-JS ESM Express server on `:5175` (AI provider
  dispatch + serving the built frontend in production).
- **web** (`dev:web`) — Vite on `:5173`, which proxies `/api` → `:5175`.

Open http://localhost:5173 in the browser.

Notes for the contributor:
- AI engines are **auto-detected** at runtime via `GET /api/health` (`providerStatus`
  in `server/providers.mjs`). Whatever is reachable shows up: `anthropic` (needs
  `ANTHROPIC_API_KEY`), `kimi` (needs `KIMI_API_KEY`), `claude-code` (the local
  `claude` CLI + login), and `local:<model>` (Ollama / LM Studio at
  `LOCAL_LLM_BASE_URL`, default `http://localhost:11434`).
- **The app works with no engine configured** — the geometry pipeline (param parsing,
  openscad-wasm rendering, sliders, `.3mf`/`.stl` export) is fully client-side and AI-free.
  You only need an engine to generate/refine code from prompts. Keys can also be added
  at runtime from the Engines panel (`POST /api/connect`, writes `.env`).
- If `npm run dev` fails on missing modules, run `npm install` first, then retry.

This command runs the dev server (it stays running). Stop it with the usual interrupt
when you're done.

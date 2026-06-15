# Security Policy

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report privately by emailing **sherif2222222@gmail.com** with:

- a description of the issue and its impact,
- steps to reproduce (a proof of concept if possible),
- affected version / commit.

You'll get an acknowledgement as soon as possible. Please allow a reasonable
window to investigate and ship a fix before any public disclosure.

## Scope & good to know

Vibemesh is **local-first**: it runs on your own machine, projects are stored in
your browser's `localStorage`, and AI keys live in a local `.env` that is never
committed. There is no hosted multi-tenant service.

### What leaves your machine

Almost nothing. Projects, parameters, rendering and all exports are fully local.
The **one** exception is AI generation: when you send a prompt, that prompt text
(plus any reference images you attach) is transmitted to the **AI provider you
selected** — Anthropic, Kimi, or, for `local:*` engines, your own Ollama/LM Studio
endpoint (which stays on your network). Generated OpenSCAD comes back the same way.
Nothing is sent until you press Send, and the static demo build (no backend) sends
nothing at all.

- **No analytics, no telemetry, no tracking.** Vibemesh ships no analytics SDK,
  beacons, or phone-home. The only outbound requests are the AI calls described
  above and (in dev) Google Fonts.

Areas worth keeping in mind when assessing security:

- **`.env` handling** — the server can write provider keys into `.env` at runtime
  when you save them in the Engines UI (`POST /api/connect`). Keys never leave
  your machine except toward the provider you configured.
- **The `claude-code` login engine** is for personal/local use only per Anthropic's
  Agent SDK terms — a distributed/hosted build must use API keys instead.
- **AI-generated OpenSCAD** is compiled by `openscad-wasm` inside a sandboxed Web
  Worker; it cannot read your filesystem or network. The system prompt forbids
  `import`, `surface`, `text()`, and external libraries.
- The Express server's only jobs are AI provider dispatch and serving the built
  frontend; it never executes generated code.

### Self-hosting note

The Express backend is designed for **local, single-user** use and binds to
`127.0.0.1` by default. It has **no authentication, rate limiting, or per-user key
isolation**. Do **not** expose it directly to the public internet — anyone who can
reach it can spend your configured API keys and write to your `.env`. If you need a
multi-user deployment, put it behind your own auth/proxy and switch to per-user API
keys. The static **demo** build (GitHub Pages) ships no backend and is safe to host
publicly.

### Known advisories

`npm audit` may report **dev-only** advisories (e.g. the esbuild dev-server request
issue, `GHSA-gv7w-rqvm-qjhr`) that come from the Vite toolchain. These affect the
local dev server only and are **not** present in the shipped `dist/` bundle. CI gates
on `npm audit --omit=dev --audit-level=high`, i.e. production dependencies only.

Thanks for helping keep Vibemesh and its users safe.

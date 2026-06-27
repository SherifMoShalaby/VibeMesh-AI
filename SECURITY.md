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

Vibemesh-AI is **local-first**: it runs on your own machine, projects are stored in
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

- **No analytics, no telemetry, no tracking.** Vibemesh-AI ships no analytics SDK,
  beacons, or phone-home. The only outbound requests are the AI calls described
  above and (in dev) Google Fonts.

Areas worth keeping in mind when assessing security:

- **`.env` handling** — the server can write provider keys into `.env` at runtime
  when you save them in the Engines UI (`POST /api/connect`). Keys never leave
  your machine except toward the provider you configured. The four `.env`-writing
  routes (`/api/connect`, `/api/connections` POST/DELETE, `/api/discover-models`)
  are additionally restricted to an **owner** once auth is configured (see below).
- **The `claude-code` login engine** is for personal/local use only per Anthropic's
  Agent SDK terms — a distributed/hosted build must use API keys instead.
- **AI-generated OpenSCAD** is compiled by `openscad-wasm` inside a sandboxed Web
  Worker; it cannot read your filesystem or network. The system prompt forbids
  `import`, `surface`, `text()`, and external libraries.
- The Express server's only jobs are AI provider dispatch and serving the built
  frontend; it never executes generated code.

### Self-hosting note

The Express backend is designed for **local, single-user** use and binds to
`127.0.0.1` by default. The static **demo** build (GitHub Pages) ships no backend
and is safe to host publicly.

#### Auth contract (local dev vs. hosted)

Authentication is **conditional on Supabase being configured**, so a local
`npm run dev` / `npm start` is unchanged (no login, no 401s):

- **Local dev — Supabase env unset** (`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`):
  the spending + key-writing routes are an open pass-through, exactly as before.
- **Hosted — Supabase env set:** `/api/generate`, `/api/connect`,
  `/api/connections` (POST + DELETE), `/api/discover-models`, and `/api/test`
  require a valid Supabase bearer token (`Authorization: Bearer <jwt>`); an
  unauthenticated request gets **401**. (`/api/generate` is also rate-limited
  **before** the body is parsed.)

If you bind `HOST=0.0.0.0` or sit behind a reverse proxy, **configure Supabase
auth** — otherwise anonymous callers can drain your AI budget and overwrite your
`.env` keys. Set `TRUST_PROXY` when fronted by a proxy so the rate-limit key is the
real client IP.

#### Owner gate for `.env`-writing routes

Once auth is configured, the four routes that mutate the shared `.env`
(`/api/connect`, `/api/connections` POST/DELETE, `/api/discover-models`) require an
**owner**, returning **403** for a non-owner authenticated user. Ownership is:

- the user's id appears in the **`OWNER_USER_IDS`** allowlist (comma/space-separated), **or**
- the user's Supabase role (`app_metadata.role` / `user_metadata.role` / `role`)
  is `owner` or `admin`.

With auth configured but **no owners declared**, every authenticated user is treated
as an owner (single-operator default) — set `OWNER_USER_IDS` to lock it down for a
true multi-user deployment. In local dev (no Supabase) the gate is a no-op. A fuller
multi-user fix (per-user secrets out of the shared `.env`) is tracked separately.

#### Outbound-fetch (SSRF) guard for custom/local endpoints

`/api/discover-models` and saved connections fetch a user-supplied base URL. The
guard (`validateFetchUrl`) is **http(s)-only** and **always** blocks the cloud
metadata service (`169.254.x` link-local, `metadata.google.internal`). By **default**
it also blocks private/loopback ranges — RFC1918 (`10/8`, `172.16/12`, `192.168/16`),
`127.x` / `localhost`, IPv6 loopback/ULA (`::1`, `fc00::/7`), `0.0.0.0`, and CGNAT
(`100.64/10`) — so a non-loopback deployment can't be turned into an internal-network
probe. To use a **local LLM** (Ollama / LM Studio at `localhost`/LAN), set
**`ALLOW_PRIVATE_FETCH=1`** to re-permit those ranges (metadata/link-local stay
blocked even then). Note this is a **URL-shape** guard, not a DNS-rebinding defense —
a hostname that *resolves* to a private IP at fetch time is not caught.

The `claude-code` login engine is for **personal/local use only** and a distributed
build must use API keys.

### Known advisories

`npm audit` may report **dev-only** advisories (e.g. the esbuild dev-server request
issue, `GHSA-gv7w-rqvm-qjhr`) that come from the Vite toolchain. These affect the
local dev server only and are **not** present in the shipped `dist/` bundle. CI gates
on `npm audit --omit=dev --audit-level=high`, i.e. production dependencies only.

Thanks for helping keep Vibemesh-AI and its users safe.

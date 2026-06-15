# Claude Code setup

This repo ships a [Claude Code](https://claude.com/claude-code) configuration so
contributors get project-aware slash commands, skills, and review agents out of the
box. Open the repo in Claude Code and everything below is available immediately.

## Slash commands (`.claude/commands/`)

| Command | What it does |
|---|---|
| `/dev` | Start the dev environment (web `:5173` + API `:5175`) and explain engine detection. |
| `/check` | The verification gate — run `npm run lint` + `npm run build`, then fix whatever fails. Run this before every PR (there is no test suite). |
| `/bench [filter]` | Run the model benchmark (engine × task matrix; needs the dev API on `:5175`) and summarize `bench/results/`. Optional engine/task filter. |
| `/add-engine <id> [name]` | Guide adding a new AI provider end-to-end: dispatch, availability, runtime keys, docs. |
| `/release-check` | Pre-PR readiness checklist: lint/build, `docs/SPEC.md` sync, no staged secrets, branding. |

## Skills (`.claude/skills/`)

Loaded automatically when relevant; invoke explicitly with `/<name>`.

- **`openscad-contract`** — the model response contract + printability rules every engine
  must keep emitting. Read this before touching `server/prompt.mjs`, `src/lib/params.ts`,
  the render pipeline, or any export path.
- **`add-ai-engine`** — the deeper how-to behind `/add-engine`: `streamChat` dispatch,
  per-engine stream functions, `providerStatus`/`/api/health`, runtime key persistence,
  and the client-side history rules.

## Review agents (`.claude/agents/`)

Read-only reviewers that auto-delegate (or invoke via the Task tool):

- **`geometry-reviewer`** — checks changes to the OpenSCAD contract and the
  prompt → params → render → export pipeline.
- **`architecture-reviewer`** — checks changes against the two-process architecture
  invariants (server never sees OpenSCAD, SSE abort wiring, single-shot wasm worker,
  `vibemesh.*` storage migration, build-only security headers, store guard patterns).

## Settings & what's tracked

`settings.json` (committed) pre-approves the safe dev/bench commands and **denies reading
`.env`** so secrets never land in context. Personal/local files — `settings.local.json`
(your own permissions) and `launch.json` — are git-ignored and stay on your machine. See
the `.claude/*` block in [`.gitignore`](../.gitignore).

For the full architecture tour see [`CLAUDE.md`](../CLAUDE.md); for contribution flow see
[`CONTRIBUTING.md`](../CONTRIBUTING.md).

# Contributing to Vibemesh

Thanks for your interest! Vibemesh turns plain-language prompts into parametric,
3D-printable OpenSCAD models, rendered entirely in the browser. Contributions of
all kinds are welcome — bug fixes, new examples, prompt/quality improvements,
docs, and features.

## Development setup

```sh
npm install
npm run dev          # web on http://localhost:5173, API on :5175
```

No API key is required to develop — the built-in examples, parameter sliders,
code editing, and STL/3MF export all work offline. To exercise AI generation,
connect an engine from the menu next to **Send** (see the README's *AI engines*
table). Keys live in `.env` (git-ignored) — **never commit real keys**; copy
`.env.example` to `.env` to start.

## Before you open a PR

```sh
npm run build        # tsc -b && vite build — must pass
npm run lint         # eslint — must be clean
```

Both run in CI on every PR. Please make sure they pass locally first.

There is no unit-test suite. The closest thing is the **model benchmark**, which
exercises the AI generation + render pipeline:

```sh
npm run dev:server                                   # the bench needs the API on :5175
node bench/run.mjs                                   # full engine × task matrix
BENCH_ENGINES=kimi BENCH_TASKS=T7-kit node bench/run.mjs   # focused run
```

If you change generation behavior (the system prompt in `server/prompt.mjs`, the
engine dispatch in `server/providers.mjs`, or the kit/connector logic), please run
the relevant bench tasks and mention the before/after in your PR. `docs/SPEC.md`
is the behavioral contract for the image / refine / versioning / multi-part
surfaces — update it when you change those.

## Project layout

- `src/` — React 19 + zustand + react-three-fiber frontend (TypeScript).
- `server/` — small plain-JS ESM Express server: AI provider dispatch + serving
  the built frontend. The server never sees OpenSCAD code.
- `src/lib/openscad/` — the in-browser openscad-wasm render pipeline (Web Worker).
- `bench/` — the model benchmark + voxel-IoU and buildability scoring.

See `CLAUDE.md` for a deeper architecture tour.

## Coding style

- Match the surrounding code's conventions, comment density, and naming.
- Keep the multi-engine payload portable: features must degrade gracefully across
  the Anthropic, Kimi, Claude-login, and local engines (e.g. no `thinking` or
  `cache_control` on the Kimi path).
- Generated OpenSCAD must stay printable: no global `$fn`, no `import`/`text()`/
  external libraries (the prompt enforces this).

## Reporting bugs / requesting features

Open a GitHub issue with steps to reproduce (and the prompt + engine used, if it's
a generation issue). For security issues, see [SECURITY.md](SECURITY.md) — please
do **not** open a public issue.

By contributing, you agree your contributions are licensed under the project's
[MIT License](LICENSE).

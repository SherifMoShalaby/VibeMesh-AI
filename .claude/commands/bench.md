---
description: Run the model benchmark (engine × task matrix) and summarize results
argument-hint: [engine and/or task filter, e.g. claude-code T1-cube,T7-kit]
allowed-tools: Read, Grep, Glob, Bash(node bench/run.mjs:*), Bash(node bench/score.mjs:*), Bash(node bench/compare.mjs:*), Bash(BENCH_ENGINES=*), Bash(BENCH_TASKS=*)
---
Run the Vibemesh-AI model benchmark — an engine × task matrix that generates OpenSCAD
against the live API, compiles each result with openscad-wasm, and (for tasks whose
geometry is fully determined by the prompt) voxel-scores it against
`bench/gold/<task>.scad`.

**Prerequisite (hard):** `bench/run.mjs` POSTs to `http://localhost:5175/api/generate`,
so the **dev API must already be running on `:5175`** (`npm run dev` or `npm run dev:server`).
If it isn't up, tell the user to start it first — don't try to run it yourself in the
background, just stop and ask.

Steps:

1. Parse `$ARGUMENTS` as an optional filter. The runner is driven by env vars
   (`bench/run.mjs` reads `BENCH_ENGINES` and `BENCH_TASKS`, comma-separated):
   - Engine ids look like `claude-code`, `kimi`, `anthropic`, `local:<model>` → `BENCH_ENGINES=…`
   - Task ids look like `T1-cube`, `T2-stand`, `T7-kit` → `BENCH_TASKS=…`
   - Map the args accordingly. With no args, run the full default matrix.
   Example: `BENCH_ENGINES=claude-code BENCH_TASKS=T1-cube,T7-kit node bench/run.mjs`
2. Run the benchmark. It writes `bench/results/<engine>/<task>.scad` and
   `bench/results/results.json` (this directory is **gitignored**).
3. Summarize `bench/results/results.json`: per engine × task, report compile success,
   the gold voxel-IoU where a gold reference exists, and call out failures/timeouts.

Related tools (mention if useful, run only on request):
- `node bench/score.mjs` — re-score the already-saved `bench/results/` against gold
  **without** re-generating (recompiles + voxel-compares, rewrites the `gold` block).
- `node bench/compare.mjs <a.scad|.stl> <b.scad|.stl>` — ad-hoc diff of any two models
  (placement-normalized, best of four Z-rotations).

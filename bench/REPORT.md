# Vibemesh (formerly VibeSCAD) — E2E & Model Benchmark Report (2026-06-11)

## Method
6 tasks × 3 engines through the live API; every reply compiled with the app's own
OpenSCAD WASM engine; STL bounding boxes measured programmatically.
Tasks: T1 exact-dims cube • T2 phone stand (multi-feature) • T3 cable clip (hardware fit)
• T4 iteration on T1 • T5 fix-broken-code • T6 image→CAD from a dimensioned sketch.
Artifacts: bench/results/<engine>/<task>.scad + results.json

## Scores

| Dimension (weight)            | Claude · login | Kimi K2.6 | Local qwen2.5vl:7b |
|-------------------------------|:---:|:---:|:---:|
| Compiles (30%)                | 6/6 | 6/6 | 1/6 |
| Dimensional accuracy (25%)    | 3/4 | 4/4 | 1/4 |
| Parametric quality (15%)      | 9.8 avg params, grouped+annotated | 10 avg, best groups (uses [Hidden]) | params parroted from prompt examples |
| Printability — sits on bed (10%) | 6/6 | 4/6 | 1/1 |
| Speed avg gen (10%)           | 60s (19–196s) | 26s (3–56s) | 58s |
| Instruction following (10%)   | full | full | poor |
| **Overall /10**               | **8.7** | **9.0** | **2.5** |

## Verdict
- **Kimi K2.6** — best dimensional fidelity (4/4 exact incl. reading the sketch: 100×40×5)
  and 2.3× faster than Claude. Weakness: print placement — centered a cube (minZ=-15)
  and floated a plate 2.5mm above the bed (the app's HUD warning catches both).
- **Claude · login** — perfectly print-ready every time (6/6 on the bed), richest engineering
  judgment in code, exact dims, but slow through the agent loop (worst case 196s) and left a
  0.001mm junk "placeholder" cube in T5 that inflated the bbox (45 vs 30) — visible in the dims HUD.
- **Local qwen2.5vl:7b** — not viable for generation: invalid OpenSCAD (uses `+=`,
  C-style `void f(int x)`, once emitted `差值()` — Chinese for "difference"). Fine for the
  trivial fix task only. Recommendation: `ollama pull qwen2.5-coder:14b` for local work.

**Recommended workflow: draft/iterate with Kimi (fast, accurate), finalize with Claude (print-ready), keep local for offline emergencies.**

## App E2E (all flows)
✔ examples → WASM compile → viewport • ✔ sliders → -D recompile (no AI) • ✔ code editor
apply/render • ✔ error path + recovery + Ask-AI-to-fix • ✔ project persistence/switching •
✔ STL export (valid binary, 556 tris verified) • ✔ .scad export bakes current slider values •
✔ abort/stop • ✔ engines panel connect/test/disconnect • ✔ image input (all 3 engines accept;
Claude Agent SDK image path works via streaming content blocks)

## Issues caught & status
1. **FIXED** — aborting a generation left consecutive `user` messages in history; next send
   would 400 on Anthropic-protocol engines ("roles must alternate"). toApiMessages now merges.
2. Bench-harness-only: long synchronous WASM renders in the bench process stalled Node's
   event loop past the 5s keep-alive window → two "fetch failed" (reruns passed). The app is
   immune (renders in a Worker).
3. Kimi placement misses (above) — mitigated by existing HUD warnings; could add an
   auto-drop-to-bed option later.
4. Claude T5 junk-geometry speck — exposed by dims HUD; harmless but worth knowing.

## Addendum — gold-reference IoU scoring (2026-06-12)

Saved results re-scored geometrically against gold references (`bench/gold/`,
voxel IoU via `bench/score.mjs` — method documented in `bench/compare.mjs`). Tasks with
fully determined geometry only; T2/T3 are open-ended designs and keep bbox checks.

| IoU vs gold | Claude · login | Kimi K2.6 | Local qwen2.5vl:7b |
|---|:---:|:---:|:---:|
| T1-cube    | **1.000** | 0.998 | compile fail |
| T4-iterate | 0.986 | 0.983 | (not generated) |
| T5-fix     | 0.391 | **1.000** | **1.000** |
| T6-vision  | 0.915 | **0.954** | compile fail |

- Placement is normalized (bbox-centered, floored to z=0) and the best of four 90°
  Z-rotations wins, so Kimi's off-bed placements are NOT penalized here — only shape is scored.
- Claude's T5 **0.391** is the junk-speck defect (issue 4) made quantitative: the 0.001mm
  placeholder stretches the bbox to 45×45, shifting the real cube 7.5mm off-center after
  normalization — analytic IoU for that offset is 0.391, matching the measurement exactly.
- T6 deltas are hole-position guesses (insets aren't dimensioned in the sketch); both engines
  read the labeled 100×40×5 ⌀16 exactly (volume ratios 0.994 / 1.041).

## Addendum — accuracy & multi-plate (2026-06-11, later)
- Refine-against-reference loop verified: sabotaged hole ⌀8→3mm; one REFINE click restored 8mm
  AND caught an unplanted real flaw ("notch on wrong corner: render bottom-right vs image top-right").
- Multi-plate `part` convention verified: plates bar (ALL/BASE/LID), per-plate dims, ALL PLATES
  export produced 2 valid STLs (base 44×44×20, lid 44×44×3).
- Bed size now sent as runtime context with every generation.

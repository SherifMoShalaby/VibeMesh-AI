# R&D — Output Quality Optimization (Track B)

**Audience:** Vibemesh-AI engineering team
**Scope:** Improving the quality of generated output **inside the existing OpenSCAD/parametric pipeline** — no GPU mesh backend, no model training, no kernel change. Output stays printable, parametric, and editable.
**Status:** Planning. Every item below is grounded in a real code path and a measured bench number that was verified against the repo at the time of writing.

---

## 1. Executive summary

Vibemesh already computes the richest **functional-correctness** signals in the category — voxel-IoU, cutter-vs-structure interference, buildability (per-piece recompile), structural/dimensional scorers — but they live almost entirely in the **offline bench** and never touch live output. Meanwhile **runtime generation is single-shot**: the per-task variance the bench measures (one sample compiles, the next doesn't — `T7-kit`/`T9-pressfit`/`T11-technic` are exactly this) is fully exposed to users, with no verifier-guided selection or repair.

The highest-ROI move set is two-pronged:

1. **Promote the scorers we already own into the live generate loop** as selection + self-repair signals — runtime interference self-repair, verifier-guided best-of-N, and a harder pre-adopt gate on the deterministic validators. There is already a bounded auto-fix seam in `runGeneration` (`src/state/store.ts`, `MAX_AUTO_FIX = 2`) consuming `structuralReport` + `skillReport` + `degenerateReason`; we extend that seam rather than build new infrastructure.
2. **Close concrete, bench-measured prompt/placement/contract gaps** the baseline points at directly: `T4` chamfer-as-taper (IoU 0.77), the `T7/T9/T11` per-piece compile failures, `T10` over-split, off-bed assembly previews, the live viewpoint-name drift, and the global-`$fn` contract leak.

Two corrections from review govern the whole plan and must not be lost:

- **Voxel-IoU is NOT a runtime signal.** `src/lib/refineProxy.ts:13-14` states plainly that there is no gold reference for a user's prompt at runtime, so IoU cannot run live. Every runtime selector/reward must use only the **reference-free** signals (compile-clean, `degenerateReason`, `structuralReport`, `skillReport`/validators, dim-vs-stated, and the new interference proxy). IoU stays bench-only.
- **The in-browser OpenSCAD worker is a single-flight, coalescing, single-shot WASM worker** (`src/lib/openscad/client.ts`). Candidate scoring (best-of-N) and interference probes (2 extra compiles/kit) **serialize** through one worker and contend with the user's live render. Any loop-heavy work needs a **shared per-request compute/latency budget** and a bounded compile queue — not three independently-gated toggles that can co-fire and blow past the 90s watchdog.

This loop is also our only category-unique moat: no commercial rival (Meshy/Tripo/Backflip/Adam/Zoo/Sloyd) publishes a correctness verifier. Wiring it into live output compounds that advantage.

---

## 2. Current measured baseline & weak spots

Numbers below are from `bench/baseline.json` (verified). Shippable engine is **kimi** (`T1`–`T12`); `T6b`/`T13`–`T16` are baselined **only under `claude-code`**, which is advisory and **never gates** — so the mechanism/composition lanes on shippable engines are currently **unguarded**.

### Per-task baseline (load-bearing rows)

| Task | Engine | compiled | dimScore | IoU | placement | buildability | interference | overSplit | Read of the weakness |
|------|--------|----------|----------|-----|-----------|--------------|--------------|-----------|----------------------|
| T4-iterate | kimi | ✓ | 0.97 | **0.77** | 1 | — | 0 | false | **Lowest-IoU task.** bbox right, shape wrong: chamfer-the-top-edges read as taper-the-whole-part (truncated pyramid). |
| T6-vision | kimi | ✓ | 1 | 0.896 | **0** | — | 0 | false | Perfect dims but sits off the bed (placement 0). Silent printability defect IoU/dim are blind to. |
| T7-kit | kimi | **✗** | — | — | — | — | — | false | Kit fails to compile on the shippable engine. The moat class. Also ships `$fn = 24;` (see below). |
| T8-knob | kimi | ✓ | 1 | 0.937 | 1 | — | 0 | false | Same chamfer-as-taper family as T4. |
| T9-pressfit | kimi | **✗** | — | — | — | — | — | false | Kit / press-fit fails to compile. |
| T10-spinner | kimi | ✓ | 1 | — | **0.5** | — | 0 | **true** | **Over-split (zero-tolerance gate trigger):** a single printable part emitted a 6-option `part` enum. asymmetry 0.78, moduleDistinctness 8. |
| T11-technic | kimi | **✗** | — | — | — | — | — | false | Kit / technic fails to compile. Axle-routing-between-clutch-tubes is also an interference case. |
| T6b-vision-tiled | claude-code | ✓ | 1 | — | **0.5** | — | — | false | Advisory-only lane; off-bed assembly preview. |
| T13-gear-pair | claude-code | ✓ | 1 | — | — | **0.88** | — | false | `connectorsPresent=0.5`: mating geometry present but **no named clearance/fit parameter** — fit may be wrong. Advisory-only. |
| T14-pip-hinge | claude-code | ✓ | 1 | — | 1 | — | **0** | false | **interferenceScore 0:** a cutter slices structure that must stay solid. Advisory-only. |
| T15-snap-fit | claude-code | ✓ | 1 | — | — | 1 | **0.5** | false | Partial interference. Advisory-only. |
| T16-composed | claude-code | ✓ | 1 | — | — | 1 | **0.5** | false | Partial interference + off-bed assembly (`minZ≈-11.87` in results). Advisory-only. |

### Weak-spot clusters

- **Single-shot variance on kits** — `T7`/`T9`/`T11` `compiled:false` is the single biggest `compiledRate` gap on the shippable engine, and the buildable kit is the moat. The bench recompiles each `part`-enum branch with `-D part=`, so a kit that previews fine in `all` but has a broken standalone per-piece path is a hard fail.
- **Functional interference is invisible at runtime** — `interferenceScore` 0 on `T14`, 0.5 on `T15`/`T16`. manifold ≠ functional; a bore gutting a clutch tube scores `buildability=1.0` and IoU/dim are structurally blind to it. Nothing checks the `_debug` probe contract at runtime (only a comment in `src/lib/params.ts:58`).
- **Off-bed parts with perfect dims** — `T6` placement 0, `T6b` 0.5. The deterministic drop-to-bed (`store.ts:634`) is gated `!isMultiPart`, so **kits/assemblies get no placement correction**.
- **Contract leaks** — `bench/results/kimi/T7-kit.scad:38` literally ships `$fn = 24;` in a `[Hidden]` group, defeating the quality-preset `-D '$fn=0'` overrides. The prompt forbids it; nothing checks it.
- **Connector-without-clearance** — buildability repeatedly scores `connectorsPresent=0.5` because a named clearance/fit parameter (`CLEARANCE_RE` in `bench/buildability.mjs`) is absent — the parametric-mating moat not being honored.
- **Live UX bugs (not just bench artifacts):**
  - **Viewpoint-name drift** — `src/lib/capture.ts:12-13` shoots 4 poses (iso/front/top/**right**, in that order); `src/components/ChatPanel.tsx:111` tells the model only "isometric, front, top — in that order". With 4 images attached and 3 named, the model mis-attributes the 4th — undermining the side-asymmetry view the right pose exists for.
  - **Refine loop is gated blind** — auto-refine (`store.ts:651-672`) is gated ONLY by `dimDiscrepancies`; on un-dimensioned references it continues/stops with no perceptual feedback.

### Eval-set limits (named honestly)

- Only **6 gold `.scad` files** exist (`T1`, `T4`, `T5`, `T6`, `T8`, `T17`) for IoU scoring; recommendations touch ~17 tasks. The bench is a thermometer with few degrees of resolution — guard against overfitting prompts to 17 tasks.
- `T17-hardsurface` has a gold file but is **absent from `baseline.json` entirely** — ungated.
- Gate tolerances are deliberately wide (`bench/gate.mjs`: IoU tol 0.03 "tighten once repeat-sampling enforced", interference tol 0.1 "advisory until baselined"). Do **not** tighten off a single-sample run.

---

## 3. Prioritized optimization backlog

Effort: **S** ≤ a day, single low-blast-radius file · **M** = a few days + a bench cycle · **L** = net-new plumbing + multiple bench cycles.
"Metric moved" is stated honestly — several runtime/export fixes move **no bench number** because the bench is blind to them (kit placement, global-`$fn`); those are guarded by the walker/unit layer, not the gate.

### Quick Wins (S)

| ID | Lever | Approach + files | Effort | Impact | Risk | Metric it moves |
|----|-------|------------------|--------|--------|------|-----------------|
| **B1** | Sync refine viewpoint names to the 4 captured poses | Export the pose order from `src/lib/capture.ts`/`Viewport.tsx` and consume it in `src/components/ChatPanel.tsx:111` (single source so it can't drift again). Update `docs/SPEC.md` refine section. | S | Medium | Negligible — prompt-text only; confirm 4 images still attach. | None directly (live refine fidelity). Fixes a live bug. |
| **B2** | Drop the multi-part **assembled `all`** preview onto z=0 | In `store.ts` recovery block (~L615-641), when `isMultiPart` AND current view is `all` AND no explode offset, apply the same `setMeshTransform` z-floor used for single parts. Also strengthen prompt §3 so the `all` view itself rests `minZ≈0`. | S | High | Low — apply only to `all`, never fight a deliberate explode. | **No bench delta on kits** (`run.mjs:609` `placementScore: task.kit ? undefined`; computed from RAW STL, not `meshTransform`). The **prompt** half moves T6/T6b. Justify on printability, not the gate. |
| **B3** | Harden no-global-`$fn` + pre-adopt check | Add a `structuralReport` (`src/lib/compileReport.ts`) check flagging a **top-level** `$fn = <n>;` (regex must exclude per-call `$fn` in module/cylinder args). Route into the existing `store.ts:626` auto-fix path. Reinforce prompt with "this defeats the quality presets". Add to the kit exemplar broken-control so the walker guards it. | S | Medium | Low — regex must distinguish global from per-call. | **No baseline number** (bench doesn't score `$fn`; a global `$fn` still compiles). Value = preset correctness + walker guard. |
| **B4** | Over-split directive + distinct-modules-vs-kit-split signal | Prompt pass: separate "distinct modules within ONE printable solid" (use `module()` calls, no `part` enum) from "separate snap-together pieces" (`part` enum only on `detectKitIntent`). Pass the signal through `server/providers.mjs` kit context. | S | Medium | Low — `overSplit` is zero-tolerance so a regression is caught immediately. | **`overSplit` (T10)** — bench-measured, gateable. |
| **B6** | Connector clearance: bind it, don't just re-ask | The prompt **already** mandates named clearance (`prompt.mjs:98,105,199`) — re-asking is low-yield. Instead add a `structuralReport`/skill validator that **hard-flags a connector with no named clearance param** (`CLEARANCE_RE`), so it binds. Scope to mating/connector skills only. | S | Medium | Low — must not over-fire on non-mating parts. | `connectorsPresent` / buildability (T13). Pairs with B7/D2. |
| **B8a** | Baseline the un-gated mechanism lanes (governance) | Run `BENCH_SAMPLES=3` on **kimi + anthropic** across `T13`–`T17` and `--update-baseline` (commit). Brings the moat lanes + `T17-hardsurface` under the real gate. **Pure ratchet hygiene, no behavior change** — do first so later edits are guarded. | S | High (governance) | Low. Don't tighten tolerances off `<2` samples. | Brings `buildability`/`interference`/`placement` on `T13`–`T17` under the gate. Note: **kimi rejects the effort param** (400s), so effort routing — B8b — is anthropic-only. |

### Medium Bets (M)

| ID | Lever | Approach + files | Effort | Impact | Risk | Metric it moves |
|----|-------|------------------|--------|--------|------|-----------------|
| **D1** | Skill registry expansion (uncovered mechanism families) | Add entries to `server/skills.mjs` (fragment + compile-verified exemplar + `validate()` + TRIGGER regex + `SKILL_PORTS`), each auto-gated by `bench/skills.selftest.mjs` + the registry walker. **Sequence by frequency × geometric honesty:** threaded-lid + standoffs + dovetail + bayonet first. Add a `bench/gold/<task>.scad` for IoU-scorable ones (threaded-lid). | M | Medium | Medium — **exemplar poison** (walker-green mandatory); over-selection if a TRIGGER is too loose (negative-case lane: plain "bracket"/"knob" must fire ZERO skills). | Widens coverage (new tasks). 22 skills today. |
| **D2** | Edge-local chamfer/fillet vs global taper | Prompt fragment + retrieved skill/exemplar distinguishing per-edge 45° cutter on a named edge set from a full-part taper, with a worked example. **Use per-edge cutters, NOT minkowski** (minkowski forces the CGAL fallback — `compileReport.ts:17`). Add a gold-backed edge-chamfer task to `bench/gold` + `bench/run.mjs`. | M | Medium | Low-medium — one new gold task; keep the exemplar minkowski-free. | **IoU T4 (0.77) and T8 (0.937)** — the most common edit class. |
| **C2** | Promote the vision-judge to a runtime refine signal | Port `bench/judge.mjs` `judgeVision`'s prompt to a client multimodal call (the refine rig already produces iso/front/top/right), feeding the per-feature DISCREPANCY LIST into the next refine turn (`store.ts:651-672`). Keep the **dim proxy as the PRIMARY stop**; `judgeVision` only as the **un-dimensioned-reference** path. Gate on vision engines + `autoRepair`. | M | Medium | Medium — multimodal call/pass (latency/cost); a noisy verdict must not override a passing dim proxy. Ceiling is kernel-bound (`rotate_extrude` ~60-70%); raises fidelity within that bound, not past it. | Un-dimensioned image fidelity (non-gating). Depends on **B1** (correct view names). |
| **B8b** | Per-class effort/thinking routing | In `server/providers.mjs` add a class→effort map keyed on `context.intent`/kit (max effort + larger thinking for kits/ambiguous/image; lower for trivial single parts). A/B with the existing `VIBEMESH_EFFORT`×class matrix. **anthropic-only** — kimi 400s on effort (`providers.mjs:528-529`). | M | Medium | Low-medium — must be **bench-measured**, never assume more thinking always helps. | Hard-class quality on the anthropic engine (measured). |

### Deeper Bets (L)

| ID | Lever | Approach + files | Effort | Impact | Risk | Metric it moves |
|----|-------|------------------|--------|--------|------|-----------------|
| **A1** | Fix kits that compile in `all` but fail per-piece | **First classify** each of `T7`/`T9`/`T11`: does the `all`-view compile fail, or only a `-D part='x'` branch? Then audit the kit exemplar + dispatch (`server/skills.mjs` kit-baseplate, `server/composed.mjs`) so every part-enum branch compiles standalone (no shared-scope dependency that only exists in `all`). Add a buildability assertion that each piece renders alone. Walker-green before any baseline bump. | L | High | Medium — **exemplar poison** (a subtly-wrong kit exemplar degrades every kit gen while scoring buildability=1.0). | **`compiled` on T7/T9/T11** — the biggest `compiledRate` gap. |
| **C1** | Runtime interference self-repair | New `src/lib/interferenceProxy.ts` that **re-implements** voxel-overlap in the browser against `src/lib/openscad/client.ts` (do NOT import `bench/interference.mjs`/`compare.mjs` — they are **node-only**: `node:fs`/`node:path`/`createOpenSCAD`). Reuse `stlBBox`/`parseStl`/`transformStl` (confirmed in `src/lib/stl.ts`). Fire only when `hasDebugContract` is present; compile `positives`/`negatives` through a **bounded queue that never supersedes the live render**; feed non-trivial overlap into the `store.ts:626` auto-fix path. **Gated behind B8a** (interference is advisory-only until baselined). | L | High | Medium — 2 extra **serial** compiles/kit; voxelization cost (keep grid coarse). | `interferenceScore` (T14 0, T15/T16 0.5) into self-healing. |
| **A2** | Verifier-guided best-of-N | For high-ambiguity/kit/image intents (gate on `intent.ambiguityScore`/`detectKitIntent` + an **off-by-default cost toggle**), fan out N=2-3 `streamGenerate` calls (net-new parallel-stream support + a controller **set** in `src/lib/api.ts`/`server/index.mjs`), compile each in-browser, score a composite of **reference-free** signals (compiles-clean, `degenerateReason` empty, `structuralReport` count, `skillReport` count, dim-vs-stated). Adopt the best in `runGeneration`. **Selector must never prefer compiles-but-wrong over clean** — weight compile + degenerate hardest. Off for local engines; **only shippable substrate is anthropic/kimi (paid N× tokens)** — claude-code is personal-use-only. | L | High | Medium-high — N× tokens/latency; **candidate compiles serialize** through the single worker (cheap-signals-first, run interference only on the survivor); N STL buffers in memory. | Caps per-task variance (T7/T9/T11 land-or-not). |
| **A3** | Promote skill/structural validators to a hard pre-adopt gate | With A2: treat a validator/structural **FAILURE** as a hard reject of that sample and prefer a clean one; adopt-with-warning **only when ALL samples fail** (never a dead end; `MAX_AUTO_FIX` bounds it). Without A2: tighten `store.ts:626` to always spend a repair turn on validator issues. `reviewWithSkills` (`server/providers.mjs:510`) already returns the report. **Land B6 first** so the clearance validator isn't over-firing → false rejects. | S→L | Medium | Low — adopt-with-warning fallback is non-negotiable. | Makes the verified-skill contract bind (validator/skill issues). |

---

## 4. Next sprint shortlist (and how to verify each)

Ordered to land the cheap, high-certainty governance + UX fixes first, de-risk the prompt, then attempt the first structural loop. Run the full chain — **`npm run test:run` → `npm run bench` → `npm run bench:gate`** — and obey the three-valued gate exit (0 PASS / 1 REGRESSION / 2 INCONCLUSIVE). Use `BENCH_SAMPLES=3` so the gate can trust tolerances despite API non-determinism.

1. **B8a — Baseline `T13`–`T17` on kimi + anthropic** *(do first; pure governance, no behavior change)*
   Verify: `BENCH_SAMPLES=3 npm run bench` on kimi+anthropic, then `node bench/gate.mjs --update-baseline`; commit `bench/baseline.json`. Confirm `T17-hardsurface` now appears and the mechanism lanes have non-advisory rows. This guards every later edit.

2. **B1 — Viewpoint-name sync** *(live bug, zero geometry risk)*
   Verify: lint + build green; manually confirm a 4-image refine attach names exactly 4 poses in order; `docs/SPEC.md` updated. No bench movement expected.

3. **B4 — Over-split directive + distinct-module signal** *(zero-tolerance, gateable)*
   Verify: `npm run bench` then `npm run bench:gate` — `overSplit` on **T10 must flip false** and no other task may regress (over-split is zero-tolerance). Run the **full** gate, not just T10, because a prompt edit changes all engines.

4. **B2 — `all`-view drop-to-bed + prompt z=0** *(printability; partial bench movement)*
   Verify: `bench:gate` should show T6/T6b `placementScore` improve (the **prompt** half); the runtime drop is verified manually in-app (kit `all` view sits on z=0, per-piece exports still flat). State up front this moves no kit placement number (bench blind).

5. **B3 — Global-`$fn` structural check** *(contract correctness)*
   Verify: `npm test` (add a `compileReport.test.ts` case: top-level `$fn=` flagged, per-call `$fn=` in a `cylinder(...)` not flagged); confirm `bench/interference.selftest.mjs` / kit-exemplar walker stays green. No baseline number expected.

6. **A1 spike — Classify `T7`/`T9`/`T11` failure mode** *(unblocks the moat fix)*
   Verify: for each, recompile the `all` view vs each `-D part='x'` branch and record which fails — this decides whether the fix is an `all`-view bug or a shared-scope per-piece bug **before** touching the kit exemplar (a wrong exemplar poisons every kit gen). Then fix, and gate on `compiled` flipping true with the registry walker green.

**Sequencing note for the loop (A2/C1):** do **not** start best-of-N or runtime interference until B8a (interference baselined), B6 (clearance binds → fewer false rejects), and the A1 spike have landed, and until a **single shared per-request compute/latency budget + bounded compile queue** is specified. A2 + C1 + C2 can all co-fire on one kit+image+ambiguous request and stack serially through one WASM worker — worst case is multi-minute and can trip the 90s watchdog. Before widening A2, prove a measurable bench lift via `BENCH_SAMPLES` aggregation (A/B auto-fix/best-of-N on vs off) — the gate measures end-state quality, not the marginal value of the added turn.

---

## 5. Out of scope / already shipped

### Already shipped (don't rebuild)

- **Bounded runtime auto-fix.** `runGeneration` (`store.ts`, `MAX_AUTO_FIX = 2`) already spends repair turns on `structuralReport` + `skillReport` + `degenerateReason` (`store.ts:625-633`), gated on the `autoRepair` toggle, off for local engines. The genuine delta is **narrower than "promote invisible scorers"** — feed a *more specific* failure reason, admit the **interference** signal (C1), and add the **best-of-N selection** wrapper (A2). ~60% of the "promote scorers" idea is already in place.
- **Deterministic drop-to-bed for single parts** (`store.ts:634-640`). B2 extends it to the `all` view; it is not net-new.
- **Per-piece kit recompile in the bench** (`bench/run.mjs:519-528`, `-D part=`) and the `buildability`/`interference`/`fidelity` scorers — all exist; the work is **wiring them to runtime**, not writing them.
- **Effort plumbing** (`providers.mjs` `resolveEffort`, `VIBEMESH_EFFORT`, the bench effort×class A/B). B8b adds *routing*, not the mechanism.
- **The three-valued gate + transport/generation classification + `<2`-sample refusal** (`bench/gate.mjs`) — the ratchet discipline is already correct; use it, don't change it.

### Explicitly out of scope for Track B

- **Neural mesh-gen backends** (TRELLIS/Hunyuan-style image→mesh). Rejected at the thesis level: a GPU backend breaks the two-process, local-first architecture and produces render-only meshes that aren't parametric/printable — the opposite of the moat.
- **Voxel-IoU as a runtime reward/selector.** Reference-bound; `refineProxy.ts:13-14` confirms there is no gold for a user's prompt at runtime. IoU stays bench-only. Every runtime selector uses reference-free signals only.
- **Importing `bench/*.mjs` into the browser.** `bench/compare.mjs`/`interference.mjs` are node-only (`node:fs`/`node:path`/`createOpenSCAD`). C1 must **re-implement** the voxelizer client-side — this is a real porting cost, not a free import.
- **Temperature-based best-of-N diversity.** `providers.mjs` passes `effort`, not temperature; the claude-code Agent SDK path may not expose it. Diversity comes from effort variation + sampling, not a temperature knob (until verified).
- **Helical machine threads / worm gears in D1.** Same multiplicative-triangle/`rotate_extrude` ceiling as the coil spring. Default to heat-set/tapped/captive-nut; keep helical threads best-effort and out of the first skill batch so we don't ship a thread that erodes the printability reputation.
- **Tightening the wide IoU/skill gate tolerances** off a single-sample run. Only after `BENCH_SAMPLES≥2` median aggregation is enforced (`gate.mjs` notes this explicitly).

### Adjacent gaps flagged by review (not Track-B output-quality, but worth a separate owner)

These came up repeatedly in critique and are **deliberately not** in the backlog above because they are activation/UX/eval-infra rather than output-quality-in-the-pipeline — recording them so they don't fall through:

- **Per-part 3MF material/color** (additive XML in `src/lib/threeMF.ts`, which today emits a bare `<object>` with no `<basematerials>`/`displaycolor`) — on-moat (FDM multi-material), but an export-format feature, not a generation-quality lever.
- **Overhang/support-free verification** — the prompt mandates 45° self-supporting geometry but nothing checks it; a face-normal-vs-build-direction scorer is the most glaring **missing buildability metric** and reuses the same client mesh math as C1.
- **A "parametricity"/editability score** — EDITABILITY is moat-pillar #3 but **no metric measures it** (a manifold shape with hardcoded magic numbers passes IoU/buildability while failing the moat).
- **Clarifying-question UX on `ambiguityScore=high`** — cheaper and higher-quality than best-of-N guessing; the signal already exists (`params.ts:226`) but is only used to gate compute.
- **A visible "verified: no interference / flat-on-bed / fastener dims match M3" affordance** — turns the invisible correctness moat into a marketing-visible differentiator.
- **A shared per-generation compute/cost/latency budget + token meter** — the loop-heavy strategy (A2/C1/C2) has no global ceiling today; a local-first app where the user supplies their own key needs one.

---

*Grounding note: every file path, line reference, and bench number in this document was verified against the repo at authoring time. Where a recommendation moves no bench metric (B2 on kits, B3), that is stated explicitly — the bench is blind to those, and the walker/unit-test layer is the real guard.*

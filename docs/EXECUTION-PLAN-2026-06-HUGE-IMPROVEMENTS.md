# Vibemesh-AI — Execution Plan: Huge Improvements

*Execution plan derived from the 2026-06-22 R&D board (`docs/RND-BOARD-2026-06-HUGE-IMPROVEMENTS.md`) + the image-fidelity leftovers sequence (`docs/IMAGE-FIDELITY-LEFTOVERS-2026-06.md`), by a senior lead, 2026-06-22.*

This turns the board's Now/Next/Bet roadmap into a dependency-sequenced, bench-gated build plan and folds in the prior lead's leftover sequence as the cheap NOW beachhead. Every `file:line` anchor below was re-verified against this branch (the source docs had drifted by tens of lines). It is a build sheet, not a survey: concrete first steps, named functions, the invariant each must preserve.

> **⚠️ AUDIT-VERIFIED 2026-06-23.** A senior-engineering audit board (50 claims, opus adversarial recheck) graded this plan **substantively accurate but anchor-rotted**: every ship / stranded / deferred / not-started *status* holds, but the `file:line` anchors predate the PR #125 deploy/auth merge and have drifted, and **two open-work claims were wrong — both *understating*** (Task 1.1 and Task 0.4 blocker 2, corrected inline below). **Trust the status column; treat inline `file:line` anchors as approximate** and use **§ Corrections (2026-06-23 audit)** at the end for the exact re-anchored locations and the drift the plan never accounted for.

---

## 1. Overall approach

One seam at a time, never a rewrite. The board's central finding stands: the live loop has **no reference-grounded shape oracle** — `scoreCandidate` (`src/lib/bestOfN.ts:40`) and the refine gate (`src/state/generationActions.ts:425` `proxyWantsRefine`) select and critique on bbox / dimension / self-relative-volume math only, never on whether the geometry *looks like* the target. The fix is gated behind one experiment: **an OpenCV.js contour + Z-rotation registration spike on ~10 real hand-held photos must prove IoU correlates with fidelity before anything that consumes a reference contour ships** (board #1, #5, #12). While that spike de-risks the reference-grounded path, we ship the leftovers' **self-relative / reference-free** items first — they need no spike and no quota and deliver value immediately (the NOW beachhead). Two leftover items spend the user's generation quota (default best-of-N for images; turn-0 vision pre-call) and are walled off behind explicit sign-off. Multi-sample bench discipline (`BENCH_SAMPLES≥2`; the gate refuses `<2`) precedes every fidelity-number claim; a live shape gate precedes any RL/distillation (distillation stays deferred; we ship RAG only).

---

## 2. Reconciliation — the two docs against the live tree

### Already shipped (do NOT re-plan)

| Item | Status in tree | Verified anchor |
|------|----------------|-----------------|
| Leftovers PR A (#113) silhouette-trace prompt | shipped | `bench/trace.selftest.mjs` in `bench:selftests` chain (`package.json:60`) |
| Leftovers PR C (#115) concavity-preserving bevel | shipped | `server/prompt.mjs` minkowski bevel |
| Leftovers PR B (#116) **bench-only** silhouette-IoU oracle | shipped **but stranded** | `bench/silhouette.mjs:16` `maskIoU`, `bench/render.mjs:157` `renderMasks` — **zero imports under `src/`** (confirmed by grep). This is exactly what board #1 promotes. |
| Leftovers #117 image CAP 4→10 | shipped | `server/providers.mjs:927` `CAP = 10` |
| Leftovers #118 clarify-before-draw gate | shipped | `bench/clarify.selftest.mjs` in chain |
| Leftovers #122 / #3a **self-relative** convergence stop | shipped | `src/lib/refineProxy.ts:115` `geometryConverged()`; `volume`+`triangles` on `StlBBox` (`src/lib/stl.ts:78-79`) + `stlBBox()` computes them (`stl.ts:117-118`); wired at `generationActions.ts:424` |

> **CRUCIAL nuance — the oracle is NOT done.** #122 shipped a **self-relative** convergence stop: it watches the candidate's *own* volume/triangle plateau and stops refining when the model stops reshaping (`refineProxy.ts:115-124`). That is reference-FREE. It is **not** the board's #1 **reference-grounded silhouette-IoU oracle**, which measures the candidate against the *user's photo*. The two are complementary; do not let #122 be mistaken for #1. The bench oracle (`bench/silhouette.mjs`) is the reference-grounded one and it still touches nothing under `src/`.

### Leftovers that are PRECURSORS / sub-steps of board bets (merge, do not double-list)

| Leftovers item | Folds into board bet | Why |
|----------------|----------------------|-----|
| **3b-safe-1** (volume/tri tiebreak in `scoreCandidate`) | **board #1, step 1** | It is the *first concrete edit* to `CandidateSignals` + `scoreCandidate` — adds the reference-free shape term below `dimMismatches`. The board's `shapeMatch` (reference-IoU) term then slots in at the same seam, strictly below this, gated on the spike. Same file, same lexicographic invariant. |
| **3b-safe-2** (refine-prompt metric injection) | **board #1 / #2 precursor** | Injects measured `volume` / fill-ratio / `triangles` into the refine geometry block (`ChatPanel.tsx:142` `geoBlock`). It is the cheap, always-on, reference-free cousin of board #2's VLM punch-list — tells the model *why* to reshape before any paid judge exists. |
| **#1a** (turn-0 vision pre-call) | **board #5 (pre-gen contour measurement)** ⚠️ | Both inject reference-derived facts into retrieval/`contextText` *before* the first draft. #1a is the LLM-vision cousin (model eyeballs the image); board #5 is the OpenCV-measured cousin (pixels, ordinal facts). Same seam (`server/providers.mjs:519` `visionSourceFragment`), same goal. Sequence #5 (cheaper, deterministic) and treat #1a as the paid escalation. |
| **#1c** (more figurative + composed exemplars) | **board #7 (exemplar RAG corpus)** | The composed/figurative exemplars are the *seed corpus* the RAG retriever (#7a) will draw from. `server/composed.mjs` has only **one** exemplar today (`axle-snap`, `composed.mjs:67`). Authoring more both fixes thin composition coverage now AND pre-stocks the RAG shelf. |

### Leftovers that stay INDEPENDENT (own work items)

| Leftovers item | Independent of | Notes |
|----------------|----------------|-------|
| **#1b** (split `MAX_AUTO_FIX`; Kimi-only temperature) | any board bet | Pure robustness/portability. `MAX_AUTO_FIX = 2` at `generationActions.ts:50`; Kimi descriptor `thinking:false` at `providers.mjs:665` is the only safe place to add `temperature`. |
| **3b-quota** (default best-of-N ON for images) ⚠️ | — | Flag flip; gates board #1's reference-IoU path (the oracle presumes best-of-N is running). HELD on quota. |
| Board **#3a** content-addressed render cache | — | Pure latency/UX; lands at `openscad/client.ts:57` `compile()`. Decoupled from the oracle narrative per the board's own revise. |
| Board **#4a** lineage DAG | — | Pure-client share-file shape; `shareFile.ts:39/93`. Pre-stocks #7's corpus record shape but ships standalone. |

---

## 3. Phased plan

### Guardrails (non-negotiable across every phase)

1. **Response contract sacred** — prose + exactly ONE ```scad block, Customizer-first; printability invariants intact. Any edit to `server/prompt.mjs` / `src/lib/params.ts` / the render pipeline / exports runs the `openscad-contract` skill.
2. **Match validation to change type** (leftovers' rule): client-side changes → **vitest unit + CI e2e**, NEVER the server bench (it's a server/engine matrix). Server prompt/exemplar changes → `bench:selftests` + optional live `bench`.
3. **Multi-sample before any fidelity number** — `BENCH_SAMPLES≥2`; the gate refuses `<2` (3-valued: 0 PASS / 1 REGRESSION / 2 INCONCLUSIVE).
4. **Registration spike gates every contour consumer** — nothing that compares against a reference contour ships until the spike passes; fallback is self-consistency IoU across the candidate's own 4 poses.
5. **SSE wiring intact** — `res.on('close') → abort.abort()` (`server/index.mjs`) is the only teardown; do not break it.
6. **Provider portability** — anthropic keeps adaptive thinking + cache_control; Kimi stays plain-string (no thinking/cache_control/temperature-on-thinking); claude-code single-turn flatten; local exemplar-drop.
7. **Soft, never hard** — the shape oracle is a tiebreak *strictly below* the compile/degenerate tiers and a monotonic refine-STOP signal only. A registration miss costs at most one wasted pass, never a rejected-correct part.
8. **Honest ceiling** — none of the NOW/NEXT tier breaks the organic ~60-70% axisymmetric ceiling; say so.

---

### Phase 0 — Cheap, safe NOW beachhead (no spike, no quota)

**Rationale.** Every item here is self-relative / reference-free or pure-client infra. They deliver value *while the registration spike (Phase 1) de-risks the reference-grounded path*, and several are precursors that make the later oracle work land cleanly. Ship them first.

#### Task 0.1 — Refine-prompt metric injection (leftovers 3b-safe-2; precursor to board #1/#2)
- **Goal.** Let the model self-diagnose a hollow/thin result by feeding it the measured outcome metrics it currently never sees. Always-on, advisory, reference-free.
- **Files & verified anchors.** `src/components/ChatPanel.tsx` — the refine prompt is assembled in `refine()` (`ChatPanel.tsx:106`); the measured-dimension `anchor` string is built at `:113-114`; the `geoBlock` (independent geometric facts) at `:142-144`; `modelDims` already carries `volume` + `triangles` (`StlBBox`, `stl.ts:78-79`).
- **Concrete change.** Add a `fillBlock` string beside `geoBlock`: compute `fillRatio = modelDims.volume / (modelDims.x * modelDims.y * modelDims.z)`. When `fillRatio` is implausibly low (e.g. `< 0.15`), append an advisory line into the refine message ("the solid fills only N% of its bounding box — confirm the body is solid, not an unintended shell"). Slot it AFTER `geoBlock` (facts-first ordering preserved). Inject `triangles` only as context, not a directive. Keep it advisory — it must never become a hard gate; the `geoBlock` dimension facts stay the leading signal.
- **Validation.** vitest unit (the fill-ratio computation is a pure function — extract it to `refineProxy.ts` next to `geometryConverged` and unit-test the threshold) + CI e2e (refine still fires). **Not the server bench** (client-side).
- **Effort.** S · **Risk.** Low — advisory text only; mitigate false alarms by tuning the threshold conservatively and wording it as a question, not an assertion. · **Quota.** none. · **Maps to.** leftovers 3b-safe-2 → board #1/#2 precursor.

#### Task 0.2 — Best-of-N volume/tri tiebreak (leftovers 3b-safe-1; **first concrete step of board #1**)
- **Goal.** When two best-of-N candidates tie on the existing lexicographic criteria, break the tie toward the more plausible solid (not hollow, not a degenerate sliver). Zero-regression by construction — it only resolves ties the current scorer leaves arbitrary (`pickBestIndex` keeps the earliest on a true tie, `bestOfN.ts:62`).
- **Files & verified anchors.** `src/lib/bestOfN.ts` — `CandidateSignals` interface (`bestOfN.ts:19-34`), `scoreCandidate` (`bestOfN.ts:40-58`), the documented lexicographic invariant (`bestOfN.ts:14`). The candidate seam that populates signals: `generationActions.ts:113` (`stlBBox(r.stl)` already in hand — `dims.volume` / `dims.triangles` available for free).
- **Concrete change.** Add `volume?: number` and `fillRatio?: number` to `CandidateSignals`. Populate them at the candidate seam (`generationActions.ts:118`) from the already-computed `dims`. In `scoreCandidate`, add a tiebreak term **strictly below `dimMismatches`** in the compiled branch (`bestOfN.ts:53-57`): a tiny penalty `score -= implausiblyHollow(fillRatio) ? SMALL : 0` where `SMALL << 100` (the `dimMismatches` weight) so it can NEVER reorder candidates that differ on any higher signal. Preserve: non-compile always loses to compile (`bestOfN.ts:46-53`); budget-starved candidates keep their `750_000` benefit-of-the-doubt band (`:50-52`) untouched.
- **Validation.** vitest unit — assert (a) the tiebreak only fires on an exact tie of all higher signals, (b) a non-compile still scores below any compile, (c) a degenerate still scores below a clean one. **Not the server bench** (client-side pure function).
- **Effort.** S · **Risk.** Low; the only risk is mis-weighting the penalty so it crosses a higher tier — mitigated by `SMALL << 100` and the unit assertions. · **Quota.** none. · **Maps to.** leftovers 3b-safe-1 = board #1 step 1 (the `CandidateSignals` shape the reference-IoU `shapeMatch` term later joins, strictly below this).

#### Task 0.3 — Split `MAX_AUTO_FIX`; Kimi-only temperature (leftovers #1b, independent)
- **Goal.** Stop the contract-reask budget and the geometry-fix budget from starving each other; give Kimi a temperature knob without breaking the Opus adaptive-thinking path that rejects it.
- **Files & verified anchors.** `src/state/generationActions.ts` — `MAX_AUTO_FIX = 2` (`:50`) is shared across the contract re-ask (`:242`) and the render/structural auto-fix (`:330` `canRepair`). `server/providers.mjs` — Kimi descriptor `resolveEngineDescriptor` returns `thinking:false` (`:665`); the anthropic body spreads `thinking:{type:'adaptive'}` (`:752`) — **temperature must NOT be added there**; the local path already sets `temperature:0.2` (`:1052`).
- **Concrete change.** (a) Introduce `MAX_CONTRACT_REASK = 1` (or 2) separate from `MAX_AUTO_FIX`, thread a distinct counter for the contract-violation branch (`:242`) so a format reask no longer consumes a geometry-fix slot. Keep the combined ceiling sane so the two together can't loop. (b) In `streamAnthropicProtocol`, add `temperature` to the request body ONLY when `desc.thinking === false` (i.e. Kimi and any future non-thinking anthropic-protocol provider) — guard it exactly like the existing `...(desc.thinking ? {thinking} : {})` spread at `:752`. Do not touch the local OpenAI-shim path (already has temperature).
- **Validation.** (a) vitest unit on the budget split (counter logic). (b) Server change → `npm run bench:selftests` (zero-API; `bench/server.selftest.mjs` covers the provider core) + a live `bench` smoke on Kimi to confirm the body is accepted. Run the `add-ai-engine` skill's portability checklist.
- **Effort.** S · **Risk.** Low; the live risk is adding temperature to a thinking request (API 400) — mitigated by gating on `desc.thinking === false`. · **Quota.** none (one Kimi smoke run). · **Maps to.** leftovers #1b.

#### Task 0.4 — More figurative + composed exemplars (leftovers #1c; seeds board #7 corpus)
> **STATUS (2026-06-22): DEFERRED — the only Phase 0 item not safely completable autonomously.**
> Three blockers surfaced on inspection, all real: **(1)** `bench/composition.selftest.mjs` iterates every
> `COMPOSED` entry (good — a new one IS compiled + interference-checked), but its CONTROL mutations are
> **hardcoded to axle-snap's variable names** (`pocket_h = wall - 0.8;`, `pin_len`, lines 56-58), so a new
> exemplar fails control (3) unless the selftest is first refactored to **per-fixture control mutations**.
> **(2) ~~no existing injection seam~~ — CORRECTED 2026-06-23 (audit found this WRONG).** The figurative
> injection seam ALREADY EXISTS: `server/skills.mjs` ships figurative exemplars (CROWN / CRENELLATION /
> PRONG-ORB, ~L616/638/659) as registered skills with fragments + `validate` + regex triggers, flowing
> through `providers.mjs` `contextText` and gated by `bench/skills.selftest.mjs`. Adding a figurative
> exemplar is a **registry-entry add, not a new feature** — so 0.4's *figurative* half is unblocked today;
> only blockers (1) and (3) survive. **(3)** Decisively: the *value* of any new few-shot exemplar (better generation) is
> **unverifiable without a live API key** (`npm run bench`), and a subtly-wrong exemplar actively *degrades*
> output because the model imitates it. Shipping blind geometry contradicts the verified-before-claimed bar
> the rest of this plan holds. **Do this in a live-bench session:** first refactor the selftest to per-fixture
> controls (safe, testable on the existing axle-snap), then author ONE composed mechanism, compile + probe it
> via the selftest, then `npm run bench` to confirm a quality lift before committing. Board #7's RAG (Task 4.1)
> does not hard-depend on this — it can seed from the existing kit/composed exemplars + the 18 bench tasks.
- **Goal.** Fix thin composition coverage (one exemplar today) and pre-stock the RAG corpus with 2-3 figurative/revolve-profile + composed-mechanism exemplars.
- **Files & verified anchors.** `server/composed.mjs` — `COMPOSED` map (`composed.mjs:66`) has exactly **one** entry, `axle-snap` (`:67`). Each composed exemplar doubles as its composition/interference probe fixture (CLAUDE.md), so editing one re-baselines `bench/composition.selftest.mjs` + `bench/interference.selftest.mjs`.
- **Concrete change.** Author 2-3 new compile-verified exemplars: at least one composed-mechanism (e.g. hinge+detent, or geared pair) into `COMPOSED`, and 1-2 figurative revolve-profile exemplars in the appropriate fragment file. Each must compile standalone under `--backend=Manifold`, obey the contract (Customizer-first, no global `$fn`, ≥1.2mm walls, flat on z=0), and carry the `_debug` probe contract where it gates interference. Update the composition `SKILL_PORTS` graph entry if a new mechanism pair is introduced.
- **Validation.** Server/exemplar change → `npm run bench:selftests` (the `composition`, `composition-graph`, `interference` selftests re-baseline from the exemplars; expect to update their committed fixtures) + `npm run bench` live to confirm generation quality lifts on a composed task, then `bench:gate` for zero regression.
- **Effort.** M · **Risk.** Medium — a new exemplar that interferes or breaks a selftest fixture; mitigated by compile-verifying each + running the interference probe before committing. · **Quota.** none for the selftests; a few live bench runs to validate quality. · **Maps to.** leftovers #1c → board #7 corpus seed.

#### Task 0.5 — Content-addressed render cache (board #3a, independent)
- **Goal.** Collapse redundant recompiles (slider revisit, version restore, best-of-N re-rolls) by caching STL keyed on `hash(code + sorted(defines) + wasmBuildHash)`. Makes the product's best moment — instant slider re-render — instant for any *previously seen* value.
- **Files & verified anchors.** `src/lib/openscad/client.ts` — `OpenScadEngine.compile()` (`client.ts:57`), `CompileOpts` (`client.ts:21`), the singleton `openscad` (`client.ts:146`). The `(code, defines)` tuple is complete: quality presets are `-D` defines (CLAUDE.md), so `defines` already carry `$fn/$fa/$fs`.
- **Concrete change.** Add a content-addressed `Map<string, ArrayBuffer>` (LRU-bounded) inside `OpenScadEngine`, keyed `hash(code + sorted(defines).join() + WASM_BUILD_HASH)`. On `compile()`, check the cache first and resolve synchronously on hit (without touching the worker / FIFO). On miss, compile and populate. A WASM-build-hash change invalidates the whole cache (include it in the key). Bound memory — STLs can be large; cap entries. Do **not** decouple from or alter the supersede/watchdog logic for the miss path.
- **Validation.** vitest unit — assert an identical `(code, defines)` re-render resolves *without* touching the worker (mock/spy the worker call); assert a WASM-build-hash bump invalidates. CI e2e — slider re-render still works; revisiting a prior slider value is instant. **Not the server bench.** Review by the `architecture-reviewer` agent (touches `openscad/client.ts` lifecycle).
- **Effort.** M · **Risk.** Medium — a stale cache returning the wrong STL (key must be COMPLETE); a memory blowup. Mitigated by the complete key incl. build hash + LRU bound + the build-hash-invalidation unit test. · **Quota.** none. · **Maps to.** board #3a.

#### Task 0.6 — Lineage DAG on the share file + project record (board #4a, independent)
- **Goal.** Make every remix a node in a fork DAG so attribution + a "My Parts" shelf grouped by `rootId` become possible, and land the data shape bet #7's corpus needs. Pure-client, near-zero risk.
- **Files & verified anchors.** `src/lib/shareFile.ts` — `ShareFile` interface (`shareFile.ts:16`), `buildShareFile` (`:39`), `parseShareFile` tolerant-parse (`:63`), `shareFileToProject` (`:93`, which orphans on import today). The `Project` record in `src/types.ts`.
- **Concrete change.** Add optional `parentId?` / `rootId?` / `lineageDepth?` to `ShareFile` and `Project`. `buildShareFile` stamps them from the source project; `shareFileToProject` propagates `parentId = imported.id`, `rootId = imported.rootId ?? imported.id`, `lineageDepth + 1`. Tolerant parse already drops unknown fields, so a legacy blob with no lineage still imports (becomes its own root). No store-core or server change.
- **Validation.** vitest unit — extend `src/lib/shareFile.test.ts`: assert `parentId`/`rootId` survive `buildShareFile → serialize → parse → shareFileToProject`, and that a missing-lineage legacy blob imports as its own root (tolerant parse). CI e2e — import still creates a fresh code-bearing project. **Not the server bench.**
- **Effort.** S · **Risk.** Very low (additive optional fields, tolerant parse). · **Quota.** none. · **Maps to.** board #4a; record shape for #7.

> **Phase 0 exit — SHIPPED 2026-06-22 (6 of 7 tasks; 0.4 deferred above).** All on branch
> `feat/phase0-safe-scorer-refine`, six commits, every gate green (lint / 214 vitest / build / 22 e2e /
> full `bench:selftests`):
> - **0.0** spend meter — `genCalls`/`genTokens` through the session projection + `SpendChip` (commit `1f5f6d8`)
> - **0.1** refine hollow-fill advisory `fillRatioNote()` (commit `cdd62b5`, with 0.2)
> - **0.2** best-of-N reference-free solidity tiebreak in `scoreCandidate` (commit `cdd62b5`)
> - **0.3** split auto-fix budget (`MAX_CONTRACT_REASK`/`MAX_GEOM_FIX`) + Kimi-only temperature (commit `7b2766c`)
> - **0.5** content-addressed render cache (architecture-reviewer approved) (commit `fbc49c1`)
> - **0.6** remix lineage DAG on `.vibemesh` + `Project` (commit `ca07d77`)
> The tree now carries the reference-free shape term in `CandidateSignals`, the always-on refine metric, the
> budget split + Kimi temp, the render cache, lineage, and the spend meter. No quota spent. No spike needed.
> Outstanding for a live-bench session: 0.4 exemplars; the Kimi-temperature quality smoke.

---

### Phase 1 — The registration de-risk spike + multi-sample bench discipline (the gate)

**Rationale.** This is the fork point. Board #1, #5, and #12 all stand or fall on the same question: *does silhouette-IoU between a candidate's canonical pose and a real hand-held photo's contour correlate with fidelity?* Nothing that consumes a reference contour ships until this passes. And no fidelity *number* is trustworthy until multi-sample is the standard run mode.

#### Task 1.1 — Multi-sample bench discipline as the standard mode
> **STATUS (2026-06-23): DONE — audit reclassified this from "open".** The discipline is already standard: `bench/run.mjs` defaults `BENCH_SAMPLES=3`, `bench/gate.mjs` enforces `minSamples=2`, and `bench/baseline.json` was re-seeded under k=3 (commits `ebdcdc2`/`a20f2d6`), documented in CLAUDE.md. The "concrete change" (re-seed + write the rule) is complete. **Remove from the Phase 1 open list** — only Tasks 1.2 (spike) and 1.3 (browser port) remain.
- **Goal.** Make `BENCH_SAMPLES≥2` the standard run mode so the gate's tolerances can be trusted for every reward/fidelity claim downstream. (The gate already refuses `<2`; honor it for every number.)
- **Files & verified anchors.** `bench/run.mjs` (`BENCH_SAMPLES=k` aggregation, median quality + `compiledRate`), `bench/gate.mjs` (3-valued `evaluate()`), `bench/baseline.json`. CLAUDE.md documents the contract.
- **Concrete change.** No code change if sampling already aggregates correctly — instead, establish and document the standard: re-seed `bench/baseline.json` from a `BENCH_SAMPLES=k` run (`bench/gate.mjs --update-baseline`), and make "every fidelity number cited downstream comes from a `≥2`-sample run" the written rule in this doc + the bench README. If any gated task has `<2` samples available, that is INCONCLUSIVE (exit 2), not PASS.
- **Validation.** `BENCH_SAMPLES=2 npm run bench` → `npm run bench:gate` exits 0 against the re-seeded baseline. `bench:gatelogic` (gate.selftest) stays green.
- **Effort.** S · **Risk.** Low (process, not code). · **Quota.** live bench runs (the user's own engine; flag if Anthropic API spend matters). · **Maps to.** board hard-ordering constraint (multi-sample precedes any reward claim).

#### Task 1.2 — ⚙️ Registration de-risk SPIKE (gates board #1 reference path, #5, #12)
> **STATUS (2026-06-23): RUN — CONDITIONAL PASS, segmentation-gated.** Built on real ThingiPrint photos + Thingi10K meshes (12 distinct-category objects, good vs cross-category-bad), scored with the canonical `src/lib/silhouette.ts`. **The verdict hinges on photo segmentation:** Otsu threshold → FAIL (AUC 0.58), **GrabCut → PASS (AUC 0.757, margin 0.142, 83% pairwise)**. So reference-grounded silhouette-IoU IS viable on real photos — but only as a **soft ranking/tiebreak signal** (classes overlap; not a hard gate, per guardrail #7) and **only with proper foreground segmentation** (GrabCut minimum; learned matte like SAM/rembg preferred). Do NOT ship the Otsu/Canny cheap path. → **Phase 2 proceeds on the reference path**, with photo→mask segmentation as a first-class, load-bearing component. Full write-up + reproduce: `docs/REGISTRATION-SPIKE-RESULTS.md`; scripts `bench/registration_spike_prep.py` + `..._contour{,_grabcut}.py` + `bench/registration-spike.mjs`.
- **Goal.** A throwaway experiment: prove (or kill) that OpenCV.js contour extraction + a best-of-Z-rotation alignment search produces a silhouette-IoU that correlates with human-judged fidelity on ~10 **real hand-held photos**. This is the prior board's DO-FIRST, run *before any scoring is wired*.
- **Files & verified anchors.** Reuse `bench/render.mjs` `renderMasks` (`:157`) + `bench/silhouette.mjs` `maskIoU` (`:16`) for the candidate side. Mirror the 4-rotation alignment method in `bench/compare.mjs` (best-of-four Z-rotations). The blindness to avoid: `renderMasks` self-normalizes scale by `radius = max bbox dim / 2` (`render.mjs:170-171`) — the king=hourglass scale-blindness; the spike must align to the reference's *aspect ratio*, not the candidate's own bbox.
- **Concrete change.** Standalone spike script under `bench/` (e.g. `bench/registration-spike.mjs`), NOT wired into any gate. Inputs: ~10 real photos + a hand-faithfulness label (good/bad) per photo and a matching STL. Pipeline: lazy OpenCV.js → grayscale → Canny → largest external contour → fill → reference mask; candidate mask via `renderMasks`; align via best-of-Z-rotation; report IoU. Output: does IoU rank the good-faithful candidates above the bad ones? Capture a written PASS/MARGINAL/FAIL verdict.
- **Validation.** The spike *is* the validation — it produces a go/no-go for Phase 2's reference path. No CI gate (throwaway). If MARGINAL/FAIL → Phase 2 takes the **self-consistency fallback** (reference-free, multi-view-coherence IoU across the candidate's own 4 canonical poses) and the reference-contour path is reserved for the detectable clean-orthographic-line-drawing case only.
- **Effort.** M · **Risk.** The honest one: registration may fail on real photos (perspective/foreshortening dominates signal variance). That outcome is a *successful* spike — it routes Phase 2 to the fallback. · **Quota.** none (offline rasterizer + OpenCV). · **Maps to.** board #1 De-risk, hard-ordering constraint.

#### Task 1.3 — Faithful-port selftest for the browser silhouette twin (prereq for Phase 2 wiring)
- **Goal.** Before the rasterizer ever scores a live candidate, prove the `src/`-side port reproduces `bench/silhouette.mjs maskIoU` to float tolerance. (Board #1's first bench-gated step.)
- **Files & verified anchors.** New `src/lib/silhouette.ts` (port of `renderMasks`/`maskIoU`; its only dep is `parseStl`, already client-side in `stl.ts:31`). New `bench/silhouette-live.selftest.mjs`.
- **Concrete change.** Port `renderMasks` + `maskIoU` into `src/lib/silhouette.ts` (pure JS, no three.js). Add `bench/silhouette-live.selftest.mjs` that runs the port against the existing gold masks and asserts it reproduces `bench/silhouette.mjs maskIoU` within float tolerance. Add it to the `bench:selftests` chain (`package.json:60`) so CI ratchets the port faithfulness.
- **Validation.** `node bench/silhouette-live.selftest.mjs` PASS; wired into `bench:selftests` (CI zero-API).
- **Effort.** M · **Risk.** Low (it's a port with a byte-faithfulness oracle). · **Quota.** none. · **Maps to.** board #1 first bench-gated step.

> **Phase 1 exit / FORK:** the spike verdict decides Phase 2's path (reference-IoU vs self-consistency fallback); multi-sample is the standard mode; the browser silhouette twin is proven faithful and CI-ratcheted but wired into nothing yet.

---

### Phase 2 — Live silhouette oracle (board #1) — CONDITIONAL on Phase 1 spike

**Rationale.** Promote the proven browser twin into best-of-N as a soft tiebreak and into the refine loop as a STOP signal. **The path depends on the 1.2 verdict:** PASS → reference-IoU against the photo contour; MARGINAL/FAIL → reference-free self-consistency IoU across the candidate's own 4 poses. Either way it stays a soft tiebreak strictly below the compile/degenerate tiers and a monotonic refine-STOP only.

#### Task 2.1 — Contour extraction at attach time (PASS path only)
- **Goal.** Extract the reference photo's foreground contour ONCE at image-attach time via lazy-loaded OpenCV.js and cache the mask on the `ChatImage`, so the text-only path stays byte-identical.
- **Files & verified anchors.** `ChatImage` type in `src/types.ts`; the image-attach path in `src/components/ChatPanel.tsx` / the home composer. Shares the OpenCV.js loader with board #5 (Task 3.3).
- **Concrete change.** On image attach, lazy-load OpenCV.js → grayscale → Canny → largest external contour → fill → cache a 256×256 mask on the `ChatImage`. Gate on an OpenCV contour-confidence floor; on low confidence, store no mask (oracle falls back to bbox / self-consistency). Byte-identical when no image is present.
- **Validation.** vitest unit for the confidence-floor gating (pure); CI e2e that text-only attach is unchanged. **Not the server bench.**
- **Effort.** L · **Risk.** Medium — OpenCV.js bundle weight (lazy-load it); contour failure on clutter (confidence floor → no mask). · **Quota.** none. · **Maps to.** board #1 step 2. **Skipped entirely on the FAIL path.**

#### Task 2.2 — `shapeMatch` term in best-of-N (soft tiebreak below compile/degenerate)
- **Goal.** Add the first *measured shape* term the live selector has ever had. A clean-but-wrong candidate loses to a clean-and-right one, but a non-compile ALWAYS loses first (lexicographic invariant preserved).
- **Files & verified anchors.** `src/lib/bestOfN.ts` — add `shapeMatch?: number` to `CandidateSignals` (joins `volume`/`fillRatio` from Task 0.2, all below `dimMismatches`), score it in `scoreCandidate` (`:53-57`). The candidate seam already has the compiled STL in hand (`generationActions.ts:113`), and `src/lib/silhouette.ts` (Task 1.3) computes the mask. Run the 256×256 rasterize in a Web Worker off the interactive lane.
- **Concrete change.** Compute `shapeMatch` per candidate: PASS path → reference-IoU (candidate canonical pose vs cached photo contour, aspect-ratio aligned — NOT self-normalized, avoiding the `render.mjs:170` scale-blindness); FAIL path → self-consistency IoU across the candidate's own 4 poses. In `scoreCandidate`, add `score -= (1 - shapeMatch) * K` in the compiled branch, K chosen so it can reorder two clean compiles but a non-compile/degenerate still loses first (`K` between the `dimMismatches` weight 100 and the degenerate penalty 500_000). When `shapeMatch` is absent (no contour / low confidence) the term is 0 — bbox fallback, no behavior change.
- **Validation.** vitest unit — assert the invariant (non-compile < any compile; degenerate < clean) holds with `shapeMatch` present and absent; assert a higher-IoU clean candidate wins a tie. **Not the server bench.** A/B re-measure the ceiling with `BENCH_SAMPLES≥2` (Task 1.1) on image tasks where a gold exists.
- **Effort.** L · **Risk.** Medium-high (registration variance) — mitigated by soft-tiebreak-only + confidence floor + the K-banding unit tests. · **Quota.** ⚠️ effective only when best-of-N runs; see HOLD item 3b-quota below. · **Maps to.** board #1 steps 1+3.

#### Task 2.3 — Silhouette-IoU plateau as the refine STOP signal
- **Goal.** Replace/augment the bbox-only `proxyWantsRefine` with a silhouette-IoU plateau gate, alongside the existing self-relative volume/tri stop (#122).
- **Files & verified anchors.** `src/state/generationActions.ts:425` `proxyWantsRefine = dimMismatch || stillReshaping`; `stillReshaping` from `geometryConverged` (`refineProxy.ts:115`) wired at `:424`. Today, with no stated dims, it rides the self-relative volume/tri plateau.
- **Concrete change.** Extend the refine gate: keep refining while silhouette-IoU vs the reference (PASS) or self-consistency IoU (FAIL) is still *climbing* meaningfully; STOP once it plateaus (mirror `geometryConverged`'s tol-based plateau). Monotonic STOP only — never a hard reject; `MAX_AUTO_REFINE` (`generationActions.ts:51`) remains the hard ceiling. Compose with the existing `dimMismatch || stillReshaping` as an OR of stop-conditions.
- **Validation.** vitest unit on the plateau logic (pure, like `geometryConverged`); CI e2e that refine still fires and terminates. **Not the server bench.**
- **Effort.** M · **Risk.** Medium — a registration miss could stop early; mitigated by STOP-only semantics (worst case = one fewer pass) + the hard `MAX_AUTO_REFINE` ceiling. · **Quota.** none beyond existing refine. · **Maps to.** board #1 (refine-STOP).

> **Phase 2 exit:** the live loop selects and stops on a *measured shape* signal for the first time; ceiling re-measured under multi-sample; soft-tiebreak invariants unit-proven.

---

### Phase 3 — Refine-loop escalation: two-tier free gate → VLM judge; pre-gen contour

**Rationale.** The board inverts the proposal's build order: ship the FREE deterministic silhouette gate (all engines, no API) first, then add the paid VLM strictly as the inconclusive-case escalation. Then close the *input* gap with ordinal-facts-only pre-gen contour measurement.

#### Task 3.1 — Two-tier silhouette gate harness in bench (precedes any live VLM spend)
- **Goal.** Prove the two-tier discipline keeps VLM cost bounded: only invoke the judge when the cheap silhouette signal is *inconclusive*; skip it when IoU already says match/no-match.
- **Files & verified anchors.** `bench/judge.mjs` (`judgeVision` at `:95`, gated behind `BENCH_JUDGE`), `bench/run.mjs`. The deterministic signal is the silhouette twin (Task 1.3).
- **Concrete change.** In `bench/run.mjs`, gate `judgeVision` behind a two-tier check: compute silhouette-IoU first; only call the VLM when IoU lands in an ambiguous band. Report VLM-invocation rate per task. Keep it advisory (never gates pass/fail).
- **Validation.** `npm run bench` (live, `BENCH_JUDGE=1` + key) reports a bounded invocation rate; gate exit code unaffected (advisory).
- **Effort.** M · **Risk.** Low (bench-only, advisory). · **Quota.** live judge spend during validation only. · **Maps to.** board #2 first bench-gated step.

#### Task 3.2 — ⚠️ VLM-as-judge inconclusive-case escalation in the live refine loop
- **Goal.** When the deterministic silhouette/dim signal is inconclusive, escalate to a cheap independent VLM that returns a per-feature punch-list, surfaced as a `compileNote` and feeding the refine `geoBlock`. Reframed honestly as a **rubric-gated convergence channel**, not "independent reward" (the default judge model is often the same family that generates).
- **Files & verified anchors.** New `/api/judge` route in `server/index.mjs` (calling a FIXED cheap model — Haiku/Sonnet — distinct from the generator where possible); `output_config` json_schema is already exercised non-streaming in `bench/judge.mjs:119`. The live refine assembles `captureViews(1280, 0.92)` 4 poses (`ChatPanel.tsx:108`) and the feature-inventory punch-list directive (`ChatPanel.tsx:130`). Gate behind `autoRepair` (`ui.ts:100`) + a console `ANTHROPIC_API_KEY`; vision-capable shippable engines only — kimi/local keep the bbox path so the contract is unchanged.
- **Concrete change.** Add `/api/judge` (non-streaming `.create` with json_schema verdict). Client invokes it from the refine path ONLY when the deterministic signal is inconclusive (two-tier). Feed per-feature misses into the refine `geoBlock`. Keep the deterministic silhouette/dim/interference checks as the HARD gates; the VLM is strictly advisory.
- **Validation.** Server route → `bench/server.selftest.mjs` extended (zero-API for the route plumbing/guards); live `bench` with the judge for quality. CI e2e that kimi/local refine is byte-unchanged. SSE wiring untouched (judge is a separate non-streaming route).
- **Effort.** M · **Risk.** Medium — "independence" is thin on Anthropic-family; mitigated by pinning a cheap distinct model + keeping it advisory. · **Quota.** ⚠️ per-inconclusive-pass live spend — **HOLD for user go-ahead** on enabling it by default; ship behind the existing `autoRepair` toggle + key presence so it is opt-in. · **Maps to.** board #2.

#### Task 3.3 — Pre-generation contour measurement (board #5; folds in leftovers #1a) — CONDITIONAL on Phase 1 spike
- **Goal.** Condition the FIRST draft on pixels, not vibes: inject perspective-INVARIANT ordinal facts (protrusion/lobe count, gross symmetry verdict, concavity signature) into `contextText` — and explicitly DROP the aspect-ratio number perspective corrupts.
- **Files & verified anchors.** `server/providers.mjs` — `contextText` (`:496`), `visionSourceFragment` seam (`:519`/`:547`). Shares the OpenCV.js loader with Task 2.1. The corruption to avoid: a 2D aspect ratio is NOT the 3D proportion under foreshortening, and `clampStatedDimensions` (`refineProxy.ts:28`) would key the refine proxy on a confidently-wrong "MEASURED" number.
- **Concrete change.** At submit time, run OpenCV.js client-side → emit ONLY ordinal facts (count, symmetry, concavity) into a measured-geometry fragment through `visionSourceFragment`. Drop the aspect-ratio number (or hedge it as "observed silhouette, may be foreshortened" — never authoritative). Byte-identical when no image. **Leftovers #1a** (turn-0 vision pre-call) is the paid alternative for the same seam — keep it as the ⚠️ HOLD escalation (item below), not the default; the OpenCV path is the free first choice.
- **Validation.** Add ~10 traced reference photos to `bench/` with hand-labeled ordinal facts; assert the descriptor matches above a precision floor (new `bench/reftrace.selftest.mjs`, modeled on `trace.selftest.mjs`) BEFORE the fragment is ever injected live. Then live `bench` for first-shot fidelity. Server change → `bench:selftests`.
- **Effort.** M · **Risk.** Medium — adverse-selected gate (fires on clean cutouts the model already handles) + wrong-trace-worse-than-none; mitigated by ordinal-facts-only + dropping aspect ratio + requiring the spike + downstream verification by the Phase 2 oracle. · **Quota.** none (client OpenCV). · **Maps to.** board #5, folds in leftovers #1a (as the paid escalation).

> **Phase 3 exit:** the refine loop escalates free→paid only when ambiguous; the first draft is conditioned on measured ordinal facts; both gated by the spike and the bench precision floor.

---

### Phase 4 — Bets (only after a live SHAPE gate exists)

**Rationale.** These are the L/XL horizon bets. RAG ships (distillation deferred until #1 gates the corpus on shape); the agentic loop needs a standalone lifecycle spike; the hosted lane is a go-to-market call; BREP is re-measured only after the oracle proves the residual ceiling still binds.

#### Task 4.1 — Exemplar RAG over a curated corpus (board #7a; consumes leftovers #1c)
- **Goal.** Prompt-conditioned dynamic retrieval of the k most-similar known-good `.scad`, injected as compile-verified few-shot exemplars BELOW skills at the `contextText()` seam. Attacks the organic ceiling sideways (retrieve a human-validated knight that already solved the silhouette).
- **Files & verified anchors.** `contextText` seam (`providers.mjs:496`); model the selftest on `bench/retrieval.selftest.mjs`. Corpus seed = the new exemplars from Task 0.4 (`server/composed.mjs`) + the 18 bench tasks + only user generations the user explicitly promotes via the share-file path.
- **Concrete change.** Start zero-API keyword retrieval over INTENT line + Customizer param names + skill ids, k=1-2, similarity-gated, injected below skills in `contextText()`, byte-identical when no match. NEVER auto-harvest compile-only output (the predicate has no live shape term for open-vocab single parts — entrenching the axisymmetric house style).
- **Validation.** `bench/rag.selftest.mjs` (zero-API, modeled on `retrieval.selftest.mjs`): for each of the 18 tasks the retriever returns the topically-correct exemplar above the similarity floor and NOTHING for an unrelated prompt (no false injection). Add to `bench:selftests`. Live `bench` for quality + `bench:gate`.
- **Effort.** L · **Risk.** Medium — false injection regressing a clean prompt; mitigated by the similarity floor + the no-false-injection selftest. · **Quota.** none for retrieval; live bench to validate. · **Maps to.** board #7a.

#### Task 4.2 — ⚙️ Agentic render-in-the-loop SPIKE (board #6) — Anthropic only
- **Goal.** Answer the only architectural question that justifies the lifecycle surgery: does in-stream CoT-continuity beat the existing cold-restart refine, AND can the session/abort plumbing avoid leaking an in-flight stream on abort?
- **Files & verified anchors.** `streamAnthropicProtocol` (`providers.mjs:737`) already streams via `client.messages.stream`, returns `stopReason` via `stream.finalMessage()` (`:766-769`), sends conditional `output_config` (`:755`). `resolveEngineDescriptor` (`:658`) is where a `toolLoop` flag would go (true only for first-party `protocol==='anthropic'`). **The collision:** the SSE route's only teardown is `res.on('close') → abort.abort()` (`server/index.mjs`) — a tool loop holds a stream open across a client round-trip, requiring a server-side session store surviving between two HTTP requests; the existing one-request-one-stream abort wiring no longer covers a multi-socket loop → an aborted generation leaks the stream and burns tokens. `bench/chess.mjs` already prototypes the *cold-restart* version in node.
- **Concrete change (spike only).** Standalone spike: prototype the session/abort plumbing and PROVE no leak on abort. Then a bench A/B mode: in-stream tool loop vs the existing cold-restart refine on image/kit tasks, reporting first-pass convergence + `compiledRate`. No production contract surgery until the A/B justifies it.
- **Validation.** The spike's no-leak proof + the A/B numbers ARE the gate. No CI wiring until productionized. `architecture-reviewer` agent must review any touch to the SSE lifecycle.
- **Effort.** L (XL if productionized) · **Risk.** High — rewrites the request lifecycle CLAUDE.md flags as the thing not to break; single-engine (unreachable on claude-code `maxTurns:1` + kimi). Mitigated by spike-first + mandatory A/B + leaving the contract untouched until proven. · **Quota.** ⚠️ live spend for the A/B. · **Maps to.** board #6.

#### Task 4.3 — Hosted lane + cloud sync (board #4b/c) — go-to-market, NOT a quality lever
- **Goal.** Deferred. A zero-key hosted generation lane + optional cloud sync. Converts a local-first privacy-positioned app into a metered-spend abuse magnet; the generate route has NO rate limiting today (only Anthropic's `RateLimitError` is handled).
- **Disposition.** Defer to a deliberate business decision with hard per-session/day caps + a self-hoster flag. Sync deferred until a real user pulls for it. **Not funded by this quality plan.** · **Quota.** ⚠️ structurally (metered spend) — explicit go-to-market sign-off. · **Maps to.** board #4b/c.

#### Task 4.4 — BREP re-measure (board #8) — hard-gated, export-first
- **Goal.** Deferred. The only lever that structurally breaks the organic ceiling — but it attacks the wrong cause (the live cause is the absent oracle, now being fixed) and the slider-`-D` moat is OpenSCAD-kernel-shaped (build123d via Pyodide has no in-browser `-D` recompile primitive — every slider drag re-runs the full Python program).
- **Disposition.** After Phase 2 proves the oracle, RE-MEASURE whether OpenSCAD's residual ceiling still binds. Mandatory first spike: can `build123d` params drive the existing Customizer sliders at acceptable latency? If no → BREP is STEP-export-only, not a kernel fork. The cheap on-architecture experiment to run first: have the already-multimodal LLM emit a part-manifest into the INTENT JSON (board #9 moat-preserving form), no external neural mesh. · **Quota.** none for the manifest experiment. · **Maps to.** board #8/#9.

---

### ⚠️ QUOTA / SPEND sign-off — AMENDED DECISIONS (independent senior review, 2026-06-22)

An independent senior staff + cost reviewer pressure-tested the three sign-off items against the live code and **corrected the plan's cost claims** (it understated the exposure). Verified facts that drive these decisions:
- `BEST_OF_N_COUNT = 3` (`bestOfN.ts:37`) issues **three full parallel `streamGenerate` calls** (`generationActions.ts:80-89`) = true 3× input+output tokens — and the default effort is **`xhigh`** (`store.ts:561`), so it triples the *most expensive* reasoning tier. The gate (`generationActions.ts:182`) fires on **every kit AND every image turn**, not just first images, and image turns already stack up to 2 refine passes (`MAX_AUTO_REFINE`, `generationActions.ts:51`) → worst case **~5 paid calls/image**, not 3.
- The VLM-judge model is **NOT cheap as the plan assumed**: the bench `judgeVision` defaults to `claude-opus-4-8` (`bench/judge.mjs:71/116`), there is **no `/api/judge` route** (`server/index.mjs` has none), and the two-tier "inconclusive-only" bound that's supposed to cap its cost is **also unbuilt** (Task 3.1). So "bounded cost" is a promise, not code.
- **There is no spend meter today** — the user cannot observe a single token spent (the only chip shows context-window *fullness*, `ChatPanel.tsx:709`). Telemetry was deferred.

**Governing rule: no quota multiplier flips to a DEFAULT until a visible spend meter ships (new Task 0.0).** Informed consent requires the user can see the spend first.

| Item | AMENDED verdict | Decision + guardrails |
|------|-----------------|-----------------------|
| **3b-quota** — best-of-N for images | **Approve as a capped explicit toggle; default stays OFF until Task 2.2 ships** | Best-of-N is the *only* runway for the board's #1 oracle (with N=1, `pickBestIndex` is a no-op, so `shapeMatch` has nothing to reorder). BUT before `shapeMatch` (2.2) lands it only tiebreaks on compile/degenerate — which the 2 refine passes already largely catch — so the 2× spend isn't yet worth it. Ship it as: **cap N at 2** for the default path (keep 3 as opt-in "max quality"), **gate to first-turn image-only** (add a "first model in chat" condition to `generationActions.ts:182`), **cost-labeled toggle** ("Best of 2 — ~2× generation cost"), **never silent**. Flip the *default* ON the day Task 2.2 lands AND a multi-sample bench shows the selected candidate beats single-stream beyond gate tolerance. |
| **#1a** — turn-0 vision pre-call | **REJECT as built — superseded by the FREE Task 3.3** | A full *serial* vision call at `xhigh` on the critical path. Task 3.3 (client-side OpenCV ordinal facts → the same `visionSourceFragment` seam, `providers.mjs:519`) closes ~90% of the same first-image retrieval gap at **zero quota**. Build 3.3; do **not** build #1a. The only residual gap is *semantic category* labeling (e.g. "this is a rook") that pixels can't infer — if a future bench proves that gap is real, close it with a pinned **Haiku-tier** extraction, never the user's `xhigh` draft engine. |
| **Task 3.2** — VLM judge default-on | **HOLD default-on; opt-in ship is fine** | The "bounded cost" does not exist in code (no `/api/judge`, no two-tier gate, judge resolves to Opus not Haiku). Prerequisites before any default-on: **(1)** Task 3.1 two-tier gate shipped with a *published* inconclusive-fire rate from a multi-sample bench; **(2)** the route **pinned to a fixed cheap model** (Haiku), not the env default; **(3)** cap to **1 judge call per project** (first inconclusive pass only); **(4)** every call surfaced in the spend meter. Until then it ships strictly opt-in behind `autoRepair` + key presence. |

**Sequencing (amended):** (1) ship Task 0.0 spend meter first — the precondition for every quota decision; (2) ship the free Task 3.3, then drop #1a; (3) land 3b-quota as the capped first-turn-only toggle now, default-OFF; (4) hold 3.2 default-on behind Tasks 3.1 + a cheap-model route. **The one line:** of the three, only best-of-N is worth paying for — and only because it's the sole runway for the shape oracle — so approve it as a capped toggle now and default it on the day Task 2.2 ships.

### Task 0.0 — Visible per-project spend meter (NEW — gating precondition for every quota decision)
- **Goal.** Let the user SEE generation spend (call count + token estimate per project/session) before any quota multiplier becomes a default. Today only context-window *fullness* is visible (`ContextChip`, `ChatPanel.tsx:709`); actual spend is invisible (telemetry deferred).
- **Files & anchors.** Extend the `ContextChip` pattern (`ChatPanel.tsx:709`); a per-project counter in the session/store (`src/state/store.ts` session shape) incremented where `streamGenerate` resolves (`generationActions.ts` — both the single-stream and `runBestOfN` paths, so a 3× fan-out is counted as 3). Token estimate can reuse the existing tokenizer used for `historyBudgetTokens`.
- **Concrete change.** Add a `genCalls` / `estTokens` accumulator on the session; increment per `streamGenerate` resolution (count each best-of-N candidate); render a small, dismissible meter chip near the composer. No server change. Purely additive, zero quota.
- **Validation.** vitest unit on the accumulator (a best-of-N turn increments by N, a single turn by 1); CI e2e that the chip renders. **Not the server bench.**
- **Effort.** S–M · **Risk.** Low (display only) · **Quota.** none · **Maps to.** the reviewer's governing precondition.

---

## 4. Dependency graph / critical path

```
Phase 0 (no spike, no quota) — all parallel:
  0.1 refine metric ─┐
  0.2 bestN tiebreak ─┼─ (independent, ship together/in pairs)
  0.3 budget+Kimi temp ┤
  0.4 exemplars ───────┤
  0.5 render cache ────┤
  0.6 lineage ─────────┘

Phase 1 (THE GATE):
  1.1 multi-sample ──────────────► precondition for every fidelity number
  1.2 REGISTRATION SPIKE ──┬── PASS ──► Phase 2 reference-IoU path (2.1 → 2.2 → 2.3)
                           └── FAIL ──► Phase 2 self-consistency path (skip 2.1; 2.2/2.3 use own-pose IoU)
  1.3 silhouette port + selftest ──► prereq for 2.2/2.3 wiring (independent of spike verdict)

Phase 2 (needs 1.2 verdict + 1.3 + 0.2):
  2.1 contour@attach (PASS only) ─► 2.2 shapeMatch in bestN ─► 2.3 refine STOP

Phase 3 (needs Phase 2 oracle):
  3.1 two-tier bench harness ─► 3.2 VLM escalation (⚠️ opt-in)
  3.3 pre-gen contour (needs 1.2 PASS; shares 2.1 loader)

Phase 4 (needs a live SHAPE gate = Phase 2):
  4.1 RAG (consumes 0.4 corpus) │ 4.2 agentic spike │ 4.3 hosted (GTM) │ 4.4 BREP re-measure
```

**Critical path to the highest-leverage move:** `1.1 + 1.2 (spike) + 1.3 → 2.1 → 2.2`. Everything downstream (the agentic loop's reward, the RAG corpus's shape gate, any distillation) depends on a trustworthy live shape signal existing — which is Task 2.2, which is gated by the spike. The spike is the single fork point of the whole plan.

---

## 5. PR slicing

| PR | Tasks | CI gates that must pass |
|----|-------|-------------------------|
| **PR-1 "safe refine + scorer"** | 0.1 + 0.2 | lint + vitest (fill-ratio + tiebreak invariants) + e2e |
| **PR-2 "portability"** | 0.3 | lint + vitest + `bench:selftests` (server core) + 1 Kimi smoke |
| **PR-3 "exemplars"** | 0.4 | `bench:selftests` (composition/interference re-baseline) + live `bench` + `bench:gate` |
| **PR-4 "render cache"** | 0.5 | lint + vitest (worker-skip + build-hash invalidation) + e2e + `architecture-reviewer` |
| **PR-5 "lineage"** | 0.6 | lint + vitest (share-file round-trip) + e2e |
| **PR-6 "bench discipline"** | 1.1 | `bench:gate` exit 0 on re-seeded baseline + `bench:gatelogic` |
| **PR-7 "registration spike"** | 1.2 + 1.3 | 1.3 → `bench:selftests` (port faithfulness); 1.2 is throwaway (no gate), produces the verdict |
| **PR-8 "live oracle"** | 2.1 + 2.2 + 2.3 (path per verdict) | lint + vitest (lexicographic invariant with/without `shapeMatch`) + e2e + multi-sample A/B re-measure |
| **PR-9 "two-tier + VLM"** | 3.1 + 3.2 | `bench/server.selftest.mjs` (route guards) + e2e (kimi/local unchanged) + live judge bench |
| **PR-10 "pre-gen contour"** | 3.3 | `bench/reftrace.selftest.mjs` precision floor + live `bench` |
| **PR-11 "RAG"** | 4.1 | `bench/rag.selftest.mjs` (no false injection) + `bench:gate` |
| spikes | 4.2 / 4.4 | standalone, no production gate until productionized |

Ship PR-1 through PR-5 in any order (Phase 0 is internally independent). PR-6 and PR-7 gate Phase 2. The quota flips (3b-quota, #1a default, 3.2 default-on) are separate one-line PRs landed only on explicit sign-off.

---

## 6. Honest limits (carried from the board — these stay real)

1. **The organic/figurative axisymmetric ceiling (~60-70%) is NOT broken by anything in the NOW/NEXT tiers.** The oracle, VLM judge, contour measurement, and RAG raise the *proportion/outline floor* and the *selection* quality; none changes what `rotate_extrude` / convexifying `hull()` can *express*. A 2D silhouette sees outline, not depth or concavity. Only the BREP side-path structurally breaks it, and it is deferred behind the oracle and a slider-latency spike.
2. **Registration is the unsolved heart of every reference-grounded bet.** A hand-held perspective photo is not an orthographic mask. The oracle (2.x), contour measurement (3.3), and param refit all stand or fall on Task 1.2. If it fails on real photos, the honest fallback is the self-consistency (reference-free) form — which raises asymmetry robustness but NOT absolute reference fidelity.
3. **Agentic self-correction stays single-engine.** The tool loop is reachable ONLY on the first-party Anthropic SDK; `claude-code` (`maxTurns:1`) and `kimi` cannot run it, so the flagship shippable login engine and the cross-engine majority do not benefit.
4. **Distillation cannot escape the corpus.** Without a live *shape* gate, the no-label predicate is `compiles ∧ manifold` — orthogonal to fidelity. Distillation is honestly BLOCKED on Task 2.2, not merely sequenced after it. We ship RAG (4.1) only.
5. **Local-first / zero-backend / provider-portable are walls, not preferences.** Any hosted lane (4.3), sync, or external neural-mesh pipeline trades against the `.vibemesh` moat; those are business/ops decisions and must not be smuggled in as quality levers.

*Source cited as load-bearing:* CADSmith rendered-image ablation + dual-channel convergence — <https://arxiv.org/abs/2505.04207> (removing the rendered-image channel blew hard-tier mean Chamfer 1.42 → 49.68; our kernel-numbers-only loop today IS that ablated baseline). The bet-tier decomposition references (SuperDec, Light-SQ, PrimitiveAnything) are bet-horizon, not load-bearing for NOW/NEXT.

---

## Corrections (2026-06-23 audit)

A senior-engineering audit board verified all 50 checkable claims in this plan against the tree **after** PR #125 (deploy + Supabase-auth) merged to `main`. Verdict: **substantively accurate, anchor-rotted.** Status assertions all hold; the corrections below fix the 2 wrong claims, the 15 drifted anchors, and the drift the plan never accounted for.

### Two claims were WRONG (both *understated* — work already done)
- **Task 1.1 (multi-sample bench): DONE, not open.** `BENCH_SAMPLES=3` default (`bench/run.mjs`), gate enforces `minSamples=2`, baseline re-seeded k=3 (`ebdcdc2`/`a20f2d6`). Corrected inline above.
- **Task 0.4 blocker (2) (no figurative seam): FALSE.** The seam exists — `server/skills.mjs` figurative exemplars (CROWN/CRENELLATION/PRONG-ORB) flow through `contextText`, gated by `bench/skills.selftest.mjs`. 0.4's figurative half is a registry add; only blockers (1) + (3) survive. Corrected inline above.

### Re-anchored line numbers (substance unchanged; anchors drifted post-#125)
| Claim | Plan said | Actual location |
|---|---|---|
| image CAP=10 | `providers.mjs:927` | `providers.mjs:937` (`agentPromptFromMessages`) |
| refine metric injection | `ChatPanel.tsx:142` `geoBlock` (vol/fill/tris) | `:144-146` bbox-dims only; fill via `fillBlock` `:149-150`; vol/tris never prompt-injected (feed `geometryConverged` STOP only) |
| vision source fragment | `providers.mjs:519` | call `:525`, def `:553-555` |
| split auto-fix budget | `MAX_AUTO_FIX` gen:50; Kimi temp providers:665 | `MAX_CONTRACT_REASK`/`MAX_GEOM_FIX` gen:54/55; Kimi desc providers:671 |
| render cache | `client.ts:57` | `cache` field `:56`, `cacheKey` `:72`, hit `:75-79`, set `:136` |
| lineage DAG | `shareFile.ts:39/93` | iface `:30-32`, build `:62-66`, parse `:101-103` |
| best-of-N config | `BEST_OF_N_COUNT` :37, tie :62, fan-out :80-89 | `:42`, `:85-89`, fan-out `:88-98` |
| refine STOP predicate | `proxyWantsRefine` gen:425 | gen:441 |
| `MAX_AUTO_REFINE` | gen:51 | gen:59 |
| judge opus default | `judge.mjs:71/116` | `judgeVision` `:116` (`:71` is the separate `judgeModel` fn) |
| captureViews | `:108` / punch-list `:130` | `:110` / `:131-133` |
| pre-gen contour seams | `:496/:519/:547` | `contextText` `:502`, vision call `:525`, fragment export `:553` |
| agentic spike anchors | `streamAnthropicProtocol:737`, `resolveEngineDescriptor:658` | `:743`, `:664` (`:737` now `UserFacingError`) |
| best-of-N effort tier | xhigh store.ts:561, "most expensive tier" | xhigh `:601`; xhigh is **4th of 5** (`max` is top) — drop "most expensive" → "default high, 2nd-from-top" |
| context/spend chip | ContextChip `ChatPanel.tsx:709` | ContextChip `:733`; SpendChip `:352` (meter shipped) |
| local temperature | local temp :1052, adaptive :752 | temp:0.2 `:1062`, adaptive `:758`, temp gated out `:762` |

### Detail slips
- `ui.ts` `autoRepair` toggle (`:100`) is a **render-failure auto-retry kill switch** (JSDoc `:33-35`) — NOT a VLM-judge opt-in. The judge opt-in is unbuilt; strike the judge framing.

### Drift the plan never accounted for
- **The entire PR #125 deploy / Supabase-auth workstream** (Docker stack, per-user isolation, JWT, cross-session reconcile, cloud PROJECTS API) is real, merged, and absent from this roadmap. **Back-fill it.**
- **The generate route has no rate limiting** (only Anthropic's own `RateLimitError`) — a real abuse gap the new hosted storage makes urgent. *(Being addressed in a separate PR.)*
- The bench silhouette oracle (`bench/silhouette.mjs maskIoU`, `bench/render.mjs renderMasks`) is fully built but **stranded** — zero `src/` consumers — until the Task 1.2 spike decides it's trustworthy on real photos. (As planned, but flagged: it's sunk cost sitting idle.)

---

## Shipped outside this plan (drift back-fill, 2026-06-23)

Two workstreams merged to `main` that this plan never anticipated. Future phases must account for them.

### PR #125 — Deploy + Supabase-auth workstream

Merged to `main` ahead of this plan's Phase 4 window. Scope: a self-hosted Supabase stack (Docker, Kong API gateway — `supabase/kong.yml`), JWT auth middleware (`server/authMiddleware.mjs` `requireAuth`) gating a server-side projects API (`server/db.mjs` — `dbGetProjects`/`dbUpsertProject`/`dbDeleteProject`, only mounted when Supabase is configured), per-user isolation via Postgres Row-Level Security (`supabase/schema.sql`), and a client sync layer (`syncProjectToServer` in `src/lib/storage.ts`) that fire-and-forget mirrors each save to the cloud **on top of** the existing IndexedDB write. This is real, fully merged, and **absent from every phase above**.

Impact on the roadmap:

- **Task 4.3 (hosted lane)** is partially pre-empted. A zero-key hosted generation lane remains a separate business decision (rate-capping, billing), but cloud project sync and per-user isolation are now infrastructure facts, not aspirational work. The "Defer to a deliberate business decision" disposition in 4.3 should be read against a baseline that basic auth + cloud storage already exist, not a greenfield. Any hosted-generation decision can now focus on the generation-cost metering layer only.
- **Local-first still holds, but is no longer the *only* path.** IndexedDB remains the primary durable store for every session (`saveProjects` always writes it); for authenticated sessions a fire-and-forget `syncProjectToServer` *additively* mirrors saves to the Supabase projects API. Any new feature touching project persistence or share-file import must now be validated against both the local-only and the cloud-synced path.
- **The BroadcastChannel cross-tab sync** (backlog batch, `vibemesh-storage` channel, `reconcileRecord`) was designed assuming IndexedDB as the single durable store. With authenticated sessions writing through the cloud API, a tab that reconciles from IndexedDB only may miss server-side changes. This is a latent gap; it is not blocked but should be tracked before Phase 4 ships a collaborative/multi-device feature.

### PR #128 — Generate-route rate limit (CLOSED)

The rate-limiting gap the audit flagged ("the generate route has no rate limiting — a real abuse gap the new hosted storage makes urgent") is **now closed**. PR #128 landed `server/rateLimit.mjs`: an in-memory **fixed-window** limiter keyed by **client IP** (`TRUST_PROXY` opt-in for the real client IP behind a proxy; the key fn can be switched to the auth bearer if NAT collisions matter), applied as middleware **before the body parser** on `POST /api/generate` (default 30 req / 5 min, env-configurable; per-process — swap for a shared store like Redis if the hosted lane scales past one instance). The "(Being addressed in a separate PR.)" note in the Corrections section above is superseded by this entry — the gap is not open.

# Vibemesh-AI — Huge-Improvements Roadmap

*Produced by a 7-lens senior R&D board + adversarial scoring workflow, 2026-06-22.*

This is the board's final report to the founder. It ranks architectural bets and high-leverage
moves against the standing fidelity ceilings, grounds every recommendation in the live tree
(`file:line` anchors are real and were re-verified against this branch), and cites 2025-2026 SOTA
where it is load-bearing. Incremental polish is out of scope. Two proposals are rejected outright
because they re-derive shipped code; one is rejected-as-bet but kept in the idea bank.

---

## 1. Executive summary

**The three biggest bets.**

1. **A live, proportion-aware silhouette shape oracle.** The single most-cited "biggest lever"
   across three prior boards is still unshipped: `scoreCandidate` (`src/lib/bestOfN.ts:42`) and the
   refine gate (`src/state/generationActions.ts:411`) select and critique on bounding-box and
   dimension math only — never on whether the geometry *looks* like the target. The pose-matched
   rasterizer already exists in `bench/` and is imported by nothing under `src/`. CADSmith's
   ablation quantifies the magnitude: removing the rendered-image channel blew hard-tier mean
   Chamfer distance 1.42 → 49.68 (~35×) — the kernel-numbers-only loop we ship today *is* that
   ablated baseline. ([CADSmith, 2025](https://arxiv.org/abs/2505.04207))

2. **A client-orchestrated agentic render-in-the-loop on the Anthropic engine.** Standing ceiling
   #3 ("no agentic self-correction") is softer than prior boards assumed: tool-use is unreachable
   on `claude-code` (`maxTurns:1`) and `kimi`, but it *is* reachable on the first-party Anthropic
   SDK adapter (`streamAnthropicProtocol`, `server/providers.mjs:737`). A bounded `render_scad`
   tool loop lets the model keep its chain-of-thought *across* the observe step instead of
   restarting cold — the first time the model's own eyes sit inside the live generation chain.

3. **A verifier-mined corpus → live exemplar RAG (distillation deferred).** The reference-free
   gates jointly define a no-human-label acceptance predicate; harvesting passing generations into
   a prompt-conditioned few-shot retriever is how CADSmith reaches 100% execution *without*
   fine-tuning, and it attacks the organic ceiling *sideways* — you cannot make `rotate_extrude`
   non-axisymmetric, but you can retrieve a human-validated chess knight that already solved the
   silhouette. The board splits this bet: ship the RAG half, **defer distillation** until a live
   shape gate exists to keep the corpus honest.

**The single highest-leverage move overall:** wire the **live silhouette oracle** into best-of-N as
a soft tiebreak *strictly below* the compile/degenerate tiers, gated on an OpenCV contour-confidence
floor, **preceded by a de-risk spike** that proves contour↔render registration correlates with
fidelity on *real* photos. Everything downstream — the agentic loop's reward, the corpus's shape
gate, any RL/distillation claim — depends on a trustworthy live shape signal existing first. Build
it first, on the cheap engine, and re-measure the ceiling before funding anything heavier.

---

## 2. Ranked table

| # | Proposal | Horizon | Effort | Impact | Feas. | Novelty | Composite | Reject votes |
|---|----------|---------|--------|--------|-------|---------|-----------|--------------|
| 1 | Live silhouette-IoU shape oracle (proportion-aware) | now | M | 4.7 | 3.0 | 2.3 | **21.1** | 0 |
| 2 | Independent VLM-judge 2nd channel in refine | next | M | 3.3 | 4.0 | 2.7 | **19.6** | 0 |
| 3 | Content-addressed render cache + worker pool | now | M | 2.7 | 4.7 | 2.0 | **18.4** | 0 |
| 4 | Lineage DAG + hosted lane + cloud sync | next | L | 3.0 | 4.0 | 2.0 | **18.0** | 0 |
| 5 | Pre-generation reference-contour measurement | next | M | 3.0 | 3.7 | 3.0 | **17.4** | 0 |
| 6 | Agentic render-in-the-loop (Anthropic) | next | L | 3.7 | 2.7 | 3.0 | **16.7** | 0 |
| 7 | Verifier-mined corpus → RAG + distillation | bet | L | 3.7 | 2.7 | 2.7 | **16.4** | 0 |
| 8 | CadQuery/OCCT BREP side-path | bet | XL | 4.0 | 2.0 | 3.7 | **15.4** | 1 |
| 9 | Neural-mesh-as-reference-target (superquadric manifest) | bet | XL | 4.0 | 2.0 | 3.3 | **14.6** | 0 |
| 10 | In-browser wall-thickness + bore-fit oracle | now | M | 3.0 | 2.7 | 2.7 | **14.8** | 0 |
| 11 | Constrained-decoding response contract (Anthropic) | now | S | 2.0 | 3.3 | 2.0 | **12.6** | 2 |
| 12 | Derivative-free silhouette param refit | next | M | 2.7 | 2.0 | 2.7 | **10.4** | 0 |
| 13 | Provider-portable compile-repair inner loop | now | S | 1.7 | 5.0 | 1.0 | **13.5** | **3** |

*(Composite = impact + feasibility + novelty + evidence, summed across lenses; rows ordered by board
discussion priority, not composite alone, so the two REJECT-as-already-shipped items sit last.)*

---

## 3. Top-8 deep dives

### 1. Live silhouette-IoU shape oracle (proportion-aware) — `now`, M

**Thesis.** Promote the already-written, pose-matched silhouette rasterizer
(`bench/render.mjs renderMasks` + `bench/silhouette.mjs maskIoU`) into the browser generation loop
as the first *measured* shape signal the live path has ever had. Add a `shapeMatch` float to
`CandidateSignals` (`src/lib/bestOfN.ts:21`), slot it into `scoreCandidate` (`bestOfN.ts:42`) below
compiled/degenerate but above `structuralIssues`, and replace the bbox-only refine gate
(`src/state/generationActions.ts:411`) with a plateau gate on silhouette-IoU.

**Why it's huge.** Today `scoreCandidate` has no shape term, so a faithful bishop and a featureless
spike with the same bbox score *identically* (the `score += 1_000_000` compiled tier at
`bestOfN.ts:60` is dominated only by structural/dim counts). And `proxyWantsRefine` reduces to
`stated.length === 0 || …` (`generationActions.ts:411`), so an unlabeled photo always refines to
budget exhaustion. This is standing ceiling #1, and it is a *wiring* task, not research: the
rasterizer is pure JS (orthographic project + z-buffer; its only dep is `parseStl`, which
`src/lib/stl.ts` already exports client-side), and best-of-N candidates are already compiled to STL
in hand at the candidate seam (`generationActions.ts:107` / `:114`).

**Concrete approach.** (1) Port `renderMasks`/`maskIoU` into `src/lib/silhouette.ts`, run the
256×256 rasterize in a Web Worker off the interactive lane. (2) Extract the reference photo's
foreground contour *once* at attach time via lazy-loaded OpenCV.js (grayscale → Canny → largest
external contour → fill), cache the mask on the `ChatImage`, so the text-only path stays
byte-identical. (3) Add `shapeMatch:number` and `score -= (1 - shapeMatch) * K`, K chosen so a
clean-but-wrong candidate loses to a clean-and-right one but a non-compile *always* loses first
(preserving the documented lexicographic invariant at `bestOfN.ts:14`). (4) **Critically**, align
the candidate to the reference's *aspect ratio*, not its own bbox — the bench rasterizer
self-normalizes scale (`render.mjs:170`), which is *exactly* the king=hourglass blindness to avoid.

**Hardest objection (all three lenses, unanimous).** Registration is unsolved and the live setting
is categorically harder than the bench it borrows from: the bench compares two STL masks in
*identical orthographic poses* (registration is free); the live oracle must compare a candidate's
canonical pose against a *single hand-held, perspective-projected, tilted* photo with no pose
correspondence. A correct bishop will silhouette-mismatch the photo from foreshortening alone, so
signal variance is dominated by camera nuisance, not shape error — and the safety mitigations
(confidence floor, bbox fallback) self-defeat by firing only on the clean-photo minority.

**De-risk.** Run the prior board's own **DO-FIRST spike before any scoring is wired**: OpenCV.js
contour + a best-of-Z-rotation alignment search (mirror `bench/compare.mjs`'s existing 4-rotation
method) on ~10 real hand-held photos, and *measure* whether IoU correlates with fidelity. Keep it a
**soft tiebreak strictly below the compile/degenerate tiers** and a **monotonic refine-STOP signal**
only — never a hard gate — so a registration miss costs at most one wasted pass, never a
rejected-correct part. The feasibility-skeptic's revise is the safe fallback if the spike is
marginal: use silhouette-IoU as a *self-consistency* signal across the candidate's own 4 canonical
poses (no reference, no registration), and reserve reference-contour comparison for the detectable
narrow case of a clean orthographic line-drawing / screenshot.

**First bench-gated step.** Add a `bench/silhouette-live.selftest.mjs` that runs the new
`src/lib/silhouette.ts` worker port against the existing gold masks and asserts it reproduces
`bench/silhouette.mjs maskIoU` to within float tolerance — proving the port is faithful *before* it
ever scores a live candidate.

---

### 2. Independent VLM-as-judge second channel in the refine loop — `next`, M

**Thesis.** Promote the built-but-stranded bench vision judge (`judgeVision`, `bench/judge.mjs:95`)
into the live refine path as a *second, independent* reward channel: feed the 4 canonical poses (as
one grid) plus the reference to a cheap, independent Claude call with VLM3D's dual-query prompt
(Q1 "does it depict the target", Q2 "are proportions / feature-counts faithful — anything collapsed,
intersecting, or symmetrized"), and let its structured verdict gate refine convergence.

**Why it's huge.** The silhouette oracle is geometry-only and pose-fragile; it cannot tell that a
feature is semantically wrong or that the model symmetrized an intentionally-asymmetric reference.
`judgeVision` already exists with the exact `{prompt, code, referenceImage, renderImages}` signature
and an `asymmetryPreserved` field, and the codebase already exercises `output_config` json_schema
against the live model (`bench/judge.mjs:119`) — fully built, stranded behind `BENCH_JUDGE`. A
human-readable "why this isn't matching" `compileNote` replaces today's silent
budget-exhausted refine.

**Concrete approach.** Add a `/api/judge` route (`server/index.mjs`) calling a *fixed cheap* model
(Haiku/Sonnet) over a `captureViews` 4-views-in-one-grid plus the reference. Two-tier discipline
(CAD-Judge): only invoke the VLM when the cheap silhouette signal is *inconclusive*; skip it when
IoU already says match/no-match. Feed per-feature misses into the refine `geoBlock` as a punch-list.
Gate behind the existing `autoRepair` toggle + a console `ANTHROPIC_API_KEY`, vision-capable
shippable engines only — `kimi`/`local` keep the bbox path so the contract is unchanged.

**Hardest objection.** *The live refine loop already feeds the 4 captured poses back to the model.*
The feasibility-skeptic is correct and it checks out in code: `ChatPanel.refine()` already calls
`captureViews(1280, 0.92)` (`src/components/ChatPanel.tsx:108`), already injects the committed
feature inventory with a per-feature present/faithful + anti-symmetrize directive
(`ChatPanel.tsx:130`), and `dimDiscrepancies` (`generationActions.ts:411`) is only the convergence
*gate*. So the genuine delta is *grader independence* + a verdict that gates the **stop condition** —
not "a new visual channel." And for the dominant Anthropic engines, the default judge model
(`claude-opus-4-8`, `judge.mjs:71/116`) is the *same family* that generates, so "independent" is
thin.

**De-risk.** Reframe honestly as a **rubric-gated convergence channel** (not "independent reward"),
pin a cheap model *distinct* from the generator where possible, and keep the deterministic
silhouette/dim/interference checks as the *hard* gates with the VLM strictly advisory. The CADSmith
0.81 → 0.96 / 88%-first-pass number came from a *geometric IoU* oracle, not a VLM judge — so do not
sell the VLM as the primary lift. **Build order is inverted from the proposal**: ship the free
deterministic silhouette signal into the two-tier gate *first* (cheap, no API dependency,
provider-portable for *all* engines), then add the VLM strictly as the inconclusive-case escalation.

**First bench-gated step.** Flip `judgeVision` from `BENCH_JUDGE`-only to a two-tier harness in
`bench/run.mjs` (skip when silhouette is decisive), and report VLM-invocation rate per task — proving
the two-tier gate keeps cost bounded before any per-pass live spend.

---

### 3. Content-addressed render cache + worker pool — `now`, M *(revise: decouple from the oracle narrative)*

**Thesis.** Two coupled infra moves: (a) a content-addressed STL cache keyed on
`hash(code + sorted(defines))` that collapses redundant recompiles (slider re-renders, version
restores, best-of-N re-rolls, project reopens), and (b) generalizing the single shared OpenSCAD
worker (`src/lib/openscad/client.ts`) into a 2-3 worker pool.

**Why it matters (corrected scope).** The cache key is genuinely sound — `qualityArgsFor` +
`buildDefines` feed the complete `(code, defines)` tuple into `openscad.compile`, and `defines`
already carry the quality preset's `$fn/$fa/$fs`, so `hash(code + sorted(defines))` pinned to the
WASM build hash is complete and correct. The slider-revisit / version-restore recompute-identical
paths it names truly exist. This turns the product's best moment (instant slider re-render) instant
for any seen value.

**Hardest objection (unanimous revise, no advances).** *It is mis-sold as the precondition for the
shape oracle, and it ships zero oracle.* All three lenses converged: best-of-N already fans N
candidate compiles through the one worker under a `ComputeBudget` without blowing the watchdog
(`generationActions.ts:105`/`:107`), so compile throughput is **not** why the oracle is stranded —
the oracle is bbox-only because no *visual* signal has been promoted from `bench/`. The session-level
geometry cache already restores cached STL on project switch-back and version restore, so two of the
four headline cache wins are already shipped; and best-of-N is off by default, so the pool's marquee
win accrues to a path most users never trigger.

**De-risk.** **Decouple.** Ship the content cache as a focused latency/UX PR on its own merits (the
genuinely new surface — a slider revisiting a prior value — is real and pleasant). Drop the
"this is how we beat ceiling #1" framing entirely. Fund the **worker pool only as the enabling layer
of the oracle proposal**, where concurrency genuinely unblocks running N candidate rasterizes off
the interactive lane — clamp K to `hardwareConcurrency`, accepting K × ~14MB peak memory.

**First bench-gated step.** Add a cache hit/miss counter and assert in a unit test that an identical
`(code, defines)` re-render resolves synchronously without touching the worker; assert a WASM-build-
hash bump invalidates the whole cache.

---

### 4. Lineage DAG + hosted lane + cloud sync — `next`, L *(revise: UNBUNDLE)*

**Thesis.** Three product moves: (a) `parentId`/`rootId` lineage on the `.vibemesh` share file and
`Project` record so every remix is a node in a fork DAG; (b) a zero-key hosted generation lane so a
first-time user can generate without connecting an engine; (c) optional cloud sync over the existing
`storage.ts` coalescing writer.

**Why the lineage half is huge — and the only part the board funds now.** `shareFileToProject`
(`src/lib/shareFile.ts:93`) orphans on import today; the share file is a tolerant-parse,
schema-versioned format whose parser already drops unknown fields, so adding
`parentId?`/`rootId?`/`lineageDepth?` is a safe, pure-client, near-zero-risk change. It is the
correct data shape any future verifier-mined corpus needs (bet #7), and it is independently valuable
as attribution + a "My Parts" shelf grouped by `rootId`.

**Hardest objection (unanimous: this is a product board's job, not a quality board's).** None of the
three legs move a single point of geometric quality; by the bundle's own thesis it is a *precondition
/ multiplier* for other bets, not a bet itself. Worse, the hosted lane converts a zero-backend,
local-first, privacy-positioned app into a metered-spend abuse magnet — and the generate route today
has **no rate limiting at all** (only Anthropic's own `RateLimitError` is handled). The cited
cross-tab merge precedent (`mergeExternalProjects`) is **not in the committed tree** (MEMORY confirms
"NOT yet committed, needs user OK"); `reconcileRecord` is real but it is `maxUpdatedAt`
last-writer-wins boot-recovery, not multi-device merge.

**De-risk.** **Split.** Ship lineage NOW as its own small advance (correct, cheap, ceiling-neutral,
free option value). Defer the hosted lane to a deliberate go-to-market decision with hard
per-session/day caps and a self-hoster flag — it is a business call, not a quality lever. Defer sync
until a real user pulls for it; it is the only piece with an operational tail.

**First bench-gated step.** Extend the existing share-file round-trip unit test
(`src/lib/shareFile.test.ts`) to assert `parentId`/`rootId` survive `buildShareFile` →
`shareFileToProject` and that a missing-lineage legacy blob still imports (tolerant parse).

---

### 5. Pre-generation reference-contour measurement — `next`, M

**Thesis.** Close the measurement gap at the *input*. Today the reference enters generation as a
category label + signature words, and the only reference-derived numbers
(`intent.statedDimensions`) are values the model *eyeballed* off labels. At submit time, run
OpenCV.js on the photo client-side and inject a measured-geometry fragment into `contextText`
(traced aspect H:W, distinct lobe/arm count, concavity signature, symmetry verdict) through the
existing `visionSourceFragment` seam (`server/providers.mjs:519`/`:547`) so the *first* draft is
conditioned on pixels, not vibes.

**Why it's huge.** This is *open-loop prevention* complementary to the closed-loop oracle: it raises
*first-shot* fidelity for the dominant text+image case rather than correcting after a wasted
generation — high leverage because single-shot dominates (`claude-code` is `maxTurns:1`) and the
first draft is often the only one a user keeps. A measured aspect ratio + asymmetry flag fights
proportion collapse and the symmetrization failure the asymmetry metric was built to detect. It is
provider-portable plain prose and byte-identical when no image is present.

**Hardest objection.** *A wrong trace is worse than none, and the gate is adverse-selected.* The
confidence gate suppresses the fragment on clutter — i.e. on exactly the busy/perspective photos that
need help most — so it fires mainly on clean cutouts the model already handles. Worse, a 2D
silhouette aspect ratio is **not** the 3D proportion under perspective foreshortening: a king shot
at 3/4 reads as a squat outline, so even a *perfect* trace can inject a confidently-wrong "MEASURED"
number that `clampStatedDimensions` (`src/lib/refineProxy.ts`) then keys the refine proxy on —
strictly worse than today's honest "perspective distorts proportions, prioritize the silhouette"
fragment.

**De-risk.** Emit **only perspective-invariant ordinal facts** (protrusion count, gross symmetry
verdict), **drop the aspect-ratio number** that perspective corrupts (or hedge it as
"observed silhouette, may be foreshortened", never authoritative). Share the OpenCV.js loader with
the silhouette oracle, and **require the same de-risk spike to land first** — measure the
false-descriptor rate on a real-photo set before wiring it into the live path. Pair it explicitly
with the live oracle (#1) so the injected measurement is *verified downstream*, not merely asserted.

**First bench-gated step.** Add a fixture set of ~10 traced reference photos to `bench/` with
hand-labeled ordinal facts (arm count, symmetry); assert the `refTrace.ts` descriptor matches the
labels above a precision floor before the fragment is ever injected live.

---

### 6. Client-orchestrated agentic render-in-the-loop (Anthropic) — `next`, L

**Thesis.** On the `anthropic` engine only (capability-flagged), run a real multi-turn tool loop:
expose one `render_scad` tool whose result the *client* fills (compile status + bbox + structural
issues + silhouette-IoU + a base64 4-views grid), and let the model iterate until `end_turn`.
Geometry never leaves the browser.

**Why it's huge.** It directly softens standing ceiling #3. Tool-use is genuinely unreachable on
`claude-code` (`maxTurns:1`) and `kimi`, but reachable on the first-party Anthropic adapter:
`streamAnthropicProtocol` (`server/providers.mjs:737`) already streams via `client.messages.stream`,
already returns `stopReason` via `stream.finalMessage()` (`providers.mjs:766`/`:769`), and already
sends conditional `output_config` (`providers.mjs:755`) — the capability seam exists. The model
keeps its chain-of-thought *across* the observe step instead of restarting cold, which is strictly
stronger than the current out-of-band refine.

**Concrete approach.** Add `toolLoop:boolean` to `resolveEngineDescriptor`
(`server/providers.mjs:658`), true only for `protocol==='anthropic'` first-party. On
`stop_reason==='tool_use'`, stream the `tool_use` back over SSE as a `tool_request` event; the
client compiles via the existing background FIFO lane, runs `captureViews`/printability, and POSTs
the `tool_result` to a new `/api/generate/continue` that resumes the stream. Loop until `end_turn`,
hard-capped at ~3 turns. The final assistant turn still ends with the canonical scad block so
`extractScadBlock` and the entire downstream are unchanged.

**Hardest objection.** *The "stateful pause mid-stream" collides head-on with the single
load-bearing gotcha in this codebase.* The SSE route is deliberately fire-and-forget with
`res.on('close') → abort.abort()` as the *only* teardown (`server/index.mjs:124`). A tool loop must
hold an Anthropic stream open across a client round-trip, which means a server-side session store
keyed by request-id surviving between two HTTP requests — and the existing abort wiring (one request
== one stream == one socket) no longer covers a loop spanning multiple sockets, so an aborted
generation **leaks an in-flight stream and burns tokens**. This is a rewrite of the request
lifecycle the CLAUDE.md explicitly flags as the thing not to break. (`bench/chess.mjs` already
prototypes the *cold-restart* version of this loop in node, so the architectural question is
narrowed to: does in-stream CoT-continuity beat cold restart, and is that delta worth the
lifecycle surgery?)

**De-risk.** **Prototype the session/abort plumbing as a standalone spike first** and prove no leak
on abort. Drop the "IoU as the loop's reward" language — silhouette-IoU is bench-only and needs a
gold that does not exist for a user's photo; the viable live reward is the model's own multimodal
self-judgment over `captureViews` (the base64 grid). Auto-enter only on image/kit first attempts,
hard-cap at ~3 turns, keep it an invisible capability flag. **Require an explicit A/B against the
existing cold-restart auto-refine** to prove the CoT-continuity delta is real rather than assumed.

**First bench-gated step.** Add a bench mode that runs the in-stream tool loop vs. the existing
cold-restart refine on the image/kit tasks and reports first-pass convergence and `compiledRate`
for each — the A/B that justifies (or kills) the lifecycle surgery.

---

### 7. Verifier-mined corpus → live exemplar RAG + distillation — `bet`, L *(revise: ship RAG, DEFER distillation)*

**Thesis.** The reference-free gates (compile, buildability > θ, `interferenceScore == 1`, and —
once the oracle lands — silhouette-IoU > θ) jointly define a no-human-label acceptance predicate.
Harvest passing generations (the `.vibemesh` format *is* this record shape) into (a) a live
keyword/embedding RAG that retrieves the k most-similar known-good `.scad` and injects them as
compile-verified few-shot exemplars at the `contextText()` seam, and (b) a rejection-sampled SFT/DPO
corpus to distill a local engine.

**Why the RAG half is huge.** RAG is how CADSmith hits 100% execution *without* fine-tuning, and it
attacks the organic ceiling *sideways*: you cannot make `rotate_extrude` non-axisymmetric, but you
*can* retrieve a human-validated chess knight that already solved the silhouette. It is materially
different from the shipped *static* `KIT_EXEMPLAR` because it is *prompt-conditioned* dynamic
retrieval, it lands at the proven `contextText()`/`selectSkills()` seam, and it has a ready zero-API
selftest pattern (`bench/retrieval.selftest.mjs`) to ratchet it.

**Hardest objection (unanimous: the predicate has no live shape term, and the bundle hides it).**
The strong gates are bench-only: `silhouetteIoU` needs a *gold STL* (only ~6 deterministic golds
exist, none for "a dragon ring"); `buildability` is gated `kit:true` only; `interferenceScore`
requires the opt-in `_debug` probe contract real user outputs won't expose. So for the dominant
single-part open-vocabulary case the predicate degenerates to *compiles ∧ manifold* — orthogonal to
the fidelity ceiling, since the entire documented crisis (king=hourglass, knight=coffin) is about
programs that *compile fine yet look wrong*. Self-distilling on that corpus entrenches the
axisymmetric "frozen brain" the skills study warned against, and there is **no server-side collection
path** today (local-first IndexedDB, keys in `.env`, telemetry repeatedly deferred).

**De-risk.** **Split the bundle.** Ship the RAG half over an *explicitly-curated* corpus — start
zero-API keyword retrieval over INTENT line + Customizer param names + skill ids, k=1-2,
similarity-gated, injected *below* skills in `contextText()`, byte-identical when no match. Seed it
from the 18 bench tasks + only the user generations the user *explicitly promotes* via the
share-file path with a compile-verified flag — never auto-harvested compile-only output.
**Defer distillation entirely** until the live shape oracle (#1) lands and a corpus exists that was
gated by *shape*, not compilation; and require `buildability` + `silhouette` browser twins before any
auto-harvest (today only `interferenceProxy.ts` qualifies as a live reference-free oracle).

**First bench-gated step.** Add `bench/rag.selftest.mjs` (modeled on `retrieval.selftest.mjs`):
assert that for each of the 18 tasks, the keyword retriever returns the topically-correct exemplar
above the similarity floor and returns *nothing* for an unrelated prompt (no false injection).

---

### 8. CadQuery/OCCT BREP side-path — `bet`, XL *(rejected as a fundable bet; kept in the idea bank)*

**Thesis.** Stand up a second geometry engine (CadQuery/OpenCASCADE via Pyodide) as an opt-in
*side-path* — never a swap — for the figurative/organic class where OpenSCAD's axisymmetric
`rotate_extrude` / convexifying `hull()` caps fidelity at ~60-70%, unlocking analytic surfaces
(exact fillets, lofts, sweeps) and a trustworthy kernel wall-thickness query, plus STEP/IGES export
for a new mechanical-CAD customer.

**Why it's contested rather than cleanly killed.** It is the *only* lever that structurally *breaks*
ceiling #2 instead of mitigating it — and the impact-realist and novelty lenses both rate impact 4
and recommend **revise/defer, not reject**. The horse-head→coffin failure is a genuine
`hull()`-convexification kernel limit immune to prompting, and a BREP kernel uniquely buys
loft/sweep/variable-fillet and a queryable solid.

**The reject vote's kill-shot.** *It attacks the wrong ceiling and is gated behind an unbuilt
prerequisite.* The live cause of ceiling #2 is the **absent shape oracle** (`bestOfN.ts` /
`refineProxy.ts` select and critique blind), not OpenSCAD's primitive set — swap in CadQuery and you
still pick and grade blind, so exact lofts buy nothing the user can see. And the
slider-remix moat is OpenSCAD-`-D`-shaped *at the kernel level*: live re-render is `-D name=value`
into `callMain` at ~100-500ms with no AI round-trip; `build123d` via Pyodide has no in-browser `-D`
recompile primitive, so every slider drag re-runs the full Python program (seconds, after a
tens-of-MB OCCT-WASM cold start). The proposal even sequences itself *after* the oracle.

**Disposition.** **Defer, hard-gated.** Prove the visual oracle on the cheap engine first, re-measure
whether OpenSCAD's residual ceiling actually binds, and only then revisit BREP — and even then start
as a narrow **STEP-export feature**, not a kernel fork. Mandatory first spike before any contract
work: a 1-week throwaway answering one question — *can `build123d` params drive the existing
Customizer sliders at acceptable latency?* If no, the moat-preserving side-path is dead and BREP is
export-only.

---

## 4. Now / Next / Bet roadmap (dependency-respecting)

The hard ordering constraint: **a trustworthy live shape signal must exist before any reward claim,
RL, or distillation** — and **multi-sample bench discipline must precede any reward claim** (the gate
already refuses `<2` samples; honor it for every fidelity number).

### NOW (this quarter — cheap, unblocking, mostly client-only)
1. **Content-addressed render cache** (#3a) — decoupled UX win; also the enabling layer the oracle's
   worker pool rides on. No oracle narrative.
2. **Lineage DAG** (#4a) — pure-client, near-zero risk; lands the data shape bet #7 needs.
3. **De-risk SPIKE: OpenCV.js contour + Z-rotation registration on ~10 real photos** — the gating
   experiment for #1, #5, and #12. *Nothing that consumes a contour ships until this passes.*
4. **Live silhouette oracle as a best-of-N soft tiebreak** (#1), *conditional on the spike* —
   strictly below the compile/degenerate tiers, monotonic refine-STOP only, bbox fallback on
   low-confidence contours.

### NEXT (after the oracle proves out on the cheap engine)
5. **Two-tier free silhouette gate in refine, THEN the independent VLM judge** as the
   inconclusive-case escalation (#2) — free deterministic signal first (all engines), paid VLM second.
6. **Pre-generation contour measurement** (#5), ordinal-facts-only, sharing the OpenCV loader,
   verified downstream by #1.
7. **Worker pool** (#3b) — funded as the oracle's concurrency layer, not standalone.
8. **Agentic render-in-the-loop on Anthropic** (#6) — *after* the session/abort spike and an A/B
   vs. cold-restart refine.

### BET (only after a live SHAPE gate exists to keep them honest)
9. **Exemplar RAG over the curated corpus** (#7a) — start zero-API keyword retrieval.
10. **Hosted lane + cloud sync** (#4b/c) — explicit go-to-market call with hard caps; not a quality
    lever.
11. **Distillation** (#7b) — deferred until #1 gates the corpus on shape.
12. **BREP side-path / superquadric manifest** (#8, #9) — re-measure the residual ceiling first; the
    moat-preserving form of #9 (have the *already-multimodal LLM* emit the part-manifest into the
    INTENT JSON, no external neural mesh) is the cheap on-architecture experiment to run before any
    GPU infra.

---

## 5. What the board explicitly rejected (and why)

- **Provider-portable compile-repair inner loop (3 reject votes, unanimous).** *Already shipped,
  nearly line-for-line.* The loop is live: `canRepair` (`generationActions.ts:326`) re-asks the SAME
  engine with `buildAutoFixPrompt(compileResult.error)` and re-enters `runGeneration(..., attempt+1)`,
  bounded by `MAX_AUTO_FIX = 2` (`generationActions.ts:50`), gated off for `local:` engines, fed the
  worker's `pickError` string. Transport errors never reach this path (they throw into the catch
  before any compile). The live loop even *exceeds* the proposal — it also repairs degenerate renders
  and structural/interference faults (`generationActions.ts:353`/`:360`/`:367`). Re-proposing shipped
  code; and by its own admission it raises buildability, not fidelity.

- **Constrained-decoding the response contract (2 reject votes).** *Hardens the wrapper, not the
  geometry, and breaks the streaming UX.* `output_config` is real on the streaming path and json_schema
  is already exercised in `judge.mjs` — but the judge is a *non-streaming* `.create()` call, whereas
  live generation streams prose+code deltas token-by-token into the chat
  (`generationActions.ts` delta loop). A json_schema grammar streams as partial JSON, breaking the
  "watch it plan and write the program" UX unless you build a partial-JSON stream parser to *replace*
  the battle-tested, gracefully-degrading `extractScadBlock`. Worse, the `max_tokens` truncation case
  that today yields a *recoverable* half-program becomes an *unparseable* truncated JSON object — a net
  regression in robustness. The salvageable sliver (typed INTENT) is better delivered by tightening the
  existing engine-agnostic INTENT-line parser in `src/lib/params.ts`, which already parses a far richer,
  tolerant, enum-validated schema across all engines.

- **Contested near-rejects kept alive:** the **BREP side-path** (#8, one reject) survives as a
  hard-gated, post-oracle, export-first idea because its impact-if-it-lands is real (a different
  customer); the **derivative-free silhouette refit** (#12, no reject but composite 10.4) survives only
  *re-scoped behind the same registration spike* and *re-targeted at stated dimensions* (`snap to
  stated dimensions`) for a shippable beachhead, since single-view 2D-silhouette IoU against a
  perspective photo is geometrically degenerate and will squash Z to fit foreshortening.

---

## 6. Honest limits — the standing ceilings that remain real

1. **The organic/figurative axisymmetric ceiling (~60-70%) is not broken by anything we fund now.**
   Every shipped and proposed mitigation in the NOW/NEXT tiers (oracle, VLM judge, contour
   measurement, RAG) raises the *proportion/outline floor* and the *selection* quality; none changes
   what `rotate_extrude` / CSG can *express*. Only the BREP side-path structurally breaks it, and it is
   deferred behind the oracle and a slider-latency spike. A 2D silhouette cannot see depth or
   concavity — it raises the outline floor without breaking the depth ceiling.

2. **Registration is the unsolved heart of every reference-grounded bet.** A hand-held perspective
   photo is not an orthographic mask. The oracle, the contour measurement, and the param refit all
   stand or fall on the same de-risk spike; if it fails on real photos, the honest fallback is the
   *self-consistency* (reference-free, multi-view-coherence) form of the oracle, which raises asymmetry
   robustness but not absolute reference fidelity.

3. **Agentic self-correction stays single-engine.** The tool loop is reachable *only* on the
   first-party Anthropic SDK; `claude-code` (`maxTurns:1`) and `kimi` cannot run it, and the flagship
   shippable login engine therefore does not benefit. It cannot move the 608-of-works text-only / cross-
   engine majority.

4. **Distillation cannot escape the corpus.** Without a live *shape* gate, the no-label acceptance
   predicate is `compiles ∧ manifold` — orthogonal to fidelity — so a self-distilled local model
   entrenches the house style. Distillation is honestly *blocked* on bet #1, not merely sequenced after
   it.

5. **The local-first / zero-backend / provider-portable constraints are real walls, not preferences.**
   Any hosted lane, sync, or external neural-mesh pipeline trades directly against the moat the
   `.vibemesh` primitive was built to protect; those are business/ops decisions, and a quality board
   should not smuggle them in as quality levers.

*Sources cited:* CADSmith rendered-image ablation and dual-channel convergence —
<https://arxiv.org/abs/2505.04207>. SOTA decomposition references invoked in the bet tier (SuperDec,
Light-SQ, PrimitiveAnything) are 2025 mesh-to-primitive works and are flagged as bet-horizon, not
load-bearing for the NOW/NEXT plan.

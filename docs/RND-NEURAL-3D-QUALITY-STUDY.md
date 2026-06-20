# R&D Study — Matching "Meshy-class quality" with Parametric OpenSCAD Output

**Track A — Senior R&D Lead Engineer #1**
**Audience:** Founder / senior board, Vibemesh-AI
**Date:** 2026-06-20
**Status:** Final. Recommendations are bench-grounded and verified against the repo at the line level.

---

## 1. Executive summary

The board's framing question — *"can we match Meshy's quality?"* — is a category error we should reject before we answer it, because Meshy and Vibemesh do not compete on the same axis. Meshy optimizes the **visual fidelity of a frozen, dense, non-parametric art mesh**. Vibemesh's deliverable is a **functional, parametric, printable, editable OpenSCAD program**. Meshy's own documentation concedes the exact territory we own: it tells users that for *tight tolerances, snap fits, and threaded parts* they should "communicate fit requirements" and use a parametric/B-rep CAD path instead, because Meshy "is not suitable for CAD-accurate or manufacturing-ready models" ([Meshy blog, Best CAD software for 3D printing](https://www.meshy.ai/blog/best-cad-software-for-3d-printing)).

So **"quality" for us is a four-part vector, not a render score**:

1. **Fidelity to intent** — geometry matches what was asked. Our voxel-IoU / fidelity / interference bench is, as far as the public record shows, the field's only *quantitative correctness layer* for generated CAD. No funded mesh-gen rival (Meshy, Tripo, Rodin, Sloyd, Backflip) publishes one. (Caveat below: the *academic* and *Zoo* lines do publish execution-grounded evals — we are not unique in the research sense, only in the shipped-product sense.)
2. **Printability** — manifold / flat-on-bed / mm / wall-thickness as correct-*by-construction* invariants via OpenSCAD + the Manifold backend, versus Meshy's repair-after-the-fact "Refine" step.
3. **Editability** — the output **is** the Customizer slider. This is structurally unreachable by any diffusion+LRM mesh pipeline; it is the moat.
4. **Perceived polish** — the one axis where Meshy genuinely out-shines us in side-by-side screenshots, and the one we under-invest in.

**Strategic conclusion.** Stay pure-parametric (the moat is real and structural), and **close the fidelity-to-intent gap by promoting our offline bench signals into the live generation loop** — the single highest-ROI move, validated by every 2025 text-to-CAD SOTA result where execution-grounded feedback drove down invalidity dramatically, at **zero GPU cost**. In parallel, **cheaply close the perceived-polish gap with viewport staging and on-moat per-part 3MF color**, neither of which touches the kernel. A neural mesh-gen mode is a deliberate **non-goal for output** (it discards all four quality dimensions and breaks the local-first, no-GPU architecture) but is a defensible *optional input-as-reference* aid. The organic/figurative ceiling (~60–70%, set by what `rotate_extrude` can express) is a **structural kernel limit we should caveat, not chase**.

> **Two corrections that this report bakes in, flagged by adversarial review and verified in-repo:**
> - **Voxel-IoU is a bench-only signal.** `src/lib/refineProxy.ts` states plainly that *"in the live app there is no gold for a user's image."* IoU needs a gold reference that does not exist at runtime. Every runtime loop here uses **reference-free** signals only (compile-clean, degenerate, structural, skill-validator, dim-vs-stated, and the new interference proxy). IoU stays in the bench.
> - **The bench modules are Node-only.** `bench/interference.mjs` / `bench/compare.mjs` import `node:fs`/`node:url` and drive `callMain` directly; they **cannot** be imported in the browser. "Reuse the bench scorer" means **re-implement** the voxel-overlap client-side against the existing singleton worker — a real, non-zero porting cost.

---

## 2. What "quality" means — Meshy vs. us

| Dimension | What Meshy optimizes | What Vibemesh delivers | Who wins |
|---|---|---|---|
| **Visual / perceived polish** | Dense textured mesh, 4K PBR, staged turntable render | Flat-shaded parametric solid in an r3f viewport | **Meshy** (today) |
| **Fidelity to intent (measured)** | No published correctness metric; "looks right" | voxel-IoU + interference + dim + placement + structural bench | **Us** (only shipped product with this) |
| **Printability** | Repair-after-the-fact ("Refine"), no manifold guarantee, scaleless/baseless output | Manifold-by-construction, flat-on-bed, mm, wall-thickness invariants | **Us** (structural) |
| **Editability** | Frozen mesh; re-prompt to change | The output *is* the Customizer slider; live re-parameterization, no AI round-trip | **Us** (structural) |
| **Organic / figurative form** | Native strength (diffusion + LRM) | `rotate_extrude` ceiling ~60–70% | **Meshy** (kernel-bound for us) |

The honest reading: we lose the **screenshot**, we win the **part that prints and the part the user can change**. Meshy's docs say as much. Our job is not to win Meshy's screenshot — it is to **stop losing the side-by-side at first glance** (cheap staging) while **widening the correctness lead** that no rival even measures.

---

## 3. Competitive & technical landscape

Cited from the 2025–2026 research pass. "Editable?" = re-parameterizable after generation (not just re-promptable). "Printable?" = manifold/scaled/flat-on-bed by construction, not after repair.

| Tool / system | Approach | Output | Editable? | Printable by construction? | Relevance to us |
|---|---|---|---|---|---|
| **Meshy** | Diffusion + LRM, text/image→mesh | Dense textured mesh + PBR | No (frozen) | No — "not CAD-accurate," repair step, scaleless | **Primary perceived-quality foil**; concedes tolerances/snap-fits/threads to CAD ([link](https://www.meshy.ai/blog/best-cad-software-for-3d-printing)) |
| **Tripo** | Text/image→mesh | Mesh; limited export tiers, no native rigging | No | No | Same mesh-gen class as Meshy ([compare](https://medium.com/data-science-in-your-pocket/ai-3d-model-generators-compared-tripo-ai-meshy-ai-rodin-ai-and-more-8d42cc841049)) |
| **Rodin / Deemos (Hyper3D)** | Image→mesh, 4K PBR | Photoreal textured mesh | No | No | Sets the *photorealism* bar; orthogonal to our moat ([compare](https://medium.com/data-science-in-your-pocket/ai-3d-model-generators-compared-tripo-ai-meshy-ai-rodin-ai-and-more-8d42cc841049)) |
| **Luma / CSM** | Image/NeRF→mesh | Mesh / radiance field | No | No | Visualization, not manufacturing |
| **Sloyd** | **Parametric template + slider editing** | Game-ready procedural mesh | **Yes (params)** | No (game-LOD, not print-manifold) | **Philosophically closest on editability** — but template-bound: *"you can't describe something in text and have it generated"* ([Sloyd pricing/compare](https://www.sloyd.ai/blog/3d-ai-price-comparison)). We have the text/image front-door they lack. |
| **TRELLIS / TRELLIS.2 (Microsoft)** | Structured-latent / O-Voxel image→3D | Mesh + PBR; **explicitly supports non-manifold geometry** | No | **No — non-manifold by design** | **MIT-licensed**, cleanly shippable IF we ever did mesh-gen; but its non-manifold output is exactly what our **Manifold kernel errors on** ([repo](https://github.com/microsoft/TRELLIS.2), [HF](https://huggingface.co/microsoft/TRELLIS.2-4B)) |
| **Hunyuan3D-2 / 2.1 (Tencent)** | Image→mesh + PBR | Mesh | No | No | **Licensing minefield: excludes EU/UK/South Korea** outright ([LICENSE](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1/blob/main/LICENSE), [HN](https://news.ycombinator.com/item?id=43420870)) — unshippable for a global app |
| **Zoo Text-to-CAD / KCL (KittyCAD)** | ML→**parametric B-rep** via KCL code | Editable parametric B-rep | **Yes** | Partial (B-rep, CAD-grade) | **The real philosophical competitor.** Open-source, publishes on text-to-CAD, "read the KCL — no hidden info" ([KCL](https://zoo.dev/research/introducing-kcl), [text-to-CAD](https://zoo.dev/blog/introducing-text-to-cad)). Targets engineering, **not the consumer FDM 3D-printing front-door** we own. |
| **AdamCAD (YC W25)** | Conversational LLM→parametric CAD | **Exports STL/OBJ/SCAD/STEP**, auto-slider params | **Yes** | CAD-grade | **Most direct future threat:** literally emits `.scad` and "converts numeric dimensions into slider-driven variables" ([review](https://pasqualepillitteri.it/en/news/3372/adamcad-text-to-cad-ai-review-2026)). Validates our thesis *and* warns us the lane is contested. |
| **Backflip** (Greg Mark / Markforged) | **Scan/mesh→parametric CAD** | Editable parametric (SOLIDWORKS plugin) | **Yes** | CAD-grade | Confirms the market is **converging on parametric/editable**, away from frozen mesh ([3DPI](https://3dprintingindustry.com/news/new-ai-model-from-backflip-accelerates-3d-scan-to-cad-237055/), [DEVELOP3D](https://develop3d.com/cad/backflip-introduces-mesh-to-cad/)) |
| **Academic SOTA — CAD-Coder, CAD-RL, cadrille, Text2CadQuery** | LLM + **execution-grounded RL/CoT** | Parametric code (CadQuery/B-rep) | Yes | Eval-only | **The evidence base for R1/R5.** Execution feedback as reward "significantly reduces geometric errors and invalid scripts" ([CAD-RL arXiv 2508.10118](https://arxiv.org/html/2508.10118v1), [Text2CadQuery arXiv 2505.06507](https://arxiv.org/pdf/2505.06507), [cadrille arXiv 2505.22914](https://arxiv.org/html/2505.22914)) |

**Two strategic reads from the table:**
1. **The market is moving toward us, not away.** Backflip, Adam, Sloyd, and Zoo are all *parametric/editable*. Mesh-gen (Meshy/Tripo/Rodin/TRELLIS/Hunyuan) is the visualization lane; it is **not** where buildable-part value is accruing. Option C (neural mesh-gen output) bets against this trend.
2. **The "only correctness benchmark" claim must be scoped.** Among **shipped consumer products**, it holds — no mesh-gen rival publishes one. But the **academic line and Zoo do** publish execution-grounded evals. Market the claim as *"the only consumer text/image-to-print product with a quantitative correctness gate,"* not *"nobody measures correctness."* Overclaiming here is a credibility risk.

---

## 4. Strategic options

| Option | Thesis | Verdict |
|---|---|---|
| **A. Stay pure-parametric; win on fidelity-to-intent + editability by closing the live verification loop** | Promote the offline bench's **reference-free** scorers into a runtime compile→score→retry loop. Asset-light, on-architecture, on-moat. Mirrors the exact mechanism behind every 2025 SOTA result. | **PRIMARY STRATEGY.** Highest ROI, lowest architectural risk, defends the structural moat the whole research corpus confirms is real. |
| **B. Perceived-quality polish only (viewport staging + per-part 3MF color)** | ~80% of Meshy's "premium feel" is staging + affordances on the *same* geometry. Per-part 3MF color is *both* polish *and* on-moat (carries into real multi-material slicer assignment). | **ADOPT AS A FAST PARALLEL TRACK**, explicitly subordinate to A. Do the **on-moat color/3MF piece first**, then the cosmetic staging. |
| **C. Neural mesh-gen MODE for organic/art shapes (self-host TRELLIS/Step1X or hosted endpoint)** | Would close the organic ceiling Meshy owns. | **REJECT as an output path.** Discards all four quality dimensions; output is non-parametric, non-manifold (our Manifold kernel **errors** on it), needs a persistent NVIDIA GPU + job queue (structural break from two-CPU-process local-first design); Hunyuan licensing excludes EU/UK/Korea. It is the inverse of the product. |
| **D. Neural-as-reference, then parametric-rewrite (image→multi-view synth→better OpenSCAD)** | The only neural integration that respects the moat — view synthesis feeds the vision model cleaner evidence; neural stays advisory, never enters the printable path. | **DEFER / SPIKE-ONLY.** Still needs a GPU endpoint; our own image-fidelity notes say the ceiling is set by what `rotate_extrude` can *express*, not by reference quality, so payoff is uncertain. **Park behind the cheaper, GPU-free "structure-then-parameters" image factorization** (see R9). |

**Recommendation: A as primary, B as a cheap parallel track, C rejected, D deferred behind a no-GPU spike.**

---

## 5. Prioritized roadmap

Effort/impact/risk per item. Sequenced so each cheap, zero-risk win ships first and the loop-heavy fidelity work lands behind a shared budget guard. **Reference-free signals only at runtime — IoU never runs live.**

### 5a. Perceived-quality quick wins — ship in the current r3f viewport, zero kernel change, zero GPU backend

| ID | Item | Effort | Impact | Risk |
|---|---|---|---|---|
| **R3** | **Per-part color metadata in 3MF export.** `src/lib/threeMF.ts` writes one `<object>` per part with **zero** color metadata (verified). Emit a `<basematerials>` resource + `pid`/`pindex` `displaycolor` per part, sourced from a **deterministic palette keyed on part-enum order** (so `.vibemesh` re-import reproduces identical swatches). Bambu/Prusa auto-assign filaments by RGB distance — this is the *printable* slice of Meshy's "PBR" pitch. ~20 lines. Document in `docs/SPEC.md`. | **S** | Medium | Low — additive; must preserve existing weld/degenerate-drop hygiene so slicers don't re-flag watertightness. |
| **R6** | **Fix refine-capture viewpoint drift + offscreen high-res capture.** (1) `ChatPanel.tsx:111` names *"isometric, front, top"* (3) while `CaptureRig` shoots **4** poses incl. `right` — the model mis-attributes the 4th image, defeating the side-asymmetry view it was added for (verified). **Single-source the pose-name list** from the same ordered export `CaptureRig` consumes, so it can't drift again. (2) `captureViews` only scales **down** from the live canvas, starving the self-critique on narrow viewports — render the 4 poses into a dedicated `WebGLRenderTarget` sized to `maxDim 1280` regardless of window size (match the `#15171a` fill/color-space). Update `docs/SPEC.md`. | **S** | Medium | Very low — capture-path only, no geometry/export impact. |
| **R4** | **Viewport staging pass (trimmed).** `Viewport.tsx` has no tone-mapping, contact shadow, auto-rotate, or view modes (verified); PMREM IBL already exists via `RoomEnvironment`. Add `ACESFilmic` tone-map + exposure ~1.1 (a **constant**, not a slider — avoids scope creep); a contact shadow; and **auto-rotate-on-spawn that stops permanently on first pointer interaction** (this is a CAD iteration tool, not a turntable). **Honor `frameloop='demand'` (ADR-0001): call `invalidate()` every tick or the rAF halts.** Gate on the shared reduced-motion hook. **Cut the Clay/Wireframe/Normals switcher for now** (cosmetic, defer until a user asks). Coordinate with `vibemesh-3d-motion` (scene). | **S–M** | Medium | Low — display-only. Must stop on interaction and respect reduced-motion. Watch raw GPU cost on integrated/mobile GPUs (provide a fallback that skips contact shadows). |
| **R10** | **Activation / empty-state gallery (new — from completeness review).** The cheapest perceived-quality + conversion lever for a local-first tool: a curated gallery of remixable `.vibemesh` share files (the primitive already exists in `shareFile.ts`) on first load. One click loads a genuinely-buildable parametric part *with live sliders* — instantly demonstrating the editability moat a Meshy screenshot **cannot**. Near-zero engineering cost. | **S** | Medium | Low. |

### 5b. Fidelity-to-intent — the moat work (zero GPU, reference-free runtime signals only)

| ID | Item | Effort | Impact | Risk |
|---|---|---|---|---|
| **R1** | **Tighten the EXISTING live auto-fix loop.** Correction from review: `structuralReport` + `skillReport` + `degenerateReason` **already** drive a bounded `MAX_AUTO_FIX=2` repair turn (`store.ts:528`, off for `local:` engines). The un-shipped delta is narrower than "promote invisible scorers": **feed a more specific failure reason into that repair turn**, and **admit the new interference signal (R2)** as a trigger. Reward = reference-free self-validators only (compile-clean, degenerate, structural, skill, dim-vs-stated). **IoU is excluded — no runtime gold.** Evidence: CAD-RL execution feedback "significantly reduces geometric errors and invalid scripts" ([arXiv 2508.10118](https://arxiv.org/html/2508.10118v1)). **Add an A/B (auto-fix on/off) on the bench before widening** — prove the extra turn improves the median, not just burns tokens. | **S** (≈60% shipped) | High | One extra round-trip on faulty gens, bounded by `MAX_AUTO_FIX`. |
| **R2** | **Build the runtime interference proxy.** `src/lib/interferenceProxy.ts` does **not exist** (verified); nothing checks the `_debug` contract at runtime. Catches the highest-value blind spot — *"compiles manifold + perfect dimScore but a bore guts a bearing seat / clutch tube"* — to which IoU and buildability are structurally blind. **Re-implement** a browser-native voxel-overlap driving the singleton `openscad/client.ts` worker (do **not** import `bench/interference.mjs` — it's Node-only). Fires **only when `hasDebugContract` is present** (opt-in, bounded). Route the result into R1's structural→auto-fix path. | **L** | High | Two extra renders/kit that **serialize** through the single-flight worker — needs a bounded queue that never supersedes the live render (see budget guard). |
| **R5** | **Runtime best-of-N for ambiguous/kit/image requests.** Runtime is single-shot today (verified). Fan out N=2–3 `streamGenerate` calls, compile each in-browser, adopt the best by a composite of **reference-free** signals (compiles-clean, degenerate, structural count, skill count, dim-vs-stated). **Gate HARD** to high-`ambiguityScore`/kit/image, behind an off-by-default toggle. Corrections from review: **selector is NOT voxel-IoU**; **`claude-code` can't carry this in a shipped build** (personal-use, rotating token) — only paid `anthropic`/`kimi` ship it; **temperature is not wired** (`providers.mjs` passes `effort` only; `kimi` 400s on `effort`; the Agent SDK may not expose temperature) — **vary `effort`, drop the temp assumption**. The N compiles **serialize** through one worker. | **L** | High | N× token cost + N× latency on hard tasks; serial compiles. **Strictly gated behind R1+R2 landing** so each sample carries a real validity verdict. Weakest standalone ROI of the high-impact set. |

### 5c. Coverage & governance — bench/prompt/skills (zero GPU)

| ID | Item | Effort | Impact | Risk |
|---|---|---|---|---|
| **R8** | **Baseline T13–T17 on shippable engines + ship flat-on-bed and over-split fixes.** Verified: `baseline.json` has only `claude-code` + `kimi` rows — **no `anthropic`** — and T13–T16 mechanism/composition lanes are baselined **only under advisory `claude-code`, which never gates**. So mechanism quality on shippable engines is **unguarded**. Run `BENCH_SAMPLES=3` on `kimi`+`anthropic` across T13–T17 and `--update-baseline`. **Split into two commits:** (1) pure governance baseline (no behavior change); (2) the prompt z-floor + over-split directive (**behavior change — run full `bench:gate` across ALL tasks** for cross-task regressions). **Note:** runtime drop-to-bed already mitigates single-part placement (`store.ts`), so prioritize the **over-split directive (zero-tolerance gate trigger)** over the z-floor tweak; prefer **deterministic z-floor normalization** over a prompt rule where feasible. **Note:** `effort` helps `anthropic` only — `kimi` gets no effort lever. | **S–M** | Medium | Live-API nondeterminism makes single-run "no regression" unfalsifiable — only `BENCH_SAMPLES≥2` median aggregation makes a tighter baseline trustworthy. Do **not** tighten IoU/skill tolerances off a single run. |
| **R7** | **Expand the skill registry into uncovered high-value families.** 21 skill entries today (verified). Each new skill converts a class from "model recall, drifts" to "dimensionally-correct by construction" — the sharpest uncontested wedge. **Trim and sequence by frequency × geometric honesty:** ship **threaded-lid + standoffs + dovetail + bayonet first** (high-frequency, snap/captive geometry that's dimensionally honest), each with a `bench/gold/<task>.scad` for the IoU-scorable ones. **Defer helical machine threads / worm / cam** — same multiplicative-triangle ceiling as the coil spring; default to **heat-set / tapped / captive-nut** per the existing honesty guardrail. | **M** | Medium | **EXEMPLAR POISON** — a subtly-wrong exemplar silently degrades every selecting generation. The zero-API registry walker (compile + buildability + interference + validator + broken-control + negative-case-fires-zero) is a **non-negotiable merge gate**; never bump baseline on a red selftest. |
| **R9** | **Spike: GPU-free "structure-then-parameters" image factorization (new — the honest alternative to Option D).** Named in the thesis but un-owned. Instead of neural multi-view synthesis, **name parts + spatial relations from the image** (existing vision pipeline), then **solve dimensions via the existing Customizer sliders**. No GPU, on-moat, output stays editable + bench-gateable. The most strategically-aligned way to push past the rotate_extrude image ceiling without a GPU endpoint. | **M (spike)** | Medium (uncertain) | Bounded by the `rotate_extrude` expressivity ceiling, not reference quality — keep it a spike until it shows lift. |

### 5d. Hybrid neural bets that need infra — **not** recommended for this cycle

| Bet | Why parked |
|---|---|
| Self-host TRELLIS/Step1X mesh-gen (Option C) | Persistent NVIDIA GPU (5–29GB), job queue, cold-starts — a structural break from the local-first, key-in-`.env`, two-CPU-process design. Output is non-parametric + non-manifold (our Manifold kernel **errors** on it). MIT (TRELLIS) is the only cleanly shippable license; Hunyuan excludes EU/UK/Korea. |
| Hosted neural multi-view synthesis (Option D) | Adds a metered cloud cost center to a local-first app; payoff capped by the kernel, not the reference. Superseded by the cheaper R9 spike. |

---

## 6. Cross-cutting requirement: ONE shared compute/latency budget guard

The single biggest gap surfaced by every reviewer: **R1 (repair turn) + R2 (2 interference renders) + R5 (N gens, each possibly auto-fixed) compound on the *same* kit/image/high-ambiguity request.** Worst case ≈ `N × (gen + auto-fix tokens) + N × (2 interference renders) + N candidate compiles` — and **all candidate compiles serialize through one single-flight, single-shot WASM worker** that coalesces (a queued render is resolved `superseded`). Stacked on a heavy kit this can blow past the **90s worker watchdog** and spike browser memory (N STL buffers + N meshes + the ~14MB base64 WASM chunk + IndexedDB history).

**Do not ship three independent toggles.** Implement **one shared per-generation budget** (token ceiling + wall-clock ceiling + a bounded compile queue that never supersedes the live render) that R1/R2/R5 all consult, with explicit precedence when several fire. Quality work must **degrade gracefully under budget**, not compound. Add a lightweight **per-session cost/latency HUD** so a user supplying their own key sees what the loop-heavy path costs — and surface a **"fast vs. thorough" toggle** so perceived *speed* (also part of perceived quality) isn't silently traded away.

**Make correctness visible.** When the loop rejects/repairs a sample, the user currently sees nothing. A lightweight *"verified: no interference · flat-on-bed · M3 dims match"* affordance turns the invisible correctness moat into a **visible differentiator** — the demand-side counter to Meshy's prettier screenshot.

**Keep the local-first promise.** The flagship loops are all off for `local:` engines, yet the reference-free scorers are **zero-API**. The zero-API portion of R1/R2 (and best-of-N selection) **could and should stay on for local engines** — gating them off entirely is a missed alignment with the product's own identity.

---

## 7. Honest non-goals & risks

**Non-goals (deliberate):**
- **Neural mesh-gen as an output path.** It discards all four quality dimensions and breaks the architecture. The market is converging *toward* parametric (Backflip, Adam, Sloyd, Zoo), not away from it.
- **Matching Meshy's organic/figurative fidelity.** The ~60–70% ceiling is a `rotate_extrude` expressivity limit. **Caveat it honestly in-product**; don't chase it with a kernel we don't have.
- **Helical machine threads as a default.** Same multiplicative-triangle problem as the coil spring — default to heat-set/tapped/captive-nut.

**Risks to manage:**
- **Overclaiming the "only correctness benchmark."** True for shipped consumer products; **false** against the academic line and Zoo. Scope the marketing claim or it's a credibility liability.
- **AdamCAD is the real threat, not Meshy.** It already exports `.scad` with auto-slider params. Our defensible edge is the **consumer FDM front-door + the correctness gate + local-first**, not parametric-ness per se. Watch this lane.
- **Exemplar poison (R7)** and **prompt-edit interaction effects (R8/R7).** Ship **one prompt edit per `bench:gate` cycle** with `BENCH_SAMPLES≥3`; the registry walker is a hard merge gate.
- **Compounding latency/cost (§6)** — the dominant feasibility risk; do not ship the loops without the shared budget.
- **Editability has no metric.** The most-differentiated pillar (#3) is unmeasured — a model can pass IoU/buildability with hardcoded magic numbers and zero useful sliders. **A future "parametricity score" (count of meaningful params, named clearance/fit knobs, derived-vs-magic-number ratio) belongs on the roadmap** as the eval gap that most threatens the moat narrative.
- **Eval-set size.** Only 6 gold `.scad` files for ~17 tasks — a thermometer with few degrees. Grow the held-out gold set alongside R7/R8 to resist overfitting prompts to 17 tasks.
- **No physical-reality loop.** The bench validates geometry-vs-intent in voxels, never printed-part-vs-intent (FDM shrinkage, elephant-foot, real clearance). A small print-and-measure calibration set feeding `hardware.mjs` tolerance defaults is the highest-credibility, lowest-coverage gap for the "snap-fits that actually fit" claim.

---

### Sources

- Meshy — Best CAD software for 3D printing (concedes tolerances/snap-fits/threads): https://www.meshy.ai/blog/best-cad-software-for-3d-printing
- Meshy/Tripo/Rodin comparison: https://medium.com/data-science-in-your-pocket/ai-3d-model-generators-compared-tripo-ai-meshy-ai-rodin-ai-and-more-8d42cc841049
- Sloyd parametric/template, price comparison: https://www.sloyd.ai/blog/3d-ai-price-comparison
- Microsoft TRELLIS.2 (MIT, non-manifold by design): https://github.com/microsoft/TRELLIS.2 · https://huggingface.co/microsoft/TRELLIS.2-4B
- Hunyuan3D-2.1 license (excludes EU/UK/South Korea): https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1/blob/main/LICENSE · https://news.ycombinator.com/item?id=43420870
- Zoo Text-to-CAD / KCL: https://zoo.dev/research/introducing-kcl · https://zoo.dev/blog/introducing-text-to-cad
- AdamCAD (exports .scad, auto-slider params): https://pasqualepillitteri.it/en/news/3372/adamcad-text-to-cad-ai-review-2026
- Backflip mesh/scan→parametric CAD: https://3dprintingindustry.com/news/new-ai-model-from-backflip-accelerates-3d-scan-to-cad-237055/ · https://develop3d.com/cad/backflip-introduces-mesh-to-cad/
- Execution-grounded SOTA — CAD-RL: https://arxiv.org/html/2508.10118v1 · Text2CadQuery: https://arxiv.org/pdf/2505.06507 · cadrille: https://arxiv.org/html/2505.22914

# Vibemesh-AI — R&D Study: Generalizing the Brain Behind a General Skeleton

> Board R&D study, finalized for the founder. Codebase-grounded (every cited reference verified line-by-line), honest about the parametric-OpenSCAD ceiling. The deliverable is a strategy to make the *understanding* as general as the *pipeline* already is — and to say plainly where it cannot.

---

## Current State

**The diagnosis in one line: a general SKELETON, a specific frozen BRAIN.**

The pipeline carries zero use-case knowledge and is genuinely engine- and subject-agnostic:

- `sendPrompt` → `streamGenerate` → `POST /api/generate` (SSE `delta`/`done`/`error`), with `server/index.mjs` aborting upstream generation via `res.on('close')` + AbortController.
- `server/providers.mjs` `streamChat` dispatches on engine id (`anthropic`, `kimi`, `claude-code`, `local:<model>`) — all four feed the SAME system prompt.
- `src/lib/params.ts` parses Customizer annotations into typed sliders/dropdowns; parameter changes re-render via `-D` defines, no AI round-trip.
- `src/lib/openscad/*` renders in a single-shot Web Worker with `--backend=Manifold`; STL/3MF export in `src/lib/stl.ts` / `src/lib/threeMF.ts`; the `part` enum with first option `all` marks a multi-part design.

The *understanding*, by contrast, is concentrated in one frozen string and a near-empty app-side layer:

| Where understanding lives | What it is | Verified |
|---|---|---|
| `server/prompt.mjs` (204 lines, ~7K tokens) | Output contract + printability rulebook + the entire reading METHOD + a fixed menu of named exemplars | Confirmed |
| Named exemplars in the prompt | chess king (line 139), LEGO hard dims 4.8/1.8/8.0/3.2/9.6 + stud/anti-stud (109-110), fidget spinner deconfliction (161-162), horse/fish silhouette (130), turret crenellation signature (140), 5.8mm Technic axle datum (164) | All six line ranges confirmed |
| `detectKitIntent` (`store.ts:217`) | One English regex → a single boolean | Confirmed |
| `GenerateContext` (`api.ts:213-216`) | Carries only `{bed, kit}` | Confirmed |
| `estImageTokens` (`api.ts:87`) | Flat `1500` regardless of pixel count | Confirmed — `export const estImageTokens = (): number => 1500` |
| `structuralReport` (`compileReport.ts`) | The ONLY live mechanical validator: male/female zero-clearance regex + a part-enum count check | Confirmed |
| `bench/` (interference probe, `judge.mjs` vision judge, fidelity scorers) | Rich verification — but runs ONLY in bench, never in the user loop | Confirmed |

The single richest seam already proves the whole pattern: `contextText` (`providers.mjs:374-398`) conditionally appends bed context and — on the kit boolean only — a prose instruction plus `KIT_EXEMPLAR`, and **already drops the exemplar on `local:` engines** because the ~1K-token few-shot would push their `num_ctx` past the window. That one conditional is the skills router in embryo. The refine loop (`MAX_AUTO_REFINE=2`, `store.ts:248`; `captureViews`, `ChatPanel.tsx:69`) re-feeds the same reference + render to the **same model** — it self-grades.

---

## Target Architecture

A 5-stage pipeline where **every stage is generic** and the only per-request variation is *which retrieved fragment is appended*. This is a widening of the existing `contextText` seam, not a rewrite.

**(1) INPUT.** Text + images enter unchanged through `sendPrompt → streamGenerate → POST /api/generate`. Keep the `res.on('close')` AbortController wiring intact. Client-side image PREPROCESSING is added before attach (see Vision Understanding).

**(2) UNDERSTAND (the missing layer).** Produce a small INSPECTABLE design-intent object:

```
{ form: single|kit|assembly, archetype, facetVerdict: faceted|machined|functional,
  signatureFeatures[], governingRatios[], statedDimensions[],  // OCR'd from drawings
  domainTags[],   // gear|spring|hinge|snapfit|wheel-axle|surface-pattern
  sourceType,     // drawing|photo|render|sketch|ortho-sheet|multi-object
  ambiguityScore, assumptionRisk }
```

This REPLACES the single `detectKitIntent` boolean. Default path is an inline preamble block in the SAME generation (cheapest — `extractScadBlock` already splits prose from code, so add a fenced plan-block parse). A dedicated `/api/describe` vision pre-pass is the *exception*, reserved for a measured-need subset (see Cost caveat). `domainTags` drive retrieval; `statedDimensions` seed Customizer ranges (with validation — see Risks); ambiguity surfaces as visible PLAN assumptions. **The object is ADVISORY context, never a competing output block.**

**(3) CLARIFY (gated, at most one batched round).** Default stays autonomous-with-assumptions (`prompt.mjs:12`). Only when `ambiguityScore` HIGH and `assumptionRisk` HIGH, ask ALL questions in one message, then proceed deterministically. Never multi-round.

**(4) DESIGN + RETRIEVE.** The understanding object routes `selectSkills()` → ranked skill ids. `assembleSystemPrompt(base, selectedSkills, engine, tokenBudget)` = ABSTRACT SPINE (cached) + each selected skill's prose rules + its compile-verified exemplar, greedily until the per-engine token cap (the same budget pressure that already drops `KIT_EXEMPLAR` on local). Stable spine stays under `cache_control: ephemeral`; volatile skill block appends after it; Kimi gets a plain-string variant (no `cache_control`/`thinking`). **Composition is explicit:** when multiple skills fire, the assembler emits a parameter-namespace merge directive and an assembled-dispatch directive (see Skills System).

**(5) GEOMETRY.** Unchanged openscad-wasm pipeline: `extractScadBlock → parseParameters → -D` defines in the single-shot Web Worker with `--backend=Manifold`. The output contract (prose + exactly ONE ```scad block, Customizer header) is PRESERVED.

**(6) VERIFY (closed loop, promoted from bench).** Per-skill geometric validators (extending `structuralReport`) + the interference `_debug` probe + a SERIALIZER guard on the exported STL + the genuinely-independent programmatic proxy as PRIMARY gate + an advisory VLM critic feed the bounded `MAX_AUTO_REFINE=2` loop, now driven by real signals. Failures feed `buildManualFixPrompt`-style structured discrepancy lists; validators WARN/refine, never hard-block (mirroring `structuralReport`). The selected-skills and intent object ride back on the SSE `done` event for an inspectable "applied design patterns" chip.

---

## Generalization Plan

The overfitting lives ENTIRELY in the prose of one frozen string; the pipeline is already abstract. Factor named exemplars OUT of `server/prompt.mjs` into the swappable skill library, leaving only abstract method.

**KILL (move to retrieved fragments, not delete):** chess-king archetype (139-140), LEGO hard dims + stud/anti-stud modules (109-110), fidget-spinner deconfliction (161-162), horse/fish silhouette (130), turret-crenellation signature (140), 5.8mm Technic axle datum (164). Each becomes a domain fragment selected by `domainTags` — so a chess request retrieves the chess exemplar and a plain bracket retrieves NONE of it, which the prompt's own SCOPE GATE (179) already wants but cannot enforce because everything is always-on.

**KEEP in the abstract spine (~2-3K tokens, identical across all four engines, must fit local `num_ctx`):**
1. **The RESPONSE CONTRACT** — prose + exactly one ```scad block, Customizer header.
2. **Universal PRINTABILITY invariants** — manifold, flat on z=0, mm, ≥1.2mm walls, no global `$fn`, no `import`/`text()`/`surface`/libraries, avoid `minkowski` for Manifold-backend friendliness, bed-fit/part-split convention, mandatory safety caveats.
3. **The METHOD as PRINCIPLES with NO named objects** — name the archetype and its signature feature; classify the surface faceted-vs-machined-vs-functional from visual evidence; read every label; reproduce intentional asymmetry; deconflict cutters from functional features into separate corridors; *female = male + one shared clearance parameter*.

This attacks the prior-collapse risk the prompt itself names — and which the uncommitted diff re-introduces with MORE chess. Generality is driven by the model's reading of the SPECIFIC reference, with exemplars as swappable data. It also relieves context-budget pressure: the spine SHRINKS, so local engines get spine + 1-2 fitting fragments instead of dropping a 1K exemplar wholesale.

**Honest framing of what this is and isn't.** This is "data, not prose" — a real and valuable refactor. It is **NOT** open-ended mechanism understanding. There is no general mechanism-DISCOVERY method: a sixth mechanism (a Geneva drive, a worm gear, a compliant flexure) is a new hand-authored directory entry, exactly like the named exemplars it replaces, just relocated from prompt prose to registry data. A retrieved gear exemplar is still a gear-specific few-shot the model pattern-matches — the EXEMPLAR-POISON risk concedes this. The SKELETON generalizes honestly; the BRAIN remains a finite, hand-curated menu wearing a registry costume. That is the right product bet — but the strategy says so plainly rather than implying open-ended generality.

**Gating.** Gate the whole refactor with multi-sample `npm run bench` → `npm run bench:gate` (see Risks: the gate is only trustworthy once `BENCH_SAMPLES` median aggregation is standard). Update `docs/SPEC.md`, since image/refine/multi-part behaviors change. `detectKitIntent`'s English-only regexes are replaced by model-emitted `domainTags` — *language-agnostic only if the model reliably emits them for non-English prompts, which is unmeasured and must be checked.*

---

## Vision Understanding

Today images are pure pass-through with ONE piece of machinery (the 3-pose refine capture, output-side only) and ZERO input-side perception. The busy-sheet degradation the team observed is a documented VLM failure (resolution curse + cross-object attribute binding + no per-view isolation), not a model-quality issue. Plan, in dependency order:

**1. CLIENT-SIDE PREPROCESSING (no deps, no engine gating).** FIRST fix `estImageTokens()` (`api.ts:87`) to scale with pixel count — the flat `1500` both silently down-samples high-res drawings below label legibility AND will mislead the history budget once tiling multiplies image count. Then extend `canvasToChatImage` (`src/lib/capture.ts`) into a tiler invoked at attach time in `ChatPanel.tsx`/`EmptyState.tsx` `onFiles`: cap long-edge; for a busy/multi-object/ortho sheet emit a global thumbnail + a grid of higher-res tiles (AnyRes); optional contrast/auto-level for faint sketches. Tag each `ChatImage` with a role (`'global'|'tile'|'view'`).

> **Image-budget caveat (must be paired with the estImageTokens fix).** Tiling MULTIPLIES image count against the 12-message / token-window history cap (`toApiMessages`) and the **claude-code CAP=4 images**. A busy sheet that becomes global + 9 tiles blows the image budget on exactly the engines that most need the detail. The tiler MUST carry an explicit per-engine image-count budget: cap tile count to fit claude-code's 4-image limit (e.g. global + 3 worst regions), degrade tile resolution before dropping tiles, and decide tile-vs-history eviction order explicitly.

**2. STRUCTURED DESCRIBE-THEN-BUILD (Img2CAD factorization).** A vision read returns the inspectable intent object (`sourceType`, `archetype`, `facetVerdict`, `regions[{name,shape,count}]`, `proportions`, `dimensions[{value,unit,feature}]`, `asymmetryFlags`, `viewType`, `ambiguities`, `confidence`). **Default to the inline-preamble path** (one call, cheapest); reserve a dedicated pre-pass for a measured-need subset. ENGINE-GATE: degrade to today's single-pass on `local` (tiny `num_ctx`) and `claude-code` (single-turn, history flattened, CAP=4 images). This decouples understanding from coding, makes the read cacheable/loggable/gateable, and seeds Customizer ranges from OCR'd dimensions.

**3. SOURCE-TYPE ROUTING.** `sourceType` selects preprocessing AND a prompt fragment: drawing → OCR-dimensions + orthographic reconciliation; ortho/multi-view sheet → per-view tiles + "reconcile these projections into one solid" (reusing the iso/front/top vocabulary the refine capture already speaks); multi-object sheet → per-object crops; photo → scale-from-context.

**4. SURFACE ASSUMPTIONS, DON'T ASK.** Render `{ambiguities, chosenVariant, assumedScale}` as visible PLAN lines ("Assumed 100mm palm — adjust the scale slider"; "Built 4 arms of 2 plausible") so silent guesses become correctable, parameter-backed assumptions without adding a turn.

**5. CHANGE THE LOOP SIGNAL (ordering corrected).** The refine loop must stop self-grading. **The genuinely-independent signal is the programmatic silhouette/bbox/IoU proxy already written in `bench/compare.mjs` — make it the PRIMARY refine gate** (zero API cost, truly model-independent). The VLM critic is the SAME model weights with a different system prompt — only weakly independent — so demote it to an advisory tie-breaker, escalated to only when the programmatic proxy is ambiguous. Wire the bench vision-judge (`judgeVision`) to consume the pre-pass region/feature list as ground-truth rubric, and add a clean-crop-vs-busy-sheet bench lane so perception quality becomes a ratcheted metric.

> **Honest ceiling:** better perception cannot exceed what plain-OpenSCAD primitives can BUILD — `rotate_extrude`/`polygon` hand-authoring stays the ~60-70% organic ceiling. A critic makes that ceiling MEASURABLE, not higher.

---

## Skills System

There is exactly ONE clean seam and it is already a working prototype: `contextText()` (`providers.mjs:374-398`) conditionally appends bed + (on the kit boolean) a prose instruction + `KIT_EXEMPLAR`, and ALREADY drops the exemplar on local engines. Every needed piece exists in isolation:

- **Exemplar SHAPE proven** — `KIT_EXEMPLAR` (`server/exemplars.mjs`): a complete compile-verified deconflicted parametric program carrying the `_debug = "off"; // [off, positives, negatives]` probe contract, including the assembled `part=="all"` dispatch.
- **Validator SHAPE proven** — `bench/interference.selftest.mjs`: a static zero-API ratchet recompiling protected structure vs cutters, asserting overlap≈0, with a deliberately-broken `skip_r=0` control.
- **Runtime validator HOOK proven but thin** — `structuralReport`.
- **Context CARRIER proven** — `GenerateContext {bed, kit}`.

**DESIGN — SKILL AS DATA.** Create `server/skills/` as a registry of ESM modules, one per mechanism:

```
{ id, title, version, intent:{keywords, regexes, archetypes}, tokens,
  rules: string,                 // terse design rules
  exemplar?: string,             // compile-verified inline module in the exact contract style, carrying the _debug probe
  validators: [(code, params) => issues],
  paramAliases: { wall, clearance, fit, ... },   // for namespace merge (see COMPOSITION)
  compatibleEngines }
```

`KIT_EXEMPLAR` becomes registry entry `kit-baseplate`. `server/exemplars.mjs`'s single export generalizes to a keyed map. Adopt the `SKILL.md` frontmatter convention so the registry is self-describing and the existing `.claude/skills` authoring muscle transfers.

**ROUTER.** Generalize `detectKitIntent` into `selectSkills(text, images, intentObject)` → ranked skill ids. Phase A (ship first, deterministic, zero added latency): per-skill keyword/regex/`domainTag` matching, additive (a prompt can light gear AND axle AND snap-fit). Phase B (optional): embedding-NN for phrasing the regexes miss. Keep selection INSPECTABLE — return on the SSE `done` event / store on the `ChatMessage`.

> **Honest caveat (major):** `selectSkills` Phase A is `detectKitIntent` MULTIPLIED by N — the same brittle, calibration-heavy, monolingual-leaning mechanism it criticizes, now with N× the over-trigger surface. **Treat over-selection as a first-class metric:** a bench lane MUST assert a plain "bracket"/"knob" request selects ZERO mechanism skills (the negative case), and assert the kit/spinner calibration `detectKitIntent` already encodes (it deliberately ignores bare "lego/modular/part" to avoid over-splitting) is preserved. Measure `domainTag` emission on at least one non-English prompt before claiming language-agnosticism.

**ASSEMBLY + COMPOSITION (the previously-unspecified gap).** `assembleSystemPrompt(base, selectedSkills, engine, budget)`: base spine + each skill's rules (cheap, first) + exemplars greedily until a per-engine cap (local: rules-only or 1 exemplar; cloud: several). This is the ONLY way the pillar coexists with one-prompt-per-engine + tiny `num_ctx`. Preserve the `cache_control` split; plain-string variant for Kimi.

When **two or more skills fire**, the output is still ONE program with ONE Customizer block parsed by `params.ts`. The assembler MUST therefore:

1. **Merge parameter namespaces.** Two exemplars can both define `wall`, `clearance`, `fit`. Use each skill's `paramAliases` to collapse shared concepts to one parameter and reconcile conflicting `[min:step:max]` ranges; emit an explicit directive telling the model to *merge, not duplicate*, its parameter block.
2. **Auto-generate a correct assembled `part=="all"` dispatch** — the hardest part of `KIT_EXEMPLAR`. Composing gear + axle + snap implies joints (axle/bore, snap engagement, gear-pair center distance) that must mate in the `all` view. Without an explicit composition directive + a bench check on the assembled view, composed kits produce a scattered or mis-mated `all` view — the exact failure `structuralReport`/asymmetry/assembled scoring already worries about. The composed-kit assembled view is itself a bench-gated acceptance criterion, not an assumption.

**PORTABILITY CEILING (hard).** Tool-use is NOT available across engines (claude-code single-turn/all-tools-disabled, local tiny-ctx, Kimi no thinking/cache_control). Skills CANNOT be live tools; the ONLY portable injection point is the system prompt — exactly what `contextText` already exploits. This is verbatim Anthropic progressive disclosure (name/description always-on = discovery = `domainTags`; rules on activation; exemplar/validator on execution). BOSL2/MCAD encode the correct math but CANNOT be imported (no libraries, no fonts) — each exemplar inlines plain built-ins, exactly as `KIT_EXEMPLAR` does.

**R&D LOOP (additive, test-covered).** Author skill (rules + exemplar + validator + paramAliases) → add a bench task + gold → multi-sample `npm run bench` / `bench:gate` proves it lifts the target and regresses nothing → commit skill + baseline bump. New mechanism = new directory entry, NEVER a `SYSTEM_PROMPT` edit. **POISON RISK** is why the CI gate is non-optional: a few-shot is copied structurally, so a subtly-wrong exemplar degrades every generation that selects it — generalize `interference.selftest.mjs` into a zero-API walker over every registry exemplar (compile + buildability + interference + the per-skill validator + a composition probe over common skill pairs), which can be a HARD gate because it is deterministic.

**Registry maintenance (named, not hidden).** "New mechanism = new directory entry + bench task + gold + baseline bump" is a per-skill maintenance tax: exemplar drift as OpenSCAD/Manifold versions change, gold re-baselining on the non-deterministic API. At 5 mechanisms it is fine. The registry MUST carry a `version` + a deprecation path: a skill whose exemplar stops compiling on a kernel bump is auto-disabled by the zero-API walker (it fails compile in CI) and quarantined rather than silently shipping broken — otherwise the registry rots exactly like the monolith, just across more files.

---

## Mechanical R&D

The R&D pillar (springs/wheels/gears/hinges/snap-fits) is today PROSE-ONLY plus the single LEGO exemplar — a working coil spring or meshing gear set is NOT reliably reachable. Each first skill = (a) inline compile-verified exemplar like `KIT_EXEMPLAR`, (b) per-skill validator added to `structuralReport`'s home, (c) bench task + gold + interference/fidelity gate. ORDER by correctness-difficulty vs render budget:

**1. WHEELS + AXLES — essentially DONE.** Inside `KIT_EXEMPLAR`: axle + bore with one shared `spin_fit` clearance. Extract as its own skill (`wheel-axle`) so it composes outside a LEGO kit. Validator: `bore = axle_d + clearance (>0)`. EASY, ship first as the template.

**2. SNAP-FIT CANTILEVER — prismatic, boolean-only, fast, Manifold sweet spot.** Exemplar: cantilever beam + hook + matching catch with one shared engagement/clearance parameter. Validator: hook overhang ≤ beam length, deflection clearance >0, beam root thickness printable. LOW risk.

**3. LIVING HINGE — thin-web array via `linear_extrude`.** Web thickness in the ~0.3-0.6mm printable band (one-to-two extrusion widths — correct ballpark), bend axis ⟂ layer lines (correct rule). Validator: web thickness in band, web count ≥1. MEDIUM — genuinely marginal on FDM; document as an honest relief-floor approximation.

**4. SPUR GEAR — the headline mechanism the stack CANNOT reach by accident.** A correct involute tooth is a function-generated `polygon()` (base/pitch/addendum circles, 20° pressure angle) the model is never told to write — confirmed by the existence of BOSL2's `gears.scad`. Exemplar: a parametric spur gear + a MESHING two-gear assembly. **BLOCKER FIX (incorporated): the validator must check BACKLASH, not just geometry.** Center distance `= m·(z1+z2)/2` and 14.5/20° pressure angle are necessary but NOT sufficient — a mathematically-meshing pair at ZERO backlash BINDS on FDM. Add a shared backlash/tooth-thickness-reduction parameter (~0.1-0.4mm depending on module) and assert it is `>0`, exactly like `spin_fit` in `KIT_EXEMPLAR` — the same female=male+clearance principle the plan praises elsewhere, finally applied to gears. Validator: shared module across the pair, pressure angle 14.5/20°, center-distance sanity, **backlash >0**, hub bore clearance. Note also that a clean involute needs enough points per tooth that a 20-40 tooth gear is a non-trivial point count. MEDIUM-HIGH — converts "looks toothed, won't mesh OR binds" into "meshes and rotates."

**5. COIL SPRING — HARDEST of tier-1; MEASURE before promising.** `rotate_extrude` CANNOT make a helix (it sweeps a 2D profile around Z with zero pitch). The only library-free route is high-`$fn` `linear_extrude(twist)` of a cross-section, which (a) SHEARS each layer about Z — a round wire becomes an elliptical/skewed section, geometrically wrong for a coil (the "banana artifact") — and (b) is the heaviest construct this stack runs.

> **BLOCKER FIX (incorporated): measure END-TO-END, not the render watchdog alone.** A resolved coil needs high `$fn` on the profile × many twist segments — a *multiplicative* triangle explosion. On Manifold the WASM render can still be fast, but the resulting mesh can stall the downstream STL serialize AND the react-three-fiber mesh upload (`Viewport.tsx` disposes/rebuilds geometry per recompile) — a budget the original plan never watched. Phase 0 measures render + STL parse + r3f mesh build + an interactive re-render under a parameter nudge, at each quality preset. The go/no-go gate is **total-to-interactive latency**, not the 60s/90s render watchdog alone. Validator: coil pitch > wire dia + layer gap (coils won't fuse), free length / solid height sanity, avoid `minkowski`. Verdict per measurement: ships, ships as a coarse printable approximation, or deferred. Small controller-style springs may only be a relief-floor mock-up.

**PROMOTE cheap+stable validators** (gear meshing+backlash, spring pitch, hinge web, snap clearance) from bench-only INTO `structuralReport`/`buildManualFixPrompt` so mechanical errors are caught in the LIVE refine loop — today the only live check is the male/female regex; the interference probe lives only in bench. Each retrieved skill OWNS its validator. Do NOT relax the no-import rule wholesale — vendor curated minified inline math (involute generator, thread profile) spliced into the program, honoring the single-self-contained-block contract.

*This section is the synthesis-level view. The full per-component design rules, the shared FDM tolerance contract, the two hard gates (gear backlash + coil render budget), per-skill validators, and the **18-skill registry table** are in "Mechanical R&D — Detailed Design Knowledge & Skill Registry" below.*

---

## Capability Limits

Structural ceilings no architecture fixes:

- **Organic / figurative subjects: ~60-70%.** `rotate_extrude`/`polygon` hand-authoring is a structural ceiling. Mesh tools (Meshy ~97% slicer pass) own this lane. Effort spent here is miscast.
- **True mating machine threads: out of reach.** A high-`$fn` helical thread is the same multiplicative-triangle / banana-shear problem as the spring, worse at engagement tolerances. Best-effort, never guaranteed.
- **Compound double-curvature / real loft-sweep-fillet: out of reach** on the OpenSCAD kernel.
- **Kinematic simulation: out of scope** — the app verifies static printability and clearance, not motion.
- **Portability caps active skill knowledge.** Tool-use is unavailable across engines, so skills are system-prompt injection only — budget-aware assembly is mandatory, and the per-request knowledge ceiling is the smallest engine's window (local `num_ctx`).
- **The understanding pre-pass and tiling are cloud-only** and degrade to today's single-pass on local/claude-code — the busy-sheet improvement won't reach those users.

These are kernel boundaries, not roadmap items. They are named here so the roadmap stops over-promising.

---

## Landscape & Differentiation

| Competitor | Strength | Where Vibemesh wins |
|---|---|---|
| Meshy | ~97% slicer-pass organic meshes | Loses on functional/parametric/connectable; Vibemesh owns mechanisms |
| Zoo / Text-to-CAD | B-rep, STEP, real fillets | Heavyweight, not browser-only, not live-slider; no closed mechanism moat |
| AdamCAD / similar | Parametric generation | None close the *verified-working-mechanism* loop |

**The moat:** parametric OpenSCAD owns functional/mechanical/connectable parts, and **no competitor has closed the verified-working-mechanism loop** — they generate, they do not GUARANTEE clearance, deconfliction, or meshing. Promoting the bench-only verification (interference probe, programmatic IoU, per-skill validators) into the live loop is the differentiator: the app can GUARANTEE buildability the competitors only hope for. The honest counterweight: that guarantee is scoped to the functional lane, and the "mechanism understanding" is a curated menu, not open-ended.

---

## Phased Roadmap

### Phase 0 — De-risk & measure (no behavior change)
**Goal:** Bound the roadmap by measurement, not optimism; make the bench gate actually trustworthy.
- **Make `BENCH_SAMPLES` median aggregation the STANDARD run mode (precondition for everything else).** Per the project's own CLAUDE.md, live-API quality scores stay WIDE-tolerance until this lands — so without it the prompt-split "zero regression" claim is *unfalsifiable* on the non-deterministic engines. This was buried as a risk-section assumption; it is promoted to a hard Phase-0 gate.
- Add bench tasks for a coil spring (stated free length / wire-dia / pitch), a meshing gear PAIR, and a living hinge, with FUNCTIONAL `expect` checks — including a **printed-gear-pair go/no-go** (backlash > 0, rotates) not just render time.
- **Measure the high-`$fn` `linear_extrude(twist)` helix END-TO-END** (render + STL serialize + r3f mesh build + interactive re-render) at Draft/Standard/Fine/Ultra against total-to-interactive latency — the spring go/no-go gate, and a true `rotate_extrude`-cannot-helix confirmation.
- Fix `estImageTokens()` (`api.ts:87`) to scale with pixel count (precondition for any tiling and any honest history budget).
- Author the abstract-spine vs retrieved-layer SPLIT of `server/prompt.mjs` on a branch and **multi-sample `bench:gate`** it to confirm zero regression before anything ships.
- Decide maker-vs-engineer strategic target (bounds whether STEP/B-rep is ever in scope).

*Dependencies:* none — pure measurement + a gated spike. Unblocks every later phase.

### Phase 1 — Modular prompt assembly + skills registry skeleton
**Goal:** Turn the one frozen seam into a budget-aware fragment assembler with a registry of exactly one (existing) skill, killing named-exemplar hardcoding.
- Refactor `contextText()` into `assembleSystemPrompt(base, selectedSkills, engine, budget)` with per-engine token caps; preserve the `cache_control` split + Kimi plain-string variant.
- Strip chess/LEGO-dims/spinner/horse/turret/axle-datum out of `server/prompt.mjs` into `server/skills/` fragments; `KIT_EXEMPLAR` becomes registry entry `kit-baseplate`; `server/exemplars.mjs` becomes a keyed map.
- Generalize `detectKitIntent` → `selectSkills()` returning ranked ids; widen `GenerateContext {bed,kit}` → `{bed, skillIds[]}`; return selection on the SSE `done` event.
- **Add the over-selection bench lane** (plain "bracket"/"knob" → ZERO mechanism skills; kit/spinner calibration preserved) and a non-English `domainTag`-emission check.
- Generalize `bench/interference.selftest.mjs` into a zero-API walker over every registry exemplar; wire into `bench:gate` as a hard gate.

*Dependencies:* Phase 0 (gated spine refactor proven safe under multi-sample). Hard-blocks Phases 2-3.

### Phase 2 — Mechanism skills R&D (the product moat)
**Goal:** Ship the first composable mechanisms as compile-verified exemplars + per-skill validators, in correctness-difficulty order.
- Extract `wheel-axle` as a standalone skill (template); author `snap-fit-cantilever` (low risk, prismatic).
- Author `living-hinge` (web-thickness rule, documented relief-floor) and `spur-gear` (involute polygon, meshing pair, **backlash validator**) with bench gold.
- Author `coil-spring` ONLY per the Phase-0 end-to-end verdict — ship, ship-as-approximation, or defer.
- **Specify and bench-gate COMPOSITION:** parameter-namespace merge (`paramAliases`) + auto-generated assembled `part=="all"` dispatch, with a composition probe over common skill pairs (gear+axle, axle+snap) in the zero-API walker.
- Promote cheap+stable per-skill validators (gear meshing+backlash, spring pitch, hinge web, snap clearance) into `structuralReport`/`buildManualFixPrompt` for the LIVE loop.

*Dependencies:* Phase 1. Each skill independently gated; ships incrementally.

### Phase 3 — App-side understanding + verification-in-loop
**Goal:** Add the inspectable design-intent layer and close the verification loop.
- Emit a parseable design-intent preamble (extend `extractScadBlock` to split a plan block) → drives `selectSkills`, surfaces assumptions in the PLAN; **inline-preamble is the DEFAULT**, dedicated `/api/describe` reserved for a measured-need subset (cost caveat below).
- Promote the interference `_debug` probe into the live loop for parts carrying the contract (2 extra renders, gated to `hasDebugContract`).
- Add a SERIALIZER regression guard on the exported STL before download — loud per multi-part spec — scoped honestly as protecting `stl.ts` bbox/transform-baking and the per-object 3MF path, NOT as a modeling guarantee (Manifold already guarantees manifold output for valid input).
- **Make the programmatic silhouette/IoU/bbox proxy (`bench/compare.mjs`) the PRIMARY refine gate; demote the VLM critic to an advisory tie-breaker** escalated only when the proxy is ambiguous.
- **Versioning/rollback wiring:** the intent object + selected-skills metadata MUST be versioned WITH the code on each `ChatMessage` (alongside the existing per-message restorable versions and `vpPast`/`vpFuture` history). On rollback to a pre-skills version, the "applied patterns" chip reflects THAT version's metadata (or shows none) — never stale metadata from a later generation.
- **selectSkills failure path:** if the chip is wrong, correcting it triggers an explicit re-generation with the corrected `skillIds[]` — define this trigger; do not leave a confidently-wrong chip with no recourse.

*Dependencies:* Phase 1 (intent object feeds the router). Verification promotions reuse Phase 2 validators.

### Phase 4 — Professional reference perception
**Goal:** Robust on busy/multi-view spec sheets — the documented degradation case.
- Client-side image tiler (`canvasToChatImage` extension): global thumbnail + tile grid, role-tagged `ChatImage`, **with an explicit per-engine image-count budget** (claude-code CAP=4: global + 3 worst regions; degrade resolution before dropping tiles; defined tile-vs-history eviction order).
- Source-type classifier routing preprocessing + prompt fragment (drawing→OCR+ortho, sheet→per-view tiles, photo→scale-from-context).
- Orthographic multi-view reconciliation reusing the iso/front/top capture vocabulary.
- Wire `bench/judge.mjs` to the pre-pass feature list as ground truth; add a clean-vs-busy bench lane as a ratcheted metric.
- **Clamp/validate OCR'd dimensions** before they seed Customizer ranges (security/robustness — see Risks).

*Dependencies:* Phase 3 (intent object provides `sourceType`/`regions`). `estImageTokens` fix from Phase 0.

### Phase 5 — Deferred tier-3 ceiling (scope, do not build)
**Goal:** Name the kernel boundary honestly so the roadmap stops over-promising.
- Document in `docs/SPEC.md` that organic compound double-curvature, true mating machine threads, and kinematic simulation require a different kernel (CadQuery/build123d on OpenCascade — BREP, real loft/sweep/fillet, STEP) running server-side, breaking the browser-only + 100-500ms live-slider architecture.
- Frame it as a separate feature-flagged engine alongside `streamChat` dispatch, NEVER a retrofit of the openscad-wasm path.
- Product line: market mechanical/functional/connectable kits; caveat organic + precision-threaded as best-effort relief-floor.

*Dependencies:* independent / informational. Bounds expectations; not a build commitment.

---

## What to Stop Doing

1. **STOP teaching generality with named exemplars in the system prompt.** Chess king (139-140), LEGO hard dims (109-110), fidget spinner (161-162), horse/fish (130), turret (140), axle datum (164) move to retrieved fragments. **Do NOT merge the uncommitted `server/prompt.mjs` diff that RE-ADDS chess as the canonical example** (verified at line 139) — it deepens the prior-collapse risk the prompt itself names.
2. **STOP growing the single ~7K-token `SYSTEM_PROMPT` to add knowledge.** It is already near the local `num_ctx` limit (forcing `KIT_EXEMPLAR` to be dropped there). Every edit pays for ALL requests on ALL engines. New knowledge goes in registry fragments.
3. **STOP relying on `detectKitIntent`'s English-only regexes** (`store.ts:217-229`) as the sole structured signal. Replace with model-emitted `domainTags` — and *measure* their non-English reliability rather than assuming it.
4. **STOP self-grading the refine loop.** The same model critiquing its own render (`MAX_AUTO_REFINE=2`, no independent signal) is not verification. Lead with the programmatic IoU/bbox proxy; the VLM critic is advisory.
5. **STOP keeping verification quarantined in `bench/`.** The interference probe, vision judge, and fidelity scorers exist and are proven but never run in the user loop — so "real working printable mechanisms" is currently an unbacked claim. Promote the cheap+stable ones.
6. **STOP chasing the organic/figurative lane on the OpenSCAD path.** `rotate_extrude`/`polygon` is a structural ~60-70% ceiling; mesh tools own it. Double down on the functional/parametric/connectable moat.
7. **STOP treating attached images as one full-frame pass-through regardless of content.** A clean photo and a busy multi-object spec sheet get identical handling today; the busy sheet needs tiling/per-view isolation.
8. **STOP leaning on `bench:gate` harder than it can bear.** Until `BENCH_SAMPLES` median aggregation is the standard run mode, the live-API quality scores are too loose to catch a quality regression — the prompt-split and every mechanism's *quality* (vs compile/interference) need multi-sample before/after.

---

## Risks

- **PORTABILITY is the binding ceiling.** Tool-use is unavailable across engines (claude-code single-turn/all-tools-disabled/history-flattened/`ANTHROPIC_API_KEY`-stripped, local tiny-ctx, Kimi no thinking/cache_control), so skills can ONLY be system-prompt injection — capping active skill knowledge per request and forcing budget-aware assembly.
- **The "general mechanism" claim is overstated if left unqualified.** Five hand-curated mechanisms relocated to a registry is "data not prose," not open-ended understanding; a sixth is a new hand-authored entry. Market and plan accordingly.
- **`selectSkills` is `detectKitIntent` × N.** Over-eager selection bloats the prompt and triggers the very prior-collapse being fought. The negative-case bench lane (plain part → zero skills) is mandatory, not optional.
- **EXEMPLAR POISON.** A few-shot is copied structurally, so a subtly-wrong gear/spring exemplar degrades every generation that selects it — the zero-API CI walker is non-optional, and must include a composition probe and a per-skill-version compile check.
- **The bench gate is too loose on quality until multi-sample is standard** — promoted to a Phase-0 precondition; otherwise "zero regression" is unfalsifiable.
- **RENDER + MESH BUDGET (corrected).** A high-`$fn` helix is the heaviest construct the stack runs and its multiplicative triangle count can stall STL serialize + r3f mesh upload even when WASM render is fast — Phase 0 measures end-to-end, not the render watchdog alone. The interference probe adds 2 fresh-instance renders per structured part. `minkowski()` falls back to slow CGAL/Nef — spring/gear exemplars must avoid it.
- **GEAR BACKLASH** is the clearance that determines whether a printed pair rotates; center distance + pressure angle alone produce a binding pair. Validator must assert backlash > 0.
- **COMPOSITION** of two skills needs a merged parameter block AND an auto-generated assembled `all` view (the hardest part of `KIT_EXEMPLAR`); additive selection is not enough.
- **The describe pre-pass costs round-trips.** A dedicated `/api/describe` doubles API calls and latency per image request; default to the cheaper inline-preamble path, reserve the pre-pass for a measured-need subset, and quantify the cost multiplier before defaulting to it.
- **A wrong-but-confident intent object could ENTRENCH an error** a single-pass might self-correct — keep the object ADVISORY, validators WARN/refine (never hard-block), mirroring `structuralReport`.
- **Versioning interaction:** intent/skill metadata must version with the code, or rollback shows stale "applied patterns" chips — a real UX bug.
- **OCR'd dimensions seeding Customizer ranges** flow into `parseParameters → -D` defines unvalidated; a mis-read or adversarial value could produce a degenerate/pathologically-large model that blows the render budget. Clamp/validate before seeding.
- **The STL "manifold guarantee" is really a serializer guard** — Manifold output is manifold by construction for valid input; the check almost only catches `stl.ts` bbox/transform bugs. Frame it that way; keep it loud per the multi-part spec.
- **REGISTRY MAINTENANCE** is a per-skill tax (exemplar drift on kernel bumps, gold re-baselining on a non-deterministic API). Name the ceiling and a deprecation path (auto-disable on compile failure in the zero-API walker), or the registry rots like the monolith.
- **STRUCTURAL CEILINGS no architecture fixes:** organic ~60-70%, no true B-rep/STEP without a second kernel that breaks browser-only + live-slider, no real mating machine threads, no kinematics.
- **BUSINESS:** the Claude · login engine is personal-use-only per the Agent SDK terms — a distributed professional build must ship on API keys, changing the cost model.

---

## Next Steps

1. **Make `BENCH_SAMPLES` median aggregation the standard run mode** (Phase-0 precondition), then add coil-spring + meshing-gear-pair + living-hinge bench tasks and **measure the high-`$fn` helix END-TO-END** (render + STL + r3f mesh + interactive nudge) at all four quality presets — the spring go/no-go and the gear printed-pair (backlash) go/no-go.
2. **Do NOT merge the uncommitted `server/prompt.mjs` chess-re-adding diff;** branch and spike the abstract-spine vs retrieved-fragment SPLIT, then **multi-sample** `bench:gate` to prove zero regression before touching the contract.
3. **Fix `estImageTokens()`** (`api.ts:87`) to scale with pixel count — the precondition for tiling and an honest history budget — and define the per-engine image-count budget alongside it.
4. **Generalize `server/exemplars.mjs`** into a keyed registry with `kit-baseplate` as entry #1; extract `wheel-axle` + author `snap-fit-cantilever` as the first new skills.
5. **Refactor `contextText()`** (`providers.mjs:374-398`) into `assembleSystemPrompt(base, selectedSkills, engine, budget)` preserving the `cache_control` split and Kimi plain-string path; widen `GenerateContext {bed,kit}` → `{bed, skillIds[]}`; return the selection on the SSE `done` event for an inspectable, correctable UI chip.
6. **Generalize `bench/interference.selftest.mjs`** into a zero-API walker over every registry exemplar (compile + buildability + interference + per-skill validator + composition probe) and add it to `bench:gate` as a hard deterministic gate — plus the over-selection negative-case lane.
7. **Author the `spur-gear` skill with the backlash validator** (shared backlash parameter asserted > 0, alongside center-distance/pressure-angle/hub-bore) — the gear blocker fix.
8. **Specify COMPOSITION:** parameter-namespace merge via `paramAliases` + an auto-generated assembled `part=="all"` directive, bench-gated on common skill pairs.
9. **Update `docs/SPEC.md`** to record the abstract-prompt + skills-registry + verification-in-loop contract changes, the intent/skill metadata versioning rule, the STL-check-as-serializer-guard scoping, and the deferred tier-3 kernel ceiling (organic compound surfaces, mating machine threads, kinematics).

---

## Mechanical R&D — Detailed Design Knowledge & Skill Registry

*Deep-dive companion to the Mechanical R&D section above: per-component printable design rules, the shared FDM tolerance contract, the two hard gates (gear backlash + coil render budget), and the 18-skill registry seed. Every entry is a candidate skill = design rules + a compile-verified parametric exemplar + a programmatic validator.*

## 0. Shared foundation — FDM tolerances & fits (every skill depends on this)

FDM accuracy ≈ **±0.15–0.20 mm XY, ±0.10–0.20 mm Z**. Holes print **undersize**, pegs print **oversize** (over-extrusion + elephant's foot), so clearance must be *designed in*.

**Governing principle (already half-enforced by `structuralReport`):** `female = male + clearance`, both driven from **one shared parameter** — never two independent literals.

| Fit class | Radial clearance (per the research) |
|---|---|
| Press / interference | `-0.1 … -0.3 mm` (FDM press is risky — warn) |
| Slip | `+0.2 mm` |
| Free / rotating | `+0.3 … +0.4 mm` |
| **Print-in-place gap** | `≥ nozzle × 1.5` **and** `≥ 2 × layer_height` (≈ **0.4–0.6 mm**) |

Diameter-banded clearance for slip/free: `<6 mm → +0.1–0.3`, `6–25 mm → +0.2–0.4`, larger → more. **Reject** `clearance == 0` on any moving/removable joint; **reject** `> 1.0 mm` (sloppy). This banding is exactly what a `fit(class)` helper should return so model-side code reads `bore(stud_d, h, fit("free"))`.

## 1. Two cross-cutting guards (the board's hard gates)

**A. Coil render-explosion guard (critical for Vibemesh specifically).** A `linear_extrude(twist=)` helix generates triangles ≈ `slices × wire-facets × 2`, and OpenSCAD *derives* `slices` from total twist when unset — so a tall, many-turn coil silently multiplies (e.g. 12 turns × ~96 slices/turn × 32-facet round wire ≈ heavy). This can stall not just render but the **STL-serialize → three.js mesh-upload → interactive re-render** path. Mitigations baked into the skill: use a **square wire section** (4 facets, prints better on FDM too), keep `slices = n_total × coils_per_turn` **explicit** (decoupled from `$fn`), and **clamp `coils_per_turn` ≈ 24–48** with a hard segment cap that **fails/clamps before emit**.

**B. Printed gear/pulley pair go/no-go (all three must pass before emit).**
1. **Center distance** matches geometry exactly — spur `C = m·(z1+z2)/2`; helical `C = mn·(z1+z2)/(2·cos β)`; planetary sun↔planet `m·(Ns+Np)/2` with `Nr = Ns + 2·Np`.
2. **Backlash > 0 on every mesh** — `j ≈ 0.1·m` clamped to `[0.15, 0.4] mm`, applied by thinning teeth `backlash/2` per flank. **`backlash == 0` is a hard FAIL** (a mathematically-meshing pair *binds* on FDM). *This is the blocker the adversarial reviewer caught.*
3. **Tip/root clearance** — root of one clears tip of mate by ≥ `0.25·m`; bore + clearance < root diameter.

## 2. Springs & compliant mechanisms

Printed-polymer shear modulus is **~3–4 orders below steel** (`G ≈ 0.35·E`: TPU ≈17 MPa, PETG ≈700, Nylon ≈420 MPa), so an identical-geometry printed coil is ~1000–4000× softer — fat wire / small D / many coils to get useful force, which fights printability. **Print coil axis vertical (Z)** so load is layer-shear, not layer-peel.

| Skill | Feasibility | Key formula / rule | Validator highlights |
|---|---|---|---|
| **Compression coil** | native-hard | `k = G·d⁴/(8·D³·n)`; index `C=D/d ∈ [4,12]`; `L0/D < 4` (buckling) | `pitch > wire_d + 0.4`; `wire_d ≥ 0.8`; `free_len > solid_height`; segment cap |
| **Extension coil** | native-hard | worst FDM case (tension on layer bonds) → **prefer serpentine flat-band**, or open-pitch TPU only | reject close-wound; hook fillet ≥ `wire_d/2`; TPU |
| **Torsion spring** | native-hard | bending, uses **E not G**: `k_θ = E·d⁴/(10.8·D·n)`; winds *tighter* | formula-selection check; arbor clearance ≥0.3; wind direction |
| **Button-return micro-coil (Xbox-style)** | **approximation-only** | OD~3–5, wire~0.3–0.5, ~0.5–2 N → **NOT viable printed** (sub-mm wire, ~4600× too soft) | **route to a metal-spring SEAT** (`pocket_ID=spring_OD+0.2`, centering boss) *or* a TPU snap-dome substitute |
| **Leaf / cantilever** | **native-easy** | `k = E·b·h³/(4·L³)`; `δ_max = 2·ε·L²/(3h)`; `h` cubic | `h ≥ 1.2`; tip deflection ≤ δ_max; root fillet ≥ h |
| **Flexure / living-hinge** | **native-easy** | `k_θ = E·b·t³/(12L)`; web 0.3–0.6 mm | t∈[0.3,1.0]; θ ≤ 2εL/t; PP/TPU/Nylon; web continuous (no boolean seam) |
| **Bistable / snap-action** | native-hard | bistable when **apex/thickness `h/t ≳ 2.31`** (cosine-beam); double-beam for clean snap | h/t≥2.3; printed in-plane; clamped-clamped modeled; PETG/Nylon |

**Key product call:** the Xbox-controller spring you named is the textbook case where the *right* answer is **a printed seat for a cheap metal spring**, not a printed coil — and the validator should detect that automatically (OD<6 mm or wire<0.8 mm or metal-class force ⇒ emit the seat + a one-line caveat). That's the kind of professional judgment the skills system encodes.

## 3. Power transmission

All teeth **print flat (axis vertical)** = stacked perimeters = strongest/most accurate.

| Skill | Feasibility | Core rules | Validator highlights |
|---|---|---|---|
| **Spur gear** | native-hard | `d=m·z`, `da=m(z+2)`, `df=m(z-2.5)`, addendum `1·m`/dedendum `1.25·m`; `z≥17` avoids undercut | the 3-check pair gate; `z` integer; bore < root; rack-cutter teeth are an **approximation, not true involute** |
| **Planetary set** | native-hard | `Nr=Ns+2·Np`; ratio (ring fixed) `1+Nr/Ns`; **assembly: `(Ns+Nr) % N == 0`** | both conditions hard-fail; neighbor (no planet collision); pin clearance ≥0.3 |
| **Herringbone / helical** | native-hard | `C = mn(z1+z2)/(2cosβ)`; twist `= th·tanβ/r`; **great for FDM** (self-supporting overhang, quiet) | β∈[0,35]; herringbone halves mirror-twist; pair opposite-hand |
| **Rack & pinion** | **native-easy** | pitch `π·m`; tooth height `2.25·m`; travel/rev `π·m·z` | pitch matches module; segmented racks integer·p for continuous pitch |
| **Wheels / axles / bushings** | **native-easy** | rotating bore `=shaft+0.3–0.4`; prefer **metal rod axle** (printed axle bends in Z) | keyed (D-flat/hex) or it freewheels; hub wall ≥1.5 |
| **Bearing** | native-hard (PiP) / **easy (608 pocket)** | print-in-place race gap **0.3–0.6 mm** (0.4 default); or stepped pocket for a **608** (OD 22, ID 8, W 7) | gap bridgeable (≥2 layers); low-load/RPM only → advise 608 insert |
| **GT2 pulley** | native-hard | pitch 2 mm; `PD = n·2/π`; `OD = PD − 2·PLD` (PLD≈0.254) | groove count = teeth; bore + key; not confused with circumference |

## 4. Joints & fasteners

| Skill | Feasibility | Core rules | Validator highlights |
|---|---|---|---|
| **Cantilever snap-fit** | native-easy | strain `ε = 1.5·t·Y/(L²·Q)`; PLA ~4% (one-time), PETG/Nylon/PP repeated | needs deflection void **and** finite hook overlap (0.4–1.5); `L/t ≥ 6` proxy; root fillet ≥0.5t; retention angle > lead-in |
| **Annular / ball snap** | native-easy | hoop strain — bead ≤ **8% of shaft Ø** unless slit into 3–4 fingers | lead-in chamfer; detent 0.3–1.0 mm; captive socket mouth ≤ ball_d |
| **Living hinge** | native-easy | web **0.4–0.6 mm** (=2 perimeters), span ≥5 mm; **layers ⟂ bend axis** | t∈[0.3,0.6]; web continuous one-body; PP/TPU caveat string |
| **Threads & inserts** | **easy (insert/nut/clearance) / hard (true helix)** | printed thread pitch ≥1.0 mm, fragile → **default to heat-set inserts / captive nuts / tapped**; M3 clearance Ø3.3 | internal=external+0.2–0.4 clr; captive pocket = AF+0.2–0.3; **no `minkowski()`** on threads (CGAL fallback) |
| **Ratchet / detent** | native-easy | asymmetric sawtooth: ramp 30–45°, lock back-face 80–90°; pawl = a cantilever | ramp < lock; pawl strain check; print-in-place rest gap ≥ nozzle×1.5 |
| **Print-in-place hinge** | native-easy | pin↔barrel gap 0.3–0.5 mm; **print axis horizontal** (bridge, support-free) | gap ≥ nozzle×1.5 & ≥2·layer; captive (interleaved knuckles); no coincident solids |

## 5. Build order (correctness-difficulty × render budget)

- **P0 — `wheel-axle`**: essentially *done* inside `KIT_EXEMPLAR` (axle+bore on one shared `spin_fit` clearance). Extract as the template skill + the `fit(class)` helper. Ship first.
- **P0 — `fit-pair` / tolerance helper**: the shared foundation; generalize `structuralReport`'s clearance check to all fits.
- **P1 — `snap-fit-cantilever`, `print-in-place-hinge`, `rack-pinion`**: prismatic, native-easy, low render risk.
- **P1 — `living-hinge`, `leaf-spring`**: native-easy but **flag as honest material-dependent relief** (PP/TPU caveat).
- **P2 — `spur-gear`** (involute approximation + **mandatory backlash gate**), then **`planetary`** (assembly-condition gate).
- **P2 — `bearing`/`608-pocket`, `gt2-pulley`, `ratchet`**.
- **P3 — `coil-spring`**: ship **only** after the Phase-0 end-to-end render-budget verdict (ship / coarse-approximation / defer); **`button-return` routes to a metal-spring seat** by default.

## 6. Honest feasibility ceiling

- **Native-easy (ship confidently):** fits, leaf/cantilever springs, living hinges, snap-fits, ratchets, wheels/axles, racks, print-in-place hinges, bearing *pockets*, heat-set bosses, captive nuts, screw clearances.
- **Native-hard (ship with care + validators + render guard):** involute spur/planetary/helical gears, GT2 pulleys, helical coil/torsion springs, print-in-place bearings, true helical threads.
- **Approximation-only / route elsewhere:** Xbox-style micro-coils (→ metal-spring seat), high-cycle/structural springs (→ TPU or insert), precision/high-load gears & bearings (→ inserts).
- **Library escalation worth weighing:** BOSL2 (`gears()`, `threads.scad`) would convert several native-hard items to native-easy — the tradeoff is relaxing the current no-libraries rule (see the Capability Limits section above).

*Note: closed-form coefficients (8 compression, 10.8 torsion, 1.5 snap-fit, h/t≈2.31 bistable) are standard Shigley/spring-handbook engineering constants, stated from domain knowledge; validate against a printed test matrix before claiming spec accuracy.*


---

## 7. Skill Registry Seed — 18 mechanical skills

*The canonical, implementation-grade registry — the build spec for the skills system. Every skill formalizes an idiom already in `server/prompt.mjs` (the `female = male + named_clearance` principle at L101, the clearance ladder L102, the peg/socket/stud/snap idioms L106-114, the `$fn`-as-geometry exception L49, and the deconfliction discipline policed by `KIT_EXEMPLAR`/the interference probe) with closed-form formulas + a programmatic validator — not new conventions.*

**Two non-negotiable gates run through everything:**
- **Mandatory gear backlash** — `j ≈ 0.1·m` clamped `[0.15, 0.40] mm`, applied at *every* mesh; `backlash == 0` **hard-fails** pair emission (plastic teeth print fat and bind).
- **Coil render-budget cap** — square wire (`$fn=4`), explicit `slices = n_total·coils_per_turn` with `coils_per_turn` clamped 16–32 and `n_total·coils_per_turn ≤ ~1500–2000`, **decoupled from the quality preset** — without it a single "make a spring" at Fine/Ultra blows past 200k tris and stalls the WASM-render → STL-serialize → three.js-upload → 350 ms-slider-re-render chain (reads as a crash).

| Skill ID | Pri | Feasibility | Makes | Headline validator gate(s) |
|---|---|---|---|---|
| `mech-fit-pair` | **P0** | native-easy | shared FIT library: `peg/bore/stud/antistud/dovetail`, female=male+named clr | clr is a top-level param (not literal); `0.03 ≤ clr ≤ 0.6`; press `0<c≤0.10`; PiP gap `≥ nozzle×1.5 & ≥ 2·layer` (hard-fail below) |
| `mech-wheel-axle-bushing` | P1 | native-easy | wheels, axles, bushings + D-flat/hex/set-screw keying *(≈ already in KIT_EXEMPLAR)* | free bore +0.3–0.4 / slide +0.2 / press −0.1..−0.3 (warn); hub wall ≥1.5; keyed or warn "round-on-round freewheels" |
| `mech-leaf-cantilever-spring` | P1 | native-easy | end-loaded cantilever / multi-leaf spring | `h ≥ 1.2`; tip ≤ `2·ε·L²/(3h)`; root fillet ≥ h; reject PLA cyclic |
| `mech-flexure-living-hinge` | P1 | native-easy | thin-web flexure / living hinge | `t ∈ [0.3,0.6]` (hard-fail <0.2 / >1.0); `θ ≤ 2εL/t`; web one continuous body; PP/TPU caveat |
| `mech-cantilever-snap-fit` | P1 | native-easy | snap clip + receiving catch from one shared overlap param | deflection void **and** overlap>0; `1.5·t·Y/L² ≤ ε` (or `L/t≥6`); root fillet ≥0.5t; catch shares overlap param |
| `mech-print-in-place-hinge` | P1 | native-easy | support-free pin-in-barrel / captive spin-axle | gap `≥ nozzle×1.5 & ≥ 2·layer`; capture exists (interleaved knuckles/lip); no coincident solids; print axis horizontal |
| `mech-rack-and-pinion` | P1 | native-easy | straight-tooth rack + spur pinion (the only native-easy gear) | pitch `== π·m`; tooth height `2.25·m`; backlash ≥0.15; segments integer·p for continuous pitch |
| `mech-spur-gear` | P1 | **native-hard** | involute 20° spur + meshing pair (library-free rack-cutter conjugate) | **backlash∈[0.1,0.5], ==0 HARD FAIL**; `C==m(z1+z2)/2`; bore+clr<root; warn z<17 (undercut) |
| `mech-planetary-gearset` | P2 | native-hard | sun + N planets + ring + carrier kit | `Nr==Ns+2·Np`; **`(Ns+Nr)%N==0` HARD FAIL**; neighbor `(Ns+Np)·sin(180/N)>Np+2`; backlash both meshes |
| `mech-helical-herringbone-gear` | P2 | native-hard | helical / self-centering herringbone (quiet, strong, FDM-friendly) | β≤35° (warn>30); pair opposite-hand + equal β; `C==mn(z1+z2)/(2cosβ)`; slices capped |
| `mech-bearing-608-or-pip` | P2 | native-hard (pocket easy) | 608/623 insert pocket **or** print-in-place plastic bearing | pocket OD 22.0–22.3, depth 6.8–7.2, shoulder, ≥2mm wall; PiP gap 0.3–0.6 & ≥2·layer; advise metal insert under load |
| `mech-threaded-fastener-seat` | P2 | native-hard (helix) / easy (rest) | heat-set bore, clearance+counterbore, captive hex-nut pocket, M-series LUT | internal=external+0.2–0.4; nut pocket AF+0.2–0.3 (`$fn=6`); clearance ≥nominal+0.3; **no `minkowski()`**; steer to inserts |
| `mech-ratchet-pawl` | P2 | native-easy | one-way ratchet ring/rack + cantilever pawl (symmetric = detent) | asymmetric: ramp<engage; engage 75–100°, ramp 15–50°; pawl strain `L/t≥6`; PiP rest gap ≥nozzle×1.5 |
| `mech-gt2-pulley` | P3 | native-hard | GT2 2mm-pitch timing pulley + optional flanges + key | `PD==n·2/π`; `OD=PD−2·PLD` (PLD≈0.254, not circumference); groove=n_teeth; bore+key, wall≥2 |
| `mech-helical-compression-spring` | P3 | native-hard | square-wire compression coil + flat ground ends | **render-budget HARD GATE** (above); `pitch > wire_d+0.4` (else fuse); `wire_d≥0.8`; `C∈[4,12]`; `L0>solid_height`; flexible material |
| `mech-helical-extension-torsion-spring` | P3 | native-hard | open-pitch extension (filleted loops) / torsion (legs + arbor) | reject close-wound→serpentine band; **torsion uses E not G**; arbor clr ≥0.3; TPU; default-recommend metal insert |
| `mech-bistable-snap-action` | P3 | native-hard | over-center cosine clamped-clamped beam / double-beam button | **apex/thickness ≥ 2.31** (else not bistable); both ends clamped (free end ≠ bistable); printed in-plane; PETG/Nylon |
| `mech-button-return-microcoil` | P3 | approximation-only | **METAL-SPRING SEAT by default** (pocket+centering boss) — the honest "Xbox-style return spring" answer | if OD<6mm **or** wire<0.8mm **or** metal-class force → **BLOCK printed helix, emit seat** (`pocket_ID=OD+0.2`, `boss_OD=ID−0.2`); never emit a sub-mm round helix |

**Shared FDM contract (every skill inherits):** `±0.15–0.20mm` XY / `±0.10–0.20mm` Z; holes print *under*, pegs/teeth print *over* (±0.1–0.3/flank) → clearance is designed in. Strain governs every flexing element: `ε = 1.5·t·Y/(L²·Q)` (Q=1 rigid wall, ~2 flexing support), permissible single-assembly PLA 4% / ABS 7% / Nylon 4–15% / PP high — *halve for repeated cycles*; fillet every flexing root `r ≥ 0.5·t`. Expose `nozzle_d` (0.4) and `layer_height` (0.2) so all minimums scale.

**Build order:** P0 `mech-fit-pair` (foundation) → P1 native-easy workhorses (`wheel-axle`, `snap-fit`, `print-in-place-hinge`, `rack-pinion`, `leaf`, `living-hinge`) → P2 the hard-but-high-value (`spur-gear`+backlash, `planetary`+assembly-condition, `bearing`, `ratchet`, `fastener-seat`, `helical/herringbone`) → P3 the render-landmine/approximate (`coil springs` gated on the render cap, `gt2-pulley`, `bistable`, `button-return`→seat). Generalize `bench/interference.selftest.mjs` into a zero-API walker over every registry exemplar as the hard deterministic gate (exemplar-poison defense).

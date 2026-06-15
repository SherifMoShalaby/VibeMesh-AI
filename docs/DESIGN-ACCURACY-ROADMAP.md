# Vibemesh — Design Accuracy & "Buildable Kit" Roadmap

Investigation output (11 feasibility-reviewed expert leads + synthesis). Driving failure:
**"a simple lego car parts so I can build it" returns one car-shaped manifold, not a connectable kit
with mating plates/connectors.** Verdict: this is a **prompt / exemplar / measurement** problem, not
an architecture problem. Every top fix is constraint-safe and portable across all four engines
(anthropic / kimi / claude-code maxTurns:1 / local).

## Root causes (ranked)

1. **Default bias** — `server/prompt.mjs:43` makes "a single manifold solid" the primary rule and
   separation a parenthetical; the model anchors on "one solid" for any bed-fitting object.
2. **Weak/narrow multi-part trigger** — `prompt.mjs:66` only splits for "container+lid, hinged, pins,
   drawers" or over-bed; "a lego car" matches none and fits the bed. "parts so I can build it" is
   never named as a decomposition signal.
3. **No connector vocabulary** — only clearances are mentioned (`prompt.mjs:76`); the actual mating
   geometry (stud Ø4.8 / pitch 8.0 + anti-stud tube, peg/socket, snap, dovetail) is never taught, and
   with BOSL2/MCAD banned it must be emitted as **inline modules** the model is never told to write.
4. **No planning** — single-shot prose→code; nothing forces enumerating the kit + per-joint connectors first.
5. **No exemplars** — `examples.ts` has zero `part`-enum/connector examples (the one storage box even
   sets a banned global `$fn`); weak/local models have nothing to copy.
6. **No measurement (meta cause)** — `bench/run.mjs` compiles only `part=="all"` (no `-D` defines), so a
   blob and a real kit score **identically** on voxel-IoU. Every fix is currently unfalsifiable.
7. **No verification feedback** — compile error/log + per-part bbox/minZ are computed but never looped back.
8. **Local-engine starvation** — `streamLocal` sends no `num_ctx`/`num_predict`; Ollama's ~2–4K default
   truncates the system prompt and ~128-token output cuts programs mid-module → guaranteed blobs on local.

## Quick wins (do first — all S/M, constraint-clean, zero added latency)

1. **One coherent `prompt.mjs` rewrite** (S, high) — de-bias the single-solid default to "EITHER one solid
   OR a connectable set; prefer the set when the user wants to build/assemble"; add kit-intent phrases
   ("kit / buildable / so I can build it / snaps together / modular / interlocking") as a first-class split
   trigger **with a singular-vs-plural guard** ("a replacement part" must NOT over-split); require one
   short **non-fenced** `Parts: … Joins: …` line; add silent self-check items ("every part in the `part`
   enum; each mating pair has real connector geometry; male nominal + clearance == female nominal").
   *Files: `server/prompt.mjs`.*
2. **Inline connector vocabulary** (M, high) — new "Connectors and joints" section naming canonical inline
   joints with real dims **and the key rule: drive both halves of every joint from ONE shared parameter**
   so male/female can't drift (peg Ø=D / socket Ø=D+0.2; stud Ø4.8×1.8 pitch 8.0 / anti-stud tube; axle
   Ø=D / bore Ø=D+0.3). **Tier it** (studs + peg/socket + pin inline; snap/dovetail in prose) for kimi's
   16K budget; **cap feature counts** + "one for-loop of simple cutters" for the CGAL/90s watchdog.
   *Non-negotiable: compile/bench-verify every module before merge.* *Files: `server/prompt.mjs`.*
3. **Per-request kit directive via `contextText()`** (S, high) — tightened kit-intent regex in
   `store.ts runGeneration` (strong phrases only; drop bare "part(s)"/"lego") sets `context.kit`;
   `contextText()` appends a strong "BUILD AS A KIT" directive. Rides the existing side-band, byte-identical
   on every engine, fails safe on a miss. *Files: `src/lib/api.ts`, `src/state/store.ts`, `server/providers.mjs`.*
4. **Kit bench task + buildability rubric** (M, high) — thread a `defines[]` arg through
   `bench/run.mjs compileScad` so it recompiles each piece with `-D part="<piece>"`; add `extractPartEnum()`;
   add **T7-kit** (`prompt: "a simple lego car parts so I can build it"`, `expect: partEnum + minParts>=4`) and
   `bench/buildability.mjs` (partsPresent≥2, allPartsRender, printsFlat |minZ|<0.5, fitsBed, connector-module +
   clearance-param regex, same-stem-equal-clearance flag). Re-run T1/T3 as the **over-split regression guard**.
   *Files: `bench/run.mjs`, `bench/compare.mjs`, `bench/buildability.mjs` (new), `bench/gold/T7-kit/` (new).*

## Structural bets (sequenced behind the quick wins)

- **Task-routed full kit exemplar** (M, high — biggest lift for kimi/local) — one compiling stud-and-tube kit
  showing the `part=="all"` dispatcher + inline `stud()`/`antistud()` + shared fit params, stored in a
  runtime-neutral data file (server can't import TS `examples.ts`), injected **only on kit-regex match** (2nd
  cache_control block on anthropic; plain append elsewhere), ~40 lines, also surfaced as a gallery built-in.
  *Author fresh/contract-clean — do not seed from the `$fn`-violating storage box.*
- **In-program PLAN-then-CODE header** (S, medium) — for kit requests the first lines are `// KIT: <piece>=<count>`
  and `// JOINTS: <A>-><B> via <connector>`; the `part` enum must match the KIT list. Comments only (parser-safe);
  gives bench a greppable manifest. Fold into the quick-win prompt rewrite.
- **Local fix: `num_ctx`/`num_predict`** (S, high on local) — `streamLocal` sends `options:{num_ctx:8192,
  num_predict:8192,temperature:0.2}` + top-level `max_tokens`. The literal mechanical reason local returns blobs.
- **`output_config.effort=xhigh` on the Anthropic engine** (S, high on anthropic) — kit is an under-reasoning
  failure; scoped to `streamAnthropic` only (kimi 400s on effort; inert on claude-code).
- **Client compile-report + bounded auto-repair** (M, high for ambitious kits) — `src/lib/compileReport.ts`
  formats a per-part report from data the app already has; wire into the manual `askAiToFix`/`refine` paths
  first, then an **error-only** auto-repair (hard cap 1–2, never-adopt-worse guard, gated off local, kill switch).

## Explicitly rejected / deferred (low value-for-effort)

- **Server-side Agent-SDK tool loop** — XL, exclusive to the undistributable subscription engine, multiplies
  latency, turns the deliberately thin server into a geometry engine.
- **Full client-side per-primitive voxel-IoU mate verification** — XL, latency-heavy, doesn't generalize past a
  hand-curated kit list. Keep the deferred geometric mate-interference check per-task opt-in only.
- **LLM-judge** — advisory backstop only (gated on API key); never gates pass/fail.

## The lego example, traced through the improved system

1. User: "a simple lego car parts so I can build it." `store.ts` kit-regex matches → `context.kit=true`.
2. `contextText()` appends the BUILD-AS-A-KIT directive; the rewritten prompt's de-biased default + kit trigger
   fire; on anthropic the kit exemplar is injected as a 2nd cached block.
3. Model emits a `// KIT: baseplate=1, chassis=1, wheel=4, axle=2` + `// JOINTS: chassis studs→baseplate tubes;
   axle Ø→wheel bore +0.3` header, a `part` enum `[all, baseplate, chassis, wheel, axle]`, one module per piece
   using inline `stud()`/`antistud()` with a shared `stud_d`/`fit` param, each piece flat on z=0.
4. Client compiles each piece; the PARTS bar + per-part export light up; bench T7 scores partsPresent=1,
   allPartsRender≈1, connectorsPresent≥0.5 — a measured kit, not a blob.

## Eval plan (how we prove it worked)

Extend the offline `bench/` (the only quantitative channel). Make `compileScad` part-aware (`-D part=`), add the
buildability rubric (run only on `kit:true` tasks), add T7-kit with gold on the **dimensionally-determined** pieces
only (chassis stud pitch 8.0, axle Ø). A/B T7 before/after across the engine matrix; **always re-run T1-cube /
T3-clip** to confirm simple objects don't over-split. Pass bar: partsPresent=1, allPartsRender≥0.9, printsFlat≥0.9,
connectorsPresent≥0.5; a kit prompt returning one manifold = hard 0 (no IoU partial credit). LLM-judge optional/advisory.

## Recommended sequence

0. **Safety net first** — part-aware bench + T7-kit + buildability rubric + baseline run. (Makes everything else falsifiable.)
1. **One prompt.mjs rewrite** — quick wins 1+2 + PLAN/KIT header. Compile-verify connectors. Re-run bench (T7 up, T1/T3 not over-split).
2. **Per-request kit directive** — quick win 3. Cheap reinforcement on paraphrases.
3. **Engine reach** — local `num_ctx`/`num_predict` + anthropic `effort=xhigh`.
4. **Kit exemplar** — task-routed few-shot; A/B on/off (largest delta on kimi/local).
5. **Compile-report + bounded auto-repair** — manual "Fix these" first, then opt-in error-only auto-loop.
6. **(Optional)** LLM-judge / mate-interference check only if a measured gap remains.

## Top risks & mitigations

- **Over-splitting single parts** → tight regex, singular/plural guard, single-manifold stays the non-kit default, re-run T1/T3 every phase.
- **Bad connector geometry taught at scale** → compile + bench-verify each module before merge (why quick win 2 is M not S).
- **CGAL/90s blowout on studded plates** → feature-count cap + one-for-loop-of-cutters; bench `renderMs` catches it.
- **Token budget on kimi/local** → tier the catalog, ≤40-line exemplar, inject at most one only when routed.
- **`extractScadBlock` mis-adoption** → plan is plain bullets, never fenced; KIT/JOINTS are `//` comments.
- **Auto-repair latency/oscillation** → structural checks before a 2nd generation, hard cap, never-adopt-worse, off on local.

# VibeMesh-AI — UI/UX Upgrade Plan

*Modern Dark Cinema elevation of the existing "machined-dark" identity — performant glassmorphism, intentional motion, and a premium 3D scene, with DOM animation hard-isolated from the WebGL canvas.*

> **Provenance.** Authored 2026-06-17 by a senior UI/UX Lead + 5-specialist design panel (Visual Identity & Tokens · DOM Motion & Micro-interactions · 3D/WebGL Scene · Performance & Accessibility · Skills & Conventions), adversarially reviewed by a principal engineer. Grounded in: the source design discussion, a full audit of `src/`, the `ui-ux-pro-max` skill database, and the `frontend-design` anti-slop conventions.
>
> **Claims verified against source:** deps confirm no Framer Motion and three@0.184 / fiber@9 / drei@10; `styles.css` is 1345 lines; skills use the `directory/SKILL.md` form (cf. `add-ai-engine/`, `openscad-contract/`); Space Grotesk is live at L61/268/1085 with the `--font-hero` alias at L65; `--bg` / `--fs-h2` are *referenced* at L1340/1342 but **absent from `:root`** (live crash-screen bug); the five blur surfaces, the hard-coded `#2f3236` canvas background, the instant `camera.position.set` at L933, and `enableDamping` / `dampingFactor 0.12` are all confirmed.

---

## 1. Executive summary

VibeMesh-AI already ships the *hard parts* of "Modern Dark Cinema": a disciplined `:root` token system in `src/styles.css`, real glassmorphism on the five floating canvas overlays (`.tool-rail`, `.hud-bar`, `.assembly-chip`, `.perf-chip`, `.sel-bar`), a global `prefers-reduced-motion` kill-switch, and centralized focus/ARIA. This is an **elevation, not a rebuild** — keep cobalt `#3d6ff5`, the gunmetal neutrals, and the transform/opacity-only motion discipline that's already in place. The work is to (a) formalize the ad-hoc glass into a tunable token set, (b) add the *choreography* the system lacks (press feedback, focus glow, staggered entrances, animatable collapse), and (c) bring the r3f scene from "functional" to "premium" with a camera fly-in, mesh-spawn, IBL/contact-shadow grounding, and an in-canvas compile pulse. The governing constraint throughout: **DOM motion stays CSS-only; 3D motion stays inside `useFrame` — they never share a scheduler**, because backdrop-blur stacked over a live `frameloop='always'` WebGL canvas is the central performance risk and the openscad-wasm → STL → mesh pipeline must not break. The plan is sequenced so the two safety primitives (a `[data-busy]` animation gate and an AA-contrast floor on glass) land *before* any new visual flourish.

---

## 2. Design principles & conventions

Every change must obey this ruleset. Each is tagged with its backing skill/convention.

1. **Tokens are law.** Every color/space/radius/shadow/duration is an existing or newly-defined `:root` custom property in `src/styles.css` — never a raw hex or px in component CSS. *(design-system; frontend-design — robust CSS variables)*
2. **Accent derives from one hue.** All accent tints come from `--accent` via `color-mix()` (the existing `--accent-soft/-line/-glow` pattern), so a single hue change re-tints the UI. No hand-authored one-off accent rgba. *(design-system; frontend-design)*
3. **Glass = viewport overlays only.** `backdrop-filter` is permitted *only* on the small fixed-size chrome floating over the `.viewport` canvas (`.tool-rail`, `.hud-bar`, `.assembly-chip`, `.perf-chip`, `.sel-bar`). Side panes (`.pane`) stay solid `--panel` and never blur. Never blur a full-canvas surface (no full-screen compiling scrim, no parallax sheet). Use `--glass-*` tier tokens; never re-type a blur radius inline. *(ui-ux-pro-max Modern Dark Cinema; fixing-motion-performance substitute)*
4. **Blur is capped at 8px, no `saturate()` on canvas-overlay glass.** `saturate()` compounds compositor cost; 8px is the standard already used by four of five surfaces. *(fixing-motion-performance substitute)*
5. **Animate transform + opacity ONLY.** Never `width`/`height`/`top`/`left`/`margin`. The single sanctioned height exception is `grid-template-rows: 1fr ↔ 0fr` (param-group collapse). *(ui-ux-pro-max motion HIGH; fixing-motion-performance)*
6. **Nothing animates while the canvas is busy.** A single derived signal `busy = compileStatus==='compiling' || generating || slicing` is reflected as `[data-busy]` on `.viewport`. Every looping/entrance animation no-ops under `[data-busy]` — **except one sanctioned loader**. STL parse + `EdgesGeometry` build run on the main thread after the worker returns; concurrent CSS animation in that 100–700ms window stutters. *(fixing-motion-performance substitute)*
7. **Reduced-motion is HIGH and has TWO surfaces.** The CSS `@media (prefers-reduced-motion)` block (styles.css L145) covers CSS, but **does not reach `useFrame`**. Every r3f rig reads `matchMedia('(prefers-reduced-motion: reduce)')` itself and hard-cuts to the final state. Any JS `scrollTo({behavior:'smooth'})` needs its own `matchMedia` guard. *(ui-ux-pro-max motion HIGH)*
8. **Contrast on glass is proven against the composited color.** Text on any `backdrop-filter` surface uses bg opacity ≥84% **and** a token of `--text-dim` (`#a8aeb8`) or lighter — never `--text-faint`/`--text-ghost` on glass — re-verified at 4.5:1 against the *worst-case light model behind*, not the token over solid `--panel`. *(ui-ux-pro-max accessibility 4.5:1)*
9. **One DOM scheduler, hard-gated.** DOM motion uses **Framer Motion** *(decision §7.3, locked)* for **discrete transitions only** — entrances, layout, press, modal in/out — never continuous loops, and never inside the `<Canvas>` (the scene stays on `useFrame`). The second-rAF-vs-`useFrame`/STL-parse risk is neutralized by guardrails: Framer obeys the `[data-busy]` gate, uses `useReducedMotion()`, animates transform/opacity only, and stays idle whenever the canvas is rendering (reinforced by Phase-3 `frameloop='demand'`). Shared `--ease-out cubic-bezier(0.16,1,0.3,1)` rhythm. *(decision §7.3; frontend-design; principal review)*
10. **`will-change` is transient.** Apply `will-change: transform` only during an active gesture/transition and remove it after — a permanent `will-change` per glass panel stands up a compositor layer and starves the r3f canvas of GPU memory. The app uses zero `will-change` today; do not regress this. *(fixing-motion-performance substitute)*
11. **Motion budget: 1–2 key elements per view.** Micro-interactions 150–300ms; complex/orchestrated reveals ≤400ms total (including stagger). Infinite animation only for loaders/streaming. *(ui-ux-pro-max motion HIGH)*
12. **UI-vs-3D isolation is structural.** `vibemesh-ui` owns all DOM/CSS; `vibemesh-3d-motion` owns *only* the `<Canvas>` subtree of `Viewport.tsx`. A canvas-motion session never touches `styles.css`; a DOM session never touches the scene graph. *(source blueprint core strategy)*
13. **Geometry is sacred.** 3D spawn/transition animations mutate the **material or group transform**, never swap or clone `model.geometry` — it's a manually-disposed prop (`Viewport.tsx` L129/L137); cloning leaks GPU buffers and breaks the dispose effect. *(openscad-contract)*
14. **Camera motion is fitVersion-gated only.** Camera-reframe animation keys on `fitVersion` (bumps empty→full L369, `selectPart` L833, `setViewMode` L847 only). Geometry-change motion (spawn/fade) keys on `stlVersion`. Never cross-wire them — `fitVersion` is the contract that protects the user's framing during slider drags and refine passes. *(vibemesh-3d-motion)*
15. **State lives in zustand, never duplicated.** All motion reads existing store fields (`compileStatus`, `generating`, `streamText`, `stlVersion`, `fitVersion`, `leftCollapsed`/`rightCollapsed`, `rightTab`); no component-local animation state. *(source blueprint)*
16. **Every animated state has a non-animated equivalent.** Follow the existing HUD pattern (`Model ready` / `Rendering…` text) so screen-reader/`aria-live` users get the same information the motion conveys. Preserve `--ring` focus-visible and `::selection` contrast through any restructure. *(ui-ux-pro-max accessibility)*

---

## 3. Identity & token decisions

### 3.1 Glass surface token set (add to `:root`)

Add a formal glass band and refactor the five ad-hoc surfaces onto it. **The contrast audit (Phase 1) sets the floor opacity before these numbers are fixed** — the values below are the post-audit targets (note `--glass-1` is bumped from the originally-proposed 72% to satisfy the ≥84%-behind-text rule):

```css
/* COMPONENT layer */
--glass-blur:     8px;   /* capped; was 12px on hud-bar */
--glass-blur-sm:  8px;
--glass-edge:     rgba(255,255,255,0.08);  /* Modern Dark Cinema hairline; replaces raw .05/.055/.07 */
--glass-1: color-mix(in srgb, var(--panel) 84%, transparent);     /* perf-chip / assembly-chip — carry text → ≥84% */
--glass-2: color-mix(in srgb, var(--panel) 86%, transparent);     /* hud-bar */
--glass-3: color-mix(in srgb, var(--panel-hi) 90%, transparent);  /* sel-bar / menus */
--accent-ambient: color-mix(in srgb, var(--accent) 9%, transparent); /* ambient-blob layer (Phase 3, deferrable) */
--sh-glass: 0 16px 48px rgba(0,0,0,0.55),
            0 4px 16px color-mix(in srgb, var(--accent) 6%, transparent),
            inset 0 1px 0 var(--glass-edge);  /* accent-tinted ambient depth for floating glass */
```

- Repoint surfaces: `.tool-rail` (L765), `.perf-chip` (L908), `.assembly-chip` (L881) → `blur(var(--glass-blur-sm))` + `var(--glass-1)`; `.hud-bar` (L797) → `blur(var(--glass-blur))` **dropping `saturate(1.15)`** + `var(--glass-2)`; `.sel-bar` (L918) → `var(--glass-3)`. Floating surfaces move from `--sh-float` → `--sh-glass`; opaque `--sh-raise/-pop/-modal` are untouched.
- Ship a fallback for both blur-absent and reduced-transparency cases:

```css
@supports not (backdrop-filter: blur(1px)) { /* raise panel opacity to ~96% */ }
.perf-lite .tool-rail, .perf-lite .hud-bar, /* … */ { backdrop-filter: none; background: var(--panel); }
```

`.perf-lite` is toggled on `<body>` by a low-power probe (`navigator.hardwareConcurrency` + a startup rAF fps sample) **and** by `prefers-reduced-transparency`. *(driver: ui-ux-pro-max + fixing-motion-performance substitute)*

### 3.2 Accent-glow component token

Keep `--accent: #3d6ff5` and its full ramp — woven through ~40 rules, reads as deliberate engineering blue (passes the anti-slop palette test), zero upside to changing it. **Reject the `#22C55E` IDE-reference green** — it's an *alternative* in the lookup, not a mandate, and clashes with semantic `--ok #46d39b`. Promote the inline glow idiom (re-typed three times: `.btn-primary:hover` L399, `.send-btn:hover` L703, `.tabpulse` L947) into one token:

```css
--glow-accent: 0 0 18px -4px var(--accent-glow);
```

### 3.3 Typography — Space Grotesk fork (RESOLVED)

frontend-design hard-bans both Inter *and* Space Grotesk; that ban is advisory (no lint/CI enforces it), but the product owner has elected to satisfy it.

> **DECISION (locked 2026-06-17): SWAP the display/hero face off Space Grotesk → `Bricolage Grotesque`.** A distinctive, non-banned Google Font that keeps a technical/modern character for the "machined CAD" hero + brand mark. Recorded in `.claude/skills/vibemesh-ui/SKILL.md` §6.
>
> **Single edit:** change `--font-display` / `--font-hero` (L61/L65) **plus** the `index.html` Google Fonts `<link>` — that is the whole swap. Consumers `.brand-name` (L268) and `.empty h1` hero (L1085) read `--font-display` and need no per-rule edit. Keep `--font-ui: 'Hanken Grotesk'` and `--font-mono: 'IBM Plex Mono'` unchanged. **Never introduce Inter** (also banned). Mitigate FOUT/CLS: `font-display: swap` + preload the hero weight. (Cohesive alternative if Bricolage reads too playful in review: IBM Plex Sans headings.)

### 3.4 Token restructure (primitive → semantic → component)

Reorganize `:root` (L9–106) into **three commented bands with ZERO renames of consumed properties** — this is a pure reorganization, in its own bisectable commit:

1. **PRIMITIVES** — a numbered neutral ramp (`--gray-950..--gray-300` sourced from the current `#0d0e11..#565c66`), raw cobalt hues, raw rgba edges.
2. **SEMANTIC** — the existing role names (`--panel`, `--raised`, `--stage`, `--text`, `--accent`, `--ok/--warn/--err`) repointed at primitives.
3. **COMPONENT** — `--glass-*`, `--glow-accent`, `--sh-*`, `--ring`.

Document this as an intentional **2-layer-with-bands** choice — do **not** rebuild to design-system's native 3-layer naming scheme (that adds a parallel naming scheme and churns 1345 lines for no user-visible gain). **Fix the live crash-screen bug in the same commit:** define `--bg` (alias `--gutter`) and `--fs-h2` (~22px), both referenced at L1340/L1342 but absent from `:root` — today the ErrorBoundary fallback renders with a transparent bg and a browser-default heading size. *(driver: design-system; verify the crash screen renders after.)*

---

## 4. Phased roadmap

> **Sequencing law (from principal review):** Phase 1 safety primitives are *prerequisites*, not nice-to-haves. The `[data-busy]` gate and the contrast floor must exist before any Phase 2/3 animation. Capture a perf baseline at the end of Phase 1 and gate every subsequent merge against it.

### Phase 0 — Decisions & reconciliation (no code)

Resolve the four product-owner decisions in §7. Reconcile slices into one convention set and **exactly three skill files** (§5). Assign the reduced-motion JS-guard ownership to `vibemesh-3d-motion`. Use `<name>/SKILL.md` directory form (repo convention — verified).

---

### Phase 1 — Foundation: tokens, glass, safety primitives

**Goal:** all-DOM/CSS, zero canvas risk. Establish the gate + contrast floor + token band restructure that everything else depends on.
**Driver skills:** design-system, ui-ux-pro-max, frontend-design.

| Task | Files | Effort |
|---|---|---|
| **`[data-busy]` animation gate** — derive `busy = compileStatus==='compiling' \|\| generating \|\| slicing`, reflect as `data-busy` on `.viewport`; scope `.status-dot.busy` (L825) and `.tabpulse` (L946) and all future loops under `:not([data-busy])`. | `Viewport.tsx`, `styles.css`, `store.ts` | S |
| **Contrast audit + opacity floor** — compute composited contrast for `.perf-chip` (`--text-faint` over panel-72%), HUD `.dim-label` (L833), `.ac-hint` (`--text-ghost` over panel-78%) against a white STL behind. Raise text tokens to `--text-dim`+ and bg to ≥84%. **This sets the `--glass-1` number.** | `styles.css` | S |
| **Glass token set + refactor** — add `--glass-*`, `--glass-edge`, `--sh-glass`, `--glow-accent`, `--accent-ambient`; repoint the five surfaces; drop hud-bar `saturate`; cap blur at 8px. | `styles.css` | M |
| **Token band restructure (no renames)** — primitive/semantic/component bands; define `--bg` + `--fs-h2`. Separate bisectable commit. | `styles.css` | M |
| **Fallbacks** — `@supports not (backdrop-filter)` opacity bump + `.perf-lite` opaque path + low-power/`prefers-reduced-transparency` toggle. | `styles.css`, `App.tsx` | M |

**Exit criteria:** (1) every glass surface text passes 4.5:1 against worst-case light model (computed, not eyeballed); (2) zero consumed-property renames — diff every `var()` reference; (3) crash screen renders correctly with real `--bg`/`--fs-h2`; (4) **perf baseline captured** — idle / orbit / compile-window fps on integrated graphics, using the existing perf-chip tris+fps readout, recorded for regression gating.

---

### Phase 2 — DOM motion & micro-interactions (CSS-only)

**Goal:** add the choreography the system lacks. All gated under `[data-busy]` and the existing reduced-motion block.
**Driver skills:** ui-ux-pro-max (Modern Dark Cinema motion), impeccable (substituted: CSS staggered reveals), frontend-design.

Add **two shared keyframes** next to `menu-in`/`tabpulse` (never inline per-component): `fade-rise` (opacity 0→1, `translateY` 6–8px→0, `--ease-out`) and a `press-scale`.

| Task | Files | Effort |
|---|---|---|
| **Press-scale 0.97→1.0** on `.btn`, `.send-btn`, `.chip-btn`, `.icon-btn-sm`, `.tool-btn`, `.ex-chip`, `.example-card`, `.code-chip`, `.seg button`, `.mm-opt`, `.panel-tab`, `.plate-chip` via `:active:not(:disabled)`. | `styles.css` | S |
| **Border-glow focus/hover** — extend the composer `:focus-within` glow (L632/L1100) to discrete chips/buttons via `:focus-visible` using `--accent-soft` + `--glow-accent`. | `styles.css` | S |
| **Promote primary accent-glow to at-rest** on `.send-btn` + EmptyState Generate so the CTA is the focal point. | `styles.css` | S |
| **Param-list stagger** — `fade-rise` with inline `--i` index × 40ms on `.param`, fires on group-expand/model-load only (keyed by `p.name`, never on slider drag). | `RightPanel.tsx`, `styles.css` | M |
| **Chat message entrance + smooth scroll** — `fade-rise` on `.msg` (keyed `msg.id`); switch auto-scroll (L105-107) to `behavior:'smooth'` **with a `matchMedia` reduced-motion guard**; ensure smooth-scroll fires on data-arrival, not per `streamText` token. | `ChatPanel.tsx`, `styles.css` | M |
| **EmptyState orchestrated load** — stagger `.example-card` + `.ex-chip`; one-time top-down hero reveal (badge→h1→lede→composer ~0/80/160/240ms). | `EmptyState.tsx`, `styles.css` | M |
| **Origin-aware modal entrance** — give `.modal` its own keyframe (scale 0.96→1 + translateY 8px→0, ~280ms) distinct from the `.scrim` fade (L1190). Dropdowns already use `menu-in` — leave them. | `styles.css` | S |
| **Animatable param-group collapse** — replace `display:none` (L960) with `grid-template-rows: 1fr↔0fr` + inner `overflow:hidden; min-height:0`. The sanctioned height exception. | `styles.css` | M |
| **Tab/panel crossfade** — wrap RightPanel active body (Code↔Params, L93) in a keyed `fade-rise` div; keep panel-collapse motion to opacity/transform on the panel body, **decoupled from the App.tsx grid-column change** (a grid-track snap forces a canvas resize hitch). | `RightPanel.tsx`, `styles.css`, `App.tsx` | M |

**Exit criteria:** re-measure fps vs Phase 1 baseline (idle/orbit/compile) — **gate merge on no regression**; confirm every new keyframe no-ops under `[data-busy]` and under the reduced-motion block; confirm the JS smooth-scroll respects its `matchMedia` guard; no stagger sequence exceeds 400ms total.

---

### Phase 3 — 3D scene motion (highest risk — gate hard)

**Goal:** camera fly-in, mesh spawn, premium grounding, in-canvas compile feedback. **`frameloop='demand'` is a prerequisite, not a phase-4 nicety.**
**Driver skills:** vibemesh-3d-motion, ui-ux-pro-max (Spatial UI), openscad-contract.

**Gate 3.0 — RESOLVED (ADR 0001, 2026-06-17).** Decision: **adopt `frameloop='demand'`; the full premium scene is viable as-is — no descope, no hybrid.** Verified against the installed fiber@9.6.1 / drei@10.7.7 / three-stdlib@2.36.1 source: at idle the rAF fully stops (zero compositor re-sample under the glass), and OrbitControls damping settles smoothly because drei's `'change'` listener calls `invalidate()` (no end-snap). See [adr/0001-frameloop-demand.md](adr/0001-frameloop-demand.md) for the full source-grounded record. **The #1 implementation invariant:** every self-driving `useFrame` rig (camera fly-in, mesh spawn) must call `state.invalidate()` each tick until settled, or it runs one frame and freezes. Two source-driven corrections to this plan: (a) `<Environment preset>` env-only is idle-safe by construction (`EnvironmentCube`, no `useFrame`) — **drop the Environment idle-frame check and do NOT pass `frames={1}`**; (b) drei loads HDRIs from a remote CDN — **self-host the preset under `public/`** to keep the app local-first (new sub-task; do not ship the remote dependency). The only remaining empirical check is the integrated-GPU idle-rAF + damping-feel confirmation.

| Task | Files | Effort |
|---|---|---|
| **Reduced-motion + dt-clamp helper** — one `usePrefersReducedMotion` (matchMedia + change listener) shared by all rigs; clamp `useFrame` dt to `min(dt, 1/30)`. Local helper, no new dep. **Owned by this slice** (resolves the shared-guard ambiguity). | `Viewport.tsx` | S |
| **Camera fly-in** — replace the instant `camera.position.set` (L933) in CameraFit with a `useFrame` lerp inside the existing `fitVersion`/`lastFitted` guard; `controls.enabled=false` for the ~400ms flight, re-enable + `markFittedRef` on arrival; snap under reduced-motion. **Ortho:** keep ProjectionFit's mount snap instant, animate only the perspective re-frame (or extend lerp to `camera.zoom` — CameraFit sets position but not zoom, L933). | `Viewport.tsx` | M |
| **Mesh spawn** — on `stlVersion` change, lerp an `appear` ref 0→1 over ~320ms driving group scale 0.92→1 + `material.opacity` 0→1 (set `transparent` true while <1, flip to false at 1 for correct depthWrite). **Mutate material via ref — never touch the disposed prop geometry, never clobber the emissive/flatShading/wireframe props** (L386-390). Same pattern on SlicerScene meshes (L982-990). | `Viewport.tsx` | M |
| **In-canvas compile pulse** — primary: CSS hairline/accent-glow on `.viewport` toggled by `data-compiling` (DOM, zero canvas cost, the one sanctioned loader, survives the `[data-busy]` gate). Optional in-scene emissive breathing only if the frozen mesh still feels dead. | `Viewport.tsx`, `styles.css` | S |
| **Premium grounding** — add drei `<Environment preset>` (env-only, **do NOT set background** — keep the hard-coded `#2f3236` L346) + `<ContactShadows frames={1}>` (bake-once) under the model when `!platesView && model`. Supplement, don't replace, the existing lights. | `Viewport.tsx` | M |
| **CaptureRig verification (hard gate)** — confirm Environment+ContactShadows don't contaminate the three refine-shoot PNGs (L870-919); if they muddy feature/hole counts, toggle ContactShadows off during the shoot via a ref flag, mirroring the rim-light add/remove. | `Viewport.tsx` | S |
| **Ambient-blob layer (most deferrable)** — 1–2 slow `--accent-ambient` blobs (opacity .08–.12) as `.viewport::before/::after`, transform+opacity only, behind `.bed`, **in CSS not the canvas**. Ship only if the perf budget survives everything above. | `styles.css`, `Viewport.tsx` | M |

**Exit criteria:** (1) `frameloop='demand'` verified jank-free with damping on integrated GPU, else heavy 3D descoped; (2) camera lerp does not jitter against OrbitControls (controls disabled during flight); (3) spawn restores `transparent:false` at completion (correct depthWrite for the double-sided gray part); (4) **`bench/judge.mjs judgeVision` confirms `asymmetryPreserved` + feature counts did not regress** after the lighting change; (5) reduced-motion snaps all three rigs to final state; (6) fps no worse than Phase 1 baseline during orbit/spawn.

---

### Phase 4 — Polish, a11y, perf hardening

**Goal:** make the new behaviors contractual and audit-proof.
**Driver skills:** ui-ux-pro-max (a11y), design-system, frontend-design.

| Task | Files | Effort |
|---|---|---|
| **Reduced-motion + will-change hygiene audit** — confirm grid-rows collapse + smooth-scroll are disabled under reduced-motion; strip any stray `will-change` on idle nodes; scan all new rules for layout-triggering props. | `ChatPanel.tsx`, `styles.css`, `Viewport.tsx` | M |
| **Focus/ARIA coverage on new elements** — every new interactive element is a real control or carries `role` + `tabindex` to inherit `--ring`; press-scale never removes the focus ring; every state-conveying animation pairs with existing `aria-live` text. | `styles.css`, `Viewport.tsx` | S |
| **SPEC.md §12 "Visual design system & motion contract"** — codify glass-only-on-floating-surfaces, the reduced-motion guarantee, mesh-spawn + camera-ease + compile-pulse behaviors, the no-animation-while-compiling rule, and the font decision, so a future change can't silently remove them. | `docs/SPEC.md` | S |
| **Mobile pass** — confirm `.perf-lite` engages on `<=860px` mobile mode; verify stagger/orchestrated-reveal behavior on bottom sheets; cap glass on mobile GPUs. | `styles.css`, `App.tsx` | M |

**Exit criteria:** no `will-change` on idle nodes; reduced-motion verified end-to-end (CSS + JS scroll + r3f rigs); SPEC §12 merged; mobile fps acceptable with `.perf-lite`.

---

## 5. Skills setup ("the right set of skills")

**Author exactly TWO project skills** (directory/`SKILL.md` form — repo convention, verified via `add-ai-engine/`, `openscad-contract/`). The motion-perf "fixing-motion-performance substitute" lives in **one place only** (`vibemesh-ui`), resolving the triplication the principal flagged.

### `.claude/skills/vibemesh-ui/SKILL.md` — owns ALL DOM/CSS

- **Frontmatter `description`:** *"Use when editing any DOM/CSS in Vibemesh-AI — `src/styles.css` tokens, the 3-col shell in `src/App.tsx`, or any component under `src/components/` EXCEPT the r3f scene graph inside `Viewport.tsx`. Covers the dark-engineering visual system, glass-over-canvas rules, interaction-state contract, and the motion-perf checklist. Do NOT use for Three.js/canvas animation (see vibemesh-3d-motion)."*
- **Rule sections:**
  1. **Tokens are law** — list the families; ban raw hex/px; document the 2-layer-with-bands choice and `:root` as single source of truth.
  2. **Glass rule** — `--glass-*` tiers, which surface gets which tier, the ≥84%-behind-text contrast rule, the `@supports`/`.perf-lite` fallback, blur capped at 8px / no saturate.
  3. **Interaction-state contract** — every control gets rest/hover/`:focus-visible`(`--ring`)/`:active`(press-scale 0.97); primary CTAs get at-rest `--glow-accent`.
  4. **Motion-perf checklist** (the substitute, here once) — transform+opacity only (grid-rows the sole height exception); no animation under `[data-busy]`; CSS-only, no Framer Motion; transient `will-change`; durations 150–300ms micro / ≤400ms complex; DOM motion shorter than the 350ms render debounce.
  5. **State binding** — read/write the zustand stores only.
  6. **Font decision** — record the §3.3 resolution + one-edit swap path.

### `.claude/skills/vibemesh-3d-motion/SKILL.md` — owns ONLY the `<Canvas>` subtree

- **Frontmatter `description`:** *"Use when animating or lighting the Three.js scene in Vibemesh-AI (the `<Canvas>` subtree of `src/components/Viewport.tsx`): mesh spawn, camera framing, drei Environment/ContactShadows, loading pulse. Do NOT touch DOM/CSS (see vibemesh-ui) and NEVER break the openscad-wasm → STL → mesh pipeline."*
- **Rule sections:**
  1. **Pipeline is sacred** — geometry is a disposed prop (L129/L137); animate material/group transform, never swap/clone geometry; openscad-wasm is single-shot.
  2. **Spawn** — `useFrame` scale/opacity lerp keyed on `stlVersion`; restore `transparent:false` at end.
  3. **Camera** — lerp inside the `fitVersion`-gated CameraFit only; `controls.enabled=false` during flight; ortho-zoom handling; never key camera on `stlVersion`/param changes.
  4. **Loading pulse** — prefer CSS; in-scene only as fallback; stop instantly when status flips.
  5. **Grounding** — Environment env-only (keep `#2f3236` background); `ContactShadows frames={1}`; budget against the perf-chip readout; CaptureRig verification gate.
  6. **Reduced-motion + dt-clamp** — owns the shared `usePrefersReducedMotion` hook; clamp dt to `1/30`.

### How the installed skills plug in

- **frontend-design** — the **anti-slop GATE**, run as a *reviewer* before merging any visual change (no-Inter/no-Space-Grotesk advisory, no-generic-palette). It is not an author.
- **ui-ux-pro-max** — the **lookup oracle** for Modern Dark Cinema / Spatial UI specifics, palettes, font pairings, and the motion/a11y severities. Already used to derive these conventions; keep consulting per-component.
- **design-system** — **persists tokens**: ratifies `src/styles.css :root` as source of truth (2-layer-with-bands) plus the standardized button/slider interaction-state specs. **Do not** impose its native 3-layer naming rebuild.
- **ui-styling** — **not applicable** (targets shadcn/Radix/Tailwind; this app is intentionally vanilla CSS). Skip unless a component library is adopted (it is not).

### Not-installed skills: install vs substitute

- **fixing-motion-performance** — **substitute** (in-skill checklist in `vibemesh-ui`, §4 above). It's the central perf risk; the rules must live in-repo as a gate since no automated audit exists. *Optionally install* the marketplace original if the team wants the automated audit.
- **impeccable** — **substitute** with CSS `animation-delay` staggered reveals (each view has few elements; no lib needed).
- **taste-skill** — **substitute** by encoding the conventions directly; the `DESIGN_VARIANCE/MOTION_INTENSITY/VISUAL_DENSITY` knobs map onto the `--glass-*`/`--accent-ambient`/`--density` tokens. *Install only if* the team wants the parametric knobs as a first-class control.
- **grill-me** — **substitute** with this plan's explicit requirements + the §7 decision gates. *Install only if* the team wants the adversarial-requirements pass.

---

## 6. Risks & mitigations (severity-sorted)

| # | Risk (verified) | Mitigation | Sev |
|---|---|---|---|
| 1 | **Backdrop-blur over `frameloop='always'` canvas on integrated GPUs.** No explicit `frameloop` + `enableDamping` on (L800) → compositor re-samples under each of 5 blurs 60×/sec *at idle*; the plan adds a 6th (blobs) + Environment + ContactShadows on top. | **RESOLVED — adopt `frameloop='demand'` (ADR 0001).** Source-verified: idle rAF stops entirely, damping settles smoothly via drei invalidate-on-`'change'`. Invariant: every self-driving `useFrame` rig must `invalidate()` per tick. Still cap blur 8px, drop hud-bar `saturate`, ship `@supports`+`.perf-lite`. One empirical confirm left (integrated-GPU idle rAF + damping feel). | **High → mitigated** |
| 1b | **`<Environment preset>` fetches a multi-MB HDRI from a remote githack CDN** (`useEnvironment.js:8`) — breaks the local-first/offline ethos. | **Self-host the HDRI under `public/`** (preserves the chosen IBL look); lights-only grounding is the fallback. Gate 3.0 sub-task — must land before `<Environment>` ships. | **Med** |
| 2 | **Animation during an active WASM compile.** `tabpulse` + HUD pulse run while `compileStatus==='compiling'`; STL parse + EdgesGeometry build are main-thread. | `[data-busy]` gate in **Phase 1**, before any entrance/stagger. Every loop no-ops under `[data-busy]` except the one loader. Stagger fires on data-arrival, never per `streamText` token. | **High** |
| 3 | **Contrast collapse on translucent glass over a bright model** (understated by the slices: `.perf-chip` *and* HUD `.dim-label` *and* `.ac-hint` all use mid-grays). | Phase-1 audit **before** tier tokens are defined; computed against composited color, worst-case light model. ≥84% bg + `--text-dim`+ on glass. | **High** |
| 4 | **Reduced-motion JS gap for r3f.** CSS block (L145) can't reach `useFrame`; new JS smooth-scroll is net-new and uncovered. | One shared `matchMedia` hook (owned by `vibemesh-3d-motion`) hard-cuts all rigs; smooth-scroll gets its own guard. | **High** |
| 5 | **Camera fly-in fights OrbitControls damping + ortho-zoom gap.** Both call `controls.update()`; CameraFit sets position but not zoom (L933). | Lerp stays inside the `fitVersion` guard; `controls.enabled=false` during flight; keep ProjectionFit mount-snap for ortho or extend lerp to `camera.zoom`; clamp dt. | Med |
| 6 | **Framer Motion bundle + second scheduler** (~34KB gz next to the ~14MB WASM chunk). | **Accepted (decision §7.3).** Discrete transitions only; gated under `[data-busy]` + `useReducedMotion()`; transform/opacity only; never drives the `<Canvas>`. `frameloop='demand'` (Phase 3) keeps the canvas rAF idle so the two schedulers don't compete. Ratified as binding in `vibemesh-ui` §4. | Med |
| 7 | **Token restructure regression across 1345 lines.** Any consumed-property rename silently breaks components. | Pure reorganization, **zero renames**, own bisectable commit; diff every `var()` ref; fix `--bg`/`--fs-h2` here. | Med |
| 8 | **Environment/ContactShadows contaminate the refine CaptureRig PNGs** (refine fidelity + bench depend on them). | Hard verification gate before merge; toggle ContactShadows off during shoot if needed; keep `#2f3236` background; run `judgeVision`. | Med |
| 9 | **Panel-collapse/tab transition reflows the 3-col grid mid-animation** → canvas resize hitch. | Collapse motion = opacity/transform on the panel body, decoupled from the grid-column change; grid-rows collapse degrades to instant on old Safari. | Low |

**Open gaps the plan now closes (were missing from the slices):** a measured perf budget (Phase-1 baseline + per-phase fps gate on integrated graphics); a mobile story (Phase 4 `.perf-lite` on `<=860px`); font-licensing/FOUT for any swap (folded into §3.3 + §7); and a kill-switch — **`.perf-lite` doubles as the field rollback flag** given there is no UI test suite.

---

## 7. Decisions — RESOLVED (locked 2026-06-17)

1. **Typography / identity → SWAP.** Off Space Grotesk → **Bricolage Grotesque** (non-banned display face). See §3.3. *(Overrides the Lead's keep-for-v1 default — product owner elected full anti-slop compliance.)*
2. **3D scene ambition → FULL premium scene — CONFIRMED VIABLE (ADR 0001).** Camera fly-in + mesh spawn + drei Environment (IBL, self-hosted HDRI) + ContactShadows + CSS ambient blobs. The `frameloop='demand'` gate is **resolved by source analysis** (no descope, no hybrid); only an integrated-GPU idle-rAF + damping-feel empirical confirm remains. *(Overrides the Lead's conservative-v1 default; architect confirmed the bold path holds.)*
3. **Motion → ADD Framer Motion** for the DOM (discrete transitions only) + `useFrame` for the canvas. Guardrails in Principle §9 and `vibemesh-ui` §4 are binding. *(Overrides the Lead's CSS-only default.)*
4. **Accent → Cobalt `#3d6ff5` stays.** The `#22C55E` IDE-reference green is rejected (clashes with `--ok`).
5. **hud-bar `blur(12px) saturate(1.15)` → `blur(8px)` no-saturate** — accepted as an intentional richness-for-perf tradeoff, not a silent edit.
6. **Glass depth vs legibility → legibility wins.** The Phase-1 AA contrast fix raises glass opacity above the maximally-transparent values; accepted.

---

## 8. Sequenced execution recipe (Claude Code prompts)

Run sequentially. **Each prompt names exactly one skill context** so DOM and 3D work never share a session — this is the isolation guarantee that protects the WASM pipeline.

**Phase 0 — decisions & skills (no app code)**
1. `Author .claude/skills/vibemesh-ui/SKILL.md and .claude/skills/vibemesh-3d-motion/SKILL.md per §5 of the UI/UX plan. Use directory/SKILL.md form. The motion-perf checklist lives only in vibemesh-ui. Record the typography decision from §3.3.`

**Phase 1 — foundation (vibemesh-ui context only; DOM/CSS)**
2. `Using vibemesh-ui: add the [data-busy] gate — derive busy from compileStatus/generating/slicing in Viewport.tsx, reflect data-busy on .viewport, and scope .status-dot.busy and .tabpulse under :not([data-busy]).`
3. `Using vibemesh-ui + ui-ux-pro-max: run the glass contrast audit (perf-chip, HUD dim-label, ac-hint) computing 4.5:1 against a worst-case light model behind; raise text tokens to --text-dim+ and bg to >=84%. Then add the --glass-* / --glass-edge / --sh-glass / --glow-accent / --accent-ambient token set and repoint the five glass surfaces; drop hud-bar saturate; cap blur at 8px. Add the @supports + .perf-lite fallback.`
4. `Using design-system: restructure styles.css :root into primitive/semantic/component commented bands with ZERO renames of consumed properties (own commit). Define the missing --bg and --fs-h2 and verify the crash screen renders.`
5. `Capture the perf baseline: idle, orbit, and compile-window fps on integrated graphics via the perf-chip tris/fps readout. Record it for regression gating.`

**Phase 2 — DOM motion (vibemesh-ui context only)**
6. `Using vibemesh-ui: add fade-rise + press-scale keyframes; apply press-scale 0.97 to all interactive controls; add :focus-visible border-glow and at-rest --glow-accent on primary CTAs.`
7. `Using vibemesh-ui + impeccable patterns: add param-list stagger (RightPanel), chat-message fade-rise + reduced-motion-guarded smooth scroll (ChatPanel), and the EmptyState orchestrated load. Gate all under [data-busy] + reduced-motion.`
8. `Using vibemesh-ui: add the origin-aware .modal entrance, animatable param-group collapse (grid-template-rows 1fr/0fr), and the tab/panel crossfade decoupled from the App.tsx grid track. Re-measure fps vs baseline; gate on no regression.`

**Phase 3 — 3D scene (vibemesh-3d-motion context only; never touch styles.css except the compile-pulse hairline)**
9. `Using vibemesh-3d-motion: VERIFY frameloop='demand' + invalidate() works with enableDamping on a mid/low GPU. If it doesn't, stop and report — heavy 3D is descoped.`
10. `Using vibemesh-3d-motion: add the shared usePrefersReducedMotion hook + dt clamp, then the fitVersion-gated camera fly-in (controls disabled during flight, ortho handled) and the stlVersion-keyed mesh spawn (mutate material/group only — never clone the disposed geometry).`
11. `Using vibemesh-3d-motion: add the in-canvas compile pulse (CSS hairline primary), then drei Environment (env-only, keep #2f3236 background) + ContactShadows frames=1. Then run the CaptureRig verification gate and bench/judge.mjs judgeVision; confirm asymmetryPreserved + feature counts did not regress.`
12. *(deferrable)* `Using vibemesh-ui: add the CSS ambient-blob layer on .viewport — only if the Phase-3 perf budget survived.`

**Phase 4 — hardening**
13. `Audit: reduced-motion coverage (CSS + JS scroll + r3f rigs), will-change hygiene, focus/ARIA on new elements, and the mobile .perf-lite path on <=860px.`
14. `Using openscad-contract precedent: add SPEC.md §12 "Visual design system & motion contract" codifying glass rules, reduced-motion guarantee, mesh-spawn/camera-ease/compile-pulse behaviors, and the font decision.`

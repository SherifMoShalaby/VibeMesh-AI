---
name: vibemesh-ui
description: Use when editing any DOM/CSS in Vibemesh-AI — src/styles.css tokens, the 3-col shell in src/App.tsx, or any component under src/components/ EXCEPT the react-three-fiber scene graph inside Viewport.tsx. Covers the dark-engineering visual system, glass-over-canvas rules, the interaction-state contract, the Framer Motion + motion-perf rules, and the typography decision. Do NOT use for Three.js / canvas animation — that is vibemesh-3d-motion's job.
---

# Vibemesh-AI DOM/CSS design system

This skill owns everything the user sees that is **not** inside the `<Canvas>`: the 3-column shell (`src/App.tsx`), every component under `src/components/` (TopBar, ChatPanel, RightPanel, EmptyState, ModelMenu, EnginesModal, Dialogs, icons), and the single stylesheet `src/styles.css` (one `:root` token block, ~1345 lines). The app is **vanilla CSS by design** — no Tailwind, no Radix/shadcn, no CSS-in-JS. Keep it that way; the only sanctioned runtime dependency this skill adds is **Framer Motion**, and only for the DOM.

The north star is "Modern Dark Cinema": elevate the existing machined-dark identity with glassmorphism, depth, and intentional motion — **never a rebrand**. Keep cobalt `--accent: #3d6ff5` and the gunmetal neutral ramp.

## 1. Tokens are law

Every color, space, radius, shadow, duration, and font is a `:root` custom property in `src/styles.css` — **never a raw hex or px in component CSS**. All accent tints derive from `--accent` via `color-mix()` (the existing `--accent-soft/-line/-glow` idiom) so one hue change re-tints the whole UI.

`:root` is organized into three commented bands (a pure reorganization with **zero renames** of consumed properties):

1. **PRIMITIVES** — numbered neutral ramp (`--gray-950..--gray-300` from the current `#0d0e11..#565c66`), raw cobalt hues, raw rgba edges.
2. **SEMANTIC** — role names repointed at primitives: `--panel`, `--panel-hi`, `--raised`, `--stage`, `--text/-dim/-faint/-ghost`, `--accent` ramp, `--ok #46d39b`, `--warn #e7b955`, `--err #f2705c`.
3. **COMPONENT** — `--glass-*`, `--glow-accent`, `--sh-*`, `--ring`.

Two tokens are **referenced but undefined today** and crash-screen-relevant — define them: `--bg` (alias of `--gutter`) and `--fs-h2` (~22px), both consumed at L1340/1342 by the ErrorBoundary fallback.

## 2. Glass = viewport overlays ONLY

`backdrop-filter` is permitted **only** on the small fixed-size chrome floating over the `.viewport` canvas: `.tool-rail`, `.hud-bar`, `.assembly-chip`, `.perf-chip`, `.sel-bar`, and popover menus. Side panes (`.pane`) stay solid `--panel` and never blur. Never blur a full-canvas surface (no full-screen compiling scrim, no parallax sheet).

Use the glass tier tokens; never re-type a blur radius or translucency inline:

```css
--glass-blur: 8px;          /* capped — never higher; no saturate() on canvas-overlay glass */
--glass-edge: rgba(255,255,255,0.08);                              /* hairline border */
--glass-1: color-mix(in srgb, var(--panel) 84%, transparent);      /* perf-chip / assembly-chip (carry text) */
--glass-2: color-mix(in srgb, var(--panel) 86%, transparent);      /* hud-bar */
--glass-3: color-mix(in srgb, var(--panel-hi) 90%, transparent);   /* sel-bar / menus */
--sh-glass: 0 16px 48px rgba(0,0,0,.55), 0 4px 16px color-mix(in srgb, var(--accent) 6%, transparent), inset 0 1px 0 var(--glass-edge);
```

Rules: **blur capped at 8px, no `saturate()`** (it compounds compositor cost). Text on any glass surface uses bg opacity **≥84%** AND a token of `--text-dim` (`#a8aeb8`) or lighter — never `--text-faint`/`--text-ghost` on glass — verified at **4.5:1 against the worst-case light model behind it** (composited color), not against solid `--panel`. Ship fallbacks:

```css
@supports not (backdrop-filter: blur(1px)) { /* raise glass bg to ~96% */ }
.perf-lite .tool-rail, .perf-lite .hud-bar, /* … */ { backdrop-filter: none; background: var(--panel); }
```

`.perf-lite` is toggled on `<body>` by a low-power probe (`navigator.hardwareConcurrency` + a startup rAF fps sample) **and** by `prefers-reduced-transparency`. It doubles as the field rollback flag (there is no UI test suite).

## 3. Interaction-state contract

Every interactive control gets four states, and never loses the focus ring:

- **rest** → **hover** → **`:focus-visible`** (inherits `--ring`) → **`:active:not(:disabled)`** (press-scale 0.97→1.0).
- Primary CTAs (`.send-btn`, EmptyState Generate) carry an at-rest accent glow: `--glow-accent: 0 0 18px -4px var(--accent-glow)` (one token; replaces the glow re-typed at L399/L703/L947).
- Focus/hover border-glow uses `--accent-soft` + `--glow-accent`; extend the composer `:focus-within` idiom (L632/L1100) to discrete chips/buttons.
- Press-scale and glow must **never** remove or obscure the `--ring` focus outline.

## 4. Motion — Framer Motion for the DOM, under strict guardrails

DOM motion uses **Framer Motion** (`motion` components + `AnimatePresence`). It must never spill into the canvas, and must obey every rule below — these exist because a second animation scheduler runs next to the r3f `useFrame` loop and the openscad-wasm STL parse.

1. **Transform + opacity only.** Animate `x/y/scale/opacity` — never `width`/`height`/`top`/`left`/`margin`. The single sanctioned height exception is param-group collapse via `grid-template-rows: 1fr ↔ 0fr` (CSS, not Framer).
2. **Nothing animates while the canvas is busy.** A derived `busy = compileStatus==='compiling' || generating || slicing` is reflected as `data-busy` on `.viewport`. Gate entrances/loops so they no-op under `[data-busy]` — **except one sanctioned loader** (the compile pulse). STL parse + `EdgesGeometry` build are main-thread in the 100–700ms post-worker window; concurrent motion stutters.
3. **Reduced-motion is mandatory.** Use Framer's `useReducedMotion()` to hard-cut to final state, AND keep the CSS `@media (prefers-reduced-motion)` block (L145) intact for non-Framer animation. Any JS `scrollTo({behavior:'smooth'})` needs its own `matchMedia` guard.
4. **No continuous DOM animation.** Framer drives **discrete transitions only** — entrances, layout, press, modal in/out. Infinite/looping animation is reserved for loaders/streaming and stays CSS. This keeps Framer's rAF idle whenever the canvas is rendering.
5. **Motion budget.** 1–2 key elements per view; micro-interactions 150–300ms; orchestrated reveals ≤400ms total including stagger. DOM motion is always shorter than the 350ms render debounce.
6. **`will-change` is transient.** Apply only during an active transition and remove after (Framer mostly manages this — do not add permanent `will-change` per panel; it stands up compositor layers and starves the canvas of GPU memory).
7. **Shared easing.** Spring/ease feel comes from the existing `--ease-out cubic-bezier(0.16,1,0.3,1)`; mirror it in Framer transitions so DOM and canvas share one rhythm.

Canonical DOM motions to implement (Phase 2): `fade-rise` entrance (opacity 0→1, y 6–8px→0) for chat messages, param rows (staggered ~40ms via index, on group-expand/model-load only — never per slider drag), and EmptyState cards/hero; origin-aware `.modal` entrance (scale 0.96→1 + y 8px→0, ~280ms) distinct from the `.scrim` fade; press-scale on all controls; tab/panel crossfade **decoupled from the `App.tsx` grid-column change** (a grid-track snap forces a canvas resize hitch — animate opacity/transform on the panel body instead).

## 5. State binding

All UI state reads/writes the existing zustand stores (`src/state/store.ts`, `src/state/ui.ts`) — `compileStatus`, `generating`, `streamText`, `stlVersion`, `fitVersion`, `leftCollapsed/rightCollapsed`, `rightTab`, panel widths. No component-local animation state that duplicates store state.

## 6. Typography decision (locked)

**Display/hero font swapped off Space Grotesk → `Bricolage Grotesque`** to satisfy frontend-design's anti-slop ban (which bars both Inter and Space Grotesk). Change in **one place**: `--font-display` / `--font-hero` (L61/L65) plus the Google Fonts `<link>` in `index.html`. Keep `--font-ui: 'Hanken Grotesk'` and `--font-mono: 'IBM Plex Mono'` unchanged. **Never introduce Inter** (also banned). Consumers needing no edit: `.brand-name` (L268), `.empty h1` hero (L1085) — they read `--font-display`. Watch FOUT/CLS: use `font-display: swap` and preload the hero weight.

## 7. Accessibility floor (never regress)

Preserve every existing guarantee: `--ring` focus-visible outline, ARIA roles (`tab`/`dialog`/`menu`/`log`/`status`, `aria-live="polite"`), `::selection` contrast, and the reduced-motion block. Every animation that conveys state (compiling, streaming) must pair with a non-animated text equivalent (the HUD `Model ready` / `Rendering…` pattern). New interactive elements are real controls or carry `role` + `tabindex`.

## 8. Verification

After DOM changes, run `npm run lint` + `npm run build`. For anything visible, use the preview workflow to confirm: every glass surface text passes 4.5:1 over a bright model; new motion no-ops under `[data-busy]` and reduced-motion; fps during idle/orbit/compile is no worse than the recorded Phase-1 baseline (read the perf-chip tris/fps HUD). Run the `frontend-design` skill as an anti-slop reviewer before merging a visual change. Use `ui-ux-pro-max` as the lookup oracle for Modern Dark Cinema / palette / motion specifics.

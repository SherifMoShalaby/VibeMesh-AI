# Vibemesh — Design Context (for a visual redesign)

A briefing for redesigning the Vibemesh UI. Pair this with the attached codebase
(the live design system lives in `src/styles.css`; components in `src/components/`).
**This is a redesign of a working, shipped product — not a greenfield build.** Keep the
information architecture and the non-negotiables below; modernize the surface.

---

## 1. What the product is

**Vibemesh** turns a plain-language description (optionally a reference photo) into a
**parametric 3D-printable model**. The AI writes OpenSCAD code; the browser compiles it to
geometry (openscad-wasm in a Web Worker); every dimension becomes a **live slider**; the user
exports slicer-ready `.3mf` / `.stl` / `.scad`. Local-first — projects in localStorage, no cloud.

The loop the UI exists to serve:
> **describe → see the 3D model → tweak sliders / chat for changes → export for printing**

**Audience:** 3D-printing makers and hobbyists, plus some semi-pro/engineering users. It's a
**precision tool** — a CAD cockpit — but should feel inviting, not intimidating. Think
"Linear/Blender polish meets a maker workbench," not "enterprise dashboard."

## 2. Information architecture (preserve this)

```
┌─────────────────────────────── Top bar (52px) ───────────────────────────────┐
│ brand · project name/switcher          flow rail        AI-status chip · help │
├───────────────┬─────────────────────────────────────────┬─────────────────────┤
│  CHAT (340px) │            VIEWPORT (1fr) — HERO         │  RIGHT PANEL (312px)│
│               │                                           │  ┌ tabs ──────────┐│
│  messages     │   3D model on a print-bed grid            │  │ Parameters│Code││
│  (user /      │   floating HUD chips in the 4 corners     │  └────────────────┘│
│   assistant)  │   vertical tool rail (left)               │  grouped sliders,   │
│  code chips   │   PARTS bar · dims · quality · printer     │  dropdowns, toggles │
│  refine bar   │   section-cut slider                       │  (live re-render)   │
│  attachments  │                                           │  — or — code editor │
│  composer +   │                                           │    w/ line gutter   │
│  engine pick  │                                           │                     │
└───────────────┴───────────────────────────────────────────┴─────────────────────┘
```

- **The viewport is always the largest area and the visual hero.** The model is the subject;
  panels frame it. (On the current build panels are lighter graphite floating on a near-black
  gutter, Blender-style "areas," 8px radius, 6px gaps.)
- **Mobile (<900px):** viewport on top, compact chat below, right panel slides up as a
  **bottom sheet** via a floating toggle.

## 3. Current design language (the starting point)

Theme name in code: **"Workshop Warm"** — calm graphite + a single filament-orange accent.

**Color tokens (dark theme):**
| Token | Value | Use |
|---|---|---|
| `--gutter` | `#19191a` | app background behind the floating panels |
| `--bg` | `#2b2d30` | viewport stage (lighter than panels — model is hero) |
| `--panel` | `#242526` | chat / right panel / topbar surfaces |
| `--raised` / `--raised-hi` | `#2e2f31` / `#38393c` | buttons, controls, hover |
| `--inset` | `#1d1e1f` | inputs, code well |
| `--line` / `--line-strong` | `#39393b` / `#47484a` | hairline borders, dividers |
| `--text` / `--text-dim` / `--text-faint` | `#ececec` / `#b4b4b6` / `#909093` | 3-step text ramp |
| `--accent` / `--accent-hot` | `#f5792a` / `#ff8d49` | THE one accent (filament orange) |
| `--accent-text` | `#ff9d5c` | links, active-tab text, eyebrows (lighter for contrast on dark) |
| `--on-accent` | `#211309` | text on orange fills — **white fails contrast on orange** |
| `--ok` / `--warn` / `--err` | `#6fcf97` / `#e5b454` / `#e5604c` | status — dots + text only, never borders |

**Type:** `Inter` for everything UI; `IBM Plex Mono` strictly for **code, keyboard keys, and
numbers** (tabular-nums on dims/param values). Sizes are small and dense: body 13px, small
11.5px, micro 11px, titles 15px, brand 18px, hero `clamp(30–46px)`.

**Shape & depth:** 5px radius on controls, 8px on cards/panels/modals. Soft layered shadows
(`--sh-raise`, `--sh-float`, `--sh-modal`). HUD chips use `backdrop-filter: blur(4px)` over the
viewport. Range-slider thumbs are round, accent-filled.

**Motion:** quick 0.12–0.14s ease transitions; a 1.2s pulse on live/streaming states; full
`prefers-reduced-motion` support.

**House rules baked into the current system (worth keeping as principles):**
- **Exactly one accent color.** No second hue competing with orange.
- **Status is carried by color + a dot/glyph, never by a colored border.**
- **Dashed borders mean drop-zones only**; everything else is solid.
- **Mono is for code/keys/numbers only** — never for prose or labels.
- Keyboard-first: visible focus ring on everything focusable; shortcut overlay (`?`).

## 4. Component inventory (what needs to look good)

- **Top bar:** brand mark + wordmark, project name (inline-editable) with a switcher dropdown,
  a "flow rail" breadcrumb (describe › generate › render › ready), an AI-status pill (colored
  dot + engine name, opens the Engines modal), help button.
- **Chat panel:** user vs assistant message bubbles; a **"⌬ MODEL CODE UPDATED · RESTORE"** chip
  on assistant messages that carried code; **action chips** (IMAGE PROMPT, REFINE PASS); image
  attachment thumbnails; a **refine-against-reference** bar; the composer (textarea + attach +
  engine/model selectors + Send); a rich **empty state** (hero headline, idea chips, 3 example
  cards).
- **Viewport HUD:** corner chips for compile status, **part dimensions** (mm, with over-bed
  warning), a **printer-bed selector**, a **quality preset** selector (Draft/Standard/Fine/Ultra),
  a **PARTS bar** (multi-part designs), a vertical **tool rail** (fit, orient, move/rotate,
  section, delete, undo/redo), a **section-cut slider**.
- **Right panel:** tabbed **Parameters** (groups of labeled sliders + numeric inputs, enum
  dropdowns, boolean toggles; an "advanced" toggle) and **Code** (OpenSCAD editor with a
  line-number gutter, error panel, collapsible log).
- **Modals:** Engines (connect AI providers, status dots, key inputs), Help/Shortcuts (kbd
  rows), small confirm/custom-bed dialogs, an Export dropdown menu (.3mf / .stl / parts / .scad).

## 5. What to modernize (the brief)

Push the surface forward while keeping the cockpit. Specifically invited:
- **Sharper visual hierarchy & spacing rhythm** — the UI is information-dense; give it more
  intentional spacing, grouping, and a clearer focal path to the viewport.
- **A more cohesive HUD** — the floating chips work but can feel scattered; unify them into a
  calmer, more legible system.
- **A warmer, more confident empty state / onboarding** — first-run should sell the
  describe→print magic.
- **Modern assistant-style chat** — the conversation could feel more like a contemporary AI
  copilot (clearer turns, better code/version affordances, smoother streaming).
- **Refined depth & materials** — tasteful elevation, subtle texture/finish that reads
  "precision workshop," not flat-gray.
- **Consistent, expressive iconography** and micro-interactions.
- **Fix the known accessibility gap:** the orange accent fails WCAG contrast for some text/UI
  uses (flagged in `docs/UX-AUDIT-2.md`). Resolve contrast properly in the new palette.

## 6. Non-negotiables (do NOT change)

- **Dark theme.** A bright UI glares against the 3D model; the stage must stay dark and the
  **model must remain the hero/largest element.**
- **The 3-pane cockpit IA** (chat · viewport · parameters) and the live-slider model.
- **Keep it dense and keyboard-friendly** — this is a pro tool; don't inflate it into a
  marketing landing page or hide controls behind menus.
- **One accent identity** (orange is the brand — a new hue is fine, but stay monochromatic-accent).
- **Mono only for code/keys/numbers.**
- Must stay fully **responsive** (desktop cockpit → mobile viewport-first + bottom sheet).

## 7. Deliverables wanted from the redesign

1. A refreshed **design-token set** (color ramp incl. an accessible accent, type scale, spacing,
   radii, elevation, motion).
2. Key screens redesigned: **desktop cockpit** (with a model in the viewport), the **empty/first-run
   state**, a **chat turn with a code/version chip**, the **parameters panel**, and the
   **viewport HUD**. A mobile bottom-sheet view if time allows.
3. Notes on what changed and why, mapped to the goals in §5.

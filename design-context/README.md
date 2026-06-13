# Vibemesh — Redesign Context Pack

Everything Claude Design needs to redesign **Vibemesh** (AI text/image-to-CAD for 3D printing).
This is a **redesign of a shipped, working product** — keep the information architecture and the
non-negotiables; modernize the surface.

## What's in here

| File | What it is | How to use it |
|---|---|---|
| **BRIEF.md** | The full design brief — product, IA, current tokens, what to modernize, non-negotiables, deliverables | **Read this first.** It's the spec. |
| **current-design-system.css** | The actual current stylesheet (real color/type/spacing tokens, every component class) | The ground-truth design system to evolve. |
| **screenshots/** | The current UI, the thing to redesign | Visual reference — match these states in the new design. |

## Screenshots (current UI)

| File | Screen | Why it matters |
|---|---|---|
| `01-cockpit-with-model.png` | **Main cockpit** — chat · 3D viewport · parameter sliders | The hero screen. Shows the 3-pane layout, tool rail, dims HUD, PARTS bar, workflow rail. |
| `02-empty-state.png` | **Empty / first-run** | Hero headline, idea chips, example cards. First impression to modernize. |
| `03-code-panel.png` | **Code tab** (right panel) | OpenSCAD editor with line-number gutter — mono type surface. |
| `04-engines-modal.png` | **Engines modal** | AI provider connection UI; status dots, Test/Connect. |
| `05-export-menu.png` | **Export dropdown** | The `.3mf / .stl / parts / .scad` menu, anchored top-right. |

## The one-paragraph version

Vibemesh turns a plain-language prompt (optionally a reference photo) into a parametric,
3D-printable model: the AI writes OpenSCAD, the browser renders the 3D mesh, every dimension
becomes a live slider, and the user exports print files. The loop is
**describe → see the model → tweak sliders / chat → export.** It's a precision maker's
cockpit — dense, dark, keyboard-friendly, with the 3D viewport as the hero.

## Hard constraints (do NOT change) — full list in BRIEF.md §6

- **Dark theme**; the 3D model stays the hero and the largest element.
- The **3-pane cockpit IA** (chat · viewport · live-parameter panel).
- Dense + keyboard-first (a pro tool, not a marketing page).
- **One accent identity** (currently filament orange); mono type only for code/keys/numbers.
- Fully responsive (desktop cockpit → mobile viewport-first + bottom sheet).

## What to deliver — full list in BRIEF.md §5 & §7

A refreshed, **accessible** token set (the current orange fails WCAG contrast for some uses)
plus redesigned key screens: the cockpit, the empty state, a chat turn with a version chip,
the parameters panel, and the viewport HUD. Note what changed and why.

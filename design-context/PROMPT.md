# Starter prompt for Claude Design

Paste the block below into Claude Design after attaching this `design-context/` folder.

---

Redesign **Vibemesh** — an existing, shipped web app, **not a new project**. I've attached a
context pack: read `BRIEF.md` first (the full spec), use `current-design-system.css` as the
ground-truth tokens to evolve, and treat the images in `screenshots/` as the current UI you're
redesigning.

**What Vibemesh is:** an AI text/image-to-CAD tool for 3D printing. You describe a part in plain
language (optionally with a reference photo), the AI writes parametric OpenSCAD, the browser
renders the 3D model, every dimension becomes a live slider, and you export print-ready files.
The core loop is **describe → see the model → tweak sliders / chat for changes → export.** It's a
precision maker's cockpit — dense, dark, keyboard-friendly, with the 3D viewport as the hero.

**The goal:** a more **modern, polished, confident** version of this same cockpit — think
Linear/Blender-grade refinement on a maker's workbench. The current "Workshop Warm" theme (dark
graphite panels, single filament-orange accent, Inter + IBM Plex Mono) works but feels dated and a
little scattered.

**Modernize specifically:**
- Sharper visual hierarchy and a cleaner spacing rhythm — it's information-dense; give it a clear
  focal path toward the viewport.
- Unify the floating viewport HUD (status chip, dimensions, printer/quality selectors, PARTS bar,
  tool rail) into one calmer, more legible system instead of scattered chips.
- A warmer, more confident empty / first-run state that sells the describe→print magic.
- A modern AI-copilot feel for the chat — clearer turns, better code/version affordances ("model
  code updated · restore"), smoother streaming.
- Tasteful depth and materials that read "precision workshop," consistent iconography, and
  refined micro-interactions.
- **Fix the known accessibility gap:** the current orange accent fails WCAG contrast for some
  text/UI uses — give me an accessible accent in the new palette.

**Keep these fixed (non-negotiable):**
- **Dark theme** — a bright UI glares against the 3D model; the model stays the hero and the
  largest element.
- The **3-pane cockpit layout** (chat · viewport · live-parameter panel) and the live-slider model.
- **Dense and keyboard-first** — this is a pro tool; don't inflate it into a marketing landing page
  or bury controls in menus.
- **One accent identity** (a new hue is fine, but stay monochromatic-accent).
- **Monospace type only for code, keyboard keys, and numbers** — never for prose or labels.
- Fully **responsive**: desktop cockpit → mobile viewport-first with the parameter panel as a
  bottom sheet.

**Deliver:**
1. A refreshed design-token set — an accessible color ramp, type scale, spacing, radii, elevation,
   and motion.
2. These screens redesigned, matching the attached states: the **desktop cockpit** (with a model in
   the viewport), the **empty / first-run state**, a **chat turn showing a version/code chip**, the
   **parameters panel**, and the **viewport HUD**. A mobile bottom-sheet view if time allows.
3. A short rationale: what you changed and why, mapped to the goals above.

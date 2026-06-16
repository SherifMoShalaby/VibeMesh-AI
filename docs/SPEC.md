# Vibemesh-AI — behavioral spec (image-to-CAD pipeline)

One page. The contract for the four surfaces; anything not specified here is undefined behavior.

## 1. Image as prompt
- Routes in: ▣ IMG file picker, clipboard paste (⌘V) into the chat input, drag-and-drop onto the chat panel.
- Accepted: PNG, JPEG, WebP, GIF. **Max 3 images per message**; over-limit and non-image inputs show a 3.5s notice (never silent).
- The drop overlay appears only when the drag actually contains an image file.
- Image-only send is allowed (no text): an `IMAGE PROMPT` action chip is shown in chat; the canned instruction text is sent to the AI but not rendered as user prose. Project auto-naming uses the AI's reply, not the canned text.
- If the selected engine has no vision, SEND is disabled and a warning explains why.
- Generation requests always carry the selected print bed (x×y×z + label) as context.

## 2. Refine against reference (⇄)
- Visible only when ALL hold: a successful render exists (latest code compiled — never stale geometry), the chat contains at least one user image, an engine with vision is selected, and no generation is running.
- One click sends: (a) up to **three** snapshots from **canonical fixed poses** (isometric, front, top — fitted to model, independent of user orbiting), (b) the **measured bbox in mm** as an absolute scale anchor, (c) an instruction to list discrepancies first, then return the complete corrected program. The prompt makes the DISCREPANCY LIST **non-skippable** — even on a close match the model names the nearest residual differences before correcting. If the viewport can't be captured, the failure is surfaced (composer note), never silent.
- Appears in chat as a `REFINE PASS` action chip with the snapshots.
- **Auto-fires once** after the first image-grounded model renders (vision engine, non-local, auto-repair on) — at most one automatic pass per project; the user can still trigger more manually.
- Convergence expectation: features converge in 1–3 passes; dimensions require the scale anchor; passes are probabilistic — every code version remains restorable (below).

## 3. Versioning / rollback
- Every assistant message that contained code shows `⌬ MODEL CODE UPDATED · RESTORE`; clicking adopts that version (params reset to that code's defaults) and re-renders. Disabled while generating.

## 4. Multi-part designs (PARTS bar + slicer plates)
- Convention: enum parameter named `part`, first option `all` = assembly preview. UI: PARTS bar in the viewport (⬚ ALL + one chip per piece).
- Assembly preview suppresses bed-fit warnings; each individual part shows real dims + EXCEEDS BED when applicable.
- The `all` view is the **assembled** object (pieces in their final relative positions), not a scattered layout. An optional `explode` parameter (0 = assembled, the default) fans the pieces apart along their assembly axes for an OpenSCAD-style exploded preview; it changes only the preview, never the printed per-piece geometry.
- Clicking a PARTS chip (or `all`) switches the viewed piece with an **immediate** per-piece compile (no slider debounce) and re-fits the camera — a part switch is navigation. A slider tweak, by contrast, never yanks the camera.
- The slicer view (§7) is the only place pieces are shown as bed "plates"; the PARTS bar itself still shows one piece at a time.
- `⚒ ASK AI TO SPLIT INTO PARTS` shows whenever the *currently viewed* geometry exceeds the bed (including an already-split piece that is still too big — asks to split further), except in assembly preview.
- All exports live behind ONE primary **⬇ Export** button → menu with explained choices:
  `.3mf — recommended` · `.stl` · `Parts as separate .stl files` (multi-part only) · `.scad source`;
  the menu footer notes that exports sharpen curves to at least Fine. `.scad` is also downloadable from the Code tab.
- "Parts as separate .stl files" compiles each piece at **at least Fine** quality (Ultra preview → Ultra; per-piece timeout → one Draft retry) and downloads `<project>-<part>.stl` each. **Partial success is loud**: an alert + HUD note name the failed parts; silent skips are a bug.
- `.3mf` builds ONE `.3mf` for Bambu Studio / PrusaSlicer / Orca:
  every part is a named object, parts are arranged side-by-side with 10mm gaps at z=0
  (slicer-ready plate), vertices deduplicated (key snapped to a 0.001mm weld grid;
  written coords keep full precision), millimeter units, degenerate triangles dropped.
  Single-piece designs export one object with the viewport placement baked and NO re-arrange
  (so the `.3mf` agrees with the `.stl` path); below Fine they offer a Fine re-render first.
  Multi-part `.3mf` uses the same per-piece rules (at least Fine, Draft retry, loud partial failure) as STL × PARTS.
- Param-value persistence: a slider value survives APPLY & RENDER only if the code's written default for that name is unchanged; if the new code changes the default, the code wins.

## 5. Surface quality
- Presets: Draft ($fa12/$fs2) · Standard (4/0.8) · Fine (3/0.4) · Ultra (1.5/0.25), applied as `-D '$fn=0' -D $fa -D $fs`; per-call `$fn` in code is design intent and is preserved.
- Render watchdog is per-call: interactive renders ~60s, the Draft fallback retry ~20s (so a heavy model fails fast — not 90s+90s), deliberate exports 90s. A >Draft timeout auto-retries at Draft with a visible amber note.
- `⬇ EXPORT .STL` exports what you see — but anything below Fine (incl. the default Standard preview, or an auto-degraded render) offers a Fine re-render first (decline = export as-is); Fine/Ultra previews export directly. ALL PARTS notes Draft-degraded pieces.

## 6. Safety (prompt-enforced)
- Printing advice must carry caveats for load-bearing (layer orientation), food-contact (not food-safe by default), heat, and child-related parts.

## 7. Viewport tools
- Left toolbar: shading cycle (Solid / Solid+Edges / Wireframe) · build-plate show/hide (plate is
  translucent — model visible from below) · perspective⇄orthographic · ISO/TOP/FRT/RGT/FIT views
  (F = fit) · section view (Z clip slider) · measure (two clicks on the model → mm) · PNG snapshot.
- Click the model to select: highlight + move/rotate gizmo + actions CENTER (XY), DROP (Z=0),
  RESET placement, DELETE (clears viewport only; code stays — undo or APPLY & RENDER restores;
  a HUD note says so with an inline undo link).
- **Placement undo/redo**: every placement action (gizmo move/rotate, CENTER, DROP, RESET,
  DELETE) is undoable — ⌘Z / ⇧⌘Z (Ctrl+Z / Ctrl+Y) and ↶/↷ toolbar buttons, 30 steps.
  History clears on every new render and on project switch (undo never resurrects stale
  geometry). Shortcuts don't fire while typing in a field.
- Viewport move/rotate updates the dims HUD and bed-fit warnings, and **bakes into the single-STL
  export** (facet normals recomputed); ALL PARTS exports are per-part compiles and ignore it.
  Esc deselects · Del deletes when selected. Transform resets on every new render.
- **Slicer view** (multi-part only): a HUD **View · Single / Slicer** toggle. Single is the normal
  one-mesh view; Slicer compiles every piece (at ≥ Fine, like exports) and packs them flat onto
  bed-sized plates (shelf / first-fit, **translation-only** so the layout stays WYSIWYG with export),
  spilling onto additional plates as needed. A piece that can't fit the bed as-drawn is reported
  **oversize** (never force-fit or rotated); a piece that fails to render is **named in the readout** —
  neither is ever silently dropped. Placement / section / measure tools and the PARTS bar are disabled
  in Slicer view, and the camera frames all plates. Entering Slicer (re)builds the pack and re-frames;
  toggling back to Single — or re-entering with an unchanged pack — leaves the camera as the user left it.
- **Print bed**: 15 printer presets (Creality, Bambu incl. H2D, Prusa incl. CORE One/XL, Elegoo,
  Flashforge, QIDI) + `Custom…` (prompt-parsed `W × D × H`, editable via ✎ while active). Bed
  choice and custom dims persist across sessions and are sent to the AI as generation context.

## 8. Productivity affordances
- **Camera keep**: the camera auto-fits only when a render fills an EMPTY viewport (new project,
  example load, first generation, after delete). Slider tweaks, refine passes and code edits
  never re-frame — F / FIT / double-click re-frame manually.
- **Retry**: a failed generation shows `↻ RETRY` on the error bubble — re-runs the same prompt,
  dropping only the trailing error reply (successful versions stay restorable).
- **Long-run visibility**: the streaming bubble shows elapsed seconds + the engine label; the tab
  title flips to `⌛ AI drafting…` / `⚙ Rendering…` so background tabs communicate state.
- **Prompt recall**: ↑ / ↓ in the empty chat input cycles through previously typed prompts.
- **Apply from anywhere**: ⌘Enter (global) and ⌘S / ⌘Enter (in the code editor) = APPLY & RENDER.
- **Copy code**: the CODE tab has `⧉ COPY` — copies the program with current slider values baked.
- **One-param reset**: double-click a slider (or its value) to reset just that parameter.
- **Shortcuts overlay**: `?` (or the toolbar button) opens the cheat sheet; Esc closes.

## 9. UX refactor contract (2026-06-12 — see docs/UX-AUDIT.md for rationale)
- **Plain-language copy**: chat = "DESIGN CHAT"; restorable chips are numbered ("Version N · restore",
  current one disabled "· current"); streaming shows "Building the model…"; errors lead with a human
  headline ("The model's code has an error (line N).") + ASK AI TO FIX + collapsed technical details
  (internal `/input.scad` never shown). First AI render appends a one-time guidance tip message.
- **Type scale**: 5 tokens only (`--fs-micro/small/body/title/brand`); caps + wide tracking reserved
  for micro section labels; nothing interactive below `--fs-small`.
- **One status at a time** (viewport top-left), severity-ordered: render-failed > removed-from-view >
  rendering > AI-designing > degraded-quality note > grew-out-of-view (with "fit" action) >
  first-time "click the part" hint > ✓ Ready (render ms only in advanced mode).
- **Flow rail** (top-center, ≥1180px): 1 DESCRIBE → 2 ADJUST → 3 EXPORT, steps lit by state
  (code exists / model rendered / export ready).
- **Simple by default**: Code tab, render times, triangle counts appear only in **Advanced mode**
  (persisted checkbox, right-panel footer) — except a render error always surfaces the Code tab
  (marked ⚠). The code editor has a line-number gutter; the error line is highlighted.
- **Toolbar**: SVG icons with aria-labels (no unicode glyph buttons); view buttons read
  ISO/TOP/FRONT/RIGHT/FIT. Mesh shows hover highlight + pointer cursor; a one-time hint chip teaches
  click-to-select (dismissed forever after first selection).
- **AI plumbing in one place**: the composer has a single AI pill (status dot + engine name) opening
  the Engines modal; switching engines and the Claude model picker live in the modal (per-row "Use",
  "IN USE" badge). The topbar chip reads "AI · <name>" / "Connect AI".
- **Branded dialogs** replace native prompt/confirm/alert: custom bed size (3 validated fields,
  10–2000mm) and delete-project confirmation. Project identity is ONE editable title + a ▾ menu
  (switch / new / delete).
- **Narrow widths (<900px)**: the viewport becomes the main stage (top, flexible height) with the
  chat compacted below (34vh); the toolbar turns horizontal across the viewport top (scrollable);
  status reflows under it at left, QUALITY/PRINTER selects at right (labels hidden, truncated);
  the topbar shows logo-only branding with a flexible project title. The right panel becomes a
  62vh bottom sheet with a floating "▴ Tweak / ▾ Close" toggle pinned to the viewport's bottom
  edge (rides above the sheet when open) — never unreachable.

## 10. Stale-state guarantees
- A render result only applies to the project that started it (switching projects mid-render discards the result).
- Aborting a generation leaves history consistent (consecutive user messages are merged for the API).
- The slicer pack only applies if neither the project nor the model changed while it built: every main render bumps a generation token and clears the cached pieces, so an in-flight piece build that a concurrent recompile (e.g. a slider drag in Slicer view) has superseded is discarded rather than shown — the view then rebuilds against the current parameters.

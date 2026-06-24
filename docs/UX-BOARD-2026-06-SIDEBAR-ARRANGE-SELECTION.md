# Vibemesh-AI UX Board — Sidebar, Bed-Arrange, Per-Piece Selection

> Senior board (11 agents: 4 recon → 3 design leads → 3 adversarial critiques → synthesis).
> Date: 2026-06-24. Source issues: messy sidebar, parts-in-a-line off the bed, click-selects-everything.

## Executive summary

The through-line: **Issues 2 (arrange) and 3 (per-piece selection) are one coupled feature**, not two. They share a single per-piece representation — the already-compiled `pieces[]` (from `compilePieces`, `store.ts:355`) seated by the already-existing `packPlates` nester and rendered as already-keyed individual meshes in `SlicerScene` (`Viewport.tsx`). The board's verdict is to **promote the existing read-only plates/slicer view into the interactive "Arrange" surface** where pieces are genuinely separate geometry, and to **route the user's "select / arrange on the board" intent there** — never into the fused `all` assembly mesh, which is one model-authored STL and is contractually assembled-only per `server/prompt.mjs`.

Headline recommendations:
- **Issue 1** — pure IA/CSS collapse of the 6 co-equal per-turn cards into one indented stack + a quiet collapsible metadata drawer + one compact action row, with the critical correction that the interactive Restore button must NOT become the `<details>` summary.
- **Issue 2** — reuse `packPlates` verbatim as the auto-arrange engine, add a sparse per-piece override map (deltas-over-packer, rot ∈ {0,90}), and funnel preview AND both export paths through one shared `effectivePlacements()` selector.
- **Issue 3** — keep the `selected` boolean as the tool-rail mode flag and add a SEPARATE `selectedPiece: string|null` identity, driven off `pieces[]` (mechanism c), never off connected-component island-splitting.

---

## Issue 1 — Sidebar redesign

**Approach (pure IA/CSS, no state, no feature removal):** Restructure each assistant turn in `ChatPanel.tsx` from up-to-six co-equal full-width bordered cards into a **three-tier role hierarchy** using only existing tokens (`--text` / `--text-dim` / `--text-faint`, `--s1..--s8`, `--tag`, `--fs-*`):

1. **Result marker (passive, muted).** The existing `.code-chip` ("Model code updated · v3 · current") stays as an **always-visible** quiet header row in `--text-dim`. It keeps the literal class `code-chip` on the element carrying the `current` text (load-bearing for e2e — see risks).
2. **Metadata (collapsed by default).** `expect-banner`, `applied-patterns` (the over-loaded "Kit · Machined" dropdown + removable skill pills + "+ pattern" select + "considered" promote row), and `skill-note` fold into ONE native `<details className="turn-meta">` drawer. Its `<summary>` is a **new, non-interactive label** (a caret + a skill-count `.tag`) — **NOT the code-chip and NOT containing any button.** Handlers (`regenerateWithSkills`, promote, remove) move inside unchanged, demoted to `--text-faint`. Re-skin skill pills to the existing `.tag` style instead of four competing pill systems. Of the two amber treatments (`skill-note` vs `expect-banner`), **restyle** one to a quieter non-amber weight so a normal photo+skill turn stops reading as two errors — **do not delete either** (both load-bearing).
3. **Actions (full `--text`, compact).** Restore / Regenerate / Retry become ONE right-aligned `.turn-actions` icon+label row (reusing `.chip-btn` states), visually distinct from the passive code-chip. The global floating `redo-pill` ("Rolled back · N newer") folds into this same per-turn row as a "Redo (N)" button so it stops floating detached between log and composer.

**Structural fixes:** Replace the 8 repeated `margin-left: calc(22px + var(--s2))` magic-number indents with ONE `.ai-stack` indented wrapper under `.msg.ai`. **Composer consolidation:** fold the four stacked pre-composer strips (`attach-row`, `vision-warn`, `refine-bar`, `gen-progress`) INTO the composer box — attachments as **real `<img>` thumbnail chips**, refine/warnings as an inline hint chip above the textarea, `gen-progress` as a thin top-border bar. **Composer actions:** secondary controls (image, Auto-fix, Best-of-3, ModelMenu) become their OWN `flex-wrap` sub-container, with Send a **non-wrapping sibling** (`flex-shrink:0`) outside it — so at the frozen 300px rail the secondary cluster wraps to row 2 while Send keeps its row (`margin-left:auto` alone does NOT guarantee this). **Header:** merge the two near-identical ring chips — keep the Context % ring, move SpendChip into its `title`/tooltip.

**Files:** `src/components/ChatPanel.tsx` (assistant-turn render ~428-596; pre-composer strips 599-665; composer 667-726; header 356-366), `src/styles.css` (replace 8 indents with `.ai-stack`; add `.turn-meta`/`.turn-actions`; restyle code-chip passive; composer inline thumbnails + cluster; merge header chips), `src/components/ModelMenu.tsx` (class-only).

**Effort:** L. CSS/JSX only — no geometry/state/moat exposure.

**Mandatory guards:**
- **`<summary>` click-collision (the defect all three leads inherited):** `.code-chip` is a `<button>` firing `restoreVersion`. Nesting it (or any interactive control) inside `<summary>` is invalid HTML and the toggle fights the restore click. **The summary is a plain non-interactive label; Restore lives in `.turn-actions`; keep `.code-chip` OUTSIDE the `<details>`.**
- **E2E (verified):** `surfaces.spec.ts:17` asserts `.code-chip`.first() `/current/i`; `app.spec.ts:79` asserts `.code-chip` visible after import; `surfaces.spec.ts:22-23` sets files on `.chat-pane input[type=file]` and asserts `.chat-pane img` visible. Keep the literal `code-chip` class on the version element; keep it first in DOM order; keep a `<input type=file>` inside `.chat-pane` and render attachments as real `<img>` (NOT a CSS background-image/canvas). The home `.empty-composer` ModelMenu is a SEPARATE component — don't touch it.
- **Mobile (≤860px):** `.composer` is `flex-shrink:0` inside a fixed 72vh sheet. Cap the inline thumbnail strip height or the textarea/Send can be pushed below the fold with the keyboard up. Test ≤860 keyboard-up + the 861–1180 frozen-300px band.

**Rejected:** full chat-bubble redesign (churns every e2e selector); removing any advisory affordance (demote, don't delete); new spacing/type tokens; Framer accordion (native `<details>` is free + a11y-correct).

---

## Issue 2 — Arrange & align to build plate

**Chosen mechanism:** Promote the **existing read-only plates view** (`viewMode==='plates'`, `SlicerScene`) into the interactive "Arrange / Plate" surface. **Reuse `packPlates` verbatim** as the auto-arrange engine (shelf/FFD pack + gap + 90° rescue-spin + multi-plate spill + oversize reporting). Add an editable layer ON TOP — never reflow the fused `all` mesh.

**State:** a sparse per-piece override map `pieceOverrides: Record<string, {dx:number; dy:number; rot:0|90}>` on the project (mirroring the existing `partQuantities` Record), defaulting to EMPTY = pure packer result. Effective placement = packer seat THEN apply override; `rot` is an **absolute value in {0,90} that REPLACES** `pl.rot` (NOT additive — both `SlicerScene` and `buildThreeMF` branch only on `rot===90`; the 3D Lead's `0|90|180|270` was rejected as type-unsound against `Placement.rot`).

**The keystone fix (export parity — verified):** `packPlates` is called from THREE independent sites — `Viewport.tsx:214` (preview), `exportActions.ts:154`, and `exportActions.ts:348`. `buildThreeMF` consumes a pre-computed `place` and does NOT call `packPlates`. Applying overrides only in the Viewport memo would silently export the un-nudged pack while the screen shows the nudge — a loud-export spec violation. **Mandate:** introduce ONE pure `effectivePlacements(pieces, partQuantities, bed, overrides) => PlatePlan` (packPlates + apply deltas + re-snap rot to 0|90) and replace **all three** call sites. Add a unit test asserting the Viewport plan deep-equals the export plan for the same overrides (the WYSIWYG guard).

**Affordances:**
- **Auto-arrange ("Arrange" chip):** = `clearPieceOverrides()` → snaps back to pure packer layout (Bambu's per-plate Arrange icon). No new algorithm.
- **Per-piece nudge:** `TransformControls` bound to the selected placement's mesh, constrained to XY-translate + Z-rotate, snapped to 0/90 on `onMouseUp`. Needs a **dedicated commit that inverts the plate-group offset `[ox,0,0]` and the per-mesh rot-min seat math** (`Viewport.tsx:954-961`) to recover a clean `(dx,dy)` — genuinely NEW, not a reuse of `commitTransform` (which assumes one group at origin).
- **Per-piece Center / Place-on-bed:** reuse `centerOnBed`/`dropToBed` math parameterized by `pieces[].bbox`.
- **Undo/redo:** add `pieceOverrides` to `VpSnapshot` AND `vpSnapshotOf` (`placementActions.ts:5-14`) AND the `...prev`/`...next` spreads, or ⌘Z is a silent no-op / desyncs overrides from `stl`.
- **Off-bed guard:** after applying overrides, re-validate each placement against `usableX/usableY` + neighbor overlap; feed off-bed/overlapping pieces into the existing oversize readout (`Viewport.tsx:475`).
- **Override invalidation:** drop override keys whose base name / replica index no longer exists after recompile / `partQuantities` change (mirror the `sliceGeos` cleanup + `pieces=null` invalidation).
- **The chess-row fix:** the `all` view (one fused STL) cannot be reflowed app-side. Add an explicit **"Arrange parts on bed"** action on the `all` view that triggers `compilePieces` + switches to the plates view, with a one-line hint. The packer keeps pieces on-bed and spills overflow to plate 2 — that IS the fix, delivered by a view switch.

**Files:** `src/lib/packPlates.ts` (unchanged + new `effectivePlacements()` co-located), `src/components/Viewport.tsx`, `src/state/store.ts` (project shape), `src/state/placementActions.ts` (`setPieceOverride`/`clearPieceOverrides`; fold into `vpSnapshotOf` + undo/redo), `src/state/exportActions.ts:154,348`.

**Effort:** L. **Risk:** Medium — export drift (mitigated by the single shared selector + WYSIWYG test); plate-local↔world inversion; undo extension; off-bed re-validation.

**Rejected:** reflowing/decomposing the fused `all` mesh (impossible + contract violation); a new 2D nester / 0/45/90/135 auto-rotate; injecting `translate()` into the SCAD source (kills the -D moat); absolute per-piece positions (stale when bed changes); a second undo stack; rot ∈ {0,90,180,270} (type-unsound).

---

## Issue 3 — Per-piece selection

**Chosen identity mechanism — (c) render each compiled `pieces[]` entry as its own keyed mesh in the plates view.** This is what `SlicerScene` already does. It recovers the `part`-enum NAME, works for mated kits, requires zero prompt/pipeline change, and reuses one representation with Issue 2. Per-piece selection lives **only in the plates/Arrange view** — NOT in the fused `all` mesh.

**Selection state shape (corrected from the proposals):** Do **NOT** collapse `selected` into a nullable id. `selected` is the tool-rail's Orbit/Move **mode flag** (`ViewportToolRail.tsx:34,45,58,62-63`) — the Move button sets `setSelected(true)` with NO mesh click. Collapsing it regresses the toolbar tri-state. **Keep `selected` (the move/gizmo-mode boolean) and ADD a separate `selectedPiece: string|null`** (the packer placement key, e.g. `'knight'` or `lid#1`, resolved via `baseName()` — NOT a `pieces[]` index, which breaks under replicas). The keystone state is TWO fields, not one.

**How selection drives the UI:**
- **Scene:** each `SlicerScene` placement mesh gains `onClick → setSelectedPiece(pl.name)` + hover; `onPointerMissed`/Escape clears it. Tint via the existing `meshTint` path. **Add `invalidate()`** on pointerover/out/click — the canvas is `frameloop='demand'`, so the emissive tint won't repaint at idle without it.
- **Gizmo:** `TransformControls` binds the selected piece's mesh (shared with Issue 2's nudge).
- **Right panel:** add a lightweight **"Objects" outliner** at the top of `RightPanel` from `partParam.options` (minus `all`); row-click ↔ scene-select via the shared `selectedPiece` (bidirectional highlight, PrusaSlicer-style). **Critical guard:** drive RightPanel filtering off `selectedPiece` directly (read-only highlight). Do **NOT** write the `part` paramValue on selection while in plates view — that triggers `compile()`, bumps `slicingToken`, and **nulls `pieces[]`** (the very map SlicerScene renders from), causing a recompile storm. If part-enum sync is desired, gate it to the single (non-plates) view only.

**Mandatory guards (from critique):**
- **Delete/Backspace handler (`Viewport.tsx:326`)** reads `useUi.getState().selected` and calls `deleteModel()`→`clearModel()` (wipes the whole project geometry). It must continue gating on the move-mode boolean and **must NOT fire `clearModel()` when only a `selectedPiece` is set** — per-piece Delete in arrange is a no-op or piece-scoped, never a project wipe.
- **Invert two deliberate read-only guards** (the intentional read-only→editable transition): `ViewportToolRail.tsx:62` `disabled={...||platesView}` and `Viewport.tsx:423` `!platesView`.
- **Reset `selectedPiece` in BOTH `store.ts` openProject (the cross-project bleed guard) AND the recompile reset** (alongside `pieces:null`), plus `onPointerMissed` + Escape.

**Files:** `src/state/ui.ts` (add `selectedPiece` + setter; keep `selected` boolean), `src/components/Viewport.tsx` (SlicerScene onClick/hover + meshTint + invalidate; TransformControls bind; Delete/Esc audit; invert platesView gizmo guard), `src/components/ViewportToolRail.tsx` (audit every `selected` read), `src/components/RightPanel.tsx` (Objects outliner), `src/state/store.ts` (reset on openProject + recompile).

**Effort:** M. **Risk:** Medium — the two-field migration must audit every `selected` read site. No recompile on select; no -D moat exposure.

**Rejected:** connected-component island-split of the `all` geometry (re-runs O(triangles) per 350ms -D tick; loses the part-enum name; FUSES mated kits — wrong exactly where the prompt optimizes); SCAD per-piece manifest emit (XL prompt-contract + worker-stdout change, AI-coupled — deferred; only path to selection in true *assembled* poses); single nullable id (regresses the tri-state); index-based keys (break under replicas).

---

## The shared spine

The one representation Issues 2 & 3 share: the already-compiled **`pieces[]`** (per-part STL + bbox in print orientation) **seated by `packPlates` and rendered as individually-keyed meshes in `SlicerScene`**, addressed by two pieces of state:

- **`selectedPiece: string|null`** — the identity (Issue 3), the packer placement key resolved via `baseName()`.
- **`pieceOverrides: Record<string, {dx,dy,rot:0|90}>`** — the position delta-over-packer (Issue 2), keyed by the same name.

Building this once serves both because **the selected piece is exactly the piece arrange nudges, and the override is exactly the position selection needs to display.** Neither invents a new geometry primitive: the nester (`packPlates`), per-piece geometry (`compilePieces`), per-piece meshes (`SlicerScene`), the tint (`meshTint`), and the undo machinery (`vpPast`/`vpFuture`) all already exist. The single hard scoping decision that makes this lazy AND correct: the assembled `all` view is a fused, model-authored, contractually assembled-only STL, so per-piece select/arrange **cannot and must not** live there — it lives in the plates/Arrange view where pieces are genuinely separate geometry.

---

## Phased build order

**Phase 1 — Sidebar IA/CSS collapse [L, independent, ship first].** Loudest complaint, zero geometry/state coupling, de-risks the e2e selector surface before the geometry work. Wrap AI turns in `.ai-stack`; collapse 6 cards into one `<details className="turn-meta">` with a non-interactive summary + always-visible `.code-chip` OUTSIDE it; one `.turn-actions` row (fold in redo-pill); pull the 4 pre-composer strips into the composer; secondary-cluster + non-wrapping Send; merge header ring chips. **Gate:** `npm run test:e2e` + manual pass at 300px / 720px / 1180px / ≤860 keyboard-up.

**Phase 2 — Selection keystone state [S→M].** Add `selectedPiece: string|null` to `ui.ts`; KEEP `selected` as the move-mode boolean; audit every `selected` read site; fix the Delete/Esc handler; reset `selectedPiece` in openProject + recompile. Pure plumbing, no UI yet.

**Phase 3 — Selection end-to-end (read-only) [M].** SlicerScene meshes clickable → `setSelectedPiece` + meshTint + `invalidate()`; invert the `platesView` gizmo guards; RightPanel "Objects" outliner from `partParam.options` with bidirectional highlight (driven off `selectedPiece`, NOT by writing the part paramValue). Delivers "select each piece separately + panel reveals its controls."

**Phase 4 — Arrange / editable plate [L].** Add `pieceOverrides`; introduce `effectivePlacements()` and replace ALL THREE `packPlates` call sites; per-piece `TransformControls` (XY+Zrot snap) with the plate-offset-inverting commit; per-piece center/drop on `pieces[].bbox`; "Arrange" (clear overrides) chip; off-bed re-validation; extend `vpSnapshotOf` + undo/redo with `pieceOverrides`; override invalidation. **Gate:** unit test asserting preview plan == export plan for the same overrides (WYSIWYG).

**Phase 5 — Chess-row routing [S, polish].** Add the explicit "Arrange parts on bed" action on the `all` view that triggers `compilePieces` + switches to the plates view, with a one-line hint. Optionally auto-suggest it when the `all` layout overruns the bed.

---

## Risks, open questions & rejected ideas

**Residual risks:**
- **Export parity (Phase 4, highest):** overrides MUST flow through `effectivePlacements()` into all three packPlates sites, or the .3mf silently diverges. Mitigate with the shared selector + deep-equal unit test.
- **The two-field `selected` migration (Phase 2):** a missed read site regresses whole-model selection or the tool-rail tri-state, or (worst) the Delete handler wipes project geometry.
- **Gizmo coordinate inversion (Phase 4):** plate-local mesh inside a `[ox,0,0]` group needs world→local delta conversion through the offset + rot-min seat math.
- **Sidebar e2e + mobile (Phase 1):** the `<summary>`-must-not-be-interactive rule and the literal `.code-chip` / `.chat-pane img` / `.chat-pane input[type=file]` selectors are load-bearing.

**Needs a user decision:**
- **UX expectation gap:** the user wants to "select each piece in the assembled view," but the `all` mesh is fused and contractually assembled-only. The board routes selection/arrange to the plates view via an explicit "Arrange parts on bed" action. Confirm this routing is acceptable rather than investing in the deferred XL prompt-manifest path that would enable selection in true assembled poses.
- **Part-enum sync scope:** should selecting a piece ever set the `part` paramValue (revealing piece-specific params in the single view), or stay purely a read-only outliner highlight? The board recommends read-only in plates view to avoid the recompile storm.

**Notable rejected directions:** connected-component island-split; decomposing the `all` mesh app-side; SCAD per-piece transform manifest (deferred); new 2D nester; injecting per-piece `translate()` into the SCAD source; collapsing `selected` into one nullable id; making the Restore code-chip the `<details>` summary; removing any sidebar advisory affordance.

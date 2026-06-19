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
- **Primary gate is a model-INDEPENDENT geometric check (P6, `src/lib/refineProxy.ts`):** the render's measured bbox is compared against the dimensions the model read off the reference (`intent.statedDimensions`, unit-normalized; feature→axis mapped, with diameter constraining both planar axes). When it flags a mismatch beyond tolerance, those discrepancies **lead** the refine prompt as facts to fix first — replacing self-grading. When there are no stated dims or all axes are within tolerance, the visual self-critique is the (advisory) signal. WARN only — never hard-blocks; deterministic.
- Appears in chat as a `REFINE PASS` action chip with the snapshots.
- **Auto-fires** after the first image-grounded model renders (vision engine, non-local, auto-repair on) and re-arms after each refine result, up to `MAX_AUTO_REFINE`; the user can still trigger more manually. **Proxy-gated convergence:** when the model read off stated dimensions, the auto-refine arms ONLY while the model-independent `dimDiscrepancies` check still flags a mismatch — it stops the moment the render matches the read-off dims (no wasted pass). With no stated dims, the proxy has nothing to check, so the visual-fidelity refine fires as before.
- Convergence expectation: features converge in 1–3 passes; dimensions require the scale anchor; passes are probabilistic — every code version remains restorable (below).

## 3. Versioning / rollback
- Every assistant message that contained code shows `⌬ MODEL CODE UPDATED · v<N>`; the version matching the live code is marked `· current` (its chip is disabled). All chips are disabled while generating.
- Clicking `RESTORE` on an older version adopts that code (params reset to that code's defaults), re-renders, **and rolls the conversation back to that point**: every later version is truncated off the lineage so the next prompt's context ends on the restored version — the model continues from the restored version, never the newest one. (Rollback that only swapped the displayed code while leaving later versions in the history would make the next prompt silently build on the newest version again — the bug this prevents.)
- The truncated newer versions are **set aside, not discarded**: a `Rolled back · N newer version(s) set aside · Bring them back` banner appears under the thread and restores them (undoing the rollback). Sending a new prompt commits to the restored branch and clears the set-aside versions (they become a genuinely abandoned branch) — mirroring placement undo/redo (§7), where a new action clears the redo stack. The set-aside tail persists with the project until then.
- **Design-intent metadata versions WITH the code** (§13): `intent` + `appliedSkillIds` live on the ChatMessage that carries the code, so rollback/restore (which slice/stash whole messages) and localStorage persistence carry them for free. The applied-patterns chip reads from the message it renders on — never a global "latest" — so a rolled-back-to version shows THAT version's intent/skills, and a pre-skills version shows none.

## 4. Multi-part designs (PARTS bar + slicer plates)
- Convention: enum parameter named `part`, first option `all` = assembly preview. UI: PARTS bar in the viewport (⬚ ALL + one chip per piece).
- Assembly preview suppresses bed-fit warnings; each individual part shows real dims + EXCEEDS BED when applicable.
- The `all` view is the **assembled** object (pieces in their final relative positions), not a scattered layout. An optional `explode` parameter (0 = assembled, the default) fans the pieces apart along their assembly axes for an OpenSCAD-style exploded preview; it changes only the preview, never the printed per-piece geometry.
- Clicking a PARTS chip (or `all`) switches the viewed piece with an **immediate** per-piece compile (no slider debounce) and re-fits the camera — a part switch is navigation. A slider tweak, by contrast, never yanks the camera.
- The slicer view (§7) is the only place pieces are shown as bed "plates"; the PARTS bar itself still shows one piece at a time.
- `⚒ ASK AI TO SPLIT INTO PARTS` shows whenever the *currently viewed* geometry exceeds the bed (including an already-split piece that is still too big — asks to split further), except in assembly preview.
- All exports live behind ONE primary **⬇ Export** button → menu with explained choices:
  `.3mf — recommended` · `.stl` · `Parts as separate .stl files` (multi-part only) · `Plates as .3mf` (multi-part only) · `.scad source`;
  the menu footer notes that exports sharpen curves to at least Fine. `.scad` is also downloadable from the Code tab.
- "Parts as separate .stl files" compiles each piece at **at least Fine** quality (Ultra preview → Ultra; per-piece timeout → one Draft retry) and downloads `<project>-<part>.stl` each. **Partial success is loud**: an alert + HUD note name the failed parts; silent skips are a bug.
- "Plates as .3mf" compiles each piece (same ≥Fine + Draft-retry rules) and writes ONE slicer-ready `.3mf` per bed-sized plate (`<project>-plateN.3mf`), packing pieces with the SAME packer as the slicer view (translation-only, so the file matches what was on screen). Oversize pieces (don't fit a bed as-drawn) and failed renders are surfaced **loudly** (alert + note), never silently dropped.
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
  (F = fit) · measure (two clicks on the model → mm) · PNG snapshot.
- **Navigation**: left-drag orbits, middle- **or** right-drag pans, scroll-wheel zooms (gentle —
  `zoomSpeed` halved so one notch is a small step), double-click empty canvas = fit.
- **Smooth shading**: meshes render with angle-thresholded auto-smooth normals (weld coincident
  verts → creased normals at a 35° crease angle, in `src/lib/stl.ts`) so curved surfaces look
  smooth while box corners / chamfers stay crisp — i.e. Blender "shade smooth + auto-smooth".
- **Projection toggle** re-frames on switch (an orthographic camera mounts unframed and needs its
  `zoom` set), so perspective⇄orthographic is always visibly different.
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
- **One status at a time** (viewport top-left), severity-ordered: render-failed (with an "open Code"
  action that jumps to the Code tab — and opens the params sheet on mobile) > removed-from-view (with
  "undo") > rendering > AI-designing > degraded-quality note > grew-out-of-view (with "fit" action) >
  first-time "click the part" hint > ✓ Ready (with render ms).
- **Flow rail** (top-center): 1 DESCRIBE → 2 ADJUST → 3 EXPORT, steps lit by state (code exists /
  model rendered / export ready). Full labels ≥1180px; below that it collapses to numbered dots
  (step names move to the title tooltips) rather than disappearing; hidden entirely on mobile.
- **Power affordances always visible**: the Code tab, render times, and triangle counts are always
  shown (no Advanced toggle); a render error additionally marks the Code tab ⚠. The code editor is
  CodeMirror 6 (line numbers + C-like syntax highlighting), lazy-loaded so it stays out of the main
  bundle; the failing line is highlighted, and ⌘/Ctrl-Enter / ⌘/Ctrl-S apply.
- **Toolbar**: SVG icons with aria-labels (no unicode glyph buttons); view buttons read
  ISO/TOP/FRONT/RIGHT/FIT. Mesh shows hover highlight + pointer cursor; a one-time hint chip teaches
  click-to-select (dismissed forever after first selection).
- **AI plumbing**: the topbar chip reads "Engine · <name>" / "Connect AI" and opens the Engines modal,
  where engine SETUP lives — switching engines, API keys, the model picker, effort selector (Claude
  engines), an always-editable local base-URL, and a per-row "Test" disabled until its key is set
  (local/CLI rows stay testable), grouped by CLI logins / API keys / local. The composer ALSO carries
  an in-place **model + effort picker** (shared `ModelMenu`, in both the chat and home composers) that
  switches model/effort WITHIN the active engine, showing only the controls that engine exposes
  (claude-code → model + effort, anthropic → effort, kimi → model, local → none); it persists via the
  same store fields the modal uses and links back to the modal for deeper setup.
- **Branded dialogs** replace native prompt/confirm/alert: custom bed size (3 validated fields,
  10–2000mm) and delete-project confirmation. Project identity is ONE editable title + a ▾ menu
  (switch / new / delete).
- **Mobile (≤860px, `.app.is-mobile`)**: viewport-first. The JS `useIsMobile` threshold MUST equal
  the `860px` CSS breakpoint — any gap reopens a dead-zone where the params/code column is hidden
  with no tab bar to reach it. The shell sizes to `100dvh` and **clips its overflow** (`.app` +
  `.app-body` `overflow:hidden`) — load-bearing: a closed sheet is parked ~one screen below the fold
  via `translateY(100% + 64px)`, so without clipping it extends the document and the whole page
  scrolls to expose the off-screen sheet. The viewport reserves the 64px tab bar.
  - **Bottom tab bar** (3-up): Model · Tweak · Chat. Tapping the active Tweak/Chat tab closes its
    sheet back to Model.
  - **Bottom sheets**: chat and params slide up as sheets (translateY), scroll-chain contained;
    modals (Engines, dialogs) are `position:fixed` so they escape the shell clip and become
    full-width bottom sheets, not cramped desktop cards.
  - **Header context**: branding collapses to the logo mark; a mobile title shows the project name +
    current screen (Model/Tweak/Chat). The flow rail is hidden.
- **Project switch resets transient interaction modes** (selection, measuring) so they
  don't bleed into the next project. The viewport keydown shortcuts (⌘Z placement-undo, Backspace
  delete) bail while typing in any input **or contentEditable** (the CodeMirror editor) so editing
  code never triggers viewport actions.

## 10. Stale-state guarantees
- A render result only applies to the project that started it (switching projects mid-render discards the result).
- Aborting a generation leaves history consistent (consecutive user messages are merged for the API).
- The slicer pack only applies if neither the project nor the model changed while it built: every main render bumps a generation token and clears the cached pieces, so an in-flight piece build that a concurrent recompile (e.g. a slider drag in Slicer view) has superseded is discarded rather than shown — the view then rebuilds against the current parameters.

## 11. App shell, home screen & routing (2026-06-17)
- **Home / new-chat screen** (desktop): when there's no active chat, or an empty one that isn't
  generating (`isHome = !isMobile && (!activeId || (!code && !generating))`), the side rails are
  unmounted and ONLY the centered composer shows (the Viewport hosts EmptyState). Sending a prompt
  (→ generating) or any code flips to the 3-column workspace. On mobile the rails are sheets, so
  `isHome` is gated to desktop. The home composer is fully functional: text, reference-image attach,
  and the model/effort picker (parity with the chat composer).
- **Chat URL routing + session restore** (hash, `src/lib/hashRoute.ts`): every chat (project) has a
  URL `#/c/<id>`. Hash routing (not path) because `vite base: './'` targets static / GitHub-Pages
  hosting. Which chat opens on load, in priority: (1) a valid id in the hash → that chat (covers
  shared links AND same-tab reloads, since the hash persists); (2) else, a RELOAD / return to a tab
  that has loaded before (a per-tab `sessionStorage` marker) → the **last chat** the user was on
  (`vibemesh.lastChat.v1`); (3) else — a brand-new window/tab, or no prior chat → a FRESH chat
  (reusing a pristine empty one if present, idempotent under React StrictMode's double `init`). Net:
  reload/return restores your work, a new window starts fresh, and a URL with an id always opens that
  chat. New/open/load-example push the hash + persist the last chat; deleting the active chat clears
  both (replace). A `hashchange` listener in App.tsx syncs Back/Forward and hand-edited URLs —
  opening a known id, normalizing a stale/deleted id, and re-syncing a bare in-session hash to the
  open chat (guarded against an open→sethash→hashchange loop).
- **Resizable columns** (desktop > 1180px only): the chat | viewport | params separators are drag
  handles (`.col-resizer`); widths persist (`vibemesh.leftWidth/rightWidth.v1`) and clamp (left
  280–520, right 240–440) so neither rail can crush the viewport. Between 861–1180px the rails stay
  on fixed responsive widths (300/280) WITHOUT resizers; ≤860px is the mobile sheet layout. A header
  **New chat** button is always available.
- **Collapsible side panels** (desktop workspace): either rail can be collapsed via a chevron in its
  header (`leftCollapsed`/`rightCollapsed`, persisted). A collapsed rail's grid track goes to 0 and
  its resizer is dropped, so the viewport reclaims the space; the pane stays MOUNTED but hidden
  (`.pane.is-collapsed`, `visibility:hidden`) so its draft/scroll state survives. A floating tab
  (`.rail-expand`) docked at that viewport edge reopens it. Collapse applies only in the desktop
  workspace (mobile uses sheets; home has no rails).
- **Parameters collapsed by default**: when a model is created, each param group starts collapsed
  (seeded once per newly-seen group name, so a manual expand survives slider edits / recompiles and
  a new AI iteration only auto-collapses groups it newly introduces).

## 12. Visual design system & motion contract (2026-06-18 — "Modern Dark Cinema")

Governed by two project skills: `.claude/skills/vibemesh-ui/SKILL.md` (all DOM/CSS) and
`.claude/skills/vibemesh-3d-motion/SKILL.md` (the `<Canvas>` subtree of `Viewport.tsx`). Plan:
`docs/UI-UX-UPGRADE-PLAN.md`. Non-negotiable invariants:

- **Tokens are law**: every color/space/radius/shadow/duration/font is a `:root` custom property in
  `src/styles.css`; accent tints derive from `--accent` via `color-mix()`. Display font is
  **Bricolage Grotesque** (`--font-display`), UI Hanken Grotesk, mono IBM Plex Mono. Never reintroduce
  Space Grotesk or Inter (both banned by the frontend-design anti-slop gate).
- **Glass = viewport overlays only**: `backdrop-filter` is permitted ONLY on the floating canvas chrome
  (`.tool-rail`, `.hud-bar`, `.assembly-chip`, `.perf-chip`, `.sel-bar`) via the `--glass-1/2/3` tiers;
  blur is capped at 8px with no `saturate()`. Side panes stay solid `--panel`. Text on glass uses
  `--text-dim` or lighter (≥4.5:1 over a bright model behind). `body.perf-lite` (low-power /
  `prefers-reduced-transparency`) and `@supports not (backdrop-filter)` drop blur to opaque —
  `.perf-lite` is also the field rollback flag for the glass system.
- **`[data-busy]` animation gate**: `busy = generating || compileStatus==='compiling' || slicing` is
  reflected on the `.app` root. Decorative entrance/cascade animations are gated
  `.app:not([data-busy])` so they never compete with the main-thread STL parse. The ONLY loaders that
  run while busy are the status-dot/`tabpulse` pulses and the `.viewport[data-compiling]` compile ring.
- **Motion discipline**: DOM motion uses Framer Motion (discrete transitions only — entrances, layout,
  press, modals; never continuous loops) and obeys `useReducedMotion()`; canvas motion stays inside
  `useFrame`. transform+opacity only — the sole height exception is param-group collapse
  (`grid-template-rows: 1fr↔0fr`). Reduced-motion is honored on BOTH surfaces: the CSS
  `@media (prefers-reduced-motion)` block AND the `usePrefersReducedMotion` hook every r3f rig reads
  (the CSS query cannot reach `useFrame`); the JS smooth-scroll is `matchMedia`-guarded.
- **3D scene (ADR `docs/adr/0001-frameloop-demand.md`)**: the `<Canvas>` runs `frameloop='demand'` — at
  idle the rAF stops so glass is free. **Every self-driving `useFrame` rig MUST call
  `state.invalidate()` each tick** or it freezes after one frame. Camera fly-in keys on `fitVersion`
  ONLY (never geometry/params), disables OrbitControls during the ~450ms flight, snaps under
  reduced-motion / orthographic. Mesh spawn keys on `stlVersion`, lerps group scale 0.92→1 + material
  opacity 0→1 via refs ONLY (never clones the disposed geometry, never clobbers the JSX-controlled
  `emissive`/`flatShading`/`wireframe`/`side`), and restores `transparent=false` at settle. Ortho
  `camera.zoom` writes need an explicit `invalidate()`. `CaptureRig` renders via synchronous
  `gl.render` and is frameloop-agnostic — keep it that way.
- **3D grounding**: studio IBL is shipped via the `StudioEnvironment` rig — a PMREM env map from
  three's procedural `RoomEnvironment` (local-first; no HDRI/CDN) applied as `scene.environment`
  (intensity ~0.35), nulled by `CaptureRig` during refine shoots so reflections can't skew the
  self-critique. `<ContactShadows>` was evaluated and dropped (no contrast on the `#2f3236` stage;
  the bed grid + ghost plate already ground the model). CSS ambient blobs remain optional/deferred.
  See ADR 0001 §5.

## 13. Understanding layer: design intent & applied-patterns chip (2026-06-18 — Phase 5)
- **INTENT preamble (response-contract surface).** The PLAN ends with exactly ONE machine-readable
  `INTENT: {json}` line — plain text, **never inside a code fence**, never markdown. It serializes
  reasoning the model already does (`form` single|kit|assembly, `archetype`, `facetVerdict`
  faceted|machined|functional, `domainTags`, `ambiguityScore`, `assumptions`) and is **advisory
  only** — it does not replace the PLAN prose or the code, and there is still **exactly ONE** scad
  block (`blockCount===1`; the bench gates this). The client parses it with `extractIntent` (tolerant:
  enum-validated, drops unknowns, never throws, null on garble) and **strips the line from the
  displayed prose** so the user sees clean PLAN text.
- **Vision fields + source-routed build fragment (P6).** From a reference image the INTENT line also carries `sourceType` (photo|drawing|orthographic|multiview|multiobject), `statedDimensions` (legibly-labeled dims, read not invented), `asymmetryFlags`, `confidence`. The assembler injects a source-type-routed build fragment (drawing/ortho → reconcile views into one solid + honor labeled dims; multiobject → model each as a part; photo → estimate scale) — routed by the model's carried `sourceType`, or on the first image turn by a coarse client `sourceHint` from the attached image roles. Never always-on: a text request or an un-classified single image adds nothing.
- **Intent drives retrieval, carried across turns.** Parsed `intent.domainTags` ride forward in
  `GenerateContext` so a follow-up that drops the mechanism keyword ("make it bigger" after a gear
  request) still retrieves the same skill; the server `selectSkills` matches its TRIGGERS against the
  prompt PLUS those carried tags. First turn → server-side selection from the prompt only.
- **Applied-patterns chip = context/metadata, never a competing output block.** On each code-bearing
  message a chip renders `form · facetVerdict` + the skills that fired (`appliedSkillIds`, as human
  labels), with `archetype`/`ambiguity`/`assumptions` in the tooltip. Renders nothing when the message
  has no metadata (pre-skills versions). `intent` + `appliedSkillIds` version WITH the code (§3).
- **Wrong-chip recourse → corrected re-generation.** On the current model's chip the user removes
  (`×`) or adds (`+ pattern`) a skill; `regenerateWithSkills(msgId, skillIds)` appends an
  `Adjust patterns` marker turn and regenerates with `GenerateContext.skillIds` **overriding**
  retrieval for that turn (selectSkills skipped — the assembler injects exactly those fragments). It
  shares the generating-guard + abortController; the new version carries the corrected
  `appliedSkillIds`. Advisory — corrected ids only change retrieval, never force a competing block.

## 14. Composition: multi-skill merge + mated all-view (2026-06-19 — Phase 7)
- **Shared-parameter merge.** Each skill registry entry may carry `paramAliases` mapping a canonical
  concept (`clearance`, `wall`) to its own parameter name. When ≥2 selected skills share a concept,
  the assembler appends a **"merge not duplicate"** directive (`compositionDirective`) naming the
  resolved concepts: emit ONE Customizer parameter per shared concept, reconcile `[min:step:max]` to
  the tightest safe band. `''` for <2 skills / no overlap (single-/zero-skill assembly byte-identical).
  The zero-API walker asserts every `paramAlias` names a real parameter in that skill's exemplar.
- **Mated assembled view.** When ≥2 skills compose into a kit, a **mating directive** (`matingDirective`)
  mandates the multi-part convention with a correctly-mated `all` view: a single `part` enum (`all`
  first), joint axes COINCIDENT on one shared datum so pieces mate (not scatter), and an `explode`
  knob (0 = assembled). Principle-only (no named object).
- **Advisory structuralReport checks.** Duplicate shared-concept parameters (≥2 clearance/wall) and a
  ≥2-piece `part` enum lacking an `explode` knob each emit a WARN into `buildManualFixPrompt` —
  never blocking.
- **Composed exemplars + probe.** `server/composed.mjs` holds compile-verified composed fixtures
  (e.g. `axle-snap`: one merged `clearance`, mated `all`-view, `_debug` interference contract). The
  zero-API composition probe (`bench/composition.selftest.mjs`, in `bench:gate`) asserts each fixture
  compiles, exposes exactly one parameter per shared concept, and keeps protected-structure ∩
  cutters ≈ 0 — with broken controls (a duplicated clearance, a pocket sliced into the pin) proving
  it discriminates. The live loop stays WARN-only; only this deterministic walker may hard-fail.

# Vibemesh — UX Audit

**Date:** 2026-06-12 · **Scope:** full product walkthrough (live app at 1440×900 + source review of `src/styles.css`, all components, `docs/SPEC.md`)
**Method:** first-run novice walkthrough (7 captured states), 3 task walkthroughs, full copy/jargon inventory from source, type-scale audit, IA audit.

---

## 1. Executive verdict

The experience feels hard because the app speaks the builder's language instead of the user's: every surface leads with pipeline internals (CONSOLE, OpenSCAD, .SCAD/.STL/.3MF, engines, `/input.scad` parser dumps) that a hobbyist must translate before they can act. Almost all UI text sits in a 9–11.5px ALL-CAPS micro-band with wide letter-spacing — there is no visual hierarchy, so nothing tells the eye what matters first, and the whole screen reads as an expert cockpit that must be studied rather than used. The core mental model — chat writes code, code renders the model, sliders edit the code — is never taught anywhere; the three panels look like three unrelated tools, and key interactions (click the model to move it, which of 3–4 export buttons to press) are invisible until hovered or found in the shortcuts overlay. Mechanically the product is excellent — two clicks from empty state to a printable file, sliders re-render live in ~1–2s — so the hardness is comprehension cost, not interaction cost. That is why micro-polish didn't fix it: polish was applied *to* the expert-cockpit frame; the frame itself (copy, type scale, guidance, export IA) is the problem, and all of it is fixable incrementally in the current architecture.

### Hypotheses tested

| Hypothesis | Verdict |
|---|---|
| Cryptic glyph iconography forces hover-to-learn | **Confirmed** — and worse: the glyphs ARE the accessible names (a11y snapshot shows `button: "◧"`), and `title` tooltips never fire for keyboard/touch users. The help overlay even says "hover any icon — tooltip" as if hover-dependence were a feature. |
| 9–11px ALL-CAPS micro-labels create strain / intimidation | **Confirmed** — 12 distinct font sizes, 11 of them ≤14px; the largest persistent text in the app is the logo. See §4. |
| Insider jargon in user-facing copy | **Confirmed** — ~30 strings a hobbyist must translate; full inventory in §3. |
| No guided flow after first render | **Confirmed for AI generations** (nothing points to sliders/refine/export); *partially mitigated for examples* (the canned chat message says "Tweak it with the sliders…"). |
| Export decision overload | **Confirmed** — up to 4 topbar buttons, hero copy promises "GET AN STL" while the primary button exports .3MF. |
| Status scattered across HUD corners | **Confirmed** — 5 viewport zones + chat bubble + code-tab error + tab title + topbar chip = 9 status locations. |
| Panel relationship invisible | **Confirmed** — tabs are labeled by data type (PARAMETERS / CODE), not by purpose; nothing links a slider drag to the code or the chat to either. |

---

## 2. Findings

Severity: **critical** = blocks/confuses the core task for a novice · **major** = recurring friction or trust damage · **minor** = polish-level.
Effort: **S** = hours · **M** = 1–3 days · **L** = >3 days.

| ID | Sev | Effort | Issue | Evidence | Proposed fix |
|----|-----|--------|-------|----------|--------------|
| F1 | critical | S | **Jargon-first copy everywhere.** Chat panel is labeled "CONSOLE"; version chips read "⌬ MODEL CODE UPDATED · RESTORE" (shown even on first example load when nothing was updated); streaming shows "⌬ WRITING OPENSCAD…"; hero says "GET AN STL." and "NO API KEY NEEDED". | `ChatPanel.tsx:195,235,248` · `EmptyState.tsx:16,26,40` · live screens | Plain-language pass on ~30 strings (§3 lists them all). "CONSOLE"→"DESIGN CHAT"; "MODEL CODE UPDATED · RESTORE"→"Version 3 · restore"; "WRITING OPENSCAD…"→"Building the model…"; hero → "GET A PRINT-READY PART." Keep format names only where the user receives a file. |
| F2 | critical | M | **The chat→code→model→sliders relationship is never taught.** Right-panel tabs are "PARAMETERS / CODE" (data types, not purposes); nothing indicates sliders edit the same code the AI wrote, or that a new AI reply will overwrite slider tweaks (SPEC §4 param-persistence rule is a guaranteed surprise). | `RightPanel.tsx:20,27` · SPEC.md §4 | Rename tabs to task language ("TWEAK" / "CODE · advanced"); one-time inline explainer under the tab bar ("These sliders edit the model's recipe — the chat rewrites it"); when a slider changes, flash the corresponding line in the code tab; when AI streams, pulse the CODE tab. |
| F3 | critical | S–M | **Export overload + broken promise.** Topbar shows `.SCAD`, `⬇ STL × PARTS` (conditional), `⬇ .STL`, `⬇ EXPORT .3MF` as four sibling buttons. The hero promises "an STL," steering Bambu users to the *worse* button; .3MF's advantage ("opens slicer-ready in Bambu Studio") lives only in a tooltip. `.SCAD` (a dev artifact) has equal billing. | `TopBar.tsx:106–129` · empty-state screen | One primary **EXPORT** button opening a small menu: "**.3MF — recommended** · opens ready in Bambu Studio / PrusaSlicer / Orca", ".STL — universal mesh", "all parts as separate STLs" (when multi-part), "OpenSCAD source (.scad)". One decision, explained at the point of choice. |
| F4 | major | S | **No typographic hierarchy.** 12 distinct sizes (9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 17px); 11 are ≤14px. ALL-CAPS + 0.12–0.34em tracking on labels, buttons, tabs, HUD, chips alike. View buttons are 9px (`vp-btn.txt`), PARTS label 9px, dims label 9.5px. The biggest persistent text is the brand. Everything whispers at the same volume → "cockpit" effect + reading strain. | `styles.css` (e.g. `:784 .vp-btn.txt 9px`, `:926 .plates-label 9px`, `:879 .dims-label 9.5px`, `:241 .btn 11px`, `:61 body 13px`) | Collapse to a 5-step token scale (10 / 11.5 / 13 / 15 / 18) in `:root`; reserve caps+tracking for section labels only; sentence-case buttons and chips; nothing interactive below 11.5px. Pure CSS — no markup changes. |
| F5 | major | M | **Status fragmented across 9 locations.** Render status TL; quality+bed selects TR; dims/EXCEEDS BED/split/below-bed BL; parts bar / selection bar BC; triangle count BR; plus chat stream bubble, code-tab error box, tab title, topbar engine chip. During my forced-error test, three independent signals showed at once (stale model + RENDER FAILED TL + EXCEEDS BED BL). | `Viewport.tsx:357–535` · error-state screen | Consolidate transient status (render ok/fail/busy, AI drafting, removed-from-view) into **one** status strip; keep dims pinned BL and controls TR but label them. Severity-order messages so only the most important shows. |
| F6 | major | S | **Raw compiler errors, no line numbers.** Error UI prints `ERROR: Parser error: syntax error in file /input.scad, line 31` — an internal filename, and the plain `<textarea>` editor has no line numbers, so "line 31" is unactionable. CGAL/hull lore is (correctly) hidden in the AI prompt but the user-facing dump remains. | live error test · `RightPanel.tsx:241–249` | Human headline first: "The model's code has an error (line 31)." → primary action **ASK AI TO FIX** → collapsed "show technical details". Strip `/input.scad`. Add line numbers (CSS-gutter trick or CodeMirror, see Phase 3). |
| F7 | major | S–M | **Glyph toolbar is hover-gated.** ◧ ▦ ◇ ⬓ ⤢ ⎙ ⊞ ◫ ◳ have `title` only; no `aria-label` (undo/redo and "?" have them; the rest don't). Shading button's *meaning of its current state* is also hover-only. | `Viewport.tsx:304–339` · a11y snapshot | Replace unicode glyphs with a small inline-SVG icon set (consistent stroke, like slicer toolbars); add `aria-label`s; show a text label on the active/important ones (SECTION, MEASURE); keep grouping separators. |
| F8 | major | M | **Selection is invisible.** Click-model → gizmo + MOVE/ROTATE/CENTER/DROP/DELETE bar is documented *only* in the shortcuts overlay ("click model — select"). No hover highlight, no cursor change, no hint. A novice will never find placement tools. | `HelpModal.tsx:10` · `Viewport.tsx:243–276` | Pointer-cursor + emissive hover highlight on the mesh; first-render hint chip ("Click the part to move or rotate it") dismissed after first selection. |
| F9 | major | S | **No next step after an AI render.** Examples inject "Tweak it with the sliders, or describe a change" — good — but the first *AI-generated* render ends with whatever prose the model wrote; nothing points to sliders → refine → export. | `store` example message vs. AI flow · SPEC §8 | After the first successful AI render in a project, append a deterministic system line: "✓ Rendered. Fine-tune with the sliders on the right, ask me for changes here, or Export when it's ready." Cheap, structural payoff. |
| F10 | major | S | **AI plumbing colonizes primary surfaces.** The composer row permanently shows engine select ("Claude · login", "Local · qwen2.5vl:7b"), a Claude model select ("default (fable-5)", "opus — best quality"), a gear, and SEND. The topbar chip reads "CLAUDE · LOGIN ⚙" — looks like a login button, duplicates the gear. Engine UI exists in 3 places. | `ChatPanel.tsx:315–352` · `TopBar.tsx:96–104` | One compact "AI" status pill (dot + name) in the composer opening the existing Engines modal; hide the model picker behind it; topbar chip becomes plain status ("AI · ready"). |
| F11 | major | M | **<900px: parameters and code are unreachable.** `.right-panel { display:none }` below 900px; the stacked layout (seen on first load before resizing) gives chat 55vh and no sliders at all. | `styles.css:1568–1576` · initial narrow screenshot | Short term: a visible "Open controls" affordance is missing — add bottom-sheet tabs for PARAMS/CODE on narrow widths (Phase 3); at minimum show "best on a wider window" notice. |
| F12 | minor | S | **Native `prompt()` / `alert()` / `confirm()` dialogs.** Custom bed size uses `window.prompt("Custom bed size in mm — width × depth × height:")` + `alert` on parse failure; project delete uses `confirm`. Jarring against the brand, unstyled, and the bed prompt has no validation UI. | `Viewport.tsx:78–89` · `TopBar.tsx:81` | Reuse the existing `.modal` styles for a small "Custom bed" dialog (3 number fields) and a delete confirmation. |
| F13 | minor | S | **Float/locale leak in numeric fields.** Storage-box floor thickness renders `1.600000023841858` in the number input (displayed "1,6" under a comma locale) — step-math float noise shown raw. | a11y snapshot of params panel | Round displayed values to the step's decimal places at the input boundary. |
| F14 | minor | S | **Project identity shown twice.** Topbar renders the project select *and* an editable name input side-by-side with the same value; plus a bare ✕ that deletes the whole project one click away from the name. | `TopBar.tsx:48–87` · screenshots | Single editable title with a dropdown affordance; move Delete into that menu (with the confirm dialog from F12). |
| F15 | minor | S | **Growth pushes the model off-frame with no cue.** Camera-keep (correct per SPEC §8) means slider-driven growth runs off-screen; in testing, a 230mm part filled/escaped the view while only a 9.5px "⚠ EXCEEDS BED" chip reacted. The geometry itself never signals overflow. | live slider test screens | When the post-render bbox exceeds the frustum, show "out of view — press F to fit" chip; tint the portion outside the bed red/striped (slicer convention Bambu/Prusa users already know). |
| F16 | minor | S | **Top-right selects read as status, not controls.** "◇ Standard" and "Ender 3 / S1 — 220×220×250" float unlabeled in the HUD; quality affects export fidelity (SPEC §5) but nothing says so on-surface. | `Viewport.tsx:386–429` | Tiny persistent labels ("QUALITY", "PRINTER") above/inside the selects; move the export-fidelity note from tooltip to the Export menu (F3). |
| F17 | minor | S | **Version history is illegible as history.** Every restorable state is an identical "MODEL CODE UPDATED · RESTORE" chip — no numbering, no diff hint, no current-version marker. The mechanism (excellent per SPEC §3) reads as noise. | `ChatPanel.tsx:228–237` | "v1 · v2 · v3 — current" numbering; label the chip with what changed when known ("Version 4 · taller walls"). |
| F18 | minor | S | **Engines modal is a developer panel.** ".env", "sk-ant-…", "console.anthropic.com", "http://localhost:11434 — 1 model(s)", "RE-SCAN", "run `claude` and use `/login`". Partly inherent to a local-first tool, but no framing for non-developers. | `EnginesModal.tsx:71,139–163` · modal screen | Keep the content; add one orienting sentence per row ("This lets Vibemesh design parts for you — pick whichever you have"), and a "What is an AI engine?" link/expander. |

---

## 3. Copy & jargon inventory (strings a hobbyist must translate)

From source, grouped by surface — the raw material for the F1 copy pass:

- **Topbar:** `.SCAD` · `⬇ STL × PARTS` · `⬇ EXPORT .3MF` · `CLAUDE · LOGIN ⚙` · `CONNECT AI`
- **Chat:** `CONSOLE` · `⌬ MODEL CODE UPDATED · RESTORE` · `⌬ WRITING OPENSCAD…` · `⇄ REFINE AGAINST REFERENCE` · action chips `REFINE PASS` / `IMAGE PROMPT` / `SPLIT REQUEST` / `FIX REQUEST` · `▣ IMG` · engine options `Claude · login`, `Local · qwen2.5vl:7b`, `no engine` · model options `default (fable-5)`, `opus — best quality`
- **Viewport:** `✓ 248ms` · `348 tris` · `✕ RENDER FAILED — SEE CODE TAB` · `◍ AI DRAFTING…` · `⚠ EXCEEDS BED` · `PART · ALL` · `⚒ ASK AI TO SPLIT INTO PARTS` · "moved in viewport — placement **bakes into** the exported STL" · `ISO/TOP/FRT/RGT/FIT` (FRT/RGT are abbreviations of abbreviations)
- **Right panel:** `PARAMETERS` · `CODE` · `⌘⏎ / ⌘S — apply & render` · `⟳ APPLY & RENDER` · `render log` · placeholder "// OpenSCAD code appears here" · raw `ERROR: Parser error: … /input.scad, line 31`
- **Empty state:** `GET AN STL.` · "parametric OpenSCAD models" · "sliced-ready in millimeters" · `NO API KEY NEEDED`
- **Engines modal:** `.env` · `sk-ant-…` · `localhost:11434` · `RE-SCAN` · "run `claude` in a terminal and use `/login`"

Not jargon for this audience (keep): mm dimensions, bed/build-plate, Draft/Standard/Fine quality, printer model names, layer/orientation caveats — hobbyists live in slicers and know these.

## 4. Type-scale audit (from `styles.css`)

| Size | Used for | Note |
|---|---|---|
| 9px | view buttons (ISO/TOP/FRT…), PARTS label | interactive text below legibility floor |
| 9.5px | dims label, example CTA, `btn.sm` | |
| 10px | CONSOLE label, api-chip, code/action chips, plate chips, group titles, stream meta, code hint | the workhorse size — most labels live here |
| 10.5px | HUD chips, engine select, dims notes, refine bar, kbd, modal hints | |
| 11px | **all buttons incl. EXPORT .3MF**, tabs, example blurbs | primary CTA is 11px |
| 11.5px | param names, code editor, idea chips, key banner | |
| 12–12.5px | inputs, chat messages, dims values | body copy |
| 13–13.5px | base body, engine labels, example names, empty sub | |
| 14px | project name, modal titles, glyph buttons | "largest UI text" |
| 17px | brand | the only loud element |

**Diagnosis:** an 8px band holds 12 sizes — that's noise, not a scale. Hierarchy inversion: the most consequential control (EXPORT) is smaller than a chat message; the brand outranks everything. Caps + 0.12–0.34em tracking is applied to ~15 classes, so the "machine-shop placard" effect — great as an accent — is the *default reading experience*. Fix is entirely in `:root` tokens + ~20 declarations.

## 5. IA audit — does the layout teach the data flow?

The three-panel layout itself is right (chat→canvas→properties matches Onshape/Fusion/slicer conventions) and should not be rearranged. What's missing is **visible causality**:

- Chat → code: the stream hides the code block (good) but only signals "WRITING OPENSCAD…" — the CODE tab never reacts.
- Code → model: APPLY & RENDER is at the very bottom of the code tab; render status appears in the *opposite corner* of the screen (viewport TL).
- Sliders → code → model: a slider drag silently rewrites code and re-renders; nothing connects the three. Then SPEC §4's rule ("if new code changes the default, the code wins") silently discards user tweaks after the next AI reply.
- Next step: after render, the export lives in the topbar — the only region with no causal link to anything.

Cheap teaching devices (no layout change): tab-pulse when upstream writes downstream (AI stream → CODE tab glow; slider drag → brief highlight of the edited code line), a one-line post-render system message (F9), and a 3-step "DESCRIBE → ADJUST → EXPORT" affordance (Phase 3).

---

## 6. Refactor proposal

### Phase 1 — Quick wins (≤1 day total, no layout change, no new dependencies)
1. **Copy pass** (F1, F17, F18, parts of F3): every flagged string is inline JSX — rename, sentence-case, de-jargon. Include version numbering on restore chips and the post-render guidance line (F9).
2. **Type tokens** (F4): add `--fs-*` scale to `:root`, collapse 12 sizes → 5, restrict caps/tracking to section labels. CSS-only.
3. **Small fixes:** round numeric inputs (F13), error headline + hide `/input.scad` (F6 first half), label TR selects (F16), demote `.SCAD` into the CODE tab toolbar.

**Impact on "hardness": the largest single drop.** First-impression intimidation and per-glance translation cost are mostly copy + type. **Feasibility:** trivial in current stack.

### Phase 2 — Medium (1–3 days each, component-level)
1. **Export menu** (F3): new ~150-line component; reuses existing store actions (`exportStlSmart`, `export3mf`, `exportPlates`, `exportScad`) unchanged.
2. **Status strip** (F5, F15): one component absorbing hud-tl/bl/br transient chips with severity ordering; dims stay pinned.
3. **Icon set + labels** (F7): inline SVGs replacing unicode glyphs; aria-labels.
4. **Selection discoverability** (F8): hover emissive + cursor + one-time hint chip (`ui.ts` already has the store for flags).
5. **Branded dialogs** (F12, F14): custom-bed and delete-confirm modals reusing `.modal` CSS; merge project select + name into one control.
6. **AI plumbing consolidation** (F10): composer pill → Engines modal.

**Impact:** removes the remaining decision/discovery friction in the export and viewport paths. **Feasibility:** all plain React + zustand + CSS; no rewrites; the store already exposes every needed action.

### Phase 3 — Structural (worth doing; still incremental)
1. **Guided flow header** — a slim "1 DESCRIBE → 2 ADJUST → 3 EXPORT" rail (topbar or viewport edge) whose steps light with state (`chat non-empty` → `params present` → `stl ready`). Teaches the IA, answers "what now", and gives EXPORT a home that's causally connected. ~1 day.
2. **Simple-by-default right panel** — TWEAK tab default; CODE behind "Advanced" (persisted). Beginner mode hides tris/ms/`.SCAD`. ~1 day.
3. **Causality cues** (F2): tab pulse on AI stream; slider→code line flash. 0.5–1 day.
4. **Narrow-width bottom sheet** (F11) for params/code. 1–2 days.
5. **Optional: CodeMirror 6** for the code tab (line numbers, OpenSCAD-ish highlighting, error gutter) — the only item that adds a dependency; additive, isolated to `CodePanel`, ~1 day.

**Rewrite required? No.** State is centralized in two zustand stores; components are small (largest is `Viewport.tsx` at ~720 lines); styling is token-friendly plain CSS. Every phase lands as ordinary PRs against React 19 + zustand + CSS. The full program is roughly 6–9 working days end-to-end, and Phase 1 alone is shippable in a day.

---

## 7. What NOT to change

- **The industrial brand.** Graphite + safety-orange, Chakra Petch / IBM Plex Mono, the blueprint bed grid, diamond slider thumbs, the chamfered chips — distinctive and on-audience (makers like machine-shop aesthetics). The fix is *volume* (type scale, caps discipline), never palette or fonts.
- **The three-panel layout.** Chat-left / viewport-center / properties-right is the correct, conventional frame. Label it; don't move it.
- **The empty state's structure.** Kicker → promise → photo path → prompt ideas → no-key examples is genuinely strong onboarding; it only needs the copy pass.
- **The behavioral layer (SPEC.md).** Camera-keep, placement undo/redo, version restore, retry, refine-against-reference with canonical pose + mm anchor, loud partial-failure exports, stale-state guarantees — this is mature, correct engineering. The audit found zero behavioral defects worth changing; every finding is presentational.
- **Slider → live re-render.** Verified ~1–2s loop; this direct-manipulation core is the product's best moment. Protect it through any refactor.
- **Existing micro-polish** (focus rings, reduced-motion support, aria on form controls, tooltips, shortcuts overlay) — keep all of it; Phase 2 extends aria coverage to the glyph buttons rather than replacing the approach.

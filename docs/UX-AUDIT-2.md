# Vibemesh — UX Audit 2: the Blender re-theme

**Date:** 2026-06-12 · **Scope:** visual/design-system audit of the Blender-gray re-theme, live at 1440×900 / 768×1024 / 375×812 (12 captured states) + forensics of `src/styles.css`, `src/components/*.tsx`
**Context:** owner verdict after the re-theme — *"I don't like the UI overall."* This audit answers **why**, and what direction to commit to.

---

## 1. Executive diagnosis

The re-theme swapped Blender's paint onto the industrial theme's bones, and the two languages cancel each other out: Blender's calm neutral grays removed all the energy, while the leftover industrial DNA — 39 letter-spaced ALL-CAPS micro labels (now in Inter), 1px-outline chips on every surface, six dashed-border boxes — keeps the page reading as an annotated wireframe rather than a finished product. There is **zero elevation anywhere except modals** (computed `box-shadow: none` on every toolbar, HUD chip and bar), the viewport canvas (`#232323` + a leftover `#101113` empty-state overlay) is *darker* than the panels — the inverse of Blender, whose stage is the lightest surface — so the gray model floats in a black pit over invisible grid lines and an invisible build plate. The accent `#4772b3` measures **2.92:1 against the panels** — it fails WCAG as text yet is used for *all* structure (active tabs, group titles, links, the hero headline's outline stroke), which is the literal, measurable reason the UI feels dull; meanwhile teal, green, amber, blue and brand-orange compete on a single default screen with no system. **The diagnosis is not "bad palette" but "no committed design language":** the neutral foundation is right and worth keeping, the Blender-token mimicry is not — the fix is one warm accent (the filament orange already in the logo and the selection glow), a real elevation ramp, a lighter viewport stage, and the deletion of the industrial caps/outline/dashed vocabulary. This is salvageable in roughly one token pass (hours) plus one component pass (a day); no structural rework is required.

### Hypotheses tested

| Hypothesis | Verdict |
|---|---|
| Palette swap over another design's bones | **Confirmed.** 39 `letter-spacing` declarations (0.08–0.34em) on hard-coded caps strings (`DESIGN CHAT`, `QUALITY`, `PRINTER`, `BOX`, `SHORTCUTS`, `WIDTH (X)`…), 6 dashed-border boxes, the `#101113` industrial gradient still baked into `.empty-state` (styles.css:984), `.topbar::after` machined-hairline gradient (:125) — all rendered in Inter on Blender grays. Neither language survives. |
| Contrast/hierarchy collapse, no depth | **Confirmed, measurable.** Computed `box-shadow: none` on `.vp-toolbar`, `.hud-chip`, `.sel-bar`, `.dims`, `.plates-bar`, `.flow-rail`; panels `#2b2b2b`, controls `#383838`, viewport `#232323` — stage darker than chrome; grid `#2e2e2e` on `#232323` and plate at `opacity:.35` are effectively invisible (verified in screenshots); accent-as-text = 2.92:1. |
| Color semantics incoherent | **Confirmed.** One default screen shows: orange (brand + selection), blue (Export, Move, active tab, sliders, group titles, flow rail), teal (dims, all param values, version chips, code chips, tweak-hint border, engine links, measure), green (status dot, render chip), amber (warnings), red (errors) — six UI hues, two of which (blue/teal) have overlapping "interactive/value" meanings. |
| Component-level roughness | **Confirmed.** 5 native `<select>`s (quality, printer, chat engine ×2, engine model) with OS chrome and `◇` glyphs inside option labels; native number-spinners on param inputs; 33 unicode glyph icons (`✕ ▣ ✥ ↻ ⊕ ⤓ ⬇ ⚙ ◇ ⏎ ↺ ⏱ ⬚`) coexisting with the 12 SVG icons in `icons.tsx`; param values displayed twice (teal text + input); padding uses every value from 4–14px (25 distinct combos), gaps use 2,3,4,5,6,7,8,9,10,12,18px. |
| Mobile/tablet leftovers | **Confirmed — two real bugs + ergonomic debt.** See §5. The empty-state hero is *unreachable* below ~900px wide (content top at −264px, cannot scroll up), and the Tweak FAB renders over the empty state's example cards. |

**Is the Blender direction salvageable?** The *neutral-calm* half is — it's a better base for hobbyists than safety-orange industrial. The *literal Blender clone* half is not: Blender's look depends on its compact custom widgets, a viewport that is the lightest thing on screen, and a single selection hue. Copying only its hex values produced a hybrid with no identity. Recommendation: keep the calm grays, stop imitating Blender, and let the product's own mark — filament orange — carry the identity.

---

## 2. Findings

Severity: **critical** = primary cause of "I don't like it" · **major** = visibly unfinished/incoherent · **minor** = polish.
Effort: **S** = hours (mostly `styles.css`) · **M** = part of a day (component edits) · **L** = >1 day.

| ID | Sev | Effort | Issue | Evidence | Fix |
|----|-----|--------|-------|----------|-----|
| V1 | critical | S | **No elevation system.** Every floating element (viewport toolbar, HUD chips, selection bar, parts bar, dims) is a flat 1px-border box; only `.modal`/`.dropdown` have shadows. Nothing lifts; the page is a single plane of gray. | Computed `boxShadow: none` on `.vp-toolbar`, `.hud-chip`, `.sel-bar`, `.dims`; styles.css has 5 `box-shadow` rules total | 3-step shadow ramp (§3); floating HUD gets `--sh-float`, raised controls get `--sh-raise`; delete most 1px borders in exchange. |
| V2 | critical | S | **Viewport stage is a black pit.** Canvas bg `#232323` is darker than panels `#2b2b2b` (Blender inverts this); empty state still multiplies in the **old industrial `#101113`** gradient; grid `#2e2e2e`/`#3a3a3a` on `#232323` is near-invisible; build plate `#222222 @ 0.35` opacity is invisible; gray model `#a8a8b0` has nothing to sit on. | `Viewport.tsx:277,828–838`; `styles.css:984`; screenshots (unselected model floats in void) | Lighten the stage above the panels: gradient `#34373c → #26282b`; grid `#3c3f44`/`#4a4e54`, border `#5c6066`; plate opaque `#232529` with edge line; model `#b9bdc6`. |
| V3 | critical | S | **The accent fails as a color.** `#4772b3` on `#2b2b2b` = **2.92:1** — illegible as text, yet used for active tab text, param group titles, links, the empty-state kicker and the hero's outline stroke. It's also the *only* structural color, so the page has no warmth and no focal point; it visibly fights the orange brand mark sitting 8px away from the blue Export button. | Computed `.tab.active`/`.param-group-title` color `rgb(71,114,179)`; contrast math; topbar screenshot | Commit to **one accent: filament orange** (`#f5792a`, already the brand + viewport selection). Blue is deleted. Text-tint `#ff9d5c` (8.0:1) for links/active text; dark text `#211309` on orange fills (4.5:1+; white on `#f5792a` is only 2.7:1). |
| V4 | critical | S | **Color semantics are a free-for-all.** Six hues with overlapping meanings; teal alone means "value", "version", "measure", "hint", "link" in five different components. | §1 table; computed styles (`.dims`, `.param-value`, `.code-chip` all `#56c4b0`) | Four roles only: **orange** = brand/action/selection/links · **green** = ok (dots + one status chip) · **amber** = warning · **red** = destructive/error. **Teal is deleted**; values/dims become `--text` with `tabular-nums`; measure overlay uses accent. |
| V5 | critical | S | **Industrial caps DNA rendered in Inter.** 39 letter-spacing declarations from 0.08em to 0.34em on 10–11.5px caps strings. Chakra Petch made tracked caps look machined; Inter makes them look like wireframe annotations. The hero is ALL-CAPS with a 1.5px outline-stroke `em` in the failing blue — it reads as *unrendered placeholder text*. | grep: 39 `letter-spacing` rules; `EmptyState.tsx:14–16`; `.empty-kicker` 0.34em; empty-state screenshot | Tracking policy: max 0.06em, only on 11px semibold eyebrows; everything else `letter-spacing: normal`. Hero becomes mixed-case Inter 650 with one orange word, no stroke text. Caps survive only for ISO/TOP/FRONT/RIGHT/FIT and `kbd`. (String de-casing is Phase 2 — they're hard-coded uppercase.) |
| V6 | major | S | **Outline-chip + dashed-border texture everywhere.** Status, dims, parts, version chips, action chips, kbd, API chip = 1px outline boxes; 6 dashed-border containers (tweak hint, photo tile, modal intro, refine bar, action chips, drop overlay). Dashed + outline + flat = blueprint, not product. | styles.css:379,546,559,1515,1759,1996; every chip rule | Chips become **filled** (`--raised` bg, no border, `--sh-raise`); colored *text/dot* carries status, not colored borders. Dashed is reserved for exactly one meaning: drag-and-drop targets. |
| V7 | major | M | **Native form controls clash with the theme.** 5 native `<select>`s (two of them floating raw over the viewport), native number-spinners on param inputs, `◇` glyphs inside option text. | `Viewport.tsx:484–516`; tablet/mobile screenshots show macOS chrome | `appearance:none` select skin (raised bg, SVG chevron, `--r-sm`), hide number spinners, drop glyphs from option labels. Keep native popups — only the closed control needs theming. |
| V8 | major | M | **HUD floats uncontained.** Top-right: two naked selects with floating micro-labels (text-shadow hack at styles.css:1750); top-left: lone status chip; the flow-rail pill floats center; bottom: three separate boxes. Nothing shares a container, so the viewport reads as scattered debris. | `styles.css:1745–1751`; desktop screenshots | Group top-right Quality+Printer into **one** raised card with internal labels; status chip docks to the toolbar; flow rail becomes a compact contained stepper; bottom bar slots (dims · parts · meta) align on one 36px baseline row. |
| V9 | major | S | **Spacing/radius rhythm is noise.** 25 distinct padding combos using every integer 4–14; 11 gap values (2,3,4,5,6,7,8,9,10,12,18); radii 4/6/10/999 mixed per component. | grep counts (§1) | 4px grid: space tokens 4/8/12/16/24; radii: 5px controls, 8px cards/panels/modals, 999 pills. Panel gutter 3px → 6px. |
| V10 | major | M | **Param rows show every value twice.** Teal value text right of the label *and* an editable number input below — two sources of truth, both eye-catching. | RightPanel param markup; tablet screenshot | Keep slider + one number input; delete `.param-value` text (the input *is* the value). |
| V11 | minor | M | **Two icon languages.** 12 clean SVG icons (toolbar) vs 33 unicode glyphs in buttons (`⬇ Export`, `▣ Photo`, `✥ Move`, `↻ Rotate`, `⊕ Center`, `⤓ Drop`, `✕ Remove`, `⚙`, `▾`, `↺`, `⏎`…), which render off-baseline and differ per OS. | grep glyph count; `icons.tsx` | Finish the job UX-AUDIT-1 F7 started: extend `icons.tsx`, replace all in-button glyphs. |
| V12 | minor | S | **Detached project-menu arrow.** `.project-name` is fixed 260px, so the `▾` floats ~150px from a short title; at ≤900px it sits flush against the AI pill and reads as *its* dropdown. | `styles.css:183`; desktop + mobile screenshots | Auto-size the title (`field-sizing: content` or ch-based width) and attach the chevron; group title+chevron in one hover container. |
| V13 | minor | S | **Misplaced/rough helper UI.** The "These sliders edit the model's recipe" dashed box also shows on the **Code** tab; the `⌘⏎ / ⌘S — apply & render` hint wraps mid-phrase; `kbd` pills are min-width 132px even for "F"; "IN USE" caps badge. | Code-tab screenshots (desktop + tablet); `styles.css:1557` | Scope hint to Tweak tab; `white-space: nowrap` on the shortcut hint; `kbd` min-width 0 + padding; sentence-case badge. |
| V14 | minor | S | **Stray hue drift in neutrals.** Code editor `#131518`/gutter `#0f1114` are blue-tinted vs the neutral grays; user message bg `#313640` likewise; `::selection` blue; scrollbar thumbs bordered with `--panel`. | `styles.css:487,1304,2056` | Re-derive all surfaces from the single neutral ramp; `::selection` orange at 35% alpha. |
| V15 | minor | S | **Leftover industrial details.** `.topbar::after` machined gradient hairline; diamond-rotated slider thumbs half-overridden later in the file (two competing thumb rules); old-palette comment block says revert is expected. | `styles.css:125–134,1232–1256,2215–2231` | Delete dead rules; one slider thumb definition; keep the old-palette comment until the new direction ships, then remove. |

Mobile/tablet findings are in §5 (M1–M8) — M1 and M2 are functional bugs, not styling.

---

## 3. The direction: **"Workshop Warm"** — calm graphite + filament orange

Not Blender, not the old machine-shop. The calm neutral foundation the owner *wanted* from "make it look like Blender", with the product's own identity carried by one warm accent — the orange that already lives in the logo, the viewport selection glow, and half the 3D-printing hobby (filament spools, Prusa, printed-part orange). Depth comes from elevation, not borders. Numbers stay quietly mono-spaced; labels speak sentence case.

### Token sheet (drop-in `:root` replacement)

```css
:root {
  /* ── neutral ramp (one family, no hue drift) ── */
  --gutter:      #19191a;   /* app frame between panels */
  --panel:       #242526;   /* topbar, chat, right panel */
  --raised:      #2e2f31;   /* controls, chips, cards, HUD surfaces */
  --raised-hi:   #38393c;   /* hover on raised */
  --inset:       #1d1e1f;   /* code editor, wells, textarea */
  --line:        #39393b;   /* hairlines inside panels */
  --line-strong: #47484a;   /* input borders (the only borders left) */

  /* ── text ── */
  --text:        #ececec;
  --text-dim:    #b4b4b6;   /* 7.4:1 on panel */
  --text-faint:  #909093;   /* 4.6:1 — never below 11px */

  /* ── ONE accent: filament orange ── */
  --accent:      #f5792a;   /* fills: primary btn, active slider, selection bar */
  --accent-hot:  #ff8d49;   /* hover fills */
  --accent-text: #ff9d5c;   /* links, active tab text, eyebrows — 8.0:1 on panel */
  --on-accent:   #211309;   /* text on orange fills (white fails at 2.7:1) */
  --accent-soft: color-mix(in srgb, var(--accent) 14%, transparent); /* tints */

  /* ── semantic (dots + text, never borders) ── */
  --ok:   #6fcf97;
  --warn: #e5b454;
  --err:  #e5604c;
  /* --teal is DELETED. Values are --text + tabular-nums. */

  /* ── elevation ── */
  --sh-raise: 0 1px 2px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.045);
  --sh-float: 0 4px 16px rgba(0,0,0,.40), 0 1px 3px rgba(0,0,0,.45);
  --sh-modal: 0 24px 64px rgba(0,0,0,.55);

  /* ── shape & rhythm ── */
  --r-sm: 5px;  --r-md: 8px;  --r-full: 999px;
  --s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s5: 24px;

  /* ── type (Inter + IBM Plex Mono stay) ── */
  --font-display: 'Inter', sans-serif;
  --font-mono: 'IBM Plex Mono', monospace;
  --fs-micro: 11px;    /* eyebrows only: 600, 0.06em, sentence case */
  --fs-small: 11.5px;
  --fs-body: 13px;
  --fs-title: 15px;
  --fs-brand: 18px;
  --fs-hero: clamp(30px, 4.2vw, 46px); /* mixed case, weight 650 */
}
```

### Policies (the part that makes it a *system*)

- **Border policy:** borders exist on text inputs/selects (`--line-strong`) and panel hairline separators (`--line`). Everything else that used a border is now a *filled* `--raised` surface with `--sh-raise`. Dashed = drop zones only.
- **Elevation policy:** panel content = flat; interactive controls = `--sh-raise`; anything floating over the viewport (toolbar, HUD cards, selection bar, FAB) = `--sh-float`; menus/modals = `--sh-modal` + 1px `--line-strong`.
- **Label policy:** tracked-caps micro labels are retired. Eyebrows ("Design chat", "Box", "Try a prompt") = `--fs-micro` 600 `--text-faint` sentence case 0.06em. Caps survive only in ISO/TOP/FRONT/RIGHT/FIT view buttons and `kbd` keys (mono).
- **Color policy:** orange is the only hue that means "interactive/selected/brand". Green/amber/red appear as status dots and message text, never as chip borders. Numbers (`dims`, param inputs, tris, ms) = `--text` `tabular-nums`, dim label beside them.
- **Controls:** selects get `appearance:none` + raised skin + SVG chevron; sliders get a 4px track with filled-progress in `--accent` and a 16px round thumb (`#fff` border on accent); number inputs hide spinners; primary button = accent fill + `--on-accent` text; secondary = raised fill, no border; destructive = ghost red text until hover.
- **Viewport scene (`Viewport.tsx`):** stage gradient `#34373c → #26282b` (lighter than panels — the model is the hero); grid `#3c3f44` / `#4a4e54` / border `#5c6066`; opaque plate `#232529` with visible edge; model `#b9bdc6` (PLA gray, roughness ~0.55); hover = faint warm emissive; **selection stays orange** (`#8a4012` emissive) — it finally matches the system instead of fighting it.
- **Identity moments:** orange brand mark + one orange word in the mixed-case hero; orange selection glow in the scene; orange progress on sliders; the contained 1-2-3 stepper. Everything else stays quiet — that contrast *is* the identity.

### What stays from the current implementation

Layout architecture (340 / 1fr / 312 grid, panels-on-gutter concept), Inter + IBM Plex Mono, the 5-step type scale concept, all UX-AUDIT-1 copy and IA (export menu, Tweak/Code tabs, simple/advanced, guided rail concept, status consolidation), the SVG icon set, the bottom-sheet pattern, orange viewport selection, dark theme, `tabular-nums` rules, focus-visible rings (recolored), reduced-motion support.

---

## 4. Phased plan

**Phase 1 — token & scene pass (2–4 h, `styles.css` + ~10 lines of `Viewport.tsx`):**
new `:root` ramp + accent swap (V3, V4, V14); shadow ramp + chip fills + border/dashed policy (V1, V6); delete letter-spacing >0.06em, hero de-stroke via CSS (V5 partial); spacing/radius normalization + 6px gutters (V9); slider/input/select CSS skin incl. spinner hiding (V7 partial); viewport stage/grid/plate/model colors (V2); empty-state overlay → neutral + **fix the unscrollable-hero bug** (M1: `align-items: flex-start` + `margin: auto 0` on `.empty-inner`, or `align-items: safe center`); dead-rule cleanup (V15).

**Phase 2 — component pass (~1 day, `*.tsx`):**
de-caps the hard-coded strings (V5 done); replace 33 glyph icons with SVG (V11); HUD containment — settings card top-right, docked status, contained stepper, baseline bottom row (V8); param value dedupe (V10); project title autosize + attached chevron (V12); scope tweak-hint to Tweak tab, nowrap shortcut hint, kbd sizing (V13); mobile set M2–M7 (FAB hidden on empty state, topbar collapse priorities, toolbar scroll fade, sheet to 46vh, 44px touch targets).

**Phase 3 — optional polish (1–2 days, structural):**
mini render thumbnails on example cards; one-strip status toasts (UX-AUDIT-1 F5 v2); CodeMirror with theme-matched syntax colors; version timeline chips in chat. None of this blocks the re-launch impression.

---

## 5. Mobile & tablet verification (768×1024 and 375×812)

| ID | Sev | Where | Issue | Evidence |
|----|-----|-------|-------|----------|
| M1 | critical (bug) | ≤900px (and short desktop windows) | **Empty-state hero is unreachable.** `.empty-state` is `display:flex; align-items:center` with `overflow-y:auto`; when content (794px) exceeds the viewport area, the top half overflows *above* the scroll range. Measured: `.empty-inner` top = **−264px** with `scrollTop` pinned at 0 — headline and kicker can never be seen on a phone. | preview_eval at 375×812: `{scrollTop:0, innerTop:-264.4, titleTop:-201}`; styles.css:976–987 |
| M2 | major (bug) | ≤900px | **Tweak FAB renders on the empty state**, overlapping the example cards ("Storage box" card's Load area sits under the `▲ Tweak` pill) even though there is nothing to tweak. | 375px empty-state screenshot; computed `display:flex` on `.sheet-toggle` with no model loaded |
| M3 | major | 375px | **Project title truncates to ~6 characters** ("Storag…"): the detached `▾`, the full `● AI · Claude ⚙` pill and Export all keep fixed width while the title shrinks first. | 375px screenshots (all states) |
| M4 | major | ≤900px | **Toolbar overflow is invisible.** Horizontal toolbar scrolls (`scrollbar-width:none`) but RIGHT/FIT/section/measure/snapshot/help sit off-screen with no fade or affordance — at 375px the visible row ends at "FRONT" and looks complete. | styles.css:1621–1635; 375px screenshot |
| M5 | major | ≤900px | **Stacked HUD selects eat the stage.** Quality + printer selects stack top-right consuming ~96px of an already-short viewport; printer text clips mid-dimension ("220×22…"); status chip and toolbar add two more floating rows. | 375/768 screenshots |
| M6 | minor | ≤900px | **Sheet leaves ~100px of model visible** (62vh sheet + 34vh chat at 375×812), defeating live slider feedback — you drag "Inner width" and can't see the box. | 375px sheet-open screenshot |
| M7 | minor | touch | **Sub-44px touch targets:** 13px slider thumbs, 30px icon buttons, 17px attachment-remove dot; native number spinners appear on tap. | styles.css:1232–1256,307,622 |
| M8 | minor | 768px | Layout is sound (viewport-first, FAB, horizontal toolbar all work); chat reserves 34vh even with one message — acceptable, revisit in Phase 3. | 768px screenshots |

*Verified working at small sizes:* viewport-on-top reorder, sheet open/close animation, selection bar appearing above the dims row, export menu and modals fitting the viewport, custom-bed dialog usable at 375px.

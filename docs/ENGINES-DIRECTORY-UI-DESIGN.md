# Engines Directory UI — Redesign Plan

**Status:** ✅ BUILT — Phases 0–2 shipped on `feat/engines-directory-ui` (2026-06-21), verified live + lint / 195 unit / 23 e2e / build green. Phase 3 (static descriptions) deferred. Senior-lead board, 2026-06-21.
**Goal:** Restyle the AI Engines panel as a **Directory-style marketplace** — a left method-nav rail, a search box, a sort/refresh toolbar, and a responsive **card grid** — modeled on Anthropic's "Directory" (Skills / Connectors / Plugins) modal, but adapted to AI engines and kept inside this app's dark-engineering design system.

This doc is the output of a 10-agent board (3 surveyors → 4 senior leads → chief-architect synthesis → adversarial completeness critic → finalize). It supersedes nothing; it extends `docs/ENGINE-MARKETPLACE-DESIGN.md` (the data layer) with a UI layer.

---

## Verdict

**FEASIBLE** — a pragmatic phased reskin with **no server / store / api signature changes** for the shippable core (Phases 0–2). The data is already card-ready; every card field maps to an existing `ProviderInfo` / `CatalogEntry` field. This is a CSS + JSX rewrite of one ~520-line file ([`src/components/EnginesModal.tsx`](../src/components/EnginesModal.tsx)) plus new CSS and one new search icon.

**Core effort:** ~4–5.5 dev-days (Phases 0–2). Optional Phase 3 +0.5–1d.

---

## Key IA decisions (where we diverge from the screenshot)

The screenshot is a literal template; the board adapted it to what actually serves engine selection:

| Screenshot element | Decision for Engines |
| --- | --- |
| Sidebar: Skills / Connectors / Plugins | **Method rail**: All · Subscription·CLI · API key · Local · Custom (the existing `cli`/`apikey`/`local` `SECTIONS` axis turned 90°). Answers the user's real question: *do I pay a subscription, paste a key, or run it myself?* Each row carries a count badge + the section hint as subtitle. |
| "Anthropic & Partners" category chip + "Filter by ▾" | **Dropped.** A second filter axis is redundant at ~13 providers once the rail filters by method. |
| "Sort by ▾" dropdown | **One toggle:** Sort: Status / A–Z. ("Recently used" rejected — needs a `lastUsedAt` the data model lacks; built-ins aren't in `.connections.json`.) |
| Brand logos on cards | **Monogram tiles** (initials over `--raised`, cloning `.msg-avatar`). Avoids bundling OpenAI/Gemini/Grok trademarks and per-rebrand asset upkeep; custom/local have no natural mark. `aria-hidden` so SR users hear the label. |
| Whole-card-clickable | **Non-interactive card** (`<div>`, not a button) with discrete inner buttons. No `role=grid`, no roving tabindex — Tab reaches every control in DOM order. Resolves the nested-interactive a11y anti-pattern. |
| Separate connect modal | **Expand-in-place drawer** below the card (never a nested modal — keeps the single focus trap intact). |
| Serif "Directory" title + glass | **Declined.** Keep `<h2>AI engines</h2>` in Bricolage `--font-display` (no new serif font / FOUT); solid `--panel` surfaces, **no** `backdrop-filter` over the live WebGL canvas (the design system reserves glass for viewport overlays only). |

### Card anatomy (4-state machine)
- **Top-left:** monogram tile. **Title:** provider label. **Subtitle:** model id / protocol line.
- **Top-right corner control by state:**
  - `addable` / `connectable` → **`+`** (opens the connect drawer)
  - `connected` (`available && engine!==id`) → green tick + a **Use** button
  - `in-use` (`engine===id`, or for the collapsed Local card `engine.startsWith('local:')`) → filled **In use** pill + an `--accent-line` border so exactly one card reads as selected
- **Body:** 2-line clamped description (`-webkit-line-clamp:2`) + the specs line (`Context …·writes up to …·times out after …`).

---

## Component architecture

All in `EnginesModal.tsx` except the new pure selector:

- **`EnginesModal`** (kept) — dialog shell. Still owns `useFocusTrap`, capture-phase Escape, backdrop-target-only close, fetch-catalog-on-open, `refreshHealth`/`health`, `role=dialog`, the literal `<h2>AI engines</h2>`. Renders `<DirectoryShell>` as its body. `className='modal'` (Phase 1) → `'modal modal-wide'` (Phase 2, **additive**).
- **`DirectoryShell`** (new) — holds ALL ephemeral view state as local `useState` (`query`, `activeMethod`, `sortKey`, `selectedCardId`) — never in zustand (would leak across opens). Runs `useMemo(deriveCards → filter → search → sort)`. Owns post-filter focus recovery.
- **`deriveCards()`** (new pure selector, `src/components/engineCards.ts`) — `(health, catalog, engine) → UnifiedProvider[]`. **Bakes in the `local:*` collapse** currently inline at `EnginesModal.tsx:54-74` (preserving `useId` synthesis + the `engine.startsWith('local:')` active match). Computes the 4-state machine; normalizes specs (`ProviderInfo.contextWindow` vs `CatalogEntry.caps.contextWindow`) into one field; dedupes addable catalog entries vs existing `conn:*` by `catalogId` (`custom-*` always addable). **Pure → unit-testable in node.**
- **`EngineCardGrid` / `EngineCard` / `EngineCardDrawer`** (new) — grid (`auto-fill minmax(240px,1fr)`), non-interactive cards, and the expand-in-place drawer.
- **`DirectorySidebar` / `DirectoryToolbar`** (new, Phase 2) — the method rail + search/sort/refresh.

### The drawer has TWO bodies (the critique killed the "one verbatim copy" idea)
The current code has **two structurally different form state machines**. They re-host as two drawer bodies selected by `card.state`:
- **connected / built-in body** → re-hosts `EngineRow`'s machine: API-key password *or* base-URL+Apply (with its tolerant "Saved." note), Test (keyless-disabled), Disconnect, Remove, the Model/Effort selects, the specs line, the `Get a key ↗` link, the `role='status'` live region.
- **addable body** → re-hosts `AddConnection`'s machine **minus** the chip gallery + `pick()` (the `catalogId` is fixed by card identity): Name / Base URL / Model / Fetch-models / Key / Add, its own `role='status'` region.

---

## Phases (each independently mergeable)

### Phase 0 — `deriveCards` selector + unit net, WIRED INTO the existing render — ~0.5–0.75d
Land the pure normalization and **immediately consume it from the current rows**, so there's never a second divergent local-collapse code path. UI unchanged; data source unified. Unit tests (`engineCards.test.ts`, node env): local collapse → one card; `engine='local:llama3'` → that card in-use + model pre-selected; addable dedupe by `catalogId`; exactly-one in-use; `custom-*` always addable; addable card carries `caps.contextWindow`; built-in (undefined `catalogId`) is searchable.
**Verify:** `npm run test:run` + `npm run lint` green; modal renders identically.

### Phase 1 — Card grid MVP (the recognizable look, zero data change) — ~2–3d (+0.5d e2e)
Grid + monogram tiles + 4-state non-interactive cards + expand-in-place drawer (two bodies). **Held behind a flag / internal until Phase 2** so users never get an ungrouped 13-card scroll as a "standalone improvement." Method hints retained as a one-line caption above the grid. Default **status-priority sort** (In use → Connected → Addable; alpha within; built-in before `conn:*`; active `local:<model>` at top of Connected).
**Focus-on-collapse re-seat:** `useFocusTrap` only restores focus on full-dialog *unmount*, so a drawer collapse inside the persistent dialog orphans focus — `EngineCard` stores a trigger ref and re-seats focus on collapse.
**Verify:** `surfaces.spec.ts:26-35` green with zero edits; +3–4 thin e2e (card `+` reveals form; connected card shows Use; Local card shows model dropdown; open→close drawer keeps focus in dialog).

### Phase 2 — Search + method sidebar + smart sort + circular refresh + mobile override — ~1.25d (+0.4d e2e)
The Directory chrome; **this is where Phase 1 flips ON for users.** Search (magnifier + clear-X, `aria-live` result count; predicate `label + detail + (catalogId ?? '')`, coalesce undefined → no throw). Method rail with count badges + cobalt active pill + `aria-current`. Circular refresh (relocated footer rescan) + Sort toggle. **Critical:** ship `.app.is-mobile .modal.modal-wide { width:100%; max-width:100% }` (+ sidebar→chip-strip + single-column grid, all gated on the JS `.app.is-mobile` class) — the existing mobile bottom-sheet selector (`styles.css:1654`) lists only `.modal`/`.modal.modal-sm` and will **not** catch `.modal-wide`.
**Verify:** `surfaces.spec.ts:26-35` still green; new e2e: search filters + announces; sidebar method filters; at 375px assert grid container width ≤375 **then** single-column + sidebar collapsed + no overflow, launched from **both** the TopBar chip and the ModelMenu `.mm-setup` path.

### Phase 3 — Richer cards (DEFERRED, value-gated) — ~0.5–1d
Only if the dynamic detail line proves too thin in the clamp: add a static `description` to each `CATALOG` entry → `ProviderInfo.description`, guarded by a single-source selftest; update `docs/ENGINE-MARKETPLACE-DESIGN.md`.

---

## Risks closed in the introducing phase
1. **`.modal-wide` not caught by the mobile bottom-sheet selector** → explicit `.app.is-mobile .modal.modal-wide` override ships in the same Phase-2 commit.
2. **`.app.is-mobile` is a JS class, not a media query** → sidebar collapse + single-column grid gated on it; the 375px e2e asserts grid container width ≤375 before card count (reusing the `surfaces.spec.ts:77-114` setup that proves the class is reachable).
3. **Drawer collapse orphans focus** → `EngineCard` trigger-ref re-seat (closes the `useFocusTrap` restore-on-unmount-only gap).
4. **Heading/className rename breaks e2e** → keep literal `<h2>AI engines</h2>` + `className='modal modal-wide'` (additive).
5. **Refactor silently drops a handler** (Use/Test/Disconnect/Remove/Add have no e2e today) → centralize the 4-state + local collapse in `deriveCards` with a unit net wired in at Phase 0; +thin e2e in Phase 1.

## Explicitly out of scope (would push to ~9–13d at low value for 13 providers)
Brand-logo asset set · a real `--font-serif` token · a "Filter by" dropdown · `lastUsedAt` / "recently used" sort.

## Test impact summary
- **Preserve** (`surfaces.spec.ts:26-35`): trigger name, `[class*=modal]`/`[role=dialog]`, `/AI engines/i`, Escape-closes.
- **Do not touch** (`app.spec.ts:28-42`, `surfaces.spec.ts:99-114`): ModelMenu body-portal + phone clamp.
- **Add:** Phase 0 `engineCards.test.ts` (node); Phase 1/2 e2e as above.
- No bench/server-selftest impact for Phases 0–2.

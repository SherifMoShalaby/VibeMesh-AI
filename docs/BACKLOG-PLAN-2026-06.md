# Vibemesh-AI — Backlog Action Plan (2026-06-21)

Produced by a 12-lead board, each grounding its assessment in the current `main`
(post PR #108 merge + engine-marketplace + concurrent-chats). Effort scale:
**S** <2h · **M** <1d · **L** <3d · **XL** >3d.

## Verdict
Ship three S-effort wins now (project search, re-roll a turn, `.vibemesh`
empty-state import) plus the silent **cross-tab data-loss fix** as the headline;
defer everything blocked on hosting or a lapsed bench key.

## Ranked table

| Item | Effort | Value | Risk | Recommendation |
|---|---|---|---|---|
| product-ergonomics — project search | S | med | low | **do-now** |
| product-ergonomics — re-roll a turn | S/M | med | low | **do-now** |
| `.vibemesh` import on empty state | S | med | low | **do-now** |
| retrieval-recall floors | S | med | low | do-next |
| chatpanel memoization (ContextChip memo + 2 useMemo) | S | low | low | do-next |
| cross-tab sync | M | med | med | do-next |
| product-ergonomics — per-part quantities | M | low/med | med | do-next *(gated on UX decision)* |
| product-ergonomics — version compare w/ thumbnails | L | low | med | **drop / descope** |
| prompt-shrink | M | low | med | **defer** *(no gate key)* |
| pwa-offline | M | low | med | **defer** |
| server-hardening | S | low | low | **defer** *(pre-hosting)* |
| blind-spots — Safari `-webkit-backdrop-filter`, OG, robots | S | low | low | **defer** *(cheap polish)* |
| viewport-overlays | S | low | low | **drop** |
| telemetry (off-device) | S | low | low | **drop** |
| blind-spots — npm ci, i18n | — | — | — | **drop** |

## Key corrections the board surfaced (vs. my prior read)
- **server-hardening shrank again** — a full wasm/blob/worker-aware **CSP already ships** as a meta tag (`vite.config.ts:14-24`) + `X-Frame-Options: DENY`. Only header-only directives (`frame-ancestors`, `report-uri`) remain, and they only matter once hosted.
- **retrieval-recall** — routing is already guarded by the exact-set `bench/retrieval.selftest.mjs`; only the *quantitative* recall number lags. (`bench/retrieval.mjs` doesn't exist.)
- **telemetry** — a local privacy-preserving precedent already ships (`src/lib/skillStats.ts`). Off-device telemetry contradicts the local-first invariant → **drop**.
- **viewport-overlays** — the inline blocks read exactly the geometry state the parent re-renders on, so a memoized child never skips a render: **zero** perf win, adds coupling → **drop**.
- **chatpanel-memo** — the real per-token hotspot is `ContextChip`'s `estHistoryTokens(chat)`, not `promptHistory`/`versionOf` (those are microsecond-cheap).
- **cross-tab-sync is a real silent data-loss bug** — persistence is whole-record last-writer-wins; a second tab's stale boot snapshot silently discards everything the first tab saved (even to *unrelated* projects). Elevated to do-next.
- **prompt-shrink is blocked** — only the ~749-token Final self-check block is a mechanically safe cut, but it can't be proven safe today: the gate's authoritative engine (kimi) is un-runnable (lapsed key) and claude-code is advisory and never gates.
- **blind-spots** — `npm ci` vs `install` is a *settled, documented* decision (3 workflows, @emnapi lockfile mismatch); i18n is by-design single-locale. Both **drop**. Real bug: missing `-webkit-backdrop-filter` → flat glass on iOS Safari.

## Do now (quick wins — pure frontend, no decisions, parallelizable)
1. **Project-switcher search** (`TopBar.tsx`) — `useState` query + text input above `.menu-scroll` (~line 96); filter `projects.map` (line 103) by `name.toLowerCase().includes(query)`. Auto-focus on open, clear on close. No store change.
2. **Re-roll a successful turn** (`generationActions.ts` + `ChatPanel.tsx`) — add `rerollLast` modeled on `retryLast` (473-485) **without** the error-only trim: stash trailing assistant turn(s) into `chatFuture` (mirror `restoreVersion`, store.ts:891-893, so the old result stays recoverable via the existing redo pill), then `runGeneration` with the prior user text. Expose on `VibeState`; add a "Regenerate" button on the last code-bearing assistant message, guarded by `!generating && isCurrent`.
3. **`.vibemesh` import on empty state** (`EmptyState.tsx`) — pull `importShareFile` from store + `pushToast` from ui; add a second hidden file input (`accept=".vibemesh,application/json"`) + "Import .vibemesh" button in `empty-composer-foot`; widen the drop overlay to accept `application/json`/empty-MIME alongside images and branch the drop handler. Keep the button enabled even without an AI key.

## Do next (sequenced)
1. **retrieval-recall floors** — append 3 stylized positives + 2 homograph cases (labeled with expected mechanism) to `bench/retrieval-recall.mjs` CORPUS; floors unchanged (additions hold P=R=1.0). Verify `npm run bench:recall` → `npm run bench:selftests`.
2. **chatpanel memoization** — `React.memo` on `ContextChip` (the real win), plus the two `useMemo`s (`promptHistory`, `versionOf`) as cheap insurance. **Do not** bundle the message-row split (separate item, gate on a profiler trace).
3. **cross-tab sync** — minimal `BroadcastChannel('vibemesh-storage')` in `src/lib/storage.ts`: per-tab `TAB_ID`, post `{type:'projects-saved', tabId, maxUpdatedAt}` **after** a successful `idbWrite`, ignore own echoes, on remote msg re-read + `reconcileRecord` (newest-`updatedAt`-wins) + fire a `setOnExternalChange(cb)` the store subscribes to in `init`. Receiver refreshes list/inactive projects but **does not** re-save (no rebroadcast storm) and leaves the active editor untouched.
4. **per-part quantities** *(blocked on UX decision)* — `partQuantities?: Record<string,number>` as **project metadata** (not a scad param), a `setPartQuantity` action, a stepper in the PARTS bar, replicate on export (push each compiled STL into `buildThreeMF` parts[] N times — it already emits one object/item per entry — and expand the `packPlates` input). Update `docs/SPEC.md`.

Items 1-3 are independent and parallelizable. Item 4 is blocked only on the qty-UX answer.

## Defer
- **prompt-shrink** — blocked on restoring a kimi/anthropic key (gate engine lapsed).
- **pwa-offline** — AI core is server-bound; offline win (re-render saved projects) costs a ~13MB wasm precache. Low value until real field-editing demand.
- **server-hardening** — heartbeat / rate-limit / `frame-ancestors` are strictly pre-hosting. Folds into a future hosting epic.
- **blind-spots polish** — one real bug (`-webkit-backdrop-filter`) + OG/robots for the public Pages demo. ~1-2h; defer as a single cosmetic ticket.

## Drop
- **version compare w/ thumbnails** — worst ratio; v1..vN chips + restore/redo cover ~80%. Descope to a param/intent text-diff if anything.
- **viewport-overlays** — cosmetic line-shuffling with negative architectural value.
- **telemetry (off-device)** — contradicts local-first; in-ethos half already ships.
- **blind-spots: npm ci** (settled) and **i18n** (single-locale by design).

## Decisions needed from the user
1. **Per-part quantities UX** (blocks do-next #4): qty entered via a stepper in the PARTS bar or a column in the export menu? And does qty mean "duplicate the STL N times in one file" vs "emit N separate files" vs "annotate the BOM only"?
2. **Re-roll semantics**: replace the current version (stash old to `chatFuture`, matches restore/redo) — *recommended* — or append a sibling alternative (needs new branching UI)?
3. **Restore a bench key?** Restoring kimi or anthropic unblocks prompt-shrink. If anthropic-with-caching is the dominant production engine, prompt-shrink should be **dropped**, not deferred.
4. **Any near-term intent to host multi-user / beyond 127.0.0.1?** If no, server-hardening stays deferred indefinitely.
5. **Is the public Pages demo meant to be discoverable/shareable?** If yes, OG cards + robots.txt earn their keep. Also: minimum Safari/iOS target (baseline is 16.4).
6. **chatpanel message-row split**: own backlog item gated on a profiler trace (*recommended*), or accept the cheap memo pass as the resolution?

## Suggested first batch (one PR, ~4 files, gated by `npm run lint && npm test && npm run test:e2e`)
1. Project-switcher search (`TopBar.tsx`) — warm-up, no store touch.
2. `.vibemesh` empty-state import (`EmptyState.tsx`) — self-contained affordance.
3. Re-roll a successful turn (`generationActions.ts` + `ChatPanel.tsx`) — marquee UX feature.
4. cross-tab sync (`storage.ts` + `store.ts`) — the real data-loss fix; the headline.

Add `retrieval-recall floors` (bench-only) and the `ContextChip` memo if there's room — both tiny, unrelated files, no conflicts.

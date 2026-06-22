# Image-Fidelity Leftovers — Lead Engineer's Remaining Sequence (2026-06)

Tracking doc for the work **not yet built** from the "make outputs match the reference"
campaign. The headline fixes already shipped; what remains are follow-ons, two of which
spend the user's generation quota and need an explicit go-ahead.

> Context: the board's #1 finding was **"no shape oracle in the live loop"** — the
> reference image is consumed as a category label + signature words, never as *measured
> geometry*, and the refine loop was bbox-only (shape-blind). The centerpiece fix for
> that (#3a, refine self-relative convergence) is **shipped**. See the memory notes
> `ai-architects-board-2026-06.md`, `image-to-cad-channel-gap.md`,
> `convex-hull-chamfer-bug.md` for the diagnosis trail.

---

## Already shipped (for context — do NOT redo)

| PR | What |
|----|------|
| **A** (#113) | `# Trace the defining outline` section in `server/prompt.mjs` (silhouette-trace) + `bench/trace.selftest.mjs` |
| **C** (#115) | `prompt.mjs:137` concavity-preserving bevel (`minkowski()` + `sphere(r=0.6)`), never `hull()` on a non-convex silhouette |
| **B** (#116) | `bench/silhouette.mjs` + selftest — silhouette-IoU metric (bench-only oracle) + `renderMasks()` in `bench/render.mjs` |
| **#117** | `server/providers.mjs` image `CAP 4 → 10` so the global reference photo isn't dropped on refines |
| **#118** | Clarify-before-draw gate in `prompt.mjs:18` (ask AND draw, 4 gating conditions) + `bench/clarify.selftest.mjs` |
| **#122** | **The centerpiece.** Refine self-relative convergence stop — `geometryConverged()` in `src/lib/refineProxy.ts`, `volume`+`triangles` added to `StlBBox`/`stlBBox()` in `src/lib/stl.ts`, wired into `src/state/generationActions.ts` refine gate |

All merged to `main`, all CI-green (lint / unit / bench selftests / e2e).

---

## Remaining work (the lead's sequence)

### #3b — best-of-N shape tiebreak + refine-prompt metric injection

Three sub-parts of differing safety:

**3b-safe-1 · best-of-N shape tiebreak** (no quota change)
- Add `volume` and `triangles` to the candidate signals in the best-of-N scorer.
- In `scoreCandidate`, add a **lexicographic tiebreak BELOW `dimMismatches`**: when two
  candidates tie on the existing criteria, prefer the one whose volume/tri-count is *more
  plausible* (not hollow, not a degenerate sliver). Zero-regression by construction — it
  only breaks ties the current scorer leaves arbitrary.
- Low traffic until 3b-quota flips best-of-N on, but safe to land now.

**3b-safe-2 · refine-prompt metric injection** (no quota change — refine already runs)
- Inject the measured outcome metrics (`volume`, fill-ratio = volume / bbox-volume,
  `triangles`) into the refine message's geometry block (`ChatPanel.tsx`, ~L110–125 where
  the refine context is assembled).
- This is **always-on and high-value**: it lets the model *self-diagnose* a suspiciously
  hollow/thin result ("you produced 12% fill in the bbox — is the body solid?"), which
  complements #3a's convergence stop (one stops the loop, this tells the model *why* it
  should reshape). Advisory only.

**3b-quota · default best-of-N ON for image requests** ⚠️ **QUOTA**
- Flip the default at `src/state/generationActions.ts:178` so best-of-N is on for image
  requests. **This triples generation quota per image request** (3 candidates instead of
  1). Real cost — the user is quota-sensitive. **HOLD for explicit go-ahead.**
- It's a one-line change once 3b-safe-1 lands; ship it the moment the user opts in.

### #1a — turn-0 vision pre-call for retrieval ⚠️ QUOTA + LATENCY
- `generationActions.ts:152` `priorIntent` reads the prior **assistant** turn, so a
  turn-1 image-only request gets no skills/hardware retrieval (nothing to read yet).
- Fix: a turn-0 vision pre-call that extracts intent from the image *before* the main
  generation, so retrieval (skills/exemplars/hardware) fires on the first image message.
- **L-effort + adds a vision round-trip (latency + quota) to every first image.** HOLD for
  explicit go-ahead.

### #1b — split `MAX_AUTO_FIX` + Kimi-only temperature (small, safe)
- Split the shared `MAX_AUTO_FIX` budget into **separate** contract-reask vs geometry-fix
  budgets (today one counter starves the other).
- Add `temperature` on the **Kimi / non-thinking path ONLY**. Opus 4.8 + adaptive thinking
  **rejects** `temperature` — do not add it there.
- No quota change. Safe to land.

### #1c — more few-shot exemplars (small, safe)
- Add 2–3 more **figurative / revolve-profile** exemplars and **composed-mechanism**
  exemplars. `server/composed.mjs` currently has only **one** exemplar (axle-snap), which
  is thin coverage for the composition path.
- Each exemplar must compile-verify and double as its composition/interference probe
  fixture (editing one re-baselines those selftests — see CLAUDE.md).
- No quota change. Safe to land.

---

## Recommended order

1. **3b-safe-2** (refine-prompt metric injection) — always-on, highest value, no quota.
2. **3b-safe-1** (best-of-N tiebreak) — safe, sets up the quota flip.
3. **#1b** (budget split + Kimi temp) — small, safe.
4. **#1c** (exemplars) — small, safe.
5. **3b-quota** (best-of-N default-on) — **only after user OKs the 3× quota.**
6. **#1a** (turn-0 vision pre-call) — **only after user OKs the latency/quota cost.**

Items 1–4 can ship as one or two PRs with no quota implication. Items 5–6 are gated on the
user's explicit sign-off because they spend generation quota.

---

## Validation per item

- **Client-side changes** (3b-safe-1/2, 3b-quota, #1a wiring) → unit (vitest) + CI e2e.
  These do **not** go through the server bench (it's a server/engine matrix).
- **Server prompt / exemplar changes** (#1c, parts of #1b) → `npm run bench:selftests`
  (zero-API ratchets) + `npm run bench` if validating generation quality live.
- Match the validation to the change type — that's why #3a was merged on unit + CI e2e,
  not the bench.

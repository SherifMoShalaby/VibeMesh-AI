# Registration de-risk spike — results (Task 1.2)

**Date:** 2026-06-23 · **Status:** ✅ run · **Verdict:** **CONDITIONAL PASS — segmentation-gated**

## The question

Does silhouette-IoU between a candidate STL's rendered pose and a **real hand-held photo's**
extracted contour correlate with fidelity? This gates roadmap Phase 2: if faithful pairs out-score
unfaithful ones, the reference-grounded shape oracle is viable; if not, Phase 2 takes the
self-consistency (reference-free) fallback. (Plan §"Phase 1 — Task 1.2".)

## Setup

- **Data:** [ThingiPrint](https://huggingface.co/datasets/fanismathioulakis/thingiprint) (apache-2.0) — real photos of 3D-printed objects keyed by Thingi10K id — paired with meshes from **Thingi10K** (`pip thingi10k`, npz variant). Assembled by `bench/registration_spike_prep.py`.
- **Set:** **12 distinct-category objects** (gear, coin sorter, horns, puppet hand, laser cutter, shower handle, R.Maker, toy train, text ring, magnet toy, squirrel, iPhone mount). 12 **good** pairs (photo ↔ its own mesh) + 12 **bad** pairs (photo ↔ a *different-category* mesh). Cross-category pairing is deliberate — an earlier run paired near-duplicate multi-part objects and produced a confounded FAIL.
- **Metric:** the canonical, three.js-free `src/lib/silhouette.ts` `renderMasks`/`maskIoU` (same rasterizer the live loop would use, shipped in #132). Photo aligned best-of (4 render poses × 8 orientations). Scored by `bench/registration-spike.mjs`.

## Result — the verdict depends entirely on photo segmentation

| Photo segmentation | mean(good) | mean(bad) | margin | AUC | pairwise good>bad | Verdict |
|---|--:|--:|--:|--:|--:|:--|
| Otsu threshold (`..._contour.py`) | 0.524 | 0.473 | 0.051 | 0.583 | 7/12 (58%) | **FAIL** |
| **GrabCut** (`..._contour_grabcut.py`) | **0.570** | **0.428** | **0.142** | **0.757** | **10/12 (83%)** | **PASS** |

**Key finding: the bottleneck is segmentation, not the metric.** Naive thresholding of a real photo
yields a noisy silhouette and IoU barely beats chance (AUC 0.58). A proper foreground segmenter
(GrabCut) lifts the SAME metric to a clear, usable signal (AUC 0.76). A single-segmenter spike would
have produced a false FAIL and wrongly routed Phase 2 to the fallback.

## Verdict & routing recommendation

**Reference-grounded silhouette-IoU is viable on real photos — as a *soft* ranking signal, and
ONLY when the photo is well-segmented.**

- **Proceed with Phase 2's reference path**, but make **photo segmentation a first-class, load-bearing
  requirement**: GrabCut is the minimum; a learned matte (SAM / rembg / `u2net`) is preferred in
  production. Do **not** ship the Otsu/Canny cheap path the original plan sketched — it fails.
- Use IoU as a **soft tiebreak strictly below the compile/degenerate tiers** (plan guardrail #7), NOT
  a hard gate: the classes overlap (min good 0.30 < max bad 0.61), so it ranks probabilistically
  (AUC 0.76), it does not cleanly threshold.
- The `src/lib/silhouette.ts` twin (#132) is the right rasterizer for it; what's missing for the live
  loop is the **photo→mask segmentation step**, now known to be the critical component.

## Caveats

n=12, one photo per object; GrabCut seeded with a center rect (suits roughly-centered photos — real
user photos vary, reinforcing the learned-matte recommendation); IoU is scale-blind by design;
orientation search is coarse (4 poses × 8 flips/rots, not continuous Z). A larger, multi-photo run
would tighten the AUC estimate, but the segmentation-sensitivity conclusion is robust.

## Reproduce

```sh
# 1. build the labelled set (downloads ThingiPrint photos + Thingi10K npz meshes → bench/spike-data/, gitignored)
uv run --with huggingface_hub --with thingi10k --with numpy python3 bench/registration_spike_prep.py
# 2a. cheap segmentation (Otsu) → FAIL
uv run --with opencv-python-headless --with numpy python3 bench/registration_spike_contour.py
npx tsx bench/registration-spike.mjs
# 2b. proper segmentation (GrabCut) → PASS
uv run --with opencv-python-headless --with numpy python3 bench/registration_spike_contour_grabcut.py
npx tsx bench/registration-spike.mjs
```

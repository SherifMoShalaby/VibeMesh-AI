# Execution Plan — Slice-Ready `.3mf` Export (OrcaSlicer-generic, Bambu-compatible)

**Plan of record.** Consolidates the phased plans from `docs/ORCASLICER-GENERIC-PROFILE-INTEGRATION.md` (chosen direction) and `docs/BAMBU-STUDIO-3MF-INTEGRATION.md` (format primer) into one ordered, gated, trackable roadmap. Date: 2026-06-22.

**Goal:** an exported `.3mf` that opens **slice-ready** (printer + filament + process pre-selected, Slice button live, a real slice completes) in **OrcaSlicer** — authored so the **same file** also opens in **Bambu Studio** (gated, not assumed).

**The one governing principle:** *unit-green is NOT done.* Every stage that produces a `.3mf` is "done" only when the **manual acceptance gate** (open the file in the real slicer, confirm Slice completes) passes. Unit tests assert our XML/JSON shape; they cannot prove slice-readiness.

---

## Critical path

```
STAGE S — Pre-flight spike (NO code)   ← GO/NO-GO for the whole effort
        ↓
P0 — Shared mesh-core refactor (own PR, no behavior change)
        ↓
P1 — Generic single-part Orca slice-ready export   ← Orca acceptance gate
        ↓
P1.5 — Bambu cross-compat gate (two Bambu majors)  ← DECISION: dual-open or Orca-only
        ↓
P2 — All 15 beds
        ↓
P3 — Multi-part plates + thumbnails
        ↓
P4 — Per-color filament + authored g-code
```

S and P0 are independent and can run in parallel. P1 needs both. Everything after P1 is linear.

---

## STAGE S — Pre-flight spike *(no code; this validates the entire approach)*

**Why first:** the whole design rests on one unproven hypothesis — that a minimal config file opens *slice-ready*, not merely *recognized*. Prove it by hand before writing a builder.

1. Hand-craft a 5-file `.3mf` (zip):
   - `[Content_Types].xml`, `_rels/.rels` (prior doc §2.4 snippets)
   - `3D/3dmodel.model` with `<metadata name="Application">BambuStudio-<LOW_VERSION></metadata>` + one cube mesh
   - `Metadata/project_settings.config` — full inline PLA/0.2mm values (Orca doc §4 table)
   - `Metadata/model_settings.config` — minimal single-plate object→plate binding (prior doc §2.4)
2. Open in a **pinned OrcaSlicer**. Confirm: no foreign-vendor banner · printer/process/filament pre-selected · object on plate · **Slice button live** · real slice completes.
3. Open the **same file** in Bambu Studio **major 1.x** and **major 2.x**. Confirm no *"cannot be fully loaded"* popup + the same five checks.

**VERIFY outputs to capture (feed P1):**
- The real **LOW `BambuStudio-XX.XX.XX.XX`** value that exists in a released build and is low-major.
- Exact key tokens: `brim_type` enum, `enable_support` vs `support_enable`, the `hot_plate_temp` family, `gcode_flavor` tokens.
- The `<build><item transform>` origin convention (bed-local min-corner vs bed-center) from a **real Orca-saved** `.3mf`.

**Gate (GO/NO-GO):**
- Orca slices → **GO** for P1.
- Bambu 1.x **and** 2.x slice → dual-open confirmed (informs P1.5 early).
- Orca fails → STOP; the minimal file set is insufficient; revise before any code.

> Can be done by you locally, or I can drive it via the computer-use MCP **if OrcaSlicer + Bambu Studio are installed on this machine** — say the word.

---

## P0 — Shared mesh-core refactor *(own PR, zero behavior change)*

**Goal:** isolate the safety-critical mesh code so the new format never shares a PR with it.

- **Files:** `src/lib/threeMFCore.ts` (new) ← extract `indexMesh`, `fmt`, `snapKey`, `escapeXml` from `src/lib/threeMF.ts`; `threeMF.ts` imports them.
- **Done when:** `src/lib/threeMF.test.ts` passes unchanged **and** `buildThreeMF` output is byte-identical (add a golden-bytes assertion if not already covered). `npm run lint` + `npm test` green.

---

## P1 — Generic single-part Orca slice-ready export *(smallest shippable win)*

**Goal:** export a single-part design as a generic Orca `.3mf` that slices in OrcaSlicer.

- **New:** `src/lib/orcaProject.ts` — `buildOrcaProject(parts, opts)`, signature mirroring the prior doc's `BambuProjectOptions` (`bed{x,y,z}`, `material`, `layerHeight`, `partColors`, `thumbnailPng?`, `printerModel?`). Uses `threeMFCore.ts`.
  - Emits: `Application=BambuStudio-<LOW_VERSION>` (one named constant `ORCA_BAMBU_VERSION`) · full-inline `project_settings.config` (Orca doc §4, **parsed-keys > 0**, `filament_colour` present, **no** start/end g-code, **no** `compatible_printers`) · minimal single-plate `model_settings.config` · retains core `<basematerials>` color · per-bed `printable_area`/`printable_height`/`nozzle_diameter`/`gcode_flavor` from `resolveBed` + flavor map · **no** Production Extension / UUIDs / `slice_info.config` · reuses `buildThreeMF`'s bed-local min-corner transform.
- **Wire:** `src/state/exportActions.ts` — add `exportOrcaProject` (Pick type :22, factory :30), clone `export3mf` (:175–206) **including the ≥Fine `requestConfirm` dialog** (:188–200); output `${fileBase}.orca.3mf`.
- **UI:** `src/components/TopBar.tsx` — new Export-menu row "OrcaSlicer project (.3mf)" after the `.3mf` item (~:260); **disabled for `CUSTOM_BED_ID` and `bambu-h2d`**.
- **Tests:** `src/lib/orcaProject.test.ts` — 5-file tree · `Application=BambuStudio-` · valid `project_settings.config` JSON with header `{version,name:"project_settings",from:"project"}` + parsed-keys > 0 · per-bed `printable_area`/`printable_height` from `resolveBed` (not hardcoded) · `filament_colour` present · no Production Ext · no `slice_info.config` · no `compatible_printers`.
- **Docs:** amend `docs/SPEC.md` §4 (lines 39–45) — new item is OrcaSlicer-specific (reads `project_settings.config`; opens geometry-only in Prusa), assumes a 0.4 nozzle.
- **Done when:** lint + unit + e2e + build green **AND the Orca manual acceptance gate passes** (open `${fileBase}.orca.3mf` in pinned OrcaSlicer → five checks → real slice). Paste app version + result in the PR.

---

## P1.5 — Bambu cross-compat gate *(decision point, no new code)*

Open the **P1 output file** in Bambu Studio major **1.x** and **2.x**. Confirm no *"cannot be fully loaded"* popup + the five checks in each.

- **Both pass →** relabel the menu row "OrcaSlicer / Bambu project (.3mf)"; docs may claim dual-open; `buildBambuProject` (prior doc) becomes a candidate for retirement.
- **Either fails →** keep the file Orca-only; keep `buildBambuProject`; record which Bambu major broke and why (likely the version major).

---

## P2 — All 15 beds

- **Files:** `src/lib/orcaProject.ts` (the full §4 bed→`gcode_flavor` map + per-bed dims from `resolveBed`); custom bed exportable via inline dims.
- **Tests:** table-driven per-bed `printable_area`/`printable_height`/`gcode_flavor`.
- **Done when:** re-run the acceptance gate on ≥1 non-Bambu bed (e.g. Ender 3 / `marlin`, a Klipper machine) in Orca. H2D stays excluded.

---

## P3 — Multi-part plates + thumbnails

- **Files:** `orcaProject.ts` (multi-`<object>`, multi-plate `model_settings.config`, `plate_N.png`/`_small` + cover rels); `exportActions.ts` multi-part path cloned from `exportPlates3mf` (:108–173) — **one `.orca.3mf` per plate** (`${fileBase}-plate${n}.orca.3mf`), SPEC §4 preserved, `plan.oversize` surfaced loudly. Thumbnail from the r3f canvas (reuse `exportShareFile` pattern :42–59, best-effort).
- **Tests:** `object_id` consistency across `<object id>`/`<model_instance>`/`<build><item objectid>` · `all` excluded · per-plate file count = `plan.plates.length`.

---

## P4 — Per-color filament + authored g-code

- **Files:** store `material` state + UI picker; `orcaProject.ts` N-length `filament_*` arrays + per-object `extruder` index; material→temp table (PLA/PETG/ABS/TPU). Vibemesh-**authored** per-flavor start/end g-code introduced here with the "wrong is worse than absent" guard (esp. Klipper macros). Enclosed-printer chamber/temp surface + H2D dual-nozzle revisited here at earliest.

---

## Decision gates & open items needing YOU

| Gate / item | Needs | Blocks |
|---|---|---|
| **Stage S go/no-go** | OrcaSlicer + Bambu Studio installed; run the 3 hand-tests (you, or me via computer-use if installed) | Everything |
| **P1.5 dual-open** | Two Bambu Studio majors to test against | The dual-open claim + retiring `buildBambuProject` |
| **`printer_model` legal read** | A real legal opinion on emitting Bambu/vendor trademark strings (functionally inert per §2e) | Whether we emit `printer_model` at all (default-off until cleared) |
| **Pinned versions** | Which OrcaSlicer + Bambu Studio releases to pin the VERIFY against | The `ORCA_BAMBU_VERSION` constant value |

**Everything is design-only and uncommitted.** Branch is `feat/phase0-safe-scorer-refine` (unrelated) — this work wants its own branch.

---

## Bottom line

The plan is **S → P0 → P1 → P1.5 → P2 → P3 → P4**, and the first move that matters is **Stage S** — a no-code hand-test that converts the dual-open hypothesis into a fact (or kills it) in ~15 minutes. P0 (the safe refactor) can land in parallel. After S returns GO with the VERIFY values, P1 is a self-contained ~1-day build.

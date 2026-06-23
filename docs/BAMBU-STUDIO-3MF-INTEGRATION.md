# Bambu Studio Slice-Ready 3MF — Format Dossier & Vibemesh Integration Design

**Status:** Principal engineering report (revised after staff-architect review) · Date: 2026-06-22
**Scope:** What a Bambu Studio project `.3mf` actually is, what makes one open *configured and slice-ready*, the licensing reality of profile data, and the precise design to add a configured-export path to Vibemesh alongside the existing `buildThreeMF`.

> **Confidence note (read first).** Every claim in this report sourced from Bambu Studio's C++ (`bbs_3mf.cpp`, `Plater.cpp`, `Preset.cpp`, `Config.cpp`) is **claimed from source reading, pending live confirmation** against a *pinned* Bambu Studio release. Line numbers drift between releases; do not treat any of them as load-bearing until the Phase-1 manual acceptance test runs. Anywhere a preset name, version string, or numeric default appears it is tagged **VERIFY:** — those must be confirmed against the live `bambulab/BambuStudio` repo (`resources/profiles/BBL/…`) and a real install before any of them ship in code. Treat this document as a validated *plan*, not a validated *fact sheet*.

---

## 1. Executive Summary

"Ready printable with all settings set" means a downloaded `.3mf` that, when opened in Bambu Studio, is recognized as a **native Bambu project** (not a foreign mesh import), lands on the plate with the printer/process/filament pre-selected, and lights up the **Slice** button — no "this file is not from Bambu Lab" banner, no printer-picker, no filament prompt.

**Recommended approach (decided):** add a second builder, `src/lib/bambuProject.ts` (`buildBambuProject`), parallel to `buildThreeMF`, emitting the native-project file set: `[Content_Types].xml`, `_rels/.rels`, `3D/3dmodel.model` carrying the load-bearing `<metadata name="Application">BambuStudio-…</metadata>` recognition string, a **VibeSCAD-authored** `Metadata/project_settings.config` (our own conservative PLA/0.2mm values — *never* copied Bambu profile JSON), **and a minimal `Metadata/model_settings.config` that binds the object to one plate** (the critique's likely-required plate binding — see §2.2 and the P1 gate). Wire it as a new `exportBambuProject` action in `src/state/exportActions.ts` and a new Export-menu row in `TopBar.tsx`, reusing the existing compile/confirm/pack/loud-failure plumbing.

**Three corrections from the review that shaped this revision:**
1. **Color/material is decided in Phase 1, not deferred.** `buildThreeMF` already expresses per-part color via core-3MF `<basematerials>`/`pid`/`pindex` (threeMF.ts:34-45,80); Bambu projects express it via `filament_colour[]` + per-object `extruder`. These are different mechanisms and must not both win. **Phase-1 decision: keep `basematerials` for display color only, single filament slot, no `extruder` indices** (§3.1, §5.3). The `filament_*`-slot path is Phase 3.
2. **One `.3mf` per plate stays** (SPEC §4). The draft's "single multi-plate file" is a SPEC contract change and is dropped; if ever pursued it needs an explicit SPEC §4 amendment (§5.2, §6).
3. **The new file is Bambu/Orca-only, not tri-slicer-portable.** PrusaSlicer does not read `project_settings.config`. The existing `buildThreeMF` `.3mf` remains the **portable default**; the new item is a clearly-labeled Bambu-specific convenience (§5.5, §7).

The single biggest legal risk remains the **AGPL-3.0 copyleft on Bambu's `resources/profiles` JSON**: every embedded numeric value must be independently authored. The only Bambu strings we *must* emit are the `BambuStudio-` recognition token and `printer_model`; the `*_settings_id` preset *names* are functionally inert unless the user already has that exact AGPL profile installed, so they are **optional and flagged for legal review**, not waved through as "obviously safe" (§4).

---

## 2. How Bambu Studio's Project 3MF Works

A Bambu project `.3mf` is a standard OPC/3MF zip with Bambu-specific files layered on top of the 3MF core, written by `_BBS_3MF_Exporter` in `src/libslic3r/Format/bbs_3mf.cpp`. **VERIFY: all `bbs_3mf.cpp` / `Plater.cpp` line numbers below against a tagged release, not `master`.**

### 2.1 Annotated file tree

```
my_project.3mf  (zip)
├── [Content_Types].xml                       MANDATORY  — OPC content-type map
├── _rels/.rels                               MANDATORY  — root relationships (model + thumbnail)
├── 3D/
│   ├── 3dmodel.model                         MANDATORY  — geometry + the "Application" recognition tag
│   └── _rels/3dmodel.model.rels              OPTIONAL   — ONLY if Production Extension is used
└── Metadata/
    ├── project_settings.config               MANDATORY for "configured" — flat print/printer/filament JSON
    ├── model_settings.config                 LIKELY-REQUIRED for slice-ready — binds object→plate (see §2.2)
    ├── _rels/model_settings.config.rels      OPTIONAL   — ONLY when embedded gcode is referenced
    ├── slice_info.config                      OPTIONAL   — RESULT metadata; emit ONLY after a real slice
    ├── plate_1.png / plate_1_small.png        OPTIONAL   — preview thumbnails (see §2.4 for sizes)
    ├── plate_no_light_1.png / top_1.png / pick_1.png   OPTIONAL — slice-time render buffers
    ├── plate_1.gcode + plate_1.gcode.md5      OPTIONAL   — ONLY in a sliced/print-ready export (NOT a saved project)
    ├── custom_gcode_per_layer.xml             OPTIONAL   — color-change / pause-at-Z
    ├── layer_config_ranges.xml                OPTIONAL   — per-height-range overrides
    ├── layer_heights_profile.txt              OPTIONAL   — variable layer height
    ├── cut_information.xml                     OPTIONAL   — cut-tool data
    └── filament_sequence.json                 OPTIONAL   — multi-material ordering
```

### 2.2 What distinguishes a configured project from a raw mesh import

Two independent conditions, claimed from source, **pending live confirmation**:

1. **Native recognition** is set by **exactly one string**. In `_handle_end_metadata` (`bbs_3mf.cpp` ~`:4064-4081`, **VERIFY**), `m_is_bbl_3mf = true` is set **only** when `<metadata name="Application">` value `boost::starts_with("BambuStudio-")`. The `BambuStudio:3mfVersion` branch that could also set it is commented out. Without the `BambuStudio-` tag the GUI shows *"The 3mf is not from Bambu Lab, load geometry data … only"* and discards Bambu metadata (`Plater.cpp` ~`:8183`, **VERIFY**).
2. **Configured** requires a **non-empty loaded config**: the GUI gate reads `else if (load_config && config_loaded.empty()) { load_config = false; … }` (`Plater.cpp` ~`:8183-8194`, **VERIFY**). So `project_settings.config` must be present, valid JSON, and parse into keys — necessary but not sufficient: without the `BambuStudio-` tag the whole path is downgraded first.

> **The unresolved third condition — does "configured" imply "slice-ready"?** The draft asserted that 4 files + the Application tag yields a *slice-ready* project (Slice button live, object on plate). **This is the report's central hypothesis and it is NOT confirmed.** It is plausible that Bambu also requires `model_settings.config` with at least one `<plate>` + `<model_instance>` to *bind the object to a plate* before Slice activates; a config-recognized file with no plate binding may open "configured but not plated." **Phase 1 must resolve this empirically before any builder code is written** (§6 P1 gate). To de-risk, the Phase-1 builder ships a **minimal `model_settings.config` with one plate** by default rather than betting on the 4-file minimum.

> **Confirmed corrections to optimistic framing:** `slice_info.config` and plate thumbnails do **not** gate the configured state; both are omitted in P1. `model_settings.config` is only fatal if *present-but-malformed* on an already-recognized file. **VERIFY** all three against the pinned release.

### 2.3 Namespaces, Production Extension, UUIDs

`3dmodel.model` root, minimal native-recognized form (our target):

```xml
<model unit="millimeter" xml:lang="en-US"
       xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
       xmlns:BambuStudio="http://schemas.bambulab.com/package/2021">
```

The **Production Extension** (`xmlns:p="…/production/2015/06"` + `requiredextensions="p"`) is emitted only under `SaveStrategy::ProductionExt` and demands a unique `p:UUID` on **every** `<object>`, `<component>`, `<item>`, `<build>`, or strict consumers reject the file.

> **Decision (no objection from review — correctly scoped):** for a single-object/single-plate generator, **do NOT enable the Production Extension.** Keep geometry inline (as `buildThreeMF` does today). Declaring `requiredextensions="p"` without full UUIDs is a guaranteed load failure; omitting it is clean.

Paint/MMU data (out of scope) rides as `<triangle>` attributes (`paint_color`, `paint_supports`, `paint_seam`, `paint_fuzzy_skin`).

### 2.4 Schemas with example snippets

**`[Content_Types].xml`** (no `Default` for `config` — Bambu reads those by hard-coded path):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
  <Default Extension="png" ContentType="image/png"/>
</Types>
```

**`_rels/.rels`** (emit rel-4/rel-5 only if you ship the cover PNGs):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel-1"
     Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
  <Relationship Target="/Metadata/plate_1.png" Id="rel-2"
     Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail"/>
  <Relationship Target="/Metadata/plate_1.png" Id="rel-4"
     Type="http://schemas.bambulab.com/package/2021/cover-thumbnail-middle"/>
  <Relationship Target="/Metadata/plate_1_small.png" Id="rel-5"
     Type="http://schemas.bambulab.com/package/2021/cover-thumbnail-small"/>
</Relationships>
```

**`3D/3dmodel.model`** (the Application tag is the only critical addition over our current output):

```xml
<model unit="millimeter" xml:lang="en-US"
       xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
       xmlns:BambuStudio="http://schemas.bambulab.com/package/2021">
  <metadata name="Application">BambuStudio-XX.XX.XX.XX</metadata>  <!-- VERIFY version string, see §4/risk #4 -->
  <metadata name="BambuStudio:3mfVersion">1</metadata>
  <resources>
    <object id="1" type="model"> … <mesh>…</mesh> </object>
  </resources>
  <build>
    <item objectid="1" transform="1 0 0 0 1 0 0 0 1 128 128 0" printable="1"/>
  </build>
</model>
```

Object position lives **only** in the `<build><item transform>` 12-float (3×4, column-major; last three are X Y Z bed position). `model_settings.config` carries plate membership, not position.

**`Metadata/project_settings.config`** — JSON despite the extension; written by `ConfigBase::save_to_json(…, "project_settings", "project", SLIC3R_VERSION)` (`Config.cpp` ~`:1480-1525`, **VERIFY**). One flat object, **every value a string or array-of-strings** (numbers quoted). All values below are **VibeSCAD-authored** (§3.2, §4) except `printer_model` and the optional `*_settings_id` names:

```json
{
  "version": "XX.XX.XX.XX",                         // VERIFY — single source of truth, §4/risk #4
  "name": "project_settings",
  "from": "project",
  "printer_model": "Bambu Lab P1S",                  // VERIFY exact string in resources/profiles/BBL/machine/
  "printer_settings_id": "Bambu Lab P1S 0.4 nozzle", // VERIFY — OPTIONAL, legal-flagged (§4); inert unless user has it
  "print_settings_id": "VibeSCAD PLA 0.20mm",        // OUR OWN name — do NOT reuse a Bambu process name (§3.3)
  "filament_settings_id": ["VibeSCAD PLA"],          // OUR OWN name
  "nozzle_diameter": ["0.4"],                        // VERIFY assumption holds — app is 0.4-only (§7 missing-1)
  "printable_area": ["0x0", "256x0", "256x256", "0x256"],  // per-bed, NOT hardcoded — from resolveBed (§5.3)
  "printable_height": "256",                         // = bed.z, per-bed
  "layer_height": "0.2",
  "initial_layer_print_height": "0.2",
  "wall_loops": "2",
  "sparse_infill_density": "15%",
  "sparse_infill_pattern": "grid",
  "top_shell_layers": "5",
  "bottom_shell_layers": "3",
  "brim_type": "auto_brim",
  "enable_support": "0",
  "filament_type": ["PLA"],
  "filament_colour": ["#4F8FBA"],
  "filament_diameter": ["1.75"],
  "nozzle_temperature": ["210"],
  "nozzle_temperature_initial_layer": ["210"],
  "hot_plate_temp": ["55"],
  "hot_plate_temp_initial_layer": ["55"]
}
```

> Note: `print_settings_id` / `filament_settings_id` here use **our own** names (`"VibeSCAD PLA 0.20mm"`), not Bambu process names. Reusing a Bambu process name (e.g. `"0.20mm Standard @BBL X1C"`) buys nothing functionally (§3.3) and carries the legal posture risk in §4. If a Bambu *printer* name is emitted at all it is the optional, legal-flagged `printer_settings_id`.

**`Metadata/model_settings.config`** — XML. **Phase-1 ships a minimal single-plate form** (object→plate binding, see §2.2):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="1">
    <metadata key="name" value="Bracket"/>
    <part id="1" subtype="normal_part">
      <metadata key="name" value="Bracket"/>
      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>
    </part>
  </object>
  <plate>
    <metadata key="plater_id" value="1"/>
    <model_instance>
      <metadata key="object_id" value="1"/>
      <metadata key="instance_id" value="0"/>
    </model_instance>
  </plate>
  <assemble></assemble>
</config>
```

`object_id` / `identify_id` must be **internally consistent** across every site (`<object id>`, `<model_instance>` `object_id`, `<build><item objectid>`); mismatches cause silent "skipped" detection. Derive all ids from a single counter in `buildBambuProject`.

**`Metadata/slice_info.config`** — RESULT-only, written only for `is_sliced_valid` plates. **We omit it entirely** (§8 Defer), so no `printer_model_id` codes (e.g. "C12") are needed anywhere — eliminating the dual-identifier-scheme inconsistency the review flagged.

**Thumbnails:** `plate_1.png` and `plate_1_small.png`. **VERIFY exact pixel dimensions** (commonly cited as 512×512 / 128×128, source `bbs_3mf.hpp` / `PartPlate.hpp` ~`:272-273`) — not load-bearing; all thumbnails optional, missing ones open fine.

### 2.5 (removed) `slice_info` example

Cut from this revision — we never emit `slice_info.config`, so its schema and the `printer_model_id` scheme are out of scope.

---

## 3. The Settings Model

### 3.1 How process + filament + printer merge — and the color/material decision

Bambu's exporter flattens the entire active `DynamicPrintConfig` (process + filament + printer) into one flat `project_settings.config` with no `inherits` (the inheritance chain is walked *inside* the app at authoring time). On load, `DynamicPrintConfig::load_from_json` sets only present keys and backfills the rest from `PrintConfigDef` code defaults — which is how a partial file still loads.

> **Phase-1 color/material decision (resolving the review's top blocker).** `buildBambuProject` **keeps the core-3MF `<basematerials>`/`pid`/`pindex`/`displaycolor`** exactly as `buildThreeMF` emits today (threeMF.ts:34-45,80, asserted by `threeMF.test.ts`). It emits **a single filament slot** in `project_settings.config` (`filament_*` arrays length 1) and **no per-object `extruder` index**. Result: Bambu shows the per-part display colors from `basematerials`, all parts print on one filament. This is consistent with the shared core, requires no decision reversal in `threeMF.test.ts`, and defers the genuinely separate "N distinct filament slots + `extruder` mapping" mechanism to Phase 3. The PART_PALETTE comment already documents this exact distinction (threeMF.ts:6-7).

### 3.2 Recommended PLA-on-0.4mm defaults (VibeSCAD-authored)

Conservative, independently-authored values — we do **not** copy Bambu's tuned numbers, and we **do not cite them for contrast** (the draft's "(not Bambu's tuned 21)" remark is itself reading their AGPL data — removed). **VERIFY: that each value is a sane PLA default and is NOT verbatim from `resources/profiles`.**

| Key | Value | Key | Value |
|---|---|---|---|
| `layer_height` | `"0.2"` | `top_shell_layers` | `"5"` |
| `initial_layer_print_height` | `"0.2"` | `bottom_shell_layers` | `"3"` |
| `wall_loops` | `"2"` | `sparse_infill_pattern` | `"grid"` |
| `sparse_infill_density` | `"15%"` | `brim_type` | `"auto_brim"` |
| `line_width` | `"0.42"` | `enable_support` | `"0"` |
| `seam_position` | `"aligned"` | | |

Filament (PLA): `nozzle_temperature ["210"]`, `nozzle_temperature_initial_layer ["210"]`, `hot_plate_temp ["55"]`, `hot_plate_temp_initial_layer ["55"]`, `filament_type ["PLA"]`, `filament_flow_ratio ["0.98"]`, `filament_max_volumetric_speed ["12"]` (a conservative generic value), `filament_diameter ["1.75"]`. **VERIFY each is a defensible generic PLA value.**

Other materials if a picker is added later (Phase 3) — **VERIFY all**: PETG nozzle ~250 / plate ~70; ABS nozzle ~250 / plate ~90; TPU nozzle ~230 / plate ~35.

### 3.3 Preset NAMES are not a resolution mechanism — VERDICT

**Claimed from source, pending live confirmation:** preset **names are NOT resolved**. The importer (`_extract_project_config_from_archive`, `bbs_3mf.cpp` ~`:2685-2707`, **VERIFY**) calls exactly one operation on the values — `config.load_from_json(...)` — loading whatever flat keys are literally present; `settings_id` is just another key, read only to *name* an embedded preset, never to look one up and backfill values. **A `.3mf` that names a preset but lacks inline values will NOT slice with those settings.**

Consequences (**all VERIFY against the pinned release**):
- **Different printer:** the embedded process carries a `compatible_printers` list keyed to the original preset name; `Preset::is_compatible_with_printer()` (`Preset.cpp` ~`:784-803`) returns false → the user hits the *"Use Modified Value / Use Old Value"* dialog and can **lose** the embedded process.
- **Config with NO `compatible_printers`:** `!has_compatible_printers` short-circuits to "compatible with everything" — silently applied to whatever printer is active. The most dangerous silent mis-slice path. **Our authored config will deliberately omit `compatible_printers`** so it applies on any Bambu printer the user has active — accepting the silent-apply behavior as the lesser evil versus the data-loss dialog.
- **Older Bambu Studio:** the strict version-incompatibility throw is reportedly commented out on master, so an older app drops unknown keys and silently degrades. **VERIFY** on the pinned release.

**Verdict:** emit a **full, internally-consistent, VibeSCAD-authored** value set inline, with `compatible_printers` omitted. The configured export is a **best-effort convenience**; the geometry-only `buildThreeMF` path remains the portable default (§5.5, §7).

### 3.4 Printer-preset mapping (our beds → Bambu strings) — ALL VERIFY

> **Every string in this table is a placeholder.** **VERIFY: each `printer_settings_id` and `printer_model` against the live `bambulab/BambuStudio/resources/profiles/BBL/machine/` before coding.** The exact tokenization (spacing, "nozzle" suffix, capitalization) is guessed.

| VibeSCAD `bedId` | Bed mm | `printer_model` (VERIFY) | `printer_settings_id` (VERIFY, OPTIONAL/legal-flagged) | `nozzle_diameter` |
|---|---|---|---|---|
| `a1-mini` | 180³ | `Bambu Lab A1 mini` | `Bambu Lab A1 mini 0.4 nozzle` | `["0.4"]` |
| `bambu-a1` | 256³ | `Bambu Lab A1` | `Bambu Lab A1 0.4 nozzle` | `["0.4"]` |
| `bambu-p1` | 256³ | `Bambu Lab P1S` | `Bambu Lab P1S 0.4 nozzle` | `["0.4"]` |

> **`bambu-h2d` is excluded from the preset map (Phase 4 at earliest).** The H2D is a **dual-nozzle / high-flow** machine; assuming a single `"0.4 nozzle"` string is wrong, and its preset likely uses 2-element nozzle arrays that don't fit the single-extruder template this design standardizes on. **VERIFY H2D's real preset shape before ever mapping it.** Until then, the Bambu export item is **disabled for `bambu-h2d`** (treated like a non-Bambu bed, §5.3).
>
> **`bambu-p1` covers P1P/P1S/X1C** (all 256³ in `PRINTER_BEDS`). Pick ONE: **P1S** is the safest default (mainstream enclosed). Because we omit `compatible_printers` (§3.3), this resolves on any of them without the modified-value dialog. Per-machine split (P1P/P1S/X1C ids) is deferred to Phase 4.
>
> **The 11 non-Bambu beds + the custom bed have no mapping** (Ender 3, Prusa MK4S, Elegoo, QIDI, etc., and `CUSTOM_BED_ID`). For any bed without a Bambu mapping (including H2D for now), the Bambu export menu item is **disabled with a tooltip** ("Bambu project export requires a Bambu Lab printer bed") — see §5.3. This is the majority of the catalog, so the disable path is the common case, not an edge case.

---

## 4. Licensing Decision

**The reality (verified against the repo):** the entire `bambulab/BambuStudio` repo — including `resources/profiles` — is AGPL-3.0 (root `LICENSE`). There is no per-file header or carve-out inside `resources/profiles`, so the profile JSON inherits repo-wide AGPL-3.0. Copying those tuned numeric values into a distributed product is a real copyleft-contamination risk. Separately, "Bambu" / "Bambu Lab" is a **trademark**, independent of copyright.

> **Correction to the draft's legal reasoning (from review):** the relevant copyleft trigger is **AGPL §5** (copyleft on a derivative/combined work that *copies* the data) — **not §13** (the network-use clause, which fires when you *run modified AGPL software and serve interaction over a network*). VibeSCAD would be copying data, not running Bambu Studio. The §13 framing in the draft was wrong and is removed; the conclusion is unchanged and stronger when stated correctly.

**Options weighed:**
- **(a) Reference preset NAMES only, expect Bambu to resolve values** — *rejected*, technically insufficient (§3.3): names resolve to nothing.
- **(b) Copy Bambu's `resources/profiles` JSON inline** — *rejected*, direct AGPL §5 contamination.
- **(c) Ship our own independently-authored conservative values inline** — **CHOSEN.**

**Firm recommendation:** author our own settings. Populate `project_settings.config` with a full flat key set of VibeSCAD's own values (§3.2). Copy no Bambu numeric value.

> **Nuanced position on Bambu strings (correcting the draft's overconfident "nominative = low risk"):** there are two distinct exposures, and they are *not* equal.
> - The `BambuStudio-` recognition token and `printer_model` are **functionally necessary** for the format to be recognized and for the printer to be named. These are genuine nominative-interop identifiers — emit them.
> - The `*_settings_id` preset *names* (e.g. `"Bambu Lab P1S 0.4 nozzle"`) are **the names of specific AGPL-licensed files in the repo**, and by our own §3.3 finding they **do nothing functional** unless the user already has that exact profile installed. Emitting them takes a (small) copyright/trademark posture risk for zero functional benefit. **They are therefore OPTIONAL, default-off, and explicitly flagged for legal review** before they ship — *not* presented as obviously safe. Phase 1 ships **without** them (uses `printer_model` only); they can be added later if legal signs off. **VERIFY: get a real legal read, not an assertion.**

Our own `print_settings_id` / `filament_settings_id` use VibeSCAD-authored names (`"VibeSCAD PLA 0.20mm"`), which carry no Bambu-string exposure at all.

---

## 5. Integration Design for VibeSCAD

### 5.1 New builder — `src/lib/bambuProject.ts`

Mirror the stable `buildThreeMF` signature (threeMF.ts:25-29) so the call site is a near drop-in:

```ts
export interface BambuPart { name: string; stl: ArrayBuffer; place?: { x: number; y: number; rot?: 0 | 90 } }
export interface BambuProjectOptions {
  printerModel: string                 // bedId → §3.4 map; REQUIRED
  printerSettingsId?: string           // OPTIONAL, legal-flagged (§4); default omitted
  bed: { x: number; y: number; z: number }
  material?: 'PLA' | 'PETG' | 'ABS' | 'TPU'   // default 'PLA'
  layerHeight?: number                 // default 0.2 — NOTE: NOT our $fa/$fs quality (§5.3)
  partColors?: string[]                // PART_PALETTE-derived #RRGGBB per part (display only in P1)
  thumbnailPng?: Uint8Array            // optional
  thumbnailSmallPng?: Uint8Array       // optional
  arrange?: boolean
}
export function buildBambuProject(parts: BambuPart[], opts: BambuProjectOptions): Uint8Array
```

**Reuse, don't duplicate.** `indexMesh()` (threeMF.ts:112), `fmt()` (:158), `snapKey()` (:164), `escapeXml()` (:168) are module-private and enforce the 0.001mm weld-grid / degenerate-triangle invariants guarded by `threeMF.test.ts`. **Extract them to a shared module** rather than copy-paste — but do this as a **standalone no-op refactor (Phase 0)** so the new format never shares a PR with a change to safety-critical mesh code (§6).

What `buildBambuProject` adds over `buildThreeMF`: the `BambuStudio-` Application metadata + `BambuStudio:3mfVersion` + the `xmlns:BambuStudio` namespace in `3dmodel.model`; `Metadata/project_settings.config` (authored JSON, §3.2/§4); **a minimal single-plate `Metadata/model_settings.config`** (§2.2 plate binding); optional `plate_1.png`/`plate_1_small.png` + cover rels. It **retains** the core `<basematerials>`/`pid`/`pindex` color model (§3.1). It does **not** add the Production Extension, UUIDs, `slice_info.config`, gcode, or per-object `extruder` indices.

### 5.2 Wiring into `src/state/exportActions.ts`

Add `exportBambuProject` to the `ExportActions` Pick type (exportActions.ts:22) and return it from `createExportActions` (:30) — it auto-wires via `store.ts`.

- **Single-part:** mirror `export3mf` (exportActions.ts:175-206) **including the `requestConfirm` Fine-re-render dialog at :188-200** — the review correctly flagged that the draft's "compile at `exportQuality()`" skipped the user-consent dialog. Bake `meshTransform` via `transformStl` + `composeMatrix`, then `downloadBlob(buildBambuProject([{name, stl}], { …, arrange:false }), \`${fileBase}.bambu.3mf\`, 'model/3mf')`.
- **Multi-part (Phase 2):** mirror `exportPlates3mf` (exportActions.ts:108-173) — compile each `part`-enum option minus `all`, run `packPlates(footprints, {x,y,z})`, and **emit one Bambu `.3mf` per plate** (`<project>-plate${pi+1}.bambu.3mf`), exactly as `exportPlates3mf` does today (:143-154). **This preserves SPEC §4's per-plate contract** — the draft's "one project with N plates" is dropped. `plan.oversize` parts are surfaced loudly via the same accounting (:159-167); they are not silently placed.

> **SPEC §4 note:** the single-multi-plate-file idea is explicitly **out of scope**. If a future phase wants it, it requires an explicit SPEC §4 amendment (the contract currently mandates "ONE slicer-ready `.3mf` per bed-sized plate") and a rework of the per-plate `written++` loud-failure accounting. Do not change this silently.

### 5.3 How our state feeds each field

| VibeSCAD state | Bambu field | Mapping |
|---|---|---|
| `bedId` + `customBed` (`resolveBed`, types.ts:167) | `printer_model`, `printable_area`, `printable_height` | New `bedId → preset` map (§3.4). **Disable the export entirely for non-Bambu / custom / H2D beds** (see below). `printable_area` = bed corners as `"XxY"` strings (per-bed, never hardcoded 256); `printable_height` = `bed.z`. |
| `quality` `$fa`/`$fs` (`QUALITY_PRESETS`, types.ts:129) | — (curve smoothness only) | **Does NOT map to `layer_height`.** Drives only the OpenSCAD render (≥Fine for export, via the confirm dialog). `layer_height` is a **separate** Bambu concept (default `0.2`, new state §5.6). |
| `DEFAULT_NOZZLE = 0.4` (`printability.ts:29`) | `nozzle_diameter` | Always `["0.4"]`. **App geometry is authored against 0.4 only** — see the nozzle caveat below. |
| `PART_PALETTE` (threeMF.ts:8) | core `<basematerials>` `displaycolor` | Display color only in P1 (§3.1). One filament slot. Per-color `extruder` slots are Phase 3. |
| `packPlates` `Placement{x,y,rot}` (`packPlates.ts`) | `<build><item transform>` translation | Bake the packer's bed-local min-corner placement **identically to `buildThreeMF`** (threeMF.ts:47-61, which already handles the `rot===90` case). Match Bambu's bed-origin convention — **VERIFY whether Bambu expects bed-local min-corner or bed-center origin** by inspecting a real Bambu-saved `.3mf`'s `<item transform>`; the draft assumed a center offset, which is unconfirmed. |
| `part` enum (first option `all`) | `<object>` per part | One `<object id>` per part **excluding `all`** (`all` is preview-only). |

**Non-Bambu / custom / H2D beds (the majority case):** for any `bedId` not in the §3.4 map, the Bambu export menu item is **rendered disabled** with a tooltip explaining it needs a Bambu Lab bed. No generic-256³ fallback — silently emitting a P1S profile for an Ender 3 user is a confidently-wrong slice.

**Nozzle caveat (review gap):** the app hardcodes `DEFAULT_NOZZLE = 0.4` and all geometry/wall-thickness/small-feature warnings are authored against 0.4. The Bambu export therefore **assumes a 0.4 nozzle** and emits `nozzle_diameter ["0.4"]`. Since the app has no other nozzle setting, there is no current mismatch to detect; **document this assumption in the menu footer and in SPEC §4**, and revisit if a nozzle selector is ever added.

### 5.4 Thumbnail generation from the r3f canvas

Reuse the exact pattern in `exportShareFile` (exportActions.ts:42-59): downscale the viewport `<canvas>` and `toDataURL('image/png')`, decode the data-URL to bytes for `Metadata/plate_1.png` and `plate_1_small.png`. **Must tolerate a missing thumbnail** — wrap in the same `try/catch` (`exportShareFile` ships without a thumbnail on capture failure) and **drop the rel-4/rel-5 relationships when no PNG is produced**. The project still opens slice-ready.

### 5.5 SPEC §4 compliance

- **Loud partial failure:** clone the compile loops verbatim — they already `alert` + HUD-note on any per-part / oversize / failed-render case (exportActions.ts:159-172). Silent skip = bug.
- **WYSIWYG:** reuse `packPlates` placement + the existing `rot` baking (threeMF.ts:47-61) so the file matches screen.
- **≥Fine + consent:** reuse the `requestConfirm` Fine-re-render flow (single-part exportActions.ts:188-200; multi-part floors at `exportQuality()`) — unchanged.
- **Portability (NEW, from review):** SPEC §4 promises the existing `.3mf` opens in "Bambu Studio / PrusaSlicer / Orca." The new `buildBambuProject` output is **Bambu/Orca-only** — PrusaSlicer does not read `project_settings.config` and may ignore the Bambu namespace (**VERIFY: does Prusa open it degrading to geometry, or reject it?**). **SPEC §4 must be amended** to document the new item as Bambu/Orca-specific, and the menu label must say so (§7 missing-3). The original `buildThreeMF` `.3mf` remains the tri-slicer-portable default.

### 5.6 NEW state we must add

1. **Material picker** — `material: 'PLA' | …` in the store, default `'PLA'`, persisted under a `vibemesh.*` localStorage pref (matches bed/quality). Drives `filament_type`/temps. (Phase 3 surfaces the UI; Phase 1 hardcodes PLA.)
2. **Layer-height / process choice** — `layerHeight: number` (default `0.2`), distinct from `$fa`/`$fs`. Optional coarse process dropdown (0.28/0.20/0.12 mm) later.
3. **`bedId → Bambu preset` map** — new constant (in `bambuProject.ts`), the §3.4 table, with the disable-for-unmapped-beds rule baked in.

---

## 6. Phased Implementation Plan

The `threeMF.test.ts` pattern (`describe`/`it` asserting on the unzipped model XML via a helper, parts from `makeStl([tri])`) is the template for every unit test below. **Unit tests assert OUR XML/JSON shape only — they cannot confirm slice-readiness.** The real test is the manual acceptance gate (§7 missing-2).

**Phase 0 — Pure no-op refactor (smallest, safest, independently revertible).**
*Files:* extract `indexMesh`/`fmt`/`snapKey`/`escapeXml` from `threeMF.ts` into a shared `src/lib/threeMFCore.ts`; `threeMF.ts` imports them.
*Gate:* the **existing `threeMF.test.ts` passes unchanged** and `buildThreeMF` output is byte-identical (add a golden-bytes assertion if not already covered). No new behavior. This isolates the touch to safety-critical mesh code from the unproven new format.

**Phase 1 — Minimal config-only project that slices (smallest shippable win).**
*Pre-flight gate (BEFORE any builder code):* hand-craft a `.3mf` with the 5 files (`[Content_Types].xml`, `_rels/.rels`, `3D/3dmodel.model` w/ `BambuStudio-` tag, `project_settings.config`, minimal single-plate `model_settings.config`) and **open it in a pinned Bambu Studio** to confirm: no "not from Bambu Lab" banner, printer/process/filament pre-selected, object on plate, **Slice button live**. Also confirm whether `model_settings.config` is actually required (§2.2). This single test validates or invalidates the entire Phase-1 thesis — *run it first*.
*Files:* new `src/lib/bambuProject.ts` (uses `threeMFCore.ts` from P0); `exportActions.ts` (add `exportBambuProject`, single-part path cloning `export3mf` **incl. the confirm dialog**); `TopBar.tsx` (new menu row "Bambu Studio project (.3mf)" after the `.3mf` item at ~:260, **disabled for non-Bambu beds**); new `bedId→preset` map. Hardcode PLA + 0.2mm + the active bed's preset; single filament slot; `printer_model` only (no `*_settings_id` unless legal clears it).
*Unit tests:* new `src/lib/bambuProject.test.ts` — unzipped tree contains the 5 files; `3dmodel.model` contains `<metadata name="Application">BambuStudio-`; `project_settings.config` is valid JSON with header `{version,name:"project_settings",from:"project"}` and all values strings/string-arrays; `printable_area`/`printable_height` reflect the bed (not hardcoded 256); NO `requiredextensions="p"`; NO `slice_info.config`; NO `compatible_printers`; no Bambu `*_settings_id` unless legal-cleared.
*Acceptance gate:* the manual checklist (§7 missing-2) against the pinned Bambu Studio version, recorded in the PR.

**Phase 2 — Per-plate multi-part export + thumbnails.**
*Files:* `bambuProject.ts` (multi-`<object>`, multi-plate `model_settings.config`, thumbnail PNGs + cover rels); `exportActions.ts` (multi-part path cloned from `exportPlates3mf`, **one Bambu `.3mf` per plate** — SPEC §4 preserved; `plan.oversize` surfaced loudly).
*Tests:* `object_id`/`identify_id` consistency across `<object id>`/`<model_instance>`/`<build><item objectid>`; `all` excluded from objects; per-plate file count matches `plan.plates.length`.
*Verify:* multi-part design lands all parts on each plate at on-screen positions across N `-plateN.bambu.3mf` files.

**Phase 3 — Material picker + per-color filament slots.**
*Files:* store (`material` state + UI); `bambuProject.ts` (N-length `filament_*` arrays + per-object `extruder` index — the genuinely-different mechanism deferred from §3.1); material→temp table (§3.2, VERIFY).
*Tests:* N distinct part colors → N-length `filament_*` + matching `extruder` ints; PLA/PETG/ABS/TPU temp sets.
*Verify:* multi-color part opens with distinct filament slots in Bambu's AMS mapping (single-AMS cap = 4; **define `extruder` behavior for >4 colors** — cycle or clamp, the review noted this is undefined).

**Phase 4 — Printer-preset UI + H2D/per-machine fidelity.**
*Files:* split `bambu-p1` into P1P/P1S/X1C ids (types.ts `PRINTER_BEDS`); layer-height/process dropdown; **add H2D with its real (likely dual-nozzle) preset shape** once VERIFY'd; optional legal-cleared `*_settings_id` names.
*Tests:* table-driven per-bed `printer_model`/`printable_area`.

**Phase 5 (deferred, non-viable) — Deep-link handoff.** See §7/§8. Revisit only if VibeSCAD adds public file hosting AND Bambu opens its allowlist.

---

## 7. Risks & Open Questions

**Ranked risks, each with mitigation:**

1. **Phase-1 thesis unproven (highest).** "4–5 files → slice-ready" is claimed from drift-prone source line numbers, not observed. *Mitigation:* the Phase-1 **pre-flight gate** opens a hand-crafted file in a pinned Bambu Studio *before* any builder code; ship the minimal `model_settings.config` plate binding to de-risk the "configured-but-not-plated" failure.
2. **AGPL copyleft on profile data.** *Mitigation:* author our own values (§4); a code-review checklist + a unit assertion that no value is verbatim from `resources/profiles`; emit only the necessary `BambuStudio-` token + `printer_model`; keep `*_settings_id` names default-off pending legal.
3. **`*_settings_id` legal posture.** Names of AGPL files, functionally inert (§3.3). *Mitigation:* default-off, legal-flagged, never shipped in P1.
4. **Version string is invented.** `02.00.00.00` is unverified; Bambu releases have historically been `01.xx.xx.xx`. A far-future value triggers `Newer3mfVersionDialog`; a malformed one may fail recognition. *Mitigation:* **VERIFY the real current `BambuStudio-XX.XX.XX.XX` format** from a saved file or the repo; pin it in **one** constant (single source of truth, used in `Application` + `version`); add a review trigger on Bambu schema bumps.
5. **Cross-printer mis-slice.** With `compatible_printers` omitted, our config silently applies to any active Bambu printer (§3.3) — wrong if the user is on a non-matching machine. *Mitigation:* disable the export for non-Bambu beds; document that the geometry-only export is the portable fallback; never promise zero-prompt across arbitrary hardware.
6. **Placement origin convention.** Whether Bambu wants bed-local min-corner or bed-center is unconfirmed. *Mitigation:* **VERIFY by inspecting a real Bambu-saved `<item transform>`**; reuse `buildThreeMF`'s tested baking (threeMF.ts:47-61); add a translation assertion in P2.
7. **`layer_height` ≠ quality (`$fa`/`$fs`).** *Mitigation:* explicit `layerHeight` state (default 0.2); keep the authored process internally consistent.
8. **Tainted/unavailable canvas for thumbnails.** *Mitigation:* `try/catch` like `exportShareFile`; ship without thumbnail + drop cover rels on failure.
9. **Helper-duplication drift.** *Mitigation:* the Phase-0 refactor-to-export; never copy-paste.

**Open questions (resolve empirically in P1 verification):**
- Does the minimum set open *slice-ready* or merely *recognized-with-default-config*? (Risk #1 — the gating question.)
- Is `model_settings.config` actually required for plate binding, or is the 4-file set enough?
- Single-extruder array shapes (1-element arrays vs scalars) — emit 1-element arrays; the format tolerates both. **VERIFY.**

**What's missing / newly addressed (from review):**
1. **Nozzle assumption** — Bambu export assumes 0.4; documented in §5.3, menu footer, and SPEC §4.
2. **Manual acceptance gate** — there is no Bambu Studio in CI, so unit tests are **necessary-but-not-sufficient**. Each phase requires a **manual acceptance checklist run against a pinned Bambu Studio version, recorded in the PR**: (a) no foreign-vendor banner; (b) correct printer/process/filament pre-selected; (c) object(s) on the plate at on-screen positions; (d) Slice button live; (e) a real slice completes without re-prompting for settings. This is the *real* test; the unit tests only assert our shape.
3. **Orca/Prusa cross-compat** — the new file is **Bambu/Orca-only**; **VERIFY** Prusa degrades to geometry vs rejects; amend SPEC §4 and label the menu item accordingly (§5.5).

---

## 8. Recommendation

**Build first (smallest change that opens slice-ready):** do the **Phase-0 no-op helper refactor**, then run the **Phase-1 pre-flight gate** (hand-crafted file in a pinned Bambu Studio) to confirm the thesis, then ship **Phase 1** — `buildBambuProject` for the **single-part, PLA, 0.2mm, active-Bambu-bed** case: the 5 files (`[Content_Types].xml`, `_rels/.rels`, `3D/3dmodel.model` with the `BambuStudio-` Application tag, an internally-consistent VibeSCAD-authored `project_settings.config` with `compatible_printers` omitted and `printer_model` only, and a minimal single-plate `model_settings.config`), retaining the core `<basematerials>` color model, wired as one new Export-menu row (disabled for non-Bambu beds). Keep `buildThreeMF` as the **default, tri-slicer-portable export** and label the new item as the Bambu/Orca-specific convenience.

**Defer:** the Production Extension / UUIDs (never needed for single-object); `slice_info.config` and embedded gcode (avoids stale predictions, printer-coupling, and the `printer_model_id` identifier scheme entirely); per-color filament slots + `extruder` indices (Phase 3); H2D and per-machine preset UI (Phase 4); and all deep-link / protocol-handoff work (Phase 5 — non-viable: `bambustudioopen://` requires a public http(s) URL behind a compiled allowlist that excludes vibescad.com, throws a per-open trust dialog, and is mangled by Chrome's nested-URL handling; a plain `.3mf` download via OS file association is strictly better).

---

### Bottom line

A Bambu "slice-ready" project is not a mystery format — it is a standard 3MF zip plus one recognition string (`<metadata name="Application">BambuStudio-…`) and a flat, fully-expanded `project_settings.config` of our **own** conservative values (copying Bambu's AGPL profile numbers is the one true legal trap, and naming their preset files buys nothing). The correct build is a second `buildBambuProject` beside `buildThreeMF` that reuses the tested mesh core, keeps the existing per-plate and loud-failure SPEC §4 contracts, and is offered only for Bambu Lab beds — explicitly a Bambu/Orca convenience, with the portable `.3mf` staying the default. **The entire plan rests on one unverified hypothesis — that this minimal file set opens *slice-ready* rather than merely *recognized* — so the work order is: prove it by hand in a pinned Bambu Studio before writing a line of the builder, treat every preset name and version string as a VERIFY-against-the-live-repo placeholder, and never let the unit tests (which only check our own XML shape) stand in for the manual acceptance gate.**

### Phase-1 checklist (an engineer can start tomorrow)

1. **(Phase 0) Refactor:** extract `indexMesh`/`fmt`/`snapKey`/`escapeXml` from `src/lib/threeMF.ts` into `src/lib/threeMFCore.ts`; confirm `threeMF.test.ts` passes unchanged and `buildThreeMF` bytes are identical. Land as its own PR.
2. **Pre-flight (do this before any builder code):** hand-craft a 5-file `.3mf` (the §2.4 snippets + a minimal single-plate `model_settings.config`), open it in a **pinned** Bambu Studio, and confirm: no foreign-vendor banner, printer/process/filament pre-selected, object on plate, **Slice button live**, a real slice completes. Record the Bambu Studio version. If it fails, fix the file set before proceeding.
3. **VERIFY the placeholders** against `bambulab/BambuStudio` (pinned tag): exact `printer_model` strings for A1 mini / A1 / P1S; the real `BambuStudio-XX.XX.XX.XX` version format; the `m_is_bbl_3mf` Application-tag gate and the `config_loaded.empty()` downgrade; the `<item transform>` origin convention from a real saved file.
4. **Write `src/lib/bambuProject.ts`** using `threeMFCore.ts`: single-part, PLA, 0.2mm; `project_settings.config` from §3.2 (own values, `compatible_printers` omitted, `printer_model` only); retain core `<basematerials>`; minimal single-plate `model_settings.config`; thumbnail best-effort.
5. **Add `exportBambuProject`** to `src/state/exportActions.ts` (Pick type :22, factory :30), cloning `export3mf` (:175-206) **including the `requestConfirm` Fine-re-render dialog (:188-200)**; output `${fileBase}.bambu.3mf`.
6. **Add the menu row** in `src/components/TopBar.tsx` after the `.3mf` item (~:260), labeled "Bambu Studio project (.3mf)", **disabled with a tooltip for non-Bambu/custom/H2D beds**.
7. **Write `src/lib/bambuProject.test.ts`** asserting the unzipped shape (5 files; `BambuStudio-` Application tag; valid `project_settings.config` JSON with correct header and per-bed `printable_area`/`printable_height`; no Production Extension; no `slice_info.config`; no `compatible_printers`; no `*_settings_id` unless legal-cleared).
8. **Amend SPEC §4** to document the new item as Bambu/Orca-only (not tri-slicer-portable), assuming a 0.4 nozzle.
9. **Run the manual acceptance gate** (the §7 missing-2 checklist) against the pinned Bambu Studio and paste the result into the PR. Unit-green is not done; acceptance-green is.

**Key files (absolute):** `/Users/sherif.shalaby/Desktop/Workspace/dev/VibeSCAD/src/lib/threeMF.ts` (mirror + Phase-0 extract: `buildThreeMF` :25, `<basematerials>`/`pid`/`pindex` :34-45/:80, placement baking :47-61, private helpers :112/:158/:164/:168), `/Users/sherif.shalaby/Desktop/Workspace/dev/VibeSCAD/src/state/exportActions.ts` (`export3mf` + Fine-confirm :175-206/:188-200, `exportPlates3mf` per-plate loop :108-173/:143-154, `ExportActions` Pick :22), `/Users/sherif.shalaby/Desktop/Workspace/dev/VibeSCAD/src/components/TopBar.tsx` (`ExportMenu` :197, `.3mf` item :257-260), `/Users/sherif.shalaby/Desktop/Workspace/dev/VibeSCAD/src/types.ts` (`PRINTER_BEDS` :136-156 — 4 Bambu beds incl. H2D :145, `CUSTOM_BED_ID` :158, `QUALITY_PRESETS` :129, `resolveBed` :167), `/Users/sherif.shalaby/Desktop/Workspace/dev/VibeSCAD/src/lib/printability.ts` (`DEFAULT_NOZZLE` :29), `/Users/sherif.shalaby/Desktop/Workspace/dev/VibeSCAD/src/lib/packPlates.ts`, `/Users/sherif.shalaby/Desktop/Workspace/dev/VibeSCAD/src/lib/threeMF.test.ts` (test pattern), `/Users/sherif.shalaby/Desktop/Workspace/dev/VibeSCAD/docs/SPEC.md` (§4 per-plate + tri-slicer contract). **New files:** `/Users/sherif.shalaby/Desktop/Workspace/dev/VibeSCAD/src/lib/threeMFCore.ts`, `/Users/sherif.shalaby/Desktop/Workspace/dev/VibeSCAD/src/lib/bambuProject.ts`, `/Users/sherif.shalaby/Desktop/Workspace/dev/VibeSCAD/src/lib/bambuProject.test.ts`.

---

## 9. Wiki Cross-Check Addendum (Bambu Studio user wiki)

This addendum reconciles the report against the locally-fetched Bambu Studio user wiki (`docs/bambu-studio-wiki.md`). Because the wiki is **user-level documentation**, it can validate observable *behavior*, *defaults*, and *workflows* — but it cannot confirm or refute the report's source-code claims (the `bbs_3mf.cpp`/`Plater.cpp` recognition gates, the `m_is_bbl_3mf`/`config_loaded.empty()` branches, per-object UUID requirements), which remain correctly tagged **VERIFY** in §2.2/§6. Net: the wiki strongly corroborates the report's *format-compatibility* and *defaults* reasoning, sharpens one portability claim, and tilts one open VERIFY toward the optimistic outcome — but changes no decision.

### 9.1 Confirmed by the wiki

- **Production Extension is Bambu's save-default, and core 3MF is fully within Bambu's reading path** (report §2.2/§2.3, exec-summary, §1). Wiki *3mf Compatibility* §2 (line 1478): "Bambu Studio currently employs the 3MF Production Extension specification … as the default for saving 3MF files." §2.1 (line 1482) confirms the extension's defining feature is storing model data "in files separate from the root model file" — matching the report's "separate model files" characterization. Bidirectionally, §1 (line 1472) and §3 (lines 1493–1500) confirm Bambu's files round-trip through the 3MF-Consortium reading code (lib3mf v2.2.0) and Microsoft 3D Viewer. *Caveat:* the per-object UUID requirement is a source-code claim the user wiki neither confirms nor contradicts.
- **The PrusaSlicer 2024-03-21 merge is geometry-read only, NOT settings-read — so the report's "Bambu/Orca-only" verdict holds, but for the right reason.** Wiki §4 (line 1518): "Update: PrusaSlicer merged the patch on March 21, 2024," referring to PR #10808 "enable support for the 3MF Production Extension specification." The entire compatibility article is framed around *opening the file / loading the mesh* (lib3mf, 3D Viewer, "open the 3mf"). It never claims any third-party slicer reads `project_settings.config`. So the portability boundary is the **settings layer**, not the geometry container — exactly the line the report should draw (see §9.2).
- **A single-root, inline-geometry core-spec file is the well-defined, most-portable 3MF shape** (report §2.3 "Keep geometry inline"; §5.1 single-object). Wiki §2.1 (line 1484): "a 3mf file adhering to the 3MF Core Specification has only one root file containing all model data … only one model file can be read." This is precisely the single-object target the report builds.
- **Foreign slicers historically failed on *Bambu's* Production-Extension output — which cuts in the report's favor.** Wiki §4 (line 1511): "certain software and slicers don't support the 3MF Production Extension … This results in the inability of these tools to open 3mf files produced by Bambu Studio." The report's own output is plain core-spec (no `requiredextensions="p"`), so it is *more* portable than a default Bambu save, not less — strengthening §5.5/§7.
- **An embedded, account-independent settings preset inside the `.3mf` is a documented Bambu concept** (report's `project_settings.config` niche). Wiki *How to Create Custom Preset* > Project preset (line 1982): "The project preset is just saved in the current project file (.3mf) … only visible when this project is loaded … will not be uploaded to Bambu Cloud." This is the sanctioned analogue of what `project_settings.config` carries.
- **Authoring our own VibeSCAD-named preset is the intended workflow, not a hack** (report §3.3/§4). Wiki lines 1937/1956: system presets "cannot be modified directly"; you copy, modify, Save, name, and pick "User Preset." A fresh VibeSCAD-authored name conflicts with nothing.
- **Generic PLA defaults are wiki-endorsed.** layer_height `0.2` — Quick-start (line 172): "a 0.20mm layer height is the norm." seam_position `aligned` — Seam (lines 2202–2208): Aligned is a documented position. brim_type `auto_brim` — Brim (line 2707): "Auto (default)." enable_support `0` — Support (lines 2516–2517): 30° is "a safe angle to print without support," support is opt-in. sparse_infill_pattern `grid` (line 1202) and `15%` density (lines 1891/1902, inside the wiki's 5–20% worked range). Filament-preset fields nozzle_temperature/hot_plate_temp/filament_flow_ratio — line 1847. wall_loops / top/bottom shell — lines 1863/1954. filament_max_volumetric_speed — lines 830/1153.
- **The plate→object→part hierarchy and result-only slice metadata are confirmed.** Object List (lines 2791–2797) enumerates Plates/Objects/Parts as distinct nested entities — matching the report's `<plate>/<object>/<part>/<model_instance>` binding (§2.4). View-slicing-information (lines 1117–1187) shows filament-used and time exist only *after* slicing — validating the report's choice to omit `slice_info.config` pre-slice (§2.4/§2.5/§8). Multi Plate Guide (lines 1286–1312) confirms one project can hold up to 36 plates, so "one `.3mf` per plate" is a deliberate SPEC choice, not a format limit (§5.2/§6).
- **Filament color/material round-trips in the project, and AMS maps by color+type — validating Phase 3's shape** (report §3.1/§5.3/Phase 3). Wiki "Manage Filaments in a Project" (line 417): "The filament list is also saved in the 3mf project file." Per-object filament binding (lines 423–439); AMS auto-maps by "color and material type" (lines 465–467/510). H2D is genuinely dual-nozzle (Flow-Rate-Calibration line 921; H2D Background line 1534), and its bed is *not* a uniform rectangle (left-only/right-only zones, lines 1546–1549), with **hard, slice-blocking** errors on wrong-zone placement (line 1581: "If you get an error message, you cannot slice this plate") — fully validating the §3.4 H2D exclusion.

### 9.2 Corrections / refinements

- **[BLOCKER]** — None. The wiki contradicts no decision in the report.
- **[MAJOR]** — None. No claim is materially wrong; the closest is the H2D `>4-color` framing below, which is a refinement, not an error.
- **[MINOR] Re-attribute the "not tri-slicer-portable" verdict to the *settings* layer.** The report (§1 correction #3, §5.5, exec-summary) cites "PrusaSlicer does not read `project_settings.config`" but phrases the conclusion in a way that can read as "Prusa can't open the file." Wiki §4/line 1518 shows Prusa now reads Production-Extension **geometry** (and the report's own output is even-more-readable core-spec). **Change:** state explicitly that geometry portability and settings portability are separate axes — Prusa opens the geometry; what makes the file Bambu/Orca-only is that no foreign slicer reads `project_settings.config`.
- **[MINOR] §5.5's open VERIFY ("does Prusa open it degrading to geometry, or reject it?") should be reframed as "expected to open as geometry."** Given the report's output is core-spec, single-root, inline geometry (the most universally readable shape, line 1484) with no `requiredextensions="p"`, a conformant reader should open it degrading-to-geometry, ignoring the unknown Bambu namespace and `Metadata/*.config`. The wiki cannot positively confirm Prusa's behavior on a Bambu-namespaced file, so this stays a legitimate VERIFY — but the *expected* outcome should be stated as "opens as geometry," not "may reject."
- **[MINOR] Drop "extruder behavior for >4 colors is undefined" (Phase 3, ~L370).** The wiki shows the `>4` case is *not* undefined at the Bambu Studio level: a project may hold more filaments than AMS slots, and AMS mapping reconciles project filaments to available trays at send time by type+similar color (lines 465–467/510), with multiple AMS units (line 542) and manual override (lines 511–513). **Change Phase 3 framing to:** emit N filament slots as design intent; Bambu's AMS-mapping layer — not our export — resolves slot count. Also: the wiki gives **no** numeric AMS slot cap anywhere, so the "single-AMS = 4 slots" figure must be sourced elsewhere, **not cited to this wiki**. Project filament count (our export) is independent of AMS tray count (printer-side).

### 9.3 Additions the report missed

- **Chinese-punctuation parsing pitfall — and it hits CORE-spec files too** (Wiki §4, lines 1508–1509). Certain CJK punctuation in a 3MF's **model description** can make the file fail to open in 3D Viewer, and this "is not limited to … Production Extension … but also applies to those adhering to the 3MF Core Specification." The report writes user-derived free text into `3dmodel.model` metadata and `model_settings.config` name fields (§2.4), and Vibemesh prompts are arbitrary-language. **Adjust the design:** the Phase-1 builder must sanitize/ASCII-restrict (or strip risky punctuation from) any user-derived object name/description — `escapeXml()` (§5.1) handles XML entities but **not** this pitfall. **Add to VERIFY list:** an acceptance test that a CJK-punctuation object name still opens.
- **Production Extension's only user-facing benefit is load/save speed on large/multi-plate files** (Wiki §2/§2.1/§2.2, lines 1478/1482/1488–1490). The report justifies skipping the extension purely as "avoid UUID load-failure risk"; the wiki adds there is *also no performance reason* to adopt it for the single-object/single-plate Phase-1 target. **Adjust §2.3:** note the skip is well-scoped, not a corner cut.
- **Bambu Studio is itself derived from PrusaSlicer/Slic3r** (Wiki intro, line 72). Supports the report's §2 premise that the project `.3mf` shares the Slic3r/PrusaSlicer lineage and `DynamicPrintConfig` flattening model — which is exactly *why* core geometry is broadly readable and only the `Metadata/*.config` layer is proprietary. **Adjust §2:** cite as independent corroboration that the portability boundary is the settings layer.
- **Presets have THREE scopes, and "project preset" is the precise analogue of `project_settings.config`** (Wiki lines 1933–1982): system (immutable), user (copied to Bambu Cloud against the account), project (in-file only, account-independent, gone on next project load). **Adjust §3.3/§4:** emitting our values as an in-file project-scoped preset is the documented non-cloud path and won't collide with or pollute the user's cloud-synced user presets.
- **Process defaults are nozzle-diameter-dependent** (Wiki lines 1944–1950: X1C 0.4-nozzle vs 0.2-nozzle show different process parameters). Directly supports the §5.3 decision to hardcode `nozzle_diameter ["0.4"]`: a 0.4-nozzle process preset must not be reused for other nozzles. **Adjust §5.3:** cite as the reason the export is correctly locked to 0.4.
- **Only GLOBAL parameters are preset-saveable; object/part/modifier overrides are not** (Wiki lines 1880–1925; precedence modifier > part > object > global). The report's `project_settings.config` is a flat global key set (matches) and per-object data rides in `model_settings.config` (§2.4) — confirming the global-vs-per-object split is correct. **Adjust §2.4:** note any future per-object setting must go in `model_settings.config`, never the preset blob.
- **`custom_gcode_per_layer.xml` is an interactive post-slice artifact** (Wiki lines 1189–1193: Add Pause / Custom G-code / Change Filament authored per-layer). Confirms the report's choice to leave it out of the Phase-1 minimal set (§2.1).
- **Multi-plate support is itself printer-gated** (Wiki line 1302: H2/P2S/X1 supported; P1S prompts "Send All Plates"; A1 unsupported), and plates carry order/name/per-plate settings (lines 1358–1367). Not in scope for single-plate Phase-1, but **note in §5.2/§6:** any future "single multi-plate file" direction must express plate-level metadata the current minimal `model_settings.config` does not, and respect per-printer multi-plate availability.
- **H2D failure modes go beyond bed zones — and some only surface post-slice** (Wiki lines 1564–1566, 1619–1651, 1690–1696). Material constraints (PPA-CF/PPS-CF left-nozzle-only; TPU pairing rules), part-height routing (>320mm forces right nozzle), and "Flush into infill"/support routing into the wrong-nozzle zone can produce errors detectable **only after slicing**. **Strengthen §3.4:** Vibemesh cannot statically guarantee an H2D model slices cleanly at authoring time — an independent, decisive reason H2D export stays out-of-scope rather than "best-effort." Also note dual-nozzle eliminates the single-nozzle flushing/purge cost model (lines 1664–1668), and grouping is slice-baked, not resolved at send time (lines 1713–1715) — so the H2D path can never share the single-nozzle export template.
- **AMS auto-mapping can be silently blocked** when "Multi-device management" is enabled in Preferences (Wiki lines 501–508/587–593) — the user must select a device and Resync. If a future phase documents the multi-color send workflow, **note this gotcha** so the "color+type auto-maps" assumption isn't presented as unconditional.
- **Disambiguation:** the wiki's seam_gap default (15% of nozzle diameter, line 2228) is unrelated to the report's `sparse_infill_density 15%`. The report sets no seam_gap; flag the coincidence so a reviewer doesn't read it as cross-evidence either way.

### 9.4 Net effect on the Phase-1 plan

The wiki **strengthens and annotates** the Phase-1 recommendation; it does not change it. Every Phase-1 decision the wiki can speak to — skip the Production Extension, build a core-spec single-root inline-geometry file, author our own conservative PLA/0.2mm values as an in-file project-scoped preset, keep color in `basematerials` and defer filament slots, keep `buildThreeMF` as the portable default, lock to a 0.4 nozzle, exclude H2D — is corroborated, and in two places (core-spec portability, H2D post-slice-only errors) the wiki makes the case *more* decisively than the report did. The only concrete plan edits are minor and additive: (1) re-attribute the "Bambu/Orca-only" verdict to the settings layer and reframe the Prusa VERIFY as "expected to open as geometry"; (2) **add a CJK-punctuation sanitization step** to the Phase-1 builder and a matching acceptance test; and (3) tighten the Phase-3 filament-slot framing and stop citing the wiki for an AMS slot cap it does not state. None of these touch the §6 P1 empirical gate, which remains the load-bearing source-code VERIFY the user wiki cannot resolve.

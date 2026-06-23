# OrcaSlicer Generic Profile — Slice-Ready .3mf Export

**Status:** Principal engineering revision of `docs/BAMBU-STUDIO-3MF-INTEGRATION.md` (the "prior doc"). Date: 2026-06-22
**Scope:** Add a configured-export target that produces an OrcaSlicer project `.3mf` opening **slice-ready in OrcaSlicer**, authored so that **the same file is HYPOTHESIZED to also open in Bambu Studio** — a claim that is *gated, not assumed*. The prior doc's Bambu-only design stays valid and is **not** deleted until the dual-app gate passes.

> **Read the prior doc first for the format primer.** This revision does NOT repeat the 3MF container anatomy, the OPC/zip layout, the `[Content_Types].xml`/`_rels` boilerplate, the Production-Extension/UUID decision, or the licensing mechanics — those are in the prior doc §2 (file tree, namespaces, schemas), §2.4 (snippets), §3.1 (config-merge model), and §4 (AGPL). This document records **only the deltas** and cites the prior doc by section number throughout.

> **Confidence note (read first — this governs the whole document).** Every C++ claim below is from reading `SoftFever/OrcaSlicer` and `bambulab/BambuStudio` **main/master @ 2026-06-22**. Line numbers drift across releases and every one is tagged **VERIFY** — they must be confirmed against a *pinned* release tag, not master, before coding. More importantly: the **central conclusion of this document — that ONE Orca-authored file opens slice-ready in BOTH apps — is a HYPOTHESIS, not a finding.** It rests on the same unproven link the prior doc honestly flagged: that a config-only file opens *slice-ready* (Slice button live, a real slice completes), not merely *recognized-with-config*. The prior doc never claimed dual-open; this revision does not get to claim it either until the **dual-app, two-Bambu-major acceptance gate (§8) passes.** Treat the Orca file as **additive to** the prior doc's design. Supersession of `buildBambuProject` is **contingent on that gate**, never assumed.

---

## 1. Decision & executive summary

**Build a generic OrcaSlicer-flavored project `.3mf` that opens slice-ready in OrcaSlicer, authored so the same file is a *candidate* to also open in Bambu Studio — and gate the Bambu cross-compat claim before acting on it.** OrcaSlicer is a fork of Bambu Studio: its writer is the same `bbs_3mf.cpp`, it emits the SAME container, the SAME `Metadata/project_settings.config` flat-JSON, the SAME `xmlns:BambuStudio` namespace, and — the key structural fact — its recognition gate is the SAME single `boost::starts_with(Application, "BambuStudio-")` prefix check (**VERIFY**), NOT a namespace or key allowlist. That structural identity is what makes a single cross-compatible file *plausible*. It is NOT proof that the file slices in both: recognition ≠ slice-ready, and that gap is unproven.

Two findings ARE firm enough to design on:

- **Preset NAMES do not resolve to values** (§2e). Orca uses the byte-identical flat `config.load_from_json` path Bambu uses; `printer_settings_id`/`print_settings_id`/`filament_settings_id` are inert string labels. The prior doc §3.3 verdict — **author FULL inline values** — is binding for Orca identically. This kills any "tiny name-only file" plan AND means the vendor-preset-name table is functionally worthless (see §4).
- **The Bambu "cannot be fully loaded" popup is a GUI-layer MAJOR-VERSION decision** (`file_version.maj() > app_version.maj()`, **VERIFY**), not a key/namespace/Orca-tag incompatibility (§3).

**The single biggest risk and the one load-bearing field:** the embedded `BambuStudio-<version>` MAJOR. If the file's major ever exceeds the user's installed Bambu Studio major, Bambu silently downgrades to geometry-only with the "cannot be fully loaded" popup (issue #4914). Pinning it LOW is the *intended* mitigation — but "low enough for every installed Bambu major" is **not satisfiable from a static constant**, because we cannot know the user's installed major. The mitigation is therefore only as good as the **actual two-major open-the-file experiment** in §8. Until that runs, the dual-open claim is unfounded.

---

## 2. OrcaSlicer vs Bambu `.3mf` — the delta

Everything in the prior doc §2 (file tree, namespaces, snippets, schemas) holds for Orca — Orca inherits the bbs_3mf reader/writer. Only the items below differ.

**(a) Application/version string.** Orca's own writer (`bbs_3mf.cpp` ~L6838, **VERIFY**) deliberately emits `Application=BambuStudio-<SLIC3R_VERSION>` for Bambu compatibility — NOT `OrcaSlicer-…`. `SLIC3R_VERSION` is an internal 4-part Bambu-lineage number distinct from the human `SoftFever_VERSION` (e.g. `2.2.0`). **VERIFY the exact `SLIC3R_VERSION` value against a pinned Orca tag** — do not hardcode a guessed value (the draft's `01.09.05.51`/`02.06.00.51` are unconfirmed and must be checked, not trusted).

**(b) The ONE extra metadata line (Orca-only, OPTIONAL, omitted in P1).** Orca additionally writes a second tag after the Application line (`bbs_3mf.cpp` ~L6864, **VERIFY**):
```xml
<metadata name="Application">BambuStudio-<LOW_VERSION></metadata>   <!-- recognition: read by BOTH -->
<metadata name="OrcaSlicer"><semver></metadata>                    <!-- Orca-only attribution -->
```
When present and Semver-parseable, Orca classifies the file `En3mfType::From_Orca` (suppresses the "created by BambuStudio…" informational notice). **We OMIT it in P1.** Its effect on Bambu is *unverified* — an unknown `<metadata>` name is very likely ignored, but "very likely" on the load-bearing file is exactly the optimism the prior doc was disciplined to avoid. Omitting it costs nothing for Bambu and removes one unproven variable from the gate.

**(c) Orca-only keys are NOT a rejection cause.** Bambu loads config with `ForwardCompatibilitySubstitutionRule::Enable` (`Plater.cpp` ~L8052, **VERIFY**) — unrecognized keys are dropped, never aborting the load. So a file authored with Orca-flavored keys never trips Bambu on key set. (This is a firm structural reading, but is folded into the §8 gate regardless.)

**(d) The recognition/slice-ready gate — same two conditions as the prior doc §2.2.** Recognition = `Application` starts with `BambuStudio-`. Configured = non-empty parsed `project_settings.config` (`Plater.cpp` ~L8181 `config_loaded.empty()` downgrade, **VERIFY**). Slice-readiness (plate binding → Slice button live → a real slice completes) is the prior doc §2.2 **unproven hypothesis — unchanged, and resolved ONLY by §8.**

**(e) Orca does NOT resolve system-preset NAMES to values — FIRM.** On import, `_extract_project_config_from_archive` (`bbs_3mf.cpp` ~L2632, **VERIFY** line, but the behavior is corroborated by Orca issue #12596) does ONLY `config.load_from_json(...)` over the inline keys; the `*_settings_id` strings are inert labels never used to look up an installed system preset and backfill values. A file lacking the named preset opens as a generic printer with nothing configured. The `inherits` chain IS resolved, but only in the profiles tree at preset-load time, NOT on the project-`.3mf` path. **Therefore: emit FULL inline values; the named-preset strings do no functional work.** (DeepWiki's claim of a load-time name→preset merge is AI-synthesized and contradicted by source — discount it.)

---

## 3. The cross-compatibility verdict

**VERDICT: HYPOTHESIS — gate before superseding.** The structural evidence (shared writer, shared recognition gate, forward-compatible key handling) makes "one file, both apps" *plausible and worth pursuing*, but the evidence supports only "plausible," not "proven." Three links are unverified and each can sink the claim:

1. **Slice-readiness** (the central hypothesis): a config-only file with a one-plate `model_settings.config` opens *slice-ready* — Slice button live, a real slice completes — not merely recognized-with-config. Unproven for BOTH apps.
2. **The major-version comparison**: `file_version.maj() > app_version.maj()` (`Plater.cpp` ~L8116, **VERIFY**) is the exact popup condition, AND a pinned LOW file major produces NO popup when opened in a Bambu **1.x** AND a Bambu **2.x** install. This is the single point of failure for the whole cross-compat claim and it has NOT been confirmed against a pinned release or a real open-the-file test in two Bambu majors.
3. **The `OrcaSlicer` sibling tag** is omitted in P1 (§2b), removing it as a risk.

**Mechanism of the Bambu popup (source reading, VERIFY-tagged).** It is a GUI-layer major-version branch, NOT a key/namespace incompatibility:
```cpp
else if (load_config && (file_version.maj() > app_version.maj())) {   // Plater.cpp ~L8116, VERIFY
    load_old_project = true; ...
    if (en_3mf_file_type == En3mfType::From_BBS)
        show_info(q, _L("Due to the lower version of Bambu Studio, this 3mf file cannot be "
                        "fully loaded. Please update Bambu Studio to the latest version"), ...);
}
```
`file_version` is the Semver parsed from the digits AFTER `BambuStudio-` (`bbs_3mf.cpp` ~L1461, **VERIFY**). Issue #4914 fired because an Orca build stamped a file major of 2 opened in a Bambu Studio of app major 1 (`2 > 1` → popup → geometry-only). The intended fix — a LOW file major (e.g. major 1) so `1 > 2` is false on a Bambu 2.x install — *should* suppress it, but **"should" is a source reading, and §8 is the experiment that converts it to a fact.** The in-libslic3r version throw is reportedly commented out (`bbs_3mf.cpp` ~L4069/L1902, **VERIFY**) so the LIBRARY never blocks on version; only the GUI branch does.

**The recipe IF the gate passes:**
1. `<metadata name="Application">BambuStudio-<LOW_VERSION></metadata>` — exact 12-char `BambuStudio-` prefix. `<LOW_VERSION>` must be a **real, released, LOW-major Bambu-lineage value (VERIFY it exists — do not invent one).** The digits are inert for recognition but the MAJOR drives the popup; pin it in one named constant, never floating with Vibemesh's real version.
2. Author FULL inline values in `Metadata/project_settings.config` (§2e). Assert **parsed-keys > 0** in unit tests, not just valid JSON (an empty parse silently downgrades Bambu via `config_loaded.empty()`).
3. Per-bed `printable_area`/`printable_height`/`nozzle_diameter`/`gcode_flavor` from `resolveBed` + a per-flavor map (§4) — NOT vendor preset names.
4. Omit the `OrcaSlicer` sibling tag in P1 (§2b).

PrusaSlicer is unchanged from the prior doc §5.5: it ignores `project_settings.config` and opens any of these geometry-only, so the existing `buildThreeMF` stays the tri-slicer-portable default.

---

## 4. The generic profile

**Authored PLA / 0.4-nozzle / 0.2mm value set — Orca key names.** Orca shares Bambu's config vocabulary, so the prior doc §3.2 keys carry over EXCEPT the bed-temperature surface (Orca's one real divergence). All values are **Vibemesh-authored** (AGPL — §5); **VERIFY each is a defensible generic PLA value and is NOT copied verbatim from `resources/profiles`.**

| Orca key | Value | Note |
|---|---|---|
| `layer_height` | `"0.2"` | |
| `initial_layer_print_height` | `"0.2"` | |
| `wall_loops` | `"2"` | |
| `sparse_infill_density` | `"15%"` | |
| `sparse_infill_pattern` | `"grid"` | enum lowercase |
| `top_shell_layers` | `"5"` | |
| `bottom_shell_layers` | `"3"` | |
| `line_width` | `"0.42"` | |
| `seam_position` | `"aligned"` | |
| `brim_type` | `"auto_brim"` | enum; NOT `auto` — **VERIFY** the exact enum token |
| `enable_support` | `"0"` | key is `enable_support`, NOT `support_enable` — **VERIFY** |
| `filament_type` | `["PLA"]` | |
| `filament_diameter` | `["1.75"]` | |
| `filament_colour` | `["#4F8FBAFF"]` | **restored** — matches `PART_PALETTE[0]` (threeMF.ts:9); see note below |
| `nozzle_temperature` | `["210"]` | |
| `nozzle_temperature_initial_layer` | `["210"]` | |
| `filament_flow_ratio` | `["0.98"]` | |
| `filament_max_volumetric_speed` | `["12"]` | conservative generic |
| `enable_pressure_advance` | `["0"]` | PA off; let the machine handle it |
| **`hot_plate_temp`** | `["55"]` | **Orca DIVERGENCE** — see below; **VERIFY** key name + that absent siblings are harmless |
| **`hot_plate_temp_initial_layer`** | `["55"]` | |
| `nozzle_diameter` | `["0.4"]` | from `DEFAULT_NOZZLE` (printability.ts:29) |
| `printable_area` | from `resolveBed` | corners `["0x0","Xx0","XxY","0xY"]`, never hardcoded |
| `printable_height` | from `resolveBed` | bare quoted `"<Z>"` |
| `gcode_flavor` | per-bed | from the §4 per-flavor map (`marlin`/`klipper`/`bambu`) |
| `machine_start_gcode` / `machine_end_gcode` | **OMITTED in P1** | see "Start-gcode" note — wrong start-gcode is worse than absent |

> **`filament_colour` (restored).** The prior doc §2.4 carried it and the draft silently dropped it. Restored and set to `PART_PALETTE[0]` so the single filament slot reads as the same blue the core `<basematerials>` displays, avoiding a jarring default-color slot. **VERIFY** that an absent `filament_colour` is also harmless in both apps (in which case it is belt-and-suspenders, not load-bearing); if absent is fine, the explicit value still does no harm.

> **Start/end gcode — OMITTED in P1, deferred deliberately.** Authoring start-gcode that homes/heats/purges correctly across marlin/klipper/bambu is its own engineering surface with real failure modes: **a wrong start-gcode produces a confidently-broken print, which is worse than no gcode at all.** Klipper machines especially expect a `START_PRINT` macro defined in the printer's own config; a generic inline script may not exist there or may conflict. P1 therefore OMITS these keys and lets code defaults apply. Authored per-flavor gcode is deferred to a later phase with an explicit "wrong is worse than absent" note. Do NOT author generic klipper start-gcode.

> **Orca bed-temp divergence (vs prior doc §3.2's single key).** Orca exposes a FAMILY of per-surface plate-temp keys: `cool_plate_temp`, `hot_plate_temp`, `eng_plate_temp`, `textured_plate_temp`, plus newer surfaces, each with an `_initial_layer` sibling. PLA range: nozzle 180–220, bed 50–60. **VERIFY:** emit `hot_plate_temp` as the generic default; a user on a different plate surface may see it left at a code default — acceptable best-effort for PLA.

**Bed → inline-value mapping (all 15 beds + custom).** The mapping that MATTERS is `printable_area` / `printable_height` / `nozzle_diameter` / `gcode_flavor`, all derived from `resolveBed` (types.ts:167) plus the per-flavor `gcode_flavor` map below — NOT vendor preset names. Per §2e, names are functionally inert, so the named-preset columns the draft invented are **cut**: they carry real fabrication/trademark risk (every string was a guess from folder-naming conventions, with invented "naming traps") for **zero functional payoff**. Optionally emit `printer_model` ONLY (no `*_settings_id`), **default-off, legal-flagged** (§5), purely as an attribution label — and even then, mark every vendor string **VERIFY-against-pinned-repo** and state to reviewers that **the string does no work**, so nobody expects it to.

| `bedId` (types.ts) | `gcode_flavor` (VERIFY token) | `printable_area` (from `resolveBed`) | `printable_height` |
|---|---|---|---|
| `ender3` | `marlin` | `0x0,220x0,220x220,0x220` | `250` |
| `k1` | `klipper` | `0x0,220x0,220x220,0x220` | `250` |
| `k1-max` | `klipper` | `0x0,300x0,300x300,0x300` | `300` |
| `a1-mini` | `bambu` | `0x0,180x0,180x180,0x180` | `180` |
| `bambu-a1` | `bambu` | `0x0,256x0,256x256,0x256` | `256` |
| `bambu-p1` | `bambu` | `0x0,256x0,256x256,0x256` | `256` |
| `prusa-mini` | `marlin` | `0x0,180x0,180x180,0x180` | `180` |
| `prusa-mk4` | `marlin` | `0x0,250x0,250x210,0x210` | `220` |
| `prusa-core-one` | `marlin` | `0x0,250x0,250x220,0x220` | `270` |
| `prusa-xl` | `marlin` | `0x0,360x0,360x360,0x360` | `360` |
| `neptune4-pro` | `klipper` | `0x0,225x0,225x225,0x225` | `265` |
| `centauri-carbon` | `klipper` | `0x0,256x0,256x256,0x256` | `256` |
| `adventurer-5m` | `klipper` | `0x0,220x0,220x220,0x220` | `220` |
| `qidi-q1-pro` | `klipper` | `0x0,245x0,245x245,0x245` | `240` |
| `custom` (`CUSTOM_BED_ID`) | `marlin` | `0x0,Wx0,WxH,0xH` from dims | `Z` from dims |

> **`bambu-h2d` is EXCLUDED — no row.** Per the prior doc §9.1 (wiki lines 1546–1549), the H2D bed is NOT a uniform rectangle (left-only / right-only zones) and it is a dual-nozzle machine whose preset expects a 2-element `nozzle_diameter` array; its zone/material-routing errors surface only post-slice. The draft's `0x0,350x0,350x320,0x320` rectangle was invented and wrong. H2D stays disabled (prior doc §3.4 / §9.3 exclusion still has force) and is revisited no earlier than the per-color filament phase.

> All 14 non-H2D beds + custom are covered by inline values from `resolveBed`; the dims above mirror types.ts:138–155 and are reproduced for review convenience — the builder reads `resolveBed`, never these literals.

---

## 5. Licensing

Unchanged from the prior doc §4, restated briefly: **OrcaSlicer is AGPL-3.0** (LICENSE.txt; README confirms the BambuStudio/PrusaSlicer fork lineage), with no carve-out for `resources/profiles`. Bundled presets carry real authored values AND non-trivial `machine_start_gcode`/`machine_end_gcode` scripts. The author-our-own-values rule (prior doc §4 option (c)) is therefore **binding for Orca too**: copy NO Orca profile numbers. Since P1 omits start/end gcode entirely (§4), the one new copyleft surface the draft worried about (Orca's non-trivial gcode scripts) **does not exist in P1** — and when gcode is added later it must be Vibemesh-authored, never verbatim-copied. Referencing preset NAMES is nominative interop (trademark fair use; a name is not the copyrightable expression) and is **safe but functionally inert** (§2e) — `printer_model` stays optional, default-off, legal-flagged; `*_settings_id` is not emitted.

---

## 6. Integration design delta

Deltas vs the prior doc §5. Everything in §5.1 (mesh-core reuse), §5.2 (exportActions wiring), §5.4 (thumbnails), §5.5 (SPEC §4 compliance), and §5.6 items 1–2 (material/layerHeight state) carries over unchanged — the mesh core, basematerials color model, no-Production-Extension/no-`slice_info`/no-UUID decisions, per-plate SPEC §4 contract, and loud-failure accounting are all slicer-agnostic.

- **New builder, ADDITIVE not replacing.** Add `src/lib/orcaProject.ts` (`buildOrcaProject`) with an `OrcaProjectOptions` signature shaped like the prior doc's `BambuProjectOptions` (`bed{x,y,z}`, `material`, `layerHeight`, `partColors`, `thumbnailPng`; `printerModel?` optional/default-off). **`buildBambuProject` from the prior doc is NOT deleted.** Supersession is contingent on the §8 dual-app gate; if the gate fails in Bambu, the prior doc's Bambu path is still the working design.
- **Application string** — one named constant `ORCA_BAMBU_VERSION` (a VERIFIED low-major Bambu-lineage value) used for both the `Application` tag and the `project_settings.config` `version` header. Comment it as an interop identifier (§1, §3), never tracking Vibemesh's version.
- **Bed coverage via inline values.** 14 beds + custom (§4) get inline `printable_area`/`printable_height`/`nozzle_diameter`/`gcode_flavor` from `resolveBed` + the per-flavor map. The disable path is **`CUSTOM_BED_ID`** (no vendor `printer_model`) **and `bambu-h2d`** (excluded — non-rectangular dual-nozzle bed). Custom is still exportable (inline values from dims).
- **No `slicerTarget` toggle.** There is one file. **But this is NOT "no doubled acceptance matrix":** a single file that must work in two apps has a doubled acceptance matrix *by definition*, and the ongoing cost is real — any future config change must be acceptance-tested in BOTH apps (and, for the version field, in two Bambu majors) forever. That cost is disclosed here, not hidden.
- **Menu label** — "OrcaSlicer project (.3mf)" with sub-text that it is slicer-specific (opens geometry-only in Prusa) and assumes a 0.4 nozzle. Once the §8 gate passes in Bambu, relabel to "OrcaSlicer / Bambu project (.3mf)". Output filename `${fileBase}.orca.3mf` (multi-part later: `${fileBase}-plate${n}.orca.3mf`).
- **Transform convention.** `buildOrcaProject` reuses the existing bed-local min-corner baking from `buildThreeMF` (threeMF.ts:47–61, `tz = -bbox.minZ`, min-corner to packed `(x,y)`). **VERIFY** Orca/Bambu expect bed-local min-corner (not bed-center) for `<item transform>` from a real Orca-saved `.3mf`.
- **SPEC §4 + Phase-0 refactor still apply.** The prior doc Phase-0 extract of `indexMesh`/`fmt`/`snapKey`/`escapeXml` into `src/lib/threeMFCore.ts` is unchanged; `buildOrcaProject` consumes it identically. SPEC §4's per-plate `<project>-plateN.3mf` contract, loud-partial-failure rule (SPEC.md:38), ≥Fine re-render confirm, and client-side fflate zipping are preserved; amend SPEC §4 to document the new item as OrcaSlicer-specific (reads `project_settings.config`; opens-as-geometry in Prusa), 0.4-nozzle. The CJK-punctuation sanitization (prior doc §9.3) still applies to user-derived object names.

---

## 7. Phased plan

Revised from the prior doc §6. Phase 0 unchanged; **P1 is Orca-ONLY (smallest real win); Bambu cross-compat is a SEPARATE gated phase (P1.5).**

- **P0 — Shared mesh core (unchanged from prior doc §6 Phase 0).** Extract `indexMesh`/`fmt`/`snapKey`/`escapeXml` → `src/lib/threeMFCore.ts`; gate on `threeMF.test.ts` passing unchanged + byte-identical `buildThreeMF`. Own PR.
- **P1 — Generic single-part Orca slice-ready file, OrcaSlicer-only acceptance (smallest shippable win).** *Pre-flight gate FIRST:* hand-craft the 5-file set (`[Content_Types].xml`, `_rels/.rels`, `3D/3dmodel.model` with `Application=BambuStudio-<LOW_VERSION>` **VERIFY**, full-inline `project_settings.config`, minimal single-plate `model_settings.config`) and **open it in a PINNED OrcaSlicer**; confirm no foreign banner, printer/process/filament pre-selected, object on plate, **Slice button live, real slice completes**. Then write `buildOrcaProject`: single-part, PLA, 0.2mm, active bed; one filament slot; retain core `<basematerials>`; start/end gcode OMITTED; `printer_model` only if legal clears (default-off). Unit tests: 5-file tree; `Application=BambuStudio-`; valid JSON header `{version,name:"project_settings",from:"project"}` with **parsed-keys > 0**; per-bed `printable_area`/`printable_height` from `resolveBed`; `filament_colour` present; no Production Ext; no `slice_info.config`; no `compatible_printers`. Every preset string / `<LOW_VERSION>` / numeric default tagged **VERIFY**.
- **P1.5 — Bambu cross-compat (SEPARATE, two-major experiment).** Open the SAME P1 file in a pinned Bambu Studio of major **1.x** AND major **2.x**. Confirm in each: no "cannot be fully loaded" popup, printer/process/filament pre-selected, Slice live, real slice completes. Record both app versions. **Only if BOTH pass** does the menu relabel to "OrcaSlicer / Bambu", the docs claim dual-open, and `buildBambuProject` become a candidate for retirement. If either fails, keep the Orca file Orca-only and keep `buildBambuProject`.
- **P2 — All-beds mapping.** Land the full §4 14-bed + custom inline map; per-bed `gcode_flavor`. Table-driven tests per bed. Re-run the acceptance gate on ≥1 non-Bambu bed (e.g. Ender 3, marlin) in Orca (and Bambu if P1.5 passed). **VERIFY** each bed slices.
- **P3 — Multi-part plates + thumbnails (prior doc §6 Phase 2 + thumbnails).** Multi-`<object>`, multi-plate `model_settings.config`, thumbnail PNGs + cover rels; one `.orca.3mf` per plate (SPEC §4 preserved); `plan.oversize` surfaced loudly. Tests: `object_id` consistency, `all` excluded, per-plate file count = `plan.plates.length`.
- **P4 — Per-color filament + deferred surfaces.** N-length `filament_*` arrays + per-object `extruder` index; material→temp table (**VERIFY all**). Vibemesh-authored per-flavor start/end gcode introduced here with the "wrong is worse than absent" guard. Enclosed-printer chamber/temp surface (P1S/X1C/K1/Q1 Pro/Centauri) and H2D dual-nozzle fidelity revisited here at earliest.

Every preset name, version string, and numeric default across all phases: **VERIFY against the live pinned repo + the acceptance gate.**

---

## 8. Recommendation + Phase-1 checklist

**Smallest change that yields a slice-ready generic Orca `.3mf`:** P0 no-op refactor → P1 pre-flight gate (hand-crafted file in a pinned OrcaSlicer ONLY) → P1 `buildOrcaProject` for single-part / PLA / 0.2mm / active bed, wired as ONE new Export-menu row, with `Application=BambuStudio-<LOW_VERSION>` + full inline values and NO authored gcode. Bambu cross-compat is the SEPARATE P1.5 experiment, not part of the smallest win.

**Phase-1 checklist (an engineer can start tomorrow):**
1. **(P0) Refactor** `indexMesh`/`fmt`/`snapKey`/`escapeXml` → `src/lib/threeMFCore.ts`; `threeMF.test.ts` green, `buildThreeMF` bytes identical. Own PR.
2. **Pre-flight (P1, before builder code):** hand-craft the 5-file `.3mf`, open in a **pinned OrcaSlicer**; confirm no foreign banner, printer/process/filament pre-selected, object on plate, **Slice live, real slice completes**. Record the Orca version. Fix the file set before proceeding.
3. **VERIFY placeholders** against the pinned `SoftFever/OrcaSlicer` tag: the real LOW `BambuStudio-XX.XX.XX.XX` value exists and is low-major; the `Application` recognition gate + `config_loaded.empty()` downgrade; the §4 key tokens (`brim_type`, `enable_support`, the `hot_plate_temp` family, `gcode_flavor` tokens); the `<item transform>` origin convention from a real Orca-saved file.
4. **Write `src/lib/orcaProject.ts`** using `threeMFCore.ts`: single-part, PLA, 0.2mm; full-inline `project_settings.config` (§4 own values, parsed-keys > 0, `filament_colour` present, start/end gcode OMITTED, `compatible_printers` omitted, `printer_model` only if legal clears / default-off); retain core `<basematerials>`; minimal single-plate `model_settings.config`; bed-local min-corner transform reused from `buildThreeMF`; thumbnail best-effort.
5. **Add `exportOrcaProject`** to `src/state/exportActions.ts` (Pick :22, factory :30), cloning `export3mf` (:175-206) **including the ≥Fine re-render `requestConfirm` dialog (:188-200)**; output `${fileBase}.orca.3mf`.
6. **Add the menu row** in `src/components/TopBar.tsx` after the `.3mf` item (~:260), labeled **"OrcaSlicer project (.3mf)"** (relabel to "OrcaSlicer / Bambu" only after P1.5), disabled for `CUSTOM_BED_ID` (no vendor model) and `bambu-h2d` (excluded).
7. **Write `src/lib/orcaProject.test.ts`** asserting: 5-file tree; `Application=BambuStudio-`; valid `project_settings.config` JSON with parsed-keys > 0; per-bed `printable_area`/`printable_height` from `resolveBed` (not hardcoded); `filament_colour` present; no Production Ext; no `slice_info.config`; no `compatible_printers`.
8. **Amend SPEC §4** (SPEC.md:39-45) to document the new item as OrcaSlicer-specific (not tri-slicer-portable), 0.4-nozzle, reads `project_settings.config`.

**Manual acceptance gate (the real test — unit-green is not done):**
- **P1 (Orca-only):** open the authored file in a PINNED OrcaSlicer and confirm — (a) no foreign-vendor banner; (b) printer/process/filament pre-selected; (c) object on plate at on-screen position; (d) **Slice button live**; (e) a real slice completes without re-prompting. Paste the app version + result into the PR.
- **P1.5 (Bambu, gates the dual-open claim):** open the SAME file in a pinned Bambu Studio of major **1.x** AND major **2.x**; confirm no "cannot be fully loaded" popup plus (a)–(e) in each. Paste both app versions + results. Until both pass, the dual-open claim stays labeled UNPROVEN and `buildBambuProject` is NOT retired.

---

**Bottom line.** OrcaSlicer and Bambu Studio share one writer, one container, and one `BambuStudio-`-prefix recognition gate, which makes a single cross-compatible project `.3mf` plausible enough to build — and two findings are firm enough to design on: preset NAMES are functionally inert (so we author full inline values and cut the fabrication-prone vendor-name table), and the Bambu "cannot be fully loaded" popup is a GUI major-version branch that a pinned LOW file-major *should* suppress. But "plausible" and "should" are not "proven": that the file opens *slice-ready* (not merely recognized) in both apps, and that a low major actually dodges the popup across two Bambu majors, are unverified C++/runtime claims. So the headline is a HYPOTHESIS, gated — the smallest real win is an Orca-only slice-ready single-part file (P1), Bambu cross-compat is a separate two-major experiment (P1.5), and `buildBambuProject` is retired only after that gate passes, never on assumption.

**Phase-1 checklist (tight):**
1. P0: extract `threeMFCore.ts`; `threeMF.test.ts` green + `buildThreeMF` byte-identical (own PR).
2. Pre-flight: hand-craft the 5-file `.3mf`, open in a pinned OrcaSlicer, confirm pre-selected printer/process/filament + Slice live + real slice; record version.
3. VERIFY against a pinned Orca tag: the real LOW `BambuStudio-XX.XX.XX.XX`; recognition gate + `config_loaded.empty()` downgrade; §4 key tokens; `<item transform>` origin.
4. Write `src/lib/orcaProject.ts`: single-part, PLA, 0.2mm, full inline values (parsed-keys > 0, `filament_colour` present, NO start/end gcode, no `compatible_printers`, `printer_model` only if legal-cleared/default-off), core `<basematerials>`, reused min-corner transform.
5. Add `exportOrcaProject` to `exportActions.ts` (clone `export3mf` incl. the ≥Fine confirm); filename `${fileBase}.orca.3mf`.
6. Add the TopBar menu row "OrcaSlicer project (.3mf)"; disable `CUSTOM_BED_ID` + `bambu-h2d`.
7. Write `orcaProject.test.ts` (5-file tree, `Application=BambuStudio-`, parsed-keys > 0, per-bed area/height from `resolveBed`, `filament_colour`, no Production Ext / no `slice_info` / no `compatible_printers`).
8. Amend SPEC §4 (SPEC.md:39-45): OrcaSlicer-specific, 0.4-nozzle, reads `project_settings.config`.
9. Do NOT delete `buildBambuProject`; relabel/retire only after P1.5 passes in two Bambu majors.
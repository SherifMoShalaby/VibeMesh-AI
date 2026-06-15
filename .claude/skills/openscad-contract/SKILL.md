---
name: openscad-contract
description: Use when editing the system prompt (server/prompt.mjs), the Customizer parameter parser (src/lib/params.ts), the geometry/render pipeline (src/lib/openscad/*), or any export path. It captures the model response contract and the printability rules every engine must keep emitting — break either and the whole app stops rendering.
---

# The OpenSCAD response contract

Every AI engine (`anthropic`, `kimi`, `claude-code`, `local:<model>`) is held to ONE response shape, defined by `SYSTEM_PROMPT` in `server/prompt.mjs`. The client (`extractScadBlock` in `src/lib/params.ts`) and the geometry pipeline depend on that shape exactly. If you change the prompt, the parser, or the worker, keep all of the following invariants intact.

## Response shape (what the model must emit)

1. One or two short sentences of prose describing what was designed/changed.
2. **Exactly ONE** fenced code block tagged ` ```scad ` containing the **COMPLETE** program — never a diff, never a fragment, never a second code block. Iteration returns the full program again.
3. Optionally one short sentence of printing advice.
4. No markdown headings in the reply.

How the client splits it: `extractScadBlock` (`src/lib/params.ts`) matches ` ```scad ` / ` ```openscad ` / untagged fences and keeps the **largest** block as the code; everything outside fences becomes the prose bubble. So a stray extra fence is silently tolerated only if it's smaller — do not relax the "exactly one block" rule in the prompt to lean on that. The history round-trip in `src/lib/api.ts` (`toApiMessages`) re-wraps the stored `msg.code` as a ` ```scad ` block, so the contract must stay symmetric.

## The program must start with a Customizer parameter block

`src/lib/params.ts` parses Customizer-style annotations from the **top** of the program into the slider/dropdown/checkbox UI:

- `/* [Group Name] */` — group header.
- `// description` line directly above each parameter.
- Numeric: trailing `// [min:max]` or `// [min:step:max]`.
- Enum string: `// [option1, option2, option3]`.
- Boolean: no annotation.
- Derived values go **below** the parameter block, computed from parameters — never inline magic numbers the user can't reach.

Parameter changes re-render via OpenSCAD `-D name=value` defines (no AI round-trip). If you change the annotation grammar in the prompt, change the parser to match, and vice versa — they are one contract. Quality presets inject root-scope `-D '$fn=0' -D $fa=… -D $fs=…`, which is why the next rule exists.

## Printability rules (the model must obey; don't weaken them)

- **Manifold** geometry: no zero-thickness walls, no coincident-face unions. Overlap booleans 0.01–0.1 mm; extend cutters 0.5 mm+ past surfaces. The renderer runs `--backend=Manifold` (see `src/lib/openscad/worker.ts`) and **requires** manifold input; non-manifold output fails or self-intersects.
- **Flat on the bed**: each printable piece sits flat on the XY plane (z=0) in its best print orientation, roughly centered on the origin.
- **Units are millimeters**, always.
- **Minimum wall thickness 1.2 mm**; minimum feature size 0.8 mm.
- **No global `$fn`.** The app owns global curve resolution via the `$fa`/`$fs` quality presets (Draft/Standard/Fine/Ultra), injected as `-D` defines at render time. A global `$fn` in generated code overrides the preset and breaks quality control. **Per-call `$fn` is intentionally allowed** when segment count is design intent — e.g. `$fn = 6` for hex sockets, `$fn = 3` for triangular features, `$fn = 24` on connector studs. Keep this distinction precise in any prompt edit.
- **No `import`, `surface`, `text()`, or external libraries** (no BOSL/MCAD) — no font/asset files exist in the wasm environment. Plain OpenSCAD built-ins only.
- Prefer self-supporting geometry (45° chamfers over overhangs; teardrop/hex horizontal holes). Avoid `minkowski()` on complex shapes and huge `hull()` chains — slow renders are failed models.

## Mandatory safety caveats

The printing-advice sentence MUST carry the relevant caveat when the use is detectable: load-bearing parts (print orientation vs. layer lines, ≥4 perimeters or PETG/ASA), food-contact (not food-certified, layer grooves harbor bacteria), heat-exposed (PLA ~55 °C → PETG/ASA/PC), child items (small parts = choking hazard). One short caveat, never a lecture; never present a print as a certified structural/food-safe part. Do not strip these — they are a spec requirement, not flavor.

## Before you ship a prompt/pipeline change

- Re-read `server/prompt.mjs` end to end; the multi-part `part` enum convention, KIT/JOINTS plan header, connector "female = male + one shared clearance parameter" rule, and the silent self-check list are also part of this contract — see `docs/SPEC.md` for the image/refine/versioning/multi-part behavioral surfaces.
- There is no test suite. Verify with `npm run lint && npm run build`, then sanity-check generation against the engines (or `node bench/run.mjs` with the dev API on :5175; voxel-IoU via `node bench/score.mjs`).
- A prompt edit changes behavior across **every** engine at once — the system prompt is shared by `streamAnthropic`, `streamKimi`, `streamClaudeCode`, and `streamLocal` in `server/providers.mjs`.

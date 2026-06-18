---
name: vibemesh-3d-motion
description: Use when animating or lighting the react-three-fiber scene in Vibemesh-AI — the <Canvas> subtree of src/components/Viewport.tsx (mesh spawn, camera framing, drei Environment/ContactShadows, in-scene loading feedback, ambient depth). Do NOT touch DOM/CSS (that is vibemesh-ui's job) and NEVER break the openscad-wasm → STL → mesh pipeline. Owns the shared reduced-motion hook for all r3f rigs.
---

# Vibemesh-AI 3D scene motion & lighting

This skill owns **only** the `<Canvas>` subtree of `src/components/Viewport.tsx`: meshes, materials, camera, controls, lights, and drei helpers. It never edits `src/styles.css` (the one exception is the CSS compile-pulse hairline, which is really a DOM concern shared with `vibemesh-ui`). All scene motion runs inside `useFrame` — Framer Motion and CSS transitions never drive the canvas.

The goal is "functional → premium": a camera fly-in that frames new models, meshes that grow/fade in instead of popping, grounded contact shadows + image-based lighting, and an in-scene compile cue. Target ambition is the **full premium scene**, gated behind the perf proof below.

## 0. Frameloop — DECIDED: `frameloop='demand'` (ADR 0001)

Set `frameloop="demand"` on the `<Canvas>` (~L332). This is **decided, not a proof gate** — verified against the installed fiber@9.6.1 / drei@10.7.7 / three-stdlib@2.36.1 source (`docs/adr/0001-frameloop-demand.md`). At idle the rAF stops entirely, so backdrop-blur glass costs nothing when nothing moves; OrbitControls damping still settles smoothly because drei's `'change'` listener calls `invalidate()` each inertia frame (no end-snap). The full premium scene is viable as-is — no descope, no hybrid "flip to always". Keep `key={ortho?...}` and `gl={{ preserveDrawingBuffer:true }}` (CaptureRig depends on the latter).

**THE #1 INVARIANT — self-driving `useFrame` rigs must `invalidate()` every tick.** Under demand mode a `useFrame` lerp that forgets `state.invalidate()` runs exactly **one frame then freezes** (fiber decrements `internal.frames`→0 and cancels the loop). Every animating tick of the camera fly-in and mesh spawn must call `state.invalidate()`; the loop terminates cleanly the moment you *stop* calling it (when the lerp settles). Only these two rigs are self-driven. drei OrbitControls / TransformControls already invalidate-on-`'change'` — leave them alone.

The only residual check is empirical and belongs to Gate 3.0, not this skill: confirm on an integrated GPU that idle rAF truly stops and damping feels smooth with the 5 glass surfaces composited.

## 1. The pipeline is sacred

- `model.geometry` is a **manually-disposed prop** (`Viewport.tsx` ~L129/L137). Spawn/transition animations mutate the **material or the group transform** — never swap, clone, or replace the geometry. Cloning leaks GPU buffers and breaks the dispose effect.
- openscad-wasm is **single-shot** (a fresh worker instance per render). Scene code must not assume a persistent compiler or re-trigger renders.
- Never clobber the material props the renderer sets: `emissive`, `flatShading`, `wireframe`, double-sided gray (~L386-390). Animate `opacity`/`transparent` and group `scale`, nothing else.

## 2. Mesh spawn (keyed on `stlVersion`)

On `stlVersion` change, lerp an `appear` ref 0→1 over ~320ms inside `useFrame`, driving group `scale` 0.92→1 and `material.opacity` 0→1, and **call `state.invalidate()` each tick** (see §0 invariant). Set `material.transparent = true` while `appear < 1`, then flip it back to `false` at completion **and in an abort guard if `stlVersion` changes mid-fade** (otherwise the part can stick semi-transparent) so `depthWrite` is correct for the `THREE.DoubleSide` gray part. Apply the same pattern to the SlicerScene meshes (~L982-990) with their own appear ref. Under reduced-motion, snap straight to the final state with a single `invalidate()`.

## 3. Camera fly-in (keyed on `fitVersion` ONLY)

Camera-reframe motion keys on **`fitVersion`** — which bumps only on empty→full (~L369), `selectPart` (~L833), and `setViewMode` (~L847). **Never** key camera motion on `stlVersion` or parameter changes; `fitVersion` is the existing contract that protects the user's framing during slider drags and refine passes.

- Replace the instant `camera.position.set` (~L933) in `CameraFit` with a `useFrame` lerp inside the existing `fitVersion`/`lastFitted` guard.
- Set `controls.enabled = false` for the ~400ms flight; re-enable and call `markFittedRef` on arrival.
- **Ortho:** keep `ProjectionFit`'s mount snap instant; animate only the perspective re-frame, or extend the lerp to `camera.zoom` (note `CameraFit` sets position but not zoom).
- Both the lerp and OrbitControls call `controls.update()` — disabling controls during the flight prevents damping jitter.
- **Call `state.invalidate()` each animating tick** (§0); snap instantly under reduced-motion (instant set + one `invalidate()`).
- **Ortho-zoom is the one path that needs an explicit invalidate.** A programmatic `camera.zoom` write does NOT trigger OrbitControls' `'change'` event (three-stdlib gates `zoomChanged` on its internal dolly scale), so it won't paint under demand. Append `useThree.getState().invalidate()` after ortho `camera.zoom` writes (`ViewRig.frame()` ortho branch ~L825-828, `ProjectionFit` mount `fit()`). Perspective re-frames self-invalidate via the trailing `controls.update()` → `'change'` — no blanket sprinkling.

## 4. Loading / compile feedback

Primary cue is a **CSS** hairline/accent-glow on `.viewport` toggled by `data-compiling` — DOM, zero canvas cost, and it is the one loader allowed to survive the `[data-busy]` gate (coordinate with `vibemesh-ui`). Add an in-scene emissive "breathing" pulse **only** if the frozen mesh still feels dead; if added, it must stop instantly when `compileStatus` flips.

## 5. Premium grounding (lighting & shadows)

- Add drei `<Environment>` for image-based reflections — **env only, do NOT set `background`** (keep the `#2f3236` `<color>` at ~L346), and **do NOT pass `frames`** (a bare-preset Environment routes to `EnvironmentCube`, which has no `useFrame` and ignores `frames` — it is idle-safe by construction). Supplement the existing lights, don't replace them.
- **Self-host the HDRI under `public/`** and load it via `files=`/a local URL — do **not** use a bare `preset=` string, which drei fetches from a remote githack CDN (`useEnvironment.js:8`). This app is local-first/offline; a remote multi-MB fetch is a regression. Lights-only grounding is the acceptable fallback if the asset weight is unwanted.
- Add `<ContactShadows frames={1}>` (bakes once on first commit, then no-ops forever — free under demand) under the model when `!platesView && model`.
- Budget every addition against the perf-chip tris/fps HUD readout; if fps drops below the Phase-1 baseline during orbit, dial back or descope.
- **Optional ambient blobs** belong in CSS (`.viewport::before/::after`, owned by `vibemesh-ui`), not the scene graph — ship only if the perf budget survives everything above.

## 6. CaptureRig is a hard gate

The refine flow shoots three PNGs via `CaptureRig` (~L870-919) using a synchronous `gl.render` (so it is frameloop-agnostic — demand mode does not affect it); refine fidelity AND the bench (`bench/render.mjs` → `bench/judge.mjs`) depend on those images. Once `<Environment>`/`<ContactShadows>` are scene members they **will** contaminate the shoots (env reflections on the matte part + the shadow plane skew feature/hole counts) — this is confirmed, not hypothetical. **Mandatory shield (non-optional):** before the three shoots set the ContactShadows ref `.visible = false` **and** null `scene.environment`; restore both after, before the final restore `gl.render` (~L912) — mirror the existing rim-light add/remove (~L891-908). After merge, run `bench/judge.mjs judgeVision` and confirm `asymmetryPreserved` + feature counts did not regress.

## 7. Reduced-motion (this skill owns the hook)

Export a single `usePrefersReducedMotion` (matchMedia `'(prefers-reduced-motion: reduce)'` + a change listener) used by **all** r3f rigs — the CSS `@media` block cannot reach `useFrame`. Also clamp `useFrame` dt to `min(dt, 1/30)` so a stalled tab (e.g. during a long WASM compile) doesn't fast-forward an animation on the next frame. When reduced-motion is on, every rig hard-cuts to its final state (no lerp).

## 8. Verification

After scene changes: `npm run lint` + `npm run build`; preview-test orbit/spawn/model-swap for jank with `frameloop='demand'` on integrated graphics; confirm camera lerp doesn't fight OrbitControls; confirm spawn restores `transparent:false`; run the CaptureRig gate + `bench/judge.mjs judgeVision`; verify reduced-motion snaps all rigs. Never let scene work edit `src/styles.css` beyond the shared compile-pulse hairline.

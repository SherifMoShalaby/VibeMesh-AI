# ADR 0001 — Adopt `frameloop='demand'` for the r3f canvas

**Status:** Accepted (2026-06-17) · **Context:** UI/UX upgrade Phase 3 / Gate 3.0 (see [UI-UX-UPGRADE-PLAN.md](../UI-UX-UPGRADE-PLAN.md)) · **Decider:** senior architect review, adversarially verified against the installed `@react-three/fiber@9.6.1` + `@react-three/drei@10.7.7` + `three@0.184` + `three-stdlib@2.36.1` source.

## Decision

**Adopt `frameloop='demand'` on the single `<Canvas>` in `src/components/Viewport.tsx`. The full premium 3D scene (camera fly-in + mesh spawn + drei `<Environment>` env-only + `<ContactShadows frames={1}>` + DOM ambient blobs) is viable as-is — no descope, no hybrid "flip to always"** — provided the two self-driven `useFrame` rigs follow the invalidate-per-tick discipline below. The hybrid (demand-at-idle / always-during-animation) is **rejected** as unnecessary and strictly worse: it adds a flip-back race that drei's own invalidate-on-change pattern makes redundant.

## Why (source-grounded)

- **The idle-cost win is real.** With no `frameloop` prop the Canvas (`Viewport.tsx:332`) defaults to `'always'` — a continuous 60fps rAF + `gl.render` that forces the compositor to re-sample under every `backdrop-filter` 60×/sec even when static. Under `'demand'`, fiber's `loop()` only advances while `internal.frames > 0` (`events-*.esm.js:16086`), `update()` returns `frameloop==='always' ? 1 : internal.frames` (`:16064`), and at zero it `cancelAnimationFrame`s (`:16102`). **At true idle: zero rAF, zero render, zero compositor re-sample under the glass.**
- **Damping settles smoothly under demand (the #1 worry — confirmed).** drei `core/OrbitControls.js:29-31` registers `useFrame(() => controls.update(), -1)` and `:40-44` a `'change'` listener whose first statement is `invalidate()`. three-stdlib `controls/OrbitControls.js:288-289` dispatches `'change'` on every frame of *perceptible* inertia (EPS = 1e-6, `:336`). `invalidate()` from inside a `useFrame` sets `frames = 2` (`:16121`), so each settling frame self-schedules the next; the loop halts one sub-pixel frame after motion crosses the threshold — **no visible end-snap**. The `-1` priority doesn't disable auto-render (`:16060`, `:1121`), so no manual `gl.render` is needed for orbit.
- **CaptureRig is frameloop-agnostic.** It renders synchronously via `gl.render(scene, camera)` inside `registerMultiCapture` (`Viewport.tsx:899`, `:912`), never via the loop — unaffected by the mode switch (depends on `preserveDrawingBuffer: true`, which stays).
- **No pre-existing animation can silently freeze.** Grep confirms **zero** `useFrame` callbacks in `src/` today and one one-shot rAF (`Viewport.tsx:952`). The only live-scene loops are drei OrbitControls + TransformControls, both invalidate-on-`'change'`.

## Corrections the adversarial pass made to the original proposal

- **Overturned — the `<Environment>` idle risk.** A bare `<Environment preset>` (no children/map/ground) routes to `EnvironmentCube` (`Environment.js:186`), which has **no `useFrame`** — idle-safe **by construction**. The per-frame `useFrame` at `Environment.js:136` lives only in `EnvironmentPortal` (children only). So: no idle-frame empirical check needed, and **do not pass `frames={1}`** to it (ignored on the cube branch).
- **New risk surfaced — remote HDRI CDN.** `useEnvironment.js:8` fetches presets from `https://raw.githack.com/pmndrs/drei-assets/.../hdri/`. A multi-MB remote fetch behind Suspense violates the app's local-first/offline ethos (`CLAUDE.md`: projects in localStorage, all geometry in-browser). **Resolution: self-host the HDRI under `public/` (preserves the chosen premium IBL look) — do not ship a remote-CDN dependency.** Lights-only grounding is the fallback if the asset weight is unacceptable.
- **Narrowed — the invalidate rule.** Not "invalidate after every imperative camera write." Perspective re-frames already invalidate via the trailing `controls.update()` → `'change'`. The **one** case needing an explicit `invalidate()` is **orthographic `camera.zoom` writes** — three-stdlib gates `zoomChanged` on its internal dolly `scale` (`:280`), which a programmatic `camera.zoom` assignment never sets, so `'change'` won't fire.

## Implementation invariants

1. **Every self-driving `useFrame` rig MUST call `state.invalidate()` each tick until settled** (sets `frames=2`); the loop terminates cleanly by simply *stopping* the invalidate. This is the #1 footgun: a lerp that forgets it runs one frame then freezes. Only two rigs are self-driven — camera fly-in (keyed `fitVersion`) and mesh spawn (keyed `stlVersion`).
2. **Camera fly-in** (replaces the instant `camera.position.set` at `CameraFit` `:933`): lerp position + target, `controls.enabled=false` during the ~400ms flight, re-enable on arrival; clamp `dt` for tab-restore; reduced-motion → instant set + a single `invalidate()`.
3. **Mesh spawn** (group `:355`, material `:382`): ease an `appear` ref 0→1 (~320ms) driving group scale 0.92→1 + `material.opacity`; **mutate via ref only**, never clone the disposed geometry (`:129`), never overwrite the `emissive/flatShading/wireframe/side` props (`:386-389`); set `transparent=true` while fading and flip back to `false` at completion (and in the abort guard if `stlVersion` changes mid-fade) for correct `depthWrite` on the `DoubleSide` part. Mirror on `SlicerScene` (`:982-990`).
4. **Grounding:** `<ContactShadows frames={1}>` bakes once on first commit then no-ops forever (`ContactShadows.js:72-91`) — free under demand. `<Environment preset>` env-only, **no `background` prop** (keep the `#2f3236` `<color>` at `:346`), **no `frames` prop**, **self-hosted HDRI**.
5. **CaptureRig contamination gate (non-optional):** before the 3 refine shoots, set the ContactShadows ref `.visible=false` and null `scene.environment`; restore after — mirroring the existing rim-light add/remove (`:891-908`). Otherwise env reflections + the shadow plane skew the self-critique feature/hole counts.
6. **Ortho-zoom invalidate:** append `useThree.getState().invalidate()` after orthographic `camera.zoom` writes only (`ViewRig.frame()` ortho branch `:825-828`, `ProjectionFit` mount `fit()`).

## Residual empirical check (the only one left)

With `frameloop='demand'` set, confirm on a **low/mid-tier integrated GPU (Intel UHD-class)** and the Apple-Silicon dev machine: (a) at true idle the rAF is fully stopped (rAF counter / DevTools Performance trace → zero rAF + zero WebGL draws while static, proving the backdrop-blur compositor cost drops); and (b) OrbitControls damping (`dampingFactor ~0.12`) settles smoothly with the 5 glass surfaces composited — no end-of-inertia stutter. The Environment idle-frame check is **dropped** (source-proven safe). CaptureRig, SlicerScene, and lerp correctness are settled by source.

## Verified source

`node_modules/@react-three/fiber/dist/events-b389eeca.esm.js` (`:16060`, `:16064`, `:16086`, `:16102`, `:16121`, `:1121`) · `@react-three/drei/core/OrbitControls.js` (`:29-52`) · `Environment.js` (`:136`, `:186`) · `ContactShadows.js` (`:72-91`) · `useEnvironment.js` (`:8`) · `three-stdlib/controls/OrbitControls.js` (`:280`, `:288-289`, `:336`).

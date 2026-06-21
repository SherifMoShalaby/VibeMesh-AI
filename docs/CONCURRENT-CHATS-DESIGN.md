# Concurrent Chats — Design of Record

**Status:** Approved design. Ready to build.
**Scope:** Let multiple chats (projects) generate AND render simultaneously — start a design in project A, switch to B, start another, both streaming and compiling in the background.
**Author:** Lead architect.

---

## 1. Executive summary + verdict

**Feasible. The bottleneck is the *client*, not the server and not (fundamentally) the worker.** The Express server is already stateless per request and provably serves N concurrent `/api/generate` streams — `runBestOfN` (`src/state/generationActions.ts`) already fans out N concurrent `streamGenerate` calls today. Every blocker is a client-side global singleton: one `generating` boolean, one module-level `abortController`, one set of top-level compile/STL fields, one interactive render slot, and one explicit lock (`blockSwitchWhileGenerating`).

**Recommended approach — Minimal Viable Concurrency.** Introduce a single new in-memory structure, `sessions: Record<projectId, Session>`, that owns every per-iteration runtime field that today lives at the top level of the store implicitly keyed to `activeId`. Keep the existing top-level store fields **as a read-only projection of `sessions[activeId]`** so `Viewport`/`RightPanel`/`ChatPanel` keep reading `get().stl` / `get().generating` / `get().params` unchanged — near-zero component churn. Bind each `runGeneration` run to a `projectId` captured once at entry and route every chat-write / compile / adopt / abort through projectId-bound helpers. Keep the **single OpenSCAD worker** but replace its lone interactive slot with **per-chat render lanes** so a background chat can never supersede the foreground's render, and **invert `compile()`'s stale guard from DROP to ROUTE-to-owning-session** so a background render lands in its own session and paints instantly on switch-back. Delete `blockSwitchWhileGenerating` **last**, only after the rebind is complete.

We consciously accept that renders **serialize** through one worker — Manifold makes typical interactive renders sub-second, so a background chat rarely makes the foreground user wait. A dedicated second background worker is the designed fast-follow (§8) the moment instrumentation shows loop-vs-foreground contention is real.

---

## 2. Why it's one-chat-at-a-time today

Every single-chat assumption traces to one root decision: the persisted `Project` record (`src/types.ts:92-104`) holds **only** durable authoring data — `{id, name, code, paramValues, chat, chatFuture, createdAt, updatedAt}`. **All** live per-iteration runtime state lives at the **top level** of the one zustand store, implicitly keyed to whatever `activeId` is at the moment of access. There is exactly one slot for the design "currently being worked on", so "the active project" and "the project that is generating/rendering" are **forced to be the same project**.

| Assumption | Location | What it does |
|---|---|---|
| **Module-level `abortController`** | `src/state/generationActions.ts:36` | `let abortController: AbortController \| null`. `runGeneration` overwrites it at `:120`, the `finally` nulls it at `:426`, `abortGeneration()` (`:479`) aborts whatever it currently points at. A second run **clobbers** the first's handle; the first can never be stopped; the first `finally` to run nulls the other's controller. |
| **Global `generating` boolean** | `src/state/store.ts:99`, set `true`/`false` at `generationActions.ts:119,427` | The single app-wide mutual-exclusion gate. Read by `sendPrompt` (`:434`), `retryLast` (`:446`), `regenerateWithSkills` (`:458`), `blockSwitchWhileGenerating` (`store.ts:234`), and 5 components. The first `finally` to fire flips it `false` while another run still streams. |
| **`blockSwitchWhileGenerating()`** | `src/state/store.ts:234-238` | Returns `true` and refuses the action whenever `generating` is set — the **explicit prohibition** on the exact feature requested. Called from `newProject`/`openProject`/`deleteProject`/`importShareFile`/`loadExample`. Its own doc-comment (`store.ts:230-233`) names the reason: `runGeneration` re-reads the active project after every `await`. |
| **Single stream buffer** | `streamText`/`streamHasCode` (`store.ts:99-103`), appended at `generationActions.ts:182-187` | Two concurrent streams would **interleave their tokens into one buffer**; `streamHasCode` (which gates the param panel) would flip on either stream. |
| **Coalesce/supersede + single interactive slot** | `src/lib/openscad/client.ts:36,53-56` | `private queued: PendingJob \| null` holds **at most one** interactive job. A newer interactive `compile()` does `this.queued?.resolve({ok:false,error:'superseded'}); this.queued = job` — evicting whatever interactive job was waiting **with no chat identity**. The moment chat B renders, chat A's pending render is resolved `superseded` and lost. |
| **`compile()` stale-render guard (DROP)** | `src/state/store.ts:308-309,320,327` | Captures `projectAtStart = get().activeId`; `stale = () => get().activeId !== projectAtStart`. If the active project changed, the result returns `{ok:false,error:'superseded'}` and **never writes** `stl`/`modelDims`. A background render is thrown away the instant the user switches away. Writes the global `stl`/`stlVersion`/`fitVersion`/`modelDims`/`meshTransform` (`store.ts:333-348`) and clears `vpPast`/`vpFuture` (`store.ts:314`) — globally. |
| **Single OpenSCAD worker** | `src/lib/openscad/client.ts:32` (`OpenScadEngine`), singleton export at `:115` | One `Worker`, one `active` slot, one `queued` interactive slot, one `bgQueue` FIFO, one watchdog `timer`. "The worker handles one job at a time." Imported by `store.ts`, `generationActions.ts`, `exportActions.ts`, `interferenceProxy.ts`. |
| **`get().activeId`-resolved gen helpers** | `activeChat()`/`setChat()`/`setChatAndFuture()`/`persist()` (`store.ts:220-228, 362-388`) | Each resolves its target project via `get().activeId` **at call time**, not a bound id. Across `runGeneration`'s many awaits, `activeId` may have changed — landing A's reply + adopted code on B. This is precisely the corruption `blockSwitchWhileGenerating` exists to prevent. |
| **Single `pendingAutoRefineFor`** | `store.ts:107`, set/consumed `generationActions.ts:400,487` | The auto-refine **trigger flag** is a single global slot; two near-simultaneous finishes clobber it. (The `autoRefinePass = new Map<string,number>()` counter at `generationActions.ts:47` is **already** projectId-keyed and survives.) |

---

## 3. The hard constraints

These are physical/architectural facts the design must respect, not code smells to refactor away.

1. **openscad-wasm is single-shot.** `callMain` may run only once per instance, so the worker builds a **fresh WASM instance per render** (`src/lib/openscad/worker.ts`). *Forces:* pooling buys **parallelism, never warm per-chat reuse** — every render re-instantiates regardless. You cannot pin a fast per-chat renderer.

2. **The WASM is base64-embedded in a single ~14 MB JS module**, decoded into a `WebAssembly.Module` **once per realm** at module load (`node_modules/openscad-wasm/openscad.js` ≈ 13.9 MB; `vite.config.ts` raised `chunkSizeWarningLimit` for it). Compiled modules are **not shareable across worker realms** today. *Forces:* a K-worker pool costs **~14 MB × K resident floor** plus per-render instance heaps. This caps a sane pool at small K and makes "one worker per project" prohibitive. A single-worker + per-chat-queue design pays **zero** extra memory.

3. **Render coalescing SUPERSEDES** (`client.ts:53-56`). The single interactive slot resolves the prior waiting job `superseded` with no chat identity. *Forces:* under multi-chat this becomes **silent cross-chat data loss** — the supersede key must become **per-chat** so a chat only supersedes its *own* prior queued render. Background jobs (`opts.background`, `client.ts:50-52`) already queue FIFO and are never superseded — the correct primitive for non-foreground work already exists; it just isn't chat-aware.

4. **IndexedDB write coalescing.** `saveProjects()` writes the **whole projects array** behind a synchronous in-memory cache with a single coalescing async writer (single in-flight + pending) — `src/lib/storage.ts`. *Forces:* concurrent durable writers are safe **only** if each computes its update from live state at apply time. The existing map-by-id idiom (`store.ts:369`) is concurrency-correct per write; the residual risk is two interleaved async runs each capturing `get().projects` *before* the other's `set()` lands → lost write. The fix is to route every durable mutation through zustand's **functional `set((s) => …)`** form so it reads live state at apply time.

5. **Sessions must NOT be persisted.** `Project` (`src/types.ts:92`) is the schema-versioned, migrated record and must stay runtime-free, or `generating`/`stl`/`abortController` would serialize to IndexedDB and bump `SCHEMA_VERSION`. *Forces:* the new per-project session is a **separate in-memory structure**, ephemeral, reset on reload — which matches today's behavior exactly (an in-flight generation already does not survive reload).

6. **SSE abort wiring is already per-request.** `server/index.mjs` wires `res.on('close')` → `AbortController.abort()` per connection; the client's per-call `signal` flows through `streamGenerate` (`generationActions.ts:158`). *Forces:* nothing server-side changes. The only client blocker is the single module-level controller; give each run its own and the server already supports N concurrent streams.

---

## 4. Target architecture

### 4.1 Per-chat state model

One new field on the store: `sessions: Record<string, Session>` — a plain object keyed by `projectId` (zustand-friendly, JSON-inspectable, no `Map` serialization quirks). `Session` owns **every** field the constraint map flagged as global-scoped-to-`activeId`. The existing top-level store fields **stay** and become a derived **projection** of `sessions[activeId]`, so all component readers are untouched.

```ts
interface Session {
  projectId: string

  // --- generation (was generationActions.ts module global + store top-level fields) ---
  generating: boolean
  streamText: string
  streamHasCode: boolean
  genStartedAt: number | null        // replaces ChatPanel's component-local `elapsed` start
  abortController: AbortController | null  // was the module-level singleton (generationActions.ts:36)
  engine: string | null              // captured at run start; stable vs. a mid-run engine switch
  model: string | null               // captured at run start
  effort: string | null              // captured at run start
  pendingAutoRefine: boolean         // was the single global pendingAutoRefineFor (store.ts:107)

  // --- editor working copy (was store.ts:44-46 — per-project so a bg adoptCode can't swap the active sliders) ---
  code: string
  params: ScadParameter[]
  paramValues: ParamValues

  // --- compile / geometry (was store.ts:48-78 top-level fields) ---
  compileStatus: CompileStatus
  compileError: string | null
  compileLog: string | null
  compileMs: number | null
  compileNote: string | null
  degradedToDraft: boolean
  modelDims: StlBBox | null
  stl: ArrayBuffer | null
  stlVersion: number
  fitVersion: number
  meshTransform: { position: [number, number, number]; rotation: [number, number, number] } | null
  modelRemoved: boolean

  // --- viewport history (was store.ts:69-70) ---
  vpPast: VpSnapshot[]
  vpFuture: VpSnapshot[]

  // --- slicer (was store.ts:84-93) ---
  viewMode: 'single' | 'plates'
  pieces: { name: string; stl: ArrayBuffer; bbox: StlBBox }[] | null
  slicing: boolean
  slicingToken: number
  slicerFailed: string[]
}
```

The `autoRefinePass = new Map<string, number>()` counter (`generationActions.ts:47`) is **already** projectId-keyed and stays as-is; only its trigger flag moves into `session.pendingAutoRefine`. `skillStats`, `bedId`, `quality`, `health`, `engine` (the *selected* engine), and the projects array itself stay top-level — they are config or durable data, not per-iteration runtime.

**The projection.** A `writeSession(pid, patch)` helper is the single funnel for all session writes:

```ts
function writeSession(pid: string, patch: Partial<Session>) {
  set((state) => {
    const merged = { ...ensureSession(state, pid), ...patch }
    const next: Partial<VibeState> = { sessions: { ...state.sessions, [pid]: merged } }
    if (pid === state.activeId) Object.assign(next, projectionOf(merged))  // mirror to top-level
    return next
  })
}
```

`projectionOf(session)` returns the slice of top-level fields (`stl`, `generating`, `streamText`, `code`, `params`, `compileStatus`, …) read directly off the session. It is the **one** place the field list is enumerated — derived from a single shared typed key list so a newly added `Session` field cannot be forgotten in the mirror (hardens the "projection desync" risk, §8). On `openProject`, the incoming session's projection is copied up; the **invariant** is: top-level fields always equal `projectionOf(sessions[activeId])`.

**Helper rebinding.** The four generation helpers gain projectId-bound twins — `setChatFor(pid, chat)`, `activeChatFor(pid)`, `setChatAndFutureFor(pid, …)`, `persistFor(pid, partial)`, `adoptCodeFor(pid, code, carryFrom)`. The existing param-less versions become thin wrappers over `get().activeId` (`setChat(c) => setChatFor(get().activeId!, c)`) so **interactive** call sites are untouched. `runGeneration` uses **only** the `*For(pid)` variants with its captured `pid`.

### 4.2 Generation manager + delta routing

N generations run fully in-flight and independent. The mechanism is the per-session state plus a disciplined capture:

- **Capture once.** `runGeneration` captures `const pid = get().activeId` immediately after the early-return guard, and **never reads `get().activeId` again**. Every chat append uses `activeChatFor(pid)`/`setChatFor(pid)`; every config read (`engine`/`model`/`effort`) uses the values captured into `sessions[pid]` at start, so a mid-run engine switch for *another* chat cannot poison this run's auto-fix re-ask; adopt/compile target `pid`. This is **structurally** enforced — after the capture line, the run has only `*For(pid)` helpers and `sessions[pid]` reads in scope.

- **Delta routing.** The SSE `onDelta` writes to its **own** session: `writeSession(pid, { streamText: get().sessions[pid].streamText + delta, streamHasCode })`. Because `writeSession` mirrors to the top-level projection **only when `pid === activeId`**, two concurrent streams cannot interleave into one buffer — A's tokens accumulate in `sessions[A].streamText`, B's in `sessions[B].streamText`, and `ChatPanel` renders whichever is active. `streamGenerate` / `toApiMessages` / the server route need **no changes** (already reentrant; `runBestOfN` proves N concurrent streams).

- **Abort.** Per-session `abortController`. `runGeneration` stores `ctrl` via `writeSession(pid, { abortController: ctrl })`; the `finally` clears it **guarded by identity**: `if (get().sessions[pid].abortController === ctrl) writeSession(pid, { abortController: null, generating: false, streamText: '', streamHasCode: false })`. So a fast-finishing run can't null a different (or a retry-spawned) run's handle, and even its own clear fires only if it still owns the slot. `abortGeneration(pid?)` aborts `sessions[pid ?? activeId].abortController`. The per-run `genTimer`/`genTimedOut`/`genCapMs` locals (`generationActions.ts:122-138`) stay exactly as they are — already correctly per-invocation; the timer's `ctrl.abort()` now hits the run's own session controller.

- **Busy guards.** `sendPrompt`/`retryLast`/`regenerateWithSkills` check `sessions[targetPid]?.generating` — the **target** chat's flag, not a global. So "kick off A, switch to B, start B" works: B's guard sees B idle. A derived selector `anyGenerating = Object.values(sessions).some(s => s.generating)` powers app-wide affordances (`document.title`, `[data-busy]`). An `inFlight` ceiling (cap ~4 concurrent generations; Send queues with a toast beyond it) bounds unbounded stream/STL-memory fan-out.

### 4.3 The render-concurrency answer — **queue, not pool** (with per-chat lanes)

**Decision: keep the single worker; resolve concurrency with per-chat render lanes + foreground-priority drain.** The reasoning is the two hard constraints pulling against each other: a worker pool costs **~14 MB × K** with **no warm-reuse** benefit (single-shot WASM), while **Manifold makes typical interactive renders sub-second** — which collapses the practical cost of serialization that a pool exists to solve. For the *first* shippable increment, paying the memory floor to win parallelism we rarely need is the wrong trade. The pool is the designed fast-follow (§8), not the starting point.

Two surgical changes in `client.ts`:

1. **Per-chat interactive lanes.** Replace `private queued: PendingJob | null` (`client.ts:36`) with `private queued: Map<projectId, PendingJob>`. `compile()` gains a `projectId` in `CompileOpts`. The supersede line (`client.ts:55`) changes from "evict whatever interactive job is waiting" to "evict only **this project's** prior queued interactive job":
   ```ts
   const prev = this.queued.get(pid)
   prev?.resolve({ ok: false, error: 'superseded' })
   this.queued.set(pid, job)
   ```
   A background chat's render lands in its **own** lane and can never supersede the foreground's. Per-chat coalescing (latest slider wins) is preserved **within** a lane.

2. **Foreground-priority drain.** `finish()`'s next-job pick becomes: `this.queued.get(activeId) ?? <oldest other queued lane, FIFO by insertion> ?? this.bgQueue.shift()`. The active project's interactive render always jumps ahead; background lanes drain when the foreground is idle. The store tells the engine which lane is priority via a setter — `openscad.setForeground(id)`, called on every project switch — so the engine never imports the store.

Renders still **serialize** through one worker — concurrency here is **fair interleaving, not parallelism**. The `bgQueue` (interference probes, best-of-N candidates — `interferenceProxy.ts`, `generationActions.ts:99`) stays one shared FIFO, now fed by N possible loops; the existing per-generation `ComputeBudget` (`budget.ts`, `wallMs`/`maxRenders`) bounds each loop's render count, so two concurrent loops **degrade by serializing rather than starving**. A cross-chat global render cap is the named fast-follow. The 90 s watchdog + respawn stay per-engine/per-worker unchanged (one worker → one watchdog; a hang still respawns it, and surviving lanes re-run on the fresh worker since `queued`/`bgQueue` are JS-side).

**Per-chat compile cache (the inverted stale guard).** In `store.ts compile()`, `projectAtStart` is the run's `pid`; it passes `{ projectId: pid }` to `openscad.compile`. The stale guard **inverts** from DROP to ROUTE:

- **Today** (`store.ts:320,327`): `if (result.error === 'superseded' || stale()) return { ok:false, error:'superseded' }` — drops the result.
- **New:** still honor the **lane-level** `error === 'superseded'` sentinel (a same-chat newer render legitimately superseded this one → ignore). But on success, `writeSession(pid, { stl, stlVersion: …, modelDims, … })` **unconditionally** — the result belongs to `pid`'s session regardless of who's active now. `writeSession`'s projection rule paints the viewport **only if `pid === activeId`**.

So a background chat's finished render is **preserved in its session** and shown the instant you switch to it — **no recompile on switch-back**. `fitVersion`/`vpPast`/`vpFuture`/`pieces`/`slicingToken` invalidation all become session-scoped (write into `sessions[pid]`), so a background recompile never clears the active project's viewport history or yanks its camera.

---

## 5. UX model

Minimal by design. The **foreground** chat is the full experience (viewport, params, chat, streaming bubble) reading the active-session projection unchanged. **Background** generations surface in exactly two places:

1. **TopBar project switcher** (`src/components/TopBar.tsx:101-111`). Each row gains a small status glyph driven by `sessions[p.id]`:
   - a **spinner** while `session.generating`;
   - a thin **timeout-progress bar** derived from `session.genStartedAt` vs `health.genTimeoutMs` (the same math `ChatPanel` uses today, now reading `session.genStartedAt` instead of component-local `elapsed`);
   - a subtle **"new result" dot** when a background compile landed since you last viewed it (a per-session `lastSeenStlVersion` vs current);
   - an **error mark** on failure;
   - a per-row **Stop** button → `abortGeneration(p.id)`, so a background run is killable **without opening it**.

2. **`document.title` / `[data-busy]`** (`src/App.tsx:154-156`), driven by the derived `anyGenerating` + a count: e.g. `"2 drafting…"`. `isHome` keeps reading the active session only (already correct).

**Starting a background chat.** The user starts a generation in A, switches to B (now **always allowed** — the `blockSwitchWhileGenerating` toast is gone), and starts B. B's busy-guard sees B idle, so Send works while A streams in the background.

**The viewport.** Remains **single-mesh**, showing the **active** session's `stl`. Switching projects (`openProject`) no longer nulls `stl` + recompiles; it copies the incoming session's already-compiled projection up (**instant**), and compiles only if that session has never compiled (`compileStatus === 'idle'` && code present) — preserving today's first-open behavior while making switch-back to a *finished* background chat instant and lossless. A background chat that finishes while you're elsewhere simply has its assistant message already appended to its (persisted) chat and its STL waiting in its session.

`ChatPanel` reads the **active** session's `streamText`/`generating`/`genStartedAt` via the projection, so it renders only the active chat's streaming bubble and timeout bar — never a different project's stream under the wrong history. **No tab bar, no split view, no simultaneous viewports** — the foreground-only viewport is the deliberate scope boundary for v1.

---

## 6. What stays invariant

- **SSE abort wiring is untouched.** `server/index.mjs` `res.on('close')` → upstream `AbortController.abort()` stays exactly as-is. Each run already carries its own per-call `signal` through `streamGenerate` (`generationActions.ts:158`); we only stop sharing one *module-level* controller. A per-chat Stop fires **that** run's signal, so the server closes the right upstream. **Keep this wiring intact.**
- **openscad single-shot render-per-instance is untouched.** `worker.ts` still builds a fresh WASM instance per render. We add no warm-instance pinning, no second instance in the same realm — only a per-chat *scheduling* lane on the existing serializing worker.
- **The model response contract is untouched.** No change to `server/prompt.mjs`, the one-`scad`-block contract, `extractScadBlock`, or the printability rules. Concurrency is a state/scheduling change, not a generation-semantics change.
- **The stale-guard's *correct intent* is preserved — but per-chat.** Its purpose was always "don't let a render for project X paint while the user is looking at project Y." That intent is **kept**: a render still paints the viewport only when its owning project is active. What changes is the *disposition* of the off-screen result — **ROUTE to the owning session** instead of **DROP** — so the work isn't wasted and switch-back is instant. The lane-level `superseded` sentinel (a genuinely stale same-chat render) is still honored as "ignore".
- **Persisted schema is untouched.** Sessions are in-memory only; `Project` stays runtime-free; `SCHEMA_VERSION`/`DB_VERSION` do not move; no migration.

---

## 7. Phased plan

Each phase is shippable and verifiable. **Ordering is a correctness gate, not a preference** — removing `blockSwitchWhileGenerating` before the rebind lands turns a refused switch into silent cross-project corruption. The block is deleted **last**.

> **BUILD STATUS (2026-06-21, branch `audit/p1-fixes`):**
>
> **Phase 0 + 1 DONE** — `Session` map + `writeSession` projection + `*For(pid)` helpers in
> `src/state/store.ts`; `generationActions.ts` fully rebound to a captured `pid` (module-level
> `abortController` removed; stream/abort/genStartedAt per-session; finally guarded by ctrl identity;
> runBestOfN per-pid). Zero behavior change.
>
> **Phase 2 DONE — re-sliced to SWITCH-PRESERVATION** (lowest-risk slice; the `compile()` path is
> UNCHANGED). The `Session` now also caches the geometry/editor/viewport/slicer fields; `snapshotSession`
> captures the active project's top-level into its session on switch-AWAY, `restoreSession` projects a
> cached session back on switch-TO. `openProject`/`newProject`/`importShareFile`/`loadExample` snapshot
> the leaver and restore the enterer instead of nulling+recompiling; `deleteProject` evicts the session.
> `writeSession` now mirrors any patched projected field (forward-ready for compile routing). **Live-
> verified:** switch back to Storage box restored 84×54×31.6mm + its 6 sliders with **no recompile flash**;
> the cube project shows 25×25×25mm; no console errors. Green: lint, build, 164 unit, 19/19 e2e.
> **NOTE:** background-compile ROUTING (compile writes `sessions[pid]`, paint only if active) + the
> recovery-loop's geometry reads being session-bound were MOVED to Phase 5 (they're only exercised once
> the block is gone). The switch-block still stands.
>
> **Phase 3 DONE** — per-chat render LANES in `src/lib/openscad/client.ts`: `queued` is now a
> `Map<projectId, job>` (a background chat's render supersedes only its OWN lane, never the
> foreground's) + `setForeground(id)` + a foreground-first `pickNext()` drain. `+2` vitest cases. The
> store wires `setForeground` via a single subscription on `activeId`.
>
> **Phase 4 DONE** — per-target UI: the TopBar project switcher shows a spinner + a **Stop** button on
> every generating project (`abortGeneration(pid)`); the tab title shows the live count ("2 drafting…").
>
> **Phase 5 DONE — CONCURRENCY IS LIVE.** `compile()`/`adoptCode()` take a `pid` and route results into
> `sessions[pid]` (paint the viewport ONLY when pid is active; lane = pid) — the stale-render DROP is
> replaced by ROUTE-to-owning-session. The recovery loop's geometry reads/writes (params, modelDims,
> drop-to-bed, compileNote) are session-bound to `pid`. `restoreSession` now ALWAYS projects the gen
> fields (so a stale `generating` flag from the project you left can't bleed onto the new view, and
> switching TO a background-generating project shows its spinner+stream); the new-project switches reset
> the gen projection; `deleteProject` aborts a deleted project's run. **`blockSwitchWhileGenerating` and
> its 5 call-sites are DELETED.**
>
> **VERIFIED LIVE:** started gen A (desk organizer), switched to a NEW project B mid-generation
> (previously blocked), started gen B (coaster) — tab title "⌛ 2 drafting…", both spinners in the
> switcher; both finished; A = 160×100×55mm, B = 109.7×95×8mm, **each on its own project (no cross-
> contamination)**; switching between completed projects restores each instantly; zero console errors.
> Green: lint, build, 166 unit (+ client lane tests), bench ratchets, 19/19 e2e.
>
> **Known deferrals (non-blocking):** `compilePieces` (slicer) is still active-only (uses the default
> lane); the `inFlight` concurrency cap and the dedicated 2nd background worker (the §8 fast-follow) are
> not built — add the latter if instrumentation shows foreground/background render contention.

| Phase | Work | Verify | Effort |
|---|---|---|---|
| **0 — Session scaffold (no behavior change)** | Add `sessions: Record<string,Session>`, `ensureSession`, `writeSession`, `projectionOf` (single shared key list). Keep one active session; all existing fields become the projection. No concurrency yet. | Full app behaves identically. Existing e2e (`tests/e2e/*`) + unit (`src/**/*.test.ts`) green. Dev-only invariant check: `projectionOf(sessions[activeId])` deep-equals top-level fields after every `set`. | ~1.5 d |
| **1 — Rebind the generation loop to captured `pid`** | Remove module-level `abortController`. In `runGeneration` capture `pid` once; store `ctrl`/`generating`/`streamText`/`streamHasCode`/`genStartedAt`/`engine`/`model`/`effort` in `sessions[pid]`; route **every** chat append / adopt / compile / auto-name / `setMeshTransform` / `get().params`/`paramValues`/`modelDims`/`engine` read through `*For(pid)` + `sessions[pid]`. `finally` clears guarded by `ctrl` identity. `pendingAutoRefineFor` → `session.pendingAutoRefine`; `consumeAutoRefine(pid)`. **Block still present.** | Single-chat behavior unchanged. New unit test: drive a run, mutate `activeId` mid-stream (simulated), assert every write hit the captured `pid`, not `activeId`. `grep` the gen path for any surviving `get().activeId`/`activeChat()`. | ~2 d |
| **2 — Invert `compile()` / `compilePieces()` + switch-path rewrite** | `compile()`/`compilePieces()` take `pid` at entry, pass `{projectId: pid}` to the engine, write results into `sessions[pid]` (ROUTE, not DROP), paint only if `pid===activeId`. `slicingToken`/`pieces`/`slicing`/`vpPast`/`vpFuture`/`fitVersion` session-scoped. `openProject`/`newProject`/`deleteProject`/`importShareFile`/`loadExample` stop nulling+recompiling on switch; copy the incoming session's projection up; compile only if idle-with-code. | Switch away mid-compile and back → geometry preserved, no recompile. Background recompile does not clear the active project's `vpPast`/camera. e2e green. | ~1 d |
| **3 — Per-chat render lanes** | `client.ts`: `queued: Map<projectId,PendingJob>` (supersede only same project); `projectId` in `CompileOpts`; `setForeground(id)`; foreground-first drain. Watchdog/respawn unchanged. Add the `openscad/client.ts`-lifecycle vitest cases (per-chat coalescing, foreground priority). | Two projects render; B's render never resolves A's `superseded`. `client.ts` unit tests assert a foreground render never supersedes a different lane. | ~0.5 d |
| **4 — Per-target busy guards + UI surfaces** | `sendPrompt`/`retryLast`/`regenerateWithSkills` check the **target** session. `abortGeneration(pid?)`. `inFlight` ceiling. TopBar per-row status + Stop. `App` title/`[data-busy]` from `anyGenerating` + count. `ChatPanel` `elapsed` from `session.genStartedAt`. Convert `setChatFor`/`persistFor`/`setChatAndFutureFor` to functional `set((s)=>…map-by-id…)` (closes the lost-write window). | Start A, switch to B, start B — both stream; per-row spinners correct; Stop targets the right run; two concurrent generations land on the right chats; durable writes don't clobber. | ~1.5 d |
| **5 — Delete `blockSwitchWhileGenerating` (LAST)** | Remove the guard + its 5 call-sites (`store.ts:234-238`, `:527/576/599/635/758`). `deleteProject` of a generating project aborts that session's run + evicts its session (also clears the `autoRefinePass` map entry — fixes the noted leak). | Full concurrent flow e2e: switch mid-stream, assert A's version landed on A. All green: lint / unit / bench ratchets / e2e. | ~0.5 d |

**Total ≈ 1.5 engineer-weeks.** The work is mechanical and well-bounded by the constraint map; the gating sequence (rebind → invert guard → lanes → delete the block last) is the main correctness risk, not the volume. Each phase gates on the existing CI nets (lint → test → bench ratchets → build, plus the chromium e2e job).

---

## 8. Risks + the biggest unsolved tension

### Risks and mitigations

| Risk | Mitigation |
|---|---|
| **Ordering hazard** — deleting `blockSwitchWhileGenerating` before every `get().activeId` in `runGeneration`/`compile` is rebound = silent cross-project corruption (A's reply + adopted code land on B). | The block is removed in the **last** commit, gated on an e2e that switches projects mid-stream and asserts A's version landed on A. After Phase 1, `grep` the gen path for any surviving `get().activeId`/`activeChat()`. |
| **Projection desync** — a session field written via a raw `set()` instead of `writeSession` leaves the top-level projection stale vs `sessions[activeId]`. | Funnel **all** session-field writes through `writeSession`; derive `projectionOf` from a single shared typed key list so a new field can't be forgotten; dev-only invariant assert `projectionOf(sessions[activeId]) === top-level`. |
| **Abort identity race** — the `finally` nulling the controller without the `=== ctrl` guard lets a fast run clear a slower concurrent run's handle (the original singleton bug, relocated). | The identity-guarded clear is the explicit fix; unit-test two overlapping runs on the same project (retry-during-generation edge). |
| **Lost durable write** — two interleaved async runs each capture `get().projects` before the other's `set()` lands. | Convert every `*For(pid)` durable mutation to the functional `set((s)=>…map-by-id…)` form (reads live state at apply time). The storage coalescing writer already serializes IDB transactions. |
| **Memory creep from retained background STLs** — every background chat now keeps its compiled `ArrayBuffer` in its session (today only the active one holds an `stl`). | Cap retained sessions: evict the `stl` of the least-recently-viewed background session beyond N, recompile on switch-back. Deferred unless profiling shows pressure. |

### The biggest unsolved tension — non-preemptible foreground/background render contention

**The single worker cannot truly render two projects in parallel, and no design resolves this without paying the ~14 MB-per-realm memory floor the hard constraint imposes.** The winning design accepts serialization and leans **entirely** on the empirical claim that Manifold renders are sub-second — but **that claim is the load-bearing assumption, and it is not guaranteed.** A heavy kit, or (worse) **two concurrent verification loops** each firing best-of-N + interference-probe renders through the one worker, can stack multi-second background work **in front of** the foreground user's interactive render.

The foreground-priority drain protects the interactive *slot* in the **queue** — but it **cannot preempt an already-running heavy background render.** The worker is single-job and **non-preemptible**; the only escape from an in-flight render is the watchdog terminate. So the genuinely unsolved problem is **preemption/fairness of in-flight background render work against a *waiting* foreground interactive render on one non-preemptible worker.**

There is **no zero-cost answer.** The design **consciously bets** that loop-vs-foreground contention is rare enough to defer — justified by Manifold's measured sub-second renders and the foreground-priority drain — and **instruments for it** so the bet is falsifiable:

- **Instrument now:** record, per render, the **queue-wait time** of a foreground interactive job behind background work, and the count of concurrent active verification loops. Surface a dev metric; alert when foreground wait exceeds a threshold (e.g. > 500 ms) more than rarely.
- **The cheapest real fix, held ready (the top graft):** a **dedicated second background worker** — a 1 foreground + 1 background hybrid (~28 MB floor instead of N × 14 MB). All `{background:true}` renders (best-of-N candidates `generationActions.ts:99`, interference probes `interferenceProxy.ts`) route to the background worker, so a chat's verification loop **never** blocks any user's live interactive render. Each worker gets its own watchdog/respawn; message correlation extends from `(jobId)` to `(workerIdx, jobId)`. This is added **the moment instrumentation shows the bet has failed** — it reintroduces the ~14 MB cost the winner was chosen to avoid, so it is paid only on evidence, not speculation.
- **Complementary, cheaper still:** a **cross-chat global concurrent-render cap** in `ComputeBudget` (`budget.ts`) so two simultaneous loops **degrade** (skip the next probe/candidate) instead of compounding latency through the shared worker. This buys headroom without the second worker's memory.

The bet is explicit and reversible: ship single-worker per-chat lanes, measure the contention, and graft the second background worker the instant the data says the sub-second assumption doesn't hold under real concurrent loops.

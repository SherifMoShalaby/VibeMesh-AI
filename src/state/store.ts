import { create } from 'zustand'
import type { BedSize, ChatMessage, CompileResult, OrcaMaterial, ParamValue, ParamValues, Project, ScadParameter } from '../types'
import { PRINTER_BEDS, QUALITY_PRESETS } from '../types'
import { buildDefines, parseParameters } from '../lib/params'
import { useUi } from './ui'
import { openscad } from '../lib/openscad/client'
import { fetchHealth, type HealthInfo } from '../lib/api'
import { hydrateStorage, loadLastChatId, loadProjects, newId, saveLastChatId, saveProjects, setOnExternalChange } from '../lib/storage'
import { mergeExternalProjects } from '../lib/storeDecisions'
import { parseShareFile, shareFileToProject } from '../lib/shareFile'
import { clearRefMask } from '../lib/refSegment'
import { loadSkillStats, type SkillStats } from '../lib/skillStats'
import { chatIdFromHash, setChatHash } from '../lib/hashRoute'
import { createExportActions } from './exportActions'
import { createPlacementActions, vpSnapshotOf, VP_HISTORY_LIMIT } from './placementActions'
import { createGenerationActions } from './generationActions'

/** per-tab marker: present once a tab has loaded the app, so a RELOAD/return restores the last
 *  chat while a brand-new window/tab (empty sessionStorage) starts fresh. */
const SESSION_KEY = 'vibemesh.session.v1'
import { stlBBox, type StlBBox } from '../lib/stl'
import { expandFootprints } from '../lib/packPlates'
import type { Example } from '../lib/examples'

export type CompileStatus = 'idle' | 'compiling' | 'ok' | 'error'

/** Per-project generation + geometry runtime (concurrent-chats). The store's top-level
 *  generating/streamText/stl/params/… fields are a live PROJECTION of `sessions[activeId]`
 *  (see writeSession), so every component reads the active project unchanged while MULTIPLE projects
 *  each run their own generation/render in the background. A render routes into its owning session
 *  and paints the viewport only when that project is active. NOT persisted (runtime only; an in-flight
 *  generation already doesn't survive reload). */
export interface Session {
  // generation runtime
  generating: boolean
  streamText: string
  streamHasCode: boolean
  /** epoch ms the current run started (drives the timeout bar; per-project for the switcher later) */
  genStartedAt: number | null
  /** this run's abort handle — replaces the former module-level singleton in generationActions */
  abortController: AbortController | null
  // editor working copy (Phase 2: per-project so switching restores it without re-parsing)
  code: string
  params: ScadParameter[]
  paramValues: ParamValues
  // compile / geometry (Phase 2: cached per-project so switch-back is instant, no recompile)
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
  vpPast: VpSnapshot[]
  vpFuture: VpSnapshot[]
  // slicer
  viewMode: 'single' | 'plates'
  pieces: { name: string; stl: ArrayBuffer; bbox: StlBBox }[] | null
  slicing: boolean
  slicingToken: number
  slicerFailed: string[]
  /** per-piece Arrange nudges over the packer layout (Phase 4) — mirrors the project record so the
   *  plates view + both .3mf exports read one map, and so vpUndo/vpRedo can restore it via vpSnapshotOf. */
  pieceOverrides: Record<string, { dx: number; dy: number; rot: 0 | 90 }>
  /** session spend meter (Task 0.0): exact count of generation calls made this session for THIS
   *  project (a best-of-N turn counts N, a single turn 1) + a rough estimate of generated tokens.
   *  Runtime-only (not persisted) — lets the user SEE spend before opting into any quota multiplier. */
  genCalls: number
  genTokens: number
  /** Customizer slider undo/redo stacks. Each entry is the full paramValues snapshot BEFORE
   *  the change that produced the corresponding label. Cleared on every new AI generation. */
  paramHistory:       ParamValues[]
  paramFuture:        ParamValues[]
  paramHistoryLabels: string[]
  paramFutureLabels:  string[]
}

/** Session fields that MIRROR a top-level store field (everything except the session-only
 *  genStartedAt/abortController). The single source for the writeSession mirror + snapshot/restore,
 *  so a newly added projected field can't be forgotten. */
const SESSION_PROJECTED = [
  'generating', 'streamText', 'streamHasCode',
  'code', 'params', 'paramValues',
  'compileStatus', 'compileError', 'compileLog', 'compileMs', 'compileNote', 'degradedToDraft',
  'modelDims', 'stl', 'stlVersion', 'fitVersion', 'meshTransform', 'modelRemoved', 'vpPast', 'vpFuture',
  'viewMode', 'pieces', 'slicing', 'slicingToken', 'slicerFailed', 'pieceOverrides',
  'genCalls', 'genTokens',
  'paramHistory', 'paramFuture', 'paramHistoryLabels', 'paramFutureLabels',
] as const satisfies ReadonlyArray<keyof Session>
const SESSION_PROJECTED_SET: ReadonlySet<string> = new Set(SESSION_PROJECTED)

function blankSession(): Session {
  return {
    generating: false, streamText: '', streamHasCode: false, genStartedAt: null, abortController: null,
    code: '', params: [], paramValues: {},
    compileStatus: 'idle', compileError: null, compileLog: null, compileMs: null, compileNote: null, degradedToDraft: false,
    modelDims: null, stl: null, stlVersion: 0, fitVersion: 0, meshTransform: null, modelRemoved: false, vpPast: [], vpFuture: [],
    viewMode: 'single', pieces: null, slicing: false, slicingToken: 0, slicerFailed: [], pieceOverrides: {},
    genCalls: 0, genTokens: 0,
    paramHistory: [], paramFuture: [], paramHistoryLabels: [], paramFutureLabels: [],
  }
}

/** snapshot of everything a viewport placement action (move/rotate/delete) can change */
export interface VpSnapshot {
  stl: ArrayBuffer | null
  modelDims: StlBBox | null
  meshTransform: { position: [number, number, number]; rotation: [number, number, number] } | null
  compileStatus: CompileStatus
  compileError: string | null
  compileNote: string | null
  compileMs: number | null
  modelRemoved: boolean
  /** Phase 4: per-piece Arrange nudges captured alongside the geometry so ⌘Z/⇧⌘Z restore the
   *  bed layout in lock-step with the model (otherwise undo would desync overrides from `stl`). */
  pieceOverrides: Record<string, { dx: number; dy: number; rot: 0 | 90 }>
}

export interface VibeState {
  projects: Project[]
  activeId: string | null
  health: HealthInfo | null
  /** false until the first /api/health probe resolves; lets the UI tell "loading" from "no backend" */
  healthLoaded: boolean
  engine: string | null

  code: string
  params: ScadParameter[]
  paramValues: ParamValues

  compileStatus: CompileStatus
  compileError: string | null
  compileLog: string | null
  compileMs: number | null
  /** non-fatal render note, e.g. quality was degraded for a heavy model */
  compileNote: string | null
  /** true when the last render auto-fell-back to Draft (drives the export-quality prompt) */
  degradedToDraft: boolean
  /** measured bounding box of the last successful render */
  modelDims: StlBBox | null
  /** LOCAL, privacy-preserving per-skill outcome counts (uses/removals) — drives the chip's
   *  "consider quarantining" hint. Never leaves the browser. */
  skillStats: SkillStats
  /** viewport arrangement: position + rotation (rad, XYZ order) applied to the mesh and baked into single-STL export */
  meshTransform: { position: [number, number, number]; rotation: [number, number, number] } | null
  setMeshTransform: (t: VibeState['meshTransform']) => void
  /** remove the current geometry from the viewport (code stays; undo or APPLY & RENDER brings it back) */
  clearModel: () => void
  /** geometry was deleted from the viewport while the code remains — drives the explanatory HUD note */
  modelRemoved: boolean
  /** placement history (move / rotate / center / drop / reset / delete) — cleared on every new render */
  vpPast: VpSnapshot[]
  vpFuture: VpSnapshot[]
  vpUndo: () => void
  vpRedo: () => void
  /** Customizer slider undo/redo stacks (cleared on new AI generation) */
  paramHistory:           ParamValues[]
  paramFuture:            ParamValues[]
  paramHistoryLabels:     string[]
  paramFutureLabels:      string[]
  undoParam:              () => void
  redoParam:              () => void
  jumpToParamHistory:     (index: number) => void
  stl: ArrayBuffer | null
  /** monotonically increasing id so the viewport knows when geometry changed */
  stlVersion: number
  /** bumps only when a render replaces an EMPTY viewport — drives camera auto-fit
      (param tweaks / AI iterations keep the user's camera; F or FIT re-frames manually) */
  fitVersion: number

  /** viewport mode: 'single' = the normal one-mesh view; 'plates' = the slicer (each
   *  piece packed onto bed-sized plates). Defaults to 'single' → fully additive. */
  viewMode: 'single' | 'plates'
  /** per-piece compiled geometry for the slicer; null until built or after a re-render invalidates it */
  pieces: { name: string; stl: ArrayBuffer; bbox: StlBBox }[] | null
  /** true while compilePieces() is rendering the slicer pieces */
  slicing: boolean
  /** monotonic generation token: every main compile() bumps it, so an in-flight
   *  compilePieces() can detect a concurrent recompile (slider drag in slicer view)
   *  and abandon its now-stale pack instead of clobbering the pieces:null invalidation */
  slicingToken: number
  /** names of pieces that genuinely failed to render for the slicer (NOT superseded) —
   *  surfaced in the slicer readout so a missing piece is never silently dropped */
  slicerFailed: string[]
  /** switch the viewport view; entering 'plates' builds the pieces if not cached */
  setViewMode: (mode: 'single' | 'plates') => Promise<void>
  /** compile every part-enum piece into in-memory geometry for the slicer view */
  compilePieces: () => Promise<void>

  generating: boolean
  streamText: string
  /** true once the streaming reply has emitted its first ```fence — a flip-once flag the
   *  parameter panel subscribes to (instead of raw streamText) so it doesn't re-render per token */
  streamHasCode: boolean
  /** active project's session spend meter (projection of sessions[activeId].genCalls/genTokens) */
  genCalls: number
  genTokens: number
  /** project id awaiting its one auto-refine pass (set when the first image-grounded
   *  model renders) → ChatPanel fires only when it matches the active project, so a
   *  lingering flag can never misfire on a different project */
  pendingAutoRefineFor: string | null
  consumeAutoRefine: () => void
  /** per-project generation runtime, keyed by projectId. The top-level generating/streamText/
   *  streamHasCode fields above are a live projection of `sessions[activeId]` (see writeSession). */
  sessions: Record<string, Session>

  bedId: string
  /** user-defined bed dimensions, used when bedId === 'custom' */
  customBed: BedSize | null
  setCustomBed: (bed: BedSize) => void
  quality: string

  init: () => Promise<void>
  newProject: () => void
  openProject: (id: string) => void
  deleteProject: (id: string) => void
  renameProject: (name: string) => void
  sendPrompt: (text: string, images?: ChatMessage['images'], action?: string) => Promise<void>
  /** re-run the last user prompt after a failed generation (drops the trailing error reply) */
  retryLast: () => Promise<void>
  /** re-roll the current model: generate a different version of the same request, APPENDED as a
   *  sibling after the current one so both stay switchable via the version chips (nothing discarded) */
  rerollLast: () => Promise<void>
  /** correct the applied-patterns chip: regenerate the current design with skill retrieval
   *  OVERRIDDEN by `skillIds` (selectSkills skipped for that turn). Advisory — never blocks. */
  regenerateWithSkills: (msgId: string, skillIds: string[]) => Promise<void>
  /** stop a generation — the given project's, or the active one's. */
  abortGeneration: (pid?: string) => void
  setParamValue: (name: string, value: ParamValue) => void
  /** select a multi-part piece (or 'all'): compiles immediately (no slider debounce) and
   *  re-fits the camera — a part switch is navigation, not a slider tweak */
  selectPart: (value: string) => Promise<void>
  /** set the PRINT quantity for a multi-part piece — project metadata, clamped [1,99], triggers NO
   *  recompile (a print count is not geometry). Drives replication on plate/3MF export + Slicer view. */
  setPartQuantity: (part: string, n: number) => void
  /** Phase 4 Arrange: per-piece bed nudges over the auto-packer, keyed by the packer placement key
   *  (`lid#1`). Project metadata (persisted), undoable via vpSnapshotOf. Empty ⇒ pure packer layout. */
  pieceOverrides: Record<string, { dx: number; dy: number; rot: 0 | 90 }>
  /** set (or replace) one piece's Arrange override — snapshots placement for ⌘Z, persists, triggers NO recompile */
  setPieceOverride: (name: string, override: { dx: number; dy: number; rot: 0 | 90 }) => void
  /** drop ONE piece's Arrange override → that piece snaps back to its pure packer seat (per-piece Reset) */
  removePieceOverride: (name: string) => void
  /** clear all Arrange overrides → snap back to the pure auto-packer layout (the "Arrange" chip) */
  clearPieceOverrides: () => void
  resetParams: () => void
  setCode: (code: string) => void
  recompile: () => void
  /** Roll the model back to a previous version (a code-bearing chat message): adopt its
   *  code AND truncate every later version off the lineage, so the next prompt's history
   *  ends here and the model builds on THIS version, not the newest one. The dropped tail
   *  is stashed (reversible via restoreNewer) until a new prompt diverges the branch. */
  restoreVersion: (msgId: string) => void
  /** undo the most recent rollback: re-attach the stashed tail and re-adopt its newest version */
  restoreNewer: () => void
  loadExample: (example: Example) => void
  setBed: (id: string) => void
  setQuality: (id: string) => void
  setEngine: (id: string) => void
  exportingPlates: boolean
  exportPlates: (fileBase: string) => Promise<void>
  /** export one slicer-ready .3mf per bed-sized plate (pieces packed as in the slicer view) */
  exportPlates3mf: (fileBase: string) => Promise<void>
  /** export the current model's STL, offering a quality upgrade when preview was draft/degraded */
  exportStlSmart: (fileBase: string) => Promise<void>
  /** export one .3mf with every part as a named object (slicer-ready plate) */
  export3mf: (fileBase: string) => Promise<void>
  /** export an OrcaSlicer/BambuStudio slice-ready .orca.3mf (single-part, P1) */
  exportOrcaProject: (fileBase: string) => Promise<void>
  orcaMaterial: OrcaMaterial
  setOrcaMaterial: (m: OrcaMaterial) => void
  /** export a re-editable .vibemesh share file (code + sliders + intent + skills + thumbnail) */
  exportShareFile: (fileBase: string) => void
  /** import a .vibemesh share file as a new project and switch to it */
  importShareFile: (text: string) => void
  claudeModel: string
  setClaudeModel: (id: string) => void
  /** reasoning-effort level for the Claude engines (login + API key): low|medium|high|xhigh|max */
  claudeEffort: string
  setClaudeEffort: (id: string) => void
  kimiModel: string
  setKimiModel: (id: string) => void
  refreshHealth: (providers?: HealthInfo['providers']) => Promise<void>
  /** Back up all IndexedDB projects to the server in one shot (migrate + manual backup). */
  exportAllToServer: () => Promise<void>
}

// legacy vibescad.* values are copied to these keys on startup (src/lib/storage.ts)
const ENGINE_KEY = 'vibemesh.engine.v1'
const CLAUDE_MODEL_KEY = 'vibemesh.claudeModel.v1'
const CLAUDE_EFFORT_KEY = 'vibemesh.claudeEffort.v1'
const KIMI_MODEL_KEY = 'vibemesh.kimiModel.v1'
const QUALITY_KEY = 'vibemesh.quality.v1'
const BED_KEY = 'vibemesh.bed.v1'
const CUSTOM_BED_KEY = 'vibemesh.customBed.v1'
const ORCA_MATERIAL_KEY = 'vibemesh.orcaMaterial.v1'

function loadCustomBed(): BedSize | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_BED_KEY) ?? 'null') as BedSize | null
    if (parsed && [parsed.x, parsed.y, parsed.z].every((n) => Number.isFinite(n) && n > 0)) return parsed
  } catch {
    /* corrupt value — ignore */
  }
  return null
}


// Render watchdogs (ms). Primary interactive renders use the client default; the
// Draft fallback gets a tight budget so a heavy model fails fast (primary+draft,
// not 90s+90s), while deliberate one-shot exports get extra headroom.
const RENDER_TIMEOUT_DRAFT = 20_000
const RENDER_TIMEOUT_EXPORT = 90_000
/** column-major 4×4 from position + XYZ-order euler rotation (radians) */
function composeMatrix(p: [number, number, number], r: [number, number, number]): number[] {
  const [cx, cy, cz] = r.map(Math.cos)
  const [sx, sy, sz] = r.map(Math.sin)
  // R = Rz * Ry * Rx (matches THREE 'XYZ' euler order applied to column vectors)
  const m00 = cy * cz
  const m01 = sx * sy * cz - cx * sz
  const m02 = cx * sy * cz + sx * sz
  const m10 = cy * sz
  const m11 = sx * sy * sz + cx * cz
  const m12 = cx * sy * sz - sx * cz
  const m20 = -sy
  const m21 = sx * cy
  const m22 = cx * cy
  return [m00, m10, m20, 0, m01, m11, m21, 0, m02, m12, m22, 0, p[0], p[1], p[2], 1]
}

let paramTimer: ReturnType<typeof setTimeout> | null = null
function clearParamTimer() {
  if (paramTimer) {
    clearTimeout(paramTimer)
    paramTimer = null
  }
}

export const useStore = create<VibeState>((set, get) => {
  /** persist projects + keep the active project record in sync */
  function persist(partial?: Partial<Project>) {
    const { projects, activeId, code, paramValues } = get()
    if (!activeId) return
    const updated = projects.map((p) =>
      p.id === activeId ? { ...p, code, paramValues, ...partial, updatedAt: Date.now() } : p,
    )
    set({ projects: updated })
    saveProjects(updated)
  }

  function qualityArgsFor(preset: (typeof QUALITY_PRESETS)[number]): string[] {
    return ['-D', '$fn=0', '-D', `$fa=${preset.fa}`, '-D', `$fs=${preset.fs}`]
  }

  /** Multi-part exports ship at LEAST Fine — the viewport preview (default
   *  Standard, fa4/fs0.8) is too coarse to print smooth curves. An Ultra preview
   *  exports at Ultra. The per-piece Draft timeout fallback still protects heavy pieces. */
  function exportQuality(): (typeof QUALITY_PRESETS)[number] {
    const cur = QUALITY_PRESETS.find((q) => q.id === get().quality) ?? QUALITY_PRESETS[1]
    const fine = QUALITY_PRESETS.find((q) => q.id === 'fine')!
    return QUALITY_PRESETS.indexOf(cur) >= QUALITY_PRESETS.indexOf(fine) ? cur : fine
  }

  /** Drop Arrange-override keys that no longer name a live placement (after a recompile changes the
   *  pieces, or partQuantities drops a replica). The valid keys are exactly the qty-expanded packer
   *  keys for the current pieces — anything else is stale and would offset a piece that isn't there.
   *  Mirrors the sliceGeos cleanup + pieces=null invalidation. No-op (and no churn) when nothing stale. */
  function pruneOverrides() {
    const overrides = get().pieceOverrides
    if (Object.keys(overrides).length === 0) return
    const pieces = get().pieces
    if (!pieces) return // pieces being rebuilt — keep overrides until the new pack lands
    const quantities = get().projects.find((p) => p.id === get().activeId)?.partQuantities ?? {}
    const valid = new Set(
      expandFootprints(
        pieces.map((p) => ({ name: p.name, w: p.bbox.x, h: p.bbox.y, z: p.bbox.z })),
        (name) => quantities[name] ?? 1,
      ).map((e) => e.name),
    )
    const kept = Object.fromEntries(Object.entries(overrides).filter(([k]) => valid.has(k)))
    if (Object.keys(kept).length === Object.keys(overrides).length) return // nothing stale
    set({ pieceOverrides: kept })
    persist({ pieceOverrides: kept })
  }

  /** Compile every part-enum piece into in-memory geometry for the slicer view.
   *  Sequential (the openscad client coalesces concurrent jobs), at >=Fine like exports,
   *  with the same Draft timeout fallback. Stale-guarded against a project switch. */
  async function compilePieces(): Promise<void> {
    const { code, params, paramValues } = get()
    const partParam = params.find((p) => p.name === 'part' && p.kind === 'enum')
    if (!partParam || !code.trim()) {
      set({ pieces: null })
      return
    }
    const names = (partParam.options ?? []).map(String).filter((o) => o !== 'all')
    const preset = exportQuality()
    const projectAtStart = get().activeId
    const tokenAtStart = get().slicingToken
    // stale on EITHER axis: a project switch, or a concurrent main compile() (e.g. a slider
    // drag in slicer view — RightPanel is not gated on viewMode) that bumped the token and
    // already nulled `pieces` as its invalidation signal. Committing now would clobber that.
    const invalidated = () => get().activeId !== projectAtStart || get().slicingToken !== tokenAtStart
    set({ slicing: true })
    const collected: { name: string; stl: ArrayBuffer; bbox: StlBBox }[] = []
    const failed: string[] = []
    try {
      for (const name of names) {
        const defines = buildDefines(params, { ...paramValues, part: name })
        let result = await openscad.compile(code, [...defines, ...qualityArgsFor(preset)], RENDER_TIMEOUT_EXPORT)
        if (!result.ok && result.error?.includes('timed out') && preset.id !== 'draft') {
          result = await openscad.compile(code, [...defines, ...qualityArgsFor(QUALITY_PRESETS[0])], RENDER_TIMEOUT_DRAFT)
        }
        // a coalesced/superseded render is not a failure — a concurrent compile() will rebuild
        // via the Viewport effect; counting it as failed would fire a spurious loud note
        if (result.error === 'superseded') return
        if (invalidated()) return // project switched OR cache invalidated mid-build — drop
        const bb = result.ok && result.stl ? stlBBox(result.stl) : null
        if (result.ok && result.stl && bb) collected.push({ name, stl: result.stl, bbox: bb })
        else failed.push(name)
      }
    } finally {
      // clear the in-flight flag, but ONLY for the project we started in — a mid-build project
      // switch already reset slicing for the NEW project (selectProject/closeProject), and an
      // unconditional clear here would wipe the new project's freshly-set slicing:true
      if (get().activeId === projectAtStart) set({ slicing: false })
    }
    if (invalidated()) return
    // a missing piece in the slicer is as misleading as a missing part in an export — surface it
    // loudly: both the gated HUD note AND the always-visible slicer readout (slicerFailed)
    set({ pieces: collected, slicerFailed: failed })
    // Override invalidation (Phase 4): the pieces[] this layout keyed into were rebuilt — drop any
    // override key whose base name / replica index no longer exists (mirrors the pieces=null reset).
    pruneOverrides()
    if (failed.length) set({ compileNote: `Slicer: ${failed.length} part(s) failed to render — ${failed.join(', ')}` })
  }

  /** Compile FOR a specific project (defaults to the active one). Results route into sessions[pid]
   *  via writeSession, which paints the viewport ONLY when pid is active — so a background chat's
   *  render lands in its own session (shown instantly on switch-back) and never disturbs the
   *  foreground. The render goes through that project's lane in the worker (no cross-chat supersede). */
  async function compile(code: string, defines: string[], pid: string = get().activeId ?? ''): Promise<CompileResult> {
    if (!pid) return { ok: false, error: 'empty' }
    // bring the active project's session current before mutating it (placement/slider writes go to
    // the top level directly, so the session can lag); a background project's session is authoritative.
    if (pid === get().activeId) snapshotSession(pid)
    if (!code.trim()) {
      writeSession(pid, { compileStatus: 'idle', stl: null, modelDims: null, compileError: null, compileNote: null, degradedToDraft: false })
      return { ok: false, error: 'empty' }
    }
    // a re-render replaces the geometry — reset THIS project's viewport history + bump its slicing
    // token so its own in-flight compilePieces() abandons a now-stale pack.
    writeSession(pid, (cur) => ({ compileStatus: 'compiling', compileError: null, compileNote: null, degradedToDraft: false, vpPast: [], vpFuture: [], modelRemoved: false, pieces: null, slicerFailed: [], slicingToken: cur.slicingToken + 1 }))
    // the pieces[] this selection keyed into is being rebuilt — drop the stale per-piece identity
    // alongside the pieces:null invalidation so a recompile can't leave a dangling selectedPiece.
    if (pid === get().activeId) useUi.getState().setSelectedPiece(null)
    // adaptive curve quality: kill any global $fn, drive $fa/$fs from the preset.
    const preset = QUALITY_PRESETS.find((q) => q.id === get().quality) ?? QUALITY_PRESETS[1]
    let result: CompileResult = await openscad.compile(code, [...defines, ...qualityArgsFor(preset)], undefined, { projectId: pid })
    // a same-chat newer render superseded this one → ignore (don't overwrite the newer result).
    // NOTE: no "active changed" drop anymore — writeSession routes to sessions[pid] and paints only
    // if pid is still active, so a switch mid-compile preserves the result in its owning session.
    if (result.error === 'superseded') return { ok: false, error: 'superseded' }

    // heavy-model fallback: a timeout at higher quality gets one retry at Draft
    let note: string | null = null
    if (!result.ok && result.error?.includes('timed out') && preset.id !== 'draft') {
      writeSession(pid, { compileStatus: 'compiling' })
      result = await openscad.compile(code, [...defines, ...qualityArgsFor(QUALITY_PRESETS[0])], RENDER_TIMEOUT_DRAFT, { projectId: pid })
      if (result.error === 'superseded') return { ok: false, error: 'superseded' }
      if (result.ok) note = `model too heavy for ${preset.label} — rendered at Draft`
    }

    if (result.ok && result.stl) {
      writeSession(pid, (cur) => ({
        compileStatus: 'ok',
        stl: result.stl!,
        stlVersion: cur.stlVersion + 1,
        // auto-fit the camera only when this project's viewport was empty — never yank the framing mid-iteration
        fitVersion: cur.stl === null ? cur.fitVersion + 1 : cur.fitVersion,
        modelDims: stlBBox(result.stl!),
        meshTransform: null, // fresh geometry → reset viewport arrangement
        compileError: null,
        compileNote: note,
        degradedToDraft: note !== null,
        compileLog: result.log ?? null,
        compileMs: result.ms ?? null,
      }))
    } else {
      writeSession(pid, { compileStatus: 'error', compileError: result.error ?? 'Unknown OpenSCAD error', compileNote: null, degradedToDraft: false, compileLog: result.log ?? null, compileMs: result.ms ?? null })
    }
    return result
  }

  function activeChat(): ChatMessage[] {
    const { projects, activeId } = get()
    return projects.find((p) => p.id === activeId)?.chat ?? []
  }

  /** the rolled-past version tail (redo stack) for the active project */
  function activeFuture(): ChatMessage[] {
    const { projects, activeId } = get()
    return projects.find((p) => p.id === activeId)?.chatFuture ?? []
  }

  /** set the active project's chat AND its redo stack together (Restore / redo / a
   *  diverging send all move both at once — keeping them in one write avoids a torn
   *  state where the lineage and its stashed tail disagree). */
  function setChatAndFuture(chat: ChatMessage[], chatFuture: ChatMessage[]) {
    const { projects, activeId } = get()
    const updated = projects.map((p) => (p.id === activeId ? { ...p, chat, chatFuture, updatedAt: Date.now() } : p))
    set({ projects: updated })
    saveProjects(updated)
  }

  /**
   * Adopt a new program. With `carryFrom` (the previous params+values), carry the
   * user's slider tweaks forward across an AI iteration — but only for params whose
   * code default is UNCHANGED (recompile semantics: if the new code changed a
   * default, the code wins), and only if the carried value is still in range/valid.
   * Without `carryFrom` (rollback / load example) every param resets to its default.
   */
  function adoptCode(code: string, carryFrom?: { params: ScadParameter[]; values: ParamValues }, pid: string = get().activeId ?? ''): Promise<CompileResult> {
    if (!pid) return Promise.resolve({ ok: false, error: 'empty' })
    const params = parseParameters(code)
    const paramValues: ParamValues = {}
    for (const p of params) {
      let value: ParamValue = p.defaultValue
      if (carryFrom) {
        const old = carryFrom.params.find((o) => o.name === p.name)
        if (old && old.defaultValue === p.defaultValue && carryFrom.values[p.name] !== undefined) {
          let v = carryFrom.values[p.name]
          if (p.kind === 'enum' && p.options && !p.options.some((o) => String(o) === String(v))) v = p.defaultValue
          if (typeof v === 'number' && ((p.min !== undefined && v < p.min) || (p.max !== undefined && v > p.max))) v = p.defaultValue
          value = v
        }
      }
      paramValues[p.name] = value
    }
    // route the editor working copy into the project's session (mirrors to the top level if active)
    writeSession(pid, { code, params, paramValues })
    // clear the slider undo/redo history — a new AI generation starts a fresh history
    writeSession(pid, {
      paramHistory:       [],
      paramFuture:        [],
      paramHistoryLabels: [],
      paramFutureLabels:  [],
    })
    return compile(code, buildDefines(params, paramValues), pid)
  }

  /** The single funnel for per-project generation-runtime writes. Updates sessions[pid] and, when
   *  pid is the ACTIVE project, mirrors the projected fields (generating/streamText/streamHasCode)
   *  to the top level so every existing component reader stays unchanged. The patch may be an object
   *  or an updater `(cur) => patch` (the latter reads the live session — used for streaming append). */
  function writeSession(pid: string, patch: Partial<Session> | ((cur: Session) => Partial<Session>)) {
    set((s) => {
      const cur = s.sessions[pid] ?? blankSession()
      const p = typeof patch === 'function' ? patch(cur) : patch
      const merged = { ...cur, ...p }
      const next: Partial<VibeState> = { sessions: { ...s.sessions, [pid]: merged } }
      // mirror ONLY the patched projected fields to the top level (not all) so a gen write can't
      // clobber a placement/slider write that went to the top level directly.
      if (pid === s.activeId) {
        const mirror = next as unknown as Record<string, unknown>
        const src = merged as unknown as Record<string, unknown>
        for (const k of Object.keys(p)) {
          if (SESSION_PROJECTED_SET.has(k)) mirror[k] = src[k]
        }
      }
      return next
    })
  }
  function genSession(pid: string): Session {
    return get().sessions[pid] ?? blankSession()
  }

  /** Capture the active project's current top-level projected fields into its session — call BEFORE
   *  switching away. Placement/slider/compile writes go to the top level directly, so a session can be
   *  stale between switches; this brings it current exactly when we're about to leave it. */
  function snapshotSession(pid: string) {
    set((s) => {
      const cur = s.sessions[pid] ?? blankSession()
      const top = s as unknown as Record<string, unknown>
      const snap: Record<string, unknown> = {}
      for (const k of SESSION_PROJECTED) snap[k] = top[k]
      return { sessions: { ...s.sessions, [pid]: { ...cur, ...snap } } }
    })
  }
  /** Restore a project's cached session into the top-level projection (instant switch-back, no
   *  recompile). Returns false when the session has nothing rendered yet (never visited / never
   *  compiled) so the caller falls back to the parse+compile path. */
  function restoreSession(pid: string): boolean {
    const sess = get().sessions[pid] ?? blankSession()
    // ALWAYS project the generation fields first — so a stale `generating` flag from the project we
    // just left (which may still be running in the background) never bleeds onto the new view, and
    // switching TO a background-generating project correctly shows its spinner + stream.
    set({ generating: sess.generating, streamText: sess.streamText, streamHasCode: sess.streamHasCode })
    if (sess.compileStatus === 'idle' && !sess.stl) return false // no cached geometry → caller compiles
    const src = sess as unknown as Record<string, unknown>
    const patch: Record<string, unknown> = {}
    for (const k of SESSION_PROJECTED) patch[k] = src[k]
    // re-frame the restored model, matching today's switch-then-recompile (which re-fit the camera)
    patch.fitVersion = get().fitVersion + 1
    set(patch as Partial<VibeState>)
    return true
  }

  // projectId-BOUND twins of the generation helpers (the param-less versions above resolve via
  // get().activeId at call time — unsafe across a generation's many awaits once switching is allowed).
  // runGeneration uses ONLY these with its captured pid. Functional set() reads live state at apply
  // time so two concurrent durable writers can't clobber each other (the lost-write fix).
  function activeChatFor(pid: string): ChatMessage[] {
    return get().projects.find((p) => p.id === pid)?.chat ?? []
  }
  function setChatFor(pid: string, chat: ChatMessage[]) {
    set((s) => ({ projects: s.projects.map((p) => (p.id === pid ? { ...p, chat, updatedAt: Date.now() } : p)) }))
    saveProjects(get().projects)
  }
  function setChatAndFutureFor(pid: string, chat: ChatMessage[], chatFuture: ChatMessage[]) {
    set((s) => ({ projects: s.projects.map((p) => (p.id === pid ? { ...p, chat, chatFuture, updatedAt: Date.now() } : p)) }))
    saveProjects(get().projects)
  }
  function persistFor(pid: string, partial?: Partial<Project>) {
    set((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== pid) return p
        // the ACTIVE project also captures the live editor code/paramValues (as persist() does);
        // a background project persists only the explicit partial (its code lives in its session).
        const live = pid === s.activeId ? { code: s.code, paramValues: s.paramValues } : {}
        return { ...p, ...live, ...partial, updatedAt: Date.now() }
      }),
    }))
    saveProjects(get().projects)
  }
  function adoptCodeFor(pid: string, code: string, carryFrom?: { params: ScadParameter[]; values: ParamValues }): Promise<CompileResult> {
    // adopt + compile FOR pid: the active project paints the viewport; a background project's render
    // lands in its own session (shown instantly on switch-back), via writeSession's mirror gate.
    return adoptCode(code, carryFrom, pid)
  }

  return {
    projects: [],
    activeId: null,
    health: null,
    healthLoaded: false,
    engine: null,
    claudeModel: localStorage.getItem(CLAUDE_MODEL_KEY) ?? 'default',
    claudeEffort: localStorage.getItem(CLAUDE_EFFORT_KEY) ?? 'xhigh',
    kimiModel: localStorage.getItem(KIMI_MODEL_KEY) ?? 'default',
    code: '',
    params: [],
    paramValues: {},
    compileStatus: 'idle',
    compileError: null,
    compileLog: null,
    compileMs: null,
    compileNote: null,
    degradedToDraft: false,
    modelDims: null,
    skillStats: loadSkillStats(),
    meshTransform: null,
    stl: null,
    stlVersion: 0,
    fitVersion: 0,
    viewMode: 'single',
    pieces: null,
    slicing: false,
    slicingToken: 0,
    slicerFailed: [],
    pieceOverrides: {},
    generating: false,
    streamText: '',
    streamHasCode: false,
    genCalls: 0,
    genTokens: 0,
    pendingAutoRefineFor: null,
    sessions: {},
    bedId: localStorage.getItem(BED_KEY) ?? PRINTER_BEDS[0].id,
    customBed: loadCustomBed(),
    quality: localStorage.getItem(QUALITY_KEY) ?? 'standard',
    exportingPlates: false,
    orcaMaterial: (localStorage.getItem(ORCA_MATERIAL_KEY) ?? 'PLA') as OrcaMaterial,
    modelRemoved: false,
    vpPast: [],
    vpFuture: [],
    paramHistory: [],
    paramFuture: [],
    paramHistoryLabels: [],
    paramFutureLabels: [],

    init: async () => {
      await hydrateStorage() // open IndexedDB + migrate + fill the sync cache before first read
      const projects = loadProjects()
      // Which chat opens, in priority order:
      //  1. a valid id in the URL hash → that chat (covers shared links AND same-tab reloads,
      //     since the hash persists across reload);
      //  2. else, on a RELOAD / return to a tab that has loaded before (sessionStorage marker) →
      //     the last chat the user was on (restore-on-reload);
      //  3. else (a brand-new window/tab, or no prior chat) → a fresh chat (reusing a pristine
      //     empty one if present, to avoid piling up "Untitled part"s and to stay idempotent
      //     under React StrictMode's double-invoke in dev).
      const hashId = chatIdFromHash()
      let target = hashId ? projects.find((p) => p.id === hashId) ?? null : null
      let returning = false
      try {
        returning = sessionStorage.getItem(SESSION_KEY) === '1'
        sessionStorage.setItem(SESSION_KEY, '1')
      } catch {
        /* sessionStorage unavailable — treat as a fresh window */
      }
      if (!target && returning) {
        const lastId = loadLastChatId()
        target = lastId ? projects.find((p) => p.id === lastId) ?? null : null
      }

      if (target) {
        set({ projects, activeId: target.id })
        const params = parseParameters(target.code)
        const paramValues = { ...Object.fromEntries(params.map((p) => [p.name, p.defaultValue])), ...target.paramValues }
        set({ code: target.code, params, paramValues })
        if (target.code.trim()) void compile(target.code, buildDefines(params, paramValues))
        setChatHash(target.id, { replace: true })
        saveLastChatId(target.id)
      } else {
        const pristine = projects.find((p) => !p.code.trim() && p.chat.length === 0)
        const project: Project = pristine ?? {
          id: newId(),
          name: 'Untitled part',
          code: '',
          paramValues: {},
          chat: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        const nextProjects = pristine ? projects : [project, ...projects]
        set({ projects: nextProjects, activeId: project.id, code: '', params: [], paramValues: {} })
        if (!pristine) saveProjects(nextProjects)
        setChatHash(project.id, { replace: true })
        saveLastChatId(project.id)
      }

      // cross-tab convergence: when ANOTHER tab persists, storage re-reads the durable record and
      // hands us the reconciled projects. Refresh inactive/background projects from it, but leave the
      // ACTIVE project's live editor untouched (never yank the chat/model the user is working in), and
      // keep the active project alive even if it was deleted in the other tab. We mutate state only —
      // never saveProjects here, so a refresh can't rebroadcast.
      setOnExternalChange((incoming) => {
        set({ projects: mergeExternalProjects(incoming, get().projects, get().activeId) })
      })

      await get().refreshHealth()
    },

    refreshHealth: async (providers) => {
      // A providers-only refresh (after saving a key) must PRESERVE systemTokens/genTimeoutMs from
      // the last full fetch — /api/connect returns only providers, so a naive replace would drop
      // them (silently widening the history budget and blanking the UI's timeout note).
      const health = providers ? { ...get().health, ok: true, providers } : await fetchHealth()
      let engine: string | null = null
      if (health) {
        const saved = get().engine ?? localStorage.getItem(ENGINE_KEY)
        const available = health.providers.filter((p) => p.available)
        engine = available.find((p) => p.id === saved)?.id ?? available[0]?.id ?? null
      }
      set({ health, engine, healthLoaded: true })
    },

    newProject: () => {
      const prev = get().activeId
      if (prev) snapshotSession(prev) // cache the project we're leaving for instant return
      clearParamTimer()
      // Reuse an existing pristine empty chat rather than minting a duplicate (the header
      // "New chat" button + the bare-hash handler both call this; init() reuses the same way).
      const existing = get().projects.find((p) => !p.code.trim() && p.chat.length === 0)
      if (existing) {
        set({
          activeId: existing.id, code: '', params: [], paramValues: {}, stl: null, meshTransform: null,
          vpPast: [], vpFuture: [], modelRemoved: false, compileStatus: 'idle', compileError: null,
          streamText: '', generating: false, streamHasCode: false, viewMode: 'single', pieces: null, slicing: false, pieceOverrides: {},
        })
        setChatHash(existing.id)
        saveLastChatId(existing.id)
        return
      }
      const project: Project = {
        id: newId(),
        name: 'Untitled part',
        code: '',
        paramValues: {},
        chat: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      const projects = [project, ...get().projects]
      set({
        projects,
        activeId: project.id,
        code: '',
        params: [],
        paramValues: {},
        stl: null,
        meshTransform: null,
        vpPast: [],
        vpFuture: [],
        modelRemoved: false,
        compileStatus: 'idle',
        compileError: null,
        streamText: '',
        generating: false,
        streamHasCode: false,
        viewMode: 'single',
        pieces: null,
        slicing: false,
        pieceOverrides: {},
      })
      saveProjects(projects)
      setChatHash(project.id)
      saveLastChatId(project.id)
    },

    openProject: (id) => {
      const project = get().projects.find((p) => p.id === id)
      if (!project) return
      const prev = get().activeId
      if (prev && prev !== id) snapshotSession(prev) // cache the project we're leaving for instant return
      clearRefMask(id) // drop any ephemeral reference-photo mask so it can't rank a swapped photo
      clearParamTimer()
      // transient per-model interaction modes live in the UI store — clear them so a
      // selection / measuring session doesn't bleed into the next project
      const ui = useUi.getState()
      ui.setSelected(false)
      ui.setSelectedPiece(null)
      ui.setMeasureMode(false)
      setChatHash(id)
      saveLastChatId(id)
      set({ activeId: id })
      // cached render → restore it instantly, no recompile (Phase 2)
      if (restoreSession(id)) return
      // first visit (or never compiled): the original reset + parse + compile path. Seed the
      // per-piece Arrange overrides from the project record (cross-project bleed guard — never carry
      // the prior project's layout).
      set({ stl: null, meshTransform: null, vpPast: [], vpFuture: [], modelRemoved: false, compileStatus: 'idle', compileError: null, streamText: '', viewMode: 'single', pieces: null, slicing: false, pieceOverrides: project.pieceOverrides ?? {} })
      const params = parseParameters(project.code)
      const paramValues = { ...Object.fromEntries(params.map((p) => [p.name, p.defaultValue])), ...project.paramValues }
      set({ code: project.code, params, paramValues })
      if (project.code.trim()) void compile(project.code, buildDefines(params, paramValues))
    },

    // export slice (exportPlates / exportPlates3mf / export3mf / exportOrcaProject / exportStlSmart / exportShareFile)
    // lives in ./exportActions — leaf actions, split out of this god-store (shared helpers passed in).
    ...createExportActions(set, get, { qualityArgsFor, exportQuality, composeMatrix, RENDER_TIMEOUT_EXPORT, RENDER_TIMEOUT_DRAFT }),

    importShareFile: (text) => {
      const file = parseShareFile(text)
      if (!file) {
        useUi.getState().pushToast("That file isn't a valid .vibemesh share file.", 'error')
        return
      }
      const prev = get().activeId
      if (prev) snapshotSession(prev) // cache the project we're leaving for instant return
      const project = shareFileToProject(file, newId(), Date.now())
      const projects = [project, ...get().projects]
      clearParamTimer()
      const params = parseParameters(project.code)
      const paramValues = { ...Object.fromEntries(params.map((p) => [p.name, p.defaultValue])), ...project.paramValues }
      set({
        projects,
        activeId: project.id,
        code: project.code,
        params,
        paramValues,
        stl: null,
        meshTransform: null,
        vpPast: [],
        vpFuture: [],
        modelRemoved: false,
        compileStatus: 'idle',
        compileError: null,
        streamText: '',
        generating: false,
        streamHasCode: false,
        viewMode: 'single',
        pieces: null,
        slicing: false,
      })
      saveProjects(projects)
      setChatHash(project.id)
      saveLastChatId(project.id)
      if (project.code.trim()) void compile(project.code, buildDefines(params, paramValues))
    },

    deleteProject: (id) => {
      const projects = get().projects.filter((p) => p.id !== id)
      // evict the deleted project's cached session (its STL/abort handle must not linger)
      const sessions = { ...get().sessions }
      // a deleted project must not keep generating in the background — stop its run first
      get().sessions[id]?.abortController?.abort()
      delete sessions[id]
      set({ projects, sessions })
      saveProjects(projects)
      if (get().activeId === id) {
        clearParamTimer()
        set({ activeId: null, code: '', params: [], paramValues: {}, stl: null, meshTransform: null, vpPast: [], vpFuture: [], modelRemoved: false, compileStatus: 'idle', viewMode: 'single', pieces: null, slicing: false, streamText: '', generating: false, streamHasCode: false, pieceOverrides: {} })
        setChatHash(null, { replace: true })
        saveLastChatId(null)
      }
    },

    renameProject: (name) => {
      persist({ name })
    },

    // AI-generation slice (sendPrompt / retryLast / regenerateWithSkills / abortGeneration /
    // consumeAutoRefine) lives in ./generationActions — the most intricate concern, split out of
    // this god-store; the shared compile-lifecycle helpers are passed in.
    ...createGenerationActions(set, get, { activeChatFor, setChatFor, setChatAndFutureFor, adoptCodeFor, persistFor, qualityArgsFor, writeSession, genSession }),

    setParamValue: (name, value) => {
      const prev = get().paramValues  // capture BEFORE update
      const paramValues = { ...prev, [name]: value }
      // clear redo immediately — any new edit invalidates the future
      set({ paramValues, paramFuture: [], paramFutureLabels: [] })
      clearParamTimer()
      paramTimer = setTimeout(() => {
        paramTimer = null
        const { code, params, paramValues: values, paramHistory, paramHistoryLabels } = get()
        const label = `${name} → ${value}`
        set({
          paramHistory: [...paramHistory, prev].slice(-50),
          paramHistoryLabels: [...paramHistoryLabels, label].slice(-50),
        })
        void compile(code, buildDefines(params, values))
        persist()
      }, 800)
    },

    selectPart: async (value) => {
      clearParamTimer() // a pending slider render must not clobber the part switch
      const paramValues = { ...get().paramValues, part: value }
      set({ paramValues })
      const { code, params } = get()
      const result = await compile(code, buildDefines(params, paramValues))
      // re-frame on a part switch (compile only auto-fits empty→full; a switch is full→full).
      // This lives HERE, not in setParamValue, so slider drags never yank the camera.
      if (result.ok) set((s) => ({ fitVersion: s.fitVersion + 1 }))
      persist()
    },

    undoParam: () => {
      const { paramHistory, paramFuture, paramHistoryLabels, paramFutureLabels, paramValues, code, params } = get()
      if (!paramHistory.length) return
      clearParamTimer()
      const restored = paramHistory[paramHistory.length - 1]
      const label    = paramHistoryLabels[paramHistoryLabels.length - 1]
      set({
        paramValues:        restored,
        paramHistory:       paramHistory.slice(0, -1),
        paramHistoryLabels: paramHistoryLabels.slice(0, -1),
        paramFuture:        [paramValues, ...paramFuture],
        paramFutureLabels:  [label, ...paramFutureLabels],
      })
      void compile(code, buildDefines(params, restored))
      persist()
    },

    redoParam: () => {
      const { paramHistory, paramFuture, paramHistoryLabels, paramFutureLabels, paramValues, code, params } = get()
      if (!paramFuture.length) return
      clearParamTimer()
      const restored = paramFuture[0]
      const label    = paramFutureLabels[0]
      set({
        paramValues:        restored,
        paramFuture:        paramFuture.slice(1),
        paramFutureLabels:  paramFutureLabels.slice(1),
        paramHistory:       [...paramHistory, paramValues],
        paramHistoryLabels: [...paramHistoryLabels, label],
      })
      void compile(code, buildDefines(params, restored))
      persist()
    },

    jumpToParamHistory: (index) => {
      const { paramHistory, paramHistoryLabels, paramValues, code, params } = get()
      if (index < 0 || index >= paramHistory.length) return
      clearParamTimer()
      const restored = paramHistory[index]
      set({
        paramValues:        restored,
        paramHistory:       paramHistory.slice(0, index),
        paramHistoryLabels: paramHistoryLabels.slice(0, index),
        paramFuture:        [paramValues],
        paramFutureLabels:  [''],
      })
      void compile(code, buildDefines(params, restored))
      persist()
    },

    setPartQuantity: (part, n) => {
      const clamped = Math.max(1, Math.min(99, Math.floor(n) || 1))
      const cur = get().projects.find((p) => p.id === get().activeId)?.partQuantities ?? {}
      if (cur[part] === clamped) return
      // project metadata via the existing persist seam — no compile, no slider write
      persist({ partQuantities: { ...cur, [part]: clamped } })
      // a lowered count drops replica keys (lid#2…) — prune any override that named one
      pruneOverrides()
    },

    setPieceOverride: (name, override) => {
      const s = get()
      const next = { ...s.pieceOverrides, [name]: override }
      // snapshot placement so a nudge is undoable (⌘Z), mirroring setMeshTransform; no recompile.
      set({ vpPast: [...s.vpPast.slice(-(VP_HISTORY_LIMIT - 1)), vpSnapshotOf(s)], vpFuture: [], pieceOverrides: next })
      persist({ pieceOverrides: next })
    },

    removePieceOverride: (name) => {
      const s = get()
      if (!(name in s.pieceOverrides)) return
      const { [name]: _drop, ...rest } = s.pieceOverrides
      void _drop
      set({ vpPast: [...s.vpPast.slice(-(VP_HISTORY_LIMIT - 1)), vpSnapshotOf(s)], vpFuture: [], pieceOverrides: rest })
      persist({ pieceOverrides: rest })
    },

    clearPieceOverrides: () => {
      const s = get()
      if (Object.keys(s.pieceOverrides).length === 0) return // already pure-packer — no snapshot churn
      set({ vpPast: [...s.vpPast.slice(-(VP_HISTORY_LIMIT - 1)), vpSnapshotOf(s)], vpFuture: [], pieceOverrides: {} })
      persist({ pieceOverrides: {} })
    },

    compilePieces,
    setViewMode: async (mode) => {
      set({ viewMode: mode })
      if (mode !== 'plates') return
      // entering the slicer (or re-entering after a re-render invalidated the cache) builds pieces
      const needsBuild = !get().pieces && !get().slicing
      if (needsBuild) await compilePieces()
      // re-frame ONLY when we (re)built the layout — a cached re-entry (e.g. toggling back from
      // single after orbiting) must leave the camera as the user left it. SPEC §8: auto-fit only
      // when the framed volume genuinely changes, never mid-iteration.
      if (needsBuild) set((s) => ({ fitVersion: s.fitVersion + 1 }))
    },

    resetParams: () => {
      const { params, code } = get()
      const paramValues: ParamValues = {}
      for (const p of params) paramValues[p.name] = p.defaultValue
      set({ paramValues })
      void compile(code, [])
      persist()
    },

    setCode: (code) => {
      set({ code })
    },

    recompile: () => {
      const { code, params: oldParams, paramValues: prev } = get()
      const params = parseParameters(code)
      const paramValues: ParamValues = {}
      for (const p of params) {
        // keep the user's slider value only when the code's written default is
        // unchanged — if the new code changed the default, the code wins
        // (prevents old same-named values hijacking freshly pasted programs)
        const old = oldParams.find((o) => o.name === p.name)
        let value = old && old.defaultValue === p.defaultValue ? (prev[p.name] ?? p.defaultValue) : p.defaultValue
        // the carried value must still be valid for the NEW parameter
        if (p.kind === 'enum' && p.options && !p.options.some((o) => String(o) === String(value))) value = p.defaultValue
        if (typeof value === 'number' && ((p.min !== undefined && value < p.min) || (p.max !== undefined && value > p.max))) value = p.defaultValue
        paramValues[p.name] = value
      }
      set({ params, paramValues })
      void compile(code, buildDefines(params, paramValues))
      persist()
    },

    restoreVersion: (msgId) => {
      const chat = activeChat()
      const idx = chat.findIndex((m) => m.id === msgId)
      if (idx === -1) return
      const target = chat[idx]
      if (target.code === undefined) return
      // Everything AFTER the restored message is a now-abandoned branch. Truncate it off
      // the lineage so the NEXT prompt's history ends on THIS version — the model continues
      // from the last code it's shown (see toApiMessages), so without this the rollback is
      // visual-only and the model keeps building on the newest version. Stash the dropped
      // tail (reversible via restoreNewer; cleared when a new prompt diverges the branch in
      // sendPrompt), mirroring vpPast/vpFuture. Prepend ahead of any existing stash so
      // successive rollbacks chain into one contiguous, chronological redo stack.
      const tail = chat.slice(idx + 1)
      if (tail.length === 0) return // already the tip — nothing to roll back
      setChatAndFuture(chat.slice(0, idx + 1), [...tail, ...activeFuture()])
      void adoptCode(target.code)
      persist()
    },

    restoreNewer: () => {
      const future = activeFuture()
      if (future.length === 0) return
      // re-attach the whole stashed tail and adopt its newest version; the user can then
      // roll back to any intermediate version again via its chip
      const newest = [...future].reverse().find((m) => m.code !== undefined)
      setChatAndFuture([...activeChat(), ...future], [])
      if (newest?.code !== undefined) void adoptCode(newest.code)
      persist()
    },

    loadExample: (example) => {
      clearParamTimer()
      const state = get()
      const current = state.projects.find((p) => p.id === state.activeId)
      const chat = [
        {
          id: newId(),
          createdAt: Date.now(),
          role: 'assistant' as const,
          text: `Loaded the built-in “${example.name}” example. Tweak it with the sliders, or describe a change and I'll rework the code.`,
          code: example.code,
        },
      ]
      // reuse the active project if it's still pristine, otherwise create one
      if (current && !current.code.trim() && current.chat.length === 0) {
        const projects = state.projects.map((p) =>
          p.id === current.id ? { ...p, name: example.name, code: example.code, chat, updatedAt: Date.now() } : p,
        )
        set({ projects, streamText: '' })
        saveProjects(projects)
      } else {
        if (state.activeId) snapshotSession(state.activeId) // cache the project we're leaving
        const project: Project = {
          id: newId(),
          name: example.name,
          code: example.code,
          paramValues: {},
          chat,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        const projects = [project, ...state.projects]
        set({
          projects,
          activeId: project.id,
          streamText: '',
          generating: false,
          streamHasCode: false,
          // drop the previous project's geometry so the example gets a fresh viewport + camera fit
          stl: null,
          meshTransform: null,
          vpPast: [],
          vpFuture: [],
          modelRemoved: false,
          compileStatus: 'idle',
        })
        saveProjects(projects)
        setChatHash(project.id)
        saveLastChatId(project.id)
      }
      void adoptCode(example.code)
    },

    setBed: (id) => {
      set({ bedId: id })
      localStorage.setItem(BED_KEY, id)
    },

    setCustomBed: (bed) => {
      set({ customBed: bed })
      localStorage.setItem(CUSTOM_BED_KEY, JSON.stringify(bed))
    },

    // viewport-placement slice (move/rotate/delete + undo/redo) lives in ./placementActions
    ...createPlacementActions(set, get, {
      clearParamTimer,
      // undo/redo restores the override map top-level; mirror it onto the project record too
      persistOverrides: (overrides) => persist({ pieceOverrides: overrides }),
    }),

    setOrcaMaterial: (m) => {
      set({ orcaMaterial: m })
      localStorage.setItem(ORCA_MATERIAL_KEY, m)
    },

    setQuality: (id) => {
      set({ quality: id })
      localStorage.setItem(QUALITY_KEY, id)
      const { code, params, paramValues } = get()
      if (code.trim()) void compile(code, buildDefines(params, paramValues))
    },

    setEngine: (id) => {
      set({ engine: id })
      localStorage.setItem(ENGINE_KEY, id)
    },

    setClaudeEffort: (id) => {
      set({ claudeEffort: id })
      localStorage.setItem(CLAUDE_EFFORT_KEY, id)
    },
    setClaudeModel: (id) => {
      set({ claudeModel: id })
      localStorage.setItem(CLAUDE_MODEL_KEY, id)
    },

    setKimiModel: (id) => {
      set({ kimiModel: id })
      localStorage.setItem(KIMI_MODEL_KEY, id)
    },

    exportAllToServer: async () => {
      try {
        const { exportAllProjectsToServer } = await import('../lib/storage')
        const { ok } = await exportAllProjectsToServer()
        useUi.getState().pushToast(`${ok} project${ok !== 1 ? 's' : ''} backed up to server`, 'info')
      } catch (e) {
        useUi.getState().pushToast(`Backup failed: ${e instanceof Error ? e.message : String(e)}`, 'error')
      }
    },

  }
})

// Keep the worker's foreground render lane synced with the active project across EVERY switch path
// (so the focused chat's interactive render always drains ahead of any background chat's). One
// subscription covers openProject/newProject/import/loadExample/init/delete without peppering calls.
let _lastForeground: string | null | undefined
useStore.subscribe((s) => {
  if (s.activeId !== _lastForeground) {
    _lastForeground = s.activeId
    openscad.setForeground(s.activeId)
  }
})

import { create } from 'zustand'
import type { BedSize, ChatMessage, CompileResult, ParamValue, ParamValues, Project, ScadParameter } from '../types'
import { PRINTER_BEDS, QUALITY_PRESETS, resolveBed } from '../types'
import { buildDefines, extractIntent, extractScadBlock, parseParameters, stripIntentLine } from '../lib/params'
import { clampStatedDimensions, dimDiscrepancies } from '../lib/refineProxy'
import { buildAutoFixPrompt, structuralReport } from '../lib/compileReport'
import { hasDebugContract, interferenceIssue } from '../lib/interferenceProxy'
import { ComputeBudget } from '../lib/openscad/budget'
import { scoreCandidate, pickBestIndex, BEST_OF_N_COUNT, type CandidateSignals } from '../lib/bestOfN'
import { useUi } from './ui'
import { openscad } from '../lib/openscad/client'
import { fetchHealth, streamGenerate, toApiMessages, historyBudgetTokens, imageBudgetFor, type HealthInfo, type SkillIssue } from '../lib/api'
import { hydrateStorage, loadLastChatId, loadProjects, newId, saveLastChatId, saveProjects } from '../lib/storage'
import { parseShareFile, shareFileToProject } from '../lib/shareFile'
import { loadSkillStats, saveSkillStats, recordUses, recordRemovals, type SkillStats } from '../lib/skillStats'
import { chatIdFromHash, setChatHash } from '../lib/hashRoute'
import { createExportActions } from './exportActions'

/** per-tab marker: present once a tab has loaded the app, so a RELOAD/return restores the last
 *  chat while a brand-new window/tab (empty sessionStorage) starts fresh. */
const SESSION_KEY = 'vibemesh.session.v1'
import { stlBBox, type StlBBox } from '../lib/stl'
import { detectKitIntent, degenerateReason } from '../lib/storeDecisions'
import type { Example } from '../lib/examples'

export type CompileStatus = 'idle' | 'compiling' | 'ok' | 'error'

/** snapshot of everything a viewport placement action (move/rotate/delete) can change */
interface VpSnapshot {
  stl: ArrayBuffer | null
  modelDims: StlBBox | null
  meshTransform: { position: [number, number, number]; rotation: [number, number, number] } | null
  compileStatus: CompileStatus
  compileError: string | null
  compileNote: string | null
  compileMs: number | null
  modelRemoved: boolean
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
  /** project id awaiting its one auto-refine pass (set when the first image-grounded
   *  model renders) → ChatPanel fires only when it matches the active project, so a
   *  lingering flag can never misfire on a different project */
  pendingAutoRefineFor: string | null
  consumeAutoRefine: () => void

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
  /** correct the applied-patterns chip: regenerate the current design with skill retrieval
   *  OVERRIDDEN by `skillIds` (selectSkills skipped for that turn). Advisory — never blocks. */
  regenerateWithSkills: (msgId: string, skillIds: string[]) => Promise<void>
  abortGeneration: () => void
  setParamValue: (name: string, value: ParamValue) => void
  /** select a multi-part piece (or 'all'): compiles immediately (no slider debounce) and
   *  re-fits the camera — a part switch is navigation, not a slider tweak */
  selectPart: (value: string) => Promise<void>
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
}

// legacy vibescad.* values are copied to these keys on startup (src/lib/storage.ts)
const ENGINE_KEY = 'vibemesh.engine.v1'
const CLAUDE_MODEL_KEY = 'vibemesh.claudeModel.v1'
const CLAUDE_EFFORT_KEY = 'vibemesh.claudeEffort.v1'
const KIMI_MODEL_KEY = 'vibemesh.kimiModel.v1'
const QUALITY_KEY = 'vibemesh.quality.v1'
const BED_KEY = 'vibemesh.bed.v1'
const CUSTOM_BED_KEY = 'vibemesh.customBed.v1'

function loadCustomBed(): BedSize | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_BED_KEY) ?? 'null') as BedSize | null
    if (parsed && [parsed.x, parsed.y, parsed.z].every((n) => Number.isFinite(n) && n > 0)) return parsed
  } catch {
    /* corrupt value — ignore */
  }
  return null
}

const vpSnapshotOf = (s: VibeState): VpSnapshot => ({
  stl: s.stl,
  modelDims: s.modelDims,
  meshTransform: s.meshTransform,
  compileStatus: s.compileStatus,
  compileError: s.compileError,
  compileNote: s.compileNote,
  compileMs: s.compileMs,
  modelRemoved: s.modelRemoved,
})

function sameTransform(a: VibeState['meshTransform'], b: VibeState['meshTransform']): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.position.every((v, i) => v === b.position[i]) && a.rotation.every((v, i) => v === b.rotation[i])
}

const VP_HISTORY_LIMIT = 30

// Render watchdogs (ms). Primary interactive renders use the client default; the
// Draft fallback gets a tight budget so a heavy model fails fast (primary+draft,
// not 90s+90s), while deliberate one-shot exports get extra headroom.
const RENDER_TIMEOUT_DRAFT = 20_000
const RENDER_TIMEOUT_EXPORT = 90_000
// Per-attempt anti-hang backstop for the AI stream. Deliberately a generous ABSOLUTE
// cap, NOT an idle-on-delta timer: thinking engines (claude-code/Opus) stream NO deltas
// for minutes during extended thinking, so a delta-reset idle timer would falsely abort
// them. This only catches a truly-stalled stream (dead connection / crashed server)
// without cutting a legitimately-slow generation; on fire it surfaces a recoverable
// error and does NOT auto-retry (a stalled engine usually stalls again).
const GEN_TIMEOUT = 1_200_000 // 20 min

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

let abortController: AbortController | null = null
let paramTimer: ReturnType<typeof setTimeout> | null = null
// how many auto-refine passes each project has fired — a complex reference needs
// more than one blind correction. Counter incremented when a pass STARTS
// (consumeAutoRefine), so an aborted pass doesn't burn budget. Tunable.
const MAX_AUTO_REFINE = 2 // total auto-refine passes per project (was a single pass)
const autoRefinePass = new Map<string, number>()
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

  /** Project-switch affordances are blocked mid-generation. runGeneration re-reads the active
   *  project after every await (the stream, adoptCode, persist, the auto-fix recursion), so a
   *  switch would land the streamed reply + adopted code on the NEWLY-active project, corrupting
   *  it and losing the original. Returns true (and nudges the user) when a switch must be refused. */
  function blockSwitchWhileGenerating(): boolean {
    if (!get().generating) return false
    useUi.getState().pushToast('Finish or stop the current generation before switching projects.')
    return true
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
    if (failed.length) set({ compileNote: `Slicer: ${failed.length} part(s) failed to render — ${failed.join(', ')}` })
  }

  async function compile(code: string, defines: string[]): Promise<CompileResult> {
    if (!code.trim()) {
      set({ compileStatus: 'idle', stl: null, modelDims: null, compileError: null, compileNote: null, degradedToDraft: false })
      return { ok: false, error: 'empty' }
    }
    // results landing after a project switch must not touch state (stale-render race)
    const projectAtStart = get().activeId
    const stale = () => get().activeId !== projectAtStart

    // a re-render replaces the geometry — placement history would restore stale meshes.
    // bump slicingToken so any in-flight compilePieces() abandons its now-stale pack rather
    // than racing this compile and clobbering the pieces:null invalidation below.
    set({ compileStatus: 'compiling', compileError: null, compileNote: null, degradedToDraft: false, vpPast: [], vpFuture: [], modelRemoved: false, pieces: null, slicerFailed: [], slicingToken: get().slicingToken + 1 })
    // adaptive curve quality: kill any global $fn, drive $fa/$fs from the preset.
    // Per-call $fn (hex sockets etc.) is untouched by these root-scope overrides.
    const preset = QUALITY_PRESETS.find((q) => q.id === get().quality) ?? QUALITY_PRESETS[1]
    let result: CompileResult = await openscad.compile(code, [...defines, ...qualityArgsFor(preset)])
    // superseded/stale → a sentinel the caller treats as "ignore" (no auto-repair)
    if (result.error === 'superseded' || stale()) return { ok: false, error: 'superseded' }

    // heavy-model fallback: a timeout at higher quality gets one retry at Draft
    let note: string | null = null
    if (!result.ok && result.error?.includes('timed out') && preset.id !== 'draft') {
      set({ compileStatus: 'compiling' })
      result = await openscad.compile(code, [...defines, ...qualityArgsFor(QUALITY_PRESETS[0])], RENDER_TIMEOUT_DRAFT)
      if (result.error === 'superseded' || stale()) return { ok: false, error: 'superseded' }
      if (result.ok) {
        note = `model too heavy for ${preset.label} — rendered at Draft`
      }
    }

    if (result.ok && result.stl) {
      set((s) => ({
        compileStatus: 'ok',
        stl: result.stl!,
        stlVersion: s.stlVersion + 1,
        // auto-fit the camera only when the viewport was empty — never yank the
        // user's framing mid-iteration (slider tweaks, refine passes)
        fitVersion: s.stl === null ? s.fitVersion + 1 : s.fitVersion,
        modelDims: stlBBox(result.stl!),
        meshTransform: null, // fresh geometry → reset viewport arrangement
        compileError: null,
        compileNote: note,
        degradedToDraft: note !== null,
        compileLog: result.log ?? null,
        compileMs: result.ms ?? null,
      }))
    } else {
      set({
        compileStatus: 'error',
        compileError: result.error ?? 'Unknown OpenSCAD error',
        compileNote: null,
        degradedToDraft: false,
        compileLog: result.log ?? null,
        compileMs: result.ms ?? null,
      })
    }
    return result
  }

  function activeChat(): ChatMessage[] {
    const { projects, activeId } = get()
    return projects.find((p) => p.id === activeId)?.chat ?? []
  }

  function setChat(chat: ChatMessage[]) {
    const { projects, activeId } = get()
    const updated = projects.map((p) => (p.id === activeId ? { ...p, chat, updatedAt: Date.now() } : p))
    set({ projects: updated })
    saveProjects(updated)
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
  function adoptCode(code: string, carryFrom?: { params: ScadParameter[]; values: ParamValues }): Promise<CompileResult> {
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
    set({ code, params, paramValues })
    return compile(code, buildDefines(params, paramValues))
  }

  /** automatic repair budget, SHARED across the contract-format retry and the
   *  render/degenerate/structural auto-fix so they can never stack unboundedly.
   *  Off for weak local engines. 2 lets a grounded second attempt land. */
  const MAX_AUTO_FIX = 2

  /** A2 — verifier-guided best-of-N. Fan out N generations, compile + score each on REFERENCE-FREE
   *  signals (compile-clean dominates, then degenerate, then structural/dim issue counts), and return
   *  the winner's reply text + skill report. Candidates stream SILENTLY (one status line, not N
   *  interleaved token streams); each compiles once through the bounded BACKGROUND queue under a
   *  shared per-request budget, so the N compiles can't blow the single worker's watchdog. */
  async function runBestOfN(
    engine: string,
    messages: ReturnType<typeof toApiMessages>,
    baseOpts: Omit<Parameters<typeof streamGenerate>[2], 'onDelta' | 'onSkillReport'>,
    ctx: { bed: { x: number; y: number; z: number }; stated: ReturnType<typeof clampStatedDimensions>['dimensions'] },
  ): Promise<{ full: string; skillReport: SkillIssue[]; appliedSkillIds: string[]; dropped: string[]; stopReason?: string }> {
    const n = BEST_OF_N_COUNT
    const reports = Array.from({ length: n }, () => ({ skillIds: [] as string[], dropped: [] as string[], report: [] as SkillIssue[] }))
    const stopReasons: (string | undefined)[] = Array.from({ length: n }, () => undefined)
    let done = 0
    set({ streamText: `Generating ${n} candidates, keeping the best…` })
    const fulls = await Promise.all(
      Array.from({ length: n }, (_, i) =>
        streamGenerate(engine, messages, { ...baseOpts, onDelta: () => {}, onSkillReport: (info) => { reports[i] = info }, onDone: (info) => { stopReasons[i] = info.stopReason } })
          .then((text) => { set({ streamText: `Generated ${++done}/${n} candidates…` }); return text })
          // A user Stop aborts every candidate's shared signal — let AbortError propagate (rejecting
          // Promise.all) so runGeneration's catch handles it as a Stop, instead of swallowing it to
          // '' which reads as a contract violation and silently restarts the whole generation.
          .catch((e) => { if (e instanceof DOMException && e.name === 'AbortError') throw e; return '' }),
      ),
    )
    const budget = new ComputeBudget({ wallMs: 60_000, maxRenders: n + 2 })
    const signals: CandidateSignals[] = []
    for (const text of fulls) {
      const { code, blockCount } = extractScadBlock(text)
      if (code === null || blockCount > 1) {
        signals.push({ hasScad: false, compileAttempted: false, compiled: false, degenerate: false, structuralIssues: 0, dimMismatches: 0 })
        continue
      }
      const params = parseParameters(code)
      const isMultiPart = params.some((p) => p.name === 'part' && p.kind === 'enum')
      let compileAttempted = false
      let compiled = false
      let degenerate = false
      let dimMismatches = 0
      if (budget.canSpend()) {
        compileAttempted = true
        // compile with the SAME root-scope quality defines the real render uses (Draft here — fast
        // enough that all N normally fit the budget), so a candidate that only fails under the
        // -D $fn=0 overrides is caught, not scored as if it compiled bare.
        const r = await openscad.compile(code, qualityArgsFor(QUALITY_PRESETS[0]), 30_000, { background: true })
        budget.spend()
        if (r.ok && r.stl) {
          compiled = true
          const dims = stlBBox(r.stl)
          degenerate = degenerateReason(dims, ctx.bed, !isMultiPart) !== null
          dimMismatches = ctx.stated.length ? dimDiscrepancies(dims, ctx.stated).length : 0
        }
      }
      signals.push({ hasScad: true, compileAttempted, compiled, degenerate, structuralIssues: structuralReport(code, params).issues.length, dimMismatches })
    }
    const best = pickBestIndex(signals.map(scoreCandidate))
    set({ streamText: '' })
    // carry the WINNING candidate's stop reason so a truncated winner is caught downstream
    // (same max_tokens handling as the single-stream path), not fed half a program to the parser
    return { full: fulls[best], skillReport: reports[best].report, appliedSkillIds: reports[best].skillIds, dropped: reports[best].dropped, stopReason: stopReasons[best] }
  }

  /** stream one assistant turn for the chat as it stands (shared by send + retry) */
  async function runGeneration(nameSource: { text: string; action?: string }, attempt = 0, opts: { skillIds?: string[] } = {}) {
    set({ generating: true, streamText: '', streamHasCode: false })
    abortController = new AbortController()
    const ctrl = abortController
    let genTimedOut = false
    let genTimer: ReturnType<typeof setTimeout> | undefined
    try {
      const engine = get().engine
      if (!engine) throw new Error('No AI engine is available — connect one (see the engine menu next to Send).')
      // bind history to the active engine's context window (token budget), not a fixed count
      const provider = get().health?.providers.find((p) => p.id === engine)
      const budgetTokens = historyBudgetTokens(provider, get().health?.systemTokens)
      const messages = toApiMessages(activeChat(), { budgetTokens, maxImages: imageBudgetFor(provider) })
      const bed = resolveBed(get().bedId, get().customBed)
      // anti-hang: abort a truly-stalled stream after GEN_TIMEOUT. Guards ONLY the
      // network stream and is cleared the instant it resolves, so it can never fire
      // during the downstream compile / auto-fix recursion (which awaits child runs).
      genTimer = setTimeout(() => { genTimedOut = true; ctrl.abort() }, GEN_TIMEOUT)
      // carry the PRIOR turn's intent forward so a follow-up that drops the mechanism
      // keyword ("make it bigger") still retrieves the same skill (server prefers its
      // domainTags over the regex). First turn → none → server-side selectSkills from prompt.
      const priorIntent = [...activeChat()].reverse().find((m) => m.role === 'assistant' && m.intent)?.intent
      // coarse first-turn source hint from the latest user turn's image roles (tiles →
      // multiview, ≥2 globals → multiobject); the model's own sourceType takes over after.
      const latestImgs = [...activeChat()].reverse().find((m) => m.role === 'user' && (m.images?.length ?? 0) > 0)?.images ?? []
      const sourceHint = latestImgs.some((im) => im.role === 'tile')
        ? ('multiview' as const)
        : latestImgs.filter((im) => (im.role ?? 'global') === 'global').length >= 2
          ? ('multiobject' as const)
          : undefined
      let skillReport: SkillIssue[] = []
      let appliedSkillIds: string[] = []
      let droppedSkillIds: string[] = []
      const isKit = detectKitIntent(nameSource.text)
      // opts.skillIds (from the applied-patterns chip's correction) OVERRIDES retrieval for this turn
      // — the server assembler injects exactly those fragments, no selectSkills.
      const baseOpts: Omit<Parameters<typeof streamGenerate>[2], 'onDelta' | 'onSkillReport'> = {
        signal: ctrl.signal,
        model: engine === 'claude-code' ? get().claudeModel : engine === 'kimi' ? get().kimiModel : undefined,
        effort: engine === 'claude-code' || engine === 'anthropic' ? get().claudeEffort : undefined,
        context: { bed: { x: bed.x, y: bed.y, z: bed.z, label: bed.label }, kit: isKit, intent: priorIntent, skillIds: opts.skillIds, sourceHint },
      }
      // A2 — verifier-guided best-of-N: only on the FIRST attempt of a hard request (kit or image),
      // only when the user opted in (off by default), never on local engines or auto-fix re-entries.
      // The winner feeds the SAME downstream below; OFF → the single-stream path is unchanged.
      const useBestOfN = attempt === 0 && useUi.getState().bestOfN && !engine.startsWith('local:') && (isKit || latestImgs.length > 0)
      let full: string
      let stopReason: string | undefined
      if (useBestOfN) {
        const stated = clampStatedDimensions(priorIntent?.statedDimensions).dimensions
        const winner = await runBestOfN(engine, messages, baseOpts, { bed: { x: bed.x, y: bed.y, z: bed.z }, stated })
        full = winner.full
        skillReport = winner.skillReport
        appliedSkillIds = winner.appliedSkillIds
        droppedSkillIds = winner.dropped
        stopReason = winner.stopReason
      } else {
        full = await streamGenerate(engine, messages, {
          ...baseOpts,
          onDelta: (delta) =>
            set((s) => ({
              streamText: s.streamText + delta,
              // flip-once: stop scanning the moment the first fence appears (|| short-circuits)
              streamHasCode: s.streamHasCode || (s.streamText + delta).includes('```'),
            })),
          onSkillReport: (info) => { skillReport = info.report; appliedSkillIds = info.skillIds; droppedSkillIds = info.dropped },
          onDone: (info) => { stopReason = info.stopReason },
        })
      }
      clearTimeout(genTimer)
      genTimer = undefined
      // A user Stop (or an aborted best-of-N fan-out) must not fall through into the contract
      // re-ask / adopt path below — that silently spawns a fresh generation. Bail quietly: the
      // finally clears `generating`, matching a Stop on the single-stream path.
      if (ctrl.signal.aborted) return
      const { code, prose: rawProse, blockCount } = extractScadBlock(full)
      // parse the advisory INTENT line, then strip it so the user sees clean PLAN prose
      const intent = extractIntent(rawProse)
      const prose = stripIntentLine(rawProse)

      // Output-length truncation: the engine hit its max-tokens ceiling, so the program is almost
      // certainly cut off mid-block. Surface a recoverable message instead of feeding half a program
      // into the contract re-ask / auto-fix spiral (most likely on the 4096-token local + Kimi paths).
      if (stopReason === 'max_tokens') {
        setChat([
          ...activeChat(),
          {
            id: newId(),
            role: 'assistant',
            text: (prose ? prose + '\n\n' : '') + 'The reply was cut off at the output-length limit, so the program is likely incomplete. Ask me to continue, or simplify the request (fewer parts / less detail).',
            error: true,
          },
        ])
        return
      }

      // Contract enforcement: the reply MUST contain exactly ONE scad block. On 0
      // or >1 blocks, ask once for a single complete program — Opus 4.8 asks more
      // often and a prose-only / multi-block reply adopts nothing useful. Shares
      // the auto-fix attempt budget so it can never stack, and is off for weak
      // local engines (which can't reliably honor the format anyway).
      const contractViolated = code === null || blockCount > 1
      if (contractViolated && attempt < MAX_AUTO_FIX && engine && !engine.startsWith('local:')) {
        setChat([...activeChat(), { id: newId(), role: 'assistant', text: prose || 'Returning the program again.' }])
        const nudge =
          code === null
            ? 'Your last reply contained no OpenSCAD code block. Reply again with exactly ONE ```scad fenced block containing the COMPLETE program, per the response format.'
            : 'Your last reply contained more than one code block. Reply again with exactly ONE ```scad fenced block containing the COMPLETE program (merge everything into a single program).'
        setChat([...activeChat(), { id: newId(), role: 'user', text: nudge, action: 'Fix format' }])
        await runGeneration({ text: nudge, action: 'Fix format' }, attempt + 1, opts)
        return
      }

      // Contract re-asks exhausted (or a local engine that can't honor the format):
      // surface a clear, recoverable message instead of silently showing prose with no
      // model. Both cloud engines have been seen to plan correctly but omit the block.
      if (code === null) {
        const tries = engine && !engine.startsWith('local:') ? ` after ${MAX_AUTO_FIX + 1} attempts` : ''
        setChat([
          ...activeChat(),
          {
            id: newId(),
            role: 'assistant',
            text: (prose ? prose + '\n\n' : '') + `I couldn't produce a single OpenSCAD code block${tries}. Try rephrasing or simplifying the request, or switch engines.`,
            error: true,
          },
        ])
        return
      }

      const isFirstModel = code !== null && !activeChat().some((m) => m.code)
      // advisory: surface the retrieved skills' mechanism check (verified-skill validators)
      // next to the model — never blocks, just flags printability issues the model slipped.
      // Kept off `text` so it does NOT re-enter the model's next-turn history.
      const skillNote = skillReport.length
        ? skillReport.flatMap((r) => r.issues).join('\n')
        : undefined
      const assistantMsg: ChatMessage = {
        id: newId(),
        role: 'assistant',
        text: prose || 'Here is the model.',
        code: code ?? undefined,
        skillNote,
        appliedSkillIds: appliedSkillIds.length ? appliedSkillIds : undefined,
        droppedSkillIds: droppedSkillIds.length ? droppedSkillIds : undefined,
        intent: intent ?? undefined,
      }
      setChat([...activeChat(), assistantMsg])
      // local skill-health signal: count this application (paired with chip removals below)
      if (appliedSkillIds.length) {
        const ns = recordUses(get().skillStats, appliedSkillIds)
        set({ skillStats: ns })
        saveSkillStats(ns)
      }
      // teach the loop once per project (UX-AUDIT F9): point at sliders / chat / export
      if (isFirstModel) {
        setChat([
          ...activeChat(),
          {
            id: newId(),
            role: 'assistant',
            text: 'Tip: fine-tune it with the sliders on the right, ask me for changes here, or use Export when it looks good.',
          },
        ])
      }
      if (code) {
        // carry the user's still-valid slider tweaks across the iteration
        const compileResult = await adoptCode(code, { params: get().params, values: get().paramValues })
        persist()
        // auto-name the project: prefer the user's words; for app-initiated
        // image-only sends use the AI's description instead of canned text
        const project = get().projects.find((p) => p.id === get().activeId)
        if (project && project.name === 'Untitled part') {
          const source = nameSource.action && prose ? prose : nameSource.text
          const name = source.replace(/\s+/g, ' ').trim()
          persist({ name: name.length > 42 ? name.slice(0, 39) + '…' : name || 'Untitled part' })
        }

        // ── Recovery loop. Repair not only hard render errors but clean-but-WRONG
        // renders (empty/NaN/tiny/over-bed) and structural assembly faults. Gated on
        // the ACTUAL compile result (not the racing compileStatus), capped by the
        // shared attempt budget, off for weak local engines. Off-bed single parts get
        // a deterministic drop-to-bed instead of spending an AI turn.
        const eng = get().engine
        const canRepair = attempt < MAX_AUTO_FIX && useUi.getState().autoRepair && !!eng && !eng.startsWith('local:')
        if (canRepair && !compileResult.ok && compileResult.error && compileResult.error !== 'superseded' && compileResult.error !== 'empty') {
          const fixText = buildAutoFixPrompt(compileResult.error)
          setChat([...activeChat(), { id: newId(), role: 'user', text: fixText, action: 'Auto-fix' }])
          await runGeneration({ text: fixText, action: 'Auto-fix' }, attempt + 1, opts)
        } else if (compileResult.ok) {
          const params = get().params
          const isMultiPart = params.some((p) => p.name === 'part' && p.kind === 'enum')
          // is the currently-rendered view the ASSEMBLED all-view of a kit (not a per-piece view, and
          // not deliberately exploded)? Then, like a single part, it should rest flat on the bed.
          const pv = get().paramValues
          const partParam = params.find((p) => p.name === 'part' && p.kind === 'enum')
          const explodeParam = params.find((p) => p.name === 'explode')
          const isAssembledAllView =
            isMultiPart &&
            (pv['part'] ?? partParam?.defaultValue) === 'all' &&
            !Number(explodeParam ? (pv['explode'] ?? explodeParam.defaultValue) : 0)
          const bed = resolveBed(get().bedId, get().customBed)
          const dims = get().modelDims
          const degenerate = degenerateReason(dims, bed, !isMultiPart)
          // assembly/mechanism faults = cheap client structural checks PLUS the retrieved
          // skills' validators (server-side, received via skillReport). The advisory
          // skillNote already shows them; here they also drive a BOUNDED auto-fix (gated on
          // the autoRepair toggle + the shared MAX_AUTO_FIX budget, so it can't loop).
          const assembly = [...structuralReport(code, params).issues, ...skillReport.flatMap((r) => r.issues)]
          // C1 — runtime interference proxy: a cutter slicing protected structure (a bore through a
          // clutch tube, a pocket into a bearing seat) is invisible to compile/dim/IoU but caught here
          // by rendering the hidden _debug probe (positives vs negatives) and measuring their overlap.
          // The signal is REFERENCE-FREE, so it drives the SAME bounded auto-fix turn as the structural
          // checks. Gated on canRepair + the probe contract so the two extra probe renders only run for
          // a kit that can act on the result; a superseded/failed probe yields null → no false issue.
          if (canRepair && hasDebugContract(code)) {
            // shared per-generation ceiling so the probe renders (and future best-of-N) degrade
            // gracefully instead of compounding latency through the single-flight worker.
            const budget = new ComputeBudget({ wallMs: 30_000, maxRenders: 4 })
            const interference = await interferenceIssue(code, budget)
            if (interference) assembly.push(interference)
          }
          if (canRepair && (degenerate || assembly.length)) {
            const parts: string[] = []
            if (degenerate) parts.push(`The program rendered but the result is not usable: ${degenerate}. Return a corrected complete program with sensible millimeter dimensions.`)
            if (assembly.length)
              parts.push(`${degenerate ? 'Also fix' : 'Fix'} these assembly/mechanism problems, then return the corrected complete program:\n${assembly.map((i) => `- ${i}`).join('\n')}`)
            const fixText = parts.join('\n\n')
            setChat([...activeChat(), { id: newId(), role: 'user', text: fixText, action: 'Auto-fix' }])
            await runGeneration({ text: fixText, action: 'Auto-fix' }, attempt + 1, opts)
          } else if (!isMultiPart && dims && Math.abs(dims.minZ) > 0.5) {
            // off-bed single part → deterministic drop-to-bed (no AI turn). The export
            // bakes meshTransform, so the exported/printed part sits flat on z=0. This also
            // catches the case where the auto-fix budget is exhausted with assembly/skill
            // issues still unfixed — the part still gets dropped onto the bed.
            get().setMeshTransform({ position: [0, 0, -dims.minZ], rotation: [0, 0, 0] })
            set({ compileNote: `Part rendered ${dims.minZ < 0 ? 'below' : 'above'} the bed — dropped onto z=0 for export.` })
          } else if (isAssembledAllView && dims && Math.abs(dims.minZ) > 0.5) {
            // assembled kit preview sunk below / floating above the bed → drop onto z=0 so the all-view
            // reads as sitting on the plate and a single-STL export of it prints flat. A per-piece view
            // recompiles (meshTransform resets to null), and a deliberate explode (>0) is never fought.
            get().setMeshTransform({ position: [0, 0, -dims.minZ], rotation: [0, 0, 0] })
            set({ compileNote: `Assembly rendered ${dims.minZ < 0 ? 'below' : 'above'} the bed — dropped onto z=0 for preview/export.` })
          }
        }

        // Auto-fire BOUNDED refine passes after an image-grounded model renders —
        // the refine loop is the main accuracy mechanism but is opt-in/undiscoverable.
        // Re-arms after the FIRST model AND after each refine result (action 'Refine
        // pass'), up to MAX_AUTO_REFINE passes — but NOT on 'Auto-fix'/'Fix format'
        // re-entries (those carry code so isFirstModel is false and their action
        // differs), so error-repair turns never burn a refine pass. ChatPanel consumes
        // the flag once the canvas has painted; consumeAutoRefine increments the count.
        if (compileResult.ok && (isFirstModel || nameSource.action === 'Refine pass')) {
          const triggerImages = [...activeChat()].reverse().find((m) => m.role === 'user')?.images
          const provider = get().health?.providers.find((p) => p.id === eng)
          const aid = get().activeId
          // proxy-gated convergence: when the model read off stated dimensions, auto-refine ONLY
          // while the model-INDEPENDENT dimension check still flags a mismatch — stop the moment the
          // render matches the read-off dims (don't burn fixed passes). No stated dims → the proxy
          // has nothing to check, so keep the visual-fidelity refine.
          const stated = clampStatedDimensions(intent?.statedDimensions).dimensions
          const proxyWantsRefine = stated.length === 0 || dimDiscrepancies(get().modelDims, stated).length > 0
          if (
            triggerImages?.length &&
            provider?.vision &&
            !!eng &&
            !eng.startsWith('local:') &&
            useUi.getState().autoRepair &&
            aid &&
            proxyWantsRefine &&
            (autoRefinePass.get(aid) ?? 0) < MAX_AUTO_REFINE
          ) {
            set({ pendingAutoRefineFor: aid })
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Distinguish a timeout-abort from a user Stop: the timeout surfaces a
        // recoverable error; a user Stop stays silent.
        if (genTimedOut) {
          setChat([
            ...activeChat(),
            {
              id: newId(),
              role: 'assistant',
              text: `Generation timed out after ${Math.round(GEN_TIMEOUT / 60000)} min — the engine may be overloaded or unreachable. Try again, or switch to a faster engine / lower effort.`,
              error: true,
            },
          ])
        }
      } else {
        const message = err instanceof Error ? err.message : String(err)
        setChat([...activeChat(), { id: newId(), role: 'assistant', text: message, error: true }])
      }
    } finally {
      if (genTimer) clearTimeout(genTimer)
      abortController = null
      set({ generating: false, streamText: '', streamHasCode: false })
    }
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
    generating: false,
    streamText: '',
    streamHasCode: false,
    pendingAutoRefineFor: null,
    bedId: localStorage.getItem(BED_KEY) ?? PRINTER_BEDS[0].id,
    customBed: loadCustomBed(),
    quality: localStorage.getItem(QUALITY_KEY) ?? 'standard',
    exportingPlates: false,
    modelRemoved: false,
    vpPast: [],
    vpFuture: [],

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
      await get().refreshHealth()
    },

    refreshHealth: async (providers) => {
      const health = providers ? { ok: true, providers } : await fetchHealth()
      let engine: string | null = null
      if (health) {
        const saved = get().engine ?? localStorage.getItem(ENGINE_KEY)
        const available = health.providers.filter((p) => p.available)
        engine = available.find((p) => p.id === saved)?.id ?? available[0]?.id ?? null
      }
      set({ health, engine, healthLoaded: true })
    },

    newProject: () => {
      if (blockSwitchWhileGenerating()) return
      clearParamTimer()
      // Reuse an existing pristine empty chat rather than minting a duplicate (the header
      // "New chat" button + the bare-hash handler both call this; init() reuses the same way).
      const existing = get().projects.find((p) => !p.code.trim() && p.chat.length === 0)
      if (existing) {
        set({
          activeId: existing.id, code: '', params: [], paramValues: {}, stl: null, meshTransform: null,
          vpPast: [], vpFuture: [], modelRemoved: false, compileStatus: 'idle', compileError: null,
          streamText: '', viewMode: 'single', pieces: null, slicing: false,
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
        viewMode: 'single',
        pieces: null,
        slicing: false,
      })
      saveProjects(projects)
      setChatHash(project.id)
      saveLastChatId(project.id)
    },

    openProject: (id) => {
      if (blockSwitchWhileGenerating()) return
      const project = get().projects.find((p) => p.id === id)
      if (!project) return
      clearParamTimer()
      set({ activeId: id, stl: null, meshTransform: null, vpPast: [], vpFuture: [], modelRemoved: false, compileStatus: 'idle', compileError: null, streamText: '', viewMode: 'single', pieces: null, slicing: false })
      // transient per-model interaction modes live in the UI store — clear them so a
      // selection / measuring session doesn't bleed into the next project
      const ui = useUi.getState()
      ui.setSelected(false)
      ui.setMeasureMode(false)
      setChatHash(id)
      saveLastChatId(id)
      const params = parseParameters(project.code)
      const paramValues = { ...Object.fromEntries(params.map((p) => [p.name, p.defaultValue])), ...project.paramValues }
      set({ code: project.code, params, paramValues })
      if (project.code.trim()) void compile(project.code, buildDefines(params, paramValues))
    },

    // export slice (exportPlates / exportPlates3mf / export3mf / exportStlSmart / exportShareFile)
    // lives in ./exportActions — leaf actions, split out of this god-store (shared helpers passed in).
    ...createExportActions(set, get, { qualityArgsFor, exportQuality, composeMatrix, RENDER_TIMEOUT_EXPORT, RENDER_TIMEOUT_DRAFT }),

    importShareFile: (text) => {
      if (blockSwitchWhileGenerating()) return
      const file = parseShareFile(text)
      if (!file) {
        useUi.getState().pushToast("That file isn't a valid .vibemesh share file.", 'error')
        return
      }
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
      if (blockSwitchWhileGenerating()) return
      const projects = get().projects.filter((p) => p.id !== id)
      set({ projects })
      saveProjects(projects)
      if (get().activeId === id) {
        clearParamTimer()
        set({ activeId: null, code: '', params: [], paramValues: {}, stl: null, meshTransform: null, vpPast: [], vpFuture: [], modelRemoved: false, compileStatus: 'idle', viewMode: 'single', pieces: null, slicing: false })
        setChatHash(null, { replace: true })
        saveLastChatId(null)
      }
    },

    renameProject: (name) => {
      persist({ name })
    },

    sendPrompt: async (text, images, action) => {
      const state = get()
      if (state.generating) return
      if (!state.activeId) {
        get().newProject()
      }
      const userMsg: ChatMessage = { id: newId(), role: 'user', text, images, action }
      // a new prompt commits to the current (possibly rolled-back) version: the stashed
      // tail is now a genuinely abandoned branch, so clear the redo stack as we append.
      setChatAndFuture([...activeChat(), userMsg], [])
      await runGeneration({ text, action })
    },

    retryLast: async () => {
      if (get().generating) return
      const chat = activeChat()
      // drop trailing FAILED assistant replies only — successful versions stay restorable
      let end = chat.length
      while (end > 0 && chat[end - 1].role === 'assistant' && chat[end - 1].error) end--
      if (end === 0 || chat[end - 1].role !== 'user') return
      const lastUser = chat[end - 1]
      setChat(chat.slice(0, end))
      await runGeneration({ text: lastUser.text, action: lastUser.action })
    },

    regenerateWithSkills: async (msgId, skillIds) => {
      if (get().generating) return
      // health signal: skills the user just REMOVED from this message's chip are a wrong-fit vote
      const edited = activeChat().find((m) => m.id === msgId)
      const removed = (edited?.appliedSkillIds ?? []).filter((id) => !skillIds.includes(id))
      if (removed.length) {
        const ns = recordRemovals(get().skillStats, removed)
        set({ skillStats: ns })
        saveSkillStats(ns)
      }
      const labels = skillIds.length ? skillIds.join(', ') : null
      const text = labels
        ? `Regenerate the current model using exactly these mechanism patterns: ${labels}. Keep the design otherwise the same.`
        : `Regenerate the current model with NO mechanism-skill patterns. Keep the design otherwise the same.`
      // a marker user turn (chip shows an 'Adjust patterns' tag), then generate with the
      // corrected skillIds OVERRIDING retrieval for this turn. Shares the generating guard +
      // abortController via runGeneration; the new version carries the corrected appliedSkillIds.
      setChatAndFuture([...activeChat(), { id: newId(), role: 'user', text, action: 'Adjust patterns' }], [])
      await runGeneration({ text, action: 'Adjust patterns' }, 0, { skillIds })
    },

    abortGeneration: () => {
      abortController?.abort()
    },

    consumeAutoRefine: () => {
      // count the pass at START (here), not when the guard armed it: aborting BEFORE
      // the timer fires (Stop / project switch) clears the timer and never reaches
      // here, so it doesn't burn budget. (A pass whose compile is later superseded
      // mid-flight does consume its slot — that's the loop's termination guarantee.)
      const aid = get().pendingAutoRefineFor
      if (aid) autoRefinePass.set(aid, (autoRefinePass.get(aid) ?? 0) + 1)
      set({ pendingAutoRefineFor: null })
    },

    setParamValue: (name, value) => {
      const paramValues = { ...get().paramValues, [name]: value }
      set({ paramValues })
      clearParamTimer()
      paramTimer = setTimeout(() => {
        paramTimer = null
        const { code, params, paramValues: values } = get()
        void compile(code, buildDefines(params, values))
        persist()
      }, 350)
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
      adoptCode(target.code)
      persist()
    },

    restoreNewer: () => {
      const future = activeFuture()
      if (future.length === 0) return
      // re-attach the whole stashed tail and adopt its newest version; the user can then
      // roll back to any intermediate version again via its chip
      const newest = [...future].reverse().find((m) => m.code !== undefined)
      setChatAndFuture([...activeChat(), ...future], [])
      if (newest?.code !== undefined) adoptCode(newest.code)
      persist()
    },

    loadExample: (example) => {
      if (blockSwitchWhileGenerating()) return
      clearParamTimer()
      const state = get()
      const current = state.projects.find((p) => p.id === state.activeId)
      const chat = [
        {
          id: newId(),
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
      adoptCode(example.code)
    },

    setBed: (id) => {
      set({ bedId: id })
      localStorage.setItem(BED_KEY, id)
    },

    setCustomBed: (bed) => {
      set({ customBed: bed })
      localStorage.setItem(CUSTOM_BED_KEY, JSON.stringify(bed))
    },

    setMeshTransform: (meshTransform) => {
      const s = get()
      if (sameTransform(s.meshTransform, meshTransform)) return
      set({
        vpPast: [...s.vpPast.slice(-(VP_HISTORY_LIMIT - 1)), vpSnapshotOf(s)],
        vpFuture: [],
        meshTransform,
      })
    },

    clearModel: () => {
      clearParamTimer() // don't let a pending slider render resurrect the model after Remove
      const s = get()
      set({
        vpPast: [...s.vpPast.slice(-(VP_HISTORY_LIMIT - 1)), vpSnapshotOf(s)],
        vpFuture: [],
        stl: null,
        modelDims: null,
        meshTransform: null,
        compileStatus: 'idle',
        compileError: null,
        compileNote: null,
        modelRemoved: true,
      })
    },

    vpUndo: () => {
      const s = get()
      const prev = s.vpPast[s.vpPast.length - 1]
      if (!prev) return
      set({ vpPast: s.vpPast.slice(0, -1), vpFuture: [...s.vpFuture, vpSnapshotOf(s)], ...prev })
    },

    vpRedo: () => {
      const s = get()
      const next = s.vpFuture[s.vpFuture.length - 1]
      if (!next) return
      set({ vpFuture: s.vpFuture.slice(0, -1), vpPast: [...s.vpPast, vpSnapshotOf(s)], ...next })
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

  }
})

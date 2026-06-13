import { create } from 'zustand'
import type { BedSize, ChatMessage, CompileResult, ParamValue, ParamValues, Project, ScadParameter } from '../types'
import { PRINTER_BEDS, QUALITY_PRESETS, resolveBed } from '../types'
import { buildDefines, extractScadBlock, parseParameters } from '../lib/params'
import { openscad } from '../lib/openscad/client'
import { fetchHealth, streamGenerate, toApiMessages, type HealthInfo } from '../lib/api'
import { loadActiveProjectId, loadProjects, newId, saveActiveProjectId, saveProjects } from '../lib/storage'
import { downloadBlob, stlBBox, transformStl, type StlBBox } from '../lib/stl'
import { buildThreeMF } from '../lib/threeMF'
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

interface VibeState {
  projects: Project[]
  activeId: string | null
  health: HealthInfo | null
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
  /** measured bounding box of the last successful render */
  modelDims: StlBBox | null
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

  generating: boolean
  streamText: string

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
  abortGeneration: () => void
  setParamValue: (name: string, value: ParamValue) => void
  resetParams: () => void
  setCode: (code: string) => void
  recompile: () => void
  /** adopt a previous version's code (rollback from a chat message) */
  restoreCode: (code: string) => void
  loadExample: (example: Example) => void
  setBed: (id: string) => void
  setQuality: (id: string) => void
  setEngine: (id: string) => void
  exportingPlates: boolean
  exportPlates: (fileBase: string) => Promise<void>
  /** export the current model's STL, offering a quality upgrade when preview was draft/degraded */
  exportStlSmart: (fileBase: string) => Promise<void>
  /** export one .3mf with every part as a named object (slicer-ready plate) */
  export3mf: (fileBase: string) => Promise<void>
  claudeModel: string
  setClaudeModel: (id: string) => void
  refreshHealth: (providers?: HealthInfo['providers']) => Promise<void>
}

// legacy vibescad.* values are copied to these keys on startup (src/lib/storage.ts)
const ENGINE_KEY = 'vibemesh.engine.v1'
const CLAUDE_MODEL_KEY = 'vibemesh.claudeModel.v1'
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

  async function compile(code: string, defines: string[]) {
    if (!code.trim()) {
      set({ compileStatus: 'idle', stl: null, modelDims: null, compileError: null, compileNote: null })
      return
    }
    // results landing after a project switch must not touch state (stale-render race)
    const projectAtStart = get().activeId
    const stale = () => get().activeId !== projectAtStart

    // a re-render replaces the geometry — placement history would restore stale meshes
    set({ compileStatus: 'compiling', compileError: null, compileNote: null, vpPast: [], vpFuture: [], modelRemoved: false })
    // adaptive curve quality: kill any global $fn, drive $fa/$fs from the preset.
    // Per-call $fn (hex sockets etc.) is untouched by these root-scope overrides.
    const preset = QUALITY_PRESETS.find((q) => q.id === get().quality) ?? QUALITY_PRESETS[1]
    let result: CompileResult = await openscad.compile(code, [...defines, ...qualityArgsFor(preset)])
    if (result.error === 'superseded' || stale()) return

    // heavy-model fallback: a timeout at higher quality gets one retry at Draft
    let note: string | null = null
    if (!result.ok && result.error?.includes('timed out') && preset.id !== 'draft') {
      set({ compileStatus: 'compiling' })
      result = await openscad.compile(code, [...defines, ...qualityArgsFor(QUALITY_PRESETS[0])])
      if (result.error === 'superseded' || stale()) return
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
        compileLog: result.log ?? null,
        compileMs: result.ms ?? null,
      }))
    } else {
      set({
        compileStatus: 'error',
        compileError: result.error ?? 'Unknown OpenSCAD error',
        compileNote: null,
        compileLog: result.log ?? null,
        compileMs: result.ms ?? null,
      })
    }
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

  function adoptCode(code: string) {
    const params = parseParameters(code)
    const paramValues: ParamValues = {}
    for (const p of params) paramValues[p.name] = p.defaultValue
    set({ code, params, paramValues })
    void compile(code, [])
  }

  /** stream one assistant turn for the chat as it stands (shared by send + retry) */
  async function runGeneration(nameSource: { text: string; action?: string }) {
    set({ generating: true, streamText: '' })
    abortController = new AbortController()
    try {
      const engine = get().engine
      if (!engine) throw new Error('No AI engine is available — connect one (see the engine menu next to Send).')
      const messages = toApiMessages(activeChat())
      const bed = resolveBed(get().bedId, get().customBed)
      const full = await streamGenerate(engine, messages, {
        onDelta: (delta) => set((s) => ({ streamText: s.streamText + delta })),
        signal: abortController.signal,
        model: engine === 'claude-code' ? get().claudeModel : undefined,
        context: { bed: { x: bed.x, y: bed.y, z: bed.z, label: bed.label } },
      })
      const { code, prose } = extractScadBlock(full)
      const isFirstModel = code !== null && !activeChat().some((m) => m.code)
      const assistantMsg: ChatMessage = {
        id: newId(),
        role: 'assistant',
        text: prose || 'Here is the model.',
        code: code ?? undefined,
      }
      setChat([...activeChat(), assistantMsg])
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
        adoptCode(code)
        persist()
        // auto-name the project: prefer the user's words; for app-initiated
        // image-only sends use the AI's description instead of canned text
        const project = get().projects.find((p) => p.id === get().activeId)
        if (project && project.name === 'Untitled part') {
          const source = nameSource.action && prose ? prose : nameSource.text
          const name = source.replace(/\s+/g, ' ').trim()
          persist({ name: name.length > 42 ? name.slice(0, 39) + '…' : name || 'Untitled part' })
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        const message = err instanceof Error ? err.message : String(err)
        setChat([...activeChat(), { id: newId(), role: 'assistant', text: message, error: true }])
      }
    } finally {
      abortController = null
      set({ generating: false, streamText: '' })
    }
  }

  return {
    projects: [],
    activeId: null,
    health: null,
    engine: null,
    claudeModel: localStorage.getItem(CLAUDE_MODEL_KEY) ?? 'default',
    code: '',
    params: [],
    paramValues: {},
    compileStatus: 'idle',
    compileError: null,
    compileLog: null,
    compileMs: null,
    compileNote: null,
    modelDims: null,
    meshTransform: null,
    stl: null,
    stlVersion: 0,
    fitVersion: 0,
    generating: false,
    streamText: '',
    bedId: localStorage.getItem(BED_KEY) ?? PRINTER_BEDS[0].id,
    customBed: loadCustomBed(),
    quality: localStorage.getItem(QUALITY_KEY) ?? 'standard',
    exportingPlates: false,
    modelRemoved: false,
    vpPast: [],
    vpFuture: [],

    init: async () => {
      const projects = loadProjects()
      const savedActive = loadActiveProjectId()
      const active = projects.find((p) => p.id === savedActive) ?? null
      set({ projects, activeId: active?.id ?? null })
      if (active) {
        const params = parseParameters(active.code)
        const paramValues = { ...Object.fromEntries(params.map((p) => [p.name, p.defaultValue])), ...active.paramValues }
        set({ code: active.code, params, paramValues })
        if (active.code.trim()) void compile(active.code, buildDefines(params, paramValues))
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
      set({ health, engine })
    },

    newProject: () => {
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
      })
      saveProjects(projects)
      saveActiveProjectId(project.id)
    },

    openProject: (id) => {
      const project = get().projects.find((p) => p.id === id)
      if (!project) return
      set({ activeId: id, stl: null, meshTransform: null, vpPast: [], vpFuture: [], modelRemoved: false, compileStatus: 'idle', compileError: null, streamText: '' })
      saveActiveProjectId(id)
      const params = parseParameters(project.code)
      const paramValues = { ...Object.fromEntries(params.map((p) => [p.name, p.defaultValue])), ...project.paramValues }
      set({ code: project.code, params, paramValues })
      if (project.code.trim()) void compile(project.code, buildDefines(params, paramValues))
    },

    deleteProject: (id) => {
      const projects = get().projects.filter((p) => p.id !== id)
      set({ projects })
      saveProjects(projects)
      if (get().activeId === id) {
        set({ activeId: null, code: '', params: [], paramValues: {}, stl: null, meshTransform: null, vpPast: [], vpFuture: [], modelRemoved: false, compileStatus: 'idle' })
        saveActiveProjectId(null)
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
      setChat([...activeChat(), userMsg])
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

    abortGeneration: () => {
      abortController?.abort()
    },

    setParamValue: (name, value) => {
      const paramValues = { ...get().paramValues, [name]: value }
      set({ paramValues })
      if (paramTimer) clearTimeout(paramTimer)
      paramTimer = setTimeout(() => {
        const { code, params, paramValues: values } = get()
        void compile(code, buildDefines(params, values))
        persist()
      }, 350)
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

    restoreCode: (code) => {
      adoptCode(code)
      persist()
    },

    loadExample: (example) => {
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
        saveActiveProjectId(project.id)
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

    setClaudeModel: (id) => {
      set({ claudeModel: id })
      localStorage.setItem(CLAUDE_MODEL_KEY, id)
    },

    /** Compile and download every piece of a multi-part design (`part` enum). */
    exportPlates: async (fileBase) => {
      const { code, params, paramValues, quality } = get()
      const partParam = params.find((p) => p.name === 'part' && p.kind === 'enum')
      if (!partParam || get().exportingPlates) return
      const preset = QUALITY_PRESETS.find((q) => q.id === quality) ?? QUALITY_PRESETS[1]
      const pieces = (partParam.options ?? []).map(String).filter((o) => o !== 'all')
      set({ exportingPlates: true })
      const failed: string[] = []
      const degraded: string[] = []
      try {
        for (const piece of pieces) {
          const defines = buildDefines(params, { ...paramValues, part: piece })
          let result = await openscad.compile(code, [...defines, ...qualityArgsFor(preset)])
          // same heavy-model fallback the viewport gets: retry timeouts at Draft
          if (!result.ok && result.error?.includes('timed out') && preset.id !== 'draft') {
            result = await openscad.compile(code, [...defines, ...qualityArgsFor(QUALITY_PRESETS[0])])
            if (result.ok) degraded.push(piece)
          }
          if (result.ok && result.stl) {
            downloadBlob(result.stl, `${fileBase}-${piece}.stl`, 'model/stl')
          } else {
            failed.push(piece)
          }
        }
      } finally {
        set({ exportingPlates: false })
      }
      // never let a partial export look successful
      if (failed.length > 0) {
        set({ compileNote: `EXPORT INCOMPLETE — failed: ${failed.join(', ')} (${pieces.length - failed.length}/${pieces.length} downloaded)` })
        alert(`Export incomplete!\n\nFailed parts: ${failed.join(', ')}\nDownloaded: ${pieces.length - failed.length} of ${pieces.length}.\n\nSelect the failed part in the viewport to see its error, or use Ask AI to Fix.`)
      } else if (degraded.length > 0) {
        set({ compileNote: `parts ${degraded.join(', ')} were too heavy for ${preset.label} — exported at Draft` })
      }
    },

    export3mf: async (fileBase) => {
      const { code, params, paramValues, quality, stl, meshTransform } = get()
      if (get().exportingPlates) return
      const preset = QUALITY_PRESETS.find((q) => q.id === quality) ?? QUALITY_PRESETS[1]
      const partParam = params.find((p) => p.name === 'part' && p.kind === 'enum')

      // single-piece design: package the current geometry (with viewport placement baked)
      if (!partParam) {
        if (!stl) return
        const buffer = meshTransform ? transformStl(stl, composeMatrix(meshTransform.position, meshTransform.rotation)) : stl
        downloadBlob(buildThreeMF([{ name: fileBase, stl: buffer }]), `${fileBase}.3mf`, 'model/3mf')
        return
      }

      const pieces = (partParam.options ?? []).map(String).filter((o) => o !== 'all')
      set({ exportingPlates: true })
      const collected: Array<{ name: string; stl: ArrayBuffer }> = []
      const failed: string[] = []
      const degraded: string[] = []
      try {
        for (const piece of pieces) {
          const defines = buildDefines(params, { ...paramValues, part: piece })
          let result = await openscad.compile(code, [...defines, ...qualityArgsFor(preset)])
          if (!result.ok && result.error?.includes('timed out') && preset.id !== 'draft') {
            result = await openscad.compile(code, [...defines, ...qualityArgsFor(QUALITY_PRESETS[0])])
            if (result.ok) degraded.push(piece)
          }
          if (result.ok && result.stl) collected.push({ name: piece, stl: result.stl })
          else failed.push(piece)
        }
      } finally {
        set({ exportingPlates: false })
      }
      if (failed.length > 0) {
        set({ compileNote: `3MF INCOMPLETE — failed: ${failed.join(', ')}` })
        alert(`3MF export incomplete!\n\nFailed parts: ${failed.join(', ')}\nIncluded: ${collected.map((c) => c.name).join(', ') || 'none'}.\n\nSelect the failed part in the viewport to see its error.`)
        if (collected.length === 0) return
      } else if (degraded.length > 0) {
        set({ compileNote: `parts ${degraded.join(', ')} were too heavy for ${preset.label} — exported at Draft` })
      }
      downloadBlob(buildThreeMF(collected), `${fileBase}.3mf`, 'model/3mf')
    },

    exportStlSmart: async (fileBase) => {
      const { stl, quality, compileNote, code, params, paramValues, meshTransform } = get()
      if (!stl) return
      // bake any viewport move/rotate into the export so WYSIWYG holds
      const bake = (buffer: ArrayBuffer): ArrayBuffer => {
        const t = get().meshTransform
        if (!t) return buffer
        return transformStl(buffer, composeMatrix(t.position, t.rotation))
      }
      const fine = QUALITY_PRESETS.find((q) => q.id === 'fine')!
      const degraded = quality === 'draft' || Boolean(compileNote?.includes('Draft'))
      if (degraded && fine) {
        const upgrade = confirm(
          'The preview was rendered at Draft quality — curves will look faceted when printed.\n\nOK: re-render at Fine quality for export (may take a while)\nCancel: export the Draft-quality STL as-is',
        )
        if (upgrade) {
          const defines = buildDefines(params, paramValues)
          const result = await openscad.compile(code, [...defines, ...qualityArgsFor(fine)])
          if (result.ok && result.stl) {
            downloadBlob(bake(result.stl), `${fileBase}.stl`, 'model/stl')
            return
          }
          alert('Fine-quality render failed (model too heavy) — exporting the preview STL instead.')
        }
      }
      void meshTransform
      downloadBlob(bake(stl), `${fileBase}.stl`, 'model/stl')
    },
  }
})

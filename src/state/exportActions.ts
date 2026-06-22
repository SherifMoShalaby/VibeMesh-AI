import type { StoreApi } from 'zustand'
import type { VibeState } from './store'
import { resolveBed, QUALITY_PRESETS } from '../types'
import { buildDefines } from '../lib/params'
import { openscad } from '../lib/openscad/client'
import { downloadBlob, stlBBox, transformStl, type StlBBox } from '../lib/stl'
import { buildThreeMF } from '../lib/threeMF'
import { buildOrcaProject } from '../lib/orcaProject'
import { packPlates } from '../lib/packPlates'
import { buildShareFile, serializeShareFile } from '../lib/shareFile'
import { useUi } from './ui'

/** Shared store helpers the export methods need — passed in (not re-derived) so the compile /
 *  generation core they also belong to stays untouched in store.ts. */
export interface ExportHelpers {
  qualityArgsFor: (preset: (typeof QUALITY_PRESETS)[number]) => string[]
  exportQuality: () => (typeof QUALITY_PRESETS)[number]
  composeMatrix: (p: [number, number, number], r: [number, number, number]) => number[]
  RENDER_TIMEOUT_EXPORT: number
  RENDER_TIMEOUT_DRAFT: number
}

type ExportActions = Pick<VibeState, 'exportPlates' | 'exportPlates3mf' | 'export3mf' | 'exportOrcaProject' | 'exportStlSmart' | 'exportShareFile'>

/**
 * The export slice of the store, extracted from store.ts (god-module split). These are LEAF actions —
 * the UI calls them; the compile/generation core never calls back into them — so they move out
 * cleanly. Logic is byte-identical to the inline versions; only the shared helpers are now passed in
 * via `h`. (importShareFile stays in the store — it's a project-creation action, not an export.)
 */
export function createExportActions(set: StoreApi<VibeState>['setState'], get: StoreApi<VibeState>['getState'], h: ExportHelpers): ExportActions {
  return {
    exportShareFile: (fileBase) => {
      const { code, paramValues, activeId, projects } = get()
      if (!code.trim()) {
        useUi.getState().pushToast('Nothing to share yet — generate a model first.')
        return
      }
      // the latest code-bearing assistant turn carries this version's intent + applied skills
      const chat = projects.find((p) => p.id === activeId)?.chat ?? []
      const last = [...chat].reverse().find((m) => m.role === 'assistant' && m.code)
      const name = projects.find((p) => p.id === activeId)?.name ?? fileBase
      // best-effort thumbnail: downscale the (preserveDrawingBuffer) viewport canvas to keep it small
      let thumbnail: string | undefined
      try {
        const canvas = document.querySelector('canvas')
        if (canvas && canvas.width) {
          const scale = Math.min(1, 256 / canvas.width)
          const off = document.createElement('canvas')
          off.width = Math.round(canvas.width * scale)
          off.height = Math.round(canvas.height * scale)
          const ctx = off.getContext('2d')
          if (ctx) {
            ctx.drawImage(canvas, 0, 0, off.width, off.height)
            thumbnail = off.toDataURL('image/png')
          }
        }
      } catch {
        /* canvas tainted / unavailable — ship without a thumbnail */
      }
      const file = buildShareFile(
        { name, code, paramValues, intent: last?.intent, appliedSkillIds: last?.appliedSkillIds, thumbnail },
        Date.now(),
      )
      downloadBlob(serializeShareFile(file), `${fileBase}.vibemesh`, 'application/json')
    },

    /** Compile and download every piece of a multi-part design (`part` enum). */
    exportPlates: async (fileBase) => {
      const { code, params, paramValues } = get()
      const partParam = params.find((p) => p.name === 'part' && p.kind === 'enum')
      if (!partParam || get().exportingPlates) return
      const preset = h.exportQuality()
      const pieces = (partParam.options ?? []).map(String).filter((o) => o !== 'all')
      set({ exportingPlates: true })
      const failed: string[] = []
      const degraded: string[] = []
      try {
        for (const piece of pieces) {
          const defines = buildDefines(params, { ...paramValues, part: piece })
          let result = await openscad.compile(code, [...defines, ...h.qualityArgsFor(preset)], h.RENDER_TIMEOUT_EXPORT)
          // same heavy-model fallback the viewport gets: retry timeouts at Draft
          if (!result.ok && result.error?.includes('timed out') && preset.id !== 'draft') {
            result = await openscad.compile(code, [...defines, ...h.qualityArgsFor(QUALITY_PRESETS[0])], h.RENDER_TIMEOUT_DRAFT)
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
        useUi.getState().pushToast(`Export incomplete! Failed parts: ${failed.join(', ')} — downloaded ${pieces.length - failed.length} of ${pieces.length}. Select a failed part in the viewport to see its error, or use Ask AI to Fix.`, 'error')
      } else if (degraded.length > 0) {
        set({ compileNote: `parts ${degraded.join(', ')} were too heavy for ${preset.label} — exported at Draft` })
      }
    },

    exportPlates3mf: async (fileBase) => {
      const { code, params, paramValues } = get()
      const partParam = params.find((p) => p.name === 'part' && p.kind === 'enum')
      if (!partParam || get().exportingPlates) return
      const preset = h.exportQuality()
      const bed = resolveBed(get().bedId, get().customBed)
      const projectAtStart = get().activeId
      const names = (partParam.options ?? []).map(String).filter((o) => o !== 'all')
      set({ exportingPlates: true })
      const compiled: { name: string; stl: ArrayBuffer; bbox: StlBBox }[] = []
      const failed: string[] = []
      const degraded: string[] = []
      try {
        for (const name of names) {
          const defines = buildDefines(params, { ...paramValues, part: name })
          let result = await openscad.compile(code, [...defines, ...h.qualityArgsFor(preset)], h.RENDER_TIMEOUT_EXPORT)
          if (!result.ok && result.error?.includes('timed out') && preset.id !== 'draft') {
            result = await openscad.compile(code, [...defines, ...h.qualityArgsFor(QUALITY_PRESETS[0])], h.RENDER_TIMEOUT_DRAFT)
            if (result.ok) degraded.push(name)
          }
          const bb = result.ok && result.stl ? stlBBox(result.stl) : null
          if (result.ok && result.stl && bb) compiled.push({ name, stl: result.stl, bbox: bb })
          else failed.push(name)
        }
      } finally {
        set({ exportingPlates: false })
      }
      // pack the rendered pieces onto bed-sized plates — the SAME packer the slicer view uses,
      // so each .3mf is WYSIWYG with what was on screen
      const plan = packPlates(
        compiled.map((c) => ({ name: c.name, w: c.bbox.x, h: c.bbox.y, z: c.bbox.z })),
        { x: bed.x, y: bed.y, z: bed.z },
      )
      const byName = new Map(compiled.map((c) => [c.name, c]))
      let written = 0
      plan.plates.forEach((placements, pi) => {
        const parts = placements
          .map((pl) => {
            const c = byName.get(pl.name)
            return c ? { name: pl.name, stl: c.stl, place: { x: pl.x, y: pl.y, rot: pl.rot } } : null
          })
          .filter((p): p is { name: string; stl: ArrayBuffer; place: { x: number; y: number; rot: 0 | 90 } } => p !== null)
        if (parts.length) {
          downloadBlob(buildThreeMF(parts), `${fileBase}-plate${pi + 1}.3mf`, 'model/3mf')
          written++
        }
      })
      // a project switch mid-export already downloaded the right files; don't post a stale note/alert
      if (get().activeId !== projectAtStart) return
      // loud accounting — a part dropped from the export must never be silent (SPEC §4); Draft
      // degradation is surfaced even alongside failures (not swallowed by the problem branch)
      const problems: string[] = []
      if (failed.length) problems.push(`failed to render: ${failed.join(', ')}`)
      if (plan.oversize.length)
        problems.push(`too big for the ${bed.label} bed: ${plan.oversize.map((o) => `${o.name} (${o.reason})`).join(', ')}`)
      const degradedNote = degraded.length ? ` ${degraded.length} part(s) exported at Draft (too heavy for ${preset.label}): ${degraded.join(', ')}.` : ''
      if (problems.length) {
        const note = `PLATES EXPORT INCOMPLETE — ${problems.join('; ')} (${written} plate file(s) written).${degradedNote}`
        set({ compileNote: note })
        useUi.getState().pushToast(`${note} Fix the named parts (select them in the viewport, or Ask AI to split), then export again.`, 'error')
      } else if (written === 0) {
        set({ compileNote: 'Nothing to export — no parts rendered.' })
      } else {
        set({ compileNote: `Exported ${written} plate file(s) for the ${bed.label} bed.${degradedNote}` })
      }
    },

    export3mf: async (fileBase) => {
      const { code, params, paramValues, quality, stl, meshTransform } = get()
      if (get().exportingPlates) return
      const preset = h.exportQuality()
      const partParam = params.find((p) => p.name === 'part' && p.kind === 'enum')

      // single-piece design: package the current geometry (with viewport placement baked)
      if (!partParam) {
        if (!stl) return
        // re-render at Fine for a smooth printed part (the Standard preview is coarse);
        // ask first, since 3MF should reflect what the user is exporting.
        let source = stl
        const belowFine = quality !== 'fine' && quality !== 'ultra'
        if (belowFine) {
          const upgrade = await useUi.getState().requestConfirm({
            title: 'Re-render at Fine quality for export?',
            body: 'The preview caps curve smoothness; Fine prints noticeably smoother curves. Re-rendering may take a while.',
            confirmLabel: 'Re-render at Fine',
          })
          if (upgrade) {
            const defines = buildDefines(params, paramValues)
            const result = await openscad.compile(code, [...defines, ...h.qualityArgsFor(preset)], h.RENDER_TIMEOUT_EXPORT)
            if (result.ok && result.stl) source = result.stl
            else useUi.getState().pushToast('Fine-quality render failed (model too heavy) — exporting the preview as-is.', 'error')
          }
        }
        const buffer = meshTransform ? transformStl(source, h.composeMatrix(meshTransform.position, meshTransform.rotation)) : source
        // arrange:false — the mesh already carries its placement (baked above);
        // re-centering would discard it and disagree with the STL path.
        downloadBlob(buildThreeMF([{ name: fileBase, stl: buffer }], { arrange: false }), `${fileBase}.3mf`, 'model/3mf')
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
          let result = await openscad.compile(code, [...defines, ...h.qualityArgsFor(preset)], h.RENDER_TIMEOUT_EXPORT)
          if (!result.ok && result.error?.includes('timed out') && preset.id !== 'draft') {
            result = await openscad.compile(code, [...defines, ...h.qualityArgsFor(QUALITY_PRESETS[0])], h.RENDER_TIMEOUT_DRAFT)
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
        useUi.getState().pushToast(`3MF export incomplete! Failed parts: ${failed.join(', ')} — included: ${collected.map((c) => c.name).join(', ') || 'none'}. Select a failed part in the viewport to see its error.`, 'error')
        if (collected.length === 0) return
      } else if (degraded.length > 0) {
        set({ compileNote: `parts ${degraded.join(', ')} were too heavy for ${preset.label} — exported at Draft` })
      }
      downloadBlob(buildThreeMF(collected), `${fileBase}.3mf`, 'model/3mf')
    },

    exportOrcaProject: async (fileBase) => {
      const { code, params, paramValues, quality, stl, meshTransform } = get()
      if (get().exportingPlates) return
      const preset = h.exportQuality()
      const partParam = params.find((p) => p.name === 'part' && p.kind === 'enum')

      // single-piece path: re-render at Fine, bake viewport placement, emit one .orca.3mf
      if (!partParam) {
        if (!stl) return
        // re-render at Fine for a smooth printed part (the Standard preview is coarse);
        // ask first, since .3mf should reflect what the user is exporting.
        let source = stl
        const belowFine = quality !== 'fine' && quality !== 'ultra'
        if (belowFine) {
          const upgrade = await useUi.getState().requestConfirm({
            title: 'Re-render at Fine quality for export?',
            body: 'The preview caps curve smoothness; Fine prints noticeably smoother curves. Re-rendering may take a while.',
            confirmLabel: 'Re-render at Fine',
          })
          if (upgrade) {
            const defines = buildDefines(params, paramValues)
            const result = await openscad.compile(code, [...defines, ...h.qualityArgsFor(preset)], h.RENDER_TIMEOUT_EXPORT)
            if (result.ok && result.stl) source = result.stl
            else useUi.getState().pushToast('Fine-quality render failed (model too heavy) — exporting the preview as-is.', 'error')
          }
        }
        const buffer = meshTransform ? transformStl(source, h.composeMatrix(meshTransform.position, meshTransform.rotation)) : source
        const bed = resolveBed(get().bedId, get().customBed)
        // arrange:false equivalent — mesh coords already carry placement; no re-centering
        downloadBlob(buildOrcaProject([{ name: fileBase, stl: buffer }], { bed, material: get().orcaMaterial }), `${fileBase}.orca.3mf`, 'model/3mf')
        return
      }

      // multi-part path: render each piece, pack onto plates, emit one .orca.3mf per plate
      const bed = resolveBed(get().bedId, get().customBed)
      const projectAtStart = get().activeId
      const names = (partParam.options ?? []).map(String).filter((o) => o !== 'all')

      // best-effort thumbnail from the viewport canvas
      let thumbnailPng: Uint8Array | undefined
      try {
        const canvas = document.querySelector('canvas')
        if (canvas && canvas.width) {
          const scale = Math.min(1, 512 / Math.max(canvas.width, canvas.height))
          const off = document.createElement('canvas')
          off.width = Math.round(canvas.width * scale)
          off.height = Math.round(canvas.height * scale)
          const ctx = off.getContext('2d')
          if (ctx) {
            ctx.drawImage(canvas, 0, 0, off.width, off.height)
            const dataUrl = off.toDataURL('image/png')
            const b64 = dataUrl.split(',')[1]
            const bin = atob(b64)
            thumbnailPng = new Uint8Array(bin.length)
            for (let i = 0; i < bin.length; i++) thumbnailPng[i] = bin.charCodeAt(i)
          }
        }
      } catch { /* canvas tainted / unavailable — ship without thumbnail */ }

      set({ exportingPlates: true })
      const compiled: { name: string; stl: ArrayBuffer; bbox: StlBBox }[] = []
      const failed: string[] = []
      const degraded: string[] = []
      try {
        for (const name of names) {
          const defines = buildDefines(params, { ...paramValues, part: name })
          let result = await openscad.compile(code, [...defines, ...h.qualityArgsFor(preset)], h.RENDER_TIMEOUT_EXPORT)
          if (!result.ok && result.error?.includes('timed out') && preset.id !== 'draft') {
            result = await openscad.compile(code, [...defines, ...h.qualityArgsFor(QUALITY_PRESETS[0])], h.RENDER_TIMEOUT_DRAFT)
            if (result.ok) degraded.push(name)
          }
          const bb = result.ok && result.stl ? stlBBox(result.stl) : null
          if (result.ok && result.stl && bb) compiled.push({ name, stl: result.stl, bbox: bb })
          else failed.push(name)
        }
      } finally {
        set({ exportingPlates: false })
      }
      // pack the rendered pieces onto bed-sized plates — the SAME packer the slicer view uses,
      // so each .orca.3mf is WYSIWYG with what was on screen
      const plan = packPlates(
        compiled.map((c) => ({ name: c.name, w: c.bbox.x, h: c.bbox.y, z: c.bbox.z })),
        { x: bed.x, y: bed.y, z: bed.z },
      )
      const byName = new Map(compiled.map((c) => [c.name, c]))
      let written = 0
      plan.plates.forEach((placements, pi) => {
        const plateParts = placements
          .map((pl) => {
            const c = byName.get(pl.name)
            return c ? { name: pl.name, stl: c.stl, place: { x: pl.x, y: pl.y, rot: pl.rot } } : null
          })
          .filter((p): p is { name: string; stl: ArrayBuffer; place: { x: number; y: number; rot: 0 | 90 } } => p !== null)
        if (plateParts.length) {
          downloadBlob(buildOrcaProject(plateParts, { bed, thumbnailPng, material: get().orcaMaterial }), `${fileBase}-plate${pi + 1}.orca.3mf`, 'model/3mf')
          written++
        }
      })
      // a project switch mid-export already downloaded the right files; don't post a stale note/alert
      if (get().activeId !== projectAtStart) return
      // loud accounting — a part dropped from the export must never be silent (SPEC §4); Draft
      // degradation is surfaced even alongside failures (not swallowed by the problem branch)
      const problems: string[] = []
      if (failed.length) problems.push(`failed to render: ${failed.join(', ')}`)
      if (plan.oversize.length)
        problems.push(`too big for the ${bed.label} bed: ${plan.oversize.map((o) => `${o.name} (${o.reason})`).join(', ')}`)
      const degradedNote = degraded.length ? ` ${degraded.length} part(s) exported at Draft (too heavy for ${preset.label}): ${degraded.join(', ')}.` : ''
      if (problems.length) {
        const note = `PLATES EXPORT INCOMPLETE — ${problems.join('; ')} (${written} plate file(s) written).${degradedNote}`
        set({ compileNote: note })
        useUi.getState().pushToast(`${note} Fix the named parts (select them in the viewport, or Ask AI to split), then export again.`, 'error')
      } else if (written === 0) {
        set({ compileNote: 'Nothing to export — no parts rendered.' })
      } else {
        set({ compileNote: `Exported ${written} plate file(s) for the ${bed.label} bed.${degradedNote}` })
      }
    },

    exportStlSmart: async (fileBase) => {
      const { stl, quality, degradedToDraft, code, params, paramValues } = get()
      if (!stl) return
      // bake any viewport move/rotate into the export so WYSIWYG holds
      const bake = (buffer: ArrayBuffer): ArrayBuffer => {
        const t = get().meshTransform
        if (!t) return buffer
        return transformStl(buffer, h.composeMatrix(t.position, t.rotation))
      }
      // Anything below Fine ships a coarse mesh — the default Standard preview caps
      // curves at fa4/fs0.8. Offer a Fine re-render (with consent, since STL is the
      // "what you see" format); Fine/Ultra previews are already smooth enough.
      const fine = QUALITY_PRESETS.find((q) => q.id === 'fine')!
      const belowFine = quality !== 'fine' && quality !== 'ultra'
      if (belowFine && fine) {
        const wasDraft = quality === 'draft' || degradedToDraft
        const upgrade = await useUi.getState().requestConfirm({
          title: 'Re-render at Fine quality for export?',
          body: wasDraft
            ? 'The preview was rendered at Draft — curves will look faceted when printed. Re-rendering at Fine may take a while.'
            : 'The Standard preview caps curve smoothness; Fine prints noticeably smoother curves. Re-rendering may take a while.',
          confirmLabel: 'Re-render at Fine',
        })
        if (upgrade) {
          const defines = buildDefines(params, paramValues)
          const result = await openscad.compile(code, [...defines, ...h.qualityArgsFor(fine)], h.RENDER_TIMEOUT_EXPORT)
          if (result.ok && result.stl) {
            downloadBlob(bake(result.stl), `${fileBase}.stl`, 'model/stl')
            return
          }
          useUi.getState().pushToast('Fine-quality render failed (model too heavy) — exporting the preview STL instead.', 'error')
        }
      }
      downloadBlob(bake(stl), `${fileBase}.stl`, 'model/stl')
    },
  }
}

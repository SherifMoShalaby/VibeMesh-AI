import type { StoreApi } from 'zustand'
import type { VibeState, VpSnapshot } from './store'

/** snapshot the placement-affected fields so move/rotate/delete (and Arrange nudges) are undoable.
 *  Exported so store.ts's setPieceOverride/clearPieceOverrides push the SAME snapshot shape. */
export const vpSnapshotOf = (s: VibeState): VpSnapshot => ({
  stl: s.stl,
  modelDims: s.modelDims,
  meshTransform: s.meshTransform,
  compileStatus: s.compileStatus,
  compileError: s.compileError,
  compileNote: s.compileNote,
  compileMs: s.compileMs,
  modelRemoved: s.modelRemoved,
  pieceOverrides: s.pieceOverrides,
})

function sameTransform(a: VibeState['meshTransform'], b: VibeState['meshTransform']): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.position.every((v, i) => v === b.position[i]) && a.rotation.every((v, i) => v === b.rotation[i])
}

export const VP_HISTORY_LIMIT = 30

type PlacementActions = Pick<VibeState, 'setMeshTransform' | 'clearModel' | 'vpUndo' | 'vpRedo'>

/**
 * Viewport-placement slice (move / rotate / delete + undo/redo), extracted from store.ts
 * (god-module split). Self-contained: it owns its own snapshot history over the placement fields
 * and is never called by the compile/generation core. clearParamTimer is passed in (shared with the
 * params actions) so a pending slider render can't resurrect a just-removed model.
 */
export function createPlacementActions(
  set: StoreApi<VibeState>['setState'],
  get: StoreApi<VibeState>['getState'],
  h: { clearParamTimer: () => void; persistOverrides: (overrides: VibeState['pieceOverrides']) => void },
): PlacementActions {
  return {
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
      h.clearParamTimer() // don't let a pending slider render resurrect the model after Remove
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
      // overrides are also project metadata — re-persist the restored map so the layout survives
      // a project switch / reload, matching setPieceOverride's durability.
      h.persistOverrides(prev.pieceOverrides)
    },

    vpRedo: () => {
      const s = get()
      const next = s.vpFuture[s.vpFuture.length - 1]
      if (!next) return
      set({ vpFuture: s.vpFuture.slice(0, -1), vpPast: [...s.vpPast, vpSnapshotOf(s)], ...next })
      h.persistOverrides(next.pieceOverrides)
    },
  }
}

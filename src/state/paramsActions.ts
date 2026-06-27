import type { StoreApi } from 'zustand'
import type { VibeState } from './store'
import type { ParamValue, ParamValues, ScadParameter } from '../types'
import { buildDefines, parseParameters } from '../lib/params'

/** Debounce timer for slider-driven recompiles. Module-level (one timer for the whole app) and
 *  EXPORTED via clearParamTimer because store.ts (project switches) + the placement slice (Remove)
 *  must also be able to cancel a pending slider render — keeping a single shared cancel point. */
let paramTimer: ReturnType<typeof setTimeout> | null = null
export function clearParamTimer() {
  if (paramTimer) {
    clearTimeout(paramTimer)
    paramTimer = null
  }
}

type ParamsActions = Pick<
  VibeState,
  | 'setParamValue'
  | 'selectPart'
  | 'undoParam'
  | 'redoParam'
  | 'jumpToParamHistory'
  | 'resetParams'
  | 'setCode'
  | 'recompile'
>

/**
 * Customizer-parameter slice, extracted from store.ts (god-module split). Owns the slider value
 * + its undo/redo history (paramHistory/paramFuture), the part-enum selector, the editor working
 * copy (setCode/recompile), and the debounced recompile. Behavior-preserving move — the logic is
 * verbatim from the former store.ts inline actions.
 *
 * Deps: `compile` (the compile-lifecycle helper that stays in store.ts and routes into the active
 * session) and `persist` (the project-record sync). Both are passed in so this slice never reaches
 * back into the store core.
 */
export function createParamsActions(
  set: StoreApi<VibeState>['setState'],
  get: StoreApi<VibeState>['getState'],
  h: {
    compile: (code: string, defines: string[]) => Promise<unknown>
    persist: () => void
  },
): ParamsActions {
  const { compile, persist } = h
  return {
    setParamValue: (name: string, value: ParamValue) => {
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

    selectPart: async (value: string) => {
      clearParamTimer() // a pending slider render must not clobber the part switch
      const paramValues = { ...get().paramValues, part: value }
      set({ paramValues })
      const { code, params } = get()
      const result = (await compile(code, buildDefines(params, paramValues))) as { ok?: boolean }
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

    jumpToParamHistory: (index: number) => {
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

    resetParams: () => {
      const { params, code } = get()
      const paramValues: ParamValues = {}
      for (const p of params) paramValues[p.name] = p.defaultValue
      set({ paramValues })
      void compile(code, [])
      persist()
    },

    setCode: (code: string) => {
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
        const old = oldParams.find((o: ScadParameter) => o.name === p.name)
        let value: ParamValue = old && old.defaultValue === p.defaultValue ? (prev[p.name] ?? p.defaultValue) : p.defaultValue
        // the carried value must still be valid for the NEW parameter
        if (p.kind === 'enum' && p.options && !p.options.some((o) => String(o) === String(value))) value = p.defaultValue
        if (typeof value === 'number' && ((p.min !== undefined && value < p.min) || (p.max !== undefined && value > p.max))) value = p.defaultValue
        paramValues[p.name] = value
      }
      set({ params, paramValues })
      void compile(code, buildDefines(params, paramValues))
      persist()
    },
  }
}

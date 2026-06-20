import { create } from 'zustand'

export type Shading = 'solid' | 'flat' | 'edges' | 'wireframe'

// draggable side-panel width clamps (desktop workspace only) — keep each rail usable and
// leave room for the viewport. Persisted so a resize survives reload.
const clampLeft = (w: number) => Math.max(280, Math.min(520, Math.round(w)))
const clampRight = (w: number) => Math.max(240, Math.min(440, Math.round(w)))

interface UiState {
  /** prompt text pushed from elsewhere (idea chips) into the chat input */
  draftPrompt: string | null
  setDraftPrompt: (text: string | null) => void
  rightTab: 'params' | 'code'
  setRightTab: (tab: 'params' | 'code') => void
  enginesOpen: boolean
  setEnginesOpen: (open: boolean) => void
  helpOpen: boolean
  setHelpOpen: (open: boolean) => void
  /** active mobile tab (viewport-first layout at/below 860px) */
  mobileTab: 'model' | 'params' | 'chat'
  setMobileTab: (t: 'model' | 'params' | 'chat') => void
  /** draggable workspace column widths (px) — clamped + persisted; desktop workspace only */
  leftWidth: number
  setLeftWidth: (w: number) => void
  rightWidth: number
  setRightWidth: (w: number) => void
  /** collapse either side panel (desktop workspace); persisted */
  leftCollapsed: boolean
  setLeftCollapsed: (v: boolean) => void
  rightCollapsed: boolean
  setRightCollapsed: (v: boolean) => void
  /** auto-repair: silently re-prompt once when a generated model fails to render (kill switch) */
  autoRepair: boolean
  setAutoRepair: (v: boolean) => void
  /** best-of-N: for ambiguous/kit/image requests, generate N candidates and adopt the one that
   *  scores best on reference-free signals. OFF by default — it costs N× generations + compiles. */
  bestOfN: boolean
  setBestOfN: (v: boolean) => void

  /* ── viewport display preferences ── */
  shading: Shading
  setShading: (s: Shading) => void
  /** X-ray: render the model semi-transparent to reveal internal features (bores, cavities) */
  xray: boolean
  setXray: (v: boolean) => void
  bedVisible: boolean
  setBedVisible: (v: boolean) => void
  ortho: boolean
  setOrtho: (v: boolean) => void
  measureMode: boolean
  setMeasureMode: (v: boolean) => void
  selected: boolean
  setSelected: (v: boolean) => void
  gizmoMode: 'translate' | 'rotate'
  setGizmoMode: (m: 'translate' | 'rotate') => void

  /* ── transient notices + branded confirm (replace window.alert/confirm — UX-AUDIT F12) ── */
  toasts: { id: string; message: string; level: 'info' | 'error' }[]
  pushToast: (message: string, level?: 'info' | 'error') => void
  dismissToast: (id: string) => void
  /** promise-based confirm: the store awaits it; <ConfirmHost> renders the dialog + resolves. */
  confirmRequest: { title: string; body: string; confirmLabel: string; resolve: (ok: boolean) => void } | null
  requestConfirm: (opts: { title: string; body: string; confirmLabel?: string }) => Promise<boolean>
}

export const useUi = create<UiState>((set) => ({
  draftPrompt: null,
  setDraftPrompt: (draftPrompt) => set({ draftPrompt }),
  rightTab: 'params',
  setRightTab: (rightTab) => set({ rightTab }),
  enginesOpen: false,
  setEnginesOpen: (enginesOpen) => set({ enginesOpen }),
  helpOpen: false,
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  mobileTab: 'model',
  setMobileTab: (mobileTab) => set({ mobileTab }),
  leftWidth: clampLeft(Number(localStorage.getItem('vibemesh.leftWidth.v1')) || 360),
  setLeftWidth: (w) => {
    const v = clampLeft(w)
    localStorage.setItem('vibemesh.leftWidth.v1', String(v))
    set({ leftWidth: v })
  },
  rightWidth: clampRight(Number(localStorage.getItem('vibemesh.rightWidth.v1')) || 320),
  setRightWidth: (w) => {
    const v = clampRight(w)
    localStorage.setItem('vibemesh.rightWidth.v1', String(v))
    set({ rightWidth: v })
  },
  leftCollapsed: localStorage.getItem('vibemesh.leftCollapsed.v1') === '1',
  setLeftCollapsed: (v) => {
    localStorage.setItem('vibemesh.leftCollapsed.v1', v ? '1' : '0')
    set({ leftCollapsed: v })
  },
  rightCollapsed: localStorage.getItem('vibemesh.rightCollapsed.v1') === '1',
  setRightCollapsed: (v) => {
    localStorage.setItem('vibemesh.rightCollapsed.v1', v ? '1' : '0')
    set({ rightCollapsed: v })
  },
  autoRepair: localStorage.getItem('vibemesh.autoRepair.v1') !== '0',
  setAutoRepair: (autoRepair) => {
    localStorage.setItem('vibemesh.autoRepair.v1', autoRepair ? '1' : '0')
    set({ autoRepair })
  },
  bestOfN: localStorage.getItem('vibemesh.bestOfN.v1') === '1',
  setBestOfN: (bestOfN) => {
    localStorage.setItem('vibemesh.bestOfN.v1', bestOfN ? '1' : '0')
    set({ bestOfN })
  },

  shading: 'solid',
  setShading: (shading) => set({ shading }),
  xray: false,
  setXray: (xray) => set({ xray }),
  bedVisible: true,
  setBedVisible: (bedVisible) => set({ bedVisible }),
  ortho: false,
  setOrtho: (ortho) => set({ ortho }),
  measureMode: false,
  setMeasureMode: (measureMode) => set({ measureMode }),
  selected: false,
  setSelected: (selected) => set({ selected }),
  gizmoMode: 'translate',
  setGizmoMode: (gizmoMode) => set({ gizmoMode }),

  toasts: [],
  pushToast: (message, level = 'info') => {
    const id = `${Date.now()}-${Math.round(Math.random() * 1e9).toString(36)}`
    set((s) => ({ toasts: [...s.toasts, { id, message, level }] }))
    // info fades fast; errors stay LOUD longer (export failures must not be missed — SPEC §4),
    // both manually dismissible via the toast ×.
    const ttl = level === 'error' ? 10_000 : 4500
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ttl)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  confirmRequest: null,
  requestConfirm: ({ title, body, confirmLabel = 'OK' }) =>
    new Promise<boolean>((resolve) => set({ confirmRequest: { title, body, confirmLabel, resolve } })),
}))

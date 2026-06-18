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

  /* ── viewport display preferences ── */
  shading: Shading
  setShading: (s: Shading) => void
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

  shading: 'solid',
  setShading: (shading) => set({ shading }),
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
}))

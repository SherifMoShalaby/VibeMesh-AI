import { create } from 'zustand'

export type Shading = 'solid' | 'edges' | 'wireframe'

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
  /** advanced mode shows the Code tab, render times and triangle counts */
  advanced: boolean
  setAdvanced: (v: boolean) => void
  /** narrow-viewport bottom sheet for the right panel */
  sheetOpen: boolean
  setSheetOpen: (v: boolean) => void

  /* ── viewport display preferences ── */
  shading: Shading
  setShading: (s: Shading) => void
  bedVisible: boolean
  setBedVisible: (v: boolean) => void
  ortho: boolean
  setOrtho: (v: boolean) => void
  sectionOn: boolean
  setSectionOn: (v: boolean) => void
  /** section plane height as a 0..1 fraction of the model height */
  sectionZ: number
  setSectionZ: (v: number) => void
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
  advanced: localStorage.getItem('vibemesh.advanced.v1') === '1',
  setAdvanced: (advanced) => {
    localStorage.setItem('vibemesh.advanced.v1', advanced ? '1' : '0')
    set({ advanced })
  },
  sheetOpen: false,
  setSheetOpen: (sheetOpen) => set({ sheetOpen }),

  shading: 'solid',
  setShading: (shading) => set({ shading }),
  bedVisible: true,
  setBedVisible: (bedVisible) => set({ bedVisible }),
  ortho: false,
  setOrtho: (ortho) => set({ ortho }),
  sectionOn: false,
  setSectionOn: (sectionOn) => set({ sectionOn }),
  sectionZ: 0.5,
  setSectionZ: (sectionZ) => set({ sectionZ }),
  measureMode: false,
  setMeasureMode: (measureMode) => set({ measureMode }),
  selected: false,
  setSelected: (selected) => set({ selected }),
  gizmoMode: 'translate',
  setGizmoMode: (gizmoMode) => set({ gizmoMode }),
}))

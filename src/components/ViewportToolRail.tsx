import { memo, type RefObject } from 'react'
import { useStore } from '../state/store'
import { useUi } from '../state/ui'
import type { ViewApi } from './Viewport'
import { DRotate, DMove, DZoom, DRuler, DShading, DXray, DGrid, DCube, DReset, DCamera, DUndo } from './icons'

/**
 * The viewport's vertical tool rail, extracted from Viewport.tsx so it subscribes NARROWLY to just
 * the toggle/placement state it needs (shading, projection, x-ray, grid, interaction mode, undo) —
 * instead of re-rendering with the 1200-line parent on every geometry / camera / param change.
 * The geometry-derived bits the parent owns (the imperative ViewApi, the fit callback, whether a
 * model exists, the slicer view) arrive as STABLE props so React.memo can hold.
 */
interface ToolRailProps {
  hasModel: boolean
  platesView: boolean
  viewApi: RefObject<ViewApi | null>
  doFit: () => void
  /** clear any in-progress measurement (the points live as parent state) */
  onResetMeasure: () => void
}

function ToolRail({ hasModel, platesView, viewApi, doFit, onResetMeasure }: ToolRailProps) {
  const shading = useUi((s) => s.shading)
  const setShading = useUi((s) => s.setShading)
  const xray = useUi((s) => s.xray)
  const setXray = useUi((s) => s.setXray)
  const bedVisible = useUi((s) => s.bedVisible)
  const setBedVisible = useUi((s) => s.setBedVisible)
  const ortho = useUi((s) => s.ortho)
  const setOrtho = useUi((s) => s.setOrtho)
  const measureMode = useUi((s) => s.measureMode)
  const setMeasureMode = useUi((s) => s.setMeasureMode)
  const selected = useUi((s) => s.selected)
  const setSelected = useUi((s) => s.setSelected)

  const canUndo = useStore((s) => s.vpPast.length > 0)
  const canRedo = useStore((s) => s.vpFuture.length > 0)
  const vpUndo = useStore((s) => s.vpUndo)
  const vpRedo = useStore((s) => s.vpRedo)

  return (
    <div className="tool-rail" role="toolbar" aria-label="Viewport tools">
      <button
        className={`tool-btn${!measureMode && !selected ? ' active' : ''}`}
        data-tip="Orbit"
        aria-label="Orbit"
        aria-pressed={!measureMode && !selected}
        onClick={() => {
          setMeasureMode(false)
          onResetMeasure()
          setSelected(false)
        }}
      >
        <DRotate />
      </button>
      <button
        className={`tool-btn${selected ? ' active' : ''}`}
        data-tip="Move / rotate part"
        aria-label="Move or rotate part"
        aria-pressed={selected}
        disabled={!hasModel || platesView}
        onClick={() => setSelected(true)}
      >
        <DMove />
      </button>
      <button className="tool-btn" data-tip="Zoom to fit (F)" aria-label="Zoom to fit" onClick={doFit}>
        <DZoom />
      </button>
      <div className="rail-sep" />
      <button
        className={`tool-btn${measureMode ? ' active' : ''}`}
        data-tip="Measure"
        aria-label="Measure"
        aria-pressed={measureMode}
        disabled={platesView}
        onClick={() => {
          setMeasureMode(!measureMode)
          onResetMeasure()
        }}
      >
        <DRuler />
      </button>
      <button
        className={`tool-btn${shading !== 'solid' ? ' active' : ''}`}
        data-tip={`Shading: ${({ solid: 'Smooth', flat: 'Faceted', edges: 'Edges', wireframe: 'Wireframe' } as const)[shading]}`}
        aria-label="Cycle shading mode"
        aria-pressed={shading !== 'solid'}
        onClick={() => {
          const order = ['solid', 'flat', 'edges', 'wireframe'] as const
          setShading(order[(order.indexOf(shading) + 1) % order.length])
        }}
      >
        <DShading />
      </button>
      <button
        className={`tool-btn${xray ? ' active' : ''}`}
        data-tip={xray ? 'X-ray: on (see inside)' : 'X-ray (see inside)'}
        aria-label="Toggle X-ray transparency"
        aria-pressed={xray}
        onClick={() => setXray(!xray)}
      >
        <DXray />
      </button>
      <button
        className={`tool-btn${bedVisible ? ' active' : ''}`}
        data-tip="Toggle bed grid"
        aria-label="Toggle bed grid"
        aria-pressed={bedVisible}
        onClick={() => setBedVisible(!bedVisible)}
      >
        <DGrid />
      </button>
      <div className="rail-sep" />
      <button className="tool-btn" data-tip="Reset to ISO" aria-label="Reset to ISO" onClick={() => viewApi.current?.setView('iso')}>
        <DCube />
      </button>
      <button
        className={`tool-btn${ortho ? ' active' : ''}`}
        data-tip={ortho ? 'Orthographic' : 'Perspective'}
        aria-label="Toggle projection (orthographic)"
        aria-pressed={ortho}
        onClick={() => setOrtho(!ortho)}
      >
        <DReset />
      </button>
      <button className="tool-btn" data-tip="Snapshot PNG" aria-label="Snapshot PNG" onClick={() => viewApi.current?.snapshot()}>
        <DCamera />
      </button>
      <div className="rail-sep" />
      <button className="tool-btn" disabled={!canUndo || platesView} data-tip="Undo (⌘Z)" aria-label="Undo placement" onClick={vpUndo}>
        <DUndo />
      </button>
      <button className="tool-btn" disabled={!canRedo || platesView} data-tip="Redo (⇧⌘Z)" aria-label="Redo placement" onClick={vpRedo}>
        <span style={{ display: 'grid', transform: 'scaleX(-1)' }}><DUndo /></span>
      </button>
    </div>
  )
}

export default memo(ToolRail)

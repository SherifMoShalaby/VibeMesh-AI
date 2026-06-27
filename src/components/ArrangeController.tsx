// UIUX-10: ArrangeController — the plates/slicer Arrange surface extracted from
// Viewport.tsx. Owns the per-piece selection toolbar (.arrange-bar), the per-piece
// Arrange actions (center/reset/arrange-all, routed through the store's
// pieceOverrides), and the slicer readout chip. The plate plan + bed are computed
// in Viewport (they also feed the Canvas rigs + HUD) and passed in as props, so the
// packPlates → effectivePlacements wiring stays the single source of truth.
// Behavior-preserving move — no logic change.
import { useStore } from '../state/store'
import { useUi } from '../state/ui'
import { baseName, type Placement } from '../lib/packPlates'
import { IconCenter, IconWarning, DRotate, DMove, DUndo, DWrench } from './icons'

export interface PlatePlan {
  plates: Placement[][]
  oversize: { name: string; reason: string }[]
}

/** The bottom-left slicer readout: plate count, bed size, and a LOUD oversize / render-fail warning. */
export function SlicerReadout({
  platePlan,
  bed,
  slicing,
  slicerFailed,
}: {
  platePlan: PlatePlan | null
  bed: { x: number; y: number }
  slicing: boolean
  slicerFailed: string[]
}) {
  return (
    <div className="assembly-chip">
      <span className="ac-label">Slicer</span>
      {slicing ? (
        <span className="ac-hint">packing pieces…</span>
      ) : platePlan ? (
        <>
          <span className="ac-hint">
            {platePlan.plates.length} plate{platePlan.plates.length === 1 ? '' : 's'} · {bed.x}×{bed.y}mm · drag to orbit
          </span>
          {platePlan.oversize.length > 0 && (
            <span className="ac-warn">
              <IconWarning /> won't fit the bed: {platePlan.oversize.map((o) => `${o.name} (${o.reason})`).join(', ')} — switch to that part and Ask AI to split
            </span>
          )}
          {slicerFailed.length > 0 && (
            <span className="ac-warn">
              <IconWarning /> failed to render: {slicerFailed.join(', ')} — select that part to see its error
            </span>
          )}
        </>
      ) : (
        <span className="ac-hint">no pieces to lay out</span>
      )}
    </div>
  )
}

/** The per-piece Arrange toolbar (plates view, a piece selected). Owns the per-piece
 *  Arrange actions; reads the selection + overrides directly from the store so Viewport
 *  doesn't have to thread them down. Renders nothing when no piece is selected. */
export function ArrangeToolbar({
  platePlan,
  bed,
}: {
  platePlan: PlatePlan | null
  bed: { x: number; y: number }
}) {
  const selectedPiece = useUi((s) => s.selectedPiece)
  const gizmoMode = useUi((s) => s.gizmoMode)
  const setGizmoMode = useUi((s) => s.setGizmoMode)
  const pieceOverrides = useStore((s) => s.pieceOverrides)
  const setPieceOverride = useStore((s) => s.setPieceOverride)
  const removePieceOverride = useStore((s) => s.removePieceOverride)
  const clearPieceOverrides = useStore((s) => s.clearPieceOverrides)

  const hasOverrides = Object.keys(pieceOverrides).length > 0
  // center the selected piece's PLACED footprint on its plate: shift its current displayed corner to
  // the bed-centered corner. The displayed corner already includes the override, so add the delta.
  const centerSelectedPiece = () => {
    if (!selectedPiece || !platePlan) return
    const pl = platePlan.plates.flat().find((p) => p.name === selectedPiece)
    if (!pl) return
    const cur = pieceOverrides[selectedPiece] ?? { dx: 0, dy: 0, rot: pl.rot }
    const targetX = (bed.x - pl.w) / 2
    const targetY = (bed.y - pl.h) / 2
    setPieceOverride(selectedPiece, { dx: cur.dx + (targetX - pl.x), dy: cur.dy + (targetY - pl.y), rot: pl.rot })
  }
  const resetSelectedPiece = () => {
    if (selectedPiece) removePieceOverride(selectedPiece) // snaps this piece back to its packer seat
  }

  if (!selectedPiece) return null

  return (
    <div className="sel-bar arrange-bar">
      <span className="ac-label">{baseName(selectedPiece)}</span>
      <button className={`plate-chip${gizmoMode === 'translate' ? ' active' : ''}`} aria-pressed={gizmoMode === 'translate'} onClick={() => setGizmoMode('translate')} title="Move on the bed (XY)">
        <DMove /> Move
      </button>
      <button className={`plate-chip${gizmoMode === 'rotate' ? ' active' : ''}`} aria-pressed={gizmoMode === 'rotate'} onClick={() => setGizmoMode('rotate')} title="Rotate flat (snaps 0°/90°)">
        <DRotate /> Rotate
      </button>
      <button className="plate-chip" onClick={centerSelectedPiece} title="Center this piece on its plate">
        <IconCenter /> Center
      </button>
      {pieceOverrides[selectedPiece] && (
        <button className="plate-chip" onClick={resetSelectedPiece} title="Reset this piece to the auto-packer position">
          <DUndo /> Reset
        </button>
      )}
      <button className="plate-chip" disabled={!hasOverrides} onClick={clearPieceOverrides} title="Snap every piece back to the auto-packer layout">
        <DWrench /> Arrange all
      </button>
    </div>
  )
}

import { memo, useState } from 'react'
import { useStore } from '../state/store'
import { useUi } from '../state/ui'
import { CUSTOM_BED_ID, PRINTER_BEDS, QUALITY_PRESETS } from '../types'
import type { ScadParameter } from '../types'
import type { PrintabilityReport } from '../lib/printability'
import { CustomBedDialog } from './Dialogs'
import { DGauge, DPrinter, DChevDown } from './icons'

/**
 * The always-visible bottom HUD bar (status · printability · bounds · view/parts · quality · printer)
 * + the custom-bed dialog it drives — extracted from Viewport.tsx so it subscribes NARROWLY to the
 * compile/quality/printer state it shows, instead of forcing the 1200-line parent (and the r3f
 * Canvas reconcile) to re-render on every compileStatus / compileNote / quality / slicing change.
 * The geometry-derived bits the parent owns (model presence, bbox, printability, plate plan, the
 * resolved bed, the active part) arrive as props; doFit is a stable callback so React.memo holds.
 */
interface HudProps {
  hasModel: boolean
  /** post-transform bbox; only the size is shown (THREE.Vector3 is structurally {x,y,z}) */
  tbox: { size: { x: number; y: number; z: number } } | null
  overBed: boolean
  bed: { id: string; label: string; x: number; y: number; z: number }
  printability: PrintabilityReport | null
  platePlan: { plates: unknown[]; oversize: { name: string; reason: string }[] } | null
  platesView: boolean
  partParam: ScadParameter | undefined
  currentPart: string | null
  isAssemblyPreview: boolean
  outOfView: boolean
  doFit: () => void
}

const fmtMs = (ms: number): string => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`)
const EMPTY_QTY: Record<string, number> = {} // stable ref so the selector fallback doesn't churn renders

function ViewportHud({ hasModel, tbox, overBed, bed, printability, platePlan, platesView, partParam, currentPart, isAssemblyPreview, outOfView, doFit }: HudProps) {
  const compileStatus = useStore((s) => s.compileStatus)
  const compileNote = useStore((s) => s.compileNote)
  const compileMs = useStore((s) => s.compileMs)
  const generating = useStore((s) => s.generating)
  const modelRemoved = useStore((s) => s.modelRemoved)
  const quality = useStore((s) => s.quality)
  const setQuality = useStore((s) => s.setQuality)
  const setBed = useStore((s) => s.setBed)
  const customBed = useStore((s) => s.customBed)
  const setCustomBed = useStore((s) => s.setCustomBed)
  const slicing = useStore((s) => s.slicing)
  const selectPart = useStore((s) => s.selectPart)
  const setPartQuantity = useStore((s) => s.setPartQuantity)
  const partQuantities = useStore((s) => s.projects.find((p) => p.id === s.activeId)?.partQuantities ?? EMPTY_QTY)
  const setViewMode = useStore((s) => s.setViewMode)
  const vpUndo = useStore((s) => s.vpUndo)
  const setRightTab = useUi((s) => s.setRightTab)
  const setMobileTab = useUi((s) => s.setMobileTab)

  const [bedDialog, setBedDialog] = useState(false)

  return (
    <>
      <div className="hud-bar">
        <div className="hud-seg">
          <div className="hud-status">
            {(() => {
              if (compileStatus === 'error')
                return (
                  <>
                    <span className="status-dot err" />
                    <span>Render failed</span>
                    {/* the Code tab is force-shown on error (RightPanel codeVisible); jump straight to it */}
                    <span className="time">· <button className="banner-link" onClick={() => { setRightTab('code'); setMobileTab('params') }}>open Code</button> to fix</span>
                  </>
                )
              if (compileStatus === 'compiling')
                return (<><span className="status-dot busy" /><span>Rendering…</span></>)
              if (generating)
                return (<><span className="status-dot busy" /><span>AI is designing…</span></>)
              if (modelRemoved && !hasModel && compileStatus === 'idle')
                return (
                  <>
                    <span className="status-dot warn" />
                    <span>Removed from view</span>
                    <span className="time">· <button className="banner-link" onClick={vpUndo}>undo</button></span>
                  </>
                )
              if (compileStatus === 'ok' && compileNote)
                return (<><span className="status-dot warn" /><span>{compileNote}</span></>)
              if (outOfView && hasModel)
                return (
                  <>
                    <span className="status-dot warn" />
                    <span>Grew out of view</span>
                    <span className="time">· <button className="banner-link" onClick={doFit}>fit</button></span>
                  </>
                )
              if (hasModel && compileStatus === 'ok')
                return (
                  <>
                    <span className="status-dot" />
                    <span>Model ready</span>
                    {compileMs !== null && <span className="time">· {fmtMs(compileMs)}</span>}
                  </>
                )
              return (<><span className="status-dot" /><span>Ready</span></>)
            })()}
          </div>
        </div>

        {/* Printability verdict sits right after status so the "will it print?" signal is
            always visible — on mobile the HUD scrolls horizontally and this kept it off-screen. */}
        {!platesView && printability && (
          <div className="hud-seg hud-print">
            <div className={`print-badge ${printability.level}`} tabIndex={0}>
              <span className={`status-dot${printability.level === 'fail' ? ' err' : printability.level === 'warn' ? ' warn' : ''}`} />
              <span className="pb-label">
                {printability.level === 'fail' ? "Won't print" : printability.level === 'warn' ? 'Print: caution' : 'Printable'}
              </span>
              <div className="print-pop" role="tooltip">
                <div className="pp-title">Printability — {isAssemblyPreview ? 'assembly preview' : 'this part'}</div>
                {printability.checks.map((c) => (
                  <div key={c.id} className={`pp-row ${c.level}`}>
                    <span className={`status-dot${c.level === 'fail' ? ' err' : c.level === 'warn' ? ' warn' : ''}`} />
                    <span className="pp-text"><b>{c.label}</b> — {c.detail}</span>
                  </div>
                ))}
                <div className="pp-note">Advisory · assumes the authored print orientation, 0.4mm nozzle.</div>
              </div>
            </div>
          </div>
        )}
        {!platesView && tbox && (
          <div className="hud-seg">
            <div className={`hud-dims${overBed && !isAssemblyPreview ? ' over' : ''}`}>
              <span className="dim-label">Bounds</span>
              <span className="dim-val">
                {tbox.size.x.toFixed(1)}<span className="x">×</span>{tbox.size.y.toFixed(1)}<span className="x">×</span>{tbox.size.z.toFixed(1)}
              </span>
              <span className="unit">mm</span>
            </div>
          </div>
        )}
        {platesView && platePlan && (
          <div className="hud-seg">
            <div className={`hud-dims${platePlan.oversize.length ? ' over' : ''}`}>
              <span className="dim-label">Plates</span>
              <span className="dim-val">{platePlan.plates.length}</span>
              <span className="unit">
                on {bed.x}×{bed.y}
                {platePlan.oversize.length > 0 && ` · ${platePlan.oversize.length} oversize`}
              </span>
            </div>
          </div>
        )}

        {partParam && (
          <div className="hud-seg hud-parts">
            <span className="dim-label">View</span>
            <div className="part-tog" role="radiogroup" aria-label="Viewport view">
              <button role="radio" aria-checked={!platesView} className={!platesView ? 'active' : ''} onClick={() => void setViewMode('single')}>Single</button>
              <button role="radio" aria-checked={platesView} className={platesView ? 'active' : ''} disabled={slicing} onClick={() => void setViewMode('plates')}>
                Slicer
                {slicing && <span className="status-dot busy" style={{ marginLeft: 6 }} />}
              </button>
            </div>
            {!platesView && (
              <div className="part-tog" role="radiogroup" aria-label="Active part">
                {(partParam.options ?? []).map((opt) => {
                  const value = String(opt)
                  const isAll = value === 'all'
                  const active = currentPart === value
                  const busy = active && compileStatus === 'compiling'
                  const qty = partQuantities[value] ?? 1
                  return (
                    <span key={value} className="part-chip">
                      <button
                        role="radio"
                        aria-checked={active}
                        className={`${active ? 'active' : ''}${busy ? ' busy' : ''}`}
                        disabled={busy}
                        onClick={() => void selectPart(value)}
                      >
                        {isAll ? 'All' : value}
                        {isAll && <span className="pc">{(partParam.options?.length ?? 1) - 1}</span>}
                        {/* glanceable ×N on the non-selected pieces; the editable stepper shows on the active one */}
                        {!isAll && !active && qty > 1 && <span className="pq-badge">×{qty}</span>}
                        {busy && <span className="status-dot busy" style={{ marginLeft: 6 }} />}
                      </button>
                      {/* per-part PRINT count — set on the active piece; replicates on plate/3MF export + Slicer */}
                      {!isAll && active && (
                        <span className="part-qty" title={`How many of "${value}" to print — copies are packed onto plates in the Slicer view & 3MF export; noted on separate-STL export`}>
                          <button type="button" className="pq-btn" aria-label={`One fewer ${value}`} disabled={qty <= 1} onClick={() => setPartQuantity(value, qty - 1)}>−</button>
                          <span className="pq-n">×{qty}</span>
                          <button type="button" className="pq-btn" aria-label={`One more ${value}`} disabled={qty >= 99} onClick={() => setPartQuantity(value, qty + 1)}>+</button>
                        </span>
                      )}
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        )}

        <div className="hud-seg hud-quality">
          <label className="hud-select">
            <span className="hs-label">Quality</span>
            <span className="hs-val"><DGauge /><span>{QUALITY_PRESETS.find((q) => q.id === quality)?.label ?? 'Standard'}</span></span>
            <span className="chev"><DChevDown /></span>
            <select value={quality} onChange={(e) => setQuality(e.target.value)} title="Surface quality" aria-label="Quality">
              {QUALITY_PRESETS.map((q) => (
                <option key={q.id} value={q.id}>{q.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="hud-seg hud-printer">
          <label className="hud-select">
            <span className="hs-label">Printer</span>
            <span className="hs-val"><DPrinter /><span>{bed.label.split(' — ')[0].replace('Bambu Lab ', '').replace('Creality ', '')}</span></span>
            <span className="chev"><DChevDown /></span>
            <select
              value={bed.id}
              onChange={(e) => {
                if (e.target.value === CUSTOM_BED_ID) setBedDialog(true)
                else setBed(e.target.value)
              }}
              title="Print bed"
              aria-label="Print bed"
            >
              {PRINTER_BEDS.map((b) => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
              <option value={CUSTOM_BED_ID}>{customBed ? `Custom — ${customBed.x}×${customBed.y}×${customBed.z}` : 'Custom…'}</option>
            </select>
          </label>
        </div>
      </div>

      {bedDialog && (
        <CustomBedDialog
          initial={customBed ?? { x: 220, y: 220, z: 250 }}
          onSave={(b) => {
            setCustomBed(b)
            setBed(CUSTOM_BED_ID)
            setBedDialog(false)
          }}
          onCancel={() => setBedDialog(false)}
        />
      )}
    </>
  )
}

export default memo(ViewportHud)

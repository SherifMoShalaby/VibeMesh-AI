import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useThree } from '@react-three/fiber'
import { Line, OrbitControls, TransformControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useStore } from '../state/store'
import { useUi } from '../state/ui'
import { CUSTOM_BED_ID, PRINTER_BEDS, QUALITY_PRESETS, resolveBed } from '../types'
import { parseStl, type ModelGeometry } from '../lib/stl'
import { canvasToChatImage, registerMultiCapture, registerViewportCanvas } from '../lib/capture'
import EmptyState from './EmptyState'
import { CustomBedDialog } from './Dialogs'
import {
  IconCenter,
  IconDrop,
  IconTrash,
  IconWarning,
  DRotate,
  DMove,
  DZoom,
  DSection,
  DRuler,
  DGrid,
  DCube,
  DReset,
  DCamera,
  DGauge,
  DPrinter,
  DChevDown,
  DUndo,
  DWrench,
} from './icons'

type ViewName = 'iso' | 'top' | 'front' | 'right'

interface ViewApi {
  setView: (v: ViewName) => void
  fit: () => void
  snapshot: () => void
}

const SELECT_HINT_KEY = 'vibemesh.hint.select.v1'

export default function Viewport() {
  const stl = useStore((s) => s.stl)
  const stlVersion = useStore((s) => s.stlVersion)
  const fitVersion = useStore((s) => s.fitVersion)
  const compileStatus = useStore((s) => s.compileStatus)
  const compileNote = useStore((s) => s.compileNote)
  const compileMs = useStore((s) => s.compileMs)
  const generating = useStore((s) => s.generating)
  const bedId = useStore((s) => s.bedId)
  const setBed = useStore((s) => s.setBed)
  const quality = useStore((s) => s.quality)
  const setQuality = useStore((s) => s.setQuality)
  const code = useStore((s) => s.code)
  const params = useStore((s) => s.params)
  const paramValues = useStore((s) => s.paramValues)
  const selectPart = useStore((s) => s.selectPart)
  const sendPrompt = useStore((s) => s.sendPrompt)
  const engine = useStore((s) => s.engine)
  const meshTransform = useStore((s) => s.meshTransform)
  const setMeshTransform = useStore((s) => s.setMeshTransform)
  const clearModel = useStore((s) => s.clearModel)
  const customBed = useStore((s) => s.customBed)
  const setCustomBed = useStore((s) => s.setCustomBed)
  const modelRemoved = useStore((s) => s.modelRemoved)
  const canUndo = useStore((s) => s.vpPast.length > 0)
  const canRedo = useStore((s) => s.vpFuture.length > 0)
  const vpUndo = useStore((s) => s.vpUndo)
  const vpRedo = useStore((s) => s.vpRedo)

  const shading = useUi((s) => s.shading)
  const bedVisible = useUi((s) => s.bedVisible)
  const setBedVisible = useUi((s) => s.setBedVisible)
  const ortho = useUi((s) => s.ortho)
  const setOrtho = useUi((s) => s.setOrtho)
  const sectionOn = useUi((s) => s.sectionOn)
  const setSectionOn = useUi((s) => s.setSectionOn)
  const sectionZ = useUi((s) => s.sectionZ)
  const setSectionZ = useUi((s) => s.setSectionZ)
  const measureMode = useUi((s) => s.measureMode)
  const setMeasureMode = useUi((s) => s.setMeasureMode)
  const selected = useUi((s) => s.selected)
  const setSelected = useUi((s) => s.setSelected)
  const gizmoMode = useUi((s) => s.gizmoMode)
  const setGizmoMode = useUi((s) => s.setGizmoMode)

  const [measurePts, setMeasurePts] = useState<THREE.Vector3[]>([])
  const groupRef = useRef<THREE.Group>(null)
  const viewApi = useRef<ViewApi | null>(null)
  const bedSelectRef = useRef<HTMLSelectElement>(null)

  const bed = resolveBed(bedId, customBed)
  const [bedDialog, setBedDialog] = useState(false)

  /* selection discoverability: hover highlight + one-time hint (UX-AUDIT F8) */
  const [hovered, setHovered] = useState(false)
  const [selectHintDone, setSelectHintDone] = useState(() => localStorage.getItem(SELECT_HINT_KEY) === '1')
  useEffect(() => {
    if (selected && !selectHintDone) {
      localStorage.setItem(SELECT_HINT_KEY, '1')
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectHintDone(true)
    }
  }, [selected, selectHintDone])


  const model = useMemo<ModelGeometry | null>(() => {
    if (!stl) return null
    try {
      return parseStl(stl)
    } catch {
      return null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stl, stlVersion])

  // deselect + clear measurements when geometry changes
  useEffect(() => {
    setSelected(false)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMeasurePts([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stlVersion])

  /** bbox of the model AFTER the viewport transform — drives dims, warnings, actions */
  const tbox = useMemo(() => {
    if (!model?.geometry.boundingBox) return null
    const box = model.geometry.boundingBox.clone()
    if (meshTransform) box.applyMatrix4(matrixOf(meshTransform))
    const size = new THREE.Vector3()
    box.getSize(size)
    const center = new THREE.Vector3()
    box.getCenter(center)
    return { box, size, center, minZ: box.min.z }
  }, [model, meshTransform])

  const overBed = tbox ? tbox.size.x > bed.x || tbox.size.y > bed.y || tbox.size.z > bed.z : false
  const showEmpty = !code.trim() && !generating && !model

  /* growth can silently run off-frame under camera-keep — offer a way back (UX-AUDIT F15) */
  const fitRadiusRef = useRef(0)
  const [outOfView, setOutOfView] = useState(false)
  const radiusOf = (t: NonNullable<TBox>) => Math.max(t.size.x, t.size.y, t.size.z)
  const markFitted = () => {
    if (tbox) fitRadiusRef.current = radiusOf(tbox)
    setOutOfView(false)
  }
  const markFittedRef = useRef(markFitted)
  useEffect(() => {
    markFittedRef.current = markFitted
  })
  const doFit = () => {
    viewApi.current?.fit()
    markFitted()
  }
  useEffect(() => {
    markFittedRef.current() // auto-fit just framed the model
  }, [fitVersion])
  useEffect(() => {
    if (!tbox) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOutOfView(false)
      return
    }
    if (fitRadiusRef.current === 0) fitRadiusRef.current = radiusOf(tbox)
    setOutOfView(radiusOf(tbox) > fitRadiusRef.current * 1.8)
  }, [tbox])

  // multi-part designs expose an enum parameter named `part`
  const partParam = params.find((p) => p.name === 'part' && p.kind === 'enum')
  const currentPart = partParam ? String(paramValues.part ?? partParam.defaultValue) : null
  const isAssemblyPreview = partParam !== undefined && currentPart === 'all'

  // section plane (z cut, fraction of model height)
  const clipPlanes = useMemo(() => {
    if (!sectionOn || !tbox) return undefined
    const cut = tbox.box.min.z + sectionZ * (tbox.box.max.z - tbox.box.min.z)
    return [new THREE.Plane(new THREE.Vector3(0, 0, -1), cut)]
  }, [sectionOn, sectionZ, tbox])

  const edgesGeometry = useMemo(() => {
    if (!model || shading !== 'edges') return null
    return new THREE.EdgesGeometry(model.geometry, 20)
  }, [model, shading])

  /* ── selection actions ── */
  const commitTransform = () => {
    const g = groupRef.current
    if (!g) return
    setMeshTransform({
      position: [g.position.x, g.position.y, g.position.z],
      rotation: [g.rotation.x, g.rotation.y, g.rotation.z],
    })
  }
  const centerOnBed = () => {
    const g = groupRef.current
    if (!g || !tbox) return
    g.position.x -= tbox.center.x
    g.position.y -= tbox.center.y
    commitTransform()
  }
  const dropToBed = () => {
    const g = groupRef.current
    if (!g || !tbox) return
    g.position.z -= tbox.minZ
    commitTransform()
  }
  const deleteModel = () => {
    setSelected(false)
    clearModel()
  }
  const resetTransform = () => {
    const g = groupRef.current
    if (g) {
      g.position.set(0, 0, 0)
      g.rotation.set(0, 0, 0)
    }
    setMeshTransform(null)
  }

  /* ── keyboard: F fit · Esc deselect · Del delete · ⌘Z/⇧⌘Z undo/redo ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return
      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault()
          if (e.shiftKey) useStore.getState().vpRedo()
          else useStore.getState().vpUndo()
        }
        if (e.key === 'y') {
          e.preventDefault()
          useStore.getState().vpRedo()
        }
        if (e.key === 'Enter') {
          e.preventDefault()
          if (useStore.getState().code.trim()) useStore.getState().recompile()
        }
        return
      }
      if (e.key === 'f' || e.key === 'F') {
        viewApi.current?.fit()
        markFittedRef.current()
      }
      if (e.key === 'Escape') {
        setSelected(false)
        setMeasureMode(false)
        setMeasurePts([])
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && useUi.getState().selected) deleteModel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const measureDistance = measurePts.length === 2 ? measurePts[0].distanceTo(measurePts[1]) : null

  return (
    <section className="pane viewport-pane">
    <main
      className="viewport"
      onDoubleClick={(e) => {
        // double-click on the 3D canvas (not HUD controls) = fit, like F
        if ((e.target as HTMLElement).tagName === 'CANVAS') doFit()
      }}
    >
      <div className="bed" />
      <div className="viewport-vignette" />
      <div className="model-wrap">
      <Canvas
        camera={{ up: [0, 0, 1], position: [180, -180, 140], fov: 40, near: 0.5, far: 5000 }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        dpr={[1, 2]}
        orthographic={ortho}
        onCreated={({ gl }) => {
          gl.localClippingEnabled = true
          registerViewportCanvas(gl.domElement)
        }}
        onPointerMissed={() => setSelected(false)}
      >
        <color attach="background" args={['#2f3236']} />
        <hemisphereLight args={['#cdd6e0', '#23262b', 0.85]} />
        <directionalLight position={[180, -140, 260]} intensity={1.25} />
        <directionalLight position={[-160, 120, 80]} intensity={0.35} color="#9fb4ff" />
        <PrintBed x={bed.x} y={bed.y} visible={bedVisible} />

        {model && (
          <group
            ref={groupRef}
            position={meshTransform?.position ?? [0, 0, 0]}
            rotation={meshTransform?.rotation ?? [0, 0, 0]}
          >
            <mesh
              geometry={model.geometry}
              onClick={(e) => {
                if (measureMode) return
                e.stopPropagation()
                setSelected(true)
              }}
              onPointerOver={(e) => {
                e.stopPropagation()
                setHovered(true)
                document.body.style.cursor = measureMode ? 'crosshair' : 'pointer'
              }}
              onPointerOut={() => {
                setHovered(false)
                document.body.style.cursor = ''
              }}
              onPointerDown={(e) => {
                if (!measureMode) return
                e.stopPropagation()
                setMeasurePts((prev) => (prev.length >= 2 ? [e.point.clone()] : [...prev, e.point.clone()]))
              }}
            >
              <meshStandardMaterial
                color="#b9bdc6"
                roughness={0.55}
                metalness={0.12}
                flatShading
                wireframe={shading === 'wireframe'}
                clippingPlanes={clipPlanes}
                emissive={selected ? '#8a4012' : hovered && !measureMode ? '#3a2a18' : '#000000'}
                side={THREE.DoubleSide}
              />
            </mesh>
            {edgesGeometry && (
              <lineSegments geometry={edgesGeometry}>
                <lineBasicMaterial color="#2a2c30" clippingPlanes={clipPlanes} />
              </lineSegments>
            )}
          </group>
        )}

        {selected && model && (
          <TransformControls object={groupRef as never} mode={gizmoMode} size={0.7} onMouseUp={commitTransform} />
        )}

        {measurePts.map((p, i) => (
          <mesh key={i} position={p}>
            <sphereGeometry args={[Math.max((tbox?.size.length() ?? 60) / 150, 0.6), 12, 12]} />
            <meshBasicMaterial color="#ff8d49" />
          </mesh>
        ))}
        {measurePts.length === 2 && (
          <Line points={[measurePts[0].toArray(), measurePts[1].toArray()]} color="#ff8d49" lineWidth={2} dashed dashScale={2} />
        )}

        <CameraFit tbox={tbox} version={fitVersion} />
        <CaptureRig tbox={tbox} hasModel={Boolean(model)} />
        <ViewRig tbox={tbox} apiRef={viewApi} fileBase="viewport" />
        <OrbitControlsZUp />
      </Canvas>
      </div>

      {/* ── vertical tool rail ── */}
      {!showEmpty && (
        <div className="tool-rail" role="toolbar" aria-label="Viewport tools">
          <button
            className={`tool-btn${!measureMode && !selected ? ' active' : ''}`}
            data-tip="Orbit"
            aria-label="Orbit"
            onClick={() => {
              setMeasureMode(false)
              setMeasurePts([])
              setSelected(false)
            }}
          >
            <DRotate />
          </button>
          <button
            className={`tool-btn${selected ? ' active' : ''}`}
            data-tip="Move / rotate part"
            aria-label="Move or rotate part"
            disabled={!model}
            onClick={() => setSelected(true)}
          >
            <DMove />
          </button>
          <button className="tool-btn" data-tip="Zoom to fit (F)" aria-label="Zoom to fit" onClick={doFit}>
            <DZoom />
          </button>
          <div className="rail-sep" />
          <button
            className={`tool-btn${sectionOn ? ' active' : ''}`}
            data-tip="Section view"
            aria-label="Section view"
            onClick={() => setSectionOn(!sectionOn)}
          >
            <DSection />
          </button>
          <button
            className={`tool-btn${measureMode ? ' active' : ''}`}
            data-tip="Measure"
            aria-label="Measure"
            onClick={() => {
              setMeasureMode(!measureMode)
              setMeasurePts([])
            }}
          >
            <DRuler />
          </button>
          <button
            className={`tool-btn${bedVisible ? ' active' : ''}`}
            data-tip="Toggle bed grid"
            aria-label="Toggle bed grid"
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
            aria-label="Toggle projection"
            onClick={() => setOrtho(!ortho)}
          >
            <DReset />
          </button>
          <button className="tool-btn" data-tip="Snapshot PNG" aria-label="Snapshot PNG" onClick={() => viewApi.current?.snapshot()}>
            <DCamera />
          </button>
          <div className="rail-sep" />
          <button className="tool-btn" disabled={!canUndo} data-tip="Undo (⌘Z)" aria-label="Undo placement" onClick={vpUndo}>
            <DUndo />
          </button>
          <button className="tool-btn" disabled={!canRedo} data-tip="Redo (⇧⌘Z)" aria-label="Redo placement" onClick={vpRedo}>
            <span style={{ display: 'grid', transform: 'scaleX(-1)' }}><DUndo /></span>
          </button>
        </div>
      )}

      {sectionOn && !showEmpty && (
        <div className="section-slider" title="Section height">
          <input type="range" min={0} max={1} step={0.01} value={sectionZ} onChange={(e) => setSectionZ(Number(e.target.value))} />
        </div>
      )}

      {/* ── perf readout (top-right) ── */}
      {model && (
        <div className="perf-chip">
          <span>{model.triangles.toLocaleString()} tris</span>
        </div>
      )}

      {/* ── assembly / placement readout (bottom-left) ── */}
      {!showEmpty && (model || measureMode) && (
        <div className="assembly-chip">
          {measureMode ? (
            <>
              <span className="ac-label">Measure</span>
              <span className="ac-hint">
                {measureDistance !== null
                  ? `${measureDistance.toFixed(2)} mm`
                  : `click ${2 - measurePts.length} point${measurePts.length === 1 ? '' : 's'} on the model`}
              </span>
            </>
          ) : (
            <>
              <span className="ac-label">
                {isAssemblyPreview ? 'Assembly preview' : currentPart ? `Part · ${currentPart}` : 'Model'}
              </span>
              <span className="ac-hint">
                Drag to orbit · <kbd>Scroll</kbd> zoom · <kbd>F</kbd> frame
              </span>
              {isAssemblyPreview && <span className="ac-hint">check each part below for bed fit</span>}
              {meshTransform && <span className="ac-hint">moved — placement is saved into exports</span>}
              {tbox && tbox.minZ < -0.01 && (
                <span className="ac-warn">
                  <IconWarning /> below bed (z={tbox.minZ.toFixed(1)}) ·{' '}
                  <button className="banner-link" onClick={dropToBed}>drop to bed</button>
                </span>
              )}
              {overBed && !isAssemblyPreview && engine && (
                <button
                  className="split-btn"
                  disabled={generating}
                  onClick={() =>
                    void sendPrompt(
                      partParam && currentPart
                        ? `The piece "${currentPart}" is ${tbox!.size.x.toFixed(0)}×${tbox!.size.y.toFixed(0)}×${tbox!.size.z.toFixed(0)}mm and still exceeds my ${bed.x}×${bed.y}×${bed.z}mm print bed. Split this piece further (dovetail, pinned joint, or flat mating faces with screw bosses), keeping the existing "part" selector convention so every piece fits the bed.`
                        : `This design is ${tbox!.size.x.toFixed(0)}×${tbox!.size.y.toFixed(0)}×${tbox!.size.z.toFixed(0)}mm and exceeds my ${bed.x}×${bed.y}×${bed.z}mm print bed. Split it into separately printable pieces using an enum parameter named "part" (with "all" as assembly preview), each piece flat at z=0 in print orientation and fitting the bed, with proper joint clearances.`,
                      undefined,
                      'Split request',
                    )
                  }
                >
                  <DWrench /> Ask AI to split into printable parts
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ── selection toolbar (floats above HUD bar) ── */}
      {selected && model && (
        <div className="sel-bar">
          <button className={`plate-chip${gizmoMode === 'translate' ? ' active' : ''}`} onClick={() => setGizmoMode('translate')} title="Move gizmo">
            <DMove /> Move
          </button>
          <button className={`plate-chip${gizmoMode === 'rotate' ? ' active' : ''}`} onClick={() => setGizmoMode('rotate')} title="Rotate gizmo">
            <DRotate /> Rotate
          </button>
          <button className="plate-chip" onClick={centerOnBed} title="Center on the bed (XY)">
            <IconCenter /> Center
          </button>
          <button className="plate-chip" onClick={dropToBed} title="Sit flat on the bed (Z=0)">
            <IconDrop /> Drop
          </button>
          {meshTransform && (
            <button className="plate-chip" onClick={resetTransform} title="Reset placement to the code's position">
              <DUndo /> Reset
            </button>
          )}
          <button className="plate-chip danger" onClick={deleteModel} title="Remove from view only — your design is kept and undo brings it back">
            <IconTrash /> Remove
          </button>
        </div>
      )}

      {/* ── UNIFIED HUD BAR ── */}
      {!showEmpty && (
        <div className="hud-bar">
          <div className="hud-seg">
            <div className="hud-status">
              {(() => {
                if (compileStatus === 'error')
                  return (
                    <>
                      <span className="status-dot err" />
                      <span>Render failed</span>
                      <span className="time">· open Code to fix</span>
                    </>
                  )
                if (compileStatus === 'compiling')
                  return (<><span className="status-dot busy" /><span>Rendering…</span></>)
                if (generating)
                  return (<><span className="status-dot busy" /><span>AI is designing…</span></>)
                if (modelRemoved && !model && compileStatus === 'idle')
                  return (
                    <>
                      <span className="status-dot warn" />
                      <span>Removed from view</span>
                      <span className="time">· <button className="banner-link" onClick={vpUndo}>undo</button></span>
                    </>
                  )
                if (compileStatus === 'ok' && compileNote)
                  return (<><span className="status-dot warn" /><span>{compileNote}</span></>)
                if (outOfView && model)
                  return (
                    <>
                      <span className="status-dot warn" />
                      <span>Grew out of view</span>
                      <span className="time">· <button className="banner-link" onClick={doFit}>fit</button></span>
                    </>
                  )
                if (model && compileStatus === 'ok')
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

          {tbox && (
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

          {partParam && (
            <div className="hud-seg hud-parts">
              <span className="dim-label">Parts</span>
              <div className="part-tog">
                {(partParam.options ?? []).map((opt) => {
                  const value = String(opt)
                  const busy = currentPart === value && compileStatus === 'compiling'
                  return (
                    <button
                      key={value}
                      className={`${currentPart === value ? 'active' : ''}${busy ? ' busy' : ''}`}
                      disabled={busy}
                      onClick={() => void selectPart(value)}
                    >
                      {value === 'all' ? 'All' : value}
                      {value === 'all' && <span className="pc">{(partParam.options?.length ?? 1) - 1}</span>}
                      {busy && <span className="status-dot busy" style={{ marginLeft: 6 }} />}
                    </button>
                  )
                })}
              </div>
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
                ref={bedSelectRef}
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
      )}

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

      {showEmpty && <EmptyState />}
    </main>
    </section>
  )
}

function fmtMs(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

function matrixOf(t: { position: [number, number, number]; rotation: [number, number, number] }): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...t.position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...t.rotation, 'XYZ')),
    new THREE.Vector3(1, 1, 1),
  )
}

type TBox = { box: THREE.Box3; size: THREE.Vector3; center: THREE.Vector3; minZ: number } | null

function OrbitControlsZUp() {
  return <OrbitControls makeDefault enableDamping dampingFactor={0.12} minDistance={20} maxDistance={2000} />
}

/** Standard views + fit + snapshot, registered for the toolbar. */
function ViewRig({ tbox, apiRef }: { tbox: TBox; apiRef: React.MutableRefObject<ViewApi | null>; fileBase: string }) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  const size = useThree((s) => s.size)

  useEffect(() => {
    const frame = (dir: THREE.Vector3) => {
      const target = tbox ? new THREE.Vector3(tbox.center.x, tbox.center.y, tbox.center.y * 0 + tbox.box.min.z + tbox.size.z / 2) : new THREE.Vector3(0, 0, 20)
      const radius = tbox ? Math.max(tbox.size.x, tbox.size.y, tbox.size.z, 20) : 120
      const dist = radius * 2.4
      camera.position.copy(target.clone().add(dir.clone().normalize().multiplyScalar(dist)))
      camera.up.set(0, 0, 1)
      camera.lookAt(target)
      if (camera instanceof THREE.OrthographicCamera) {
        camera.zoom = Math.min(size.width, size.height) / (radius * 2.6)
        camera.updateProjectionMatrix()
      }
      if (controls) {
        controls.target.copy(target)
        controls.update()
      }
    }
    apiRef.current = {
      setView: (v) => {
        if (v === 'iso') frame(new THREE.Vector3(1, -1, 0.75))
        if (v === 'top') frame(new THREE.Vector3(0.001, -0.001, 1))
        if (v === 'front') frame(new THREE.Vector3(0, -1, 0.0001))
        if (v === 'right') frame(new THREE.Vector3(1, 0, 0.0001))
      },
      fit: () => {
        const dir = camera.position
          .clone()
          .sub(controls?.target ?? new THREE.Vector3())
          .normalize()
        frame(dir.lengthSq() > 0.001 ? dir : new THREE.Vector3(1, -1, 0.75))
      },
      snapshot: () => {
        const url = gl.domElement.toDataURL('image/png')
        const a = document.createElement('a')
        a.href = url
        a.download = `vibemesh-ai-view-${Date.now() % 100000}.png`
        a.click()
      },
    }
    return () => {
      apiRef.current = null
    }
  }, [tbox, camera, gl, controls, size, apiRef])

  return null
}

/**
 * Registers the refine snapshots: three fixed poses (isometric, front, top)
 * fitted to the model, so refine passes always compare from the SAME viewpoints
 * regardless of how the user orbited — and the model sees angles a single iso
 * view hides (true proportions, hole/feature counts on each face).
 */
function CaptureRig({ tbox, hasModel }: { tbox: TBox; hasModel: boolean }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)

  useEffect(() => {
    registerMultiCapture((maxDim = 896) => {
      if (!hasModel || !tbox) return []
      const prevPos = camera.position.clone()
      const prevQuat = camera.quaternion.clone()
      const prevUp = camera.up.clone()
      const radius = Math.max(tbox.size.x, tbox.size.y, tbox.size.z, 20)
      const dist = radius * 2.2
      const target = new THREE.Vector3(tbox.center.x, tbox.center.y, tbox.box.min.z + tbox.size.z / 2)
      const zUp = new THREE.Vector3(0, 0, 1)
      const shoot = (pos: THREE.Vector3, up: THREE.Vector3) => {
        camera.up.copy(up)
        camera.position.copy(pos)
        camera.lookAt(target)
        gl.render(scene, camera)
        return canvasToChatImage(gl.domElement, maxDim)
      }
      // isometric, front (down -Y), top (down -Z, Y-up to avoid gimbal lock)
      const views = [
        shoot(new THREE.Vector3(target.x + dist * 0.707, target.y - dist * 0.707, target.z + dist * 0.577), zUp),
        shoot(new THREE.Vector3(target.x, target.y - dist, target.z), zUp),
        shoot(new THREE.Vector3(target.x, target.y, target.z + dist), new THREE.Vector3(0, 1, 0)),
      ].filter((v): v is NonNullable<typeof v> => v !== null)
      camera.up.copy(prevUp)
      camera.position.copy(prevPos)
      camera.quaternion.copy(prevQuat)
      gl.render(scene, camera)
      return views
    })
    return () => registerMultiCapture(null)
  }, [tbox, hasModel, gl, scene, camera])

  return null
}

/** Re-frame the camera when a new model arrives. */
function CameraFit({ tbox, version }: { tbox: TBox; version: number }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  const lastFitted = useRef(-1)

  useEffect(() => {
    if (!tbox || version === lastFitted.current) return
    lastFitted.current = version
    const radius = Math.max(tbox.size.x, tbox.size.y, tbox.size.z, 20)
    const dist = radius * 2.4
    const target = new THREE.Vector3(tbox.center.x, tbox.center.y, tbox.box.min.z + tbox.size.z / 2)
    camera.position.set(tbox.center.x + dist * 0.8, tbox.center.y - dist * 0.9, target.z + dist * 0.65)
    camera.lookAt(target)
    if (controls) {
      controls.target.copy(target)
      controls.update()
    }
  }, [tbox, version, camera, controls])

  return null
}

/** Blueprint-style print bed: minor/major grid, border, origin marker, ghost plate. */
function PrintBed({ x, y, visible }: { x: number; y: number; visible: boolean }) {
  const lines = useMemo(() => {
    const minor: number[] = []
    const major: number[] = []
    const hx = x / 2
    const hy = y / 2
    for (let gx = -hx; gx <= hx + 0.001; gx += 10) {
      const arr = Math.round(gx) % 50 === 0 ? major : minor
      arr.push(gx, -hy, 0, gx, hy, 0)
    }
    for (let gy = -hy; gy <= hy + 0.001; gy += 10) {
      const arr = Math.round(gy) % 50 === 0 ? major : minor
      arr.push(-hx, gy, 0, hx, gy, 0)
    }
    const border = [-hx, -hy, 0, hx, -hy, 0, hx, -hy, 0, hx, hy, 0, hx, hy, 0, -hx, hy, 0, -hx, hy, 0, -hx, -hy, 0]
    return { minor: new Float32Array(minor), major: new Float32Array(major), border: new Float32Array(border) }
  }, [x, y])

  if (!visible) return null
  return (
    <group>
      <GridLines points={lines.minor} color="#3c3f44" />
      <GridLines points={lines.major} color="#4a4e54" />
      <GridLines points={lines.border} color="#5c6066" />
      {/* axis stubs at origin */}
      <GridLines points={new Float32Array([0, 0, 0, 25, 0, 0])} color="#e0533d" />
      <GridLines points={new Float32Array([0, 0, 0, 0, 25, 0])} color="#3f9e58" />
      <GridLines points={new Float32Array([0, 0, 0.01, 0, 0, 25])} color="#3f7fbf" />
      {/* ghost plate — translucent so the model is visible from below */}
      <mesh position={[0, 0, -0.3]}>
        <boxGeometry args={[x + 14, y + 14, 0.5]} />
        <meshStandardMaterial color="#232529" roughness={0.9} metalness={0} transparent opacity={0.5} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function GridLines({ points, color }: { points: Float32Array; color: string }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(points, 3))
    return g
  }, [points])
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={color} />
    </lineSegments>
  )
}

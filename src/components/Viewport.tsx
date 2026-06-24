import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { Line, OrbitControls, TransformControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { useStore } from '../state/store'
import { useUi } from '../state/ui'
import { resolveBed } from '../types'
import { parseStl, type ModelGeometry } from '../lib/stl'
import { analyzePrintability, type PrintabilityReport } from '../lib/printability'
import { meshTint } from '../lib/viewportTint'
import { effectivePlacements, baseName, type Placement } from '../lib/packPlates'
import { CAPTURE_VIEW_NAMES, canvasToChatImage, registerMultiCapture, registerViewportCanvas } from '../lib/capture'
import type { CaptureViewName } from '../lib/capture'
import EmptyState from './EmptyState'
import ViewportToolRail from './ViewportToolRail'
import ViewportHud from './ViewportHud'
import {
  IconCenter,
  IconDrop,
  IconTrash,
  IconWarning,
  DRotate,
  DMove,
  DUndo,
  DWrench,
} from './icons'

type ViewName = 'iso' | 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right'

export interface ViewApi {
  setView: (v: ViewName) => void
  fit: () => void
  snapshot: () => void
}

const SELECT_HINT_KEY = 'vibemesh.hint.select.v1'
/** gap (mm) between bed plates laid out in the slicer scene */
const PLATE_GAP = 40
const EMPTY_QTY: Record<string, number> = {} // stable ref so the partQuantities selector fallback doesn't churn renders

export default function Viewport() {
  const stl = useStore((s) => s.stl)
  const stlVersion = useStore((s) => s.stlVersion)
  const fitVersion = useStore((s) => s.fitVersion)
  const compileStatus = useStore((s) => s.compileStatus)
  const generating = useStore((s) => s.generating)
  const bedId = useStore((s) => s.bedId)
  const code = useStore((s) => s.code)
  const params = useStore((s) => s.params)
  const paramValues = useStore((s) => s.paramValues)
  const sendPrompt = useStore((s) => s.sendPrompt)
  const engine = useStore((s) => s.engine)
  const meshTransform = useStore((s) => s.meshTransform)
  const setMeshTransform = useStore((s) => s.setMeshTransform)
  const clearModel = useStore((s) => s.clearModel)
  const customBed = useStore((s) => s.customBed)
  const viewMode = useStore((s) => s.viewMode)
  const pieces = useStore((s) => s.pieces)
  const partQuantities = useStore((s) => s.projects.find((p) => p.id === s.activeId)?.partQuantities ?? EMPTY_QTY)
  const pieceOverrides = useStore((s) => s.pieceOverrides)
  const setPieceOverride = useStore((s) => s.setPieceOverride)
  const removePieceOverride = useStore((s) => s.removePieceOverride)
  const clearPieceOverrides = useStore((s) => s.clearPieceOverrides)
  const selectedPiece = useUi((s) => s.selectedPiece)
  const slicing = useStore((s) => s.slicing)
  const slicerFailed = useStore((s) => s.slicerFailed)
  const compilePieces = useStore((s) => s.compilePieces)
  const setViewMode = useStore((s) => s.setViewMode)

  const shading = useUi((s) => s.shading)
  const xray = useUi((s) => s.xray)
  const bedVisible = useUi((s) => s.bedVisible)
  const ortho = useUi((s) => s.ortho)
  const measureMode = useUi((s) => s.measureMode)
  const setMeasureMode = useUi((s) => s.setMeasureMode)
  const selected = useUi((s) => s.selected)
  const setSelected = useUi((s) => s.setSelected)
  const setSelectedPiece = useUi((s) => s.setSelectedPiece)
  const gizmoMode = useUi((s) => s.gizmoMode)
  const setGizmoMode = useUi((s) => s.setGizmoMode)

  const [measurePts, setMeasurePts] = useState<THREE.Vector3[]>([])
  const groupRef = useRef<THREE.Group>(null)
  const materialRef = useRef<THREE.MeshStandardMaterial>(null)
  const viewApi = useRef<ViewApi | null>(null)
  const reduce = usePrefersReducedMotion()

  const bed = resolveBed(bedId, customBed)

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

  // free the previous geometry's GPU buffers when it's replaced (r3f never disposes a geometry
  // passed as a prop — it may be owned outside React — so each re-render would otherwise leak one)
  useEffect(() => () => model?.geometry.dispose(), [model])

  // deselect + clear measurements when geometry changes
  useEffect(() => {
    setSelected(false)
    setSelectedPiece(null)
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
  // stable identities so the extracted, memoized ToolRail doesn't re-render with the parent
  const doFit = useCallback(() => {
    viewApi.current?.fit()
    markFittedRef.current()
  }, [])
  const resetMeasure = useCallback(() => setMeasurePts([]), [])
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

  // Slicer convention (Bambu/Prusa/Cura): a part that overruns the build volume is tinted RED so
  // the "this won't fit" read is instant, before the user even checks the verdict chip. The color
  // contract (incl. the assembly-preview exemption) lives in the pure `meshTint` so the unit net
  // can lock it without WebGL.
  const { color: meshColor, emissive: meshEmissive } = meshTint({ overBed, isAssemblyPreview, selected, hovered, measureMode })

  // ── slicer (multi-plate) view: pack each compiled piece onto bed-sized plates ──
  const platesView = viewMode === 'plates' && partParam !== undefined

  // AI-free printability verdict (off the compile hot path — recomputes only when the
  // mesh / placement / bed changes, never per render). Skipped in the plates/slicer view.
  const printability = useMemo<PrintabilityReport | null>(() => {
    if (!tbox || platesView) return null
    return analyzePrintability({ size: tbox.size, minZ: tbox.minZ, bed, stl, isAssembly: isAssemblyPreview })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stl, stlVersion, tbox, bed.x, bed.y, bed.z, isAssemblyPreview, platesView])
  const sliceGeos = useMemo(() => {
    const m = new Map<string, ModelGeometry>()
    for (const p of pieces ?? []) {
      try {
        m.set(p.name, parseStl(p.stl))
      } catch {
        /* skip unparseable piece */
      }
    }
    return m
  }, [pieces])
  // these BufferGeometries are passed to <mesh> as a PROP, so r3f never owns or disposes them.
  // pieces is rebuilt on every recompile/part-switch — free the previous set or VRAM grows
  // unbounded (eventual WebGL context loss). Cleanup runs when sliceGeos changes and on unmount.
  useEffect(() => {
    return () => {
      for (const g of sliceGeos.values()) g.geometry.dispose()
    }
  }, [sliceGeos])
  const platePlan = useMemo(() => {
    if (!pieces) return null
    // effectivePlacements = the SAME packer + qty expansion both .3mf export paths run, THEN the
    // per-piece Arrange overrides applied on top (WYSIWYG: preview == export). Replicas get unique
    // keys (lid#0…); the count is clamped, not the render. oversize is deduped back to base names.
    const plan = effectivePlacements(
      pieces.map((p) => ({ name: p.name, w: p.bbox.x, h: p.bbox.y, z: p.bbox.z })),
      (name) => partQuantities[name] ?? 1,
      { x: bed.x, y: bed.y, z: bed.z },
      pieceOverrides,
    )
    const seen = new Set<string>()
    const oversize = plan.oversize
      .filter((o) => { const b = baseName(o.name); if (seen.has(b)) return false; seen.add(b); return true })
      .map((o) => ({ name: baseName(o.name), reason: o.reason }))
    // off-bed / overlap re-validation (Phase 4): a nudged-off-bed or colliding piece must warn as
    // loudly as a packer oversize — fold it into the SAME readout the packer's oversize feeds.
    const offBed = validateLayout(plan.plates, { x: bed.x, y: bed.y })
    const combined = [...oversize]
    const known = new Set(oversize.map((o) => o.name))
    for (const o of offBed) if (!known.has(o.name)) { known.add(o.name); combined.push(o) }
    return { plates: plan.plates, oversize: combined }
  }, [pieces, partQuantities, pieceOverrides, bed.x, bed.y, bed.z])
  const platesTbox = useMemo<TBox>(() => {
    if (!platePlan || platePlan.plates.length === 0) return null
    const n = platePlan.plates.length
    const totalW = n * bed.x + (n - 1) * PLATE_GAP
    // only pieces actually placed on a plate drive the framed height — an oversize piece is
    // excluded from every plate, so including its z would zoom the camera out for nothing
    // (placements carry unique replica keys; resolve back to the base piece name)
    const placed = new Set(platePlan.plates.flat().map((p) => baseName(p.name)))
    const maxZ = Math.max(0.1, ...(pieces ?? []).filter((p) => placed.has(p.name)).map((p) => p.bbox.z))
    const box = new THREE.Box3(new THREE.Vector3(-totalW / 2, -bed.y / 2, 0), new THREE.Vector3(totalW / 2, bed.y / 2, maxZ))
    const size = new THREE.Vector3()
    box.getSize(size)
    const center = new THREE.Vector3()
    box.getCenter(center)
    return { box, size, center, minZ: 0 }
  }, [platePlan, bed.x, bed.y, pieces])
  const activeTbox = platesView ? platesTbox : tbox

  // (re)build the slicer pieces when entering plates view or after a re-render invalidated them
  useEffect(() => {
    if (platesView && !pieces && !slicing && code.trim()) void compilePieces()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platesView, pieces, slicing])

  const edgesGeometry = useMemo(() => {
    if (!model || shading !== 'edges') return null
    return new THREE.EdgesGeometry(model.geometry, 20)
  }, [model, shading])
  // same as the model geometry: dispose the previous EdgesGeometry when it changes (prop geometry, not auto-freed)
  useEffect(() => () => edgesGeometry?.dispose(), [edgesGeometry])

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

  /* ── per-piece arrange actions (plates view) ── */
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

  /* ── keyboard: F fit · Esc deselect · Del delete · ⌘Z/⇧⌘Z undo/redo ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      // never hijack keys while typing — the CodeMirror editor is a contentEditable
      // div (not INPUT/TEXTAREA), so its ⌘Z must undo code, not viewport placement,
      // and Backspace must not delete the selected model out from under the caret.
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) return
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
      // BambuStudio/Orca standard-view hotkeys: 0=iso, 1=top, 2=bottom, 3=front, 4=back, 5=left, 6=right
      const VIEW_KEYS: Record<string, ViewName> = { '0': 'iso', '1': 'top', '2': 'bottom', '3': 'front', '4': 'back', '5': 'left', '6': 'right' }
      if (VIEW_KEYS[e.key]) {
        viewApi.current?.setView(VIEW_KEYS[e.key])
        markFittedRef.current()
      }
      if (e.key === 'Escape') {
        setSelected(false)
        setSelectedPiece(null)
        setMeasureMode(false)
        setMeasurePts([])
      }
      // Delete/Backspace removes the whole model — gate STRICTLY on the move-mode boolean.
      // A piece selection (selectedPiece) must NEVER trigger clearModel() (project-geometry wipe);
      // per-piece delete is handled in the arrange surface in a later phase, not here.
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
      data-compiling={compileStatus === 'compiling' || undefined}
      onDoubleClick={(e) => {
        // double-click on the 3D canvas (not HUD controls) = fit, like F
        if ((e.target as HTMLElement).tagName === 'CANVAS') doFit()
      }}
    >
      <div className="bed" />
      <div className="viewport-vignette" />
      <div className="model-wrap">
      <Canvas
        // frameloop='demand' (ADR 0001): render only on invalidate — at idle the rAF stops, so the
        // glass overlays cost nothing. OrbitControls/TransformControls invalidate on 'change' (damping
        // stays smooth); every self-driving useFrame rig here (CameraFit, SpawnRig) MUST invalidate()
        // each tick or it freezes after one frame.
        frameloop="demand"
        // r3f only builds the camera once (it does NOT swap type when `orthographic` flips
        // post-mount), so key the Canvas on the projection to remount with the correct camera
        // type. ProjectionFit re-frames on (re)mount, which also sets the orthographic zoom.
        key={ortho ? 'ortho' : 'persp'}
        camera={{ up: [0, 0, 1], position: [180, -180, 140], fov: 40, near: 0.5, far: 5000 }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        dpr={[1, 2]}
        orthographic={ortho}
        onCreated={({ gl }) => {
          registerViewportCanvas(gl.domElement)
        }}
        onPointerMissed={() => {
          setSelected(false)
          setSelectedPiece(null)
        }}
      >
        <color attach="background" args={['#2f3236']} />
        <hemisphereLight args={['#cdd6e0', '#23262b', 0.85]} />
        <directionalLight position={[180, -140, 260]} intensity={1.25} />
        <directionalLight position={[-160, 120, 80]} intensity={0.35} color="#9fb4ff" />
        <StudioEnvironment />
        {!platesView && <PrintBed x={bed.x} y={bed.y} visible={bedVisible} />}

        {platesView && platePlan && <SlicerScene plates={platePlan.plates} geos={sliceGeos} bed={bed} />}

        {!platesView && model && (
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
                ref={materialRef}
                color={meshColor}
                roughness={0.55}
                metalness={0.12}
                flatShading={shading === 'flat'}
                wireframe={shading === 'wireframe'}
                emissive={meshEmissive}
                side={THREE.DoubleSide}
              />
            </mesh>
            {edgesGeometry && (
              <lineSegments geometry={edgesGeometry}>
                <lineBasicMaterial color="#2a2c30" />
              </lineSegments>
            )}
          </group>
        )}

        {!platesView && selected && model && (
          <TransformControls object={groupRef as never} mode={gizmoMode} size={0.7} onMouseUp={commitTransform} />
        )}

        {!platesView && measurePts.map((p, i) => (
          <mesh key={i} position={p}>
            <sphereGeometry args={[Math.max((tbox?.size.length() ?? 60) / 150, 0.6), 12, 12]} />
            <meshBasicMaterial color="#ff8d49" />
          </mesh>
        ))}
        {!platesView && measurePts.length === 2 && (
          <Line points={[measurePts[0].toArray(), measurePts[1].toArray()]} color="#ff8d49" lineWidth={2} dashed dashScale={2} />
        )}

        <CameraFit tbox={activeTbox} version={fitVersion} reduce={Boolean(reduce)} />
        <SpawnRig groupRef={groupRef} matRef={materialRef} version={stlVersion} reduce={Boolean(reduce)} xray={xray} />
        <CaptureRig tbox={tbox} hasModel={Boolean(model)} />
        <ViewRig tbox={activeTbox} apiRef={viewApi} fileBase="viewport" />
        <OrbitControlsZUp />
        <ProjectionFit apiRef={viewApi} />
      </Canvas>
      </div>

      {/* ── vertical tool rail ── */}
      {!showEmpty && (
        <ViewportToolRail
          hasModel={!!model}
          platesView={platesView}
          viewApi={viewApi}
          doFit={doFit}
          onResetMeasure={resetMeasure}
        />
      )}

      {/* ── perf readout (top-right) ── */}
      {!platesView && model && (
        <div className="perf-chip">
          <span>{model.triangles.toLocaleString()} tris</span>
        </div>
      )}

      {/* ── slicer readout (bottom-left) — oversize pieces are surfaced LOUDLY ── */}
      {platesView && (
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
      )}

      {/* ── assembly / placement readout (bottom-left) ── */}
      {!platesView && !showEmpty && (model || measureMode) && (
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
                Drag orbit · <kbd>right</kbd>/<kbd>middle</kbd> pan · <kbd>scroll</kbd> zoom · <kbd>F</kbd> fit · <kbd>0</kbd>–<kbd>6</kbd> views
              </span>
              {isAssemblyPreview && (
                <>
                  <span className="ac-hint">
                    assembled preview — pieces are laid out on the bed in the Slicer view
                  </span>
                  <button
                    className={`split-btn${overBed ? ' arrange-suggest' : ''}`}
                    onClick={() => void setViewMode('plates')}
                    title="Switch to the Slicer view — pieces are packed on the build plate (overflow spills to plate 2)"
                  >
                    <DWrench /> Arrange parts on bed
                  </button>
                </>
              )}
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
          <button className={`plate-chip${gizmoMode === 'translate' ? ' active' : ''}`} aria-pressed={gizmoMode === 'translate'} onClick={() => setGizmoMode('translate')} title="Move gizmo">
            <DMove /> Move
          </button>
          <button className={`plate-chip${gizmoMode === 'rotate' ? ' active' : ''}`} aria-pressed={gizmoMode === 'rotate'} onClick={() => setGizmoMode('rotate')} title="Rotate gizmo">
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
        <ViewportHud
          hasModel={!!model}
          tbox={tbox}
          overBed={overBed}
          bed={bed}
          printability={printability}
          platePlan={platePlan}
          platesView={platesView}
          partParam={partParam}
          currentPart={currentPart}
          isAssemblyPreview={isAssemblyPreview}
          outOfView={outOfView}
          doFit={doFit}
        />
      )}

      {/* ── per-piece ARRANGE toolbar (plates view, a piece selected) ── */}
      {platesView && selectedPiece && (
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
      )}

      {showEmpty && <EmptyState />}
    </main>
    </section>
  )
}

/** Re-validate an Arrange layout: a nudged piece that ran off the bed (outside the gap-inset usable
 *  area) or that overlaps a neighbor on the same plate is reported with the SAME {name, reason} shape
 *  the packer's oversize uses, so the existing slicer readout warns identically. Names are deduped
 *  back to base names. Pure — keyed only on the placement plan + bed. */
function validateLayout(plates: Placement[][], bed: { x: number; y: number }, gap = 6): { name: string; reason: 'footprint' }[] {
  const out: { name: string; reason: 'footprint' }[] = []
  const seen = new Set<string>()
  const flag = (name: string) => {
    const b = baseName(name)
    if (seen.has(b)) return
    seen.add(b)
    out.push({ name: b, reason: 'footprint' })
  }
  const usableX = bed.x - 2 * gap
  const usableY = bed.y - 2 * gap
  for (const placements of plates) {
    for (let i = 0; i < placements.length; i++) {
      const p = placements[i]
      // off-bed: min corner before the gap margin, or max corner past the usable area
      if (p.x < gap - 1e-6 || p.y < gap - 1e-6 || p.x - gap + p.w > usableX + 1e-6 || p.y - gap + p.h > usableY + 1e-6) {
        flag(p.name)
        continue
      }
      // neighbor overlap (AABB intersection) within the same plate
      for (let j = i + 1; j < placements.length; j++) {
        const q = placements[j]
        if (p.x < q.x + q.w - 1e-6 && p.x + p.w > q.x + 1e-6 && p.y < q.y + q.h - 1e-6 && p.y + p.h > q.y + 1e-6) {
          flag(p.name)
          flag(q.name)
        }
      }
    }
  }
  return out
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
  // BambuStudio/Orca-style: LEFT-drag rotates, MIDDLE/RIGHT-drag pans, wheel zooms TOWARD THE
  // CURSOR (zoomToCursor — the slicer feel, vs three's zoom-to-centre default). zoomSpeed tamed
  // (three's default=1 dollies a huge step per notch).
  return (
    <OrbitControls
      makeDefault
      enableDamping
      dampingFactor={0.12}
      minDistance={20}
      maxDistance={2000}
      zoomSpeed={0.5}
      zoomToCursor
      mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN }}
    />
  )
}

/** Standard views + fit + snapshot, registered for the toolbar. */
function ViewRig({ tbox, apiRef }: { tbox: TBox; apiRef: React.MutableRefObject<ViewApi | null>; fileBase: string }) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)

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
      // demand mode: a programmatic camera/zoom write does not emit OrbitControls' 'change' event,
      // so paint it explicitly (covers perspective re-frames AND the ortho zoom write above).
      invalidate()
    }
    apiRef.current = {
      setView: (v) => {
        // the six standard orthographic views + iso (Z-up; dir = target→camera)
        const dirs: Record<ViewName, THREE.Vector3> = {
          iso: new THREE.Vector3(1, -1, 0.75),
          top: new THREE.Vector3(0.001, -0.001, 1),
          bottom: new THREE.Vector3(0.001, 0.001, -1),
          front: new THREE.Vector3(0, -1, 0.0001),
          back: new THREE.Vector3(0, 1, 0.0001),
          left: new THREE.Vector3(-1, 0, 0.0001),
          right: new THREE.Vector3(1, 0, 0.0001),
        }
        frame(dirs[v])
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
  }, [tbox, camera, gl, controls, size, apiRef, invalidate])

  return null
}

/**
 * Registers the refine snapshots: four fixed poses (isometric, front, top, right)
 * fitted to the model, so refine passes always compare from the SAME viewpoints
 * regardless of how the user orbited — and the model sees angles a single iso
 * view hides (true proportions, hole/feature counts on each face).
 */
/** Procedural studio image-based lighting — builds a PMREM env map from three's RoomEnvironment
 *  (no external HDRI / CDN; local-first) and applies it as scene.environment at a gentle intensity
 *  so the matte part picks up soft directional ambient fill. Built once (no ongoing loop). Nulled
 *  during refine captures by CaptureRig so its reflections can't contaminate the self-critique PNGs. */
function StudioEnvironment() {
  // read scene/gl via the imperative getter (not the hook value) so the scene mutations below
  // aren't flagged by react-hooks/immutability.
  const get = useThree((s) => s.get)
  useEffect(() => {
    const { gl, scene, invalidate } = get()
    const pmrem = new THREE.PMREMGenerator(gl)
    const room = new RoomEnvironment()
    const env = pmrem.fromScene(room, 0.04).texture
    scene.environment = env
    scene.environmentIntensity = 0.35
    invalidate()
    return () => {
      if (scene.environment === env) scene.environment = null
      env.dispose()
      pmrem.dispose()
      room.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.geometry) m.geometry.dispose()
        const mat = m.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
        else mat?.dispose()
      })
    }
  }, [get])
  return null
}

function CaptureRig({ tbox, hasModel }: { tbox: TBox; hasModel: boolean }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)

  useEffect(() => {
    // capture at 1280 by default (refine passes ask for 1280/q0.92) so recessed
    // channels and panel seams survive JPEG compression for the model's self-critique.
    registerMultiCapture((maxDim = 1280, quality = 0.85) => {
      if (!hasModel || !tbox) return []
      const prevPos = camera.position.clone()
      const prevQuat = camera.quaternion.clone()
      const prevUp = camera.up.clone()
      const radius = Math.max(tbox.size.x, tbox.size.y, tbox.size.z, 20)
      const dist = radius * 2.2
      const target = new THREE.Vector3(tbox.center.x, tbox.center.y, tbox.box.min.z + tbox.size.z / 2)
      const zUp = new THREE.Vector3(0, 0, 1)
      // a raking rim light ONLY for the capture — pushes self-shadow into recessed
      // channels/seams so a hard-surface part reads as paneled, not flat-gray. Scene-
      // level (frame-independent), added before the shoots and removed before the
      // camera restore + final render, so the interactive viewport is untouched.
      const rim = new THREE.DirectionalLight(0xffffff, 0.9)
      rim.position.set(target.x + radius * 2.2, target.y - radius * 0.6, target.z + radius * 0.35)
      rim.target.position.copy(target)
      scene.add(rim, rim.target)
      // drop the env map for the shoots so its reflections don't contaminate the self-critique PNGs
      const prevEnv = scene.environment
      scene.environment = null
      const shoot = (pos: THREE.Vector3, up: THREE.Vector3) => {
        camera.up.copy(up)
        camera.position.copy(pos)
        camera.lookAt(target)
        gl.render(scene, camera)
        return canvasToChatImage(gl.domElement, maxDim, quality)
      }
      // Pose math, keyed by name: isometric, front (down -Y), top (down -Z, Y-up to avoid
      // gimbal lock), right (down -X). The right view exposes depth + side asymmetry a
      // front-only set hides on non-axisymmetric parts. We iterate CAPTURE_VIEW_NAMES so the
      // SHOOT ORDER is literally the same list ChatPanel names in the refine prompt — they
      // cannot drift, so the model never mis-attributes an attached image.
      const poses: Record<CaptureViewName, { pos: THREE.Vector3; up: THREE.Vector3 }> = {
        isometric: { pos: new THREE.Vector3(target.x + dist * 0.707, target.y - dist * 0.707, target.z + dist * 0.577), up: zUp },
        front: { pos: new THREE.Vector3(target.x, target.y - dist, target.z), up: zUp },
        top: { pos: new THREE.Vector3(target.x, target.y, target.z + dist), up: new THREE.Vector3(0, 1, 0) },
        right: { pos: new THREE.Vector3(target.x + dist, target.y, target.z + dist * 0.001), up: zUp },
      }
      const views = CAPTURE_VIEW_NAMES.map((name) => shoot(poses[name].pos, poses[name].up)).filter(
        (v): v is NonNullable<typeof v> => v !== null,
      )
      scene.remove(rim, rim.target)
      scene.environment = prevEnv
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

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/** matchMedia-backed reduced-motion hook — owned by this module because the CSS @media query
 *  cannot reach useFrame. When true, every r3f rig snaps to its final state instead of animating. */
function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduce(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduce
}

/** Re-frame the camera when a new model arrives — a smooth fly-in (lerp) rather than a hard cut.
 *  Keyed on `version` (fitVersion) ONLY — never geometry/param changes — so it never fights the
 *  user's framing mid-iteration. Controls are disabled during the ~450ms flight. Under reduced-motion
 *  (or an orthographic camera, whose zoom ProjectionFit owns) it snaps. Self-invalidates each tick. */
function CameraFit({ tbox, version, reduce }: { tbox: TBox; version: number; reduce: boolean }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  const invalidate = useThree((s) => s.invalidate)
  const lastFitted = useRef(-1)
  const anim = useRef<{ fromPos: THREE.Vector3; toPos: THREE.Vector3; fromTgt: THREE.Vector3; toTgt: THREE.Vector3; t: number } | null>(null)

  useEffect(() => {
    if (!tbox || version === lastFitted.current) return
    lastFitted.current = version
    const radius = Math.max(tbox.size.x, tbox.size.y, tbox.size.z, 20)
    const dist = radius * 2.4
    const toTgt = new THREE.Vector3(tbox.center.x, tbox.center.y, tbox.box.min.z + tbox.size.z / 2)
    const toPos = new THREE.Vector3(tbox.center.x + dist * 0.8, tbox.center.y - dist * 0.9, toTgt.z + dist * 0.65)
    if (reduce || camera instanceof THREE.OrthographicCamera) {
      camera.position.copy(toPos)
      camera.lookAt(toTgt)
      if (controls) { controls.target.copy(toTgt); controls.update() }
      anim.current = null
      invalidate()
      return
    }
    anim.current = { fromPos: camera.position.clone(), toPos, fromTgt: controls?.target.clone() ?? toTgt.clone(), toTgt, t: 0 }
    invalidate() // controls are gated off on the first animating tick (via state.controls) below
  }, [tbox, version, camera, controls, reduce, invalidate])

  // read camera/controls from the useFrame `state` arg (not the closure hook value) so the
  // imperative mutations below aren't flagged by react-hooks/immutability.
  useFrame((state, dt) => {
    const a = anim.current
    if (!a) return
    const cam = state.camera
    const ctrls = state.controls as OrbitControlsImpl | null
    if (a.t === 0 && ctrls) ctrls.enabled = false // gate orbit input for the duration of the flight
    a.t = Math.min(1, a.t + Math.min(dt, 0.05) / 0.45)
    const e = easeInOutCubic(a.t)
    cam.position.lerpVectors(a.fromPos, a.toPos, e)
    const tgt = a.fromTgt.clone().lerp(a.toTgt, e)
    cam.lookAt(tgt)
    if (ctrls) { ctrls.target.copy(tgt); ctrls.update() }
    state.invalidate() // MANDATORY each animating tick under frameloop='demand' (ADR 0001)
    if (a.t >= 1) {
      anim.current = null
      if (ctrls) ctrls.enabled = true
    }
  })

  return null
}

/** Mesh-spawn: on a new STL (stlVersion) the model group scales 0.92→1 and its material fades 0→1
 *  over ~320ms so geometry never "pops" in. Mutates the group transform + material via refs ONLY —
 *  never the disposed geometry prop, never the JSX-controlled emissive/flatShading/wireframe/side. */
function SpawnRig({ groupRef, matRef, version, reduce, xray }: {
  groupRef: React.RefObject<THREE.Group | null>
  matRef: React.RefObject<THREE.MeshStandardMaterial | null>
  version: number
  reduce: boolean
  xray: boolean
}) {
  const invalidate = useThree((s) => s.invalidate)
  const appear = useRef(1)

  // Settle the material to its RESTING look — opaque, or X-ray (semi-transparent + no depth-write
  // so internal cavities/bores show through). The spawn fade overrides opacity transiently; this is
  // the final state it lands on, and the toggle effect below applies it live while idle.
  const settle = (m: THREE.MeshStandardMaterial | null) => {
    if (!m) return
    m.opacity = xray ? 0.4 : 1
    m.transparent = xray
    m.depthWrite = !xray
    m.needsUpdate = true
  }

  useEffect(() => {
    const m = matRef.current
    if (reduce) {
      appear.current = 1
      groupRef.current?.scale.setScalar(1)
      settle(m)
      return
    }
    appear.current = 0
    groupRef.current?.scale.setScalar(0.92)
    if (m) { m.transparent = true; m.opacity = 0; m.needsUpdate = true }
    invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, reduce, groupRef, matRef, invalidate])

  // toggling X-ray while idle applies the resting look immediately (no re-spawn)
  useEffect(() => {
    if (appear.current >= 1) { settle(matRef.current); invalidate() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xray])

  useFrame((_, dt) => {
    if (appear.current >= 1) return
    appear.current = Math.min(1, appear.current + Math.min(dt, 0.05) / 0.32)
    const e = easeInOutCubic(appear.current)
    groupRef.current?.scale.setScalar(0.92 + 0.08 * e)
    const m = matRef.current
    if (m) m.opacity = e * (xray ? 0.4 : 1)
    if (appear.current >= 1) {
      groupRef.current?.scale.setScalar(1)
      settle(m) // land on opaque OR X-ray resting state
    }
    invalidate() // MANDATORY each animating tick under frameloop='demand'
  })

  return null
}

/** Frame the model on (re)mount. The Canvas is keyed on the projection, so it remounts when
 *  perspective⇄orthographic flips — and this fires each time, re-framing through ViewRig's
 *  registered fit() (which also sets the orthographic camera's `zoom`; a fresh ortho camera
 *  otherwise mounts at zoom 1 and looks unchanged). Rendered LAST in the Canvas so its effect
 *  runs after ViewRig has registered fit() against the fresh camera; the rAF lets r3f finish
 *  wiring the camera/controls first. CameraFit still handles framing when a new model arrives. */
function ProjectionFit({ apiRef }: { apiRef: React.MutableRefObject<ViewApi | null> }) {
  useEffect(() => {
    const id = requestAnimationFrame(() => apiRef.current?.fit())
    return () => cancelAnimationFrame(id)
  }, [apiRef])

  return null
}

/** A single pickable piece mesh inside SlicerScene — owns its own hover state so
 *  each mesh gets independent hover tracking, and calls invalidate() so the
 *  emissive tint actually repaints under frameloop='demand'. When selected and a
 *  per-piece gizmo is armed, it mounts a TransformControls (XY-translate or Z-rotate)
 *  bound to its OWN mesh and commits a clean (dx,dy,rot) override on mouse-up — the
 *  inversion runs in the plate-group-LOCAL frame (the gizmo lives inside the same
 *  [ox,0,0] group as the mesh), so the constant plate offset cancels and never enters
 *  the delta. The bed-local seat offset (the rot-dependent rmin) is constant during a
 *  drag, so the local-position delta IS the (dx,dy) delta over the displayed corner. */
function SlicerPiece({
  pl,
  g,
  bed,
  isSelected,
  onSelect,
  gizmo,
  gizmoMode,
  onCommit,
}: {
  pl: Placement
  g: ModelGeometry
  bed: { x: number; y: number; z: number }
  isSelected: boolean
  onSelect: (name: string) => void
  /** mount the per-piece arrange gizmo on this (selected) piece */
  gizmo: boolean
  gizmoMode: 'translate' | 'rotate'
  /** commit a clean override: dx/dy are ADDED to the current override, rot is ABSOLUTE in {0,90} */
  onCommit: (name: string, next: { dx: number; dy: number; rot: 0 | 90 }) => void
}) {
  const { invalidate } = useThree()
  const [hovered, setHovered] = useState(false)
  // state (not a raw ref read) so the gizmo mounts on the NEXT render once the mesh exists — reading
  // meshRef.current during render is a react-hooks/refs violation and can miss the update.
  const [mesh, setMesh] = useState<THREE.Mesh | null>(null)
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const bb = g.geometry.boundingBox
  if (!bb) return null
  // bed is centered at the group origin (−bed/2..+bed/2); the packer gives corner-origin
  // coords (0..bed). three.js applies worldPos = position + R·v, so we seat the post-
  // rotation bbox min to the packer corner. For a 90° CCW Z-spin the rotated min is
  // (−bb.max.y, bb.min.x); rot===0 is the original min. This is the SAME affine the
  // .3mf export bakes (buildThreeMF), keeping the preview and the exported plate identical.
  const rminX = pl.rot === 90 ? -bb.max.y : bb.min.x
  const rminY = pl.rot === 90 ? bb.min.x : bb.min.y
  const { color, emissive } = meshTint({
    overBed: false,
    isAssemblyPreview: false,
    selected: isSelected,
    hovered,
    measureMode: false,
  })
  const onMouseDown = () => {
    if (mesh) dragStart.current = { x: mesh.position.x, y: mesh.position.y }
  }
  const onMouseUp = () => {
    const m = mesh
    if (!m) return
    if (gizmoMode === 'translate') {
      const s = dragStart.current
      // local-position delta == (dx,dy) delta over the displayed corner (offsets cancel)
      const ddx = s ? m.position.x - s.x : 0
      const ddy = s ? m.position.y - s.y : 0
      onCommit(pl.name, { dx: ddx, dy: ddy, rot: pl.rot })
    } else {
      // Z-rotate: snap the mesh's absolute Z to the nearest of {0,90}. The base mesh rotation
      // already encodes the current rot (π/2 ⇒ 90), so reading absolute z and snapping is correct.
      const deg = (m.rotation.z * 180) / Math.PI
      const norm = ((deg % 180) + 180) % 180
      const rot: 0 | 90 = Math.abs(norm - 90) < 45 ? 90 : 0
      onCommit(pl.name, { dx: 0, dy: 0, rot })
    }
    dragStart.current = null
  }
  return (
    <>
      <mesh
        ref={setMesh}
        geometry={g.geometry}
        rotation={[0, 0, pl.rot === 90 ? Math.PI / 2 : 0]}
        position={[pl.x - bed.x / 2 - rminX, pl.y - bed.y / 2 - rminY, -bb.min.z]}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(pl.name)
          invalidate()
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(true)
          document.body.style.cursor = 'pointer'
          invalidate()
        }}
        onPointerOut={() => {
          setHovered(false)
          document.body.style.cursor = ''
          invalidate()
        }}
      >
        <meshStandardMaterial color={color} emissive={emissive} roughness={0.55} metalness={0.12} side={THREE.DoubleSide} />
      </mesh>
      {gizmo && mesh && (
        // XY-translate or Z-rotate ONLY — the bed is the Z-up XY plane, so only in-plane edits map
        // to a buildable (dx,dy,rot). showZ is off for translate; X/Y off for rotate.
        <TransformControls
          object={mesh}
          mode={gizmoMode}
          size={0.6}
          showZ={gizmoMode === 'rotate'}
          showX={gizmoMode === 'translate'}
          showY={gizmoMode === 'translate'}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
        />
      )}
    </>
  )
}

/** The slicer view: each compiled piece packed onto one or more bed-sized plates,
 *  laid out left-to-right and centered. Pieces are individually selectable via
 *  setSelectedPiece — clicking empty space (onPointerMissed on the Canvas) clears. */
function SlicerScene({ plates, geos, bed }: { plates: Placement[][]; geos: Map<string, ModelGeometry>; bed: { x: number; y: number; z: number } }) {
  const selectedPiece = useUi((s) => s.selectedPiece)
  const setSelectedPiece = useUi((s) => s.setSelectedPiece)
  const gizmoMode = useUi((s) => s.gizmoMode)
  const pieceOverrides = useStore((s) => s.pieceOverrides)
  const setPieceOverride = useStore((s) => s.setPieceOverride)
  const n = plates.length
  const totalW = n * bed.x + (n - 1) * PLATE_GAP
  // a drag commits a DELTA over the displayed corner; the stored override is ABSOLUTE over the
  // packer corner — so add the delta to the existing override (rot stays absolute).
  const onCommit = (name: string, d: { dx: number; dy: number; rot: 0 | 90 }) => {
    const cur = pieceOverrides[name] ?? { dx: 0, dy: 0, rot: 0 as 0 | 90 }
    setPieceOverride(name, { dx: cur.dx + d.dx, dy: cur.dy + d.dy, rot: d.rot })
  }
  return (
    <group>
      {plates.map((placements, pi) => {
        const ox = pi * (bed.x + PLATE_GAP) - totalW / 2 + bed.x / 2
        return (
          <group key={pi} position={[ox, 0, 0]}>
            <PrintBed x={bed.x} y={bed.y} visible />
            {placements.map((pl) => {
              // placements carry unique replica keys (lid#0); geometry is keyed by the base piece name
              const g = geos.get(baseName(pl.name))
              if (!g) return null
              const sel = selectedPiece === pl.name
              return (
                <SlicerPiece
                  key={pl.name}
                  pl={pl}
                  g={g}
                  bed={bed}
                  isSelected={sel}
                  onSelect={setSelectedPiece}
                  gizmo={sel}
                  gizmoMode={gizmoMode}
                  onCommit={onCommit}
                />
              )
            })}
          </group>
        )
      })}
    </group>
  )
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
  // this BufferGeometry is created by hand (not r3f-managed), so dispose the GPU buffer when the
  // points change or the bed unmounts — otherwise every bed-size change leaks a geometry.
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={color} />
    </lineSegments>
  )
}

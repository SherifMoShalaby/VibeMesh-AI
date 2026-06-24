import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useStore } from '../state/store'
import { useUi } from '../state/ui'
import { applyValuesToCode, paramsForPiece } from '../lib/params'
import { buildManualFixPrompt } from '../lib/compileReport'
import { downloadBlob } from '../lib/stl'
import type { ParamValue, ScadParameter } from '../types'
// CodeMirror is ~170KB gzip — keep it out of the main bundle; the chunk loads lazily on the
// first Code-tab open.
const CodeEditor = lazy(() => import('./CodeEditor'))
import { DSliders, DCode, DChevDown, DChevRight, DUndo, DDownload, DCheck, DCopy, DWrench, DRefresh, IconWarning, DGrid } from './icons'

const TWEAK_HINT_KEY = 'vibemesh.hint.tweak.v1'

/** clamp slider/number values to the param's step grid — keeps float noise out of state (UX-AUDIT F13) */
function roundToStep(n: number, step: number | undefined): number {
  if (!step || !Number.isFinite(step) || step <= 0) return n
  const decimals = (String(step).split('.')[1] ?? '').length
  return Number((Math.round(n / step) * step).toFixed(decimals))
}

/** "Objects" outliner — lists the individual pieces of a multi-part design.
 *  Row-click and scene-click are bidirectional via the shared `selectedPiece`.
 *  CRITICAL: never writes `paramValues.part` — that would trigger compile() and
 *  null out pieces[], causing a recompile storm. This is purely a read-only highlight. */
function ObjectsOutliner({ partParam }: { partParam: { options?: (string | number | boolean)[] } }) {
  const selectedPiece = useUi((s) => s.selectedPiece)
  const setSelectedPiece = useUi((s) => s.setSelectedPiece)
  const viewMode = useStore((s) => s.viewMode)

  // Only meaningful in the plates/slicer view (where separate per-piece meshes exist)
  const inPlatesView = viewMode === 'plates'

  // Options minus 'all' — these are the printable pieces
  const pieces = useMemo(
    () => (partParam.options ?? []).filter((o) => String(o) !== 'all').map(String),
    [partParam.options],
  )

  if (pieces.length === 0) return null

  return (
    <div className="objects-outliner">
      <div className="outliner-header">
        <DGrid />
        <span>Objects</span>
        {!inPlatesView && <span className="outliner-hint">switch to Slicer view to select</span>}
      </div>
      <ul className="outliner-list" role="listbox" aria-label="Model pieces">
        {pieces.map((name) => {
          const isSelected = selectedPiece === name
          return (
            <li
              key={name}
              role="option"
              aria-selected={isSelected}
              className={`outliner-row${isSelected ? ' is-selected' : ''}${!inPlatesView ? ' is-disabled' : ''}`}
              onClick={() => {
                if (!inPlatesView) return
                // Toggle: clicking the already-selected piece deselects it
                setSelectedPiece(isSelected ? null : name)
              }}
              title={inPlatesView ? `Select ${name}` : 'Switch to Slicer view to select pieces'}
            >
              <span className="outliner-dot" />
              <span className="outliner-name">{name}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default function RightPanel({ mobileShow = false, paneCollapsed = false }: { mobileShow?: boolean; paneCollapsed?: boolean }) {
  const rightTab = useUi((s) => s.rightTab)
  const setRightTab = useUi((s) => s.setRightTab)
  const setRightCollapsed = useUi((s) => s.setRightCollapsed)
  const compileStatus = useStore((s) => s.compileStatus)
  const params = useStore((s) => s.params)
  const activeId = useStore((s) => s.activeId)
  // multi-part 'part' enum — drives the Objects outliner
  const partParam = useMemo(() => params.find((p) => p.name === 'part' && p.kind === 'enum'), [params])

  // teach the causality: the chat is writing the code right now. Subscribe to the derived
  // boolean (flips once when the first fence streams) — NOT raw streamText, which would re-render
  // this whole panel (and every slider) on every token during generation.
  const aiWritingCode = useStore((s) => s.generating && s.streamHasCode)

  // one-time explainer teaching the slider↔code↔chat relationship (UX-AUDIT F2)
  const [tweakHintDone, setTweakHintDone] = useState(() => {
    try { return localStorage.getItem(TWEAK_HINT_KEY) === '1' } catch { return false }
  })
  const dismissTweakHint = () => {
    try { localStorage.setItem(TWEAK_HINT_KEY, '1') } catch { /* storage unavailable */ }
    setTweakHintDone(true)
  }

  // Param-group collapse state lives HERE (not in ParamsPanel) so it SURVIVES a Code↔Params
  // tab swap, which unmounts ParamsPanel. Groups seed COLLAPSED the first time each name is
  // seen so a freshly-created model isn't a wall of sliders, while a manual expand survives
  // slider edits / recompiles (params identity is unchanged by those). `seeded` + `collapsed`
  // reset per project so a same-named group in a different model still collapses by default.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const seeded = useRef<Set<string>>(new Set())
  const groupNames = useMemo(() => [...new Set(params.map((p) => p.group))], [params])

  useEffect(() => {
    seeded.current = new Set()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(new Set())
  }, [activeId])

  useEffect(() => {
    const fresh = groupNames.filter((n) => !seeded.current.has(n))
    if (fresh.length === 0) return
    fresh.forEach((n) => seeded.current.add(n))
    // groupNames[0] is the first group in the SCAD file — leave it expanded by default
    const toCollapse = fresh.filter((n) => n !== groupNames[0])
    setCollapsed((prev) => new Set([...prev, ...toCollapse]))
  }, [groupNames])

  const toggle = (group: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })

  return (
    <section className={`pane params-pane${mobileShow ? ' sheet-show' : ''}${paneCollapsed ? ' is-collapsed' : ''}`}>
      <div className="sheet-handle" aria-hidden>
        <span className="grip" />
      </div>
      <div className="panel-tabs" role="tablist">
        <button className="icon-btn-sm panel-collapse" title="Collapse parameters panel" aria-label="Collapse parameters panel" onClick={() => setRightCollapsed(true)}>
          <DChevRight />
        </button>
        <button
          role="tab"
          aria-selected={rightTab === 'params'}
          className={`panel-tab${rightTab === 'params' ? ' active' : ''}`}
          onClick={() => setRightTab('params')}
        >
          <DSliders /> Tweak
          {params.length > 0 && <span className="count">{params.length}</span>}
        </button>
        <button
          role="tab"
          aria-selected={rightTab === 'code'}
          className={`panel-tab${rightTab === 'code' ? ' active' : ''}${aiWritingCode ? ' pulse' : ''}${
            compileStatus === 'error' ? ' err' : ''
          }`}
          onClick={() => setRightTab('code')}
        >
          <DCode /> Code{compileStatus === 'error' && <IconWarning />}
        </button>
      </div>

      {rightTab === 'params' && partParam && <ObjectsOutliner partParam={partParam} />}

      {rightTab === 'params' && params.length > 0 && !tweakHintDone && (
        <div className="tweak-hint" role="note">
          <span className="th-text">These sliders tweak the model's recipe — ask in chat to rewrite it.</span>
          <button className="th-x" aria-label="Dismiss tip" onClick={dismissTweakHint}>×</button>
        </div>
      )}

      {rightTab === 'code' ? (
    <CodePanel />
  ) : (
    <ParamsPanel
      collapsed={collapsed}
      onToggle={toggle}
      partParam={partParam}
    />
  )}
    </section>
  )
}

function ParamHistory() {
  const history      = useStore((s) => s.paramHistory)
  const labels       = useStore((s) => s.paramHistoryLabels)
  const hasFuture    = useStore((s) => s.paramFuture.length > 0)
  const undoParam    = useStore((s) => s.undoParam)
  const redoParam    = useStore((s) => s.redoParam)
  const jumpTo       = useStore((s) => s.jumpToParamHistory)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault()
        undoParam()
      }
      if ((e.metaKey || e.ctrlKey) && ((e.shiftKey && e.key === 'z') || e.key === 'y')) {
        e.preventDefault()
        redoParam()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undoParam, redoParam])

  if (!history.length && !hasFuture) return null

  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      style={{ padding: '4px 0' }}>
      <summary className="param-group-head" style={{ cursor: 'pointer', userSelect: 'none', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px' }}>
        <span style={{ flex: 1, fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', opacity: 0.7 }}>History ({history.length})</span>
        <button
          className="btn btn-ghost"
          style={{ padding: '0 6px', fontSize: '0.8rem', opacity: history.length ? 1 : 0.4 }}
          disabled={!history.length}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); undoParam() }}
          title="Undo (Cmd+Z)"
        >↩</button>
        <button
          className="btn btn-ghost"
          style={{ padding: '0 6px', fontSize: '0.8rem', opacity: hasFuture ? 1 : 0.4 }}
          disabled={!hasFuture}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); redoParam() }}
          title="Redo (Cmd+Shift+Z)"
        >↪</button>
      </summary>
      <ol reversed style={{ listStyle: 'none', margin: 0, padding: '4px 0' }}>
        {[...labels].reverse().map((label, i) => {
          const historyIndex = history.length - 1 - i
          return (
            <li key={i}>
              <button
                className="btn btn-ghost"
                style={{ width: '100%', textAlign: 'left', padding: '3px 12px', fontSize: '0.78rem', fontFamily: 'monospace' }}
                onClick={() => jumpTo(historyIndex)}
              >
                {label}
              </button>
            </li>
          )
        })}
      </ol>
    </details>
  )
}

function ParamsPanel({
  collapsed,
  onToggle,
  partParam,
}: {
  collapsed: Set<string>
  onToggle: (group: string) => void
  partParam: ScadParameter | undefined
}) {
  const params = useStore((s) => s.params)
  const paramValues = useStore((s) => s.paramValues)
  const setParamValue = useStore((s) => s.setParamValue)
  const resetParams = useStore((s) => s.resetParams)
  const reduce = useReducedMotion()

  // piece-filter state
  const selectedPiece = useUi((s) => s.selectedPiece)
  const [showAll, setShowAll] = useState(false)

  // reset showAll whenever the selected piece changes so each new selection re-filters
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowAll(false)
  }, [selectedPiece])

  // piece names are the part-enum options minus 'all'
  const pieceNames = useMemo(
    () => (partParam?.options ?? []).filter((o) => String(o) !== 'all').map(String),
    [partParam],
  )

  // true when we should narrow the param list to the selected piece
  const filtering = !!selectedPiece && pieceNames.length > 0 && !showAll

  // the param list to display (filtered or all)
  const visibleParams = useMemo(
    () => (filtering ? paramsForPiece(params, selectedPiece!, pieceNames) : params),
    [filtering, params, selectedPiece, pieceNames],
  )

  const groups = useMemo(() => {
    const map = new Map<string, ScadParameter[]>()
    for (const p of visibleParams) {
      const list = map.get(p.group) ?? []
      list.push(p)
      map.set(p.group, list)
    }
    return Array.from(map.entries())
  }, [visibleParams])

  if (params.length === 0) {
    return (
      <div className="panel-scroll">
        <div className="panel-empty">
          No adjustable parameters yet.
          <br />
          Generate or load a model first.
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="panel-scroll">
        {/* piece-filter bar — shown only when a piece is selected in the Slicer view */}
        {filtering && (
          <div className="param-filter-bar">
            <span className="param-filter-label">
              {selectedPiece} · {visibleParams.length} of {params.length}
            </span>
            <button
              className="chip-btn param-filter-showall"
              onClick={() => setShowAll(true)}
              title="Show all parameters"
            >
              Show all
            </button>
          </div>
        )}
        {groups.map(([group, items]) => {
          // when filtering, auto-expand all groups (they're few + all relevant)
          // without mutating the parent collapsed state
          const open = filtering ? true : !collapsed.has(group)
          return (
            <section key={group} className={`param-group${open ? '' : ' collapsed'}`}>
              <button className="param-group-head" onClick={() => onToggle(group)} aria-expanded={open}>
                <span className="pg-caret">
                  <DChevDown />
                </span>
                <span className="pg-title">{group}</span>
                <span className="pg-line" />
                <span className="pg-count">{items.length}</span>
              </button>
              {/* grid-rows collapse (the sanctioned height exception); items cascade in on expand —
                  keyed on open state so the stagger replays when the group is opened, never on a
                  slider drag (the control is controlled by the store, no remount on value change). */}
              <div className="param-list-wrap">
                <div className="param-list">
                  {items.map((p, i) => (
                    <motion.div
                      key={`${p.name}|${open ? 'o' : 'c'}`}
                      initial={reduce ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: reduce ? 0 : Math.min(i * 0.035, 0.2), ease: [0.16, 1, 0.3, 1] }}
                    >
                      <ParamControl param={p} value={paramValues[p.name]} onChange={(v) => setParamValue(p.name, v)} />
                    </motion.div>
                  ))}
                </div>
              </div>
            </section>
          )
        })}
        <ParamHistory />
      </div>
      <div className="panel-foot">
        <button className="btn btn-ghost wide" onClick={resetParams} title="Double-click any single slider to reset just that one">
          <DUndo /> Reset all to defaults
        </button>
      </div>
    </>
  )
}

function ParamControl({
  param,
  value,
  onChange,
}: {
  param: ScadParameter
  value: ParamValue | undefined
  onChange: (value: ParamValue) => void
}) {
  const v = value ?? param.defaultValue
  const name = param.description || param.name.replace(/_/g, ' ')

  if (param.kind === 'bool') {
    return (
      <label className="param param-bool">
        <input type="checkbox" checked={Boolean(v)} onChange={(e) => onChange(e.target.checked)} />
        <span className="param-name">{name}</span>
      </label>
    )
  }

  if (param.kind === 'enum') {
    return (
      <div className="param">
        <div className="param-top">
          <span className="param-name" title={param.name}>
            {name}
          </span>
        </div>
        <div className="seg" role="radiogroup" aria-label={name}>
          {param.options?.map((o) => (
            <button
              key={String(o)}
              role="radio"
              aria-checked={String(o) === String(v)}
              className={String(o) === String(v) ? 'active' : ''}
              onClick={() => onChange(o)}
              title={String(o)}
            >
              {String(o)}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (param.kind === 'string') {
    return (
      <div className="param param-str">
        <div className="param-top">
          <span className="param-name" title={param.name}>
            {name}
          </span>
        </div>
        <input type="text" aria-label={name} value={String(v)} onChange={(e) => onChange(e.target.value)} />
      </div>
    )
  }

  // number / slider — track shows filled progress in the accent via --pct
  const pct =
    param.min !== undefined && param.max !== undefined && param.max > param.min
      ? Math.min(100, Math.max(0, ((Number(v) - param.min) / (param.max - param.min)) * 100))
      : 50
  return (
    <div className="param">
      <div className="param-top">
        <span className="param-name" title={param.name}>
          {name}
        </span>
        <span className="param-valbox">
          <input
            type="number"
            lang="en-US"
            aria-label={`${name} (exact value)`}
            min={param.min}
            max={param.max}
            step={param.step}
            value={Number(v)}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (Number.isFinite(n)) onChange(roundToStep(n, param.step))
            }}
          />
        </span>
      </div>
      <div className="slider">
        <input
          type="range"
          aria-label={name}
          title="Double-click to reset to default"
          min={param.min}
          max={param.max}
          step={param.step}
          value={Number(v)}
          style={{ ['--pct' as string]: `${pct}%` } as React.CSSProperties}
          onChange={(e) => onChange(roundToStep(Number(e.target.value), param.step))}
          onDoubleClick={() => onChange(param.defaultValue)}
        />
      </div>
      {param.min !== undefined && param.max !== undefined && (
        <div className="param-meta">
          <span className="param-range">
            {param.min} – {param.max}
            {param.step ? ` · step ${param.step}` : ''}
          </span>
        </div>
      )}
    </div>
  )
}

function CodePanel() {
  const code = useStore((s) => s.code)
  const setCode = useStore((s) => s.setCode)
  const recompile = useStore((s) => s.recompile)
  const compileError = useStore((s) => s.compileError)
  const compileLog = useStore((s) => s.compileLog)
  const sendPrompt = useStore((s) => s.sendPrompt)
  const generating = useStore((s) => s.generating)
  const engine = useStore((s) => s.engine)
  const params = useStore((s) => s.params)
  const paramValues = useStore((s) => s.paramValues)
  const projects = useStore((s) => s.projects)
  const activeId = useStore((s) => s.activeId)
  const [copied, setCopied] = useState(false)

  const copyCode = async () => {
    try {
      // copy what would be exported: the program with current slider values substituted
      await navigator.clipboard.writeText(applyValuesToCode(code, params, paramValues))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable (permissions) — the .scad download still works */
    }
  }

  // .scad download lives here with the code, not in the topbar (UX-AUDIT F3)
  const downloadScad = () => {
    const name = (projects.find((p) => p.id === activeId)?.name ?? 'model').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'model'
    downloadBlob(applyValuesToCode(code, params, paramValues), `${name}.scad`, 'text/plain')
  }

  const askAiToFix = () => {
    if (!compileError) return
    void sendPrompt(buildManualFixPrompt(compileError, code, params), undefined, 'Fix request')
  }

  // human headline first, internals collapsed (UX-AUDIT F6)
  const errorLine = compileError?.match(/line (\d+)/)?.[1]
  const cleanError = compileError?.replace(/\s*in file [^\s,]+,?/g, '').replace(/\/input\.scad/g, 'the code')

  return (
    <div className="code-panel">
      <div className="code-toolbar">
        <span className="code-ver">
          <span className="dot" /> ⌘⏎ apply &amp; render
        </span>
        <span className="spacer" />
        <button className="btn btn-ghost sm" onClick={downloadScad} disabled={!code.trim()} title="Download as an OpenSCAD source file (with current slider values)">
          <DDownload /> .scad
        </button>
        <button className="btn btn-ghost sm" onClick={() => void copyCode()} disabled={!code.trim()} title="Copy the program with current slider values applied">
          {copied ? <><DCheck /> Copied</> : <><DCopy /> Copy</>}
        </button>
      </div>
      <div className="code-well">
        <Suspense fallback={<div className="cm-loading">Loading editor…</div>}>
          <CodeEditor
            value={code}
            onChange={setCode}
            onApply={recompile}
            errorLine={errorLine ? Number(errorLine) : null}
            placeholder={'// OpenSCAD code appears here\n// after you describe a part'}
          />
        </Suspense>
      </div>
      {compileError && (
        <div className="code-error">
          <div className="code-error-headline">The model's code has an error{errorLine ? ` (line ${errorLine})` : ''}.</div>
          {engine && (
            <button className="btn btn-danger wide" onClick={askAiToFix} disabled={generating}>
              <DWrench /> Ask AI to fix it
            </button>
          )}
          <details className="code-log">
            <summary>Show technical details</summary>
            <pre>{cleanError}</pre>
          </details>
        </div>
      )}
      {!compileError && compileLog && (
        <details className="code-log">
          <summary>Render log</summary>
          <pre>{compileLog}</pre>
        </details>
      )}
      <div className="code-foot">
        <button className="btn btn-primary wide" onClick={recompile} disabled={!code.trim()}>
          <DRefresh /> Apply &amp; render
        </button>
      </div>
    </div>
  )
}

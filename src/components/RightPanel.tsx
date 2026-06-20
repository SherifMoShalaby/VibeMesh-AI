import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useStore } from '../state/store'
import { useUi } from '../state/ui'
import { applyValuesToCode } from '../lib/params'
import { buildManualFixPrompt } from '../lib/compileReport'
import { downloadBlob } from '../lib/stl'
import type { ParamValue, ScadParameter } from '../types'
// CodeMirror is ~170KB gzip — keep it out of the main bundle; the chunk loads lazily on the
// first Code-tab open.
const CodeEditor = lazy(() => import('./CodeEditor'))
import { DSliders, DCode, DChevDown, DChevRight, DUndo, DDownload, DCheck, DCopy, DWrench, DRefresh, IconWarning } from './icons'

const TWEAK_HINT_KEY = 'vibemesh.hint.tweak.v1'

/** clamp slider/number values to the param's step grid — keeps float noise out of state (UX-AUDIT F13) */
function roundToStep(n: number, step: number | undefined): number {
  if (!step || !Number.isFinite(step) || step <= 0) return n
  const decimals = (String(step).split('.')[1] ?? '').length
  return Number((Math.round(n / step) * step).toFixed(decimals))
}

export default function RightPanel({ mobileShow = false, paneCollapsed = false }: { mobileShow?: boolean; paneCollapsed?: boolean }) {
  const rightTab = useUi((s) => s.rightTab)
  const setRightTab = useUi((s) => s.setRightTab)
  const setRightCollapsed = useUi((s) => s.setRightCollapsed)
  const compileStatus = useStore((s) => s.compileStatus)
  const generating = useStore((s) => s.generating)
  const streamText = useStore((s) => s.streamText)
  const params = useStore((s) => s.params)
  const activeId = useStore((s) => s.activeId)

  // teach the causality: the chat is writing the code right now
  const aiWritingCode = generating && streamText.includes('```')

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
    setCollapsed((prev) => new Set([...prev, ...fresh]))
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

      {rightTab === 'params' && params.length > 0 && !tweakHintDone && (
        <div className="tweak-hint" role="note">
          <span className="th-text">These sliders tweak the model's recipe — ask in chat to rewrite it.</span>
          <button className="th-x" aria-label="Dismiss tip" onClick={dismissTweakHint}>×</button>
        </div>
      )}

      {rightTab === 'code' ? <CodePanel /> : <ParamsPanel collapsed={collapsed} onToggle={toggle} />}
    </section>
  )
}

function ParamsPanel({ collapsed, onToggle }: { collapsed: Set<string>; onToggle: (group: string) => void }) {
  const params = useStore((s) => s.params)
  const paramValues = useStore((s) => s.paramValues)
  const setParamValue = useStore((s) => s.setParamValue)
  const resetParams = useStore((s) => s.resetParams)
  const reduce = useReducedMotion()

  const groups = useMemo(() => {
    const map = new Map<string, ScadParameter[]>()
    for (const p of params) {
      const list = map.get(p.group) ?? []
      list.push(p)
      map.set(p.group, list)
    }
    return Array.from(map.entries())
  }, [params])

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
        {groups.map(([group, items]) => {
          const open = !collapsed.has(group)
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
        <div className="seg" role="group" aria-label={name}>
          {param.options?.map((o) => (
            <button
              key={String(o)}
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

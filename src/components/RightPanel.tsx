import { useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { useUi } from '../state/ui'
import { applyValuesToCode } from '../lib/params'
import { downloadBlob } from '../lib/stl'
import type { ParamValue, ScadParameter } from '../types'
import { IconDownload, IconCheck, IconCopy, IconWrench, IconRefresh, IconUndo, IconChevronDown, IconChevronUp, IconWarning } from './icons'

/** clamp slider/number values to the param's step grid — keeps float noise out of state (UX-AUDIT F13) */
function roundToStep(n: number, step: number | undefined): number {
  if (!step || !Number.isFinite(step) || step <= 0) return n
  const decimals = (String(step).split('.')[1] ?? '').length
  return Number((Math.round(n / step) * step).toFixed(decimals))
}

const TWEAK_HINT_KEY = 'vibemesh.hint.tweak.v1'

export default function RightPanel() {
  const rightTab = useUi((s) => s.rightTab)
  const setRightTab = useUi((s) => s.setRightTab)
  const advanced = useUi((s) => s.advanced)
  const setAdvanced = useUi((s) => s.setAdvanced)
  const sheetOpen = useUi((s) => s.sheetOpen)
  const setSheetOpen = useUi((s) => s.setSheetOpen)
  const compileStatus = useStore((s) => s.compileStatus)
  const generating = useStore((s) => s.generating)
  const streamText = useStore((s) => s.streamText)
  const params = useStore((s) => s.params)
  const hasModelContent = useStore((s) => s.params.length > 0 || s.code.trim() !== '')

  // Code surfaces in simple mode only when something needs fixing (UX-AUDIT F2/Phase 3)
  const codeVisible = advanced || compileStatus === 'error'
  const tab = rightTab === 'code' && !codeVisible ? 'params' : rightTab
  // teach the causality: the chat is writing the code right now
  const aiWritingCode = generating && streamText.includes('```')

  const [hintDone, setHintDone] = useState(() => localStorage.getItem(TWEAK_HINT_KEY) === '1')
  const dismissHint = () => {
    localStorage.setItem(TWEAK_HINT_KEY, '1')
    setHintDone(true)
  }

  return (
    <>
      {hasModelContent && (
        <button className={`sheet-toggle${sheetOpen ? ' open' : ''}`} onClick={() => setSheetOpen(!sheetOpen)} aria-expanded={sheetOpen}>
          {sheetOpen ? <><IconChevronDown /> Close</> : <><IconChevronUp /> Tweak</>}
        </button>
      )}
      <aside className={`right-panel${sheetOpen ? ' sheet-open' : ''}`}>
        <div className="tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'params'}
            className={tab === 'params' ? 'tab active' : 'tab'}
            onClick={() => setRightTab('params')}
          >
            Tweak
          </button>
          {codeVisible && (
            <button
              role="tab"
              aria-selected={tab === 'code'}
              className={`tab${tab === 'code' ? ' active' : ''}${aiWritingCode ? ' pulse' : ''}${compileStatus === 'error' ? ' err' : ''}`}
              onClick={() => setRightTab('code')}
            >
              Code{compileStatus === 'error' && <IconWarning />}
            </button>
          )}
        </div>
        {!hintDone && params.length > 0 && tab === 'params' && (
          <div className="tweak-hint">
            These sliders edit the model's recipe — the chat rewrites it when you ask for changes.
            <button className="banner-link" onClick={dismissHint}>
              got it
            </button>
          </div>
        )}
        {tab === 'params' ? <ParamsPanel /> : <CodePanel />}
        <label className="advanced-toggle" title="Show the model's code, render times and triangle counts">
          <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />
          Advanced mode
        </label>
      </aside>
    </>
  )
}

function ParamsPanel() {
  const params = useStore((s) => s.params)
  const paramValues = useStore((s) => s.paramValues)
  const setParamValue = useStore((s) => s.setParamValue)
  const resetParams = useStore((s) => s.resetParams)

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
      <div className="panel-empty">
        No adjustable parameters yet.
        <br />
        Generate or load a model first.
      </div>
    )
  }

  return (
    <div className="params-scroll">
      {groups.map(([group, items]) => (
        <section key={group} className="param-group">
          <div className="param-group-title">{group}</div>
          {items.map((p) => (
            <ParamControl key={p.name} param={p} value={paramValues[p.name]} onChange={(v) => setParamValue(p.name, v)} />
          ))}
        </section>
      ))}
      <button className="btn ghost wide" onClick={resetParams} title="Double-click any single slider to reset just that one">
        <IconUndo /> Reset all to defaults
      </button>
    </div>
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
  const label = (
    <div className="param-label">
      <span className="param-name" title={param.name}>
        {param.description || param.name.replace(/_/g, ' ')}
      </span>

    </div>
  )

  if (param.kind === 'bool') {
    return (
      <label className="param param-bool">
        <input type="checkbox" checked={Boolean(v)} onChange={(e) => onChange(e.target.checked)} />
        <span className="param-name">{param.description || param.name.replace(/_/g, ' ')}</span>
      </label>
    )
  }

  if (param.kind === 'enum') {
    return (
      <div className="param">
        {label}
        <select
          aria-label={param.description || param.name}
          value={String(v)}
          onChange={(e) => {
            const opt = param.options?.find((o) => String(o) === e.target.value)
            onChange(opt ?? e.target.value)
          }}
        >
          {param.options?.map((o) => (
            <option key={String(o)} value={String(o)}>
              {String(o)}
            </option>
          ))}
        </select>
      </div>
    )
  }

  if (param.kind === 'string') {
    return (
      <div className="param">
        {label}
        <input type="text" aria-label={param.description || param.name} value={String(v)} onChange={(e) => onChange(e.target.value)} />
      </div>
    )
  }

  // number / slider — track shows filled progress in the accent (UX-AUDIT-2 controls policy)
  const pct =
    param.min !== undefined && param.max !== undefined && param.max > param.min
      ? Math.min(100, Math.max(0, ((Number(v) - param.min) / (param.max - param.min)) * 100))
      : 0
  return (
    <div className="param">
      {label}
      <div className="param-slider-row">
        <input
          type="range"
          aria-label={param.description || param.name}
          title="Double-click to reset to default"
          min={param.min}
          max={param.max}
          step={param.step}
          value={Number(v)}
          style={{ background: `linear-gradient(90deg, var(--accent) ${pct}%, var(--raised-hi) ${pct}%)` }}
          onChange={(e) => onChange(roundToStep(Number(e.target.value), param.step))}
          onDoubleClick={() => onChange(param.defaultValue)}
        />
        <input
          type="number"
          className="param-num"
          aria-label={`${param.description || param.name} (exact value)`}
          min={param.min}
          max={param.max}
          step={param.step}
          value={Number(v)}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (Number.isFinite(n)) onChange(roundToStep(n, param.step))
          }}
        />
      </div>
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
    const hullHint = /CGAL|applyHull|hull/i.test(compileError)
      ? '\n\nNote: this renderer uses an older CGAL build that is fragile with hull(). Rewrite the model WITHOUT hull() — use explicit primitives instead (cylinders at corners, linear_extrude of offset() 2D profiles, rotate_extrude).'
      : ''
    const timeoutHint = /timed out/i.test(compileError)
      ? '\n\nNote: the model is too computationally heavy. Reduce boolean count (fewer flutes/ribs, simpler cutters) while keeping the overall design.'
      : ''
    void sendPrompt(
      `The OpenSCAD code failed to render. Fix it and return the corrected complete program.\n\nError:\n${compileError}${hullHint}${timeoutHint}`,
      undefined,
      'Fix request',
    )
  }

  // human headline first, internals collapsed (UX-AUDIT F6)
  const errorLine = compileError?.match(/line (\d+)/)?.[1]
  const cleanError = compileError?.replace(/\s*in file [^\s,]+,?/g, '').replace(/\/input\.scad/g, 'the code')

  // cheap line-number gutter so "(line N)" is actionable without a real editor dependency
  const gutterRef = useRef<HTMLDivElement>(null)
  const lineCount = Math.max(code.split('\n').length, 1)

  return (
    <div className="code-panel">
      <div className="code-toolbar">
        <span className="code-hint">⌘⏎ / ⌘S — apply &amp; render</span>
        <span className="code-toolbar-actions">
          <button className="btn ghost sm" onClick={downloadScad} disabled={!code.trim()} title="Download as an OpenSCAD source file (with current slider values)">
            <IconDownload /> .scad
          </button>
          <button className="btn ghost sm" onClick={() => void copyCode()} disabled={!code.trim()} title="Copy the program with current slider values applied">
            {copied ? <><IconCheck /> Copied</> : <><IconCopy /> Copy</>}
          </button>
        </span>
      </div>
      <div className="code-wrap">
        <div className="code-gutter" ref={gutterRef} aria-hidden>
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i} className={errorLine && Number(errorLine) === i + 1 ? 'gl err' : 'gl'}>
              {i + 1}
            </div>
          ))}
        </div>
        <textarea
          className="code-editor"
          aria-label="OpenSCAD code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onScroll={(e) => {
            if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && (e.key === 'Enter' || e.key === 's')) {
              e.preventDefault()
              if (code.trim()) recompile()
            }
          }}
          spellCheck={false}
          placeholder={'// OpenSCAD code appears here\n// after you describe a part'}
        />
      </div>
      {compileError && (
        <div className="code-error">
          <div className="code-error-headline">
            The model's code has an error{errorLine ? ` (line ${errorLine})` : ''}.
          </div>
          {engine && (
            <button className="btn stop wide" onClick={askAiToFix} disabled={generating}>
              <IconWrench /> Ask AI to fix it
            </button>
          )}
          <details className="code-log">
            <summary>Show technical details</summary>
            <pre>{cleanError}</pre>
          </details>
        </div>
      )}
      {!compileError && compileLog && <details className="code-log">
        <summary>Render log</summary>
        <pre>{compileLog}</pre>
      </details>}
      <button className="btn primary wide" onClick={recompile} disabled={!code.trim()}>
        <IconRefresh /> Apply &amp; render
      </button>
    </div>
  )
}

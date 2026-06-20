import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../state/store'
import { useUi } from '../state/ui'
import { DGauge, DChevDown, DCheck } from './icons'

/** In-composer model + effort picker. Switches model/effort WITHIN the active engine — full
 *  engine setup (keys, connecting) stays in the Engines modal. Renders only the controls the
 *  active engine actually exposes: claude-code → model + effort, anthropic → effort, kimi →
 *  model, local:* → nothing (its model IS the engine id, switching it = switching engine).
 *  Shared by the chat composer and the home (empty-state) composer.
 *
 *  The popup is PORTALED to <body> and fixed-positioned from the trigger so it is never clipped
 *  by a composer's `overflow: hidden` (the home composer clipped the inline popup). */
export default function ModelMenu() {
  const engine = useStore((s) => s.engine)
  const health = useStore((s) => s.health)
  const claudeModel = useStore((s) => s.claudeModel)
  const setClaudeModel = useStore((s) => s.setClaudeModel)
  const claudeEffort = useStore((s) => s.claudeEffort)
  const setClaudeEffort = useStore((s) => s.setClaudeEffort)
  const kimiModel = useStore((s) => s.kimiModel)
  const setKimiModel = useStore((s) => s.setKimiModel)
  const setEnginesOpen = useUi((s) => s.setEnginesOpen)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  // Fixed-position the portaled popup from the trigger, FLIPPING up/down so it stays on-screen:
  // a trigger in the lower half opens upward (composers sit near the viewport bottom), one in the
  // upper half opens downward. Left is clamped to the viewport. Recomputed while open (scroll/resize).
  const place = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const gap = 6
    const left = Math.round(Math.max(8, Math.min(r.left, window.innerWidth - 200)))
    if (r.top > window.innerHeight / 2) setPos({ left, bottom: Math.round(window.innerHeight - r.top + gap) })
    else setPos({ left, top: Math.round(r.bottom + gap) })
  }

  useEffect(() => {
    if (!open) return
    place()
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const reflow = () => place()
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', reflow)
    window.addEventListener('scroll', reflow, true)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', reflow)
      window.removeEventListener('scroll', reflow, true)
    }
  }, [open])

  const provider = health?.providers.find((p) => p.id === engine)
  const isKimi = engine === 'kimi'
  const showModels = (provider?.models?.length ?? 0) > 0 && (engine === 'claude-code' || isKimi)
  const showEfforts = (provider?.efforts?.length ?? 0) > 0 && (engine === 'claude-code' || engine === 'anthropic')
  if (!provider || (!showModels && !showEfforts)) return null

  const models = provider.models ?? []
  const efforts = provider.efforts ?? []
  const modelValue = isKimi ? kimiModel : claudeModel
  const onModelChange = isKimi ? setKimiModel : setClaudeModel
  const modelLabel = showModels ? models.find((m) => m.id === modelValue)?.label ?? modelValue : null
  const effortLabel = showEfforts ? efforts.find((e) => e.id === claudeEffort)?.label ?? claudeEffort : null
  const summary = [modelLabel, effortLabel].filter(Boolean).join(' · ') || 'Model'

  return (
    <div className="model-menu">
      <button
        ref={btnRef}
        type="button"
        className="chip-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Model & effort for the active engine"
        onClick={() => setOpen((o) => !o)}
      >
        <DGauge /> <span className="mm-summary">{summary}</span> <DChevDown />
      </button>
      {open && pos &&
        createPortal(
          <div
            className="model-menu-pop"
            role="menu"
            ref={popRef}
            style={{ position: 'fixed', left: pos.left, top: pos.top ?? 'auto', bottom: pos.bottom ?? 'auto', right: 'auto' }}
          >
            {showModels && (
              <div className="mm-group">
                <div className="mm-label">Model</div>
                {models.map((m) => (
                  <button
                    key={m.id}
                    role="menuitemradio"
                    aria-checked={m.id === modelValue}
                    className={`mm-opt${m.id === modelValue ? ' on' : ''}`}
                    onClick={() => onModelChange(m.id)}
                  >
                    <span className="mm-tick">{m.id === modelValue && <DCheck />}</span>
                    {m.label}
                  </button>
                ))}
              </div>
            )}
            {showEfforts && (
              <div className="mm-group">
                <div className="mm-label">Effort</div>
                {efforts.map((e) => (
                  <button
                    key={e.id}
                    role="menuitemradio"
                    aria-checked={e.id === claudeEffort}
                    className={`mm-opt${e.id === claudeEffort ? ' on' : ''}`}
                    onClick={() => setClaudeEffort(e.id)}
                  >
                    <span className="mm-tick">{e.id === claudeEffort && <DCheck />}</span>
                    {e.label}
                  </button>
                ))}
              </div>
            )}
            <button className="mm-setup" onClick={() => { setOpen(false); setEnginesOpen(true) }}>
              Set up engines →
            </button>
          </div>,
          document.body,
        )}
    </div>
  )
}

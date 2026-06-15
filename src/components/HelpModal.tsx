import { useEffect } from 'react'
import { useUi } from '../state/ui'
import { IconX } from './icons'

const GROUPS: Array<{ title: string; rows: Array<[string, string]> }> = [
  {
    title: 'Viewport',
    rows: [
      ['F', 'fit model in view'],
      ['double-click', 'fit model in view'],
      ['click model', 'select (move / rotate gizmo)'],
      ['Esc', 'deselect · exit measure'],
      ['Del', 'remove selected from view (design kept)'],
      ['⌘Z / ⇧⌘Z', 'undo / redo placement (move, rotate, delete)'],
      ['⤢ then 2 clicks', 'measure distance in mm'],
    ],
  },
  {
    title: 'Chat',
    rows: [
      ['Enter', 'send'],
      ['Shift+Enter', 'new line'],
      ['↑ / ↓', 'recall previous prompts (empty input)'],
      ['⌘V', 'paste a reference photo or sketch'],
    ],
  },
  {
    title: 'Code & parameters',
    rows: [
      ['⌘Enter', 'apply & render (anywhere)'],
      ['⌘S', 'apply & render (in the code editor)'],
      ['double-click slider', 'reset that parameter'],
    ],
  },
  {
    title: 'General',
    rows: [
      ['?', 'this overlay'],
      ['Esc', 'close dialogs'],
    ],
  },
]

export default function HelpModal() {
  const helpOpen = useUi((s) => s.helpOpen)
  const setHelpOpen = useUi((s) => s.setHelpOpen)

  // global `?` opener — ignored while typing in a field
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return
      if (e.key === '?') setHelpOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setHelpOpen])

  // Esc closes — capture phase so the viewport's Esc-to-deselect never sees it
  useEffect(() => {
    if (!helpOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setHelpOpen(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [helpOpen, setHelpOpen])

  if (!helpOpen) return null

  return (
    <div className="scrim" onClick={() => setHelpOpen(false)}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="mh-text">
            <h2>Shortcuts</h2>
          </div>
          <button className="icon-btn-sm" onClick={() => setHelpOpen(false)} aria-label="Close">
            <IconX />
          </button>
        </div>
        <div className="modal-body">
          {GROUPS.map((g) => (
            <section key={g.title} className="help-group">
              <div className="pg-title">{g.title}</div>
              {g.rows.map(([keys, what]) => (
                <div key={keys + what} className="help-row">
                  <span className="kbd">{keys}</span>
                  <span className="help-what">{what}</span>
                </div>
              ))}
            </section>
          ))}
        </div>
        <div className="modal-foot">
          <span className="modal-hint">⌘ = Ctrl on Windows / Linux</span>
        </div>
      </div>
    </div>
  )
}

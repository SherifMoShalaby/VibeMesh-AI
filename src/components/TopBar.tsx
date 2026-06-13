import { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { useUi } from '../state/ui'
import { applyValuesToCode } from '../lib/params'
import { downloadBlob } from '../lib/stl'
import { QUALITY_PRESETS } from '../types'
import { ConfirmDialog } from './Dialogs'
import { IconChevronDown, IconTrash, IconGear, IconDownload } from './icons'

/** close an open dropdown when clicking anywhere outside it */
function useClickOutside(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open, onClose])
  return ref
}

export default function TopBar() {
  const projects = useStore((s) => s.projects)
  const activeId = useStore((s) => s.activeId)
  const renameProject = useStore((s) => s.renameProject)
  const openProject = useStore((s) => s.openProject)
  const newProject = useStore((s) => s.newProject)
  const deleteProject = useStore((s) => s.deleteProject)
  const health = useStore((s) => s.health)
  const engine = useStore((s) => s.engine)
  const setEnginesOpen = useUi((s) => s.setEnginesOpen)

  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const menuRef = useClickOutside(menuOpen, () => setMenuOpen(false))

  const active = projects.find((p) => p.id === activeId)
  const fileBase = (active?.name ?? 'model').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'model'

  return (
    <header className="topbar">
      <div className="brand">
        {/* "Vibewave mesh" — a vibe (wave) entering the part and crystallizing into mesh facets */}
        <svg viewBox="0 0 32 32" className="brand-mark" aria-hidden>
          <path d="M16 4 L27 10 L27 22 L16 28 L5 22 L5 10 Z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M19 11.4 L16 4 M19 11.4 L27 10 M23 20.6 L27 22 M15.5 20.6 L16 28" stroke="currentColor" strokeWidth="1" opacity="0.4" />
          <path
            d="M5 16 C7 11.4 10 11.4 12 16 L15.5 20.6 L19 11.4 L23 20.6 L27 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="19" cy="11.4" r="1.4" fill="currentColor" />
          <circle cx="23" cy="20.6" r="1.4" fill="currentColor" />
        </svg>
        <span className="brand-name">
          VIBE<em>MESH</em>
        </span>
      </div>

      {/* one project identity: editable title + a single menu (UX-AUDIT F14) */}
      <div className="project-controls">
        {active ? (
          <input
            className="project-name"
            value={active.name}
            onChange={(e) => renameProject(e.target.value)}
            spellCheck={false}
            aria-label="Project name"
            title="Project name — click to rename"
          />
        ) : (
          <span className="project-name placeholder">No project open</span>
        )}
        <div className="menu-wrap" ref={menuRef}>
          <button
            className="icon-btn"
            aria-label="Projects menu"
            aria-expanded={menuOpen}
            title="Switch, create or delete projects"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <IconChevronDown />
          </button>
          {menuOpen && (
            <div className="dropdown" role="menu">
              <button
                className="dropdown-item"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false)
                  newProject()
                }}
              >
                + New project
              </button>
              {projects.length > 0 && <div className="dropdown-sep" />}
              <div className="dropdown-scroll">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    className={`dropdown-item${p.id === activeId ? ' active' : ''}`}
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      if (p.id !== activeId) openProject(p.id)
                    }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              {active && (
                <>
                  <div className="dropdown-sep" />
                  <button
                    className="dropdown-item danger"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      setConfirmDelete(true)
                    }}
                  >
                    <IconTrash /> Delete this project…
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="topbar-right">
        {health &&
          (() => {
            const activeProvider = health.providers.find((p) => p.id === engine)
            return (
              <button
                className={`api-chip ${activeProvider ? 'ok' : 'warn'}`}
                onClick={() => setEnginesOpen(true)}
                title={`${activeProvider?.detail ?? 'No AI connected'} — click to manage`}
              >
                <i />
                <span className="api-chip-label">{activeProvider ? `AI · ${activeProvider.label.split(' · ')[0]}` : 'Connect AI'}</span>
                <span className="chip-gear"><IconGear /></span>
              </button>
            )
          })()}
        <ExportMenu fileBase={fileBase} />
      </div>

      {confirmDelete && active && (
        <ConfirmDialog
          title="Delete project"
          body={`Delete “${active.name}”? Its chat history and model go with it — this can't be undone.`}
          confirmLabel="Delete project"
          danger
          onConfirm={() => {
            setConfirmDelete(false)
            deleteProject(active.id)
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </header>
  )
}

/** one Export decision, explained at the point of choice (UX-AUDIT F3) */
function ExportMenu({ fileBase }: { fileBase: string }) {
  const code = useStore((s) => s.code)
  const params = useStore((s) => s.params)
  const paramValues = useStore((s) => s.paramValues)
  const stl = useStore((s) => s.stl)
  const quality = useStore((s) => s.quality)
  const exportingPlates = useStore((s) => s.exportingPlates)
  const exportPlates = useStore((s) => s.exportPlates)
  const exportStlSmart = useStore((s) => s.exportStlSmart)
  const export3mf = useStore((s) => s.export3mf)

  const [open, setOpen] = useState(false)
  const ref = useClickOutside(open, () => setOpen(false))

  const hasPlates = params.some((p) => p.name === 'part' && p.kind === 'enum')
  const qualityLabel = QUALITY_PRESETS.find((q) => q.id === quality)?.label ?? 'Standard'

  const run = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }

  return (
    <div className="menu-wrap" ref={ref}>
      <button
        className="btn primary"
        disabled={exportingPlates || (!stl && !code.trim())}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {exportingPlates ? <><i className="spin" /> Exporting…</> : <><IconDownload /> Export</>}
      </button>
      {open && (
        <div className="dropdown export-menu" role="menu">
          <button className="dropdown-item rich" role="menuitem" onClick={run(() => void export3mf(fileBase))}>
            <strong>.3mf — recommended</strong>
            <span>Opens ready to print in Bambu Studio / PrusaSlicer / Orca{hasPlates ? ' — all parts included' : ''}</span>
          </button>
          <button className="dropdown-item rich" role="menuitem" disabled={!stl} onClick={run(() => void exportStlSmart(fileBase))}>
            <strong>.stl</strong>
            <span>Universal mesh format — exactly what you see now</span>
          </button>
          {hasPlates && (
            <button className="dropdown-item rich" role="menuitem" onClick={run(() => void exportPlates(fileBase))}>
              <strong>Parts as separate .stl files</strong>
              <span>One file per piece, named after each part</span>
            </button>
          )}
          <button
            className="dropdown-item rich"
            role="menuitem"
            disabled={!code.trim()}
            onClick={run(() => downloadBlob(applyValuesToCode(code, params, paramValues), `${fileBase}.scad`, 'text/plain'))}
          >
            <strong>.scad source</strong>
            <span>The editable program behind the model (OpenSCAD)</span>
          </button>
          <div className="dropdown-note">Files use the current quality: {qualityLabel}</div>
        </div>
      )}
    </div>
  )
}

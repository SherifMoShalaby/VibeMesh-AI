import { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { useUi } from '../state/ui'
import { applyValuesToCode } from '../lib/params'
import { downloadBlob } from '../lib/stl'
import { QUALITY_PRESETS } from '../types'
import { ConfirmDialog } from './Dialogs'
import {
  DLogo,
  DHistory,
  DChevDown,
  DChevRight,
  DCheck,
  DDownload,
  DPlus,
  DBox,
  DLayers,
  DCode,
  DArrowRight,
  IconTrash,
} from './icons'

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
  const code = useStore((s) => s.code)
  const stl = useStore((s) => s.stl)
  const setEnginesOpen = useUi((s) => s.setEnginesOpen)
  const mobileTab = useUi((s) => s.mobileTab)

  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const menuRef = useClickOutside(menuOpen, () => setMenuOpen(false))

  const active = projects.find((p) => p.id === activeId)
  const fileBase = (active?.name ?? 'model').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'model'

  const activeProvider = health?.providers.find((p) => p.id === engine)
  // workflow rail: Describe (have code) › Adjust (active) › Export (have geometry)
  const hasCode = code.trim().length > 0
  const hasModel = Boolean(stl)

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark"><DLogo /></div>
        <div className="brand-name">vibe<b>mesh</b>-ai</div>
      </div>

      {/* mobile-only context: which project + which screen you're on (desktop shows full project-controls) */}
      <div className="mobile-title">
        <span className="mt-project">{active?.name ?? 'New part'}</span>
        <span className="mt-screen">{mobileTab === 'params' ? 'Tweak' : mobileTab === 'chat' ? 'Chat' : 'Model'}</span>
      </div>

      <div className="topbar-sep" />

      <div className="project-controls" ref={menuRef}>
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
        <button
          className="icon-btn-sm"
          aria-label="Version history & projects"
          aria-expanded={menuOpen}
          title="Switch, create or delete projects"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <DHistory />
        </button>
        {menuOpen && (
          <div className="menu align-left" role="menu">
            <button className="menu-item" role="menuitem" onClick={() => { setMenuOpen(false); newProject() }}>
              <span className="mi-icon"><DPlus /></span>
              <span className="mi-text"><span className="mi-title">New part</span><span className="mi-sub">Start a fresh project</span></span>
            </button>
            {projects.length > 0 && <div className="menu-sep" />}
            <div className="menu-scroll">
              {projects.map((p) => (
                <button
                  key={p.id}
                  className={`menu-item${p.id === activeId ? ' active' : ''}`}
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); if (p.id !== activeId) openProject(p.id) }}
                >
                  <span className="mi-text"><span className="mi-title">{p.name}</span></span>
                  <span className="mi-check"><DCheck /></span>
                </button>
              ))}
            </div>
            {active && (
              <>
                <div className="menu-sep" />
                <button className="menu-item danger" role="menuitem" onClick={() => { setMenuOpen(false); setConfirmDelete(true) }}>
                  <span className="mi-icon" style={{ color: 'var(--err)' }}><IconTrash /></span>
                  <span className="mi-text"><span className="mi-title" style={{ color: 'var(--err)' }}>Delete this project…</span></span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <nav className="flow-rail" aria-label="Workflow: describe, adjust, export">
        <div className={`flow-step${hasCode ? ' done' : ' active'}`} title="Describe the part in the chat on the left">
          <span className="dot">{hasCode ? <DCheck /> : '1'}</span>Describe
        </div>
        <span className="flow-arrow"><DChevRight /></span>
        <div className={`flow-step${hasCode ? ' active' : ''}`} title="Fine-tune with the sliders on the right">
          <span className="dot">2</span>Adjust
        </div>
        <span className="flow-arrow"><DChevRight /></span>
        <div className={`flow-step${hasModel ? ' active' : ''}`} title="Export from the button on the right">
          <span className="dot">3</span>Export
        </div>
      </nav>

      <div className="topbar-right">
        {health && (
          <button
            className={`api-chip${activeProvider ? '' : ' warn'}`}
            onClick={() => setEnginesOpen(true)}
            title={`${activeProvider?.detail ?? 'No AI connected'} — click to manage`}
          >
            <span className="status-dot" />
            <span className="api-chip-label">{activeProvider ? `Engine · ${activeProvider.label.split(' · ')[0]}` : 'Connect AI'}</span>
            <span className="chev"><DChevDown /></span>
          </button>
        )}
        <ExportMenu fileBase={fileBase} />
      </div>

      {confirmDelete && active && (
        <ConfirmDialog
          title="Delete project"
          body={`Delete “${active.name}”? Its chat history and model go with it — this can't be undone.`}
          confirmLabel="Delete project"
          danger
          onConfirm={() => { setConfirmDelete(false); deleteProject(active.id) }}
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
  const exportPlates3mf = useStore((s) => s.exportPlates3mf)
  const exportStlSmart = useStore((s) => s.exportStlSmart)
  const export3mf = useStore((s) => s.export3mf)

  const [open, setOpen] = useState(false)
  const ref = useClickOutside(open, () => setOpen(false))

  const hasPlates = params.some((p) => p.name === 'part' && p.kind === 'enum')
  const qualityLabel = QUALITY_PRESETS.find((q) => q.id === quality)?.label ?? 'Standard'
  // below Fine, exports offer/auto a Fine re-render; Fine/Ultra previews export as-is
  const belowFine = quality !== 'fine' && quality !== 'ultra'

  const run = (fn: () => void | Promise<unknown>) => () => {
    setOpen(false)
    const fail = (e: unknown) => {
      console.error('[vibemesh-ai] export failed:', e)
      alert(`Export failed: ${e instanceof Error ? e.message : String(e)}`)
    }
    try {
      const r = fn()
      if (r instanceof Promise) void r.catch(fail)
    } catch (e) {
      fail(e)
    }
  }

  return (
    <div className="menu-wrap" ref={ref}>
      <button
        id="topbar-export"
        className="btn btn-primary"
        disabled={exportingPlates || (!stl && !code.trim())}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <DDownload /> {exportingPlates ? 'Exporting…' : 'Export'}
      </button>
      {open && (
        <div className="menu align-right" role="menu">
          <div className="menu-label">Export model</div>
          <button className="menu-item" role="menuitem" onClick={run(() => export3mf(fileBase))}>
            <span className="mi-icon"><DLayers /></span>
            <span className="mi-text">
              <span className="mi-title">3MF <span className="ext">.3mf</span></span>
              <span className="mi-sub">Recommended — parts + colors + metadata{hasPlates ? ', all parts included' : ''}</span>
            </span>
            <span className="mi-check"><DArrowRight /></span>
          </button>
          <button className="menu-item" role="menuitem" disabled={!stl} onClick={run(() => exportStlSmart(fileBase))}>
            <span className="mi-icon"><DBox /></span>
            <span className="mi-text">
              <span className="mi-title">STL <span className="ext">.stl</span></span>
              <span className="mi-sub">Universal mesh{belowFine ? ' — offers a Fine re-render for printing' : ''}</span>
            </span>
            <span className="mi-check"><DArrowRight /></span>
          </button>
          {hasPlates && (
            <button className="menu-item" role="menuitem" onClick={run(() => exportPlates(fileBase))}>
              <span className="mi-icon"><DLayers /></span>
              <span className="mi-text">
                <span className="mi-title">Parts as separate <span className="ext">.stl</span></span>
                <span className="mi-sub">One file per piece, named after each part</span>
              </span>
              <span className="mi-check"><DArrowRight /></span>
            </button>
          )}
          {hasPlates && (
            <button className="menu-item" role="menuitem" onClick={run(() => exportPlates3mf(fileBase))}>
              <span className="mi-icon"><DLayers /></span>
              <span className="mi-text">
                <span className="mi-title">Plates as <span className="ext">.3mf</span></span>
                <span className="mi-sub">One slicer-ready file per bed, packed like the Slicer view</span>
              </span>
              <span className="mi-check"><DArrowRight /></span>
            </button>
          )}
          <button
            className="menu-item"
            role="menuitem"
            disabled={!code.trim()}
            onClick={run(() => downloadBlob(applyValuesToCode(code, params, paramValues), `${fileBase}.scad`, 'text/plain'))}
          >
            <span className="mi-icon"><DCode /></span>
            <span className="mi-text">
              <span className="mi-title">OpenSCAD <span className="ext">.scad</span></span>
              <span className="mi-sub">The editable program behind the model</span>
            </span>
            <span className="mi-check"><DArrowRight /></span>
          </button>
          <div className="menu-sep" />
          <div className="menu-note">
            {belowFine ? `Export can re-render curves at Fine — preview is ${qualityLabel}.` : `Exported at ${qualityLabel} quality.`}
          </div>
        </div>
      )}
    </div>
  )
}

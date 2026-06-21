import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { useUi } from '../state/ui'
import { useAuth } from '../state/authStore'
import { supabase } from '../lib/supabase'
import { applyValuesToCode } from '../lib/params'
import { downloadBlob } from '../lib/stl'
import { useHardwareCatalog, detectBom, formatBomText } from '../lib/bom'
import { useClickOutside } from '../lib/useClickOutside'
import { QUALITY_PRESETS, CUSTOM_BED_ID, type OrcaMaterial } from '../types'
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
  DHelp,
  IconTrash,
} from './icons'

const EMPTY_QTY: Record<string, number> = {} // stable ref so the partQuantities selector fallback doesn't churn renders

export default function TopBar() {
  const projects = useStore((s) => s.projects)
  const activeId = useStore((s) => s.activeId)
  const renameProject = useStore((s) => s.renameProject)
  const openProject = useStore((s) => s.openProject)
  const newProject = useStore((s) => s.newProject)
  const deleteProject = useStore((s) => s.deleteProject)
  const sessions = useStore((s) => s.sessions)
  const abortGeneration = useStore((s) => s.abortGeneration)
  const health = useStore((s) => s.health)
  const engine = useStore((s) => s.engine)
  const code = useStore((s) => s.code)
  const stl = useStore((s) => s.stl)
  const setEnginesOpen = useUi((s) => s.setEnginesOpen)
  const setHelpOpen = useUi((s) => s.setHelpOpen)
  const mobileTab = useUi((s) => s.mobileTab)

  const exportAllToServer = useStore((s) => s.exportAllToServer)
  const { user, signOut } = useAuth()

  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const menuRef = useClickOutside(menuOpen, () => setMenuOpen(false))

  // a search box only earns its place once the list is long; auto-focus it on open (the query is
  // reset when the menu opens, in the toggle handler — keeps this effect free of setState)
  const showSearch = projects.length > 8
  useEffect(() => {
    if (menuOpen && showSearch) searchRef.current?.focus()
  }, [menuOpen, showSearch])
  const q = query.trim().toLowerCase()
  const filteredProjects = q ? projects.filter((p) => p.name.toLowerCase().includes(q)) : projects

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
        <button className="newchat-btn" aria-label="New chat" title="Start a new chat" onClick={() => newProject()}>
          <DPlus /> New chat
        </button>
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
          onClick={() => { if (!menuOpen) setQuery(''); setMenuOpen(!menuOpen) }}
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
            {showSearch && (
              <input
                ref={searchRef}
                className="menu-search"
                type="text"
                placeholder="Search projects…"
                value={query}
                aria-label="Search projects"
                onChange={(e) => setQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            )}
            <div className="menu-scroll">
              {showSearch && filteredProjects.length === 0 && (
                <div className="menu-empty">No projects match “{query.trim()}”.</div>
              )}
              {filteredProjects.map((p) => {
                const busy = !!sessions[p.id]?.generating
                return (
                  <button
                    key={p.id}
                    className={`menu-item${p.id === activeId ? ' active' : ''}`}
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); if (p.id !== activeId) openProject(p.id) }}
                  >
                    <span className="mi-text"><span className="mi-title">{p.name}</span></span>
                    {busy && (
                      <>
                        <span className="mi-spin" aria-label="Generating" title="Generating…" />
                        {/* stop this chat's run without opening it (works for a background generation) */}
                        <span
                          className="mi-stop"
                          role="button"
                          tabIndex={0}
                          title="Stop this generation"
                          onClick={(e) => { e.stopPropagation(); abortGeneration(p.id) }}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); abortGeneration(p.id) } }}
                        >
                          Stop
                        </span>
                      </>
                    )}
                    <span className="mi-check"><DCheck /></span>
                  </button>
                )
              })}
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
          <span className="dot">{hasCode ? <DCheck /> : '1'}</span><span className="flow-label">Describe</span>
        </div>
        <span className="flow-arrow"><DChevRight /></span>
        <div className={`flow-step${hasCode ? ' active' : ''}`} title="Fine-tune with the sliders on the right">
          <span className="dot">2</span><span className="flow-label">Adjust</span>
        </div>
        <span className="flow-arrow"><DChevRight /></span>
        <div className={`flow-step${hasModel ? ' active' : ''}`} title="Export from the button on the right">
          <span className="dot">3</span><span className="flow-label">Export</span>
        </div>
      </nav>

      <div className="topbar-right">
        {health && (
          <button
            className={`api-chip${activeProvider ? '' : ' warn'}`}
            onClick={() => setEnginesOpen(true)}
            // explicit label so the chip keeps an accessible name when its text is hidden at phone width
            aria-label={activeProvider ? `Engine · ${activeProvider.label.split(' · ')[0]} — manage AI engines` : 'Connect AI'}
            title={`${activeProvider?.detail ?? 'No AI connected'} — click to manage`}
          >
            <span className="status-dot" />
            <span className="api-chip-label">{activeProvider ? `Engine · ${activeProvider.label.split(' · ')[0]}` : 'Connect AI'}</span>
            <span className="chev"><DChevDown /></span>
          </button>
        )}
        <ExportMenu fileBase={fileBase} />
        {supabase && user && (
          <>
            <button
              className="btn btn-ghost"
              style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}
              title="Back up all projects to the server"
              onClick={() => void exportAllToServer()}
            >
              Back up
            </button>
            <button
              className="btn btn-ghost"
              style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}
              title={`Signed in as ${user.email}`}
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          </>
        )}
        {/* persistent Help affordance — the shortcuts overlay was '?'-key-only, unreachable on touch */}
        <button className="icon-btn-sm" aria-label="Keyboard shortcuts & help" title="Shortcuts & help (?)" onClick={() => setHelpOpen(true)}>
          <DHelp />
        </button>
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
  const exportOrcaProject = useStore((s) => s.exportOrcaProject)
  const orcaMaterial = useStore((s) => s.orcaMaterial)
  const setOrcaMaterial = useStore((s) => s.setOrcaMaterial)
  const bedId = useStore((s) => s.bedId)
  const exportShareFile = useStore((s) => s.exportShareFile)
  const importShareFile = useStore((s) => s.importShareFile)
  const partQuantities = useStore((s) => s.projects.find((p) => p.id === s.activeId)?.partQuantities ?? EMPTY_QTY)
  const pushToast = useUi((s) => s.pushToast)
  const importInputRef = useRef<HTMLInputElement>(null)

  // bill of materials — the real hardware this design needs (catalog fetched once; detected
  // client-side over the current program so the server never sees the OpenSCAD)
  const hardwareCatalog = useHardwareCatalog()
  const bom = useMemo(
    () => detectBom(applyValuesToCode(code, params, paramValues), hardwareCatalog),
    [hardwareCatalog, code, params, paramValues],
  )

  const [open, setOpen] = useState(false)
  const ref = useClickOutside(open, () => setOpen(false))

  const hasPlates = params.some((p) => p.name === 'part' && p.kind === 'enum')
  // per-part print quantities (set in the PARTS bar) — echoed read-only here so the count is visible
  // at the moment of export. Replicated on the plate/3MF rows; a count note on separate-STL.
  const pieceNames = (params.find((p) => p.name === 'part' && p.kind === 'enum')?.options ?? []).map(String).filter((o) => o !== 'all')
  const copyOf = (n: string) => Math.max(1, Math.min(99, Math.floor(partQuantities[n] ?? 1)))
  const totalCopies = pieceNames.reduce((s, n) => s + copyOf(n), 0)
  const hasMultiples = pieceNames.some((n) => copyOf(n) > 1)
  const qualityLabel = QUALITY_PRESETS.find((q) => q.id === quality)?.label ?? 'Standard'
  // below Fine, exports offer/auto a Fine re-render; Fine/Ultra previews export as-is
  const belowFine = quality !== 'fine' && quality !== 'ultra'

  const run = (fn: () => void | Promise<unknown>) => () => {
    setOpen(false)
    const fail = (e: unknown) => {
      console.error('[vibemesh-ai] export failed:', e)
      pushToast(`Export failed: ${e instanceof Error ? e.message : String(e)}`, 'error')
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
          <div className="menu-item menu-item--control" style={{ cursor: 'default', gap: 8 }}>
            <span className="mi-icon" style={{ opacity: 0.5 }}>
              <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><circle cx="8" cy="8" r="6" strokeWidth="2" stroke="currentColor" fill="none"/><circle cx="8" cy="8" r="2"/></svg>
            </span>
            <span className="mi-text" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Material</span>
              <select
                value={orcaMaterial}
                onChange={(e) => setOrcaMaterial(e.target.value as OrcaMaterial)}
                onClick={(e) => e.stopPropagation()}
                style={{ fontSize: '0.75rem', flex: 1, background: 'var(--surface-2, #1e1e2e)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 4px', cursor: 'pointer' }}
              >
                <option value="PLA">PLA</option>
                <option value="PETG">PETG</option>
                <option value="ABS">ABS</option>
                <option value="TPU">TPU</option>
              </select>
            </span>
          </div>
          <button
            className="menu-item"
            role="menuitem"
            disabled={(!stl && !hasPlates) || bedId === 'bambu-h2d' || bedId === CUSTOM_BED_ID}
            onClick={run(() => exportOrcaProject(fileBase))}
          >
            <span className="mi-icon"><DLayers /></span>
            <span className="mi-text">
              <span className="mi-title">OrcaSlicer / Bambu project <span className="ext">.3mf</span></span>
              <span className="mi-sub">Slice-ready — printer, filament &amp; process pre-selected{bedId === 'bambu-h2d' || bedId === CUSTOM_BED_ID ? ' (unavailable for this bed)' : ''}</span>
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
                <span className="mi-sub">One file per piece, named after each part{hasMultiples ? ' · print counts noted (set copies in slicer)' : ''}</span>
              </span>
              <span className="mi-check"><DArrowRight /></span>
            </button>
          )}
          {hasPlates && (
            <button className="menu-item" role="menuitem" onClick={run(() => exportPlates3mf(fileBase))}>
              <span className="mi-icon"><DLayers /></span>
              <span className="mi-text">
                <span className="mi-title">Plates as <span className="ext">.3mf</span></span>
                <span className="mi-sub">One slicer-ready file per bed, packed like the Slicer view{hasMultiples ? ` · ${totalCopies} copies packed` : ''}</span>
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
          <div className="menu-label">Share / remix</div>
          <button
            className="menu-item"
            role="menuitem"
            disabled={!code.trim()}
            onClick={run(() => exportShareFile(fileBase))}
          >
            <span className="mi-icon"><DLayers /></span>
            <span className="mi-text">
              <span className="mi-title">Share file <span className="ext">.vibemesh</span></span>
              <span className="mi-sub">Re-editable — code + sliders + intent, opens with live parameters</span>
            </span>
            <span className="mi-check"><DArrowRight /></span>
          </button>
          <button className="menu-item" role="menuitem" onClick={() => { setOpen(false); importInputRef.current?.click() }}>
            <span className="mi-icon"><DBox /></span>
            <span className="mi-text">
              <span className="mi-title">Import <span className="ext">.vibemesh</span></span>
              <span className="mi-sub">Open someone's shared part as a new, editable project</span>
            </span>
            <span className="mi-check"><DArrowRight /></span>
          </button>
          {bom.length > 0 && (
            <>
              <div className="menu-sep" />
              <div className="menu-label">Hardware to buy</div>
              <div className="bom-list">
                {bom.map((it) => (
                  <div key={it.id} className="bom-row" title={it.line}>
                    <span className={`bom-tag ${it.kind}`}>{it.id}</span>
                    <span className="bom-line">{it.line.replace(/^[^—]+— /, '')}</span>
                  </div>
                ))}
              </div>
              <button
                className="menu-item"
                role="menuitem"
                onClick={run(() => downloadBlob(formatBomText(bom, fileBase), `${fileBase}-hardware.txt`, 'text/plain'))}
              >
                <span className="mi-icon"><DDownload /></span>
                <span className="mi-text">
                  <span className="mi-title">Hardware list <span className="ext">.txt</span></span>
                  <span className="mi-sub">Real dims for the {bom.length} part{bom.length > 1 ? 's' : ''} above — what to order</span>
                </span>
                <span className="mi-check"><DArrowRight /></span>
              </button>
            </>
          )}
          <div className="menu-sep" />
          <div className="menu-note">
            {belowFine ? `Export can re-render curves at Fine — preview is ${qualityLabel}.` : `Exported at ${qualityLabel} quality.`}
          </div>
        </div>
      )}
      <input
        ref={importInputRef}
        type="file"
        accept=".vibemesh,application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = '' // allow re-importing the same file
          if (!f) return
          f.text()
            .then((t) => importShareFile(t))
            .catch((err) => pushToast(`Could not read the file: ${err instanceof Error ? err.message : String(err)}`, 'error'))
        }}
      />
    </div>
  )
}

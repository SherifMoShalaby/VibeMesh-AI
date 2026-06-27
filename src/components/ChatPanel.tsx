import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { useStore } from '../state/store'
import { useUi } from '../state/ui'
import { imageBudgetFor } from '../lib/api'
import { tileReference } from '../lib/tile'
import { flaggedSkillIds } from '../lib/skillStats'
import type { ChatImage } from '../types'
import { DImage, DPlus, DChevLeft } from './icons'
import { MAX_IMAGES, IMAGE_TYPES } from './chatShared'
import { ContextChip } from './ContextChips'
import ChatList from './ChatList'
import ChatComposer from './ChatComposer'
import { useRefinePass } from './useRefinePass'

export default function ChatPanel({ mobileShow = false, paneCollapsed = false }: { mobileShow?: boolean; paneCollapsed?: boolean }) {
  const projects = useStore((s) => s.projects)
  const activeId = useStore((s) => s.activeId)
  // UIUX-7: generating is needed here ONLY for canRefine + Stop button visibility + the
  // chat-list/composer guards. It does NOT feed streamText rendering — that lives in StreamingBubble.
  const generating = useStore((s) => s.generating)
  const genCalls = useStore((s) => s.genCalls)
  const genTokens = useStore((s) => s.genTokens)
  const regenerateWithSkills = useStore((s) => s.regenerateWithSkills)
  const skillStats = useStore((s) => s.skillStats)
  // skills the user has removed often enough locally to suggest quarantining — a chip hint
  const flaggedSkills = useMemo(() => flaggedSkillIds(skillStats), [skillStats])
  const health = useStore((s) => s.health)
  const healthLoaded = useStore((s) => s.healthLoaded)
  const engine = useStore((s) => s.engine)
  const restoreVersion = useStore((s) => s.restoreVersion)
  const restoreNewer = useStore((s) => s.restoreNewer)
  const retryLast = useStore((s) => s.retryLast)
  const rerollLast = useStore((s) => s.rerollLast)
  const currentCode = useStore((s) => s.code)
  const newProject = useStore((s) => s.newProject)

  const setEnginesOpen = useUi((s) => s.setEnginesOpen)
  const setLeftCollapsed = useUi((s) => s.setLeftCollapsed)

  // image-attach state is shared between the section-level drop zone (the .drop-overlay covers
  // the whole .chat-pane) and the composer, so it lives here at the section root.
  const [images, setImages] = useState<ChatImage[]>([])
  const [lightbox, setLightbox] = useState<string | null>(null) // data URL of the image opened full-size
  const [dragging, setDragging] = useState(false)
  const [attachNote, setAttachNote] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()

  const chat = useMemo(() => projects.find((p) => p.id === activeId)?.chat ?? [], [projects, activeId])
  // versions rolled past via Restore, recoverable until the next prompt diverges the branch
  const rolledBackVersions = (projects.find((p) => p.id === activeId)?.chatFuture ?? []).filter((m) => m.code).length
  const activeProvider = health?.providers.find((p) => p.id === engine)
  // health probe resolved but returned nothing → no AI backend reachable (e.g. the static GitHub Pages demo)
  const noBackend = healthLoaded && !health

  const stl = useStore((s) => s.stl)
  const compileStatus = useStore((s) => s.compileStatus)
  const pendingAutoRefineFor = useStore((s) => s.pendingAutoRefineFor)
  const consumeAutoRefine = useStore((s) => s.consumeAutoRefine)
  const hasReference = chat.some((m) => m.role === 'user' && (m.images?.length ?? 0) > 0)
  const canRefine = Boolean(stl && compileStatus === 'ok' && hasReference && !generating && engine && activeProvider?.vision)

  const flashAttachNote = (note: string) => {
    setAttachNote(note)
    setTimeout(() => setAttachNote(null), 3500)
  }

  const attachFiles = async (files: Iterable<File>) => {
    const all = Array.from(files)
    const accepted = all.filter((f) => IMAGE_TYPES.test(f.type))
    if (all.length > 0 && accepted.length === 0) {
      flashAttachNote('only PNG, JPEG, WebP or GIF images')
      return
    }
    if (accepted.length < all.length) flashAttachNote(`attached ${accepted.length} of ${all.length} — images only`)
    // tile at attach time: a busy/ortho sheet becomes a global thumbnail + region crops; a clean
    // photo stays one global. Bounded by the engine's image budget (claude-code=4); the same cap
    // is re-enforced at send (toApiMessages). Each output carries pixel dims + a role.
    const provider = health?.providers.find((p) => p.id === engine)
    const budget = Math.max(1, imageBudgetFor(provider) || MAX_IMAGES)
    const collected: ChatImage[] = []
    for (const file of accepted) {
      if (collected.length >= budget) break
      collected.push(...(await tileReference(file, budget)))
    }
    if (!collected.length) {
      flashAttachNote('could not read the image')
      return
    }
    setImages((prev) => [...prev, ...collected].slice(0, budget))
  }

  const refine = useRefinePass(chat, activeId, flashAttachNote)

  // new message → smooth scroll it into view (reduced-motion → instant). Token scrolling is
  // handled inside StreamingBubble (it re-renders per token anyway) via the same scrollRef.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: (reduce ?? false) ? 'auto' : 'smooth' })
  }, [chat.length, reduce])

  // auto-fire one refine pass after the first image-grounded model renders (store
  // sets the flag to this project's id; we wait for canRefine, then let R3F paint).
  // Consume INSIDE the timer — consuming up-front would flip a dep and the cleanup
  // would cancel the timer before it fires. Project-match guard prevents misfiring
  // on a different project if the flag is still pending after a switch.
  useEffect(() => {
    if (!pendingAutoRefineFor || pendingAutoRefineFor !== activeId || !canRefine) return
    const t = setTimeout(() => {
      consumeAutoRefine()
      refine()
    }, 450)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAutoRefineFor, activeId, canRefine])

  // Esc closes the full-size image preview
  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

  // number restorable versions so history reads as history (UX-AUDIT F17)
  const versionOf = useMemo(() => {
    const map = new Map<string, number>()
    let v = 0
    for (const m of chat) if (m.code) map.set(m.id, ++v)
    return map
  }, [chat])

  // UIUX-7: stable callbacks so MessageRow props never change identity across re-renders
  // (prevents parent re-render from busting the memo even on chat-length changes)
  const onLightbox = useCallback((src: string | null) => setLightbox(src), [])
  const onRestoreVersion = useCallback((id: string) => restoreVersion(id), [restoreVersion])
  const onRestoreNewer = useCallback(() => restoreNewer(), [restoreNewer])
  const onRetryLast = useCallback(() => void retryLast(), [retryLast])
  const onRerollLast = useCallback(() => void rerollLast(), [rerollLast])
  const onRegenerateWithSkills = useCallback(
    (id: string, ids: string[]) => void regenerateWithSkills(id, ids),
    [regenerateWithSkills],
  )

  return (
    <section
      className={`pane chat-pane${mobileShow ? ' sheet-show' : ''}${paneCollapsed ? ' is-collapsed' : ''}`}
      onDragOver={(e) => {
        const hasImage = Array.from(e.dataTransfer.items).some((item) => IMAGE_TYPES.test(item.type))
        if (hasImage) {
          e.preventDefault()
          setDragging(true)
        }
      }}
    >
      {dragging && (
        <div
          className="drop-overlay"
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            void attachFiles(e.dataTransfer.files)
          }}
        >
          <span><DImage /> Drop a photo or sketch</span>
        </div>
      )}

      {lightbox && (
        <div className="img-lightbox" role="dialog" aria-modal="true" aria-label="Image preview" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="reference, full size" onClick={(e) => e.stopPropagation()} />
          <button className="img-lightbox-x" aria-label="Close image preview" title="Close (Esc)" onClick={() => setLightbox(null)}>×</button>
        </div>
      )}

      {/* ── header ── */}
      <div className="pane-head">
        <span className="eyebrow">Conversation</span>
        {/* Single ring chip: Context % + spend info folded into tooltip (guard: header merge) */}
        <ContextChip chat={chat} provider={activeProvider} systemTokens={health?.systemTokens} calls={genCalls} tokens={genTokens} />
        <button className="icon-btn-sm" title="New part" aria-label="New part" onClick={() => newProject()}>
          <DPlus />
        </button>
        <button className="icon-btn-sm" title="Collapse chat panel" aria-label="Collapse chat panel" onClick={() => setLeftCollapsed(true)}>
          <DChevLeft />
        </button>
      </div>

      {health && !health.providers.some((p) => p.available) && (
        <div className="key-banner">
          <strong>No AI connected yet.</strong>{' '}
          <button className="banner-link" onClick={() => setEnginesOpen(true)}>Connect one →</button>{' '}
          Examples and sliders work without it.
        </div>
      )}

      {noBackend && (
        <div className="key-banner">
          <strong>Demo mode — no AI backend.</strong>{' '}
          Examples, the parameter sliders, in-browser rendering and STL/3MF export all work here.
          AI generation needs the self-hosted server (see the README).
        </div>
      )}

      <ChatList
        scrollRef={scrollRef}
        chat={chat}
        generating={generating}
        activeProvider={activeProvider}
        versionOf={versionOf}
        currentCode={currentCode}
        rolledBackVersions={rolledBackVersions}
        flaggedSkills={flaggedSkills}
        reduce={reduce}
        onLightbox={onLightbox}
        onRestoreVersion={onRestoreVersion}
        onRestoreNewer={onRestoreNewer}
        onRetryLast={onRetryLast}
        onRerollLast={onRerollLast}
        onRegenerateWithSkills={onRegenerateWithSkills}
      />

      <ChatComposer
        chat={chat}
        generating={generating}
        noBackend={noBackend}
        activeProvider={activeProvider}
        activeId={activeId}
        canRefine={canRefine}
        onRefine={refine}
        onLightbox={(src) => setLightbox(src)}
        images={images}
        setImages={setImages}
        attachFiles={attachFiles}
        attachNote={attachNote}
      />
    </section>
  )
}

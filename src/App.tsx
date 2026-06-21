import { useEffect, useState } from 'react'
import { useStore } from './state/store'
import { useUi } from './state/ui'
import { chatIdFromHash, setChatHash } from './lib/hashRoute'
import TopBar from './components/TopBar'
import ChatPanel from './components/ChatPanel'
import Viewport from './components/Viewport'
import RightPanel from './components/RightPanel'
import EnginesModal from './components/EnginesModal'
import HelpModal from './components/HelpModal'
import { Toaster, ConfirmHost } from './components/Dialogs'
import ErrorBoundary from './components/ErrorBoundary'
import { DCube, DSliders, DSparkFill, DChevLeft, DChevRight } from './components/icons'

const IDLE_TITLE = 'Vibemesh-AI — parametric CAD for 3D printing'

/** Layout breakpoints, kept in sync with styles.css:
 *  - `mobile` (≤860px): viewport-first layout with a bottom tab bar (chat/params become sheets).
 *    The 860 threshold MUST match the CSS breakpoint or 721–860px is a dead-zone.
 *  - `wide` (>1180px): the draggable 3-column workspace with resizer handles. Between 861–1180px
 *    we keep the rails but fall back to the fixed responsive grid (styles.css @media 1180) WITHOUT
 *    resizers, so the rails can't crush the viewport on a small laptop/tablet. */
function useBreakpoints() {
  const read = () => ({
    mobile: typeof window !== 'undefined' && window.innerWidth <= 860,
    wide: typeof window !== 'undefined' && window.innerWidth > 1180,
  })
  const [bp, setBp] = useState(read)
  useEffect(() => {
    const onResize = () => setBp(read())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return bp
}

/** Drag handle between two panes. Updates the persisted column width in the ui store; the
 *  left handle grows the chat rail, the right handle grows the params rail. Pointer capture
 *  + a body cursor/select lock keep the drag smooth even when the pointer leaves the handle. */
function Resizer({ side }: { side: 'left' | 'right' }) {
  const leftWidth = useUi((s) => s.leftWidth)
  const rightWidth = useUi((s) => s.rightWidth)
  const setLeftWidth = useUi((s) => s.setLeftWidth)
  const setRightWidth = useUi((s) => s.setRightWidth)

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    const handle = e.currentTarget as HTMLElement
    try {
      handle.setPointerCapture(e.pointerId) // best-effort; window listeners below are the real guarantee
    } catch {
      /* no active pointer (synthetic event) — ignore */
    }
    const startX = e.clientX
    const startW = side === 'left' ? leftWidth : rightWidth
    const prevCursor = document.body.style.cursor
    const prevSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const onMove = (ev: PointerEvent) => {
      const delta = ev.clientX - startX
      if (side === 'left') setLeftWidth(startW + delta)
      else setRightWidth(startW - delta)
    }
    const onUp = () => {
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = prevSelect
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return <div className="col-resizer" role="separator" aria-orientation="vertical" aria-label={`Resize ${side} panel`} onPointerDown={onPointerDown} />
}

export default function App() {
  const init = useStore((s) => s.init)
  const generating = useStore((s) => s.generating)
  // how many chats are generating right now (incl. background ones) — drives the tab-title count
  const genCount = useStore((s) => Object.values(s.sessions).filter((x) => x.generating).length)
  const compileStatus = useStore((s) => s.compileStatus)
  const slicing = useStore((s) => s.slicing)
  const activeId = useStore((s) => s.activeId)
  const code = useStore((s) => s.code)
  const chatLen = useStore((s) => s.projects.find((p) => p.id === s.activeId)?.chat.length ?? 0)
  const { mobile: isMobile, wide: isWide } = useBreakpoints()
  const mobileTab = useUi((s) => s.mobileTab)
  const setMobileTab = useUi((s) => s.setMobileTab)
  const leftWidth = useUi((s) => s.leftWidth)
  const rightWidth = useUi((s) => s.rightWidth)
  const leftCollapsed = useUi((s) => s.leftCollapsed)
  const rightCollapsed = useUi((s) => s.rightCollapsed)
  const setLeftCollapsed = useUi((s) => s.setLeftCollapsed)
  const setRightCollapsed = useUi((s) => s.setRightCollapsed)

  // Home (Claude-style new-chat screen): no project, or a TRULY empty one — no code, not
  // generating, and no chat messages. The chat-length check matters: a generation that errors
  // (or returns only prose) ends with code still '' but a chat history present; without it the
  // rails would unmount and hide the error behind the home screen. The moment a prompt is sent
  // (generating), code exists, or any message lands, the 3-column workspace appears. Desktop
  // only: on mobile the rails are bottom sheets, mounted and toggled via the tab bar.
  const isHome = !isMobile && (!activeId || (!code.trim() && !generating && chatLen === 0))
  // workspace = desktop with a model/chat. Resizers (drag handles) only > 1180px; 861–1180px
  // keeps the rails on fixed responsive widths so they can't squeeze the viewport.
  const workspace = !isHome && !isMobile
  const resizable = workspace && isWide
  // Either rail can be collapsed in the desktop workspace. A collapsed rail's grid track goes to
  // 0 (the pane stays mounted but is hidden via .is-collapsed, preserving its draft/scroll state)
  // and its resizer is dropped; a floating tab at the edge brings it back.
  const lCol = workspace && leftCollapsed
  const rCol = workspace && rightCollapsed
  // single derived "the canvas/main thread is working" signal. Reflected as [data-busy] on the
  // app root so CSS can suppress decorative entrance/stagger motion while openscad-wasm parses an
  // STL or the AI streams — the status-dot/tab pulses are the sanctioned exceptions (kept running).
  const busy = generating || compileStatus === 'compiling' || slicing
  const showResizerL = resizable && !lCol
  const showResizerR = resizable && !rCol
  const leftPx = resizable ? leftWidth : 300
  const rightPx = resizable ? rightWidth : 280
  const gridTemplate = [
    lCol ? '0px' : `${leftPx}px`,
    showResizerL ? 'var(--resizer-w)' : null,
    '1fr',
    showResizerR ? 'var(--resizer-w)' : null,
    rCol ? '0px' : `${rightPx}px`,
  ]
    .filter(Boolean)
    .join(' ')

  useEffect(() => {
    void init()
  }, [init])

  // Keep the store in sync with Back/Forward navigation and hand-edited URLs: an id in the
  // hash opens that chat; a bare URL starts a new chat. The store's setChatHash no-ops when the
  // hash already matches, and the id!==activeId guard below breaks the open→setHash→hashchange loop.
  useEffect(() => {
    const onHash = () => {
      const id = chatIdFromHash()
      const s = useStore.getState()
      if (id && id !== s.activeId && s.projects.some((p) => p.id === id)) {
        s.openProject(id) // Back/Forward (or pasted URL) to a known chat
      } else if (id && !s.projects.some((p) => p.id === id)) {
        setChatHash(s.activeId ?? null, { replace: true }) // stale/deleted id (e.g. Back onto a deleted chat) → normalize the URL, no history entry
      } else if (!id && s.activeId) {
        setChatHash(s.activeId, { replace: true }) // bare URL mid-session → re-sync to the open chat (don't spawn a chat or trap Back); cold loads create a fresh chat in init()
      }
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // surface long-running work in the tab title (AI runs can take minutes)
  useEffect(() => {
    document.title = genCount > 0
      ? `⌛ ${genCount > 1 ? `${genCount} drafting…` : 'AI drafting…'} · Vibemesh-AI`
      : compileStatus === 'compiling' ? '⚙ Rendering… · Vibemesh-AI' : IDLE_TITLE
  }, [genCount, compileStatus])

  // low-power / reduced-transparency probe → body.perf-lite drops backdrop-blur on the glass
  // surfaces (cheap, opaque fallback). Runs once; .perf-lite is also the manual rollback flag.
  useEffect(() => {
    const lowPower = (navigator.hardwareConcurrency ?? 8) <= 4
    const reducedTransparency = window.matchMedia?.('(prefers-reduced-transparency: reduce)').matches
    if (lowPower || reducedTransparency) document.body.classList.add('perf-lite')
  }, [])

  return (
    <div className={`app${isMobile ? ' is-mobile' : ''}${isHome ? ' is-home' : ''}`} data-accent="cobalt" data-material="workshop" data-hud="bar" data-empty="full" data-busy={busy || undefined}>
      <ErrorBoundary>
        <TopBar />
        <div
          className="app-body"
          style={workspace ? { gridTemplateColumns: gridTemplate } : undefined}
        >
          {!isHome && <ChatPanel mobileShow={isMobile && mobileTab === 'chat'} paneCollapsed={lCol} />}
          {showResizerL && <Resizer side="left" />}
          <Viewport />
          {showResizerR && <Resizer side="right" />}
          {!isHome && <RightPanel mobileShow={isMobile && mobileTab === 'params'} paneCollapsed={rCol} />}
          {lCol && (
            <button className="rail-expand left" title="Show chat panel" aria-label="Show chat panel" onClick={() => setLeftCollapsed(false)}>
              <DChevRight />
            </button>
          )}
          {rCol && (
            <button className="rail-expand right" title="Show parameters panel" aria-label="Show parameters panel" onClick={() => setRightCollapsed(false)}>
              <DChevLeft />
            </button>
          )}
        </div>

      {isMobile && (
        <nav className="mobile-tabbar">
          <button className={`mtab${mobileTab === 'model' ? ' active' : ''}`} onClick={() => setMobileTab('model')}>
            <DCube /> Model
          </button>
          <button className={`mtab${mobileTab === 'params' ? ' active' : ''}`} onClick={() => setMobileTab(mobileTab === 'params' ? 'model' : 'params')}>
            <DSliders /> Tweak
          </button>
          <button className={`mtab${mobileTab === 'chat' ? ' active' : ''}`} onClick={() => setMobileTab(mobileTab === 'chat' ? 'model' : 'chat')}>
            <DSparkFill /> Chat
          </button>
        </nav>
      )}

      <EnginesModal />
      <HelpModal />
      <ConfirmHost />
      <Toaster />
      </ErrorBoundary>
    </div>
  )
}

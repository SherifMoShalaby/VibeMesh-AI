// UIUX-9: ChatComposer — the input + image-attach + send surface (extracted from
// ChatPanel.tsx). Owns its self-contained composer state (input text, attached
// images, prompt-history cursor, attach note) and the attach/submit/paste/keydown
// handlers; cross-cutting bits (lightbox, refine, drag overlay) stay in ChatPanel
// and are passed in as props. Behavior-preserving move — no logic change.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { useUi } from '../state/ui'
import { autoRefineCount } from '../state/generationActions'
import ModelMenu from './ModelMenu'
import type { ChatImage, ChatMessage } from '../types'
import { IconWarning, DImage, DSend } from './icons'
import { IMAGE_TYPES, imgSrc } from './chatShared'

export default function ChatComposer({
  chat,
  generating,
  noBackend,
  activeProvider,
  activeId,
  canRefine,
  onRefine,
  onLightbox,
  images,
  setImages,
  attachFiles,
  attachNote,
}: {
  chat: ChatMessage[]
  generating: boolean
  noBackend: boolean
  activeProvider: { label: string; vision?: boolean } | undefined
  activeId: string | null
  canRefine: boolean
  onRefine: () => void
  onLightbox: (src: string) => void
  images: ChatImage[]
  setImages: React.Dispatch<React.SetStateAction<ChatImage[]>>
  attachFiles: (files: Iterable<File>) => void | Promise<void>
  attachNote: string | null
}) {
  const sendPrompt = useStore((s) => s.sendPrompt)
  const abortGeneration = useStore((s) => s.abortGeneration)

  const draftPrompt = useUi((s) => s.draftPrompt)
  const setDraftPrompt = useUi((s) => s.setDraftPrompt)
  const autoRepair = useUi((s) => s.autoRepair)
  const setAutoRepair = useUi((s) => s.setAutoRepair)
  const bestOfN = useUi((s) => s.bestOfN)
  const setBestOfN = useUi((s) => s.setBestOfN)

  const [input, setInput] = useState('')
  const [histIdx, setHistIdx] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)

  const noVision = images.length > 0 && activeProvider && !activeProvider.vision

  useEffect(() => {
    if (draftPrompt !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInput(draftPrompt)
      setDraftPrompt(null)
      textRef.current?.focus()
    }
  }, [draftPrompt, setDraftPrompt])

  const promptHistory = useMemo(
    () => chat.filter((m) => m.role === 'user' && !m.action && m.text.trim()).map((m) => m.text),
    [chat],
  )

  const submit = () => {
    const text = input.trim()
    if ((!text && images.length === 0) || generating || noVision || noBackend) return
    setInput('')
    setHistIdx(null)
    const imgs = images
    setImages([])
    void sendPrompt(
      text || 'Model the part shown in the attached image. Use any labeled dimensions exactly.',
      imgs.length ? imgs : undefined,
      !text && imgs.length ? 'Photo prompt' : undefined,
    )
  }

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
      return
    }
    if (e.key === 'ArrowUp' && promptHistory.length > 0 && (histIdx !== null || input.trim() === '')) {
      e.preventDefault()
      const next = histIdx === null ? promptHistory.length - 1 : Math.max(0, histIdx - 1)
      setHistIdx(next)
      setInput(promptHistory[next])
    }
    if (e.key === 'ArrowDown' && histIdx !== null) {
      e.preventDefault()
      const next = histIdx + 1
      if (next >= promptHistory.length) {
        setHistIdx(null)
        setInput('')
      } else {
        setHistIdx(next)
        setInput(promptHistory[next])
      }
    }
  }

  const onPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.items)
      .filter((item) => item.kind === 'file' && IMAGE_TYPES.test(item.type))
      .map((item) => item.getAsFile())
      .filter((f): f is File => f !== null)
    if (files.length > 0) {
      e.preventDefault()
      void attachFiles(files)
    }
  }

  return (
    <div className="composer">
      <div className={`composer-box${generating ? ' is-generating' : ''}`}>

        {/* UIUX-7: composer progress bar reads generating+elapsed from its own
            slice. We use a separate thin component to avoid subscribing to streamText. */}
        {generating && <ComposerProgressBar />}

        {/* inline thumbnail strip — GUARD: real <img> elements inside .chat-pane
            (surfaces.spec.ts:23 asserts `.chat-pane img` visible after setInputFiles) */}
        {images.length > 0 && (
          <div className="composer-thumbs">
            {images.map((img, i) => (
              <span key={i} className="attach-thumb">
                <img src={imgSrc(img)} alt={`attachment ${i + 1}`} title="Click to view full size" onClick={() => onLightbox(imgSrc(img))} />
                <button aria-label="Remove attached image" title="Remove attached image" onClick={() => setImages(images.filter((_, j) => j !== i))}>×</button>
              </span>
            ))}
          </div>
        )}

        {/* inline hint chips: vision-warn / attachNote / refine-bar */}
        {noVision && (
          <div className="composer-hint warn" role="status">
            <IconWarning /> {activeProvider!.label} can't see images — switch engine or remove the attachment. Send is disabled.
          </div>
        )}
        {attachNote && (
          <div className="composer-hint warn" role="status">
            <IconWarning /> {attachNote}
          </div>
        )}
        {canRefine && (
          <button
            className="composer-hint refine"
            onClick={onRefine}
            title="Snapshot the model from a fixed angle and ask the AI to compare it against your reference photo, then fix the differences"
          >
            {/* LAT-2 — once the bounded auto-refine chain has fired, this is the manual
                "Refine again" control that runs exactly one further pass on demand. */}
            <DImage /> {activeId && autoRefineCount(activeId) > 0 ? 'Refine again' : 'Compare with my photo & fix'}
          </button>
        )}

        <textarea
          ref={textRef}
          aria-label="Describe the part"
          title="Enter sends — Shift+Enter for a new line"
          placeholder={chat.length ? 'Describe a change — "add a 6 mm cable channel through the base"…' : 'e.g. a wall hook for headphones, 30mm reach…'}
          value={input}
          rows={1}
          onChange={(e) => { setInput(e.target.value); setHistIdx(null) }}
          onPaste={onPaste}
          onKeyDown={onInputKeyDown}
        />

        {/* GUARD: <input type=file> inside .chat-pane (surfaces.spec.ts:22) */}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          hidden
          onChange={(e) => { void attachFiles(e.target.files ?? []); e.target.value = '' }}
        />

        {/* Action row: secondary cluster (wraps) + non-wrapping Send sibling */}
        <div className="composer-actions">
          <div className="composer-secondary">
            <button className="chip-btn icon-only" aria-label="Attach a photo or sketch" title="Attach a photo or sketch — or paste (⌘V) / drag & drop" onClick={() => fileRef.current?.click()}>
              <DImage />
            </button>
            <button
              className="chip-btn"
              type="button"
              aria-pressed={autoRepair}
              title={autoRepair ? 'Auto-fix is ON — I retry once automatically if a model fails to render' : 'Auto-fix is OFF'}
              onClick={() => setAutoRepair(!autoRepair)}
            >
              <span className={autoRepair ? 'dot-ok' : 'dot-off'} /> Auto-fix
            </button>
            <button
              className="chip-btn"
              type="button"
              aria-pressed={bestOfN}
              title={bestOfN ? 'Best-of-3 is ON — for kit / image prompts I generate 3 candidates and keep the one that scores best (uses 3× the generations)' : 'Best-of-3 is OFF — turn on to trade 3× generations for higher reliability on kit / image prompts'}
              onClick={() => setBestOfN(!bestOfN)}
            >
              <span className={bestOfN ? 'dot-ok' : 'dot-off'} /> Best-of-3
            </button>
            <ModelMenu />
          </div>
          {/* Send is outside .composer-secondary so it can't wrap to row 2 */}
          <div className="composer-send">
            {generating ? (
              <button className="send-btn stop" onClick={() => abortGeneration()}>Stop</button>
            ) : (
              <button
                className="send-btn"
                onClick={submit}
                disabled={(!input.trim() && images.length === 0) || Boolean(noVision) || noBackend}
                title={noBackend ? 'AI generation needs the self-hosted backend — not available in this demo' : noVision ? 'This engine cannot see images — switch engine or remove the attachment' : undefined}
              >
                <DSend /> Send
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── UIUX-7: ComposerProgressBar — subscribes to generating + elapsed (via its own timer) ─
// Keeps the composer's progress label out of ChatPanel's render path on token updates.

function ComposerProgressBar() {
  const generating = useStore((s) => s.generating)
  const genTimeoutMs = useStore((s) => s.health?.genTimeoutMs)

  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!generating) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setElapsed(0)
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [generating])

  if (!generating) return null

  const genCapSec = Math.max(1, Math.round((genTimeoutMs ?? 60 * 60 * 1000) / 1000))
  const genPct = Math.min(100, (elapsed / genCapSec) * 100)
  const genRemainSec = Math.max(0, genCapSec - elapsed)
  const genRemainLabel = genRemainSec >= 60 ? `~${Math.ceil(genRemainSec / 60)} min left` : `${genRemainSec}s left`
  const genElapsedClock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`

  return (
    <div className={`composer-gen-label${genRemainSec <= 120 ? ' low' : ''}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(genPct)}
      aria-label="Time elapsed before the generation timeout"
    >
      <span className="streaming">Working… {genElapsedClock}</span>
      <span className="gen-remain">{genRemainLabel} before timeout</span>
    </div>
  )
}

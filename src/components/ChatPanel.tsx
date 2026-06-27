import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useStore } from '../state/store'
import { useUi } from '../state/ui'
import { CAPTURE_VIEW_NAMES, captureViews } from '../lib/capture'
import { clampStatedDimensions, dimDiscrepancies, fillRatioNote } from '../lib/refineProxy'
import { takeRefineDiscrepancy, autoRefineCount } from '../state/generationActions'
import { estHistoryTokens, historyBudgetTokens, imageBudgetFor, type ProviderInfo } from '../lib/api'
import { tileReference } from '../lib/tile'
import { flaggedSkillIds } from '../lib/skillStats'
import ModelMenu from './ModelMenu'
import type { ChatImage, ChatMessage } from '../types'
import { IconWarning, DImage, DSend, DPlus, DUser, DSparkFill, DCode, DRestore, DRefresh, DChevLeft, DLayers } from './icons'

const MAX_IMAGES = 10
const IMAGE_TYPES = /^image\/(png|jpeg|webp|gif)$/

/** data URL for a chat image (base64 payload carries no `data:` prefix). */
const imgSrc = (img: ChatImage) => `data:${img.mediaType};base64,${img.data}`

// human labels for the applied-patterns chip; fall back to Title-cased id for any skill
const SKILL_LABELS: Record<string, string> = {
  'gt2-pulley': 'GT2 pulley',
  'bearing-608-pocket': '608 bearing pocket',
  'print-in-place-hinge': 'Print-in-place hinge',
  'threaded-fastener-seat': 'Fastener seat',
  'kit-baseplate': 'Kit baseplate',
  'crown-coronet': 'Crown / coronet',
  'hollow-crenellation': 'Crenellation',
  'open-prong-cradle': 'Open prong cradle',
}
const skillLabel = (id: string) => SKILL_LABELS[id] ?? id.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
// the addable mechanism skills (mirrors the server/skills.mjs registry keys) for the chip's
// "+ add" correction control; kit-baseplate is excluded (it is the multi-part baseplate, not
// a mechanism the user picks here).
const ALL_SKILL_IDS = [
  'wheel-axle', 'living-hinge', 'leaf-spring', 'snap-fit', 'print-in-place-hinge',
  'spur-gear', 'rack-pinion', 'ratchet', 'coil-spring', 'threaded-fastener-seat',
  'bearing-608-pocket', 'planetary', 'gt2-pulley', 'herringbone',
  'fit-pair', 'bistable', 'button-return',
  'crown-coronet', 'hollow-crenellation', 'open-prong-cradle',
]

export default function ChatPanel({ mobileShow = false, paneCollapsed = false }: { mobileShow?: boolean; paneCollapsed?: boolean }) {
  const projects = useStore((s) => s.projects)
  const activeId = useStore((s) => s.activeId)
  // UIUX-7: generating is needed here ONLY for canRefine + submit guard + Stop button visibility.
  // It does NOT feed streamText rendering — that lives in StreamingLeaf.
  const generating = useStore((s) => s.generating)
  const genCalls = useStore((s) => s.genCalls)
  const genTokens = useStore((s) => s.genTokens)
  const sendPrompt = useStore((s) => s.sendPrompt)
  const regenerateWithSkills = useStore((s) => s.regenerateWithSkills)
  const skillStats = useStore((s) => s.skillStats)
  // skills the user has removed often enough locally to suggest quarantining — a chip hint
  const flaggedSkills = useMemo(() => flaggedSkillIds(skillStats), [skillStats])
  const abortGeneration = useStore((s) => s.abortGeneration)
  const health = useStore((s) => s.health)
  const healthLoaded = useStore((s) => s.healthLoaded)
  const engine = useStore((s) => s.engine)
  const restoreVersion = useStore((s) => s.restoreVersion)
  const restoreNewer = useStore((s) => s.restoreNewer)
  const retryLast = useStore((s) => s.retryLast)
  const rerollLast = useStore((s) => s.rerollLast)
  const currentCode = useStore((s) => s.code)
  const newProject = useStore((s) => s.newProject)

  const draftPrompt = useUi((s) => s.draftPrompt)
  const setDraftPrompt = useUi((s) => s.setDraftPrompt)
  const setEnginesOpen = useUi((s) => s.setEnginesOpen)
  const setLeftCollapsed = useUi((s) => s.setLeftCollapsed)
  const autoRepair = useUi((s) => s.autoRepair)
  const setAutoRepair = useUi((s) => s.setAutoRepair)
  const bestOfN = useUi((s) => s.bestOfN)
  const setBestOfN = useUi((s) => s.setBestOfN)

  const [input, setInput] = useState('')
  const [images, setImages] = useState<ChatImage[]>([])
  const [lightbox, setLightbox] = useState<string | null>(null) // data URL of the image opened full-size
  const [dragging, setDragging] = useState(false)
  const [histIdx, setHistIdx] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const reduce = useReducedMotion()

  const chat = projects.find((p) => p.id === activeId)?.chat ?? []
  // versions rolled past via Restore, recoverable until the next prompt diverges the branch
  const rolledBackVersions = (projects.find((p) => p.id === activeId)?.chatFuture ?? []).filter((m) => m.code).length
  const activeProvider = health?.providers.find((p) => p.id === engine)
  const noVision = images.length > 0 && activeProvider && !activeProvider.vision
  // health probe resolved but returned nothing → no AI backend reachable (e.g. the static GitHub Pages demo)
  const noBackend = healthLoaded && !health

  const stl = useStore((s) => s.stl)
  const compileStatus = useStore((s) => s.compileStatus)
  const modelDims = useStore((s) => s.modelDims)
  const pendingAutoRefineFor = useStore((s) => s.pendingAutoRefineFor)
  const consumeAutoRefine = useStore((s) => s.consumeAutoRefine)
  const hasReference = chat.some((m) => m.role === 'user' && (m.images?.length ?? 0) > 0)
  const canRefine = Boolean(stl && compileStatus === 'ok' && hasReference && !generating && engine && activeProvider?.vision)

  const [attachNote, setAttachNote] = useState<string | null>(null)
  const flashAttachNote = (note: string) => {
    setAttachNote(note)
    setTimeout(() => setAttachNote(null), 3500)
  }

  const refine = () => {
    // higher res + quality for refine: the model must see recessed channels/seams to critique them
    const views = captureViews(1280, 0.92)
    if (!views.length) {
      flashAttachNote('Could not capture the viewport — orbit the model once, then try Refine again.')
      return
    }
    const anchor = modelDims
      ? ` These are the CURRENT render's measured dimensions: ${modelDims.x} × ${modelDims.y} × ${modelDims.z} mm (X width × Y depth × Z height) — they may be WRONG; correct them toward my reference's labeled dimensions, not toward these.`
      : ''
    // Name the viewpoints from the SAME source/order CaptureRig shoots (CAPTURE_VIEW_NAMES),
    // sliced to however many views actually came back — so the count and the names always
    // agree and the model can correctly attribute each attached image.
    const viewNames = CAPTURE_VIEW_NAMES.slice(0, views.length).join(', ')
    const shot =
      views.length > 1
        ? `Attached are ${views.length} renders of the CURRENT model from fixed viewpoints (${viewNames} — in that order).`
        : 'Attached is a render of the CURRENT model, captured from a fixed isometric viewpoint.'
    // remind the model of the plan / feature inventory it committed to, so every named
    // feature is checked off across passes (a collapsed feature outranks proportions)
    const committedFull = [...chat].reverse().find((m) => m.role === 'assistant' && m.code)?.text?.trim()
    // cap it so a verbose plan can't bloat the refine prompt past a lower-context engine's input limit
    const committed = committedFull && committedFull.length > 1000 ? committedFull.slice(0, 1000) + '…' : committedFull
    const plan = committed
      ? `\n\nEarlier you committed this plan / feature inventory:\n"""${committed}"""\nFor EACH distinct feature you named there, state present/faithful in the current render, then fix any that is missing, collapsed, or simplified away.`
      : ''
    // PRIMARY refine gate (P6): a model-INDEPENDENT geometric check — the render's measured
    // bbox vs the dimensions the model read off the reference. When it flags something, it LEADS
    // the prompt (not opinion, fix first); the image self-critique is the advisory tie-breaker.
    // When there are no stated dims / all within tolerance, the visual critique is the signal.
    const latestIntent = [...chat].reverse().find((m) => m.role === 'assistant' && m.intent)?.intent
    // validate/clamp the model-read dimensions before they drive the proxy (a mis-read 99999mm
    // must not push the refine toward an unbuildable size); surface any clamp to the user.
    const { dimensions: safeDims, notes: clampNotes } = clampStatedDimensions(latestIntent?.statedDimensions)
    if (clampNotes.length) flashAttachNote(clampNotes[0])
    const geo = dimDiscrepancies(modelDims, safeDims)
    const geoBlock = geo.length
      ? `GEOMETRIC CHECK — an independent measurement of the current render against your reference's stated dimensions. These are facts, not opinions; FIX THEM FIRST:\n${geo.map((g) => `- ${g}`).join('\n')}\n\n`
      : ''
    // OC-2 — the measured reference-IoU discrepancy queued by the gate (the render's silhouette is
    // off-target vs the photo). Leads the prompt alongside the dimension facts: an objective visual
    // signal, not self-critique. Consumed (cleared) here so it injects once per armed pass.
    const iouBlock = activeId ? takeRefineDiscrepancy(activeId) : ''
    // ADVISORY self-relative solidity hint (after the hard dimension facts): a suspiciously hollow
    // fill-ratio lets the model self-diagnose an unintended shell. Never a gate — phrased as a question.
    const fillNote = fillRatioNote(modelDims)
    const fillBlock = fillNote ? `${fillNote}\n\n` : ''
    void sendPrompt(
      `${iouBlock}${geoBlock}${fillBlock}${shot}${anchor} My reference image(s) earlier in this conversation are the CORRECT TARGET — fix the render to match them. Do NOT make it more symmetric, more balanced, or simpler than the reference; the reference's asymmetry, uneven proportions, and dense patterns are intentional. ${geo.length ? 'After the geometric fixes above, list' : 'First list'} the most important remaining discrepancies (a missing or collapsed distinct feature outranks any proportion mismatch), then return the corrected complete program.${plan}`,
      views,
      'Refine pass',
    )
  }

  useEffect(() => {
    if (draftPrompt !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInput(draftPrompt)
      setDraftPrompt(null)
      textRef.current?.focus()
    }
  }, [draftPrompt, setDraftPrompt])

  // new message → smooth scroll it into view (reduced-motion → instant). Token scrolling is
  // handled inside StreamingLeaf (it re-renders per token anyway) via the same scrollRef.
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

  // UIUX-7: elapsed timer moved to StreamingLeaf — it's only relevant while generating.

  // Esc closes the full-size image preview
  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

  // chat identity is stable mid-stream (streaming mutates only the projected streamText, not the chat
  // array), so these memos hold across the whole token stream instead of rebuilding every token.
  const promptHistory = useMemo(
    () => chat.filter((m) => m.role === 'user' && !m.action && m.text.trim()).map((m) => m.text),
    [chat],
  )

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

  // UIUX-7: streamProse / streamingCode / phaseLabel / elapsed / genCap* moved to StreamingLeaf.
  // The last-action scan (phaseLabel) is O(messages) but runs only inside StreamingLeaf which
  // re-renders per token anyway — it does NOT run in the chat-list render path.

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

      <div className="chat-scroll" ref={scrollRef} role="log" aria-live="polite">
        {chat.length === 0 && !generating && (
          <div className="chat-hint">
            Describe the part you need — or paste / drop a photo or dimensioned sketch. I'll pick printable defaults and
            expose them as sliders.
          </div>
        )}
        {/* UIUX-7: each message is a React.memo'd MessageRow keyed by id — prior bubbles
            do NOT re-render per streaming token. All callbacks are stable (useCallback). */}
        {chat.map((msg, i) => (
          <MessageRow
            key={msg.id}
            msg={msg}
            isLast={i === chat.length - 1}
            versionNum={versionOf.get(msg.id)}
            currentCode={currentCode}
            generating={generating}
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
        ))}

        {/* UIUX-7: StreamingLeaf subscribes ONLY to generating + streamText — never
            triggers a re-render on the message list. Scroll-on-token is also inside. */}
        <StreamingLeaf scrollRef={scrollRef} chat={chat} activeProvider={activeProvider} />
      </div>

      {/* ── Composer (pre-composer strips folded in) ── */}
      <div className="composer">
        <div className={`composer-box${generating ? ' is-generating' : ''}`}>

          {/* UIUX-7: composer progress bar reads generating+elapsed from StreamingLeaf's own
              slice. We use a separate thin component to avoid subscribing ChatPanel to streamText. */}
          {generating && <ComposerProgressBar />}

          {/* inline thumbnail strip — GUARD: real <img> elements inside .chat-pane
              (surfaces.spec.ts:23 asserts `.chat-pane img` visible after setInputFiles) */}
          {images.length > 0 && (
            <div className="composer-thumbs">
              {images.map((img, i) => (
                <span key={i} className="attach-thumb">
                  <img src={imgSrc(img)} alt={`attachment ${i + 1}`} title="Click to view full size" onClick={() => setLightbox(imgSrc(img))} />
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
              onClick={refine}
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
    </section>
  )
}

// ── Pure time helpers (module-level, no React) ─────────────────────────────

/** Format HH:MM from a timestamp epoch-ms. Empty string for missing stamps (pre-createdAt messages). */
function fmtTime(ts?: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Current wall-clock HH:MM (used for the streaming turn's "sent now" label). */
function nowTime(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ── UIUX-7: MessageRow — memo'd single-bubble renderer ──────────────────────
// Receives all data as props. Has NO subscription to streamText or generating
// (only needs `generating` for the Restore-button disabled state, which is a
// coarse boolean flip — acceptable). Prior bubbles never re-render per token.

interface MessageRowProps {
  msg: ChatMessage
  isLast: boolean
  versionNum: number | undefined
  currentCode: string
  generating: boolean
  rolledBackVersions: number
  flaggedSkills: Set<string>
  reduce: boolean | null
  onLightbox: (src: string | null) => void
  onRestoreVersion: (id: string) => void
  onRestoreNewer: () => void
  onRetryLast: () => void
  onRerollLast: () => void
  onRegenerateWithSkills: (msgId: string, skillIds: string[]) => void
}

const MessageRow = memo(function MessageRow({
  msg,
  isLast,
  versionNum,
  currentCode,
  generating,
  rolledBackVersions,
  flaggedSkills,
  reduce,
  onLightbox,
  onRestoreVersion,
  onRestoreNewer,
  onRetryLast,
  onRerollLast,
  onRegenerateWithSkills,
}: MessageRowProps) {
  if (msg.role === 'user') {
    return (
      <motion.div
        className="msg user"
        initial={reduce ? false : { opacity: 0, y: 7 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="msg-head">
          <span className="msg-avatar user"><DUser /></span>
          <span className="msg-who">You</span>
          <span className="msg-time">{fmtTime(msg.createdAt)}</span>
        </div>
        {msg.images?.map((img, j) => (
          <img
            key={j}
            className="msg-img"
            src={imgSrc(img)}
            alt="reference"
            role="button"
            tabIndex={0}
            title="Click to view full size"
            onClick={() => onLightbox(imgSrc(img))}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onLightbox(imgSrc(img)) } }}
          />
        ))}
        {msg.action ? (
          <div className="tag" title={msg.text}><DCode /> {msg.action}</div>
        ) : (
          <div className="bubble">{msg.text}</div>
        )}
      </motion.div>
    )
  }

  // ── assistant turn ──
  const isCurrent = msg.code === currentCode
  const appliedSkills = msg.appliedSkillIds ?? []
  const droppedSkills = (msg.droppedSkillIds ?? []).filter((id) => !appliedSkills.includes(id))
  const hasMetadata = Boolean(
    msg.skillNote ||
    (msg.code && (msg.intent?.sourceType === 'photo' || msg.intent?.confidence === 'low')) ||
    (msg.code && (msg.intent || appliedSkills.length > 0))
  )
  const metaCount = appliedSkills.length + (msg.intent ? 1 : 0)

  return (
    <motion.div
      className={`msg ai${msg.error ? ' err' : ''}`}
      initial={reduce ? false : { opacity: 0, y: 7 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="msg-head">
        <span className="msg-avatar ai"><DSparkFill /></span>
        <span className="msg-who">Vibemesh-AI</span>
        <span className="msg-time">{fmtTime(msg.createdAt)}</span>
      </div>

      {msg.images?.map((img, j) => (
        <img
          key={j}
          className="msg-img"
          src={imgSrc(img)}
          alt="reference"
          role="button"
          tabIndex={0}
          title="Click to view full size"
          onClick={() => onLightbox(imgSrc(img))}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onLightbox(imgSrc(img)) } }}
        />
      ))}

      <div className="msg-body">{msg.text}</div>

      <div className="ai-stack">
        {/* TIER 1: result marker */}
        {msg.code && (
          <div
            className={`code-chip${isCurrent ? ' current' : ''}`}
            title={isCurrent ? 'This is the version you see now' : `v${versionNum}`}
            aria-label={isCurrent ? `Version ${versionNum}, current` : `Version ${versionNum}`}
          >
            <span className="cc-icon"><DCode /></span>
            <span className="cc-text">
              <span className="cc-title">Model code updated</span>
              <span className="cc-meta">v{versionNum}{isCurrent ? ' · current' : ''}</span>
            </span>
          </div>
        )}

        {/* TIER 2: metadata drawer */}
        {hasMetadata && (
          <details className="turn-meta">
            <summary>
              Design details
              {metaCount > 0 && <span className="tm-count">{metaCount}</span>}
            </summary>
            <div className="turn-meta-body">
              {msg.skillNote && (
                <div className="skill-note" title="Verified-skill mechanism check — advisory">
                  <span className="sn-head">⚠ Mechanism check</span>
                  {msg.skillNote.split('\n').map((line, j) => (
                    <div key={j} className="sn-line">{line}</div>
                  ))}
                </div>
              )}
              {msg.code && (msg.intent?.sourceType === 'photo' || msg.intent?.confidence === 'low') && (
                <div className={`expect-banner ${msg.intent?.sourceType === 'photo' ? 'photo' : 'lowconf'}`}>
                  <span className="eb-icon">{msg.intent?.sourceType === 'photo' ? <DImage /> : <IconWarning />}</span>
                  <span className="eb-text">
                    {msg.intent?.sourceType === 'photo'
                      ? 'Working from a photo — exact sizes are estimated, and smooth or organic curves become a printable hard-surface approximation. Tell me what to refine.'
                      : 'Low-confidence read of this reference — a best-effort interpretation. Correct me if a feature looks off.'}
                    {msg.intent?.confidence && <span className="eb-conf">confidence {msg.intent.confidence}</span>}
                  </span>
                </div>
              )}
              {msg.code && (msg.intent || appliedSkills.length > 0) && (
                <div
                  className="applied-patterns"
                  title={[
                    msg.intent?.archetype && `Archetype: ${msg.intent.archetype}`,
                    msg.intent?.ambiguityScore && `Ambiguity: ${msg.intent.ambiguityScore}`,
                    msg.intent?.assumptions?.length && `Assumptions:\n${msg.intent.assumptions.map((a) => `• ${a}`).join('\n')}`,
                  ].filter(Boolean).join('\n') || undefined}
                >
                  <span className="ap-icon"><DLayers /></span>
                  <span className="ap-text">
                    <span className="ap-title">
                      {msg.intent?.form ?? 'design'}
                      {msg.intent?.facetVerdict ? ` · ${msg.intent.facetVerdict}` : ''}
                    </span>
                    <span className="ap-skills">
                      {appliedSkills.map((id) => (
                        <span key={id} className={`ap-skill${flaggedSkills.has(id) ? ' flagged' : ''}`}>
                          {flaggedSkills.has(id) && (
                            <span className="ap-flag" title="You've removed this pattern often — it may misfire here. Consider quarantining it.">⚠</span>
                          )}
                          {skillLabel(id)}
                          {isCurrent && !generating && (
                            <button
                              className="ap-x"
                              title={`Remove "${skillLabel(id)}" and regenerate`}
                              onClick={() => onRegenerateWithSkills(msg.id, appliedSkills.filter((x) => x !== id))}
                            >
                              ×
                            </button>
                          )}
                        </span>
                      ))}
                      {appliedSkills.length === 0 && !(isCurrent && !generating) && <span className="ap-meta">no mechanism skills applied</span>}
                      {isCurrent && !generating && ALL_SKILL_IDS.filter((id) => !appliedSkills.includes(id)).length > 0 && (
                        <select
                          className="ap-add"
                          value=""
                          title="Add a mechanism pattern and regenerate"
                          onChange={(e) => {
                            if (e.target.value) onRegenerateWithSkills(msg.id, [...appliedSkills, e.target.value])
                          }}
                        >
                          <option value="">+ pattern</option>
                          {ALL_SKILL_IDS.filter((id) => !appliedSkills.includes(id)).map((id) => (
                            <option key={id} value={id}>{skillLabel(id)}</option>
                          ))}
                        </select>
                      )}
                      {droppedSkills.length > 0 && (
                        <span className="ap-dropped" title="Matched your prompt but cut by the cap — promote one to include it">
                          <span className="ap-meta">· considered:</span>
                          {droppedSkills.map((id) =>
                            isCurrent && !generating ? (
                              <button
                                key={`d-${id}`}
                                className="ap-promote"
                                title={`Promote "${skillLabel(id)}" and regenerate`}
                                onClick={() => onRegenerateWithSkills(msg.id, [...appliedSkills, id])}
                              >
                                + {skillLabel(id)}
                              </button>
                            ) : (
                              <span key={`d-${id}`} className="ap-skill ap-dropped-chip">{skillLabel(id)}</span>
                            ),
                          )}
                        </span>
                      )}
                    </span>
                  </span>
                </div>
              )}
            </div>
          </details>
        )}

        {/* TIER 3: action row */}
        {(() => {
          const showRetry = msg.error && isLast && !generating
          const showRestore = msg.code && !isCurrent
          const showRegenerate = msg.code && isCurrent && !generating
          const showRedo = rolledBackVersions > 0 && !generating && isLast && msg.code
          if (!showRetry && !showRestore && !showRegenerate && !showRedo) return null
          return (
            <div className="turn-actions">
              {showRedo && (
                <button
                  className="redo-action"
                  title="You rolled the model back — click to bring the newer versions back instead."
                  onClick={onRestoreNewer}
                >
                  <DRefresh /> Redo ({rolledBackVersions})
                </button>
              )}
              {showRetry && (
                <button className="chip-btn" title="Run the same prompt again" onClick={onRetryLast}>
                  <DRefresh /> Retry
                </button>
              )}
              {showRestore && (
                <button
                  className="chip-btn"
                  title="Bring this version of the model back"
                  disabled={generating}
                  onClick={() => onRestoreVersion(msg.id)}
                >
                  <DRestore /> Restore v{versionNum}
                </button>
              )}
              {showRegenerate && (
                <button
                  className="chip-btn"
                  title="Generate a different version of this model — both are kept; switch between them with the version chips"
                  onClick={onRerollLast}
                >
                  <DRefresh /> Regenerate
                </button>
              )}
            </div>
          )
        })()}
      </div>
    </motion.div>
  )
})

// ── UIUX-7: StreamingLeaf — the only component that subscribes to streamText ─
// Subscribes to generating + streamText with granular zustand selectors.
// Also owns the elapsed timer and the per-token scroll, so ChatPanel never
// re-renders on a streaming token.

function StreamingLeaf({
  scrollRef,
  chat,
  activeProvider,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>
  chat: ChatMessage[]
  activeProvider: { label: string } | undefined
}) {
  const generating = useStore((s) => s.generating)
  const streamText = useStore((s) => s.streamText)

  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!generating) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setElapsed(0)
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [generating])

  // per-token scroll: instant (smooth on new message is handled in ChatPanel)
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight })
  }, [streamText, scrollRef])

  if (!generating) return null

  // hide the code block from the live stream — the code lands in the code panel
  const streamProse = streamText.split('```')[0].trim()
  const streamingCode = streamText.includes('```')

  // UIUX-8 — name the active generation phase (scan from the tail of the stable chat array)
  let lastAction: string | undefined
  for (let i = chat.length - 1; i >= 0; i--) {
    if (chat[i].role === 'user') { lastAction = chat[i].action; break }
  }
  const phaseLabel =
    lastAction === 'Refine pass' ? 'Refining against your reference…'
      : lastAction === 'Auto-fix' ? 'Auto-fixing the render…'
        : lastAction === 'Fix format' ? 'Reformatting the program…'
          : lastAction === 'Regenerate' ? 'Generating a fresh version…'
            : lastAction === 'Adjust patterns' ? 'Regenerating with the chosen patterns…'
              : 'Thinking…'

  return (
    <div className="msg ai">
      <div className="msg-head">
        <span className="msg-avatar ai"><DSparkFill /></span>
        <span className="msg-who">Vibemesh-AI</span>
        <span className="msg-time">{nowTime()}</span>
      </div>
      <div className="msg-body"><span className="streaming">{streamProse || phaseLabel}</span></div>
      {streamingCode && <div className="version-pill"><span className="vp-dot" /> writing code…</div>}
      <div className="stream-meta">{elapsed}s{activeProvider ? ` · ${activeProvider.label.split(' · ')[0]}` : ''}</div>
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

/** Compact AI-memory gauge merged with session spend.
 *  History is now bound to the ACTIVE ENGINE's context window (a token budget), not a fixed
 *  message count. The ring shows how full that budget is. The spend info (calls × tokens) is
 *  folded into the tooltip so the header carries ONE chip instead of two near-identical rings. */
const ContextChip = memo(function ContextChip({
  chat, provider, systemTokens, calls, tokens,
}: {
  chat: ChatMessage[]
  provider?: ProviderInfo
  systemTokens?: number
  calls: number
  tokens: number
}) {
  const nonError = chat.filter((m) => !m.error).length
  if (nonError === 0 && !calls) return null
  const used = estHistoryTokens(chat)
  const budget = historyBudgetTokens(provider, systemTokens)
  const C = 2 * Math.PI * 6
  const kb = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${n}`)
  // spend suffix folded into the title
  const spendSuffix = calls
    ? ` · ${calls} generation call${calls === 1 ? '' : 's'} this session (≈${tokens.toLocaleString()} generated tokens)`
    : ''
  // unknown capacity (demo / no backend): show a raw token count, neutral ring
  if (budget <= 0) {
    return (
      <span
        className="ctx-chip"
        title={`≈${used.toLocaleString()} tokens of chat history (engine context unknown)${spendSuffix}`}
        role="status"
      >
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><circle cx="8" cy="8" r="6" className="ctx-track" /></svg>
        <span className="ctx-num">≈{kb(used)}</span>
      </span>
    )
  }
  const frac = used / budget
  const trimming = used > budget
  const win = provider?.contextWindow
  const title = trimming
    ? `Chat history is past the ~${kb(budget)}-token budget — the oldest turns are no longer sent (your reference image is always kept). Budget = the engine's context window capped for cost.${spendSuffix}`
    : `Chat history: ~${kb(used)} of ~${kb(budget)} tokens in context${win ? ` (${provider?.label?.split(' · ')[0]} window ${kb(win)}, capped for cost)` : ''}. The reference image is always kept.${spendSuffix}`
  return (
    <span className={`ctx-chip${trimming ? ' trimming' : ''}`} title={title} role="status">
      <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
        <circle cx="8" cy="8" r="6" className="ctx-track" />
        <circle cx="8" cy="8" r="6" className="ctx-arc" strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, frac))} transform="rotate(-90 8 8)" />
      </svg>
      <span className="ctx-num">{Math.round(Math.min(frac, 9.99) * 100)}%</span>
    </span>
  )
})

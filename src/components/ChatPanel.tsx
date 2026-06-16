import { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { useUi } from '../state/ui'
import { captureViews } from '../lib/capture'
import { estHistoryTokens, historyBudgetTokens, type ProviderInfo } from '../lib/api'
import type { ChatImage, ChatMessage } from '../types'
import { IconWarning, DImage, DSend, DPlus, DUser, DSparkFill, DCode, DRestore, DRefresh } from './icons'

const MAX_IMAGES = 3
const IMAGE_TYPES = /^image\/(png|jpeg|webp|gif)$/

export default function ChatPanel({ mobileShow = false }: { mobileShow?: boolean }) {
  const projects = useStore((s) => s.projects)
  const activeId = useStore((s) => s.activeId)
  const generating = useStore((s) => s.generating)
  const streamText = useStore((s) => s.streamText)
  const sendPrompt = useStore((s) => s.sendPrompt)
  const abortGeneration = useStore((s) => s.abortGeneration)
  const health = useStore((s) => s.health)
  const healthLoaded = useStore((s) => s.healthLoaded)
  const engine = useStore((s) => s.engine)
  const restoreCode = useStore((s) => s.restoreCode)
  const retryLast = useStore((s) => s.retryLast)
  const currentCode = useStore((s) => s.code)
  const newProject = useStore((s) => s.newProject)

  const draftPrompt = useUi((s) => s.draftPrompt)
  const setDraftPrompt = useUi((s) => s.setDraftPrompt)
  const setEnginesOpen = useUi((s) => s.setEnginesOpen)
  const autoRepair = useUi((s) => s.autoRepair)
  const setAutoRepair = useUi((s) => s.setAutoRepair)

  const [input, setInput] = useState('')
  const [images, setImages] = useState<ChatImage[]>([])
  const [dragging, setDragging] = useState(false)
  const [histIdx, setHistIdx] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)

  const chat = projects.find((p) => p.id === activeId)?.chat ?? []
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
    const shot =
      views.length > 1
        ? `Attached are ${views.length} renders of the CURRENT model from fixed viewpoints (isometric, front, top — in that order).`
        : 'Attached is a render of the CURRENT model, captured from a fixed isometric viewpoint.'
    // remind the model of the plan / feature inventory it committed to, so every named
    // feature is checked off across passes (a collapsed feature outranks proportions)
    const committedFull = [...chat].reverse().find((m) => m.role === 'assistant' && m.code)?.text?.trim()
    // cap it so a verbose plan can't bloat the refine prompt past a lower-context engine's input limit
    const committed = committedFull && committedFull.length > 1000 ? committedFull.slice(0, 1000) + '…' : committedFull
    const plan = committed
      ? `\n\nEarlier you committed this plan / feature inventory:\n"""${committed}"""\nFor EACH distinct feature you named there, state present/faithful in the current render, then fix any that is missing, collapsed, or simplified away.`
      : ''
    void sendPrompt(
      `${shot}${anchor} My reference image(s) earlier in this conversation are the CORRECT TARGET — fix the render to match them. Do NOT make it more symmetric, more balanced, or simpler than the reference; the reference's asymmetry, uneven proportions, and dense patterns are intentional. First list the most important discrepancies (a missing or collapsed distinct feature outranks any proportion mismatch), then return the corrected complete program.${plan}`,
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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [chat.length, streamText])

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

  useEffect(() => {
    if (!generating) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setElapsed(0)
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [generating])

  const promptHistory = chat.filter((m) => m.role === 'user' && !m.action && m.text.trim()).map((m) => m.text)

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

  const attachFiles = (files: Iterable<File>) => {
    const all = Array.from(files)
    const room = MAX_IMAGES - images.length
    const accepted = all.filter((f) => IMAGE_TYPES.test(f.type)).slice(0, Math.max(room, 0))
    if (all.length > 0 && accepted.length === 0) {
      flashAttachNote(room <= 0 ? `max ${MAX_IMAGES} images per message` : 'only PNG, JPEG, WebP or GIF images')
      return
    }
    if (accepted.length < all.length) {
      flashAttachNote(`attached ${accepted.length} of ${all.length} — images only, max ${MAX_IMAGES}`)
    }
    for (const file of accepted) {
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        const data = dataUrl.slice(dataUrl.indexOf(',') + 1)
        setImages((prev) => (prev.length < MAX_IMAGES ? [...prev, { mediaType: file.type, data }] : prev))
      }
      reader.readAsDataURL(file)
    }
  }

  const onPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.items)
      .filter((item) => item.kind === 'file' && IMAGE_TYPES.test(item.type))
      .map((item) => item.getAsFile())
      .filter((f): f is File => f !== null)
    if (files.length > 0) {
      e.preventDefault()
      attachFiles(files)
    }
  }

  // hide the code block from the live stream — the code lands in the code panel
  const streamProse = streamText.split('```')[0].trim()
  const streamingCode = streamText.includes('```')

  // number restorable versions so history reads as history (UX-AUDIT F17)
  const versionOf = new Map<string, number>()
  {
    let v = 0
    for (const m of chat) if (m.code) versionOf.set(m.id, ++v)
  }

  const now = () => {
    const d = new Date()
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  return (
    <section
      className={`pane chat-pane${mobileShow ? ' sheet-show' : ''}`}
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
            attachFiles(e.dataTransfer.files)
          }}
        >
          <span><DImage /> Drop a photo or sketch</span>
        </div>
      )}

      <div className="pane-head">
        <span className="eyebrow">Conversation</span>
        <ContextChip chat={chat} provider={activeProvider} systemTokens={health?.systemTokens} />
        <button className="icon-btn-sm" title="New part" aria-label="New part" onClick={() => newProject()}>
          <DPlus />
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
        {chat.map((msg, i) => {
          if (msg.role === 'user') {
            return (
              <div key={msg.id} className="msg user">
                <div className="msg-head">
                  <span className="msg-avatar user"><DUser /></span>
                  <span className="msg-who">You</span>
                  <span className="msg-time">{now()}</span>
                </div>
                {msg.images?.map((img, j) => (
                  <img key={j} className="msg-img" src={`data:${img.mediaType};base64,${img.data}`} alt="reference" />
                ))}
                {msg.action ? (
                  <div className="tag" title={msg.text}><DCode /> {msg.action}</div>
                ) : (
                  <div className="bubble">{msg.text}</div>
                )}
              </div>
            )
          }
          const isCurrent = msg.code === currentCode
          return (
            <div key={msg.id} className={`msg ai${msg.error ? ' err' : ''}`}>
              <div className="msg-head">
                <span className="msg-avatar ai"><DSparkFill /></span>
                <span className="msg-who">Vibemesh-AI</span>
                <span className="msg-time">{now()}</span>
              </div>
              {msg.images?.map((img, j) => (
                <img key={j} className="msg-img" src={`data:${img.mediaType};base64,${img.data}`} alt="reference" />
              ))}
              <div className="msg-body">{msg.text}</div>
              {msg.code && (
                <button
                  className={`code-chip${isCurrent ? ' current' : ''}`}
                  title={isCurrent ? 'This is the version you see now' : 'Bring this version of the model back'}
                  disabled={generating || isCurrent}
                  onClick={() => restoreCode(msg.code!)}
                >
                  <span className="cc-icon"><DCode /></span>
                  <span className="cc-text">
                    <span className="cc-title">Model code updated</span>
                    <span className="cc-meta">v{versionOf.get(msg.id)}{isCurrent ? ' · current' : ''}</span>
                  </span>
                  {!isCurrent && <span className="cc-restore"><DRestore /> Restore</span>}
                </button>
              )}
              {msg.error && i === chat.length - 1 && !generating && (
                <button className="code-chip" title="Run the same prompt again" onClick={() => void retryLast()}>
                  <span className="cc-icon"><DRefresh /></span>
                  <span className="cc-text"><span className="cc-title">Retry</span></span>
                </button>
              )}
            </div>
          )
        })}
        {generating && (
          <div className="msg ai">
            <div className="msg-head">
              <span className="msg-avatar ai"><DSparkFill /></span>
              <span className="msg-who">Vibemesh-AI</span>
              <span className="msg-time">{now()}</span>
            </div>
            <div className="msg-body"><span className="streaming">{streamProse || 'Thinking…'}</span></div>
            {streamingCode && <div className="version-pill"><span className="vp-dot" /> writing code…</div>}
            <div className="stream-meta">{elapsed}s{activeProvider ? ` · ${activeProvider.label.split(' · ')[0]}` : ''}</div>
          </div>
        )}
      </div>

      {images.length > 0 && (
        <div className="attach-row">
          {images.map((img, i) => (
            <span key={i} className="attach-thumb">
              <img src={`data:${img.mediaType};base64,${img.data}`} alt={`attachment ${i + 1}`} />
              <button aria-label="Remove attached image" title="Remove attached image" onClick={() => setImages(images.filter((_, j) => j !== i))}>×</button>
            </span>
          ))}
        </div>
      )}

      {noVision && (
        <div className="vision-warn" role="status">
          <IconWarning /> {activeProvider!.label} can't see images — switch engine or remove the attachment. Send is disabled.
        </div>
      )}
      {attachNote && <div className="vision-warn" role="status"><IconWarning /> {attachNote}</div>}

      {canRefine && (
        <button className="refine-bar" onClick={refine} title="Snapshot the model from a fixed angle and ask the AI to compare it against your reference photo, then fix the differences">
          Compare with my photo &amp; fix
        </button>
      )}

      <div className="composer">
        <div className="composer-box">
          <textarea
            ref={textRef}
            aria-label="Describe the part"
            title="Enter sends — Shift+Enter for a new line"
            placeholder={chat.length ? 'Describe a change — “add a 6 mm cable channel through the base”…' : 'e.g. a wall hook for headphones, 30mm reach…'}
            value={input}
            rows={1}
            onChange={(e) => { setInput(e.target.value); setHistIdx(null) }}
            onPaste={onPaste}
            onKeyDown={onInputKeyDown}
          />
          <div className="composer-actions">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              hidden
              onChange={(e) => { attachFiles(e.target.files ?? []); e.target.value = '' }}
            />
            <button className="chip-btn" title="Attach a photo or sketch — or paste (⌘V) / drag & drop" onClick={() => fileRef.current?.click()}>
              <DImage /> Reference
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
            <span className="spacer" />
            {generating ? (
              <button className="send-btn stop" onClick={abortGeneration}>Stop</button>
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
    </section>
  )
}

/** Compact AI-memory gauge. History is now bound to the ACTIVE ENGINE's context window
 *  (a token budget), not a fixed message count. The ring shows how full that budget is,
 *  using the SAME token estimators the assembler uses (no drift), and turns amber once
 *  the conversation exceeds the budget and older turns start dropping (the reference image
 *  is always pinned, so it survives regardless). */
function ContextChip({ chat, provider, systemTokens }: { chat: ChatMessage[]; provider?: ProviderInfo; systemTokens?: number }) {
  const nonError = chat.filter((m) => !m.error).length
  if (nonError === 0) return null
  const used = estHistoryTokens(chat)
  const budget = historyBudgetTokens(provider, systemTokens)
  const C = 2 * Math.PI * 6
  const kb = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${n}`)
  // unknown capacity (demo / no backend): show a raw token count, neutral ring
  if (budget <= 0) {
    return (
      <span className="ctx-chip" title={`≈${used.toLocaleString()} tokens of chat history (engine context unknown)`} role="status">
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><circle cx="8" cy="8" r="6" className="ctx-track" /></svg>
        <span className="ctx-num">≈{kb(used)}</span>
      </span>
    )
  }
  const frac = used / budget
  const trimming = used > budget
  const win = provider?.contextWindow
  const title = trimming
    ? `Chat history is past the ~${kb(budget)}-token budget — the oldest turns are no longer sent (your reference image is always kept). Budget = the engine's context window capped for cost.`
    : `Chat history: ~${kb(used)} of ~${kb(budget)} tokens in context${win ? ` (${provider?.label?.split(' · ')[0]} window ${kb(win)}, capped for cost)` : ''}. The reference image is always kept.`
  return (
    <span className={`ctx-chip${trimming ? ' trimming' : ''}`} title={title} role="status">
      <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
        <circle cx="8" cy="8" r="6" className="ctx-track" />
        <circle cx="8" cy="8" r="6" className="ctx-arc" strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, frac))} transform="rotate(-90 8 8)" />
      </svg>
      <span className="ctx-num">{Math.round(Math.min(frac, 9.99) * 100)}%</span>
    </span>
  )
}

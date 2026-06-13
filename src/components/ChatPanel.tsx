import { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { useUi } from '../state/ui'
import { captureViewport } from '../lib/capture'
import type { ChatImage } from '../types'
import { IconImage, IconWarning, IconCompare, IconPencil, IconGear, IconStop, IconSend, IconClock, IconRefresh, IconX } from './icons'

const MAX_IMAGES = 3
const IMAGE_TYPES = /^image\/(png|jpeg|webp|gif)$/

export default function ChatPanel() {
  const projects = useStore((s) => s.projects)
  const activeId = useStore((s) => s.activeId)
  const generating = useStore((s) => s.generating)
  const streamText = useStore((s) => s.streamText)
  const sendPrompt = useStore((s) => s.sendPrompt)
  const abortGeneration = useStore((s) => s.abortGeneration)
  const health = useStore((s) => s.health)
  const engine = useStore((s) => s.engine)
  const restoreCode = useStore((s) => s.restoreCode)
  const retryLast = useStore((s) => s.retryLast)
  const currentCode = useStore((s) => s.code)

  const draftPrompt = useUi((s) => s.draftPrompt)
  const setDraftPrompt = useUi((s) => s.setDraftPrompt)
  const setEnginesOpen = useUi((s) => s.setEnginesOpen)

  const [input, setInput] = useState('')
  const [images, setImages] = useState<ChatImage[]>([])
  const [dragging, setDragging] = useState(false)
  const [histIdx, setHistIdx] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const chat = projects.find((p) => p.id === activeId)?.chat ?? []
  const activeProvider = health?.providers.find((p) => p.id === engine)
  const noVision = images.length > 0 && activeProvider && !activeProvider.vision

  const stl = useStore((s) => s.stl)
  const compileStatus = useStore((s) => s.compileStatus)
  const modelDims = useStore((s) => s.modelDims)
  const hasReference = chat.some((m) => m.role === 'user' && (m.images?.length ?? 0) > 0)
  // compileStatus must be 'ok': never snapshot stale geometry as "the current model"
  const canRefine = Boolean(stl && compileStatus === 'ok' && hasReference && !generating && engine && activeProvider?.vision)

  const refine = () => {
    const render = captureViewport()
    if (!render) return
    // absolute scale anchor: vision can judge proportions but not millimeters —
    // give it the measured bbox so dimension corrections have a reference frame
    const anchor = modelDims
      ? ` The current model measures exactly ${modelDims.x} × ${modelDims.y} × ${modelDims.z} mm (X width × Y depth × Z height) — use these numbers as the absolute scale reference when correcting proportions.`
      : ''
    void sendPrompt(
      `Attached is a render of the CURRENT model, captured from a fixed isometric viewpoint.${anchor} Compare it carefully against my original reference image(s) earlier in this conversation. First list the most important discrepancies (shape, proportions, feature counts, missing or extra details), then return the corrected complete program.`,
      [render],
      'Refine pass',
    )
  }

  useEffect(() => {
    if (draftPrompt !== null) {
      setInput(draftPrompt)
      setDraftPrompt(null)
    }
  }, [draftPrompt, setDraftPrompt])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [chat.length, streamText])

  // elapsed-seconds ticker for the streaming indicator (AI runs can take minutes)
  useEffect(() => {
    if (!generating) return
    setElapsed(0)
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [generating])

  // terminal-style prompt recall: my own typed prompts, oldest → newest
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
    if ((!text && images.length === 0) || generating || noVision) return
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

  const [attachNote, setAttachNote] = useState<string | null>(null)

  const flashAttachNote = (note: string) => {
    setAttachNote(note)
    setTimeout(() => setAttachNote(null), 3500)
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

  // number the restorable versions so history reads as history (UX-AUDIT F17)
  const versionOf = new Map<string, number>()
  {
    let v = 0
    for (const m of chat) if (m.code) versionOf.set(m.id, ++v)
  }

  return (
    <aside
      className="chat-panel"
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
          <span><IconImage /> Drop a photo or sketch</span>
        </div>
      )}

      <div className="panel-label">
        <span>Design chat</span>
        <span className="panel-label-line" />
      </div>

      {health && !health.providers.some((p) => p.available) && (
        <div className="key-banner">
          <strong>No AI connected yet.</strong>{' '}
          <button className="banner-link" onClick={() => setEnginesOpen(true)}>
            Connect one →
          </button>{' '}
          Examples and sliders work without it.
        </div>
      )}

      <div className="chat-scroll" ref={scrollRef} role="log" aria-live="polite">
        {chat.length === 0 && !generating && (
          <div className="chat-hint">
            Describe the part you need — or paste / drop a photo or dimensioned sketch. I'll pick printable defaults and
            expose them as sliders.
          </div>
        )}
        {chat.map((msg, i) => (
          <div key={msg.id} className={`msg ${msg.role}${msg.error ? ' err' : ''}`}>
            {msg.images?.map((img, i) => (
              <img key={i} className="msg-img" src={`data:${img.mediaType};base64,${img.data}`} alt="reference" />
            ))}
            {msg.action ? (
              <div className="action-chip" title={msg.text}>
                <IconGear /> {msg.action}
              </div>
            ) : (
              <div className="msg-text">{msg.text}</div>
            )}
            {msg.code &&
              (() => {
                const isCurrent = msg.code === currentCode
                return (
                  <button
                    className="code-chip restorable"
                    title={isCurrent ? 'This is the version you see now' : 'Bring this version of the model back'}
                    disabled={generating || isCurrent}
                    onClick={() => restoreCode(msg.code!)}
                  >
                    Version {versionOf.get(msg.id)} {isCurrent ? '· current' : '· restore'}
                  </button>
                )
              })()}
            {msg.error && i === chat.length - 1 && !generating && (
              <button className="code-chip restorable retry" title="Run the same prompt again" onClick={() => void retryLast()}>
                <IconRefresh /> Retry
              </button>
            )}
          </div>
        ))}
        {generating && (
          <div className="msg assistant streaming">
            <div className="msg-text">{streamProse || 'Thinking…'}</div>
            {streamingCode && <div className="code-chip live"><IconPencil /> Building the model…</div>}
            <div className="stream-meta">
              <IconClock /> {elapsed}s{activeProvider ? ` · ${activeProvider.label.toUpperCase()}` : ''}
            </div>
          </div>
        )}
      </div>

      {images.length > 0 && (
        <div className="attach-row">
          {images.map((img, i) => (
            <span key={i} className="attach-thumb">
              <img src={`data:${img.mediaType};base64,${img.data}`} alt={`attachment ${i + 1}`} />
              <button aria-label="Remove attached image" title="Remove attached image" onClick={() => setImages(images.filter((_, j) => j !== i))}><IconX /></button>
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
          <IconCompare /> Compare with my photo &amp; fix
        </button>
      )}

      <div className="chat-input-row">
        <textarea
          className="chat-input"
          aria-label="Describe the part"
          title="Enter sends — Shift+Enter for a new line"
          placeholder={chat.length ? 'Describe a change…' : 'e.g. a wall hook for headphones, 30mm reach…'}
          value={input}
          rows={3}
          onChange={(e) => {
            setInput(e.target.value)
            setHistIdx(null)
          }}
          onPaste={onPaste}
          onKeyDown={onInputKeyDown}
        />
        <div className="chat-actions">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            hidden
            onChange={(e) => {
              attachFiles(e.target.files ?? [])
              e.target.value = ''
            }}
          />
          <button
            className="attach-btn"
            title="Attach a photo or sketch — or paste (⌘V) / drag & drop"
            onClick={() => fileRef.current?.click()}
          >
            <IconImage /> Photo
          </button>
          <button
            className="ai-pill"
            onClick={() => setEnginesOpen(true)}
            title={activeProvider ? `${activeProvider.detail} — click to switch or manage` : 'Choose which AI designs for you'}
          >
            <i className={`dot ${activeProvider ? 'ok' : 'off'}`} />
            {activeProvider ? activeProvider.label.split(' · ')[0] : 'Connect AI'}
          </button>
          {generating ? (
            <button className="btn stop" onClick={abortGeneration}>
              <IconStop /> Stop
            </button>
          ) : (
            <button
              className="btn primary"
              onClick={submit}
              disabled={(!input.trim() && images.length === 0) || Boolean(noVision)}
              title={noVision ? 'This engine cannot see images — switch engine or remove the attachment' : undefined}
            >
              <IconSend /> Send
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}

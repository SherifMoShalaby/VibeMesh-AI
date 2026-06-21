import { useRef, useState } from 'react'
import { useStore } from '../state/store'
import { useUi } from '../state/ui'
import { EXAMPLES, PROMPT_IDEAS, SKILL_STARTERS } from '../lib/examples'
import ModelMenu from './ModelMenu'
import type { ChatImage } from '../types'
import { imageBudgetFor } from '../lib/api'
import { tileReference } from '../lib/tile'
import { DSpark, DImage, DSparkFill, DArrowRight, DBox, DCamera, DGrid, DCylinder } from './icons'

const CHIP_ICONS = [DBox, DCamera, DGrid, DCylinder]
const MAX_IMAGES = 10
const IMAGE_TYPES = /^image\/(png|jpeg|webp|gif)$/
/** a dropped/picked .vibemesh share file — matched by name (its MIME is often empty/octet-stream) */
const isShareFile = (f: File) => /\.vibemesh$/i.test(f.name) || f.type === 'application/json'

export default function EmptyState() {
  const loadExample = useStore((s) => s.loadExample)
  const sendPrompt = useStore((s) => s.sendPrompt)
  const importShareFile = useStore((s) => s.importShareFile)
  const engine = useStore((s) => s.engine)
  const health = useStore((s) => s.health)
  const pushToast = useUi((s) => s.pushToast)
  const [text, setText] = useState('')
  const [images, setImages] = useState<ChatImage[]>([])
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const shareRef = useRef<HTMLInputElement>(null)

  // open a received .vibemesh part as a fresh editable project (the store does parse/validate/compile;
  // it toasts on an invalid file). Needs no AI, so this works on a keyless first run.
  const importVibemeshFile = (file: File) => {
    file
      .text()
      .then((t) => importShareFile(t))
      .catch((err) => pushToast(`Could not read the file: ${err instanceof Error ? err.message : String(err)}`, 'error'))
  }

  // mirror ChatPanel's vision guard: the active engine may not accept images (e.g. a local model)
  const activeProvider = health?.providers.find((p) => p.id === engine)
  const canAttach = !activeProvider || activeProvider.vision !== false
  const noVision = images.length > 0 && activeProvider != null && !activeProvider.vision
  const imgBudget = Math.max(1, imageBudgetFor(activeProvider) || MAX_IMAGES)

  const attachFiles = async (files: Iterable<File>) => {
    const accepted = Array.from(files).filter((f) => IMAGE_TYPES.test(f.type))
    // tile at attach time (busy sheet → global + crops, clean photo → one global), bounded by the
    // engine's image budget; same cap re-enforced at send. Each output carries pixel dims + role.
    const collected: ChatImage[] = []
    for (const file of accepted) {
      if (collected.length >= imgBudget) break
      collected.push(...(await tileReference(file, imgBudget)))
    }
    if (collected.length) setImages((prev) => [...prev, ...collected].slice(0, imgBudget))
  }

  const generate = () => {
    const t = text.trim()
    if ((!t && images.length === 0) || !engine || noVision) return
    setText('')
    const imgs = images
    setImages([])
    void sendPrompt(
      t || 'Model the part shown in the attached image. Use any labeled dimensions exactly.',
      imgs.length ? imgs : undefined,
      !t && imgs.length ? 'Photo prompt' : undefined,
    )
  }

  return (
    <div
      className="empty"
      onDragOver={(e) => {
        // arm the drop overlay for an image (attach as reference) OR a .vibemesh file (import). A
        // dragover item exposes only .type, not the filename, so accept the empty/json MIME a
        // dragged .vibemesh reports in addition to the image types.
        const items = Array.from(e.dataTransfer.items)
        const hasImage = canAttach && items.some((it) => IMAGE_TYPES.test(it.type))
        const hasShare = items.some((it) => it.kind === 'file' && (it.type === 'application/json' || it.type === ''))
        if (hasImage || hasShare) {
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
            const files = Array.from(e.dataTransfer.files)
            const imgs = files.filter((f) => IMAGE_TYPES.test(f.type))
            // image wins when both are dropped (attach as reference); else import a share file
            if (imgs.length) void attachFiles(imgs)
            else {
              const share = files.find(isShareFile)
              if (share) importVibemeshFile(share)
            }
          }}
        >
          <span><DImage /> Drop a photo, sketch, or .vibemesh file</span>
        </div>
      )}
      <div className="empty-badge"><span className="spark"><DSpark /></span> Text &amp; image → CAD</div>
      <h1>
        Describe a part.
        <br />
        Watch it become <em>printable</em>.
      </h1>
      <p className="lede">
        Plain language in, parametric OpenSCAD out — rendered live in your browser, every dimension a slider, exported
        print-ready in one pass.
      </p>

      <div className="empty-composer">
        <textarea
          rows={2}
          placeholder="e.g. A wall bracket for a 35 mm pipe with two countersunk screw holes and a 4 mm backplate…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              generate()
            }
          }}
        />
        {images.length > 0 && (
          <div className="empty-thumbs">
            {images.map((img, i) => (
              <span key={i} className="empty-thumb">
                <img src={`data:${img.mediaType};base64,${img.data}`} alt="reference" />
                <button type="button" className="empty-thumb-x" aria-label="Remove image" onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}>×</button>
              </span>
            ))}
          </div>
        )}
        <div className="empty-composer-foot">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            hidden
            onChange={(e) => { void attachFiles(e.target.files ?? []); e.currentTarget.value = '' }}
          />
          <button
            className="chip-btn icon-only"
            aria-label="Add a reference photo"
            title={canAttach ? 'Add a reference photo or sketch' : 'This engine cannot see images — switch engine to attach a reference'}
            disabled={images.length >= imgBudget || !canAttach}
            onClick={() => fileRef.current?.click()}
          >
            <DImage />
          </button>
          <input
            ref={shareRef}
            type="file"
            accept=".vibemesh,application/json"
            hidden
            onChange={(e) => { const f = e.target.files?.[0]; e.currentTarget.value = ''; if (f) importVibemeshFile(f) }}
          />
          <button
            className="chip-btn"
            type="button"
            aria-label="Open a shared .vibemesh part"
            title="Open someone's shared .vibemesh part as a new editable project — no AI needed"
            onClick={() => shareRef.current?.click()}
          >
            <DBox /> Import .vibemesh
          </button>
          <ModelMenu />
          <span className="spacer" />
          <button
            className="send-btn"
            onClick={generate}
            disabled={(!text.trim() && images.length === 0) || !engine || noVision}
            title={!engine ? 'Connect an AI engine first' : noVision ? 'This engine cannot see images — switch engine or remove the attachment' : undefined}
          >
            <DSparkFill /> Generate model
          </button>
        </div>
      </div>

      <div className="empty-examples">
        {PROMPT_IDEAS.slice(0, 4).map((idea, i) => {
          const Icon = CHIP_ICONS[i % CHIP_ICONS.length]
          return (
            <button key={idea} className="ex-chip" onClick={() => setText(idea)}>
              <Icon /> {idea}
            </button>
          )
        })}
      </div>

      <div className="empty-starters">
        <span className="starters-label">Try a mechanism</span>
        <div className="starters-row">
          {SKILL_STARTERS.map((s) => (
            <button key={s} className="ex-chip starter" onClick={() => setText(s)} title="Prefill this prompt">
              <DSpark /> {s}
            </button>
          ))}
        </div>
      </div>

      <div className="empty-steps">
        <div className="estep"><span className="en">1</span> <b>Describe</b> in words</div>
        <span className="estep-arrow"><DArrowRight /></span>
        <div className="estep"><span className="en">2</span> <b>Tweak</b> live sliders</div>
        <span className="estep-arrow"><DArrowRight /></span>
        <div className="estep"><span className="en">3</span> <b>Export</b> to print</div>
      </div>

      <div className="empty-cards-label">Or start from a built-in model — works without AI connected</div>
      <div className="example-cards">
        {EXAMPLES.map((ex) => (
          <button key={ex.id} className="example-card" onClick={() => loadExample(ex)}>
            <span className="example-name">{ex.name}</span>
            <span className="example-blurb">{ex.blurb}</span>
            <span className="example-cta">Load →</span>
          </button>
        ))}
      </div>
    </div>
  )
}

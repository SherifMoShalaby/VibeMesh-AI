import { useState } from 'react'
import { useStore } from '../state/store'
import { EXAMPLES, PROMPT_IDEAS } from '../lib/examples'
import { DSpark, DImage, DSparkFill, DArrowRight, DBox, DCamera, DGrid, DCylinder } from './icons'

const CHIP_ICONS = [DBox, DCamera, DGrid, DCylinder]

export default function EmptyState() {
  const loadExample = useStore((s) => s.loadExample)
  const sendPrompt = useStore((s) => s.sendPrompt)
  const engine = useStore((s) => s.engine)
  const [text, setText] = useState('')

  const generate = () => {
    const t = text.trim()
    if (!t) return
    setText('')
    void sendPrompt(t)
  }

  return (
    <div className="empty">
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
        <div className="empty-composer-foot">
          <button
            className="chip-btn"
            title="Add a reference photo from the chat panel"
            onClick={() => void sendPrompt('', undefined)}
            disabled
          >
            <DImage /> Add reference photo
          </button>
          <span className="spacer" />
          <button className="send-btn" onClick={generate} disabled={!text.trim() || !engine} title={engine ? undefined : 'Connect an AI engine first'}>
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

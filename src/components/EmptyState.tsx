import { useStore } from '../state/store'
import { useUi } from '../state/ui'
import { EXAMPLES, PROMPT_IDEAS } from '../lib/examples'
import { IconImage } from './icons'

export default function EmptyState() {
  const loadExample = useStore((s) => s.loadExample)
  const setDraftPrompt = useUi((s) => s.setDraftPrompt)

  return (
    <div className="empty-state">
      <div className="empty-inner">
        <div className="empty-kicker">Text ⟶ parametric ⟶ printable</div>
        <h1 className="empty-title">
          Describe a part.
          <br />
          <em>Get a print-ready part.</em>
        </h1>
        <p className="empty-sub">
          Vibemesh turns plain words into 3D models you can print — built live in your browser, fine-tuned with
          sliders, sized in real millimeters.
        </p>

        <div className="photo-tile">
          <span className="photo-tile-glyph"><IconImage /></span>
          <span>
            <strong>Have a photo or sketch?</strong> Paste it (⌘V), drop it on the chat, or use the ▣ Photo button —
            written dimensions are followed exactly, and one Refine click compares the result against your picture.
          </span>
        </div>

        <div className="empty-section-label">Try a prompt</div>
        <div className="idea-chips">
          {PROMPT_IDEAS.map((idea) => (
            <button key={idea} className="idea-chip" onClick={() => setDraftPrompt(idea)}>
              {idea}
            </button>
          ))}
        </div>

        <div className="empty-section-label">Or start from a built-in model — works without AI connected</div>
        <div className="example-cards">
          {EXAMPLES.map((ex) => (
            <button key={ex.id} className="example-card" onClick={() => loadExample(ex)}>
              <span className="example-name">{ex.name}</span>
              <span className="example-blurb">{ex.blurb}</span>
              <span className="example-cta">Load ⟶</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

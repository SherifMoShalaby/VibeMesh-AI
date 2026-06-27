// UIUX-7/9: StreamingBubble — the only chat component that subscribes to streamText
// (extracted from ChatPanel.tsx as StreamingLeaf). Subscribes to generating +
// streamText with granular zustand selectors. Also owns the elapsed timer and the
// per-token scroll, so ChatPanel never re-renders on a streaming token.
import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import type { ChatMessage } from '../types'
import { DSparkFill } from './icons'
import { nowTime } from './chatShared'

export default function StreamingBubble({
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

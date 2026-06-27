// UIUX-9: ChatList — the scrolling message log (extracted from ChatPanel.tsx).
// Maps the chat array → memo'd MessageRow rows and mounts the isolated
// StreamingBubble leaf. Receives all per-row data + stable callbacks as props so
// prior bubbles never re-render per streaming token (the memo contract from UIUX-7).
import { MessageRow } from './MessageRow'
import StreamingBubble from './StreamingBubble'
import type { ChatMessage } from '../types'

export default function ChatList({
  scrollRef,
  chat,
  generating,
  activeProvider,
  versionOf,
  currentCode,
  rolledBackVersions,
  flaggedSkills,
  reduce,
  onLightbox,
  onRestoreVersion,
  onRestoreNewer,
  onRetryLast,
  onRerollLast,
  onRegenerateWithSkills,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>
  chat: ChatMessage[]
  generating: boolean
  activeProvider: { label: string } | undefined
  versionOf: Map<string, number>
  currentCode: string
  rolledBackVersions: number
  flaggedSkills: Set<string>
  reduce: boolean | null
  onLightbox: (src: string | null) => void
  onRestoreVersion: (id: string) => void
  onRestoreNewer: () => void
  onRetryLast: () => void
  onRerollLast: () => void
  onRegenerateWithSkills: (msgId: string, skillIds: string[]) => void
}) {
  return (
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

      {/* UIUX-7: StreamingBubble subscribes ONLY to generating + streamText — never
          triggers a re-render on the message list. Scroll-on-token is also inside. */}
      <StreamingBubble scrollRef={scrollRef} chat={chat} activeProvider={activeProvider} />
    </div>
  )
}

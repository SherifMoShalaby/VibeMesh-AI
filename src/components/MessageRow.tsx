// UIUX-7/9: MessageRow — memo'd single-bubble renderer (extracted from ChatPanel.tsx).
// Receives all data as props. Has NO subscription to streamText or generating
// (only needs `generating` for the Restore-button disabled state, which is a
// coarse boolean flip — acceptable). Prior bubbles never re-render per token.
import { memo } from 'react'
import { motion } from 'framer-motion'
import type { ChatMessage } from '../types'
import { IconWarning, DImage, DUser, DSparkFill, DCode, DRestore, DRefresh, DLayers } from './icons'
import { imgSrc, fmtTime, skillLabel, ALL_SKILL_IDS } from './chatShared'

export interface MessageRowProps {
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

export const MessageRow = memo(function MessageRow({
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

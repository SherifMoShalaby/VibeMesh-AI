// UIUX-9: useRefinePass — the refine() handler extracted from ChatPanel.tsx.
// It is invoked both by the composer's manual "Refine" button and by ChatPanel's
// bounded auto-refine effect, so it lives in a shared hook rather than either child.
// Behavior-preserving move — the prompt-building logic is unchanged.
import { useStore } from '../state/store'
import { CAPTURE_VIEW_NAMES, captureViews } from '../lib/capture'
import { clampStatedDimensions, dimDiscrepancies, fillRatioNote } from '../lib/refineProxy'
import { takeRefineDiscrepancy } from '../state/generationActions'
import type { ChatMessage } from '../types'

export function useRefinePass(
  chat: ChatMessage[],
  activeId: string | null,
  flashAttachNote: (note: string) => void,
) {
  const sendPrompt = useStore((s) => s.sendPrompt)
  const modelDims = useStore((s) => s.modelDims)

  return () => {
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
}

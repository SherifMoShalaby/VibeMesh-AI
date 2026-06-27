// Shared pure helpers + constants for the ChatPanel sub-components (UIUX-9 split).
// Extracted verbatim from ChatPanel.tsx — no behavioral change.
import type { ChatImage } from '../types'

export const MAX_IMAGES = 10
export const IMAGE_TYPES = /^image\/(png|jpeg|webp|gif)$/

/** data URL for a chat image (base64 payload carries no `data:` prefix). */
export const imgSrc = (img: ChatImage) => `data:${img.mediaType};base64,${img.data}`

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
export const skillLabel = (id: string) =>
  SKILL_LABELS[id] ?? id.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

// the addable mechanism skills (mirrors the server/skills.mjs registry keys) for the chip's
// "+ add" correction control; kit-baseplate is excluded (it is the multi-part baseplate, not
// a mechanism the user picks here).
export const ALL_SKILL_IDS = [
  'wheel-axle', 'living-hinge', 'leaf-spring', 'snap-fit', 'print-in-place-hinge',
  'spur-gear', 'rack-pinion', 'ratchet', 'coil-spring', 'threaded-fastener-seat',
  'bearing-608-pocket', 'planetary', 'gt2-pulley', 'herringbone',
  'fit-pair', 'bistable', 'button-return',
  'crown-coronet', 'hollow-crenellation', 'open-prong-cradle',
]

// ── Pure time helpers (no React) ────────────────────────────────────────────

/** Format HH:MM from a timestamp epoch-ms. Empty string for missing stamps (pre-createdAt messages). */
export function fmtTime(ts?: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Current wall-clock HH:MM (used for the streaming turn's "sent now" label). */
export function nowTime(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export type ChatRole = 'user' | 'assistant'

/**
 * Advisory design-intent the model serializes on the PLAN's `INTENT:` line — a
 * machine-readable summary of the reasoning it already did (archetype / facet verdict /
 * kit-or-not / mechanism tags). Drives skill retrieval and the applied-patterns chip;
 * never a competing output block, never required (all fields optional except `form`).
 */
export interface DesignIntent {
  form: 'single' | 'kit' | 'assembly'
  archetype?: string
  facetVerdict?: 'faceted' | 'machined' | 'functional'
  signatureFeatures?: string[]
  domainTags?: string[]
  statedDimensions?: { value: number; unit: string; feature: string }[]
  ambiguityScore?: 'low' | 'med' | 'high'
  assumptions?: string[]
  /** vision fields (P6) — set when working from a reference image; route the source-specific
   *  build fragment and (statedDimensions) feed the model-independent refine proxy + dim clamp. */
  sourceType?: 'photo' | 'drawing' | 'orthographic' | 'multiview' | 'multiobject'
  asymmetryFlags?: string[]
  confidence?: 'low' | 'med' | 'high'
}

export interface ChatImage {
  mediaType: string
  /** base64 payload (no data: prefix) */
  data: string
  /** pixel dims (when known) — drive the size-aware token estimate + tiling decisions */
  width?: number
  height?: number
  /** what this image is: a whole reference (global), a cropped region (tile), or a render
   *  pose captured for a refine pass (view). Optional so persisted projects load. */
  role?: 'global' | 'tile' | 'view'
}

export interface ChatMessage {
  id: string
  role: ChatRole
  /** epoch ms stamped at creation, so the rendered time is the SEND time and stays stable across
   *  re-renders. Optional: messages persisted before this field load without it (the UI hides the
   *  time rather than showing a wrong one). */
  createdAt?: number
  /** prose part of the message (code stripped for assistant messages) */
  text: string
  /** full scad code carried by this message, if any */
  code?: string
  images?: ChatImage[]
  error?: boolean
  /** set for app-initiated messages (refine/split/fix) — UI shows a chip instead of the protocol text */
  action?: string
  /** advisory mechanism-check from the retrieved skills' validators — shown in the UI but
   *  deliberately NOT part of `text`, so it never re-enters the model's next-turn history */
  skillNote?: string
  /** ids of the skills that fired for this generation (metadata for the applied-patterns
   *  chip; like skillNote, kept out of `text` so it stays out of model history) */
  appliedSkillIds?: string[]
  /** skills that MATCHED but were cut by the auto-cap — surfaced in the chip so the user can
   *  promote one (never silently truncated). Metadata only, kept out of `text`. */
  droppedSkillIds?: string[]
  /** the model's parsed design intent for this turn (advisory; versions WITH the code on
   *  this message, so rollback shows this version's intent or none — never stale) */
  intent?: DesignIntent
}

export type ParamKind = 'number' | 'slider' | 'bool' | 'enum' | 'string'

export interface ScadParameter {
  name: string
  kind: ParamKind
  group: string
  description?: string
  /** default value as written in code */
  defaultValue: number | boolean | string
  min?: number
  max?: number
  step?: number
  options?: Array<number | string>
}

export type ParamValue = number | boolean | string
export type ParamValues = Record<string, ParamValue>

export interface CompileResult {
  ok: boolean
  stl?: ArrayBuffer
  error?: string
  log?: string
  ms?: number
}

export interface Project {
  id: string
  name: string
  code: string
  paramValues: ParamValues
  chat: ChatMessage[]
  /** Versions rolled past via Restore: the abandoned tail (everything after the
   *  restored message), kept so a rollback is reversible (redo) until the user
   *  diverges by sending a new prompt, which clears it. Chronological — newest last. */
  chatFuture?: ChatMessage[]
  createdAt: number
  updatedAt: number
}

export interface PrinterBed {
  id: string
  label: string
  x: number
  y: number
  z: number
}

export interface QualityPreset {
  id: string
  label: string
  /** max degrees per curve segment ($fa) */
  fa: number
  /** max mm per curve segment ($fs) */
  fs: number
}

export const QUALITY_PRESETS: QualityPreset[] = [
  { id: 'draft', label: 'Draft', fa: 12, fs: 2 },
  { id: 'standard', label: 'Standard', fa: 4, fs: 0.8 },
  { id: 'fine', label: 'Fine', fa: 3, fs: 0.4 },
  { id: 'ultra', label: 'Ultra', fa: 1.5, fs: 0.25 },
]

export const PRINTER_BEDS: PrinterBed[] = [
  // Creality
  { id: 'ender3', label: 'Ender 3 / S1 — 220×220×250', x: 220, y: 220, z: 250 },
  { id: 'k1', label: 'Creality K1 / K1C — 220×220×250', x: 220, y: 220, z: 250 },
  { id: 'k1-max', label: 'Creality K1 Max — 300×300×300', x: 300, y: 300, z: 300 },
  // Bambu Lab
  { id: 'a1-mini', label: 'Bambu A1 mini — 180×180×180', x: 180, y: 180, z: 180 },
  { id: 'bambu-a1', label: 'Bambu A1 — 256×256×256', x: 256, y: 256, z: 256 },
  { id: 'bambu-p1', label: 'Bambu P1P / P1S / X1C — 256×256×256', x: 256, y: 256, z: 256 },
  { id: 'bambu-h2d', label: 'Bambu H2D — 350×320×325', x: 350, y: 320, z: 325 },
  // Prusa
  { id: 'prusa-mini', label: 'Prusa MINI+ — 180×180×180', x: 180, y: 180, z: 180 },
  { id: 'prusa-mk4', label: 'Prusa MK4S — 250×210×220', x: 250, y: 210, z: 220 },
  { id: 'prusa-core-one', label: 'Prusa CORE One — 250×220×270', x: 250, y: 220, z: 270 },
  { id: 'prusa-xl', label: 'Prusa XL — 360×360×360', x: 360, y: 360, z: 360 },
  // others
  { id: 'neptune4-pro', label: 'Elegoo Neptune 4 Pro — 225×225×265', x: 225, y: 225, z: 265 },
  { id: 'centauri-carbon', label: 'Elegoo Centauri Carbon — 256×256×256', x: 256, y: 256, z: 256 },
  { id: 'adventurer-5m', label: 'Flashforge Adventurer 5M — 220×220×220', x: 220, y: 220, z: 220 },
  { id: 'qidi-q1-pro', label: 'QIDI Q1 Pro — 245×245×240', x: 245, y: 245, z: 240 },
]

export const CUSTOM_BED_ID = 'custom'

export interface BedSize {
  x: number
  y: number
  z: number
}

/** Resolve a bed id (including the user-defined custom bed) to a full PrinterBed. */
export function resolveBed(bedId: string, custom: BedSize | null): PrinterBed {
  if (bedId === CUSTOM_BED_ID && custom) {
    return { id: CUSTOM_BED_ID, label: `Custom — ${custom.x}×${custom.y}×${custom.z}`, ...custom }
  }
  return PRINTER_BEDS.find((b) => b.id === bedId) ?? PRINTER_BEDS[0]
}

export type OrcaMaterial = 'PLA' | 'PETG' | 'ABS' | 'TPU'

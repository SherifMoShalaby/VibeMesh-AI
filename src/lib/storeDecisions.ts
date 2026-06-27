import type { StlBBox } from './stl'
import type { Project } from '../types'

/**
 * Pure decision helpers for the generation / compile lifecycle, split out of the zustand store so
 * they're unit-testable without importing the store (which pulls in localStorage-touching UI state
 * that crashes a headless test env). No side effects, no runtime imports.
 */

/**
 * Cross-tab merge: fold the durable projects another tab just wrote (`incoming`) into THIS tab's
 * `current` projects, without disturbing the project the user is actively editing. The active
 * project keeps its live in-tab version (never yank the open chat/editor), and survives even if the
 * other tab deleted it. Every other project is taken from `incoming` (the reconciled durable truth).
 */
export function mergeExternalProjects(
  incoming: Project[],
  current: Project[],
  activeId: string | null,
): Project[] {
  const liveActive = activeId ? current.find((p) => p.id === activeId) : undefined
  if (!liveActive) return incoming // no live active project to preserve — adopt the durable set as-is
  const next = incoming.map((p) => (p.id === activeId ? liveActive : p))
  // active project was deleted in the other tab → keep ours so the rug isn't pulled mid-edit
  if (!incoming.some((p) => p.id === activeId)) return [liveActive, ...next]
  return next
}

/** Does the prompt ask for a buildable KIT (→ reinforce multi-part + connector rules)?
 *  Strong phrases only; deliberately ignores bare "part"/"lego" so singular requests
 *  ("a replacement part", "a spare gear") are NOT over-split into kits. */
export function detectKitIntent(text: string): boolean {
  const t = text.toLowerCase()
  return (
    // "modular" alone is too weak — "modular fidget spinner" is ONE solid, not a kit;
    // require a kit noun nearby (allowing an adjective between, e.g. "modular building blocks").
    /\bkit\b|\bbuildable\b|\binterlock/.test(t) ||
    /\bmodular\b[^.?!]{0,20}?\b(kit|set|system|parts|pieces|blocks?|bricks?)\b/.test(t) ||
    /\b(snaps?|clips?)[\s-]?together\b/.test(t) ||
    /\b(set|kit)\s+of\s+(parts|pieces)\b/.test(t) ||
    /\bparts?\s+(that|which|to|so)\b/.test(t) ||
    /\b(assemble|build)\b[^.?!]*\b(it|them|together)\b/.test(t)
  )
}

/** A clean compile can still be unusable. Return a reason the render is degenerate,
 *  or null. checkBed is false for multi-part assembly previews (allowed to exceed
 *  the bed); empty/NaN/tiny checks always apply. */
export function degenerateReason(
  dims: StlBBox | null,
  bed: { x: number; y: number; z: number },
  checkBed: boolean,
): string | null {
  if (!dims) return 'the render produced no measurable geometry'
  const { x, y, z } = dims
  if (![x, y, z].every((n) => Number.isFinite(n))) return 'the bounding box is not finite (NaN/Infinity)'
  if (Math.min(x, y, z) < 0.5) return `a dimension is implausibly small (${x}×${y}×${z} mm)`
  // ANY dimension over the bed makes a single part unprintable — match printability.ts (`||`) and
  // the viewport over-bed tint, so the auto-fix loop acts on the same "won't fit" the UI shows
  // (the old `&&` only fired when all three exceeded, leaving e.g. a 60×60×400 part flagged-but-unfixed).
  if (checkBed && (x > bed.x || y > bed.y || z > bed.z)) return `a dimension exceeds the ${bed.x}×${bed.y}×${bed.z} mm bed (${x}×${y}×${z} mm)`
  return null
}

/**
 * OC-13 — flat-on-bed printability of a SINGLE solid part. A part whose lowest face sits well off
 * z=0 — floating above the bed (minZ > tol) or sunk below it (minZ < -tol, e.g. t2-soapdish's
 * minZ=-3 feet) — is a DESIGN miss the success gate should surface, not just silently transform on
 * export. Returns a human reason or null. tol is a few tenths of a mm so a part authored flat
 * (minZ≈0) and the inevitable mesh-rounding noise are NOT flagged. The deterministic export
 * drop-to-bed remains the safety net; this only flags the design. Caller exempts the assembled
 * `all` view and multi-part (their pieces legitimately float / explode). Pure + deterministic.
 */
export function notFlatOnBedReason(dims: StlBBox | null, tol = 0.5): string | null {
  if (!dims || !Number.isFinite(dims.minZ)) return null
  if (Math.abs(dims.minZ) <= tol) return null
  return dims.minZ < 0
    ? `the part is authored ${(-dims.minZ).toFixed(1)}mm below the bed (its lowest face is at z=${dims.minZ.toFixed(1)}) — design it to rest flat on z=0`
    : `the part floats ${dims.minZ.toFixed(1)}mm above the bed (its lowest face is at z=${dims.minZ.toFixed(1)}) — design it to rest flat on z=0`
}

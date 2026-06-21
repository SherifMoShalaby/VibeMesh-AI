/**
 * Lay out printable pieces across one or more bed-sized plates (the "slicer" view).
 * Shelf / first-fit-decreasing on the XY footprint — enough density for a preview of
 * single-digit part counts; not a production nester. Rotation is RESCUE-ONLY: a piece keeps
 * its as-drawn orientation unless that doesn't fit the bed but a 90° Z-spin does (common on
 * non-square beds, e.g. a part drawn portrait on a 250×210 Prusa MK4S). The chosen `rot` is
 * the single source of truth — SlicerScene and the .3mf export both consume it and bake the
 * same spin, so the preview and the exported plate never disagree. A piece that fits in
 * NEITHER orientation is reported oversize, never force-fit.
 */
export interface PieceFootprint {
  name: string
  w: number // X footprint (mm)
  h: number // Y footprint (mm)
  z: number // height (mm) — for the bed-Z fit check
}

/** Separator between a base part name and a replica index in a packer key (`lid#0`). Part-enum
 *  option strings are SCAD identifiers/words and never contain it, so the round-trip is unambiguous. */
const REPLICA_SEP = '#'

/** Strip a replica suffix (`lid#2` → `lid`); a name without one is returned unchanged. The packer
 *  keys placements by the UNIQUE name it's given, so callers resolve geometry/color via the base. */
export function baseName(name: string): string {
  const i = name.lastIndexOf(REPLICA_SEP)
  return i === -1 ? name : name.slice(0, i)
}

/**
 * Expand pieces by per-part print quantity into packer-ready entries with UNIQUE names, so N copies
 * pack as N distinct placements instead of silently collapsing under one name (the byName→byKey fix).
 * qty 1 → the base name unchanged (zero behavior change for single-quantity designs); qty N>1 →
 * `name#0..name#(N-1)`. qtyOf is clamped to [1,99]. Each entry also carries its `baseName` for
 * geometry/color lookup. Used by BOTH the live Slicer pack and the .3mf plate export (WYSIWYG).
 */
export function expandFootprints(pieces: PieceFootprint[], qtyOf: (name: string) => number): (PieceFootprint & { baseName: string })[] {
  const out: (PieceFootprint & { baseName: string })[] = []
  for (const p of pieces) {
    const n = Math.max(1, Math.min(99, Math.floor(qtyOf(p.name) || 1)))
    if (n === 1) {
      out.push({ ...p, baseName: p.name })
      continue
    }
    for (let k = 0; k < n; k++) out.push({ ...p, name: `${p.name}${REPLICA_SEP}${k}`, baseName: p.name })
  }
  return out
}

export interface Placement {
  name: string
  x: number // bed-local X of the piece's min corner (mm)
  y: number // bed-local Y of the piece's min corner (mm)
  w: number // PLACED footprint (already swapped if rot === 90)
  h: number
  rot: 0 | 90 // Z-rotation to apply to the source mesh before seating; the SINGLE source of truth
  //            consumed verbatim by SlicerScene (view) and buildThreeMF (export) — never recomputed
}

export interface Oversize {
  name: string
  reason: 'footprint' | 'height'
}

export interface PlatePlan {
  plates: Placement[][] // one array of placements per plate
  oversize: Oversize[]
}

/**
 * @param pieces  footprints to place
 * @param bed     printer bed (mm)
 * @param gap     spacing between pieces / plate margin (mm)
 */
export function packPlates(
  pieces: PieceFootprint[],
  bed: { x: number; y: number; z: number },
  gap = 6,
): PlatePlan {
  const usableX = bed.x - 2 * gap
  const usableY = bed.y - 2 * gap
  const oversize: Oversize[] = []
  // each fitting piece carries its CHOSEN placed footprint (post-rotation) + the rot flag.
  // rescue-only: keep the as-drawn orientation unless it doesn't fit but a 90° spin does. This
  // fixes the false "won't fit the bed" verdict on non-square beds (e.g. a part drawn portrait on
  // a 250×210 Prusa MK4S) without reshuffling layouts that already fit.
  const fit: Array<{ name: string; w: number; h: number; rot: 0 | 90 }> = []
  for (const p of pieces) {
    const fitsAsDrawn = p.w <= usableX + 1e-6 && p.h <= usableY + 1e-6
    const fitsRot = p.h <= usableX + 1e-6 && p.w <= usableY + 1e-6
    if (p.z > bed.z + 1e-6) oversize.push({ name: p.name, reason: 'height' }) // a Z-spin can't lower a too-tall part
    else if (fitsAsDrawn) fit.push({ name: p.name, w: p.w, h: p.h, rot: 0 })
    else if (fitsRot) fit.push({ name: p.name, w: p.h, h: p.w, rot: 90 }) // swap footprint to the rotated dims
    else oversize.push({ name: p.name, reason: 'footprint' }) // neither orientation fits the bed
  }

  // first-fit-decreasing by the (placed) taller dimension keeps shelves shallow
  const sorted = [...fit].sort((a, b) => b.h - a.h || b.w - a.w)

  const plates: Placement[][] = []
  let cur: Placement[] = []
  let cursorX = 0
  let shelfY = 0
  let shelfH = 0
  const newPlate = () => {
    if (cur.length) plates.push(cur)
    cur = []
    cursorX = 0
    shelfY = 0
    shelfH = 0
  }
  for (const p of sorted) {
    if (cursorX + p.w > usableX + 1e-6) {
      // next shelf
      shelfY += shelfH + gap
      cursorX = 0
      shelfH = 0
    }
    if (shelfY + p.h > usableY + 1e-6) newPlate() // doesn't fit this plate → start a new one
    cur.push({ name: p.name, x: gap + cursorX, y: gap + shelfY, w: p.w, h: p.h, rot: p.rot })
    cursorX += p.w + gap
    shelfH = Math.max(shelfH, p.h)
  }
  if (cur.length) plates.push(cur)

  return { plates, oversize }
}

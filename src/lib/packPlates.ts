/**
 * Lay out printable pieces across one or more bed-sized plates (the "slicer" view).
 * Shelf / first-fit-decreasing on the XY footprint — enough density for a preview of
 * single-digit part counts; not a production nester. No rotation in v1: a real slicer
 * auto-arranges parts on import, so a rotated preview here would just disagree with what
 * the user's slicer does — and the placement is preview-only (export recompiles each part
 * flat from OpenSCAD source). So a piece that doesn't fit the bed as-drawn is reported as
 * oversize, never force-fit.
 */
export interface PieceFootprint {
  name: string
  w: number // X footprint (mm)
  h: number // Y footprint (mm)
  z: number // height (mm) — for the bed-Z fit check
}

export interface Placement {
  name: string
  x: number // bed-local X of the piece's min corner (mm)
  y: number // bed-local Y of the piece's min corner (mm)
  w: number
  h: number
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
  const fit: PieceFootprint[] = []
  for (const p of pieces) {
    if (p.z > bed.z + 1e-6) oversize.push({ name: p.name, reason: 'height' })
    else if (p.w > usableX + 1e-6 || p.h > usableY + 1e-6) oversize.push({ name: p.name, reason: 'footprint' })
    else fit.push(p)
  }

  // first-fit-decreasing by the taller dimension keeps shelves shallow
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
    cur.push({ name: p.name, x: gap + cursorX, y: gap + shelfY, w: p.w, h: p.h })
    cursorX += p.w + gap
    shelfH = Math.max(shelfH, p.h)
  }
  if (cur.length) plates.push(cur)

  return { plates, oversize }
}

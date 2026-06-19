import type { ChatImage } from '../types'

/**
 * Client-side reference tiler (P6). A busy / orthographic SPEC SHEET (large, mostly-white with
 * sparse line/label detail) degrades under the VLM resolution curse, so emit a global thumbnail
 * PLUS a grid of region crops — bounded by the per-engine image budget. A normal photo (full-tone)
 * stays ONE global image. All outputs are role-tagged + carry pixel dims (size-aware token cost).
 *
 * Heuristic, no ML: tile only when the image is large AND mostly white-background (a drawing/sheet),
 * which keeps clean photos as a single image. Tile resolution is fixed and the count is bounded by
 * the budget (degrade-by-fewer-pixels-per-tile falls out of the fixed tile size).
 */

const GLOBAL_MAX = 896 // single-image / clean-photo long edge
const THUMB_MAX = 768 // global thumbnail when tiling
const TILE_MAX = 760 // each region crop long edge
const TILE_TRIGGER_EDGE = 1400 // below this, never tile (a small image needs no crops)
const WHITE_FRAC_TRIGGER = 0.55 // a drawing/sheet is mostly white background; a photo is not

function decode(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(e)
    }
    img.src = url
  })
}

/** Draw a source region (sx,sy,sw,sh) of `img` scaled into a dw×dh canvas over white. */
function regionCanvas(img: HTMLImageElement, sx: number, sy: number, sw: number, sh: number, dw: number, dh: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = dw
  c.height = dh
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, dw, dh)
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh)
  return c
}

function toChatImage(canvas: HTMLCanvasElement, role: ChatImage['role'], quality = 0.85): ChatImage {
  const dataUrl = canvas.toDataURL('image/jpeg', quality)
  return { mediaType: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1), width: canvas.width, height: canvas.height, role }
}

/** Fraction of near-white pixels (sampled on a tiny canvas) — high for line drawings / spec sheets. */
function whiteFraction(img: HTMLImageElement): number {
  const s = 64
  const c = document.createElement('canvas')
  c.width = s
  c.height = s
  const ctx = c.getContext('2d')!
  ctx.drawImage(img, 0, 0, s, s)
  const data = ctx.getImageData(0, 0, s, s).data
  let white = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235) white++
  }
  return white / (s * s)
}

/**
 * Decode `file` and return either ONE global image (clean photo / small drawing) or a global
 * thumbnail + region crops (busy sheet), total ≤ `budget`. Returns [] if decode fails.
 */
export async function tileReference(file: File, budget = 4): Promise<ChatImage[]> {
  let img: HTMLImageElement
  try {
    img = await decode(file)
  } catch {
    return []
  }
  const w = img.naturalWidth
  const h = img.naturalHeight
  if (!w || !h) return []
  const longEdge = Math.max(w, h)
  const fit = (max: number) => Math.min(1, max / longEdge)

  const busy = budget > 1 && longEdge >= TILE_TRIGGER_EDGE && whiteFraction(img) >= WHITE_FRAC_TRIGGER
  if (!busy) {
    const s = fit(GLOBAL_MAX)
    return [toChatImage(regionCanvas(img, 0, 0, w, h, Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))), 'global')]
  }

  // busy sheet: global thumbnail + a grid of crops bounded by the budget
  const out: ChatImage[] = []
  const ts = fit(THUMB_MAX)
  out.push(toChatImage(regionCanvas(img, 0, 0, w, h, Math.max(1, Math.round(w * ts)), Math.max(1, Math.round(h * ts))), 'global'))

  const tileBudget = budget - 1
  const aspect = w / h
  let cols = Math.max(1, Math.min(tileBudget, Math.round(Math.sqrt(tileBudget * Math.max(aspect, 1)))))
  const rows = Math.ceil(tileBudget / cols)
  cols = Math.ceil(tileBudget / rows) // re-balance so rows*cols covers the budget tightly
  const cw = w / cols
  const ch = h / rows
  for (let r = 0; r < rows && out.length <= tileBudget; r++) {
    for (let c = 0; c < cols && out.length <= tileBudget; c++) {
      const sx = Math.round(c * cw)
      const sy = Math.round(r * ch)
      const sw = Math.round(Math.min(cw, w - sx))
      const sh = Math.round(Math.min(ch, h - sy))
      if (sw < 4 || sh < 4) continue
      const tScale = Math.min(1, TILE_MAX / Math.max(sw, sh))
      out.push(toChatImage(regionCanvas(img, sx, sy, sw, sh, Math.max(1, Math.round(sw * tScale)), Math.max(1, Math.round(sh * tScale))), 'tile'))
    }
  }
  return out
}

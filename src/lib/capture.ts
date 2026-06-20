import type { ChatImage } from '../types'

/**
 * Canonical fixed-pose order the Viewport's CaptureRig shoots — and the SINGLE SOURCE
 * OF TRUTH for naming those renders in the refine prompt. CaptureRig iterates this list
 * to drive its shoots, and ChatPanel slices it (to the actual view count) to tell the
 * model which attached image is which, so the two can never drift out of sync.
 */
export const CAPTURE_VIEW_NAMES = ['isometric', 'front', 'top', 'right'] as const
export type CaptureViewName = (typeof CAPTURE_VIEW_NAMES)[number]

let viewportCanvas: HTMLCanvasElement | null = null
let multiCapture: ((maxDim?: number, quality?: number) => ChatImage[]) | null = null

/** Called once by the Viewport when the WebGL canvas is created. */
export function registerViewportCanvas(canvas: HTMLCanvasElement): void {
  viewportCanvas = canvas
}

/**
 * Registered by the Viewport: renders the model from a few canonical FIXED poses
 * (isometric, front, top, right), fitted to the model, and returns them in that order —
 * so refine passes always compare the same viewpoints regardless of user orbiting,
 * and the model can judge proportions/feature counts it can't see from one angle.
 */
export function registerMultiCapture(fn: ((maxDim?: number, quality?: number) => ChatImage[]) | null): void {
  multiCapture = fn
}

export function canvasToChatImage(canvas: HTMLCanvasElement, maxDim = 896, quality = 0.85): ChatImage | null {
  const { width, height } = canvas
  if (!width || !height) return null
  const scale = Math.min(1, maxDim / Math.max(width, height))
  const out = document.createElement('canvas')
  out.width = Math.round(width * scale)
  out.height = Math.round(height * scale)
  const ctx = out.getContext('2d')
  if (!ctx) return null
  // solid background so the JPEG isn't black-on-transparent
  ctx.fillStyle = '#15171a'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(canvas, 0, 0, out.width, out.height)
  const dataUrl = out.toDataURL('image/jpeg', quality)
  // role 'view' — a captured render pose for a refine pass (vs an uploaded reference)
  return { mediaType: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1), width: out.width, height: out.height, role: 'view' }
}

/**
 * Snapshots for the refine loop — up to four canonical fixed-pose views.
 * Falls back to whatever is currently on screen if the fixed poses are unavailable.
 */
export function captureViews(maxDim = 896, quality = 0.85): ChatImage[] {
  const views = multiCapture?.(maxDim, quality)
  if (views && views.length) return views
  if (viewportCanvas) {
    const single = canvasToChatImage(viewportCanvas, maxDim, quality)
    return single ? [single] : []
  }
  return []
}

/** Single canonical snapshot (the isometric view) — convenience for one-image callers. */
export function captureViewport(maxDim = 896, quality = 0.85): ChatImage | null {
  return captureViews(maxDim, quality)[0] ?? null
}

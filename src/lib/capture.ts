import type { ChatImage } from '../types'

let viewportCanvas: HTMLCanvasElement | null = null
let multiCapture: ((maxDim?: number) => ChatImage[]) | null = null

/** Called once by the Viewport when the WebGL canvas is created. */
export function registerViewportCanvas(canvas: HTMLCanvasElement): void {
  viewportCanvas = canvas
}

/**
 * Registered by the Viewport: renders the model from a few canonical FIXED poses
 * (isometric, front, top), fitted to the model, and returns them in that order —
 * so refine passes always compare the same viewpoints regardless of user orbiting,
 * and the model can judge proportions/feature counts it can't see from one angle.
 */
export function registerMultiCapture(fn: ((maxDim?: number) => ChatImage[]) | null): void {
  multiCapture = fn
}

export function canvasToChatImage(canvas: HTMLCanvasElement, maxDim = 896): ChatImage | null {
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
  const dataUrl = out.toDataURL('image/jpeg', 0.85)
  return { mediaType: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1) }
}

/**
 * Snapshots for the refine loop — up to three canonical fixed-pose views.
 * Falls back to whatever is currently on screen if the fixed poses are unavailable.
 */
export function captureViews(maxDim = 896): ChatImage[] {
  const views = multiCapture?.(maxDim)
  if (views && views.length) return views
  if (viewportCanvas) {
    const single = canvasToChatImage(viewportCanvas, maxDim)
    return single ? [single] : []
  }
  return []
}

/** Single canonical snapshot (the isometric view) — convenience for one-image callers. */
export function captureViewport(maxDim = 896): ChatImage | null {
  return captureViews(maxDim)[0] ?? null
}

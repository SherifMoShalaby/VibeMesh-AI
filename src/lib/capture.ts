import type { ChatImage } from '../types'

let viewportCanvas: HTMLCanvasElement | null = null
let canonicalCapture: ((maxDim?: number) => ChatImage | null) | null = null

/** Called once by the Viewport when the WebGL canvas is created. */
export function registerViewportCanvas(canvas: HTMLCanvasElement): void {
  viewportCanvas = canvas
}

/**
 * Registered by the Viewport: renders one frame from the canonical camera pose
 * (fixed iso angle, fitted to the model) and returns it — so successive refine
 * passes always compare the same viewpoint.
 */
export function registerCanonicalCapture(fn: ((maxDim?: number) => ChatImage | null) | null): void {
  canonicalCapture = fn
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
 * Snapshot for the refine loop. Prefers the canonical fixed-pose render;
 * falls back to whatever is currently on screen.
 */
export function captureViewport(maxDim = 896): ChatImage | null {
  const canonical = canonicalCapture?.(maxDim)
  if (canonical) return canonical
  if (!viewportCanvas) return null
  return canvasToChatImage(viewportCanvas, maxDim)
}

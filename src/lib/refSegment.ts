/**
 * Reference-photo → silhouette mask (Phase 2 — best-of-N soft tiebreak).
 *
 * Turns an attached reference PHOTO into the SAME 256×256 binary pose-mask shape that
 * src/lib/silhouette.ts emits for a rendered candidate STL, so best-of-N can ask "does this
 * candidate's outline match the user's photo?" as a SOFT ranking nudge (never a hard gate — see
 * scoreCandidate). The spike (docs/REGISTRATION-SPIKE-RESULTS.md) proved the metric only works with
 * GrabCut-quality segmentation (AUC 0.757 vs Otsu's 0.583), so segmentation is load-bearing and we
 * use opencv.js GrabCut.
 *
 * COST / LOCAL-FIRST: opencv.js (~10MB WASM, Apache-2.0) is **only ever dynamic-import()'d** — the
 * FIRST time a reference photo actually needs a mask — and the module promise is memoized, so it
 * loads at most once per session and NEVER enters the base bundle (Vite code-splits a dynamic import
 * into its own chunk). Pure text→CAD never reaches this file. No CDN: the asset is bundled, honoring
 * the offline invariant.
 *
 * PARITY: refMaskOrientations() and bestRefIoU() are math-identical ports of bench/registration-spike
 * .mjs's `orientations`/`bestIoU` (guarded by bench/refSegment.selftest.mjs), and reuse
 * silhouette.ts's maskIoU/POSES — the candidate-side rasterizer (renderMasks) is NOT duplicated here;
 * the caller passes its renderMasks(stl) output straight into bestRefIoU.
 */
import { maskIoU, POSES } from './silhouette'

/** Mask side length — MUST match silhouette.ts SIZE so masks are IoU-comparable. */
const SIZE = 256
/** GrabCut iterations for the center-rect seed (the spike's setting). */
const GRABCUT_ITERS = 5
/** Confidence floor: reject a segmentation whose foreground fraction is implausible — the off-center
 *  / failed-seed case the spike flagged. Outside [MIN_FG, MAX_FG] → return null → shapeMatch stays
 *  undefined → total no-op. */
const MIN_FG = 0.03
const MAX_FG = 0.85

/* ---------------------------------------------------------------------------------------------- *
 * Orientation search — VERBATIM port of bench/registration-spike.mjs:28-43 (flat y*SIZE+x layout).
 * The photo's true viewpoint is unknown, so a photo mask is compared against an STL pose under all 8
 * dihedral orientations (4 rotations × {original, hflip}). Kept bit-identical to the bench so the
 * live tiebreak and the spike measure the SAME thing.
 * ---------------------------------------------------------------------------------------------- */
function hflip(m: Uint8Array): Uint8Array {
  const o = new Uint8Array(m.length)
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) o[y * SIZE + x] = m[y * SIZE + (SIZE - 1 - x)]
  return o
}
function rot90(m: Uint8Array): Uint8Array {
  // clockwise
  const o = new Uint8Array(m.length)
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) o[x * SIZE + (SIZE - 1 - y)] = m[y * SIZE + x]
  return o
}

/** The 8 dihedral orientations of a 256×256 mask (4 rotations × {original, hflip}). */
export function refMaskOrientations(m: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = []
  let cur = m
  for (let r = 0; r < 4; r++) {
    out.push(cur)
    out.push(hflip(cur))
    cur = rot90(cur)
  }
  return out // 8
}

/**
 * Best silhouette-IoU of a candidate's pose masks against a reference photo mask — VERBATIM port of
 * bench/registration-spike.mjs:46-55 `bestIoU`: max over 4 render POSES × 8 photo orientations.
 * @param candidateMasks renderMasks(stl) output (pose → 256×256 0/1 mask). {} → returns 0.
 * @param refMask the segmented photo mask (256×256 0/1). Falsy / wrong-length → returns 0.
 */
export function bestRefIoU(candidateMasks: Record<string, Uint8Array>, refMask: Uint8Array | null | undefined): number {
  if (!refMask) return 0
  const poseMasks = Object.keys(POSES)
    .map((p) => candidateMasks[p])
    .filter(Boolean)
  if (!poseMasks.length) return 0
  const oris = refMaskOrientations(refMask)
  let best = 0
  for (const pm of poseMasks) for (const o of oris) {
    const v = maskIoU(o, pm)
    if (v > best) best = v
  }
  return best
}

/* ---------------------------------------------------------------------------------------------- *
 * opencv.js — lazy, memoized loader. Imported ONLY from extractReferenceMask, so it never lands in
 * the base chunk and never loads on a text→CAD path.
 * ---------------------------------------------------------------------------------------------- */
// minimal structural type for the opencv handles we touch — avoids a hard dep on the heavy .d.ts in
// the base typecheck while staying type-safe at the call sites below.
interface CvMat {
  delete(): void
  data: Uint8Array
  rows: number
  cols: number
}
interface CvLike {
  matFromImageData(img: ImageData): CvMat
  Mat: { new (): CvMat; new (rows: number, cols: number, type: number): CvMat; zeros(rows: number, cols: number, type: number): CvMat }
  Rect: new (x: number, y: number, w: number, h: number) => unknown
  cvtColor(src: CvMat, dst: CvMat, code: number): void
  grabCut(img: CvMat, mask: CvMat, rect: unknown, bgd: CvMat, fgd: CvMat, iters: number, mode: number): void
  COLOR_RGBA2RGB: number
  CV_8UC1: number
  CV_64FC1: number
  GC_INIT_WITH_RECT: number
  GC_PR_FGD: number
  GC_FGD: number
}

let cvPromise: Promise<CvLike> | null = null
async function loadCv(): Promise<CvLike> {
  if (!cvPromise) {
    cvPromise = (async () => {
      const mod = (await import('@techstark/opencv-js')).default as unknown
      const m = mod as CvLike | Promise<CvLike> | (CvLike & { onRuntimeInitialized?: () => void })
      if (m instanceof Promise) return await m
      const cv = m as CvLike & { onRuntimeInitialized?: () => void }
      // already initialized? grabCut present means the runtime is up.
      if (typeof cv.grabCut === 'function') return cv
      await new Promise<void>((resolve) => {
        cv.onRuntimeInitialized = () => resolve()
      })
      return cv
    })().catch((e) => {
      cvPromise = null // let a later attempt retry rather than caching a hard failure
      throw e
    })
  }
  return cvPromise
}

/**
 * Decode a base64 image (no data: prefix) into a SIZE×SIZE ImageData, letterboxed onto a neutral
 * background so GrabCut's center-rect seed sees the object centered. Returns null off the browser
 * (no document/canvas) — segmentation is browser-only by design.
 */
async function decodeToImageData(base64: string, mediaType: string): Promise<ImageData | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null
  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => resolve(null)
    el.src = `data:${mediaType};base64,${base64}`
  })
  if (!img || !img.width || !img.height) return null
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  // letterbox: fit the longest edge into SIZE, center it.
  const s = Math.min(SIZE / img.width, SIZE / img.height)
  const w = img.width * s
  const h = img.height * s
  ctx.fillStyle = '#7f7f7f' // neutral gray surround (won't bias the GrabCut color models toward fg/bg)
  ctx.fillRect(0, 0, SIZE, SIZE)
  ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h)
  return ctx.getImageData(0, 0, SIZE, SIZE)
}

/* ---------------------------------------------------------------------------------------------- *
 * Per-project reference-mask cache — EPHEMERAL (never persisted, re-derivable). Keyed by project id;
 * each entry remembers the IMAGE IDENTITY it was segmented from, so swapping the reference photo
 * mid-project re-segments rather than ranking against a stale outline. Cleared on openProject.
 * ---------------------------------------------------------------------------------------------- */
type RefMaskEntry = { key: string; mask: Uint8Array | null; pending: boolean }
const refMaskCache = new Map<string, RefMaskEntry>()

/** Forget a project's cached reference mask (call on openProject — ephemeral, per-pid). */
export function clearRefMask(pid: string): void {
  refMaskCache.delete(pid)
}

/** The cached mask for a project, or null if none derived yet (or segmentation failed / is pending). */
export function getRefMask(pid: string): Uint8Array | null {
  return refMaskCache.get(pid)?.mask ?? null
}

/**
 * Ensure a reference mask is being derived for `pid` from the latest global photo, FIRE-AND-FORGET.
 * Segmentation latency NEVER blocks the caller (the SSE stream): if it finishes before the mask is
 * ready, best-of-N simply ranks with getRefMask(pid) === null (a no-op). Re-segments only when the
 * image identity changed (photo swap). A no-op when no global photo is present.
 * @param identity a stable id for the current global image (e.g. its base64 data) — re-keys the cache.
 */
export function ensureRefMask(pid: string, base64: string, mediaType: string, identity: string): void {
  const cur = refMaskCache.get(pid)
  if (cur && cur.key === identity && (cur.mask !== null || cur.pending)) return // fresh or in-flight
  refMaskCache.set(pid, { key: identity, mask: null, pending: true })
  void extractReferenceMask(base64, mediaType)
    .then((mask) => {
      // only commit if this project is still waiting on THIS identity (photo not swapped since)
      const entry = refMaskCache.get(pid)
      if (entry && entry.key === identity) refMaskCache.set(pid, { key: identity, mask, pending: false })
    })
    .catch(() => {
      const entry = refMaskCache.get(pid)
      if (entry && entry.key === identity) refMaskCache.set(pid, { key: identity, mask: null, pending: false })
    })
}

/**
 * Segment a reference photo into a 256×256 binary foreground mask via GrabCut (center-rect seed),
 * matching the spike's preprocessing. Returns null on ANY of: not in a browser, decode failure,
 * opencv load/throw, or an implausible foreground fraction (confidence floor) — every null path makes
 * the downstream shapeMatch undefined, i.e. a TOTAL no-op for ranking.
 *
 * The seam is deliberately narrow: a future learned matte (rembg/u2net via onnxruntime-web — the
 * spike's preferred segmenter) can drop in behind THIS signature with zero call-site change.
 */
export async function extractReferenceMask(base64: string, mediaType: string): Promise<Uint8Array | null> {
  const imageData = await decodeToImageData(base64, mediaType)
  if (!imageData) return null
  let cv: CvLike
  try {
    cv = await loadCv()
  } catch {
    return null // opencv failed to load → no-op
  }
  let src: CvMat | null = null
  let rgb: CvMat | null = null
  let mask: CvMat | null = null
  let bgd: CvMat | null = null
  let fgd: CvMat | null = null
  try {
    src = cv.matFromImageData(imageData)
    rgb = new cv.Mat()
    cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB) // grabCut wants 3-channel
    mask = new cv.Mat()
    bgd = cv.Mat.zeros(1, 65, cv.CV_64FC1)
    fgd = cv.Mat.zeros(1, 65, cv.CV_64FC1)
    // center rect: the inner ~70% region, exactly the spike's "center rect" seed.
    const inset = Math.round(SIZE * 0.15)
    const rect = new cv.Rect(inset, inset, SIZE - 2 * inset, SIZE - 2 * inset)
    cv.grabCut(rgb, mask, rect, bgd, fgd, GRABCUT_ITERS, cv.GC_INIT_WITH_RECT)
    // mask cells are GC_BGD/GC_PR_BGD (0/2) = background, GC_FGD/GC_PR_FGD (1/3) = foreground.
    const data = mask.data
    const out = new Uint8Array(SIZE * SIZE)
    let fg = 0
    for (let i = 0; i < out.length; i++) {
      const v = data[i]
      const on = v === cv.GC_FGD || v === cv.GC_PR_FGD ? 1 : 0
      out[i] = on
      fg += on
    }
    const frac = fg / out.length
    if (frac < MIN_FG || frac > MAX_FG) return null // confidence floor — implausible segmentation
    return out
  } catch {
    return null
  } finally {
    src?.delete()
    rgb?.delete()
    mask?.delete()
    bgd?.delete()
    fgd?.delete()
  }
}

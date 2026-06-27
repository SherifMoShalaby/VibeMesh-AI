/**
 * OC-6 — browser-callable VLM feature-fidelity oracle (live, ADVISORY).
 *
 * Captures the SAME canonical fixed poses the refine capture uses (capture.ts captureViews →
 * isometric/front/top/right) and POSTs them to the server's /api/vision-judge route, which runs the
 * bench's judgeVision per-feature present/faithful + asymmetryPreserved check (bench/judge.mjs
 * runVisionJudge). The verdict is purely ADVISORY: the caller (generationActions.ts) uses an "absent
 * named feature" to drive a bounded refine pass through the EXISTING refineDiscrepancy seam — it never
 * blocks a generation, the green verdict, or export.
 *
 * Gating lives at the CALL SITE: this is only invoked when the user opted in AND the engine is
 * vision-capable. Off → never called → the live path is byte-identical to today. The server gates again
 * on an Anthropic key being present. A failed/disabled call returns null → a total no-op.
 */
import { captureViews, CAPTURE_VIEW_NAMES } from './capture'
import type { ChatImage } from '../types'

/** One feature the judge checked. Mirrors bench/judge.mjs VISION_RUBRIC.features[]. */
export interface JudgedFeature {
  name: string
  present: boolean
  faithful: boolean
}

/** The vision-judge verdict (bench VISION_RUBRIC), or an error envelope. */
export interface VisionVerdict {
  features?: JudgedFeature[]
  asymmetryPreserved?: boolean
  overallFidelity?: number
  reason?: string
  error?: string
}

/** Optional reference photo the user attached (a ChatImage with role 'global'/undefined). */
export interface RefImageInput {
  data: string
  mediaType: string
}

/**
 * Run the live vision judge for the current viewport model. Captures the fixed poses, POSTs them to
 * /api/vision-judge, and returns the verdict — or null on ANY miss (no canvas / no views / non-OK
 * response / network error), so the caller degrades silently to its geometry-only signals.
 *
 * @param prompt the user request (so the judge knows what features to look for)
 * @param code optional OpenSCAD program for context
 * @param referenceImage optional attached reference photo
 * @param fetchImpl injectable fetch for tests (defaults to global fetch)
 */
export async function runLiveVisionJudge(
  { prompt, code, referenceImage }: { prompt: string; code?: string; referenceImage?: RefImageInput | null },
  fetchImpl: typeof fetch = fetch,
): Promise<VisionVerdict | null> {
  const views = captureViews(1024, 0.9)
  if (!views.length) return null
  // map the captured ChatImages to the server's renderImages shape (name them by the canonical poses).
  const renderImages = views.map((v: ChatImage, i: number) => ({
    pngBase64: v.data,
    mediaType: v.mediaType,
    name: CAPTURE_VIEW_NAMES[i] ?? `view${i}`,
  }))
  try {
    const res = await fetchImpl('/api/vision-judge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        code,
        referenceImage: referenceImage ? { base64: referenceImage.data, mediaType: referenceImage.mediaType } : undefined,
        renderImages,
      }),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { ok?: boolean; verdict?: VisionVerdict }
    return json?.verdict ?? null
  } catch {
    return null // network / parse failure → no-op (advisory)
  }
}

/**
 * The FIRST named feature the judge reports as ABSENT (present === false), or null when every feature
 * is present (or the verdict is unusable). Drives the targeted refine cite in generationActions.ts.
 * Pure + deterministic — unit-testable without the network. A feature that is present but un-faithful
 * is NOT treated as absent (the IoU/proportion signals already cover shape fidelity); only a MISSING
 * feature is a hard, specific defect worth a refine pass.
 */
export function firstAbsentFeature(verdict: VisionVerdict | null | undefined): string | null {
  if (!verdict || verdict.error || !Array.isArray(verdict.features)) return null
  const absent = verdict.features.find((f) => f && f.name && f.present === false)
  return absent?.name ?? null
}

/** The discrepancy string for an absent feature — cites the feature by name so the refine pass is
 *  specific (not a generic "make it better"). Pure. */
export function absentFeatureDiscrepancy(feature: string): string {
  return (
    `FEATURE-FIDELITY CHECK — an independent visual review of the rendered model finds the "${feature}" is MISSING ` +
    `(the model reads as a generic stand-in without it). Add the "${feature}" and shape it to match the request/reference. `
  )
}

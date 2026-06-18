import type { StlBBox } from './stl'
import type { DesignIntent } from '../types'

/**
 * Model-INDEPENDENT refine signal (P6). Compares the CURRENT render's measured bounding box
 * against the dimensions the model READ off the reference image (intent.statedDimensions), and
 * returns a deterministic discrepancy list in the structuralReport / buildManualFixPrompt style.
 *
 * This is the PRIMARY refine gate: a pure geometric check the model cannot rationalize away,
 * unlike feeding the render back to the same model to self-grade. WARN only — never hard-blocks.
 * Identical (dims, statedDimensions) input always yields identical output.
 *
 * Where a gold STL exists (the bench), voxel-IoU lives in bench/compare.mjs; in the live app
 * there is no gold for a user's image, so the stated-dimension comparison is the signal.
 */

type Axis = 'x' | 'y' | 'z' | 'max'

/** Map a stated-dimension feature name to the bbox axis/axes it constrains. */
function axesFor(feature: string): Axis[] {
  const f = (feature || '').toLowerCase()
  if (/\b(height|tall|high|thick|thickness)\b/.test(f)) return ['z']
  if (/\b(width|wide)\b/.test(f)) return ['x']
  if (/\b(depth|deep)\b/.test(f)) return ['y']
  if (/\b(dia|diameter|bore|radius|round|circle|circular)\b/.test(f)) return ['x', 'y'] // round → both planar axes
  return ['max'] // length/overall/unknown → compare to the longest axis
}

/** Convert a labeled value+unit to millimeters (the app's unit). */
function toMm(value: number, unit: string): number {
  if (/cm/i.test(unit)) return value * 10
  if (/\bm\b|meter/i.test(unit)) return value * 1000
  if (/in|inch|"/i.test(unit)) return value * 25.4
  return value // mm or unlabeled
}

/**
 * Discrepancies between the render and the reference's stated dimensions. Empty when there are
 * no stated dims or every axis is within tolerance (then the caller may fall back to the VLM
 * critic as an advisory tie-breaker). tolFrac/tolAbs: a deviation must exceed BOTH to flag.
 */
export function dimDiscrepancies(
  dims: StlBBox | null | undefined,
  statedDimensions: DesignIntent['statedDimensions'] | undefined,
  tolFrac = 0.1,
  tolAbs = 2,
): string[] {
  if (!dims || !statedDimensions?.length) return []
  const axisVal: Record<Axis, number> = { x: dims.x, y: dims.y, z: dims.z, max: Math.max(dims.x, dims.y, dims.z) }
  const issues: string[] = []
  const seen = new Set<string>()
  for (const d of statedDimensions) {
    if (!d || !Number.isFinite(d.value) || d.value <= 0) continue
    const target = toMm(d.value, d.unit || '')
    if (!Number.isFinite(target) || target <= 0) continue
    for (const ax of axesFor(d.feature)) {
      const got = axisVal[ax]
      const off = Math.abs(got - target)
      if (off > tolAbs && off / target > tolFrac) {
        const label = ax === 'max' ? 'its longest dimension' : `the ${ax.toUpperCase()} axis`
        const key = `${ax}:${target}`
        if (seen.has(key)) continue
        seen.add(key)
        issues.push(`${d.feature || 'A stated dimension'}: ${label} renders ${got.toFixed(1)}mm but the reference states ${target.toFixed(0)}mm — scale that axis toward ${target.toFixed(0)}mm.`)
      }
    }
  }
  return issues
}

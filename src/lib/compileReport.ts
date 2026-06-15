import type { ScadParameter } from '../types'

/**
 * Build the prompt that asks the AI to fix a render error. Shared by the manual
 * "Ask AI to fix" button and the automatic render-error repair in the store, so
 * both feed the model the same grounded hints. (Phase 5 — render-grounded feedback.)
 */
export function buildAutoFixPrompt(compileError: string): string {
  // The renderer is the Manifold backend — most "no geometry" failures are
  // non-manifold INPUT (coincident faces, zero-thickness walls, exact-touching
  // booleans), NOT hull(). Never tell the model to delete hull(): it is the
  // idiomatic way to make rounded forms and is fast here.
  const manifoldHint = /manifold|empty|CSG|normalization|not closed|self-intersect/i.test(compileError)
    ? '\n\nNote: the renderer needs manifold input. Make every boolean overlap by 0.01–0.1mm and extend each cutter ≥0.5mm past the surfaces it cuts; avoid coincident or zero-thickness faces and keep walls ≥1.2mm. Keep hull() and rounded primitives — do not remove them.'
    : ''
  const minkowskiHint = /minkowski/i.test(compileError)
    ? '\n\nNote: minkowski() forces a slow fallback backend and can fail on complex shapes — replace it with explicit rounded primitives (hull() of corner cylinders, or linear_extrude of an offset() 2D profile).'
    : ''
  const timeoutHint = /timed out/i.test(compileError)
    ? '\n\nNote: the model was too heavy to render in time. Reduce the heaviest constructs (any minkowski(), very large hull/boolean counts) while keeping the overall design.'
    : ''
  return `The OpenSCAD code failed to render. Fix it and return the corrected complete program.\n\nError:\n${compileError}${manifoldHint}${minkowskiHint}${timeoutHint}`
}

const MALE_RE = /(stud|peg|pin|dowel|tenon|tongue|boss|lug|male|shaft|axle)/i
const FEMALE_RE = /(socket|tube|bore|hole|mortise|groove|slot|female|cavity|sleeve)/i

/**
 * Cheap, no-recompile structural checks for the manual fix path — catches the most
 * common "looks fine but won't assemble" mistakes the renderer can't surface:
 * mating parts driven by two independent numbers that happen to be equal (zero
 * clearance → the parts fuse instead of joining).
 */
export function structuralReport(code: string, params: ScadParameter[]): { issues: string[] } {
  const issues: string[] = []

  const nums: Record<string, number> = {}
  for (const raw of code.split('\n')) {
    const line = raw.trim()
    if (/^(module|function)\b/.test(line)) break // stop at geometry
    const m = /^([A-Za-z_]\w*)\s*=\s*(-?\d+(?:\.\d+)?)\s*;/.exec(line)
    if (m && !m[1].startsWith('$')) nums[m[1]] = Number(m[2])
  }
  const males = Object.keys(nums).filter((k) => MALE_RE.test(k))
  const females = Object.keys(nums).filter((k) => FEMALE_RE.test(k))
  for (const a of males)
    for (const b of females)
      if (nums[a] === nums[b] && nums[a] > 0)
        issues.push(
          `Mating parts "${a}" and "${b}" are both ${nums[a]} mm — zero clearance, so they will fuse instead of joining. Drive the female size from the male plus a fit clearance parameter.`,
        )

  // a multi-part design should keep one module per piece behind the `part` enum
  const partParam = params.find((p) => p.name === 'part' && p.kind === 'enum')
  if (partParam && (partParam.options?.length ?? 0) < 2) {
    issues.push('The `part` enum has fewer than two pieces — a buildable kit needs separate selectable parts.')
  }

  return { issues }
}

/** Compose the manual fix prompt: render error (if any) plus structural findings. */
export function buildManualFixPrompt(
  compileError: string | null,
  code: string,
  params: ScadParameter[],
): string {
  const parts: string[] = []
  if (compileError) parts.push(buildAutoFixPrompt(compileError))
  const { issues } = structuralReport(code, params)
  if (issues.length) {
    parts.push(
      `${compileError ? 'Also fix' : 'Fix'} these assembly problems, then return the corrected complete program:\n` +
        issues.map((i) => `- ${i}`).join('\n'),
    )
  }
  return parts.join('\n\n')
}

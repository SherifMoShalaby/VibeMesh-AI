import type { ScadParameter } from '../types'

/**
 * Build the prompt that asks the AI to fix a render error. Shared by the manual
 * "Ask AI to fix" button and the automatic render-error repair in the store, so
 * both feed the model the same grounded hints. (Phase 5 — render-grounded feedback.)
 */
export function buildAutoFixPrompt(compileError: string): string {
  const hullHint = /CGAL|applyHull|hull/i.test(compileError)
    ? '\n\nNote: this renderer uses an older CGAL build that is fragile with hull(). Rewrite the model WITHOUT hull() — use explicit primitives instead (cylinders at corners, linear_extrude of offset() 2D profiles, rotate_extrude).'
    : ''
  const timeoutHint = /timed out/i.test(compileError)
    ? '\n\nNote: the model is too computationally heavy. Reduce boolean count (fewer flutes/ribs, simpler cutters) while keeping the overall design.'
    : ''
  return `The OpenSCAD code failed to render. Fix it and return the corrected complete program.\n\nError:\n${compileError}${hullHint}${timeoutHint}`
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

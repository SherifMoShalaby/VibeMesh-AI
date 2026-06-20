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
// shared-concept families (P7): a composed multi-mechanism program should expose ONE parameter
// per concept, not one per mechanism. Used to WARN on duplicate clearance/wall params.
const CLEARANCE_RE = /(clear|fit|tol|gap)/i
const WALL_RE = /(wall|thick)/i

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

  // composed kits should expose ONE parameter per shared concept (P7) — flag duplicates
  const keys = Object.keys(nums)
  const dupConcept = (re: RegExp, label: string) => {
    const matches = keys.filter((k) => re.test(k))
    if (matches.length >= 2) issues.push(`Multiple ${label} parameters (${matches.join(', ')}) — merge into one shared parameter so the mechanisms stay consistent.`)
  }
  dupConcept(CLEARANCE_RE, 'clearance')
  dupConcept(WALL_RE, 'wall')

  // composed-kit scatter heuristic (P7): a multi-piece part enum with no `explode` knob tends to
  // render its pieces flung apart in the all-view instead of mated on a shared datum.
  if (partParam && (partParam.options?.length ?? 0) >= 3 && !/\bexplode\b/.test(code)) {
    issues.push('Pieces may render scattered in the all-view — mate them on a shared datum and expose an `explode` knob defaulting to 0 (assembled).')
  }

  // No global $fn: the quality presets (Draft/Standard/Fine/Ultra) own curve resolution via
  // root-scope `-D '$fn=0' -D $fa=… -D $fs=…` overrides. A top-level `$fn = <n>;` in the generated
  // code freezes the facet count and defeats those presets. A per-call $fn (hex socket) and a
  // module-scoped $fn live inside parens/braces, so only a DEPTH-0 statement is flagged; `$fn = 0;`
  // is the preset's own auto value and is harmless, so only a positive resolution trips this.
  let depth = 0
  for (const raw of code.split('\n')) {
    const line = raw.replace(/\/\/.*$/, '').trim()
    if (depth === 0) {
      const g = /^\$fn\s*=\s*(\d+(?:\.\d+)?)\s*;/.exec(line)
      if (g && Number(g[1]) > 0) {
        issues.push(
          `Sets a global \`$fn = ${g[1]}\` at the top level — this freezes the facet count and defeats the quality presets (which drive curve resolution via $fa/$fs). Remove the global $fn; keep per-call $fn only on discrete-count geometry (e.g. a hex socket) or a deliberate low-poly accent.`,
        )
        break
      }
    }
    for (const ch of line) {
      if (ch === '{') depth++
      else if (ch === '}') depth = Math.max(0, depth - 1)
    }
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

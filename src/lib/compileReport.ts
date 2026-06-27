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
  // A figurative trace that won't compile (a leftover geometry-to-variable assignment, a
  // garbled/self-intersecting polygon, a broken extrude) should NOT be patched in place —
  // steer it to the stylized-relief floor, which always compiles. (OC-8)
  const figurativeHint = /parser error|syntax error|assignment|polygon|linear_extrude|rotate_extrude|self-intersect|not (a |an )?(geometr|object)|expected/i.test(compileError)
    ? '\n\nNote: if this is a figurative subject (a chess piece, animal, or figure) and the trace will not compile, do NOT keep patching the broken geometry — fall back to the stylized-relief floor: a single linear_extrude of a clean silhouette polygon raised on a flat base, with eye/panel-line recesses differenced in. A compiling relief beats a non-compiling sculpt. Remove any leftover/invalid code (e.g. assigning geometry to a variable).'
    : ''
  return `The OpenSCAD code failed to render. Fix it and return the corrected complete program.\n\nError:\n${compileError}${manifoldHint}${minkowskiHint}${timeoutHint}${figurativeHint}`
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

  // OC-5 — dead-module / phantom-param static check. The model ships unreferenced modules
  // (t7-knight's never-called `module head()` carrying invalid leftover code) and phantom params
  // (a declared `divider` bool that shifts an offset but builds no wall). Catch both statically so
  // they feed the advisory skillNote + the bounded auto-fix.
  const stripped = code.split('\n').map((l) => l.replace(/\/\/.*$/, '')) // drop line comments; keep code
  const codeNoComments = stripped.join('\n')

  // Dead module: a `module NAME(` whose name is never CALLED anywhere (only its own declaration).
  // A module called by another module is genuinely used, so we count call sites across the WHOLE
  // program, not just below the module region — that never false-positives a called helper.
  const moduleDecl = /\bmodule\s+([A-Za-z_]\w*)\s*\(/g
  let md: RegExpExecArray | null
  const seen = new Set<string>()
  while ((md = moduleDecl.exec(codeNoComments))) {
    const name = md[1]
    if (seen.has(name)) continue
    seen.add(name)
    // total `name(` occurrences minus the `module name(` declarations = real call sites. A module
    // called only from inside another module still counts (so a genuine helper is never flagged).
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const total = (codeNoComments.match(new RegExp(`\\b${esc}\\s*\\(`, 'g')) || []).length
    const decls = (codeNoComments.match(new RegExp(`\\bmodule\\s+${esc}\\s*\\(`, 'g')) || []).length
    if (total - decls === 0)
      issues.push(
        `Module \`${name}()\` is declared but never called — remove it or call it. An unreferenced module (often carrying leftover/invalid code) ships dead weight and can hide a compile error.`,
      )
  }

  // Phantom param: a declared Customizer parameter referenced NOWHERE except its own assignment.
  // A param consumed only by a derived value (which then drives geometry) still counts as used, so
  // we look for any reference beyond the single `name = ...;` declaration line — never a brittle
  // "below the module region" boundary. Exempt `_`-prefixed hidden probe knobs, `$`-vars, and `part`
  // (the multi-part dispatch consumes it). Use the parsed params for the authoritative name list.
  for (const p of params) {
    if (p.name.startsWith('_') || p.name.startsWith('$') || p.name === 'part') continue
    const esc = p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const refRe = new RegExp(`\\b${esc}\\b`, 'g')
    const declRe = new RegExp(`^\\s*${esc}\\s*=`)
    let refs = 0
    for (const l of stripped) refs += (l.match(refRe) || []).length
    // subtract the lone occurrence on its own assignment line (LHS)
    const isDecl = stripped.some((l) => declRe.test(l))
    if (refs - (isDecl ? 1 : 0) <= 0)
      issues.push(
        `Parameter \`${p.name}\` is declared but never used — every declared parameter must affect the geometry (or be removed).`,
      )
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

/**
 * Buildability rubric — deterministic "is this a connectable KIT?" score.
 *
 * Voxel-IoU (compare.mjs) measures shape, but it literally cannot tell a
 * car-shaped blob from a real kit: their assembled silhouettes match. This
 * rubric scores the structural properties a buildable kit must have, by
 * recompiling each piece of the `part` enum and inspecting the geometry.
 *
 * Run ONLY on tasks tagged `kit: true`; single-part tasks are unaffected.
 * Pure heuristics by design — the IoU score and optional LLM-judge backstop it.
 */

/** Parse the Customizer `part` enum: `part = "all"; // [all, base, lid]`.
 *  Mirrors src/lib/params.ts: scan the parameter block, stop at first module/function. */
export function extractPartEnum(code) {
  for (const raw of code.split('\n')) {
    const line = raw.trim()
    if (/^(module|function)\b/.test(line)) break
    const m = /^part\s*=\s*"([^"]*)"\s*;\s*\/\/\s*\[([^\]]+)\]/.exec(line)
    if (m) {
      const options = m[2].split(',').map((s) => s.trim()).filter(Boolean)
      return { found: true, default: m[1], options, pieces: options.filter((o) => o !== 'all') }
    }
  }
  return { found: false, default: null, options: [], pieces: [] }
}

const CONNECTOR_RE = /\b(anti[_-]?stud|stud|peg|socket|dovetail|snap|clip|mortise|tenon|tongue|groove|boss|lug|bore|tube|dowel|alignment|register|interlock)\b/i
// matches a parameter whose NAME contains a clearance token, incl. suffixed
// names like `stud_fit` / `spin_fit` / `wheel_gap` (\bfit\b would miss those)
const CLEARANCE_RE = /\b\w*(?:clearance|tolerance|fit|gap|slop|kerf|play)\w*\s*=/i

/** numeric top-level params (name = number) from the parameter block */
function numericParams(code) {
  const out = {}
  for (const raw of code.split('\n')) {
    const line = raw.trim()
    if (/^(module|function)\b/.test(line)) break
    const m = /^([A-Za-z_]\w*)\s*=\s*(-?\d+(?:\.\d+)?)\s*;/.exec(line)
    if (m && !m[1].startsWith('$')) out[m[1]] = Number(m[2])
  }
  return out
}

const MALE_RE = /(stud|peg|pin|dowel|tenon|tongue|boss|lug|male|shaft|axle)/i
const FEMALE_RE = /(socket|tube|bore|hole|mortise|groove|slot|female|cavity|sleeve)/i

/** flag mating pairs whose nominal sizes are EXACTLY equal (zero clearance → parts fuse) */
function zeroClearancePairs(code) {
  const p = numericParams(code)
  const males = Object.keys(p).filter((k) => MALE_RE.test(k))
  const females = Object.keys(p).filter((k) => FEMALE_RE.test(k))
  const flags = []
  for (const a of males)
    for (const b of females)
      if (p[a] === p[b] && p[a] > 0) flags.push(`${a}=${b}=${p[a]} (zero clearance)`)
  return flags
}

/**
 * Score a kit. `pieces` = [{ piece, ok, size:[x,y,z], minZ }] from recompiling each
 * part-enum option with -D part="<piece>". `bed` = [x,y,z] mm.
 * Returns { score (0..1), breakdown, notes }.
 */
export function scoreBuildability(code, partEnum, pieces, bed) {
  const notes = []
  const breakdown = {}

  // partsPresent — hard gate: a `part` enum with >=2 buildable pieces
  const partsPresent = partEnum.found && partEnum.pieces.length >= 2
  breakdown.partsPresent = partsPresent ? 1 : 0
  if (!partsPresent) {
    notes.push(
      partEnum.found
        ? `only ${partEnum.pieces.length} piece(s) in part enum — not a kit`
        : 'NO `part` enum — returned a single object, not a buildable kit',
    )
    return { score: 0, breakdown, notes, hardFail: true }
  }

  const n = pieces.length || 1
  // allPartsRender
  const rendered = pieces.filter((p) => p.ok).length
  breakdown.allPartsRender = round(rendered / n)
  if (rendered < n) notes.push(`${n - rendered}/${n} pieces failed to render: ${pieces.filter((p) => !p.ok).map((p) => p.piece).join(', ')}`)

  // printsFlat — each piece sits on z=0
  const flat = pieces.filter((p) => p.ok && Math.abs(p.minZ ?? 9) < 0.5).length
  breakdown.printsFlat = round(flat / n)
  const notFlat = pieces.filter((p) => p.ok && Math.abs(p.minZ ?? 9) >= 0.5)
  if (notFlat.length) notes.push(`not flat on bed: ${notFlat.map((p) => `${p.piece}(minZ=${p.minZ})`).join(', ')}`)

  // fitsBed — each piece within the build volume
  const fits = pieces.filter((p) => p.ok && p.size && p.size[0] <= bed[0] && p.size[1] <= bed[1] && p.size[2] <= bed[2]).length
  breakdown.fitsBed = round(fits / n)
  const tooBig = pieces.filter((p) => p.ok && p.size && (p.size[0] > bed[0] || p.size[1] > bed[1] || p.size[2] > bed[2]))
  if (tooBig.length) notes.push(`exceeds bed ${bed.join('×')}: ${tooBig.map((p) => `${p.piece}(${p.size.join('×')})`).join(', ')}`)

  // connectorsPresent — mating geometry AND a clearance/fit parameter
  const hasConnector = CONNECTOR_RE.test(code)
  const hasClearance = CLEARANCE_RE.test(code)
  breakdown.connectorsPresent = hasConnector && hasClearance ? 1 : hasConnector ? 0.5 : 0
  if (!hasConnector) notes.push('no connector geometry detected (stud/peg/socket/snap/…) — parts may not join')
  else if (!hasClearance) notes.push('connectors present but no clearance/fit parameter — fit may be wrong')

  // clearanceSanity — penalty, not a gate
  const zero = zeroClearancePairs(code)
  breakdown.clearanceSanity = zero.length === 0 ? 1 : 0
  if (zero.length) notes.push(`mating parts with ZERO clearance (will fuse): ${zero.join('; ')}`)

  // composite: average the four core checks, minus a small clearance-sanity penalty
  const core = [breakdown.allPartsRender, breakdown.printsFlat, breakdown.fitsBed, breakdown.connectorsPresent]
  let score = core.reduce((a, b) => a + b, 0) / core.length
  if (zero.length) score = Math.max(0, score - 0.1)
  return { score: round(score), breakdown, notes, hardFail: false }
}

const round = (n) => Math.round(n * 100) / 100

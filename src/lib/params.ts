import type { DesignIntent, ParamValue, ParamValues, ScadParameter } from '../types'

// the value matches quoted strings (with escapes) OR non-semicolon/non-quote runs, so a `;` INSIDE
// a string default (e.g. `label = "a;b";`) no longer ends the value early — which used to fail the
// match and silently drop that param AND every param after it.
const ASSIGN_RE = /^\s*([A-Za-z_$][\w$]*)\s*=\s*((?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^;"'])+);\s*(?:\/\/\s*(.*))?$/
const GROUP_RE = /^\s*\/\*\s*\[([^\]]+)\]\s*\*\/\s*$/
const COMMENT_RE = /^\s*\/\/\s?(.*)$/

/**
 * Parse OpenSCAD Customizer-style parameters from the top of a program.
 * Scanning stops at the first line that is not a comment, blank line,
 * group header, or simple assignment — i.e. where the geometry begins.
 */
export function parseParameters(code: string): ScadParameter[] {
  const params: ScadParameter[] = []
  let group = 'Parameters'
  let pendingComment: string | undefined

  for (const line of code.split('\n')) {
    if (!line.trim()) {
      pendingComment = undefined
      continue
    }
    const groupMatch = GROUP_RE.exec(line)
    if (groupMatch) {
      group = groupMatch[1].trim()
      if (group.toLowerCase() === 'hidden') break
      pendingComment = undefined
      continue
    }
    const commentMatch = COMMENT_RE.exec(line)
    if (commentMatch) {
      pendingComment = commentMatch[1].trim()
      continue
    }
    const assign = ASSIGN_RE.exec(line)
    if (!assign) break // geometry / modules begin
    const [, name, rawValue, annotation] = assign
    if (name === '$fn' || name === '$fa' || name === '$fs') {
      pendingComment = undefined
      continue
    }
    const param = buildParam(name, rawValue.trim(), annotation?.trim(), group, pendingComment)
    if (param) params.push(param)
    pendingComment = undefined
  }
  return params
}

function buildParam(
  name: string,
  rawValue: string,
  annotation: string | undefined,
  group: string,
  description: string | undefined,
): ScadParameter | null {
  // never let a reserved identifier become a param name (prototype-pollution guard)
  if (name === '__proto__' || name === 'constructor' || name === 'prototype') return null

  // `_`-prefixed names are hidden probe/debug knobs (e.g. `_debug` for the interference
  // eval) — never surface them as sliders; normal renders keep the code's written default.
  if (name.startsWith('_')) return null

  // booleans
  if (rawValue === 'true' || rawValue === 'false') {
    return { name, kind: 'bool', group, description, defaultValue: rawValue === 'true' }
  }

  // strings
  const strMatch = /^"(.*)"$/.exec(rawValue)
  if (strMatch) {
    const options = parseOptions(annotation)
    if (options && options.length > 0) {
      return { name, kind: 'enum', group, description, defaultValue: strMatch[1], options: options.map(String) }
    }
    return { name, kind: 'string', group, description, defaultValue: strMatch[1] }
  }

  // numbers
  const num = Number(rawValue)
  if (!Number.isFinite(num)) return null // vectors / expressions — not editable in UI

  const range = parseRange(annotation)
  if (range) {
    return { name, kind: 'slider', group, description, defaultValue: num, ...range }
  }
  const options = parseOptions(annotation)
  if (options && options.every((o) => typeof o === 'number')) {
    return { name, kind: 'enum', group, description, defaultValue: num, options }
  }
  // bare number: derive a sensible slider range
  const span = Math.max(Math.abs(num) * 2, 10)
  const min = num < 0 ? -span : 0
  const max = Math.max(span, num + 1)
  const step = Number.isInteger(num) ? 1 : 0.1
  return { name, kind: 'number', group, description, defaultValue: num, min, max, step }
}

/** "[min:max]" or "[min:step:max]" */
function parseRange(annotation?: string): { min: number; max: number; step: number } | null {
  if (!annotation) return null
  const m = /^\[\s*(-?[\d.]+)\s*:\s*(-?[\d.]+)\s*(?::\s*(-?[\d.]+)\s*)?\]$/.exec(annotation)
  if (!m) return null
  const a = Number(m[1])
  const b = Number(m[2])
  const c = m[3] !== undefined ? Number(m[3]) : undefined
  let min: number, max: number, step: number
  if (c !== undefined) {
    min = a
    step = b
    max = c
  } else {
    min = a
    max = b
    step = Number.isInteger(a) && Number.isInteger(b) ? 1 : 0.1
  }
  // sanitize malformed AI-authored ranges so sliders never break
  if (min > max) [min, max] = [max, min]
  if (!(step > 0)) step = Number.isInteger(min) && Number.isInteger(max) ? 1 : 0.1
  return { min, max, step }
}

/** "[a, b, c]" — enum options (no colon) */
function parseOptions(annotation?: string): Array<number | string> | null {
  if (!annotation) return null
  if (annotation.includes(':')) return null
  const m = /^\[(.+)\]$/.exec(annotation)
  if (!m) return null
  return m[1].split(',').map((part) => {
    const trimmed = part.trim()
    const num = Number(trimmed)
    return Number.isFinite(num) && trimmed !== '' ? num : trimmed
  })
}

/** Build -D override args for values that differ from the parameter defaults. */
export function buildDefines(params: ScadParameter[], values: ParamValues): string[] {
  const args: string[] = []
  for (const p of params) {
    const value = values[p.name]
    if (value === undefined || value === p.defaultValue) continue
    if (typeof value === 'number' && !Number.isFinite(value)) continue // never emit -D x=NaN/Infinity
    args.push('-D', `${p.name}=${scadLiteral(value)}`)
  }
  return args
}

function scadLiteral(value: ParamValue): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return String(value)
  // escape backslashes BEFORE quotes — otherwise a value ending in `\` would escape the closing
  // quote and produce a broken (uncompilable) SCAD string.
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** Rewrite parameter assignment lines so exported .scad reflects current values. */
export function applyValuesToCode(code: string, params: ScadParameter[], values: ParamValues): string {
  let out = code
  for (const p of params) {
    const value = values[p.name]
    if (value === undefined || value === p.defaultValue) continue
    // same string-aware value match as ASSIGN_RE so a string default containing `;` is replaced whole
    const re = new RegExp(`^(\\s*${escapeRe(p.name)}\\s*=\\s*)(?:"(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|[^;"'])+(;)`, 'm')
    out = out.replace(re, `$1${scadLiteral(value)}$2`)
  }
  return out
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Extract the single ```scad fenced block from an assistant reply.
 *  `blockCount` lets callers enforce the "exactly ONE block" contract — on 0 or
 *  >1 blocks the longest is still returned (graceful fallback), but the count
 *  flags a contract violation worth a retry. */
export function extractScadBlock(text: string): { code: string | null; prose: string; blockCount: number } {
  const re = /```(?:scad|openscad)?\s*\n([\s\S]*?)```/g
  let code: string | null = null
  let best = 0
  for (const m of text.matchAll(re)) {
    if (m[1].length > best) {
      best = m[1].length
      code = m[1].trim()
    }
  }
  // Count only scad/openscad-TAGGED fences toward the "exactly one block" contract.
  // Code extraction stays lenient (an untagged program is still adopted), but an
  // untagged illustrative fence — a print-settings list, a dimension table — must
  // NOT count as a second block and trip a spurious format retry.
  const blockCount = (text.match(/```(?:scad|openscad)\s*\n/g) || []).length
  const prose = text.replace(re, '').replace(/\n{3,}/g, '\n\n').trim()
  return { code, prose, blockCount }
}

// the model's advisory `INTENT: {json}` PLAN line — a single non-fenced line of plain JSON
const INTENT_RE_SRC = '^[ \\t]*INTENT:\\s*(\\{.*\\})[ \\t]*$'

/** Parse the advisory `INTENT:` line from a reply's PROSE (run AFTER extractScadBlock, so it
 *  never sees the code). Tolerant: JSON-parses in try/catch, validates enums against their
 *  unions and drops unknown values, never throws. Returns null on absence/garble. The last
 *  INTENT line wins (a refine reply may echo a prior one). Use stripIntentLine() for display. */
export function extractIntent(prose: string): DesignIntent | null {
  const re = new RegExp(INTENT_RE_SRC, 'gm')
  let match: RegExpExecArray | null = null
  for (let m = re.exec(prose); m; m = re.exec(prose)) match = m
  if (!match) return null
  let raw: unknown
  try {
    raw = JSON.parse(match[1])
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined =>
    typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : undefined
  const strings = (v: unknown): string[] | undefined =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : undefined

  const form = oneOf(o.form, ['single', 'kit', 'assembly'] as const)
  if (!form) return null // form is the one required field — without it there is no intent
  const intent: DesignIntent = { form }
  if (typeof o.archetype === 'string' && o.archetype.trim()) intent.archetype = o.archetype.trim()
  const fv = oneOf(o.facetVerdict, ['faceted', 'machined', 'functional'] as const)
  if (fv) intent.facetVerdict = fv
  const sig = strings(o.signatureFeatures)
  if (sig?.length) intent.signatureFeatures = sig
  const tags = strings(o.domainTags)
  if (tags?.length) intent.domainTags = tags.map((t) => t.toLowerCase())
  const amb = oneOf(o.ambiguityScore, ['low', 'med', 'high'] as const)
  if (amb) intent.ambiguityScore = amb
  const ass = strings(o.assumptions)
  if (ass?.length) intent.assumptions = ass
  // vision fields (P6) — present only on image-grounded requests
  const src = oneOf(o.sourceType, ['photo', 'drawing', 'orthographic', 'multiview', 'multiobject'] as const)
  if (src) intent.sourceType = src
  const flags = strings(o.asymmetryFlags)
  if (flags?.length) intent.asymmetryFlags = flags
  const conf = oneOf(o.confidence, ['low', 'med', 'high'] as const)
  if (conf) intent.confidence = conf
  if (Array.isArray(o.statedDimensions)) {
    const dims = o.statedDimensions
      .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object')
      .map((d) => ({ value: Number(d.value), unit: String(d.unit ?? ''), feature: String(d.feature ?? '') }))
      .filter((d) => Number.isFinite(d.value))
    if (dims.length) intent.statedDimensions = dims
  }
  return intent
}

/** Remove the advisory INTENT line from prose for display — it is metadata, not for the user. */
export function stripIntentLine(prose: string): string {
  return prose.replace(new RegExp(INTENT_RE_SRC, 'gm'), '').replace(/\n{3,}/g, '\n\n').trim()
}

/** Lowercase word tokens of a label — splits snake_case, kebab, spaces, AND camelCase.
 *  e.g. "kingHead" → ["king","head"], "king_total_h" → ["king","total","h"], "KING HEAD" → ["king","head"] */
export function tokenizeLabel(s: string): string[] {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** Filter params to those relevant to `piece`: a param is kept if its searchable text names no
 *  piece (shared/global) OR names the selected `piece`. A param that names only OTHER pieces is
 *  hidden. `pieceNames` is the part-enum options minus 'all'. */
export function paramsForPiece(
  params: ScadParameter[],
  piece: string,
  pieceNames: string[],
): ScadParameter[] {
  const names = pieceNames.map((p) => p.toLowerCase())
  const target = piece.toLowerCase()
  return params.filter((p) => {
    const tokens = new Set(tokenizeLabel(`${p.group} ${p.name} ${p.description ?? ''}`))
    const named = names.filter((n) => tokens.has(n))
    // Keep when: no piece name mentioned (shared/global) OR the target piece is named
    return named.length === 0 || named.includes(target)
  })
}

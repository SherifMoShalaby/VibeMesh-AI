import type { ParamValue, ParamValues, ScadParameter } from '../types'

const ASSIGN_RE = /^\s*([A-Za-z_$][\w$]*)\s*=\s*([^;]+);\s*(?:\/\/\s*(.*))?$/
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
  return `"${String(value).replace(/"/g, '\\"')}"`
}

/** Rewrite parameter assignment lines so exported .scad reflects current values. */
export function applyValuesToCode(code: string, params: ScadParameter[], values: ParamValues): string {
  let out = code
  for (const p of params) {
    const value = values[p.name]
    if (value === undefined || value === p.defaultValue) continue
    const re = new RegExp(`^(\\s*${escapeRe(p.name)}\\s*=\\s*)[^;]+(;)`, 'm')
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

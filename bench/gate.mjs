/**
 * Bench ratchet — diff the latest bench run against a committed baseline and
 * FAIL on regression. Turns the bench from a thermometer into a gate, so every
 * prompt/geometry change in the result-quality roadmap is measurable and safe.
 *
 *   node bench/run.mjs                  (re)generate bench/results/results.json
 *   node bench/gate.mjs                 compare results vs baseline; exit 1 on regression
 *   node bench/gate.mjs --update-baseline   write bench/baseline.json from current results
 *
 * baseline.json lives at the top level (bench/results/ is gitignored, so the
 * baseline could not live there). It stores ONLY the normalized gated metrics,
 * so it is small, readable, and diff-friendly in review.
 *
 * Tolerances are deliberately wide on the noisy metrics (IoU): the run hits a
 * live, non-deterministic API, so until repeat-sampling lands (Phase 2) a single
 * run is one sample. `compiled` and `overSplit` are zero-tolerance because they
 * are categorical correctness, not measurement noise.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const RESULTS_PATH = path.join(ROOT, 'results', 'results.json')
const BASELINE_PATH = path.join(ROOT, 'baseline.json')

const round2 = (n) => Math.round(n * 100) / 100

/** Placement score fallback for older baselines/results that predate the field. */
function placementFromMinZ(minZ) {
  if (typeof minZ !== 'number' || !Number.isFinite(minZ)) return null
  const off = Math.abs(minZ)
  if (off <= 0.5) return 1
  if (off <= 2) return 0.5
  return 0
}

/** Normalize a raw results.json row to the gated metric set. */
function metricsOf(row) {
  const isKit = !!row.buildability
  return {
    task: row.task,
    compiled: row.error ? false : row.compiled === true,
    errored: Boolean(row.error),
    dimScore: typeof row.dimScore === 'number' ? row.dimScore : null,
    iou: row.gold && !row.gold.error && typeof row.gold.iou === 'number' ? row.gold.iou : null,
    placementScore: isKit
      ? null
      : typeof row.placementScore === 'number'
        ? row.placementScore
        : placementFromMinZ(row.minZ),
    buildabilityScore: row.buildability ? row.buildability.score : null,
    buildabilityHardFail: row.buildability ? Boolean(row.buildability.hardFail) : null,
    overSplit: row.overSplit === true,
    // fidelity / functional metrics (Wave 2) — present only on the tasks that ask for them
    asymmetryScore: typeof row.asymmetryScore === 'number' ? row.asymmetryScore : null,
    moduleDistinctness: typeof row.moduleDistinctness === 'number' ? row.moduleDistinctness : null,
    assembledScore: typeof row.assembledScore === 'number' ? row.assembledScore : null,
    // geometric-consistency (interference probe): 1 = no cutter slices a protected feature.
    // Present only on parts emitting the `_debug` contract. The committed kit exemplar is guarded
    // separately + zero-tolerance by bench/interference.selftest.mjs (runs ahead of this gate).
    interferenceScore: typeof row.interferenceScore === 'number' ? row.interferenceScore : null,
    // advisory LLM-judge — displayed for visibility, never gated (nondeterministic)
    judgeScore: row.judge && !row.judge.error && typeof row.judge.score === 'number' ? row.judge.score : null,
  }
}

// numeric metrics: higher is better; a drop beyond `tol` fails the gate.
const NUMERIC = [
  { key: 'dimScore', label: 'dim', tol: 0.1 },
  { key: 'iou', label: 'IoU', tol: 0.03 }, // wide: live-API non-determinism (tighten once repeat-sampling lands)
  { key: 'placementScore', label: 'place', tol: 0.1 },
  { key: 'buildabilityScore', label: 'kit', tol: 0.05 },
  { key: 'asymmetryScore', label: 'asym', tol: 0.15 }, // geometric self-similarity is noisy → wide tol
  { key: 'moduleDistinctness', label: 'mods', tol: 1 }, // distinct-module count
  { key: 'assembledScore', label: 'asm', tol: 0.25 }, // stepped 0/0.5/1 → tolerate one step
  { key: 'interferenceScore', label: 'intf', tol: 0.1 }, // cutter-vs-structure overlap on generated parts (advisory until baselined)
]

function readJson(p, what) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch (err) {
    console.error(`[gate] cannot read ${what} (${p}): ${err.message}`)
    process.exit(2)
  }
}

/* ── --update-baseline: write the normalized baseline from the current run ── */

if (process.argv.includes('--update-baseline')) {
  const current = readJson(RESULTS_PATH, 'results')
  const baseline = current.map((block) => ({
    engine: block.engine,
    results: block.results.map(metricsOf),
  }))
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n')
  const rows = baseline.reduce((n, b) => n + b.results.length, 0)
  console.log(`[gate] wrote bench/baseline.json — ${baseline.length} engine(s), ${rows} task row(s).`)
  console.log('[gate] commit baseline.json so future runs are gated against it.')
  process.exit(0)
}

/* ── compare current run against the baseline ── */

if (!fs.existsSync(BASELINE_PATH)) {
  console.error('[gate] no bench/baseline.json yet — create one with: node bench/gate.mjs --update-baseline')
  process.exit(2)
}

const baseline = readJson(BASELINE_PATH, 'baseline') // already-normalized metric rows
const current = readJson(RESULTS_PATH, 'results')

const baseIndex = new Map(baseline.map((b) => [b.engine, new Map(b.results.map((r) => [r.task, r]))]))
const currIndex = new Map(current.map((b) => [b.engine, new Map(b.results.map((r) => [r.task, metricsOf(r)]))]))

const regressions = []
const improvements = []
const tableRows = []

const arrow = (delta, tol) => (delta > tol ? '▲' : delta < -tol ? '▼' : '=')
const cell = (b, c, tol) => {
  if (typeof c !== 'number' && typeof b !== 'number') return '—'
  if (typeof c !== 'number') return `${b}→·`
  if (typeof b !== 'number') return `·→${c}`
  if (b === c) return `${c}`
  return `${b}→${c}${arrow(round2(c - b), tol)}`
}

for (const [engine, baseTasks] of baseIndex) {
  const currTasks = currIndex.get(engine)
  for (const [task, bm] of baseTasks) {
    const id = `${engine} ▸ ${task}`
    const cm = currTasks?.get(task)
    if (!cm) {
      regressions.push(`${id}: MISSING from current run (was in baseline)`)
      tableRows.push([id, 'MISSING', '', '', '', '', ''])
      continue
    }

    // categorical, zero-tolerance regressions
    if (bm.compiled && !cm.compiled) regressions.push(`${id}: compiled ✓→✗`)
    if (!bm.overSplit && cm.overSplit) regressions.push(`${id}: NEW over-split (non-kit produced a multi-piece enum)`)
    if (bm.buildabilityHardFail === false && cm.buildabilityHardFail === true) regressions.push(`${id}: kit HARD FAIL (was buildable)`)

    // numeric metrics
    for (const { key, label, tol } of NUMERIC) {
      const b = bm[key]
      const c = cm[key]
      if (typeof b !== 'number' || typeof c !== 'number') continue
      const delta = round2(c - b)
      if (delta < -tol) regressions.push(`${id}: ${label} ${b}→${c} (${delta}, tol ${tol})`)
      else if (delta > tol) improvements.push(`${id}: ${label} ${b}→${c} (+${delta})`)
    }

    tableRows.push([
      id,
      bm.compiled === cm.compiled ? (cm.compiled ? '✓' : '✗') : `${bm.compiled ? '✓' : '✗'}→${cm.compiled ? '✓' : '✗'}`,
      cell(bm.dimScore, cm.dimScore, 0.1),
      cell(bm.iou, cm.iou, 0.03),
      cell(bm.placementScore, cm.placementScore, 0.1),
      cell(bm.buildabilityScore, cm.buildabilityScore, 0.05),
      cell(bm.judgeScore, cm.judgeScore, Infinity), // advisory — shown, never gated
    ])
  }
}

// new engines/tasks in the current run that the baseline doesn't track (informational)
const newItems = []
for (const [engine, currTasks] of currIndex) {
  const baseTasks = baseIndex.get(engine)
  for (const task of currTasks.keys()) {
    if (!baseTasks?.has(task)) newItems.push(`${engine} ▸ ${task}`)
  }
}

/* ── report ── */

const pad = (s, w) => String(s).padEnd(w)
const W0 = Math.max(18, ...tableRows.map((r) => r[0].length)) + 2
console.log('\nBench gate — current vs baseline (▲ better, ▼ worse, = within tolerance)\n')
console.log(pad('engine ▸ task', W0) + pad('compiled', 10) + pad('dim', 14) + pad('IoU', 16) + pad('place', 14) + pad('kit', 14) + 'judge*')
for (const r of tableRows) {
  console.log(pad(r[0], W0) + pad(r[1], 10) + pad(r[2], 14) + pad(r[3], 16) + pad(r[4], 14) + pad(r[5], 14) + r[6])
}
console.log('\n* judge = advisory LLM score, shown for visibility — never gated.')

if (improvements.length) {
  console.log(`\n▲ ${improvements.length} improvement(s):`)
  for (const i of improvements) console.log(`  ${i}`)
}
if (newItems.length) {
  console.log(`\n+ ${newItems.length} new item(s) not in baseline (not gated):`)
  for (const i of newItems) console.log(`  ${i}`)
}

if (regressions.length) {
  console.log(`\n▼ ${regressions.length} REGRESSION(S):`)
  for (const r of regressions) console.log(`  ${r}`)
  console.log('\n[gate] FAIL — regressions beyond tolerance. If intended, re-baseline: node bench/gate.mjs --update-baseline')
  process.exit(1)
}

console.log('\n[gate] PASS — no regressions beyond tolerance.')
process.exit(0)

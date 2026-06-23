/**
 * Bench ratchet — diff the latest bench run against a committed baseline and
 * FAIL on regression. Turns the bench from a thermometer into a gate, so every
 * prompt/geometry change in the result-quality roadmap is measurable and safe.
 *
 *   node bench/run.mjs                  (re)generate bench/results/results.json
 *   node bench/gate.mjs                 compare results vs baseline
 *   node bench/gate.mjs --update-baseline   write bench/baseline.json from current results
 *
 * Exit codes are three-valued so a flaky run never masquerades as a verdict:
 *   0  PASS — no regression beyond tolerance
 *   1  REGRESSION — a real quality drop (compiled✓→✗ from a generation fault,
 *      a numeric metric below tolerance, a new over-split, a multi-block reply)
 *   2  INCONCLUSIVE / CONFIG — the run cannot be trusted as a verdict: a gated
 *      task ran with too few samples, an entire baseline engine is absent
 *      (partial matrix), or a task's samples ALL hit transport errors
 *      (rate-limit / 5xx / timeout). Re-run; do NOT treat as pass OR regression.
 *
 * baseline.json lives at the top level (bench/results/ is gitignored, so the
 * baseline could not live there). It stores ONLY the normalized gated metrics,
 * so it is small, readable, and diff-friendly in review.
 *
 * Sampling discipline: the run hits a live, non-deterministic API, so a single
 * draw is one noisy sample. `bench/run.mjs` defaults to BENCH_SAMPLES=3 and
 * aggregates (median quality, compiledRate over EVALUABLE samples). This gate
 * REFUSES to render a verdict on <2 samples (exit 2) unless --allow-single-sample,
 * which is the precondition for ever tightening the wide IoU/skill tolerances.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const RESULTS_PATH = path.join(ROOT, 'results', 'results.json')
const BASELINE_PATH = path.join(ROOT, 'baseline.json')

const round2 = (n) => Math.round(n * 100) / 100

/**
 * Transport (environmental) vs generation (model/geometry) failure.
 * Transport failures — rate limits, 5xx, overload, socket/timeouts — say nothing
 * about the change under test, so they must NEVER count as a compiled✓→✗ regression.
 * Everything else (no scad block, non-manifold, empty geometry, compile error) is
 * a genuine generation failure the gate SHOULD catch.
 */
export const TRANSPORT_RE =
  /rate.?limit|429|too many requests|overloaded|\b529\b|http 5\d\d|timeout|timed out|econnreset|socket hang up|network|fetch failed|aborted|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/i

/**
 * Render/geometry faults are the MODEL's fault (too-heavy → render timeout, non-manifold, empty
 * geometry), never the network's — even though "timed out"/"aborted" also appear in transport
 * errors. They MUST stay 'generation' so a heavy/broken model can't be excused as environmental.
 * Checked BEFORE TRANSPORT_RE so it wins the overlap.
 */
export const RENDER_FAULT_RE =
  /render timed out|too heavy to render|too heavy for|not 2-manifold|2-manifold|top level object is empty|csg normaliz|object may not be|empty geometry|produced no geometry|unable to convert/i

/** Classify an error string. Returns 'transport' | 'generation' | null (no error). */
export function classifyError(err) {
  if (!err) return null
  const s = String(err)
  if (RENDER_FAULT_RE.test(s)) return 'generation' // a render fault is never transport, even if it says "timed out"
  return TRANSPORT_RE.test(s) ? 'transport' : 'generation'
}

/** Placement score fallback for older baselines/results that predate the field. */
function placementFromMinZ(minZ) {
  if (typeof minZ !== 'number' || !Number.isFinite(minZ)) return null
  const off = Math.abs(minZ)
  if (off <= 0.5) return 1
  if (off <= 2) return 0.5
  return 0
}

/** Normalize a raw results.json row to the gated metric set. */
export function metricsOf(row) {
  const isKit = !!row.buildability
  // run-provenance: how trustworthy is this row? errorClass distinguishes an
  // environmental miss (transport) from a real generation fault.
  const errorClass = row.errorClass ?? classifyError(row.error)
  return {
    task: row.task,
    // a transport miss is NOT a compile failure — leave compiled null so the gate
    // treats it as inconclusive rather than a compiled✓→✗ regression.
    compiled: errorClass === 'transport' ? null : row.error ? false : row.compiled === true,
    errored: Boolean(row.error),
    errorClass: errorClass ?? null,
    // sampling provenance (run.mjs stamps these; null = legacy/unknown → treated as 1)
    samples: typeof row.samples === 'number' ? row.samples : null,
    evaluableSamples: typeof row.evaluableSamples === 'number' ? row.evaluableSamples : null,
    compiledRate: typeof row.compiledRate === 'number' ? row.compiledRate : null,
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
    // per-skill functional validator on the live output (1 = mechanism discipline holds).
    // Present only on Phase-4 mechanism tasks; wide tol (binary + live-API noise) until
    // repeat-sampling, like iou/interferenceScore.
    skillScore: typeof row.skillScore === 'number' ? row.skillScore : null,
    // P5 intent lane: the reply must keep exactly ONE scad block (the non-fenced INTENT line
    // must not trip the contract) — categorical, zero-tolerance. Intent-emission rate is advisory.
    blockCount: typeof row.blockCount === 'number' ? row.blockCount : null,
    intentEmittedRate: typeof row.intentEmittedRate === 'number' ? row.intentEmittedRate : null,
    // advisory LLM-judge — displayed for visibility, never gated (nondeterministic)
    judgeScore: row.judge && !row.judge.error && typeof row.judge.score === 'number' ? row.judge.score : null,
    // advisory VLM-vision fidelity (Phase 3 Gemini judge) — shown, never hard-gates (tol: Infinity)
    visionFidelity: row.visionJudge && !row.visionJudge.error && typeof row.visionJudge.overallFidelity === 'number' ? row.visionJudge.overallFidelity : null,
  }
}

/** Fields that describe THIS run, not the quality contract — stripped from the
 *  committed baseline so it stays diff-friendly and the trusted side carries no
 *  per-run provenance. */
function toBaselineRow(m) {
  const out = { ...m }
  for (const k of ['samples', 'evaluableSamples', 'compiledRate', 'errorClass', 'errored']) delete out[k]
  return out
}

// numeric metrics: higher is better; a drop beyond `tol` fails the gate.
export const NUMERIC = [
  { key: 'dimScore', label: 'dim', tol: 0.1 },
  { key: 'iou', label: 'IoU', tol: 0.03 }, // wide: live-API non-determinism (tighten once repeat-sampling is enforced)
  { key: 'placementScore', label: 'place', tol: 0.1 },
  { key: 'buildabilityScore', label: 'kit', tol: 0.05 },
  { key: 'asymmetryScore', label: 'asym', tol: 0.15 }, // geometric self-similarity is noisy → wide tol
  { key: 'moduleDistinctness', label: 'mods', tol: 1 }, // distinct-module count
  { key: 'assembledScore', label: 'asm', tol: 0.25 }, // stepped 0/0.5/1 → tolerate one step
  { key: 'interferenceScore', label: 'intf', tol: 0.1 }, // cutter-vs-structure overlap on generated parts (advisory until baselined)
  { key: 'skillScore', label: 'skill', tol: 0.5 }, // per-skill validator on live output; binary + noisy → wide tol until repeat-sampling
  { key: 'visionFidelity', label: 'vis', tol: Infinity }, // Phase-3 VLM vision fidelity — shown for visibility, never hard-gates
]

/** Deterministic geometry scorers that MUST be present on any compiled run of the task they apply to.
 *  If one was numeric in the baseline but null on a compiled current run, the gold/scorer broke — that
 *  is INCONCLUSIVE (exit 2), not a silent pass. Excludes the conditional fidelity metrics
 *  (asymmetry/modules/assembled/interference/skill), which legitimately vanish when the model omits a
 *  tagged feature or the _debug probe, so they'd false-positive. */
const LOST_SCORABILITY_KEYS = new Set(['dimScore', 'iou', 'placementScore', 'buildabilityScore'])

/**
 * Pure comparison: baseline (already-normalized metric rows) vs current (raw
 * results blocks). No I/O, no process.exit — returns a verdict object so the
 * gate logic itself can be ratcheted by a zero-API selftest.
 *
 * @param {Array} baseline  [{ engine, results:[normalizedRow] }]
 * @param {Array} current   [{ engine, results:[rawRow] }]
 * @param {{minSamples?:number, advisoryEngines?:Set<string>}} opts
 * @returns {{exit:0|1|2, regressions, improvements, newItems, configErrors,
 *            inconclusive, advisoryNotes, tableRows, compared:number, baselined:number}}
 */
export function evaluate(baseline, current, opts = {}) {
  const minSamples = opts.minSamples ?? 2
  const advisoryEngines = opts.advisoryEngines ?? new Set()

  const baseIndex = new Map(baseline.map((b) => [b.engine, new Map(b.results.map((r) => [r.task, r]))]))
  const currIndex = new Map(current.map((b) => [b.engine, new Map(b.results.map((r) => [r.task, metricsOf(r)]))]))

  const regressions = []
  const improvements = []
  const configErrors = []
  const inconclusive = []
  const advisoryNotes = [] // findings on advisory engines: reported, NEVER affect exit
  const tableRows = []
  let compared = 0
  let baselined = 0

  const arrow = (delta, tol) => (delta > tol ? '▲' : delta < -tol ? '▼' : '=')
  const cell = (b, c, tol) => {
    if (typeof c !== 'number' && typeof b !== 'number') return '—'
    if (typeof c !== 'number') return `${b}→·`
    if (typeof b !== 'number') return `·→${c}`
    if (b === c) return `${c}`
    return `${b}→${c}${arrow(round2(c - b), tol)}`
  }

  for (const [engine, baseTasks] of baseIndex) {
    baselined += baseTasks.size
    const advisory = advisoryEngines.has(engine)
    // advisory engines (e.g. the personal-use claude-code login that can't ship AND rotates
    // its token) are reported but never fail or block the gate — route ALL their findings to
    // advisoryNotes so the shippable engines remain the sole authority on the verdict.
    const reg = advisory ? advisoryNotes : regressions
    const cfg = advisory ? advisoryNotes : configErrors
    const inc = advisory ? advisoryNotes : inconclusive

    const currTasks = currIndex.get(engine)
    if (!currTasks) {
      // an entire baseline engine absent from the run = partial matrix, not a verdict.
      const msg = `engine "${engine}" is in the baseline but ABSENT from this run (${baseTasks.size} task(s) uncovered) — partial matrix`
      cfg.push(advisory ? `${msg} [advisory — ignored]` : msg)
      for (const task of baseTasks.keys()) tableRows.push([`${engine} ▸ ${task}`, advisory ? '∅adv' : '∅', '', '', '', '', '', ''])
      continue
    }

    for (const [task, bm] of baseTasks) {
      const id = `${engine} ▸ ${task}${advisory ? ' (advisory)' : ''}`
      const cm = currTasks.get(task)
      if (!cm) {
        reg.push(`${id}: MISSING from current run (was in baseline)`)
        tableRows.push([id, 'MISSING', '', '', '', '', '', ''])
        continue
      }
      compared++

      // sampling discipline: refuse to gate a thin sample (a single live draw is noise).
      const n = cm.samples ?? 1
      if (n < minSamples) {
        cfg.push(`${id}: ran with ${n} sample(s); gate requires ≥${minSamples} (set BENCH_SAMPLES=${Math.max(3, minSamples)}, or pass --allow-single-sample for local iteration)`)
        tableRows.push([id, `n=${n}?`, '', '', '', '', '', ''])
        continue
      }

      // a fully transport-inconclusive task (all samples hit rate-limit/5xx/timeout) is
      // environmental — not a pass and not a regression. Surface and force a re-run.
      if (cm.errorClass === 'transport' && cm.compiled == null) {
        inc.push(`${id}: INCONCLUSIVE — all ${n} sample(s) hit transport errors (rate-limit/5xx/timeout); re-run`)
        tableRows.push([id, 'transp', '', '', '', '', '', ''])
        continue
      }

      // categorical, zero-tolerance regressions
      // compiled✓→✗ ONLY when the current miss is a genuine generation failure
      // (cm.compiled === false). A transport miss leaves cm.compiled null → skipped above.
      if (bm.compiled === true && cm.compiled === false) reg.push(`${id}: compiled ✓→✗`)
      if (!bm.overSplit && cm.overSplit) reg.push(`${id}: NEW over-split (non-kit produced a multi-piece enum)`)
      // contract: the response must carry exactly ONE scad block (the INTENT preamble must not fence)
      if (cm.blockCount != null && cm.blockCount > 1) reg.push(`${id}: ${cm.blockCount} scad blocks (contract requires exactly 1 — the INTENT line must stay non-fenced)`)
      if (bm.buildabilityHardFail === false && cm.buildabilityHardFail === true) reg.push(`${id}: kit HARD FAIL (was buildable)`)

      // numeric metrics
      for (const { key, label, tol } of NUMERIC) {
        const b = bm[key]
        const c = cm[key]
        // lost scorability: a core scorer the baseline measured is null on a SUCCESSFUL (compiled)
        // current run — the gold/scorer broke, not a quality change. Inconclusive, never a silent pass.
        if (LOST_SCORABILITY_KEYS.has(key) && typeof b === 'number' && c == null && cm.compiled === true) {
          cfg.push(`${id}: ${label} lost scorability (baseline ${b} → null on a compiled run — gold/scorer broke); re-run or fix`)
          continue
        }
        if (typeof b !== 'number' || typeof c !== 'number') continue
        const delta = round2(c - b)
        if (delta < -tol) reg.push(`${id}: ${label} ${b}→${c} (${delta}, tol ${tol})`)
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
        cell(bm.visionFidelity, cm.visionFidelity, Infinity), // Phase-3 VLM — advisory, never gated
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

  // config/inconclusive take precedence: a run we can't trust is neither pass nor regression.
  // advisoryNotes never influence the exit code.
  const exit = configErrors.length || inconclusive.length ? 2 : regressions.length ? 1 : 0
  return { exit, regressions, improvements, newItems, configErrors, inconclusive, advisoryNotes, tableRows, compared, baselined }
}

/* ── CLI: read files, evaluate, print, exit. Only when invoked directly so the
   pure helpers above can be imported by bench/gate.selftest.mjs. ── */

function readJson(p, what) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch (err) {
    console.error(`[gate] cannot read ${what} (${p}): ${err.message}`)
    process.exit(2)
  }
}

function main() {
  const argv = process.argv.slice(2)

  if (argv.includes('--update-baseline')) {
    const current = readJson(RESULTS_PATH, 'results')
    const baseline = current.map((block) => ({
      engine: block.engine,
      results: block.results.map((r) => toBaselineRow(metricsOf(r))),
    }))
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n')
    const rows = baseline.reduce((n, b) => n + b.results.length, 0)
    console.log(`[gate] wrote bench/baseline.json — ${baseline.length} engine(s), ${rows} task row(s).`)
    console.log('[gate] commit baseline.json so future runs are gated against it.')
    process.exit(0)
  }

  if (!fs.existsSync(BASELINE_PATH)) {
    console.error('[gate] no bench/baseline.json yet — create one with: node bench/gate.mjs --update-baseline')
    process.exit(2)
  }

  const allowSingle = argv.includes('--allow-single-sample') || process.env.BENCH_MIN_SAMPLES === '1'
  const minFlagIdx = argv.indexOf('--min-samples')
  const minSamples = allowSingle ? 1 : minFlagIdx >= 0 ? Math.max(1, Number(argv[minFlagIdx + 1]) || 2) : Math.max(1, Number(process.env.BENCH_MIN_SAMPLES) || 2)
  // engines whose regressions are reported but never fail the gate. claude-code is the
  // personal-use-only login (cannot ship) AND the engine most likely to drop its CLI token,
  // so it is advisory by default; the shippable anthropic/kimi baseline is authoritative.
  const advisoryEngines = new Set(
    (process.env.BENCH_ADVISORY_ENGINES ?? 'claude-code').split(',').map((s) => s.trim()).filter(Boolean),
  )

  const baseline = readJson(BASELINE_PATH, 'baseline') // already-normalized metric rows
  const current = readJson(RESULTS_PATH, 'results')

  const v = evaluate(baseline, current, { minSamples, advisoryEngines })

  /* ── report ── */
  const pad = (s, w) => String(s).padEnd(w)
  const W0 = Math.max(18, ...v.tableRows.map((r) => r[0].length)) + 2
  console.log('\nBench gate — current vs baseline (▲ better, ▼ worse, = within tolerance)\n')
  console.log(pad('engine ▸ task', W0) + pad('compiled', 10) + pad('dim', 14) + pad('IoU', 16) + pad('place', 14) + pad('kit', 14) + pad('judge*', 14) + 'vis**')
  for (const r of v.tableRows) {
    console.log(pad(r[0], W0) + pad(r[1], 10) + pad(r[2], 14) + pad(r[3], 16) + pad(r[4], 14) + pad(r[5], 14) + pad(r[6], 14) + r[7])
  }
  console.log(`\n* judge = advisory LLM score, shown for visibility — never gated.`)
  console.log(`** vis = advisory Phase-3 VLM vision fidelity (Gemini), shown for visibility — never gated.`)
  console.log(`  coverage: compared ${v.compared} / baselined ${v.baselined} task row(s); min-samples=${minSamples}; advisory engines: ${[...advisoryEngines].join(', ') || 'none'}.`)

  if (v.improvements.length) {
    console.log(`\n▲ ${v.improvements.length} improvement(s):`)
    for (const i of v.improvements) console.log(`  ${i}`)
  }
  if (v.newItems.length) {
    console.log(`\n+ ${v.newItems.length} new item(s) not in baseline (not gated):`)
    for (const i of v.newItems) console.log(`  ${i}`)
  }
  if (v.inconclusive.length) {
    console.log(`\n? ${v.inconclusive.length} inconclusive (environmental — re-run, not a regression):`)
    for (const i of v.inconclusive) console.log(`  ${i}`)
  }
  if (v.advisoryNotes.length) {
    console.log(`\n· ${v.advisoryNotes.length} advisory note(s) (non-shippable engine — never gates):`)
    for (const a of v.advisoryNotes) console.log(`  ${a}`)
  }
  if (v.regressions.length) {
    console.log(`\n▼ ${v.regressions.length} REGRESSION(S):`)
    for (const r of v.regressions) console.log(`  ${r}`)
  }
  if (v.configErrors.length) {
    console.log(`\n⚠ ${v.configErrors.length} CONFIG/COVERAGE problem(s) — run not trustworthy as a verdict:`)
    for (const c of v.configErrors) console.log(`  ${c}`)
  }

  if (v.exit === 2) {
    console.log('\n[gate] INCONCLUSIVE (exit 2) — re-run with enough samples / full engine set. Not a pass, not a regression.')
    process.exit(2)
  }
  if (v.exit === 1) {
    console.log('\n[gate] FAIL — regressions beyond tolerance. If intended, re-baseline: node bench/gate.mjs --update-baseline')
    process.exit(1)
  }
  console.log('\n[gate] PASS — no regressions beyond tolerance.')
  process.exit(0)
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) main()

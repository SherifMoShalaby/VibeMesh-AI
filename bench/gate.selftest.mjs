/**
 * Zero-API ratchet for the bench gate's verdict logic (bench/gate.mjs `evaluate`).
 * The gate is the product's only correctness ratchet for generation, so its OWN
 * decision rules — sample sufficiency, transport-vs-generation classification,
 * engine-set parity, advisory demotion — must themselves be tested deterministically,
 * not just trusted. No network, no WASM; runs ahead of the live gate.
 *
 *   node bench/gate.selftest.mjs   → exit 0 (all pass) / 1 (a rule regressed)
 */
import assert from 'node:assert/strict'
import { evaluate, classifyError } from './gate.mjs'

let passed = 0
const cases = []
function test(name, fn) {
  cases.push({ name, fn })
}

/* ── fixtures: baseline rows are already-normalized (post-metricsOf); current rows
   are RAW (run.mjs shape) and get normalized inside evaluate. ── */
const baseRow = (task, over = {}) => ({ task, compiled: true, overSplit: false, dimScore: 1, ...over })
const block = (engine, results) => ({ engine, results })
// a healthy current sample: 3 draws, all compiled
const curOk = (task, over = {}) => ({ task, compiled: true, samples: 3, compiledRate: 1, dimScore: 1, ...over })

/* ── classifyError ── */
test('classifyError: transport patterns', () => {
  for (const e of ['HTTP 529: overloaded', 'rate limit hit', 'Error 429 too many requests', 'generation timeout after 900s', 'socket hang up', 'ECONNRESET', 'fetch failed']) {
    assert.equal(classifyError(e), 'transport', `expected transport for: ${e}`)
  }
})
test('classifyError: generation patterns', () => {
  for (const e of ['no scad code block in reply', 'Compile error: argument to cube() must be numeric', 'no geometry']) {
    assert.equal(classifyError(e), 'generation', `expected generation for: ${e}`)
  }
})
test('classifyError: no error → null', () => {
  assert.equal(classifyError(null), null)
  assert.equal(classifyError(undefined), null)
  assert.equal(classifyError(''), null)
})

/* ── pass / regression basics ── */
test('clean run → exit 0', () => {
  const v = evaluate([block('kimi', [baseRow('T1')])], [block('kimi', [curOk('T1')])])
  assert.equal(v.exit, 0, 'clean identical run should pass')
  assert.equal(v.regressions.length, 0)
  assert.equal(v.compared, 1)
  assert.equal(v.baselined, 1)
})
test('generation compiled ✓→✗ → exit 1', () => {
  const cur = [block('kimi', [{ task: 'T1', compiled: false, samples: 3, compiledRate: 0, compileError: 'no geometry' }])]
  const v = evaluate([block('kimi', [baseRow('T1')])], cur)
  assert.equal(v.exit, 1, 'a genuine compile loss must fail')
  assert.ok(v.regressions.some((r) => /compiled ✓→✗/.test(r)), 'should report compiled ✓→✗')
})
test('numeric drop beyond tol → exit 1', () => {
  const v = evaluate([block('kimi', [baseRow('T1', { dimScore: 1 })])], [block('kimi', [curOk('T1', { dimScore: 0.8 })])])
  assert.equal(v.exit, 1)
  assert.ok(v.regressions.some((r) => /dim/.test(r)))
})
test('numeric drop within tol → exit 0', () => {
  const v = evaluate([block('kimi', [baseRow('T1', { dimScore: 1 })])], [block('kimi', [curOk('T1', { dimScore: 0.95 })])])
  assert.equal(v.exit, 0)
})
test('new over-split → exit 1', () => {
  const v = evaluate([block('kimi', [baseRow('T1', { overSplit: false })])], [block('kimi', [curOk('T1', { overSplit: true })])])
  assert.equal(v.exit, 1)
  assert.ok(v.regressions.some((r) => /over-split/.test(r)))
})
test('multi-block reply → exit 1', () => {
  const v = evaluate([block('kimi', [baseRow('T1')])], [block('kimi', [curOk('T1', { blockCount: 2 })])])
  assert.equal(v.exit, 1)
  assert.ok(v.regressions.some((r) => /scad blocks/.test(r)))
})

/* ── sampling discipline ── */
test('single sample → exit 2 (config), not a verdict', () => {
  const v = evaluate([block('kimi', [baseRow('T1')])], [block('kimi', [{ task: 'T1', compiled: true, samples: 1, compiledRate: 1, dimScore: 1 }])])
  assert.equal(v.exit, 2, 'a single live draw must not render a verdict')
  assert.equal(v.regressions.length, 0, 'sub-threshold sampling is config, not regression')
  assert.ok(v.configErrors.some((c) => /1 sample/.test(c)))
})
test('single sample allowed with minSamples:1 → exit 0', () => {
  const v = evaluate([block('kimi', [baseRow('T1')])], [block('kimi', [{ task: 'T1', compiled: true, samples: 1, compiledRate: 1, dimScore: 1 }])], { minSamples: 1 })
  assert.equal(v.exit, 0, '--allow-single-sample path must pass a clean single draw')
})
test('legacy row without samples treated as 1 → exit 2', () => {
  const v = evaluate([block('kimi', [baseRow('T1')])], [block('kimi', [{ task: 'T1', compiled: true, dimScore: 1 }])])
  assert.equal(v.exit, 2, 'unknown sample count is treated as sub-threshold')
})

/* ── transport vs generation ── */
test('all-transport task → inconclusive (exit 2), NOT compiled ✓→✗', () => {
  const cur = [block('kimi', [{ task: 'T1', samples: 3, errorClass: 'transport', compiled: null, error: 'all samples hit transport errors' }])]
  const v = evaluate([block('kimi', [baseRow('T1')])], cur)
  assert.equal(v.exit, 2, 'an environmental wipeout is inconclusive, not a regression')
  assert.equal(v.regressions.length, 0, 'transport must never be a compiled ✓→✗ regression')
  assert.ok(v.inconclusive.some((i) => /INCONCLUSIVE/.test(i)))
})
test('transport error string on a row classifies as inconclusive via metricsOf', () => {
  // row carries a raw transport error string but no explicit errorClass — metricsOf must classify it
  const cur = [block('kimi', [{ task: 'T1', samples: 3, error: 'HTTP 503: upstream overloaded' }])]
  const v = evaluate([block('kimi', [baseRow('T1')])], cur)
  assert.equal(v.regressions.length, 0)
  assert.ok(v.inconclusive.length >= 1)
})

/* ── engine-set parity ── */
test('missing shippable engine → exit 2 (partial matrix)', () => {
  const base = [block('kimi', [baseRow('T1')]), block('anthropic', [baseRow('T1')])]
  const v = evaluate(base, [block('kimi', [curOk('T1')])])
  assert.equal(v.exit, 2, 'a dropped shippable engine block is a coverage problem')
  assert.ok(v.configErrors.some((c) => /anthropic.*ABSENT/.test(c)))
  assert.equal(v.baselined, 2)
})
test('missing baselined task within a present engine → exit 1', () => {
  const v = evaluate([block('kimi', [baseRow('T1'), baseRow('T2')])], [block('kimi', [curOk('T1')])])
  assert.equal(v.exit, 1)
  assert.ok(v.regressions.some((r) => /T2.*MISSING/.test(r)))
})

/* ── advisory demotion (claude-code can't ship + rotates its token) ── */
const ADV = { advisoryEngines: new Set(['claude-code']) }
test('missing advisory engine → exit 0 (note only)', () => {
  const base = [block('kimi', [baseRow('T1')]), block('claude-code', [baseRow('T1')])]
  const v = evaluate(base, [block('kimi', [curOk('T1')])], ADV)
  assert.equal(v.exit, 0, 'a dropped advisory engine must NOT block the gate')
  assert.equal(v.configErrors.length, 0)
  assert.ok(v.advisoryNotes.some((a) => /claude-code.*ABSENT/.test(a)))
})
test('advisory engine regression → exit 0 (note only)', () => {
  const base = [block('kimi', [baseRow('T1')]), block('claude-code', [baseRow('T1')])]
  const cur = [block('kimi', [curOk('T1')]), block('claude-code', [{ task: 'T1', compiled: false, samples: 3, compiledRate: 0, compileError: 'no geometry' }])]
  const v = evaluate(base, cur, ADV)
  assert.equal(v.exit, 0, 'an advisory-engine regression must never fail the gate')
  assert.equal(v.regressions.length, 0)
  assert.ok(v.advisoryNotes.some((a) => /compiled ✓→✗/.test(a)))
})
test('shippable regression still fails even when an advisory engine is present', () => {
  const base = [block('kimi', [baseRow('T1')]), block('claude-code', [baseRow('T1')])]
  const cur = [block('kimi', [{ task: 'T1', compiled: false, samples: 3, compiledRate: 0 }]), block('claude-code', [curOk('T1')])]
  const v = evaluate(base, cur, ADV)
  assert.equal(v.exit, 1, 'the shippable engine remains authoritative')
})

/* ── precedence: config/inconclusive outrank a regression (untrustworthy run) ── */
test('config error + regression together → exit 2 (config precedence)', () => {
  const base = [block('kimi', [baseRow('T1'), baseRow('T2')])]
  const cur = [block('kimi', [
    { task: 'T1', compiled: false, samples: 3, compiledRate: 0 }, // would be a regression
    { task: 'T2', compiled: true, samples: 1, dimScore: 1 }, // single sample → config
  ])]
  const v = evaluate(base, cur)
  assert.equal(v.exit, 2, 'an untrustworthy run is reported but not declared a quality regression')
  assert.ok(v.regressions.length >= 1, 'the regression is still surfaced')
  assert.ok(v.configErrors.length >= 1)
})

/* ── run ── */
let failed = 0
for (const { name, fn } of cases) {
  try {
    fn()
    passed++
  } catch (err) {
    failed++
    console.error(`✗ ${name}\n    ${err.message}`)
  }
}
if (failed) {
  console.error(`\n[gate.selftest] FAIL — ${failed}/${cases.length} case(s) failed.`)
  process.exit(1)
}
console.log(`[gate.selftest] PASS — ${passed} gate-logic case(s) (sampling, transport split, engine parity, advisory).`)
process.exit(0)

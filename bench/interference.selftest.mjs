/**
 * Static, zero-API interference ratchet for the committed KIT exemplar.
 *
 * The kit exemplar is the few-shot injected into every kit generation, so if it
 * ever regresses to slicing its own clutch tubes (the bug in docs/GEOMETRIC-CONSISTENCY-DIAGNOSIS.md),
 * every kit the model writes inherits it — and the live bench would score it a
 * perfect buildability=1.0 with no note. This test recompiles the exemplar's
 * protected structure vs. its cutters and asserts they DON'T intersect, plus a
 * deliberately-broken control (skip_r=0) to prove the probe actually discriminates.
 *
 * Run: node bench/interference.selftest.mjs   (wired into npm run bench:gate)
 */
import { KIT_EXEMPLAR } from '../server/exemplars.mjs'
import { interferenceVol, interferenceScore, hasDebugContract, INTERFERENCE_OK_MM3 } from './interference.mjs'

const r2 = (n) => (n == null ? 'n/a' : Math.round(n * 100) / 100)

function fail(msg) {
  console.error(`[interference] FAIL — ${msg}`)
  process.exit(1)
}

if (!hasDebugContract(KIT_EXEMPLAR)) {
  fail('KIT_EXEMPLAR lost its `_debug = "off"; // [off, positives, negatives]` probe contract.')
}

// 1) the real exemplar must be deconflicted: protected tubes ∩ axle bores ≈ 0
const vol = await interferenceVol(KIT_EXEMPLAR)
if (vol == null) fail('probe returned null on the exemplar (a _debug variant did not compile).')
console.log(`[interference] exemplar overlap = ${r2(vol)} mm³  (score ${interferenceScore(vol)}, ok ≤ ${INTERFERENCE_OK_MM3})`)
if (vol > INTERFERENCE_OK_MM3) {
  fail(`exemplar axle bore slices its clutch tubes by ${r2(vol)} mm³ — the deconfliction regressed.`)
}

// 2) a broken control (skip_r=0 → tubes are NOT relieved out of the bore path) must be caught
const broken = KIT_EXEMPLAR.replace(/skip_r\s*=\s*[^;]+;/, 'skip_r = 0;')
if (broken === KIT_EXEMPLAR) fail('could not build the skip_r=0 control (skip_r assignment not found).')
const brokenVol = await interferenceVol(broken)
console.log(`[interference] skip_r=0 control overlap = ${r2(brokenVol)} mm³  (score ${interferenceScore(brokenVol)})`)
if (brokenVol == null || brokenVol <= INTERFERENCE_OK_MM3) {
  fail(`probe did not detect the broken control (got ${r2(brokenVol)} mm³) — the probe is not discriminating.`)
}

console.log('[interference] PASS — exemplar deconflicted, probe discriminates the slice.')
process.exit(0)

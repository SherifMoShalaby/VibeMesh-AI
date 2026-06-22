/**
 * Zero-API ratchet for the silhouette-IoU shape signal (bench/silhouette.mjs). Proves the metric
 * actually SEES shape — the thing the refine loop / best-of-N could not. A traced bishop and a
 * canonical "bishop = pointed spike" prior have the SAME bounding box (so the old bbox-only signal
 * scored them identically), but their SILHOUETTES are clearly different. This asserts:
 *   - silhouetteIoU(traced, traced) ≈ 1.0   (self-identity)
 *   - silhouetteIoU(traced, spike)  well below 1.0, with a wide margin (it discriminates)
 * so a future regression that reverts a traced figure back to a canonical prior is catchable.
 *
 *   node --import tsx bench/silhouette.selftest.mjs  (no TS here, but kept consistent) — or: node bench/silhouette.selftest.mjs
 */
import assert from 'node:assert/strict'
import { compileScad } from './compare.mjs'
import { silhouetteIoU, maskIoU } from './silhouette.mjs'

// Single-line _prof, no global $fn — obeys the silhouette-trace clause. A real bishop outline.
const TRACED_BISHOP = [
  'facets = 8;',
  'finial_r = 2.8;',
  '_prof = [[0,0],[12.5,0],[12.0,3],[8.5,5.5],[5.2,8],[3.6,13],[4.6,17],[6.9,25],[5.6,33],[3.7,40],[5.3,42],[3.2,44],[4.2,47],[7.3,51],[6.6,56],[3.0,60],[0,60]];',
  'slit = [[2,53]];',
  'difference() {',
  '  union() { rotate_extrude($fn=facets) polygon(_prof); translate([0,0,61]) sphere(r=finial_r,$fn=facets); }',
  '  translate([2,0,53]) rotate([0,38,0]) cube([3,20,16],center=true);',
  '}',
].join('\n')

// The canonical prior the trace clause exists to beat: "bishop = pointed spire" + ball. Same bbox class.
const CANONICAL_SPIKE = [
  'facets = 8;',
  'prof = [[0,0],[12.5,0],[11,4],[4.5,11],[5.2,30],[3.4,46],[2.6,56],[0,60]];',
  'rotate_extrude($fn=facets) polygon(prof);',
  'translate([0,0,60]) sphere(r=2.6,$fn=facets);',
].join('\n')

const stl = async (code) => {
  const bin = await compileScad(code)
  assert.ok(bin && bin.length, 'fixture failed to compile')
  return Buffer.from(bin, 'binary')
}

const failures = []
const check = (name, cond, detail) => { if (!cond) failures.push(`${name} — ${detail}`) }

const bishop = await stl(TRACED_BISHOP)
const spike = await stl(CANONICAL_SPIKE)

const self = silhouetteIoU(bishop, bishop, 'front')
const cross = silhouetteIoU(bishop, spike, 'front')
const crossMaxPose = ['front', 'iso', 'right'].map((p) => silhouetteIoU(bishop, spike, p))

check('self-identity', self > 0.995, `silhouetteIoU(traced,traced) front = ${self.toFixed(3)}, expected ≈1.0`)
check('discriminates', cross < 0.85, `silhouetteIoU(traced,spike) front = ${cross.toFixed(3)}, expected < 0.85 (bishop ≠ spike)`)
check('wide margin', self - cross > 0.15, `margin self-cross = ${(self - cross).toFixed(3)}, expected > 0.15`)
check('empty-safe', maskIoU(null, null) === 0 && silhouetteIoU(Buffer.alloc(0), bishop) === 0, 'empty STL must score 0, not throw')

console.log(`  bishop vs bishop (front): ${self.toFixed(3)}  |  bishop vs spike (front): ${cross.toFixed(3)}  |  per-pose cross [front,iso,right]: ${crossMaxPose.map((v) => v.toFixed(3)).join(', ')}`)
if (failures.length) {
  for (const f of failures) console.error(`✗ ${f}`)
  console.error(`\n[silhouette.selftest] FAIL — ${failures.length}/4`)
  process.exit(1)
}
console.log('[silhouette.selftest] PASS — 4 checks: shape metric is self-identical, discriminates a bishop from a spike with margin, and is empty-safe.')
process.exit(0)

/**
 * Registration de-risk SPIKE (roadmap Phase 1, Task 1.2). THROWAWAY — NOT wired into any gate.
 *
 * Question it answers: does silhouette-IoU between a candidate STL's rendered pose and a REAL
 * photo's extracted contour correlate with fidelity? If GOOD pairs (photo ↔ its own mesh) out-score
 * BAD pairs (photo ↔ a wrong mesh), the reference-grounded shape oracle (Phase 2) is viable; if not,
 * Phase 2 takes the self-consistency fallback. Inputs are built by registration_spike_prep.py
 * (photos+STLs) and registration_spike_contour.py (256×256 photo masks) — see bench/spike-data/.
 *
 * STL silhouettes use the SAME canonical rasterizer the live loop would (src/lib/silhouette.ts), so
 * a PASS transfers. The photo's true viewpoint is unknown, so we align it best-of (4 poses × 8
 * orientations) — that lifts BOTH classes equally, leaving good-vs-bad SEPARATION as the real signal.
 *
 * Run: tsx bench/registration-spike.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderMasks, maskIoU, POSES } from '../src/lib/silhouette.ts'

const SIZE = 256
const DIR = join(dirname(fileURLToPath(import.meta.url)), 'spike-data')
const manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8'))

const toArrayBuffer = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
const loadPhotoMask = (photo) => new Uint8Array(readFileSync(join(DIR, 'masks', basename(photo).replace(/\.[^.]+$/, '') + '.u8')))

function hflip(m) {
  const o = new Uint8Array(m.length)
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) o[y * SIZE + x] = m[y * SIZE + (SIZE - 1 - x)]
  return o
}
function rot90(m) { // clockwise
  const o = new Uint8Array(m.length)
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) o[x * SIZE + (SIZE - 1 - y)] = m[y * SIZE + x]
  return o
}
function orientations(m) {
  const out = []
  let cur = m
  for (let r = 0; r < 4; r++) { out.push(cur); out.push(hflip(cur)); cur = rot90(cur) }
  return out // 8
}

// best IoU of a photo mask against an STL: max over 4 render poses × 8 photo orientations
function bestIoU(photoMask, stlBuf) {
  let masks
  try { masks = renderMasks(toArrayBuffer(stlBuf)) } catch { return 0 }
  const poseMasks = Object.keys(POSES).map((p) => masks[p]).filter(Boolean)
  if (!poseMasks.length) return 0
  const oris = orientations(photoMask)
  let best = 0
  for (const pm of poseMasks) for (const o of oris) { const v = maskIoU(o, pm); if (v > best) best = v }
  return best
}

const rows = manifest.map((m) => {
  const photoMask = loadPhotoMask(m.photo)
  const stlBuf = readFileSync(m.stl)
  return { ...m, iou: bestIoU(photoMask, stlBuf) }
})

// report
console.log('\n  obj      label  IoU    detail')
console.log('  ' + '-'.repeat(64))
for (const r of rows) {
  console.log(`  ${String(r.object).padEnd(8)} ${r.label.padEnd(5)} ${r.iou.toFixed(3)}  ${r.name}`)
}

const good = rows.filter((r) => r.label === 'good').map((r) => r.iou)
const bad = rows.filter((r) => r.label === 'bad').map((r) => r.iou)
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1)
const mg = mean(good), mb = mean(bad), margin = mg - mb
const minGood = Math.min(...good), maxBad = Math.max(...bad)

// pairwise: each good object vs its paired bad (same photo, wrong STL) — share .object
const byObj = {}
for (const r of rows) (byObj[r.object] ??= {})[r.label] = r.iou
const pairs = Object.values(byObj).filter((o) => o.good != null && o.bad != null)
const wins = pairs.filter((o) => o.good > o.bad).length
const winRate = wins / (pairs.length || 1)

// AUC over all (good,bad) cross-pairs (probability a random good outranks a random bad)
let conc = 0, tot = 0
for (const g of good) for (const b of bad) { tot++; if (g > b) conc++; else if (g === b) conc += 0.5 }
const auc = tot ? conc / tot : 0

let verdict = 'FAIL'
if (margin >= 0.10 && winRate >= 0.66 && auc >= 0.70) verdict = 'PASS'
else if (margin >= 0.04 && auc >= 0.60) verdict = 'MARGINAL'

console.log('  ' + '-'.repeat(64))
console.log(`  mean(good)=${mg.toFixed(3)}  mean(bad)=${mb.toFixed(3)}  margin=${margin.toFixed(3)}`)
console.log(`  min(good)=${minGood.toFixed(3)}  max(bad)=${maxBad.toFixed(3)}  separated=${minGood > maxBad}`)
console.log(`  pairwise good>bad: ${wins}/${pairs.length} (${(winRate * 100).toFixed(0)}%)   AUC=${auc.toFixed(3)}`)
console.log(`\n  VERDICT: ${verdict}`)
console.log(verdict === 'PASS'
  ? '  → silhouette-IoU ranks faithful pairs above unfaithful ones. Reference-grounded oracle (Phase 2) is viable.'
  : verdict === 'MARGINAL'
    ? '  → weak separation. Reference-IoU is risky on real photos; prefer the self-consistency fallback, reserve reference-contour for clean line-drawings.'
    : '  → no usable separation on real photos. Phase 2 MUST take the self-consistency (reference-free) fallback; do NOT wire reference-contour IoU into the live loop.')
console.log('')

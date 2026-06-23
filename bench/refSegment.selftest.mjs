/**
 * PARITY + correctness ratchet for the live reference-photo shape tiebreak (Phase 2).
 *
 * The live best-of-N tiebreak (src/lib/refSegment.ts) ports the spike's orientation search + bestIoU
 * (bench/registration-spike.mjs:28-55) VERBATIM, reusing src/lib/silhouette.ts's renderMasks/maskIoU.
 * If those ports ever drift from the spike — or silhouette.ts evolves under them — the live shape
 * signal silently diverges from what the spike PASS verdict measured. This catches that, zero-API.
 *
 * Asserts:
 *   (1) refMaskOrientations(m) matches the spike's inline `orientations(m)` BIT-FOR-BIT (8 variants).
 *   (2) bestRefIoU(masks, ownMask) === 1.0 (self-IoU under the identity orientation).
 *   (3) bestRefIoU is monotonic vs the underlying maskIoU (a closer outline outranks a farther one).
 *   (4) the empty-safe / null contract is a no-op (null ref → 0; no candidate pose masks → 0).
 *
 *   npm run bench:refseg   (runs under tsx — imports the .ts live module)
 */
import { refMaskOrientations, bestRefIoU } from '../src/lib/refSegment.ts'
import { maskIoU } from '../src/lib/silhouette.ts'

const SIZE = 256

// ---- spike's inline orientation helpers, copied VERBATIM (bench/registration-spike.mjs:28-43) ----
function hflip(m) {
  const o = new Uint8Array(m.length)
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) o[y * SIZE + x] = m[y * SIZE + (SIZE - 1 - x)]
  return o
}
function rot90(m) {
  // clockwise
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

const mk = (pred) => {
  const m = new Uint8Array(SIZE * SIZE)
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) m[y * SIZE + x] = pred(x, y) ? 1 : 0
  return m
}

const failures = []
const check = (name, cond, detail) => { if (!cond) failures.push(`${name} — ${detail}`) }

// asymmetric corner block so rotations/flips are all distinguishable
const asym = mk((x, y) => x < 70 && y < 45)

// (1) orientation bit-parity with the spike
const spikeOris = orientations(asym)
const liveOris = refMaskOrientations(asym)
check('orientation count', liveOris.length === spikeOris.length && liveOris.length === 8, `live ${liveOris.length} vs spike ${spikeOris.length}`)
for (let i = 0; i < Math.min(liveOris.length, spikeOris.length); i++) {
  let diffs = 0
  const a = spikeOris[i]
  const b = liveOris[i]
  if (a.length !== b.length) { check(`orientation[${i}] length`, false, `${a.length} vs ${b.length}`); continue }
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) diffs++
  check(`orientation[${i}] bit-parity`, diffs === 0, `${diffs} differing cells`)
}

// (2) self-IoU === 1.0
const blockPose = mk((x, y) => x >= 96 && x < 160 && y >= 96 && y < 160)
const candidate = { iso: blockPose, front: blockPose, top: blockPose, right: blockPose }
check('self-IoU is 1.0', Math.abs(bestRefIoU(candidate, blockPose) - 1) < 1e-9, `got ${bestRefIoU(candidate, blockPose)}`)

// (3) monotonic vs maskIoU — a closer reference outline scores higher than a farther one
const closeRef = mk((x, y) => x >= 112 && x < 176 && y >= 96 && y < 160) // overlaps the candidate
const farRef = mk((x, y) => x >= 16 && x < 48 && y >= 16 && y < 48) // disjoint
const close = bestRefIoU(candidate, closeRef)
const far = bestRefIoU(candidate, farRef)
check('monotonic close > far', close > far, `close=${close.toFixed(4)} far=${far.toFixed(4)}`)
// the best pose-IoU must equal the raw maskIoU of the best orientation (no extra transform sneaking in)
check('bestRefIoU == max maskIoU over orientations', Math.abs(close - Math.max(...refMaskOrientations(closeRef).map((o) => maskIoU(o, blockPose)))) < 1e-9, 'mismatch vs direct maskIoU max')

// (4) empty-safe / null no-op contract
check('null ref → 0', bestRefIoU(candidate, null) === 0, `got ${bestRefIoU(candidate, null)}`)
check('undefined ref → 0', bestRefIoU(candidate, undefined) === 0, `got ${bestRefIoU(candidate, undefined)}`)
check('no candidate pose masks → 0', bestRefIoU({}, blockPose) === 0, `got ${bestRefIoU({}, blockPose)}`)

if (failures.length) {
  for (const f of failures) console.error(`x ${f}`)
  console.error(`\n[refSegment.selftest] FAIL — ${failures.length} check(s)`)
  process.exit(1)
}
console.log(`  refSegment.selftest: OK — orientation bit-parity (8/8), self-IoU=1.0, close(${close.toFixed(3)})>far(${far.toFixed(3)}), null-safe`)
process.exit(0)

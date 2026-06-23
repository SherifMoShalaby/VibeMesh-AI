/**
 * PARITY ratchet: the browser-side silhouette twin (src/lib/silhouette.ts) MUST reproduce the bench
 * rasterizer (bench/render.mjs renderMasks + bench/silhouette.mjs maskIoU) bit-for-bit. The live loop
 * leans on the TS port; the bench ratchets on the .mjs original. If they ever drift, the live shape
 * signal silently diverges from what the gate measures — this catches that.
 *
 * Method: compile the SAME two fixtures the bench selftest uses (a traced bishop, a canonical spike)
 * once via openscad-wasm, then run BOTH implementations on the IDENTICAL STL bytes and assert:
 *   - per-pose masks are CELL-FOR-CELL identical (integer 0/1 — exact equality, no tolerance)
 *   - maskIoU / silhouetteIoU agree within 1e-9
 *   - the empty-safe contract matches (renderMasks({}) === {}, maskIoU(null,null) === 0)
 *
 * The TS port reads ArrayBuffer; the bench reads a Node Buffer. We feed each its native view of the
 * SAME underlying bytes (buffer.buffer.slice(byteOffset, byteOffset+byteLength)), so any divergence is
 * a real math difference, not an input difference.
 *
 *   npm run bench:silhouette-live   (runs under tsx — imports the .ts port)
 */
import assert from 'node:assert/strict'
import { compileScad } from './compare.mjs'
import { renderMasks as benchRenderMasks } from './render.mjs'
import { maskIoU as benchMaskIoU, silhouetteIoU as benchSilhouetteIoU } from './silhouette.mjs'
import {
  renderMasks as portRenderMasks,
  maskIoU as portMaskIoU,
  silhouetteIoU as portSilhouetteIoU,
  POSES,
} from '../src/lib/silhouette.ts'

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

const CANONICAL_SPIKE = [
  'facets = 8;',
  'prof = [[0,0],[12.5,0],[11,4],[4.5,11],[5.2,30],[3.4,46],[2.6,56],[0,60]];',
  'rotate_extrude($fn=facets) polygon(prof);',
  'translate([0,0,60]) sphere(r=2.6,$fn=facets);',
].join('\n')

/** Compile → Node Buffer (for the bench) + a fresh ArrayBuffer of the SAME bytes (for the port). */
const compileBoth = async (code) => {
  const bin = await compileScad(code)
  assert.ok(bin && bin.length, 'fixture failed to compile')
  const buf = Buffer.from(bin, 'binary')
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  return { buf, ab }
}

const failures = []
const check = (name, cond, detail) => {
  if (!cond) failures.push(`${name} — ${detail}`)
}

const bishop = await compileBoth(TRACED_BISHOP)
const spike = await compileBoth(CANONICAL_SPIKE)

const poseNames = Object.keys(POSES)

// (1) per-pose masks must be CELL-FOR-CELL identical between bench and port.
for (const [label, fix] of [
  ['bishop', bishop],
  ['spike', spike],
]) {
  const benchMasks = benchRenderMasks(fix.buf)
  const portMasks = portRenderMasks(fix.ab)
  check(
    `${label}: same pose set`,
    JSON.stringify(Object.keys(benchMasks).sort()) === JSON.stringify(Object.keys(portMasks).sort()),
    `bench poses [${Object.keys(benchMasks)}] vs port [${Object.keys(portMasks)}]`,
  )
  for (const pose of poseNames) {
    const a = benchMasks[pose]
    const b = portMasks[pose]
    check(`${label}/${pose}: mask present`, !!a && !!b, 'missing mask in bench or port')
    if (!a || !b) continue
    check(`${label}/${pose}: mask length`, a.length === b.length, `bench ${a.length} vs port ${b.length}`)
    let diffs = 0
    let benchOn = 0
    let portOn = 0
    for (let i = 0; i < a.length; i++) {
      if (a[i]) benchOn++
      if (b[i]) portOn++
      if (a[i] !== b[i]) diffs++
    }
    check(`${label}/${pose}: cell-identical`, diffs === 0, `${diffs} differing cells (bench on=${benchOn}, port on=${portOn})`)
  }
}

// (2) maskIoU / silhouetteIoU agree within 1e-9 across pose pairings.
const benchMasksB = benchRenderMasks(bishop.buf)
const portMasksB = portRenderMasks(bishop.ab)
const benchMasksS = benchRenderMasks(spike.buf)
const portMasksS = portRenderMasks(spike.ab)
let maxIoUDelta = 0
for (const pose of poseNames) {
  const benchSelf = benchMaskIoU(benchMasksB[pose], benchMasksB[pose])
  const portSelf = portMaskIoU(portMasksB[pose], portMasksB[pose])
  const benchCross = benchMaskIoU(benchMasksB[pose], benchMasksS[pose])
  const portCross = portMaskIoU(portMasksB[pose], portMasksS[pose])
  maxIoUDelta = Math.max(maxIoUDelta, Math.abs(benchSelf - portSelf), Math.abs(benchCross - portCross))
}
check('maskIoU parity', maxIoUDelta < 1e-9, `max |bench-port| maskIoU delta = ${maxIoUDelta.toExponential(3)}, expected < 1e-9`)

// silhouetteIoU end-to-end (STL bytes in) parity.
let maxSilDelta = 0
for (const pose of poseNames) {
  const benchV = benchSilhouetteIoU(bishop.buf, spike.buf, pose)
  const portV = portSilhouetteIoU(bishop.ab, spike.ab, pose)
  maxSilDelta = Math.max(maxSilDelta, Math.abs(benchV - portV))
}
check('silhouetteIoU parity', maxSilDelta < 1e-9, `max |bench-port| silhouetteIoU delta = ${maxSilDelta.toExponential(3)}, expected < 1e-9`)

// (3) empty-safe contract parity.
check(
  'empty-safe parity',
  benchMaskIoU(null, null) === 0 &&
    portMaskIoU(null, null) === 0 &&
    Object.keys(portRenderMasks(new ArrayBuffer(0))).length === 0 &&
    portSilhouetteIoU(new ArrayBuffer(0), bishop.ab) === 0,
  'empty STL / null masks must score 0 and return {} in the port too',
)

const selfFront = portSilhouetteIoU(bishop.ab, bishop.ab, 'front')
const crossFront = portSilhouetteIoU(bishop.ab, spike.ab, 'front')
console.log(
  `  parity OK — maskIoU Δ=${maxIoUDelta.toExponential(2)}, silhouetteIoU Δ=${maxSilDelta.toExponential(2)}; ` +
    `port self(front)=${selfFront.toFixed(3)}, port cross(front)=${crossFront.toFixed(3)}`,
)

if (failures.length) {
  for (const f of failures) console.error(`x ${f}`)
  console.error(`\n[silhouette-live.selftest] FAIL — ${failures.length} check(s)`)
  process.exit(1)
}
console.log('silhouette-live.selftest: OK')
process.exit(0)

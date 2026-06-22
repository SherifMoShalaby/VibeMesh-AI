/**
 * Zero-API ratchet for Lever A (silhouette-trace). The prompt now asks the model to TRACE a
 * defining 2D outline off a reference and ride it through the program as an inert traced-polygon
 * constant. That constant must NOT corrupt the Customizer slider parser (src/lib/params.ts) and
 * must NOT force faceting onto a canonical functional part. Compile harness: bench/skills.selftest.mjs.
 *
 *   tsx bench/trace.selftest.mjs   → exit 0 (all pass) / 1 (a guard tripped)
 */
import assert from 'node:assert/strict'
import { parseParameters } from '../src/lib/params.ts'
import { SYSTEM_PROMPT } from '../server/prompt.mjs'
import { createOpenSCAD } from 'openscad-wasm'

const cases = []
const test = (name, fn) => cases.push({ name, fn })

async function compileTris(code) {
  // identical pattern to bench/skills.selftest.mjs
  const o = await createOpenSCAD({ noInitialRun: true, print: () => {}, printErr: () => {} })
  const inst = o.getInstance()
  inst.FS.writeFile('/in.scad', code)
  try { inst.callMain(['/in.scad', '-o', '/out.stl', '--export-format=binstl', '--backend=Manifold']) } catch { /* compile error → no geometry */ }
  try {
    const stl = inst.FS.readFile('/out.stl', { encoding: 'binary' })
    return stl && stl.length ? new DataView(stl.buffer, stl.byteOffset, stl.byteLength).getUint32(80, true) : 0
  } catch { return 0 }
}

// SHIPPABLE shape: SINGLE-LINE _prof BELOW the Customizer block, NO global $fn (obeys the clause + the prompt's no-global-$fn rule).
const TRACED_EXEMPLAR = [
  '// [Bishop]',
  'facets = 8;            // [3:24]',
  'finial_r = 2.8;        // [1:0.1:6]',
  '_prof = [[0,0],[12.5,0],[12.0,3],[8.5,5.5],[5.2,8],[3.6,13],[4.6,17],[6.9,25],[5.6,33],[3.7,40],[5.3,42],[3.2,44],[4.2,47],[7.3,51],[6.6,56],[3.0,60],[0,60]];',
  'rotate_extrude($fn=facets) polygon(_prof);',
  'translate([0,0,61]) sphere(r=finial_r,$fn=facets);',
].join('\n')
const TRACE_BELOW_SINGLELINE = [
  'width = 10;   // [5:50]', 'depth = 4;    // [1:20]',
  '_prof = [[0,0],[12.5,0],[5.2,8],[3.0,60],[0,60]];',
  'height = 20;  // [5:50]', 'linear_extrude(depth) square([width,height]);',
].join('\n')
const TRACE_INSIDE_MULTILINE = [
  'width = 10;   // [5:50]', 'depth = 4;    // [1:20]',
  'prof = [', '  [0,0],[12.5,0],', '  [3.0,60],[0,60]', '];',
  'height = 20;  // [5:50]', 'linear_extrude(depth) square([width,height]);',
].join('\n')
const CANONICAL_BRACKET = [
  '// [Bracket]', 'arm = 40;        // [20:80]', 'thickness = 4;   // [2:0.5:10]', 'hole = 3.4;      // [2:0.1:8]',
  'difference() { union() { cube([arm,thickness,arm/2]); cube([thickness,thickness,arm]); }',
  '  translate([arm/2,thickness+1,arm/4]) rotate([90,0,0]) cylinder(h=thickness+2,d=hole,$fn=24); }',
].join('\n')

test('(a) traced-profile exemplar compiles to non-empty geometry', async () => {
  const tris = await compileTris(TRACED_EXEMPLAR)
  assert.ok(tris > 0, `rotate_extrude(polygon(_prof)) must yield geometry; got ${tris} tris`)
})
test('(b) parseParameters surfaces NO _prof as a slider, keeps the real knobs', () => {
  const names = parseParameters(TRACED_EXEMPLAR).map((p) => p.name)
  assert.ok(!names.some((n) => /prof/i.test(n)), `traced polygon must stay inert; got ${JSON.stringify(names)}`)
  assert.deepEqual(names, ['facets', 'finial_r'])
})
test('(c) sliders below a SINGLE-LINE traced constant SURVIVE (clause placement honored)', () => {
  const names = parseParameters(TRACE_BELOW_SINGLELINE).map((p) => p.name)
  assert.deepEqual(names, ['width', 'depth', 'height'], 'every slider, incl. height below the polygon, survives')
})
test('(c2) KNOWN-LIMITATION change-detector: multi-line in-block prof truncates — FLIP ME if params.ts gains multi-line tolerance', () => {
  const full = parseParameters(TRACE_BELOW_SINGLELINE).map((p) => p.name) // the same sliders, placed safely
  const trunc = parseParameters(TRACE_INSIDE_MULTILINE).map((p) => p.name)
  assert.ok(trunc.length < full.length, 'an INSIDE multi-line vector still truncates sliders below it (params.ts break)')
  assert.ok(!trunc.includes('height'), 'specifically, height is eaten — this is the hazard the clause prevents')
})
test('(d) MOAT: a canonical bracket parses cleanly, carries NO _prof / trace tokens', () => {
  const names = parseParameters(CANONICAL_BRACKET).map((p) => p.name)
  assert.deepEqual(names, ['arm', 'thickness', 'hole'])
  assert.ok(!/_prof|polygon\(|rotate_extrude/.test(CANONICAL_BRACKET), 'no traced outline forced onto a canonical form')
})
test('(e) PROMPT GUARD: the trace clause + its three mandates are present in SYSTEM_PROMPT', () => {
  assert.ok(/Trace the defining outline/i.test(SYSTEM_PROMPT), 'trace section header present')
  assert.ok(/SINGLE-LINE/i.test(SYSTEM_PROMPT) && /BELOW the Customizer parameter block/i.test(SYSTEM_PROMPT),
    'single-line + below-block placement mandate present')
  assert.ok(/fall back to the canonical/i.test(SYSTEM_PROMPT), 'graceful-fallback mandate present')
  assert.ok(/trace ONLY a non-canonical outline/i.test(SYSTEM_PROMPT), 'moat (non-canonical-only) mandate present')
})

let failed = 0
for (const { name, fn } of cases) {
  try { await fn() } catch (err) { failed++; console.error(`✗ ${name}\n    ${err.message}`) }
}
if (failed) { console.error(`\n[trace.selftest] FAIL — ${failed}/${cases.length}`); process.exit(1) }
console.log(`[trace.selftest] PASS — ${cases.length} cases: exemplar compiles, _prof inert, single-line-below survives while multi-line-inside truncates, canonical part untouched, prompt mandates present.`)
process.exit(0)

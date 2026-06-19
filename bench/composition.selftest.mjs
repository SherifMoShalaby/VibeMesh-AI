/**
 * Zero-API composition probe (P7) — the walker over server/composed.mjs fixtures. For each
 * composed exemplar: (1) it COMPILES to geometry; (2) it exposes exactly ONE Customizer parameter
 * per shared concept (clearance, wall); (3) its `_debug` protected-structure ∩ cutters ≈ 0
 * (interferenceVol); and a deliberately-broken control is CAUGHT for both (2) (a duplicated
 * clearance param) and (3) (a pocket deepened to slice the protected pin). Runs ahead of bench:gate.
 *
 *   node bench/composition.selftest.mjs
 */
import { createOpenSCAD } from 'openscad-wasm'
import { COMPOSED } from '../server/composed.mjs'
import { interferenceVol, interferenceScore } from './interference.mjs'

const CLEARANCE_RE = /(clear|fit|tol|gap)/i
const WALL_RE = /(wall|thick)/i

async function compileTris(code) {
  const o = await createOpenSCAD({ noInitialRun: true, print: () => {}, printErr: () => {} })
  const inst = o.getInstance()
  inst.FS.writeFile('/in.scad', code)
  try { inst.callMain(['/in.scad', '-o', '/out.stl', '--export-format=binstl', '--backend=Manifold']) } catch { /* no geometry below */ }
  try { const s = inst.FS.readFile('/out.stl', { encoding: 'binary' }); return s && s.length ? new DataView(s.buffer, s.byteOffset, s.byteLength).getUint32(80, true) : 0 } catch { return 0 }
}

/** Count top-of-file numeric Customizer params whose name matches a concept family. */
function conceptParams(code, re) {
  const names = []
  for (const raw of code.split('\n')) {
    const line = raw.trim()
    if (/^(module|function)\b/.test(line)) break
    const m = /^([A-Za-z_]\w*)\s*=\s*-?\d/.exec(line)
    if (m && !m[1].startsWith('$') && re.test(m[1])) names.push(m[1])
  }
  return names
}

let fail = 0
for (const [id, fx] of Object.entries(COMPOSED)) {
  const tris = await compileTris(fx.exemplar)
  if (!tris) { console.error(`  ${id.padEnd(12)} ✗ exemplar FAILED to compile`); fail++; continue }

  const clears = conceptParams(fx.exemplar, CLEARANCE_RE)
  const walls = conceptParams(fx.exemplar, WALL_RE)
  if (clears.length !== 1) { console.error(`  ${id.padEnd(12)} ✗ expected ONE clearance param, found [${clears.join(', ')}]`); fail++; continue }
  if (walls.length !== 1) { console.error(`  ${id.padEnd(12)} ✗ expected ONE wall param, found [${walls.join(', ')}]`); fail++; continue }

  const vol = await interferenceVol(fx.exemplar)
  const score = interferenceScore(vol)
  if (vol === null || score < 1) { console.error(`  ${id.padEnd(12)} ✗ interference overlap = ${vol} mm³ (score ${score}); protected structure is sliced`); fail++; continue }

  // CONTROL (2): a duplicated clearance param must be caught by the one-param-per-concept check
  const dupClear = fx.exemplar.replace(/(\nclearance = [\d.]+;[^\n]*)/, '$1\nextra_fit = 0.2;')
  if (conceptParams(dupClear, CLEARANCE_RE).length <= 1) { console.error(`  ${id.padEnd(12)} ✗ duplicate-clearance control NOT caught`); fail++; continue }

  // CONTROL (3): a pocket deepened to slice the pin must blow the interference probe
  const deepPocket = fx.exemplar.replace(/pocket_h = wall - 0\.8;/, 'pocket_h = wall + pin_len;')
  const brokenVol = await interferenceVol(deepPocket)
  if (!(brokenVol > 2)) { console.error(`  ${id.padEnd(12)} ✗ pocket-slices-pin control NOT caught (overlap ${brokenVol} mm³)`); fail++; continue }

  console.log(`  ${id.padEnd(12)} ✓ compiles (${tris} tris) · ONE clearance/wall · interference ${vol.toFixed(2)}mm³≈0 · both controls caught`)
}
console.log(fail ? `[composition] SELFTEST FAIL (${fail})` : '[composition] SELFTEST PASS — composed exemplars merge shared params, mate, and the probe discriminates.')
process.exit(fail ? 1 : 0)

/**
 * Coil-spring render-budget verdict (P4) — the helix is the heaviest skill exemplar, so the plan
 * gated it on a MEASURED render cost across all four quality presets rather than shipping blind.
 * Renders SKILLS['coil-spring'].exemplar at each preset's $fa/$fs (same -D the app injects) and
 * reports render time + triangle count, then a ship / coarse-approximation / defer verdict.
 *
 *   node bench/coilspring-verdict.mjs
 */
import { createOpenSCAD } from 'openscad-wasm'
import { SKILLS } from '../server/skills.mjs'

// the app's quality presets (docs/SPEC.md §5): root-scope -D '$fn=0' -D $fa -D $fs
const PRESETS = [
  { name: 'Draft', fa: 12, fs: 2 },
  { name: 'Standard', fa: 4, fs: 0.8 },
  { name: 'Fine', fa: 3, fs: 0.4 },
  { name: 'Ultra', fa: 1.5, fs: 0.25 },
]

async function render(code, fa, fs) {
  const o = await createOpenSCAD({ noInitialRun: true, print: () => {}, printErr: () => {} })
  const inst = o.getInstance()
  inst.FS.writeFile('/in.scad', code)
  const t0 = Date.now()
  try {
    inst.callMain(['/in.scad', '-o', '/out.stl', '--export-format=binstl', '--backend=Manifold', '-D', '$fn=0', '-D', `$fa=${fa}`, '-D', `$fs=${fs}`])
  } catch { /* errors → 0 tris below */ }
  const ms = Date.now() - t0
  let tris = 0
  try { const s = inst.FS.readFile('/out.stl', { encoding: 'binary' }); tris = s && s.length ? new DataView(s.buffer, s.byteOffset, s.byteLength).getUint32(80, true) : 0 } catch { /* none */ }
  return { ms, tris }
}

const code = SKILLS['coil-spring'].exemplar
console.log('[coil-spring] render-budget across quality presets (Manifold backend):')
let ultraMs = 0
let allOk = true
for (const p of PRESETS) {
  const { ms, tris } = await render(code, p.fa, p.fs)
  if (!tris) allOk = false
  if (p.name === 'Ultra') ultraMs = ms
  console.log(`  ${p.name.padEnd(9)} $fa=${p.fa} $fs=${p.fs} → ${tris} tris in ${ms}ms${tris ? '' : '  (NO GEOMETRY)'}`)
}
// the worker watchdog terminates a render at 90s; a healthy ship is well under that at Ultra
const verdict = !allOk ? 'DEFER (a preset produced no geometry)' : ultraMs < 8000 ? 'SHIP (renders comfortably under the 90s worker watchdog at every preset)' : ultraMs < 60000 ? 'SHIP-WITH-CAUTION (Ultra is heavy; the auto-retry-at-Draft fallback covers timeouts)' : 'COARSE-APPROXIMATION (cap turns/$fn in the exemplar)'
console.log(`[coil-spring] VERDICT: ${verdict}`)

/**
 * Zero-API skills-registry walker — the engine-free gate for the skills program.
 * For every skill with an exemplar: (1) the exemplar COMPILES to real geometry,
 * (2) its own validate() passes on it, (3) a clearance-broken control (every named
 * fit clearance stripped) is CAUGHT by the validator. Runs ahead of bench:gate.
 *
 *   node bench/skills.selftest.mjs
 */
import { SKILLS } from '../server/skills.mjs'
import { createOpenSCAD } from 'openscad-wasm'

async function compileTris(code) {
  const o = await createOpenSCAD({ noInitialRun: true, print: () => {}, printErr: () => {} })
  const inst = o.getInstance()
  inst.FS.writeFile('/in.scad', code)
  try { inst.callMain(['/in.scad', '-o', '/out.stl', '--export-format=binstl', '--backend=Manifold']) } catch { /* compile error → no geometry, caught below */ }
  try {
    const stl = inst.FS.readFile('/out.stl', { encoding: 'binary' })
    return stl && stl.length ? new DataView(stl.buffer, stl.byteOffset, stl.byteLength).getUint32(80, true) : 0
  } catch { return 0 }
}

let fail = 0
for (const [id, skill] of Object.entries(SKILLS)) {
  if (!skill.exemplar) { console.log(`  ${id.padEnd(14)} no exemplar (skip)`); continue }
  const tris = await compileTris(skill.exemplar)
  if (!tris) { console.error(`  ${id.padEnd(14)} ✗ exemplar FAILED to compile / no geometry`); fail++; continue }
  const ownIssues = skill.validate ? skill.validate(skill.exemplar) : []
  if (ownIssues.length) { console.error(`  ${id.padEnd(14)} ✗ validator flags its OWN exemplar: ${ownIssues.join('; ')}`); fail++; continue }
  let caught = true
  if (skill.validate) {
    // each skill may define how to break its OWN discipline (web too thick, zero hook
    // overlap, …); else fall back to stripping named clearances (fits/bores).
    const broken = skill.brokenControl ? skill.brokenControl(skill.exemplar) : skill.exemplar.replace(/\s*\+\s*\w*(fit|clr|clearance|gap)\b/gi, '')
    caught = skill.validate(broken).length > 0
  }
  if (!caught) { console.error(`  ${id.padEnd(14)} ✗ validator did NOT catch the clearance-broken control`); fail++; continue }
  // P7: every paramAlias must name a parameter that actually appears in the exemplar's header
  let aliasBad = ''
  for (const [concept, param] of Object.entries(skill.paramAliases ?? {})) {
    if (!new RegExp(`(^|\\n)\\s*${param}\\s*=`).test(skill.exemplar)) aliasBad = `${concept}→${param} (not a parameter in the exemplar)`
  }
  if (aliasBad) { console.error(`  ${id.padEnd(14)} ✗ paramAlias ${aliasBad}`); fail++; continue }
  console.log(`  ${id.padEnd(14)} ✓ compiles (${tris} tris) · validates · catches broken control`)
}
console.log(fail ? `[skills] SELFTEST FAIL (${fail})` : '[skills] SELFTEST PASS — every exemplar compiles, validates, and its validator catches a broken control.')
process.exit(fail ? 1 : 0)

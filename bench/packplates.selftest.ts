/**
 * Deterministic self-test for the slicer packer's rescue-only rotation (run via tsx — the app has
 * no test runner). Guards the feasibility win the senior-expert study identified: a part drawn
 * portrait that doesn't fit a non-square bed as-drawn must be RESCUED by a 90° spin, while a part
 * whose long side exceeds the bed in BOTH orientations stays oversize. Run: npm run test:pack
 */
import { packPlates } from '../src/lib/packPlates.ts'

let failures = 0
function check(label: string, cond: boolean, detail = '') {
  if (cond) console.log(`  ok   ${label}`)
  else {
    failures++
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

const MK4S = { x: 250, y: 210, z: 220 } // non-square (usable 238×198 at gap 6)
const ENDER = { x: 220, y: 220, z: 250 } // square (usable 208×208)

// 1) RESCUE: a portrait part (30×215) doesn't fit MK4S as-drawn (215 > 198) but fits rotated
//    (215 ≤ 238, 30 ≤ 198). It must be placed, rotated, and NOT oversize.
{
  const plan = packPlates([{ name: 'rail', w: 30, h: 215, z: 5 }], MK4S)
  const placed = plan.plates.flat().find((p) => p.name === 'rail')
  check('rescue: portrait rail placed on MK4S', !!placed && plan.oversize.length === 0)
  check('rescue: marked rot=90', placed?.rot === 90, `rot=${placed?.rot}`)
  check('rescue: footprint swapped to 215×30', placed?.w === 215 && placed?.h === 30, `w=${placed?.w} h=${placed?.h}`)
}

// 2) SQUARE bed can't rescue: same rail on the Ender (208 usable both axes) — 215 > 208 either way.
{
  const plan = packPlates([{ name: 'rail', w: 30, h: 215, z: 5 }], ENDER)
  check('square: rail is oversize on Ender (no rotation helps)', plan.plates.flat().length === 0 && plan.oversize.some((o) => o.name === 'rail' && o.reason === 'footprint'))
}

// 3) A part that fits as-drawn keeps rot=0 (no needless reorientation).
{
  const plan = packPlates([{ name: 'plate', w: 100, h: 80, z: 3 }], ENDER)
  const placed = plan.plates.flat().find((p) => p.name === 'plate')
  check('as-drawn fit stays rot=0', placed?.rot === 0 && placed?.w === 100 && placed?.h === 80)
}

// 4) Oversize in BOTH orientations → footprint oversize.
{
  const plan = packPlates([{ name: 'huge', w: 300, h: 300, z: 5 }], ENDER)
  check('huge part oversize (both orientations)', plan.plates.flat().length === 0 && plan.oversize.some((o) => o.name === 'huge' && o.reason === 'footprint'))
}

// 5) Too tall → height oversize regardless of XY (a Z-spin can't lower it).
{
  const plan = packPlates([{ name: 'tall', w: 50, h: 50, z: 300 }], ENDER)
  check('too-tall part is height-oversize', plan.oversize.some((o) => o.name === 'tall' && o.reason === 'height'))
}

// 6) Determinism: identical input → byte-identical plan.
{
  const input = [
    { name: 'a', w: 30, h: 215, z: 5 },
    { name: 'b', w: 100, h: 80, z: 3 },
    { name: 'c', w: 60, h: 60, z: 4 },
  ]
  const a = JSON.stringify(packPlates(input, MK4S))
  const b = JSON.stringify(packPlates(input, MK4S))
  check('deterministic: same input → same plan', a === b)
}

if (failures) {
  console.error(`\n[packplates] FAIL — ${failures} check(s) failed.`)
  process.exit(1)
}
console.log('\n[packplates] PASS — rescue rotation, oversize semantics, and determinism all hold.')

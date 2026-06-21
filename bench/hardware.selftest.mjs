/**
 * Zero-API ratchet for the metal-hardware catalog (server/hardware.mjs) — the single
 * source of truth for fastener/bearing dims. Catalog values are load-bearing: a wrong
 * clearance ships a part that will not accept the screw. This guards:
 *   1. internal consistency (clearance/insert/head/nut all exceed the nominal; monotonic
 *      across sizes; bearings od>id>0),
 *   2. exemplar↔catalog drift (the fastener table + 608 pocket in the skill exemplars
 *      must equal the catalog, parsed NUMERICALLY so 5.0≡5),
 *   3. the validator reads the catalog (a wrong 608 OD is caught),
 *   4. the bill-of-materials detector + the contextText hardware directive.
 *
 *   node bench/hardware.selftest.mjs   → exit 0 (all pass) / 1 (a guard tripped)
 */
import assert from 'node:assert/strict'
import { SCREWS, BEARINGS, FASTENER_SET, billOfMaterials, screwSpec, bearingSpec, hasHardwareToken, counterboreDia } from '../server/hardware.mjs'
import { SKILLS } from '../server/skills.mjs'
import { hardwareDirective } from '../server/providers.mjs'
import { SYSTEM_PROMPT } from '../server/prompt.mjs'

let passed = 0
const cases = []
const test = (name, fn) => cases.push({ name, fn })

const near = (a, b, tol = 0.001) => Math.abs(a - b) <= tol

/* ── 1. catalog consistency ── */
test('every screw spec is finite, positive, and physically sane', () => {
  for (const [name, s] of Object.entries(SCREWS)) {
    for (const [k, v] of Object.entries(s)) assert.ok(Number.isFinite(v) && v > 0, `${name}.${k} must be > 0, got ${v}`)
    assert.ok(s.clearance > s.nominal, `${name}: clearance ${s.clearance} must exceed nominal ${s.nominal}`)
    assert.ok(s.tap < s.nominal, `${name}: tap drill ${s.tap} must be below nominal ${s.nominal}`)
    assert.ok(s.insertDia > s.nominal, `${name}: heat-set pocket ${s.insertDia} must exceed nominal ${s.nominal}`)
    assert.ok(s.headDia > s.nominal, `${name}: head Ø ${s.headDia} must exceed nominal ${s.nominal}`)
    assert.ok(s.nutAF > s.nominal, `${name}: nut AF ${s.nutAF} must exceed nominal ${s.nominal}`)
  }
})

test('screw dimensions are monotonic across sizes', () => {
  const sorted = Object.values(SCREWS).sort((a, b) => a.nominal - b.nominal)
  for (const key of ['clearance', 'tap', 'headDia', 'headHeight', 'nutAF', 'nutThick', 'insertDia']) {
    for (let i = 1; i < sorted.length; i++) {
      assert.ok(sorted[i][key] >= sorted[i - 1][key], `${key} must not decrease as the screw grows (${sorted[i - 1][key]} → ${sorted[i][key]})`)
    }
  }
})

test('bearings have od > id > 0 and a positive width', () => {
  for (const [name, b] of Object.entries(BEARINGS)) {
    assert.ok(b.id > 0 && b.od > b.id && b.w > 0, `bearing ${name}: expected od>id>0, w>0, got ${JSON.stringify(b)}`)
  }
})

/* ── 2. exemplar ↔ catalog drift (the numbers in the teaching exemplars must equal the catalog) ── */
test('fastener exemplar table equals the catalog (parsed numerically)', () => {
  const exemplar = SKILLS['threaded-fastener-seat'].exemplar
  const tuples = [...exemplar.matchAll(/\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]/g)].map((m) => m.slice(1).map(Number))
  assert.equal(tuples.length, FASTENER_SET.length, `expected ${FASTENER_SET.length} table rows, found ${tuples.length}`)
  FASTENER_SET.forEach((name, i) => {
    const s = SCREWS[name]
    const [clear, insert, af, thick] = tuples[i]
    assert.ok(near(clear, s.clearance), `${name} clearance: exemplar ${clear} vs catalog ${s.clearance}`)
    assert.ok(near(insert, s.insertDia), `${name} insert: exemplar ${insert} vs catalog ${s.insertDia}`)
    assert.ok(near(af, s.nutAF), `${name} nutAF: exemplar ${af} vs catalog ${s.nutAF}`)
    assert.ok(near(thick, s.nutThick), `${name} nutThick: exemplar ${thick} vs catalog ${s.nutThick}`)
  })
})

test('608 bearing exemplar equals the catalog', () => {
  const exemplar = SKILLS['bearing-608-pocket'].exemplar
  const b = BEARINGS['608']
  assert.ok(exemplar.includes(`od = ${b.od}`), `exemplar must declare od = ${b.od}`)
  assert.ok(exemplar.includes(`id = ${b.id}`), `exemplar must declare id = ${b.id}`)
  assert.ok(exemplar.includes(`w = ${b.w}`), `exemplar must declare w = ${b.w}`)
})

/* ── 3. validator reads the catalog ── */
test('bearing validator passes the real exemplar and catches a wrong OD', () => {
  const skill = SKILLS['bearing-608-pocket']
  assert.deepEqual(skill.validate(skill.exemplar), [], 'the catalog-correct exemplar must validate clean')
  const broken = skill.brokenControl(skill.exemplar)
  const issues = skill.validate(broken)
  assert.ok(issues.some((i) => /608 standard is 22mm/.test(i)), `a wrong OD must be flagged against the catalog; got ${JSON.stringify(issues)}`)
})

/* ── 4. bill-of-materials detector + accessors + directive ── */
test('billOfMaterials detects screws and bearings with catalog dims, dedupes, and ignores plain shapes', () => {
  const bom = billOfMaterials('a bracket with M3 screws bolted into a block holding a 608 bearing')
  const screw = bom.find((b) => b.kind === 'screw')
  const bearing = bom.find((b) => b.kind === 'bearing')
  assert.equal(screw?.id, 'M3')
  assert.ok(near(screw.spec.clearance, 3.4))
  assert.equal(bearing?.id, '608')
  assert.ok(near(bearing.spec.od, 22))

  assert.deepEqual(billOfMaterials('a plain 40 x 20 x 10 mm box'), [], 'a design with no hardware yields no BOM')
  assert.equal(billOfMaterials('M3 M3 M3 everywhere').filter((b) => b.id === 'M3').length, 1, 'duplicates collapse to one entry')

  const insert = billOfMaterials('an M5 heat-set insert boss')[0]
  assert.ok(/insert pocket Ø6.4/.test(insert.note), `M5 insert note should cite the catalog pocket Ø; got ${insert.note}`)
})

test('screwSpec / bearingSpec / hasHardwareToken normalize tokens', () => {
  assert.equal(screwSpec('m3'), 'M3')
  assert.equal(screwSpec('use an M2.5 here'), 'M2.5')
  assert.equal(screwSpec('M9'), null)
  assert.equal(screwSpec('nothing'), null)
  assert.equal(bearingSpec('608'), '608')
  assert.equal(bearingSpec('a box'), null)
  assert.equal(hasHardwareToken('M4 bolt'), true)
  assert.equal(hasHardwareToken('a plain box'), false)
})

test('hasHardwareToken is idempotent (the /g regexes do not leak lastIndex across calls)', () => {
  // a /g regex with .test() advances lastIndex — without a reset, the 2nd call would flip to false
  assert.equal(hasHardwareToken('M4 bolt'), true)
  assert.equal(hasHardwareToken('M4 bolt'), true, 'repeated screw check must stay true')
  assert.equal(hasHardwareToken('a 608 bearing'), true)
  assert.equal(hasHardwareToken('a 608 bearing'), true, 'repeated bearing check must stay true')
  assert.equal(hasHardwareToken('a plain box'), false)
  assert.equal(hasHardwareToken('a plain box'), false)
})

test('counterboreDia is catalog-derived (exceeds the head Ø) and the prompt cites it (single source)', () => {
  for (const key of ['M3', 'M4', 'M5']) {
    assert.ok(counterboreDia(key) > SCREWS[key].headDia, `${key} counterbore must clear the head Ø ${SCREWS[key].headDia}`)
    assert.ok(SYSTEM_PROMPT.includes(`${key} ⌀${counterboreDia(key)}`), `the prompt must cite the catalog-derived ${key} counterbore ⌀${counterboreDia(key)}`)
  }
})

test('hardwareDirective injects exact dims for named hardware, nothing otherwise', () => {
  const d = hardwareDirective({ prompt: 'a wall bracket with an M3 screw' })
  assert.ok(/Real hardware dimensions/.test(d) && /3\.4/.test(d), `directive must cite the M3 clearance; got: ${d}`)
  assert.equal(hardwareDirective({ prompt: 'a plain hexagonal coaster' }), '', 'no hardware token → no directive')
  assert.equal(hardwareDirective({}), '', 'missing prompt → no directive')
})

/* ── run ── */
let failed = 0
for (const { name, fn } of cases) {
  try {
    fn()
    passed++
  } catch (err) {
    failed++
    console.error(`✗ ${name}\n    ${err.message}`)
  }
}
if (failed) {
  console.error(`\n[hardware.selftest] FAIL — ${failed}/${cases.length} case(s) failed.`)
  process.exit(1)
}
console.log(`[hardware.selftest] PASS — ${passed} case(s): catalog consistency, exemplar-drift, validator, BOM, directive.`)
process.exit(0)

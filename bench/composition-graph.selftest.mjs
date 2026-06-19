/**
 * Zero-API ratchet for the composition PORT GRAPH (server/skills.mjs composePlan + SKILL_PORTS).
 * The port graph turns N hand-authored composed exemplars into derived mates, so it must stay
 * internally consistent (no dangling port types / unknown skill ids) and produce the right mates
 * for known pairs. No API, no WASM; runs ahead of bench:gate.
 *
 *   node bench/composition-graph.selftest.mjs   → exit 0 / 1
 */
import assert from 'node:assert/strict'
import { SKILLS, SKILL_PORTS, PORT_TYPES, composePlan } from '../server/skills.mjs'

let passed = 0
const cases = []
const test = (name, fn) => cases.push({ name, fn })

/* ── graph consistency ── */
test('every port-graph entry references a real, non-quarantined skill', () => {
  for (const id of Object.keys(SKILL_PORTS)) {
    assert.ok(SKILLS[id], `SKILL_PORTS references unknown skill "${id}"`)
    assert.ok(!SKILLS[id].quarantine, `SKILL_PORTS references quarantined skill "${id}"`)
  }
})
test('every declared port is a known PORT_TYPE', () => {
  const known = new Set(PORT_TYPES)
  for (const [id, p] of Object.entries(SKILL_PORTS)) {
    for (const port of [...(p.provides ?? []), ...(p.consumes ?? [])]) {
      assert.ok(known.has(port), `${id} uses unknown port "${port}"`)
    }
  }
})
test('every consumable port has at least one provider in the graph (no dead consumers)', () => {
  const provided = new Set()
  for (const p of Object.values(SKILL_PORTS)) for (const port of p.provides ?? []) provided.add(port)
  const consumed = new Set()
  for (const p of Object.values(SKILL_PORTS)) for (const port of p.consumes ?? []) consumed.add(port)
  for (const port of consumed) assert.ok(provided.has(port), `port "${port}" is consumed but never provided`)
})
test('any conflictsWith entries reference real skills', () => {
  for (const [id, skill] of Object.entries(SKILLS)) {
    for (const other of skill.conflictsWith ?? []) assert.ok(SKILLS[other], `${id}.conflictsWith references unknown "${other}"`)
  }
})

/* ── composePlan derivations ── */
test('wheel-axle + bearing → a shaft mate (slide fit)', () => {
  const { mates } = composePlan(['wheel-axle', 'bearing-608-pocket'])
  const m = mates.find((x) => x.port === 'shaft')
  assert.ok(m, 'expected a shaft mate')
  assert.equal(m.fit, 'slide')
  assert.deepEqual([m.provider, m.consumer].sort(), ['bearing-608-pocket', 'wheel-axle'])
})
test('two gears → a mesh mate', () => {
  const { mates } = composePlan(['spur-gear', 'rack-pinion'])
  assert.ok(mates.some((m) => m.port === 'mesh'), 'gears should mesh')
})
test('coil-spring + button-return → a spring mate', () => {
  const { mates } = composePlan(['coil-spring', 'button-return'])
  const m = mates.find((x) => x.port === 'spring')
  assert.ok(m && m.consumer === 'button-return' && m.provider === 'coil-spring')
})
test('snap-fit + fit-pair → a peg/socket mate', () => {
  const { mates } = composePlan(['snap-fit', 'fit-pair'])
  assert.ok(mates.some((m) => m.port === 'peg' || m.port === 'socket'))
})
test('a single skill yields no mates', () => {
  assert.deepEqual(composePlan(['spur-gear']).mates, [])
})
test('mates are unordered-deduped (no A→B and B→A duplicates for mesh)', () => {
  const { mates } = composePlan(['spur-gear', 'planetary'])
  const meshMates = mates.filter((m) => m.port === 'mesh')
  assert.equal(meshMates.length, 1, `expected 1 mesh mate, got ${meshMates.length}`)
})
test('skills without ports (kit-baseplate, living-hinge) contribute no mates', () => {
  assert.deepEqual(composePlan(['kit-baseplate', 'living-hinge']).mates, [])
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
  console.error(`\n[composition-graph] FAIL — ${failed}/${cases.length} case(s).`)
  process.exit(1)
}
console.log(`[composition-graph] PASS — ${passed} case(s): port-graph consistency + composePlan mate derivation.`)
process.exit(0)

/**
 * Zero-API retrieval gate: asserts prompt-intent → selectSkills() routing. Positive cases
 * (a named mechanism fires its skill), negative cases (a plain shape — or a bare "spring" —
 * fires NOTHING), the auto-cap, and skillIds precedence. Deterministic, no API. Runs ahead
 * of bench:gate so a sloppy trigger edit (over- or under-matching) trips before any live run.
 *
 *   node bench/retrieval.selftest.mjs
 */
import { selectSkills, MAX_AUTO_SKILLS } from '../server/skills.mjs'

const POSITIVE = [
  ['a toy car whose wheels roll on an axle', 'wheel-axle'],
  ['a two-gear reduction gearbox', 'spur-gear'],
  ['a rack and pinion steering linkage', 'rack-pinion'],
  ['a phone stand with a living hinge that folds flat', 'living-hinge'],
  ['a box lid on a print-in-place hinge', 'print-in-place-hinge'],
  ['a hinged enclosure', 'print-in-place-hinge'],
  ['a battery cover with snap-fit clips', 'snap-fit'],
  ['a cable tie with a ratchet and pawl', 'ratchet'],
  ['a button with a compression coil spring under it', 'coil-spring'],
  ['a clothes-peg leaf spring', 'leaf-spring'],
  ['a bracket with M3 screw holes and a captive nut trap', 'threaded-fastener-seat'],
  ['a fidget spinner that holds three 608 bearings', 'bearing-608-pocket'],
  ['a planetary gear reduction for a small motor', 'planetary'],
]

const NEGATIVE = [
  'a rectangular box 40 x 20 x 10 mm',
  'a hexagonal coaster',
  'a simple desk nameplate',
  'a spring water bottle holder', // bare "spring" must NOT fire coil/leaf
]

let fail = 0
const mark = (ok) => (ok ? '✓' : '✗')

for (const [prompt, want] of POSITIVE) {
  const got = selectSkills({ prompt })
  const ok = got.includes(want)
  if (!ok) fail++
  console.log(`  ${mark(ok)} "${prompt.slice(0, 44)}" → [${got.join(', ') || '—'}]  (want ${want})`)
}
for (const prompt of NEGATIVE) {
  const got = selectSkills({ prompt })
  const ok = got.length === 0
  if (!ok) fail++
  console.log(`  ${mark(ok)} (neg) "${prompt.slice(0, 44)}" → [${got.join(', ') || '—'}]  (want none)`)
}

// cap: a prompt that name-drops many mechanisms must not balloon the prompt
const capGot = selectSkills({ prompt: 'a geared, hinged, snap-fit, ratcheting, wheeled gizmo with a pinion and clips' })
const capOk = capGot.length <= MAX_AUTO_SKILLS
if (!capOk) fail++
console.log(`  ${mark(capOk)} cap: many mechanisms → ${capGot.length} skill(s) [${capGot.join(', ')}] (max ${MAX_AUTO_SKILLS})`)

// explicit skillIds win outright (router / live-check), uncapped, prompt ignored
const pin = selectSkills({ skillIds: ['wheel-axle', 'spur-gear', 'ratchet', 'snap-fit'], prompt: 'a plain cube' })
const pinOk = pin.length === 4 && pin[0] === 'wheel-axle'
if (!pinOk) fail++
console.log(`  ${mark(pinOk)} skillIds precedence (uncapped, prompt ignored) → [${pin.join(', ')}]`)

// kit boolean still seeds the baseplate skill, and composes with prompt intent
const kit = selectSkills({ kit: true, prompt: 'a marble run with gears' })
const kitOk = kit[0] === 'kit-baseplate' && kit.includes('spur-gear')
if (!kitOk) fail++
console.log(`  ${mark(kitOk)} kit + intent → [${kit.join(', ')}]`)

console.log(fail ? `[retrieval] SELFTEST FAIL (${fail})` : '[retrieval] SELFTEST PASS — intent routing maps prompts to skills, ignores plain shapes, respects the cap and skillIds precedence.')
process.exit(fail ? 1 : 0)

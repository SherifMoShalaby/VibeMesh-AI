/**
 * Zero-API retrieval gate: asserts prompt-intent → selectSkills() routing. Positive cases
 * (a named mechanism fires its skill), negative cases (a plain shape — or a bare "spring" —
 * fires NOTHING), the auto-cap, and skillIds precedence. Deterministic, no API. Runs ahead
 * of bench:gate so a sloppy trigger edit (over- or under-matching) trips before any live run.
 *
 *   node bench/retrieval.selftest.mjs
 */
import { selectSkills, selectSkillsDetailed, MAX_AUTO_SKILLS, MAX_SKILLS, SKILLS } from '../server/skills.mjs'

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
  ['a GT2 pulley for a 20-tooth stepper', 'gt2-pulley'],
  ['a herringbone reduction gear', 'herringbone'],
  ['a peg and socket press-fit joint', 'fit-pair'],
  ['a bistable snap-through clicker', 'bistable'],
  ['a push button with a spring return', 'button-return'],
  // stylized FORM skills fire on the decorative form
  ['a decorative crown for a trophy topper', 'crown-coronet'],
  ['a chess rook with a crenellated battlement rim', 'hollow-crenellation'],
  ['a holder with open prongs cradling a marble', 'open-prong-cradle'],
]

const NEGATIVE = [
  'a rectangular box 40 x 20 x 10 mm',
  'a hexagonal coaster',
  'a simple desk nameplate',
  'a spring water bottle holder', // bare "spring" must NOT fire coil/leaf
  'a turret enclosure for a raspberry pi', // bare "turret" must NOT fire battlement styling
]

// functional homographs: the styling skill must NOT fire, but the real mechanism still must
const EXCLUDE = [
  ['a crown gear for a hand drill', 'crown-coronet', 'spur-gear'],
  ['a castle nut for an M6 bolt', 'hollow-crenellation', 'threaded-fastener-seat'],
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
for (const [prompt, banned, want] of EXCLUDE) {
  const got = selectSkills({ prompt })
  const ok = !got.includes(banned) && got.includes(want)
  if (!ok) fail++
  console.log(`  ${mark(ok)} (homograph) "${prompt.slice(0, 40)}" → [${got.join(', ') || '—'}]  (no ${banned}, has ${want})`)
}

// cap: a prompt that name-drops many mechanisms must not balloon the prompt
const capGot = selectSkills({ prompt: 'a geared, hinged, snap-fit, ratcheting, wheeled gizmo with a pinion and clips' })
const capOk = capGot.length <= MAX_AUTO_SKILLS
if (!capOk) fail++
console.log(`  ${mark(capOk)} cap: many mechanisms → ${capGot.length} skill(s) [${capGot.join(', ')}] (max ${MAX_AUTO_SKILLS})`)

// explicit skillIds win outright (router / live-check) — REPLACE, prompt ignored, but bounded
const pin = selectSkills({ skillIds: ['wheel-axle', 'spur-gear', 'ratchet', 'snap-fit'], prompt: 'a plain cube' })
const pinOk = pin.length === 4 && pin[0] === 'wheel-axle'
if (!pinOk) fail++
console.log(`  ${mark(pinOk)} skillIds precedence (REPLACE, prompt ignored) → [${pin.join(', ')}]`)

// explicit list is DEDUPED, usable-filtered, and capped at MAX_SKILLS (no unbounded prompt growth)
const dedup = selectSkills({ skillIds: ['snap-fit', 'snap-fit', 'wheel-axle', 'wheel-axle'] })
const dedupOk = dedup.length === 2 && dedup[0] === 'snap-fit' && dedup[1] === 'wheel-axle'
if (!dedupOk) fail++
console.log(`  ${mark(dedupOk)} explicit dedupe → [${dedup.join(', ')}]`)

const eightIds = ['wheel-axle', 'spur-gear', 'ratchet', 'snap-fit', 'bearing-608-pocket', 'living-hinge', 'planetary', 'gt2-pulley']
const capped = selectSkillsDetailed({ skillIds: eightIds })
const cappedOk = capped.selected.length === MAX_SKILLS && capped.dropped.length === eightIds.length - MAX_SKILLS
if (!cappedOk) fail++
console.log(`  ${mark(cappedOk)} explicit cap: ${eightIds.length} ids → ${capped.selected.length} kept + ${capped.dropped.length} dropped (max ${MAX_SKILLS})`)

// kit boolean still seeds the baseplate skill, and composes with prompt intent
const kit = selectSkills({ kit: true, prompt: 'a marble run with gears' })
const kitOk = kit[0] === 'kit-baseplate' && kit.includes('spur-gear')
if (!kitOk) fail++
console.log(`  ${mark(kitOk)} kit + intent → [${kit.join(', ')}]`)

// carry-forward: a follow-up that drops the keyword still retains the mechanism via the
// prior turn's carried intent.domainTags
const carried = selectSkills({ prompt: 'make it bigger', intent: { form: 'single', domainTags: ['gear'] } })
const carriedOk = carried.includes('spur-gear')
if (!carriedOk) fail++
console.log(`  ${mark(carriedOk)} carry-forward ("make it bigger" + prior tags [gear]) → [${carried.join(', ') || '—'}]`)

// no carried tags + a plain follow-up → still nothing (no spurious retention)
const plainFollowup = selectSkills({ prompt: 'make it 20mm taller' })
if (plainFollowup.length) fail++
console.log(`  ${mark(plainFollowup.length === 0)} plain follow-up, no carried tags → [${plainFollowup.join(', ') || '—'}]`)

// quarantine: a quarantined skill is NEVER selected — not via retrieval, not via explicit skillIds
SKILLS['spur-gear'].quarantine = true
const qAuto = selectSkills({ prompt: 'a two-gear gearbox' })
const qForced = selectSkills({ skillIds: ['spur-gear', 'snap-fit'] })
delete SKILLS['spur-gear'].quarantine
const qOk = !qAuto.includes('spur-gear') && !qForced.includes('spur-gear') && qForced.includes('snap-fit')
if (!qOk) fail++
console.log(`  ${mark(qOk)} quarantine: gearbox→[${qAuto.join(', ') || '—'}], forced→[${qForced.join(', ') || '—'}] (spur-gear excluded both)`)

// scored router: intent.domainTags corroboration RE-RANKS equal-prompt matches. "a hinge and a
// ratchet" ties on the prompt → array order leads with the hinge; carrying a ratchet intent tag
// lifts ratchet above it. (Proves the order is scored, not positional.)
const noBoost = selectSkills({ prompt: 'a part with a hinge and a ratchet' })
const boosted = selectSkills({ prompt: 'a part with a hinge and a ratchet', intent: { form: 'single', domainTags: ['ratchet', 'pawl'] } })
const rankOk = noBoost[0] === 'print-in-place-hinge' && boosted[0] === 'ratchet'
if (!rankOk) fail++
console.log(`  ${mark(rankOk)} intent corroboration re-ranks: no-boost [${noBoost.join(', ')}] → ratchet-tag [${boosted.join(', ')}]`)

// cap drops the LEAST RELEVANT, not the array tail. Four mechanisms tie → array order drops
// snap-fit (latest). Boost snap-fit via intent → it survives and an earlier, now-less-relevant
// skill (print-in-place-hinge) is the one dropped instead.
const capScored = selectSkillsDetailed({ prompt: 'a wheeled, geared, hinged, snap-fit gadget', intent: { form: 'single', domainTags: ['snap-fit'] } })
const capScoredOk = capScored.selected.includes('snap-fit') && capScored.dropped.includes('print-in-place-hinge')
if (!capScoredOk) fail++
console.log(`  ${mark(capScoredOk)} cap drops least-relevant: kept [${capScored.selected.join(', ')}], dropped [${capScored.dropped.join(', ')}]`)

// co-requirement: a wheel running on a bearing. bearing-608-pocket is the LATEST-indexed match,
// so the array-tail cap would drop it; the co-req edge floats it in alongside wheel-axle.
const coreq = selectSkillsDetailed({ prompt: 'a wheel on a 608 bearing with a snap-on cap, a ratchet brake, and a gear' })
const coreqOk = coreq.selected.includes('bearing-608-pocket') && coreq.selected.includes('wheel-axle')
if (!coreqOk) fail++
console.log(`  ${mark(coreqOk)} co-requirement keeps wheel+bearing together → [${coreq.selected.join(', ')}]`)

// the dropped set is OBSERVABLE (never a silent truncation)
const droppedObservable = coreq.dropped.length > 0
if (!droppedObservable) fail++
console.log(`  ${mark(droppedObservable)} dropped set surfaced → [${coreq.dropped.join(', ') || '—'}]`)

console.log(fail ? `[retrieval] SELFTEST FAIL (${fail})` : '[retrieval] SELFTEST PASS — scored intent routing ranks by relevance, drops least-relevant observably, keeps co-required pairs, and bounds the explicit set.')
process.exit(fail ? 1 : 0)

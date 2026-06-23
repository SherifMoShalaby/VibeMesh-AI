/**
 * Zero-API retrieval PRECISION/RECALL ratchet over a labeled prompt corpus. retrieval.selftest
 * asserts exact per-prompt sets; this gives the QUANTITATIVE signal the board asked for — so a
 * trigger/router edit that quietly drops a needed skill (recall ↓) or over-fires (precision ↓) is
 * caught as a number, not vibes. Micro-averaged over the corpus; floors below fail the gate.
 *
 *   node bench/retrieval-recall.mjs   → exit 0 (≥ floors) / 1 (regressed)
 */
import { selectSkillsDetailed } from '../server/skills.mjs'

// prompt → the skill id SET that SHOULD fire (incl. legitimate co-fires, e.g. pinion ⇒ spur-gear).
const CORPUS = [
  ['a toy car whose wheels roll on an axle', ['wheel-axle']],
  ['a two-gear reduction gearbox', ['spur-gear']],
  ['a rack and pinion steering linkage', ['rack-pinion', 'spur-gear']],
  ['a planetary gear reduction for a small motor', ['planetary', 'spur-gear']],
  ['a herringbone reduction gear', ['herringbone', 'spur-gear']],
  ['a GT2 pulley for a 20-tooth stepper', ['gt2-pulley']],
  ['a fidget spinner that holds three 608 bearings', ['bearing-608-pocket']],
  ['a bracket with M3 screw holes and a captive nut trap', ['threaded-fastener-seat']],
  ['a phone stand with a living hinge that folds flat', ['living-hinge', 'print-in-place-hinge']],
  ['a box lid on a print-in-place hinge', ['print-in-place-hinge']],
  ['a battery cover with snap-fit clips', ['snap-fit']],
  ['a cable tie with a ratchet and pawl', ['ratchet']],
  ['a button with a compression coil spring under it', ['coil-spring', 'button-return']],
  ['a clothes-peg leaf spring', ['leaf-spring', 'fit-pair']],
  ['a peg and socket press-fit joint', ['fit-pair']],
  ['a bistable snap-through clicker', ['bistable']],
  ['a push button with a spring return', ['button-return']],
  // stylized / decorative skills (crown-coronet, hollow-crenellation, open-prong-cradle) — these
  // were absent from the quantitative ratchet, so a trigger edit could silently break their routing
  ['a decorative crown for a trophy topper', ['crown-coronet']],
  ['a chess rook with a crenellated battlement rim', ['hollow-crenellation']],
  ['a holder with open prongs cradling a marble', ['open-prong-cradle']],
  // homographs — the gear/nut mechanism sense must BEAT the stylized sense (lookahead suppression),
  // so a stylized over-fire here surfaces as a precision drop, not only a binary selftest fail
  ['a crown gear for a hand drill', ['spur-gear']],
  ['a castle nut for an M6 bolt', ['threaded-fastener-seat']],
  // negatives — a plain shape must fire NOTHING (expected empty set)
  ['a rectangular box 40 x 20 x 10 mm', []],
  ['a hexagonal coaster', []],
  ['a simple desk nameplate', []],
  ['a spring water bottle holder', []],
  ['a turret enclosure for a raspberry pi', []],
]

const RECALL_FLOOR = 0.85
const PRECISION_FLOOR = 0.75

let tp = 0
let fp = 0
let fn = 0
let negClean = 0
let negTotal = 0
const rows = []
for (const [prompt, expected] of CORPUS) {
  const selected = selectSkillsDetailed({ prompt }).selected
  const exp = new Set(expected)
  const sel = new Set(selected)
  const hit = selected.filter((id) => exp.has(id)).length
  tp += hit
  fp += selected.filter((id) => !exp.has(id)).length
  fn += expected.filter((id) => !sel.has(id)).length
  if (expected.length === 0) {
    negTotal++
    if (selected.length === 0) negClean++
  }
  rows.push({ prompt: prompt.slice(0, 42), expected, selected })
}

const precision = tp + fp > 0 ? tp / (tp + fp) : 1
const recall = tp + fn > 0 ? tp / (tp + fn) : 1
const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0
const r2 = (n) => Math.round(n * 100) / 100

for (const r of rows) {
  const ok = new Set(r.selected).size === new Set(r.expected).size && r.expected.every((e) => r.selected.includes(e))
  console.log(`  ${ok ? '✓' : '·'} "${r.prompt}" → [${r.selected.join(', ') || '—'}]  (want [${r.expected.join(', ') || '—'}])`)
}
console.log(`\n[recall] precision=${r2(precision)} recall=${r2(recall)} F1=${r2(f1)} · negatives clean ${negClean}/${negTotal} · (floors P≥${PRECISION_FLOOR} R≥${RECALL_FLOOR})`)

if (recall < RECALL_FLOOR || precision < PRECISION_FLOOR) {
  console.error(`[recall] FAIL — below floor (precision ${r2(precision)}/${PRECISION_FLOOR}, recall ${r2(recall)}/${RECALL_FLOOR}). A trigger/router edit dropped or over-fired skills.`)
  process.exit(1)
}
console.log('[recall] PASS — router precision/recall within floor over the labeled corpus.')
process.exit(0)

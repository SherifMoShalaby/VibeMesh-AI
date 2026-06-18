/**
 * Zero-API fixtures for the advisory INTENT-line parser (P5 understanding layer).
 * Covers the four cases the plan calls out — valid / absent / malformed-JSON / unknown-enum —
 * plus enum-dropping, domainTag lowercasing, and stripIntentLine() display cleanup.
 *
 *   npx tsx bench/intent.selftest.ts   (npm run bench:intent)
 */
import { extractIntent, stripIntentLine } from '../src/lib/params'

let fail = 0
const ok = (cond: boolean, msg: string) => {
  console.log(`  ${cond ? '✓' : '✗'} ${msg}`)
  if (!cond) fail++
}

// 1. valid — full intent line embedded in PLAN prose
const valid = `Making a two-gear reduction. Pinion 12T, gear 24T, module 2.
INTENT: {"form":"kit","facetVerdict":"functional","archetype":"gear reduction","domainTags":["Gear","Bearing"],"ambiguityScore":"low","assumptions":["module 2 chosen"]}`
const v = extractIntent(valid)
ok(v?.form === 'kit', 'valid: form=kit')
ok(v?.facetVerdict === 'functional', 'valid: facetVerdict=functional')
ok(JSON.stringify(v?.domainTags) === '["gear","bearing"]', 'valid: domainTags lowercased')
ok(v?.ambiguityScore === 'low', 'valid: ambiguityScore=low')
ok(v?.assumptions?.length === 1, 'valid: assumptions carried')

// 1b. vision fields (P6) — image-grounded INTENT carries sourceType / statedDimensions / etc
const vision = extractIntent('INTENT: {"form":"single","sourceType":"drawing","statedDimensions":[{"value":80,"unit":"mm","feature":"height"},{"value":"bad"}],"asymmetryFlags":["left arm longer"],"confidence":"high"}')
ok(vision?.sourceType === 'drawing', 'vision: sourceType=drawing')
ok(vision?.statedDimensions?.length === 1 && vision.statedDimensions[0].value === 80, 'vision: statedDimensions parsed, non-finite dropped')
ok(vision?.asymmetryFlags?.length === 1, 'vision: asymmetryFlags carried')
ok(vision?.confidence === 'high', 'vision: confidence=high')
ok(extractIntent('INTENT: {"form":"single","sourceType":"hologram"}')?.sourceType === undefined, 'vision: unknown sourceType dropped')

// 2. absent — no INTENT line
ok(extractIntent('Just a plain plan with no intent line.\nMaking a cube.') === null, 'absent: returns null')

// 3. malformed JSON — must not throw, returns null
ok(extractIntent('INTENT: {form: kit, broken') === null, 'malformed JSON: returns null (no throw)')

// 4. unknown enum on form → null (form is required); unknown sub-enums → dropped, intent kept
ok(extractIntent('INTENT: {"form":"widget"}') === null, 'unknown form enum: returns null')
const partial = extractIntent('INTENT: {"form":"single","facetVerdict":"shiny","ambiguityScore":"extreme"}')
ok(partial?.form === 'single', 'unknown sub-enums: form kept')
ok(partial?.facetVerdict === undefined && partial?.ambiguityScore === undefined, 'unknown sub-enums: dropped, not thrown')

// 5. last INTENT line wins (a refine reply may echo a prior one)
const twice = 'INTENT: {"form":"single"}\nrefined…\nINTENT: {"form":"assembly"}'
ok(extractIntent(twice)?.form === 'assembly', 'multiple lines: last wins')

// 6. stripIntentLine removes the line from displayed prose
const stripped = stripIntentLine(valid)
ok(!/INTENT:/.test(stripped), 'stripIntentLine: INTENT line removed')
ok(stripped.includes('Pinion 12T'), 'stripIntentLine: PLAN prose preserved')

console.log(fail ? `[intent] SELFTEST FAIL (${fail})` : '[intent] SELFTEST PASS — INTENT parser tolerant (valid/absent/malformed/unknown-enum), prose cleaned.')
process.exit(fail ? 1 : 0)

/**
 * Zero-API ratchet for the CLARIFY-BEFORE-DRAW gate (ProCAD-style). The system prompt's default is
 * "work autonomously, never ask" — the value of the gate is its NARROW, guarded exception, and the
 * risk is (a) it silently widens (starts nagging on functional parts / mid-iteration), or (b) it
 * breaks the core contract (must still emit ONE complete model in the same reply). This asserts the
 * clause and BOTH guards stay present, so a future prompt edit can't quietly turn the autonomous
 * product into one that interrogates the user or stops returning a model.
 *
 *   node bench/clarify.selftest.mjs   → exit 0 (all pass) / 1 (a guard tripped)
 */
import assert from 'node:assert/strict'
import { SYSTEM_PROMPT } from '../server/prompt.mjs'

const P = SYSTEM_PROMPT
const fails = []
const check = (name, cond) => { if (!cond) fails.push(name) }

// The autonomous DEFAULT survives (the gate is an exception, not a reversal).
check('default stays "do NOT ask by default"', /by default do NOT ask a clarifying question/i.test(P))

// The exception exists and is NARROW — all four gating conditions present.
check('exception is gated to the FIRST message', /FIRST message of the chat/i.test(P))
check('exception requires NO reference image', /NO reference image is attached/i.test(P))
check('exception requires NO stated dimension', /NO dimension is stated/i.test(P))
check('exception requires a FREE-FORM FIGURATIVE subject', /FREE-FORM FIGURATIVE object/i.test(P))

// CONTRACT PRESERVED — ask AND draw, still exactly one complete model.
check('must STILL return a complete model in the same reply (ask AND draw)', /ask AND draw/i.test(P) && /STILL return a COMPLETE/i.test(P))
check('still exactly ONE code block', /exactly ONE code block/i.test(P))

// MOAT — never fires on functional/kit/dimensioned/image/follow-up requests.
check('never on a functional/mechanical part', /NOT a plain functional\/mechanical part/i.test(P))
check('never more than one question / on a follow-up / kit / image-grounded', /never ask more than one question/i.test(P) && /never ask on a follow-up turn/i.test(P) && /image-grounded request/i.test(P))

if (fails.length) {
  for (const f of fails) console.error(`✗ ${f}`)
  console.error(`\n[clarify.selftest] FAIL — ${fails.length} guard(s) missing — the clarify gate was widened, weakened, or removed`)
  process.exit(1)
}
console.log('[clarify.selftest] PASS — clarify gate present, narrowly gated (first/no-image/no-dim/figurative), contract preserved (ask AND draw, one model), moat intact (never functional/kit/dimensioned/image/follow-up).')
process.exit(0)

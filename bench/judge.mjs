/**
 * Optional, advisory LLM-judge for the bench (Phase 6).
 *
 * Voxel-IoU scores shape and the buildability rubric scores kit structure; this
 * adds a qualitative read on intent ("did it actually make what was asked, with
 * parts that mate?"). It is ADVISORY ONLY — a tie-breaker and a source of
 * human-readable failure reasons. Never let its (nondeterministic) score gate
 * pass/fail; the deterministic checks remain the source of truth.
 *
 * Gated twice: requires a console ANTHROPIC_API_KEY (a separate plain API call —
 * never the claude-code login path) AND BENCH_JUDGE=1, so keyless/offline runs and
 * normal runs are unaffected and never incur surprise cost.
 */
import 'dotenv/config'
import Anthropic from '@anthropic-ai/sdk'

const RUBRIC = {
  type: 'object',
  additionalProperties: false,
  required: ['partsSeparate', 'connectorsMate', 'eachPrintable', 'intentMet', 'score', 'reason'],
  properties: {
    partsSeparate: { type: 'boolean', description: 'if a kit was requested, the parts are genuinely separate (not one fused object)' },
    connectorsMate: { type: 'boolean', description: 'mating features exist and are sized to actually join (female = male + clearance)' },
    eachPrintable: { type: 'boolean', description: 'each piece is manifold and sits flat in a sensible print orientation' },
    intentMet: { type: 'boolean', description: 'the program makes what the user asked for' },
    score: { type: 'number', description: 'overall 0..1' },
    reason: { type: 'string', description: 'one sentence' },
  },
}

export function judgeAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY) && process.env.BENCH_JUDGE === '1'
}

/** Returns the rubric verdict, {error}, or null when the judge is disabled. */
export async function judgeModel({ prompt, code }) {
  if (!judgeAvailable()) return null
  const client = new Anthropic()
  const system =
    'You are a strict, skeptical CAD reviewer. Given a user request and the OpenSCAD program produced for it, judge whether the program actually satisfies the request as a buildable result. Default to false on any criterion you are unsure about.'
  const user = `USER REQUEST:\n${prompt}\n\nOPENSCAD PROGRAM:\n${code}\n\nIf the request implies a buildable kit, separate connectable parts (with real mating connectors whose female size = male size + a clearance parameter) are required. Judge each criterion, give an overall 0..1 score, and a one-sentence reason.`
  try {
    const res = await client.messages.create({
      model: process.env.VIBEMESH_MODEL || process.env.VIBESCAD_MODEL || 'claude-opus-4-8',
      max_tokens: 1024,
      system,
      output_config: { format: { type: 'json_schema', schema: RUBRIC } },
      messages: [{ role: 'user', content: user }],
    })
    const text = res.content.find((b) => b.type === 'text')?.text ?? '{}'
    return JSON.parse(text)
  } catch (error) {
    return { error: error instanceof Error ? error.message.slice(0, 160) : String(error) }
  }
}

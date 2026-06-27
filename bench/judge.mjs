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

// Vision-fidelity rubric — does the RENDERED geometry reproduce the requested/depicted
// object, feature by feature, without symmetrizing away intentional asymmetry?
const VISION_RUBRIC = {
  type: 'object',
  additionalProperties: false,
  required: ['features', 'asymmetryPreserved', 'overallFidelity', 'reason'],
  properties: {
    features: {
      type: 'array',
      description: 'one entry per distinct feature the request/reference calls for',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'present', 'faithful'],
        properties: {
          name: { type: 'string' },
          present: { type: 'boolean', description: 'the feature exists in the rendered geometry' },
          faithful: { type: 'boolean', description: 'its shape/proportion matches the reference — not collapsed to a generic stand-in' },
        },
      },
    },
    asymmetryPreserved: { type: 'boolean', description: 'if the reference is intentionally asymmetric / has non-identical parts, the render keeps that (did NOT symmetrize). true if symmetry is not applicable.' },
    overallFidelity: { type: 'number', description: '0..1 — how faithfully the render reproduces the requested/depicted object' },
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

/**
 * Advisory VISION judge: shown the rendered iso/front/top views of the generated model
 * (bench/render.mjs) and, when present, the reference image the user provided, it reports
 * a per-feature fidelity checklist + whether intentional asymmetry survived. This is the
 * human-readable complement to the deterministic asymmetryScore/moduleDistinctness ratchet —
 * it catches a symmetric-collapse or a missing stepped arm that voxel-IoU can't see.
 *
 * @param renderImages Array<{ pngBase64, mediaType, name }> from renderViews()
 * @param referenceImage optional { base64, mediaType }
 * Returns the rubric verdict, {error}, or null when the judge is disabled.
 */
export async function judgeVision({ prompt, code, referenceImage, renderImages }) {
  if (!judgeAvailable()) return null
  return runVisionJudge(new Anthropic(), { prompt, code, referenceImage, renderImages })
}

/**
 * OC-6 — the ENV-UNGATED core of the vision judge, shared by the bench wrapper above and the live
 * advisory oracle (server/index.mjs POST /api/vision-judge). Takes the Anthropic client explicitly
 * (the bench builds one from ANTHROPIC_API_KEY; the live route builds its own), runs the SAME
 * VISION_RUBRIC per-feature present/faithful + asymmetryPreserved check, and returns the verdict,
 * {error}, or {error:'no render images'}. Caller is responsible for any gating (key / opt-in).
 *
 * @param client an @anthropic-ai/sdk Anthropic instance
 * @param renderImages Array<{ pngBase64, mediaType, name }>
 * @param referenceImage optional { base64, mediaType }
 */
export async function runVisionJudge(client, { prompt, code, referenceImage, renderImages }) {
  if (!renderImages?.length) return { error: 'no render images' }
  const system =
    'You are a strict CAD fidelity reviewer. You are shown the user request and rendered isometric/front/top views of the GENERATED 3D model (and, when available, the reference image the user provided). Judge whether the generated geometry faithfully reproduces the requested object: each distinct feature present AND shaped like the reference, and any INTENTIONAL asymmetry or non-identical parts preserved — a symmetrizing "cleanup" is a FAILURE, not an improvement. Default to false / low fidelity when unsure.'
  const content = [{ type: 'text', text: `USER REQUEST:\n${prompt}` }]
  if (referenceImage?.base64) {
    content.push({ type: 'text', text: 'REFERENCE image the user provided:' })
    content.push({ type: 'image', source: { type: 'base64', media_type: referenceImage.mediaType || 'image/png', data: referenceImage.base64 } })
  }
  content.push({ type: 'text', text: 'RENDERED views of the generated model (isometric, front, top):' })
  for (const v of renderImages) {
    content.push({ type: 'image', source: { type: 'base64', media_type: v.mediaType || 'image/png', data: v.pngBase64 } })
  }
  content.push({
    type: 'text',
    text: `OPENSCAD PROGRAM (context):\n${(code ?? '').slice(0, 8000)}\n\nList each distinct feature the request/reference calls for with present + faithful flags; state whether intentional asymmetry was preserved; give overallFidelity 0..1 and a one-sentence reason.`,
  })
  try {
    const res = await client.messages.create({
      model: process.env.VIBEMESH_MODEL || process.env.VIBESCAD_MODEL || 'claude-opus-4-8',
      max_tokens: 1024,
      system,
      output_config: { format: { type: 'json_schema', schema: VISION_RUBRIC } },
      messages: [{ role: 'user', content }],
    })
    const text = res.content.find((b) => b.type === 'text')?.text ?? '{}'
    return JSON.parse(text)
  } catch (error) {
    return { error: error instanceof Error ? error.message.slice(0, 160) : String(error) }
  }
}

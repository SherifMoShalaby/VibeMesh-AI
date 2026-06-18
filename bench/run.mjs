/**
 * Vibemesh-AI model benchmark — engine × task matrix against the live API.
 * Usage: node bench/run.mjs
 *   BENCH_ENGINES=claude-code,kimi   restrict engines
 *   BENCH_TASKS=T1-cube,T3-clip,T7-kit   restrict tasks (followups skip if their dep is excluded)
 * Output: bench/results/<engine>/<task>.scad + bench/results/results.json
 */
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createOpenSCAD } from 'openscad-wasm'
import { scoreAgainstGold } from './compare.mjs'
import { extractPartEnum, scoreBuildability } from './buildability.mjs'
import { symmetryScore, moduleDistinctness, assembledScore } from './fidelity.mjs'
import { interferenceVol, interferenceScore, hasDebugContract } from './interference.mjs'
import { judgeModel, judgeVision, judgeAvailable } from './judge.mjs'
import { renderViews } from './render.mjs'
import { SKILLS } from '../server/skills.mjs'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const API = 'http://localhost:5175/api/generate'
const ENGINES = ['claude-code', 'kimi', 'local:qwen2.5vl:7b']
const GEN_TIMEOUT = 900_000 // 15 min — thinking engines (claude-code/Opus) go silent for minutes on a kit
const RENDER_TIMEOUT = 90_000

const ENGINE_FILTER = process.env.BENCH_ENGINES?.split(',').map((s) => s.trim()).filter(Boolean)
const TASK_FILTER = process.env.BENCH_TASKS?.split(',').map((s) => s.trim()).filter(Boolean)
// BENCH_SAMPLES=k runs each task k times and aggregates (median quality scores,
// compiledRate) — so the gate can trust tight tolerances despite a non-deterministic API.
// Default k=3 (the PR-gate standard: cheapest odd count robust to a single bad draw);
// set BENCH_SAMPLES=1 for fast local single-sample iteration.
const SAMPLES = Math.max(1, Number(process.env.BENCH_SAMPLES) || 3)

const visionImage = fs.readFileSync(path.join(ROOT, 'vision-sketch.png')).toString('base64')

const BROKEN_CODE = `w = 30;\ncube([w, w, h]);`

const TASKS = [
  {
    id: 'T1-cube',
    kind: 'fresh',
    prompt: 'A 25mm calibration cube with a 6mm diameter hole through the center, from the top face all the way through to the bottom.',
    expect: { bbox: [25, 25, 25], tol: 0.8 },
  },
  {
    id: 'T2-stand',
    kind: 'fresh',
    prompt: 'A desk phone stand. The phone is 75mm wide and 9mm thick including its case, recline angle about 60 degrees from horizontal, and there must be a slot in the cradle for a charging cable.',
    expect: { bboxMin: [40, 30, 25] },
  },
  {
    id: 'T3-clip',
    kind: 'fresh',
    prompt: 'A wall-mount cable clip that snaps over a 5mm round cable, fixed to the wall with one M3 countersunk screw.',
    expect: { bboxMax: [80, 80, 80] },
  },
  {
    id: 'T4-iterate',
    kind: 'followup',
    dependsOn: 'T1-cube',
    prompt: 'Make the hole 10mm diameter instead, and add a 2mm chamfer to the top edges of the cube.',
    expect: { bbox: [25, 25, 25], tol: 0.8, codeHas: ['10'] },
  },
  {
    id: 'T5-fix',
    kind: 'custom',
    messages: [
      { role: 'user', content: 'a 30mm cube' },
      { role: 'assistant', content: 'Here is the model.\n\n```scad\n' + BROKEN_CODE + '\n```' },
      {
        role: 'user',
        content:
          'The OpenSCAD code failed to render. Fix it and return the corrected complete program.\n\nError:\nWARNING: Ignoring unknown variable "h" in file input.scad, line 2\nERROR: Compile error: argument to cube() must be numeric',
      },
    ],
    expect: { bbox: [30, 30, 30], tol: 0.5 },
  },
  {
    id: 'T6-vision',
    kind: 'image',
    prompt: 'Model the part shown in this engineering sketch as a 3D-printable plate. Use the labeled dimensions exactly.',
    expect: { bbox: [100, 40, 5], tol: 1.5 },
  },
  {
    // the driving failure case: must yield a buildable KIT, not one car-shaped solid
    id: 'T7-kit',
    kind: 'fresh',
    kit: true,
    prompt:
      'A simple Lego-style toy car I can build from separate snap-together parts — a base, a body, and wheels that connect to it. Give me the parts so I can assemble it.',
    // kit:true in context mirrors the app's detectKitIntent → exercises the Phase 2
    // directive + Phase 4 exemplar (the app sets this client-side from the prompt text)
    context: { bed: { x: 220, y: 220, z: 250, label: 'Ender 3' }, kit: true },
    bed: [220, 220, 250],
    expect: { partEnumMin: 4 },
  },
  {
    // curved/organic coverage — exercises the richness fix (fillets, rounded forms).
    // Geometry is prompt-determined, so it gets a gold reference (bench/gold/T8-knob.scad).
    id: 'T8-knob',
    kind: 'fresh',
    prompt:
      'A cylindrical control knob, 30mm outer diameter and 18mm tall, with a rounded (filleted) top edge of about 4mm radius, and a 6mm diameter blind bore 12mm deep in the center of the underside for a shaft.',
    expect: { bbox: [30, 30, 18], tol: 1.5 },
  },
  {
    // press-fit coverage — exercises the numeric clearance assertion in buildability.
    id: 'T9-pressfit',
    kind: 'fresh',
    kit: true,
    prompt:
      'A two-part press-fit alignment set I can print and assemble: a pin and a matching bushing the pin presses into. Give me the parts so they actually fit together with a real press-fit clearance.',
    context: { bed: { x: 220, y: 220, z: 250, label: 'Ender 3' }, kit: true },
    bed: [220, 220, 250],
    expect: { partEnumMin: 2 },
  },
  {
    // fidelity coverage — exercises asymmetryScore + moduleDistinctness (the spinner-collapse
    // failure: a symmetric cross self-matches under rotation and IoU can't see it).
    id: 'T10-spinner',
    kind: 'fresh',
    prompt:
      'A fidget spinner with a central bearing seat and FOUR DIFFERENT arms — one with a hexagonal grip mesh, one a long stepped/zig-zag edge, one a short curved arm, one solid with weight bores. The arms are intentionally NON-identical and the overall shape is asymmetric. Model each arm distinctly around the hub.',
    expect: { asymmetric: true, distinctModulesMin: 5, bboxMax: [200, 200, 30] },
  },
  {
    // geometric-consistency coverage (LEGO axle-vs-tube) — the cross-bore must NOT slice the
    // underside clutch tubes. Scored by the interference probe IF the model emits the _debug contract.
    id: 'T11-technic',
    kind: 'fresh',
    kit: true,
    prompt:
      'A Technic-style brick with underside clutch tubes that grip studs AND a horizontal 4mm axle hole running side to side. The axle hole must NOT cut through the clutch tubes — route it between them like real LEGO, and keep the tubes it would otherwise hit relieved. Make it actually buildable.',
    context: { bed: { x: 220, y: 220, z: 250, label: 'Ender 3' }, kit: true },
    bed: [220, 220, 250],
    expect: { partEnumMin: 1 },
  },
  {
    // geometric-consistency generalized to a non-LEGO part — the rim weight bores must not break
    // into the central bearing seat. Reuses the same interference probe.
    id: 'T12-fidget-interference',
    kind: 'fresh',
    prompt:
      'A fidget spinner hub with a central bearing seat (press-fit pocket) and several weight bores around the rim. The weight bores must NOT break into the bearing seat — leave solid material between each bore and the bearing race so the bearing still seats. Make it internally consistent and printable.',
    expect: { bboxMax: [120, 120, 25] },
  },
  // ── Mechanism-skill tasks (Phase 4). Each forces its skill via context.skillIds and is
  // scored by that skill's own validator (skillScore: 1 = clean, 0 = the validator flagged a
  // mechanism fault). Tests the live model WITH the skill, complementing the zero-API walker
  // that gates the exemplar. New → "not gated until baselined" (seed with a multi-sample run).
  {
    id: 'T13-gear-pair',
    kind: 'fresh',
    kit: true,
    prompt: 'A two-gear reduction: a small pinion meshing a larger gear, each with a shaft bore, that I can 3D print as separate parts.',
    skill: 'spur-gear',
    context: { bed: { x: 220, y: 220, z: 250, label: 'Ender 3' }, kit: true, skillIds: ['spur-gear'] },
    expect: { bboxMax: [200, 200, 40] },
  },
  {
    id: 'T14-pip-hinge',
    kind: 'fresh',
    prompt: 'A print-in-place hinge: two leaves joined by a captive pin, printed flat and already assembled so it pivots straight off the bed.',
    skill: 'print-in-place-hinge',
    context: { bed: { x: 220, y: 220, z: 250, label: 'Ender 3' }, skillIds: ['print-in-place-hinge'] },
    expect: { bboxMax: [140, 140, 30] },
  },
  {
    id: 'T15-snap-fit',
    kind: 'fresh',
    kit: true,
    prompt: 'A cantilever snap-fit latch: a clip that snaps into a keeper, as separate printable parts.',
    skill: 'snap-fit',
    context: { bed: { x: 220, y: 220, z: 250, label: 'Ender 3' }, kit: true, skillIds: ['snap-fit'] },
    expect: { bboxMax: [120, 120, 60] },
  },
]

/* ── SSE generation via the app's API ── */

// node:http (not fetch) so there is NO undici body-inactivity timeout — thinking
// engines (claude-code/Opus) stream no SSE deltas during extended thinking and
// would otherwise trip UND_ERR_BODY_TIMEOUT after 5 min. Overall cap is GEN_TIMEOUT.
async function generate(engine, messages, context) {
  const started = Date.now()
  const body = JSON.stringify({ engine, messages, context })
  const url = new URL(API)
  return new Promise((resolve) => {
    let settled = false
    let killer
    const finish = (v) => {
      if (settled) return
      settled = true
      clearTimeout(killer)
      resolve(v)
    }
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        if (res.statusCode !== 200) {
          let t = ''
          res.on('data', (c) => (t += c))
          res.on('end', () => finish({ error: `HTTP ${res.statusCode}: ${t.slice(0, 200)}`, genMs: Date.now() - started }))
          return
        }
        res.setEncoding('utf8')
        let buffer = ''
        let full = ''
        let sseError = null
        res.on('data', (chunk) => {
          buffer += chunk
          const events = buffer.split('\n\n')
          buffer = events.pop() ?? ''
          for (const ev of events) {
            const line = ev.trim()
            if (!line.startsWith('data: ')) continue
            try {
              const payload = JSON.parse(line.slice(6))
              if (payload.type === 'delta') full += payload.text
              if (payload.type === 'error') sseError = payload.message
            } catch {
              /* keep-alive / partial line */
            }
          }
        })
        res.on('end', () => finish(sseError ? { error: sseError, genMs: Date.now() - started } : { text: full, genMs: Date.now() - started }))
        res.on('error', (e) => finish({ error: String(e), genMs: Date.now() - started }))
      },
    )
    req.on('error', (e) => finish({ error: `request error: ${e.message}`, genMs: Date.now() - started }))
    req.setTimeout(0) // disable socket inactivity timeout
    killer = setTimeout(() => {
      req.destroy()
      finish({ error: `generation timeout after ${GEN_TIMEOUT / 1000}s`, genMs: Date.now() - started })
    }, GEN_TIMEOUT)
    req.write(body)
    req.end()
  })
}

// Rate-limit-aware retry: on a 429 (e.g. Kimi "rate limit hit") back off and retry
// instead of failing the sample, so a transient limit mid-matrix doesn't zero the run.
async function generateWithRetry(engine, messages, context, label) {
  const waits = [15000, 30000, 60000, 120000]
  for (let attempt = 0; ; attempt++) {
    const gen = await generate(engine, messages, context)
    if (gen.error && /rate limit|429|too many requests/i.test(gen.error) && attempt < waits.length) {
      const w = waits[attempt]
      console.log(`[bench] ${label} — rate limited, backing off ${w / 1000}s (retry ${attempt + 1}/${waits.length})`)
      await new Promise((r) => setTimeout(r, w))
      continue
    }
    return gen
  }
}

function extractScad(text) {
  const re = /```(?:scad|openscad)?\s*\n([\s\S]*?)```/g
  let code = null
  let best = 0
  for (const m of text.matchAll(re)) {
    if (m[1].length > best) {
      best = m[1].length
      code = m[1].trim()
    }
  }
  return code
}

/* ── compile + measure with the same engine the app uses ── */

async function compileScad(code, defines = []) {
  const started = Date.now()
  const job = (async () => {
    const o = await createOpenSCAD({ noInitialRun: true, print: () => {}, printErr: () => {} })
    const inst = o.getInstance()
    inst.FS.writeFile('/in.scad', code)
    try {
      inst.callMain(['/in.scad', '-o', '/out.stl', '--export-format=binstl', '--backend=Manifold', ...defines])
    } catch {
      /* abnormal exit — check for output anyway */
    }
    try {
      return inst.FS.readFile('/out.stl', { encoding: 'binary' })
    } catch {
      return null
    }
  })()
  const timeout = new Promise((resolve) => setTimeout(() => resolve('TIMEOUT'), RENDER_TIMEOUT))
  const result = await Promise.race([job, timeout])
  if (result === 'TIMEOUT') return { ok: false, renderMs: Date.now() - started, error: 'render timeout' }
  if (!result || result.length === 0) return { ok: false, renderMs: Date.now() - started, error: 'no geometry' }
  return { ok: true, renderMs: Date.now() - started, stl: result }
}

function stlMetrics(stl) {
  const view = new DataView(stl.buffer, stl.byteOffset, stl.byteLength)
  const count = view.getUint32(80, true)
  let min = [Infinity, Infinity, Infinity]
  let max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < count; i++) {
    const base = 84 + i * 50 + 12 // skip normal
    for (let v = 0; v < 3; v++) {
      for (let a = 0; a < 3; a++) {
        const val = view.getFloat32(base + v * 12 + a * 4, true)
        if (val < min[a]) min[a] = val
        if (val > max[a]) max[a] = val
      }
    }
  }
  return {
    triangles: count,
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]].map((n) => Math.round(n * 100) / 100),
    minZ: Math.round(min[2] * 100) / 100,
  }
}

function countParams(code) {
  let count = 0
  let groups = 0
  let annotated = 0
  for (const line of code.split('\n')) {
    if (/^\s*\/\*\s*\[[^\]]+\]\s*\*\/\s*$/.test(line)) {
      groups++
      continue
    }
    const m = /^\s*([A-Za-z_]\w*)\s*=\s*([^;]+);\s*(\/\/\s*(.*))?$/.exec(line)
    if (m && !m[1].startsWith('$') && !m[1].startsWith('_')) {
      // `_`-prefixed names are hidden probe knobs (e.g. _debug) — not user-facing params
      if (/^(module|function)\b/.test(line.trim())) continue
      count++
      if (m[4] && /\[.*\]/.test(m[4])) annotated++
    }
    if (/^\s*(module|function)\s/.test(line)) break
  }
  return { count, groups, annotated }
}

/* ── scoring helpers ── */

const round2 = (n) => Math.round(n * 100) / 100

/** Placement score for single-part tasks: 1 when the part sits on z=0, stepped
 *  down as it sinks below / floats above the bed. (Kits use buildability.printsFlat.) */
function placementScore(minZ) {
  if (typeof minZ !== 'number' || !Number.isFinite(minZ)) return null
  const off = Math.abs(minZ)
  if (off <= 0.5) return 1
  if (off <= 2) return 0.5
  return 0
}

function checkExpectations(task, code, metrics) {
  const notes = []
  let dimScore = null
  const e = task.expect ?? {}
  if (e.bbox && metrics) {
    // continuous, per-axis, magnitude-relative: full credit within the absolute
    // tolerance, linear falloff out to a 50%-off cliff (any axis >50% off → 0).
    let catastrophic = false
    const axisScores = e.bbox.map((d, i) => {
      const err = Math.abs(metrics.size[i] - d)
      const rel = d !== 0 ? err / Math.abs(d) : err <= e.tol ? 0 : 1
      if (rel > 0.5) {
        catastrophic = true
        return 0
      }
      if (err <= e.tol) return 1
      const relTol = d !== 0 ? e.tol / Math.abs(d) : 0
      return Math.max(0, 1 - (rel - relTol) / Math.max(1e-6, 0.5 - relTol))
    })
    dimScore = catastrophic ? 0 : round2(axisScores.reduce((a, b) => a + b, 0) / axisScores.length)
    const worst = Math.max(...e.bbox.map((d, i) => Math.abs(metrics.size[i] - d)))
    notes.push(`bbox ${metrics.size.join('×')} vs expected ${e.bbox.join('×')} (worst off by ${worst.toFixed(2)}mm, dimScore ${dimScore})`)
  }
  if (e.bboxMin && metrics) {
    const ok = e.bboxMin.every((d, i) => metrics.size[i] >= d)
    dimScore = ok ? 1 : 0.5
    notes.push(`bbox ${metrics.size.join('×')} vs minimum ${e.bboxMin.join('×')} → ${ok ? 'plausible' : 'suspiciously small'}`)
  }
  if (e.bboxMax && metrics) {
    const ok = e.bboxMax.every((d, i) => metrics.size[i] <= d)
    if (dimScore === null) dimScore = ok ? 1 : 0.5
    notes.push(`bbox ${metrics.size.join('×')} vs maximum ${e.bboxMax.join('×')} → ${ok ? 'plausible' : 'suspiciously large'}`)
  }
  if (e.codeHas && code) {
    for (const needle of e.codeHas) {
      if (!code.includes(needle)) notes.push(`MISSING expected value "${needle}" in code`)
    }
  }
  if (metrics && Math.abs(metrics.minZ) > 0.5) notes.push(`does NOT sit on bed (minZ=${metrics.minZ})`)
  return { dimScore, notes }
}

/* ── main ── */

const median = (nums) => {
  const a = nums.filter((n) => typeof n === 'number' && Number.isFinite(n)).sort((x, y) => x - y)
  if (!a.length) return null
  const m = Math.floor(a.length / 2)
  return a.length % 2 ? a[m] : round2((a[m - 1] + a[m]) / 2)
}

/** One generate + compile + score sample. Returns the results row (incl. error
 *  rows). Writes the .scad artifact and updates `history` (last sample wins). */
async function runTask(engine, task, messages, dir, history, label) {
  console.log(`[bench] ${label} — generating…`)
  const gen = await generateWithRetry(engine, messages, task.context, label)
  if (gen.error) {
    console.log(`[bench] ${label} — GEN FAILED: ${gen.error}`)
    return { task: task.id, genMs: gen.genMs, error: gen.error }
  }
  const code = extractScad(gen.text)
  if (!code) {
    console.log(`[bench] ${label} — NO CODE BLOCK in reply (${gen.text.length} chars)`)
    return { task: task.id, genMs: gen.genMs, error: 'no scad code block in reply', replyChars: gen.text.length }
  }
  fs.writeFileSync(path.join(dir, `${task.id}.scad`), code)
  if (task.kind === 'fresh') history[task.id] = { prompt: task.prompt, replyText: gen.text }

  const compiled = await compileScad(code)
  const metrics = compiled.ok ? stlMetrics(compiled.stl) : null
  const params = countParams(code)
  const checks = checkExpectations(task, code, metrics)

  // geometric similarity vs gold reference (tasks with bench/gold/<id>.scad)
  let gold = null
  if (compiled.ok) {
    try {
      gold = await scoreAgainstGold(task.id, compiled.stl)
    } catch (err) {
      gold = { error: String(err) }
    }
  }

  // buildability: recompile each part-enum piece (-D part="…") and score kit structure
  let buildability
  if (task.kit) {
    const partEnum = extractPartEnum(code)
    const pieces = []
    for (const piece of partEnum.pieces) {
      const r = await compileScad(code, ['-D', `part="${piece}"`])
      const m = r.ok ? stlMetrics(r.stl) : null
      pieces.push({ piece, ok: r.ok, size: m?.size, minZ: m?.minZ, error: r.ok ? undefined : r.error })
    }
    buildability = scoreBuildability(code, partEnum, pieces, task.bed ?? [220, 220, 250])
    buildability.pieces = pieces.map(({ piece, ok, size, minZ }) => ({ piece, ok, size, minZ }))
  }

  // over-split regression guard: a NON-kit task should not produce a multi-piece kit
  let overSplit = false
  if (!task.kit) {
    const pe = extractPartEnum(code)
    overSplit = pe.found && pe.pieces.length >= 2
    if (overSplit) checks.notes.push(`OVER-SPLIT: non-kit task produced a ${pe.pieces.length}-piece part enum`)
  }

  // advisory LLM-judge (gated on ANTHROPIC_API_KEY + BENCH_JUDGE=1) — never gates pass/fail
  const judge = await judgeModel({ prompt: task.prompt ?? '(custom)', code })

  // advisory VISION judge for image/asymmetric tasks: rasterize the result (bench/render.mjs)
  // and let the judge compare it to the reference. Only when enabled, so normal runs pay nothing.
  let visionJudge
  if (judgeAvailable() && compiled.ok && compiled.stl && (task.expect?.asymmetric || task.kind === 'image')) {
    const renderImages = renderViews(compiled.stl)
    const referenceImage = task.kind === 'image' ? { base64: visionImage, mediaType: 'image/png' } : undefined
    visionJudge = await judgeVision({ prompt: task.prompt ?? '(custom)', code, referenceImage, renderImages })
  }

  // fidelity / functional metrics the IoU + buildability checks can't see
  let asymmetryScore, modDistinct, scatterSpan, assembled
  if (task.expect?.asymmetric && compiled.ok && compiled.stl) {
    asymmetryScore = symmetryScore(compiled.stl).asymmetryScore // higher = more asymmetric (good for these tasks)
    modDistinct = moduleDistinctness(code)
  }
  if (task.kit && metrics && buildability?.pieces?.length) {
    // scatterSpan = all-view span ÷ largest single piece — assembled ~1-2, scattered blows up
    const pieceMax = Math.max(...buildability.pieces.filter((p) => p.size).flatMap((p) => p.size), 0)
    if (pieceMax > 0) {
      scatterSpan = round2(Math.max(...metrics.size) / pieceMax)
      assembled = assembledScore(scatterSpan)
    }
  }
  // geometric-consistency: does a cutter slice a protected feature? Measured only on parts that
  // emit the `_debug` probe contract (deterministic, no API); null/absent otherwise.
  let intfScore
  if (hasDebugContract(code)) intfScore = interferenceScore(await interferenceVol(code))

  // per-skill functional check (Phase 4): run the task's expected skill validator on the LIVE
  // output. skillScore = 1 when the mechanism discipline holds (backlash > 0, bore = pin+gap,
  // L/t >= 6, …), 0 when the validator flags a fault. Deterministic given the code; no API.
  let skillScore, skillIssues
  if (task.skill && SKILLS[task.skill]?.validate) {
    skillIssues = SKILLS[task.skill].validate(code)
    skillScore = skillIssues.length ? 0 : 1
    if (skillIssues.length) checks.notes.push(`skill[${task.skill}] FLAGGED: ${skillIssues.join('; ')}`)
  }

  const row = {
    task: task.id,
    genMs: gen.genMs,
    renderMs: compiled.renderMs,
    compiled: compiled.ok,
    compileError: compiled.ok ? undefined : compiled.error,
    size: metrics?.size,
    minZ: metrics?.minZ,
    triangles: metrics?.triangles,
    params,
    dimScore: checks.dimScore,
    // placement (single-part only): does the rendered part sit flat on z=0?
    // invisible to dimScore/IoU today — a part sunk 4.8mm scores a perfect 1.
    placementScore: task.kit ? undefined : (metrics ? placementScore(metrics.minZ) : undefined),
    asymmetryScore,
    moduleDistinctness: modDistinct,
    scatterSpan,
    assembledScore: assembled,
    interferenceScore: intfScore,
    skillScore,
    skill: task.skill,
    skillIssues: skillIssues?.length ? skillIssues : undefined,
    gold: gold ?? undefined,
    buildability: buildability ?? undefined,
    overSplit: overSplit || undefined,
    judge: judge ?? undefined,
    visionJudge: visionJudge ?? undefined,
    notes: checks.notes,
    codeLines: code.split('\n').length,
  }
  const goldNote = gold ? (gold.error ? ', gold=ERR' : `, IoU=${gold.iou}`) : ''
  const kitNote = buildability ? `, kit=${buildability.score}${buildability.hardFail ? ' (HARD FAIL)' : ''} [${(buildability.pieces ?? []).length}pc]` : ''
  const judgeNote = judge && !judge.error ? `, judge=${judge.score}` : ''
  const skillNote = typeof skillScore === 'number' ? `, skill[${task.skill}]=${skillScore}` : ''
  console.log(`[bench] ${label} — gen ${Math.round(gen.genMs / 1000)}s, compiled=${compiled.ok}, size=${metrics?.size?.join('×') ?? '—'}, params=${params.count}${goldNote}${kitNote}${judgeNote}${skillNote}`)
  return row
}

/** Aggregate k samples of one task into a single row: median quality scores,
 *  compiledRate, and a representative (last compiled) sample for code-derived
 *  fields. A k=1 run is byte-identical to runTask's row (no aggregation). */
function aggregateRows(task, rows, k) {
  const rep = [...rows].reverse().find((r) => r.compiled) ?? rows[rows.length - 1]
  const okRows = rows.filter((r) => r.compiled)
  const compiledRate = round2(okRows.length / rows.length)
  const ious = okRows.map((r) => (r.gold && !r.gold.error ? r.gold.iou : null)).filter((n) => typeof n === 'number')
  const dimScores = rows.map((r) => r.dimScore).filter((n) => typeof n === 'number')
  const placements = rows.map((r) => r.placementScore).filter((n) => typeof n === 'number')
  const buildScores = rows.map((r) => r.buildability?.score).filter((n) => typeof n === 'number')
  const asyms = rows.map((r) => r.asymmetryScore).filter((n) => typeof n === 'number')
  const mods = rows.map((r) => r.moduleDistinctness).filter((n) => typeof n === 'number')
  const assembleds = rows.map((r) => r.assembledScore).filter((n) => typeof n === 'number')
  const intfs = rows.map((r) => r.interferenceScore).filter((n) => typeof n === 'number')
  const skillScores = rows.map((r) => r.skillScore).filter((n) => typeof n === 'number')
  return {
    task: task.id,
    samples: k,
    compiledRate,
    genMs: median(rows.map((r) => r.genMs)),
    renderMs: median(okRows.map((r) => r.renderMs)),
    compiled: compiledRate >= 0.5, // majority — the gate treats compiled as categorical
    compileError: rep.compiled ? undefined : rep.compileError,
    size: rep.size,
    minZ: rep.minZ,
    triangles: rep.triangles,
    params: rep.params,
    dimScore: dimScores.length ? median(dimScores) : rep.dimScore ?? null,
    placementScore: task.kit ? undefined : placements.length ? median(placements) : rep.placementScore,
    asymmetryScore: asyms.length ? median(asyms) : rep.asymmetryScore,
    moduleDistinctness: mods.length ? median(mods) : rep.moduleDistinctness,
    scatterSpan: rep.scatterSpan,
    assembledScore: assembleds.length ? median(assembleds) : rep.assembledScore,
    interferenceScore: intfs.length ? median(intfs) : rep.interferenceScore,
    skillScore: skillScores.length ? median(skillScores) : rep.skillScore,
    skill: rep.skill,
    gold: ious.length ? { iou: median(ious), samples: ious.length } : rep.gold,
    buildability: buildScores.length ? { ...rep.buildability, score: median(buildScores) } : rep.buildability,
    overSplit: rows.some((r) => r.overSplit) || undefined,
    judge: rep.judge,
    notes: rep.notes,
    codeLines: rep.codeLines,
  }
}

async function runEngine(engine) {
  const dir = path.join(ROOT, 'results', engine.replace(/[^\w.-]+/g, '_'))
  fs.mkdirSync(dir, { recursive: true })
  const results = []
  const history = {} // taskId -> {prompt, replyText}

  for (const task of TASKS) {
    if (TASK_FILTER && !TASK_FILTER.includes(task.id)) continue
    const label = `${engine} ▸ ${task.id}`
    let messages
    if (task.kind === 'custom') {
      messages = task.messages
    } else if (task.kind === 'followup') {
      const dep = history[task.dependsOn]
      if (!dep) {
        results.push({ task: task.id, skipped: `dependency ${task.dependsOn} failed` })
        continue
      }
      messages = [
        { role: 'user', content: dep.prompt },
        { role: 'assistant', content: dep.replyText },
        { role: 'user', content: task.prompt },
      ]
    } else if (task.kind === 'image') {
      messages = [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: visionImage } },
            { type: 'text', text: task.prompt },
          ],
        },
      ]
    } else {
      messages = [{ role: 'user', content: task.prompt }]
    }

    if (SAMPLES === 1) {
      results.push(await runTask(engine, task, messages, dir, history, label))
    } else {
      const rows = []
      for (let s = 0; s < SAMPLES; s++) {
        rows.push(await runTask(engine, task, messages, dir, history, `${label} [${s + 1}/${SAMPLES}]`))
      }
      const agg = aggregateRows(task, rows, SAMPLES)
      results.push(agg)
      console.log(`[bench] ${label} — aggregated ×${SAMPLES}: compiledRate=${agg.compiledRate}, dim=${agg.dimScore}, IoU=${agg.gold?.iou ?? '—'}, kit=${agg.buildability?.score ?? '—'}`)
    }
  }
  return { engine, results }
}

const enginesToRun = ENGINE_FILTER ?? ENGINES
console.log(`[bench] engines: ${enginesToRun.join(', ')}${TASK_FILTER ? ` · tasks: ${TASK_FILTER.join(', ')}` : ''}`)
const all = []
for (const e of enginesToRun) all.push(await runEngine(e)) // sequential: don't hammer one engine's rate limit
fs.writeFileSync(path.join(ROOT, 'results', 'results.json'), JSON.stringify(all, null, 2))
console.log('\n[bench] done → bench/results/results.json')

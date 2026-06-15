/**
 * Vibemesh model benchmark — engine × task matrix against the live API.
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
import { judgeModel } from './judge.mjs'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const API = 'http://localhost:5175/api/generate'
const ENGINES = ['claude-code', 'kimi', 'local:qwen2.5vl:7b']
const GEN_TIMEOUT = 900_000 // 15 min — thinking engines (claude-code/Opus) go silent for minutes on a kit
const RENDER_TIMEOUT = 90_000

const ENGINE_FILTER = process.env.BENCH_ENGINES?.split(',').map((s) => s.trim()).filter(Boolean)
const TASK_FILTER = process.env.BENCH_TASKS?.split(',').map((s) => s.trim()).filter(Boolean)

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
    if (m && !m[1].startsWith('$')) {
      if (/^(module|function)\b/.test(line.trim())) continue
      count++
      if (m[4] && /\[.*\]/.test(m[4])) annotated++
    }
    if (/^\s*(module|function)\s/.test(line)) break
  }
  return { count, groups, annotated }
}

/* ── scoring helpers ── */

function checkExpectations(task, code, metrics) {
  const notes = []
  let dimScore = null
  const e = task.expect ?? {}
  if (e.bbox && metrics) {
    const diffs = e.bbox.map((d, i) => Math.abs(metrics.size[i] - d))
    const worst = Math.max(...diffs)
    dimScore = worst <= e.tol ? 1 : worst <= e.tol * 3 ? 0.5 : 0
    notes.push(`bbox ${metrics.size.join('×')} vs expected ${e.bbox.join('×')} (worst off by ${worst.toFixed(2)}mm)`)
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

    console.log(`[bench] ${label} — generating…`)
    const gen = await generate(engine, messages, task.context)
    if (gen.error) {
      console.log(`[bench] ${label} — GEN FAILED: ${gen.error}`)
      results.push({ task: task.id, genMs: gen.genMs, error: gen.error })
      continue
    }
    const code = extractScad(gen.text)
    if (!code) {
      console.log(`[bench] ${label} — NO CODE BLOCK in reply (${gen.text.length} chars)`)
      results.push({ task: task.id, genMs: gen.genMs, error: 'no scad code block in reply', replyChars: gen.text.length })
      continue
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
      gold: gold ?? undefined,
      buildability: buildability ?? undefined,
      overSplit: overSplit || undefined,
      judge: judge ?? undefined,
      notes: checks.notes,
      codeLines: code.split('\n').length,
    }
    results.push(row)
    const goldNote = gold ? (gold.error ? ', gold=ERR' : `, IoU=${gold.iou}`) : ''
    const kitNote = buildability ? `, kit=${buildability.score}${buildability.hardFail ? ' (HARD FAIL)' : ''} [${(buildability.pieces ?? []).length}pc]` : ''
    console.log(`[bench] ${label} — gen ${Math.round(gen.genMs / 1000)}s, compiled=${compiled.ok}, size=${metrics?.size?.join('×') ?? '—'}, params=${params.count}${goldNote}${kitNote}`)
  }
  return { engine, results }
}

const enginesToRun = ENGINE_FILTER ?? ENGINES
console.log(`[bench] engines: ${enginesToRun.join(', ')}${TASK_FILTER ? ` · tasks: ${TASK_FILTER.join(', ')}` : ''}`)
const all = []
for (const e of enginesToRun) all.push(await runEngine(e)) // sequential: don't hammer one engine's rate limit
fs.writeFileSync(path.join(ROOT, 'results', 'results.json'), JSON.stringify(all, null, 2))
console.log('\n[bench] done → bench/results/results.json')

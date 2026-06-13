/**
 * Vibemesh model benchmark — engine × task matrix against the live API.
 * Usage: node bench/run.mjs
 * Output: bench/results/<engine>/<task>.scad + bench/results/results.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createOpenSCAD } from 'openscad-wasm'
import { scoreAgainstGold } from './compare.mjs'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const API = 'http://localhost:5175/api/generate'
const ENGINES = ['claude-code', 'kimi', 'local:qwen2.5vl:7b']
const GEN_TIMEOUT = 300_000
const RENDER_TIMEOUT = 90_000

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
]

/* ── SSE generation via the app's API ── */

async function generate(engine, messages) {
  const started = Date.now()
  const controller = new AbortController()
  const killer = setTimeout(() => controller.abort(), GEN_TIMEOUT)
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ engine, messages }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { error: `HTTP ${res.status}: ${body.slice(0, 200)}`, genMs: Date.now() - started }
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let full = ''
    let sseError = null
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''
      for (const ev of events) {
        const line = ev.trim()
        if (!line.startsWith('data: ')) continue
        const payload = JSON.parse(line.slice(6))
        if (payload.type === 'delta') full += payload.text
        if (payload.type === 'error') sseError = payload.message
      }
    }
    if (sseError) return { error: sseError, genMs: Date.now() - started }
    return { text: full, genMs: Date.now() - started }
  } catch (err) {
    return { error: err?.name === 'AbortError' ? `generation timeout after ${GEN_TIMEOUT / 1000}s` : String(err), genMs: Date.now() - started }
  } finally {
    clearTimeout(killer)
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

async function compileScad(code) {
  const started = Date.now()
  const job = (async () => {
    const o = await createOpenSCAD({ noInitialRun: true, print: () => {}, printErr: () => {} })
    const inst = o.getInstance()
    inst.FS.writeFile('/in.scad', code)
    try {
      inst.callMain(['/in.scad', '-o', '/out.stl', '--export-format=binstl'])
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
    const gen = await generate(engine, messages)
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
      notes: checks.notes,
      codeLines: code.split('\n').length,
    }
    results.push(row)
    const goldNote = gold ? (gold.error ? ', gold=ERR' : `, IoU=${gold.iou}`) : ''
    console.log(`[bench] ${label} — gen ${Math.round(gen.genMs / 1000)}s, compiled=${compiled.ok}, size=${metrics?.size?.join('×') ?? '—'}, params=${params.count}${goldNote}`)
  }
  return { engine, results }
}

const all = await Promise.all(ENGINES.map((e) => runEngine(e)))
fs.writeFileSync(path.join(ROOT, 'results', 'results.json'), JSON.stringify(all, null, 2))
console.log('\n[bench] done → bench/results/results.json')

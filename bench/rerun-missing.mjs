import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createOpenSCAD } from 'openscad-wasm'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const API = 'http://localhost:5175/api/generate'

const T1_PROMPT = 'A 25mm calibration cube with a 6mm diameter hole through the center, from the top face all the way through to the bottom.'
const T4_PROMPT = 'Make the hole 10mm diameter instead, and add a 2mm chamfer to the top edges of the cube.'

async function generate(engine, messages) {
  const started = Date.now()
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Connection: 'close' },
    body: JSON.stringify({ engine, messages }),
  })
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let full = ''
  let err = null
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const evs = buf.split('\n\n')
    buf = evs.pop() ?? ''
    for (const e of evs) {
      if (!e.trim().startsWith('data: ')) continue
      const p = JSON.parse(e.trim().slice(6))
      if (p.type === 'delta') full += p.text
      if (p.type === 'error') err = p.message
    }
  }
  return { text: full, error: err, genMs: Date.now() - started }
}

function extractScad(text) {
  const re = /```(?:scad|openscad)?\s*\n([\s\S]*?)```/g
  let code = null, best = 0
  for (const m of text.matchAll(re)) if (m[1].length > best) { best = m[1].length; code = m[1].trim() }
  return code
}

async function compile(code) {
  const stderr = []
  const o = await createOpenSCAD({ noInitialRun: true, print: () => {}, printErr: (l) => stderr.push(l) })
  const inst = o.getInstance()
  inst.FS.writeFile('/in.scad', code)
  try { inst.callMain(['/in.scad', '-o', '/out.stl', '--export-format=binstl']) } catch { /* abnormal exit */ }
  let stl = null
  try { stl = inst.FS.readFile('/out.stl', { encoding: 'binary' }) } catch { /* none */ }
  return { stl, stderr: stderr.filter((l) => /ERROR|WARNING/i.test(l)).slice(0, 6) }
}

function bbox(stl) {
  const v = new DataView(stl.buffer, stl.byteOffset, stl.byteLength)
  const n = v.getUint32(80, true)
  let min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9]
  for (let i = 0; i < n; i++) {
    const b = 84 + i * 50 + 12
    for (let k = 0; k < 3; k++) for (let a = 0; a < 3; a++) {
      const x = v.getFloat32(b + k * 12 + a * 4, true)
      if (x < min[a]) min[a] = x
      if (x > max[a]) max[a] = x
    }
  }
  return { size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]].map((x) => Math.round(x * 100) / 100), minZ: Math.round(min[2] * 100) / 100 }
}

// ── T4 reruns for claude-code and kimi ──
for (const engine of ['claude-code', 'kimi']) {
  const dirName = engine.replace(/[^\w.-]+/g, '_')
  const t1 = fs.readFileSync(path.join(ROOT, 'results', dirName, 'T1-cube.scad'), 'utf8')
  const messages = [
    { role: 'user', content: T1_PROMPT },
    { role: 'assistant', content: 'Here is the model.\n\n```scad\n' + t1 + '\n```' },
    { role: 'user', content: T4_PROMPT },
  ]
  const g = await generate(engine, messages)
  if (g.error || !g.text) { console.log(`${engine} T4: FAILED ${g.error}`); continue }
  const code = extractScad(g.text)
  if (!code) { console.log(`${engine} T4: no code block`); continue }
  fs.writeFileSync(path.join(ROOT, 'results', dirName, 'T4-iterate.scad'), code)
  const c = await compile(code)
  const m = c.stl ? bbox(c.stl) : null
  console.log(`${engine} T4: gen ${Math.round(g.genMs / 1000)}s compiled=${Boolean(c.stl)} size=${m?.size?.join('×')} minZ=${m?.minZ} has10=${code.includes('10')}`)
}

// ── local T1 retry ──
{
  const g = await generate('local:qwen2.5vl:7b', [{ role: 'user', content: T1_PROMPT }])
  const code = g.text ? extractScad(g.text) : null
  if (code) {
    fs.writeFileSync(path.join(ROOT, 'results', 'local_qwen2.5vl_7b', 'T1-cube.scad'), code)
    const c = await compile(code)
    const m = c.stl ? bbox(c.stl) : null
    console.log(`local T1 retry: gen ${Math.round(g.genMs / 1000)}s compiled=${Boolean(c.stl)} size=${m?.size?.join('×')} errors=${c.stderr.join(' | ')}`)
  } else {
    console.log(`local T1 retry: still no code block (${g.text?.length ?? 0} chars, err=${g.error})`)
  }
}

// ── diagnose local compile failures ──
for (const t of ['T2-stand', 'T3-clip', 'T6-vision']) {
  const p = path.join(ROOT, 'results', 'local_qwen2.5vl_7b', `${t}.scad`)
  if (!fs.existsSync(p)) continue
  const c = await compile(fs.readFileSync(p, 'utf8'))
  console.log(`local ${t} compile errors: ${c.stderr.join(' | ') || '(none captured)'} → stl=${Boolean(c.stl)}`)
}

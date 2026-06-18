/**
 * P3 live check (engine in the loop, slow): does claude-code, given the wheel-axle skill
 * fragment (forced via context.skillIds), produce a compilable rolling-chassis kit whose
 * bores carry the shared spin clearance? Compiles the reply + runs the skill's validator.
 *   node bench/wheel-axle-livecheck.mjs
 */
import http from 'node:http'
import { createOpenSCAD } from 'openscad-wasm'
import { SKILLS } from '../server/skills.mjs'

const TIMEOUT = 1_500_000 // 25 min — claude-code thinks silently for many minutes on a kit
const prompt =
  'A simple rolling toy car I can 3D-print and assemble from separate snap/fit parts: a chassis, two wheels, and an axle the wheels spin on. Give me the parts so the wheels actually turn on the axle.'
const body = JSON.stringify({
  engine: 'claude-code',
  messages: [{ role: 'user', content: prompt }],
  context: { bed: { x: 220, y: 220, z: 250, label: 'Ender 3' }, skillIds: ['wheel-axle'] },
})

function generate() {
  return new Promise((resolve) => {
    let settled = false, killer, full = '', sseErr = null, buf = ''
    const done = (v) => { if (!settled) { settled = true; clearTimeout(killer); resolve(v) } }
    const req = http.request({ hostname: 'localhost', port: 5175, path: '/api/generate', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      if (res.statusCode !== 200) { let t = ''; res.on('data', (c) => (t += c)); res.on('end', () => done({ error: `HTTP ${res.statusCode}: ${t.slice(0, 200)}` })); return }
      res.setEncoding('utf8')
      res.on('data', (c) => { buf += c; const ev = buf.split('\n\n'); buf = ev.pop() ?? ''; for (const e of ev) { const l = e.trim(); if (!l.startsWith('data: ')) continue; try { const p = JSON.parse(l.slice(6)); if (p.type === 'delta') full += p.text; if (p.type === 'error') sseErr = p.message } catch { /* keep-alive */ } } })
      res.on('end', () => done(sseErr ? { error: sseErr } : { text: full }))
      res.on('error', (e) => done({ error: String(e) }))
    })
    req.on('error', (e) => done({ error: `req error: ${e.message}` }))
    req.setTimeout(0)
    killer = setTimeout(() => { req.destroy(); done({ error: `timeout ${TIMEOUT / 1000}s` }) }, TIMEOUT)
    req.write(body); req.end()
  })
}

function extractScad(text) {
  const re = /```(?:scad|openscad)?\s*\n([\s\S]*?)```/g
  let best = null, len = 0
  for (const m of text.matchAll(re)) if (m[1].length > len) { len = m[1].length; best = m[1].trim() }
  return best
}

async function compileTris(code) {
  const o = await createOpenSCAD({ noInitialRun: true, print: () => {}, printErr: () => {} })
  const inst = o.getInstance()
  inst.FS.writeFile('/in.scad', code)
  try { inst.callMain(['/in.scad', '-o', '/out.stl', '--export-format=binstl', '--backend=Manifold']) } catch { /* no geometry below */ }
  try { const s = inst.FS.readFile('/out.stl', { encoding: 'binary' }); return s && s.length ? new DataView(s.buffer, s.byteOffset, s.byteLength).getUint32(80, true) : 0 } catch { return 0 }
}

console.log('[livecheck] generating wheel-axle kit on claude-code (forced skill, up to 25 min)…')
const t0 = Date.now()
const gen = await generate()
const secs = Math.round((Date.now() - t0) / 1000)
if (gen.error) { console.log(`[livecheck] GEN FAILED (${secs}s): ${gen.error}`); process.exit(1) }
const code = extractScad(gen.text)
if (!code) { console.log(`[livecheck] (${secs}s) NO scad code block in reply (${gen.text.length} chars)`); process.exit(1) }
const tris = await compileTris(code)
const issues = SKILLS['wheel-axle'].validate(code)
const hasPartEnum = /\bpart\s*=\s*"all"/.test(code)
console.log(`[livecheck] gen ${secs}s, ${code.split('\n').length} lines`)
console.log(`  compiled: ${tris ? `yes (${tris} tris)` : 'NO'}`)
console.log(`  part enum (kit): ${hasPartEnum ? 'yes' : 'no'}`)
console.log(`  wheel-axle validator: ${issues.length ? 'ISSUES → ' + issues.join('; ') : 'PASS (bore = axle_d + spin clearance)'}`)
console.log(tris && !issues.length ? '[livecheck] PASS — skill produced a compilable kit with the spin-fit joint.' : '[livecheck] PARTIAL — see above.')

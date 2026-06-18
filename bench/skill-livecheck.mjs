/**
 * Generic per-skill live check (engine in the loop). Unlike wheel-axle-livecheck.mjs this
 * does NOT force context.skillIds — it sends a natural prompt and relies on prompt-intent
 * RETRIEVAL to inject the skill server-side, then compiles the reply and runs the named
 * skill's validator. Proves the full loop: prompt → selectSkills → fragment → model → CAD.
 *
 *   node bench/skill-livecheck.mjs "<prompt>" <skill-id> [engine]
 *   node bench/skill-livecheck.mjs "a small two-gear gearbox" spur-gear
 */
import http from 'node:http'
import { createOpenSCAD } from 'openscad-wasm'
import { SKILLS } from '../server/skills.mjs'

const [, , prompt, skillId, engine = 'claude-code'] = process.argv
if (!prompt || !skillId || !SKILLS[skillId]) {
  console.error('usage: node bench/skill-livecheck.mjs "<prompt>" <skill-id> [engine]')
  console.error('skills:', Object.keys(SKILLS).join(', '))
  process.exit(2)
}
const TIMEOUT = 1_500_000
const body = JSON.stringify({
  engine,
  messages: [{ role: 'user', content: prompt }],
  context: { bed: { x: 220, y: 220, z: 250, label: 'Ender 3' } }, // NO skillIds — retrieval must fire
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

console.log(`[livecheck] "${prompt}" on ${engine} (retrieval, no forced skillIds, up to 25 min)…`)
const t0 = Date.now()
const gen = await generate()
const secs = Math.round((Date.now() - t0) / 1000)
if (gen.error) { console.log(`[livecheck] GEN FAILED (${secs}s): ${gen.error}`); process.exit(1) }
const code = extractScad(gen.text)
if (!code) { console.log(`[livecheck] (${secs}s) NO scad code block in reply (${gen.text.length} chars)`); process.exit(1) }
const tris = await compileTris(code)
const issues = SKILLS[skillId].validate ? SKILLS[skillId].validate(code) : []
console.log(`[livecheck] gen ${secs}s, ${code.split('\n').length} lines`)
console.log(`  compiled: ${tris ? `yes (${tris} tris)` : 'NO'}`)
console.log(`  ${skillId} validator: ${issues.length ? 'ISSUES → ' + issues.join('; ') : 'PASS'}`)
console.log(tris && !issues.length ? `[livecheck] PASS — retrieval fired and "${skillId}" produced compilable, valid geometry.` : '[livecheck] PARTIAL — see above.')

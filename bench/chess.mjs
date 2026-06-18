/**
 * Per-piece image-to-CAD fidelity driver for the sci-fi chess set.
 * Exercises the SAME pipeline the app uses: POST the reference image + a piece prompt to
 * /api/generate, extract the SCAD, compile with openscad-wasm, render the 3 refine poses
 * (render.mjs), then run N refine passes (re-send the renders + reference, ask it to match).
 * Saves every pass's .scad + iso/front/top PNGs + a summary.json per piece for the expert board.
 *
 * Usage:
 *   PIECE=pawn REFINES=2 ENGINE=claude-code node bench/chess.mjs
 *   PIECE=all  REFINES=2 node bench/chess.mjs        # pawn→king in order
 * Env: REF=<reference image path>  OUT=<output dir>  EFFORT=<claude effort>
 */
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { createOpenSCAD } from 'openscad-wasm'
import { renderViews } from './render.mjs'

const API = process.env.API || 'http://localhost:5175/api/generate'
const ENGINE = process.env.ENGINE || 'claude-code'
const EFFORT = process.env.EFFORT || 'high'
const REFINES = Math.max(0, Number(process.env.REFINES ?? 2))
const REF = process.env.REF || '/Users/sherif.shalaby/Downloads/pics/a569b73a-4aba-4d2d-96d4-a7fa47da1792.png'
const OUT = process.env.OUT || '/tmp/chess-out'
// max effort makes Opus think for many minutes; the 15-min default is too low for it.
const GEN_TIMEOUT = Math.max(60_000, Number(process.env.GEN_TIMEOUT_MS) || 900_000)
const RENDER_TIMEOUT = 90_000

const COMMON =
  ' It is a single solid 3D-printable chess piece in a clean sci-fi / hard-surface style: smooth machined' +
  ' surfaces broken up by crisp chamfered edges and faceted accents that match the faceted look in the reference,' +
  ' no lettering. Round flared/stepped base 20mm in diameter with a shallow recess on the underside for bed' +
  ' adhesion. Print-ready: manifold, sits flat on the bed at z=0, millimetres, PLA, NO supports, every overhang' +
  ' self-supporting (<=45deg or chamfered). Expose the key dimensions as Customizer parameters. Model ONLY this' +
  ' one piece — ignore the other pieces, the dimension diagram, and all text/labels in the image.'

const PIECES = {
  pawn: 'Model the PAWN — the 1st piece from the left in the reference. A faceted sphere head on a slender tapered faceted neck/stem; the sphere has a single horizontal equatorial groove and a thin vertical meridian slot cut across it. Overall height 28mm.' + COMMON,
  rook: 'Model the ROOK — the 2nd piece from the left. A sci-fi castle turret: a faceted cylindrical tower body with crenellations (a ring of rectangular battlement notches) cut into the top rim, and a recessed band around the body, rising from the flared base. Overall height 37mm.' + COMMON,
  knight: 'Model the KNIGHT — the 3rd piece from the left. A stylised angular low-poly horse head facing to one side, built from crisp flat facets (mane, muzzle and ears suggested by chamfered planes), on a short neck rising from the flared base. Overall height 36mm. Build it as the recognisable side-profile silhouette given real width with chamfered faces so it prints flat with no supports.' + COMMON,
  bishop: 'Model the BISHOP — the 4th piece from the left. A tall slender tapered faceted body that splits at the top into a forked/slotted head cradling a small sphere held in the vertical slot between two prongs, on a stem above the flared base. Overall height 43mm.' + COMMON,
  queen: 'Model the QUEEN — the 5th piece from the left. A tall faceted tapered body topped with a crown/coronet of several sharp upward-pointing spikes around the rim, narrowing through a stem to the flared base. Overall height 48mm.' + COMMON,
  king: 'Model the KING — the 6th and tallest piece. A tall faceted tapered body topped with a faceted crown and a CROSS finial at the very top, narrowing through a stem to the flared base. Overall height 55mm.' + COMMON,
}

const REFINE_INSTRUCTION =
  'Attached are three renders (isometric, front, top — in that order) of the CURRENT model you produced.' +
  ' The reference image at the start of this conversation is the CORRECT TARGET. First list the most important' +
  ' discrepancies between the render and the reference, in priority order (silhouette / overall shape first, then' +
  ' the distinctive features, then proportions, then the base). Then return a CORRECTED complete program that' +
  ' matches the reference more faithfully. Do NOT simplify, symmetrise, or drop the reference\'s distinctive' +
  ' features — make the silhouette and details read like the reference. Keep it printable (manifold, flat on bed, no supports).'

const refB64 = fs.readFileSync(REF).toString('base64')
const refMediaType = REF.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'
const imgBlock = (b64, mt) => ({ type: 'image', source: { type: 'base64', media_type: mt, data: b64 } })

function generate(messages) {
  const started = Date.now()
  const body = JSON.stringify({ engine: ENGINE, effort: EFFORT, messages })
  const url = new URL(API)
  return new Promise((resolve) => {
    let settled = false
    let killer
    const finish = (v) => { if (settled) return; settled = true; clearTimeout(killer); resolve(v) }
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
            } catch { /* keep-alive */ }
          }
        })
        res.on('end', () => finish(sseError ? { error: sseError, genMs: Date.now() - started } : { text: full, genMs: Date.now() - started }))
        res.on('error', (e) => finish({ error: String(e), genMs: Date.now() - started }))
      },
    )
    req.on('error', (e) => finish({ error: `request error: ${e.message}`, genMs: Date.now() - started }))
    req.setTimeout(0)
    killer = setTimeout(() => { req.destroy(); finish({ error: `gen timeout ${GEN_TIMEOUT / 1000}s`, genMs: Date.now() - started }) }, GEN_TIMEOUT)
    req.write(body)
    req.end()
  })
}

function extractScad(text) {
  const re = /```(?:scad|openscad)?\s*\n([\s\S]*?)```/g
  let code = null
  let best = 0
  for (const m of text.matchAll(re)) if (m[1].length > best) { best = m[1].length; code = m[1].trim() }
  return code
}

async function compileScad(code) {
  const started = Date.now()
  const job = (async () => {
    const o = await createOpenSCAD({ noInitialRun: true, print: () => {}, printErr: () => {} })
    const inst = o.getInstance()
    inst.FS.writeFile('/in.scad', code)
    try { inst.callMain(['/in.scad', '-o', '/out.stl', '--export-format=binstl', '--backend=Manifold']) } catch { /* check output */ }
    try { return inst.FS.readFile('/out.stl', { encoding: 'binary' }) } catch { return null }
  })()
  const timeout = new Promise((r) => setTimeout(() => r('TIMEOUT'), RENDER_TIMEOUT))
  const result = await Promise.race([job, timeout])
  if (result === 'TIMEOUT') return { ok: false, error: 'render timeout', renderMs: Date.now() - started }
  if (!result || result.length === 0) return { ok: false, error: 'no geometry', renderMs: Date.now() - started }
  return { ok: true, stl: result, renderMs: Date.now() - started }
}

function stlSize(stl) {
  const view = new DataView(stl.buffer, stl.byteOffset, stl.byteLength)
  const count = view.getUint32(80, true)
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < count; i++) {
    const base = 84 + i * 50 + 12
    for (let v = 0; v < 3; v++) for (let a = 0; a < 3; a++) {
      const val = view.getFloat32(base + v * 12 + a * 4, true)
      if (val < min[a]) min[a] = val
      if (val > max[a]) max[a] = val
    }
  }
  return { triangles: count, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]].map((n) => Math.round(n * 100) / 100), minZ: Math.round(min[2] * 100) / 100 }
}

function saveRenders(dir, piece, pass, stl) {
  const views = renderViews(stl)
  const paths = {}
  for (const v of views) {
    const p = path.join(dir, `${piece}-pass${pass}-${v.name}.png`)
    fs.writeFileSync(p, Buffer.from(v.pngBase64, 'base64'))
    paths[v.name] = p
  }
  return { views, paths }
}

async function runPiece(piece) {
  const prompt = PIECES[piece]
  if (!prompt) throw new Error(`unknown piece ${piece}`)
  const dir = path.join(OUT, piece)
  fs.mkdirSync(dir, { recursive: true })
  console.log(`\n=== ${piece.toUpperCase()} ===`)
  const passes = []

  // pass 0: generate from the reference image
  let messages = [{ role: 'user', content: [imgBlock(refB64, refMediaType), { type: 'text', text: prompt }] }]
  let prevReply = null
  for (let pass = 0; pass <= REFINES; pass++) {
    if (pass > 0) {
      const last = passes[pass - 1]
      if (!last.compiled || !last.renderViews) { console.log(`  pass ${pass}: skipped (previous pass did not compile)`); break }
      messages = [
        { role: 'user', content: [imgBlock(refB64, refMediaType), { type: 'text', text: prompt }] },
        { role: 'assistant', content: prevReply },
        { role: 'user', content: [...last.renderViews.map((v) => imgBlock(v.pngBase64, 'image/png')), { type: 'text', text: REFINE_INSTRUCTION }] },
      ]
    }
    console.log(`  pass ${pass}: generating…`)
    const gen = await generate(messages)
    if (gen.error) { console.log(`  pass ${pass}: GEN FAILED ${gen.error}`); passes.push({ pass, error: gen.error, genMs: gen.genMs }); break }
    const code = extractScad(gen.text)
    if (!code) { console.log(`  pass ${pass}: no code block`); passes.push({ pass, error: 'no code block', genMs: gen.genMs }); break }
    prevReply = gen.text
    const scadPath = path.join(dir, `${piece}-pass${pass}.scad`)
    fs.writeFileSync(scadPath, code)
    const compiled = await compileScad(code)
    let size = null
    let rendered = null
    if (compiled.ok) {
      size = stlSize(compiled.stl)
      rendered = saveRenders(dir, piece, pass, compiled.stl)
    }
    console.log(`  pass ${pass}: gen ${Math.round(gen.genMs / 1000)}s, compiled=${compiled.ok}, size=${size?.size?.join('×') ?? '—'}, scad=${path.basename(scadPath)}`)
    passes.push({ pass, genMs: gen.genMs, compiled: compiled.ok, compileError: compiled.ok ? undefined : compiled.error, size: size?.size, minZ: size?.minZ, triangles: size?.triangles, scad: scadPath, renders: rendered?.paths, renderViews: rendered?.views, codeLines: code.split('\n').length })
  }
  // strip the heavy base64 from the saved summary (the PNGs are on disk)
  // eslint-disable-next-line no-unused-vars -- renderViews is destructured only to omit it
  const summary = passes.map(({ renderViews, ...rest }) => rest)
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify({ piece, engine: ENGINE, effort: EFFORT, reference: REF, passes: summary }, null, 2))
  return summary
}

const target = (process.env.PIECE || 'pawn').toLowerCase()
const order = ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king']
const list = target === 'all' ? order : target.split(',').map((s) => s.trim())
fs.mkdirSync(OUT, { recursive: true })
console.log(`[chess] engine=${ENGINE} effort=${EFFORT} refines=${REFINES} pieces=${list.join(',')} out=${OUT}`)
const all = {}
for (const p of list) all[p] = await runPiece(p)
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ engine: ENGINE, effort: EFFORT, refines: REFINES, reference: REF, pieces: all }, null, 2))
console.log(`\n[chess] done → ${OUT}`)

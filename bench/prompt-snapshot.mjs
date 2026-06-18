/**
 * Zero-API prompt-assembly snapshot — the byte-identity guard for the P2 refactor.
 * Computes the FULLY ASSEMBLED system prompt (SYSTEM_PROMPT + contextText) for every
 * {engine × kit} combination and hashes each. The P2 spine+skills assembler must
 * reproduce these hashes EXACTLY before any new skill knowledge is added.
 *
 *   node bench/prompt-snapshot.mjs            # write baseline (bench/prompt-snapshot.json)
 *   node bench/prompt-snapshot.mjs --check    # compare against baseline, exit 1 on drift
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { SYSTEM_PROMPT } from '../server/prompt.mjs'
import { contextText } from '../server/providers.mjs'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const BASELINE = path.join(ROOT, 'prompt-snapshot.json')
const CHECK = process.argv.includes('--check')

const ENGINES = ['anthropic', 'kimi', 'claude-code', 'local:qwen2.5vl:7b']
const BED = { x: 220, y: 220, z: 250, label: 'Ender 3' }
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16)

const snap = {}
for (const engine of ENGINES) {
  for (const kit of [false, true]) {
    const assembled = SYSTEM_PROMPT + contextText({ bed: BED, kit }, engine)
    snap[`${engine}|kit=${kit}`] = { len: assembled.length, sha: sha(assembled) }
  }
}

if (CHECK) {
  if (!fs.existsSync(BASELINE)) { console.error('[snapshot] no baseline — run without --check first'); process.exit(1) }
  const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
  let drift = 0
  for (const k of Object.keys(snap)) {
    const b = base[k]
    if (!b || b.sha !== snap[k].sha || b.len !== snap[k].len) {
      drift++
      console.error(`[snapshot] DRIFT ${k}: baseline len=${b?.len} sha=${b?.sha} → now len=${snap[k].len} sha=${snap[k].sha}`)
    }
  }
  for (const k of Object.keys(base)) if (!snap[k]) { drift++; console.error(`[snapshot] MISSING key ${k}`) }
  if (drift) { console.error(`[snapshot] FAIL — ${drift} drift(s); the refactor changed the assembled prompt.`); process.exit(1) }
  console.log(`[snapshot] PASS — all ${Object.keys(snap).length} assembled prompts byte-identical to baseline.`)
} else {
  fs.writeFileSync(BASELINE, JSON.stringify(snap, null, 2))
  console.log(`[snapshot] wrote baseline → ${path.relative(ROOT, BASELINE)} (${Object.keys(snap).length} combos)`)
  for (const [k, v] of Object.entries(snap)) console.log(`  ${k.padEnd(28)} len=${v.len} sha=${v.sha}`)
}

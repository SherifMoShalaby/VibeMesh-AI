/**
 * Retro-score saved bench results against gold references (no generation).
 * Recompiles each bench/results/<engine>/<task>.scad, voxel-compares it to
 * bench/gold/<task>.scad, writes a `gold` block into each results.json row,
 * and prints an IoU summary table.
 *
 * Usage: node bench/score.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileScad, goldExistsFor, scoreAgainstGold } from './compare.mjs'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const RESULTS_PATH = path.join(ROOT, 'results', 'results.json')

const all = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8'))

for (const block of all) {
  const dir = path.join(ROOT, 'results', block.engine.replace(/[^\w.-]+/g, '_'))
  for (const row of block.results) {
    const label = `${block.engine} ▸ ${row.task}`
    if (!goldExistsFor(row.task)) continue
    const scadPath = path.join(dir, `${row.task}.scad`)
    if (!fs.existsSync(scadPath)) {
      console.log(`[score] ${label} — no saved .scad, skipping`)
      continue
    }
    const stl = await compileScad(fs.readFileSync(scadPath, 'utf8'))
    if (!stl) {
      row.gold = { error: 'candidate failed to compile' }
      console.log(`[score] ${label} — candidate failed to compile`)
      continue
    }
    try {
      row.gold = await scoreAgainstGold(row.task, stl)
      console.log(`[score] ${label} — IoU ${row.gold.iou} (dice ${row.gold.dice}, vol×${row.gold.volumeRatio}, rot ${row.gold.rotationDeg}°)`)
    } catch (err) {
      row.gold = { error: String(err) }
      console.log(`[score] ${label} — ERROR ${err}`)
    }
  }
}

fs.writeFileSync(RESULTS_PATH, JSON.stringify(all, null, 2))

/* ── summary table ── */

const tasks = [...new Set(all.flatMap((b) => b.results.map((r) => r.task)))].filter(goldExistsFor)
const engines = all.map((b) => b.engine)
const cell = (engine, task) => {
  const row = all.find((b) => b.engine === engine)?.results.find((r) => r.task === task)
  if (!row?.gold) return '—'
  return row.gold.error ? 'ERR' : row.gold.iou.toFixed(3)
}

const pad = (s, w) => String(s).padEnd(w)
const W = Math.max(...engines.map((e) => e.length)) + 2
console.log(`\nIoU vs gold (1.0 = identical geometry)\n`)
console.log(pad('', 12) + engines.map((e) => pad(e, W)).join(''))
for (const task of tasks) {
  console.log(pad(task, 12) + engines.map((e) => pad(cell(e, task), W)).join(''))
}
console.log('\n[score] updated bench/results/results.json')

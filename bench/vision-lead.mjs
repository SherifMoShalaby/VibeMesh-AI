/**
 * Vision Lead: a LOCAL multimodal reviewer (Qwen2.5-VL via Ollama). Sends one or more images
 * to the model with a prompt and prints its analysis — used to compare a generated chess piece's
 * render against the reference image, independently of the cloud model.
 *
 * Usage:
 *   node bench/vision-lead.mjs "<prompt>" <image1> [image2 ...]
 * Env: VL_MODEL (default qwen2.5vl:7b), VL_URL (default http://localhost:11434)
 */
import fs from 'node:fs'

const MODEL = process.env.VL_MODEL || 'qwen2.5vl:7b'
const URL = (process.env.VL_URL || 'http://localhost:11434') + '/api/chat'

const [prompt, ...imgs] = process.argv.slice(2)
if (!prompt || imgs.length === 0) {
  console.error('usage: node bench/vision-lead.mjs "<prompt>" <image1> [image2 ...]')
  process.exit(1)
}

const images = imgs.map((p) => fs.readFileSync(p).toString('base64'))

const body = {
  model: MODEL,
  messages: [{ role: 'user', content: prompt, images }],
  stream: false,
  options: { temperature: 0.2 },
}

const started = Date.now()
const res = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
if (!res.ok) {
  console.error(`Ollama HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
  process.exit(1)
}
const data = await res.json()
const text = data?.message?.content ?? '(no content)'
console.error(`[vision-lead] model=${MODEL} images=${imgs.length} took ${Math.round((Date.now() - started) / 1000)}s`)
console.log(text)

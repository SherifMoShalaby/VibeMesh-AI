import 'dotenv/config'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyRuntimeSetting, providerStatus, streamChat, testEngine, SYSTEM_PROMPT_TOKENS, UserFacingError, extractScadBlock, reviewWithSkills } from './providers.mjs'
import { SCREWS, BEARINGS } from './hardware.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 5175)
// Bind to loopback by default so a casual `npm start` is not exposed on the LAN/internet.
// Set HOST=0.0.0.0 to opt into external exposure (only do so behind auth — see SECURITY.md).
const HOST = process.env.HOST || '127.0.0.1'

const app = express()
// Body parsing is per-route so the large (base64 image) limit applies ONLY to /api/generate.
const jsonSmall = express.json({ limit: '64kb' })
const jsonLarge = express.json({ limit: '30mb' })

app.get('/api/health', async (_req, res) => {
  const providers = await providerStatus()
  // systemTokens lets the client subtract the real shared-system-prompt cost from each engine's
  // context window when budgeting history (no hardcoded guess that drifts as the prompt grows).
  res.json({ ok: true, providers, systemTokens: SYSTEM_PROMPT_TOKENS })
})

/** The metal-hardware catalog (data only) — the client computes the bill-of-materials over the
 *  generated code locally, so the server never sees OpenSCAD; this just supplies the dims so the
 *  catalog stays the single source of truth (no drifting client copy). */
app.get('/api/hardware', (_req, res) => {
  res.json({ screws: SCREWS, bearings: BEARINGS })
})

/** Save a connection setting (API key / base URL) — applied live, persisted to .env. */
app.post('/api/connect', jsonSmall, async (req, res) => {
  const { key, value } = req.body ?? {}
  try {
    applyRuntimeSetting(key, value)
  } catch (error) {
    res.status(400).json({ ok: false, message: error instanceof UserFacingError ? error.message : 'Could not save setting.' })
    return
  }
  res.json({ ok: true, providers: await providerStatus() })
})

/** Cheap 1-token connectivity test for an engine. */
app.post('/api/test', jsonSmall, async (req, res) => {
  const { engine } = req.body ?? {}
  if (typeof engine !== 'string') {
    res.status(400).json({ ok: false, message: 'engine is required' })
    return
  }
  res.json(await testEngine(engine))
})

/**
 * POST /api/generate
 * body: { engine: string, messages: [{ role, content }] }
 * Streams SSE: {type:'delta', text}, {type:'done'}, {type:'error', message}
 */
app.post('/api/generate', jsonLarge, async (req, res) => {
  const { engine, model, effort, messages, context } = req.body ?? {}
  if (!Array.isArray(messages) || messages.length === 0 || typeof engine !== 'string') {
    res.status(400).json({ error: 'bad_request', message: 'engine and messages are required' })
    return
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`)

  // abort upstream generation if the client disconnects mid-stream
  const abort = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) abort.abort()
  })

  try {
    let full = ''
    const outcome = await streamChat({
      engine,
      model: typeof model === 'string' ? model : undefined,
      effort: typeof effort === 'string' ? effort : undefined,
      messages,
      context,
      signal: abort.signal,
      onDelta: (text) => { full += text; send({ type: 'delta', text }) },
    })
    // advisory: which skills fired + their validators' verdict on the generated code (never
    // blocks). Guarded separately so a validator bug can't turn a good generation into error.
    let review = { skillIds: [], droppedSkillIds: [], report: [] }
    try { review = reviewWithSkills({ context, messages, code: extractScadBlock(full) }) } catch { /* advisory only */ }
    // stopReason lets the client detect an output-length truncation (cut-off program) instead of
    // adopting half a reply; it's the LAST field so the done event stays back-compatible.
    send({ type: 'done', skillIds: review.skillIds, droppedSkillIds: review.droppedSkillIds, skillReport: review.report, stopReason: outcome?.stopReason })
  } catch (error) {
    if (abort.signal.aborted || error?.name === 'AbortError') {
      res.end()
      return
    }
    const message = error instanceof UserFacingError ? error.message : 'Generation failed. Please try again.'
    if (!(error instanceof UserFacingError)) console.error('[vibemesh-ai] generate error:', error)
    send({ type: 'error', message })
  }
  res.end()
})

// Production: serve the built frontend
if (process.env.NODE_ENV === 'production') {
  const dist = path.resolve(__dirname, '../dist')
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    next()
  })
  app.use(
    express.static(dist, {
      // Vite content-hashes asset filenames, so they're safe to cache immutably.
      maxAge: '1y',
      immutable: true,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache')
      },
    }),
  )
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

const server = app.listen(PORT, HOST, () => {
  console.log(`[vibemesh-ai] api on http://${HOST}:${PORT}`)
  providerStatus().then((providers) => {
    for (const p of providers) {
      console.log(`[vibemesh-ai]   ${p.available ? '●' : '○'} ${p.label} — ${p.detail}`)
    }
  })
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`[vibemesh-ai] port ${PORT} is already in use — set PORT to a free port.`)
  else console.error('[vibemesh-ai] server error:', err)
  process.exit(1)
})

// Drain on container/orchestrator stop; force-exit if streams keep the socket open.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 5000).unref()
  })
}

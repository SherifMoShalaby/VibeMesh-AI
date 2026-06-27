/**
 * SEC-11 — Auth-contract CI guard (zero-API static ratchet)
 *
 * Asserts that every spending / key-writing route in server/index.mjs is preceded by the required
 * auth middleware, so a future route addition that forgets the gate fails CI immediately.
 *
 * Strategy: static text analysis of server/index.mjs — no live server, no API key needed.
 * Each route definition is parsed into {method, path, middlewares} and the contract is checked:
 *
 *   ROUTE                               enforceAuthWhenConfigured  requireOwner
 *   POST /api/generate                  required                   —
 *   POST /api/connect                   required                   required (.env writer)
 *   POST /api/connections               required                   required (.env writer)
 *   DELETE /api/connections/:id         required                   required (.env writer)
 *   POST /api/discover-models           required                   required (uses validateFetchUrl)
 *   POST /api/test                      required                   —
 *
 * Additional static grep: every route that calls streamChat / applyRuntimeSetting /
 * validateFetchUrl must have enforceAuthWhenConfigured somewhere on that route.
 *
 *   node bench/auth.selftest.mjs   → exit 0 (all pass) / 1 (a guard tripped)
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const INDEX = path.resolve(__dirname, '../server/index.mjs')
const src = fs.readFileSync(INDEX, 'utf8')
const lines = src.split('\n')

let passed = 0
const cases = []
const test = (name, fn) => cases.push({ name, fn })

/* ── helpers ── */

/**
 * Parse a single route line like:
 *   app.post('/api/generate', generateLimiter, enforceAuthWhenConfigured, jsonLarge, async ...
 * and return { method, routePath, middlewares: string[] } or null if not a route line.
 */
function parseRouteLine(line) {
  const m = line.match(/^\s*app\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]\s*,(.+)/)
  if (!m) return null
  const method = m[1].toUpperCase()
  const routePath = m[2]
  // Collect middleware identifiers before the async handler
  const after = m[3]
  const mws = []
  // Split on commas and collect bare identifiers (not 'async', not function bodies)
  for (const tok of after.split(',')) {
    const t = tok.trim()
    if (/^async\b/.test(t) || t.startsWith('(') || t.startsWith('function')) break
    if (/^\w+$/.test(t)) mws.push(t)
  }
  return { method, routePath, middlewares: mws }
}

/** Find all route definitions in the source (single-line app.METHOD calls). */
function parseAllRoutes() {
  const routes = []
  for (const line of lines) {
    const r = parseRouteLine(line)
    if (r) routes.push(r)
  }
  return routes
}

const routes = parseAllRoutes()

/** Find the route matching method + path pattern (exact or prefix). */
function findRoute(method, routePath) {
  return routes.find((r) => r.method === method.toUpperCase() && r.routePath === routePath)
}

/* ── 1. All six guarded routes must carry enforceAuthWhenConfigured ── */

test('POST /api/generate carries enforceAuthWhenConfigured', () => {
  const r = findRoute('POST', '/api/generate')
  assert.ok(r, 'POST /api/generate route must be defined in server/index.mjs')
  assert.ok(
    r.middlewares.includes('enforceAuthWhenConfigured'),
    `POST /api/generate is missing enforceAuthWhenConfigured — it spends AI tokens unauthenticated. Found: ${r.middlewares.join(', ')}`,
  )
})

test('POST /api/connect carries enforceAuthWhenConfigured', () => {
  const r = findRoute('POST', '/api/connect')
  assert.ok(r, 'POST /api/connect route must be defined')
  assert.ok(
    r.middlewares.includes('enforceAuthWhenConfigured'),
    `POST /api/connect is missing enforceAuthWhenConfigured. Found: ${r.middlewares.join(', ')}`,
  )
})

test('POST /api/connections carries enforceAuthWhenConfigured', () => {
  const r = findRoute('POST', '/api/connections')
  assert.ok(r, 'POST /api/connections route must be defined')
  assert.ok(
    r.middlewares.includes('enforceAuthWhenConfigured'),
    `POST /api/connections is missing enforceAuthWhenConfigured. Found: ${r.middlewares.join(', ')}`,
  )
})

test('DELETE /api/connections/:id carries enforceAuthWhenConfigured', () => {
  const r = findRoute('DELETE', '/api/connections/:id')
  assert.ok(r, 'DELETE /api/connections/:id route must be defined')
  assert.ok(
    r.middlewares.includes('enforceAuthWhenConfigured'),
    `DELETE /api/connections/:id is missing enforceAuthWhenConfigured. Found: ${r.middlewares.join(', ')}`,
  )
})

test('POST /api/discover-models carries enforceAuthWhenConfigured', () => {
  const r = findRoute('POST', '/api/discover-models')
  assert.ok(r, 'POST /api/discover-models route must be defined')
  assert.ok(
    r.middlewares.includes('enforceAuthWhenConfigured'),
    `POST /api/discover-models is missing enforceAuthWhenConfigured. Found: ${r.middlewares.join(', ')}`,
  )
})

test('POST /api/test carries enforceAuthWhenConfigured', () => {
  const r = findRoute('POST', '/api/test')
  assert.ok(r, 'POST /api/test route must be defined')
  assert.ok(
    r.middlewares.includes('enforceAuthWhenConfigured'),
    `POST /api/test is missing enforceAuthWhenConfigured. Found: ${r.middlewares.join(', ')}`,
  )
})

/* ── 2. .env-writing routes must additionally carry requireOwner ── */

test('POST /api/connect carries requireOwner (it writes .env)', () => {
  const r = findRoute('POST', '/api/connect')
  assert.ok(r, 'POST /api/connect route must be defined')
  assert.ok(
    r.middlewares.includes('requireOwner'),
    `POST /api/connect is missing requireOwner — it writes .env via applyRuntimeSetting. Found: ${r.middlewares.join(', ')}`,
  )
})

test('POST /api/connections carries requireOwner (it writes .env)', () => {
  const r = findRoute('POST', '/api/connections')
  assert.ok(r, 'POST /api/connections route must be defined')
  assert.ok(
    r.middlewares.includes('requireOwner'),
    `POST /api/connections is missing requireOwner — it writes .env via applyRuntimeSetting. Found: ${r.middlewares.join(', ')}`,
  )
})

test('DELETE /api/connections/:id carries requireOwner (it clears .env keys)', () => {
  const r = findRoute('DELETE', '/api/connections/:id')
  assert.ok(r, 'DELETE /api/connections/:id route must be defined')
  assert.ok(
    r.middlewares.includes('requireOwner'),
    `DELETE /api/connections/:id is missing requireOwner — it wipes .env keys. Found: ${r.middlewares.join(', ')}`,
  )
})

test('POST /api/discover-models carries requireOwner (it calls validateFetchUrl / probes SSRF-sensitive URLs)', () => {
  const r = findRoute('POST', '/api/discover-models')
  assert.ok(r, 'POST /api/discover-models route must be defined')
  assert.ok(
    r.middlewares.includes('requireOwner'),
    `POST /api/discover-models is missing requireOwner — it calls validateFetchUrl and probes external URLs. Found: ${r.middlewares.join(', ')}`,
  )
})

/* ── 3. Static grep guard: every call to sensitive functions must be in an auth-gated route ── */

/**
 * For each line that calls a sensitive function, find the nearest preceding route definition
 * line (same file, scanning upward) and assert that route has enforceAuthWhenConfigured.
 */
function sensitiveCallsAreGated(fnName) {
  const violations = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Skip import statements and function declarations
    if (/^\s*(import|export|\/\/|function|async function)/.test(line)) continue
    if (!line.includes(fnName + '(') && !line.includes(fnName + ' (')) continue
    // Walk backwards to find the nearest app.METHOD route that owns this call
    let owningRoute = null
    for (let j = i - 1; j >= 0; j--) {
      const candidate = parseRouteLine(lines[j])
      if (candidate) { owningRoute = candidate; break }
    }
    if (!owningRoute) continue // not inside a route handler (e.g. top-level helper) — skip
    if (!owningRoute.middlewares.includes('enforceAuthWhenConfigured')) {
      violations.push(
        `Line ${i + 1}: ${fnName}() called inside ${owningRoute.method} ${owningRoute.routePath} which lacks enforceAuthWhenConfigured`,
      )
    }
  }
  return violations
}

test('every streamChat() call is inside an enforceAuthWhenConfigured route', () => {
  const v = sensitiveCallsAreGated('streamChat')
  assert.deepEqual(v, [], `streamChat called from an unauthenticated route:\n  ${v.join('\n  ')}`)
})

test('every applyRuntimeSetting() call is inside an enforceAuthWhenConfigured route', () => {
  const v = sensitiveCallsAreGated('applyRuntimeSetting')
  assert.deepEqual(v, [], `applyRuntimeSetting called from an unauthenticated route:\n  ${v.join('\n  ')}`)
})

test('every validateFetchUrl() call is inside an enforceAuthWhenConfigured route', () => {
  const v = sensitiveCallsAreGated('validateFetchUrl')
  assert.deepEqual(v, [], `validateFetchUrl called from an unauthenticated route:\n  ${v.join('\n  ')}`)
})

/* ── 4. requireOwner ordering: must come AFTER enforceAuthWhenConfigured, never before ── */

test('requireOwner is always listed after enforceAuthWhenConfigured (correct ordering)', () => {
  const violations = []
  for (const r of routes) {
    const eIdx = r.middlewares.indexOf('enforceAuthWhenConfigured')
    const oIdx = r.middlewares.indexOf('requireOwner')
    if (oIdx !== -1 && eIdx === -1) {
      violations.push(`${r.method} ${r.routePath}: requireOwner without enforceAuthWhenConfigured`)
    }
    if (oIdx !== -1 && eIdx !== -1 && oIdx < eIdx) {
      violations.push(`${r.method} ${r.routePath}: requireOwner listed before enforceAuthWhenConfigured`)
    }
  }
  assert.deepEqual(violations, [], `Middleware ordering violations:\n  ${violations.join('\n  ')}`)
})

/* ── run ── */
let failed = 0
for (const { name, fn } of cases) {
  try {
    fn()
    passed++
  } catch (err) {
    failed++
    console.error(`✗ ${name}\n    ${err.message}`)
  }
}
if (failed) {
  console.error(`\n[auth.selftest] FAIL — ${failed}/${cases.length} case(s) failed.`)
  process.exit(1)
}
console.log(`[auth.selftest] PASS — ${passed} case(s): all six routes carry enforceAuthWhenConfigured; .env-writers carry requireOwner; streamChat/applyRuntimeSetting/validateFetchUrl calls are gated; middleware ordering correct.`)
process.exit(0)

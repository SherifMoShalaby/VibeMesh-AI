// Zero-API ratchet for server/rateLimit.mjs — fake req/res + injected clock, no network.
import assert from 'node:assert/strict'
import { rateLimit } from '../server/rateLimit.mjs'

const fakeRes = () => {
  const r = { statusCode: 200, headers: {}, body: undefined, ended: false }
  r.setHeader = (k, v) => { r.headers[k] = v }
  r.status = (c) => { r.statusCode = c; return r }
  r.json = (b) => { r.body = b; r.ended = true; return r }
  return r
}
const run = (mw, ip) => {
  const res = fakeRes()
  let nexted = false
  mw({ ip, headers: {} }, res, () => { nexted = true })
  return { res, nexted }
}

let clock = 1_000_000
const mw = rateLimit({ windowMs: 60_000, max: 3, now: () => clock })

// 1) under the limit → passes through, advisory headers present
for (let i = 1; i <= 3; i++) {
  const { res, nexted } = run(mw, '1.1.1.1')
  assert.equal(nexted, true, `req ${i} should pass`)
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['RateLimit-Limit'], '3')
  assert.equal(res.headers['RateLimit-Remaining'], String(3 - i))
}

// 2) over the limit → 429, blocked, Retry-After set
{
  const { res, nexted } = run(mw, '1.1.1.1')
  assert.equal(nexted, false, '4th req must be blocked')
  assert.equal(res.statusCode, 429)
  assert.equal(res.body.error, 'rate_limited')
  assert.ok(Number(res.headers['Retry-After']) > 0, 'Retry-After must be positive')
}

// 3) a different key has its own bucket (no cross-client contamination)
{
  const { nexted } = run(mw, '2.2.2.2')
  assert.equal(nexted, true, 'distinct IP must not inherit the first IP\'s count')
}

// 4) window reset → allowed again after the window elapses
clock += 60_001
{
  const { res, nexted } = run(mw, '1.1.1.1')
  assert.equal(nexted, true, 'after window reset the same IP is allowed again')
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['RateLimit-Remaining'], '2')
}

// 5) invalid config is rejected loudly
assert.throws(() => rateLimit({ windowMs: 0, max: 5 }), /positive/)
assert.throws(() => rateLimit({ windowMs: 1000, max: 0 }), /positive/)

mw.stop()
console.log('ratelimit.selftest: OK')

// In-memory fixed-window rate limiter → Express middleware. No external dependency.
//
// ponytail: per-process only — counters live in this Map, so behind N instances the
// effective limit is max×N. Swap the Map for a shared store (Redis INCR + EXPIRE on the
// same key) when the hosted lane scales past one process. Fixed-window (not sliding) is
// the deliberate floor: it can admit up to 2×max across a window boundary, which is fine
// for abuse-prevention on a slow, minutes-long generation route — tighten to a sliding
// window only if that burst ever matters.

/**
 * @param {object} opts
 * @param {number} opts.windowMs  window length in ms
 * @param {number} opts.max       max requests per key per window
 * @param {(req:any)=>string} [opts.key]  client identity (default: req.ip)
 * @param {()=>number} [opts.now] clock injection (tests)
 */
export function rateLimit({ windowMs, max, key = (req) => req.ip || 'anon', now = Date.now } = {}) {
  if (!(windowMs > 0) || !(max > 0)) throw new Error('rateLimit: windowMs and max must be positive')
  const hits = new Map() // id -> { count, resetAt }

  // Sweep expired buckets so one-off clients can't grow the Map without bound.
  const timer = setInterval(() => {
    const t = now()
    for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k)
  }, windowMs)
  timer.unref?.()

  const mw = (req, res, next) => {
    const id = key(req)
    const t = now()
    let rec = hits.get(id)
    if (!rec || rec.resetAt <= t) { rec = { count: 0, resetAt: t + windowMs }; hits.set(id, rec) }
    rec.count++

    const resetSec = Math.max(0, Math.ceil((rec.resetAt - t) / 1000))
    res.setHeader('RateLimit-Limit', String(max))
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - rec.count)))
    res.setHeader('RateLimit-Reset', String(resetSec))

    if (rec.count > max) {
      res.setHeader('Retry-After', String(resetSec))
      res.status(429).json({ error: 'rate_limited', message: 'Too many requests — please slow down and retry shortly.' })
      return
    }
    next()
  }

  mw.hits = hits          // exposed for tests
  mw.stop = () => clearInterval(timer)
  return mw
}

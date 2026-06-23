import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { OpenScadEngine } from './client'

/**
 * The OpenSCAD worker facade is the most intricate piece of client geometry plumbing —
 * latest-wins interactive coalescing, a never-dropped FIFO background queue, a per-job
 * watchdog, and respawn-before-finish ordering. It's pure logic over Worker + setTimeout,
 * so we drive it with a fake Worker (capturing postMessage, exposing onmessage/onerror)
 * and fake timers, asserting each invariant the audit flagged as untested.
 */
class FakeWorker {
  static created: FakeWorker[] = []
  posted: Array<{ id: number; code: string; defines: string[] }> = []
  onmessage: ((e: { data: { id: number; ok: boolean; stl?: ArrayBuffer; error?: string } }) => void) | null = null
  onerror: ((e?: unknown) => void) | null = null
  terminated = false
  constructor() {
    FakeWorker.created.push(this)
  }
  postMessage(msg: { id: number; code: string; defines: string[] }) {
    this.posted.push(msg)
  }
  terminate() {
    this.terminated = true
  }
}

/** the worker the engine is currently using (a respawn pushes a new instance) */
const currentWorker = () => FakeWorker.created[FakeWorker.created.length - 1]
const okMsg = (id: number) => ({ data: { id, ok: true, stl: new ArrayBuffer(84) } })
const codes = (w: FakeWorker) => w.posted.map((p) => p.code)

beforeEach(() => {
  FakeWorker.created = []
  ;(globalThis as unknown as { Worker: typeof FakeWorker }).Worker = FakeWorker
})
afterEach(() => {
  vi.useRealTimers()
})

describe('OpenScadEngine', () => {
  it('coalesces interactive renders: a newer one supersedes the queued one', async () => {
    const e = new OpenScadEngine()
    const p1 = e.compile('a') // runs immediately (active, id 1)
    const p2 = e.compile('b') // queued interactive (id 2)
    const p3 = e.compile('c') // supersedes the queued p2 (id 3)

    await expect(p2).resolves.toEqual({ ok: false, error: 'superseded' })

    currentWorker().onmessage!(okMsg(1)) // finish active → queued p3 runs
    await expect(p1).resolves.toMatchObject({ ok: true })
    expect(codes(currentWorker())).toEqual(['a', 'c']) // b never ran (superseded)

    currentWorker().onmessage!(okMsg(3))
    await expect(p3).resolves.toMatchObject({ ok: true })
  })

  it('runs background jobs FIFO behind the active job and resolves them all', async () => {
    const e = new OpenScadEngine()
    const p1 = e.compile('a')
    const b1 = e.compile('b', [], 60_000, { background: true })
    const b2 = e.compile('c', [], 60_000, { background: true })

    const w = currentWorker()
    expect(codes(w)).toEqual(['a']) // only the active job is posted; bg jobs wait

    w.onmessage!(okMsg(1))
    await p1
    expect(codes(w)).toEqual(['a', 'b']) // FIFO: b1 next

    w.onmessage!(okMsg(2))
    await b1
    expect(codes(w)).toEqual(['a', 'b', 'c'])

    w.onmessage!(okMsg(3))
    await expect(b2).resolves.toMatchObject({ ok: true })
  })

  it('prefers a queued interactive job over the background queue', async () => {
    const e = new OpenScadEngine()
    const p1 = e.compile('a') // active id 1
    const b1 = e.compile('bg', [], 60_000, { background: true }) // bg id 2
    const i1 = e.compile('interactive') // queued interactive id 3

    const w = currentWorker()
    w.onmessage!(okMsg(1))
    await p1
    expect(codes(w)).toEqual(['a', 'interactive']) // interactive jumps the bg queue

    w.onmessage!(okMsg(3))
    await i1
    expect(codes(w)).toEqual(['a', 'interactive', 'bg']) // bg drains afterward

    w.onmessage!(okMsg(2))
    await expect(b1).resolves.toMatchObject({ ok: true })
  })

  it('per-chat lanes: a render in chat B does NOT supersede chat A\'s queued render', async () => {
    const e = new OpenScadEngine()
    const a0 = e.compile('a0') // active id 1
    const a1 = e.compile('a1', [], 60_000, { projectId: 'A' }) // queued in lane A (id 2)
    const b1 = e.compile('b1', [], 60_000, { projectId: 'B' }) // queued in lane B (id 3) — must NOT touch A
    const w = currentWorker()

    let aSuperseded = false
    void a1.then((r) => { if (r.error === 'superseded') aSuperseded = true })
    await Promise.resolve()
    expect(aSuperseded).toBe(false) // B's render did not supersede A's

    w.onmessage!(okMsg(1)); await a0
    expect(codes(w)).toEqual(['a0', 'a1']) // both lanes drain, oldest-first (A then B)
    w.onmessage!(okMsg(2)); await a1
    expect(codes(w)).toEqual(['a0', 'a1', 'b1'])
    w.onmessage!(okMsg(3)); await expect(b1).resolves.toMatchObject({ ok: true })
  })

  it('the foreground lane drains before other lanes', async () => {
    const e = new OpenScadEngine()
    const a0 = e.compile('a0') // active id 1
    void e.compile('bg-lane', [], 60_000, { projectId: 'B' }) // queued lane B first (id 2)
    void e.compile('fg-lane', [], 60_000, { projectId: 'A' }) // queued lane A (id 3)
    e.setForeground('A')
    const w = currentWorker()

    w.onmessage!(okMsg(1)); await a0
    expect(codes(w)).toEqual(['a0', 'fg-lane']) // A (foreground) jumps ahead of the earlier-queued B
  })

  it('times out, respawns the worker, and resolves with a timeout error', async () => {
    vi.useFakeTimers()
    const e = new OpenScadEngine()
    const p1 = e.compile('a', [], 1000)
    const w1 = currentWorker()

    vi.advanceTimersByTime(1000)
    const r = await p1
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/timed out/)
    expect(w1.terminated).toBe(true) // respawned
  })

  it('runs the next queued job on a FRESH worker after a timeout respawn', async () => {
    vi.useFakeTimers()
    const e = new OpenScadEngine()
    const p1 = e.compile('a', [], 1000)
    const p2 = e.compile('b', [], 1000) // queued interactive id 2
    const w1 = currentWorker()

    vi.advanceTimersByTime(1000) // p1 times out → respawn → p2 runs on a new worker
    await p1

    const w2 = currentWorker()
    expect(w2).not.toBe(w1)
    expect(w1.terminated).toBe(true)
    expect(codes(w2)).toEqual(['b'])

    w2.onmessage!(okMsg(2))
    await expect(p2).resolves.toMatchObject({ ok: true })
  })

  it('respawns and reports a crash when the worker errors', async () => {
    const e = new OpenScadEngine()
    const p1 = e.compile('a')
    const w1 = currentWorker()

    w1.onerror!(new Event('error'))
    const r = await p1
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/crashed/)
    expect(w1.terminated).toBe(true)
  })

  it('content cache: an identical (code, defines) re-render resolves WITHOUT touching the worker', async () => {
    const e = new OpenScadEngine()
    const p1 = e.compile('cube();', ['-D s=10'])
    const w = currentWorker()
    w.onmessage!(okMsg(1)) // first render compiles + caches
    await expect(p1).resolves.toMatchObject({ ok: true })
    expect(codes(w)).toEqual(['cube();']) // one post so far

    // same content again → cache hit: resolves on its own, never posts a second job
    const p2 = e.compile('cube();', ['-D s=10'])
    await expect(p2).resolves.toMatchObject({ ok: true })
    expect(codes(w)).toEqual(['cube();']) // STILL one post — the worker was not touched

    // a DIFFERENT define is a miss → it does post
    const p3 = e.compile('cube();', ['-D s=20'])
    expect(codes(currentWorker())).toEqual(['cube();', 'cube();'])
    currentWorker().onmessage!(okMsg(2))
    await expect(p3).resolves.toMatchObject({ ok: true })
  })

  it('does NOT cache a failed render (a later identical call re-runs)', async () => {
    const e = new OpenScadEngine()
    const p1 = e.compile('bad();')
    const w1 = currentWorker()
    w1.onerror!(new Event('error')) // crash → not cached
    await expect(p1).resolves.toMatchObject({ ok: false })

    const p2 = e.compile('bad();') // identical, but the failure wasn't cached → it posts again
    expect(codes(currentWorker())).toEqual(['bad();'])
    currentWorker().onmessage!(okMsg(2))
    await expect(p2).resolves.toMatchObject({ ok: true })
  })

  it('ignores a worker message whose id does not match the active job', async () => {
    const e = new OpenScadEngine()
    const p1 = e.compile('a') // active id 1
    const w = currentWorker()

    let resolved = false
    void p1.then(() => {
      resolved = true
    })
    w.onmessage!(okMsg(999)) // stale/wrong id → ignored
    await Promise.resolve()
    expect(resolved).toBe(false)

    w.onmessage!(okMsg(1))
    await expect(p1).resolves.toMatchObject({ ok: true })
  })
})

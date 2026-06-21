import type { CompileResult } from '../../types'

// Per-call watchdog. The interactive default is far below the old flat 90s so a
// hung render surfaces fast; the store passes a tighter budget for the Draft
// fallback retry (so worst-case feedback is primary+draft, not 90s+90s) and a
// roomier one for deliberate one-shot exports.
const DEFAULT_RENDER_TIMEOUT_MS = 60_000

const DEFAULT_LANE = '__default__'

interface PendingJob {
  id: number
  projectId: string
  code: string
  defines: string[]
  timeoutMs: number
  background: boolean
  resolve: (result: CompileResult) => void
}

export interface CompileOpts {
  /** Background/loop render (interference probe, best-of-N candidate). Background jobs queue FIFO
   *  and are NEVER coalesced/superseded — they always run — but yield scheduling priority to the
   *  user's interactive render. Default false = the interactive, latest-wins coalescing path. */
  background?: boolean
  /** which chat/project this interactive render belongs to. Each project gets its OWN coalescing
   *  lane, so a BACKGROUND chat's render can never supersede the FOREGROUND chat's (concurrent
   *  chats). Omitted → a single shared lane (the pre-concurrency single-chat behavior). */
  projectId?: string
}

/**
 * Promise-based facade over the OpenSCAD web worker.
 * - serializes renders (the worker handles one job at a time)
 * - coalesces INTERACTIVE renders: while busy, only the latest queued interactive one runs
 * - BACKGROUND renders (loop work) queue FIFO and always complete, but yield to interactive jobs
 * - watchdog: terminates and respawns the worker if a render hangs
 */
export class OpenScadEngine {
  private worker: Worker | null = null
  private nextId = 1
  private active: PendingJob | null = null
  // one INTERACTIVE job per project LANE (coalesced, latest wins WITHIN a lane). Map iteration is
  // insertion order, so non-foreground lanes drain oldest-first. A background chat's render lives in
  // its own lane and can never supersede the foreground's.
  private queued = new Map<string, PendingJob>()
  private bgQueue: PendingJob[] = [] // FIFO of BACKGROUND jobs — never coalesced/superseded
  private foreground: string | null = null // the active project's lane is drained first
  private timer: ReturnType<typeof setTimeout> | null = null

  /** Tell the engine which project is in the foreground so its interactive lane jumps the queue.
   *  Called on every project switch; the engine never imports the store. */
  setForeground(projectId: string | null): void {
    this.foreground = projectId
  }

  compile(
    code: string,
    defines: string[] = [],
    timeoutMs: number = DEFAULT_RENDER_TIMEOUT_MS,
    opts: CompileOpts = {},
  ): Promise<CompileResult> {
    return new Promise((resolve) => {
      const pid = opts.projectId ?? DEFAULT_LANE
      const job: PendingJob = { id: this.nextId++, projectId: pid, code, defines, timeoutMs, background: !!opts.background, resolve }
      if (!this.active) {
        this.run(job)
      } else if (job.background) {
        // background/loop renders must not be dropped — queue them FIFO behind the active job
        this.bgQueue.push(job)
      } else {
        // interactive: replace any previously queued job IN THIS PROJECT'S LANE — only the newest
        // matters per chat, but another chat's queued render is left untouched
        this.queued.get(pid)?.resolve({ ok: false, error: 'superseded' })
        this.queued.set(pid, job)
      }
    })
  }

  private run(job: PendingJob): void {
    this.active = job
    const worker = this.ensureWorker()
    this.timer = setTimeout(() => this.onTimeout(), job.timeoutMs)
    worker.postMessage({ id: job.id, code: job.code, defines: job.defines })
  }

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = (event: MessageEvent<CompileResult & { id: number }>) => {
        if (!this.active || event.data.id !== this.active.id) return
        this.finish(event.data)
      }
      this.worker.onerror = () => {
        // respawn BEFORE finish() so a queued job gets a fresh worker, not the dead one
        // (matches onTimeout's order; otherwise the next render stalls until the watchdog)
        this.respawn()
        this.finish({ ok: false, error: 'OpenSCAD engine crashed — reloading it.' })
      }
    }
    return this.worker
  }

  private onTimeout(): void {
    const ms = this.active?.timeoutMs ?? DEFAULT_RENDER_TIMEOUT_MS
    this.respawn()
    this.finish({
      ok: false,
      error: `Render timed out after ${ms / 1000}s — the model is too heavy to render in time. Ask the AI to simplify it.`,
    })
  }

  private finish(result: CompileResult): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const job = this.active
    this.active = null
    job?.resolve(result)
    const next = this.pickNext()
    if (next) this.run(next)
  }

  /** Next job to run: the FOREGROUND project's interactive lane first (responsiveness), then the
   *  other interactive lanes oldest-first, then the background FIFO. */
  private pickNext(): PendingJob | null {
    if (this.foreground && this.queued.has(this.foreground)) {
      const job = this.queued.get(this.foreground)!
      this.queued.delete(this.foreground)
      return job
    }
    const oldest = this.queued.keys().next().value as string | undefined
    if (oldest !== undefined) {
      const job = this.queued.get(oldest)!
      this.queued.delete(oldest)
      return job
    }
    return this.bgQueue.shift() ?? null
  }

  private respawn(): void {
    this.worker?.terminate()
    this.worker = null
  }
}

export const openscad = new OpenScadEngine()

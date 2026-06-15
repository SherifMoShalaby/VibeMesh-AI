import type { CompileResult } from '../../types'

const RENDER_TIMEOUT_MS = 90_000

interface PendingJob {
  id: number
  code: string
  defines: string[]
  resolve: (result: CompileResult) => void
}

/**
 * Promise-based facade over the OpenSCAD web worker.
 * - serializes renders (the worker handles one job at a time)
 * - coalesces: if renders are requested while busy, only the latest queued one runs
 * - watchdog: terminates and respawns the worker if a render hangs
 */
class OpenScadEngine {
  private worker: Worker | null = null
  private nextId = 1
  private active: PendingJob | null = null
  private queued: PendingJob | null = null
  private timer: ReturnType<typeof setTimeout> | null = null

  compile(code: string, defines: string[] = []): Promise<CompileResult> {
    return new Promise((resolve) => {
      const job: PendingJob = { id: this.nextId++, code, defines, resolve }
      if (this.active) {
        // replace any previously queued job — only the newest matters
        this.queued?.resolve({ ok: false, error: 'superseded' })
        this.queued = job
      } else {
        this.run(job)
      }
    })
  }

  private run(job: PendingJob): void {
    this.active = job
    const worker = this.ensureWorker()
    this.timer = setTimeout(() => this.onTimeout(), RENDER_TIMEOUT_MS)
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
    this.respawn()
    this.finish({
      ok: false,
      error: `Render timed out after ${RENDER_TIMEOUT_MS / 1000}s. The model is probably too heavy (minkowski/hull on complex shapes, very high $fn). Ask the AI to simplify it.`,
    })
  }

  private finish(result: CompileResult): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const job = this.active
    this.active = null
    job?.resolve(result)
    if (this.queued) {
      const next = this.queued
      this.queued = null
      this.run(next)
    }
  }

  private respawn(): void {
    this.worker?.terminate()
    this.worker = null
  }
}

export const openscad = new OpenScadEngine()

/**
 * Per-generation compute/latency budget for the live verification loop.
 *
 * C1 (interference probes), A2 (best-of-N candidate compiles) and the user's own live render all
 * serialize through the SINGLE openscad worker. Stacked on one hard kit they can compound latency
 * past the watchdog. This is the shared ceiling every loop step consults, so quality work degrades
 * GRACEFULLY (skip the next probe / candidate) instead of compounding — one budget per generation.
 *
 * Pure and clock-injectable so it unit-tests without real time.
 */
const defaultNow = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now())

export interface ComputeBudgetOpts {
  /** wall-clock ceiling for all loop renders in this generation (ms) */
  wallMs: number
  /** hard cap on the number of loop renders in this generation */
  maxRenders: number
  /** injectable clock (tests) */
  now?: () => number
}

export class ComputeBudget {
  private readonly clock: () => number
  private readonly deadline: number
  private readonly maxRenders: number
  private renders = 0

  constructor(opts: ComputeBudgetOpts) {
    this.clock = opts.now ?? defaultNow
    this.deadline = this.clock() + opts.wallMs
    this.maxRenders = opts.maxRenders
  }

  /** True while there is budget for another loop render (both the count AND the wall-clock remain). */
  canSpend(): boolean {
    return this.renders < this.maxRenders && this.clock() < this.deadline
  }

  /** Record that a loop render was spent. */
  spend(): void {
    this.renders++
  }

  /** Milliseconds left before the wall-clock ceiling (0 once past it). */
  remainingMs(): number {
    return Math.max(0, this.deadline - this.clock())
  }

  get rendersSpent(): number {
    return this.renders
  }
}

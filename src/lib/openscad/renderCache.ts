import type { CompileResult } from '../../types'

/**
 * Content-addressed render cache (Task 0.5). A render is a pure function of (program, -D defines,
 * engine build): equal inputs ⇒ identical geometry. So we can collapse redundant recompiles — a
 * slider revisiting a prior value, a version restore, a best-of-N re-roll, a probe re-render —
 * into an instant cache hit that never touches the worker.
 *
 * Pure + Worker-free so it is fully unit-testable; the OpenScadEngine owns one instance.
 */

/** Bump when the worker / openscad-wasm build OR the compile semantics change — it is part of every
 *  key, so a bump invalidates the WHOLE cache (a stale entry from an old engine can never surface). */
export const RENDER_CACHE_NS = 'osc-2025.07.18-v1'

/** NUL separator — never appears in a valid -D token or OpenSCAD program, so no concatenation of
 *  define tokens can ever collide. Built via fromCharCode to keep the source free of invisible bytes. */
const SEP = String.fromCharCode(0)

/** Complete content key: engine namespace + the SORTED defines + the full program. Full strings, not a
 *  hash — zero collision risk, and the few KB/entry is trivial next to the STL payloads. Defines are
 *  sorted so two define orderings of the same render share a key. */
export function cacheKey(code: string, defines: readonly string[]): string {
  return [RENDER_CACHE_NS, [...defines].sort().join(SEP), code].join(SEP)
}

/** Clone a result so the cache and every consumer own an independent ArrayBuffer — no one can detach
 *  or mutate a shared STL out from under the cache (or another consumer). */
function cloneResult(r: CompileResult): CompileResult {
  return r.stl ? { ...r, stl: r.stl.slice(0) } : { ...r }
}

/**
 * Tiny LRU of SUCCESSFUL renders. Stores and returns CLONES (buffer isolation). Capacity-bounded
 * because STLs can be megabytes — eviction is least-recently-USED (a `get` refreshes recency).
 */
export class RenderCache {
  private map = new Map<string, CompileResult>()
  private cap: number
  constructor(cap = 12) {
    this.cap = cap
  }

  /** Cloned cached result, or null on a miss. A hit refreshes the entry's recency. */
  get(key: string): CompileResult | null {
    const hit = this.map.get(key)
    if (!hit) return null
    this.map.delete(key)
    this.map.set(key, hit) // re-insert → most-recently-used (Map preserves insertion order)
    return cloneResult(hit)
  }

  /** Cache a CLEAN render only — never an error / superseded / empty result (those are transient and
   *  must always re-run). Evicts the oldest entries past the cap. */
  set(key: string, result: CompileResult): void {
    if (!result.ok || !result.stl) return
    this.map.delete(key)
    this.map.set(key, cloneResult(result))
    while (this.map.size > this.cap) {
      const oldest = this.map.keys().next().value as string | undefined
      if (oldest === undefined) break
      this.map.delete(oldest)
    }
  }

  get size(): number {
    return this.map.size
  }
  clear(): void {
    this.map.clear()
  }
}

import fs from 'node:fs'
import path from 'node:path'

/* ────────────────────────────────────────────────────────────────
   SEC-6: atomic, serialized file writes for the runtime-mutated
   config files (.env via providers.applyRuntimeSetting, and the
   connections store via connections.persist()).

   - ATOMIC: write to a temp file beside the target, then fs.renameSync
     over it (atomic on the same filesystem) so a reader never sees a
     half-written file, and a crash mid-write can't corrupt the target.
   - SERIALIZED per target: at most one write runs at a time, and
     queued writes run in FIFO order (mirroring the single-in-flight +
     pending coalescing in src/lib/storage.ts). Each write's content is
     produced at write time, so a .env read-modify-write that edits one
     key sees the previous queued edit's result — two concurrent
     /api/connect (or connect + delete) calls can't interleave and drop
     a line.
   ──────────────────────────────────────────────────────────────── */

// Per-absolute-path FIFO state: the chain of pending writes (a promise tail).
const tails = new Map()
let tmpCounter = 0

/** Synchronously write `content` to `target` atomically (temp file + rename), mode 0o600. The
 *  rename is the only step that touches the live path, so the target is never partially written. */
export function atomicWriteFileSync(target, content, mode = 0o600) {
  const dir = path.dirname(target)
  // temp name in the SAME directory so the rename stays on one filesystem (atomic). pid + counter
  // keeps concurrent temp files from colliding.
  const tmp = path.join(dir, `.${path.basename(target)}.${process.pid}.${tmpCounter++}.tmp`)
  try {
    fs.writeFileSync(tmp, content, { mode })
    fs.renameSync(tmp, target)
  } catch (err) {
    try { fs.unlinkSync(tmp) } catch { /* best-effort cleanup */ }
    throw err
  }
}

/** Serialized atomic write for `target`. `produce()` is invoked at write time (not enqueue time), so
 *  a read-modify-write sees the result of every earlier queued write to the same path. Returns a
 *  promise that resolves once THIS write is durably on disk. Writes to the same path run one at a
 *  time, in FIFO order; different paths are independent. */
export function queueAtomicWrite(target, produce, mode = 0o600) {
  const prev = tails.get(target) || Promise.resolve()
  // chain after the previous write; swallow its rejection so one failure doesn't poison the chain.
  const run = prev.catch(() => {}).then(() => atomicWriteFileSync(target, produce(), mode))
  // keep the tail pointing at the latest write; clean up the map entry once the chain is idle.
  const tail = run.catch(() => {})
  tails.set(target, tail)
  tail.then(() => { if (tails.get(target) === tail) tails.delete(target) })
  return run
}

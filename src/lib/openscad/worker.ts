/// <reference lib="webworker" />
import { createOpenSCAD } from 'openscad-wasm'

interface RenderRequest {
  id: number
  code: string
  defines: string[]
}

interface RenderResponse {
  id: number
  ok: boolean
  stl?: ArrayBuffer
  error?: string
  log?: string
  ms?: number
}

// The OpenSCAD WASM module is single-shot: callMain may only run once per
// instance, so we create a fresh instance per render. The base64 WASM is
// decoded once at module load, so instances are cheap after the first.
async function render({ id, code, defines }: RenderRequest): Promise<void> {
  const started = performance.now()
  const stderr: string[] = []
  try {
    const openscad = await createOpenSCAD({
      noInitialRun: true,
      print: () => {},
      printErr: (line: string) => stderr.push(line),
    })
    const instance = openscad.getInstance()
    instance.FS.writeFile('/input.scad', code)

    let exitCode = -1
    try {
      // --backend=Manifold: OpenSCAD's fast CSG backend (this wasm build = OpenSCAD
      // 2025.07.18, which ships it). 100–700× faster than the default CGAL/Nef backend
      // on boolean-heavy models — turns multi-minute assembly renders into <1s. Honors
      // $fa/$fs/$fn identically; needs manifold input (the system prompt mandates that);
      // Minkowski auto-falls-back to Nef. (--enable=manifold is a no-op in this build.)
      exitCode = instance.callMain(['/input.scad', '-o', '/output.stl', '--export-format=binstl', '--backend=Manifold', ...defines])
    } catch (err) {
      // Emscripten throws an ExitStatus-like value on abnormal exit
      exitCode = typeof err === 'number' ? err : (err as { status?: number })?.status ?? -1
    }

    let stl: Uint8Array | null = null
    try {
      stl = instance.FS.readFile('/output.stl', { encoding: 'binary' }) as Uint8Array
    } catch {
      // no output produced
    }

    const ms = Math.round(performance.now() - started)
    if (stl && stl.length > 0) {
      const buffer = stl.slice().buffer as ArrayBuffer
      const response: RenderResponse = { id, ok: true, stl: buffer, log: stderr.join('\n'), ms }
      self.postMessage(response, { transfer: [buffer] })
    } else {
      const response: RenderResponse = {
        id,
        ok: false,
        error: pickError(stderr) ?? `OpenSCAD exited with code ${exitCode} and produced no geometry`,
        log: stderr.join('\n'),
        ms,
      }
      self.postMessage(response)
    }
  } catch (err) {
    const response: RenderResponse = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      log: stderr.join('\n'),
      ms: Math.round(performance.now() - started),
    }
    self.postMessage(response)
  }
}

function pickError(stderr: string[]): string | undefined {
  if (stderr.length === 0) return undefined
  // Surface real fatals first (in source order), then the most useful warnings.
  // The old narrow filter missed the most common non-syntax fatals — Manifold's
  // "empty geometry" / "not 2-manifold" / "CSG normalization" phrasings and
  // assertions — and, by taking the first 6 matches, dropped the aborting ERROR
  // when warnings preceded it. ERRORs go first so the repair turn sees the cause.
  const isError = (l: string) =>
    /\bERROR\b|Parser error|Compile error|assert|2-manifold|CSG normalization|top level object is empty|object may not be|unable to convert/i.test(l)
  const isUsefulWarning = (l: string) =>
    /\bWARNING\b/i.test(l) && /ignored|unknown|undefined|not defined|exceed|deprecat/i.test(l)
  const errors = stderr.filter(isError)
  const warnings = stderr.filter(isUsefulWarning)
  const picked = [...errors, ...warnings].slice(0, 8)
  if (picked.length > 0) return picked.join('\n')
  // nothing matched — return a bounded tail of the NON-BLANK raw stderr so the
  // repair turn has real text to act on; if stderr is all blank lines, return
  // undefined so the caller's informative exit-code fallback applies instead.
  const tail = stderr.filter((l) => l.trim()).slice(-8)
  return tail.length ? tail.join('\n') : undefined
}

self.onmessage = (event: MessageEvent<RenderRequest>) => {
  void render(event.data)
}

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
      exitCode = instance.callMain(['/input.scad', '-o', '/output.stl', '--export-format=binstl', ...defines])
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
  const lines = stderr.filter((l) => /ERROR|WARNING.*(undefined|exceed)|Parser error|Compile error/i.test(l))
  if (lines.length === 0) return undefined
  return lines.slice(0, 6).join('\n')
}

self.onmessage = (event: MessageEvent<RenderRequest>) => {
  void render(event.data)
}

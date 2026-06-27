import { describe, it, expect, vi, beforeEach } from 'vitest'
import { firstAbsentFeature, absentFeatureDiscrepancy, type VisionVerdict } from './visionJudge'

describe('firstAbsentFeature — OC-6 absent-feature selection', () => {
  it('returns the first feature judged absent (present === false)', () => {
    const v: VisionVerdict = {
      features: [
        { name: 'base', present: true, faithful: true },
        { name: 'crown-cap catch lip', present: false, faithful: false },
        { name: 'handle', present: false, faithful: false },
      ],
      overallFidelity: 0.4,
    }
    expect(firstAbsentFeature(v)).toBe('crown-cap catch lip')
  })

  it('returns null when every feature is present (an un-faithful but present feature is NOT absent)', () => {
    const v: VisionVerdict = {
      features: [
        { name: 'base', present: true, faithful: true },
        { name: 'spout', present: true, faithful: false }, // present but collapsed — not "absent"
      ],
    }
    expect(firstAbsentFeature(v)).toBeNull()
  })

  it('returns null for an error verdict / missing features / null', () => {
    expect(firstAbsentFeature({ error: 'no render images' })).toBeNull()
    expect(firstAbsentFeature({})).toBeNull()
    expect(firstAbsentFeature(null)).toBeNull()
    expect(firstAbsentFeature(undefined)).toBeNull()
  })

  it('skips entries without a name', () => {
    const v = { features: [{ name: '', present: false, faithful: false }, { name: 'foot', present: false, faithful: false }] } as VisionVerdict
    expect(firstAbsentFeature(v)).toBe('foot')
  })
})

describe('absentFeatureDiscrepancy', () => {
  it('cites the absent feature by name', () => {
    const s = absentFeatureDiscrepancy('crown-cap catch lip')
    expect(s).toContain('"crown-cap catch lip"')
    expect(s).toContain('MISSING')
  })
})

// runLiveVisionJudge wiring: capture → POST → verdict, with an injected fetch. captureViews reads the
// viewport canvas (registered by the Viewport), absent in jsdom — so we stub the capture module.
vi.mock('./capture', () => ({
  CAPTURE_VIEW_NAMES: ['isometric', 'front', 'top', 'right'],
  captureViews: vi.fn(() => [{ data: 'AAAA', mediaType: 'image/jpeg', width: 64, height: 64, role: 'view' }]),
}))

describe('runLiveVisionJudge — capture → POST → verdict (advisory, no-op on miss)', () => {
  let runLiveVisionJudge: typeof import('./visionJudge').runLiveVisionJudge
  let captureViews: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('./visionJudge')
    runLiveVisionJudge = mod.runLiveVisionJudge
    captureViews = (await import('./capture')).captureViews as unknown as ReturnType<typeof vi.fn>
    captureViews.mockReturnValue([{ data: 'AAAA', mediaType: 'image/jpeg', width: 64, height: 64, role: 'view' }])
  })

  it('returns the verdict on an OK response and POSTs the captured poses', async () => {
    const verdict: VisionVerdict = { features: [{ name: 'horse head', present: false, faithful: false }], overallFidelity: 0.3 }
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: false, verdict }), { status: 200 })) as unknown as typeof fetch
    const got = await runLiveVisionJudge({ prompt: 'a knight chess piece', code: 'cube();' }, fetchImpl)
    expect(got).toEqual(verdict)
    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toBe('/api/vision-judge')
    const body = JSON.parse(call[1].body)
    expect(body.prompt).toBe('a knight chess piece')
    expect(body.renderImages[0]).toMatchObject({ pngBase64: 'AAAA', name: 'isometric' })
  })

  it('returns null (no-op) when no views are captured', async () => {
    captureViews.mockReturnValue([])
    const fetchImpl = vi.fn() as unknown as typeof fetch
    expect(await runLiveVisionJudge({ prompt: 'x' }, fetchImpl)).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('returns null on a non-OK response or a network throw', async () => {
    const bad = vi.fn(async () => new Response('', { status: 400 })) as unknown as typeof fetch
    expect(await runLiveVisionJudge({ prompt: 'x' }, bad)).toBeNull()
    const thrower = vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch
    expect(await runLiveVisionJudge({ prompt: 'x' }, thrower)).toBeNull()
  })
})

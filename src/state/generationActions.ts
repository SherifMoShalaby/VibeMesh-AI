import type { StoreApi } from 'zustand'
import type { VibeState, Session } from './store'
import type { ChatMessage, ScadParameter, ParamValues, CompileResult, Project } from '../types'
import { resolveBed, QUALITY_PRESETS } from '../types'
import { streamGenerate, toApiMessages, historyBudgetTokens, imageBudgetFor, estGenTokens, type SkillIssue } from '../lib/api'
import { clampStatedDimensions, dimDiscrepancies, geometryConverged, iouRefineDecision, proxyRefineDecision } from '../lib/refineProxy'
import { buildAutoFixPrompt, structuralReport } from '../lib/compileReport'
import { hasDebugContract, interferenceIssue } from '../lib/interferenceProxy'
import { ComputeBudget } from '../lib/openscad/budget'
import { scoreCandidate, pickBestIndex, BEST_OF_N_COUNT, type CandidateSignals } from '../lib/bestOfN'
import { renderMasks } from '../lib/silhouette'
import { bestRefIoU, ensureRefMask, getRefMask } from '../lib/refSegment'
import { bestProportionMatch } from '../lib/proportion'
import { worstPiece, worstPieceDiscrepancy, type PieceScore } from '../lib/kitScore'
import { runLiveVisionJudge, firstAbsentFeature, absentFeatureDiscrepancy } from '../lib/visionJudge'
import { extractScadBlock, extractIntent, stripIntentLine, parseParameters, buildDefines } from '../lib/params'
import { degenerateReason, detectKitIntent, notFlatOnBedReason } from '../lib/storeDecisions'
import { recordUses, recordRemovals, saveSkillStats } from '../lib/skillStats'
import { stlBBox, islandCount } from '../lib/stl'
import { openscad } from '../lib/openscad/client'
import { useUi } from './ui'
import { newId } from '../lib/storage'

/**
 * The AI-generation slice of the store (god-module split, P2 #1) — the single most intricate
 * concern: the SSE stream turn, verifier-guided best-of-N, the contract/auto-fix/refine recovery
 * loop, and abort/timeout/truncation handling. Code moved VERBATIM from store.ts; the shared store
 * helpers (activeChat/setChat/setChatAndFuture/adoptCode/persist/qualityArgsFor) are passed in via
 * `h` so the compile lifecycle they also belong to stays in the store core.
 */
interface GenerationHelpers {
  // projectId-BOUND helpers: a generation captures its pid once and routes EVERY write through these,
  // so the streamed reply + adopted code always land on the project it started for — even once
  // switching mid-generation is allowed (concurrent chats, Phase 5).
  activeChatFor: (pid: string) => ChatMessage[]
  setChatFor: (pid: string, chat: ChatMessage[]) => void
  setChatAndFutureFor: (pid: string, chat: ChatMessage[], chatFuture: ChatMessage[]) => void
  adoptCodeFor: (pid: string, code: string, carryFrom?: { params: ScadParameter[]; values: ParamValues }) => Promise<CompileResult>
  persistFor: (pid: string, partial?: Partial<Project>) => void
  qualityArgsFor: (preset: (typeof QUALITY_PRESETS)[number]) => string[]
  /** per-project generation-runtime write funnel (mirrors to the top-level projection for the active project) */
  writeSession: (pid: string, patch: Partial<Session> | ((cur: Session) => Partial<Session>)) => void
  /** read a project's generation runtime (blank if none) */
  genSession: (pid: string) => Session
}

// Client-side anti-hang backstop. Derived PER RUN from the server's configured generation timeout
// (health.genTimeoutMs ← VIBEMESH_GEN_TIMEOUT_MS) plus a buffer, so the server's own timeout — with
// its clearer message — fires first and this only catches a truly hung stream (notably the
// claude-code Agent SDK path, which has no server-side timeout). Raising VIBEMESH_GEN_TIMEOUT_MS now
// extends BOTH bounds, so Opus at high effort can be given as long as it needs. The fallback is used
// only before /api/health has loaded.
const GEN_TIMEOUT_FALLBACK_MS = 60 * 60_000
const GEN_TIMEOUT_BUFFER_MS = 60_000
// Separate fix budgets (Task 0.3): a format/contract re-ask and a geometry repair used to share ONE
// counter, so two contract violations starved the geometry-fix budget (and vice-versa). Splitting
// them means a wrapper fault can never consume a slot the compile-error repair needs. Each is bounded
// and only fires on a FAILURE, so the combined worst case (1 reask + 2 geom fixes) stays small.
const MAX_CONTRACT_REASK = 1 // format/contract re-asks (a wrapper fault — usually one-shot fixable)
const MAX_GEOM_FIX = 2 // render/structural/interference auto-fixes (was MAX_AUTO_FIX)
/** Independent per-run fix budgets, threaded through runGeneration in place of the old shared count. */
type FixBudget = { contract: number; geom: number }
const NO_FIXES: FixBudget = { contract: 0, geom: 0 }
const MAX_AUTO_REFINE = 2 // hard ceiling on auto-refine passes per project (manual + auto combined)
// LAT-2 — interactive auto-refine defaults to a SINGLE pass; the 2nd pass only fires when there is a
// positive oracle signal (reference-IoU still measurably improving) or the user clicks "Refine again".
const DEFAULT_AUTO_REFINE = 1
// LAT-2 — cumulative wall-clock budget for ONE user turn's whole gen→refine→autofix chain, anchored
// at the user-initiated send. Once exceeded, no further auto-refine/autofix pass is armed and the
// chain stops cleanly (the user can still drive a manual "Refine again"). Image turns are the costly
// case (serial gen + capture + refine); this caps the blind multi-minute auto-chain the audit flagged.
const TURN_WALLCLOCK_MS = 90_000
// Per-project anchor (epoch ms) for the current user turn's chain. Set at each user-initiated entry
// (send/retry/reroll/regenerate); read by the autofix + refine arming guards. A manual "Refine again"
// re-anchors it so the manual pass is never pre-empted by the prior turn's elapsed budget.
const turnBudgetStart = new Map<string, number>()
const turnBudgetExceeded = (pid: string): boolean => {
  const start = turnBudgetStart.get(pid)
  return start !== undefined && Date.now() - start > TURN_WALLCLOCK_MS
}
// OC-1 — a single-solid part is flagged as broken-multi-island only when its LARGEST island holds
// less than this share of the mesh volume (i.e. the secondary island(s) together hold >5%). This
// ignores negligible specks/artefacts from a boolean op while catching a genuinely detached feature.
const ISLAND_SECONDARY_FLOOR = 0.95
// LAT-5 — wall-clock window for the best-of-N GENERATION fan-out. The N parallel candidate streams
// no longer block on the slowest: once the first candidate(s) return, the rest are given up to this
// long, then selection proceeds on whatever returned. A candidate still in flight past the window is
// scored as ENVIRONMENTAL-unknown (not a non-compile) — same benefit-of-the-doubt as a budget-starved
// compile — so the slowest xhigh call can never gate the whole turn. A user Stop still aborts all.
const BEST_OF_N_WINDOW_MS = 45_000
// Coarse wall-time guard on the reference-shape-match loop (renderMasks + 32 maskIoU passes per
// candidate over 256×256 masks). Generous — best-of-N is N≤3 small meshes — but caps a pathological
// high-triangle mesh from stalling selection between the compile loop and pickBestIndex. Past the
// budget, remaining candidates simply rank without shapeMatch (undefined → no-op), never blocking.
const SHAPE_MATCH_BUDGET_MS = 4_000
// OC-2 — reference-IoU refine gate. Below this silhouette-IoU floor (best of the adopted render's
// pose masks vs the segmented reference photo), an image turn is judged visually off-target and an
// auto-refine pass is armed. CPU rasterization only — never spends the openscad render budget.
const REF_IOU_FLOOR = 0.55
// OC-10 — proportion floor for the refine discrepancy note. Below this scale-shared proportion match
// (aspect/fill/centroid vs the reference mask) the wrong-proportion note is appended. It NEVER arms a
// refine on its own (the IoU floor gates that); it only adds specificity once IoU already wants refine.
const PROPORTION_FLOOR = 0.7
// Previous pass's measured reference-IoU per project — the loop only continues while a refine pass
// is still RAISING IoU; a non-improving pass stops it (folded into proxyWantsRefine).
const refinePrevIoU = new Map<string, number>()
// The measured discrepancy text to inject into the NEXT refine prompt (consumed by ChatPanel.refine
// via takeRefineDiscrepancy). Lifetime-scoped like the other refine maps.
const refineDiscrepancy = new Map<string, string>()
const autoRefinePass = new Map<string, number>()
// Previous refine-eligible compile's geometry CONTENT (volume + triangle count) per project — the
// baseline the SELF-RELATIVE convergence stop compares the current pass against. Lifetime-scoped like
// autoRefinePass; only read/written inside a refine sequence, which the lifetime cap bounds anyway.
const refinePrevGeom = new Map<string, { volume: number; triangles: number }>()

/** How many auto-refine passes have run for a project this session (LAT-2). ChatPanel reads it to
 *  switch the manual refine control to "Refine again" once the bounded auto-chain has already fired,
 *  so the further-pass affordance is discoverable. */
export function autoRefineCount(pid: string): number {
  return autoRefinePass.get(pid) ?? 0
}

/** Consume (read + clear) the measured reference-IoU discrepancy queued for a project's next refine
 *  pass. ChatPanel.refine() prepends it to the refine prompt so the model gets the OBJECTIVE
 *  visual-mismatch signal (not just self-critique). Returns '' when none is queued. */
export function takeRefineDiscrepancy(pid: string): string {
  const d = refineDiscrepancy.get(pid)
  if (d) refineDiscrepancy.delete(pid)
  return d ?? ''
}

// OC-12 — bounded compute for the per-piece kit scoring loop. CPU rasterization is cheap, but each
// piece is a separate openscad compile; cap the renders + wall-clock so a many-piece kit can't stall
// the post-render path. Past the budget, the remaining pieces simply go unmeasured (iou undefined →
// excluded from worst-piece selection) and the loop degrades to the whole-render discrepancy.
const KIT_PIECE_BUDGET = { wallMs: 30_000, maxRenders: 8 }

/**
 * OC-12 — render each `part` option (except 'all'), score its silhouette against the reference mask,
 * and return the WORST piece below the floor (or null when none / unmeasured). CPU rasterization only;
 * each piece compiles once at Draft through the BACKGROUND worker under a bounded budget. Pure of the
 * store except for the compile + the qualityArgsFor helper. Returns null on any miss → no-op.
 */
async function scoreKitPieces(
  code: string,
  refMask: Uint8Array,
  h: GenerationHelpers,
): Promise<{ piece: string; iou: number } | null> {
  const params = parseParameters(code)
  const partParam = params.find((p) => p.name === 'part' && p.kind === 'enum')
  if (!partParam?.options) return null
  const pieces = partParam.options.map(String).filter((o) => o !== 'all')
  if (!pieces.length) return null
  const budget = new ComputeBudget(KIT_PIECE_BUDGET)
  const scores: PieceScore[] = []
  for (const piece of pieces) {
    if (!budget.canSpend()) {
      scores.push({ piece, iou: undefined }) // budget spent — unmeasured, excluded from selection
      continue
    }
    const defines = buildDefines(params, { part: piece })
    const r = await openscad.compile(code, [...h.qualityArgsFor(QUALITY_PRESETS[0]), ...defines], 30_000, { background: true })
    budget.spend()
    scores.push({ piece, iou: r.ok && r.stl ? bestRefIoU(renderMasks(r.stl), refMask) : undefined })
  }
  return worstPiece(scores, REF_IOU_FLOOR)
}

export function createGenerationActions(
  set: StoreApi<VibeState>['setState'],
  get: StoreApi<VibeState>['getState'],
  h: GenerationHelpers,
): Pick<VibeState, 'sendPrompt' | 'retryLast' | 'rerollLast' | 'regenerateWithSkills' | 'abortGeneration' | 'consumeAutoRefine'> {
  /** A2 — verifier-guided best-of-N. Fan out N generations, compile + score each on REFERENCE-FREE
   *  signals (compile-clean dominates, then degenerate, then structural/dim issue counts), and return
   *  the winner's reply text + skill report. Candidates stream SILENTLY (one status line, not N
   *  interleaved token streams); each compiles once through the bounded BACKGROUND queue under a
   *  shared per-request budget, so the N compiles can't blow the single worker's watchdog. */
  async function runBestOfN(
    pid: string,
    engine: string,
    messages: ReturnType<typeof toApiMessages>,
    baseOpts: Omit<Parameters<typeof streamGenerate>[2], 'onDelta' | 'onSkillReport'>,
    ctx: { bed: { x: number; y: number; z: number }; stated: ReturnType<typeof clampStatedDimensions>['dimensions']; refMask?: Uint8Array | null },
  ): Promise<{ full: string; skillReport: SkillIssue[]; appliedSkillIds: string[]; dropped: string[]; stopReason?: string }> {
    const n = BEST_OF_N_COUNT
    const reports = Array.from({ length: n }, () => ({ skillIds: [] as string[], dropped: [] as string[], report: [] as SkillIssue[] }))
    const stopReasons: (string | undefined)[] = Array.from({ length: n }, () => undefined)
    let done = 0
    h.writeSession(pid, { streamText: `Generating ${n} candidates, keeping the best…` })
    // LAT-5 — outcome per candidate. 'returned' carries the text to score; 'transport' is an
    // environmental miss (rate-limit/5xx/timeout, swallowed below) and 'pending' is a candidate still
    // in flight past the window. Neither transport nor pending is scored as a non-compile — both get
    // the budget-starved "unknown" treatment in scoreCandidate (above a confirmed fail, below a clean
    // compile), so the slowest candidate never gates the turn and SHE-94 holds.
    type Outcome = { kind: 'returned'; text: string } | { kind: 'transport' } | { kind: 'pending' }
    const outcomes: Outcome[] = Array.from({ length: n }, () => ({ kind: 'pending' }))
    // A shared promise that rejects on a user Stop, so AbortError still wins the race below and
    // propagates (rejecting the await) exactly as the prior Promise.all did — a Stop aborts all.
    let abortReject: (e: unknown) => void = () => {}
    const aborted = new Promise<never>((_, rej) => { abortReject = rej })
    const calls = Array.from({ length: n }, (_, i) =>
      streamGenerate(engine, messages, { ...baseOpts, onDelta: () => {}, onSkillReport: (info) => { reports[i] = info }, onDone: (info) => { stopReasons[i] = info.stopReason } })
        // each candidate that RETURNS is a full paid call — meter only those (a windowed turn shows
        // the calls actually scored, not a fixed N).
        .then((text) => {
          outcomes[i] = { kind: 'returned', text }
          h.writeSession(pid, (cur) => ({ streamText: `Generated ${++done}/${n} candidates…`, genCalls: cur.genCalls + 1, genTokens: cur.genTokens + estGenTokens(text) }))
        })
        // A user Stop aborts every candidate's shared signal — surface AbortError on the shared
        // `aborted` promise so runGeneration's catch handles it as a Stop, instead of swallowing it
        // (which would read as a contract violation and silently restart the whole generation). A
        // genuine transport error is recorded as an environmental miss, not a non-compile.
        .catch((e) => { if (e instanceof DOMException && e.name === 'AbortError') { abortReject(e); return } outcomes[i] = { kind: 'transport' } }),
    )
    // Window: don't block on the slowest. Resolve as soon as ALL candidates settle OR the wall-clock
    // window elapses — whichever comes first — and score whatever returned by then. AbortError races
    // ahead of both and rejects, so a Stop still tears the whole fan-out down.
    const settled = Promise.allSettled(calls).then(() => {})
    const window = new Promise<void>((res) => setTimeout(res, BEST_OF_N_WINDOW_MS))
    await Promise.race([Promise.race([settled, window]), aborted])
    const fulls = outcomes.map((o) => (o.kind === 'returned' ? o.text : ''))
    const budget = new ComputeBudget({ wallMs: 60_000, maxRenders: n + 2 })
    const shapeLoopStart = Date.now() // wall-clock anchor for the per-candidate shape-match guard
    const signals: CandidateSignals[] = []
    for (const outcome of outcomes) {
      // LAT-5/SHE-94 — a candidate that didn't return within the window (pending) or hit a transport
      // error is ENVIRONMENTAL: score it as budget-starved "unknown" (hasScad true, compileAttempted
      // false) so it ranks above a confirmed fail but below a clean compile — never as a non-compile.
      if (outcome.kind !== 'returned') {
        signals.push({ hasScad: true, compileAttempted: false, compiled: false, degenerate: false, structuralIssues: 0, dimMismatches: 0 })
        continue
      }
      const text = outcome.text
      const { code, blockCount, selfCorrection } = extractScadBlock(text)
      if (code === null || (blockCount > 1 && !selfCorrection)) {
        signals.push({ hasScad: false, compileAttempted: false, compiled: false, degenerate: false, structuralIssues: 0, dimMismatches: 0 })
        continue
      }
      const params = parseParameters(code)
      const isMultiPart = params.some((p) => p.name === 'part' && p.kind === 'enum')
      let compileAttempted = false
      let compiled = false
      let degenerate = false
      let dimMismatches = 0
      let fillRatio: number | undefined
      let shapeMatch: number | undefined
      let proportionMatch: number | undefined
      if (budget.canSpend()) {
        compileAttempted = true
        // compile with the SAME root-scope quality defines the real render uses (Draft here — fast
        // enough that all N normally fit the budget), so a candidate that only fails under the
        // -D $fn=0 overrides is caught, not scored as if it compiled bare.
        const r = await openscad.compile(code, h.qualityArgsFor(QUALITY_PRESETS[0]), 30_000, { background: true })
        budget.spend()
        if (r.ok && r.stl) {
          compiled = true
          const dims = stlBBox(r.stl)
          degenerate = degenerateReason(dims, ctx.bed, !isMultiPart) !== null
          dimMismatches = ctx.stated.length ? dimDiscrepancies(dims, ctx.stated).length : 0
          // self-relative solidity: mesh volume / bbox volume (the already-computed dims carry both).
          // Feeds the below-everything hollow tiebreak in scoreCandidate; undefined when unmeasurable.
          const bboxVol = dims ? dims.x * dims.y * dims.z : 0
          if (dims && bboxVol > 0) fillRatio = dims.volume / bboxVol
          // REFERENCE-grounded shape match (Phase 2): only when a segmented photo mask is in hand.
          // renderMasks is CPU rasterization on the STL already compiled above — it does NOT consume
          // the openscad render budget (same as fillRatio). The 32-comparison bestRefIoU is bounded by
          // a coarse wall-time guard so a pathological mesh can't stall selection.
          if (ctx.refMask && Date.now() - shapeLoopStart < SHAPE_MATCH_BUDGET_MS) {
            const masks = renderMasks(r.stl)
            shapeMatch = bestRefIoU(masks, ctx.refMask)
            // OC-10 — proportion match at one SHARED scale (the scale-blind IoU above can't see it).
            // Same already-computed pose masks → no extra render budget; tiebreak below shapeMatch.
            proportionMatch = bestProportionMatch(masks, ctx.refMask)
          }
        }
      }
      signals.push({ hasScad: true, compileAttempted, compiled, degenerate, structuralIssues: structuralReport(code, params).issues.length, dimMismatches, fillRatio, shapeMatch, proportionMatch })
    }
    const best = pickBestIndex(signals.map(scoreCandidate))
    h.writeSession(pid, { streamText: '' })
    // carry the WINNING candidate's stop reason so a truncated winner is caught downstream
    // (same max_tokens handling as the single-stream path), not fed half a program to the parser
    return { full: fulls[best], skillReport: reports[best].report, appliedSkillIds: reports[best].skillIds, dropped: reports[best].dropped, stopReason: stopReasons[best] }
  }

  /** stream one assistant turn for the chat as it stands (shared by send + retry) */
  async function runGeneration(nameSource: { text: string; action?: string }, fixes: FixBudget = NO_FIXES, opts: { skillIds?: string[] } = {}) {
    // capture the project this run is FOR once, and never read get().activeId again — every write
    // below routes through *For(pid)/writeSession(pid), so a mid-run project switch can't land this
    // reply on a different chat. (While blockSwitchWhileGenerating stands, pid is always activeId.)
    const pid = get().activeId
    if (!pid) return
    const ctrl = new AbortController()
    h.writeSession(pid, { generating: true, streamText: '', streamHasCode: false, genStartedAt: Date.now(), abortController: ctrl })
    let genTimedOut = false
    let genTimer: ReturnType<typeof setTimeout> | undefined
    // effective anti-hang cap = the server's configured generation timeout + a buffer (see consts)
    let genCapMs = GEN_TIMEOUT_FALLBACK_MS + GEN_TIMEOUT_BUFFER_MS
    try {
      const engine = get().engine
      if (!engine) throw new Error('No AI engine is available — connect one (see the engine menu next to Send).')
      // bind history to the active engine's context window (token budget), not a fixed count
      const provider = get().health?.providers.find((p) => p.id === engine)
      const budgetTokens = historyBudgetTokens(provider, get().health?.systemTokens)
      const messages = toApiMessages(h.activeChatFor(pid), { budgetTokens, maxImages: imageBudgetFor(provider) })
      const bed = resolveBed(get().bedId, get().customBed)
      // anti-hang: abort a truly-stalled stream after the configured cap. Guards ONLY the
      // network stream and is cleared the instant it resolves, so it can never fire
      // during the downstream compile / auto-fix recursion (which awaits child runs).
      genCapMs = (get().health?.genTimeoutMs ?? GEN_TIMEOUT_FALLBACK_MS) + GEN_TIMEOUT_BUFFER_MS
      genTimer = setTimeout(() => { genTimedOut = true; ctrl.abort() }, genCapMs)
      // carry the PRIOR turn's intent forward so a follow-up that drops the mechanism
      // keyword ("make it bigger") still retrieves the same skill (server prefers its
      // domainTags over the regex). First turn → none → server-side selectSkills from prompt.
      const priorIntent = [...h.activeChatFor(pid)].reverse().find((m) => m.role === 'assistant' && m.intent)?.intent
      // coarse first-turn source hint from the latest user turn's image roles (tiles →
      // multiview, ≥2 globals → multiobject); the model's own sourceType takes over after.
      const latestImgs = [...h.activeChatFor(pid)].reverse().find((m) => m.role === 'user' && (m.images?.length ?? 0) > 0)?.images ?? []
      const sourceHint = latestImgs.some((im) => im.role === 'tile')
        ? ('multiview' as const)
        : latestImgs.filter((im) => (im.role ?? 'global') === 'global').length >= 2
          ? ('multiobject' as const)
          : undefined
      let skillReport: SkillIssue[] = []
      let appliedSkillIds: string[] = []
      let droppedSkillIds: string[] = []
      const isKit = detectKitIntent(nameSource.text)
      // opts.skillIds (from the applied-patterns chip's correction) OVERRIDES retrieval for this turn
      // — the server assembler injects exactly those fragments, no selectSkills.
      const baseOpts: Omit<Parameters<typeof streamGenerate>[2], 'onDelta' | 'onSkillReport'> = {
        signal: ctrl.signal,
        model: engine === 'claude-code' ? get().claudeModel : engine === 'kimi' ? get().kimiModel : undefined,
        // effort is capability-driven (engines that declare reasoning levels), not a hardcoded engine
        // list. LAT-1 done right: tier by difficulty — claudeEffort (UI/default 'high') is the base for
        // ordinary prompts; hard geometry (kits, image refs) gets AT LEAST 'xhigh' (deeper thinking
        // genuinely helps), never lowering a user who picked higher. Reserving xhigh for the hard cases
        // instead of every prompt is the main cut to Opus think-time (and thus the TTFB/stall window).
        effort: provider?.efforts?.length
          ? (isKit || latestImgs.length > 0
              ? (['xhigh', 'max'].includes(get().claudeEffort) ? get().claudeEffort : 'xhigh')
              : get().claudeEffort)
          : undefined,
        context: { bed: { x: bed.x, y: bed.y, z: bed.z, label: bed.label }, kit: isKit, intent: priorIntent, skillIds: opts.skillIds, sourceHint },
      }
      // A2 — verifier-guided best-of-N: only on the FIRST attempt of a hard request (kit or image),
      // only when the user opted in (off by default), never on local engines or auto-fix re-entries.
      // The winner feeds the SAME downstream below; OFF → the single-stream path is unchanged.
      // LAT-5 — a refine pass attaches view images (latestImgs>0), which would otherwise re-trigger
      // the whole best-of-N fan-out on every refine. Exclude it explicitly so refine never re-fans-out.
      const useBestOfN =
        fixes.contract === 0 &&
        fixes.geom === 0 &&
        nameSource.action !== 'Refine pass' &&
        useUi.getState().bestOfN &&
        !engine.startsWith('local:') &&
        (isKit || latestImgs.length > 0)
      let full: string
      let stopReason: string | undefined
      if (useBestOfN) {
        const stated = clampStatedDimensions(priorIntent?.statedDimensions).dimensions
        // Reference-grounded shape tiebreak (Phase 2): when the latest user turn carries a whole-photo
        // (role==='global') reference, kick off its segmentation FIRE-AND-FORGET — it never blocks the
        // stream. The fan-out below ranks with whatever mask is ready by the time it compiles (often
        // null on a fast generation → identical to today's reference-free scoring). Segmentation runs
        // at most once per photo per project (cached, re-keyed on photo swap by image identity).
        const refPhoto = latestImgs.find((im) => (im.role ?? 'global') === 'global')
        if (refPhoto) ensureRefMask(pid, refPhoto.data, refPhoto.mediaType, refPhoto.data)
        const refMask = refPhoto ? getRefMask(pid) : null
        const winner = await runBestOfN(pid, engine, messages, baseOpts, { bed: { x: bed.x, y: bed.y, z: bed.z }, stated, refMask })
        full = winner.full
        skillReport = winner.skillReport
        appliedSkillIds = winner.appliedSkillIds
        droppedSkillIds = winner.dropped
        stopReason = winner.stopReason
      } else {
        full = await streamGenerate(engine, messages, {
          ...baseOpts,
          onDelta: (delta) =>
            // route this run's tokens into ITS OWN session (writeSession mirrors to the top-level
            // projection only when pid is active) — two concurrent streams can't interleave buffers
            h.writeSession(pid, (cur) => ({
              streamText: cur.streamText + delta,
              // flip-once: stop scanning the moment the first fence appears (|| short-circuits)
              streamHasCode: cur.streamHasCode || (cur.streamText + delta).includes('```'),
            })),
          onSkillReport: (info) => { skillReport = info.report; appliedSkillIds = info.skillIds; droppedSkillIds = info.dropped },
          onDone: (info) => { stopReason = info.stopReason },
        })
        // meter the single paid call (best-of-N meters its own N candidates above)
        h.writeSession(pid, (cur) => ({ genCalls: cur.genCalls + 1, genTokens: cur.genTokens + estGenTokens(full) }))
      }
      clearTimeout(genTimer)
      genTimer = undefined
      // A user Stop (or an aborted best-of-N fan-out) must not fall through into the contract
      // re-ask / adopt path below — that silently spawns a fresh generation. Bail quietly: the
      // finally clears `generating`, matching a Stop on the single-stream path.
      if (ctrl.signal.aborted) return
      const { code, prose: rawProse, blockCount, selfCorrection } = extractScadBlock(full)
      // parse the advisory INTENT line, then strip it so the user sees clean PLAN prose
      const intent = extractIntent(rawProse)
      const prose = stripIntentLine(rawProse)

      // Output-length truncation: the engine hit its max-tokens ceiling, so the program is almost
      // certainly cut off mid-block. Surface a recoverable message instead of feeding half a program
      // into the contract re-ask / auto-fix spiral (most likely on the 4096-token local + Kimi paths).
      if (stopReason === 'max_tokens') {
        h.setChatFor(pid, [
          ...h.activeChatFor(pid),
          {
            id: newId(),
            createdAt: Date.now(),
            role: 'assistant',
            text: (prose ? prose + '\n\n' : '') + 'The reply was cut off at the output-length limit, so the program is likely incomplete. Ask me to continue, or simplify the request (fewer parts / less detail).',
            error: true,
          },
        ])
        return
      }

      // Contract enforcement: the reply MUST contain exactly ONE scad block. On 0
      // or >1 blocks, ask once for a single complete program — Opus 4.8 asks more
      // often and a prose-only / multi-block reply adopts nothing useful. Shares
      // the auto-fix attempt budget so it can never stack, and is off for weak
      // local engines (which can't reliably honor the format anyway).
      // A self-correction ("replace the prior block") with a clean final tagged block is NOT a
      // genuine ambiguity — extractScadBlock already selected that last block — so adopt it directly
      // and skip the wasted multi-block re-ask round trip. Only a truly ambiguous multi-block (or
      // no-block) reply still trips the contract nudge below.
      const contractViolated = (code === null || blockCount > 1) && !(selfCorrection && code !== null)
      if (contractViolated && fixes.contract < MAX_CONTRACT_REASK && engine && !engine.startsWith('local:')) {
        h.setChatFor(pid, [...h.activeChatFor(pid), { id: newId(), createdAt: Date.now(), role: 'assistant', text: prose || 'Returning the program again.' }])
        const nudge =
          code === null
            ? 'Your last reply contained no OpenSCAD code block. Reply again with exactly ONE ```scad fenced block containing the COMPLETE program, per the response format.'
            : 'Your last reply contained more than one code block. Reply again with exactly ONE ```scad fenced block containing the COMPLETE program (merge everything into a single program).'
        h.setChatFor(pid, [...h.activeChatFor(pid), { id: newId(), createdAt: Date.now(), role: 'user', text: nudge, action: 'Fix format' }])
        await runGeneration({ text: nudge, action: 'Fix format' }, { ...fixes, contract: fixes.contract + 1 }, opts)
        return
      }

      // Contract re-asks exhausted (or a local engine that can't honor the format):
      // surface a clear, recoverable message instead of silently showing prose with no
      // model. Both cloud engines have been seen to plan correctly but omit the block.
      if (code === null) {
        const tries = engine && !engine.startsWith('local:') ? ` after ${MAX_CONTRACT_REASK + 1} attempts` : ''
        h.setChatFor(pid, [
          ...h.activeChatFor(pid),
          {
            id: newId(),
            createdAt: Date.now(),
            role: 'assistant',
            text: (prose ? prose + '\n\n' : '') + `I couldn't produce a single OpenSCAD code block${tries}. Try rephrasing or simplifying the request, or switch engines.`,
            error: true,
          },
        ])
        return
      }

      // `code` is already narrowed to non-null above (the contract-violation path returned)
      const isFirstModel = !h.activeChatFor(pid).some((m) => m.code)
      // advisory: surface the retrieved skills' mechanism check (verified-skill validators)
      // next to the model — never blocks, just flags printability issues the model slipped.
      // Kept off `text` so it does NOT re-enter the model's next-turn history.
      const skillNote = skillReport.length
        ? skillReport.flatMap((r) => r.issues).join('\n')
        : undefined
      const assistantMsg: ChatMessage = {
        id: newId(),
        createdAt: Date.now(),
        role: 'assistant',
        text: prose || 'Here is the model.',
        code: code ?? undefined,
        skillNote,
        appliedSkillIds: appliedSkillIds.length ? appliedSkillIds : undefined,
        droppedSkillIds: droppedSkillIds.length ? droppedSkillIds : undefined,
        intent: intent ?? undefined,
      }
      h.setChatFor(pid, [...h.activeChatFor(pid), assistantMsg])
      // local skill-health signal: count this application (paired with chip removals below)
      if (appliedSkillIds.length) {
        const ns = recordUses(get().skillStats, appliedSkillIds)
        set({ skillStats: ns })
        saveSkillStats(ns)
      }
      // teach the loop once per project (UX-AUDIT F9): point at sliders / chat / export
      if (isFirstModel) {
        h.setChatFor(pid, [
          ...h.activeChatFor(pid),
          {
            id: newId(),
            createdAt: Date.now(),
            role: 'assistant',
            text: 'Tip: fine-tune it with the sliders on the right, ask me for changes here, or use Export when it looks good.',
          },
        ])
      }
      if (code) {
        // carry THIS project's still-valid slider tweaks across the iteration (its session, not the
        // active project's top-level — they differ once a background generation is running)
        const prevSession = h.genSession(pid)
        const compileResult = await h.adoptCodeFor(pid, code, { params: prevSession.params, values: prevSession.paramValues })
        h.persistFor(pid)
        // auto-name the project: prefer the user's words; for app-initiated
        // image-only sends use the AI's description instead of canned text
        const project = get().projects.find((p) => p.id === pid)
        if (project && project.name === 'Untitled part') {
          const source = nameSource.action && prose ? prose : nameSource.text
          const name = source.replace(/\s+/g, ' ').trim()
          h.persistFor(pid, { name: name.length > 42 ? name.slice(0, 39) + '…' : name || 'Untitled part' })
        }

        // ── Recovery loop. Repair not only hard render errors but clean-but-WRONG
        // renders (empty/NaN/tiny/over-bed) and structural assembly faults. Gated on
        // the ACTUAL compile result (not the racing compileStatus), capped by the
        // shared attempt budget, off for weak local engines. Off-bed single parts get
        // a deterministic drop-to-bed instead of spending an AI turn.
        const eng = get().engine
        const canRepair = fixes.geom < MAX_GEOM_FIX && useUi.getState().autoRepair && !!eng && !eng.startsWith('local:')
        if (canRepair && !compileResult.ok && compileResult.error && compileResult.error !== 'superseded' && compileResult.error !== 'empty') {
          const fixText = buildAutoFixPrompt(compileResult.error)
          h.setChatFor(pid, [...h.activeChatFor(pid), { id: newId(), createdAt: Date.now(), role: 'user', text: fixText, action: 'Auto-fix' }])
          await runGeneration({ text: fixText, action: 'Auto-fix' }, { ...fixes, geom: fixes.geom + 1 }, opts)
        } else if (compileResult.ok) {
          // read THIS project's just-compiled geometry from its session (top-level is the active
          // project, which may be a different chat once a background generation is running)
          const sess = h.genSession(pid)
          const params = sess.params
          const isMultiPart = params.some((p) => p.name === 'part' && p.kind === 'enum')
          // is the currently-rendered view the ASSEMBLED all-view of a kit (not a per-piece view, and
          // not deliberately exploded)? Then, like a single part, it should rest flat on the bed.
          const pv = sess.paramValues
          const partParam = params.find((p) => p.name === 'part' && p.kind === 'enum')
          const explodeParam = params.find((p) => p.name === 'explode')
          const isAssembledAllView =
            isMultiPart &&
            (pv['part'] ?? partParam?.defaultValue) === 'all' &&
            !Number(explodeParam ? (pv['explode'] ?? explodeParam.defaultValue) : 0)
          const bed = resolveBed(get().bedId, get().customBed)
          const dims = sess.modelDims
          const degenerate = degenerateReason(dims, bed, !isMultiPart)
          // OC-13 — flat-on-bed DESIGN flag for a single solid part. The deterministic drop below is
          // only the export safety net (it transforms the mesh); this surfaces that the DESIGN itself
          // doesn't rest flat (e.g. t2-soapdish minZ=-3). Exempt multi-part + the assembled `all` view
          // (their pieces legitimately float / explode), matching the drop's own exemptions.
          const flatOnBedNote = !isMultiPart && !isAssembledAllView ? notFlatOnBedReason(dims) : null
          // assembly/mechanism faults = cheap client structural checks PLUS the retrieved
          // skills' validators (server-side, received via skillReport). The advisory
          // skillNote already shows them; here they also drive a BOUNDED auto-fix (gated on
          // the autoRepair toggle + the MAX_GEOM_FIX budget, so it can't loop).
          const assembly = [...structuralReport(code, params).issues, ...skillReport.flatMap((r) => r.issues)]
          // OC-1 — reference-free connectivity oracle: a SINGLE-solid part must be ONE connected
          // body. A handle floating off a mug wall renders as a 2nd island with a sane bbox and a
          // clean compile, so nothing else catches it. Count islands only on a single part (NEVER
          // the assembled `all` view of a kit, whose pieces are legitimately separate). A negligible
          // secondary speck (rounding/artefact) is ignored via the volume-fraction floor.
          if (!isMultiPart && sess.stl) {
            const islands = islandCount(sess.stl)
            if (islands && islands.count >= 2 && islands.largestVolumeFraction < ISLAND_SECONDARY_FLOOR) {
              assembly.push(
                `The model rendered as ${islands.count} disconnected pieces — a single part must be one connected solid. Fuse the detached feature (e.g. a handle, lid, or spout) to the body so the whole part is a single watertight mesh.`,
              )
            }
          }
          // C1 — runtime interference proxy: a cutter slicing protected structure (a bore through a
          // clutch tube, a pocket into a bearing seat) is invisible to compile/dim/IoU but caught here
          // by rendering the hidden _debug probe (positives vs negatives) and measuring their overlap.
          // The signal is REFERENCE-FREE, so it drives the SAME bounded auto-fix turn as the structural
          // checks. Gated on canRepair + the probe contract so the two extra probe renders only run for
          // a kit that can act on the result; a superseded/failed probe yields null → no false issue.
          if (canRepair && hasDebugContract(code)) {
            // shared per-generation ceiling so the probe renders (and future best-of-N) degrade
            // gracefully instead of compounding latency through the single-flight worker.
            const budget = new ComputeBudget({ wallMs: 30_000, maxRenders: 4 })
            const interference = await interferenceIssue(code, budget)
            if (interference) assembly.push(interference)
          }
          // LAT-2 — stop arming the quality auto-fix once the per-turn wall-clock budget is spent, so
          // the gen→autofix→refine chain can't run unbounded for minutes. A hard compile-error fix
          // above is exempt (a non-compiling part must still be repaired); this bounds only the
          // quality-driven retries that compound latency.
          if (canRepair && !turnBudgetExceeded(pid) && (degenerate || assembly.length)) {
            const parts: string[] = []
            if (degenerate) parts.push(`The program rendered but the result is not usable: ${degenerate}. Return a corrected complete program with sensible millimeter dimensions.`)
            if (assembly.length)
              parts.push(`${degenerate ? 'Also fix' : 'Fix'} these assembly/mechanism problems, then return the corrected complete program:\n${assembly.map((i) => `- ${i}`).join('\n')}`)
            const fixText = parts.join('\n\n')
            h.setChatFor(pid, [...h.activeChatFor(pid), { id: newId(), createdAt: Date.now(), role: 'user', text: fixText, action: 'Auto-fix' }])
            await runGeneration({ text: fixText, action: 'Auto-fix' }, { ...fixes, geom: fixes.geom + 1 }, opts)
          } else if (!isMultiPart && dims && Math.abs(dims.minZ) > 0.5) {
            // off-bed single part → deterministic drop-to-bed (no AI turn). The export
            // bakes meshTransform, so the exported/printed part sits flat on z=0. This also
            // catches the case where the auto-fix budget is exhausted with assembly/skill
            // issues still unfixed — the part still gets dropped onto the bed.
            const drop1: { position: [number, number, number]; rotation: [number, number, number] } = { position: [0, 0, -dims.minZ], rotation: [0, 0, 0] }
            if (pid === get().activeId) get().setMeshTransform(drop1)
            else h.writeSession(pid, { meshTransform: drop1 })
            // OC-13 — flag the DESIGN (not flat on bed) alongside the export safety-net drop, so a part
            // authored floating/sunk is surfaced in the verdict, not silently transformed away.
            const dropNote = `Part rendered ${dims.minZ < 0 ? 'below' : 'above'} the bed — dropped onto z=0 for export.`
            h.writeSession(pid, { compileNote: flatOnBedNote ? `${flatOnBedNote}. ${dropNote}` : dropNote })
          } else if (isAssembledAllView && dims && Math.abs(dims.minZ) > 0.5) {
            // assembled kit preview sunk below / floating above the bed → drop onto z=0 so the all-view
            // reads as sitting on the plate and a single-STL export of it prints flat. A per-piece view
            // recompiles (meshTransform resets to null), and a deliberate explode (>0) is never fought.
            const drop2: { position: [number, number, number]; rotation: [number, number, number] } = { position: [0, 0, -dims.minZ], rotation: [0, 0, 0] }
            if (pid === get().activeId) get().setMeshTransform(drop2)
            else h.writeSession(pid, { meshTransform: drop2 })
            h.writeSession(pid, { compileNote: `Assembly rendered ${dims.minZ < 0 ? 'below' : 'above'} the bed — dropped onto z=0 for preview/export.` })
          }
        }

        // Auto-fire BOUNDED refine passes after an image-grounded model renders —
        // the refine loop is the main accuracy mechanism but is opt-in/undiscoverable.
        // Re-arms after the FIRST model AND after each refine result (action 'Refine
        // pass'), up to MAX_AUTO_REFINE passes — but NOT on 'Auto-fix'/'Fix format'
        // re-entries (those carry code so isFirstModel is false and their action
        // differs), so error-repair turns never burn a refine pass. ChatPanel consumes
        // the flag once the canvas has painted; consumeAutoRefine increments the count.
        if (compileResult.ok && (isFirstModel || nameSource.action === 'Refine pass')) {
          const triggerImages = [...h.activeChatFor(pid)].reverse().find((m) => m.role === 'user')?.images
          const provider = get().health?.providers.find((p) => p.id === eng)
          const aid = pid
          // Proxy-gated convergence — two REFERENCE-FREE signals, never the model self-grading:
          //  (a) DIMENSIONS: when the reference labeled dimensions, keep refining while the
          //      model-INDEPENDENT bbox check still flags a mismatch.
          //  (b) SELF-RELATIVE CONVERGENCE: otherwise (or once dims match), keep refining only while
          //      the model is still MEANINGFULLY RESHAPING the geometry (volume/tri changed >3% vs the
          //      previous pass), and STOP once it has settled. Replaces the old "no stated dims =>
          //      burn the whole pass budget blind" gate, which re-asked the same model to self-grade
          //      after it had stopped changing anything (self-correction regresses without an external
          //      oracle). Thin-part-safe: a flat part converges on pass 1 and stops; it only ever
          //      stops EARLIER — MAX_AUTO_REFINE below is still the hard ceiling.
          const md = h.genSession(pid).modelDims
          const stated = clampStatedDimensions(intent?.statedDimensions).dimensions
          const dimMismatch = stated.length > 0 && dimDiscrepancies(md, stated).length > 0
          const curGeom = md ? { volume: md.volume, triangles: md.triangles } : null
          // STOP-only self-relative signal: once the geometry has settled, no further pass is armed.
          // It is NEVER a START on its own (OC-4) — a part that's merely still reshaping, with no
          // measured defect, fires ZERO refine passes.
          const converged = geometryConverged(refinePrevGeom.get(aid), curGeom)
          // OC-1 reference-free connectivity defect, recomputed here (the compile-branch `islands` is
          // out of scope): a single-solid part rendered as ≥2 islands whose largest holds <floor of the
          // mesh is a genuine broken-connectivity defect — a measured justification for a text refine.
          const sessStl = h.genSession(pid).stl
          const isMultiPartNow = h.genSession(pid).params.some((p) => p.name === 'part' && p.kind === 'enum')
          let hasIslandDefect = false
          if (!isMultiPartNow && sessStl) {
            const isl = islandCount(sessStl)
            hasIslandDefect = !!isl && isl.count >= 2 && isl.largestVolumeFraction < ISLAND_SECONDARY_FLOOR
          }
          //  (c) REFERENCE-IoU (OC-2) — DEFAULT-ON for image turns: measure the ADOPTED render's
          //      silhouette against the user's segmented reference photo (CPU rasterization; no
          //      openscad budget). Below the floor → refine, citing the measured mismatch. A refine
          //      pass is only allowed to CONTINUE while it RAISES IoU (a non-improving pass stops the
          //      loop, like the self-relative convergence guard). Reads getRefMask INSIDE this path
          //      (after a fire-and-forget ensure) so the cold-start segmentation race is tolerated:
          //      no mask yet → ioU undefined → behaves exactly as the pre-OC-2 path.
          const refPhoto = [...h.activeChatFor(pid)]
            .reverse()
            .find((m) => m.role === 'user' && (m.images?.some((im) => (im.role ?? 'global') === 'global') ?? false))
            ?.images?.find((im) => (im.role ?? 'global') === 'global')
          let iouWantsRefine: boolean | undefined
          let kitWantsRefine = false
          if (refPhoto && provider?.vision) {
            ensureRefMask(aid, refPhoto.data, refPhoto.mediaType, refPhoto.data)
            const refMask = getRefMask(aid)
            const adoptedStl = h.genSession(pid).stl
            if (refMask && adoptedStl) {
              const adoptedMasks = renderMasks(adoptedStl)
              const refIoU = bestRefIoU(adoptedMasks, refMask)
              iouWantsRefine = iouRefineDecision(refIoU, refinePrevIoU.get(aid), REF_IOU_FLOOR)
              refinePrevIoU.set(aid, refIoU)
              if (refIoU < REF_IOU_FLOOR) {
                // OC-10 — measure PROPORTION (scale-shared aspect/fill/centroid) separately from the
                // scale-blind IoU, so a low proportion match adds a SPECIFIC "wrong proportions" note
                // the silhouette overlap alone can't justify. Same pose masks → no extra render budget.
                const prop = bestProportionMatch(adoptedMasks, refMask)
                const propNote =
                  prop < PROPORTION_FLOOR
                    ? `The PROPORTIONS are also off (aspect / fill / mass distribution match only ${(prop * 100).toFixed(0)}% at a shared scale): correct the overall width-to-height ratio and where the bulk of the form sits to match the reference. `
                    : ''
                refineDiscrepancy.set(
                  aid,
                  `VISUAL MATCH CHECK — an independent silhouette comparison of the current render against your reference photo scores only ${(refIoU * 100).toFixed(0)}% overlap (a faithful match is well above ${(REF_IOU_FLOOR * 100).toFixed(0)}%). The rendered OUTLINE and PROPORTIONS do not yet match the reference; fix the overall shape, proportions, and any missing/misplaced prominent feature to match the photo. ${propNote}`,
                )
              } else {
                refineDiscrepancy.delete(aid)
              }
              // OC-12 — per-piece reference-IoU for KITS. The whole-render IoU above averages a single
              // wrong piece away; here we render each `part` option, score it against the reference, and
              // if the WORST piece is below the floor, OVERRIDE the discrepancy with a piece-SPECIFIC
              // one so the next refine fixes that piece by name. Gated on isMultiPartNow, so the
              // single-part path (OC-2) above is byte-identical when not a kit. CPU rasterization only.
              if (isMultiPartNow) {
                const worst = await scoreKitPieces(code, refMask, h)
                if (worst) {
                  refineDiscrepancy.set(aid, worstPieceDiscrepancy(worst.piece, worst.iou, REF_IOU_FLOOR))
                  // OC-12 acceptance #2 — the worst piece must DRIVE a targeted refine even when the
                  // whole-render IoU is fine (the assembly averages a single featureless piece away, so
                  // iouWantsRefine is false). This arms the same bounded auto-refine seam as OC-6/the IoU
                  // path; it still respects the per-turn budget + autoCap below.
                  kitWantsRefine = true
                }
              }
            }
          }
          // OC-6 — live ADVISORY vision-judge. When opted in (off by default) on a vision-capable
          // engine for an image turn, capture the rendered poses and run a feature-fidelity check; if a
          // NAMED feature is judged ABSENT, arm a bounded refine citing it via the SAME discrepancy +
          // pendingAutoRefineFor seam (no ChatPanel edit). Never blocks export / the green verdict. Only
          // for the ACTIVE project (the viewport canvas it captures reflects only the active model). Off
          // → never called → the live path is byte-identical to today.
          let visionWantsRefine = false
          if (
            useUi.getState().visionJudge &&
            provider?.vision &&
            !!triggerImages?.length &&
            pid === get().activeId
          ) {
            const userText = [...h.activeChatFor(pid)].reverse().find((m) => m.role === 'user')?.text ?? nameSource.text
            const refImg = refPhoto ? { data: refPhoto.data, mediaType: refPhoto.mediaType } : null
            const verdict = await runLiveVisionJudge({ prompt: userText, code, referenceImage: refImg })
            // meter the advisory VLM call like a generation call (cost discipline — OC-6 acceptance)
            if (verdict) h.writeSession(pid, (cur) => ({ genCalls: cur.genCalls + 1 }))
            const absent = firstAbsentFeature(verdict)
            if (absent) {
              visionWantsRefine = true
              // append to any IoU/proportion/piece discrepancy already queued (don't clobber it)
              refineDiscrepancy.set(aid, (refineDiscrepancy.get(aid) ?? '') + absentFeatureDiscrepancy(absent))
            }
          }
          // When we HAVE an IoU signal (image turn), it gates the loop unchanged: refine only while
          // below the floor AND the last pass was still improving (dimMismatch can still pull it). With
          // NO IoU signal (text turn, no photo, or mask not ready) the gate is DEFECT-JUSTIFIED only
          // (OC-4): a measured island/dim defect arms a pass, and `converged` only ever STOPS it — a
          // part that is merely still reshaping with no defect fires ZERO passes.
          // OC-6 — an ABSENT named feature (advisory vision-judge) is a hard, specific defect: it arms
          // a refine regardless of the IoU/convergence gate (it can fire even when the silhouette
          // overlap is fine). visionWantsRefine is always false when the judge is off → no-op.
          const proxyWantsRefine = proxyRefineDecision({
            visionWantsRefine,
            kitWantsRefine,
            iouWantsRefine,
            dimMismatch,
            hasIslandDefect,
            converged,
          })
          if (curGeom) refinePrevGeom.set(aid, curGeom)
          // LAT-2 — interactive auto-refine defaults to ONE pass. A 2nd auto pass is only armed when
          // the oracle is positively still improving (iouWantsRefine === true); otherwise the chain
          // stops and the user can fire one more via the "Refine again" control. Also stop arming once
          // the cumulative per-turn wall-clock budget is spent.
          const passes = autoRefinePass.get(aid) ?? 0
          const autoCap = iouWantsRefine === true ? MAX_AUTO_REFINE : DEFAULT_AUTO_REFINE
          // OC-4 — text turns may now arm a BOUNDED refine pass too, but ONLY when a reference-free
          // defect was measured (proxyWantsRefine, which for the no-IoU path is defect-justified).
          // The image path still requires provider vision (its IoU/dim gate lives in proxyWantsRefine);
          // the text path needs only a cloud engine. Both share the per-turn budget + cap below.
          const isImageTurn = !!triggerImages?.length
          const channelArmed = isImageTurn ? !!provider?.vision : true
          if (
            channelArmed &&
            !!eng &&
            !eng.startsWith('local:') &&
            useUi.getState().autoRepair &&
            aid &&
            proxyWantsRefine &&
            !turnBudgetExceeded(aid) &&
            passes < autoCap
          ) {
            set({ pendingAutoRefineFor: aid })
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Distinguish a timeout-abort from a user Stop: the timeout surfaces a
        // recoverable error; a user Stop stays silent.
        if (genTimedOut) {
          h.setChatFor(pid, [
            ...h.activeChatFor(pid),
            {
              id: newId(),
              createdAt: Date.now(),
              role: 'assistant',
              text: `Generation timed out after ${Math.round(genCapMs / 60000)} min — the engine may be overloaded or unreachable. To wait longer (Opus at high effort can need it), raise VIBEMESH_GEN_TIMEOUT_MS in .env; otherwise try again or lower the effort.`,
              error: true,
            },
          ])
        }
      } else {
        const message = err instanceof Error ? err.message : String(err)
        h.setChatFor(pid, [...h.activeChatFor(pid), { id: newId(), createdAt: Date.now(), role: 'assistant', text: message, error: true }])
      }
    } finally {
      if (genTimer) clearTimeout(genTimer)
      // clear ONLY if this run still owns the session's controller — a nested auto-fix run (or, later,
      // a concurrent retry) may have replaced it, and it owns the teardown. Prevents one run nulling
      // another's handle (the bug the old module-level singleton had).
      if (h.genSession(pid).abortController === ctrl) {
        h.writeSession(pid, { generating: false, streamText: '', streamHasCode: false, abortController: null, genStartedAt: null })
      }
    }
  }

  return {
    sendPrompt: async (text, images, action) => {
      const state = get()
      if (state.generating) return
      if (!state.activeId) {
        get().newProject()
      }
      const pid = get().activeId
      if (!pid) return
      const userMsg: ChatMessage = { id: newId(), createdAt: Date.now(), role: 'user', text, images, action }
      // LAT-2 — anchor the per-turn wall-clock budget for the whole gen→refine→autofix chain. An
      // AUTO 'Refine pass' continues the same turn (no re-anchor → cumulative); a manual 'Refine
      // again' gets a FRESH budget so the user's explicit pass is never pre-empted by prior elapsed.
      if (action !== 'Refine pass') turnBudgetStart.set(pid, Date.now())
      // a new prompt commits to the current (possibly rolled-back) version: the stashed
      // tail is now a genuinely abandoned branch, so clear the redo stack as we append.
      h.setChatAndFutureFor(pid, [...h.activeChatFor(pid), userMsg], [])
      await runGeneration({ text, action })
    },

    retryLast: async () => {
      if (get().generating) return
      const pid = get().activeId
      if (!pid) return
      const chat = h.activeChatFor(pid)
      // drop trailing FAILED assistant replies only — successful versions stay restorable
      let end = chat.length
      while (end > 0 && chat[end - 1].role === 'assistant' && chat[end - 1].error) end--
      if (end === 0 || chat[end - 1].role !== 'user') return
      const lastUser = chat[end - 1]
      h.setChatFor(pid, chat.slice(0, end))
      if (lastUser.action !== 'Refine pass') turnBudgetStart.set(pid, Date.now())
      await runGeneration({ text: lastUser.text, action: lastUser.action })
    },

    rerollLast: async () => {
      if (get().generating) return
      const pid = get().activeId
      if (!pid) return
      const chat = h.activeChatFor(pid)
      // a re-roll only makes sense once there IS a model — a code-bearing assistant version to vary
      if (!chat.some((m) => m.role === 'assistant' && m.code)) return
      const text =
        'Generate a different version of the current model for the same request — keep the original intent and any stated dimensions, but try a fresh approach. Return the complete program.'
      // Append-a-sibling: a marker user turn (chip shows a 'Regenerate' tag), then a fresh
      // generation. The new version appends AFTER the current one, so BOTH stay in the lineage and
      // remain switchable via the version chips (Restore / redo) — neither is discarded. Like a
      // diverging send, the redo stash is cleared (this is a new branch).
      h.setChatAndFutureFor(pid, [...chat, { id: newId(), createdAt: Date.now(), role: 'user', text, action: 'Regenerate' }], [])
      turnBudgetStart.set(pid, Date.now())
      await runGeneration({ text, action: 'Regenerate' })
    },

    regenerateWithSkills: async (msgId, skillIds) => {
      if (get().generating) return
      const pid = get().activeId
      if (!pid) return
      // health signal: skills the user just REMOVED from this message's chip are a wrong-fit vote
      const edited = h.activeChatFor(pid).find((m) => m.id === msgId)
      const removed = (edited?.appliedSkillIds ?? []).filter((id) => !skillIds.includes(id))
      if (removed.length) {
        const ns = recordRemovals(get().skillStats, removed)
        set({ skillStats: ns })
        saveSkillStats(ns)
      }
      const labels = skillIds.length ? skillIds.join(', ') : null
      const text = labels
        ? `Regenerate the current model using exactly these mechanism patterns: ${labels}. Keep the design otherwise the same.`
        : `Regenerate the current model with NO mechanism-skill patterns. Keep the design otherwise the same.`
      // a marker user turn (chip shows an 'Adjust patterns' tag), then generate with the
      // corrected skillIds OVERRIDING retrieval for this turn. Shares the generating guard +
      // abortController via runGeneration; the new version carries the corrected appliedSkillIds.
      h.setChatAndFutureFor(pid, [...h.activeChatFor(pid), { id: newId(), createdAt: Date.now(), role: 'user', text, action: 'Adjust patterns' }], [])
      turnBudgetStart.set(pid, Date.now())
      await runGeneration({ text, action: 'Adjust patterns' }, NO_FIXES, { skillIds })
    },

    abortGeneration: (pid?: string) => {
      const target = pid ?? get().activeId
      if (target) h.genSession(target).abortController?.abort()
    },

    consumeAutoRefine: () => {
      // count the pass at START (here), not when the guard armed it: aborting BEFORE
      // the timer fires (Stop / project switch) clears the timer and never reaches
      // here, so it doesn't burn budget. (A pass whose compile is later superseded
      // mid-flight does consume its slot — that's the loop's termination guarantee.)
      const aid = get().pendingAutoRefineFor
      if (aid) autoRefinePass.set(aid, (autoRefinePass.get(aid) ?? 0) + 1)
      set({ pendingAutoRefineFor: null })
    },
  }
}

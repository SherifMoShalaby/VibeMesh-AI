import type { StoreApi } from 'zustand'
import type { VibeState, Session } from './store'
import type { ChatMessage, ScadParameter, ParamValues, CompileResult, Project } from '../types'
import { resolveBed, QUALITY_PRESETS } from '../types'
import { streamGenerate, toApiMessages, historyBudgetTokens, imageBudgetFor, estGenTokens, type SkillIssue } from '../lib/api'
import { clampStatedDimensions, dimDiscrepancies, geometryConverged } from '../lib/refineProxy'
import { buildAutoFixPrompt, structuralReport } from '../lib/compileReport'
import { hasDebugContract, interferenceIssue } from '../lib/interferenceProxy'
import { ComputeBudget } from '../lib/openscad/budget'
import { scoreCandidate, pickBestIndex, BEST_OF_N_COUNT, type CandidateSignals } from '../lib/bestOfN'
import { extractScadBlock, extractIntent, stripIntentLine, parseParameters } from '../lib/params'
import { degenerateReason, detectKitIntent } from '../lib/storeDecisions'
import { recordUses, recordRemovals, saveSkillStats } from '../lib/skillStats'
import { stlBBox } from '../lib/stl'
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
const MAX_AUTO_REFINE = 2 // total auto-refine passes per project
const autoRefinePass = new Map<string, number>()
// Previous refine-eligible compile's geometry CONTENT (volume + triangle count) per project — the
// baseline the SELF-RELATIVE convergence stop compares the current pass against. Lifetime-scoped like
// autoRefinePass; only read/written inside a refine sequence, which the lifetime cap bounds anyway.
const refinePrevGeom = new Map<string, { volume: number; triangles: number }>()

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
    ctx: { bed: { x: number; y: number; z: number }; stated: ReturnType<typeof clampStatedDimensions>['dimensions'] },
  ): Promise<{ full: string; skillReport: SkillIssue[]; appliedSkillIds: string[]; dropped: string[]; stopReason?: string }> {
    const n = BEST_OF_N_COUNT
    const reports = Array.from({ length: n }, () => ({ skillIds: [] as string[], dropped: [] as string[], report: [] as SkillIssue[] }))
    const stopReasons: (string | undefined)[] = Array.from({ length: n }, () => undefined)
    let done = 0
    h.writeSession(pid, { streamText: `Generating ${n} candidates, keeping the best…` })
    const fulls = await Promise.all(
      Array.from({ length: n }, (_, i) =>
        streamGenerate(engine, messages, { ...baseOpts, onDelta: () => {}, onSkillReport: (info) => { reports[i] = info }, onDone: (info) => { stopReasons[i] = info.stopReason } })
          // each candidate is a full paid call — meter it (a best-of-N turn shows N, not 1)
          .then((text) => { h.writeSession(pid, (cur) => ({ streamText: `Generated ${++done}/${n} candidates…`, genCalls: cur.genCalls + 1, genTokens: cur.genTokens + estGenTokens(text) })); return text })
          // A user Stop aborts every candidate's shared signal — let AbortError propagate (rejecting
          // Promise.all) so runGeneration's catch handles it as a Stop, instead of swallowing it to
          // '' which reads as a contract violation and silently restarts the whole generation.
          .catch((e) => { if (e instanceof DOMException && e.name === 'AbortError') throw e; return '' }),
      ),
    )
    const budget = new ComputeBudget({ wallMs: 60_000, maxRenders: n + 2 })
    const signals: CandidateSignals[] = []
    for (const text of fulls) {
      const { code, blockCount } = extractScadBlock(text)
      if (code === null || blockCount > 1) {
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
        }
      }
      signals.push({ hasScad: true, compileAttempted, compiled, degenerate, structuralIssues: structuralReport(code, params).issues.length, dimMismatches, fillRatio })
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
        // effort is capability-driven now (engines that declare reasoning levels), not a hardcoded
        // engine list — so a future effort-capable provider gets it with no code change here.
        effort: provider?.efforts?.length ? get().claudeEffort : undefined,
        context: { bed: { x: bed.x, y: bed.y, z: bed.z, label: bed.label }, kit: isKit, intent: priorIntent, skillIds: opts.skillIds, sourceHint },
      }
      // A2 — verifier-guided best-of-N: only on the FIRST attempt of a hard request (kit or image),
      // only when the user opted in (off by default), never on local engines or auto-fix re-entries.
      // The winner feeds the SAME downstream below; OFF → the single-stream path is unchanged.
      const useBestOfN = fixes.contract === 0 && fixes.geom === 0 && useUi.getState().bestOfN && !engine.startsWith('local:') && (isKit || latestImgs.length > 0)
      let full: string
      let stopReason: string | undefined
      if (useBestOfN) {
        const stated = clampStatedDimensions(priorIntent?.statedDimensions).dimensions
        const winner = await runBestOfN(pid, engine, messages, baseOpts, { bed: { x: bed.x, y: bed.y, z: bed.z }, stated })
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
      const { code, prose: rawProse, blockCount } = extractScadBlock(full)
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
      const contractViolated = code === null || blockCount > 1
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
          // assembly/mechanism faults = cheap client structural checks PLUS the retrieved
          // skills' validators (server-side, received via skillReport). The advisory
          // skillNote already shows them; here they also drive a BOUNDED auto-fix (gated on
          // the autoRepair toggle + the MAX_GEOM_FIX budget, so it can't loop).
          const assembly = [...structuralReport(code, params).issues, ...skillReport.flatMap((r) => r.issues)]
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
          if (canRepair && (degenerate || assembly.length)) {
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
            h.writeSession(pid, { compileNote: `Part rendered ${dims.minZ < 0 ? 'below' : 'above'} the bed — dropped onto z=0 for export.` })
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
          const stillReshaping = !geometryConverged(refinePrevGeom.get(aid), curGeom)
          const proxyWantsRefine = dimMismatch || stillReshaping
          if (curGeom) refinePrevGeom.set(aid, curGeom)
          if (
            triggerImages?.length &&
            provider?.vision &&
            !!eng &&
            !eng.startsWith('local:') &&
            useUi.getState().autoRepair &&
            aid &&
            proxyWantsRefine &&
            (autoRefinePass.get(aid) ?? 0) < MAX_AUTO_REFINE
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

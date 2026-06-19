/**
 * Local, privacy-preserving skill-outcome tracker. The quarantine flag in the skills registry was
 * a dead-man's switch with no operator — this gives it a signal WITHOUT a phone-home beacon: every
 * outcome is aggregated in this browser only (localStorage), payload is skill ids + counts, never
 * prompt or geometry. When a skill is applied a lot but the user keeps REMOVING it from the chip,
 * its health drops and we surface a "consider quarantining" recommendation (advisory — flipping the
 * server flag stays a deliberate code edit). Pure + deterministic; persistence is a thin wrapper.
 */

export interface SkillStat {
  uses: number // times this skill was applied to a generation
  removals: number // times the user removed it from the applied-patterns chip (a wrong-fit signal)
}
export type SkillStats = Record<string, SkillStat>

const empty = (): SkillStat => ({ uses: 0, removals: 0 })

/** Record that these skills were applied to a generation. Returns a NEW stats object. */
export function recordUses(stats: SkillStats, ids: string[]): SkillStats {
  if (!ids?.length) return stats
  const next: SkillStats = { ...stats }
  for (const id of ids) next[id] = { ...(next[id] ?? empty()), uses: (next[id]?.uses ?? 0) + 1 }
  return next
}

/** Record that the user removed these skills from the chip (an explicit wrong-fit signal). */
export function recordRemovals(stats: SkillStats, ids: string[]): SkillStats {
  if (!ids?.length) return stats
  const next: SkillStats = { ...stats }
  for (const id of ids) next[id] = { ...(next[id] ?? empty()), removals: (next[id]?.removals ?? 0) + 1 }
  return next
}

/** Health 0..1 (1 = never removed). Removal rate is the signal: applied often but cut often = unhealthy. */
export function skillHealth(stat: SkillStat): number {
  if (!stat || stat.uses <= 0) return 1
  return Math.max(0, 1 - stat.removals / stat.uses)
}

export interface QuarantineSuggestion {
  id: string
  health: number
  uses: number
  removals: number
  reason: string
}

/** Skills whose LOCAL health has dropped below `threshold` with enough samples to be meaningful. */
export function quarantineSuggestions(stats: SkillStats, opts: { minUses?: number; threshold?: number } = {}): QuarantineSuggestion[] {
  const minUses = opts.minUses ?? 5
  const threshold = opts.threshold ?? 0.6
  const out: QuarantineSuggestion[] = []
  for (const [id, stat] of Object.entries(stats ?? {})) {
    if (stat.uses < minUses) continue
    const health = skillHealth(stat)
    if (health < threshold) {
      out.push({ id, health, uses: stat.uses, removals: stat.removals, reason: `removed ${stat.removals}/${stat.uses} times — consider quarantining "${id}"` })
    }
  }
  return out.sort((a, b) => a.health - b.health)
}

/** The set of skill ids currently flagged unhealthy locally — for a chip hint. */
export function flaggedSkillIds(stats: SkillStats, opts?: { minUses?: number; threshold?: number }): Set<string> {
  return new Set(quarantineSuggestions(stats, opts).map((s) => s.id))
}

/* ── persistence (localStorage; small id→counts map, safe to keep out of IndexedDB) ── */
const KEY = 'vibemesh.skillStats.v1'

export function loadSkillStats(): SkillStats {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as SkillStats) : {}
  } catch {
    return {}
  }
}

export function saveSkillStats(stats: SkillStats): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(stats))
  } catch {
    /* storage unavailable — telemetry is best-effort */
  }
}

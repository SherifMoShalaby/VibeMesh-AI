import type { CatalogEntry, ProviderInfo } from '../lib/api'

/* ────────────────────────────────────────────────────────────────
   engineCards — the pure selector behind the Engines marketplace UI.

   It folds the two populations the Engines panel deals with into ONE
   normalized list of cards:
     · the live engines from /api/health (built-ins + saved connections),
       with the per-model `local:*` entries collapsed into a single
       "Local LLM" row (the collapse that used to live inline in
       EnginesModal), and
     · the addable catalog entries from /api/catalog that don't yet have
       a connection (so a provider shows up once — as an addable card
       until connected, then as a live card).

   Keeping this pure (no React, no network) means it is unit-tested in
   the node env and there is a SINGLE source of truth for the local
   collapse + the in-use match, so the card grid and any legacy row
   render can never drift. See docs/ENGINES-DIRECTORY-UI-DESIGN.md.
   ──────────────────────────────────────────────────────────────── */

/** A live engine row carries the optional `useId` the "Use" button targets (the collapsed
 *  Local row points it at the first local model). Mirrors the old inline `Row` type. */
export type EngineRowData = ProviderInfo & { useId?: string }

/** addable  — a catalog provider with no connection yet → the "+" card / connect form
 *  needs-setup — a known engine present but not usable yet (no key / not logged in / no URL)
 *  connected  — usable, but not the active engine → offers "Use"
 *  degraded   — a credential IS present but the last upstream call failed (dead/over-quota key);
 *               renders distinctly from `connected` so a green dot never lies (SEC-4)
 *  in-use     — the active engine */
export type CardState = 'addable' | 'needs-setup' | 'connected' | 'degraded' | 'in-use'

/** The method axis that drives the left rail. `custom` splits out the bring-your-own-endpoint
 *  catalog entries (catalogId `custom-*`) from the keyed providers. */
export type CardMethod = 'cli' | 'apikey' | 'local' | 'custom'

export interface UnifiedProvider {
  /** stable React key + identity */
  key: string
  label: string
  state: CardState
  method: CardMethod
  /** present when state !== 'addable' — the live engine row (drives the connected/setup drawer) */
  provider?: EngineRowData
  /** present when state === 'addable' — the catalog entry (drives the connect drawer) */
  catalogEntry?: CatalogEntry
  /** model id / protocol line shown under the title */
  subtitle: string
  /** the 2-line description source */
  detail: string
  /** SEC-4: the credential is present AND the last upstream call succeeded (a verified-connected
   *  provider, as opposed to configured-but-never-called). Lets the UI render the two distinctly. */
  verified?: boolean
  /** SEC-4: when state === 'degraded', the human reason the dot is not green (quota / dead key). */
  degradedReason?: string
  /** normalized so connected (ProviderInfo.contextWindow) and addable
   *  (CatalogEntry.caps.contextWindow — a different field) read the same */
  contextWindow?: number
  maxOutput?: number
}

const isLocalId = (id: string): boolean => id.startsWith('local:')

/** Collapse the per-model `local:*` engines into a single "Local LLM" row, leaving every other
 *  provider untouched and in order. Extracted verbatim from the old EnginesModal inline logic so
 *  the synthetic row (id `local`, useId = first local id, model list, count detail) is identical. */
export function collapseProviders(providers: ProviderInfo[]): EngineRowData[] {
  const rows: EngineRowData[] = []
  const localProviders = providers.filter((p) => isLocalId(p.id))
  let localDone = false
  for (const p of providers) {
    if (isLocalId(p.id)) {
      if (!localDone) {
        rows.push({
          ...p, // carries group / baseUrl / connect from the first local entry
          id: 'local',
          useId: p.id, // selecting "Use" targets the first local model
          label: 'Local LLM',
          detail: `${p.detail} — ${localProviders.length} model(s)`,
          models: localProviders.map((m) => ({ id: m.model ?? m.id, label: m.model ?? m.id })),
        })
        localDone = true
      }
    } else {
      rows.push(p)
    }
  }
  return rows
}

const methodOf = (p: { group?: ProviderInfo['group']; catalogId?: string }): CardMethod =>
  p.catalogId?.startsWith('custom-') ? 'custom' : (p.group ?? 'apikey')

/** Is this live row the active engine? Mirrors the EngineRow `isActive` check: an exact id match,
 *  or — for the collapsed Local row — any `local:*` engine id. */
function isInUse(row: EngineRowData, engine: string | null | undefined): boolean {
  if (!engine) return false
  if (engine === row.id) return true
  return row.group === 'local' && isLocalId(engine)
}

function fromProvider(row: EngineRowData, engine: string | null | undefined): UnifiedProvider {
  // SEC-4: a present-but-dead/over-quota credential renders `degraded`, not `connected` — the dot
  // must reflect VALIDITY, not just key presence. The active engine still shows in-use even if its
  // last call degraded (the user picked it; the drawer carries the reason).
  const degraded = row.available && row.connectionState === 'degraded'
  const verified = row.available && row.connectionState === 'verified'
  const state: CardState = isInUse(row, engine)
    ? 'in-use'
    : degraded
      ? 'degraded'
      : row.available
        ? 'connected'
        : 'needs-setup'
  return {
    key: row.id,
    label: row.label,
    state,
    method: methodOf(row),
    provider: row,
    subtitle: row.id === 'claude-code'
      ? (row.models?.[0]?.label ?? row.model ?? '')
      : row.model ?? (row.models?.length ? `${row.models.length} models` : ''),
    // a degraded provider shows its reason inline so "why is it red" needs no extra click
    detail: degraded && row.connectionReason ? `${row.detail} — ${row.connectionReason}` : row.detail,
    verified,
    degradedReason: degraded ? row.connectionReason : undefined,
    contextWindow: row.contextWindow,
    maxOutput: row.maxOutput ?? row.outputReservation,
  }
}

function fromCatalog(c: CatalogEntry): UnifiedProvider {
  const proto = c.protocol === 'anthropic' ? 'Anthropic' : 'OpenAI'
  return {
    key: `catalog:${c.id}`,
    label: c.label,
    state: 'addable',
    method: c.id.startsWith('custom-') ? 'custom' : 'apikey',
    catalogEntry: c,
    subtitle: c.defaultModel || `${proto}-compatible`,
    detail: c.custom ? 'Bring your own OpenAI- or Anthropic-compatible endpoint.' : (c.connect.urlLabel || `${proto}-compatible API.`),
    contextWindow: c.caps?.contextWindow,
    maxOutput: c.caps?.maxOutputTokens,
  }
}

/** Rank for the status-priority default sort. */
const STATE_RANK: Record<CardState, number> = { 'in-use': 0, connected: 1, degraded: 2, 'needs-setup': 3, addable: 4 }

/**
 * Fold the live providers + the addable catalog into one normalized, ordered card list.
 *
 * Ordering (the default "Status" sort): in-use → connected → needs-setup → addable, then
 * alphabetical by label within each tier, with a built-in sorting before a `conn:*` of the same
 * label so the active engine floats to the top-left with zero interaction.
 *
 * Addable rule: a catalog entry is offered only when no connection was created from it
 * (`custom-*` are always addable — you may want several bring-your-own endpoints).
 */
export function deriveCards(
  health: { providers?: ProviderInfo[] } | null | undefined,
  catalog: CatalogEntry[],
  engine: string | null | undefined,
): UnifiedProvider[] {
  const providers = health?.providers ?? []
  const live = collapseProviders(providers).map((row) => fromProvider(row, engine))

  // catalogIds that already have a connection → those catalog entries are not "addable"
  const connectedCatalogIds = new Set(providers.map((p) => p.catalogId).filter(Boolean) as string[])
  const addable = catalog.filter((c) => c.custom || !connectedCatalogIds.has(c.id)).map(fromCatalog)

  const cards = [...live, ...addable]
  return cards.sort((a, b) => {
    if (STATE_RANK[a.state] !== STATE_RANK[b.state]) return STATE_RANK[a.state] - STATE_RANK[b.state]
    const byLabel = a.label.localeCompare(b.label)
    if (byLabel !== 0) return byLabel
    // built-in (no conn: prefix) before a same-label connection
    const aConn = a.provider?.id.startsWith('conn:') ? 1 : 0
    const bConn = b.provider?.id.startsWith('conn:') ? 1 : 0
    return aConn - bConn
  })
}

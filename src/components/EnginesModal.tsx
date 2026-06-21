import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useStore } from '../state/store'
import { useUi } from '../state/ui'
import { connectEngine, testEngine, fetchCatalog, saveConnection, removeConnection, discoverModels, type ProviderInfo, type CatalogEntry } from '../lib/api'
import { deriveCards, type CardMethod, type EngineRowData, type UnifiedProvider } from './engineCards'
import { useFocusTrap } from '../lib/useFocusTrap'
import { IconX, IconRefresh, DChip, DPlus, DSearch } from './icons'

/** Compact token formatter for the specs line: 1000000 → "1M", 200000 → "200k", 128000 → "128k". */
function fmtTokens(n: number): string {
  if (n >= 1000000) return n % 1000000 === 0 ? `${n / 1000000}M` : `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

/** Up-to-two-letter monogram for the card's icon tile (no brand logos — see the design doc). */
function initials(label: string): string {
  const words = label.split(/[^A-Za-z0-9]+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return (words[0] ?? '?').slice(0, 2).toUpperCase()
}

// the connection-method rail (left sidebar). Each row carries the teaching hint as a tooltip, so the
// method guidance the panel used to print as section headers isn't lost.
const METHODS: Array<{ key: CardMethod; label: string; hint: string }> = [
  { key: 'cli', label: 'Subscription · CLI', hint: 'Use an app you already pay for — no key to paste.' },
  { key: 'apikey', label: 'API key', hint: 'Connect with a key from the provider console.' },
  { key: 'local', label: 'Local', hint: 'Run a model on your own machine — set the server URL.' },
  { key: 'custom', label: 'Custom', hint: 'Bring your own OpenAI- or Anthropic-compatible endpoint.' },
]

export default function EnginesModal() {
  const enginesOpen = useUi((s) => s.enginesOpen)
  const setEnginesOpen = useUi((s) => s.setEnginesOpen)
  const health = useStore((s) => s.health)
  const engine = useStore((s) => s.engine)
  const refreshHealth = useStore((s) => s.refreshHealth)
  const [scanning, setScanning] = useState(false)
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(dialogRef, enginesOpen)

  // load the "Add a provider" catalog once, the first time the panel opens
  useEffect(() => {
    if (enginesOpen && catalog.length === 0) void fetchCatalog().then(setCatalog)
  }, [enginesOpen, catalog.length])

  useEffect(() => {
    if (!enginesOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setEnginesOpen(false)
      }
    }
    // capture phase so the viewport's Esc-to-deselect never sees it
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [enginesOpen, setEnginesOpen])

  if (!enginesOpen) return null

  // One source of truth: deriveCards collapses the per-model local:* entries, computes each card's
  // in-use/connected/needs-setup/addable state, dedupes the addable catalog, and orders by status.
  const cards = deriveCards(health, catalog, engine)

  const rescan = async () => {
    setScanning(true)
    await refreshHealth()
    setScanning(false)
  }

  // close ONLY on a click that lands directly on the backdrop — robust against a child button
  // (Add/Remove) unmounting mid-handler, which can make a bubbled click fall through to the scrim
  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) setEnginesOpen(false) }}>
      <div ref={dialogRef} tabIndex={-1} className="modal modal-wide" role="dialog" aria-modal="true" aria-label="AI engines" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="mh-icon"><DChip /></span>
          <div className="mh-text">
            <h2>AI engines</h2>
            <p>Connect whichever you have — examples, sliders and exports all work without one.</p>
          </div>
          <button className="icon-btn-sm" onClick={() => setEnginesOpen(false)} aria-label="Close">
            <IconX />
          </button>
        </div>

        <div className="modal-body dir-body">
          <DirectoryShell cards={cards} onChanged={refreshHealth} onRescan={rescan} scanning={scanning} />
        </div>

        <div className="modal-foot">
          <span className="modal-hint">Keys are saved on this computer only — they never leave it.</span>
        </div>
      </div>
    </div>
  )
}

/** The 2-pane Directory body: a method-nav rail + a search/sort toolbar over the card grid. Owns the
 *  ephemeral view state (query / active method / sort) — kept local so it never leaks across opens. */
function DirectoryShell({ cards, onChanged, onRescan, scanning }: {
  cards: UnifiedProvider[]
  onChanged: (providers?: ProviderInfo[]) => Promise<void>
  onRescan: () => Promise<void>
  scanning: boolean
}) {
  const [query, setQuery] = useState('')
  const [activeMethod, setActiveMethod] = useState<'all' | CardMethod>('all')
  const [sortKey, setSortKey] = useState<'status' | 'az'>('status')
  const searchRef = useRef<HTMLInputElement>(null)

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const card of cards) c[card.method] = (c[card.method] ?? 0) + 1
    return c
  }, [cards])

  // if the active method empties out (e.g. its only provider got connected/removed), fall back to All
  // — derived (not stored) so it self-corrects without a setState-in-effect
  const effectiveMethod = activeMethod !== 'all' && !counts[activeMethod] ? 'all' : activeMethod

  const visible = useMemo(() => {
    let list = effectiveMethod === 'all' ? cards : cards.filter((c) => c.method === effectiveMethod)
    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter((c) => {
        const hay = `${c.label} ${c.subtitle} ${c.detail} ${c.catalogEntry?.id ?? c.provider?.id ?? ''}`.toLowerCase()
        return hay.includes(q)
      })
    }
    // deriveCards already returns status order; only re-sort for A–Z
    return sortKey === 'az' ? [...list].sort((a, b) => a.label.localeCompare(b.label)) : list
  }, [cards, effectiveMethod, query, sortKey])

  // if a filter removes whatever held focus, the focus trap would orphan it on <body> — pull focus
  // back to the search box so keyboard users keep their place
  useEffect(() => {
    if (document.activeElement === document.body) searchRef.current?.focus()
  }, [visible])

  const filtering = query.trim().length > 0 || effectiveMethod !== 'all'

  return (
    <>
      <nav className="dir-nav" aria-label="Connection method">
        <button className={`dir-nav-item${effectiveMethod === 'all' ? ' on' : ''}`} aria-current={effectiveMethod === 'all'} onClick={() => setActiveMethod('all')}>
          <span className="dnav-label">All</span>
          <span className="dnav-ct">{cards.length}</span>
        </button>
        {METHODS.filter((m) => counts[m.key]).map((m) => (
          <button
            key={m.key}
            className={`dir-nav-item${effectiveMethod === m.key ? ' on' : ''}`}
            aria-current={effectiveMethod === m.key}
            title={m.hint}
            onClick={() => setActiveMethod(m.key)}
          >
            <span className="dnav-label">{m.label}</span>
            <span className="dnav-ct">{counts[m.key]}</span>
          </button>
        ))}
      </nav>

      <div className="dir-main">
        <div className="dir-toolbar">
          <div className="dir-search">
            <DSearch />
            <input
              ref={searchRef}
              type="text"
              aria-label="Search engines"
              placeholder="Search engines"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button className="dir-search-x" aria-label="Clear search" onClick={() => setQuery('')}>
                <IconX />
              </button>
            )}
          </div>
          <span className="dir-count" role="status" aria-live="polite">{filtering ? `${visible.length} of ${cards.length}` : ''}</span>
          <button className="btn btn-ghost sm dir-sort" onClick={() => setSortKey((k) => (k === 'status' ? 'az' : 'status'))} title="Change sort order">
            Sort: {sortKey === 'status' ? 'Status' : 'A–Z'}
          </button>
          <button className="icon-btn-sm dir-refresh" onClick={() => void onRescan()} disabled={scanning} aria-label="Look again" title="Re-scan for engines">
            <IconRefresh />
          </button>
        </div>

        {visible.length === 0 ? (
          <div className="dir-empty" role="status">
            {query.trim() ? (
              <>No engines match “{query.trim()}”. <button className="link-btn" onClick={() => { setQuery(''); setActiveMethod('all') }}>Clear</button></>
            ) : cards.length === 0 ? (
              'No engines detected — try “Look again”.'
            ) : (
              'No engines in this category.'
            )}
          </div>
        ) : (
          <EngineCardGrid cards={visible} onChanged={onChanged} />
        )}
      </div>
    </>
  )
}

/** The responsive card grid. Owns which card is expanded (one at a time) so the drawer never
 *  stacks, and re-seats focus on collapse via each card's trigger ref. */
function EngineCardGrid({ cards, onChanged }: { cards: UnifiedProvider[]; onChanged: (providers?: ProviderInfo[]) => Promise<void> }) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const toggle = (key: string) => setOpenKey((prev) => (prev === key ? null : key))

  return (
    <div className="engine-grid">
      {cards.map((card) => (
        <EngineCard key={card.key} card={card} expanded={openKey === card.key} onToggle={() => toggle(card.key)} onChanged={onChanged} />
      ))}
    </div>
  )
}

/** The card "face" shared by every state — monogram, title, subtitle, the slotted corner control,
 *  the 2-line description, and the capability specs. Non-interactive (a div); only the slotted
 *  corner and the actions/drawer below carry buttons. */
function CardFace({ card, corner }: { card: UnifiedProvider; corner: ReactNode }) {
  const genTimeoutMs = useStore((s) => s.health?.genTimeoutMs)
  return (
    <>
      <div className="ec-head">
        <span className="engine-mono" aria-hidden>{initials(card.label)}</span>
        <div className="ec-titles">
          <span className="ec-title">{card.label}</span>
          {card.subtitle && <span className="ec-sub">{card.subtitle}</span>}
        </div>
        <span className="ec-corner">{corner}</span>
      </div>
      {card.detail && <p className="ec-desc clamp-2">{card.detail}</p>}
      {card.contextWindow != null && (
        <div className="ec-specs">
          Context {fmtTokens(card.contextWindow)}
          {card.maxOutput != null && <> · writes {fmtTokens(card.maxOutput)}</>}
          {card.state !== 'addable' && genTimeoutMs != null && <> · times out after {Math.round(genTimeoutMs / 60000)} min</>}
        </div>
      )}
    </>
  )
}

/** Re-seat focus to the control that opened a drawer when it collapses. useFocusTrap only restores
 *  focus when the whole dialog unmounts, but the drawer mounts/unmounts inside the persistent
 *  dialog, so without this a collapse orphans focus to <body>. */
function useCollapseFocus(expanded: boolean) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const wasExpanded = useRef(expanded)
  useEffect(() => {
    if (wasExpanded.current && !expanded) triggerRef.current?.focus()
    wasExpanded.current = expanded
  }, [expanded])
  return triggerRef
}

type CardProps = {
  card: UnifiedProvider
  expanded: boolean
  onToggle: () => void
  onChanged: (providers?: ProviderInfo[]) => Promise<void>
}

/** Dispatch to the right card by state (keeps hooks unconditional in each leaf). */
function EngineCard(props: CardProps) {
  return props.card.state === 'addable' ? <AddableCard {...props} /> : <LiveCard {...props} />
}

/** A catalog provider with no connection yet — the "+" card whose drawer is the connect form. */
function AddableCard({ card, expanded, onToggle, onChanged }: CardProps) {
  const triggerRef = useCollapseFocus(expanded)
  return (
    <div className="engine-card">
      <CardFace
        card={card}
        corner={
          <button ref={triggerRef} className="ec-corner-btn" aria-label={`Connect ${card.label}`} aria-expanded={expanded} onClick={onToggle}>
            <DPlus />
          </button>
        }
      />
      {expanded && <AddDrawer entry={card.catalogEntry!} onAdded={onChanged} onDone={onToggle} />}
    </div>
  )
}

/** A live engine (built-in or saved connection) — in-use / connected / needs-setup. */
function LiveCard({ card, expanded, onToggle, onChanged }: CardProps) {
  const setEngine = useStore((s) => s.setEngine)
  const engine = useStore((s) => s.engine)
  const triggerRef = useCollapseFocus(expanded)

  const provider = card.provider!
  const isActive = card.state === 'in-use'
  const isLocal = provider.group === 'local'

  // which local model the face "Use" targets — lifted here so the drawer's dropdown and the face
  // button share one selection (preserves the old EngineRow behavior)
  const localModels = isLocal ? (provider.models ?? []) : []
  const initialLocalModel = engine?.startsWith('local:')
    ? engine.slice(6)
    : provider.useId?.startsWith('local:')
      ? provider.useId.slice(6)
      : localModels[0]?.id ?? ''
  const [localModel, setLocalModel] = useState(initialLocalModel)
  const useTargetId = isLocal && localModel ? `local:${localModel}` : (provider.useId ?? provider.id)
  const onLocalModelChange = (m: string) => {
    setLocalModel(m)
    if (isActive) setEngine(`local:${m}`)
  }

  let corner: ReactNode
  if (isActive) corner = <span className="engine-active-badge">In use</span>
  else if (card.state === 'connected') corner = <i className="dot ok" aria-hidden title="Connected" />
  else corner = (
    <button ref={triggerRef} className="ec-corner-btn" aria-label={`Set up ${card.label}`} aria-expanded={expanded} onClick={onToggle}>
      <DPlus />
    </button>
  )

  const configurable = card.state === 'connected' || isActive

  return (
    <div className={`engine-card${isActive ? ' on' : ''}`}>
      <CardFace card={card} corner={corner} />
      <div className="ec-actions">
        {card.state === 'connected' && (
          <button className="btn btn-primary sm" onClick={() => setEngine(useTargetId)} title="Design with this engine">
            Use
          </button>
        )}
        {configurable && (
          <button ref={triggerRef} className="btn btn-ghost sm" aria-expanded={expanded} onClick={onToggle}>
            {expanded ? 'Close' : 'Configure'}
          </button>
        )}
      </div>
      {expanded && (
        <ProviderDrawer
          provider={provider}
          localModel={localModel}
          onLocalModelChange={onLocalModelChange}
          onChanged={onChanged}
        />
      )}
    </div>
  )
}

/** Drawer body for a catalog (addable) card — the AddConnection form scoped to one entry (no
 *  picker: the entry is fixed by card identity). */
function AddDrawer({ entry, onAdded, onDone }: {
  entry: CatalogEntry
  onAdded: (providers?: ProviderInfo[]) => Promise<void>
  onDone: () => void
}) {
  const setEngine = useStore((s) => s.setEngine)
  const [label, setLabel] = useState(entry.label)
  const [model, setModel] = useState(entry.defaultModel)
  const [baseUrl, setBaseUrl] = useState(entry.baseUrl)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [discovered, setDiscovered] = useState<string[]>([])

  // live model discovery: query the provider with the typed key and merge into the picker datalist
  const fetchModels = async () => {
    setBusy(true)
    setNote(null)
    const models = await discoverModels({ protocol: entry.protocol, baseUrl: baseUrl.trim() || entry.baseUrl, secret: key.trim() || undefined })
    setDiscovered(models)
    if (models.length === 0) setNote('No models returned — check the key and base URL.')
    setBusy(false)
  }

  const submit = async () => {
    setBusy(true)
    setNote(null)
    const result = await saveConnection({
      catalogId: entry.id,
      label: label.trim() || undefined,
      model: model.trim() || undefined,
      baseUrl: baseUrl.trim() || undefined,
      secret: key.trim() || undefined,
    })
    if (result.ok) {
      await onAdded(result.providers)
      if (result.id) setEngine(`conn:${result.id}`) // use the new connection straight away
      onDone() // the card identity changes (addable → connected); collapse cleanly
    } else {
      setNote(result.message ?? 'Could not add the connection.')
      setBusy(false)
    }
  }

  const models = [...new Set([...discovered, ...entry.models])]

  return (
    <div className="ec-drawer">
      <label className="add-field">
        <span>Name</span>
        <input type="text" aria-label="Connection name" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={entry.label} />
      </label>
      {entry.custom && (
        <label className="add-field">
          <span>Base URL</span>
          <input type="text" aria-label="Base URL" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://…/v1" />
        </label>
      )}
      <label className="add-field">
        <span>Model</span>
        <input type="text" aria-label="Model" list={models.length ? `models-${entry.id}` : undefined} value={model} onChange={(e) => setModel(e.target.value)} placeholder={entry.defaultModel || 'model id'} />
        {models.length > 0 && <datalist id={`models-${entry.id}`}>{models.map((m) => <option key={m} value={m} />)}</datalist>}
      </label>
      <label className="add-field">
        <span>API key</span>
        <input
          type="password"
          aria-label="API key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={entry.connect.placeholder}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit() }}
        />
      </label>
      <p className="ec-privacy">Saved on this computer only — it never leaves it.</p>
      <div className="add-actions">
        <button className="btn btn-primary sm" onClick={() => void submit()} disabled={busy || !model.trim() || (entry.custom && !baseUrl.trim())}>
          {busy ? 'Adding…' : 'Add connection'}
        </button>
        <button className="btn btn-ghost sm" onClick={() => void fetchModels()} disabled={busy} title="Ask the provider for its live model list (uses the key above)">
          {busy ? '…' : 'Fetch models'}
        </button>
        {discovered.length > 0 && <span className="engine-row-detail">{discovered.length} model(s) found</span>}
        {entry.connect.url && (
          <a className="engine-link" href={entry.connect.url} target="_blank" rel="noreferrer">{entry.connect.urlLabel} ↗</a>
        )}
      </div>
      {note && <div className="engine-note err" role="status">{note}</div>}
    </div>
  )
}

/** Drawer body for a live engine (built-in or saved connection) — the connect form when not yet
 *  usable, the model/effort config when it is, plus Test / Disconnect / Remove. */
function ProviderDrawer({ provider, localModel, onLocalModelChange, onChanged }: {
  provider: EngineRowData
  localModel: string
  onLocalModelChange: (m: string) => void
  onChanged: (providers?: ProviderInfo[]) => Promise<void>
}) {
  const genTimeoutMs = useStore((s) => s.health?.genTimeoutMs)
  const claudeModel = useStore((s) => s.claudeModel)
  const setClaudeModel = useStore((s) => s.setClaudeModel)
  const claudeEffort = useStore((s) => s.claudeEffort)
  const setClaudeEffort = useStore((s) => s.setClaudeEffort)
  const kimiModel = useStore((s) => s.kimiModel)
  const setKimiModel = useStore((s) => s.setKimiModel)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  const isLocal = provider.group === 'local'
  // local URL is always editable (pre-filled with the current value); start from the server's baseUrl
  const [urlValue, setUrlValue] = useState(provider.baseUrl ?? '')
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrlValue(provider.baseUrl ?? '')
  }, [provider.baseUrl])

  // save an API key (anthropic / kimi connect form)
  const save = async () => {
    if (!provider.connect || !value.trim()) return
    setBusy(true)
    setNote(null)
    const result = await connectEngine(provider.connect.envKey, value.trim())
    if (result.ok && result.providers) {
      await onChanged(result.providers)
      setValue('')
      const test = await testEngine(provider.id)
      setNote({ ok: test.ok, text: test.ok ? `Connected. ${test.message}` : test.message })
    } else {
      setNote({ ok: false, text: result.message ?? 'Could not save.' })
    }
    setBusy(false)
  }

  // apply the local server URL (always available, even while a server is answering)
  const applyUrl = async () => {
    if (!provider.connect) return
    setBusy(true)
    setNote(null)
    const result = await connectEngine(provider.connect.envKey, urlValue.trim())
    if (result.ok && result.providers) {
      await onChanged(result.providers)
      const test = await testEngine('local')
      // the URL saved either way — if nothing's answering yet (server not started), say so without
      // reading as a failure, since setting the URL ahead of starting the server is a real workflow
      setNote({ ok: test.ok, text: test.ok ? test.message : `Saved. ${test.message}` })
    } else {
      setNote({ ok: false, text: result.message ?? 'Could not save the URL.' })
    }
    setBusy(false)
  }

  const runTest = async () => {
    setBusy(true)
    setNote(null)
    const result = await testEngine(provider.id)
    setNote({ ok: result.ok, text: result.message })
    setBusy(false)
  }

  const disconnect = async () => {
    if (!provider.connect) return
    setBusy(true)
    const result = await connectEngine(provider.connect.envKey, '')
    if (result.providers) await onChanged(result.providers)
    setNote(null)
    setBusy(false)
  }

  // a marketplace connection: Remove deletes it entirely (metadata + key), unlike Disconnect which
  // only clears a built-in engine's key. onChanged re-selects an available engine if it was active.
  const removeConn = async () => {
    if (!provider.connection) return
    setBusy(true)
    const result = await removeConnection(provider.id.replace(/^conn:/, ''))
    if (result.providers) await onChanged(result.providers)
    setNote(null)
    setBusy(false)
  }

  // non-local model dropdown binds kimi↔kimiModel, else claude-code↔claudeModel. `anthropic` has no
  // `models` in providerStatus, so showModels keeps it out of the model dropdown entirely (effort only).
  const modelValue = provider.id === 'kimi' ? kimiModel : claudeModel
  const onModelChange = provider.id === 'kimi' ? setKimiModel : setClaudeModel
  const showModels = (provider.models?.length ?? 0) > 0 && (isLocal || provider.id === 'claude-code' || provider.id === 'kimi')
  const showEfforts = provider.available && (provider.efforts?.length ?? 0) > 0
  const canRemove = !!provider.connection
  const canDisconnect = provider.available && !!provider.connect && !isLocal && !provider.connection

  return (
    <div className="ec-drawer">
      {/* model + effort settings for a connected engine */}
      {provider.available && (showModels || showEfforts) && (
        <div className="engine-config">
          {showModels && (
            <label className="engine-model-row">
              <span>Model</span>
              {isLocal ? (
                <select aria-label={`${provider.label} model`} value={localModel} onChange={(e) => onLocalModelChange(e.target.value)}>
                  {provider.models!.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              ) : (
                <select aria-label={`${provider.label} model`} value={modelValue} onChange={(e) => onModelChange(e.target.value)}>
                  {provider.models!.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              )}
            </label>
          )}
          {showEfforts && (
            <label className="engine-model-row">
              <span>Effort</span>
              <select aria-label={`${provider.label} effort`} value={claudeEffort} onChange={(e) => setClaudeEffort(e.target.value)}>
                {provider.efforts!.map((e) => (
                  <option key={e.id} value={e.id}>{e.label}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      {provider.available && (provider.efforts?.length ?? 0) > 0 && (
        <div className="engine-row-detail engine-specs-note">
          Higher effort means a longer wait before the first token{genTimeoutMs != null && <> (currently {Math.round(genTimeoutMs / 60000)} min before it gives up)</>} — set <code>VIBEMESH_GEN_TIMEOUT_MS</code> to wait longer.
        </div>
      )}

      {/* local server URL — always editable so you can point it at a server before starting it */}
      {isLocal && provider.connect && (
        <div className="engine-connect">
          <input
            type="text"
            aria-label="Local LLM base URL"
            placeholder={provider.connect.placeholder}
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void applyUrl() }}
          />
          <button className="btn btn-primary sm" onClick={() => void applyUrl()} disabled={busy || !urlValue.trim()}>
            {busy ? '…' : 'Apply'}
          </button>
          <a className="engine-link" href={provider.connect.url} target="_blank" rel="noreferrer">
            {provider.connect.urlLabel} ↗
          </a>
        </div>
      )}

      {provider.id === 'claude-code' && !provider.available && (
        <div className="engine-row-detail">
          Install Claude Code, then run <code>claude</code> in a terminal and use <code>/login</code>. Re-scan after.
        </div>
      )}

      {/* API-key connect form (anthropic / kimi when not yet connected) */}
      {provider.connect && !provider.available && !isLocal && (
        <>
          <div className="engine-connect">
            <input
              type="password"
              aria-label={`${provider.label} API key`}
              placeholder={provider.connect.placeholder}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void save() }}
            />
            <button className="btn btn-primary sm" onClick={() => void save()} disabled={busy || !value.trim()}>
              {busy ? '…' : 'Connect'}
            </button>
            <a className="engine-link" href={provider.connect.url} target="_blank" rel="noreferrer">
              {provider.connect.urlLabel} ↗
            </a>
          </div>
          <p className="ec-privacy">Saved on this computer only — it never leaves it.</p>
        </>
      )}

      <div className="ec-drawer-actions">
        <button
          className="btn btn-ghost sm"
          onClick={() => void runTest()}
          // nothing to test on an API-key engine with no key yet; local re-probes its server and the
          // CLI engine reports a clear "not found", so allow those
          disabled={busy || (!provider.available && !isLocal && !!provider.connect)}
          title={!provider.available && !isLocal && !!provider.connect ? `Add your ${provider.connect.envKey} first` : 'Send a 1-token ping to check the connection'}
        >
          Test
        </button>
        {canDisconnect && (
          <button className="btn btn-ghost sm" onClick={() => void disconnect()} disabled={busy} title={`Clear ${provider.connect!.envKey}`}>
            Disconnect
          </button>
        )}
        {canRemove && (
          <button className="btn btn-ghost sm" onClick={() => void removeConn()} disabled={busy} title="Remove this connection">
            Remove
          </button>
        )}
      </div>

      {note && <div className={`engine-note ${note.ok ? 'ok' : 'err'}`} role="status">{note.text}</div>}
    </div>
  )
}

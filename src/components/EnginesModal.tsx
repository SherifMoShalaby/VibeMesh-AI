import { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { useUi } from '../state/ui'
import { connectEngine, testEngine, type ProviderInfo } from '../lib/api'
import { useFocusTrap } from '../lib/useFocusTrap'
import { IconX, IconRefresh, DChip } from './icons'

type Row = ProviderInfo & { useId?: string }

// logical groupings, rendered in order; engines self-declare their `group`
const SECTIONS: Array<{ key: NonNullable<ProviderInfo['group']>; title: string; hint: string }> = [
  { key: 'cli', title: 'Subscription · CLI login', hint: 'Use an app you already pay for — no key to paste.' },
  { key: 'apikey', title: 'API key', hint: 'Connect with a key from the provider console.' },
  { key: 'local', title: 'Local', hint: 'Run a model on your own machine — set the server URL below.' },
]

export default function EnginesModal() {
  const enginesOpen = useUi((s) => s.enginesOpen)
  const setEnginesOpen = useUi((s) => s.setEnginesOpen)
  const health = useStore((s) => s.health)
  const refreshHealth = useStore((s) => s.refreshHealth)
  const [scanning, setScanning] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(dialogRef, enginesOpen)

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

  // collapse the per-model local entries into one row with a model picker
  const providers: Row[] = []
  let localDone = false
  const localProviders = (health?.providers ?? []).filter((p) => p.id.startsWith('local:'))
  for (const p of health?.providers ?? []) {
    if (p.id.startsWith('local:')) {
      if (!localDone) {
        providers.push({
          ...p, // carries group / baseUrl / connect from the first local entry
          id: 'local',
          useId: p.id, // selecting "use" targets the first local model
          label: 'Local LLM',
          detail: `${p.detail} — ${localProviders.length} model(s)`,
          models: localProviders.map((m) => ({ id: m.model!, label: m.model! })),
        })
        localDone = true
      }
    } else {
      providers.push(p)
    }
  }

  // bucket by group, preserving provider order within each section
  const grouped = SECTIONS.map((s) => ({ ...s, rows: providers.filter((p) => (p.group ?? 'apikey') === s.key) })).filter(
    (s) => s.rows.length > 0,
  )

  const rescan = async () => {
    setScanning(true)
    await refreshHealth()
    setScanning(false)
  }

  return (
    <div className="scrim" onClick={() => setEnginesOpen(false)}>
      <div ref={dialogRef} tabIndex={-1} className="modal" role="dialog" aria-modal="true" aria-label="AI engines" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="mh-icon"><DChip /></span>
          <div className="mh-text">
            <h2>AI engines</h2>
            <p>The assistant that designs parts for you.</p>
          </div>
          <button className="icon-btn-sm" onClick={() => setEnginesOpen(false)} aria-label="Close">
            <IconX />
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-intro">
            An AI engine is the assistant that designs parts for you. Connect whichever you have — everything else in
            the app (examples, sliders, exports) works without one.
          </p>
          {grouped.map((section) => (
            <div className="engine-section" key={section.key}>
              <div className="engine-section-head">
                <span className="engine-section-title">{section.title}</span>
                <span className="engine-section-hint">{section.hint}</span>
              </div>
              {section.rows.map((p) => (
                <EngineRow key={p.id} provider={p} />
              ))}
            </div>
          ))}
        </div>

        <div className="modal-foot">
          <span className="modal-hint">Keys are saved on this computer only — they never leave it.</span>
          <button className="btn btn-ghost" onClick={rescan} disabled={scanning}>
            {scanning ? 'Looking…' : <><IconRefresh /> Look again</>}
          </button>
        </div>
      </div>
    </div>
  )
}

function EngineRow({ provider }: { provider: Row }) {
  const refreshHealth = useStore((s) => s.refreshHealth)
  const engine = useStore((s) => s.engine)
  const setEngine = useStore((s) => s.setEngine)
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
  // useState's initializer runs once — re-sync when a health refresh brings a new saved URL
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrlValue(provider.baseUrl ?? '')
  }, [provider.baseUrl])

  // For the collapsed Local row, track which local model is selected in the dropdown.
  const localModels = isLocal ? (provider.models ?? []) : []
  const initialLocalModel = engine?.startsWith('local:')
    ? engine.slice(6)
    : provider.useId?.startsWith('local:')
      ? provider.useId.slice(6)
      : localModels[0]?.id ?? ''
  const [localModel, setLocalModel] = useState(initialLocalModel)

  // "active" matches the collapsed Local row against any local:* engine id
  const isActive = engine === provider.id || (isLocal && Boolean(engine?.startsWith('local:')))

  // For local, the Use button and dropdown target local:<selectedModel>.
  const useTargetId = isLocal && localModel ? `local:${localModel}` : (provider.useId ?? provider.id)

  // save an API key (anthropic / kimi connect form)
  const save = async () => {
    if (!provider.connect || !value.trim()) return
    setBusy(true)
    setNote(null)
    const result = await connectEngine(provider.connect.envKey, value.trim())
    if (result.ok && result.providers) {
      await refreshHealth(result.providers)
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
      await refreshHealth(result.providers)
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
    if (result.providers) await refreshHealth(result.providers)
    setNote(null)
    setBusy(false)
  }

  const handleLocalModelChange = (modelId: string) => {
    setLocalModel(modelId)
    if (isActive) setEngine(`local:${modelId}`)
  }

  // non-local model dropdown binds kimi↔kimiModel, else claude-code↔claudeModel. `anthropic` has no
  // `models` in providerStatus, so showModels keeps it out of the model dropdown entirely (effort only).
  const modelValue = provider.id === 'kimi' ? kimiModel : claudeModel
  const onModelChange = provider.id === 'kimi' ? setKimiModel : setClaudeModel
  const showModels = (provider.models?.length ?? 0) > 0 && (isLocal || provider.id === 'claude-code' || provider.id === 'kimi')
  const showEfforts = provider.available && (provider.efforts?.length ?? 0) > 0

  return (
    <section className={`engine-row${provider.available ? ' on' : ''}`}>
      <div className="engine-row-head">
        <i className={`dot ${provider.available ? 'ok' : 'off'}`} />
        <span className="engine-row-label">{provider.label}</span>
        {isActive && <span className="engine-active-badge">In use</span>}
        <span className="engine-row-actions">
          {provider.available && !isActive && (
            <button className="btn btn-primary sm" onClick={() => setEngine(useTargetId)} title="Design with this engine">
              Use
            </button>
          )}
          <button
            className="btn btn-ghost sm"
            onClick={runTest}
            // nothing to test on an API-key engine with no key yet; local re-probes
            // its server and the CLI engine reports a clear "not found", so allow those
            disabled={busy || (!provider.available && !isLocal && !!provider.connect)}
            title={!provider.available && !isLocal && !!provider.connect ? `Add your ${provider.connect.envKey} first` : 'Send a 1-token ping to check the connection'}
          >
            Test
          </button>
          {provider.available && provider.connect && !isLocal && (
            <button className="btn btn-ghost sm" onClick={disconnect} disabled={busy} title={`Clear ${provider.connect.envKey}`}>
              Disconnect
            </button>
          )}
        </span>
      </div>
      <div className="engine-row-detail">{provider.detail}</div>

      {/* model + effort settings for a connected engine */}
      {provider.available && (showModels || showEfforts) && (
        <div className="engine-config">
          {showModels && (
            <label className="engine-model-row">
              <span>Model</span>
              {isLocal ? (
                <select aria-label={`${provider.label} model`} value={localModel} onChange={(e) => handleLocalModelChange(e.target.value)}>
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

      {/* local server URL — always editable so you can point it at a server before starting it */}
      {isLocal && provider.connect && (
        <div className="engine-connect">
          <input
            type="text"
            aria-label="Local LLM base URL"
            placeholder={provider.connect.placeholder}
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void applyUrl()
            }}
          />
          <button className="btn btn-primary sm" onClick={applyUrl} disabled={busy || !urlValue.trim()}>
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
        <div className="engine-connect">
          <input
            type="password"
            aria-label={`${provider.label} API key`}
            placeholder={provider.connect.placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save()
            }}
          />
          <button className="btn btn-primary sm" onClick={save} disabled={busy || !value.trim()}>
            {busy ? '…' : 'Connect'}
          </button>
          <a className="engine-link" href={provider.connect.url} target="_blank" rel="noreferrer">
            {provider.connect.urlLabel} ↗
          </a>
        </div>
      )}

      {note && <div className={`engine-note ${note.ok ? 'ok' : 'err'}`} role="status">{note.text}</div>}
    </section>
  )
}

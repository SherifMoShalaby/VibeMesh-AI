import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { useUi } from '../state/ui'
import { connectEngine, testEngine, type ProviderInfo } from '../lib/api'
import { IconX, IconRefresh, DChip } from './icons'

export default function EnginesModal() {
  const enginesOpen = useUi((s) => s.enginesOpen)
  const setEnginesOpen = useUi((s) => s.setEnginesOpen)
  const health = useStore((s) => s.health)
  const refreshHealth = useStore((s) => s.refreshHealth)
  const [scanning, setScanning] = useState(false)

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

  // collapse the per-model local entries into one row for this panel
  const providers: Array<ProviderInfo & { useId?: string }> = []
  let localDone = false
  for (const p of health?.providers ?? []) {
    if (p.id.startsWith('local:')) {
      if (!localDone) {
        const models = health!.providers.filter((q) => q.id.startsWith('local:'))
        providers.push({
          ...p,
          id: 'local',
          useId: p.id, // selecting "use" targets the first local model
          label: 'Local LLM',
          detail: `${p.detail} — ${models.length} model(s): ${models.map((m) => m.model).join(', ')}`,
        })
        localDone = true
      }
    } else {
      providers.push(p)
    }
  }

  const rescan = async () => {
    setScanning(true)
    await refreshHealth()
    setScanning(false)
  }

  return (
    <div className="scrim" onClick={() => setEnginesOpen(false)}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="AI engines" onClick={(e) => e.stopPropagation()}>
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
          {providers.map((p) => (
            <EngineRow key={p.id} provider={p} />
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

function EngineRow({ provider }: { provider: ProviderInfo & { useId?: string } }) {
  const refreshHealth = useStore((s) => s.refreshHealth)
  const engine = useStore((s) => s.engine)
  const setEngine = useStore((s) => s.setEngine)
  const claudeModel = useStore((s) => s.claudeModel)
  const setClaudeModel = useStore((s) => s.setClaudeModel)
  const kimiModel = useStore((s) => s.kimiModel)
  const setKimiModel = useStore((s) => s.setKimiModel)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  // "active" matches the collapsed Local row against any local:* engine id
  const isActive = engine === provider.id || (provider.id === 'local' && Boolean(engine?.startsWith('local:')))
  const useTargetId = provider.useId ?? provider.id

  const save = async () => {
    if (!provider.connect || !value.trim()) return
    setBusy(true)
    setNote(null)
    const result = await connectEngine(provider.connect.envKey, value.trim())
    if (result.ok && result.providers) {
      await refreshHealth(result.providers)
      setValue('')
      // immediately verify the new credential
      const test = await testEngine(provider.id)
      setNote({ ok: test.ok, text: test.ok ? `Connected. ${test.message}` : test.message })
    } else {
      setNote({ ok: false, text: result.message ?? 'Could not save.' })
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
          <button className="btn btn-ghost sm" onClick={runTest} disabled={busy}>
            Test
          </button>
          {provider.available && provider.connect && (
            <button className="btn btn-ghost sm" onClick={disconnect} disabled={busy} title={`Clear ${provider.connect.envKey}`}>
              Disconnect
            </button>
          )}
        </span>
      </div>
      <div className="engine-row-detail">{provider.detail}</div>

      {provider.available &&
        (provider.id === 'claude-code' || provider.id === 'kimi') &&
        (provider.models?.length ?? 0) > 0 &&
        (() => {
          const isKimi = provider.id === 'kimi'
          const value = isKimi ? kimiModel : claudeModel
          const onChange = isKimi ? setKimiModel : setClaudeModel
          return (
            <label className="engine-model-row">
              <span>Model</span>
              <select aria-label={`${provider.label} model`} value={value} onChange={(e) => onChange(e.target.value)}>
                {provider.models!.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          )
        })()}

      {provider.id === 'claude-code' && !provider.available && (
        <div className="engine-row-detail">
          Install Claude Code, then run <code>claude</code> in a terminal and use <code>/login</code>. Re-scan after.
        </div>
      )}

      {provider.connect && !provider.available && (
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

import { describe, expect, it } from 'vitest'
import type { CatalogEntry, ProviderInfo } from '../lib/api'
import { collapseProviders, deriveCards } from './engineCards'

function provider(over: Partial<ProviderInfo> & Pick<ProviderInfo, 'id'>): ProviderInfo {
  return {
    label: over.id,
    available: true,
    detail: '',
    model: null,
    vision: false,
    ...over,
  }
}

function catalogEntry(over: Partial<CatalogEntry> & Pick<CatalogEntry, 'id'>): CatalogEntry {
  return {
    label: over.id,
    protocol: 'openai',
    baseUrl: 'https://x/v1',
    defaultModel: `${over.id}-default`,
    models: [],
    caps: { contextWindow: 128000, maxOutputTokens: 16000, vision: false, thinking: false },
    connect: { placeholder: 'sk-…', url: '', urlLabel: '' },
    ...over,
  }
}

const local = (model: string): ProviderInfo =>
  provider({ id: `local:${model}`, label: model, model, group: 'local', detail: 'Ollama', baseUrl: 'http://localhost:11434/v1' })

describe('collapseProviders', () => {
  it('folds every local:* entry into one synthetic Local LLM row', () => {
    const rows = collapseProviders([
      provider({ id: 'anthropic', group: 'apikey' }),
      local('llama3'),
      local('phi3'),
    ])
    expect(rows).toHaveLength(2) // anthropic + one collapsed local
    const localRow = rows.find((r) => r.id === 'local')!
    expect(localRow).toBeDefined()
    expect(localRow.label).toBe('Local LLM')
    expect(localRow.useId).toBe('local:llama3') // Use targets the first local model
    expect(localRow.models).toEqual([
      { id: 'llama3', label: 'llama3' },
      { id: 'phi3', label: 'phi3' },
    ])
    expect(localRow.detail).toContain('2 model(s)')
  })

  it('leaves a provider list with no local entries unchanged', () => {
    const rows = collapseProviders([provider({ id: 'anthropic' }), provider({ id: 'kimi' })])
    expect(rows.map((r) => r.id)).toEqual(['anthropic', 'kimi'])
  })
})

describe('deriveCards — state machine', () => {
  const catalog = [catalogEntry({ id: 'openai', label: 'OpenAI · GPT' })]

  it('marks the active engine in-use and everything else connected/needs-setup', () => {
    const cards = deriveCards(
      { providers: [provider({ id: 'anthropic', available: true }), provider({ id: 'kimi', available: false })] },
      catalog,
      'anthropic',
    )
    const byId = (id: string) => cards.find((c) => c.provider?.id === id)!
    expect(byId('anthropic').state).toBe('in-use')
    expect(byId('kimi').state).toBe('needs-setup') // present but no key yet
  })

  it('treats an available non-active engine as connected', () => {
    const cards = deriveCards({ providers: [provider({ id: 'kimi', available: true })] }, [], 'anthropic')
    expect(cards.find((c) => c.provider?.id === 'kimi')!.state).toBe('connected')
  })

  it('matches the collapsed Local row in-use against any local:* engine id', () => {
    const cards = deriveCards({ providers: [local('llama3'), local('phi3')] }, [], 'local:phi3')
    const localCard = cards.find((c) => c.provider?.id === 'local')!
    expect(localCard.state).toBe('in-use')
    expect(localCard.provider!.useId).toBe('local:llama3')
  })

  it('never reports more than one in-use card', () => {
    const cards = deriveCards(
      { providers: [provider({ id: 'anthropic', available: true }), local('llama3')] },
      catalog,
      'local:llama3',
    )
    expect(cards.filter((c) => c.state === 'in-use')).toHaveLength(1)
  })
})

describe('deriveCards — connection validity (SEC-4)', () => {
  it('renders a present-but-invalid key as degraded (not connected) with the reason', () => {
    const cards = deriveCards(
      { providers: [provider({ id: 'kimi', available: true, detail: 'using your Kimi key', connectionState: 'degraded', connectionReason: 'credential rejected — check the key' })] },
      [],
      'anthropic',
    )
    const card = cards.find((c) => c.provider?.id === 'kimi')!
    expect(card.state).toBe('degraded')
    expect(card.degradedReason).toBe('credential rejected — check the key')
    expect(card.detail).toContain('credential rejected') // reason surfaced inline
  })

  it('demotes a 429 (over-quota) provider to degraded with a quota reason', () => {
    const cards = deriveCards(
      { providers: [provider({ id: 'anthropic', available: true, connectionState: 'degraded', connectionReason: 'rate limit / quota — wait and retry' })] },
      [],
      null,
    )
    const card = cards.find((c) => c.provider?.id === 'anthropic')!
    expect(card.state).toBe('degraded')
    expect(card.degradedReason).toContain('quota')
  })

  it('distinguishes a verified provider from a freshly-configured-but-never-called one', () => {
    const cards = deriveCards(
      {
        providers: [
          provider({ id: 'anthropic', available: true, connectionState: 'verified' }),
          provider({ id: 'kimi', available: true, connectionState: 'configured-unverified' }),
        ],
      },
      [],
      null,
    )
    const anth = cards.find((c) => c.provider?.id === 'anthropic')!
    const kimi = cards.find((c) => c.provider?.id === 'kimi')!
    expect(anth.state).toBe('connected')
    expect(anth.verified).toBe(true) // last call succeeded
    expect(kimi.state).toBe('connected')
    expect(kimi.verified).toBe(false) // key present but never confirmed working
  })

  it('keeps a working provider green (no regression when connectionState is absent)', () => {
    const cards = deriveCards({ providers: [provider({ id: 'anthropic', available: true })] }, [], null)
    const card = cards.find((c) => c.provider?.id === 'anthropic')!
    expect(card.state).toBe('connected') // no health field → behaves exactly as before
    expect(card.verified).toBe(false)
  })
})

describe('deriveCards — addable catalog', () => {
  it('offers a catalog entry only when no connection was created from it', () => {
    const catalog = [catalogEntry({ id: 'openai' }), catalogEntry({ id: 'openrouter' })]
    const health = { providers: [provider({ id: 'conn:abc', catalogId: 'openrouter', connection: true, available: true })] }
    const addable = deriveCards(health, catalog, null).filter((c) => c.state === 'addable').map((c) => c.catalogEntry!.id)
    expect(addable).toContain('openai')
    expect(addable).not.toContain('openrouter') // already connected → not re-offered
  })

  it('always keeps custom-* entries addable even with an existing custom connection', () => {
    const catalog = [catalogEntry({ id: 'custom-openai', custom: true })]
    const health = { providers: [provider({ id: 'conn:xyz', catalogId: 'custom-openai', connection: true })] }
    const addable = deriveCards(health, catalog, null).filter((c) => c.state === 'addable')
    expect(addable.map((c) => c.catalogEntry!.id)).toContain('custom-openai')
  })

  it('normalizes the addable specs source (caps.contextWindow → contextWindow)', () => {
    const catalog = [catalogEntry({ id: 'openai', caps: { contextWindow: 1050000, maxOutputTokens: 128000, vision: true, thinking: false } })]
    const card = deriveCards({ providers: [] }, catalog, null).find((c) => c.catalogEntry?.id === 'openai')!
    expect(card.contextWindow).toBe(1050000)
    expect(card.maxOutput).toBe(128000)
  })
})

describe('deriveCards — method + ordering', () => {
  it('derives the method axis (custom split, group fallback) and keeps built-ins searchable', () => {
    const cards = deriveCards(
      {
        providers: [
          provider({ id: 'claude-code', group: 'cli' }),
          provider({ id: 'anthropic', group: 'apikey' }),
          provider({ id: 'conn:c1', catalogId: 'custom-openai', connection: true }),
        ],
      },
      [],
      null,
    )
    expect(cards.find((c) => c.provider?.id === 'claude-code')!.method).toBe('cli')
    expect(cards.find((c) => c.provider?.id === 'anthropic')!.method).toBe('apikey')
    expect(cards.find((c) => c.provider?.id === 'conn:c1')!.method).toBe('custom')
  })

  it('orders in-use → connected → needs-setup → addable', () => {
    const cards = deriveCards(
      {
        providers: [
          provider({ id: 'kimi', available: false }), // needs-setup
          provider({ id: 'anthropic', available: true }), // in-use
          provider({ id: 'claude-code', available: true }), // connected
        ],
      },
      [catalogEntry({ id: 'openai' })], // addable
      'anthropic',
    )
    expect(cards.map((c) => c.state)).toEqual(['in-use', 'connected', 'needs-setup', 'addable'])
  })
})

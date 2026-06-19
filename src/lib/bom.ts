import { useEffect, useState } from 'react'

/**
 * Bill of materials — surface the REAL hardware a design needs ("which M3 screws / 608 bearings
 * to buy"). The catalog (dims) is fetched once from /api/hardware so server/hardware.mjs stays the
 * single source of truth — no drifting client copy. Detection is CATALOG-DRIVEN: the token set is
 * the catalog's own keys, so adding a screw/bearing server-side flows here automatically. The
 * code is scanned IN THE BROWSER, so the server never sees OpenSCAD (the core invariant holds).
 */

export interface ScrewSpec {
  nominal: number; clearance: number; tap: number; headDia: number; headHeight: number; nutAF: number; nutThick: number; insertDia: number
}
export interface BearingSpec { id: number; od: number; w: number }
export interface HardwareCatalog { screws: Record<string, ScrewSpec>; bearings: Record<string, BearingSpec> }

export interface BomItem { kind: 'screw' | 'bearing'; id: string; line: string }

let cached: Promise<HardwareCatalog | null> | null = null
/** Fetch + cache the catalog (one request per session). null if the API is unreachable. */
export function getHardwareCatalog(): Promise<HardwareCatalog | null> {
  if (!cached) {
    cached = fetch('/api/hardware')
      .then((r) => (r.ok ? (r.json() as Promise<HardwareCatalog>) : null))
      .catch(() => null)
  }
  return cached
}

/** Escape every regex metacharacter (not just '.') before embedding a catalog key in a pattern. */
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Whole-token match that tolerates the dotted M2.5 and won't match M3 inside M30 / 608 inside 6082. */
const tokenRe = (token: string) => new RegExp(`(^|[^A-Za-z0-9.])${escapeRe(token)}([^A-Za-z0-9.]|$)`, 'i')

/** Detect the catalog hardware referenced by a program. Deduped by id; empty when none. */
export function detectBom(code: string, cat: HardwareCatalog | null): BomItem[] {
  if (!code || !cat) return []
  const items: BomItem[] = []
  const wantsInsert = /heat.?set|insert/i.test(code)
  const wantsNut = /\bnut\b|nut.?trap|captive/i.test(code)
  for (const [name, s] of Object.entries(cat.screws ?? {})) {
    if (!tokenRe(name).test(code)) continue
    let line = `${name} screw — clearance hole Ø${s.clearance}mm · tap Ø${s.tap}mm · socket-head Ø${s.headDia}mm`
    if (wantsInsert) line += ` · heat-set insert pocket Ø${s.insertDia}mm`
    if (wantsNut) line += ` · hex-nut ${s.nutAF}mm A/F × ${s.nutThick}mm`
    items.push({ kind: 'screw', id: name, line })
  }
  for (const [name, b] of Object.entries(cat.bearings ?? {})) {
    if (!tokenRe(name).test(code)) continue
    items.push({ kind: 'bearing', id: name, line: `${name} bearing — OD ${b.od}mm · ID ${b.id}mm · width ${b.w}mm` })
  }
  return items
}

/** Render a BOM as a readable text file ("which hardware to buy"). '' for an empty list. */
export function formatBomText(items: BomItem[], title = 'design'): string {
  if (!items.length) return ''
  const out = [
    `Bill of materials — ${title}`,
    `(real dimensions from the Vibemesh hardware catalog; quantities depend on your build)`,
    '',
    ...items.map((it) => `- ${it.line}`),
    '',
  ]
  return out.join('\n')
}

/** React hook: the catalog, or null until the one-time fetch resolves. */
export function useHardwareCatalog(): HardwareCatalog | null {
  const [cat, setCat] = useState<HardwareCatalog | null>(null)
  useEffect(() => {
    let live = true
    void getHardwareCatalog().then((c) => {
      if (live) setCat(c)
    })
    return () => {
      live = false
    }
  }, [])
  return cat
}

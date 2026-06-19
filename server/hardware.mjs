/**
 * Real metric-hardware dimensions (mm) — the SINGLE SOURCE OF TRUTH for the
 * fastener/bearing skills, their validators, the prompt fragments injected at the
 * contextText seam, and the bill-of-materials detector. Before this module each
 * number lived in three places (exemplar OpenSCAD, the validator, the fragment
 * prose) plus the model's recall, where they drifted and where models hallucinate
 * fits. Adding or correcting a fastener is now a DATA edit here, guarded by
 * bench/hardware.selftest.mjs (catalog consistency + exemplar-drift + validator).
 *
 * Sources (each value is a real spec, not folklore):
 *   clearance  — ISO 273 "normal" clearance hole for the bolt shank
 *   tap        — tap-drill Ø for the coarse-pitch ISO metric thread
 *   headDia/headHeight — ISO 4762 / DIN 912 socket-head cap screw (dk, k), max
 *   nutAF/nutThick     — ISO 4032 hex nut, width across flats (s) and thickness (m), max
 *   insertDia  — recommended melt-in hole Ø for a common tapered brass heat-set
 *                insert (e.g. CNC Kitchen / Ruthex M-series)
 *   bearings   — deep-groove ball-bearing OD / bore (ID) / width, the de-facto
 *                hobby/skate standards
 */

/** Metric screws. Keys are the canonical thread designation (used as BOM ids + tokens). */
export const SCREWS = {
  M2: { nominal: 2, clearance: 2.4, tap: 1.6, headDia: 3.8, headHeight: 2.0, nutAF: 4.0, nutThick: 1.6, insertDia: 3.2 },
  'M2.5': { nominal: 2.5, clearance: 2.9, tap: 2.05, headDia: 4.5, headHeight: 2.5, nutAF: 5.0, nutThick: 2.0, insertDia: 3.5 },
  M3: { nominal: 3, clearance: 3.4, tap: 2.5, headDia: 5.5, headHeight: 3.0, nutAF: 5.5, nutThick: 2.4, insertDia: 4.0 },
  M4: { nominal: 4, clearance: 4.5, tap: 3.3, headDia: 7.0, headHeight: 4.0, nutAF: 7.0, nutThick: 3.2, insertDia: 5.6 },
  M5: { nominal: 5, clearance: 5.5, tap: 4.2, headDia: 8.5, headHeight: 5.0, nutAF: 8.0, nutThick: 4.7, insertDia: 6.4 },
  M6: { nominal: 6, clearance: 6.6, tap: 5.0, headDia: 10.0, headHeight: 6.0, nutAF: 10.0, nutThick: 5.2, insertDia: 8.1 },
}

/** Deep-groove ball bearings: { id (bore), od, w (width) }, all mm. */
export const BEARINGS = {
  623: { id: 3, od: 10, w: 4 },
  624: { id: 4, od: 13, w: 5 },
  625: { id: 5, od: 16, w: 5 },
  626: { id: 6, od: 19, w: 6 },
  688: { id: 8, od: 16, w: 5 },
  608: { id: 8, od: 22, w: 7 },
  6000: { id: 10, od: 26, w: 8 },
}

/** The screw set the threaded-fastener-seat exemplar tabulates (kept in registry order). */
export const FASTENER_SET = ['M2.5', 'M3', 'M4', 'M5']

/** Normalize a screw token ("m3", "M3 ") to a catalog key, or null. */
export function screwSpec(token) {
  if (typeof token !== 'string') return null
  const m = /m\s*(2\.5|[2-6])\b/i.exec(token)
  if (!m) return null
  return SCREWS[`M${m[1]}`] ? `M${m[1]}` : null
}

/** Normalize a bearing token to a catalog key, or null. */
export function bearingSpec(token) {
  if (typeof token !== 'string') return null
  const m = /\b(623|624|625|626|688|608|6000)\b/.exec(token)
  return m && BEARINGS[m[1]] ? m[1] : null
}

const SCREW_RE = /\bM(2\.5|[2-6])\b/gi
const BEARING_RE = /\b(6000|623|624|625|626|688|608)\b/g // 6000 first so it is not shadowed by 600/608

/** True when a text mentions any catalog hardware (drives the contextText directive). */
export function hasHardwareToken(text) {
  if (typeof text !== 'string') return false
  return SCREW_RE.test(text) || BEARING_RE.test(text)
}

/**
 * Bill of materials: scan generated OpenSCAD / a prompt for hardware tokens and
 * return the real parts a build needs, with catalog dimensions. A DETECTOR, not a
 * counter — quantities depend on geometry the string can't reveal, so qty is omitted
 * (honest over wrong). Deduped by id; empty for a design that needs no hardware.
 */
export function billOfMaterials(text) {
  if (typeof text !== 'string') return []
  const items = []
  const seenScrew = new Set()
  for (const m of text.matchAll(SCREW_RE)) {
    const key = `M${m[1]}`
    if (!SCREWS[key] || seenScrew.has(key)) continue
    seenScrew.add(key)
    const s = SCREWS[key]
    const wantsInsert = /heat.?set|insert|threaded.insert/i.test(text)
    const wantsNut = /\bnut\b|nut.?trap|captive/i.test(text)
    items.push({
      kind: 'screw',
      id: key,
      spec: s,
      note: `${key} screw — clearance Ø${s.clearance}, tap Ø${s.tap}, socket-head Ø${s.headDia}` +
        (wantsInsert ? `, heat-set insert pocket Ø${s.insertDia}` : '') +
        (wantsNut ? `, hex-nut AF ${s.nutAF}×${s.nutThick}` : ''),
    })
  }
  const seenBearing = new Set()
  for (const m of text.matchAll(BEARING_RE)) {
    const key = m[1]
    if (!BEARINGS[key] || seenBearing.has(key)) continue
    seenBearing.add(key)
    const b = BEARINGS[key]
    items.push({ kind: 'bearing', id: key, spec: b, note: `${key} bearing — OD ${b.od}, ID ${b.id}, width ${b.w}` })
  }
  return items
}

import { describe, it, expect } from 'vitest'
import { detectBom, formatBomText, type HardwareCatalog } from './bom'

const cat: HardwareCatalog = {
  screws: {
    'M2.5': { nominal: 2.5, clearance: 2.9, tap: 2.05, headDia: 4.5, headHeight: 2.5, nutAF: 5.0, nutThick: 2.0, insertDia: 3.5 },
    M3: { nominal: 3, clearance: 3.4, tap: 2.5, headDia: 5.5, headHeight: 3, nutAF: 5.5, nutThick: 2.4, insertDia: 4.0 },
  },
  bearings: { 608: { id: 8, od: 22, w: 7 }, 6000: { id: 10, od: 26, w: 8 } },
}

describe('detectBom', () => {
  it('detects a screw and a bearing with catalog dims', () => {
    const bom = detectBom('a bracket with M3 screws holding a 608 bearing', cat)
    expect(bom.map((b) => b.id).sort()).toEqual(['608', 'M3'])
    expect(bom.find((b) => b.id === 'M3')?.line).toContain('Ø3.4mm')
    expect(bom.find((b) => b.id === '608')?.line).toContain('OD 22mm')
  })

  it('matches the dotted M2.5 token', () => {
    expect(detectBom('use an M2.5 cap screw', cat).map((b) => b.id)).toContain('M2.5')
  })

  it('does NOT match a token embedded in a larger number (M3 in M30, 608 in 6082)', () => {
    expect(detectBom('an M30 coarse rod', cat).some((b) => b.id === 'M3')).toBe(false)
    expect(detectBom('part number 6082 here', cat).some((b) => b.id === '608')).toBe(false)
  })

  it('appends a heat-set insert pocket only when the code mentions inserts', () => {
    const withInsert = detectBom('M3 heat-set insert boss', cat).find((b) => b.id === 'M3')
    expect(withInsert?.line).toMatch(/insert pocket Ø4mm/)
    const plain = detectBom('M3 clearance hole', cat).find((b) => b.id === 'M3')
    expect(plain?.line).not.toMatch(/insert pocket/)
  })

  it('appends a hex-nut spec when the code mentions a nut', () => {
    const withNut = detectBom('M3 captive nut trap', cat).find((b) => b.id === 'M3')
    expect(withNut?.line).toMatch(/hex-nut 5.5mm A\/F/)
  })

  it('returns [] for empty code or a null catalog', () => {
    expect(detectBom('', cat)).toEqual([])
    expect(detectBom('M3 screw', null)).toEqual([])
    expect(detectBom('a plain 40mm box', cat)).toEqual([])
  })
})

describe('formatBomText', () => {
  it('renders a readable list with the title, empty string for no items', () => {
    expect(formatBomText([], 'x')).toBe('')
    const txt = formatBomText(detectBom('M3 screw and 608 bearing', cat), 'gizmo')
    expect(txt).toContain('Bill of materials — gizmo')
    expect(txt).toContain('- M3 screw')
    expect(txt).toContain('- 608 bearing')
  })
})

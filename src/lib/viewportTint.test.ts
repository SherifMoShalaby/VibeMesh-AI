import { describe, it, expect } from 'vitest'
import { meshTint, MESH_BASE_COLOR, MESH_OVERBED_COLOR } from './viewportTint'

const base = { overBed: false, isAssemblyPreview: false, selected: false, hovered: false, measureMode: false }

describe('meshTint', () => {
  it('a fitting part renders neutral grey with no emissive', () => {
    expect(meshTint(base)).toEqual({ color: MESH_BASE_COLOR, emissive: '#000000' })
  })

  it('an over-bed part is tinted red (slicer convention)', () => {
    const t = meshTint({ ...base, overBed: true })
    expect(t.color).toBe(MESH_OVERBED_COLOR)
    expect(t.emissive).not.toBe('#000000') // glows red even in shadow
  })

  it('the `all` assembly preview is NEVER tinted red, even when over-bed', () => {
    // the contract that matters most: an over-bed bound is expected for the meshed assembly view
    const t = meshTint({ ...base, overBed: true, isAssemblyPreview: true })
    expect(t.color).toBe(MESH_BASE_COLOR)
  })

  it('a selected over-bed part stays red but brightens so the move gizmo reads', () => {
    const fit = meshTint({ ...base, selected: true })
    const over = meshTint({ ...base, overBed: true, selected: true })
    expect(over.color).toBe(MESH_OVERBED_COLOR)
    expect(over.emissive).not.toBe(fit.emissive) // distinct from the normal select glow
  })

  it('selection and hover drive the emissive glow when the part fits', () => {
    expect(meshTint({ ...base, selected: true }).emissive).toBe('#8a4012')
    expect(meshTint({ ...base, hovered: true }).emissive).toBe('#3a2a18')
  })

  it('measure mode suppresses the hover glow (its crosshair owns the cursor)', () => {
    expect(meshTint({ ...base, hovered: true, measureMode: true }).emissive).toBe('#000000')
  })
})

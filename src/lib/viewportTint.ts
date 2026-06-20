/** Resting material colors for the viewport mesh.
 *
 *  Slicer convention (Bambu Studio / PrusaSlicer / Cura): a part that overruns the build volume
 *  is tinted RED so "this won't fit" reads instantly, before the user checks the verdict chip.
 *  The multi-part `all` assembly preview is exempt — an over-bed bound is *expected* there (it
 *  shows every piece meshed together, larger than one plate), which is exactly why bed-fit
 *  warnings are muted for that view.
 *
 *  Kept as a pure function so the client-seam unit net (`*.test.ts`, node env) can lock the color
 *  contract — most importantly, that the assembly preview never turns red — without standing up a
 *  WebGL context. The hex values are the 3D material's, not DOM tokens, so they live here (the
 *  no-raw-hex rule is a DOM/CSS concern). SpawnRig drives opacity/transparency separately, so this
 *  color/emissive pair composes cleanly with the spawn fade and X-ray. */

export interface MeshTintInput {
  /** the model's transformed bounds exceed the bed in at least one axis */
  overBed: boolean
  /** the `all` view of a multi-part design (bed-fit warnings suppressed) */
  isAssemblyPreview: boolean
  selected: boolean
  hovered: boolean
  /** measure tool active — its crosshair owns the cursor, so the hover glow is suppressed */
  measureMode: boolean
}

export interface MeshTint {
  color: string
  emissive: string
}

/** neutral cool grey — the default printed-part look */
export const MESH_BASE_COLOR = '#b9bdc6'
/** coral warning red — the part overruns the build volume */
export const MESH_OVERBED_COLOR = '#d65c50'

export function meshTint({ overBed, isAssemblyPreview, selected, hovered, measureMode }: MeshTintInput): MeshTint {
  // over-bed red dominates, but a selected over-bed part still brightens so the move gizmo reads
  if (overBed && !isAssemblyPreview) {
    return { color: MESH_OVERBED_COLOR, emissive: selected ? '#7a1d14' : '#54110b' }
  }
  const emissive = selected ? '#8a4012' : hovered && !measureMode ? '#3a2a18' : '#000000'
  return { color: MESH_BASE_COLOR, emissive }
}

/* Skills registry (P2 — generalize the seam).
 *
 * Each skill contributes a system-prompt FRAGMENT that is selected PER REQUEST at the
 * contextText seam (server/providers.mjs) and appended to the abstract SYSTEM_PROMPT.
 * This generalizes the previous single hard-coded kit boolean into a keyed, extensible
 * registry: selectSkills() picks the relevant ids, the assembler concatenates their
 * fragments. Adding a mechanism skill later = a new entry here, not a SYSTEM_PROMPT edit.
 *
 * 2a is a PURE REFACTOR: the assembled prompt is byte-identical to the previous inline
 * contextText behavior (guarded by bench/prompt-snapshot.mjs). The single skill below
 * reproduces the exact former kit appendix, including the drop-the-exemplar-on-local rule.
 */
import { KIT_EXEMPLAR } from './exemplars.mjs'

export const SKILLS = {
  'kit-baseplate': {
    id: 'kit-baseplate',
    // the buildable-kit pattern: prose rules + (non-local) the compile-verified exemplar.
    // local models run in a tiny num_ctx, so the ~1K-token exemplar is dropped for them.
    fragment(engine) {
      const isLocal = typeof engine === 'string' && engine.startsWith('local:')
      let s =
        '\n\n# Build as a KIT\n\nThis request is for a buildable kit. Produce SEPARATE connectable parts, not one fused solid: use the part enum (one module per piece), design real inline mating connectors (studs/tubes, pegs/sockets, snaps, axles/bores) with the fit clearance exposed as a parameter, and render each selected piece flat on z=0 in print orientation. EXCEPTION: if a reference image shows a SINGLE object that merely accepts inserted hardware (a bearing pocket, weight bores, screw holes), it is ONE printable solid — model it as a single faithful part and ignore this kit guidance.'
      if (!isLocal) {
        s +=
          '\n\nReference example of a buildable kit in the exact required style (part enum, one module per piece, inline connectors where every female size = the male size plus ONE shared clearance parameter, each piece flat on z=0). Follow this STRUCTURE; do not copy it literally — design for what the user asked:\n\n' +
          KIT_EXEMPLAR
      }
      return s
    },
  },
}

/** Map per-request context to the ordered skill ids to inject. Generalizes the single
 *  kit boolean; an explicit context.skillIds (future router output) takes precedence. */
export function selectSkills(context) {
  if (Array.isArray(context?.skillIds)) return context.skillIds.filter((id) => SKILLS[id])
  return context?.kit ? ['kit-baseplate'] : []
}

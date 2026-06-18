/* Skills registry (P2 — generalize the seam; P3 — first mechanism skill).
 *
 * Each skill contributes a system-prompt FRAGMENT selected PER REQUEST at the contextText
 * seam (server/providers.mjs) and appended to the abstract SYSTEM_PROMPT. selectSkills()
 * picks the ids; the assembler concatenates their fragments. Adding a mechanism = a new
 * entry here, not a SYSTEM_PROMPT edit.
 *
 * A skill MAY also carry an `exemplar` (a compile-verified parametric program) and a
 * `validate(code)` (a deterministic, zero-API check of the female=male+clearance / fit
 * discipline). bench/skills.selftest.mjs walks the registry: every exemplar must compile
 * AND pass its own validator, and a clearance-broken control must be CAUGHT (the
 * "exemplar-poison" defense). This is the engine-free gate for the skills program.
 */
import { KIT_EXEMPLAR } from './exemplars.mjs'

/* Shared FDM fit ladder — the ONE place clearance values live, so every skill and
 * validator reads the same numbers (radial, on diameter). female = male + fit(class). */
export const FIT = { press: 0.05, slide: 0.2, free: 0.35, pip: 0.45 }

/* Deterministic fit check: does `code` derive a female bore from a male dimension PLUS a
 * positive named clearance (…fit/clr/clearance/gap), rather than a bare equal-size bore
 * that would seize? Returns an issues[] (empty = ok). Shared by mechanism validators. */
export function clearanceFitOk(code, maleVar) {
  const re = new RegExp(maleVar + '\\s*\\+\\s*\\w*(fit|clr|clearance|gap)\\b', 'i')
  return re.test(code)
}

/* P3 spike — compile-verified locally (all parts flat on z=0; the `all` view assembles
 * the rolling chassis with wheels below the body). ONE shared spin_fit drives every bore. */
const WHEEL_AXLE_EXEMPLAR = `// KIT: chassis x1, wheel x2, axle x1 — a rolling wheel/axle assembly.
// JOINT: every female bore = axle_d + spin_fit (ONE shared clearance), so axle+wheels spin.

/* [Kit] */
part = "all"; // [all, chassis, wheel, axle]
explode = 0; // [0:1:30]

/* [Axle & fit] */
axle_d = 5;       // [3:0.5:8]
spin_fit = 0.35;  // [0.2:0.05:0.6]

/* [Wheel] */
wheel_d = 24;     // [12:1:40]
wheel_w = 8;      // [4:1:14]

/* [Chassis] */
chassis_l = 60;   // [30:5:120]
chassis_w = 26;   // [18:2:60]
chassis_h = 10;   // [6:1:18]

bore = axle_d + spin_fit;              // shared female clearance
axle_z = chassis_h / 2;
track = chassis_w + wheel_w + 4;
axle_len = track + wheel_w;
axle_x = [-chassis_l/4, chassis_l/4];

module axle() cylinder(d = axle_d, h = axle_len);
module wheel() difference() {
  cylinder(d = wheel_d, h = wheel_w);
  translate([0, 0, -1]) cylinder(d = bore, h = wheel_w + 2);
}
module axle_bore() rotate([-90, 0, 0]) translate([0, 0, -track/2 - 1]) cylinder(d = bore, h = track + 2);
module chassis() difference() {
  translate([-chassis_l/2, -chassis_w/2, 0]) cube([chassis_l, chassis_w, chassis_h]);
  for (x = axle_x) translate([x, 0, axle_z]) axle_bore();
}

if (part == "all") {
  chassis();
  for (x = axle_x, sy = [-1, 1]) translate([x, sy * (track/2 + explode), axle_z]) rotate([-90, 0, 0]) wheel();
} else if (part == "chassis") {
  chassis();
} else if (part == "wheel") {
  wheel();
} else if (part == "axle") {
  translate([0, 0, axle_d/2]) rotate([0, 90, 0]) translate([0, 0, -axle_len/2]) axle();
}
`

export const SKILLS = {
  'kit-baseplate': {
    id: 'kit-baseplate',
    exemplar: KIT_EXEMPLAR,
    validate(code) {
      const issues = []
      if (!clearanceFitOk(code, 'stud_d') && !clearanceFitOk(code, 'axle_d'))
        issues.push('kit connectors must derive each female from a male dimension + a shared clearance (e.g. axle_d + spin_fit)')
      return issues
    },
    // the buildable-kit pattern: prose rules + (non-local) the compile-verified exemplar.
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

  'wheel-axle': {
    id: 'wheel-axle',
    exemplar: WHEEL_AXLE_EXEMPLAR,
    validate(code) {
      const issues = []
      if (!clearanceFitOk(code, 'axle_d'))
        issues.push('a rotating wheel/axle bore must be axle_d + a positive spin clearance (bore = axle_d + spin_fit), or the parts seize')
      return issues
    },
    fragment(engine) {
      const isLocal = typeof engine === 'string' && engine.startsWith('local:')
      let s =
        '\n\n# Wheels & axles\n\nFor wheels/axles, the rotating joint is the point: every female bore = axle_d + ONE shared spin clearance (e.g. spin_fit ~0.3-0.4mm), exposed as a parameter — never an equal-size bore (it would seize). Print the wheel and chassis flat (round face down, true circles), the axle lying flat; a printed axle is weak in bending, so for load suggest a metal rod. If it is a kit, use the part enum (one module per piece).'
      if (!isLocal) {
        s +=
          '\n\nReference example (rolling chassis + wheels + axle; ONE shared spin_fit drives every bore; each part flat on z=0). Follow this STRUCTURE; design for what the user asked:\n\n' +
          WHEEL_AXLE_EXEMPLAR
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

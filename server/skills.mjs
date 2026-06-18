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

const LIVING_HINGE_EXEMPLAR = `// SKILL: living-hinge — two rigid panels joined by ONE thin continuous flexure web.
// The web is a SINGLE solid body (not a gap); print PP/TPU/PETG, layers across the bend.

/* [Panels] */
panel_l = 30;     // [15:1:80]
panel_w = 30;     // [15:1:80]
panel_h = 3;      // [2:0.5:6]

/* [Flexure] */
web_thick = 0.5;  // [0.3:0.05:1]
web_span = 6;     // [3:1:16]

module panel() cube([panel_l, panel_w, panel_h]);

// one continuous body: panel A — thin web — panel B (the web flexes)
panel();
translate([panel_l, 0, (panel_h - web_thick) / 2]) cube([web_span, panel_w, web_thick]);
translate([panel_l + web_span, 0, 0]) panel();
`

const LEAF_SPRING_EXEMPLAR = `// SKILL: leaf/cantilever spring — a tapered cantilever beam (thick root -> thin tip) on
// an anchor. Stiffness ~ E*b*h^3/(4*L^3); thickness dominates (cubic). Filleted root.

/* [Beam] */
length = 40;      // [15:1:90]
width = 12;       // [5:1:30]
root_thick = 4;   // [1.2:0.2:8]
tip_thick = 1.6;  // [1.2:0.1:5]
base = 6;

module beam() hull() {
  cube([0.01, width, root_thick]);                          // thick root cross-section
  translate([length, 0, 0]) cube([0.01, width, tip_thick]); // thin tip cross-section
}

cube([base, width, root_thick]);   // fixed anchor block
translate([base, 0, 0]) beam();    // tapered cantilever, flat on z=0
`

const SNAP_FIT_EXEMPLAR = `// SKILL: snap-fit — a cantilever snap clip latching under a keeper's ledge.
// ONE shared hook_overlap drives BOTH the clip hook AND the keeper ledge (no drift);
// a lead-in ramp eases insertion, the steep face retains, and the beam flexes (L/t >= 6).

/* [Kit] */
part = "all"; // [all, clip, keeper]
explode = 0; // [0:1:20]

/* [Beam] */
beam_len = 18;     // [10:1:34]
beam_thick = 2.4;  // [1.5:0.1:4]
beam_width = 10;   // [5:1:24]

/* [Hook & fit] */
hook_overlap = 1.2; // [0.4:0.1:2.5]
fit = 0.3;          // [0.2:0.05:0.5]
base = 4;

ramp = hook_overlap * 2.5;

// hook prism: flat retention face toward the base, sloped lead-in toward the tip
module hook() rotate([90, 0, 0]) linear_extrude(beam_width, center = true)
  polygon([[0, 0], [hook_overlap, 0], [0, ramp]]);

module clip() {
  cube([base, beam_width, base]);                                                  // anchor pad
  translate([base/2 - beam_thick/2, 0, base]) cube([beam_thick, beam_width, beam_len]);          // beam
  translate([base/2 + beam_thick/2, beam_width/2, base + beam_len - ramp]) hook();               // hook, +X
}

module keeper() difference() {
  cube([3, beam_width + 6, base + beam_len + 3]);
  translate([-1, 3, base + 3]) cube([5, beam_width + fit*2, beam_len - hook_overlap]);           // window; top edge = ledge
}

if (part == "all") {
  clip();
  translate([base/2 + beam_thick/2 + fit + explode, 0, 0]) keeper();
} else if (part == "clip") {
  clip();
} else if (part == "keeper") {
  keeper();
}
`

const PIP_HINGE_EXEMPLAR = `// SKILL: print-in-place hinge — two interleaved leaves on ONE captive pin, printed flat.
// The pin is solid through one leaf's knuckles; the OTHER leaf's knuckles ride on a radial
// clearance bore = pin_r + gap, so the joint pivots straight off the bed (nothing fuses).

/* [Leaves] */
leaf_l = 22;      // [12:1:60]
leaf_w = 30;      // [16:1:60]
leaf_h = 3;       // [2:0.5:6]

/* [Hinge] */
knuckles = 5;     // [3:2:9]
pin_r = 2.5;      // [1.5:0.25:5]
gap = 0.45;       // [0.3:0.05:0.7]   radial + axial print clearance (>= one nozzle width)
$fn = 48;

bore = pin_r + gap;       // free-running clearance on the moving leaf (shared)
kr = bore + 1.8;          // knuckle outer radius
seg = leaf_w / knuckles;

module knuckle(i, free) translate([0, i*seg + gap/2, kr]) rotate([-90, 0, 0]) difference() {
  cylinder(h = seg - gap, r = kr);
  if (free) translate([0, 0, -1]) cylinder(h = seg + 1, r = bore);
}

// fixed leaf (-X): plate + even knuckles SOLID on the pin + the continuous pin itself
module leafA() {
  translate([-leaf_l, 0, 0]) cube([leaf_l - kr + 0.01, leaf_w, leaf_h]);
  for (i = [0:2:knuckles-1]) { knuckle(i, false); translate([-kr, i*seg + gap/2, 0]) cube([kr, seg - gap, kr]); }
  translate([0, 0, kr]) rotate([-90, 0, 0]) cylinder(h = leaf_w, r = pin_r);
}
// moving leaf (+X): plate + odd knuckles riding FREE on the pin (bore = pin_r + gap)
module leafB() {
  translate([kr - 0.01, 0, 0]) cube([leaf_l - kr + 0.01, leaf_w, leaf_h]);
  for (i = [1:2:knuckles-1]) { knuckle(i, true); translate([0, i*seg + gap/2, 0]) cube([kr, seg - gap, kr]); }
}

leafA();
leafB();
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

  'living-hinge': {
    id: 'living-hinge',
    exemplar: LIVING_HINGE_EXEMPLAR,
    validate(code) {
      const m = code.match(/web_thick\s*=\s*([\d.]+)/)
      const t = m ? parseFloat(m[1]) : null
      const issues = []
      if (t === null) issues.push('living-hinge must expose a thin web-thickness parameter (web_thick)')
      else if (t < 0.3 || t > 1.0) issues.push(`living-hinge web is ${t}mm — must be ~0.3-0.6mm (thin enough to flex, >=2 perimeters); >1mm is too stiff and cracks`)
      return issues
    },
    brokenControl: (code) => code.replace(/web_thick\s*=\s*[\d.]+/, 'web_thick = 2.0'),
    fragment(engine) {
      const isLocal = typeof engine === 'string' && engine.startsWith('local:')
      let s =
        '\n\n# Living hinge\n\nA living hinge is ONE thin continuous web joining two rigid panels — never a gap or a separate part. Web ~0.3-0.6mm (>=2 perimeters), spanning a few mm so strain spreads; the two leaves stay a SINGLE body. Orient so layer lines run ACROSS the bend; print PP/TPU/PETG/Nylon (PLA cracks). Fillet where the web meets each panel.'
      if (!isLocal) s += '\n\nReference example (two panels + one continuous thin web, flat on z=0):\n\n' + LIVING_HINGE_EXEMPLAR
      return s
    },
  },

  'leaf-spring': {
    id: 'leaf-spring',
    exemplar: LEAF_SPRING_EXEMPLAR,
    validate(code) {
      const r = code.match(/root_thick\s*=\s*([\d.]+)/)
      const root = r ? parseFloat(r[1]) : null
      const issues = []
      if (root === null) issues.push('leaf-spring must expose a beam root-thickness parameter (root_thick)')
      else if (root < 1.2) issues.push(`leaf-spring root is ${root}mm — below the 1.2mm minimum printable feature`)
      return issues
    },
    brokenControl: (code) => code.replace(/root_thick\s*=\s*[\d.]+/, 'root_thick = 0.6'),
    fragment(engine) {
      const isLocal = typeof engine === 'string' && engine.startsWith('local:')
      let s =
        '\n\n# Leaf / cantilever spring\n\nA leaf spring is a tapered cantilever beam (thicker fixed root -> thinner free tip) on an anchor, with a filleted root. Stiffness scales with thickness CUBED — expose root/tip thickness; root >= 1.2mm. Orient so bending tension runs ALONG the layer lines (never peeling them); PETG/Nylon for repeated flex, not PLA.'
      if (!isLocal) s += '\n\nReference example (anchor + tapered cantilever beam, flat on z=0):\n\n' + LEAF_SPRING_EXEMPLAR
      return s
    },
  },

  'snap-fit': {
    id: 'snap-fit',
    exemplar: SNAP_FIT_EXEMPLAR,
    validate(code) {
      const o = code.match(/hook_overlap\s*=\s*([\d.]+)/)
      const L = code.match(/beam_len\s*=\s*([\d.]+)/)
      const t = code.match(/beam_thick\s*=\s*([\d.]+)/)
      const ov = o ? parseFloat(o[1]) : null
      const issues = []
      if (ov === null) issues.push('snap-fit must expose a hook_overlap parameter')
      else if (ov < 0.4 || ov > 2.5) issues.push(`snap-fit hook_overlap is ${ov}mm — use 0.4-1.5mm (too small slips out, too large jams / over-strains the beam)`)
      if (L && t) {
        const r = parseFloat(L[1]) / parseFloat(t[1])
        if (r < 6) issues.push(`snap-fit beam L/t is ${r.toFixed(1)} — keep >=6 so the flex strain stays printable (a short fat clip snaps)`)
      }
      return issues
    },
    brokenControl: (code) => code.replace(/hook_overlap\s*=\s*[\d.]+/, 'hook_overlap = 0'),
    fragment(engine) {
      const isLocal = typeof engine === 'string' && engine.startsWith('local:')
      let s =
        '\n\n# Snap-fit (cantilever)\n\nA snap-fit is a flexing cantilever beam with a hook that springs over a mating ledge. ONE shared overlap parameter must drive BOTH the hook protrusion AND the catch ledge it engages — never two independent numbers that can drift apart. Give the hook a shallow lead-in ramp (easy insert) and a steep retention face (resists pull-out), an insertion clearance, and a void the beam deflects into. Keep beam length/thickness >= 6 so the bending strain stays in the printable/elastic range.'
      if (!isLocal) s += '\n\nReference example (clip + keeper, one shared hook_overlap, flat on z=0):\n\n' + SNAP_FIT_EXEMPLAR
      return s
    },
  },

  'print-in-place-hinge': {
    id: 'print-in-place-hinge',
    exemplar: PIP_HINGE_EXEMPLAR,
    validate(code) {
      const issues = []
      if (!clearanceFitOk(code, 'pin_r')) issues.push('print-in-place hinge bore must be pin_r + a print gap (e.g. bore = pin_r + gap) — otherwise the pin fuses solid to the knuckles')
      const g = code.match(/gap\s*=\s*([\d.]+)/)
      if (g) {
        const v = parseFloat(g[1])
        if (v < 0.3) issues.push(`print gap is ${v}mm — needs >= ~0.3mm (one nozzle width) or adjacent layers fuse and the joint locks`)
      }
      return issues
    },
    fragment(engine) {
      const isLocal = typeof engine === 'string' && engine.startsWith('local:')
      let s =
        '\n\n# Print-in-place hinge\n\nA print-in-place hinge prints fully assembled and FLAT on the bed, then pivots with no assembly. Interleave the two leaves\' knuckles around one pin; make the pin SOLID through one leaf\'s knuckles and give the other leaf\'s knuckles a radial clearance bore = pin_r + gap (one shared gap parameter). Leave the same gap axially between adjacent knuckles. The gap must be >= one nozzle width (~0.3-0.5mm) or the layers fuse and the joint locks up.'
      if (!isLocal) s += '\n\nReference example (two leaves, interleaved knuckles, captive pin, flat on z=0):\n\n' + PIP_HINGE_EXEMPLAR
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

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

const SPUR_GEAR_EXEMPLAR = `// SKILL: spur-gear pair — a pinion meshing a gear. BOTH share one module (mod). Mandatory:
// backlash > 0 (teeth thinned for flank clearance) or the pair binds. Center distance =
// mod*(teeth_p + teeth_g)/2. Teeth are a printable trapezoidal involute approximation.

/* [Kit] */
part = "all"; // [all, pinion, gear]
explode = 0; // [0:1:30]

/* [Gears] */
mod = 2;          // [1:0.5:4]    module (tooth size) — BOTH gears MUST share it
teeth_p = 12;     // [8:1:30]
teeth_g = 24;     // [10:1:60]
thick = 6;        // [3:1:14]
bore = 5;         // [2:0.5:10]
backlash = 0.25;  // [0:0.05:0.6] MANDATORY > 0 — tooth-flank clearance
$fn = 96;

function pol(r, a) = [r*cos(a), r*sin(a)];

module spur(N) {
  pr = mod*N/2;            // pitch radius
  rr = pr - 1.25*mod;      // root radius
  orr = pr + mod;          // outer (addendum) radius
  p = PI*mod;              // circular pitch
  hp = ((p/2 - backlash)/2 / pr) * 180/PI;   // half tooth angle at pitch, thinned by backlash
  hroot = hp + 4;
  htip = max(hp - 4, 1);
  difference() {
    union() {
      cylinder(h = thick, r = rr + 0.2);
      for (i = [0:N-1]) rotate([0, 0, i*360/N])
        linear_extrude(thick) polygon([pol(rr,-hroot), pol(orr,-htip), pol(orr,htip), pol(rr,hroot)]);
    }
    translate([0, 0, -1]) cylinder(h = thick+2, r = bore/2);
  }
}

C = mod*(teeth_p + teeth_g)/2;   // meshing center distance

if (part == "all") {
  spur(teeth_p);
  translate([C + explode, 0, 0]) rotate([0, 0, 180/teeth_g]) spur(teeth_g);   // half-tooth offset to interleave
} else if (part == "pinion") {
  spur(teeth_p);
} else if (part == "gear") {
  spur(teeth_g);
}
`

const RACK_PINION_EXEMPLAR = `// SKILL: rack & pinion — a round pinion meshing a straight rack. SAME module; the rack
// tooth pitch = PI*mod (linear). Mandatory backlash > 0. Pinion rotation -> rack travel.

/* [Kit] */
part = "all"; // [all, pinion, rack]
explode = 0; // [0:1:30]

/* [Mesh] */
mod = 2.5;        // [1:0.5:5]    shared module
teeth_p = 14;     // [9:1:30]
rack_teeth = 12;  // [4:1:30]
thick = 7;        // [3:1:16]
bore = 5;         // [2:0.5:10]
backlash = 0.3;   // [0:0.05:0.7] MANDATORY > 0
$fn = 96;

function pol(r, a) = [r*cos(a), r*sin(a)];
p = PI*mod;              // pitch
tw = p/2 - backlash;     // tooth thickness at pitch, thinned by backlash

module pinion() {
  pr = mod*teeth_p/2; rr = pr - 1.25*mod; orr = pr + mod;
  hp = (tw/2 / pr) * 180/PI; hroot = hp + 4; htip = max(hp - 4, 1);
  difference() {
    union() {
      cylinder(h = thick, r = rr + 0.2);
      for (i = [0:teeth_p-1]) rotate([0, 0, i*360/teeth_p]) linear_extrude(thick)
        polygon([pol(rr,-hroot), pol(orr,-htip), pol(orr,htip), pol(rr,hroot)]);
    }
    translate([0, 0, -1]) cylinder(h = thick+2, r = bore/2);
  }
}

module rack() {
  L = rack_teeth*p;
  base_h = 1.25*mod + 2;
  translate([0, -base_h, 0]) cube([L, base_h, thick]);
  for (i = [0:rack_teeth-1]) translate([i*p + p/2, 0, 0]) linear_extrude(thick)
    polygon([[-(tw/2 + mod), 0], [-tw/2, mod], [tw/2, mod], [(tw/2 + mod), 0]]);
}

if (part == "all") {
  pinion();
  translate([-rack_teeth*p/2, -(mod*teeth_p/2) - mod - explode, 0]) rack();
} else if (part == "pinion") {
  pinion();
} else if (part == "rack") {
  rack();
}
`

const RATCHET_EXEMPLAR = `// SKILL: ratchet & pawl — a sawtooth wheel that turns ONE way only. Each tooth is
// ASYMMETRIC: a long gentle ramp the pawl rides up, then a steep radial face it locks
// against. The pawl pivots on a bore with clearance so it can drop into each tooth.

/* [Kit] */
part = "all"; // [all, wheel, pawl]
explode = 0; // [0:1:30]

/* [Wheel] */
teeth = 16;       // [6:1:40]
r_out = 24;       // [10:1:60]
tooth_h = 4;      // [2:0.5:8]
thick = 6;        // [3:1:14]
bore = 5;         // [2:0.5:10]

/* [Pawl] */
pawl_len = 22;    // [10:1:50]
pawl_t = 3;       // [2:0.5:6]
gap = 0.4;        // [0.3:0.05:0.7]  pivot clearance so the pawl swings
$fn = 96;

r_in = r_out - tooth_h;
ta = 360/teeth;

module wheel() difference() {
  union() {
    cylinder(h = thick, r = r_in + 0.2);
    for (i = [0:teeth-1]) rotate([0, 0, i*ta]) linear_extrude(thick)
      polygon([[r_in, 0], [r_out, 0], [r_in*cos(ta), r_in*sin(ta)]]);   // steep lock face + ramp
  }
  translate([0, 0, -1]) cylinder(h = thick+2, r = bore/2);
}

module pawl() difference() {
  union() {
    hull() { cylinder(h = pawl_t, r = 3); translate([pawl_len, 0, 0]) cylinder(h = pawl_t, r = 2); }
    translate([pawl_len-2, -1.5, 0]) cube([4, 3, pawl_t]);   // catch tip
  }
  translate([0, 0, -1]) cylinder(h = pawl_t+2, r = 2 + gap);  // pivot bore (clearance)
}

if (part == "all") { wheel(); translate([r_out + 10 + explode, 0, 0]) pawl(); }
else if (part == "wheel") wheel();
else if (part == "pawl") pawl();
`

const COIL_SPRING_EXEMPLAR = `// SKILL: compression coil spring — a helical coil. Wire >= printable; pitch > wire so the
// coils don't fuse into a tube. RENDER COST scales with turns*facets — keep turns modest
// and $fn sane, or the higher quality presets will time out on this geometry.

/* [Spring] */
coil_d = 16;      // [8:1:40]    mean coil diameter
wire_d = 3;       // [1.6:0.2:6] wire thickness (>= 2 perimeters)
turns = 6;        // [3:1:14]
pitch = 6;        // [3:0.5:14]  rise per turn — MUST be > wire_d or the coils fuse
$fn = 40;

free_h = turns*pitch;
// helical sweep: a wire circle offset to the coil radius, extruded up while twisting
linear_extrude(height = free_h, twist = 360*turns, convexity = ceil(turns*2))
  translate([coil_d/2, 0, 0]) circle(d = wire_d);
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

  'spur-gear': {
    id: 'spur-gear',
    exemplar: SPUR_GEAR_EXEMPLAR,
    validate(code) {
      const b = code.match(/backlash\s*=\s*([\d.]+)/)
      const bl = b ? parseFloat(b[1]) : null
      const issues = []
      if (bl === null) issues.push('spur gear must expose a backlash parameter — meshing teeth need flank clearance')
      else if (bl <= 0) issues.push('spur-gear backlash must be > 0 — zero-backlash teeth jam; use ~0.1-0.4mm')
      else if (bl > 1) issues.push(`spur-gear backlash ${bl}mm is excessive (loose, rattly) — use ~0.1-0.4mm`)
      return issues
    },
    brokenControl: (code) => code.replace(/backlash\s*=\s*[\d.]+/, 'backlash = 0'),
    fragment(engine) {
      const isLocal = typeof engine === 'string' && engine.startsWith('local:')
      let s =
        '\n\n# Spur gears\n\nMeshing gears MUST share one module (tooth size) — never two unrelated tooth definitions. Pitch radius = module*teeth/2; the meshing centre distance = module*(teeth_a + teeth_b)/2. ALWAYS thin the teeth by a backlash allowance (~0.1-0.4mm of flank clearance): zero-backlash printed teeth bind and stall. Expose module, tooth counts, thickness, bore, and backlash as parameters. Offset one gear by half a tooth so the teeth interleave in the assembled view.'
      if (!isLocal) s += '\n\nReference example (pinion + gear, shared module, backlash > 0, flat on z=0):\n\n' + SPUR_GEAR_EXEMPLAR
      return s
    },
  },

  'rack-pinion': {
    id: 'rack-pinion',
    exemplar: RACK_PINION_EXEMPLAR,
    validate(code) {
      const b = code.match(/backlash\s*=\s*([\d.]+)/)
      const bl = b ? parseFloat(b[1]) : null
      const issues = []
      if (bl === null) issues.push('rack & pinion must expose a backlash parameter — the meshing teeth need flank clearance')
      else if (bl <= 0) issues.push('rack-pinion backlash must be > 0 — zero-backlash teeth bind; use ~0.1-0.4mm')
      else if (bl > 1) issues.push(`rack-pinion backlash ${bl}mm is excessive — use ~0.1-0.4mm`)
      return issues
    },
    brokenControl: (code) => code.replace(/backlash\s*=\s*[\d.]+/, 'backlash = 0'),
    fragment(engine) {
      const isLocal = typeof engine === 'string' && engine.startsWith('local:')
      let s =
        '\n\n# Rack & pinion\n\nA rack & pinion converts pinion rotation into linear travel of a toothed bar. The rack and pinion MUST share one module; the rack tooth pitch is PI*module (linear), and the pinion is an ordinary spur gear of that module. Thin the teeth by a backlash allowance (~0.1-0.4mm) on both — zero backlash binds. Expose module, pinion tooth count, rack length, thickness, bore, and backlash.'
      if (!isLocal) s += '\n\nReference example (pinion + straight rack, shared module, backlash > 0, flat on z=0):\n\n' + RACK_PINION_EXEMPLAR
      return s
    },
  },

  'ratchet': {
    id: 'ratchet',
    exemplar: RATCHET_EXEMPLAR,
    validate(code) {
      const g = code.match(/gap\s*=\s*([\d.]+)/)
      const gp = g ? parseFloat(g[1]) : null
      const issues = []
      if (gp === null) issues.push('ratchet pawl needs a pivot/clearance gap so it can swing into each tooth')
      else if (gp < 0.3) issues.push(`ratchet pawl gap is ${gp}mm — needs >= ~0.3mm or the pawl seizes`)
      return issues
    },
    brokenControl: (code) => code.replace(/gap\s*=\s*[\d.]+/, 'gap = 0'),
    fragment(engine) {
      const isLocal = typeof engine === 'string' && engine.startsWith('local:')
      let s =
        '\n\n# Ratchet & pawl\n\nA ratchet turns one way and locks the other. The wheel teeth MUST be asymmetric — a long gentle ramp the pawl slides up, then a steep (near-radial) face it jams against. The pawl pivots (or flexes) into each tooth and needs a clearance gap on its pivot so it actually moves. Expose tooth count, radius, tooth height, and the pawl clearance.'
      if (!isLocal) s += '\n\nReference example (sawtooth wheel + pivoting pawl, flat on z=0):\n\n' + RATCHET_EXEMPLAR
      return s
    },
  },

  'coil-spring': {
    id: 'coil-spring',
    exemplar: COIL_SPRING_EXEMPLAR,
    validate(code) {
      const w = code.match(/wire_d\s*=\s*([\d.]+)/)
      const p = code.match(/pitch\s*=\s*([\d.]+)/)
      const wd = w ? parseFloat(w[1]) : null
      const pt = p ? parseFloat(p[1]) : null
      const issues = []
      if (wd === null) issues.push('coil spring must expose a wire thickness (wire_d)')
      else if (wd < 1.2) issues.push(`coil wire is ${wd}mm — below the 1.2mm printable minimum`)
      if (pt !== null && wd !== null && pt <= wd) issues.push(`coil pitch ${pt}mm must EXCEED wire thickness ${wd}mm or the coils fuse into a solid tube`)
      return issues
    },
    brokenControl: (code) => code.replace(/pitch\s*=\s*[\d.]+/, 'pitch = 1'),
    fragment(engine) {
      const isLocal = typeof engine === 'string' && engine.startsWith('local:')
      let s =
        '\n\n# Compression coil spring\n\nA printed coil spring (e.g. a button-return or controller spring) is a helix: sweep a wire circle, offset to the coil radius, upward while rotating (linear_extrude with twist, or a swept helix). Wire thickness >= ~1.6mm (2+ perimeters); the pitch (rise per turn) MUST exceed the wire thickness or the coils fuse into a tube. Print in TPU/PETG for real springiness. WARNING: render cost grows with turns*facets — keep turns and $fn modest so high-quality renders do not time out.'
      if (!isLocal) s += '\n\nReference example (helical compression coil, flat on z=0):\n\n' + COIL_SPRING_EXEMPLAR
      return s
    },
  },
}

/** Cap on auto-retrieved skills, so a prompt that name-drops several mechanisms can't
 *  balloon the system prompt. An explicit skillIds list is never capped. */
export const MAX_AUTO_SKILLS = 3

/** Prompt-intent → skill triggers, in priority order. Deliberately SPECIFIC (named
 *  mechanisms, not bare words) to keep false-positives low: "leaf spring" / "coil spring"
 *  fire their skill, but a bare "spring" fires neither. First match wins per skill. */
const TRIGGERS = [
  ['wheel-axle', /\bwheel|\baxle|\broll|\bcaster|\bchassis/i],
  ['rack-pinion', /\brack/i],
  ['spur-gear', /\bgear|\bcogs?\b|\bpinion/i],
  ['living-hinge', /\bliving[\s-]?hinge|\bflexure|\bfoldable|\bfold[\s-]?flat/i],
  ['print-in-place-hinge', /\bhinge|\bknuckle|\bpivot/i],
  ['snap-fit', /\bsnap[\s-]?fit|\bsnap[\s-]?on|\bclip|\blatch|\bclasp/i],
  ['ratchet', /\bratchet|\bpawl/i],
  ['coil-spring', /\bcoil[\s-]?spring|\bcompression[\s-]?spring|\bhelical[\s-]?spring|\bcontroller[\s-]?spring|\bbutton[\s-]?spring/i],
  ['leaf-spring', /\bleaf[\s-]?spring|\bcantilever[\s-]?spring|\bflex(?:y|ible)?[\s-]?(?:arm|tab|finger)/i],
]

/** Map per-request context to the ordered skill ids to inject.
 *  Precedence: (1) an explicit context.skillIds (router / live-check) wins outright;
 *  otherwise (2) context.kit seeds the baseplate skill and (3) context.prompt is matched
 *  against the mechanism TRIGGERS, capped at MAX_AUTO_SKILLS. */
export function selectSkills(context) {
  if (Array.isArray(context?.skillIds)) return context.skillIds.filter((id) => SKILLS[id])
  const out = []
  if (context?.kit) out.push('kit-baseplate')
  const text = typeof context?.prompt === 'string' ? context.prompt : ''
  if (text) {
    for (const [id, re] of TRIGGERS) {
      if (out.length >= MAX_AUTO_SKILLS) break
      if (!out.includes(id) && SKILLS[id] && re.test(text)) out.push(id)
    }
  }
  return out
}

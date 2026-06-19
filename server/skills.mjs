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
import { SCREWS, BEARINGS } from './hardware.mjs'

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

free_h = turns*pitch;
// helical sweep: a wire circle offset to the coil radius, extruded up while twisting
linear_extrude(height = free_h, twist = 360*turns, convexity = ceil(turns*2))
  translate([coil_d/2, 0, 0]) circle(d = wire_d);
`

const FASTENER_SEAT_EXEMPLAR = `// SKILL: threaded-fastener seat — holes/pockets sized for STANDARD hardware, not guesses.
// Pick the screw; the standard table sets the clearance Ø (loose shank), the heat-set
// insert pocket Ø, and the hex nut trap. Wrong sizes = a screw that won't pass, or strips.

/* [Fastener] */
screw = "M3"; // [M2.5, M3, M4, M5]
seat = "all"; // [all, clearance, insert, nut_trap]

// metric hardware (mm): [clearance Ø (close fit), heat-set insert pocket Ø, nut across-flats, nut thickness]
tbl = screw == "M2.5" ? [2.9, 3.5, 5.0, 2.0]
    : screw == "M3"   ? [3.4, 4.0, 5.5, 2.4]
    : screw == "M4"   ? [4.5, 5.6, 7.0, 3.2]
    :                   [5.5, 6.4, 8.0, 4.7];   // M5 (nut m=4.7 per ISO 4032)
clear_d = tbl[0]; insert_d = tbl[1]; nut_af = tbl[2]; nut_t = tbl[3];

block = 14;
module pad() translate([-block/2, -block/2, 0]) cube([block, block, 8]);

module clearance() difference() {            // screw shank passes freely
  pad();
  translate([0, 0, -1]) cylinder(h = 10, d = clear_d);
}
module insert() difference() {               // heat-set insert pocket + lead-in chamfer
  pad();
  translate([0, 0, 2]) cylinder(h = 7, d = insert_d);
  translate([0, 0, 8 - 1.2]) cylinder(h = 1.3, d1 = insert_d, d2 = insert_d + 1.4);
}
module nut_trap() difference() {             // captive hex nut + screw clearance through it
  pad();
  translate([0, 0, -1]) cylinder(h = 10, d = clear_d);
  translate([0, 0, -0.1]) cylinder(h = nut_t, d = nut_af / cos(30), $fn = 6);
}

if (seat == "all") { clearance(); translate([block+4, 0, 0]) insert(); translate([2*(block+4), 0, 0]) nut_trap(); }
else if (seat == "clearance") clearance();
else if (seat == "insert") insert();
else if (seat == "nut_trap") nut_trap();
`

const BEARING_POCKET_EXEMPLAR = `// SKILL: bearing pocket (608) — a seat for a standard 608 skate bearing (OD 22, ID 8,
// W 7 mm). Pocket Ø = OD + fit; a shoulder stops it at depth; a relief bore (> inner-race
// Ø, < OD) clears the rotating inner race so the seat never rubs it.

/* [Bearing 608] */
od = 22;          // outer Ø — 608 standard
id = 8;           // inner Ø (axle)
w = 7;            // width
fit = 0.1;        // [0:0.05:0.4]  press(0) .. slip(0.2) into the pocket
shoulder = 1.5;   // [1:0.5:3]     lip the outer race rests on

body = od + 8;
module bearing_seat() difference() {
  cylinder(h = w + shoulder + 2, d = body);
  translate([0, 0, 2]) cylinder(h = w + 1, d = od + fit*2);                 // the pocket (press/slip fit)
  translate([0, 0, -1]) cylinder(h = w + shoulder + 4, d = od - 2*shoulder); // relief bore + shoulder lip
}
bearing_seat();
`

const PLANETARY_EXEMPLAR = `// SKILL: planetary gearset — sun + N planets + internal ring, ALL one module + backlash.
// Concentricity: teeth_ring = teeth_sun + 2*teeth_planet. Even spacing (so every planet can
// engage) requires (teeth_sun + teeth_ring) % num_planets == 0 — enforced by an assert.

/* [Kit] */
part = "all"; // [all, sun, planet, ring]
explode = 0; // [0:1:20]

/* [Gears] */
mod = 1.5;          // [1:0.25:3]   shared module
teeth_sun = 12;     // [8:1:24]
teeth_planet = 12;  // [8:1:24]
num_planets = 4;    // [3:1:6]
thick = 6;          // [3:1:12]
bore = 4;           // [2:0.5:8]
backlash = 0.2;     // [0:0.05:0.5] MANDATORY > 0

teeth_ring = teeth_sun + 2*teeth_planet;   // concentricity
assert((teeth_sun + teeth_ring) % num_planets == 0,
  str("planets won't space evenly: (Zs+Zr)=", teeth_sun + teeth_ring, " is not divisible by num_planets=", num_planets));

function pol(r, a) = [r*cos(a), r*sin(a)];
module spur(N, drill) {
  pr = mod*N/2; rr = pr - 1.25*mod; orr = pr + mod;
  hp = ((PI*mod/2 - backlash)/2 / pr) * 180/PI; hroot = hp + 4; htip = max(hp - 4, 1);
  difference() {
    union() {
      cylinder(h = thick, r = rr + 0.2);
      for (i = [0:N-1]) rotate([0, 0, i*360/N]) linear_extrude(thick)
        polygon([pol(rr,-hroot), pol(orr,-htip), pol(orr,htip), pol(rr,hroot)]);
    }
    if (drill) translate([0, 0, -1]) cylinder(h = thick+2, r = bore/2);
  }
}
module ring() {
  pr = mod*teeth_ring/2;
  difference() {
    cylinder(h = thick, r = pr + mod + 4);
    translate([0, 0, -1]) linear_extrude(thick + 2) offset(delta = backlash) projection() spur(teeth_ring, false);  // internal teeth = negative of a ring-pitch gear
  }
}

carrier = mod*(teeth_sun + teeth_planet)/2;   // sun-planet centre distance
if (part == "all") {
  spur(teeth_sun, true);
  for (i = [0:num_planets-1]) rotate([0, 0, i*360/num_planets]) translate([carrier + explode, 0, 0]) spur(teeth_planet, true);
  ring();
} else if (part == "sun") spur(teeth_sun, true);
else if (part == "planet") spur(teeth_planet, true);
else if (part == "ring") ring();
`

const GT2_PULLEY_EXEMPLAR = `// SKILL: GT2 timing pulley — for 2mm-pitch GT2 belt. Pitch Ø = teeth*pitch/PI. Tooth count
// sets the ratio; flanges keep the belt on; a bore fits the motor shaft (add a set-screw if
// needed). Belt teeth are approximated as rounded grooves at the 2mm pitch around the rim.

/* [Pulley] */
teeth = 20;       // [16:1:60]
bore = 5;         // [3:0.5:8]
belt_w = 6;       // [6:1:12]   GT2-6 belt
flange = 1;       // [0.6:0.1:2] rim that retains the belt

pitch = 2;                  // GT2 standard (mm)
pd = teeth*pitch/PI;        // pitch diameter
groove = 0.95;              // belt-tooth groove radius

module pulley() difference() {
  union() {
    cylinder(h = belt_w, r = pd/2 + 0.4);                               // toothed body
    cylinder(h = flange, r = pd/2 + 1.6);                               // bottom flange
    translate([0, 0, belt_w - flange]) cylinder(h = flange, r = pd/2 + 1.6);  // top flange
  }
  for (i = [0:teeth-1]) rotate([0, 0, i*360/teeth]) translate([pd/2 + 0.4, 0, -1])
    cylinder(h = belt_w + 2, r = groove);                               // belt-tooth grooves
  translate([0, 0, -1]) cylinder(h = belt_w + 2, r = bore/2);           // shaft bore
}
pulley();
`

const HERRINGBONE_EXEMPLAR = `// SKILL: herringbone gear — two mirrored helical halves (a chevron). The opposed helix
// angles cancel axial thrust (unlike a single helical gear) while meshing smoother and
// quieter than a straight spur. Still one shared module + mandatory backlash > 0.

/* [Gear] */
mod = 2;          // [1:0.5:4]   shared module
teeth = 20;       // [10:1:50]
thick = 10;       // [6:1:24]
bore = 5;         // [2:0.5:10]
helix = 25;       // [10:1:40]   twist per half (deg) — the chevron angle
backlash = 0.25;  // [0:0.05:0.6] MANDATORY > 0

function pol(r, a) = [r*cos(a), r*sin(a)];
pr = mod*teeth/2; rr = pr - 1.25*mod; orr = pr + mod;
hp = ((PI*mod/2 - backlash)/2 / pr) * 180/PI; hroot = hp + 4; htip = max(hp - 4, 1);

module half(tw, h) union() {
  cylinder(h = h, r = rr + 0.2);
  for (i = [0:teeth-1]) rotate([0, 0, i*360/teeth]) linear_extrude(h, twist = tw, slices = 20)
    polygon([pol(rr,-hroot), pol(orr,-htip), pol(orr,htip), pol(rr,hroot)]);
}
difference() {
  union() {
    half(helix, thick/2);
    translate([0, 0, thick/2]) rotate([0, 0, helix]) half(-helix, thick/2);   // mirror twist -> chevron, aligned at the seam
  }
  translate([0, 0, -1]) cylinder(h = thick + 2, r = bore/2);
}
`

const FIT_PAIR_EXEMPLAR = `// SKILL: fit-pair — a generic peg + socket joint demonstrating the FIT LADDER. The female bore is
// ALWAYS the male diameter PLUS a named clearance; pick the fit for the function (press/slide/free).

/* [Kit] */
part = "all"; // [all, peg, socket]
explode = 0; // [0:1:20]

/* [Fit] */
peg_d = 8;        // [3:0.5:20]
fit = 0.2;        // [0:0.05:0.5]   bore = peg_d + fit  (press ~0.05 · slide ~0.2 · free ~0.35)
depth = 12;       // [6:1:30]       engagement depth
wall = 2;         // [1.2:0.1:4]

bore = peg_d + fit;                       // female bore — shared clearance, never a bare equal bore
module peg() cylinder(d = peg_d, h = depth + 3);
module socket() difference() {
  cylinder(d = peg_d + 2*wall, h = depth + wall);
  translate([0, 0, wall]) cylinder(d = bore, h = depth + 1);
}

if (part == "all") { socket(); translate([0, 0, wall + explode]) peg(); }   // peg seated in the socket bore
else if (part == "peg") peg();
else if (part == "socket") socket();
`

const BISTABLE_EXEMPLAR = `// SKILL: bistable snap — a shallow PRE-CURVED arch beam that buckles between two stable states (a
// click). The beam is THIN so it snaps elastically; print PETG/Nylon with layers across the arch.

/* [Bistable] */
span = 40;        // [20:1:80]    anchor-to-anchor
rise = 6;         // [3:0.5:12]   arch height = the snap travel
beam_t = 1.0;     // [0.6:0.1:1.8] beam thickness — THIN enough to buckle, not snap off
width = 10;       // [5:1:24]
post = 4;         // anchor blocks

function arch(x) = rise * (1 - pow(2*x/span - 1, 2));   // shallow parabola: 0 at the ends, rise at center
steps = 24;
top = [for (i = [0:steps]) [i*span/steps, arch(i*span/steps) + beam_t]];
bot = [for (i = [steps:-1:0]) [i*span/steps, arch(i*span/steps)]];

module beam() linear_extrude(width) polygon(concat(top, bot));
beam();
cube([post, width, post]);                                   // left anchor (envelops the beam end)
translate([span - post, 0, 0]) cube([post, width, post]);    // right anchor
`

const BUTTON_RETURN_EXEMPLAR = `// SKILL: button-return — a push button that travels in a guide bore and returns on a SEATED metal
// compression spring (a pocket sized for a standard spring — NOT a printed coil). Shaft slides on
// a clearance fit; the cap stops at the housing mouth.

/* [Kit] */
part = "all"; // [all, housing, button]
explode = 0; // [0:1:20]

/* [Button] */
cap_d = 14;       // [8:1:30]
shaft_d = 6;      // [3:0.5:12]
fit = 0.3;        // [0.2:0.05:0.5]   guide clearance: bore = shaft_d + fit
travel = 4;       // [2:0.5:10]
spring_d = 5;     // [3:0.5:10]       metal compression spring OD (seated, not printed)
spring_h = 8;     // [4:1:16]
wall = 2;         // [1.2:0.1:4]

bore = shaft_d + fit;                          // shaft slides in the guide bore (shared clearance)
housing_d = cap_d + 2*wall;
housing_h = spring_h + travel + wall;
module housing() difference() {
  cylinder(d = housing_d, h = housing_h);
  translate([0, 0, wall]) cylinder(d = spring_d + 1, h = spring_h);          // spring seat pocket (metal spring)
  translate([0, 0, wall + spring_h]) cylinder(d = bore, h = housing_h);      // guide bore above the seat
}
module button() {
  cylinder(d = shaft_d, h = spring_h + travel);                              // shaft rests on the spring, rides the bore
  translate([0, 0, spring_h + travel]) cylinder(d = cap_d, h = 3);           // cap
}

if (part == "all") { housing(); translate([0, 0, wall + explode]) button(); }
else if (part == "housing") housing();
else if (part == "button") button();
`

// ── Stylized hard-surface FORM recipes (backlog) ─────────────────────────────────────────────
// Reusable parametric modules for the stylized features that most often COLLAPSE when a model
// reads them correctly but can't synthesize them: a flared crown, a hollow crenellated crown, an
// open forked cradle. Each encodes the anti-collapse invariant as a parameter the validator checks.

const CROWN_CORONET_EXEMPLAR = `// SKILL: crown / coronet — a flared, fluted collar WIDEST AT THE TOP (a king/queen crown, a trophy
// coronet). The collapse mode is a blocky inverted cone (top narrower than base) — so top_d MUST
// exceed base_d. A hollow shell with an open, scalloped (pointed) rim. Flat on z=0.

/* [Coronet] */
base_d = 16;      // [10:1:40]   diameter at the neck (BOTTOM)
top_d = 28;       // [14:1:60]   diameter at the rim (TOP) — MUST exceed base_d (it FLARES OUTWARD)
height = 20;      // [8:1:40]
points = 6;       // [4:1:12]    scallops/points around the rim
wall = 2.4;       // [1.6:0.2:4]

seg = max(24, 4*points);
module flare(d0, dt, h) linear_extrude(height = h, scale = dt/d0, convexity = 5) circle(d = d0, $fn = seg);

difference() {
  flare(base_d, top_d, height);                                       // flared outer shell
  translate([0, 0, wall]) flare(base_d - 2*wall, top_d - 2*wall, height + 1);  // hollow, open rim
  for (i = [0:points-1]) rotate([0, 0, 360/points*i])                 // scallop the rim into points
    translate([top_d/2, 0, height]) sphere(d = max(2, top_d/points*1.1), $fn = 16);
}
`

const HOLLOW_CRENELLATION_EXEMPLAR = `// SKILL: hollow crenellation — a castle/rook battlement crown: a ring of merlons separated by
// crenel gaps AND a SUNKEN hollow interior. The collapse mode is a solid closed cylinder (no
// notches, no hollow) — so inner_d MUST be > 0 and < outer_d, with merlons >= 2. Flat on z=0.

/* [Battlement] */
outer_d = 26;     // [14:1:60]
inner_d = 16;     // [6:1:50]    the HOLLOW bore — MUST be > 0 and < outer_d
height = 16;      // [8:1:40]
merlons = 6;      // [4:1:12]    teeth, with a crenel gap between each
crenel = 6;       // [3:1:14]    notch depth from the top

seg = max(24, 4*merlons);
gapw = outer_d * sin(180/merlons);
difference() {
  cylinder(d = outer_d, h = height, $fn = seg);
  translate([0, 0, 2]) cylinder(d = inner_d, h = height, $fn = seg);          // sunken hollow interior
  for (i = [0:merlons-1]) rotate([0, 0, 360/merlons*i])                       // crenel gaps in the rim
    translate([outer_d/2, 0, height - crenel/2]) cube([outer_d, gapw, crenel + 1], center = true);
}
`

const OPEN_PRONG_ORB_EXEMPLAR = `// SKILL: open prongs cradling an orb — a bishop's split mitre, a forked claw holder: two+ prongs
// that DO NOT TOUCH (an open gap) cradling a SEPARATE smooth orb. The collapse mode is the prongs
// fusing into a solid blob — so gap MUST be > 0 and the orb is its own body. Flat on z=0.

/* [Fork] */
prongs = 3;       // [2:1:6]
gap = 4;          // [1:0.5:14]   the open gap that keeps the prong tips apart — MUST be > 0
prong_h = 30;     // [12:1:60]
prong_w = 5;      // [2:0.5:12]
orb_d = 16;       // [8:1:40]
base_d = 20;      // [10:1:50]

ring_r = orb_d/2 + gap + prong_w/2;   // prongs sit a gap away from the orb surface
module prong(a) rotate([0, 0, a]) hull() {
  translate([base_d/3, 0, 0]) cylinder(d = prong_w, h = 0.1, $fn = 20);
  translate([ring_r, 0, prong_h]) cylinder(d = prong_w, h = 0.1, $fn = 20);
}

union() {
  cylinder(d = base_d, h = 4, $fn = 48);                       // base
  for (i = [0:prongs-1]) prong(360/prongs*i);                  // open prongs — separated by gap, never meet
  translate([0, 0, prong_h]) sphere(d = orb_d, $fn = 40);      // the cradled orb (its own body)
}
`

export const SKILLS = {
  'kit-baseplate': {
    id: 'kit-baseplate',
    version: 1,
    paramAliases: { clearance: 'spin_fit', wall: 'wall' },
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
    version: 1,
    paramAliases: { clearance: 'spin_fit' },
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
    version: 1,
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
    version: 1,
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
    version: 1,
    paramAliases: { clearance: 'fit' },
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
    version: 1,
    paramAliases: { clearance: 'gap' },
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
    version: 1,
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
    version: 1,
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
    version: 1,
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
    version: 1,
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

  'threaded-fastener-seat': {
    id: 'threaded-fastener-seat',
    version: 2, // v2: dims sourced from the hardware catalog; M5 nut trap 4.0→4.7mm (ISO 4032)
    exemplar: FASTENER_SEAT_EXEMPLAR,
    validate(code) {
      const issues = []
      if (!/\bM[2-8](?:\.5)?\b/.test(code)) issues.push('threaded-fastener seat must be sized to a STANDARD screw (M2.5/M3/M4/M5…), not an arbitrary hole diameter')
      return issues
    },
    brokenControl: (code) => code.replace(/\bM[2-8](?:\.5)?\b/g, 'Xx'),
    fragment(engine) {
      const isLocal = typeof engine === 'string' && engine.startsWith('local:')
      let s =
        `\n\n# Threaded-fastener seats\n\nSize fastener features to STANDARD metric hardware, never an arbitrary hole. Three patterns: (1) a clearance hole for the screw shank — close fit ~M3=${SCREWS.M3.clearance}mm, M4=${SCREWS.M4.clearance}mm (so the screw passes but does not strip); (2) a heat-set insert pocket sized to the insert OD (~M3=${SCREWS.M3.insertDia}mm, M4=${SCREWS.M4.insertDia}mm) with a lead-in chamfer; (3) a captive hex nut trap (across-flats ~M3=${SCREWS.M3.nutAF}mm, M4=${SCREWS.M4.nutAF}mm) plus a screw clearance through it. Build a hex pocket as a 6-faceted cylinder whose diameter = across_flats / cos(30). Expose the screw size as a parameter and look the dimensions up.`
      if (!isLocal) s += '\n\nReference example (clearance / heat-set insert / nut-trap, standard sizes, flat on z=0):\n\n' + FASTENER_SEAT_EXEMPLAR
      return s
    },
  },

  'bearing-608-pocket': {
    id: 'bearing-608-pocket',
    version: 1,
    paramAliases: { clearance: 'fit' },
    exemplar: BEARING_POCKET_EXEMPLAR,
    validate(code) {
      const STD_OD = BEARINGS['608'].od // single source of truth (hardware.mjs)
      const m = code.match(/\bod\s*=\s*([\d.]+)/)
      const od = m ? parseFloat(m[1]) : null
      const issues = []
      if (od === null) issues.push('608 bearing pocket must declare the outer Ø (od)')
      else if (Math.abs(od - STD_OD) > 0.5) issues.push(`608 bearing pocket outer Ø is ${od}mm — the 608 standard is ${STD_OD}mm`)
      if (!/\bfit\b/.test(code)) issues.push('bearing pocket needs a fit clearance on the pocket Ø (press vs slip), or the bearing will not seat')
      return issues
    },
    brokenControl: (code) => code.replace(new RegExp(`\\bod\\s*=\\s*${BEARINGS['608'].od}\\b`), 'od = 30'),
    fragment(engine) {
      const isLocal = typeof engine === 'string' && engine.startsWith('local:')
      let s =
        `\n\n# Bearing pocket (608)\n\nA 608 skate bearing is OD ${BEARINGS['608'].od}mm, ID ${BEARINGS['608'].id}mm, width ${BEARINGS['608'].w}mm (the de-facto standard for spinners, wheels, lazy-susans). Seat it in a pocket sized OD + a fit allowance (press fit ~0, slip fit ~0.2mm). Add a shoulder/lip the outer race rests on at a defined depth, and a relief bore through the centre that is wider than the rotating inner race but narrower than the OD — so the seat grips the outer race only and never rubs the spinning inner race. Expose the fit as a parameter.`
      if (!isLocal) s += '\n\nReference example (608 pocket with shoulder + inner-race relief, flat on z=0):\n\n' + BEARING_POCKET_EXEMPLAR
      return s
    },
  },

  'planetary': {
    id: 'planetary',
    version: 1,
    exemplar: PLANETARY_EXEMPLAR,
    validate(code) {
      // inspect code, not prose: a comment describing the constraint must not satisfy it
      const src = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
      const issues = []
      const b = src.match(/backlash\s*=\s*([\d.]+)/)
      const bl = b ? parseFloat(b[1]) : null
      if (bl === null || bl <= 0) issues.push('planetary gears must have backlash > 0 on every mesh')
      if (!/assert\s*\(|%\s*num_planets|%\s*\w*planets?\b/i.test(src)) issues.push('planetary must enforce the even-spacing constraint (Zsun + Zring) % planets == 0 (e.g. an assert) — otherwise the planets cannot all engage')
      if (!/teeth_ring\s*=[^\n]*teeth_sun[^\n]*teeth_planet/i.test(src)) issues.push('ring teeth must be derived for concentricity: teeth_ring = teeth_sun + 2*teeth_planet')
      return issues
    },
    brokenControl: (code) => code.replace(/assert\s*\([\s\S]*?\);/, ''),
    fragment(engine) {
      const isLocal = typeof engine === 'string' && engine.startsWith('local:')
      let s =
        '\n\n# Planetary (epicyclic) gearset\n\nA planetary set is a central sun gear, several planet gears, and an internal ring gear — ALL sharing one module and a backlash allowance. TWO constraints are mandatory, and getting them wrong is the classic failure: (1) concentricity — teeth_ring = teeth_sun + 2*teeth_planet; (2) even spacing — (teeth_sun + teeth_ring) must be divisible by num_planets, or the planets cannot all mesh. Assert the divisibility so a bad tooth count fails loudly. Build the internal ring teeth by subtracting an offset (backlash) projection of a ring-pitch gear from a disc.'
      if (!isLocal) s += '\n\nReference example (sun + planets + internal ring, asserted constraints, flat on z=0):\n\n' + PLANETARY_EXEMPLAR
      return s
    },
  },

  'gt2-pulley': {
    id: 'gt2-pulley',
    version: 1,
    exemplar: GT2_PULLEY_EXEMPLAR,
    validate(code) {
      const src = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
      const m = src.match(/pitch\s*=\s*([\d.]+)/)
      const p = m ? parseFloat(m[1]) : null
      const issues = []
      if (p === null) issues.push('GT2 pulley must declare the belt pitch')
      else if (Math.abs(p - 2) > 0.01) issues.push(`GT2 belt pitch is 2mm — got ${p}mm`)
      if (!/teeth\s*\*\s*pitch\s*\/\s*PI|teeth\s*\*\s*2\s*\/\s*PI|pd\s*=[^\n]*teeth[^\n]*PI/i.test(src)) issues.push('pitch diameter must be teeth*pitch/PI for a GT2 pulley')
      return issues
    },
    brokenControl: (code) => code.replace(/pitch\s*=\s*2\b/, 'pitch = 3'),
    fragment(engine) {
      const isLocal = typeof engine === 'string' && engine.startsWith('local:')
      let s =
        '\n\n# GT2 timing pulley\n\nA GT2 pulley drives a 2mm-pitch GT2 belt (the standard on most printers/CNC). Pitch diameter = teeth*2/PI; the tooth count sets the gear ratio. Add a flange (raised rim) on each side to keep the belt tracking, and a bore for the shaft (a set-screw flat/hole if it must not slip). Approximate the belt teeth as rounded grooves spaced at the 2mm pitch around the rim. Expose teeth, bore, and belt width.'
      if (!isLocal) s += '\n\nReference example (flanged GT2 pulley, 2mm pitch, flat on z=0):\n\n' + GT2_PULLEY_EXEMPLAR
      return s
    },
  },

  'herringbone': {
    id: 'herringbone',
    version: 1,
    exemplar: HERRINGBONE_EXEMPLAR,
    validate(code) {
      const src = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
      const b = src.match(/backlash\s*=\s*([\d.]+)/)
      const bl = b ? parseFloat(b[1]) : null
      const issues = []
      if (bl === null || bl <= 0) issues.push('herringbone gear must have backlash > 0')
      if (!/twist|helix/i.test(src)) issues.push('herringbone needs a helix/twist angle — two mirrored helical halves form the chevron')
      return issues
    },
    brokenControl: (code) => code.replace(/backlash\s*=\s*[\d.]+/, 'backlash = 0'),
    fragment(engine) {
      const isLocal = typeof engine === 'string' && engine.startsWith('local:')
      let s =
        '\n\n# Herringbone / helical gear\n\nA herringbone gear is two mirrored helical halves (a chevron): the opposed helix angles cancel the axial thrust a single helical gear produces, while meshing smoother and quieter than a straight spur. Build each half with a twisted linear_extrude (one +helix, one -helix), aligned at the seam. Still one shared module across a meshing pair and a mandatory backlash > 0. Expose module, tooth count, thickness, helix angle, and bore.'
      if (!isLocal) s += '\n\nReference example (mirrored helical halves, backlash > 0, flat on z=0):\n\n' + HERRINGBONE_EXEMPLAR
      return s
    },
  },

  'fit-pair': {
    id: 'fit-pair',
    version: 1,
    paramAliases: { clearance: 'fit', wall: 'wall' },
    exemplar: FIT_PAIR_EXEMPLAR,
    validate(code) {
      const issues = []
      if (!clearanceFitOk(code, 'peg_d')) issues.push('fit-pair bore must be the male size + a named clearance (bore = peg_d + fit) — a bare equal-size bore seizes')
      return issues
    },
    fragment(engine) {
      const isLocal = typeof engine === 'string' && engine.startsWith('local:')
      let s =
        '\n\n# Fit-pair (peg + socket)\n\nFor ANY mating pair, the female bore is the male dimension PLUS a named clearance parameter — never two independent equal numbers (they fuse instead of joining). Pick the fit by function: press ~0.05mm (permanent), slide ~0.2mm (assembly), free ~0.35mm (spins). Expose the male size + one clearance; derive the bore.'
      if (!isLocal) s += '\n\nReference example (peg + socket, bore = peg_d + fit, flat on z=0):\n\n' + FIT_PAIR_EXEMPLAR
      return s
    },
  },

  'bistable': {
    id: 'bistable',
    version: 1,
    exemplar: BISTABLE_EXEMPLAR,
    validate(code) {
      const m = code.match(/beam_t\s*=\s*([\d.]+)/)
      const t = m ? parseFloat(m[1]) : null
      const issues = []
      if (t === null) issues.push('bistable must expose a thin beam thickness (beam_t)')
      else if (t < 0.4 || t > 1.8) issues.push(`bistable beam is ${t}mm — must be ~0.6-1.2mm so the arch buckles elastically; too thick snaps off, too thin will not hold a state`)
      return issues
    },
    brokenControl: (code) => code.replace(/beam_t\s*=\s*[\d.]+/, 'beam_t = 3'),
    fragment(engine) {
      const isLocal = typeof engine === 'string' && engine.startsWith('local:')
      let s =
        '\n\n# Bistable snap\n\nA bistable click is a shallow PRE-CURVED arch beam anchored at both ends that buckles between two stable states. The beam must be THIN (~0.6-1.2mm) so it snaps elastically without breaking; the arch rise is the snap travel. Print PETG/Nylon with layer lines running across the arch (not along it). Expose span, rise, and beam thickness.'
      if (!isLocal) s += '\n\nReference example (anchored shallow arch beam, flat on z=0):\n\n' + BISTABLE_EXEMPLAR
      return s
    },
  },

  'button-return': {
    id: 'button-return',
    version: 1,
    paramAliases: { clearance: 'fit', wall: 'wall' },
    exemplar: BUTTON_RETURN_EXEMPLAR,
    validate(code) {
      const issues = []
      if (!clearanceFitOk(code, 'shaft_d')) issues.push('button-return guide bore must be shaft_d + a clearance (bore = shaft_d + fit), or the button binds')
      if (!/\bspring_d\b/.test(code)) issues.push('button-return must seat a STANDARD metal compression spring (a spring_d pocket) — do not print a coil spring')
      return issues
    },
    fragment(engine) {
      const isLocal = typeof engine === 'string' && engine.startsWith('local:')
      let s =
        '\n\n# Button-return\n\nA returning push button rides in a guide bore (bore = shaft_d + a clearance fit) and returns on a SEATED metal compression spring — a pocket sized to a standard spring OD, NOT a printed coil (printed coils are unreliable + render-heavy). The shaft rests on the spring; a cap stops at the housing mouth; expose travel, the spring pocket, and the guide clearance.'
      if (!isLocal) s += '\n\nReference example (housing with a spring seat + a guided button, flat on z=0):\n\n' + BUTTON_RETURN_EXEMPLAR
      return s
    },
  },

  'crown-coronet': {
    id: 'crown-coronet',
    version: 1,
    exemplar: CROWN_CORONET_EXEMPLAR,
    validate(code) {
      const issues = []
      const t = code.match(/\btop_d\s*=\s*([\d.]+)/)
      const b = code.match(/\bbase_d\s*=\s*([\d.]+)/)
      if (!t || !b) issues.push('coronet must declare base_d (neck, bottom) and top_d (rim, top)')
      else if (parseFloat(t[1]) <= parseFloat(b[1])) issues.push(`coronet must FLARE OUTWARD: top_d (${t[1]}) must exceed base_d (${b[1]}) — top ≤ base is the blocky inverted-cone collapse`)
      return issues
    },
    brokenControl: (code) => code.replace(/\btop_d\s*=\s*[\d.]+/, 'top_d = 10'),
    fragment(engine) {
      const isLocal = typeof engine === 'string' && engine.startsWith('local:')
      let s =
        '\n\n# Crown / coronet\n\nA crown or coronet FLARES OUTWARD — it is WIDEST AT THE TOP rim, never a blocky inverted cone. Build it as a hollow shell (linear_extrude with scale > 1 from a neck diameter up to a larger rim diameter), then scallop or notch the open rim into points. Keep top_d > base_d; the points are recessed cuts, not a polygonized whole body.'
      if (!isLocal) s += '\n\nReference example (flared hollow coronet with a scalloped rim, flat on z=0):\n\n' + CROWN_CORONET_EXEMPLAR
      return s
    },
  },

  'hollow-crenellation': {
    id: 'hollow-crenellation',
    version: 1,
    exemplar: HOLLOW_CRENELLATION_EXEMPLAR,
    validate(code) {
      const issues = []
      const o = code.match(/\bouter_d\s*=\s*([\d.]+)/)
      const i = code.match(/\binner_d\s*=\s*([\d.]+)/)
      if (!o || !i) issues.push('crenellation must declare outer_d and inner_d (the hollow bore)')
      else if (parseFloat(i[1]) <= 0 || parseFloat(i[1]) >= parseFloat(o[1])) issues.push(`crenellation must be HOLLOW: inner_d (${i[1]}) must be > 0 and < outer_d (${o[1]}) — a solid closed cylinder is the collapse`)
      if (!/\bmerlons\b/.test(code)) issues.push('crenellation needs merlons (teeth) with crenel gaps between them, not a smooth rim')
      return issues
    },
    brokenControl: (code) => code.replace(/\binner_d\s*=\s*[\d.]+/, 'inner_d = 0'),
    fragment(engine) {
      const isLocal = typeof engine === 'string' && engine.startsWith('local:')
      let s =
        '\n\n# Hollow crenellation (battlement)\n\nA castle/rook battlement crown is HOLLOW (a sunken interior bore, inner_d > 0 and < outer_d) and its rim is a ring of merlons separated by crenel gaps — never a solid closed cylinder. Subtract the central bore AND the crenel gaps from the top.'
      if (!isLocal) s += '\n\nReference example (hollow crenellated crown with merlon/crenel rim, flat on z=0):\n\n' + HOLLOW_CRENELLATION_EXEMPLAR
      return s
    },
  },

  'open-prong-cradle': {
    id: 'open-prong-cradle',
    version: 1,
    exemplar: OPEN_PRONG_ORB_EXEMPLAR,
    validate(code) {
      const issues = []
      const g = code.match(/\bgap\s*=\s*([\d.]+)/)
      if (!g) issues.push('open-prong cradle must declare a gap between the prongs')
      else if (parseFloat(g[1]) <= 0) issues.push(`prongs must stay OPEN: gap (${g[1]}) must be > 0 — gap 0 fuses the fork into a solid blob`)
      if (!/\borb_d\b/.test(code)) issues.push('the cradled orb must be its own body (orb_d), not merged into the prongs')
      return issues
    },
    brokenControl: (code) => code.replace(/\bgap\s*=\s*[\d.]+/, 'gap = 0'),
    fragment(engine) {
      const isLocal = typeof engine === 'string' && engine.startsWith('local:')
      let s =
        '\n\n# Open forked cradle\n\nA bishop\'s split mitre / a forked claw is OPEN — two or more prongs that DO NOT touch (a positive gap between the tips) cradling a separate smooth orb. Never fuse the prongs into a solid wedge. Keep gap > 0 and model the orb as its own body resting in the fork.'
      if (!isLocal) s += '\n\nReference example (open prongs + a separate cradled orb, flat on z=0):\n\n' + OPEN_PRONG_ORB_EXEMPLAR
      return s
    },
  },
}

/** Cap on auto-retrieved skills, so a prompt that name-drops several mechanisms can't
 *  balloon the system prompt. The scored router keeps the top-N by relevance (NOT the
 *  array tail) and surfaces what it dropped. */
export const MAX_AUTO_SKILLS = 3

/** Hard ceiling on an EXPLICIT skillIds list (applied-patterns chip / router). The chip
 *  sends the full curated set, so the explicit path is REPLACE — but it must still be bounded:
 *  an unbounded list (all 18 → a full exemplar each) would balloon the prompt, a risk that
 *  became acute once a router can emit lists. Higher than the auto cap (explicit = intentional). */
export const MAX_SKILLS = 6

/** Prompt-intent → skill triggers, in TIE-BREAK priority order (when two skills score equal,
 *  the earlier row wins). Deliberately SPECIFIC (named mechanisms, not bare words) to keep
 *  false-positives low: "leaf spring" / "coil spring" fire their skill, a bare "spring" fires
 *  neither. The router scores every match; this order only breaks ties. */
const TRIGGERS = [
  ['wheel-axle', /\bwheel|\baxle|\broll|\bcaster|\bchassis/i],
  ['rack-pinion', /\brack/i],
  ['planetary', /\bplanetary|\bepicyclic|\bsun[\s-]?gear/i],
  ['herringbone', /\bherringbone|\bhelical/i],
  ['spur-gear', /\bgear|\bcogs?\b|\bpinion/i],
  ['gt2-pulley', /\bgt2|\bpulley|\btiming[\s-]?belt|\btiming[\s-]?pulley|\bbelt[\s-]?drive/i],
  ['living-hinge', /\bliving[\s-]?hinge|\bflexure|\bfoldable|\bfold[\s-]?flat/i],
  ['print-in-place-hinge', /\bhinge|\bknuckle|\bpivot/i],
  ['snap-fit', /\bsnap[\s-]?fit|\bsnap[\s-]?on|\bclip|\blatch|\bclasp/i],
  ['ratchet', /\bratchet|\bpawl/i],
  ['coil-spring', /\bcoil[\s-]?spring|\bcompression[\s-]?spring|\bhelical[\s-]?spring|\bcontroller[\s-]?spring|\bbutton[\s-]?spring/i],
  ['leaf-spring', /\bleaf[\s-]?spring|\bcantilever[\s-]?spring|\bflex(?:y|ible)?[\s-]?(?:arm|tab|finger)/i],
  ['bearing-608-pocket', /\bbearing|\b608\b/i],
  ['threaded-fastener-seat', /\bscrew|\bbolt\b|\bheat[\s-]?set|\bnut[\s-]?trap|\bthreaded?\b|\bM[2-8](?:\.5)?\b|\btapped\b|\bfasten/i],
  ['button-return', /\bbutton|\bpush[\s-]?button|\bplunger|\bkeycap|\breturn[\s-]?spring/i],
  ['bistable', /\bbistable|\bsnap[\s-]?through|\bclicker\b|\bmono?stable/i],
  ['fit-pair', /\bfit[\s-]?pair|\bpeg\b|\bsockets?\b|\bdowel/i],
  // stylized hard-surface FORM recipes (general, not chess-specific)
  ['crown-coronet', /\bcrown|\bcoronet|\btiara|\bdiadem/i],
  ['hollow-crenellation', /\bcrenell?at|\bbattlement|\bmerlon|\bturret|\bparapet|\brook\b|\bcastle\b/i],
  ['open-prong-cradle', /\bprong|\bforked?\b|\bclaw\b|\bmitre|\bmiter|\bcradl/i],
]

/** A skill is selectable only if it exists AND is not quarantined. Quarantine (an entry flag)
 *  disables a skill found to misbehave post-ship WITHOUT deleting it — selectSkills never injects
 *  a quarantined skill, even via an explicit skillIds list. (Compile failure is caught earlier,
 *  by the zero-API walker, which blocks merging a broken exemplar.) */
const usable = (id) => !!SKILLS[id] && !SKILLS[id].quarantine

/** Tie-break order: a skill's index in TRIGGERS (earlier = higher priority when scores tie). */
const TRIGGER_INDEX = new Map(TRIGGERS.map(([id], i) => [id, i]))

/** Co-requirement edges: when the requirer is a candidate AND the required skill ALSO matched,
 *  the required skill rides just above its requirer so the cap can't split a pair that belongs
 *  together (the board's named case: a wheel running on a bearing). Never ADDS a skill that did
 *  not match on its own — only re-ranks, so no false positives. */
const COREQUIRES = { 'wheel-axle': ['bearing-608-pocket'] }

/** Score every triggerable (non-quarantined) skill against the request. Higher = more relevant.
 *  A direct prompt hit (2) outweighs the model's carried intent.domainTags (2), archetype (1),
 *  and signatureFeatures (1). Deterministic: identical context → identical scores (so the
 *  zero-API retrieval.selftest still gates the router — no embedding/LLM call on the hot path). */
function scoreSkills(context) {
  const prompt = typeof context?.prompt === 'string' ? context.prompt : ''
  const intent = context?.intent ?? {}
  const tags = Array.isArray(intent.domainTags) ? intent.domainTags.join(' ') : ''
  const arche = typeof intent.archetype === 'string' ? intent.archetype : ''
  const sig = Array.isArray(intent.signatureFeatures) ? intent.signatureFeatures.join(' ') : ''
  const sources = [
    [prompt, 2],
    [tags, 2],
    [arche, 1],
    [sig, 1],
  ]
  const score = {}
  for (const [id, re] of TRIGGERS) {
    if (!usable(id)) continue
    let sc = 0
    for (const [text, w] of sources) if (text && re.test(text)) sc += w
    if (sc > 0) score[id] = sc
  }
  for (const [req, deps] of Object.entries(COREQUIRES)) {
    if (score[req] == null) continue
    for (const d of deps) if (score[d] != null && usable(d)) score[d] = Math.max(score[d], score[req] + 0.1)
  }
  return score
}

/**
 * Resolve the skills for a request, exposing BOTH what was selected and what the cap dropped.
 *  - explicit context.skillIds (applied-patterns chip / router): the authoritative curated set,
 *    deduped, usable-filtered, and bounded by MAX_SKILLS (REPLACE — the chip sends the full set).
 *  - otherwise: context.kit seeds kit-baseplate, then the scored router ranks every match
 *    (prompt + carried intent) and keeps the top MAX_AUTO_SKILLS by RELEVANCE; the rest are
 *    `dropped` (observable, never silently truncated). `scores` is returned for telemetry.
 */
export function selectSkillsDetailed(context) {
  if (Array.isArray(context?.skillIds)) {
    const seen = new Set()
    const selected = []
    const dropped = []
    for (const id of context.skillIds) {
      if (!usable(id) || seen.has(id)) continue
      seen.add(id)
      if (selected.length < MAX_SKILLS) selected.push(id)
      else dropped.push(id)
    }
    return { selected, dropped, scores: {} }
  }
  const selected = []
  if (context?.kit && usable('kit-baseplate')) selected.push('kit-baseplate')
  const score = scoreSkills(context)
  // tie-break by TRIGGERS index; `?? Infinity` defends a future co-required dep that isn't itself a
  // TRIGGERS row (else the comparator yields NaN and the sort becomes implementation-defined).
  const ranked = Object.keys(score).sort(
    (a, b) => score[b] - score[a] || (TRIGGER_INDEX.get(a) ?? Infinity) - (TRIGGER_INDEX.get(b) ?? Infinity),
  )
  const dropped = []
  for (const id of ranked) {
    if (selected.includes(id)) continue
    if (selected.length < MAX_AUTO_SKILLS) selected.push(id)
    else dropped.push(id)
  }
  return { selected, dropped, scores: score }
}

/** Ordered skill ids to inject for a request (the selected set). Back-compat wrapper over
 *  selectSkillsDetailed — callers that also want the dropped set call the detailed form. */
export function selectSkills(context) {
  return selectSkillsDetailed(context).selected
}

/* ── Composition port graph (P-backlog) ──
 * Instead of one hand-authored composed exemplar per skill pair (O(n^2)), declare typed PORTS per
 * skill: a `provides` port mates a matching `consumes` port on another selected skill. composePlan
 * derives the SPECIFIC mates (and any conflicts) for a selected set, which matingDirective turns
 * into concrete "seat X into Y on a shared axis with a <fit> clearance" guidance — so any compatible
 * SET composes without a bespoke exemplar. Start small (5 port types over the 18 skills); the
 * composed.mjs exemplars stay as gold for the highest-value pairs. Ratcheted by
 * bench/composition-graph.selftest.mjs. */
// One port name per JOINT type; the PROVIDER is the male side, the CONSUMER the female side
// (shaft↔bore, peg↔socket, spring↔pocket). mesh is symmetric (gears both provide + consume it).
const PORT_TYPES = ['shaft', 'mesh', 'peg', 'spring', 'fastener-seat']

/** Default FIT class per port type (the model resolves the mm value from the FIT ladder). */
const PORT_FIT = { shaft: 'slide', peg: 'press', mesh: 'mesh', spring: 'free', 'fastener-seat': 'clearance' }

/** The port graph: which skill provides/consumes which port. Central (not per-entry) so the whole
 *  graph is reviewable in one place; mesh is symmetric (gears both provide + consume it). */
const SKILL_PORTS = {
  'wheel-axle': { provides: ['shaft'] },
  'print-in-place-hinge': { provides: ['shaft'] }, // the captive pin
  'bearing-608-pocket': { consumes: ['shaft'] }, // its bore takes an axle
  'spur-gear': { provides: ['mesh'], consumes: ['shaft', 'mesh'] },
  'rack-pinion': { provides: ['mesh'], consumes: ['shaft', 'mesh'] },
  planetary: { provides: ['mesh'], consumes: ['shaft', 'mesh'] },
  herringbone: { provides: ['mesh'], consumes: ['shaft', 'mesh'] },
  'gt2-pulley': { consumes: ['shaft'] }, // belt-driven — a bore on a shaft, not a gear mesh
  ratchet: { consumes: ['shaft'] },
  'snap-fit': { provides: ['peg'], consumes: ['peg'] }, // clip (male) + keeper (female)
  'fit-pair': { provides: ['peg'], consumes: ['peg'] }, // peg (male) + socket (female)
  bistable: { provides: ['peg'] },
  'coil-spring': { provides: ['spring'] },
  'leaf-spring': { provides: ['spring'] },
  'button-return': { consumes: ['spring'] },
  'threaded-fastener-seat': { provides: ['fastener-seat'] },
}

export { PORT_TYPES, SKILL_PORTS, PORT_FIT }

/**
 * Derive the mates (and conflicts) for a selected skill set from the port graph. A mate exists when
 * one selected skill PROVIDES a port another selected skill CONSUMES. Unordered-deduped; ignores
 * skills without ports and quarantined skills. Returns { mates:[{provider,consumer,port,fit}], conflicts:[[a,b]] }.
 */
export function composePlan(skillIds) {
  const ids = (Array.isArray(skillIds) ? skillIds : []).filter(usable)
  const provByPort = new Map()
  const consByPort = new Map()
  for (const id of ids) {
    const p = SKILL_PORTS[id]
    if (!p) continue
    for (const port of p.provides ?? []) provByPort.set(port, [...(provByPort.get(port) ?? []), id])
    for (const port of p.consumes ?? []) consByPort.set(port, [...(consByPort.get(port) ?? []), id])
  }
  const mates = []
  const seen = new Set()
  for (const [port, providers] of provByPort) {
    for (const provider of providers) {
      for (const consumer of consByPort.get(port) ?? []) {
        if (provider === consumer) continue
        const key = `${port}|${[provider, consumer].sort().join('+')}`
        if (seen.has(key)) continue
        seen.add(key)
        mates.push({ provider, consumer, port, fit: PORT_FIT[port] ?? 'slide' })
      }
    }
  }
  const conflicts = []
  const cseen = new Set()
  for (const id of ids) {
    for (const other of SKILLS[id]?.conflictsWith ?? []) {
      if (!ids.includes(other)) continue
      const key = [id, other].sort().join('+')
      if (cseen.has(key)) continue
      cseen.add(key)
      conflicts.push([id, other].sort())
    }
  }
  return { mates, conflicts }
}

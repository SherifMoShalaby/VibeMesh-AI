/* Composed exemplars (P7) — >=2 mechanisms in ONE program: a single MERGED Customizer block (one
 * `clearance`, one `wall`), a `part` enum with `all` first + an `explode` knob, joints COINCIDENT
 * in `all` (pieces mate, not scatter), and the `_debug` interference contract (so the zero-API
 * walker can voxelize protected structure vs cutters). These are both the assembler's few-shot and
 * the composition probe's fixtures. No global $fn (the quality presets own curve resolution).
 */
import { BEARINGS } from './hardware.mjs'

// axle spin-joint + snap retention: a chassis with an upright pin (snap flare at the tip) and a hub
// that snaps onto the pin and spins on it — ONE shared `clearance` drives the spin bore AND the snap
// groove. The `_debug` probe protects the pin column from the chassis lightening pocket.
const AXLE_SNAP = `// COMPOSED: chassis + snap-on spinning hub (axle spin-joint + snap-fit retention).
/* [Kit] */
part = "all"; // [all, chassis, hub]
explode = 0; // [0:1:25]
_debug = "off"; // [off, positives, negatives]

/* [Fit] */
clearance = 0.3;  // [0.2:0.05:0.5]   ONE shared clearance: spin bore AND snap groove
wall = 2;         // [1.2:0.1:4]

/* [Geometry] */
plate = 30;
pin_d = 6;
pin_len = 16;
lip = 1.4;        // snap flare + retention
hub_d = 20;
hub_h = 10;

bore = pin_d + clearance;                 // hub spins on the pin (shared clearance)
pocket_d = plate - 4*wall;                // underside lightening pocket — must clear the pin column
pocket_h = wall - 0.8;                    // leaves an 0.8mm floor (never reaches the pin above)

module pin() {
  cylinder(d = pin_d, h = pin_len);
  translate([0, 0, pin_len - lip]) cylinder(d1 = pin_d, d2 = pin_d + lip, h = lip);   // snap flare at the tip
}
module pocket_cutter() translate([0, 0, -1]) cylinder(d = pocket_d, h = pocket_h + 1);
module chassis() {
  difference() {
    translate([-plate / 2, -plate / 2, 0]) cube([plate, plate, wall]);
    pocket_cutter();
  }
  translate([0, 0, wall]) pin();
}
module hub() difference() {
  cylinder(d = hub_d, h = hub_h);
  translate([0, 0, -1]) cylinder(d = bore, h = hub_h + 2);                                       // spin bore (clearance)
  translate([0, 0, hub_h - lip - clearance]) cylinder(d1 = bore, d2 = pin_d + 2 * lip, h = lip + clearance + 1); // snap groove past the flare
}

if (_debug == "positives") {
  translate([0, 0, wall]) cylinder(d = pin_d, h = pin_len);   // PROTECTED: the pin column the pocket must not slice
} else if (_debug == "negatives") {
  pocket_cutter();                                            // CUTTER: the lightening pocket
} else if (part == "all") {
  chassis();
  // hub seated on the pin (snap-side down), spinning on it; explode lifts it off along the pin axis
  translate([0, 0, wall + pin_len + explode]) rotate([180, 0, 0]) hub();
} else if (part == "chassis") {
  chassis();
} else if (part == "hub") {
  hub();
}
`

// spur-gear + 608 bearing pocket: a spur gear seated on a shaft that runs through a 608 bearing
// seated in its pocket. ONE shared `clearance` drives the gear bore AND the bearing pocket fit.
// The `_debug` probe protects the bearing shoulder ring (the annular lip the outer race rests on)
// from the relief bore cutter (which must only clear the rotating inner race, never the shoulder).
// 608 bearing dims from hardware.mjs: OD=22, ID=8, W=7.
const B = BEARINGS['608'] // { id: 8, od: 22, w: 7 }
const GEAR_BEARING = `// COMPOSED: spur gear + 608 bearing pocket (spur-gear + bearing-608-pocket).
// ONE shared clearance: gear bore (shaft_d + clearance) AND bearing pocket fit (od + clearance*2).
// The gear's shaft runs through the 608 bearing seated in the pocket — coaxial, press/slide fit.
/* [Kit] */
part = "all"; // [all, gear, pocket]
explode = 0;  // [0:1:25]
_debug = "off"; // [off, positives, negatives]

/* [Fit] */
clearance = 0.2;  // [0.05:0.05:0.4]   ONE shared clearance: gear bore AND bearing pocket
wall = 2;         // [1.2:0.1:4]

/* [Gear] */
mod = 2;          // [1:0.5:3]
teeth = 20;       // [12:1:40]
gear_h = 6;       // [3:1:14]
shaft_d = ${B.id};         // matches 608 bearing bore (${B.id} mm)
backlash = 0.25;  // [0.05:0.05:0.5] MANDATORY > 0

/* [Bearing pocket 608] */
bearing_od = ${B.od};   // 608 OD — from hardware catalog
bearing_id = ${B.id};   // 608 ID (bore)
bearing_w  = ${B.w};    // 608 width

pocket_od   = bearing_od + clearance * 2;   // outer-race seat (shared clearance)
relief_bore = bearing_od - 2 * wall;        // inner-race relief: > bearing_id, < bearing_od
shoulder    = wall;                          // lip depth the outer race rests on
body_h      = bearing_w + shoulder + wall;  // total pocket body height
body_d      = bearing_od + 4 * wall;        // pocket outer wall

gear_bore   = shaft_d + clearance;          // gear bore rides on shaft (shared clearance)

function pol(r, a) = [r*cos(a), r*sin(a)];

module spur_gear() {
  pr = mod * teeth / 2;
  rr = pr - 1.25 * mod;
  orr = pr + mod;
  hp = ((PI * mod / 2 - backlash) / 2 / pr) * 180 / PI;
  hroot = hp + 4; htip = max(hp - 4, 1);
  difference() {
    union() {
      cylinder(h = gear_h, r = rr + 0.2);
      for (i = [0:teeth-1]) rotate([0, 0, i * 360 / teeth])
        linear_extrude(gear_h) polygon([pol(rr,-hroot), pol(orr,-htip), pol(orr,htip), pol(rr,hroot)]);
    }
    translate([0, 0, -1]) cylinder(h = gear_h + 2, d = gear_bore);   // shaft bore (shared clearance)
  }
}

module bearing_seat() difference() {
  cylinder(h = body_h, d = body_d);
  translate([0, 0, shoulder]) cylinder(h = bearing_w + 1, d = pocket_od);  // outer-race pocket
  translate([0, 0, -1]) cylinder(h = body_h + 2, d = relief_bore);         // inner-race relief bore (CUTTER)
}

module relief_cutter() translate([0, 0, -1]) cylinder(h = body_h + 2, d = relief_bore);

module pocket_walls() {
  // PROTECTED: the outer-race pocket wall ring at z=[shoulder..shoulder+bearing_w].
  // Inner Ø = pocket_od (22.4mm); relief_bore (18mm) must stay inside this ring.
  // If relief_bore widens past pocket_od it slices the wall — this is the interference-fail mode.
  translate([0, 0, shoulder]) difference() {
    cylinder(h = bearing_w, d = body_d);
    translate([0, 0, -1]) cylinder(h = bearing_w + 2, d = pocket_od);
  }
}

if (_debug == "positives") {
  pocket_walls();                 // PROTECTED: the outer-race pocket walls the bearing outer race presses into
} else if (_debug == "negatives") {
  relief_cutter();                // CUTTER: the inner-race relief bore
} else if (part == "all") {
  // gear above the pocket on the shared shaft axis; bearing presses into pocket from below
  bearing_seat();
  translate([0, 0, body_h + explode]) spur_gear();
} else if (part == "gear") {
  spur_gear();
} else if (part == "pocket") {
  bearing_seat();
}
`

export const COMPOSED = {
  'axle-snap': {
    pair: ['wheel-axle', 'snap-fit'],
    sharedConcepts: ['clearance', 'wall'],
    exemplar: AXLE_SNAP,
    controls: {
      dupClear: (code) => code.replace(/(\nclearance = [\d.]+;[^\n]*)/, '$1\nextra_fit = 0.2;'),
      deepPocket: (code) => code.replace(/pocket_h = wall - 0\.8;/, 'pocket_h = wall + pin_len;'),
    },
  },

  'gear-bearing': {
    pair: ['spur-gear', 'bearing-608-pocket'],
    sharedConcepts: ['clearance', 'wall'],
    exemplar: GEAR_BEARING,
    controls: {
      // CONTROL (2): injects a second clearance-family param before the first module line
      // → conceptParams(CLEARANCE_RE) will find ["clearance", "extra_clearance"] and fail the ONE check
      dupClear: (code) => code.replace(/(\nclearance = [\d.]+;[^\n]*)/, '$1\nextra_clearance = 0.1;'),
      // CONTROL (3): deepen the relief bore so it is wider than the bearing OD, ensuring it eats
      // through the shoulder ring → interferenceVol rises well above 2mm³
      deepPocket: (code) => code.replace(/relief_bore = bearing_od - 2 \* wall;/, 'relief_bore = bearing_od + 4;'),
    },
  },
}

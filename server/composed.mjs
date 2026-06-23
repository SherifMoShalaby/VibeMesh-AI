/* Composed exemplars (P7) — >=2 mechanisms in ONE program: a single MERGED Customizer block (one
 * `clearance`, one `wall`), a `part` enum with `all` first + an `explode` knob, joints COINCIDENT
 * in `all` (pieces mate, not scatter), and the `_debug` interference contract (so the zero-API
 * walker can voxelize protected structure vs cutters). These are both the assembler's few-shot and
 * the composition probe's fixtures. No global $fn (the quality presets own curve resolution).
 */

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
}

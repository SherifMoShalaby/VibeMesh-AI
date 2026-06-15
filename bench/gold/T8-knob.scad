// Gold reference: a filleted cylindrical control knob — a curved/organic form
// (rounded top edge + flat top) the older bench corpus never measured. Fully
// determined by the prompt: OD 30, height 18, top fillet r4, center bottom
// bore d6 × 12 deep. Single manifold solid, flat on z=0.
$fn = 96;

knob_d = 30;   // outer diameter (mm)
knob_h = 18;   // overall height (mm)
fillet_r = 4;  // radius of the rounded top edge (mm)
bore_d = 6;    // shaft bore diameter (mm)
bore_h = 12;   // shaft bore depth from the base (mm)

difference() {
  // body: straight wall up to (h - fillet_r), then a torus ring hulled on top
  // rounds the outer top edge and leaves a flat top disc.
  hull() {
    cylinder(d = knob_d, h = knob_h - fillet_r);
    translate([0, 0, knob_h - fillet_r])
      rotate_extrude()
        translate([knob_d / 2 - fillet_r, 0, 0]) circle(r = fillet_r);
  }
  // blind shaft bore in the underside
  translate([0, 0, -0.1]) cylinder(d = bore_d, h = bore_h + 0.1);
}

// Gold reference: a sci-fi HARD-SURFACE desk token — a hexagonal pillar (across-flats 30mm,
// 50mm tall) with a 2mm/45-deg chamfer around the top edge, a shallow recessed rectangular panel
// on each of the six faces, and a low-poly faceted (4-sided) pyramidal finial on top. Exercises
// the hard-surface vocabulary the prompt teaches — chamfered edges + recessed panel lines + a
// faceted accent — NOT a smooth blob. Single manifold solid, flat on z=0.
$fn = 96;

af = 30;             // across-flats of the hex
od = af / cos(30);   // circum-diameter for cylinder($fn=6) so the flats sit at af/2
h = 50;              // pillar height
cham = 2;            // top-edge chamfer (45 deg)
panel_w = 14;        // recessed panel width (around the face)
panel_h = 26;        // recessed panel height (up the face)
panel_d = 1.5;       // panel recess depth
fin_h = 8;           // faceted finial height

module hexcol(d, height) cylinder(d = d, h = height, $fn = 6);

module pillar() {
  // chamfered top edge: hull the full hex (up to h-cham) with a shrunken hex slice at the top
  hull() {
    hexcol(od, h - cham);
    translate([0, 0, h - cham]) hexcol(od - 2 * cham, cham);
  }
}

module recessed_panels() {
  for (i = [0:5])
    rotate([0, 0, 60 * i])              // a flat face faces +X at i=0 for an $fn=6 cylinder
      translate([af / 2, 0, h * 0.46])  // box centred on the face plane → carves panel_d inward
        cube([2 * panel_d, panel_w, panel_h], center = true);
}

module finial() {
  // low-poly pyramidal finial (4 facets) — the deliberate faceted accent
  translate([0, 0, h]) cylinder(d1 = af * 0.55, d2 = 0, h = fin_h, $fn = 4);
}

difference() {
  union() {
    pillar();
    finial();
  }
  recessed_panels();
}

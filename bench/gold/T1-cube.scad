// Gold reference: 25mm calibration cube, 6mm hole through Z.
// $fn=64 — gold uses smooth curves; voxel pitch makes facet mismatch negligible.
$fn = 64;

size = 25;
hole_d = 6;

difference() {
  translate([-size / 2, -size / 2, 0]) cube([size, size, size]);
  translate([0, 0, -1]) cylinder(d = hole_d, h = size + 2);
}

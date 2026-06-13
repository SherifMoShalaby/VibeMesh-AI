// Gold reference: T1 cube iterated — 10mm hole, 2mm chamfer on the four top edges.
$fn = 64;

size = 25;
hole_d = 10;
chamfer = 2;

difference() {
  translate([-size / 2, -size / 2, 0]) cube([size, size, size]);
  translate([0, 0, -1]) cylinder(d = hole_d, h = size + 2);
  // 45° chamfer cutters along each top edge: a square prism (side chamfer*sqrt(2))
  // rotated 45° about the edge axis leaves a 2mm-leg triangle cut
  for (a = [0, 90, 180, 270]) rotate([0, 0, a])
    translate([size / 2, 0, size]) rotate([0, 45, 0])
      cube([chamfer * sqrt(2), size + 2, chamfer * sqrt(2)], center = true);
}

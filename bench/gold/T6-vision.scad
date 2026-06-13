// Gold reference for vision-sketch.png: 100×40×5mm plate, two ⌀16 holes.
// Hole positions are NOT dimensioned in the sketch; the drawing shows them
// vertically centered, symmetric, ~20mm inset from each end. Position variance
// costs little IoU (each hole ≈5% of plate volume).
$fn = 64;

length = 100;
width = 40;
thickness = 5;
hole_d = 16;
hole_inset = 20;

difference() {
  translate([-length / 2, -width / 2, 0]) cube([length, width, thickness]);
  for (x = [-length / 2 + hole_inset, length / 2 - hole_inset])
    translate([x, 0, -1]) cylinder(d = hole_d, h = thickness + 2);
}

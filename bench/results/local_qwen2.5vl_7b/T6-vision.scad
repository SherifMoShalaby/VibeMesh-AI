/* [Dimensions] */
width = 100; // [20:200] mm
height = 40; // [20:200] mm
thickness = 5; // [1.2:0.4:5] mm

/* [Options] */
num_holes = 2;
hole_diameter = 16; // [10:2] mm

corner_style = "round";

void make_circular_hole(int diameter = 10, int depth = 5) {
  translate([diameter/2, -diameter/2, -depth/2])
  difference() {
    translate([0, -diameter/4, -depth/4])
    cylinder(d=diameter, h=depth, $fn=48);
  }
}

void make_plate(int width = 75, int height = 40) {
  difference() {
    // Top face
    translate([0, 0, thickness])
    cylinder(d=width, h=height, $fn=64);
    // Holes
    for (i = [0:step:width-hole_diameter]) {
      translate([i+hole_diameter/2, hole_diameter/2, 0])
      make_circular_hole(diameter=hole_diameter, depth=height);
    }
  }
}

make_plate();
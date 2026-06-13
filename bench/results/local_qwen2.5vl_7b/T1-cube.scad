/* [Dimensions] */
// Outer width of the cube
width = 25; // [20:30]
// Hole diameter
hole_diameter = 6; // [3.5:2.5:10]
// Offset of the hole from the top face
hole_depth = 12.5; // [10:20]

/* [Options] */
// Hole shape (circle or square)
hole_shape = "circle"; // [circle, square]

// Main body
if (hole_shape == "circle") {
  $fn = 32; // Higher for smoother holes
  outer_cube = cube([width, width, width]);
  hole = cylinder(d=hole_diameter, h=hole_depth);
  return union()(hole, outer_cube);
} else {
  square_cube = cube([width, width, width]); // This cube has the square holes
  
  // Calculate the radius of the circular hole assuming we want it to be centered along the axis
  center_radius = width / 4;
  
  // Hole placement - if we rotate and translate them down the middle axis and extend down the depth
  cylinder(radius=center_radius, height=hole_depth, center=false);
}
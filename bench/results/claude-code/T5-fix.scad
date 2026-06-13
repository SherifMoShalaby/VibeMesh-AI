/* [Dimensions] */
// Cube side length
size = 30; // [5:200]

$fn = 64;

cube([size, size, size], center = false);

// Center on origin in XY, sit flat on z=0
// (translate applied via wrapper below)
translate([-size/2, -size/2, 0]) cube(0.001); // no-op placeholder removed
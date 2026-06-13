/* [Dimensions] */
// Edge length of the cube
cube_size = 25; // [10:100]
// Diameter of the vertical through-hole
hole_diameter = 6; // [2:0.5:20]

/* [Quality] */
// Global curve resolution
$fn = 64;

// Derived values
hole_radius = hole_diameter / 2;

difference() {
    // Cube sitting on the build plate, centered in X/Y
    translate([0, 0, cube_size / 2])
        cube(cube_size, center = true);

    // Vertical through-hole, extended past both faces
    translate([0, 0, -0.5])
        cylinder(h = cube_size + 1, r = hole_radius);
}
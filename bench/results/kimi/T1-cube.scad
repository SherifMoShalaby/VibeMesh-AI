/* [Dimensions] */
// Cube side length
cube_size = 25; // [10:50]
// Through-hole diameter
hole_diameter = 6; // [2:0.5:20]

/* [Options] */
// Add chamfer to hole entry/exit
chamfer_hole = true;

// Derived values
hole_r = hole_diameter / 2;
chamfer_size = chamfer_hole ? 0.8 : 0;

$fn = 64;

difference() {
    // Main cube, centered then shifted to sit on XY plane
    translate([0, 0, cube_size / 2])
        cube([cube_size, cube_size, cube_size], center = true);
    
    // Through-hole along Z axis
    translate([0, 0, -0.5])
        cylinder(h = cube_size + 1, r = hole_r);
    
    // Chamfers at top and bottom of hole
    if (chamfer_hole) {
        translate([0, 0, -0.01])
            cylinder(h = chamfer_size * 2, r1 = hole_r + chamfer_size, r2 = hole_r);
        translate([0, 0, cube_size - chamfer_size * 2 + 0.01])
            cylinder(h = chamfer_size * 2, r1 = hole_r, r2 = hole_r + chamfer_size);
    }
}
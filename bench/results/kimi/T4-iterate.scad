/* [Dimensions] */
// Cube side length
cube_size = 25; // [10:50]
// Through-hole diameter
hole_diameter = 10; // [2:0.5:20]
// Top edge chamfer size
top_chamfer = 2; // [0:0.5:5]

/* [Options] */
// Add chamfer to hole entry/exit
chamfer_hole = true;

// Derived values
hole_r = hole_diameter / 2;
chamfer_size = chamfer_hole ? 0.8 : 0;

$fn = 64;

difference() {
    // Main cube with top edge chamfer, centered then shifted to sit on XY plane
    translate([0, 0, cube_size / 2])
        cube([cube_size, cube_size, cube_size], center = true);
    
    // Top edge chamfer cuts (four edges)
    for (a = [0:90:270]) {
        rotate([0, 0, a])
            translate([cube_size / 2 + top_chamfer, 0, cube_size - top_chamfer + 0.5])
                rotate([0, 45, 0])
                    cube([top_chamfer * sqrt(2), cube_size + 1, top_chamfer * sqrt(2)], center = true);
    }
    
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
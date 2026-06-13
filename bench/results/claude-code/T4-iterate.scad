/* [Dimensions] */
// Edge length of the cube
cube_size = 25; // [10:100]
// Diameter of the vertical through-hole
hole_diameter = 10; // [2:0.5:20]
// Chamfer size on the top edges
chamfer = 2; // [0:0.5:5]

/* [Quality] */
// Global curve resolution
$fn = 64;

// Derived values
hole_radius = hole_diameter / 2;
// Side length of the 45-degree edge cutter (gives a chamfer leg of `chamfer`)
cutter_side = chamfer * sqrt(2);
cutter_len = cube_size + 2; // extend past the faces

difference() {
    // Cube sitting on the build plate, centered in X/Y
    translate([0, 0, cube_size / 2])
        cube(cube_size, center = true);

    // Vertical through-hole, extended past both faces
    translate([0, 0, -0.5])
        cylinder(h = cube_size + 1, r = hole_radius);

    // 45-degree chamfer cutters along the four top edges
    if (chamfer > 0)
        for (a = [0, 90, 180, 270])
            rotate([0, 0, a])
                translate([cube_size / 2, 0, cube_size])
                    rotate([0, 0, 0])
                        rotate([45, 0, 0])
                            rotate([0, 0, 0])
                                cube([0.01, 0, 0]); // placeholder (replaced below)
}

// NOTE: placeholder above is invalid — see corrected version below
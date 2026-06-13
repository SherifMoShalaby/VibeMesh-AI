/* [Plate Dimensions] */
// Plate length
length = 100; // [40:300]
// Plate width
width = 40; // [20:150]
// Plate thickness
thickness = 5; // [2:0.5:20]

/* [Holes] */
// Hole diameter
hole_d = 16; // [3:0.5:40]
// Distance from plate end to hole center
hole_end_offset = 25; // [10:0.5:100]
// Extra radial clearance for a free fit
hole_clearance = 0.2; // [0:0.05:0.6]

/* [Quality] */
$fn = 96;

// Derived values
hole_r = hole_d / 2 + hole_clearance;
hole_x = length / 2 - hole_end_offset;

difference() {
    // Plate body, sitting on z=0, centered on origin
    translate([-length / 2, -width / 2, 0])
        cube([length, width, thickness]);

    // Two through-holes on the centerline
    for (x = [-hole_x, hole_x])
        translate([x, 0, -0.5])
            cylinder(h = thickness + 1, r = hole_r);
}
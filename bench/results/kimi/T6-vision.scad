/* [Dimensions] */
// Overall length of the plate
length = 100; // [20:200]
// Overall width of the plate
width = 40; // [10:100]
// Plate thickness
thickness = 5; // [2:10]
// Hole diameter
hole_diameter = 16; // [3:0.5:50]
// Center-to-center distance between holes
hole_spacing = 60; // [10:0.5:180]

/* [Options] */
// Add chamfered edges for cleaner print
chamfer_edges = true;

/* [Hidden] */
$fn = 64;

// Derived values
hole_radius = hole_diameter / 2;
chamfer_size = chamfer_edges ? 0.8 : 0;

module plate_body() {
    if (chamfer_edges) {
        linear_extrude(height = thickness, convexity = 2)
            offset(r = -chamfer_size)
                offset(r = chamfer_size)
                    square([length, width], center = true);
    } else {
        cube([length, width, thickness], center = true);
    }
}

module holes() {
    // Two through-holes centered on X axis, spaced apart
    for (x = [-hole_spacing/2, hole_spacing/2]) {
        translate([x, 0, -0.5])
            cylinder(h = thickness + 1, r = hole_radius + 0.2);
    }
}

// Main geometry
difference() {
    translate([0, 0, thickness/2])
        plate_body();
    holes();
}
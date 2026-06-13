// Define the actual geometry after more input
height = width / 4;
cylinder_slot_pos = (height + wall / 2) * -1;
wire_hole_dia = 5 + 0.2;
wire_hole_pos = cylinder_slot_pos / 2; // center of cable hole
screw_pos = cylinder_slot_pos + 2 * wall; // position of countersunk screw
screw_dia = 6;
screw_depth = 0.8;

if(lid) {
    // Added lid area for snap-fit
    height += wall;
    screw_depth += wall / 2;
    screw_pos += wall / 2;
}

module wall_mount_cable_clip() {
    $fn = 64;
    difference() {
        // Cable slot rounded ends
        for(i = [floor(cylinder_slot_pos - height), floor(cylinder_slot_pos + height)]) 
            translate([0, i, 0]) cylinder(d=dia=cylinder_slot_pos, depth=wall, $center=true);

        // Flat top and bottom plate
        translate([-width / 2, width / 2, width / 4 - wall / 2]) cube([width, width, wall - 2 * wall]);

        rotatez(90) translate([0, screw_pos, wall + height - wall / 2]) 
            countersink_dia(screw_dia) screw_depth;

        // Outer cylinder walls
        difference() {
            cylinder(d=dia=wire_hole_dia, depth=cylinder_slot_pos, $center=true);
            
            // Cable hole (with 0.2mm clearance for wire)
            translate([0, 0, cylinder_slot_pos + wall / 2]) 
                cylinder(d=dia=wire_hole_dia, depth=cylinder_slot_pos - wall / 2, $center=true);
        }

        // Horizontal line for cable
        translate([0, 0, height]) line([-width / 2, width / 2], [-width / 2, width / 2], height=2);
    }
}

module countersink_dia(dia) {
    $fn = 64;
    difference() {
        cylinder(d=dia, h=0.8, $fn=64);
        rotatez(90) translate([-dia / 2, 0, 0]) 
        cylinder(d=dia + 0.01, h=0.5, $fn=64);
    }
}

// Actual function call for building the geometry
wall_mount_cable_clip();
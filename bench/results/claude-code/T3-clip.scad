/* [Cable] */
// Cable diameter
cable_d = 5; // [2:0.5:12]
// Radial clearance around cable
cable_clearance = 0.2; // [0:0.05:0.6]
// Snap opening as fraction of cable diameter (smaller = tighter grip)
opening_ratio = 0.72; // [0.5:0.02:0.9]

/* [Clip Body] */
// Clip length along the cable
clip_len = 10; // [6:1:30]
// Wall thickness of the snap arms
wall = 2; // [1.2:0.2:3.5]
// Base plate thickness (against the wall)
base_t = 3; // [2:0.5:5]

/* [Mounting] */
// Distance from clip end to screw center
tab_len = 8; // [5:1:20]
// Width of the screw tab
tab_w = 10; // [8:1:16]
// Screw hole diameter (M3 clearance)
screw_d = 3.4; // [2.5:0.1:5.5]
// Countersink head diameter (M3 head + clearance)
cs_d = 6.8; // [4:0.1:10]

$fn = 64;

// ---- Derived values ----
cable_r   = cable_d / 2 + cable_clearance;
outer_r   = cable_r + wall;
center_h  = base_t + cable_r;          // cable axis height above wall
opening_w = cable_d * opening_ratio;   // snap gap width
base_w    = 2 * outer_r;               // body width
hole_y    = clip_len / 2 + tab_len;    // screw center position
cs_depth  = (cs_d - screw_d) / 2;      // 90-degree countersink depth
flare     = wall * 0.8;                // lead-in chamfer size

// 2D cross-section perpendicular to the cable
module clip_profile() {
    difference() {
        union() {
            translate([0, center_h]) circle(r = outer_r);
            translate([-base_w/2, 0]) square([base_w, base_t + 0.01]);
        }
        // cable bore
        translate([0, center_h]) circle(r = cable_r);
        // snap opening
        translate([-opening_w/2, center_h]) square([opening_w, outer_r + 1]);
        // lead-in flare at the tips
        translate([0, center_h]) polygon([
            [-opening_w/2, outer_r - flare],
            [ opening_w/2, outer_r - flare],
            [ opening_w/2 + flare, outer_r + 1],
            [-opening_w/2 - flare, outer_r + 1]
        ]);
    }
}

// extruded clip, cable axis along Y, base on z=0
module clip_body() {
    rotate([90, 0, 0])
        translate([0, 0, -clip_len/2])
            linear_extrude(clip_len)
                clip_profile();
}

// screw tab with rounded end
module tab() {
    hull() {
        translate([-tab_w/2, clip_len/2 - 1, 0]) cube([tab_w, 1, base_t]);
        translate([0, hole_y, 0]) cylinder(d = tab_w, h = base_t);
    }
}

// countersunk M3 cutter
module screw_cutter() {
    translate([0, hole_y, 0]) {
        translate([0, 0, -0.5]) cylinder(d = screw_d, h = base_t + 1);
        translate([0, 0, base_t - cs_depth]) cylinder(d1 = screw_d, d2 = cs_d, h = cs_depth + 0.01);
        translate([0, 0, base_t]) cylinder(d = cs_d, h = 1);
    }
}

difference() {
    union() {
        clip_body();
        tab();
    }
    screw_cutter();
}
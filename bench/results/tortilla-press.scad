/* [Main Dimensions] */
// Outer diameter of the round plates
plate_dia = 180; // [120:5:240]
// Thickness of each plate (base and top)
plate_h = 10; // [6:1:20]
// Vertical gap between base and top plate (hinge clearance)
plate_gap = 2; // [0:0.5:6]

/* [Flutes] */
// Number of vertical oval flutes around the rim
flute_count = 40; // [16:1:64]
// Flute (rib) radius — controls how bold the fluting reads
flute_r = 3; // [1.5:0.5:6]

/* [Hinge] */
// Hinge pin radius
hinge_pin_r = 4; // [2:0.5:8]
// Hinge pin length (along X)
hinge_pin_len = 70; // [40:5:120]
// Number of hinge knuckle barrels
knuckle_count = 3; // [2:1:5]

/* [Pivot Posts] */
// Height of the pivot posts above the base top
post_h = 72; // [40:2:120]
// Post width (across, X)
post_w = 14; // [8:1:24]
// Post depth (front-back, Y)
post_d = 20; // [10:1:30]
// Outward offset of each post from center (X)
post_x = 19; // [12:1:40]
// Corner rounding radius of posts
post_round = 3; // [1:0.5:6]

/* [Lever Arm] */
// Lever arm width
lever_w = 22; // [12:1:40]
// Lever arm thickness
lever_t = 12; // [6:1:24]
// How far the lever overhangs past the front edge
lever_overhang = 18; // [0:2:60]
// Slot width down the lever
slot_w = 8; // [3:0.5:16]
// Pivot pin radius
pivot_pin_r = 4; // [2:0.5:8]
// Handle crossbar radius
handle_r = 9; // [5:0.5:16]
// Handle crossbar length (along X)
handle_len = 90; // [50:5:140]

/* [Hidden] */
eps = 0.05;

// ---------- Derived ----------
r          = plate_dia / 2;
back_y     = -r;                          // hinge side (back)
top_z      = plate_h + plate_gap;         // bottom of top plate
hinge_y    = back_y + 5;
hinge_z    = plate_h + plate_gap / 2;
pivot_y    = back_y + post_d / 2;
pivot_z    = plate_h + post_h - 14;
front_y    = r + lever_overhang;
lever_back = back_y - 12;
flute_step = 360 / flute_count;

// ================= Modules =================

// vertical oval (stadium) rib used for the fluting
module capsule_flute(thick, rf) {
    hull() {
        translate([0, 0, rf + 1])         sphere(rf);
        translate([0, 0, thick - rf - 1]) sphere(rf);
    }
}

// round plate with vertical oval flutes around the rim
module fluted_disc(dia, thick, count, rf) {
    rr = dia / 2;
    union() {
        cylinder(d = dia, h = thick);
        for (i = [0 : count - 1])
            rotate([0, 0, i * 360 / count])
                translate([rr - rf * 0.5, 0, 0])
                    capsule_flute(thick, rf);
    }
}

// rounded rectangular vertical post (hull of 4 corner cylinders)
module rounded_post(wx, wy, hz, rr) {
    ix = wx / 2 - rr;
    iy = wy / 2 - rr;
    hull()
        for (sx = [-1, 1], sy = [-1, 1])
            translate([sx * ix, sy * iy, 0])
                cylinder(r = rr, h = hz);
}

// horizontal cylinder along X
module x_cyl(len, rad) {
    rotate([0, 90, 0])
        cylinder(h = len, r = rad, center = true);
}

// ================= Assembly =================

module tortilla_press() {
    union() {
        // --- base ---
        fluted_disc(plate_dia, plate_h, flute_count, flute_r);

        // --- top plate (closed onto base) ---
        translate([0, 0, top_z])
            fluted_disc(plate_dia, plate_h, flute_count, flute_r);

        // --- hinge: pin + knuckle barrels at the back seam ---
        translate([0, hinge_y, hinge_z])
            x_cyl(hinge_pin_len, hinge_pin_r);
        for (i = [0 : knuckle_count - 1])
            translate([
                -hinge_pin_len/2 + hinge_pin_len * (i + 0.5) / knuckle_count,
                hinge_y, hinge_z])
                x_cyl(hinge_pin_len / knuckle_count - 2, hinge_pin_r + 3);

        // --- pivot posts (both sides of the lever, at hinge side) ---
        for (sx = [-1, 1])
            translate([sx * post_x, pivot_y, plate_h - eps])
                rounded_post(post_w, post_d, post_h + eps, post_round);

        // --- pivot pin through posts and lever back ---
        translate([0, pivot_y, pivot_z])
            x_cyl(2 * post_x + post_w + 20, pivot_pin_r);

        // --- slotted lever arm ---
        translate([0, 0, pivot_z]) {
            difference() {
                // bar body
                translate([0, (lever_back + front_y) / 2, 0])
                    cube([lever_w, front_y - lever_back, lever_t], center = true);
                // slot down the middle (rounded ends)
                hull() {
                    translate([0, -20, 0]) cylinder(h = lever_t + 1, r = slot_w/2, center = true);
                    translate([0,  70, 0]) cylinder(h = lever_t + 1, r = slot_w/2, center = true);
                }
            }
            // handle crossbar at the front
            translate([0, front_y - handle_r, 0])
                x_cyl(handle_len, handle_r);
        }
    }
}

tortilla_press();
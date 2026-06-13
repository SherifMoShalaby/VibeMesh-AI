/* [Phone] */
// Phone width including case
phone_width = 75; // [50:120]
// Phone thickness including case
phone_thickness = 9; // [5:0.5:20]
// Extra clearance in the cradle channel
fit_clearance = 0.6; // [0.2:0.1:2]

/* [Stand] */
// Recline angle from horizontal
recline = 60; // [40:80]
// Backrest length measured along the phone
back_length = 70; // [40:120]
// Front lip height measured along the phone face
lip_height = 14; // [8:30]
// Wall thickness
wall = 4; // [3:0.5:8]
// Cradle floor height above the desk (room for the cable plug)
floor_raise = 22; // [14:40]

/* [Cable slot] */
// Width of the charging-cable slot
slot_width = 14; // [8:24]

/* [Base] */
// Base length behind the backrest top (anti-tip margin)
base_back_margin = 6; // [0:20]
// Base length in front of the lip
base_front = 26; // [10:50]
// Base plate thickness
base_thickness = 5; // [3:0.5:8]

$fn = 64;

// ---- Derived values ----
stand_width = phone_width + 6;                  // slightly wider than the phone
channel = phone_thickness + fit_clearance;      // cradle gap
phi = 90 - recline;                             // profile tilt from vertical
strut_ext = (floor_raise + wall) / sin(recline) + 5; // backrest extension down to the desk
base_back_x = -wall * cos(phi) - back_length * sin(phi) - base_back_margin;
base_len = base_front - base_back_x;
x_center = (base_back_x + base_front) / 2;      // for centering on origin

// Side silhouette in 2D (x = depth, y = height)
module profile2d() {
    intersection() {
        union() {
            // Reclined assembly, pivoted at the cradle inner corner
            translate([0, floor_raise]) rotate(phi) {
                // Backrest + strut continuing down to the base
                translate([-wall, -strut_ext])
                    square([wall, back_length + strut_ext]);
                // Cradle floor
                translate([-wall, -wall])
                    square([wall + channel + wall, wall]);
                // Front lip
                translate([channel, -wall])
                    square([wall, lip_height + wall]);
            }
            // Base plate
            translate([base_back_x, 0])
                square([base_len, base_thickness]);
        }
        // Trim everything below the desk plane
        translate([-500, 0]) square([1000, 1000]);
    }
}

// Slot through the cradle floor and front lip, aligned with the phone
module slot_cutter() {
    translate([0, 0, floor_raise])
        rotate([0, recline - 90, 0])
            translate([-0.6, -slot_width / 2, -(wall + 4)])
                cube([channel + wall + 2, slot_width, wall + 4 + lip_height + 5]);
}

// Groove through the base plate so the cable can run out along the desk
module base_groove() {
    translate([-2, -slot_width / 2, -1])
        cube([base_front + 3, slot_width, base_thickness + 2]);
}

module stand() {
    difference() {
        rotate([90, 0, 0])
            linear_extrude(height = stand_width, center = true)
                profile2d();
        slot_cutter();
        base_groove();
    }
}

translate([-x_center, 0, 0]) stand();
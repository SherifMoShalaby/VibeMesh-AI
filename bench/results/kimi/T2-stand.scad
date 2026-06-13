/* [Phone Dimensions] */
// Phone width (including case)
phone_width = 75; // [50:120]
// Phone thickness (including case)
phone_thickness = 9; // [5:20]

/* [Stand Geometry] */
// Recline angle from horizontal (degrees)
recline_angle = 60; // [30:80]
// Base depth (front to back)
base_depth = 90; // [60:150]
// Total stand height
stand_height = 85; // [50:120]

/* [Cradle & Slot] */
// Cradle wall thickness
cradle_wall = 2.4; // [1.2:0.4:5]
// Extra width clearance for phone fit
width_clearance = 1.5; // [0:0.5:5]
// Extra thickness clearance for phone fit
thickness_clearance = 1.0; // [0:0.5:5]
// Charging cable slot width
cable_slot_width = 12; // [6:20]
// Charging cable slot depth (from bottom of cradle)
cable_slot_depth = 6; // [3:15]

/* [Base & Stability] */
// Base thickness
base_thickness = 6; // [3:10]
// Back support thickness
back_thickness = 8; // [4:12]
// Front lip height (keeps phone from sliding out)
front_lip = 8; // [3:15]

/* [Hidden] */
$fn = 64;

// Derived values
slot_inner_width = phone_width + width_clearance;
slot_inner_thickness = phone_thickness + thickness_clearance;
cradle_outer_width = slot_inner_width + cradle_wall * 2;
cradle_outer_thickness = slot_inner_thickness + cradle_wall * 2;

// Effective depth of the cradle slot along the stand face
cradle_depth = phone_width * 0.6; // phone rests on lower portion

// Back face dimensions (the plane the phone rests against)
back_face_width = cradle_outer_width;
back_face_height = cradle_depth + front_lip + cradle_wall;

// Base footprint calculations for stability
base_rear_overhang = 5;
base_front_extension = base_depth - (stand_height / tan(recline_angle)) - base_rear_overhang;

module rounded_rect_2d(w, h, r) {
    offset(r = r) offset(r = -r) square([w, h]);
}

module cradle_profile() {
    // U-shaped slot profile, open at top (phone insertion side)
    difference() {
        square([cradle_outer_thickness, back_face_height]);
        translate([cradle_wall, cradle_wall])
            square([slot_inner_thickness, back_face_height]);
    }
}

module cable_slot_cut() {
    // Vertical slot through cradle bottom for cable
    slot_h = back_face_height + 2;
    translate([-0.5, -0.5, (cradle_outer_width - cable_slot_width) / 2])
        cube([cradle_outer_thickness + 1, cable_slot_depth + 0.5, cable_slot_width]);
}

module back_support() {
    // Triangular back support with rounded top
    hull() {
        // Bottom at rear of base
        translate([0, 0, 0])
            cube([back_thickness, base_thickness, back_face_width]);
        // Top where cradle attaches
        translate([0, stand_height - back_face_height, 0])
            cube([back_thickness, back_face_height, back_face_width]);
    }
}

module base_plate() {
    // Flat base with rounded corners
    linear_extrude(height = base_thickness)
        rounded_rect_2d(base_depth, back_face_width, 5);
}

module stand_assembly() {
    // Base centered on origin, sitting flat at z=0
    translate([-base_front_extension, -back_face_width/2, 0])
        base_plate();
    
    // Back support, angled so cradle sits at recline_angle
    // The back face leans back; angle from vertical is (90 - recline_angle)
    lean_from_vertical = 90 - recline_angle;
    
    translate([base_depth - base_rear_overhang - back_thickness, -back_face_width/2, base_thickness])
        rotate([0, -lean_from_vertical, 0])
        back_support();
    
    // Cradle attached to top of back support
    // Position calculated so cradle centerline is at proper angle
    cradle_pivot_x = base_depth - base_rear_overhang - back_thickness - (stand_height - back_face_height/2) * sin(lean_from_vertical);
    cradle_pivot_z = base_thickness + (stand_height - back_face_height/2) * cos(lean_from_vertical);
    
    translate([cradle_pivot_x, -back_face_width/2, cradle_pivot_z - back_face_height/2])
        rotate([0, -lean_from_vertical, 0])
        difference() {
            linear_extrude(height = back_face_width)
                cradle_profile();
            cable_slot_cut();
        }
    
    // Front lip/stop at bottom of cradle to prevent phone sliding out
    lip_x = cradle_pivot_x - back_face_height * sin(lean_from_vertical) - cradle_outer_thickness * cos(lean_from_vertical);
    lip_z = cradle_pivot_z - back_face_height * cos(lean_from_vertical) + cradle_outer_thickness * sin(lean_from_vertical);
    
    translate([lip_x, -back_face_width/2, lip_z])
        rotate([0, -lean_from_vertical, 0])
        cube([cradle_wall * 2, back_face_width, cradle_outer_thickness]);
}

// Main geometry
stand_assembly();
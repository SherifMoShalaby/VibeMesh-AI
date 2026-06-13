export interface Example {
  id: string
  name: string
  blurb: string
  code: string
}

export const PROMPT_IDEAS = [
  'A clip that holds a 5mm cable against a desk edge',
  'A phone stand with adjustable recline angle',
  'A wall bracket for a 32mm curtain rod with two M4 screw holes',
  'A honeycomb pen holder for six pens',
  'A snap-fit enclosure for a 70×50mm circuit board',
  'A replacement knob for a 6mm potentiometer shaft',
]

export const EXAMPLES: Example[] = [
  {
    id: 'storage-box',
    name: 'Storage box',
    blurb: 'Rounded parametric box — tune size, wall and corner radius.',
    code: `/* [Box] */
// Inner length (X)
inner_x = 80; // [20:200]
// Inner width (Y)
inner_y = 50; // [20:200]
// Inner height (Z)
inner_z = 30; // [10:120]
// Wall thickness
wall = 2; // [1.2:0.4:4]
// Floor thickness
floor_t = 1.6; // [1.2:0.4:4]
// Corner radius
corner_r = 6; // [1:15]

$fn = 64;

outer_x = inner_x + 2 * wall;
outer_y = inner_y + 2 * wall;

module rounded_box(x, y, h, r) {
    linear_extrude(height = h)
        offset(r = r) offset(delta = -r)
            square([x, y], center = true);
}

difference() {
    rounded_box(outer_x, outer_y, inner_z + floor_t, corner_r);
    translate([0, 0, floor_t])
        rounded_box(inner_x, inner_y, inner_z + 1, max(corner_r - wall, 0.5));
}
`,
  },
  {
    id: 'hex-bit-holder',
    name: 'Hex bit holder',
    blurb: 'Grid of 1/4" hex sockets for driver bits.',
    code: `/* [Grid] */
// Bits per row
cols = 5; // [2:12]
// Number of rows
rows = 2; // [1:6]
// Spacing between sockets
pitch = 13; // [9:20]

/* [Sockets] */
// Hex size across flats (1/4 inch = 6.35)
hex_af = 6.35; // [4:0.05:10]
// Fit clearance per side
clearance = 0.15; // [0:0.05:0.4]
// Socket depth
socket_depth = 12; // [6:25]

/* [Body] */
// Block height
base_h = 16; // [10:30]
// Margin around outer sockets
margin = 5; // [3:12]
// Corner radius
corner_r = 3; // [1:8]

$fn = 64;

block_x = (cols - 1) * pitch + 2 * margin;
block_y = (rows - 1) * pitch + 2 * margin;
hex_d = (hex_af + 2 * clearance) / cos(30); // across corners

difference() {
    linear_extrude(height = base_h)
        offset(r = corner_r) offset(delta = -corner_r)
            square([block_x, block_y], center = true);

    for (cx = [0 : cols - 1], cy = [0 : rows - 1])
        translate([
            (cx - (cols - 1) / 2) * pitch,
            (cy - (rows - 1) / 2) * pitch,
            base_h - socket_depth
        ])
            cylinder(d = hex_d, h = socket_depth + 1, $fn = 6);
}
`,
  },
  {
    id: 'wall-hook',
    name: 'Wall hook',
    blurb: 'J-hook with countersunk screw mounting, printed on its side.',
    code: `/* [Hook] */
// How far the hook sticks out
reach = 28; // [15:60]
// Hook rod diameter
rod_d = 9; // [5:0.5:16]
// Upturned tip height
tip_h = 14; // [6:30]
// Hook width (print height)
width = 14; // [8:30]

/* [Mounting plate] */
// Plate height
plate_h = 60; // [35:120]
// Plate thickness
plate_t = 4; // [3:0.5:8]
// Screw hole diameter (M4 = 4.4)
screw_d = 4.4; // [3:0.2:6]
// Countersink head diameter
head_d = 8.4; // [6:0.2:12]

$fn = 64;

module side_profile() {
    // wall plate
    square([plate_t, plate_h]);
    // bottom run
    hull() {
        translate([plate_t - 0.1, rod_d / 2]) circle(d = rod_d);
        translate([plate_t + reach, rod_d / 2]) circle(d = rod_d);
    }
    // upturned tip
    hull() {
        translate([plate_t + reach, rod_d / 2]) circle(d = rod_d);
        translate([plate_t + reach, rod_d / 2 + tip_h]) circle(d = rod_d);
    }
}

module screw_hole(z) {
    translate([-1, z, width / 2]) rotate([0, 90, 0]) {
        cylinder(h = plate_t + 2, d = screw_d);
        // countersink
        translate([0, 0, 1 + plate_t - head_d / 4])
            cylinder(h = head_d / 4 + 0.01, d1 = screw_d, d2 = head_d);
    }
}

difference() {
    linear_extrude(height = width) side_profile();
    screw_hole(plate_h - 8);
    screw_hole(plate_h - 30);
}
`,
  },
]

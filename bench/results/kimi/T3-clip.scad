/* [Dimensions] */
// Cable diameter to clip
cable_dia = 5; // [2:0.5:15]
// Wall thickness of the clip body
wall = 2.4; // [1.2:0.4:4]
// Base width (mounting flange)
base_width = 18; // [10:0.5:30]
// Base length (mounting flange)
base_length = 22; // [12:0.5:40]
// Height of the clip arch above the base
arch_height = 8; // [4:0.5:16]
// Gap width for cable entry (auto if 0)
entry_gap = 0; // [0:0.2:8]

/* [Screw] */
// Screw head diameter (M3 countersunk)
screw_head_dia = 6.2; // [4:0.1:10]
// Screw head height (countersink depth)
screw_head_depth = 1.8; // [1:0.1:4]
// Screw shank diameter (with clearance)
screw_shank_dia = 3.4; // [2.5:0.1:6]

/* [Options] */
// Add chamfer to entry edges for easier snap
entry_chamfer = true;

/* [Hidden] */
$fn = 64;

// Derived values
inner_r = cable_dia / 2 + 0.3; // sliding fit for cable
outer_r = inner_r + wall;
gap = entry_gap > 0 ? entry_gap : cable_dia * 0.65; // auto gap if not specified
total_height = arch_height + wall;

// Check minimum wall
assert(wall >= 1.2, "Wall must be >= 1.2mm");
assert(gap < inner_r * 2, "Gap must be smaller than cable diameter");

module cable_clip() {
    difference() {
        union() {
            // Base plate
            linear_extrude(wall)
                translate([-base_length/2, -base_width/2])
                    square([base_length, base_width]);
            
            // Arch body (hull of two circles for clean outer shape)
            translate([0, 0, wall])
            linear_extrude(arch_height)
                difference() {
                    // Outer shape: two circles with rectangle between
                    hull() {
                        translate([-outer_r, 0]) circle(r = outer_r);
                        translate([outer_r, 0]) circle(r = outer_r);
                        translate([-outer_r, -outer_r]) square([outer_r*2, outer_r*2]);
                    }
                    // Inner cutout
                    hull() {
                        translate([-inner_r, 0]) circle(r = inner_r);
                        translate([inner_r, 0]) circle(r = inner_r);
                        translate([-inner_r, -inner_r-0.01]) square([inner_r*2, inner_r*2+0.01]);
                    }
                    // Entry gap at top
                    translate([-gap/2, 0]) square([gap, outer_r + 1]);
                }
            
            // Fillet transition from base to arch
            for (mx = [-1, 1]) {
                translate([mx * outer_r, 0, wall])
                    rotate([0, 0, mx > 0 ? 0 : 180])
                        linear_extrude(arch_height)
                            polygon([
                                [0, -outer_r],
                                [wall*1.5, -outer_r],
                                [0, outer_r]
                            ]);
            }
        }
        
        // Countersunk screw hole (centered on base)
        translate([0, 0, -0.5]) {
            // Shank hole through everything
            cylinder(h = total_height + 1, d = screw_shank_dia);
            // Countersink in base bottom
            cylinder(h = screw_head_depth + 0.5, d1 = screw_head_dia + 1, d2 = screw_shank_dia);
        }
        
        // Entry chamfer cuts (optional, for easier cable snap)
        if (entry_chamfer) {
            chamfer_size = wall * 0.8;
            for (my = [-1, 1]) {
                translate([0, my * (gap/2 + wall/2), total_height - chamfer_size/2])
                    rotate([0, 0, my > 0 ? 90 : -90])
                        linear_extrude(wall*2, center = true)
                            polygon([
                                [-chamfer_size, -wall],
                                [chamfer_size, -wall],
                                [0, wall]
                            ]);
            }
        }
    }
}

// Orient for printing: flat on XY plane, arch opening up (already correct)
cable_clip();
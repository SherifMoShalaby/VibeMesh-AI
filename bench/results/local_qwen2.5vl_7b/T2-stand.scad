/* [Dimensions] */
width = 75; // [10:150]
phone_wall = 9; // [2:20]
recline = 60; // [30:90]

/* [Options] */
lid = false;
corner_style = "round";

// Dimensions for the cable slot
slot_width = 5; // [0:40]
slot_depth = 8; // [0:10]
slot_location = width / 2; // Centered

// Main block for the desk phone stand
block() {
  // Desk phone cradle
  translate([width/2, -phone_wall/2, 0]) {
    // Horizontal base
    rotate([0, 0, recline]) {
     差值() {
        translate([0,0,phone_wall]) cube([width, 10, 100]);
      }
      cube([width+1, 10*2, 100]);
    }
    // Cable slot
    translate([slot_location, -phone_wall/2 + slot_depth/2, -(100 + phone_wall)]) {
      diff() {
        rotate([0,0,recline]) {
          cylinder(d=12, h=slot_depth+4, center=true);
        }
        translate([0,0,(10+slot_depth)]) circle(d=slot_width);
      }
    }
  }
  // Counterbore for screw heads (typically 6.2 for M3 screws)
  translate([width/2, -phone_wall/2, -phone_wall/2]) {
    counterbore(d=6.2);
  }
  // Corner chamfer
  chamfer([10,10]);
}
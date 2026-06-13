// [Dimensions]
width = 30; // [0:100]

// [Options]
// Corner style is not necessary here but kept for the parameter block.
corner_style = "round";

// Define height as a parameter, defaulting to 30mm if not specified.
h = 30;

/* Derived Values */
// Since only a single dimension is defined, no need to derive anything else.

cube([width, width, h]);
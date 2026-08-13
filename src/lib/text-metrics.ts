/**
 * Text-width estimates shared by every surface that lays out SVG text without
 * a DOM to measure in.
 *
 * The C4 exporter and the sequence layout both size boxes from character
 * counts, and both were carrying their own copy of the ratio below with a
 * comment claiming it was "the same estimate for the whole codebase". It is one
 * estimate now.
 *
 * Deliberately CONSERVATIVE — an overestimate leaves a box slightly roomy,
 * whereas an underestimate clips text that has no ellipsis to fall back on.
 */

/** Average glyph width per font-size unit, sans-serif. */
export const CHAR_WIDTH_RATIO = 0.58;

/** The same for monospace, whose glyphs are wider and uniform. */
export const MONO_CHAR_WIDTH_RATIO = 0.62;

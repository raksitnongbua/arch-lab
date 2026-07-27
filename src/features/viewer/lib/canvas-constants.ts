/**
 * Viewer canvas numbers — the viewer's own clamp and padding (the editor's
 * `lib/canvas-constants.ts` is frozen, and the viewer deliberately allows
 * less extreme zoom than the editor). One home so the canvas, its automatic
 * fits, and the on-canvas camera controls all agree.
 */

/** Zoom clamp: 10%–250%. */
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 2.5;

/** Fit-to-view padding around the diagram bounds, as a viewport fraction. */
export const FIT_PADDING = 0.14;

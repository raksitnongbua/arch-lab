/**
 * Viewer canvas numbers — the viewer's own clamp and padding (the editor's
 * `lib/canvas-constants.ts` is frozen, and the viewer deliberately allows
 * less extreme zoom than the editor). One home so the canvas, its automatic
 * fits, and the on-canvas camera controls all agree.
 */

/** Zoom clamp: 10%–250%. */
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 2.5;

/**
 * Fit-to-view padding around the diagram bounds.
 *
 * Per-side rather than one fraction, because the canvas is not empty at its
 * edges: the breadcrumb and level chips float over the top-left, and the zoom
 * control and hint pill over the bottom. A symmetric fraction centred the
 * diagram in the *whole* rect, so on a short canvas — a phone, or a small
 * embedded frame — the top row of nodes ended up underneath the breadcrumb.
 * The top and bottom insets are the height of that chrome plus a margin, in
 * px, so they reserve the same real space at every canvas size; the sides stay
 * proportional, which is what keeps a wide diagram from touching the frame.
 */
export const FIT_PADDING = {
  /** Breadcrumb + level chips (top-left). */
  top: "72px",
  /** Zoom control (bottom-left) and the hint pill, which wraps to two lines
   *  on a narrow canvas — hence a little more than the top. */
  bottom: "80px",
  x: "7%",
} as const;

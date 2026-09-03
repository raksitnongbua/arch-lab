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
 * The grid a dragged node lands on, in model px, while the canvas is editable.
 *
 * 8 IS THE FORMAT'S OWN RULE, not a canvas preference: `C4Node.position` is
 * documented as "always integral, snapped to multiples of 8" (`types/c4.ts`),
 * and `archtext/lib/defaults.ts` computes its whole default layout in
 * multiples of 8 so that omitted geometry and written geometry sit on one
 * grid. A drag that landed off-grid would put a node a few pixels out of step
 * with every node whose position the text still omits.
 *
 * DELIBERATELY NOT IMPORTED FROM THE EDITOR, which declares the same 8 twice
 * (`editor/state/model.ts`, `editor/lib/canvas-constants.ts`) for reasons its
 * own comments give. Both are past that feature's barrel, and a cross-feature
 * deep import is the thing `dry.md` refuses; this file is already the
 * sanctioned viewer-side twin of `editor/lib/canvas-constants.ts` (see the
 * header). The shared authority is the format rule above, and
 * `check:canvas-edit` asserts this constant still agrees with the default
 * layout's grid — so the two cannot part company silently.
 */
export const EDIT_GRID = 8;

/**
 * Fit-to-view padding around the diagram bounds.
 *
 * Per-side rather than one fraction, because the canvas is not empty at its
 * edges: chrome floats over the top-left and over the bottom. A symmetric
 * fraction centred the diagram in the *whole* rect, so on a short canvas — a
 * phone, or a small embedded frame — the top row of nodes ended up underneath
 * the breadcrumb. The top and bottom insets are the height of that chrome plus
 * a margin, in px, so they reserve the same real space at every canvas size;
 * the sides stay proportional, which is what keeps a wide diagram from
 * touching the frame.
 */
export const FIT_PADDING = {
  /**
   * The top-left stack: the breadcrumb card, and whatever stacks under it —
   * the node palette while the canvas is unlocked, the Paths pill on a diagram
   * that has paths. Deliberately unchanged as that stack grew: raising it
   * would re-frame every diagram in the product, including the ones with none
   * of that chrome on them.
   */
  top: "72px",
  /**
   * The bottom band: the zoom control at the right, and the path player when a
   * walk is being read, which is centred and taller. The player's own maximum
   * height is kept inside this inset — `check:paths` pins the relationship, so
   * a taller player fails rather than quietly covering the last row of nodes.
   */
  bottom: "80px",
  x: "7%",
} as const;

/**
 * The dash an ASYNCHRONOUS relationship is drawn with, in user units.
 *
 * Shared because three places have to agree on it: the edge draws it, the
 * canvas stylesheet marches it (the keyframe steps by exactly one period, or
 * the loop visibly jumps), and the SVG/GIF export re-emits it. It was written
 * out by hand in all three, which is how the marching period and the pattern
 * could have parted company without anything failing.
 *
 * This dash carries MEANING — solid is synchronous, dashed is not — so nothing
 * may borrow it for decoration.
 */
export const EDGE_BASE_DASH_ON = 6;
export const EDGE_BASE_DASH_OFF = 4;
export const EDGE_BASE_DASH = `${EDGE_BASE_DASH_ON} ${EDGE_BASE_DASH_OFF}`;
export const EDGE_BASE_DASH_PERIOD = EDGE_BASE_DASH_ON + EDGE_BASE_DASH_OFF;

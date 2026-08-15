/**
 * Canvas numbers. Frozen after Batch 1 — every ticket reads
 * these constants; nobody writes a magic number for any of them.
 */

/** Node positions quantise to this grid while dragging. */
export const GRID_SIZE = 8;

/**
 * Quantise a coordinate to {@link GRID_SIZE}.
 *
 * Here rather than at each call site for the reason in this file's header: the
 * rounding is part of the grid decision, and three components had each written
 * their own one-line `snap` over the same constant.
 *
 * `state/model.ts` deliberately keeps its own copy — the store enforces the
 * ×8 invariant with no UI present and must not import from `lib/`. Those two
 * are kept in step by hand; see the geometry-constants note there.
 */
export function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

/** Distance (flow units) at which alignment guides appear and snap. */
export const ALIGNMENT_THRESHOLD = 6;

/** Zoom clamp: 10%–400%. */
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4.0;

export const MIN_NODE_SIZE = { width: 120, height: 64 } as const;
export const DEFAULT_NODE_SIZE = { width: 176, height: 88 } as const;

/** Offset applied by paste/duplicate (v0.2) and overlap-avoidance on create. */
export const PASTE_OFFSET = 16;

/** Fit-to-view padding around the node bounds, in screen pixels. */
export const FIT_VIEW_PADDING_PX = 48;

/**
 * How far off a connection handle a release still counts, in flow units.
 *
 * One decision expressed once: this is also the dots' hit box in
 * `node-chrome.tsx` (`after:-inset-3` → 32px). Deliberately small — node
 * INTERIORS are covered by the full-bleed body handle there, not by this
 * radius, so widening it would only start reaching into neighbouring nodes and
 * silently retargeting the drop.
 */
export const CONNECT_SNAP_RADIUS = 32;

/** Arrow-key nudge distances: plain vs `Shift`-held. */
export const NUDGE_STEP = 8;
export const NUDGE_STEP_FINE = 1;

/**
 * The one answer to "what box encloses these?".
 *
 * SMALL, AND SHARED FOR A REASON. `boundsOf` used to live in the viewer's model
 * helpers, where its own note already said that every fit the canvas performs
 * must agree about what "the bounds of these nodes" means — a second copy would
 * drift and the camera would frame two things differently for no reason a reader
 * could see. That was right and it stopped being enforced: three features
 * outside the viewer reached for it through a cross-feature deep import (which
 * `dry.md` calls debt rather than a pattern), and the advisories gave up and
 * wrote the loop again.
 *
 * PURE, no imports beyond a type, so a check script can compute with it.
 */

/** An axis-aligned box in model coordinates. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Anything with a position and a size — a C4 node, a laid-out row, a frame. */
export interface Boxed {
  position: { x: number; y: number };
  size: { width: number; height: number };
}

/**
 * The model-space box enclosing a set of nodes.
 *
 * One function, because every fit the canvas performs must agree about what
 * "the bounds of these nodes" means — a whole diagram, a beat of a path, a
 * selection. A second copy would drift and the camera would frame two things
 * differently for no reason a reader could see. An empty set has no box, so it
 * answers a unit rect at the origin: `getViewportForBounds` needs a rect, and
 * an infinite one silently produces NaN.
 */
export function boundsOf(nodes: readonly Boxed[]): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + node.size.width);
    maxY = Math.max(maxY, node.position.y + node.size.height);
  }
  if (minX === Infinity) return { x: 0, y: 0, width: 1, height: 1 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

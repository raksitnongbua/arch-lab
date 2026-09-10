/**
 * The cubic bezier a floating connector draws, as a pure function.
 *
 * WHY THIS IS NOT `getBezierPath` FROM `@xyflow/react`, which is what it used
 * to be. That export is marked client-only, so the moment the C4 SVG renderer
 * was reached from a route handler it threw — "Attempted to call
 * getBezierPath() from the server" — and `/api/render` could not draw a C4
 * model at all. The curve itself is thirty lines of arithmetic with no DOM and
 * no React in it; only the package boundary made it unavailable.
 *
 * IT IS THE SAME ARITHMETIC, NOT A LOOKALIKE, and that is load-bearing: every
 * C4 diagram already on screen and in every exported file draws through this,
 * so a curve that differed by a pixel would silently redraw the whole product.
 * `pnpm check:bezier-path` imports React Flow's own function — which runs
 * perfectly well in plain Node, it is only the bundler that objects — and
 * compares both outputs across a grid of endpoint and side combinations. A
 * divergence fails there rather than showing up as a diagram that moved.
 *
 * Two things deliberately match the original exactly, including where they are
 * unobvious:
 *
 *   - `curvature` defaults to 0.25 and the control offset is
 *     `0.5 · distance` when the endpoints face each other and
 *     `curvature · 25 · √-distance` when they do not. The second branch is
 *     what keeps a backwards edge from collapsing into a straight line.
 *   - The label point is the cubic at t = 0.5 by the binomial weights
 *     (⅛, ⅜, ⅜, ⅛), which is not the curve's true midpoint by arc length.
 *     React Flow says so in its own comment; matching the approximation is the
 *     point, since every label position in the app was placed by it.
 */

import type { FanSide } from "./edge-fan";

/** React Flow's own default. Changing it moves every connector in the app. */
export const DEFAULT_CURVATURE = 0.25;

export interface BezierPathInput {
  sourceX: number;
  sourceY: number;
  sourcePosition: FanSide;
  targetX: number;
  targetY: number;
  targetPosition: FanSide;
  curvature?: number;
}

export interface BezierPath {
  /** The `d` attribute for an SVG `<path>`. */
  path: string;
  /** Where a label sits: the cubic at t = 0.5 (see the header). */
  labelX: number;
  labelY: number;
}

/**
 * How far a control point sits from its endpoint.
 *
 * A NEGATIVE `distance` means the two sides face AWAY from each other — a
 * target above a bottom-exiting source, say — and the square root is what
 * gives that case a control point at all. A linear offset there would put both
 * controls on the line between the endpoints and draw a straight segment where
 * the reader needs to see the connector leave and return.
 */
function controlOffset(distance: number, curvature: number): number {
  if (distance >= 0) return 0.5 * distance;
  return curvature * 25 * Math.sqrt(-distance);
}

/** One endpoint's control point, pushed out along the side it leaves by. */
function controlPoint(
  side: FanSide,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  curvature: number,
): [number, number] {
  switch (side) {
    case "left":
      return [x1 - controlOffset(x1 - x2, curvature), y1];
    case "right":
      return [x1 + controlOffset(x2 - x1, curvature), y1];
    case "top":
      return [x1, y1 - controlOffset(y1 - y2, curvature)];
    case "bottom":
      return [x1, y1 + controlOffset(y2 - y1, curvature)];
  }
}

/**
 * The connector's path and its label anchor.
 *
 * The `M…C…` string is formatted exactly as React Flow formats it — no space
 * after the command letters, comma-separated pairs — because
 * `check:bezier-path` compares the strings rather than the numbers, which is
 * the stricter test and the one that would catch a rounding change.
 */
export function bezierPath(input: BezierPathInput): BezierPath {
  const curvature = input.curvature ?? DEFAULT_CURVATURE;

  const [sourceControlX, sourceControlY] = controlPoint(
    input.sourcePosition,
    input.sourceX,
    input.sourceY,
    input.targetX,
    input.targetY,
    curvature,
  );
  const [targetControlX, targetControlY] = controlPoint(
    input.targetPosition,
    input.targetX,
    input.targetY,
    input.sourceX,
    input.sourceY,
    curvature,
  );

  return {
    path:
      `M${input.sourceX},${input.sourceY} ` +
      `C${sourceControlX},${sourceControlY} ` +
      `${targetControlX},${targetControlY} ` +
      `${input.targetX},${input.targetY}`,
    labelX:
      input.sourceX * 0.125 +
      sourceControlX * 0.375 +
      targetControlX * 0.375 +
      input.targetX * 0.125,
    labelY:
      input.sourceY * 0.125 +
      sourceControlY * 0.375 +
      targetControlY * 0.375 +
      input.targetY * 0.125,
  };
}

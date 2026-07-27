/**
 * Edge geometry (T2-A). Owns the parallel-edge offset curve (AF-E1-S5's
 * "second A→B edge stays readable") and the label anchor point.
 *
 * `selectParallelEdgeGroups` (state) groups edges by UNORDERED endpoint pair,
 * so an A→B and a B→A edge share a group. The perpendicular normal used for
 * the offset is therefore made canonical — derived from the line's
 * orientation, not the edge's direction — so mirrored edges in one group
 * never collapse onto the same curve.
 */

import { getBezierPath, Position } from "@xyflow/react";

/** Control-point spacing between adjacent parallel edges, in flow units. */
export const PARALLEL_EDGE_SPACING = 48;

/* ---- Floating anchors ------------------------------------------------------ */

/** Axis-aligned node bounds in flow coordinates. */
export interface NodeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FloatingAnchors {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
}

/**
 * The side of `rect` facing the direction (dx, dy), where (dx, dy) points
 * from this rect's centre toward the other node's centre. The horizontal /
 * vertical decision normalises by the node's own half-extents, so a wide
 * node connecting to a neighbour slightly above it exits through its (long)
 * top side rather than snapping to a narrow left/right side.
 */
function facingSide(rect: NodeRect, dx: number, dy: number): Position {
  const horizontalness = Math.abs(dx) / Math.max(rect.width / 2, 1);
  const verticalness = Math.abs(dy) / Math.max(rect.height / 2, 1);
  if (horizontalness >= verticalness) {
    return dx >= 0 ? Position.Right : Position.Left;
  }
  return dy >= 0 ? Position.Bottom : Position.Top;
}

/** Midpoint of the given side of `rect`. */
function sideMidpoint(
  rect: NodeRect,
  side: Position,
): { x: number; y: number } {
  switch (side) {
    case Position.Left:
      return { x: rect.x, y: rect.y + rect.height / 2 };
    case Position.Right:
      return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
    case Position.Top:
      return { x: rect.x + rect.width / 2, y: rect.y };
    case Position.Bottom:
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
  }
}

/**
 * Floating (dynamic) edge anchors: the edge leaves the side of the source
 * facing the target and enters the side of the target facing the source,
 * recomputed from current node geometry on every render — so edges follow
 * nodes live during drags.
 *
 * Deliberately NOT persisted per-edge: this is a C4 editor whose nodes are
 * dragged constantly, and a handle pinned at save time goes stale the moment
 * a node moves (an edge frozen to "top" while its target sits below looks
 * broken). draw.io — the product's explicit reference — re-routes edges to
 * the facing side automatically, and computing sides at render time keeps
 * the persisted schema, serializer key order, and round-trip fixtures
 * untouched.
 */
export function getFloatingAnchors(
  source: NodeRect,
  target: NodeRect,
): FloatingAnchors {
  const dx = target.x + target.width / 2 - (source.x + source.width / 2);
  const dy = target.y + target.height / 2 - (source.y + source.height / 2);

  const sourcePosition = facingSide(source, dx, dy);
  const targetPosition = facingSide(target, -dx, -dy);
  const sourcePoint = sideMidpoint(source, sourcePosition);
  const targetPoint = sideMidpoint(target, targetPosition);

  return {
    sourceX: sourcePoint.x,
    sourceY: sourcePoint.y,
    targetX: targetPoint.x,
    targetY: targetPoint.y,
    sourcePosition,
    targetPosition,
  };
}

export interface ParallelEdgePathInput {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  /** 0-based position within the edge's parallel group (§4.3). */
  parallelIndex: number;
  /** Size of that group. 1 ⇒ default bezier; >1 ⇒ symmetric offsets. */
  parallelCount: number;
}

export interface EdgePathGeometry {
  /** SVG path `d` for the edge line. */
  path: string;
  /** Label anchor — the curve's midpoint. */
  labelX: number;
  labelY: number;
}

/**
 * Symmetric control-point offset for edge `index` of `count` parallels:
 * count 1 ⇒ 0; count 2 ⇒ ±24; count 3 ⇒ −48/0/+48 …
 */
export function parallelOffset(index: number, count: number): number {
  return (index - (count - 1) / 2) * PARALLEL_EDGE_SPACING;
}

/**
 * The edge path plus its label anchor. A lone edge uses React Flow's default
 * bezier; parallels become quadratic curves whose control point is pushed
 * along the canonical perpendicular of the source→target line.
 */
export function getParallelEdgePath(
  input: ParallelEdgePathInput,
): EdgePathGeometry {
  const offset = parallelOffset(input.parallelIndex, input.parallelCount);

  if (offset === 0) {
    const [path, labelX, labelY] = getBezierPath({
      sourceX: input.sourceX,
      sourceY: input.sourceY,
      sourcePosition: input.sourcePosition,
      targetX: input.targetX,
      targetY: input.targetY,
      targetPosition: input.targetPosition,
    });
    return { path, labelX, labelY };
  }

  const dx = input.targetX - input.sourceX;
  const dy = input.targetY - input.sourceY;
  const length = Math.hypot(dx, dy) || 1;

  // Canonical perpendicular: flip so it depends only on the line, not on
  // which endpoint happens to be the source (see header comment).
  let nx = -dy / length;
  let ny = dx / length;
  if (dx < 0 || (dx === 0 && dy < 0)) {
    nx = -nx;
    ny = -ny;
  }

  const controlX = (input.sourceX + input.targetX) / 2 + nx * offset;
  const controlY = (input.sourceY + input.targetY) / 2 + ny * offset;

  const path = `M ${input.sourceX},${input.sourceY} Q ${controlX},${controlY} ${input.targetX},${input.targetY}`;

  // Quadratic bezier at t = 0.5: B(0.5) = 0.25·P0 + 0.5·C + 0.25·P1.
  const labelX = 0.25 * input.sourceX + 0.5 * controlX + 0.25 * input.targetX;
  const labelY = 0.25 * input.sourceY + 0.5 * controlY + 0.25 * input.targetY;

  return { path, labelX, labelY };
}

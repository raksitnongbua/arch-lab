/**
 * Edge geometry. Owns the parallel-edge offset curve ('s
 * "second A→B edge stays readable") and the label anchor point.
 *
 * `selectParallelEdgeGroups` (state) groups edges by UNORDERED endpoint pair,
 * so an A→B and a B→A edge share a group. The perpendicular normal used for
 * the offset is therefore made canonical — derived from the line's
 * orientation, not the edge's direction — so mirrored edges in one group
 * never collapse onto the same curve.
 */

import { getBezierPath, Position } from "@xyflow/react";

import { clearingOffset } from "@/lib/curve-clearance";

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

/* ---- Label fan bias -------------------------------------------------------- */

/**
 * How far along the line a label slides away from a shared endpoint, in flow
 * units — and never more than `LABEL_FAN_FRACTION` of the line, so a short edge
 * keeps its label on the line rather than pushing it past a node.
 */
const LABEL_FAN_SHIFT = 56;
const LABEL_FAN_FRACTION = 0.22;

/** Which way an edge's label slides: −1 toward the source, +1 toward the target. */
export type LabelBias = -1 | 0 | 1;

export interface EdgeEndpoints {
  id: string;
  source: string;
  target: string;
}

/**
 * A bias per edge id that keeps the labels of a *fan* — several edges meeting
 * at one node — from landing on top of each other. Near the shared node the
 * curves are bunched together, so every midpoint label collides there; away
 * from it they have already spread out. So a label slides toward whichever end
 * of its edge is NOT shared:
 *
 *   - one source, many targets  → slide toward the target (+1)
 *   - many sources, one target  → slide toward the source (−1)
 *   - shared at both ends, or neither → stay at the midpoint (0)
 *
 * Bias 0 for every edge in a diagram with no fans, so simple diagrams render
 * exactly as before.
 */
export function labelBiasByEdgeId(
  edges: readonly EdgeEndpoints[],
): Map<string, LabelBias> {
  const outDegree = new Map<string, number>();
  const inDegree = new Map<string, number>();
  for (const edge of edges) {
    outDegree.set(edge.source, (outDegree.get(edge.source) ?? 0) + 1);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }
  const bias = new Map<string, LabelBias>();
  for (const edge of edges) {
    const fansOut = (outDegree.get(edge.source) ?? 0) > 1;
    const fansIn = (inDegree.get(edge.target) ?? 0) > 1;
    bias.set(edge.id, fansOut === fansIn ? 0 : fansOut ? 1 : -1);
  }
  return bias;
}

export interface ParallelEdgePathInput {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  /** 0-based position within the edge's parallel group. */
  parallelIndex: number;
  /** Size of that group. 1 ⇒ default bezier; >1 ⇒ symmetric offsets. */
  parallelCount: number;
  /** From `labelBiasByEdgeId`. Omitted ⇒ 0 ⇒ label at the midpoint. */
  labelBias?: LabelBias;
  /**
   * Boxes the curve must not pass through — every node on the diagram EXCEPT
   * this edge's own two endpoints. Omitted, the curve is drawn exactly as it
   * always was, which is what keeps the editor canvas and every existing
   * fixture unchanged until a caller opts in.
   */
  obstacles?: readonly NodeRect[];
}

export interface EdgePathGeometry {
  /** SVG path `d` for the edge line. */
  path: string;
  /** Label anchor — the curve's midpoint, slid along the line by `labelBias`. */
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
 * Slides a midpoint label along the source→target direction by the edge's fan
 * bias (see `labelBiasByEdgeId`). Deliberately along the straight line, not
 * along the curve: at these curvatures the two are within a couple of pixels
 * of each other, and this needs no assumption about how React Flow places the
 * control points of its bezier.
 */
function slideAlongLine(
  input: ParallelEdgePathInput,
  x: number,
  y: number,
): { labelX: number; labelY: number } {
  const bias = input.labelBias ?? 0;
  if (bias === 0) return { labelX: x, labelY: y };
  const dx = input.targetX - input.sourceX;
  const dy = input.targetY - input.sourceY;
  const length = Math.hypot(dx, dy);
  if (length === 0) return { labelX: x, labelY: y };
  const shift = Math.min(LABEL_FAN_SHIFT, length * LABEL_FAN_FRACTION) * bias;
  return {
    labelX: x + (dx / length) * shift,
    labelY: y + (dy / length) * shift,
  };
}

/**
 * The edge path plus its label anchor. A lone edge uses React Flow's default
 * bezier; parallels become quadratic curves whose control point is pushed
 * along the canonical perpendicular of the source→target line.
 */
export function getParallelEdgePath(
  input: ParallelEdgePathInput,
): EdgePathGeometry {
  const base = parallelOffset(input.parallelIndex, input.parallelCount);

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

  const offset = clearingOffset({
    sourceX: input.sourceX,
    sourceY: input.sourceY,
    targetX: input.targetX,
    targetY: input.targetY,
    base,
    normalX: nx,
    normalY: ny,
    obstacles: input.obstacles,
  });

  /* React Flow's own bezier ONLY while the edge is genuinely straight — a lone
   * connector with nothing in its way. The moment an offset is wanted, for a
   * parallel group or to get past a box, the curve becomes the quadratic below,
   * whose control point is the thing being moved. Keeping the default bezier
   * for the unobstructed case is what leaves every existing diagram drawing
   * exactly as it did. */
  if (offset === 0) {
    const [path, midX, midY] = getBezierPath({
      sourceX: input.sourceX,
      sourceY: input.sourceY,
      sourcePosition: input.sourcePosition,
      targetX: input.targetX,
      targetY: input.targetY,
      targetPosition: input.targetPosition,
    });
    return { path, ...slideAlongLine(input, midX, midY) };
  }

  const controlX = (input.sourceX + input.targetX) / 2 + nx * offset;
  const controlY = (input.sourceY + input.targetY) / 2 + ny * offset;

  const path = `M ${input.sourceX},${input.sourceY} Q ${controlX},${controlY} ${input.targetX},${input.targetY}`;

  // Quadratic bezier at t = 0.5: B(0.5) = 0.25·P0 + 0.5·C + 0.25·P1.
  const midX = 0.25 * input.sourceX + 0.5 * controlX + 0.25 * input.targetX;
  const midY = 0.25 * input.sourceY + 0.5 * controlY + 0.25 * input.targetY;

  return { path, ...slideAlongLine(input, midX, midY) };
}

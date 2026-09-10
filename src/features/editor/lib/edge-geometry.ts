/**
 * Edge geometry. Owns the parallel-edge corridor separation ('s
 * "second A→B edge stays readable") and the label anchor point.
 *
 * THE ROUTE ITSELF IS NOT HERE. Side selection lives in `lib/edge-fan.ts` and
 * the right-angle path in `lib/orthogonal-route.ts`, both pure, because this
 * module imports `@xyflow/react` and Node's type stripping cannot follow an
 * import into React — so nothing reachable from here can be loaded by a check
 * script, and geometry is proved by computing it. What is left here is the
 * boundary: React Flow's `Position` mapped onto `FanSide`, and the two
 * decisions that need the whole edge SET rather than one edge (the parallel
 * corridor offset and the label fan bias).
 *
 * `selectParallelEdgeGroups` (state) groups edges by UNORDERED endpoint pair,
 * so an A→B and a B→A edge share a group. The corridor offset is an ABSOLUTE
 * shift of a canvas coordinate rather than one measured along the edge's own
 * direction, so mirrored edges in one group stay on opposite sides of the
 * midline instead of collapsing onto one run.
 */

import type { Position } from "@xyflow/react";

import { MAX_ANCHOR_SLIDE, orthogonalRoute } from "@/lib/orthogonal-route";
import {
  pointAlongPolyline,
  polylineLength,
  roundedPolylinePath,
  type PolylinePoint,
} from "@/lib/polyline-path";
import {
  facingSide,
  fanOffset,
  pointOnSide,
  sideLength,
  type FanSide,
  type FanSlot,
} from "@/lib/edge-fan";

export { assignFanSlots, parallelEdgeGroups } from "@/lib/edge-fan";
export type { EdgeFanSlots, FanSlot } from "@/lib/edge-fan";

/** Corridor spacing between adjacent parallel edges, in flow units. */
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
  /**
   * How far the route may slide these two points along their sides to meet,
   * rather than joining them with a jog (`MAX_ANCHOR_SLIDE`).
   *
   * DECIDED HERE BECAUSE THIS IS WHERE THE FAN IS KNOWN, and it is only ever
   * granted to a connector that is ALONE on both of its sides. A slot on a
   * shared side is spaced against its neighbours; sliding it would eat into
   * a gap `edge-fan` measured, and two connectors that drift together are a
   * worse defect than the jog this avoids. A lone connector has nothing to
   * collide with, and its attachment is the side's midpoint — a default, not
   * a decision.
   *
   * Carried on the anchors rather than passed separately so every caller
   * gets it from the spread it already writes: five surfaces route C4
   * connectors, and a fix that needed five call-site edits would be one
   * revert away from being four.
   */
  anchorSlack: number;
}

/**
 * `Position` is imported as a TYPE ONLY, and that is what lets this module be
 * reached from a route handler.
 *
 * The interfaces below still speak React Flow's `Position` because React
 * Flow's own edge components hand it to them, and a type import is erased at
 * build time — so nothing here pulls the package into the bundle. What used to
 * pull it in was the VALUE side: `Position.Left` in the map that stood here,
 * and `getBezierPath` in the curve. Both are gone.
 *
 * The enum's four members ARE the four strings `FanSide` lists — that is why
 * the map this replaces was an identity — so the cast below renames a value
 * rather than reinterpreting one. `check:orthogonal-route` is what keeps that
 * true: it drives a route from React Flow's own enum members and from these
 * strings and requires identical polylines.
 */
const sideOf = (position: Position): FanSide => position as unknown as FanSide;

const POSITION_BY_SIDE: Record<FanSide, Position> = {
  left: "left" as unknown as Position,
  right: "right" as unknown as Position,
  top: "top" as unknown as Position,
  bottom: "bottom" as unknown as Position,
};

/** Where one connector attaches on the side it leaves, fanned when it shares. */
function attachPoint(
  rect: NodeRect,
  side: FanSide,
  slot: FanSlot,
): { x: number; y: number } {
  const length = sideLength(rect, side);
  return pointOnSide(rect, side, fanOffset(slot.index, slot.count, length));
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
  /**
   * This edge's place among those sharing each of its two node sides, from
   * `assignFanSlots`.
   *
   * OPTIONAL, AND THE DEFAULT IS THE OLD BEHAVIOUR — a lone connector attaches
   * at the midpoint, which is `fanOffset(0, 1, L)`. Two callers legitimately
   * have no fan to consult: the connection line drawn while a user is still
   * dragging a new edge (it has no id yet, so it is in no group), and any
   * caller holding two rects and nothing else. Making the argument required
   * would have forced both to invent a slot, which is how a default becomes a
   * lie.
   */
  slots?: { source: FanSlot; target: FanSlot },
): FloatingAnchors {
  const dx = target.x + target.width / 2 - (source.x + source.width / 2);
  const dy = target.y + target.height / 2 - (source.y + source.height / 2);

  const sourceSide = facingSide(source, dx, dy);
  const targetSide = facingSide(target, -dx, -dy);
  const alone: FanSlot = { index: 0, count: 1 };
  const sourceSlot = slots?.source ?? alone;
  const targetSlot = slots?.target ?? alone;
  const sourcePoint = attachPoint(source, sourceSide, sourceSlot);
  const targetPoint = attachPoint(target, targetSide, targetSlot);

  return {
    anchorSlack:
      sourceSlot.count === 1 && targetSlot.count === 1 ? MAX_ANCHOR_SLIDE : 0,
    sourceX: sourcePoint.x,
    sourceY: sourcePoint.y,
    targetX: targetPoint.x,
    targetY: targetPoint.y,
    sourcePosition: POSITION_BY_SIDE[sourceSide],
    targetPosition: POSITION_BY_SIDE[targetSide],
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
  /** Size of that group. 1 ⇒ the plain route; >1 ⇒ symmetric corridors. */
  parallelCount: number;
  /** From `labelBiasByEdgeId`. Omitted ⇒ 0 ⇒ label at the midpoint. */
  labelBias?: LabelBias;
  /** From `getFloatingAnchors`. Omitted ⇒ 0 ⇒ any misalignment is drawn as a jog. */
  anchorSlack?: number;
}

export interface EdgePathGeometry {
  /** SVG path `d` for the edge line. */
  path: string;
  /** The route's corners, before rounding — for anything that needs to
   *  measure the line rather than draw it. */
  points: readonly PolylinePoint[];
  /** Label anchor — halfway along the route, slid by `labelBias`. */
  labelX: number;
  labelY: number;
  /**
   * How far along the route the anchor sits, in flow units.
   *
   * Handed out so a chip can be moved ALONG its own line rather than only
   * away from it: the placement pass needs somewhere to start measuring from,
   * and recomputing it there would be the same arithmetic done twice with two
   * chances to disagree.
   */
  labelArc: number;
  /** The route's total length, so a slide can be clamped to it. */
  routeLength: number;
  /**
   * The direction of the SEGMENT the anchor landed on.
   *
   * A label that wants to sit "beside the line" takes the perpendicular of
   * this. It used to take the perpendicular of one global source→target
   * vector, which was within a couple of pixels of the truth on a gentle
   * curve and is simply wrong on an elbow: that vector points through the
   * corner, so "beside" comes out in the wrong quadrant on at least one leg.
   */
  labelDirX: number;
  labelDirY: number;
}

/**
 * Symmetric corridor offset for edge `index` of `count` parallels:
 * count 1 ⇒ 0; count 2 ⇒ ±24; count 3 ⇒ −48/0/+48 …
 */
export function parallelOffset(index: number, count: number): number {
  return (index - (count - 1) / 2) * PARALLEL_EDGE_SPACING;
}

/**
 * The edge path, its corners, and its label anchor.
 *
 * ALONG THE ROUTE, NOT ALONG THE STRAIGHT LINE BETWEEN THE ENDS. The curve
 * this replaced put its anchor at the cubic's t = 0.5 and then slid it along
 * the straight source→target line, justified by the two being "within a
 * couple of pixels of each other at these curvatures". An L-shaped route has
 * no such luxury — the straight line between its ends is the diagonal it
 * exists to avoid — so both the anchor and the fan slide are measured by arc
 * length along the polyline itself.
 */
export function getParallelEdgePath(
  input: ParallelEdgePathInput,
): EdgePathGeometry {
  const points = orthogonalRoute({
    sourceX: input.sourceX,
    sourceY: input.sourceY,
    sourceSide: sideOf(input.sourcePosition),
    targetX: input.targetX,
    targetY: input.targetY,
    targetSide: sideOf(input.targetPosition),
    corridorOffset: parallelOffset(input.parallelIndex, input.parallelCount),
    slack: input.anchorSlack,
  });

  const length = polylineLength(points);
  const bias = input.labelBias ?? 0;
  const shift =
    bias === 0
      ? 0
      : Math.min(LABEL_FAN_SHIFT, length * LABEL_FAN_FRACTION) * bias;
  const anchor = pointAlongPolyline(points, length / 2 + shift);

  const labelArc = Math.min(Math.max(length / 2 + shift, 0), length);

  return {
    path: roundedPolylinePath(points),
    points,
    labelX: anchor.x,
    labelY: anchor.y,
    labelArc,
    routeLength: length,
    labelDirX: anchor.dx,
    labelDirY: anchor.dy,
  };
}

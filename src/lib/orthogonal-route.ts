/**
 * The right-angle route a C4 connector takes between two nodes.
 *
 * ═══ WHY THIS REPLACED THE CURVE ═══
 *
 * C4 connectors were cubic beziers, and where two of them ran between the
 * same pair — or where one had to get past a box it did not connect — they
 * became quadratics bowed out of the way. `lib/curve-clearance.ts`, which
 * this module and its check script replace, argued the bow was the smallest
 * fix that read correctly and that orthogonal routing "would give a C4
 * diagram a second visual language for the sake of the same information".
 *
 * THAT ARGUMENT WAS WRONG IN TWO PLACES, and both were visible rather than
 * theoretical:
 *
 *   - The second language was already there. The flowchart, the ER schema and
 *     the gantt chart all draw right angles; two comments in `marketing/`
 *     described "the orthogonal routing the real canvases use" while the real
 *     C4 canvas drew curves. C4 was the odd one out, not the standard.
 *   - The bow could not finish the job it was written for. A connector aimed
 *     through the CENTRE of an element was declined outright — the offset
 *     needed is about four times the box's half-width, past the point where a
 *     bowed line reads as a third element's border — so the case that most
 *     needs routing was the case the curve gave up on.
 *
 * A right angle has no such ceiling: it goes around the box exactly, and it
 * composes with the `via` waypoints the grammar has advertised since it
 * shipped and no renderer has ever consumed.
 *
 * ═══ WHAT THIS DOES AND DOES NOT DO ═══
 *
 * It routes between two ATTACHMENT POINTS that somebody else has already
 * chosen. Side selection and fan spacing stay in `lib/edge-fan.ts`, unchanged
 * and already proven against right angles by the ER renderer, which has used
 * `fanOffset` for its orthogonal connectors all along.
 *
 * IT DOES NOT AVOID OBSTACLES YET. A connector can still cross an element it
 * does not touch, exactly as a declined bow could. That is a deliberate first
 * step, not an oversight: the corridor this picks is the midpoint between the
 * two nodes, and choosing a clear one instead is a channel search of the kind
 * `gantt/lib/layout.ts` already does. It is the next thing to do here, and it
 * needs its own check script and a wider export bound — a detouring route can
 * leave the node bounding box that `viewer/export/render-svg.ts` currently
 * frames from, which a bezier never could.
 *
 * PURE, AND THAT IS LOAD-BEARING. `editor/lib/edge-geometry.ts` imports
 * `@xyflow/react` and so cannot be loaded by a check script through Node's
 * type stripping. Geometry is proved by computing it, so the geometry lives
 * here: no imports but a type, no DOM, no React.
 */

import type { FanSide } from "./edge-fan";
import type { PolylinePoint } from "./polyline-path";

/**
 * How far a connector runs straight out of a node before it may turn.
 *
 * NOT COSMETIC. An arrowhead takes its angle from the path's terminal tangent
 * (`orient="auto-start-reverse"`), and a corner arc placed right against the
 * node would hand it the tangent of the arc instead of the tangent of the
 * approach — an arrowhead entering a box at 45°. 20 clears the 8-unit corner
 * radius twice over, so the straight run either side of every turn is longer
 * than the arc that rounds it.
 */
export const EDGE_STUB = 20;

export interface OrthogonalRouteInput {
  sourceX: number;
  sourceY: number;
  /**
   * The side of the source the connector leaves by.
   *
   * EXPECTED TO FACE THE OTHER END, which is what `getFloatingAnchors` gives
   * it: with the target to the right, `facingSide` can return `right`, `top`
   * or `bottom` for the source but never `left`. The router does not police
   * that — a caller who insists on two sides that turn away from each other
   * gets a route that leaves correctly and doubles back, rather than an
   * error — but it is why there is no wrap-around case below.
   */
  sourceSide: FanSide;
  targetX: number;
  targetY: number;
  /** The side of the target the connector arrives at. */
  targetSide: FanSide;
  /**
   * Shifts the shared corridor, so two connectors between the same pair do
   * not lay their long middle run on top of each other.
   *
   * The two ends are already apart — `edge-fan` gives each its own slot on
   * the node's side — but a Z-route computes its corridor from the midpoint
   * of the two nodes, which is the same midpoint for both. Without this they
   * would separate at the ends and merge in the middle, which reads worse
   * than not separating at all.
   *
   * ABSOLUTE, NOT RELATIVE TO DIRECTION, which is what keeps an A→B and a
   * B→A edge in one group off each other: the corridor coordinate is a
   * position on the canvas, so opposite signs stay opposite however the edge
   * is oriented.
   */
  corridorOffset?: number;
  /** Overrides `EDGE_STUB`. */
  stub?: number;
}

/** The outward unit normal of a side. */
function outward(side: FanSide): { x: number; y: number } {
  switch (side) {
    case "left":
      return { x: -1, y: 0 };
    case "right":
      return { x: 1, y: 0 };
    case "top":
      return { x: 0, y: -1 };
    case "bottom":
      return { x: 0, y: 1 };
  }
}

const isHorizontal = (side: FanSide): boolean =>
  side === "left" || side === "right";

/**
 * Drops points that repeat and points that sit in the middle of a straight
 * run.
 *
 * WITHOUT THIS EVERY ROUTE WOULD ROUND CORNERS THAT ARE NOT THERE. The route
 * below is built to one shape — out by a stub, across a corridor, in by a
 * stub — and the common cases degenerate: two nodes level with each other
 * produce a corridor at the same y as both ends, which is four collinear
 * points where the reader should see one straight line. `roundedPolylinePath`
 * would dutifully draw a `Q` at each of them, and a straight connector would
 * acquire two invisible-but-real kinks.
 */
function simplify(points: readonly PolylinePoint[]): PolylinePoint[] {
  const out: PolylinePoint[] = [];
  for (const point of points) {
    const last = out[out.length - 1];
    if (last !== undefined && last.x === point.x && last.y === point.y)
      continue;
    out.push({ x: point.x, y: point.y });
  }
  for (let i = out.length - 2; i >= 1; i -= 1) {
    const prev = out[i - 1];
    const here = out[i];
    const next = out[i + 1];
    const collinear =
      (prev.x === here.x && here.x === next.x) ||
      (prev.y === here.y && here.y === next.y);
    if (collinear) out.splice(i, 1);
  }
  return out;
}

/**
 * Where the crossing run goes, on the axis the two ends do NOT travel along.
 *
 * THE CONSTRAINT IS THAT NEITHER END DOUBLES BACK. A connector leaving the
 * right of a box and one entering the left of another both travel rightwards,
 * so the vertical run that joins them has to sit at an x that is past the
 * first stub and short of the second. Between two well-separated boxes the
 * midpoint satisfies that comfortably; between two that OVERLAP on this axis
 * there is no such x at all, and this returns null so the caller can put the
 * corridor on the other axis instead.
 *
 * When both ends leave the same way — two boxes side by side joined right-to-
 * right — the feasible region is open-ended, and the corridor goes a stub
 * beyond the further of the two so the connector wraps outside both.
 */
function corridor(
  from: number,
  fromOut: number,
  to: number,
  toOut: number,
  offset: number,
  stub: number,
): number | null {
  if (fromOut === toOut) {
    const bound = fromOut > 0 ? Math.max(from, to) : Math.min(from, to);
    const base = bound + fromOut * stub;
    const shifted = base + offset;
    return fromOut > 0 ? Math.max(shifted, bound) : Math.min(shifted, bound);
  }
  const low = Math.min(from, to);
  const high = Math.max(from, to);
  /* Facing each other but overlapping: the first stub already reaches past
     where the second one ends, so no crossing run can satisfy both. */
  if ((from - to) * fromOut > 0) return null;
  return Math.min(Math.max((from + to) / 2 + offset, low), high);
}

/**
 * The polyline between two attachment points, as corners rather than as a
 * path — `roundedPolylinePath` turns it into a `d`, and `pointAlongPolyline`
 * finds a label's place on it.
 *
 * THREE SHAPES, chosen by whether the two ends travel on the same axis:
 *
 *   - Both on one axis → a Z, joined by one crossing run on the other axis.
 *     This is also the case that degenerates to a straight line when the ends
 *     are level. If the two boxes overlap on the travel axis there is no
 *     legal crossing run there, and the Z turns a quarter — the corridor
 *     moves to the axis the ends travel along, which always has room.
 *   - One end on each axis → a single L, turning where the source's run meets
 *     the target's. This is the common diagonal case and the one that looks
 *     most like a drawn diagram.
 *   - One on each, where that corner would fall BEHIND the source's stub →
 *     the other L, turning early instead of late. Without this the connector
 *     leaves its node, doubles back over itself, and turns: correct, and
 *     ugly, which `purpose.md` calls a bug rather than a compromise.
 */
export function orthogonalRoute(input: OrthogonalRouteInput): PolylinePoint[] {
  const stub = input.stub ?? EDGE_STUB;
  const offset = input.corridorOffset ?? 0;

  const start = { x: input.sourceX, y: input.sourceY };
  const end = { x: input.targetX, y: input.targetY };
  const out = outward(input.sourceSide);
  const into = outward(input.targetSide);

  const afterStub = { x: start.x + out.x * stub, y: start.y + out.y * stub };
  const beforeEnd = { x: end.x + into.x * stub, y: end.y + into.y * stub };

  const sourceHorizontal = isHorizontal(input.sourceSide);
  const targetHorizontal = isHorizontal(input.targetSide);

  if (sourceHorizontal === targetHorizontal) {
    if (sourceHorizontal) {
      const x = corridor(afterStub.x, out.x, beforeEnd.x, into.x, offset, stub);
      if (x !== null) {
        return simplify([
          start,
          afterStub,
          { x, y: afterStub.y },
          { x, y: beforeEnd.y },
          beforeEnd,
          end,
        ]);
      }
      /* Overlapping horizontally: cross on the vertical axis instead. Both
         ends still leave and arrive along their own sides; the middle run
         travels back the way it came, which is what a reader expects of two
         boxes that sit beside each other. */
      const y = (afterStub.y + beforeEnd.y) / 2 + offset;
      return simplify([
        start,
        afterStub,
        { x: afterStub.x, y },
        { x: beforeEnd.x, y },
        beforeEnd,
        end,
      ]);
    }
    const y = corridor(afterStub.y, out.y, beforeEnd.y, into.y, offset, stub);
    if (y !== null) {
      return simplify([
        start,
        afterStub,
        { x: afterStub.x, y },
        { x: beforeEnd.x, y },
        beforeEnd,
        end,
      ]);
    }
    const x = (afterStub.x + beforeEnd.x) / 2 + offset;
    return simplify([
      start,
      afterStub,
      { x, y: afterStub.y },
      { x, y: beforeEnd.y },
      beforeEnd,
      end,
    ]);
  }

  /* The late corner: run out along the source's axis all the way to the
     target's run, then turn once. */
  const late = sourceHorizontal
    ? { x: beforeEnd.x, y: afterStub.y }
    : { x: afterStub.x, y: beforeEnd.y };

  const behind = sourceHorizontal
    ? (late.x - afterStub.x) * out.x < 0
    : (late.y - afterStub.y) * out.y < 0;

  const corner = behind
    ? sourceHorizontal
      ? { x: afterStub.x, y: beforeEnd.y }
      : { x: beforeEnd.x, y: afterStub.y }
    : late;

  return simplify([start, afterStub, corner, beforeEnd, end]);
}

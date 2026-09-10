/**
 * An orthogonal polyline as an SVG path with rounded corners, and the
 * arc-length arithmetic that goes with one.
 *
 * WHY THIS IS IN `src/lib/` RATHER THAN IN THE FLOWCHART, where it was
 * written. It was `flowchart/lib/shapes.ts`'s private corner-rounder for as
 * long as the flowchart was the only notation that drew right angles. C4
 * connectors now draw them too (`lib/orthogonal-route.ts`), and a second copy
 * of "how a corner is rounded" is exactly the duplication that lets two
 * notations drift into two house styles — one at radius 8 and one at radius 6,
 * discovered in a screenshot rather than in a diff. One definition, both
 * callers, and the flowchart's own radius is still the flowchart's to choose.
 *
 * PURE AND ERASABLE — no DOM, no React — because `codebase.md` says geometry
 * is proved by computing it, and a check script can only load a module Node's
 * type stripping can follow.
 */

import { fmt } from "./svg-markup";

/** A point on a polyline, in whatever coordinates its caller uses. */
export interface PolylinePoint {
  x: number;
  y: number;
}

/** The house corner radius for an orthogonal connector. */
export const CORNER_RADIUS = 8;

/**
 * An orthogonal polyline as a path with rounded corners. The radius shrinks
 * to half the shorter adjoining segment so a tight jog never overshoots —
 * the failure mode of a fixed radius is a little loop drawn at every corner
 * two lanes apart.
 */
export function roundedPolylinePath(
  points: readonly PolylinePoint[],
  radius: number = CORNER_RADIUS,
): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
  let d = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const corner = points[i];
    const next = points[i + 1];
    const inLen = Math.hypot(corner.x - prev.x, corner.y - prev.y);
    const outLen = Math.hypot(next.x - corner.x, next.y - corner.y);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    if (r < 0.5) {
      d += ` L ${fmt(corner.x)} ${fmt(corner.y)}`;
      continue;
    }
    const inX = corner.x - ((corner.x - prev.x) / inLen) * r;
    const inY = corner.y - ((corner.y - prev.y) / inLen) * r;
    const outX = corner.x + ((next.x - corner.x) / outLen) * r;
    const outY = corner.y + ((next.y - corner.y) / outLen) * r;
    d += ` L ${fmt(inX)} ${fmt(inY)} Q ${fmt(corner.x)} ${fmt(corner.y)} ${fmt(outX)} ${fmt(outY)}`;
  }
  const last = points[points.length - 1];
  d += ` L ${fmt(last.x)} ${fmt(last.y)}`;
  return d;
}

/**
 * The polyline's total length, measured along its CORNERS rather than around
 * its rounded arcs.
 *
 * The difference is real but tiny — a quarter-circle of radius 8 is 12.6 long
 * where the two half-segments it replaces are 16 — and it is the same
 * approximation the rounding itself makes. What matters is that every consumer
 * measures the same way, so a label placed at half the length by this function
 * lands where the eye reads the halfway point.
 */
export function polylineLength(points: readonly PolylinePoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y,
    );
  }
  return total;
}

/** A point on a polyline together with the unit direction it is travelling. */
export interface PolylineStation extends PolylinePoint {
  dx: number;
  dy: number;
}

/**
 * The point `distance` along the polyline, and the direction of the segment
 * it lands on.
 *
 * THE DIRECTION IS THE POINT, not a convenience. A label on a curve could take
 * one global source→target vector and call its perpendicular "beside the
 * line"; on an elbow that vector points through the corner and "beside" comes
 * out in the wrong quadrant on at least one leg. Every consumer that wants to
 * sit next to the line has to ask which SEGMENT it is sitting next to, and
 * this is where it asks.
 *
 * Clamped at both ends: a distance past the end returns the final point on the
 * final segment's direction, which is what a caller sliding a label off the
 * end of a short connector wants.
 */
export function pointAlongPolyline(
  points: readonly PolylinePoint[],
  distance: number,
): PolylineStation {
  if (points.length === 0) return { x: 0, y: 0, dx: 1, dy: 0 };
  if (points.length === 1) return { ...points[0], dx: 1, dy: 0 };

  let remaining = Math.max(0, distance);
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length === 0) continue;
    const dx = (to.x - from.x) / length;
    const dy = (to.y - from.y) / length;
    if (remaining <= length || i === points.length - 1) {
      const along = Math.min(remaining, length);
      return { x: from.x + dx * along, y: from.y + dy * along, dx, dy };
    }
    remaining -= length;
  }

  const last = points[points.length - 1];
  return { ...last, dx: 1, dy: 0 };
}

/**
 * The point on the polyline closest to `p`, and how far away that is.
 *
 * FOR THE LEADER, and that is the only caller. A relationship's chip is
 * placed away from its line whenever the line has no clear stretch wide
 * enough to hold it — a short connector between two elements 100 units apart
 * cannot carry a 170-unit label anywhere along its length. The chip is then
 * legible and unattributable, which is the complaint: the reader can read it
 * and cannot tell which relationship it names. Drawing a hairline back to
 * this point is what re-attaches it, and it needs the nearest point rather
 * than an endpoint so the leader crosses nothing on its way.
 */
export function nearestPointOnPolyline(
  points: readonly PolylinePoint[],
  p: PolylinePoint,
): PolylineStation & { distance: number } {
  let best = { x: 0, y: 0, dx: 1, dy: 0, distance: Infinity };
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    const vx = to.x - from.x;
    const vy = to.y - from.y;
    const square = vx * vx + vy * vy;
    const t =
      square === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((p.x - from.x) * vx + (p.y - from.y) * vy) / square),
          );
    const x = from.x + t * vx;
    const y = from.y + t * vy;
    const distance = Math.hypot(p.x - x, p.y - y);
    if (distance < best.distance) {
      const length = Math.hypot(vx, vy) || 1;
      best = { x, y, dx: vx / length, dy: vy / length, distance };
    }
  }
  if (best.distance === Infinity && points.length === 1) {
    return {
      ...points[0],
      dx: 1,
      dy: 0,
      distance: Math.hypot(p.x - points[0].x, p.y - points[0].y),
    };
  }
  return best;
}

/**
 * How far a chip may sit from its line before it needs a leader drawn to it.
 *
 * 24 because below it the chip's own rounded corner is within a few units of
 * the stroke and the two read as touching; above it there is canvas between
 * them and the association has to be made by eye.
 */
export const LEADER_THRESHOLD = 24;

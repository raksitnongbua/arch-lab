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
 * IT AVOIDS OBSTACLES ON THE CORRIDOR ONLY, and the limit is worth stating
 * because it is visible. The long middle run picks a lane clear of every
 * element the connector does not touch, in the manner of the channel search
 * `gantt/lib/layout.ts` already does. What it cannot move is either END: the
 * attachment points are chosen before this runs, so a connector whose final
 * approach passes through a box stays passing through it, and the remedy for
 * that is for the router to re-choose which SIDE it arrives by — a larger
 * change that would feed back into `edge-fan` and is not attempted here.
 *
 * On the diagram this was reported against, that is the difference between
 * three crossings and two. Both remaining ones are terminal approaches.
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

/**
 * How far an attachment may slide along its own side to avoid drawing a jog.
 *
 * THE DEFECT THIS EXISTS FOR, and it was on the front page. A person element
 * is 160 wide and a system 176, so two of them centre-aligned — which is what
 * every default layout produces — have their attachments 8 units apart. The
 * router drew that honestly: a run, an 8-unit jog, and another run. Eight
 * shipped documents had one, including the seed document `/live` opens with,
 * and a kink that small reads as a rendering fault rather than as geometry.
 * The curve this replaced hid it by sloping imperceptibly; a right angle
 * cannot, so the misalignment has to be absorbed instead.
 *
 * ABSORBED BY MOVING THE ENDS, NOT BY SLOPING THE LINE. An attachment is a
 * position on a side, not a fixed point — `edge-fan` picks it — so nudging it
 * by a few units costs nothing a reader can name, while a segment that is
 * almost-but-not-quite axis-aligned costs the whole visual language.
 *
 * 12 BECAUSE THAT IS `MIN_FAN_SPACING`: the closest two attachments on one
 * side are ever allowed to sit. A slide wider than that could carry a
 * connector past where a neighbour is entitled to be, and this is only ever
 * offered to a connector that HAS no neighbour on either side — see
 * `FloatingAnchors.anchorSlack`. Both ends move half the gap each, so neither
 * travels more than 6.
 */
export const MAX_ANCHOR_SLIDE = 12;

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
  /**
   * Every element the connector does not touch, so the corridor can pick a
   * lane clear of them. Omitted — as a caller with no diagram in hand has to
   * — and the corridor sits at the midpoint, which is what it always did.
   */
  obstacles?: readonly Obstacle[];
  /**
   * How far the two attachments may slide toward each other, along their own
   * sides, rather than be joined by a jog. 0 — the default — draws whatever
   * misalignment it is given. See `MAX_ANCHOR_SLIDE`.
   */
  slack?: number;
}

/** An element the connector must not run through. */
export interface Obstacle {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * How far the corridor will step looking for a clear lane, and by how much.
 *
 * A STEP SMALLER THAN AN ELEMENT IS WASTED WORK: the search is trying to get
 * past a box, and a 4-unit nudge cannot. 24 clears a default 176-wide element
 * in eight steps and lands on the 8-unit grid the format uses, so a routed
 * corridor sits where a hand-placed one would. The reach is bounded because a
 * corridor far outside both elements has stopped being a route between them —
 * past that the honest answer is that the layout needs changing, which is the
 * same call `edge-fan` makes when a side is too crowded to fan.
 */
const CHANNEL_STEP = 24;
const CHANNEL_REACH = 480;

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
  /**
   * Whether a lane at this coordinate is acceptable, best first. The whole Z
   * missing every box is what the router wants; the crossing run alone
   * missing them is what it settles for.
   */
  clear: readonly ((value: number) => boolean)[] = [],
): number | null {
  /* NEAREST CLEAR LANE, SEARCHED OUTWARD FROM THE ONE IT WANTED. Both
     directions at each step so the corridor moves the shortest distance it
     can, and the original is kept when nothing within reach is clear — a
     connector that crosses a box is bad, and one flung to the edge of the
     diagram to avoid it is worse.
     EACH STANDARD IS SEARCHED IN FULL BEFORE THE NEXT IS TRIED, so a lane
     that clears everything always beats a nearer one that only clears the
     crossing run. Falling back rather than loosening the test is what keeps
     the strict predicate from turning a route that used to step aside into
     one that gives up: where nothing satisfies it — a box tall enough to
     stand in both legs and the run at once — the answer is the one the
     looser standard would have given anyway. */
  const search = (base: number, low: number, high: number): number => {
    for (const acceptable of clear) {
      if (acceptable(base)) return base;
      for (
        let step = CHANNEL_STEP;
        step <= CHANNEL_REACH;
        step += CHANNEL_STEP
      ) {
        for (const candidate of [base + step, base - step]) {
          if (candidate < low || candidate > high) continue;
          if (acceptable(candidate)) return candidate;
        }
      }
    }
    return base;
  };

  if (fromOut === toOut) {
    const bound = fromOut > 0 ? Math.max(from, to) : Math.min(from, to);
    const base = bound + fromOut * stub;
    const shifted = base + offset;
    const kept =
      fromOut > 0 ? Math.max(shifted, bound) : Math.min(shifted, bound);
    return fromOut > 0
      ? search(kept, bound, bound + CHANNEL_REACH)
      : search(kept, bound - CHANNEL_REACH, bound);
  }
  const low = Math.min(from, to);
  const high = Math.max(from, to);
  /* Facing each other but overlapping: the first stub already reaches past
     where the second one ends, so no crossing run can satisfy both. */
  if ((from - to) * fromOut > 0) return null;
  return search(
    Math.min(Math.max((from + to) / 2 + offset, low), high),
    low,
    high,
  );
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

  const out = outward(input.sourceSide);
  const into = outward(input.targetSide);

  const start = { x: input.sourceX, y: input.sourceY };
  const end = { x: input.targetX, y: input.targetY };

  /* THE SLIDE, AND IT HAPPENS BEFORE ANYTHING ELSE, so every measurement
     below — the stubs, the corridor, the label's arc length — is taken on the
     geometry actually drawn. Only for two ends travelling on the same axis:
     an L has nowhere to slide to. */
  const slack = input.slack ?? 0;
  if (
    slack > 0 &&
    isHorizontal(input.sourceSide) === isHorizontal(input.targetSide)
  ) {
    const axis: "x" | "y" = isHorizontal(input.sourceSide) ? "y" : "x";
    const gap = end[axis] - start[axis];
    if (gap !== 0 && Math.abs(gap) <= slack) {
      const meeting = start[axis] + gap / 2;
      start[axis] = meeting;
      end[axis] = meeting;
    }
  }

  const afterStub = { x: start.x + out.x * stub, y: start.y + out.y * stub };
  const beforeEnd = { x: end.x + into.x * stub, y: end.y + into.y * stub };

  const sourceHorizontal = isHorizontal(input.sourceSide);
  const targetHorizontal = isHorizontal(input.targetSide);

  /* A LANE IS CLEAR WHEN THE WHOLE Z MISSES EVERY BOX — the crossing run AND
     the two legs that reach it, each measured over the span it actually
     covers rather than over the whole diagram. Strict comparisons, so a run
     grazing an element's edge counts as clear: the alternative is a search
     that steps away from a box it never touched.

     THE LEGS USED TO BE LEFT OUT, and that is what put a connector through a
     box on a diagram whose elements sit in rows. A lane is chosen by stepping
     outward from the midpoint, and testing the crossing run alone accepts the
     first lane whose short horizontal hop happens to clear the row it lands
     in — while the two vertical legs, which are most of the connector, run
     straight down through it. Every lane the search then skips over was a
     better one. The legs move WITH the lane, so they belong inside the
     predicate the search is asking about, not in a check applied after it. */
  const boxes = input.obstacles ?? [];
  const spans = (
    at: number,
    from: number,
    to: number,
    low: number,
    size: number,
    crossLow: number,
    crossSize: number,
  ): boolean =>
    at > low &&
    at < low + size &&
    Math.max(from, to) > crossLow &&
    Math.min(from, to) < crossLow + crossSize;
  /** The crossing run alone, vertical at `x` / horizontal at `y`. */
  const runVertical = (x: number): boolean =>
    !boxes.some((box) =>
      spans(x, afterStub.y, beforeEnd.y, box.x, box.width, box.y, box.height),
    );
  const runHorizontal = (y: number): boolean =>
    !boxes.some((box) =>
      spans(y, afterStub.x, beforeEnd.x, box.y, box.height, box.x, box.width),
    );
  /** The run and both legs that reach it. */
  const wholeVertical = (x: number): boolean =>
    runVertical(x) &&
    !boxes.some(
      (box) =>
        spans(
          afterStub.y,
          afterStub.x,
          x,
          box.y,
          box.height,
          box.x,
          box.width,
        ) ||
        spans(beforeEnd.y, beforeEnd.x, x, box.y, box.height, box.x, box.width),
    );
  const wholeHorizontal = (y: number): boolean =>
    runHorizontal(y) &&
    !boxes.some(
      (box) =>
        spans(
          afterStub.x,
          afterStub.y,
          y,
          box.x,
          box.width,
          box.y,
          box.height,
        ) ||
        spans(beforeEnd.x, beforeEnd.y, y, box.x, box.width, box.y, box.height),
    );
  const verticalLanes = boxes.length > 0 ? [wholeVertical, runVertical] : [];
  const horizontalLanes =
    boxes.length > 0 ? [wholeHorizontal, runHorizontal] : [];

  if (sourceHorizontal === targetHorizontal) {
    if (sourceHorizontal) {
      const x = corridor(
        afterStub.x,
        out.x,
        beforeEnd.x,
        into.x,
        offset,
        stub,
        verticalLanes,
      );
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
    const y = corridor(
      afterStub.y,
      out.y,
      beforeEnd.y,
      into.y,
      offset,
      stub,
      horizontalLanes,
    );
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

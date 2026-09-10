/**
 * Where a dragged element wants to land: the alignment snap, and the guide
 * lines that say why it landed there.
 *
 * ═══ TWO KINDS OF STOP, AND THE SECOND IS THE POINT ═══
 *
 * **Sibling stops** are the familiar ones, and the only ones this had when it
 * lived privately inside `editor/components/canvas.tsx`: an element's left,
 * centre and right want to line up with any other element's left, centre or
 * right, and the same on the vertical axis. Nine candidate pairs per axis per
 * neighbour, nearest wins.
 *
 * **Connector stops** are new, and they exist because the sibling ones do not
 * deliver what a reader is actually trying to do. Since C4 connectors became
 * right angles (`lib/orthogonal-route.ts`), a pair of elements a few units out
 * of line no longer draws a gently sloping line — it draws a straight run, a
 * tiny jog, and another straight run, and that kink is the most visible defect
 * on the canvas. So the obvious gesture is to nudge one element until the line
 * goes straight.
 *
 * SNAPPING CENTRES DOES NOT DO THAT, which is the trap this module exists to
 * avoid. A connector does not leave from an element's centre: it leaves from
 * its FAN SLOT, at `L·k/(N+1)` along the side (`lib/edge-fan.ts`), so an
 * element with three connectors leaving its underside has three departure
 * points and none of them is the middle. Line the two centres up and a fanned
 * connector is exactly as bent as it was. The stop that straightens a
 * connector is the one that aligns the two ANCHORS, and that is what this
 * computes — from the same `assignFanSlots` the renderer routes with, at the
 * position the drag is proposing.
 *
 * ═══ WHY THE FAN IS RECOMPUTED PER FRAME ═══
 *
 * A slot is assigned from where the other end SITS, so dragging can reorder
 * the fan on a side. Reading a cached assignment would offer a stop computed
 * for an arrangement the drag has already left, and the connector would not
 * be straight when the element landed. Recomputing is the same work the edge
 * projection already does once per render.
 *
 * ONE CASE IS DECLINED RATHER THAN APPROXIMATED: a connector whose two ends
 * leave on DIFFERENT axes — out of a side and into a top — is an L, and no
 * position makes an L straight. It offers no stop, instead of offering one
 * that would not deliver.
 *
 * PURE, no React and no DOM, so both canvases can call it and
 * `check:canvas-edit` can load it through Node's type stripping.
 */

import {
  assignFanSlots,
  facingSide,
  fanOffset,
  pointOnSide,
  sideLength,
  type FanSide,
} from "./edge-fan";

/** Distance (flow units) at which a stop takes hold and its guide appears. */
export const ALIGNMENT_THRESHOLD = 6;

/** How far past the two elements a guide line is drawn, so it reads as a rule. */
const GUIDE_OVERHANG = 24;

/** A line drawn to say which alignment a snap took hold of. */
export interface AlignmentGuide {
  id: string;
  orientation: "horizontal" | "vertical";
  /** Flow-space coordinate of the line: y for horizontal, x for vertical. */
  position: number;
  /** Flow-space extent of the line along its own axis. */
  from: number;
  to: number;
}

export interface SnapRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The two endpoints of a relationship, which is all a stop needs of one. */
export interface SnapEdge {
  id: string;
  source: string;
  target: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface SnapInput {
  /** The element being dragged. */
  movingId: string;
  /** Where the drag has put it, before snapping. */
  proposed: Point;
  width: number;
  height: number;
  /** Every element on the diagram, INCLUDING the one being dragged. */
  rects: readonly SnapRect[];
  /**
   * Every relationship, for the connector stops. Omit — as a canvas with no
   * routed connectors does — and only sibling stops are offered.
   */
  edges?: readonly SnapEdge[];
  /** Elements that must not act as neighbours: the rest of a multi-node drag. */
  exclude?: ReadonlySet<string>;
}

export interface SnapOutcome {
  /** The proposed position, corrected. Identical to `proposed` when nothing took. */
  position: Point;
  /** Empty unless an axis genuinely snapped. */
  guides: readonly AlignmentGuide[];
}

/** Shared identity for the common answer, so an idle canvas re-renders nothing. */
export const NO_GUIDES: readonly AlignmentGuide[] = Object.freeze([]);

interface AxisSnap {
  delta: number;
  guide: AlignmentGuide;
}

/** The nearer of two candidates, `null` counting as infinitely far. */
function nearer(a: AxisSnap | null, b: AxisSnap | null): AxisSnap | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.abs(b.delta) < Math.abs(a.delta) ? b : a;
}

function bestAxisSnap(
  ownStops: readonly number[],
  otherStops: readonly number[],
  buildGuide: (alignedAt: number) => AlignmentGuide,
): AxisSnap | null {
  let best: AxisSnap | null = null;
  for (const own of ownStops) {
    for (const other of otherStops) {
      const delta = other - own;
      if (Math.abs(delta) > ALIGNMENT_THRESHOLD) continue;
      if (best !== null && Math.abs(delta) >= Math.abs(best.delta)) continue;
      best = { delta, guide: buildGuide(other) };
    }
  }
  return best;
}

const isHorizontalSide = (side: FanSide): boolean =>
  side === "left" || side === "right";

/** Where a connector attaches, given the side it leaves by and its slot. */
function anchorOn(
  rect: SnapRect,
  side: FanSide,
  slot: { index: number; count: number },
): Point {
  return pointOnSide(
    rect,
    side,
    fanOffset(slot.index, slot.count, sideLength(rect, side)),
  );
}

const LONE_SLOT = { index: 0, count: 1 };

/**
 * The stops that would make one of the dragged element's own connectors draw
 * as a single straight run.
 *
 * Computed on the PROPOSED geometry, not the committed model, so the sides
 * and the fan order are the ones the connector will actually be routed with
 * when the press ends.
 */
function connectorStops(
  input: SnapInput,
  moving: SnapRect,
  byId: ReadonlyMap<string, SnapRect>,
): { x: AxisSnap | null; y: AxisSnap | null } {
  const edges = input.edges ?? [];
  const mine = edges.filter(
    (edge) =>
      (edge.source === input.movingId || edge.target === input.movingId) &&
      edge.source !== edge.target &&
      byId.has(edge.source) &&
      byId.has(edge.target),
  );
  if (mine.length === 0) return { x: null, y: null };

  const fans = assignFanSlots(edges, byId);
  let bestX: AxisSnap | null = null;
  let bestY: AxisSnap | null = null;

  for (const edge of mine) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (source === undefined || target === undefined) continue;

    const dx = target.x + target.width / 2 - (source.x + source.width / 2);
    const dy = target.y + target.height / 2 - (source.y + source.height / 2);
    const sourceSide = facingSide(source, dx, dy);
    const targetSide = facingSide(target, -dx, -dy);

    /* An L cannot be straightened by moving either end. Declined rather than
       offered as a stop that would not deliver. */
    if (isHorizontalSide(sourceSide) !== isHorizontalSide(targetSide)) continue;

    const slots = fans.get(edge.id);
    const from = anchorOn(source, sourceSide, slots?.source ?? LONE_SLOT);
    const to = anchorOn(target, targetSide, slots?.target ?? LONE_SLOT);

    const other = edge.source === input.movingId ? target : source;
    const movingEnd = edge.source === input.movingId ? from : to;
    const otherEnd = edge.source === input.movingId ? to : from;

    /* Connectors on the vertical axis are straightened by moving in x, and
       the other way round: the anchors have to share the coordinate the run
       does NOT travel along. */
    const axis: "x" | "y" = isHorizontalSide(sourceSide) ? "y" : "x";
    const delta = otherEnd[axis] - movingEnd[axis];
    if (Math.abs(delta) > ALIGNMENT_THRESHOLD) continue;

    const alignedAt = otherEnd[axis];
    if (axis === "x") {
      bestX = nearer(bestX, {
        delta,
        guide: {
          id: `edge-v-${edge.id}`,
          orientation: "vertical",
          position: alignedAt,
          from: Math.min(moving.y, other.y) - GUIDE_OVERHANG,
          to:
            Math.max(moving.y + moving.height, other.y + other.height) +
            GUIDE_OVERHANG,
        },
      });
    } else {
      bestY = nearer(bestY, {
        delta,
        guide: {
          id: `edge-h-${edge.id}`,
          orientation: "horizontal",
          position: alignedAt,
          from: Math.min(moving.x, other.x) - GUIDE_OVERHANG,
          to:
            Math.max(moving.x + moving.width, other.x + other.width) +
            GUIDE_OVERHANG,
        },
      });
    }
  }
  return { x: bestX, y: bestY };
}

/** The stops that line the dragged element's edges and centre up with a neighbour's. */
function siblingStops(input: SnapInput): {
  x: AxisSnap | null;
  y: AxisSnap | null;
} {
  const { proposed, width, height } = input;
  let bestX: AxisSnap | null = null;
  let bestY: AxisSnap | null = null;

  for (const other of input.rects) {
    if (other.id === input.movingId) continue;
    if (input.exclude?.has(other.id) === true) continue;

    bestX = nearer(
      bestX,
      bestAxisSnap(
        [proposed.x, proposed.x + width / 2, proposed.x + width],
        [other.x, other.x + other.width / 2, other.x + other.width],
        (alignedAt) => ({
          id: `v-${alignedAt}`,
          orientation: "vertical",
          position: alignedAt,
          from: Math.min(proposed.y, other.y) - GUIDE_OVERHANG,
          to:
            Math.max(proposed.y + height, other.y + other.height) +
            GUIDE_OVERHANG,
        }),
      ),
    );

    bestY = nearer(
      bestY,
      bestAxisSnap(
        [proposed.y, proposed.y + height / 2, proposed.y + height],
        [other.y, other.y + other.height / 2, other.y + other.height],
        (alignedAt) => ({
          id: `h-${alignedAt}`,
          orientation: "horizontal",
          position: alignedAt,
          from: Math.min(proposed.x, other.x) - GUIDE_OVERHANG,
          to:
            Math.max(proposed.x + width, other.x + other.width) +
            GUIDE_OVERHANG,
        }),
      ),
    );
  }
  return { x: bestX, y: bestY };
}

/**
 * The dragged element's position, corrected onto whichever stop is nearest,
 * and the guides for the axes that took hold.
 *
 * A CONNECTOR STOP WINS A TIE, and only a tie. Both kinds are measured in the
 * same units so the nearer one is simply the nearer one; but when a sibling
 * edge and a connector anchor are the same distance away, straightening the
 * line is the outcome the reader was reaching for, and lining up with a box
 * they were not looking at is a coincidence.
 *
 * The two axes are decided independently, which is what lets a drag settle
 * against a neighbour's left edge on one axis and straighten a connector on
 * the other.
 */
export function snapDraggedNode(input: SnapInput): SnapOutcome {
  const byId = new Map<string, SnapRect>();
  for (const rect of input.rects) {
    byId.set(
      rect.id,
      rect.id === input.movingId
        ? { ...rect, x: input.proposed.x, y: input.proposed.y }
        : rect,
    );
  }
  const moving = byId.get(input.movingId);
  if (moving === undefined) {
    return { position: input.proposed, guides: NO_GUIDES };
  }

  const siblings = siblingStops(input);
  const connectors = connectorStops(input, moving, byId);

  /* `nearer` keeps its FIRST argument on a tie, so passing the connector stop
     first is what implements the tie-break described above. */
  const x = nearer(connectors.x, siblings.x);
  const y = nearer(connectors.y, siblings.y);

  if (x === null && y === null) {
    return { position: input.proposed, guides: NO_GUIDES };
  }

  const guides: AlignmentGuide[] = [];
  if (x !== null) guides.push(x.guide);
  if (y !== null) guides.push(y.guide);

  return {
    position: {
      x: input.proposed.x + (x?.delta ?? 0),
      y: input.proposed.y + (y?.delta ?? 0),
    },
    guides,
  };
}

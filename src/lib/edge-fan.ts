/**
 * Where a connector meets the node it leaves, when it is not the only one.
 *
 * EVERY CONNECTOR USED TO LAND ON THE SAME POINT. `getFloatingAnchors` picked
 * the side of the node facing the other end and attached at that side's
 * MIDPOINT, so six edges leaving the bottom of a system all began at one pixel
 * and left as a sheaf. Nothing was wrong — each line went where it should — and
 * the diagram was still unreadable, because the reader cannot tell which of six
 * lines is the one they are following back. Fanning them apart is the whole
 * content of this module.
 *
 * THE RULE, and it is borrowed rather than invented: N connectors on a side of
 * length L attach at `L·k/(N+1)` for k = 1…N, and no two may end up closer than
 * `MIN_FAN_SPACING`. The formula puts them at even intervals INSIDE the side
 * with a margin at each corner, which is what keeps an attachment off the
 * rounded corner of a node and off its own neighbour. The floor is the
 * diagnostic half: a side that cannot give every connector its 12px is not a
 * spacing problem, it is a diagram with too much on one node, and
 * `check:connector-density` says so rather than shrinking the gap until the
 * arrows touch.
 *
 * ORDER WITHIN A SIDE IS DERIVED FROM WHERE THE OTHER END IS, not from edge id.
 * Sorting by id would fan the connectors apart and then cross them over each
 * other on the way out — two defects for the price of one fix. Sorting by the
 * far endpoint's position along the side's own axis makes the attachments
 * ordered the same way the targets are, so the lines leave without crossing at
 * the node. Edge id is the tie-break, so the result is stable across renders.
 *
 * PURE, AND THAT IS LOAD-BEARING. `editor/lib/edge-geometry.ts` imports
 * `@xyflow/react`, and Node's type stripping cannot follow an import into
 * React, so nothing there can be loaded by a check script — the same reason
 * `lib/curve-clearance.ts` exists here rather than beside the curve maths.
 * This module is geometry, and `codebase.md` says to prove geometry by
 * computing it. No imports, no DOM, no React.
 */

/** Axis-aligned node bounds, in the model's own coordinates. */
export interface FanRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The four sides, as plain strings.
 *
 * NOT `@xyflow/react`'s `Position`, whose members are these same four strings:
 * importing it would make this module unloadable by a check script, which is
 * the one thing it may not be. `edge-geometry.ts` maps these onto `Position` at
 * the boundary, where React is already in scope.
 */
export type FanSide = "left" | "right" | "top" | "bottom";

/**
 * The closest two attachments on one side may sit, in model units.
 *
 * 12 rather than a prettier round number because it is the smallest gap at
 * which two 1.5px strokes with arrowheads still read as two lines at the zoom
 * a whole diagram is viewed at. Below it the pair reads as one thick line, and
 * a reader following one of them back arrives at the wrong node — which is the
 * failure the fan exists to prevent, reintroduced by the fix for it.
 */
export const MIN_FAN_SPACING = 12;

/** One connector's place among those sharing a node side. */
export interface FanSlot {
  /** 0-based, ordered along the side. */
  index: number;
  /** How many connectors share this side. */
  count: number;
}

/** Both ends of one edge. A slot is absent when the endpoint is unknown. */
export interface EdgeFanSlots {
  source: FanSlot;
  target: FanSlot;
}

/** The minimum a connector needs to identify itself: an id and two endpoints. */
export interface FanEdge {
  id: string;
  source: string;
  target: string;
}

/* -------------------------------------------------------------------------- */
/* Sides                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The side of `rect` facing the direction (dx, dy), where (dx, dy) points from
 * this rect's centre toward the other node's centre.
 *
 * MOVED HERE FROM `edge-geometry.ts` RATHER THAN COPIED. The fan has to group
 * connectors by the side they will actually leave from, so it must agree with
 * the anchoring exactly — a second implementation that rounded a diagonal the
 * other way would fan a connector into a group it does not belong to and leave
 * the group it does one member short. One definition, both callers.
 *
 * The horizontal/vertical decision normalises by the node's own half-extents,
 * so a wide node connecting to a neighbour slightly above it exits through its
 * (long) top side rather than snapping to a narrow left or right one.
 */
export function facingSide(rect: FanRect, dx: number, dy: number): FanSide {
  const horizontalness = Math.abs(dx) / Math.max(rect.width / 2, 1);
  const verticalness = Math.abs(dy) / Math.max(rect.height / 2, 1);
  if (horizontalness >= verticalness) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "bottom" : "top";
}

/** The length of one side of `rect` — its width or its height. */
export function sideLength(rect: FanRect, side: FanSide): number {
  return side === "top" || side === "bottom" ? rect.width : rect.height;
}

/**
 * The point `offset` along `side`, measured from the side's low corner (left
 * for a horizontal side, top for a vertical one).
 */
export function pointOnSide(
  rect: FanRect,
  side: FanSide,
  offset: number,
): { x: number; y: number } {
  switch (side) {
    case "left":
      return { x: rect.x, y: rect.y + offset };
    case "right":
      return { x: rect.x + rect.width, y: rect.y + offset };
    case "top":
      return { x: rect.x + offset, y: rect.y };
    case "bottom":
      return { x: rect.x + offset, y: rect.y + rect.height };
  }
}

/* -------------------------------------------------------------------------- */
/* The fan                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * How far along a side of length `length` the `index`-th of `count`
 * connectors attaches.
 *
 * `length·(index+1)/(count+1)`. A single connector lands at the midpoint,
 * which is what the anchoring did for every connector before this module — so
 * a diagram whose nodes carry one connector per side is untouched, and the
 * change is visible exactly where it was needed.
 */
export function fanOffset(
  index: number,
  count: number,
  length: number,
): number {
  return (length * (index + 1)) / (count + 1);
}

/** The gap the formula leaves between neighbours on a side. */
export function fanSpacing(count: number, length: number): number {
  return length / (count + 1);
}

/**
 * Whether a side is carrying more connectors than it can separate.
 *
 * REPORTED, NOT REPAIRED, and that is the same call `curve-clearance.ts` makes
 * when a box sits dead centre of a line: the honest answer is that the layout
 * has failed, and the remedies — split the diagram, or move a connector to
 * another node — belong to the author. Squeezing the gap below the floor would
 * hide a too-dense diagram behind arrows that merely look placed.
 */
export function isCrowded(count: number, length: number): boolean {
  return count > 1 && fanSpacing(count, length) < MIN_FAN_SPACING;
}

/**
 * Every edge's slot at both of its ends.
 *
 * Edges whose endpoints are not in `rects` are skipped rather than defaulted:
 * a connector to a node that is not on this diagram has no side to share, and
 * counting it would shift everything else to make room for a line nobody draws.
 */
export function assignFanSlots(
  edges: readonly FanEdge[],
  rects: ReadonlyMap<string, FanRect>,
): Map<string, EdgeFanSlots> {
  /** One end of one edge, waiting to be given its place along a side. */
  interface Attachment {
    edgeId: string;
    end: "source" | "target";
    /** Where the OTHER end sits along this side's axis — the sort key. */
    along: number;
  }

  const bySide = new Map<string, Attachment[]>();
  const push = (
    nodeId: string,
    side: FanSide,
    attachment: Attachment,
  ): void => {
    const key = `${nodeId}|${side}`;
    const list = bySide.get(key);
    if (list === undefined) bySide.set(key, [attachment]);
    else list.push(attachment);
  };

  for (const edge of edges) {
    const source = rects.get(edge.source);
    const target = rects.get(edge.target);
    if (source === undefined || target === undefined) continue;

    const dx = target.x + target.width / 2 - (source.x + source.width / 2);
    const dy = target.y + target.height / 2 - (source.y + source.height / 2);
    const sourceSide = facingSide(source, dx, dy);
    const targetSide = facingSide(target, -dx, -dy);

    // The far end's centre, projected onto the axis the side runs along.
    const horizontal = (side: FanSide): boolean =>
      side === "top" || side === "bottom";
    push(edge.source, sourceSide, {
      edgeId: edge.id,
      end: "source",
      along: horizontal(sourceSide)
        ? target.x + target.width / 2
        : target.y + target.height / 2,
    });
    push(edge.target, targetSide, {
      edgeId: edge.id,
      end: "target",
      along: horizontal(targetSide)
        ? source.x + source.width / 2
        : source.y + source.height / 2,
    });
  }

  const slots = new Map<string, EdgeFanSlots>();
  const centre: FanSlot = { index: 0, count: 1 };
  for (const attachments of bySide.values()) {
    attachments.sort(
      (a, b) => a.along - b.along || (a.edgeId < b.edgeId ? -1 : 1),
    );
    attachments.forEach((attachment, index) => {
      const existing = slots.get(attachment.edgeId) ?? {
        source: centre,
        target: centre,
      };
      slots.set(attachment.edgeId, {
        ...existing,
        [attachment.end]: { index, count: attachments.length },
      });
    });
  }
  return slots;
}

/* -------------------------------------------------------------------------- */
/* Parallel edges                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Edge id → its place among the edges joining the SAME PAIR of nodes, which is
 * what the offset curve spreads apart.
 *
 * A DIFFERENT QUESTION FROM THE FAN ABOVE, and both are needed. This one asks
 * "how many lines join these two boxes", and answers it by bowing the curves so
 * they do not lie on top of each other; the fan asks "how many lines leave this
 * side", and answers it by moving where they start. Two A→B edges share a
 * parallel group AND a fan slot pair; six edges from one node to six different
 * nodes share only a fan.
 *
 * THE UNORDERED PAIR, so an A→B and a B→A edge count as parallel — either way
 * the curves overlap and need separating. `index` is 0-based in edge-id order,
 * stable across renders because edges keep their ids.
 *
 * ONE DEFINITION. This existed three times over — the editor's selector, the
 * viewer canvas and the SVG exporter each had their own copy, and the exporter
 * is required to place a connector exactly where the canvas does, so the two
 * that mattered most were the two with nothing holding them together. They now
 * all call this.
 */
export function parallelEdgeGroups(
  edges: readonly FanEdge[],
): Map<string, FanSlot> {
  const byPair = new Map<string, string[]>();
  for (const edge of edges) {
    const key =
      edge.source < edge.target
        ? `${edge.source}|${edge.target}`
        : `${edge.target}|${edge.source}`;
    const list = byPair.get(key);
    if (list === undefined) byPair.set(key, [edge.id]);
    else list.push(edge.id);
  }

  const groups = new Map<string, FanSlot>();
  for (const ids of byPair.values()) {
    ids.sort();
    ids.forEach((id, index) => groups.set(id, { index, count: ids.length }));
  }
  return groups;
}

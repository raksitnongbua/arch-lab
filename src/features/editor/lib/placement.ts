/**
 * Where a programmatically-created node goes.
 *
 * Used by every "add at the viewport centre" path (type palette, `^ref`
 * placement). Pointer-driven creation does not come here — a drop or a
 * connector release already expressed an intent, and second-guessing it would
 * move the node away from where the user pointed.
 */

import type { C4Diagram, Point, Size } from "@/types";

import { GRID_SIZE, PASTE_OFFSET } from "./canvas-constants";

/** Empty gutter kept between a placed node and its neighbours, in flow units. */
const MIN_GAP = GRID_SIZE;

/** Give up after this many steps and stack, rather than loop forever. */
const MAX_STEPS = 200;

function overlaps(
  a: { position: Point; size: Size },
  b: { position: Point; size: Size },
): boolean {
  return (
    a.position.x < b.position.x + b.size.width + MIN_GAP &&
    a.position.x + a.size.width + MIN_GAP > b.position.x &&
    a.position.y < b.position.y + b.size.height + MIN_GAP &&
    a.position.y + a.size.height + MIN_GAP > b.position.y
  );
}

/**
 * The first grid-aligned spot at or after `start` where a `size` box clears
 * every existing node in `diagram`.
 *
 * The previous rule only rejected an EXACT position collision, so the second
 * item placed at the viewport centre landed 16px off the first — overlapping
 * enough to look like one smudged node, and, before placeholders became
 * draggable, impossible to separate. Real intersection testing is what makes
 * "add" repeatable: press it five times and you get five readable nodes.
 *
 * Steps diagonally down-right in `PASTE_OFFSET` increments, matching the
 * direction paste and duplicate already cascade in, so a run of created nodes
 * reads as one deliberate stagger rather than three different behaviours.
 */
export function findFreePosition(
  diagram: C4Diagram,
  size: Size,
  start: Point,
): Point {
  let candidate: Point = { ...start };
  for (let step = 0; step < MAX_STEPS; step += 1) {
    const clashes = diagram.nodes.some((node) =>
      overlaps({ position: candidate, size }, node),
    );
    if (!clashes) return candidate;
    candidate = {
      x: candidate.x + PASTE_OFFSET,
      y: candidate.y + PASTE_OFFSET,
    };
  }
  return candidate;
}

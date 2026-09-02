/**
 * Whether a connector's curve clears the elements it does not connect, and how
 * far its control point has to move if it does not.
 *
 * A CONNECTOR THAT CROSSES AN UNRELATED BOX IS A CONNECTOR THE READER CANNOT
 * FOLLOW. It disappears behind one element and reappears past it, and on a
 * diagram of any density the eye reconnects the wrong two ends. The fix here is
 * deliberately the smallest one that reads correctly — the curve bows around
 * the obstruction — rather than orthogonal routing, which would give a C4
 * diagram a second visual language for the sake of the same information.
 *
 * WHAT IT CANNOT DO, measured rather than hoped. A quadratic's deviation at
 * its midpoint is HALF its control-point offset, so getting past a box the
 * line runs through the CENTRE of needs an offset of roughly four times the
 * box's half-width — about 188 for a default 176-wide element. That is well
 * past the point where a bowed connector stops reading as a line between two
 * elements and starts reading as a third element's border, which is what
 * `BOW_MAX_STEPS` is set by. So a centred obstruction is DECLINED: the
 * straight line is kept, because a bow that fails has moved the connector and
 * still crosses. The author's remedy for that case is the one the grammar
 * already has — `via` waypoints — or a layout that does not route a connector
 * through an element.
 *
 * What it does fix is the common case: a box the connector GRAZES. On the
 * fixture in `scripts/curve-clearance-check.mjs` that is seven sampled points
 * inside an element, reduced to none by an offset of 108.
 *
 * WHY THIS IS NOT IN `edge-geometry.ts` WITH THE REST OF THE CURVE MATHS. That
 * module imports `@xyflow/react`, and Node's type stripping cannot follow an
 * import into React — so nothing in it can be loaded by a check script, and
 * this is geometry, which `codebase.md` says to prove by computing rather than
 * by reading. It was written there first and moved here the moment a probe
 * could not load it. Pure arithmetic, no imports, no DOM.
 */

/** Axis-aligned bounds in flow coordinates. */
export interface ClearanceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * How far the control point steps while looking for a way past an obstacle,
 * and how many steps it may take. One node's half-height is 44, so four steps
 * of 36 reaches 144 — past a default box from a line running through its
 * centre, and no further: a connector bowed further than that stops reading as
 * a line between two elements and starts reading as a third element's border.
 */
const BOW_STEP = 36;
const BOW_MAX_STEPS = 4;

/** Points sampled along a quadratic, enough to catch a box the curve clips. */
const BOW_SAMPLES = 24;

function insideAny(
  x: number,
  y: number,
  rects: readonly ClearanceRect[],
  pad: number,
): boolean {
  return rects.some(
    (rect) =>
      x > rect.x - pad &&
      x < rect.x + rect.width + pad &&
      y > rect.y - pad &&
      y < rect.y + rect.height + pad,
  );
}

/** Keeps a bowed curve from grazing the box it just cleared. */
const BOW_CLEARANCE = 6;

/**
 * Whether the quadratic through `control` stays out of every obstacle.
 *
 * Sampled rather than solved. A closed-form quadratic-versus-rectangle test is
 * a page of algebra for a question whose answer only has to be right at the
 * resolution a reader can see, and the sampling is what makes the same code
 * work for the straight case (a quadratic whose control point is the midpoint).
 */
function curveIsClear(
  sourceX: number,
  sourceY: number,
  controlX: number,
  controlY: number,
  targetX: number,
  targetY: number,
  obstacles: readonly ClearanceRect[],
): boolean {
  for (let step = 1; step < BOW_SAMPLES; step += 1) {
    const t = step / BOW_SAMPLES;
    const u = 1 - t;
    const x = u * u * sourceX + 2 * u * t * controlX + t * t * targetX;
    const y = u * u * sourceY + 2 * u * t * controlY + t * t * targetY;
    if (insideAny(x, y, obstacles, BOW_CLEARANCE)) return false;
  }
  return true;
}

/**
 * The control-point offset that gets this edge past the elements it does not
 * connect — `base` when nothing is in the way.
 *
 * A CONNECTOR THAT CROSSES AN UNRELATED BOX IS A CONNECTOR THE READER CANNOT
 * FOLLOW: it disappears behind one element and reappears past it, and on a
 * diagram of any density the eye reconnects the wrong two ends. The fix is
 * deliberately the smallest one that reads correctly — the curve bows around
 * the obstruction — rather than orthogonal routing, which would give this
 * notation a second visual language for the sake of the same information.
 *
 * Symmetric search outward from `base`, nearer side first and the canonical
 * perpendicular breaking the tie, so the result depends only on the geometry
 * and never on which endpoint happens to be the source. Returns `base`
 * unchanged when nothing clears, because a bow that fails is worse than the
 * straight line it replaced: it has moved the connector AND still crosses.
 */
export function clearingOffset(input: {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  base: number;
  normalX: number;
  normalY: number;
  obstacles?: readonly ClearanceRect[];
}): number {
  const { base, normalX: nx, normalY: ny, obstacles } = input;
  if (obstacles === undefined || obstacles.length === 0) return base;

  const midX = (input.sourceX + input.targetX) / 2;
  const midY = (input.sourceY + input.targetY) / 2;
  const clearAt = (offset: number): boolean =>
    curveIsClear(
      input.sourceX,
      input.sourceY,
      midX + nx * offset,
      midY + ny * offset,
      input.targetX,
      input.targetY,
      obstacles,
    );

  if (clearAt(base)) return base;
  for (let step = 1; step <= BOW_MAX_STEPS; step += 1) {
    const push = step * BOW_STEP;
    // The canonical perpendicular first, so a tie is settled by the line's own
    // orientation rather than by the direction the author happened to write.
    if (clearAt(base + push)) return base + push;
    if (clearAt(base - push)) return base - push;
  }
  return base;
}

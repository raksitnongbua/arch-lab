/**
 * Pure geometry for a gantt: `GanttLabFile` in, absolute coordinates
 * out. No React, no DOM, no measurement — the same contract as
 * `features/er/lib/layout.ts` and `features/flowchart/lib/layout.ts`, so the
 * canvas, the SVG exporter and `scripts/gantt-layout-check.mjs` all read
 * one geometry rather than three that must agree.
 *
 * WHAT MAKES A GANTT'S LAYOUT DIFFERENT FROM EVERY KIND ALREADY HERE. The
 * other six solve BOTH axes from the relationships. Here one axis is a
 * measured quantity — a day is a fixed number of pixels — and only the other
 * is solved. That split is the whole notation, and it is why this file has a
 * scheduling pass that none of the others need.
 *
 * THE FOUR PASSES, in order, each depending on the one before:
 *
 *   1. SCHEDULE (`schedule`). A forward pass gives every item its earliest
 *      start and finish; a backward pass gives it the latest it could finish
 *      without moving the project's end. The difference is FLOAT, and an item
 *      with none is on the critical path. This is the only place criticality
 *      is decided — the grammar has no `crit` keyword on purpose, because a
 *      declared critical path can contradict the arithmetic and then the
 *      picture is simply wrong.
 *
 *   2. ROW ORDER (`orderSection`). Items are sorted topologically INSIDE
 *      their section, with declaration order as the tie-break — the same move
 *      ER makes for its columns. `purpose.md` forbids falling back to a grid,
 *      and a Gantt is where that rule is easiest to break, because "one row
 *      per item in the order typed" looks like a layout and is really a list.
 *      Sorting buys a property worth checking: **no connector ever points
 *      upward**, which `scripts/gantt-layout-check.mjs` asserts directly.
 *
 *   3. GEOMETRY. x is `day * pxPerDay`, always fitting the plot width, so a
 *      two-day plan and a two-year plan both read at a glance and the PNG
 *      export can never disagree with the app about where a bar ends. y comes
 *      from the row order plus the section bands.
 *
 *   4. CONNECTOR ROUTING (`routeDependency`). See below — it is the part with
 *      the real algorithm.
 *
 * THE CONNECTOR RULE, and why routing is a search rather than a formula.
 * `new-diagram-type.md` states that edges never cross a node they do not
 * touch. On a Gantt that is not free: a dependency runs from one bar's right
 * edge down to a later bar's left edge, and the rectangle between them is
 * usually occupied. So each dependency PROPOSES a set of vertical channels
 * and takes the first that intersects no other item's rectangle. The fallback
 * — the empty gutter left of every bar — always exists, so the search cannot
 * fail; it is only ever a question of which route is shortest.
 *
 * MOTION ORDER is computed here, not in the component, because it is derived
 * from the same dependency graph: `wave` is an item's topological rank and
 * drives the entrance stagger, so rows rise in the order the plan runs.
 *
 * Imported by `scripts/gantt-layout-check.mjs` through Node's type
 * stripping: keep the syntax erasable and type-only imports as `import type`.
 */

import {
  isHeadingEmpty,
  layoutDiagramHeading,
  type DiagramHeading,
  type DiagramHeadingMetrics,
} from "@/lib/diagram-heading";
import { TEXTURE_BY_ROLE } from "@/features/editor/lib/node-colors";
import { TEXTURE_BY_SHAPE } from "@/features/flowchart/lib/shapes";
import type { RoleTexture } from "@/lib/role-texture";
import type { GanttItem, GanttItemState, GanttLabFile } from "@/types";

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Every fixed distance in the diagram, in one table so the check script reads
 * the same numbers the canvas draws rather than re-deriving them.
 */
export const GANTT = {
  /** Total canvas width. The plot is what is left after the label rail. */
  width: 1020,
  /** The label rail: item names, right-aligned, and the section headings. */
  railWidth: 196,
  /** Left and right edges of the plot area. */
  plotX0: 200,
  plotX1: 1000,
  /** Height reserved above the plot for the axis ticks and their labels. */
  axisHeight: 44,
  /** One row: a bar plus the air around it. */
  rowHeight: 34,
  barHeight: 18,
  /** Bar top, measured from the row's top. */
  barOffsetY: 8,
  /** A section heading and the gap before the next section's heading. */
  sectionHeadHeight: 26,
  sectionGap: 16,
  /** Half-width of a milestone diamond. */
  milestoneRadius: 9,
  /** The primary-coloured cap on a critical bar's leading edge. */
  criticalCapWidth: 3,
  /** A bar this narrow would otherwise vanish; a one-day task must stay
   * visible on a two-year plan or the diagram silently loses a row. */
  minBarWidth: 6,
  /** How far a connector's arrowhead overshoots into its target. */
  arrowLength: 7,
  /**
   * The diagonal hatch that textures every bar: one tile's side, and the
   * width of the stripe inside it, both in user units.
   *
   * A SQUARE TILE IS WHAT MAKES THE MARCH SEAMLESS. The stripes are the
   * family `x + y = k * hatchTile`, so sliding the tile's contents by exactly
   * one tile in x maps that family onto itself — the picture at the end of the
   * loop is the picture at the start, and there is no jump. A non-square tile,
   * or a translate that is not exactly `hatchTile`, puts a visible stutter in
   * every cycle. `check:gantt-motion` pins the translate to this number.
   *
   * The stripe width is a LOW SHARE of the tile on purpose: the hatch lies on
   * top of the fill that carries the reporting state, and the wash it applies
   * is `hatchStroke / (hatchTile / sqrt(2)) * opacity`. The check computes that
   * product and fails if the texture starts flattening the four states
   * together.
   */
  hatchTile: 10,
  hatchStroke: 1.6,
  /** Stagger caps. Held here AND in the stylesheet's custom properties; the
   * motion check asserts the two agree, because a cap that drifts makes the
   * reveal budget wrong without anything failing. */
  waveCap: 6,
  edgeWaveCap: 6,
  /** The heading block's type scale — the same one the other five notations
   * that draw a title use, so a reader meeting two kinds sees one product. */
  titleFontSize: 15,
  titleLineHeight: 20,
  descriptionFontSize: 12,
  descriptionLineHeight: 17,
  descriptionMaxLines: 3,
  titleDescriptionGap: 6,
  headingGap: 18,
  titleMinWrapWidth: 320,
} as const;

/** This notation's type scale for the shared heading block. */
const GANTT_HEADING: DiagramHeadingMetrics = {
  titleFontSize: GANTT.titleFontSize,
  titleLineHeight: GANTT.titleLineHeight,
  descriptionFontSize: GANTT.descriptionFontSize,
  descriptionLineHeight: GANTT.descriptionLineHeight,
  descriptionMaxLines: GANTT.descriptionMaxLines,
  titleDescriptionGap: GANTT.titleDescriptionGap,
  headingGap: GANTT.headingGap,
};

/** The metrics the canvas and the exporter draw this kind's heading with. */
export const GANTT_HEADING_METRICS: DiagramHeadingMetrics = GANTT_HEADING;

/**
 * THE SHEET'S MARGIN — air between the drawing and the edge of the ground it
 * is drawn on, on screen and in the file alike.
 *
 * DELIBERATELY NOT A MEMBER OF `GANTT`. Everything in that table is a
 * COORDINATE: move one and a bar moves, `check:gantt-layout` re-measures a
 * different plot, and the connector router's no-crossing guarantee is proved
 * against numbers nobody meant to change. This is a FRAME. It widens the box
 * the drawing is presented in and moves nothing inside it — every bar, tick,
 * label and elbow keeps the coordinate it has always had.
 *
 * WHY THE SCREEN NEEDS ONE NOW. Nothing on this canvas is laid out with a
 * margin: the axis caption and every section heading start at x=0, the section
 * rules run from x=0, and the last row ends 18 units above the bottom. That was
 * survivable while the ground was the pane's, because the viewer's own
 * `px-5 py-6 sm:px-8` supplied the air — the exporter's header still argues it,
 * and it was true when it was written. It stopped being true when the well grew
 * a FIELD: `CanvasField` is drawn inside this `<svg>`, in the drawing's
 * coordinates, so the ruled sheet now ends exactly where the section headings
 * begin. The CSS padding is outside the sheet; it separates the sheet from the
 * pane and can never be the sheet's own margin. A reader on `blueprint`, whose
 * field is a visible rule rather than a faint dot, sees the plan printed to the
 * trim. It is every theme, and blueprint is only the one that shows it.
 *
 * WHY 40. It is the pad the exported file has always used, and one number is
 * what keeps a downloaded PNG framed the way the screen framed it — the
 * exporter keeps its own literal, because `check:gantt-layout` reads that
 * literal out of the source, and the same check now asserts the two agree.
 * A multiple of `hatchTile` for the reason the exporter gives: the bar hatch is
 * `userSpaceOnUse`, and a whole number of tiles keeps its phase.
 */
export const GANTT_FRAME_PAD = 40;

/* HOW MUCH OF THIS PAD FALLS INSIDE THE PLAN'S SURFACE is not decided here any
   more. The panel is shared with the timeline and the lifecycle, and the split
   lives with it in `@/lib/diagram-surface` — see `DIAGRAM_SURFACE_PAD` for why
   the pad is spent rather than added, and for the bug that made it necessary:
   a surface drawn at the drawing's own bounds put a stroked edge exactly where
   every section heading sits. */


/**
 * The two diagonal segments that make up one hatch tile, as `d` attributes.
 *
 * TWO, NOT ONE, and the second is what the march needs rather than what the
 * still frame needs. A pattern tile CLIPS its contents, so a single stripe
 * translated by one tile would leave the tile empty on its way out; the second
 * copy sits one tile to the left and arrives exactly as the first leaves.
 *
 * At rest the second copy meets the tile at a single corner — and that corner
 * lies ON the stripe a neighbouring tile already draws, because both copies
 * belong to the same family `x + y = k * hatchTile`. So the resting picture is
 * a clean, evenly spaced 45° hatch with no dot at the tile joins, which is why
 * the exporter can emit the same two paths and get a file that matches the
 * screen at rest exactly.
 *
 * Shared with `export/render-svg.ts` for that reason: the canvas and the file
 * must not hold two ideas of where a stripe goes.
 */
export function hatchTilePaths(): readonly string[] {
  return [
    `M0,${GANTT.hatchTile}L${GANTT.hatchTile},0`,
    `M${-GANTT.hatchTile},${GANTT.hatchTile}L0,0`,
  ];
}

/**
 * Which role texture each reporting state wears.
 *
 * THE VALUES ARE NEVER TYPED HERE — every one is read out of the role tables,
 * because a gantt's four state fills ARE those role tokens (`gantt-motion.css`
 * aliases `planned` to `--node-external`, `done` to `--node-queue`, `active`
 * to `--node-internal`, `at-risk` to `--flow-decision`). A hand-written
 * geometry here could pair `done`'s queue colour with `internal`'s ruling, and
 * a reader comparing a bar to the C4 diagram beside it would decode the wrong
 * role from a picture that is internally consistent. Deriving means that
 * cannot happen: change a role's texture once and the plan follows.
 *
 * THE STATE → ROLE PAIRING ITSELF IS THE ONE HAND-MAINTAINED HALF, duplicated
 * from `styles/gantt-motion.css` because CSS cannot be imported. `check:eink`
 * is what pins the two together — it derives the pairing from the stylesheet's
 * own `fill:` declarations and asserts this table matches, the arrangement
 * `check:sequence-motion` uses for its duration pair. If that check is not
 * running, this table is unverified.
 *
 * `at-risk` reaches through the FLOWCHART's table rather than the role one for
 * the same reason its colour does: `--flow-decision` is the hue no C4 role
 * holds, and its cross-hatch is the heaviest mark in the vocabulary — the
 * state that most wants to be found by eye. It also keeps every gantt state
 * off 45°, which is not decoration: the bar already carries `af-gantt-hatch`
 * at 45° meaning "this span has duration", and a role ruled at the same angle
 * would superpose into one texture and cost the reader both meanings.
 */
export const TEXTURE_BY_STATE: Record<GanttItemState, RoleTexture> = {
  planned: TEXTURE_BY_ROLE.external,
  done: TEXTURE_BY_ROLE.queue,
  active: TEXTURE_BY_ROLE.internal,
  "at-risk": TEXTURE_BY_SHAPE.decision,
};

/* -------------------------------------------------------------------------- */
/* Laid-out shapes                                                             */
/* -------------------------------------------------------------------------- */

/** One placed row — a bar or a milestone diamond. */
export interface LaidGanttItem {
  id: string;
  label: string;
  /** Reporting status, defaulted: the model's absent `state` is `planned`,
   * and every consumer wants the resolved value rather than the absence. */
  state: GanttItemState;
  milestone: boolean;
  /** Whole days. Zero for a milestone. */
  duration: number;
  /** Earliest start and finish, in days from the origin. */
  start: number;
  finish: number;
  /** Days this item could slip without moving the project's end. Zero means
   * it is on the critical path — which is what `critical` reports, kept as
   * its own field because every reader wants the boolean, not the arithmetic. */
  float: number;
  critical: boolean;
  /** Ids this item waits for, resolved and de-duplicated. */
  after: string[];
  /** Topological rank, and the entrance stagger's index. */
  wave: number;
  description?: string;
  tags?: string[];

  /** Row box. `x1` is the bar's right edge; for a milestone `x0 === x1`. */
  rowY: number;
  x0: number;
  x1: number;
  barY: number;
  /** Vertical centre of the row — where connectors leave and arrive. */
  midY: number;
}

/** A section's heading band. */
export interface LaidGanttSection {
  label: string;
  y: number;
  /** Where the hairline under the heading is drawn, full plot width. */
  ruleY: number;
}

/** One dependency, already routed. */
export interface LaidGanttDependency {
  from: string;
  to: string;
  /** True only when BOTH ends are critical: a slack item depending on a
   * critical one is not itself on the chain, and painting that connector as
   * critical would draw a path the float pass disagrees with. */
  critical: boolean;
  /** Orthogonal path, absolute coordinates, ready for a `d` attribute. */
  path: string;
  /**
   * Path length in user units, summed from the segments rather than measured.
   *
   * COMPUTED, NOT MEASURED, because the canvas is SERVER-RENDERED: the draw-on
   * and current animations need a `stroke-dasharray` at first paint, and
   * `getTotalLength()` is only available once there is a DOM and a script to
   * call it. Every path here is orthogonal, so the length is the sum of the
   * segments' absolute deltas and the arithmetic is exact — no approximation
   * is being tolerated. A no-JS reader therefore gets the same geometry, and
   * the export path gets it without a browser at all.
   */
  length: number;
  /** Arrowhead tip and the direction it points, so the component can draw the
   * triangle by hand. Never an SVG `marker`: a marker takes its orientation
   * from the tangent, and half of these arrive travelling down and half
   * travelling right. */
  tipX: number;
  tipY: number;
  tipDirection: "down" | "right";
  /** Stagger index for the connector draw. */
  wave: number;
}

/** One tick on the time axis. */
export interface LaidGanttTick {
  /** Days from the origin. */
  day: number;
  x: number;
  /** Relative label — `W1`, `D3`, `M2`. The calendar label is NOT computed
   * here: it needs `file.origin`, and keeping the date formatting in the axis
   * component is what stops a calendar leaking into the geometry. */
  label: string;
}

export interface GanttLayout {
  width: number;
  height: number;
  /** The document's title and description, drawn above the diagram. */
  heading: DiagramHeading;
  /**
   * Y at which the plot begins — the axis rule sits 8 above it and its labels
   * 14 above.
   *
   * DERIVED, NOT `GANTT.axisHeight`. The axis used to measure from that
   * constant in the canvas, the exporter and the check, which was correct only
   * while nothing could sit above it. The heading can, so the plot's top is a
   * layout figure now and the three read it from here — otherwise a document
   * with a title draws its ticks through its own heading.
   */
  plotTop: number;
  items: LaidGanttItem[];
  sections: LaidGanttSection[];
  dependencies: LaidGanttDependency[];
  ticks: LaidGanttTick[];
  /** Total span in days, padded past the last finish so the final bar is not
   * flush against the canvas edge. */
  span: number;
  /** Days per tick — 1, 7 or 30. The axis component needs it to decide
   * whether a calendar label reads as a date or a month. */
  tickStep: number;
  /** The project's finish, in days. */
  end: number;
}

/* -------------------------------------------------------------------------- */
/* Pass 1 — schedule                                                           */
/* -------------------------------------------------------------------------- */

interface Scheduled {
  start: Record<string, number>;
  finish: Record<string, number>;
  float: Record<string, number>;
  end: number;
}

/**
 * A laid-out item while it is still being solved, carrying the one model
 * field the schedule reads and the geometry does not: an explicit `at` start.
 * Internal — `layoutGantt` returns `LaidGanttItem`, which has no `at`,
 * because by then the start is a computed number and how it was reached is
 * not a distinction any consumer should be able to act on.
 */
interface Scheduling extends LaidGanttItem {
  at?: number;
}

/**
 * Earliest start/finish, then latest finish, then float.
 *
 * The forward pass is iterative rather than recursive because the dependency
 * graph is author-supplied and a cycle must terminate rather than blow the
 * stack. A cycle's members simply never become ready; they fall out of the
 * loop unscheduled and are defaulted to day 0 below, which draws them at the
 * start rather than dropping them off the canvas. Refusing a cyclic document
 * is the validator's job (`validate_gantt`), not the geometry's — the
 * canvas's contract is that it draws whatever parsed.
 */
function schedule(items: Scheduling[]): Scheduled {
  const start: Record<string, number> = {};
  const finish: Record<string, number> = {};

  /* Bounded by the item count: each round settles at least one item, or the
     remainder is cyclic and no further round will settle any. */
  for (let round = 0; round <= items.length; round++) {
    let settled = false;
    for (const item of items) {
      if (finish[item.id] !== undefined) continue;
      const ready = item.after.every((dep) => finish[dep] !== undefined);
      if (!ready) continue;
      let earliest = item.at ?? 0;
      for (const dep of item.after) {
        earliest = Math.max(earliest, finish[dep]);
      }
      start[item.id] = earliest;
      finish[item.id] = earliest + item.duration;
      settled = true;
    }
    if (!settled) break;
  }

  for (const item of items) {
    if (finish[item.id] === undefined) {
      start[item.id] = 0;
      finish[item.id] = item.duration;
    }
  }

  const end = items.reduce((max, item) => Math.max(max, finish[item.id]), 0);

  /* Backward pass. An item's latest finish is the earliest of its successors'
     latest starts, or the project end when it has none. Iterated to a fixed
     point for the same reason the forward pass is: the graph is untrusted. */
  const successors = new Map<string, string[]>(
    items.map((item) => [item.id, [] as string[]]),
  );
  for (const item of items) {
    for (const dep of item.after) successors.get(dep)?.push(item.id);
  }

  const latestFinish: Record<string, number> = {};
  const latestStart: Record<string, number> = {};
  for (const item of items) {
    latestFinish[item.id] = end;
    latestStart[item.id] = end - item.duration;
  }
  for (let round = 0; round <= items.length; round++) {
    let moved = false;
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      let bound = end;
      for (const next of successors.get(item.id) ?? []) {
        bound = Math.min(bound, latestStart[next]);
      }
      if (bound !== latestFinish[item.id]) {
        latestFinish[item.id] = bound;
        latestStart[item.id] = bound - item.duration;
        moved = true;
      }
    }
    if (!moved) break;
  }

  const float: Record<string, number> = {};
  for (const item of items) {
    float[item.id] = latestStart[item.id] - start[item.id];
  }

  return { start, finish, float, end };
}

/* -------------------------------------------------------------------------- */
/* Pass 2 — row order                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Topological order within one section, declaration order breaking ties.
 *
 * Only dependencies BETWEEN MEMBERS OF THIS SECTION constrain the order —
 * a cross-section `after` is satisfied by the section bands themselves and
 * must not drag an item out of the band its author put it in. Membership is
 * the nesting, and the layout does not get to overrule it.
 *
 * A cycle inside a section would leave items permanently blocked, so the loop
 * falls back to emitting the earliest-declared remaining item. That draws a
 * cyclic document in declaration order instead of hanging, which is the same
 * choice the schedule pass makes.
 */
function orderSection(ids: string[], after: Map<string, string[]>): string[] {
  const remaining = ids.slice();
  const placed: string[] = [];
  const inSection = new Set(ids);

  while (remaining.length > 0) {
    const index = remaining.findIndex((id) =>
      (after.get(id) ?? []).every(
        (dep) => !inSection.has(dep) || placed.includes(dep),
      ),
    );
    placed.push(...remaining.splice(index === -1 ? 0 : index, 1));
  }
  return placed;
}

/* -------------------------------------------------------------------------- */
/* Pass 4 — connector routing                                                  */
/* -------------------------------------------------------------------------- */

interface Box {
  id: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function boxesOf(items: LaidGanttItem[]): Box[] {
  return items.map((item) =>
    item.milestone
      ? {
          id: item.id,
          x0: item.x0 - GANTT.milestoneRadius - 2,
          x1: item.x0 + GANTT.milestoneRadius + 2,
          y0: item.midY - GANTT.milestoneRadius - 2,
          y1: item.midY + GANTT.milestoneRadius + 2,
        }
      : {
          id: item.id,
          x0: item.x0,
          x1: Math.max(item.x1, item.x0 + GANTT.minBarWidth),
          y0: item.barY,
          y1: item.barY + GANTT.barHeight,
        },
  );
}

/** Whether a vertical run at `x` between two rows clips any box but its own
 * two ends. One pixel of tolerance on each side, so a channel that merely
 * grazes a bar's edge still counts as crossing it — a line flush against a
 * border reads as touching it. */
function crosses(
  x: number,
  yA: number,
  yB: number,
  boxes: Box[],
  fromId: string,
  toId: string,
): boolean {
  const top = Math.min(yA, yB);
  const bottom = Math.max(yA, yB);
  return boxes.some(
    (box) =>
      box.id !== fromId &&
      box.id !== toId &&
      x >= box.x0 - 1 &&
      x <= box.x1 + 1 &&
      bottom > box.y0 - 1 &&
      top < box.y1 + 1,
  );
}

/**
 * Route one dependency, orthogonally, around everything it does not touch.
 *
 * Two shapes, and the choice between them is geometric rather than stylistic:
 *
 *   - When the target starts where the source ends (within a few pixels), the
 *     connector is a VERTICAL DROP into the target's top edge. An elbow here
 *     would jog right and then immediately back left, which reads as a mistake.
 *   - Otherwise it is the classic ELBOW: out of the source's right edge, down
 *     a channel, into the target's left edge.
 *
 * Each shape proposes channels in preference order and takes the first that
 * crosses nothing. The last candidate is the gutter just inside the plot's
 * left edge, which no bar can occupy because every bar starts at or after day
 * zero — so the search always terminates with a legal route.
 */
interface Point {
  x: number;
  y: number;
}

/** An orthogonal polyline as a `d` string plus its exact length. Built from
 * points rather than concatenated as text, so the length cannot drift from the
 * path the browser draws. */
function polyline(points: Point[]): { path: string; length: number } {
  let path = `M${points[0].x} ${points[0].y}`;
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1];
    const point = points[i];
    if (point.x === previous.x && point.y === previous.y) continue;
    path += point.x === previous.x ? ` V${point.y}` : ` H${point.x}`;
    length += Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y);
  }
  return { path, length };
}

function routeDependency(
  from: LaidGanttItem,
  to: LaidGanttItem,
  boxes: Box[],
): {
  path: string;
  length: number;
  tipX: number;
  tipY: number;
  tipDirection: "down" | "right";
} {
  const targetTop = to.milestone ? to.midY - GANTT.milestoneRadius : to.barY;
  const sourceRight = from.milestone
    ? from.x0 + GANTT.milestoneRadius
    : Math.max(from.x1, from.x0 + GANTT.minBarWidth);

  if (Math.abs(to.x0 - sourceRight) < 6) {
    for (const x of [sourceRight + 6, sourceRight + 12, sourceRight + 18]) {
      if (!crosses(x, from.midY, targetTop, boxes, from.id, to.id)) {
        return {
          ...polyline([
            { x: sourceRight, y: from.midY },
            { x, y: from.midY },
            { x, y: targetTop },
          ]),
          tipX: x,
          tipY: targetTop,
          tipDirection: "down",
        };
      }
    }
  }

  const candidates = [
    to.x0 - 14,
    to.x0 - 20,
    to.x0 - 26,
    sourceRight + 8,
    sourceRight + 14,
    GANTT.plotX0 - 12,
  ];
  const elbow = (x: number) => ({
    ...polyline([
      { x: sourceRight, y: from.midY },
      { x, y: from.midY },
      { x, y: to.midY },
      { x: to.x0, y: to.midY },
    ]),
    tipX: to.x0,
    tipY: to.midY,
    tipDirection: "right" as const,
  });

  for (const x of candidates) {
    if (!crosses(x, from.midY, to.midY, boxes, from.id, to.id)) return elbow(x);
  }
  return elbow(GANTT.plotX0 - 12);
}

/* -------------------------------------------------------------------------- */
/* Ticks                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Tick granularity, derived from the span rather than declared.
 *
 * Three bands, chosen so a tick is always readable and never crowded: days up
 * to three weeks, weeks up to six months, months beyond. Nothing in the
 * grammar can override this — an author-set interval would be a second source
 * of truth for a number the span already determines, which is why the Mermaid
 * importer refuses `tickInterval` by name.
 */
function tickStepFor(span: number): number {
  if (span <= 21) return 1;
  if (span <= 180) return 7;
  return 30;
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

export function layoutGantt(file: GanttLabFile): GanttLayout {
  /* Flatten once, keeping declaration order and remembering which section
     each item came from — the row solve runs per section, but scheduling and
     routing are whole-document concerns. */
  const raw: { item: GanttItem; section: number }[] = [];
  file.sections.forEach((section, index) => {
    for (const item of section.items) raw.push({ item, section: index });
  });

  const known = new Set(raw.map((entry) => entry.item.id));
  const afterById = new Map<string, string[]>();
  for (const { item } of raw) {
    /* Dangling and self references are dropped rather than drawn. The parser
       already refuses both, so this only guards a model built in code — but a
       connector to an id that is not on the canvas has no second endpoint,
       and NaN coordinates poison the whole SVG rather than one line. */
    const deps = (item.after ?? []).filter(
      (dep) => dep !== item.id && known.has(dep),
    );
    afterById.set(item.id, [...new Set(deps)]);
  }

  /* Provisional items: everything the schedule needs, no geometry yet.
     `at` rides along for the schedule pass only — once a start is computed,
     nothing downstream cares how it was reached — so it lives on an internal
     type rather than widening the exported shape with a field no consumer
     reads. */
  const provisional: Scheduling[] = raw.map(({ item }) => ({
    id: item.id,
    label: item.label,
    state: item.state ?? "planned",
    milestone: item.milestone === true,
    duration: item.milestone === true ? 0 : (item.duration ?? 0),
    start: 0,
    finish: 0,
    float: 0,
    critical: false,
    after: afterById.get(item.id) ?? [],
    wave: 0,
    description: item.description,
    tags: item.tags,
    rowY: 0,
    x0: 0,
    x1: 0,
    barY: 0,
    midY: 0,
    at: item.at,
  }));

  const scheduled = schedule(provisional);
  for (const item of provisional) {
    item.start = scheduled.start[item.id];
    item.finish = scheduled.finish[item.id];
    item.float = scheduled.float[item.id];
    item.critical = scheduled.float[item.id] <= 0;
  }

  const span = Math.max(5, Math.ceil((scheduled.end + 1) / 5) * 5);
  const pxPerDay = (GANTT.plotX1 - GANTT.plotX0) / span;
  const xAt = (day: number): number => GANTT.plotX0 + day * pxPerDay;

  /* Row order, per section, then geometry down the page. */
  const byId = new Map(provisional.map((item) => [item.id, item]));
  const sections: LaidGanttSection[] = [];
  const ordered: LaidGanttItem[] = [];
  /* THE HEADING IS RESERVED BEFORE THE PLOT IS PLACED. Unlike the timeline and
     the lifecycle, this canvas has something ABOVE its cursor — the axis, whose
     ticks and captions sat at the constant `GANTT.axisHeight` — so the heading
     cannot just push the cursor down. `plotTop` is what the axis now measures
     from, which is the only way the two can agree about where the plot begins. */
  const heading = layoutDiagramHeading({
    title: file.metadata.title,
    description: file.metadata.description,
    wrapWidth: Math.max(GANTT.titleMinWrapWidth, GANTT.width - 24),
    metrics: GANTT_HEADING,
  });
  /* An empty title reserves NOTHING, rather than opening the plan with a band
     of blank paper — `headingGap` is air under text, not a top margin. */
  const headingHeight = isHeadingEmpty(heading) ? 0 : heading.height;
  const plotTop = headingHeight + GANTT.axisHeight;

  let y = plotTop;

  file.sections.forEach((section, index) => {
    if (index > 0) y += GANTT.sectionGap;
    sections.push({ label: section.label, y, ruleY: y + 22 });
    y += GANTT.sectionHeadHeight;

    const ids = section.items.map((item) => item.id);
    for (const id of orderSection(ids, afterById)) {
      const item = byId.get(id);
      if (!item) continue;
      item.rowY = y;
      item.barY = y + GANTT.barOffsetY;
      item.midY = y + GANTT.rowHeight / 2;
      item.x0 = xAt(item.start);
      item.x1 = xAt(item.finish);
      item.wave = Math.min(ordered.length, GANTT.waveCap);
      ordered.push(item);
      y += GANTT.rowHeight;
    }
  });

  /* The entrance rises in DEPENDENCY rank, not in row order: two independent
     items in different sections should lift together, because they can start
     together. Row order and rank agree within a section and diverge across
     them, which is exactly the information the stagger is carrying. */
  const rankOf = new Map<string, number>();
  const rankItem = (item: LaidGanttItem, guard: number): number => {
    if (rankOf.has(item.id)) return rankOf.get(item.id) as number;
    if (guard > ordered.length) return 0;
    let rank = 0;
    for (const dep of item.after) {
      const parent = byId.get(dep);
      if (parent) rank = Math.max(rank, rankItem(parent, guard + 1) + 1);
    }
    rankOf.set(item.id, rank);
    return rank;
  };
  for (const item of ordered) {
    item.wave = Math.min(rankItem(item, 0), GANTT.waveCap);
  }

  const boxes = boxesOf(ordered);
  const dependencies: LaidGanttDependency[] = [];
  let edgeWave = 0;
  for (const item of ordered) {
    for (const dep of item.after) {
      const from = byId.get(dep);
      if (!from) continue;
      const routed = routeDependency(from, item, boxes);
      dependencies.push({
        from: dep,
        to: item.id,
        critical: from.critical && item.critical,
        path: routed.path,
        length: routed.length,
        tipX: routed.tipX,
        tipY: routed.tipY,
        tipDirection: routed.tipDirection,
        wave: Math.min(edgeWave, GANTT.edgeWaveCap),
      });
      edgeWave += 1;
    }
  }

  const tickStep = tickStepFor(span);
  const unit = tickStep === 1 ? "D" : tickStep === 7 ? "W" : "M";
  const ticks: LaidGanttTick[] = [];
  for (let day = 0; day <= span; day += tickStep) {
    ticks.push({
      day,
      x: xAt(day),
      label: `${unit}${day / tickStep + 1}`,
    });
  }

  return {
    width: GANTT.width,
    height: y + 18,
    heading,
    plotTop,
    items: ordered,
    sections,
    dependencies,
    ticks,
    span,
    tickStep,
    end: scheduled.end,
  };
}

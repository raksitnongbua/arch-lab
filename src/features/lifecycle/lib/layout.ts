/**
 * Pure geometry for a lifecycle: `LifecycleLabFile` in, absolute coordinates
 * out. No React, no DOM, no measurement — the same contract as
 * `features/timeline/lib/layout.ts` and `features/gantt/lib/layout.ts`, so the
 * canvas, the SVG exporter and `scripts/lifecycle-layout-check.mjs` all read
 * one geometry rather than three that must agree.
 *
 * ── THE ONE THING THIS FILE HAS TO GET RIGHT ──────────────────────────────
 *
 * A lifecycle must not READ as a flowchart, and the layout is where that is
 * won or lost — the grammar can refuse an arbitrary edge, but if the picture
 * still looks like a graph of boxes the notation has no reason to exist
 * (`src/types/lifecycle.ts` records that the overlap was waived, which makes
 * this the part that has to earn it). Three properties do the work:
 *
 *   1. THE SPINE IS THE DECLARATION ORDER, VERTICALLY, AND NOTHING ELSE
 *      DECIDES IT. `states[i]` sits below `states[i-1]`, always, at an x that
 *      never changes. There is no rank solver and no edge set to lay out,
 *      because there are no edges along the track — that is the whole
 *      difference from `features/flowchart/lib/layout.ts`, which ranks nodes
 *      from a graph. A reader can therefore read elapsed time off the page
 *      position, which a ranked graph cannot promise.
 *   2. A BRANCH LEAVES THE SPINE SIDEWAYS, INTO ITS OWN LANE. Exits are never
 *      peers of states: they sit in a column to the LEFT of the spine, at
 *      their own smaller size, hanging off the state they depart from. The
 *      asymmetry is deliberate and is the picture's grammar — everything on
 *      the right of the line is where the subject goes, everything on the
 *      left is where it stops going.
 *   3. A REJOIN TRAVELS IN A RESERVED CHANNEL AND RE-ENTERS THE TRACK IN A
 *      GAP. It leaves its exit below the exit's own text, runs up a channel
 *      to the far left that nothing else may occupy, and meets the spine
 *      BETWEEN two states rather than at one — which is both honest (the
 *      subject re-enters the track just before that state) and what makes
 *      "a branch never crosses a state it does not touch" a property of the
 *      geometry rather than a hope. A rejoin to the FIRST state has no such
 *      gap and lands on the spine's start instead; `routeRejoins` says why.
 *      Wherever it lands, IT LANDS ON THE LINE — `check:lifecycle-layout`
 *      measures that as well as the non-crossing.
 *
 * ── WHY VERTICAL ──────────────────────────────────────────────────────────
 *
 * Same argument the timeline's layout makes, and it applies harder here
 * because there are two text columns rather than one: a horizontal lifecycle
 * gives each state the gap to its neighbour (about 110 units for eight
 * states), which is eight characters, and it gives a branch nowhere at all —
 * a departure would have to go up or down, i.e. into the axis's own
 * direction, and the picture stops saying which way time runs.
 *
 * ── WHY THIS IS NOT A GRID ────────────────────────────────────────────────
 *
 * `purpose.md` forbids falling back to a grid, and a column of boxes on a
 * line is exactly what a grid looks like. Nothing here is a constant row
 * pitch:
 *
 *   - EVERY STATE'S HEIGHT IS THE GREATER OF ITS TWO COLUMNS — its own
 *     wrapped label and description on the right, and the stack of its exits
 *     on the left. A state with three annotated branches is much taller than
 *     one with none, because it holds more.
 *   - EVERY EXIT'S HEIGHT IS SOLVED FROM ITS OWN WRAPPED TEXT, label and
 *     condition separately at their own sizes.
 *   - THE SPINE IS CLIPPED TO THE STATES, first dot to last, so its extent is
 *     a fact about the content rather than the canvas.
 *
 * MOTION ORDER is computed here, not in the component: `wave` is a state's
 * position on the track, and an exit carries its state's — so the entrance
 * advances state by state and each state arrives WITH its departures, which
 * is the truth the picture states ("at this point, these are the ways out").
 *
 * Imported by `scripts/lifecycle-layout-check.mjs` and
 * `scripts/lifecycle-motion-check.mjs` through Node's type stripping: keep the
 * syntax erasable and type-only imports as `import type`.
 */

import {
  isHeadingEmpty,
  layoutDiagramHeading,
  type DiagramHeading,
  type DiagramHeadingMetrics,
} from "@/lib/diagram-heading";
import { CHAR_WIDTH_RATIO, wrapText } from "@/lib/text-metrics";
import type { LifecycleLabFile } from "@/types";

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Every fixed distance in the diagram, in one table so the check script reads
 * the same numbers the canvas draws rather than re-deriving them.
 *
 * Fixed distances are all SPACINGS, TYPE SIZES AND COLUMN EDGES. There is
 * deliberately no `rowHeight` here and there must never be one: a row height
 * is the grid this layout exists not to be, and the moment one appears every
 * argument in the file header stops being true.
 */
/**
 * THE SHEET'S MARGIN — air between the drawing and the edge of the ground it is
 * drawn on, on screen and in the file alike.
 *
 * DELIBERATELY NOT A MEMBER OF `LIFECYCLE`. Everything in that table is a
 * COORDINATE: move one and the drawing moves, and `check:lifecycle-layout`
 * re-measures a different diagram. This is a FRAME. It widens the box the
 * drawing is presented in and moves nothing inside it.
 *
 * WHY THE SCREEN NEEDS ONE. It did not, while the drawing sat straight on the
 * pane and the viewer's own CSS padding supplied the air. It does now that the
 * drawing sits on a SURFACE: a panel needs a margin of its own, or it runs to
 * the edge of the `<svg>` and its stroke is half-clipped by the viewBox.
 *
 * WHY 40. It is the pad this kind's exported file has always used, and one
 * number is what keeps a downloaded PNG framed the way the screen framed it.
 * The exporter keeps its own literal for the reason its header gives; the two
 * are asserted equal by `check:lifecycle-layout`.
 */
export const LIFECYCLE_FRAME_PAD = 40;

export const LIFECYCLE = {
  /** Total canvas width. */
  width: 1040,

  /**
   * The reserved rejoin channels, at the far left.
   *
   * NOTHING ELSE MAY BE DRAWN IN [channelX0, channelLaneRight]. That is the
   * whole reason the lane is a constant rather than "whatever is left over":
   * a returning branch has to travel past states it does not touch, and the
   * only way to guarantee it crosses none of them is to give it a column no
   * text is ever placed in. `check:lifecycle-layout` asserts the emptiness
   * rather than trusting this note.
   */
  channelX0: 20,
  channelLaneRight: 148,
  /** Gap between two channels, SHRUNK to fit when a document has many
   * rejoins — see `channelXs`. The lane's width is the invariant, not this. */
  channelGap: 15,

  /** The branch lane: exit text, right-aligned against its dot. */
  branchTextLeft: 168,
  branchTextRight: 412,
  branchDotX: 428,

  /** Where the spine runs. */
  spineX: 460,

  /** The state column, right of the spine. */
  stateLabelX: 492,
  /**
   * The measure state text wraps to.
   *
   * NOT `width - stateLabelX`, which would be 548 and would run the text to
   * the very edge. 500 units at `stateSize` is roughly 61 characters — inside
   * the 45–75 band a line can be read at without the eye losing its place,
   * and it leaves the right margin the export's own padding does not supply.
   */
  stateLabelWidth: 500,

  /** Air above the subject and below the last state. */
  topPad: 24,
  bottomPad: 30,

  /** Between the subject block and the first state, and between states. */
  subjectGap: 26,
  stateGap: 26,

  /** Type: the subject heading, the states, and the branch lane's two sizes. */
  subjectSize: 19,
  subjectLineHeight: 25,
  subjectDescSize: 12.5,
  subjectDescLineHeight: 17,
  stateSize: 15,
  stateLineHeight: 20,
  stateDescSize: 11.5,
  stateDescLineHeight: 15.5,
  exitSize: 13,
  exitLineHeight: 17,
  whenSize: 11,
  whenLineHeight: 14.5,

  /** Space between a block's last label line and the prose under it. */
  descGap: 6,
  /** From a state's dot down to its first exit's dot. */
  exitTopOffset: 22,
  /** Between one exit's box and the next. Never a row pitch: it is the space
   * BETWEEN boxes whose heights differ. */
  exitGap: 18,

  /** The state dot, the smaller exit dot, and the ring around a focused one. */
  dotRadius: 6.5,
  exitDotRadius: 4.5,
  ringRadius: 12,
  /** Half-width of the bar drawn across a terminal state's dot and at the end
   * of a terminal branch. THE ONE PLACE THIS NOTATION DISTINGUISHES BY SHAPE
   * rather than by colour — see `../styles/lifecycle-motion.css` on why it
   * has no palette. */
  stopBarHalf: 8,

  /** Stagger cap. Held here AND in the stylesheet's custom properties; the
   * motion check asserts the two agree, because a cap that drifts makes the
   * reveal budget wrong without anything failing. */
  waveCap: 8,
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
const LIFECYCLE_HEADING: DiagramHeadingMetrics = {
  titleFontSize: LIFECYCLE.titleFontSize,
  titleLineHeight: LIFECYCLE.titleLineHeight,
  descriptionFontSize: LIFECYCLE.descriptionFontSize,
  descriptionLineHeight: LIFECYCLE.descriptionLineHeight,
  descriptionMaxLines: LIFECYCLE.descriptionMaxLines,
  titleDescriptionGap: LIFECYCLE.titleDescriptionGap,
  headingGap: LIFECYCLE.headingGap,
};

/** The metrics the canvas and the exporter draw this kind's heading with. */
export const LIFECYCLE_HEADING_METRICS: DiagramHeadingMetrics =
  LIFECYCLE_HEADING;

/* -------------------------------------------------------------------------- */
/* Laid-out shapes                                                             */
/* -------------------------------------------------------------------------- */

/** One placed departure — a dot in the branch lane and its text beside it. */
export interface LaidLifecycleExit {
  /**
   * Stable identity for React keys and for focus.
   *
   * DERIVED FROM POSITION (`state index : exit index`) rather than from the
   * label, and that is forced rather than chosen: an exit has no id, and two
   * exits may legitimately carry the same label — "Cancelled" leaving two
   * different states is one document. A label-derived key would collapse them
   * into one focusable thing.
   */
  key: string;
  label: string;
  /** The label as drawn: one entry per rendered line, right-aligned. */
  labelLines: string[];
  /** The condition as drawn, empty when the exit has none. */
  whenLines: string[];
  /** The note as drawn, empty when the exit has none. */
  descriptionLines: string[];
  tags?: string[];
  /** The id of the state this departs from. */
  from: string;
  /** The id of the state it comes back to, or `null` when it is terminal. */
  rejoins: string | null;
  /** Reveal index — its state's, so a state and its departures arrive as one
   * moment. */
  wave: number;

  /** The box this exit occupies. */
  y0: number;
  y1: number;
  /** Centre of the dot, aligned with the middle of the first label line. */
  dotY: number;
  /** Baseline of the first label line; further lines step by
   * `LIFECYCLE.exitLineHeight`. */
  labelY: number;
  /** Baseline of the first condition line, or `null` when there is none. */
  whenY: number | null;
  /** Baseline of the first note line, or `null` when there is none. */
  descY: number | null;
  /**
   * The full path back to the spine, for a rejoining exit — `null` for a
   * terminal one.
   *
   * SOLVED HERE rather than in the component, because it is the geometry the
   * layout check has to measure: three segments, each of which has to be
   * provably clear of everything it does not touch.
   */
  rejoinPath: RejoinPath | null;
}

/**
 * A returning branch's route, as the four points it turns at.
 *
 * NAMED FIELDS RATHER THAN A POINT LIST, because each corner means something
 * different and a check that says "point 2 is left of the text" reads as
 * nothing. `departY` is the y it leaves at (below its own text, in the gap);
 * `channelX` is its private column; `joinY` is where it meets the spine,
 * always inside the gap ABOVE its target state.
 */
export interface RejoinPath {
  /** x of the reserved vertical channel this branch travels in. Unique per
   * rejoining exit — see `channelXs`. */
  channelX: number;
  /** The y it runs left along, below its own text and above the next box. */
  departY: number;
  /** The y it runs right along to meet the spine. */
  joinY: number;
  /** The state it re-enters the track at. */
  targetId: string;
}

/** One placed state on the main track. */
export interface LaidLifecycleState {
  id: string;
  label: string;
  /** The label as drawn: one entry per rendered line. */
  labelLines: string[];
  /** The description as drawn, empty when the state has none. */
  descriptionLines: string[];
  tags?: string[];
  /** Whether the subject STOPS here — drawn as a bar across the dot. */
  final: boolean;
  /**
   * Whether the subject can still get here at all.
   *
   * FALSE FOR EVERY STATE AFTER A FINAL ONE, computed from the same rule
   * `lifecycleReachableThrough` states so the canvas and `validate_lifecycle`
   * cannot disagree about which states are stranded. The canvas draws these
   * faded; the validator reports them.
   */
  reachable: boolean;
  /** Reveal index — position on the track, capped. */
  wave: number;

  /** The box this state occupies, spanning both columns. */
  y0: number;
  y1: number;
  /** Centre of the dot on the spine. Aligned with the first label line. */
  dotY: number;
  /** Baseline of the first label line; further lines step by
   * `LIFECYCLE.stateLineHeight`. */
  labelY: number;
  /** Baseline of the first description line, or `null` when there is none. */
  descY: number | null;
}

/** The head of the diagram: what the whole thing is about. */
export interface LaidLifecycleSubject {
  label: string;
  labelLines: string[];
  descriptionLines: string[];
  labelY: number;
  descY: number | null;
  /** Bottom of the subject block — the top edge of the first inter-state
   * gap, which a rejoin to the first state re-enters through. */
  y1: number;
}

export interface LifecycleLayout {
  width: number;
  height: number;
  /** The document's title and description, drawn above the diagram. */
  heading: DiagramHeading;
  subject: LaidLifecycleSubject;
  states: LaidLifecycleState[];
  exits: LaidLifecycleExit[];
  spineX: number;
  /** The spine, clipped to the first and last state dot. */
  spineY0: number;
  spineY1: number;
}

/* -------------------------------------------------------------------------- */
/* Channels                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One x per rejoining branch, all inside the reserved lane.
 *
 * THE LANE'S WIDTH IS THE INVARIANT, NOT THE GAP. With few rejoins the
 * channels sit `channelGap` apart; with many, the gap shrinks so they still
 * fit. The alternative — letting the channels grow rightwards — would push
 * them into the branch text and make "a rejoin crosses nothing" false on
 * exactly the documents that most need it to be true.
 */
function channelXs(count: number): number[] {
  if (count === 0) return [];
  const span = LIFECYCLE.channelLaneRight - LIFECYCLE.channelX0;
  const gap = Math.min(LIFECYCLE.channelGap, span / Math.max(1, count));
  return Array.from(
    { length: count },
    (_unused, index) => LIFECYCLE.channelX0 + index * gap,
  );
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Solves the whole diagram. Total: a document with no states, or an exit
 * naming a state that is not there, still produces a layout rather than
 * throwing — the canvas's contract is that it draws whatever parsed, and the
 * MCP tools and hand-built models both reach here without going through the
 * parser's refusals.
 */
/**
 * The places a reader may click to select one state: its DOT, its TEXT, and
 * the ways out that belong to it.
 *
 * IT WAS THE WHOLE ROW, `x` 0 to 1040 and the full height a state occupies —
 * which on this canvas means the empty band left of the branch lane, the empty
 * band right of the label, and every gap between them. Most of what a pointer
 * crosses selected something, and every near-miss landed on a state rather than
 * on nothing. The gantt had the same defect and the same fix; this is the
 * second of them.
 *
 * FOUR KINDS OF REGION, and the state's first two are ONE box rather than two:
 * the dot sits on the spine at 460 and the label starts at 492, so a box from
 * the dot's ring out to the end of the text covers the dot, the short run of
 * spine beside it and the words, with no gap worth leaving unclickable. Each
 * exit then gets its own — its dot and its right-aligned text — because they
 * are far off to the left and belong to this state's focus group: clicking a
 * way out selects the state it leaves, which is what the row always did.
 *
 * TEXT WIDTHS ARE ESTIMATED from the shared `CHAR_WIDTH_RATIO`, as every layout
 * here estimates them: there is no DOM to measure in, and being a few units
 * generous is the right failure mode for a hit target.
 *
 * IT LIVES IN THE LAYOUT so `scripts/` can load it — that module cannot parse a
 * `.tsx`, and a copy beside the component would mean the check measured its own
 * re-derivation rather than the canvas.
 */
export function lifecycleHitRegions(
  state: LaidLifecycleState,
  exits: readonly LaidLifecycleExit[],
): string {
  const pad = 6;
  const box = (x0: number, y0: number, x1: number, y1: number) =>
    `M ${x0} ${y0} H ${x1} V ${y1} H ${x0} Z`;
  const widest = (lines: readonly string[], size: number) =>
    lines.length === 0
      ? 0
      : Math.max(...lines.map((line) => line.length * size * CHAR_WIDTH_RATIO));

  /* The state's own band: down from the dot's ring to the foot of whichever of
     its two runs of text goes lower. */
  const labelBottom =
    state.labelY + (state.labelLines.length - 1) * LIFECYCLE.stateLineHeight;
  const textBottom =
    state.descY === null
      ? labelBottom
      : state.descY +
        (state.descriptionLines.length - 1) * LIFECYCLE.stateDescLineHeight;
  const right =
    LIFECYCLE.stateLabelX +
    Math.max(
      widest(state.labelLines, LIFECYCLE.stateSize),
      widest(state.descriptionLines, LIFECYCLE.stateDescSize),
    );
  const regions = [
    box(
      LIFECYCLE.spineX - LIFECYCLE.ringRadius - pad,
      Math.min(
        state.dotY - LIFECYCLE.ringRadius,
        state.labelY - LIFECYCLE.stateSize,
      ) - pad,
      right + pad,
      Math.max(state.dotY + LIFECYCLE.ringRadius, textBottom) + pad,
    ),
  ];

  for (const exit of exits) {
    const exitRight = LIFECYCLE.branchDotX + LIFECYCLE.exitDotRadius + pad;
    const exitLeft =
      LIFECYCLE.branchTextRight -
      Math.max(
        widest(exit.labelLines, LIFECYCLE.exitSize),
        widest(exit.whenLines, LIFECYCLE.whenSize),
        widest(exit.descriptionLines, LIFECYCLE.whenSize),
      ) -
      pad;
    regions.push(
      box(Math.max(0, exitLeft), exit.y0 - pad, exitRight, exit.y1 + pad),
    );
  }
  return regions.join(" ");
}

export function layoutLifecycle(file: LifecycleLabFile): LifecycleLayout {
  const states: LaidLifecycleState[] = [];
  const exits: LaidLifecycleExit[] = [];

  /* Annotated, not inferred: `LIFECYCLE` is `as const`, so `topPad` is the
     literal 24 and the cursor would be typed as that one value. */
  /* THE HEADING IS RESERVED BEFORE ANYTHING ELSE IS PLACED. Every y below is
     this cursor's, so moving where it starts moves the whole diagram down and
     nothing else has to know the heading exists. */
  const heading = layoutDiagramHeading({
    title: file.metadata.title,
    description: file.metadata.description,
    wrapWidth: Math.max(
      LIFECYCLE.titleMinWrapWidth,
      LIFECYCLE.width - LIFECYCLE.stateLabelX - 24,
    ),
    metrics: LIFECYCLE_HEADING,
  });
  /* An empty title reserves NOTHING, rather than opening the diagram with a
     band of blank paper — `headingGap` is air under text, not a top margin. */
  const headingHeight = isHeadingEmpty(heading) ? 0 : heading.height;

  let y: number = LIFECYCLE.topPad + headingHeight;

  /* ---------------------------- the subject ----------------------------- */
  const subjectLabel = file.subject?.label ?? "";
  const subjectLabelLines = wrapText(
    subjectLabel,
    LIFECYCLE.width - LIFECYCLE.stateLabelX - 24,
    LIFECYCLE.subjectSize,
  );
  const subjectDescription = file.subject?.description;
  const subjectDescLines =
    typeof subjectDescription === "string" && subjectDescription !== ""
      ? wrapText(
          subjectDescription,
          LIFECYCLE.width - LIFECYCLE.stateLabelX - 24,
          LIFECYCLE.subjectDescSize,
        )
      : [];

  const subjectLabelY = y + LIFECYCLE.subjectSize;
  let subjectBottom =
    subjectLabelY +
    (subjectLabelLines.length - 1) * LIFECYCLE.subjectLineHeight;
  let subjectDescY: number | null = null;
  if (subjectDescLines.length > 0) {
    subjectDescY =
      subjectBottom + LIFECYCLE.descGap + LIFECYCLE.subjectDescSize;
    subjectBottom =
      subjectDescY +
      (subjectDescLines.length - 1) * LIFECYCLE.subjectDescLineHeight;
  }
  const subject: LaidLifecycleSubject = {
    label: subjectLabel,
    labelLines: subjectLabelLines,
    descriptionLines: subjectDescLines,
    labelY: subjectLabelY,
    descY: subjectDescY,
    y1: subjectBottom + 4,
  };
  y = subject.y1 + LIFECYCLE.subjectGap;

  /* ---------------------------- the track ------------------------------- */
  const fileStates = Array.isArray(file.states) ? file.states : [];
  /* THE SAME RULE `lifecycleReachableThrough` STATES, applied by index rather
     than imported as a number, because the layout needs the boundary and the
     helper returns it. Importing the helper would be one more module in the
     type-stripped check's graph for a `findIndex`; the comment is the
     coupling, and `check:lifecycle` asserts the two agree. */
  const finalIndex = fileStates.findIndex((state) => state.final === true);
  const reachableThrough =
    finalIndex === -1 ? fileStates.length - 1 : finalIndex;

  fileStates.forEach((state, stateIndex) => {
    if (stateIndex > 0) y += LIFECYCLE.stateGap;
    const y0 = y;
    const wave = Math.min(stateIndex, LIFECYCLE.waveCap);

    const labelLines = wrapText(
      state.label,
      LIFECYCLE.stateLabelWidth,
      LIFECYCLE.stateSize,
    );
    const description = state.description;
    const descriptionLines =
      typeof description === "string" && description !== ""
        ? wrapText(
            description,
            LIFECYCLE.stateLabelWidth,
            LIFECYCLE.stateDescSize,
          )
        : [];

    /* The first label line's baseline sits below the box top by roughly the
       cap height, so the dot — which is centred, not baselined — lines up
       with the middle of that first line rather than with its foot. */
    const labelY = y0 + LIFECYCLE.stateSize;
    const dotY = labelY - LIFECYCLE.stateSize * 0.34;
    let rightBottom =
      labelY + (labelLines.length - 1) * LIFECYCLE.stateLineHeight;
    let descY: number | null = null;
    if (descriptionLines.length > 0) {
      descY = rightBottom + LIFECYCLE.descGap + LIFECYCLE.stateDescSize;
      rightBottom =
        descY + (descriptionLines.length - 1) * LIFECYCLE.stateDescLineHeight;
    }

    /* -------------------------- its departures -------------------------- */
    const stateExits = Array.isArray(state.exits) ? state.exits : [];
    let leftCursor = dotY + LIFECYCLE.exitTopOffset;
    let leftBottom = dotY;
    stateExits.forEach((exit, exitIndex) => {
      if (exitIndex > 0) leftCursor += LIFECYCLE.exitGap;
      const exitY0 = leftCursor;

      const exitLabelLines = wrapText(
        exit.label,
        LIFECYCLE.branchTextRight - LIFECYCLE.branchTextLeft,
        LIFECYCLE.exitSize,
      );
      const when = exit.when;
      const whenLines =
        typeof when === "string" && when !== ""
          ? wrapText(
              when,
              LIFECYCLE.branchTextRight - LIFECYCLE.branchTextLeft,
              LIFECYCLE.whenSize,
            )
          : [];
      const exitDescription = exit.description;
      const exitDescLines =
        typeof exitDescription === "string" && exitDescription !== ""
          ? wrapText(
              exitDescription,
              LIFECYCLE.branchTextRight - LIFECYCLE.branchTextLeft,
              LIFECYCLE.whenSize,
            )
          : [];

      const exitLabelY = exitY0 + LIFECYCLE.exitSize;
      const exitDotY = exitLabelY - LIFECYCLE.exitSize * 0.34;
      let bottom =
        exitLabelY + (exitLabelLines.length - 1) * LIFECYCLE.exitLineHeight;
      let whenY: number | null = null;
      if (whenLines.length > 0) {
        whenY = bottom + LIFECYCLE.descGap + LIFECYCLE.whenSize;
        bottom = whenY + (whenLines.length - 1) * LIFECYCLE.whenLineHeight;
      }
      let exitDescY: number | null = null;
      if (exitDescLines.length > 0) {
        exitDescY = bottom + LIFECYCLE.descGap + LIFECYCLE.whenSize;
        bottom =
          exitDescY + (exitDescLines.length - 1) * LIFECYCLE.whenLineHeight;
      }

      const exitY1 = Math.max(bottom + 4, exitDotY + LIFECYCLE.ringRadius + 2);
      const rejoins =
        typeof exit.rejoins === "string" && exit.rejoins !== ""
          ? exit.rejoins
          : null;

      exits.push({
        key: `${stateIndex}:${exitIndex}`,
        label: exit.label,
        labelLines: exitLabelLines,
        whenLines,
        descriptionLines: exitDescLines,
        tags: Array.isArray(exit.tags) ? (exit.tags as string[]) : undefined,
        from: state.id,
        rejoins,
        wave,
        y0: exitY0,
        y1: exitY1,
        dotY: exitDotY,
        labelY: exitLabelY,
        whenY,
        descY: exitDescY,
        /* Filled in below: a rejoin's route needs every state's box, and the
           target may be any earlier one — so it cannot be solved until the
           whole track is placed. */
        rejoinPath: null,
      });
      leftCursor = exitY1;
      leftBottom = exitY1;
    });

    const y1 = Math.max(
      rightBottom + 4,
      leftBottom,
      dotY + LIFECYCLE.ringRadius + 2,
    );

    states.push({
      id: state.id,
      label: state.label,
      labelLines,
      descriptionLines,
      tags: Array.isArray(state.tags) ? (state.tags as string[]) : undefined,
      final: state.final === true,
      reachable: stateIndex <= reachableThrough,
      wave,
      y0,
      y1,
      dotY,
      labelY,
      descY,
    });
    y = y1;
  });

  /* --------------------------- the rejoin routes ------------------------ */
  routeRejoins(subject, states, exits);

  /* The spine is CLIPPED TO THE STATE DOTS rather than run edge to edge: a
     line reaching above the first state would say the subject was somewhere
     before it was placed, and one reaching below the last would say it goes
     on after it stops — two claims this notation cannot make, because it has
     no scale and no bounds beyond the states the author wrote. */
  const first = states[0];
  const last = states[states.length - 1];

  return {
    width: LIFECYCLE.width,
    height: y + LIFECYCLE.bottomPad,
    heading,
    subject,
    states,
    exits,
    spineX: LIFECYCLE.spineX,
    spineY0: first === undefined ? LIFECYCLE.topPad : first.dotY,
    spineY1: last === undefined ? LIFECYCLE.topPad : last.dotY,
  };
}

/**
 * Gives every returning branch a channel and a re-entry point.
 *
 * THE TWO CHOICES THAT MAKE THE NON-CROSSING PROPERTY TRUE, and both are the
 * kind of thing that looks arbitrary until it is broken:
 *
 *   - IT LEAVES BELOW ITS OWN TEXT, not beside its dot. Running left from the
 *     dot would cross the exit's own label, which is right-aligned in the
 *     lane the branch has to travel through. So `departY` is placed in the
 *     gap under the exit's box, where the layout has already left air.
 *   - IT JOINS IN A GAP, NOT AT A DOT — everywhere the track has a gap.
 *     `joinY` is inside the vertical space between the target state's box and
 *     whatever is above it, so the horizontal run into the spine passes
 *     through no state's box and no exit's — exits live inside their own
 *     state's box by construction. Two branches returning to one state are
 *     spread across that gap rather than drawn on top of each other.
 *     THE FIRST STATE IS THE EXCEPTION AND HAS TO BE: the space above it is
 *     under the subject, where there is no spine to meet. That join is
 *     clamped down onto the spine's start, which is the target's own dot.
 *
 * A branch whose target is not in the document gets no path at all rather
 * than a route to nowhere: the parser refuses that document, but a hand-built
 * model can reach here and a canvas that drew a line to `undefined` would be
 * worse than one that drew a terminal branch.
 */
function routeRejoins(
  subject: LaidLifecycleSubject,
  states: LaidLifecycleState[],
  exits: LaidLifecycleExit[],
): void {
  const indexById = new Map<string, number>();
  states.forEach((state, index) => indexById.set(state.id, index));

  const returning = exits.filter(
    (exit) => exit.rejoins !== null && indexById.has(exit.rejoins),
  );
  const lanes = channelXs(returning.length);

  /* How many branches share each target, so a gap holding two re-entries
     spreads them instead of stacking them on one line. */
  const perTarget = new Map<string, number>();
  for (const exit of returning) {
    const id = exit.rejoins as string;
    perTarget.set(id, (perTarget.get(id) ?? 0) + 1);
  }
  const seen = new Map<string, number>();

  /* WHERE THE TRACK ACTUALLY BEGINS. The spine is clipped to the state dots,
     so there is no line at all above the first one — the space between the
     subject and the first state is blank canvas, not track. */
  const spineTop = states[0]?.dotY ?? 0;

  returning.forEach((exit, index) => {
    const targetId = exit.rejoins as string;
    const targetIndex = indexById.get(targetId) as number;
    const target = states[targetIndex];
    const gapTop = targetIndex === 0 ? subject.y1 : states[targetIndex - 1].y1;
    const gapBottom = target.y0;

    const share = perTarget.get(targetId) ?? 1;
    const ordinal = seen.get(targetId) ?? 0;
    seen.set(targetId, ordinal + 1);
    /* CLAMPED ONTO THE SPINE, which only ever binds for a rejoin to the FIRST
       state — and there it binds always, not in some awkward document. That
       state has no predecessor, so the "gap above it" is the air under the
       subject, which is above the top of the line: the arrowhead landed
       roughly 23 units clear of the spine's start, pointing into blank canvas
       with nothing to meet it. The starter document rejoins its first state,
       so this was the first lifecycle most readers ever saw.
       `check:lifecycle-layout` passed throughout, because it asked whether the
       join was above the target's box and never whether it was ON the line —
       it now asserts both. Clamping puts it on the spine's own start, which is
       the truthful answer anyway: the subject re-enters the track exactly
       where the track begins. Two branches returning to the first state land
       together rather than spreading, and that is also the truth — they come
       back to one place. */
    const joinY = Math.max(
      spineTop,
      gapTop + ((gapBottom - gapTop) * (ordinal + 1)) / (share + 1),
    );

    exit.rejoinPath = {
      channelX: lanes[index],
      /* Half the exit gap below its own box: inside the air the layout
         already left, and above whatever comes next. */
      departY: exit.y1 + LIFECYCLE.exitGap / 2,
      joinY,
      targetId,
    };
  });
}

/**
 * Pure geometry for a milestone timeline: `TimelineLabFile` in, absolute
 * coordinates out. No React, no DOM, no measurement — the same contract as
 * `features/gantt/lib/layout.ts` and `features/er/lib/layout.ts`, so the
 * canvas, the SVG exporter and `scripts/timeline-layout-check.mjs` all read
 * one geometry rather than three that must agree.
 *
 * ── WHY VERTICAL ──────────────────────────────────────────────────────────
 *
 * A timeline can run either way and the choice is not decoration; it decides
 * whether the notation is readable at all. This one runs DOWN THE PAGE, and
 * the argument is the content:
 *
 *   - THE LABEL IS THE WHOLE ELEMENT. An event has no duration, no state and
 *     no id (`src/types/timeline.ts` argues each absence), so the only thing
 *     a reader is reading is a sentence. Sentences are long.
 *   - A HORIZONTAL TIMELINE GIVES A LABEL THE GAP TO ITS NEIGHBOUR. On a
 *     1020-unit canvas with eight events that is roughly 110 units — eight
 *     characters at this font size before wrapping, which is a column of
 *     single words. The usual escapes are all worse: rotate the text (now
 *     nothing is readable without turning the screen), alternate above and
 *     below the axis (halves the collisions and doubles the eye's travel), or
 *     truncate (throws away the only content the notation has).
 *   - A VERTICAL TIMELINE GIVES EVERY LABEL THE FULL WIDTH and pays in height,
 *     which a scroll box already has. `TIMELINE.labelWidth` is a measure
 *     chosen for reading, not the width that happens to be left over.
 *
 * ── WHY THIS IS NOT A GRID ────────────────────────────────────────────────
 *
 * `purpose.md` forbids falling back to a grid, and a row of dots on a line is
 * exactly what a grid looks like — this is the notation where that rule is
 * easiest to break, and where breaking it would be invisible. Nothing here is
 * a constant row pitch:
 *
 *   1. EVERY EVENT'S HEIGHT IS SOLVED FROM ITS OWN WRAPPED TEXT. A one-line
 *      event and a four-line event with a description are different heights,
 *      because they hold different amounts of the only thing this notation
 *      carries. `wrapText` is the shared estimator every layout here uses.
 *   2. EVERY PERIOD'S HEIGHT IS THE SUM OF ITS EVENTS' — so a period with one
 *      event is short and a period with nine is tall, and the bands' relative
 *      sizes say how much happened in each. On a grid they would all be the
 *      same, and the picture would say the opposite of the document.
 *   3. THE SPINE IS CLIPPED TO THE EVENTS. It starts at the first dot and
 *      stops at the last rather than running the canvas's full height, so the
 *      line's extent is a fact about the content.
 *
 * The property this buys, and the one `scripts/timeline-layout-check.mjs`
 * asserts BY MEASUREMENT rather than by restating the code: **no two label
 * boxes ever overlap**, at any wrapping, for every bundled document. A grid
 * would fail that the first time an author wrote a long sentence.
 *
 * MOTION ORDER is computed here, not in the component: `wave` is an event's
 * position in the whole document, so the entrance reveals events in the order
 * they happened — which is the one thing the notation exists to say.
 *
 * Imported by `scripts/timeline-layout-check.mjs` and
 * `scripts/timeline-motion-check.mjs` through Node's type stripping: keep the
 * syntax erasable and type-only imports as `import type`.
 */

import {
  isHeadingEmpty,
  layoutDiagramHeading,
  type DiagramHeading,
  type DiagramHeadingMetrics,
} from "@/lib/diagram-heading";
import { wrapText } from "@/lib/text-metrics";
import type { TimelineLabFile } from "@/types";

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Every fixed distance in the diagram, in one table so the check script reads
 * the same numbers the canvas draws rather than re-deriving them.
 *
 * Fixed distances are all SPACINGS AND TYPE SIZES. There is deliberately no
 * `rowHeight` here and there must never be one: a row height is the grid this
 * layout exists not to be, and the moment one appears every argument in the
 * file header stops being true.
 */
/**
 * THE SHEET'S MARGIN — air between the drawing and the edge of the ground it is
 * drawn on, on screen and in the file alike.
 *
 * DELIBERATELY NOT A MEMBER OF `TIMELINE`. Everything in that table is a
 * COORDINATE: move one and the drawing moves, and `check:timeline-layout`
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
 * are asserted equal by `check:timeline-layout`.
 */
export const TIMELINE_FRAME_PAD = 40;

export const TIMELINE = {
  /** Total canvas width. The label column is what is left after the rail. */
  width: 1020,
  /** The period rail: band names, right-aligned against the spine. */
  railWidth: 168,
  /** Where the spine runs. */
  spineX: 200,
  /** Left edge of the event labels — clear of the dot and its ring. */
  labelX: 232,
  /**
   * The measure event text wraps to.
   *
   * NOT `width - labelX`, which would be 788 and is far past the 45–75
   * characters a line can be read at without the eye losing its place. 620
   * units at `labelSize` is roughly 76 characters — the top of that band,
   * which is the right end for a diagram someone is presenting rather than a
   * page someone is reading at length.
   */
  labelWidth: 620,

  /** Air above the first period. */
  topPad: 22,
  /** Air below the last event. */
  bottomPad: 26,

  /** The period heading, and the gap before the next band's heading. */
  periodHeadHeight: 30,
  periodGap: 20,

  /** The event dot, and the ring drawn around a focused one. */
  dotRadius: 6.5,
  ringRadius: 12,

  /** Type. `labelSize` is the sentence; `descSize` is the note under it. */
  labelSize: 14,
  labelLineHeight: 19,
  descSize: 11.5,
  descLineHeight: 15.5,
  periodSize: 12.5,
  /** Space between an event's last label line and its description. */
  descGap: 6,
  /** Space between one event's box and the next. Never a row pitch: it is
   * the space BETWEEN boxes whose heights differ. */
  eventGap: 14,

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
const TIMELINE_HEADING: DiagramHeadingMetrics = {
  titleFontSize: TIMELINE.titleFontSize,
  titleLineHeight: TIMELINE.titleLineHeight,
  descriptionFontSize: TIMELINE.descriptionFontSize,
  descriptionLineHeight: TIMELINE.descriptionLineHeight,
  descriptionMaxLines: TIMELINE.descriptionMaxLines,
  titleDescriptionGap: TIMELINE.titleDescriptionGap,
  headingGap: TIMELINE.headingGap,
};

/** The metrics the canvas and the exporter draw this kind's heading with. */
export const TIMELINE_HEADING_METRICS: DiagramHeadingMetrics = TIMELINE_HEADING;

/* -------------------------------------------------------------------------- */
/* Laid-out shapes                                                             */
/* -------------------------------------------------------------------------- */

/** One placed event — a dot on the spine and the text beside it. */
export interface LaidTimelineEvent {
  /**
   * Stable identity for React keys and for focus.
   *
   * DERIVED FROM POSITION (`period index : event index`) rather than from the
   * label, and that is forced rather than chosen: an event has no id, and two
   * events may legitimately carry the same label — "Series A" and "Series A"
   * in different periods is a real document, and so is the same sentence
   * twice. A label-derived key would collapse them into one focusable thing.
   */
  key: string;
  label: string;
  /** The label as drawn: one entry per rendered line. */
  labelLines: string[];
  /** The description as drawn, empty when the event has none. */
  descriptionLines: string[];
  tags?: string[];
  /** The label of the period this event belongs to. */
  period: string;
  /** Reveal index — position in the whole document, capped. */
  wave: number;

  /** The box this event occupies, spanning label and description. */
  y0: number;
  y1: number;
  /** Centre of the dot on the spine. Aligned with the first label line. */
  dotY: number;
  /** Baseline of the first label line; further lines step by
   * `TIMELINE.labelLineHeight`. */
  labelY: number;
  /** Baseline of the first description line, or `null` when there is none. */
  descY: number | null;
}

/** One period's band. */
export interface LaidTimelinePeriod {
  label: string;
  /** Top of the band, including its heading. */
  y: number;
  /** Bottom of the band — the last event's `y1`. */
  y1: number;
  /** Where the hairline under the heading is drawn. */
  ruleY: number;
  /** Baseline of the heading in the rail. */
  labelY: number;
  /** How many events the band holds. The band's height is solved from them,
   * which is the whole reason this number is worth carrying out. */
  eventCount: number;
}

export interface TimelineLayout {
  width: number;
  height: number;
  /** The document's title and description, drawn above the diagram. */
  heading: DiagramHeading;
  periods: LaidTimelinePeriod[];
  events: LaidTimelineEvent[];
  /** The spine, clipped to the first and last dot — see the file header. */
  spineX: number;
  spineY0: number;
  spineY1: number;
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Solves the whole diagram. Total: a document with no periods, or a period
 * whose events the parser would have refused, still produces a layout rather
 * than throwing — the canvas's contract is that it draws whatever parsed.
 */
export function layoutTimeline(file: TimelineLabFile): TimelineLayout {
  const periods: LaidTimelinePeriod[] = [];
  const events: LaidTimelineEvent[] = [];

  /* Annotated, not inferred: `TIMELINE` is `as const`, so `topPad` is the
     literal 22 and the cursor would be typed as that one value. */
  /* THE HEADING IS RESERVED BEFORE ANYTHING ELSE IS PLACED. Every y below is
     this cursor's, so moving where it starts moves the whole diagram down and
     nothing else has to know the heading exists. */
  const heading = layoutDiagramHeading({
    title: file.metadata.title,
    description: file.metadata.description,
    wrapWidth: Math.max(
      TIMELINE.titleMinWrapWidth,
      TIMELINE.width - TIMELINE.railWidth - 24,
    ),
    metrics: TIMELINE_HEADING,
  });
  /* An empty title reserves NOTHING, rather than opening the diagram with a
     band of blank paper — `headingGap` is air under text, not a top margin. */
  const headingHeight = isHeadingEmpty(heading) ? 0 : heading.height;

  let y: number = TIMELINE.topPad + headingHeight;
  let wave = 0;

  file.periods.forEach((period, periodIndex) => {
    if (periodIndex > 0) y += TIMELINE.periodGap;
    const bandTop = y;
    const headingY = y + TIMELINE.periodSize + 2;
    y += TIMELINE.periodHeadHeight;
    const ruleY = y - 8;

    period.events.forEach((event, eventIndex) => {
      if (eventIndex > 0) y += TIMELINE.eventGap;
      const y0 = y;

      /* THE HEIGHT IS THE TEXT'S. Both slots wrap to the same measure at
         their own size, so a long sentence and a long note each buy the
         space they need rather than being clipped into a fixed row. */
      const labelLines = wrapText(
        event.label,
        TIMELINE.labelWidth,
        TIMELINE.labelSize,
      );
      const description = event.description;
      const descriptionLines =
        typeof description === "string" && description !== ""
          ? wrapText(description, TIMELINE.labelWidth, TIMELINE.descSize)
          : [];

      /* The first label line's baseline sits below the box top by roughly the
         cap height, so the dot — which is centred, not baselined — lines up
         with the middle of that first line rather than with its foot. */
      const labelY = y0 + TIMELINE.labelSize;
      const dotY = labelY - TIMELINE.labelSize * 0.34;
      let textBottom =
        labelY + (labelLines.length - 1) * TIMELINE.labelLineHeight;

      let descY: number | null = null;
      if (descriptionLines.length > 0) {
        descY = textBottom + TIMELINE.descGap + TIMELINE.descSize;
        textBottom =
          descY + (descriptionLines.length - 1) * TIMELINE.descLineHeight;
      }

      /* A one-line event with no description is still at least as tall as the
         focus ring, or the ring would reach into its neighbour's box and the
         non-collision property would be true of the text and false of what a
         reader sees. */
      const y1 = Math.max(textBottom + 4, dotY + TIMELINE.ringRadius + 2);

      events.push({
        key: `${periodIndex}:${eventIndex}`,
        label: event.label,
        labelLines,
        descriptionLines,
        tags: Array.isArray(event.tags) ? (event.tags as string[]) : undefined,
        period: period.label,
        wave: Math.min(wave, TIMELINE.waveCap),
        y0,
        y1,
        dotY,
        labelY,
        descY,
      });
      wave += 1;
      y = y1;
    });

    periods.push({
      label: period.label,
      y: bandTop,
      y1: y,
      ruleY,
      labelY: headingY,
      eventCount: period.events.length,
    });
  });

  /* The spine is CLIPPED TO THE DOTS rather than run edge to edge: a line that
     starts above the first event and ends below the last would imply time
     either side of the document, which is a claim this notation cannot make —
     it has no scale and no bounds, only the events the author wrote. */
  const first = events[0];
  const last = events[events.length - 1];

  return {
    width: TIMELINE.width,
    height: y + TIMELINE.bottomPad,
    heading,
    periods,
    events,
    spineX: TIMELINE.spineX,
    spineY0: first === undefined ? TIMELINE.topPad : first.dotY,
    spineY1: last === undefined ? TIMELINE.topPad : last.dotY,
  };
}

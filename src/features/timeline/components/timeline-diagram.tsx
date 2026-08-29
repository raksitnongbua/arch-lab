/**
 * The milestone-timeline canvas: one SVG drawn straight from
 * `layoutTimeline`'s coordinates.
 *
 * SVG RATHER THAN `@xyflow/react`, which the C4 canvas uses. Nothing here is
 * dragged — the layout is solved from the text, so a drag would be undone by
 * the next parse — and a node-graph runtime would cost the ability to hand the
 * SAME element tree to the SVG exporter. The ER, use-case, flowchart,
 * dictionary and gantt canvases all made this call.
 *
 * WHAT IT DRAWS, and why each part is shaped as it is:
 *
 *   - The SPINE is one line, clipped to the first and last dot. It carries no
 *     scale and no ticks, because nothing in this notation measures — a ruler
 *     here would invite a reader to read the gap between two dots as a
 *     quantity, and that gap is the length of a sentence.
 *   - A PERIOD is a heading in the left rail with a hairline under it, running
 *     the full width. The rail rather than a badge on the spine: a period
 *     label is prose too ("Before the rewrite"), and hanging it off the line
 *     would put two competing text columns either side of one axis.
 *   - AN EVENT is a dot on the spine and its text beside it. The text is
 *     PRE-WRAPPED BY THE LAYOUT into one `<text>` per line, never one `<text>`
 *     with a width: SVG computes extents from the box and not from the text,
 *     so an unwrapped label draws one unbroken line straight off the canvas —
 *     the defect `wrapText`'s own header records.
 *   - A DESCRIPTION sits under its label in the quieter token, always drawn
 *     rather than revealed on hover. The alternative was tried in principle
 *     and rejected for this kind specifically: with no duration, no state and
 *     no connector, the description is a large share of what the document
 *     says, and hiding it would leave the still export and the crawlable
 *     example pages carrying less than the document does.
 *
 * THERE ARE NO CONNECTORS ON THIS CANVAS, and that is worth stating because it
 * decides what motion is owed. `new-diagram-type.md`'s connector rule is
 * satisfied vacuously here, exactly as it is for the data dictionary — and the
 * rule's own remedy applies: do not invent a connector in order to animate
 * one. What moves instead is argued in `../styles/timeline-motion.css`.
 *
 * SERVER-SAFE. `onFocusEvent` is optional and no hook runs here, so this
 * renders in a server component and a no-JS reader gets the whole diagram —
 * which is what lets the crawlable example pages ship the SVG in their HTML.
 * `check:seo` cares: an AI crawler does not run JavaScript.
 *
 * MOTION lives in `../styles/timeline-motion.css` and is opt-out twice. The
 * per-event stagger is stamped as an inline custom property here for the same
 * reason ER's and the gantt's are: it is server-rendered, and a first-paint
 * animation cannot wait for a script to write a variable.
 */

import { CanvasField } from "@/components/ui/canvas-field";
import type { TimelineLabFile } from "@/types";

import { TIMELINE, layoutTimeline } from "../lib/layout";
import type { LaidTimelineEvent, TimelineLayout } from "../lib/layout";

export interface TimelineDiagramProps {
  file: TimelineLabFile;
  /**
   * Keys to keep lit. Absent or empty means nothing is focused and the whole
   * diagram reads at full strength; the dimming is applied by the stylesheet
   * from `af-timeline-has-focus`, never by changing any element's paint here.
   */
  litKeys?: ReadonlySet<string>;
  /** Whether the entrance should play. Off for the export path and for the
   * crawlable example pages, which want the resting state. */
  reveal?: boolean;
  /** The app-wide idle-motion state, stamped as `data-af-idle` — the spelling
   * every other viewer in this app uses. */
  idleMotion?: "on" | "off";
  /** Whether the canvas is at rest. The ambient sweep runs only when it is;
   * see the stylesheet's note on why "at rest" is not a synonym for "always". */
  atRest?: boolean;
  onFocusEvent?: (key: string) => void;
  /** Pointer entered an event, or left every event (`null`). Separate from
   * `onFocusEvent` because a hover and a click mean different things here: one
   * is a look, the other pins the look in place. */
  onHoverEvent?: (key: string | null) => void;
}

export function TimelineDiagram({
  file,
  litKeys,
  reveal = false,
  idleMotion = "on",
  atRest = false,
  onFocusEvent,
  onHoverEvent,
}: TimelineDiagramProps) {
  const layout = layoutTimeline(file);
  const hasFocus = litKeys !== undefined && litKeys.size > 0;

  return (
    <svg
      className={["af-timeline-canvas", hasFocus ? "af-timeline-has-focus" : ""]
        .filter(Boolean)
        .join(" ")}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      /* ITS NATURAL SIZE, not `width="100%"`. Stretching a 1020-unit drawing
         across a wide pane puts the rail against one edge and upscales
         everything to get there. The stylesheet caps this with
         `max-width: 100%` and centres it, so a wide pane gets air either side
         and a narrow one still fits — the viewBox and `preserveAspectRatio`
         do the fitting, undistorted. The geometry is untouched, which is what
         keeps the SVG export identical: it builds its own `<svg>` from the
         same `layoutTimeline` figures. */
      width={layout.width}
      height={layout.height}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={describeTimeline(file, layout)}
      data-reveal={reveal ? "1" : "0"}
      data-af-idle={idleMotion}
      data-idle={atRest ? "1" : "0"}
    >
      {/* THE WELL'S FIELD, under everything the diagram draws. In the
          diagram's OWN coordinates, so it pans, scrolls and zooms with the
          drawing rather than sitting still while the drawing moves over it
          — components/ui/canvas-field.tsx carries the measurement that
          rules out a ground painted on the pane. */}
      <CanvasField
        id="af-field-timeline"
        width={layout.width}
        height={layout.height}
      />
      {layout.periods.map((period) => (
        <g key={`period-${period.label}-${period.y}`}>
          <text
            className="af-timeline-period"
            x={TIMELINE.railWidth}
            y={period.labelY}
            textAnchor="end"
            fontSize={TIMELINE.periodSize}
            fontWeight={600}
          >
            {period.label.toUpperCase()}
          </text>
          <line
            className="af-timeline-rule"
            x1={0}
            x2={TIMELINE.width - 20}
            y1={period.ruleY}
            y2={period.ruleY}
          />
        </g>
      ))}

      {/* The spine, under the dots. One line for the whole document: the
          periods are bands ON it, not separate axes, which is what says the
          history is continuous across a period boundary. */}
      <line
        className="af-timeline-spine"
        x1={layout.spineX}
        x2={layout.spineX}
        y1={layout.spineY0}
        y2={layout.spineY1}
      />
      {/* The ambient sweep rides its OWN line over the spine, never a
          dasharray on the spine itself: that stroke is the continuous mark a
          reader uses to follow the history, and a travelling dash laid on it
          would break the very line it is meant to describe. Both ends sit on
          the spine's own x, and its travel length is stamped from the spine
          the layout actually solved, so it cannot drift from the geometry the
          way a number typed into CSS would. `check:timeline-motion` asserts
          that confinement rather than trusting this note. */}
      <line
        className="af-timeline-sweep"
        x1={layout.spineX}
        x2={layout.spineX}
        y1={layout.spineY0}
        y2={layout.spineY1}
        style={
          {
            "--tl-spine-len": Math.max(1, layout.spineY1 - layout.spineY0),
          } as React.CSSProperties
        }
      />

      {layout.events.map((event) => (
        <Event
          key={event.key}
          event={event}
          spineX={layout.spineX}
          lit={litKeys?.has(event.key) ? "1" : undefined}
          onFocusEvent={onFocusEvent}
          onHoverEvent={onHoverEvent}
        />
      ))}
    </svg>
  );
}

function Event({
  event,
  spineX,
  lit,
  onFocusEvent,
  onHoverEvent,
}: {
  event: LaidTimelineEvent;
  spineX: number;
  lit?: "1";
  onFocusEvent?: (key: string) => void;
  onHoverEvent?: (key: string | null) => void;
}) {
  return (
    <g
      className="af-timeline-event"
      data-lit={lit}
      style={{ "--tl-wave": event.wave } as React.CSSProperties}
    >
      <circle
        className="af-timeline-dot"
        cx={spineX}
        cy={event.dotY}
        r={TIMELINE.dotRadius}
      />
      {event.labelLines.map((line, index) => (
        <text
          key={`l${index}`}
          className="af-timeline-label"
          x={TIMELINE.labelX}
          y={event.labelY + index * TIMELINE.labelLineHeight}
          fontSize={TIMELINE.labelSize}
        >
          {line}
        </text>
      ))}
      {event.descY !== null &&
        event.descriptionLines.map((line, index) => (
          <text
            key={`d${index}`}
            className="af-timeline-desc"
            x={TIMELINE.labelX}
            y={(event.descY ?? 0) + index * TIMELINE.descLineHeight}
            fontSize={TIMELINE.descSize}
          >
            {line}
          </text>
        ))}

      {/* A hit target spanning the event's whole box, so pointing anywhere
          near the text selects it — a 6.5-unit dot would otherwise be the
          only place a pointer could land. */}
      <rect
        className="af-timeline-hit"
        x={0}
        y={event.y0}
        width={TIMELINE.width}
        height={Math.max(1, event.y1 - event.y0)}
        tabIndex={onFocusEvent ? 0 : undefined}
        role={onFocusEvent ? "button" : undefined}
        aria-label={
          onFocusEvent ? `${event.period}: ${event.label}` : undefined
        }
        onClick={onFocusEvent ? () => onFocusEvent(event.key) : undefined}
        onPointerEnter={
          onHoverEvent ? () => onHoverEvent(event.key) : undefined
        }
        onFocus={onHoverEvent ? () => onHoverEvent(event.key) : undefined}
        onBlur={onHoverEvent ? () => onHoverEvent(null) : undefined}
      />
    </g>
  );
}

/**
 * The `aria-label` for the whole canvas, and the sentence a screen reader gets
 * instead of the picture.
 *
 * Names the shape — how many events, over which periods — and stops there.
 * Deliberately not a list of every event: a reader who wants the detail can
 * tab the events, each of which carries its own label, and reading twenty
 * sentences out before the reader has asked for any of them is worse than the
 * picture they replace.
 */
function describeTimeline(
  file: TimelineLabFile,
  layout: TimelineLayout,
): string {
  const periods = layout.periods.map((period) => period.label).join(", ");
  const count = layout.events.length;
  return (
    `Timeline of ${count} event${count === 1 ? "" : "s"} ` +
    `across ${layout.periods.length} period${layout.periods.length === 1 ? "" : "s"}` +
    (periods === "" ? "" : `: ${periods}`) +
    `. ${file.metadata.title}.`
  );
}

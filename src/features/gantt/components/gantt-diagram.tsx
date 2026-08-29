/**
 * The gantt canvas: one SVG drawn straight from `layoutGantt`'s
 * coordinates.
 *
 * SVG RATHER THAN `@xyflow/react`, which the C4 canvas uses. Nothing on a
 * gantt is dragged — the layout is solved from the dependency graph, so a
 * drag would be undone by the next parse — and a node-graph runtime would cost
 * the ability to hand the SAME element tree to the SVG exporter. The ER,
 * use-case, flowchart and dictionary canvases all made this call.
 *
 * WHAT IT DRAWS, and why each part is shaped as it is:
 *
 *   - The TIME AXIS is the only part of this feature that knows what a
 *     calendar is. `layoutGantt` hands over day offsets and a relative
 *     label (`W1`, `D3`); if the document carries an `origin`, `axisLabel`
 *     formats a date instead. Everything else — bars, rows, connectors —
 *     is identical either way, which is what makes absolute and relative one
 *     notation rather than two. Those two functions live in `../lib/axis`,
 *     not here, because the SVG exporter paints the same axis and must reach
 *     them without importing a React module. A fourth line in that band, the
 *     SWEEP, carries the looping axis highlight and is the one element the
 *     exporter deliberately omits: it is invisible at rest, so a still file
 *     would ship an inert path for nothing.
 *   - A TASK is a bar whose fill and border carry its reporting state, plus a
 *     `--primary` cap on the leading edge when it is on the critical path.
 *     The cap rather than a recoloured border, because the border is already
 *     saying something else: two meanings on one property is how a reader
 *     stops being able to read either. Over that fill lies a HATCH — one
 *     shared `<pattern>`, referenced by an overlay rect per bar — which is a
 *     texture rather than a fifth meaning: it is identical on every bar, so it
 *     adds nothing a reader has to decode, and it marches only so that a span
 *     reads as a span. It sits UNDER the critical cap in paint order, which is
 *     how the cap keeps the contrast it was measured at.
 *   - A MILESTONE is a diamond with its label beside it, and it OCCUPIES A
 *     ROW rather than floating on a rail. A rail would leave the label
 *     nowhere to live except the axis, where it collides with the tick text,
 *     and would make the diamond the one element a reader cannot map back to
 *     a row.
 *   - A CONNECTOR is an orthogonal polyline with a hand-drawn arrowhead.
 *     Hand-drawn rather than an SVG `marker`, because a marker takes its
 *     orientation from the path's tangent and half of these arrive travelling
 *     down while half arrive travelling right.
 *   - The RUNNING LIGHT rides THREE SEPARATE paths over the base line, on
 *     every connector — glow, tail and head, the sequence canvas's comet at
 *     this canvas's stroke weights. On every connector because both currents
 *     need it now, not just focus: the ambient sweep was widened off the
 *     critical chain because criticality is already painted twice over. Each
 *     band carries `pathLength={100}`, so its length is a percentage of the
 *     connector rather than a fixed distance that reads as a smear on a short
 *     hop and as nothing on a long one.
 *
 *     The LINE's own entrance draw still needs a real length, and that is
 *     stamped as `--gantt-len` from the layout's computed figure, never from
 *     `getTotalLength()`: this component renders on the server and a
 *     first-paint animation cannot wait for JavaScript.
 *
 * SERVER-SAFE. `onFocus` is optional and no hook runs here, so this renders in
 * a server component and a no-JS reader gets the whole diagram — which is what
 * lets the crawlable example pages ship the SVG in their HTML. `check:seo`
 * cares: an AI crawler does not run JavaScript.
 *
 * MOTION lives in `../styles/gantt-motion.css` and is opt-out twice. The
 * per-row stagger is stamped as an inline custom property here for the same
 * reason ER's is: it is server-rendered, and a first-paint animation cannot
 * wait for a script to write a variable.
 */

import type { GanttLabFile } from "@/types";

import { arrowPoints, axisCaption, axisLabel } from "../lib/axis";
import type { LaidGanttItem, GanttLayout } from "../lib/layout";
import { GANTT, hatchTilePaths, layoutGantt } from "../lib/layout";

export interface GanttDiagramProps {
  file: GanttLabFile;
  /**
   * Ids to keep lit. Absent or empty means nothing is focused and the whole
   * diagram reads at full strength; the dimming is applied by the stylesheet
   * from `af-gantt-has-focus`, never by changing any element's paint here.
   */
  litIds?: ReadonlySet<string>;
  /** Whether the entrance should play. Off for the export path and for the
   * crawlable example pages, which want the resting state. */
  reveal?: boolean;
  /** The app-wide idle-motion state, stamped as `data-af-idle` — the spelling
   * every other viewer in this app uses. */
  idleMotion?: "on" | "off";
  /** Whether the canvas is at rest. The ambient current runs only when it is;
   * see the stylesheet's note on why "at rest" is not a synonym for "always". */
  atRest?: boolean;
  onFocusItem?: (id: string) => void;
  /** Pointer entered a row, or left every row (`null`). Separate from
   * `onFocusItem` because a hover and a click mean different things here: one
   * is a look, the other pins the look in place. */
  onHoverItem?: (id: string | null) => void;
}

export function GanttDiagram({
  file,
  litIds,
  reveal = false,
  idleMotion = "on",
  atRest = false,
  onFocusItem,
  onHoverItem,
}: GanttDiagramProps) {
  const layout = layoutGantt(file);
  const hasFocus = litIds !== undefined && litIds.size > 0;
  const lit = (id: string): "1" | undefined =>
    litIds?.has(id) ? "1" : undefined;

  return (
    <svg
      className={["af-gantt-canvas", hasFocus ? "af-gantt-has-focus" : ""]
        .filter(Boolean)
        .join(" ")}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      /* ITS NATURAL SIZE, not `width="100%"`. Stretching a 1020-unit drawing
         across a 1600px pane put the label rail against one edge and the last
         tick against the other, with the whole thing upscaled to get there.
         The stylesheet caps this with `max-width: 100%` and centres it, so a
         wide pane gets air either side and a narrow one still fits — the
         viewBox and `preserveAspectRatio` do the fitting, undistorted. The
         geometry is untouched, which is what keeps the SVG export identical:
         it builds its own `<svg>` from the same `layoutGantt` figures. */
      width={layout.width}
      height={layout.height}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={describeGantt(file, layout)}
      data-reveal={reveal ? "1" : "0"}
      data-af-idle={idleMotion}
      data-idle={atRest ? "1" : "0"}
    >
      {/* ONE pattern for the whole canvas, referenced by every bar. One
          definition rather than a clip and a stripe set per bar: the ids would
          multiply, and a hundred `<line>` elements per plan is DOM weight for
          a texture. `userSpaceOnUse` anchors the tiling to the diagram's own
          coordinates, so the stripes line up across bars and the whole plot
          reads as one surface rather than as each bar hatched separately.

          THE MARCH IS A CSS TRANSFORM ON THE GROUP INSIDE, which is the only
          mechanism here that can be gated. `patternTransform` is not a CSS
          property; SMIL `<animateTransform>` cannot be held still by
          `prefers-reduced-motion` or by the app's idle toggle, and this canvas
          must opt out twice. See the stylesheet for what happens if an engine
          declines to repaint the pattern. */}
      <defs>
        <pattern
          id="af-gantt-hatch"
          patternUnits="userSpaceOnUse"
          width={GANTT.hatchTile}
          height={GANTT.hatchTile}
        >
          <g
            className="af-gantt-hatch-march"
            style={
              {
                "--gantt-hatch-tile": GANTT.hatchTile,
                "--gantt-hatch-stroke": GANTT.hatchStroke,
              } as React.CSSProperties
            }
          >
            {hatchTilePaths().map((d) => (
              <path key={d} className="af-gantt-hatch-line" d={d} />
            ))}
          </g>
        </pattern>
      </defs>

      <g className="af-gantt-axis">
        {layout.ticks.map((tick) => (
          <line
            key={`grid-${tick.day}`}
            className="af-gantt-grid"
            x1={tick.x}
            x2={tick.x}
            y1={GANTT.axisHeight - 8}
            y2={layout.height - 12}
            opacity={0.55}
          />
        ))}
        <line
          className="af-gantt-rule"
          x1={GANTT.plotX0}
          x2={GANTT.plotX1}
          y1={GANTT.axisHeight - 8}
          y2={GANTT.axisHeight - 8}
        />
        {/* The looping axis sweep. It rides its OWN line over the rule for the
            reason the connector current rides its own path: a dasharray laid
            on `af-gantt-rule` would overwrite the continuous mark a reader uses
            to find the ticks. Both ends sit at the rule's y and never below
            it — a sweep that descended into the plot would be a today marker,
            which this canvas deliberately does not have (a share link carries
            its document but not its date, so a playhead would tell every later
            reader a different thing). `check:gantt-motion` asserts that
            confinement rather than trusting this note. The travel length is
            stamped from the plot the axis actually spans, so it cannot drift
            from `GANTT` the way a number typed into CSS would. */}
        <line
          className="af-gantt-axis-sweep"
          x1={GANTT.plotX0}
          x2={GANTT.plotX1}
          y1={GANTT.axisHeight - 8}
          y2={GANTT.axisHeight - 8}
          style={
            {
              "--gantt-axis-len": GANTT.plotX1 - GANTT.plotX0,
            } as React.CSSProperties
          }
        />
        {layout.ticks.map((tick) => (
          <text
            key={`tick-${tick.day}`}
            className="af-gantt-axis-label"
            x={tick.x + 4}
            y={GANTT.axisHeight - 14}
            fontSize={10}
          >
            {axisLabel(file, tick, layout.tickStep)}
          </text>
        ))}
        <text
          className="af-gantt-axis-label"
          x={0}
          y={GANTT.axisHeight - 14}
          fontSize={10}
        >
          {axisCaption(file, layout)}
        </text>
      </g>

      {layout.sections.map((section) => (
        <g key={`section-${section.label}-${section.y}`}>
          <text
            className="af-gantt-rail-section"
            x={0}
            y={section.y + 16}
            fontSize={9.5}
            fontWeight={600}
          >
            {section.label.toUpperCase()}
          </text>
          <line
            className="af-gantt-rule"
            x1={0}
            x2={GANTT.plotX1}
            y1={section.ruleY}
            y2={section.ruleY}
            opacity={0.7}
          />
        </g>
      ))}

      {layout.items.map((item) => (
        <Row
          key={item.id}
          item={item}
          lit={lit(item.id)}
          onFocusItem={onFocusItem}
          onHoverItem={onHoverItem}
        />
      ))}

      {/* Connectors last, so they sit above the bars they join. */}
      <g className="af-gantt-edges">
        {layout.dependencies.map((dependency) => (
          <g
            key={`${dependency.from}->${dependency.to}`}
            className="af-gantt-edge"
            data-critical={dependency.critical ? "1" : "0"}
            data-lit={
              litIds?.has(dependency.from) && litIds?.has(dependency.to)
                ? "1"
                : undefined
            }
            style={
              {
                "--gantt-edge-wave": dependency.wave,
                "--gantt-len": dependency.length,
              } as React.CSSProperties
            }
          >
            <path className="af-gantt-edge-line" d={dependency.path} />
            {/* THE RUNNING LIGHT: three bands over the untouched line, the
                sequence canvas's comet at this canvas's weights. One band was
                what shipped, and a reader looking at the real page could not
                see it at all — a single slice the same width as the line, in a
                token one step off the line's own, is a colour change rather
                than a light.

                `pathLength={100}` is the part that was actually missing. It
                renormalises the dash maths so a band's length is a PERCENTAGE
                of the connector: the head is 9% of whatever path it rides, on
                a two-day hop and on a hundred-day span alike. The old fixed
                26-unit head was 43% of a short connector and 6% of a long one,
                so it read as a smear on one and as nothing on the other.

                Three separate paths rather than one, and never a dasharray on
                the line itself: that stroke carries critical-versus-slack, and
                a travelling dash over it would overwrite exactly the
                distinction the reader came for. */}
            <path
              className="af-gantt-flow-glow"
              d={dependency.path}
              pathLength={100}
            />
            <path
              className="af-gantt-flow-tail"
              d={dependency.path}
              pathLength={100}
            />
            <path
              className="af-gantt-flow-head"
              d={dependency.path}
              pathLength={100}
            />
            <polygon
              className="af-gantt-arrow"
              points={arrowPoints(dependency)}
            />
          </g>
        ))}
      </g>
    </svg>
  );
}

function Row({
  item,
  lit,
  onFocusItem,
  onHoverItem,
}: {
  item: LaidGanttItem;
  lit?: "1";
  onFocusItem?: (id: string) => void;
  onHoverItem?: (id: string | null) => void;
}) {
  const width = Math.max(item.x1 - item.x0, GANTT.minBarWidth);
  return (
    <g
      className="af-gantt-row"
      data-state={item.state}
      data-critical={item.critical ? "1" : "0"}
      data-lit={lit}
      style={{ "--gantt-wave": item.wave } as React.CSSProperties}
    >
      {!item.milestone && (
        <text
          className="af-gantt-rail-name"
          x={GANTT.railWidth - 8}
          y={item.midY + 4}
          textAnchor="end"
          fontSize={12.5}
        >
          {item.label}
        </text>
      )}

      {item.milestone ? (
        <>
          <polygon
            className="af-gantt-milestone"
            points={[
              `${item.x0},${item.midY - GANTT.milestoneRadius}`,
              `${item.x0 + GANTT.milestoneRadius},${item.midY}`,
              `${item.x0},${item.midY + GANTT.milestoneRadius}`,
              `${item.x0 - GANTT.milestoneRadius},${item.midY}`,
            ].join(" ")}
          />
          <text
            className="af-gantt-rail-name"
            x={item.x0 + GANTT.milestoneRadius + 8}
            y={item.midY + 4}
            fontSize={12}
            fontWeight={500}
          >
            {item.label}
          </text>
        </>
      ) : (
        <>
          <rect
            className="af-gantt-bar-fill"
            x={item.x0}
            y={item.barY}
            width={width}
            height={GANTT.barHeight}
            rx={4}
          />
          {/* The hatch, over the fill and UNDER the cap. Same box as the
              fill, `rx` included, so it cannot bleed past a rounded corner —
              no `clipPath` needed. Painted before the cap on purpose: the cap
              is the only per-bar signal of criticality and it just cleared a
              contrast fix, so nothing translucent may lie on top of it.
              Milestones never reach this branch and so are never hatched — a
              diamond is an instant, and a texture that says "a span is
              running" would be saying it about a thing with no span. */}
          <rect
            className="af-gantt-hatch-overlay"
            x={item.x0}
            y={item.barY}
            width={width}
            height={GANTT.barHeight}
            rx={4}
            fill="url(#af-gantt-hatch)"
          />
          {item.critical && (
            <rect
              className="af-gantt-cap"
              x={item.x0}
              y={item.barY}
              width={GANTT.criticalCapWidth}
              height={GANTT.barHeight}
              rx={1.5}
            />
          )}
          <text
            className="af-gantt-duration"
            x={item.x0 + width + 8}
            y={item.midY + 4}
            fontSize={10.5}
          >
            {item.duration}d
          </text>
        </>
      )}

      {/* A full-width hit target, so pointing anywhere on the row selects it —
          a one-day bar is six pixels wide and would otherwise be unhittable. */}
      <rect
        className="af-gantt-hit"
        x={0}
        y={item.rowY}
        width={GANTT.width}
        height={GANTT.rowHeight}
        tabIndex={onFocusItem ? 0 : undefined}
        role={onFocusItem ? "button" : undefined}
        aria-label={
          onFocusItem
            ? `${item.label}${item.critical ? ", on the critical chain" : ""}`
            : undefined
        }
        onClick={onFocusItem ? () => onFocusItem(item.id) : undefined}
        onPointerEnter={onHoverItem ? () => onHoverItem(item.id) : undefined}
        onFocus={onHoverItem ? () => onHoverItem(item.id) : undefined}
        onBlur={onHoverItem ? () => onHoverItem(null) : undefined}
      />
    </g>
  );
}

/**
 * The `aria-label` for the whole canvas, and the sentence a screen reader gets
 * instead of the picture.
 *
 * Names the span, the sections and the critical chain — the three things the
 * diagram exists to say. Deliberately not a list of every bar: a reader who
 * wants the detail can tab the rows, each of which carries its own label.
 */
function describeGantt(file: GanttLabFile, layout: GanttLayout): string {
  const sections = layout.sections.map((section) => section.label).join(", ");
  const chain = layout.items
    .filter((item) => item.critical)
    .map((item) => item.label)
    .join(" → ");
  return (
    `Gantt of ${layout.items.length} items over ${layout.end} days, ` +
    `in sections: ${sections}. Critical chain: ${chain}.`
  );
}

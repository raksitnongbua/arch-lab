/**
 * The lifecycle canvas: one SVG drawn straight from `layoutLifecycle`'s
 * coordinates.
 *
 * SVG RATHER THAN `@xyflow/react`, which the C4 canvas uses. Nothing here is
 * dragged — the layout is solved from the text, so a drag would be undone by
 * the next parse — and a node-graph runtime would cost the ability to hand the
 * SAME element tree to the SVG exporter. The ER, use-case, flowchart,
 * dictionary, gantt and timeline canvases all made this call.
 *
 * WHAT IT DRAWS, and why each part is shaped as it is — this is the file where
 * "it must not read as a flowchart" is won or lost, so every choice below is
 * about that:
 *
 *   - The SUBJECT is a heading above the track, in the state column and at a
 *     larger size. It is the only element that is not on or off the spine,
 *     because it is what the spine is ABOUT. Drawing it as a first box would
 *     make it look like a start node, which is a flowchart's element.
 *   - The SPINE is one line, clipped to the first and last state dot. It
 *     carries no ticks and no scale — nothing here measures — and no
 *     arrowheads between states, because there are no edges along it: the
 *     order IS the geometry. An arrowhead per hop is exactly the mark that
 *     would turn this back into a graph of nodes.
 *   - A STATE is a dot on the spine with its label and description to the
 *     RIGHT. A final state's dot carries a bar across it — shape, not colour
 *     (`../styles/lifecycle-motion.css` argues why this canvas has no
 *     palette). A state after a final one is drawn faded, because the subject
 *     cannot get there.
 *   - AN EXIT hangs to the LEFT, at a smaller size, joined to its state's dot
 *     by a short stub. Everything right of the line is where the subject
 *     goes; everything left of it is where it stops going. That asymmetry is
 *     the picture's grammar and is why exits are never drawn as peers.
 *   - A REJOIN is the only long connector, and it carries the one arrowhead
 *     on the canvas — pointing INTO the spine, at the gap above the state the
 *     subject re-enters at. It travels in a reserved channel the layout
 *     guarantees is empty, which is what makes "a branch never crosses a
 *     state it does not touch" a measured property rather than a hope.
 *   - TEXT IS PRE-WRAPPED BY THE LAYOUT into one `<text>` per line, never one
 *     `<text>` with a width: SVG computes extents from the box and not from
 *     the text, so an unwrapped label draws one unbroken line straight off the
 *     canvas — the defect `wrapText`'s own header records.
 *
 * SERVER-SAFE. `onFocusState` is optional and no hook runs here, so this
 * renders in a server component and a no-JS reader gets the whole diagram —
 * which is what lets the crawlable example pages ship the SVG in their HTML.
 * `check:seo` cares: an AI crawler does not run JavaScript.
 *
 * MOTION lives in `../styles/lifecycle-motion.css` and is opt-out twice. The
 * per-row stagger and both path lengths are stamped as inline custom
 * properties here for the same reason ER's and the gantt's are: they are
 * server-rendered, and a first-paint animation cannot wait for a script to
 * write a variable.
 */

import { DiagramHeadingText } from "@/components/ui/diagram-heading-text";
import { DiagramSurface } from "@/components/ui/diagram-surface";
import type { LifecycleLabFile } from "@/types";

import {
  LIFECYCLE_FRAME_PAD,
  LIFECYCLE_HEADING_METRICS,
  LIFECYCLE,
  layoutLifecycle,
} from "../lib/layout";
import type {
  LaidLifecycleExit,
  LaidLifecycleState,
  LifecycleLayout,
  RejoinPath,
} from "../lib/layout";
import { keyActivate } from "@/lib/key-activate";

export interface LifecycleDiagramProps {
  file: LifecycleLabFile;
  /**
   * Keys to keep lit. Absent or empty means nothing is focused and the whole
   * diagram reads at full strength; the dimming is applied by the stylesheet
   * from `af-lc-has-focus`, never by changing any element's paint here.
   */
  litKeys?: ReadonlySet<string>;
  /** Whether the entrance should play. Off for the export path and for the
   * crawlable example pages, which want the resting state. */
  reveal?: boolean;
  /** The app-wide idle-motion state, stamped as `data-af-idle` — the spelling
   * every other viewer in this app uses. */
  idleMotion?: "on" | "off";
  /** Whether the canvas is at rest. The ambient sweep runs only when it is;
   * see the stylesheet's note on why "at rest" is not a synonym for
   * "always". */
  atRest?: boolean;
  onFocusState?: (key: string) => void;
  /** Pointer entered a row, or left every row (`null`). Separate from
   * `onFocusState` because a hover and a click mean different things here: one
   * is a look, the other pins the look in place. */
  onKeyFocusState?: (key: string | null) => void;
}

/** The key a state is focused by. States and exits share one key space so the
 * viewer's lit set can hold either without a discriminant. */
export const stateKey = (index: number): string => `s${index}`;

export function LifecycleDiagram({
  file,
  litKeys,
  reveal = false,
  idleMotion = "on",
  atRest = false,
  onFocusState,
  onKeyFocusState,
}: LifecycleDiagramProps) {
  const layout = layoutLifecycle(file);
  const hasFocus = litKeys !== undefined && litKeys.size > 0;
  const spineLength = Math.max(1, layout.spineY1 - layout.spineY0);

  /* THE SHEET, which is the drawing plus its margin. The drawing keeps every
     coordinate it had; the box around it grows, and the origin moves out to
     meet it — so the surface below has room to sit around the drawing without
     its stroke landing on the viewBox edge. */
  const sheetWidth = layout.width + LIFECYCLE_FRAME_PAD * 2;
  const sheetHeight = layout.height + LIFECYCLE_FRAME_PAD * 2;

  return (
    <svg
      className={["af-lc-canvas", hasFocus ? "af-lc-has-focus" : ""]
        .filter(Boolean)
        .join(" ")}
      viewBox={`${-LIFECYCLE_FRAME_PAD} ${-LIFECYCLE_FRAME_PAD} ${sheetWidth} ${sheetHeight}`}
      /* ITS NATURAL SIZE, not `width="100%"`. Stretching a 1040-unit drawing
         across a wide pane puts the branch lane against one edge and upscales
         everything to get there. The stylesheet caps this with
         `max-width: 100%` and centres it, so a wide pane gets air either side
         and a narrow one still fits — the viewBox and `preserveAspectRatio`
         do the fitting, undistorted. The geometry is untouched, which is what
         keeps the SVG export identical: it builds its own `<svg>` from the
         same `layoutLifecycle` figures. */
      width={sheetWidth}
      height={sheetHeight}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={describeLifecycle(file, layout)}
      data-reveal={reveal ? "1" : "0"}
      data-af-idle={idleMotion}
      data-idle={atRest ? "1" : "0"}
    >
      {/* THE DIAGRAM'S SHEET, the same panel the gantt and the dictionary
          draw on. See `@/lib/diagram-surface` for what a surface is for, and
          for why it can never be drawn at the drawing's own bounds. */}
      <DiagramSurface width={layout.width} height={layout.height} />
      {/* THE DOCUMENT'S TITLE, inside the drawing so it travels with exports —
          an exported lifecycle with no title belongs to nothing. */}
      <DiagramHeadingText
        heading={layout.heading}
        x={LIFECYCLE.channelX0}
        top={0}
        metrics={LIFECYCLE_HEADING_METRICS}
      />
      {/* The subject: the head of the diagram, above the track. */}
      {layout.subject.labelLines.map((line, index) => (
        <text
          key={`sub${index}`}
          className="af-lc-subject"
          x={LIFECYCLE.stateLabelX}
          y={layout.subject.labelY + index * LIFECYCLE.subjectLineHeight}
          fontSize={LIFECYCLE.subjectSize}
          fontWeight={600}
        >
          {line}
        </text>
      ))}
      {layout.subject.descY !== null &&
        layout.subject.descriptionLines.map((line, index) => (
          <text
            key={`subd${index}`}
            className="af-lc-subject-desc"
            x={LIFECYCLE.stateLabelX}
            y={
              (layout.subject.descY ?? 0) +
              index * LIFECYCLE.subjectDescLineHeight
            }
            fontSize={LIFECYCLE.subjectDescSize}
          >
            {line}
          </text>
        ))}

      {/* The spine, under the dots. One line for the whole track: the states
          are places ON it, never boxes joined to it, which is what says the
          history is one continuous passage rather than a set of hops. */}
      <line
        className="af-lc-spine"
        x1={layout.spineX}
        x2={layout.spineX}
        y1={layout.spineY0}
        y2={layout.spineY1}
        style={{ "--lc-spine-len": spineLength } as React.CSSProperties}
      />
      {/* The ambient sweep rides its OWN line over the spine, never a
          dasharray on the spine itself: that stroke is the continuous mark a
          reader uses to follow the track, and a travelling dash laid on it
          would break the very line it is meant to describe. Both ends sit on
          the spine's own x, and its travel length is stamped from the spine
          the layout actually solved, so it cannot drift from the geometry the
          way a number typed into CSS would. `check:lifecycle-motion` asserts
          that confinement rather than trusting this note. */}
      <line
        className="af-lc-sweep"
        x1={layout.spineX}
        x2={layout.spineX}
        y1={layout.spineY0}
        y2={layout.spineY1}
        /* ONLY THE LENGTH, and only for the resting zero-length dash. The
           ambient marches a REPEATING pattern of two constants, so unlike the
           washing head it replaced it needs to know nothing about how long the
           spine is — which is why no short-diagram cap is stamped here. */
        style={{ "--lc-spine-len": spineLength } as React.CSSProperties}
      />

      {layout.states.map((state, index) => (
        <StateRow
          key={state.id}
          state={state}
          index={index}
          exits={layout.exits.filter((exit) => exit.from === state.id)}
          spineX={layout.spineX}
          lit={litKeys?.has(stateKey(index)) ? "1" : undefined}
          onFocusState={onFocusState}
          onKeyFocusState={onKeyFocusState}
        />
      ))}
    </svg>
  );
}

/**
 * One state and everything that belongs to it — its dot, its text, and its
 * departures.
 *
 * ONE GROUP, NOT TWO, and that is the focus model rather than a convenience:
 * lighting a state lights its ways out, because "what can happen here" is the
 * question a lifecycle is read for and the exits are the answer. Splitting
 * them would make focus mean "this box", which is what focusing a node in a
 * graph means.
 */
function StateRow({
  state,
  index,
  exits,
  spineX,
  lit,
  onFocusState,
  onKeyFocusState,
}: {
  state: LaidLifecycleState;
  index: number;
  exits: LaidLifecycleExit[];
  spineX: number;
  lit?: "1";
  onFocusState?: (key: string) => void;
  onKeyFocusState?: (key: string | null) => void;
}) {
  const key = stateKey(index);
  return (
    <g
      className="af-lc-row"
      data-lit={lit}
      data-reachable={state.reachable ? "1" : "0"}
      style={{ "--lc-wave": state.wave } as React.CSSProperties}
    >
      {exits.map((exit) => (
        <Exit key={exit.key} exit={exit} state={state} spineX={spineX} />
      ))}

      {/* THE FOCUS HALO, and it is the one mark focus is allowed to ADD.
          The standing rule on this canvas is that focus DIMS and never
          REPAINTS, and that still holds — nothing already drawn changes colour,
          weight or radius. What was missing is that dimming only ever
          SUBTRACTS: everything unrelated goes quiet and the thing you chose
          gains nothing, which reads as weak exactly when the diagram is busy.

          A DRAWN SHAPE, NEVER AN SVG `filter`. A glow was tried as a filter on
          the ER canvas and its region collapsed on axis-aligned geometry,
          painting bands across the diagram; it cost three commits. The rule
          that came out of it says what to do instead — "want a soft edge? draw
          a wider path" — and the use-case and flowchart canvases already emit a
          shaped ring beside their hit target for the same reason. This is the
          third of that family.

          IT COSTS NO SPACE, because the space was already spent.
          `LIFECYCLE.ringRadius` has been in the layout table since this canvas
          was written, commented as "the ring around a focused one", and every
          state box is sized to `dotY + ringRadius + 2` — so the room has been
          reserved all along and nothing was ever drawn in it.

          The paint lives in `globals.css` beside those two, so one rule says
          what a focus ring looks like; this canvas only says when it appears. */}
      <circle
        className="af-lc-ring"
        cx={spineX}
        cy={state.dotY}
        r={LIFECYCLE.ringRadius}
      />
      <circle
        className="af-lc-dot"
        cx={spineX}
        cy={state.dotY}
        r={LIFECYCLE.dotRadius}
      />
      {/* The bar across a final state's dot: the subject stops here. Drawn
          rather than coloured, so it survives greyscale and a screenshot. */}
      {state.final ? (
        <line
          className="af-lc-stop"
          x1={spineX - LIFECYCLE.stopBarHalf}
          x2={spineX + LIFECYCLE.stopBarHalf}
          y1={state.dotY + LIFECYCLE.dotRadius + 5}
          y2={state.dotY + LIFECYCLE.dotRadius + 5}
        />
      ) : null}

      {state.labelLines.map((line, lineIndex) => (
        <text
          key={`l${lineIndex}`}
          className="af-lc-label"
          x={LIFECYCLE.stateLabelX}
          y={state.labelY + lineIndex * LIFECYCLE.stateLineHeight}
          fontSize={LIFECYCLE.stateSize}
          fontWeight={600}
        >
          {line}
        </text>
      ))}
      {state.descY !== null &&
        state.descriptionLines.map((line, lineIndex) => (
          <text
            key={`d${lineIndex}`}
            className="af-lc-desc"
            x={LIFECYCLE.stateLabelX}
            y={(state.descY ?? 0) + lineIndex * LIFECYCLE.stateDescLineHeight}
            fontSize={LIFECYCLE.stateDescSize}
          >
            {line}
          </text>
        ))}

      {/* A hit target spanning the whole row, so pointing anywhere near it
          selects the state — a 6.5-unit dot would otherwise be the only place
          a pointer could land. */}
      <rect
        className="af-lc-hit"
        x={0}
        y={state.y0}
        width={LIFECYCLE.width}
        height={Math.max(1, state.y1 - state.y0)}
        tabIndex={onFocusState ? 0 : undefined}
        role={onFocusState ? "button" : undefined}
        aria-label={onFocusState ? describeState(state, exits) : undefined}
        onClick={onFocusState ? () => onFocusState(key) : undefined}
        /* THE KEYBOARD HALF OF THE CLICK. `role="button"` promises a
           reader that Enter and Space do what a press does, and nothing in
           the platform honours that on an SVG shape. It mattered less while
           a hover could light a row; now that a press is the ONLY way to
           select one, a canvas without this is a canvas for mice. */
        onKeyDown={
          onFocusState ? keyActivate(() => onFocusState(key)) : undefined
        }
        onFocus={onKeyFocusState ? () => onKeyFocusState(key) : undefined}
        onBlur={onKeyFocusState ? () => onKeyFocusState(null) : undefined}
      />
    </g>
  );
}

/** One departure: the stub out of the spine, the mark, the text, and — for a
 * returning branch — the path back. */
function Exit({
  exit,
  state,
  spineX,
}: {
  exit: LaidLifecycleExit;
  state: LaidLifecycleState;
  spineX: number;
}) {
  const path = exit.rejoinPath;
  return (
    <>
      {/* The stub: down the spine's own x from the state's dot, then out to
          the departure. Orthogonal, because the notation implies it — the
          subject was travelling down the line and turned off it. */}
      <path
        className="af-lc-stub"
        d={`M ${spineX} ${state.dotY} L ${spineX} ${exit.dotY} L ${LIFECYCLE.branchDotX} ${exit.dotY}`}
      />
      <circle
        className="af-lc-exit-dot"
        cx={LIFECYCLE.branchDotX}
        cy={exit.dotY}
        r={LIFECYCLE.exitDotRadius}
      />
      {/* A terminal branch stops at a bar, the same mark a final state
          carries — one shape for "the subject stops", wherever it stops. */}
      {path === null ? (
        <line
          className="af-lc-stop"
          x1={LIFECYCLE.branchDotX - LIFECYCLE.exitDotRadius - 4}
          x2={LIFECYCLE.branchDotX - LIFECYCLE.exitDotRadius - 4}
          y1={exit.dotY - LIFECYCLE.stopBarHalf}
          y2={exit.dotY + LIFECYCLE.stopBarHalf}
        />
      ) : (
        <ReturnPath path={path} exit={exit} spineX={spineX} />
      )}

      {exit.labelLines.map((line, index) => (
        <text
          key={`el${index}`}
          className="af-lc-exit-label"
          x={LIFECYCLE.branchTextRight}
          y={exit.labelY + index * LIFECYCLE.exitLineHeight}
          textAnchor="end"
          fontSize={LIFECYCLE.exitSize}
          fontWeight={600}
        >
          {line}
        </text>
      ))}
      {exit.whenY !== null &&
        exit.whenLines.map((line, index) => (
          <text
            key={`ew${index}`}
            className="af-lc-when"
            x={LIFECYCLE.branchTextRight}
            y={(exit.whenY ?? 0) + index * LIFECYCLE.whenLineHeight}
            textAnchor="end"
            fontSize={LIFECYCLE.whenSize}
          >
            {line}
          </text>
        ))}
      {exit.descY !== null &&
        exit.descriptionLines.map((line, index) => (
          <text
            key={`ed${index}`}
            className="af-lc-when"
            x={LIFECYCLE.branchTextRight}
            y={(exit.descY ?? 0) + index * LIFECYCLE.whenLineHeight}
            textAnchor="end"
            fontSize={LIFECYCLE.whenSize}
          >
            {line}
          </text>
        ))}
    </>
  );
}

/**
 * The one long connector on this canvas, drawn FROM the departure TO the
 * spine.
 *
 * THE DIRECTION OF THE `d` ATTRIBUTE IS LOAD-BEARING and not a style: the
 * travelling dash in the stylesheet moves along the path's own direction, so
 * a path written backwards would animate the subject returning from the state
 * it is going back to — the opposite claim. `check:lifecycle-motion` asserts
 * the path starts at the exit.
 *
 * Its length is stamped as `--lc-path-len` from the segments the layout
 * solved, so the draw-in and the dash maths are in the same units as the line
 * they ride. Measured here rather than with `getTotalLength`, which needs a
 * DOM this component deliberately does not have.
 */
function ReturnPath({
  path,
  exit,
  spineX,
}: {
  path: RejoinPath;
  exit: LaidLifecycleExit;
  spineX: number;
}) {
  const points: [number, number][] = [
    [LIFECYCLE.branchDotX, exit.dotY],
    [LIFECYCLE.branchDotX, path.departY],
    [path.channelX, path.departY],
    [path.channelX, path.joinY],
    [spineX, path.joinY],
  ];
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length +=
      Math.abs(points[index][0] - points[index - 1][0]) +
      Math.abs(points[index][1] - points[index - 1][1]);
  }
  const d = points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`)
    .join(" ");

  return (
    <>
      <path
        className="af-lc-return"
        d={d}
        style={{ "--lc-path-len": Math.max(1, length) } as React.CSSProperties}
      />
      {/* The canvas's ONE arrowhead, pointing into the spine. There are none
          between states, because the track has no edges — so this mark means
          exactly one thing wherever a reader meets it: the subject comes back
          in here. */}
      <path
        className="af-lc-arrow"
        d={`M ${spineX} ${path.joinY} l -8 -4 l 0 8 z`}
      />
    </>
  );
}

/** What a screen reader is told about one row: the state, whether it ends,
 * and the ways out with their conditions. Everything the picture says about
 * this state, in the order the picture says it. */
function describeState(
  state: LaidLifecycleState,
  exits: LaidLifecycleExit[],
): string {
  const ends = state.final ? ", where it stops" : "";
  const reach = state.reachable ? "" : " (unreachable)";
  if (exits.length === 0) return `${state.label}${ends}${reach}`;
  const ways = exits
    .map((exit) => {
      const when =
        exit.whenLines.length === 0 ? "" : ` when ${exit.whenLines.join(" ")}`;
      const lands =
        exit.rejoins === null ? "and stops" : `and returns to ${exit.rejoins}`;
      return `${exit.label}${when}, ${lands}`;
    })
    .join("; ");
  return `${state.label}${ends}${reach}. Ways out: ${ways}.`;
}

/**
 * The `aria-label` for the whole canvas, and the sentence a screen reader gets
 * instead of the picture.
 *
 * Names the SUBJECT and the shape — how many states, how many ways out — and
 * stops there. Deliberately not a list of every state: a reader who wants the
 * detail can tab the rows, each of which carries its own full description,
 * and reading a dozen states out before the reader has asked for any of them
 * is worse than the picture they replace.
 */
function describeLifecycle(
  file: LifecycleLabFile,
  layout: LifecycleLayout,
): string {
  const states = layout.states.length;
  const exits = layout.exits.length;
  const subject = file.subject?.label ?? "one subject";
  return (
    `Lifecycle of ${subject}: ${states} state${states === 1 ? "" : "s"} ` +
    `in order, with ${exits === 0 ? "no" : exits} way${exits === 1 ? "" : "s"} out. ` +
    `${file.metadata.title}.`
  );
}

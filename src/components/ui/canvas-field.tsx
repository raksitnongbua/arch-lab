/**
 * THE WELL'S FIELD, for every canvas that is not React Flow.
 *
 * `--canvas-dot`, `--canvas-rule` and `--canvas-rule-major` are the well's
 * three field layers (see `globals.css` for the tokens and the opt-in policy,
 * and `editor/lib/canvas-constants.ts` for the pitch and weights). On the two
 * C4 canvases React Flow paints them natively with three stacked
 * `<Background>` layers. THIS is the same three layers for the other eight
 * notations, which draw plain SVG and have never had a field at all.
 *
 * IT IS DRAWN INSIDE THE DIAGRAM'S OWN `<svg>`, IN THE DIAGRAM'S OWN
 * COORDINATES, and that is the whole design. The obvious alternative — a CSS
 * `background-image` on the well, one edit on `DiagramWell` — is WRONG here,
 * and measurably so: not one of the nine canvases is static. Six carry a real
 * zoom camera (both C4 hosts, sequence, flowchart, use-case through a scaled
 * `<svg>`; ER and the dictionary through a box sized from `camera.scale`) and
 * the other three scroll their content inside `overflow-auto`. A ground painted
 * on the pane stays still while the drawing slides and scales over it, which
 * tells the reader the paper is not under the drawing — worse than no field.
 * A `<pattern>` in `userSpaceOnUse` units is in the drawing's coordinate space
 * by construction, so it pans, scrolls and zooms with the drawing in all three
 * of those arrangements without a line of camera maths.
 *
 * IT MARKS THE SHEET, NOT THE PANE, and that is deliberate rather than a
 * limitation. The rect is the diagram's own box, so on a pane wider than the
 * drawing the field ends where the drawing ends. C4's field is infinite because
 * a C4 canvas is an infinite surface you pan around; these eight are finite
 * drawings, and a finite drawing on a ruled sheet is what a sheet of paper is.
 * The two readings differ because the two things differ.
 *
 * IT IS NOT IN ANY EXPORT, by construction rather than by a flag. Every
 * notation's exporter is a separate string-building renderer under
 * `features/<kind>/export/render-svg.ts` that imports layout and nothing from
 * these components, so a field added here cannot reach a downloaded file. That
 * is also the decision: the field is screen chrome — it says where the drawing
 * is being read, not what the drawing means — and a diagram dropped into a deck
 * should arrive as the drawing. `check:canvas-grid` pins it so the two renderers
 * cannot quietly converge.
 *
 * WHAT HAPPENS TO THE PITCH WHEN A CANVAS ZOOMS, stated because "the grid
 * stopped matching the drawing" is the complaint this replaces. The pattern is
 * measured in the diagram's user units, so the field scales exactly as the
 * drawing does and a cell is always the same number of diagram units — which is
 * what React Flow's layers do on the C4 canvases, so the two mechanisms agree.
 * On the three canvases with no camera (gantt, timeline, lifecycle) the `<svg>`
 * is drawn at natural size and shrunk by `max-width: 100%`, so the field shrinks
 * with it on a narrow pane. That is the same rule, not an exception: the field
 * belongs to the drawing, so whatever resizes the drawing resizes the field.
 *
 * A FIXED id PER KIND, not the per-instance one `<WashGradient>` uses, and the
 * difference is real rather than sloppy. A wash gradient is built from the
 * node's OWN fill, so two nodes sharing an id paint each other's colour. The
 * field is the same three tokens on every canvas of every kind, so two diagrams
 * sharing it resolve to the identical pattern — and a fixed id also keeps this
 * usable from the server-rendered example views, which cannot call `useId`.
 * `af-gantt-hatch` is the same call for the same reason.
 */

import {
  CANVAS_FIELD_GAP,
  CANVAS_RULE_MAJOR_STEP,
  CANVAS_RULE_MAJOR_WIDTH,
  CANVAS_RULE_WIDTH,
} from "@/features/editor/lib/canvas-constants";

/** The diagram's own box, in its own user units — normally its viewBox. */
export interface CanvasFieldBox {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

export function CanvasField({
  id,
  x = 0,
  y = 0,
  width,
  height,
}: CanvasFieldBox & { id: string }): React.JSX.Element {
  const major = CANVAS_FIELD_GAP * CANVAS_RULE_MAJOR_STEP;
  /* The patterns are ANCHORED TO THE BOX, not to the user-space origin: a
     sequence diagram's viewBox starts at a negative x, and a lattice anchored
     at 0 would put its first rule at a different place inside the drawing than
     the same lattice does on every other kind. */
  const anchor = { x, y };
  return (
    <>
      <defs>
        <pattern
          id={`${id}-dots`}
          patternUnits="userSpaceOnUse"
          width={CANVAS_FIELD_GAP}
          height={CANVAS_FIELD_GAP}
          {...anchor}
        >
          {/* r 0.75 — the 1.5 diameter React Flow's dot layer uses, so the two
              mechanisms draw the same field at the same pitch. */}
          <circle cx={0} cy={0} r={0.75} fill="var(--canvas-dot)" />
        </pattern>
        <pattern
          id={`${id}-minor`}
          patternUnits="userSpaceOnUse"
          width={CANVAS_FIELD_GAP}
          height={CANVAS_FIELD_GAP}
          {...anchor}
        >
          <path
            d={`M ${CANVAS_FIELD_GAP} 0 L 0 0 L 0 ${CANVAS_FIELD_GAP}`}
            fill="none"
            stroke="var(--canvas-rule)"
            strokeWidth={CANVAS_RULE_WIDTH}
          />
        </pattern>
        <pattern
          id={`${id}-major`}
          patternUnits="userSpaceOnUse"
          width={major}
          height={major}
          {...anchor}
        >
          <path
            d={`M ${major} 0 L 0 0 L 0 ${major}`}
            fill="none"
            stroke="var(--canvas-rule-major)"
            strokeWidth={CANVAS_RULE_MAJOR_WIDTH}
          />
        </pattern>
      </defs>
      {/* Three rects rather than one with three fills: SVG has no fill
          stacking. Minor before major so the heavy line lies ON the light one
          at every intersection they share, which is the order the React Flow
          layers are mounted in. `pointer-events: none` throughout — the field
          lies under the drawing and must never take a click meant for it. */}
      <g aria-hidden="true" className="pointer-events-none">
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={`url(#${id}-dots)`}
        />
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={`url(#${id}-minor)`}
        />
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={`url(#${id}-major)`}
        />
      </g>
    </>
  );
}

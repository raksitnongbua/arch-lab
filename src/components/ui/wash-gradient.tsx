/**
 * The stops of the node surface wash, as an SVG gradient for shapes a CSS
 * background cannot follow — the exact recipe `.af-node-wash` paints on box
 * nodes (globals.css: lit top edge, flat middle band, grounding bottom).
 * Shared by the editor/viewer silhouettes (cylinder, pipe) and the flowchart
 * renderer's all-SVG nodes; the fractions and offsets come from `@/lib/wash`,
 * the one definition the exporters and `check:flowchart-palette` also read.
 *
 * Reads the same `--node-fill` / `--node-stroke` custom properties every node
 * shape paints with, so tagColors overrides follow for free. Per-instance id:
 * a shared one would make every node paint with whichever defs mounted first.
 */

import {
  WASH_BOTTOM_FRACTION,
  WASH_LOW_OFFSET,
  WASH_MID_OFFSET,
  WASH_STROKE_FRACTION,
} from "@/lib/wash";

const WASH_TOP_MIX = `color-mix(in oklab, var(--node-stroke) ${WASH_STROKE_FRACTION * 100}%, var(--node-fill))`;
const WASH_BOTTOM_MIX = `color-mix(in oklab, var(--node-stroke) ${WASH_BOTTOM_FRACTION * 100}%, var(--node-fill))`;

export function WashGradient({ id }: { id: string }): React.JSX.Element {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        {/* style, not the stop-color attribute: custom properties only
            resolve through the CSS cascade — `stop-color="var(--x)"` as an
            attribute value is treated as an invalid colour and paints
            black. */}
        <stop offset="0" style={{ stopColor: WASH_TOP_MIX }} />
        <stop
          offset={WASH_MID_OFFSET}
          style={{ stopColor: "var(--node-fill)" }}
        />
        <stop
          offset={WASH_LOW_OFFSET}
          style={{ stopColor: "var(--node-fill)" }}
        />
        <stop offset="1" style={{ stopColor: WASH_BOTTOM_MIX }} />
      </linearGradient>
    </defs>
  );
}

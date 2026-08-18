/**
 * Flowchart shape geometry and the shape→colour table — shared by the
 * live renderer (`components/flowchart-diagram.tsx`) and the SVG exporter
 * (`export/render-svg.ts`). One definition, because the exporter re-renders
 * from the model: if each consumer drew its own rhombus, "the export matches
 * the screen" would be a hope rather than a property.
 *
 * Pure and erasable (no DOM, no React) so the check script can load anything
 * that imports it through Node's type stripping.
 */

import { arrowheadPathAt } from "@/lib/arrowhead";
import { fmt } from "@/lib/svg-markup";
import type { FlowchartNodeShape } from "@/types";

import type { FlowPoint, LaidFlowNode } from "./layout";

/**
 * Which contrast-audited colour pair each symbol wears — every shape its own
 * hue, six hues spaced round the wheel at the role palette's exact lightness
 * and chroma band, so they read as one deliberate family rather than six
 * products. This table holds the TOKEN NAMES: the screen renderer wraps
 * them in `var()`, the exporter resolves them to concrete sRGB
 * (`viewer/export/theme.ts`) — one table, so the two cannot name different
 * tokens. The values live in `globals.css` (per theme; the light block
 * carries the design notes) and `check:flowchart-palette` measures every
 * shape × theme pair.
 *
 * The budget argument mirrors node-colors.ts, and is why four shapes RE-USE
 * a C4 role pair: a hue is only worth paying for when the meanings it
 * separates share a canvas, and a flowchart never shares one with a C4
 * diagram — so start borrows the queue green ("go"), step the internal
 * blue, io the database teal, call the person violet. Only two hues are
 * newly minted: decision's amber (the classic caution diamond) and end's
 * rose. The FIRST version of this table spent nothing — it mapped six
 * shapes onto the five roles, sharing one violet between start and end —
 * and a real six-node chart of terminators rendered as a single purple
 * monotone. In a flowchart ALL six shapes routinely share the canvas, so
 * each meaning pays for its own hue; start and end especially must never
 * share (the check asserts their distance, not just inequality). `call` no
 * longer wears the receding external grey for the same reason: "defined
 * elsewhere" is still a stop on THIS chart's path, and greying it out made
 * one box on the happy path look disabled.
 *
 * Colour is never the only signal (WCAG 1.4.1): every shape keeps its
 * silhouette — stadium, rhombus, parallelogram, double-struck rails.
 */
export const FLOW_SHAPE_TOKENS: Record<
  FlowchartNodeShape,
  { fill: string; border: string }
> = {
  start: { fill: "--flow-start", border: "--flow-start-border" },
  end: { fill: "--flow-end", border: "--flow-end-border" },
  step: { fill: "--flow-step", border: "--flow-step-border" },
  decision: { fill: "--flow-decision", border: "--flow-decision-border" },
  io: { fill: "--flow-io", border: "--flow-io-border" },
  call: { fill: "--flow-call", border: "--flow-call-border" },
};

/** Corner radius of a `step`/`call` box. */
export const STEP_RADIUS = 8;
/** Rounding of an orthogonal edge's corners. */
export const EDGE_CORNER_RADIUS = 8;
/** Arrowhead length and half-width, matched to the sequence arrow's weight. */
export const ARROW_LENGTH = 9;
export const ARROW_HALF_WIDTH = 4.5;

export interface ShapeGeometry {
  /** Rounded-rect shapes: draw a `<rect>` with this radius. */
  rect?: { rx: number };
  /** Polygonal shapes (diamond, parallelogram): the outline path. */
  path?: string;
  /** The `call` shape's double-struck side rails, drawn over the rect. */
  rails?: readonly [string, string];
}

/**
 * The outline for one node. The layout owns every number here — this only
 * turns a box into the classic symbol drawn inside it.
 */
/** How far a focus ring sits outside the shape it marks — the use-case
 * canvas's `FOCUS_RING_PAD` sibling, kept per-feature because the two
 * canvases' shapes have different visual weight and will be tuned apart. */
export const FLOW_FOCUS_RING_PAD = 5;

/**
 * The focus ring's outline, FOLLOWING THE SHAPE. A CSS `outline` boxes the
 * bounding box, so a focused stadium, diamond or parallelogram wore a
 * rectangle — reported on the use-case canvas as "on focus border should be
 * shaped, not square", and true here for the same reason.
 *
 * Built by asking `shapeGeometry` for the SAME shape at a padded box, so the
 * ring can never disagree with the outline it marks: one shape function, two
 * callers. A polygon padded by its bounding box does not offset perfectly
 * uniformly (a diamond's edges move in a little), which is a visual nicety
 * nobody can see at a 5px ring and not worth a second geometry routine.
 */
export function focusRingGeometry(
  node: Pick<LaidFlowNode, "shape" | "x" | "y" | "width" | "height">,
): ShapeGeometry & { box: { x: number; y: number; width: number; height: number } } {
  const pad = FLOW_FOCUS_RING_PAD;
  const box = {
    x: node.x - pad,
    y: node.y - pad,
    width: node.width + pad * 2,
    height: node.height + pad * 2,
  };
  return { ...shapeGeometry({ shape: node.shape, ...box }), box };
}

export function shapeGeometry(
  node: Pick<LaidFlowNode, "shape" | "x" | "y" | "width" | "height">,
): ShapeGeometry {
  const { x, y, width, height } = node;
  switch (node.shape) {
    case "start":
    case "end":
      // Stadium: the full-height radius makes the rect's short sides caps.
      return { rect: { rx: height / 2 } };
    case "decision": {
      const cx = x + width / 2;
      const cy = y + height / 2;
      return {
        path:
          `M ${fmt(cx)} ${fmt(y)} L ${fmt(x + width)} ${fmt(cy)} ` +
          `L ${fmt(cx)} ${fmt(y + height)} L ${fmt(x)} ${fmt(cy)} Z`,
      };
    }
    case "io": {
      // Parallelogram leaning right — the layout reserved `ioSkew` per side.
      const skew = 12;
      return {
        path:
          `M ${fmt(x + skew)} ${fmt(y)} H ${fmt(x + width)} ` +
          `L ${fmt(x + width - skew)} ${fmt(y + height)} H ${fmt(x)} Z`,
      };
    }
    case "call": {
      const inset = 6;
      return {
        rect: { rx: STEP_RADIUS },
        rails: [
          `M ${fmt(x + inset)} ${fmt(y)} V ${fmt(y + height)}`,
          `M ${fmt(x + width - inset)} ${fmt(y)} V ${fmt(y + height)}`,
        ],
      };
    }
    default:
      return { rect: { rx: STEP_RADIUS } };
  }
}

/**
 * An orthogonal polyline as a path with rounded corners. The radius shrinks
 * to half the shorter adjoining segment so a tight jog never overshoots —
 * the failure mode of a fixed radius is a little loop drawn at every corner
 * two lanes apart.
 */
export function roundedPolylinePath(
  points: readonly FlowPoint[],
  radius: number = EDGE_CORNER_RADIUS,
): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
  let d = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const corner = points[i];
    const next = points[i + 1];
    const inLen = Math.hypot(corner.x - prev.x, corner.y - prev.y);
    const outLen = Math.hypot(next.x - corner.x, next.y - corner.y);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    if (r < 0.5) {
      d += ` L ${fmt(corner.x)} ${fmt(corner.y)}`;
      continue;
    }
    const inX = corner.x - ((corner.x - prev.x) / inLen) * r;
    const inY = corner.y - ((corner.y - prev.y) / inLen) * r;
    const outX = corner.x + ((next.x - corner.x) / outLen) * r;
    const outY = corner.y + ((next.y - corner.y) / outLen) * r;
    d += ` L ${fmt(inX)} ${fmt(inY)} Q ${fmt(corner.x)} ${fmt(corner.y)} ${fmt(outX)} ${fmt(outY)}`;
  }
  const last = points[points.length - 1];
  d += ` L ${fmt(last.x)} ${fmt(last.y)}`;
  return d;
}

/**
 * A filled arrowhead at the polyline's end, oriented along its final
 * segment, at this canvas's weight. The geometry lives in `@/lib/arrowhead`
 * (one definition, shared with the use-case renderer's dependency head);
 * this wrapper only binds the flowchart's own dimensions.
 */
export function arrowHeadPath(points: readonly FlowPoint[]): string {
  return arrowheadPathAt(points, ARROW_LENGTH, ARROW_HALF_WIDTH);
}

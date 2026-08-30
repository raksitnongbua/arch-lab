import {
  diagramSurfaceBox,
  DIAGRAM_SURFACE_RADIUS,
} from "@/lib/diagram-surface";

/**
 * The sheet a canvas draws on, as an SVG element.
 *
 * Paints first, inside the `<svg>`, before anything else the canvas draws.
 * `--border` rules the area, because a drawn frame should use the hairline
 * every other rule in the app already uses. It used to be a filled `--node`
 * panel — see `@/lib/diagram-surface` for why that became a rule.
 *
 * THE WASH IS PAINTED BY EVERY THEME AND SHOWN BY ONE, exactly like the role
 * texture overlays: `--diagram-surface-opacity` is 0 in the baseline, so this
 * rect is `fill="none"` in effect everywhere except `blueprint`, whose
 * `--border` is quieter than its own ruling and therefore cannot mark the
 * document on its own. Both halves must be the TOKENS — a literal here is a
 * canvas that stops following the theme, and it is also a screen that stops
 * agreeing with the export, which resolves the same two tokens.
 *
 * THE GROUND DOES NOT GET A HOLE. That is the rule this treatment has always
 * followed: the drawing gets a background, and the well's ruled ground keeps
 * running underneath and around it. Clipping the ground so a drawing could sit
 * in a clearing would be the ground apologising for existing, and it would put
 * a hard edge on the sheet exactly where the drawing's own edge already is.
 * A translucent wash is not a hole and does not become one: it TONES the
 * sheet, and the ruling runs through it at whatever the theme left over.
 *
 * AND NEITHER IS A FROST, which has to be argued rather than asserted, because
 * at a large enough radius a blur approaches a clearing and would deserve the
 * objection. What makes a hole a hole is that the region REVERTS TO `--canvas`
 * — the ground taken away and replaced by nothing, plus a hard edge where the
 * drawing's edge already is. Three things say the frost is not that. Nothing is
 * knocked out: the ruling's ink is painted over every pixel of the area, and
 * the inside piece is low-pass filtered rather than removed. The filter is
 * mean-preserving, so the sheet's own tone continues through the region instead
 * of dropping back to the bare canvas. And at the radius `blueprint` asks for,
 * the ruling inside the area still reads 1.510:1 against 2.124:1 crisp — a
 * ghost of the ruling, but a visible one, so it literally still runs through.
 * The one crisp edge the construction makes falls exactly on this rect's own
 * 1px rule, which is the hole argument's own test: an edge that already exists.
 * What WOULD concede the point is a radius large enough to flatten the ruling
 * to its mean, and `check:canvas-grid` forbids that with a number rather than
 * leaving it to taste.
 *
 * The geometry — and the reason a surface must never sit on the drawing's own
 * bounds — is in `@/lib/diagram-surface`, shared with the exporters so a
 * downloaded file is framed the way the screen framed it.
 */
export function DiagramSurface({
  width,
  height,
}: {
  /** The DRAWING's size. The pad is added by `diagramSurfaceBox`. */
  width: number;
  height: number;
}): React.JSX.Element {
  const box = diagramSurfaceBox({ width, height });
  return (
    <rect
      x={box.x}
      y={box.y}
      width={box.width}
      height={box.height}
      rx={DIAGRAM_SURFACE_RADIUS}
      fill="var(--diagram-surface-fill)"
      fillOpacity="var(--diagram-surface-opacity)"
      stroke="var(--border)"
      strokeWidth={1}
    />
  );
}

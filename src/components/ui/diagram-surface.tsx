import {
  diagramSurfaceBox,
  DIAGRAM_SURFACE_RADIUS,
} from "@/lib/diagram-surface";

/**
 * The sheet a canvas draws on, as an SVG element.
 *
 * Paints first, inside the `<svg>`, before anything else the canvas draws.
 * `--border` on NO fill: the area is a drawn frame, so the only token it needs
 * is the one every hairline in the app already uses. It used to be a filled
 * `--node` panel — see `@/lib/diagram-surface` for why that became a rule.
 *
 * THE GROUND DOES NOT GET A HOLE. That is the rule this treatment has always
 * followed: the drawing gets a background, and the well's ruled ground keeps
 * running underneath and around it. Clipping the ground so a drawing could sit
 * in a clearing would be the ground apologising for existing, and it would put
 * a hard edge on the sheet exactly where the drawing's own edge already is.
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
      fill="none"
      stroke="var(--border)"
      strokeWidth={1}
    />
  );
}

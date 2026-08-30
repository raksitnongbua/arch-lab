import {
  diagramSurfaceBox,
  DIAGRAM_SURFACE_RADIUS,
} from "@/lib/diagram-surface";

/**
 * The sheet a canvas draws on, as an SVG element.
 *
 * Paints first, inside the `<svg>`, before anything else the canvas draws.
 * `--node` filled and `--node-border` ruled — the dictionary's panel, and the
 * pair every canvas here already uses for a shape against its background, so
 * it arrives measured in all nine themes. `@/lib/diagram-surface` carries the
 * full argument, the treatments this replaced, and the numbers.
 *
 * BOTH HALVES MUST BE THE TOKENS. A literal here is a canvas that stops
 * following the theme, and it is also a screen that stops agreeing with the
 * export, which resolves the same two properties through `ExportTheme`.
 * `check:canvas-grid` pins both sides.
 *
 * THIS IS A HOLE IN THE GROUND, and that is now the accepted answer rather
 * than the refused one. Earlier revisions of this component argued at length
 * that the well's ruled ground had to keep running under and around the
 * drawing, and that an opaque panel would be "the ground apologising for
 * existing". The panel is opaque in eight of the nine themes — `glass` alone
 * leaves `--node` at alpha 0.62 — so under it the ground genuinely stops. That
 * argument has been withdrawn on the merits: a document sits ON a desk, and
 * the desk showing through it was a principle no reader was getting off the
 * screen. What the objection was really protecting against is still guarded,
 * by a different assertion: no kind may knock `--canvas` out inside its own
 * drawing, because that is a clearing with no edge and no identity of its own.
 * A panel is a document; a `--canvas` rect is a missing sheet.
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
      fill="var(--node)"
      stroke="var(--node-border)"
      strokeWidth={1}
    />
  );
}

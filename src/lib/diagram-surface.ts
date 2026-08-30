/**
 * The sheet a drawing is presented ON — the geometry and the markup, shared by
 * every notation that has one.
 *
 * WHAT A SURFACE IS FOR. The canvas well paints a ground that fills the pane,
 * and a drawing sitting straight on it has no edge — nothing says where the
 * document stops and the desk starts.
 *
 * IT IS A RULE, NOT A PANEL, and that is the whole of this revision. It was a
 * filled `--node` box, which made the drawing area a second surface stacked on
 * the well and turned every theme into a hunt for two grounds that agree. The
 * area is now given by a LINE — a 1px border on no fill — so the well and the
 * drawing sit on one continuous ground and only the frame says where the
 * drawing lives. Paper and pencil rather than paper on a desk.
 *
 * WHY IT IS SHARED NOW. The gantt argued, in a comment this module replaces,
 * that it was the only kind that needed a surface: it is the one notation whose
 * own marks are a LATTICE — time ticks and section rules — and two lattices at
 * unrelated pitches beat against each other, where the timeline and the
 * lifecycle "draw a single rail rather than a field". That reasoning was sound
 * about BEATING and was never the whole case for a sheet. A spine on a ruled
 * ground does not beat, but it also does not read as a document, and the three
 * notations now look like one product rather than one exception and two
 * drawings on the wall. The rule is presentation, not interference.
 *
 * THE PAD IS THE POINT, and it is the bug this module carries forward the fix
 * for. A surface drawn at the drawing's own bounds is worse than no surface:
 * it puts a hard stroked edge exactly where the text is. The gantt shipped
 * that way — its section headings sit at x=0 and touched the border, on screen
 * and in every exported file — which is why the pad lives here, with the rect,
 * rather than being each caller's to remember.
 */

/**
 * Air between the drawing and the edge of its surface, in drawing units.
 *
 * ONE VALUE FOR EVERY NOTATION, unlike the export margins, which are per-kind
 * and disagree on purpose (C4 uses 56 for its title block, ER and gantt 40,
 * the dictionary 28). Those size the FILE around a drawing and answer to each
 * canvas's proportions. This one is the width of a visual gutter between text
 * and a border — the same question with the same answer everywhere, and three
 * copies of it would only be three chances to drift.
 *
 * It is spent out of each kind's existing frame pad rather than added to it,
 * so adopting a surface changes no sheet's size and no exported file's
 * dimensions. What is left over stays outside the panel, keeping its stroke
 * off the trim where a viewBox would clip half of it.
 */
export const DIAGRAM_SURFACE_PAD = 30;

/**
 * The surface as SVG markup, for the exporters.
 *
 * The colour arrives as a plain string rather than an `ExportTheme`: that type
 * belongs to the viewer feature, and a module in `lib/` that reached for it
 * would invert the layering for one hex value.
 *
 * `x`/`y` default to the drawing's origin, which is what a canvas component
 * wants; an exporter that has already translated its content by a margin
 * passes the offset it used minus the pad. Both callers get the same box
 * around the same drawing.
 */
export function diagramSurfaceMarkup({
  width,
  height,
  stroke,
  originX = 0,
  originY = 0,
}: {
  /** The DRAWING's size, not the sheet's — the pad is added here. */
  width: number;
  height: number;
  /** The rule's colour. There is no fill — see the header. */
  stroke: string;
  /** Where the drawing's own origin sits in the file's coordinates. */
  originX?: number;
  originY?: number;
}): string {
  const box = diagramSurfaceBox({ width, height, originX, originY });
  return (
    `<rect x="${box.x}" y="${box.y}" width="${box.width}" ` +
    `height="${box.height}" rx="${DIAGRAM_SURFACE_RADIUS}" fill="none" ` +
    `stroke="${stroke}" stroke-width="1"/>`
  );
}

/**
 * The surface's box around a drawing of `width` × `height`.
 *
 * The one place the pad is applied. Both the component and the markup builder
 * go through it, so a canvas and its exported file cannot frame one drawing
 * two different ways — the failure `check:gantt-layout` used to have to assert
 * against, back when each side carried its own literal.
 */
export function diagramSurfaceBox({
  width,
  height,
  originX = 0,
  originY = 0,
}: {
  width: number;
  height: number;
  originX?: number;
  originY?: number;
}): { x: number; y: number; width: number; height: number } {
  return {
    x: originX - DIAGRAM_SURFACE_PAD,
    y: originY - DIAGRAM_SURFACE_PAD,
    width: width + DIAGRAM_SURFACE_PAD * 2,
    height: height + DIAGRAM_SURFACE_PAD * 2,
  };
}

/**
 * Corner radius.
 *
 * 2, not the 12 this treatment started from. A surface that is a RULE rather
 * than a panel is a drawn frame, and a drawn frame has the cut corner a sheet
 * has — the same argument `paper` already makes for its own `--radius`, which
 * is this number.
 */
export const DIAGRAM_SURFACE_RADIUS = 2;

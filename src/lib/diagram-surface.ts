/**
 * The sheet a drawing is presented ON — the geometry and the markup, shared by
 * every notation that has one.
 *
 * WHAT A SURFACE IS FOR. The canvas well paints a ground that fills the pane,
 * and a drawing sitting straight on it has no edge — nothing says where the
 * document stops and the desk starts.
 *
 * IT IS A PANEL: `--node` filled, `--node-border` ruled. That pair is the whole
 * argument, and it is the dictionary's argument, carried here from
 * `features/dict/components/dict-diagram.tsx` where it has shipped for longer.
 * `--node` on `--canvas` is what every canvas in this app already uses for a
 * shape against its background, so it is ALREADY MEASURED in all nine themes —
 * which is why the surface is that pair rather than a hand-picked tint of the
 * canvas colour. A new tint is a new colour relationship nobody has checked; a
 * node is a relationship every theme was designed around.
 *
 * THE MARK IS THE RULE, NOT THE FILL, and the numbers say so plainly. The fill
 * lifts the area by only 1.03–1.14:1 against the canvas across the nine themes
 * — deliberately almost nothing, so the drawing's own ink keeps its budget.
 * What separates the document from the desk is `--node-border`, which reads
 * 2.65:1 (`pastel`) to 13.66:1 (`contrast`) on the canvas. The rule this panel
 * replaced was drawn in `--border`, which reads 1.18–1.86:1 in eight of the
 * nine: a hairline for chrome, not a mark that can carry a document's edge.
 * Swapping the stroke token is most of what changed here.
 *
 * AND YES, THIS IS A HOLE IN THE GROUND. The previous revisions of this module
 * asserted, twice and at length, that "the ground does not get a hole" — that
 * the well's ruling must keep running under and through the drawing, and that
 * anything opaque was a clearing the sheet had been made to apologise for. An
 * opaque `--node` panel is exactly that clearing. The claim is not being
 * finessed; it is being withdrawn. Presentation is the product
 * (`purpose.md`), the person whose product it is looked at the dictionary's
 * panel beside the toned sheet and preferred the panel, and "one continuous
 * ground" was a principle nobody was reading off the screen. A document sits
 * ON a desk. The desk does not need to show through it.
 *
 * WHAT WAS TRIED, in order, because the record is the useful part: an opaque
 * `--node` panel; then a 1px `--border` line and no fill, on the theory above;
 * then a translucent per-theme wash of the sheet's own ruling ink at 0.25,
 * raised to 0.4, then 0.6, then returned to 0.4; then a Gaussian FROST under
 * the area, blurring the well's ruling so it stopped beating against the
 * drawing's own strokes without spending any of the drawing's contrast. Each
 * step was a smaller correction than the last, which is the shape of a search
 * converging on the wrong thing. The panel was where it started.
 *
 * AND THE FROST IS WHY A BLUR CANNOT COME BACK HERE. It was the right
 * instrument for a real problem — on a drafting ground the ruling is a lattice
 * at an unrelated pitch to the bars, ticks and labels, which is interference in
 * exactly the band the drawing's 1–1.5px strokes occupy — and it was preferred
 * to more wash because a Gaussian is mean-preserving, so it cost the connectors
 * nothing. The panel solves that same problem by being OPAQUE: there is no
 * ruling left under the drawing to beat against it. Which also makes a blur of
 * what is underneath unobservable BY CONSTRUCTION, not by measurement — an
 * opaque fill in front of a filtered region shows none of it, in every theme
 * whose `--node` has alpha 1, on screen and in a file alike. The frost was
 * deleted for that reason rather than for being disliked. If the panel is ever
 * made translucent, the interference comes back and this is the instrument for
 * it; while the panel is opaque, a blur under it is a compositing layer, a
 * token, a component and a check section that no reader can ever see.
 *
 * `paper` GETS THE PANEL TOO, reversing its own earlier line-art exception —
 * chosen deliberately, in full knowledge that it reverses it. Note what is NOT
 * reversed: `paper`'s ROLE fills (`--node-person`, `--node-internal`,
 * `--flow-decision`, …) stay `transparent`, which is what `check:eink`,
 * `check:gantt-palette` and `check:flowchart-palette` derive "this is a
 * line-art theme" from. The surface is the sheet, not a shape in the drawing;
 * a line-art drawing on a sheet is still line art.
 *
 * WHY IT IS SHARED. The gantt argued, in a comment this module replaces,
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
 * The colours arrive as plain strings rather than an `ExportTheme`: that type
 * belongs to the viewer feature, and a module in `lib/` that reached for it
 * would invert the layering for two resolved values.
 *
 * BOTH ARE REQUIRED, with no default and no zero case. The wash this replaced
 * had an emit-nothing-at-zero contract so that eight themes' downloaded files
 * stayed byte-identical while one theme opted in; there is no opt-in any more,
 * every theme paints the panel, and an optional fill would only be a way for
 * one exporter to quietly ship an unfilled surface. Exports in every theme
 * change appearance with this — that is the intent, and the changelog says so.
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
  fill,
  originX = 0,
  originY = 0,
}: {
  /** The DRAWING's size, not the sheet's — the pad is added here. */
  width: number;
  height: number;
  /** The rule's colour — `--node-border`, resolved. */
  stroke: string;
  /** The panel's colour — `--node`, resolved. */
  fill: string;
  /** Where the drawing's own origin sits in the file's coordinates. */
  originX?: number;
  originY?: number;
}): string {
  const box = diagramSurfaceBox({ width, height, originX, originY });
  return (
    `<rect x="${box.x}" y="${box.y}" width="${box.width}" ` +
    `height="${box.height}" rx="${DIAGRAM_SURFACE_RADIUS}" fill="${fill}" ` +
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
 * Corner radius for a diagram panel, in drawing units.
 *
 * 10 — the dictionary's number, and the reason this constant is exported to it
 * rather than being a third copy. A radius of 2 belongs to a drawn frame, which
 * is what the line-only surface was; a PANEL is a card, and a card's corner is
 * the one the dictionary's section tables have always had. Matching it is the
 * point: the three surface notations and the dictionary now cut the same
 * corner, so a reader moving between them sees one product rather than two
 * conventions.
 *
 * THREE RENDITIONS READ THIS, and `check:canvas-grid` pins each: the shared
 * `<rect>` on screen, the three exporters' markup, and the dictionary's own
 * per-section panel. It was two hand-typed `10`s and a `2` before.
 */
export const DIAGRAM_SURFACE_RADIUS = 10;

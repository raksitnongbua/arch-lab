"use client";

import {
  diagramSurfaceBox,
  DIAGRAM_SURFACE_RADIUS,
} from "@/lib/diagram-surface";

/**
 * The frost behind a drawing: the well's ruling, quieted where the document
 * sits, without any of it being taken away.
 *
 * WHY THIS EXISTS AT ALL — and it is the half of the surface problem the wash
 * cannot reach. `blueprint` rules its well at full strength on purpose, and a
 * drafting lattice crossing every bar, tick and label at an unrelated pitch is
 * high-frequency interference in exactly the band the drawing's own 1–1.5px
 * strokes occupy. Raising `--diagram-surface-opacity` attenuates that only as a
 * side effect — at α the lattice still runs at (1−α) — and every increment is
 * charged to the connectors, which is the wall the wash actually hit. A blur is
 * mean-preserving: it takes the interference out and spends none of the
 * drawing's contrast budget. Two failures, two knobs; `lib/diagram-surface.ts`
 * has the full argument and `globals.css` has the measured σ.
 *
 * IT WRAPS THE DRAWING RATHER THAN BEING DRAWN BY IT. `backdrop-filter` is
 * defined for CSS boxes and no engine applies it to an SVG graphics element, so
 * the frost cannot ride the surface `<rect>` the canvas already draws — it has
 * to be a DOM element sitting behind the `<svg>`. Wrapping is what lets the
 * three hosts mount it identically: `dry.md` would have three viewers each
 * hand-deriving the same four percentages otherwise.
 *
 * THE GEOMETRY IS NOT A SECOND ANSWER. The box comes from `diagramSurfaceBox`,
 * the same function the on-screen `<rect>` and every exported file go through,
 * converted to percentages of the drawing's laid-out size. Percentages are the
 * whole trick: these three notations have no pan-and-zoom camera — the `<svg>`
 * is drawn at natural size and shrunk by `max-width: 100%` — so a box stated as
 * a fraction of the drawing tracks any shrink with no measurement and nothing
 * to keep in sync. `check:canvas-grid` pins this component to that function.
 *
 * MOUNTED BY NINE THEMES, VISIBLE IN ONE. The filter property lives only under
 * `.blueprint` (a backdrop filter promotes a compositing layer whether or not
 * the blur is visible), so in the other eight this is an empty positioned
 * `<div>` — the same paint-always/show-by-token contract as the wash.
 */
export function DiagramFrost({
  ref,
  width,
  height,
  framePad,
  scale = 1,
  children,
}: {
  ref?: React.Ref<HTMLDivElement>;
  /** The DRAWING's size, as the surface's own geometry takes it. */
  width: number;
  height: number;
  /**
   * The kind's frame pad, in drawing units — the air the `<svg>`'s viewBox
   * holds around the drawing. Needed because the percentages are of the SHEET
   * the viewBox describes, not of the drawing inside it.
   */
  framePad: number;
  /**
   * The shrink the viewer measured, 0…1, published as
   * `--diagram-surface-blur-scale`. The blur radius is stated against the
   * ground's pitch at scale 1, and a shrunk pane shrinks that pitch, so an
   * unscaled radius would over-blur the narrowest panes. Defaults to 1, which
   * is the server-rendered first frame.
   */
  scale?: number;
  children: React.ReactNode;
}): React.JSX.Element {
  const box = diagramSurfaceBox({ width, height });
  const sheetWidth = width + framePad * 2;
  const sheetHeight = height + framePad * 2;
  const percent = (value: number, of: number): string =>
    `${((value / of) * 100).toFixed(4)}%`;
  return (
    <div
      ref={ref}
      className="af-diagram-frost-frame"
      style={{ "--diagram-surface-blur-scale": scale } as React.CSSProperties}
    >
      <div
        className="af-diagram-frost"
        style={{
          left: percent(box.x + framePad, sheetWidth),
          top: percent(box.y + framePad, sheetHeight),
          width: percent(box.width, sheetWidth),
          height: percent(box.height, sheetHeight),
          /* THE ONE PLACE THE RADIUS CHANGES UNITS. Everywhere else
             `DIAGRAM_SURFACE_RADIUS` is drawing units; here it is CSS px, and
             the two differ by the shrink. At radius 2 under a cap that only
             ever shrinks, the worst case is a sub-pixel disagreement on a
             corner — cheaper to state than to engineer a scaled radius for. */
          borderRadius: DIAGRAM_SURFACE_RADIUS,
        }}
      />
      {children}
    </div>
  );
}

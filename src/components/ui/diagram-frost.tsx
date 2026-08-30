"use client";

import {
  diagramSurfaceBox,
  DIAGRAM_SURFACE_RADIUS,
} from "@/lib/diagram-surface";

/**
 * The frost behind a drawing: the well's ruling, quieted where the document
 * sits, without any of it being taken away.
 *
 * IT IS CURRENTLY INERT, AND THAT IS NOT A BUG IN IT. This component was the
 * answer to interference — `blueprint` rules its well at full strength on
 * purpose, and a drafting lattice crossing every bar, tick and label at an
 * unrelated pitch is high-frequency noise in exactly the band the drawing's own
 * 1–1.5px strokes occupy. A blur is mean-preserving, so it took that noise out
 * and spent none of the drawing's contrast budget, which is what the toned
 * sheet it accompanied could not do. The surface has since become an OPAQUE
 * `--node` panel (`lib/diagram-surface.ts` has that decision and its history),
 * and an opaque panel removes the interference completely by removing the
 * ruling. This frost sits UNDER that panel, so in `blueprint` — the only theme
 * that asks for a σ — nothing it does is visible.
 *
 * SO IT IS KEPT, NOT DELETED, PENDING A DECISION, and the decision is one
 * sentence: if the panel stays, this whole component, its CSS block, its
 * `--diagram-surface-blur` token, `frostedGroundMarkup`, and the frost section
 * of `check:canvas-grid` should all go, because none of them can be seen. It
 * was left standing rather than removed in the same pass that made it inert, so
 * that reversing the panel does not also mean rebuilding this.
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
 * MOUNTED BY NINE THEMES, DECLARED IN ONE. The filter property lives only
 * under `.blueprint` (a backdrop filter promotes a compositing layer whether or
 * not the blur is visible), so in the other eight this is an empty positioned
 * `<div>` — the paint-always/show-by-token contract the role textures carry.
 * With the panel above it, even the one theme that declares it shows nothing:
 * the cost is a promoted layer for no picture, which is the strongest argument
 * in the paragraph above for deciding rather than leaving this.
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
             the two differ by the shrink. The worst case is a few pixels of
             disagreement on a corner of a region that the panel now covers
             entirely — cheaper to state than to engineer a scaled radius for. */
          borderRadius: DIAGRAM_SURFACE_RADIUS,
        }}
      />
      {children}
    </div>
  );
}

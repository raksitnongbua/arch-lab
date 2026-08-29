/**
 * THE WELL — the ground a diagram is drawn on, in one place.
 *
 * `globals.css` calls `--canvas` "the diagram well, deliberately below the
 * chrome": every theme sits it ΔL 0.010 under `--background` so the drawing
 * reads as recessed into the page rather than printed on it. That is a
 * PRESENTATION decision (`purpose.md`), and it was being made nine times.
 *
 * It drifted, exactly the way a nine-way decision does. The sequence, flowchart
 * and use-case viewers painted `bg-canvas` on their own scroll box; ER, the
 * dictionary, the gantt, the timeline and the lifecycle painted nothing and
 * showed the playground pane's `bg-background` through; the two C4 canvases got
 * it from React Flow's own class. So the ground behind a diagram changed shade
 * when the reader changed notation — in every theme, and most visibly in
 * immersive mode, where the well is the whole screen.
 *
 * The fix is not "paint it in the other six too": that is the same mistake with
 * a bigger blast radius, and the tenth notation forgets it again. The well is
 * painted by the HOST that owns the pane — the playground's diagram section,
 * the C4 shell's canvas region, and `DiagramWell` under every example page —
 * and no viewer paints its own. A canvas that arrives tomorrow lands on the
 * right ground by doing nothing at all.
 *
 * `check:canvas-chrome` pins that, over the kind table in
 * `playground/lib/kind-copy.ts` rather than over a list typed into the script.
 *
 * THE WELL NOW OWNS THE GROUND'S TEXTURE TOO, not just its colour, and that
 * REVERSES the arrangement the field shipped with. The field used to be painted
 * inside each drawing — an SVG `<pattern>` in the diagram's own user units for
 * the seven plain-SVG kinds, React Flow `<Background>` layers for the two C4
 * hosts — on the argument that a ground fixed to the pane "detaches" when the
 * drawing pans. The cost was that the ground SCALED WITH THE ZOOM: zoom out and
 * the ground shrank with the drawing, which is what readers reported.
 *
 * The old argument holds for a ground pretending to be part of the drawing. It
 * does not hold for a SHEET. Ruling printed on paper does not grow when you
 * scale the drawing up, and the paper on a desk does not slide when the pencil
 * moves. So the ground is fixed to the PANE — unaffected by zoom and by pan —
 * and the pane is this. `globals.css` carries `.af-canvas-sheet` and the
 * per-theme textures; `check:canvas-grid` computes the on-screen tile pitch at
 * two zoom levels and fails if they differ.
 */

import { cn } from "@/lib/utils";

/**
 * The well's ground — its colour AND its sheet, which is one class pair rather
 * than two decisions because a host that remembers one and forgets the other is
 * exactly the drift this file exists to stop. A class rather than a component
 * wherever the host already has a wrapper of its own to hang it on — see
 * `view-playground.tsx` and `viewer-shell.tsx`, which both have panes with
 * layout to keep.
 *
 * IT MUST GO ON THE ELEMENT THE CAMERA HANGS UNDER, never on one inside it. The
 * zoom lives on a descendant in every host (the `<svg>`'s transform, React
 * Flow's viewport `<div>`), so nothing between this background and the screen is
 * scaled or translated — which is the whole mechanism by which the sheet stays
 * put.
 */
export const DIAGRAM_WELL_CLASSES = "bg-canvas af-canvas-sheet";

/**
 * The pane an example page hands its whole remaining height to.
 *
 * All eight non-C4 example views wrapped their viewer in the same
 * `flex min-h-0 flex-1 flex-col` div; that div is this component, so the well
 * is added once instead of eight times. No `"use client"`: half its callers are
 * server components (`GanttExampleView`), and this adds no state.
 */
export function DiagramWell({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col",
        DIAGRAM_WELL_CLASSES,
        className,
      )}
    >
      {children}
    </div>
  );
}

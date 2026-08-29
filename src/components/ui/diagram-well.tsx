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
 */

import { cn } from "@/lib/utils";

/**
 * The well's ground. A class rather than a component wherever the host already
 * has a wrapper of its own to hang it on — see `view-playground.tsx` and
 * `viewer-shell.tsx`, which both have panes with layout to keep.
 */
export const DIAGRAM_WELL_CLASSES = "bg-canvas";

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

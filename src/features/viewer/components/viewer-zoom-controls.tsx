"use client";

/**
 * Canvas overlay (bottom-left): the two camera controls the viewer owns.
 *
 *  - Fit view — recentres and rescales the current diagram to fill the
 *    canvas, with the same padding every automatic fit uses. Animated with
 *    the shared `fitView` duration; under `prefers-reduced-motion`,
 *    `duration()` returns 0 and React Flow snaps instead of animating.
 *  - Zoom readout — the live percentage straight from the React Flow
 *    viewport (`useViewport` re-renders on every zoom change, so it tracks
 *    wheel, pinch, fit and programmatic zooms alike). Clicking it resets
 *    zoom to exactly 100%, same reduced-motion contract.
 *
 * Visual language mirrors the editor's bottom-left ZoomIndicator and the
 * viewer toolbar's pill clusters. Mounted inside the React Flow tree
 * (Panel), so it rides along into immersive and native-fullscreen modes.
 */

import { Scan } from "lucide-react";
import { useReactFlow, useViewport } from "@xyflow/react";

import { duration } from "@/features/editor/lib/motion";

import { FIT_PADDING } from "../lib/canvas-constants";

export function ViewerZoomControls(): React.JSX.Element {
  const { fitView, zoomTo } = useReactFlow();
  const { zoom } = useViewport();
  const percent = Math.round(zoom * 100);

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border/70 bg-card/80 p-1 shadow-sm backdrop-blur">
      <button
        type="button"
        onClick={() => {
          void fitView({ padding: FIT_PADDING, duration: duration("fitView") });
        }}
        aria-label="Fit diagram to view"
        title="Fit diagram to view"
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Scan aria-hidden="true" className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => {
          void zoomTo(1, { duration: duration("fitView") });
        }}
        aria-label={`Zoom ${percent} percent — reset to 100 percent`}
        title="Reset zoom to 100%"
        className="min-w-11 rounded-md px-1.5 py-1 text-center text-xs font-medium text-muted-foreground tabular-nums transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {percent}%
      </button>
    </div>
  );
}

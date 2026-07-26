"use client";

/**
 * Zoom indicator (AF-E1-S1). Owned by T1-B; mounted by `canvas.tsx` in the
 * bottom-left panel. Shows the current zoom percentage; clicking resets to
 * 100% (animated, reduced-motion aware).
 */

import { useReactFlow, useViewport } from "@xyflow/react";

import { duration } from "../lib/motion";

export function ZoomIndicator(): React.JSX.Element {
  const { zoom } = useViewport();
  const { zoomTo } = useReactFlow();
  const percent = Math.round(zoom * 100);

  return (
    <button
      type="button"
      title="Reset zoom to 100%"
      aria-label={`Zoom ${percent} percent — reset to 100 percent`}
      className="rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-muted-foreground tabular-nums shadow-sm transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      onClick={() => {
        void zoomTo(1, { duration: duration("fitView") });
      }}
    >
      {percent}%
    </button>
  );
}

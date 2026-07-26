"use client";

/**
 * STUB — ownership transfers to T2-C in Batch 2 (AF-E2-S2 "Drill into" from
 * the context menu).
 *
 * Contract (dev-handoff §4.4): props-free, mounted by `canvas.tsx`, reads its
 * state itself. `canvas.tsx` publishes right-clicked nodes to
 * `useCanvasInteraction` (exported from `../canvas`); the real implementation
 * reads `contextMenu` from there and renders the menu at its screen position.
 */

export function NodeContextMenu(): React.JSX.Element | null {
  return null;
}

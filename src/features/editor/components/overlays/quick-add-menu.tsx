"use client";

/**
 * STUB — ownership transfers to T2-B in Batch 2 (AF-E1-S5 quick-add).
 *
 * Contract (dev-handoff §4.4): props-free, mounted by `canvas.tsx` inside the
 * React Flow children, reads its state itself. When an edge drag is released
 * over empty canvas, `canvas.tsx` publishes the pending connection to
 * `useCanvasInteraction` (exported from `../canvas`) — this component's real
 * implementation reads `pendingConnect` from there, offers level-valid node
 * types, and creates node + edge in ONE `transact()` entry.
 */

export function QuickAddMenu(): React.JSX.Element | null {
  return null;
}

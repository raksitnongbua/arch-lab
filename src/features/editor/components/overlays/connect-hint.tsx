"use client";

/**
 * The "you can let go anywhere" hint, shown only while a connection drag is in
 * flight.
 *
 * The empty-canvas drop has worked all along (`canvas.tsx` → `handleConnectEnd`
 * → `QuickAddMenu`), but nothing ever said so. Users dragged a connector,
 * found no node to land on, and cancelled — so the feature was invisible
 * rather than missing. This is the smallest thing that fixes that: a hint that
 * appears exactly when the knowledge is actionable and disappears the instant
 * it is not.
 *
 * Props-free, like the other overlays in this folder (§4.4). State comes from
 * React Flow's own `useConnection`, not from a new seam — the canvas already
 * knows it is connecting, so duplicating that into the store would be a second
 * source of truth for one boolean.
 *
 * `inProgress` is the whole subscription: selecting the boolean rather than the
 * connection object means this does NOT re-render on every pointer move.
 */

import { Panel, useConnection } from "@xyflow/react";

export function ConnectHint(): React.JSX.Element | null {
  const connecting = useConnection((connection) => connection.inProgress);
  if (!connecting) return null;

  return (
    // `Panel` is how this canvas positions overlays (see the zoom indicator);
    // hand-rolled absolute positioning would depend on React Flow's internal
    // DOM staying put.
    <Panel position="top-center" className="pointer-events-none">
      <span
        // Announced politely: a screen-reader user dragging a connector wants
        // the same tip, but it must not interrupt.
        role="status"
        aria-live="polite"
        className="block rounded-full border border-border bg-popover/95 px-3 py-1.5 text-xs text-popover-foreground shadow-md backdrop-blur"
      >
        Release on another element to connect — or on empty canvas to add a new
        one
      </span>
    </Panel>
  );
}

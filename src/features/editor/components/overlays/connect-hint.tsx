"use client";

/**
 * What will happen if you let go right now — shown while a connection drag is
 * in flight, and announced to screen readers.
 *
 * This began as one fixed sentence ("release on another element to connect, or
 * on empty canvas to add a new one"). That told you what was POSSIBLE, never
 * what was about to happen where the pointer actually was — and it was wrong
 * about the first half, because releasing on a node's body did not connect at
 * all. Now the caption is the verdict, from the same
 * `lib/connect-verdict.ts` table the preview line and the drop halo read, so
 * the three cannot disagree.
 *
 * The visible caption and the announcement are ONE string. They were two, and
 * they drifted.
 *
 * Props-free, like the other overlays in this folder (§4.4). State comes from
 * React Flow's own `useConnection`, not a new store seam — the canvas already
 * knows it is connecting, and duplicating that would be a second source of
 * truth for one boolean.
 *
 * Re-render discipline: the subscription selects a STRING (the target node id,
 * or the empty string), not the connection object. So this re-renders when the
 * target changes and at no other time — never per pointer move — which is also
 * what keeps the live region from chattering.
 */

import { useEffect } from "react";
import { Panel, useConnection } from "@xyflow/react";

import { useEditorStore } from "../../state";
import { captionFor, verdictFor } from "../../lib/connect-verdict";

/**
 * Marks the document while a connection is in flight, so CSS can suppress
 * things that would eat the drop — currently every relate-grip (see
 * `canvas-motion.css`). An attribute on `<html>` rather than prop-drilling
 * through every node: the same approach `canvas-motion-runtime.ts` already
 * takes, and it reaches nodes this component does not render.
 */
function useConnectingFlag(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    root.setAttribute("data-af-connecting", "");
    return () => root.removeAttribute("data-af-connecting");
  }, [active]);
}

export function ConnectHint(): React.JSX.Element | null {
  const fromId = useConnection((connection) =>
    connection.inProgress ? (connection.fromNode?.id ?? "") : null,
  );
  const toId = useConnection((connection) =>
    connection.inProgress ? (connection.toNode?.id ?? "") : "",
  );
  const diagram = useEditorStore((s) => s.model.diagrams[s.activeDiagramId]);

  useConnectingFlag(fromId !== null);

  if (fromId === null || fromId === "" || diagram === undefined) return null;

  const nameOf = (id: string): string =>
    diagram.nodes.find((node) => node.id === id)?.name ?? "this element";

  const verdict = verdictFor({
    sourceNodeId: fromId,
    targetNodeId: toId === "" ? null : toId,
    diagram,
  });
  const caption = captionFor(
    verdict,
    nameOf(fromId),
    toId === "" ? null : nameOf(toId),
  );

  return (
    // `Panel` is how this canvas positions overlays (see the zoom indicator);
    // hand-rolled absolute positioning would depend on React Flow's internal
    // DOM staying put.
    <Panel position="top-center" className="pointer-events-none">
      <span
        // Announced politely: a screen-reader user dragging a connector needs
        // the same verdict, but it must not interrupt.
        role="status"
        aria-live="polite"
        // No colour on the chip itself. The verdict is already carried by the
        // line and the halo; tinting a third surface per state turns a hint
        // into a traffic light and makes the canvas flash on every pass over a
        // gap. The chip's job is the words.
        className="block rounded-full border border-border bg-popover/95 px-3 py-1.5 text-xs text-popover-foreground shadow-md backdrop-blur"
      >
        {caption}
      </span>
    </Panel>
  );
}

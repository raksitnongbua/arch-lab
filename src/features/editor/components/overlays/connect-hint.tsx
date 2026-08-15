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
 * Props-free, like the other overlays in this folder. State comes from
 * React Flow's own `useConnection`, not a new store seam — the canvas already
 * knows it is connecting, and duplicating that would be a second source of
 * truth for one boolean.
 *
 * Re-render discipline: the subscription selects a STRING (the target node id,
 * or the empty string), not the connection object. So this re-renders when the
 * target changes and at no other time — never per pointer move — which is also
 * what keeps the live region from chattering.
 */

import { useCallback, useEffect } from "react";
import {
  Panel,
  useConnection,
  useStore as useReactFlowStore,
  useStoreApi as useReactFlowStoreApi,
} from "@xyflow/react";

import { useEditorStore } from "../../state";
import { captionFor, verdictFor } from "../../lib/connect-verdict";

/**
 * Disarms click-to-connect on the next pointer-down that is not on a handle.
 *
 * The armed mode is a popover-shaped thing — it persists until dismissed — so
 * it gets a popover's dismissal: click outside, and it closes. React Flow
 * clears it only on a second handle click, and `onPaneClick` cannot stand in
 * because `selectionOnDrag` makes the Pane swallow its own click event
 * (`selectionInProgress` short-circuits the handler before `onPaneClick` runs).
 * A capture-phase listener sidesteps all of that and covers clicks on the pane,
 * the palette, the inspector and the chrome alike.
 *
 * The handle exemption is load-bearing: React Flow completes the connection on
 * the target's `click`, which fires AFTER this `pointerdown`. Disarming here
 * without the exemption would cancel the mode a fraction of a second before the
 * thing it exists to do.
 */
function useClickConnectDismiss(armed: boolean, disarm: () => void): void {
  useEffect(() => {
    if (!armed) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(".react-flow__handle") !== null
      ) {
        return;
      }
      disarm();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true);
  }, [armed, disarm]);
}

/**
 * Marks the document while a connection is in flight, so CSS can suppress
 * things that would eat the drop — every relate-grip, and the node content that
 * would otherwise sit above the drop target (see `canvas-motion.css`). An
 * attribute on `<html>` rather than prop-drilling through every node: the same
 * approach `canvas-motion-runtime.ts` already takes, and it reaches nodes this
 * component does not render.
 */
function useConnectingFlag({
  active,
  armedByClick,
}: {
  active: boolean;
  armedByClick: boolean;
}): void {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    root.setAttribute("data-af-connecting", "");
    // A second flag for the click route only. During a DRAG the pointer is
    // already down and React Flow marks the hovered target itself; while merely
    // ARMED there is no pointer gesture at all, so the "which element will this
    // land on" affordance has to come from plain :hover — and that must not
    // apply during a drag, where hovering a node you are not dragging over
    // would light it up wrongly.
    if (armedByClick) root.setAttribute("data-af-click-connecting", "");
    return () => {
      root.removeAttribute("data-af-connecting");
      root.removeAttribute("data-af-click-connecting");
    };
  }, [active, armedByClick]);
}

export function ConnectHint(): React.JSX.Element | null {
  const draggingFromId = useConnection((connection) =>
    connection.inProgress ? (connection.fromNode?.id ?? "") : null,
  );
  const toId = useConnection((connection) =>
    connection.inProgress ? (connection.toNode?.id ?? "") : "",
  );
  /*
   * Click-to-connect is armed. This lives in a DIFFERENT React Flow field from
   * the drag: `useConnection().inProgress` stays false for the whole
   * click-armed mode, which is precisely why React Flow's own version showed no
   * feedback at all. Reading the field directly is what lets both routes share
   * one caption, one halo and one set of escape hatches.
   */
  const clickFromId = useReactFlowStore(
    (state) => state.connectionClickStartHandle?.nodeId ?? null,
  );
  const diagram = useEditorStore((s) => s.model.diagrams[s.activeDiagramId]);

  const fromId = draggingFromId !== null ? draggingFromId : clickFromId;
  const isArmedByClick = draggingFromId === null && clickFromId !== null;

  const flowStore = useReactFlowStoreApi();
  const disarm = useCallback(() => {
    flowStore.setState({ connectionClickStartHandle: null });
  }, [flowStore]);

  useConnectingFlag({
    active: fromId !== null && fromId !== "",
    armedByClick: isArmedByClick,
  });
  useClickConnectDismiss(isArmedByClick, disarm);

  if (fromId === null || fromId === "" || diagram === undefined) return null;

  const nameOf = (id: string): string =>
    diagram.nodes.find((node) => node.id === id)?.name ?? "this element";

  const verdict = verdictFor({
    sourceNodeId: fromId,
    targetNodeId: toId === "" ? null : toId,
    diagram,
  });
  // While armed by click there is no target yet — the caption has to say what
  // the NEXT click will do, not what a release would.
  const caption = isArmedByClick
    ? `Click an element to relate it to ${nameOf(fromId)} — Esc to cancel`
    : captionFor(verdict, nameOf(fromId), toId === "" ? null : nameOf(toId));

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

"use client";

/**
 * Drag-to-relate grip — the node's bottom-right corner control.
 *
 * Drag it and release where the new element should sit; a ghost previews that
 * spot. Click it instead and the element lands to the node's right. Either way
 * the release opens the quick-add menu, so you pick the type and get a node
 * plus the relationship in one gesture.
 *
 * This does not duplicate the connection handles. Handles connect to something
 * that already exists (handle → handle); this grip is the "and then it talks
 * to a NEW thing" path, which is the more common move while sketching, and it
 * previously required knowing that you could drag a connector into empty space
 * and release.
 *
 * It routes through `setPendingConnect` — the same seam `canvas.tsx` fills from
 * `onConnectEnd` when a connector is dropped on blank canvas. So the rules for
 * which types are offerable, and the creation of the node+edge pair, live in
 * exactly one place; this control only chooses *where*.
 *
 * ONE exception, and it is the important one: released over an EXISTING
 * element, this relates the two instead of creating anything. The gesture that
 * started it does not decide the outcome — where it ends does. Before that,
 * aiming the grip at a neighbour dropped a new node on top of it, which is the
 * same silent wrong outcome the full-bleed body handle fixes on the connection
 * dots' side.
 *
 * The drag is hand-rolled rather than routed through React Flow: React Flow
 * drags EXISTING nodes, and the target here does not exist yet. `nodrag` is
 * what stops the parent node being dragged out from under the gesture —
 * `stopPropagation` alone is not enough, since React Flow also listens on the
 * pane.
 *
 * Geometry: the ghost's top-left is pinned to `cursor − (node size × zoom)`.
 * The grip sits at the node's bottom-right, so the cursor starts exactly
 * `(width, height)` ahead of the node origin in flow space; subtracting it back
 * puts the ghost precisely where the new node will be created.
 *
 * The import from `../canvas` closes a cycle (canvas → c4-node → node-chrome →
 * here → canvas). That is the established pattern for this seam —
 * `overlays/node-context-menu.tsx` imports `setContextMenu` the same way — and
 * it is safe because the reference is resolved when the pointer is released,
 * never during module initialisation.
 */

import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useReactFlow } from "@xyflow/react";
import { ArrowUpRight } from "lucide-react";

import { toast } from "@/components/ui/toast";
import type { C4Node, Point } from "@/types";

import { GRID_SIZE, DEFAULT_NODE_SIZE } from "../../lib/canvas-constants";
import { setPendingConnect } from "../canvas";
import { useEditorStore } from "../../state";

/**
 * Below this drag distance (flow units) the gesture counts as a CLICK, and the
 * new element goes to the node's right instead of under the cursor. Without it
 * a plain click would stack the new node on top of its source.
 */
const RELATE_DRAG_THRESHOLD = GRID_SIZE;

/** Gap between source and target on a click (not a drag). */
const RELATE_GAP = 64;

interface GhostRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface RelateGripProps {
  node: C4Node;
}

export function RelateGrip({ node }: RelateGripProps): React.JSX.Element {
  const { screenToFlowPosition, flowToScreenPosition, getZoom } =
    useReactFlow();
  const [ghost, setGhost] = useState<GhostRect | null>(null);
  const startFlowRef = useRef<Point | null>(null);

  const ghostAt = useCallback(
    (clientX: number, clientY: number): GhostRect => {
      const zoom = getZoom();
      const width = DEFAULT_NODE_SIZE.width * zoom;
      const height = DEFAULT_NODE_SIZE.height * zoom;
      return { left: clientX - width, top: clientY - height, width, height };
    },
    [getZoom],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      startFlowRef.current = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      setGhost(ghostAt(event.clientX, event.clientY));
    },
    [ghostAt, screenToFlowPosition],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (startFlowRef.current === null) return;
      setGhost(ghostAt(event.clientX, event.clientY));
    },
    [ghostAt],
  );

  const finish = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const start = startFlowRef.current;
      startFlowRef.current = null;
      setGhost(null);
      if (start === null) return;

      const released = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const moved =
        Math.hypot(released.x - start.x, released.y - start.y) >=
        RELATE_DRAG_THRESHOLD;

      // Released ON an existing element? Then the gesture meant "relate these
      // two", whatever control started it. Without this the grip dropped a
      // brand-new node on top of the one being aimed at — the same wrong
      // outcome the full-bleed body handle fixes for the connection dots,
      // reached by the other route. The two gestures converge here rather than
      // each owning a copy of the rule.
      const store = useEditorStore.getState();
      const diagram = store.model.diagrams[store.activeDiagramId];
      const hit = diagram?.nodes.find(
        (candidate) =>
          candidate.id !== node.id &&
          released.x >= candidate.position.x &&
          released.x <= candidate.position.x + candidate.size.width &&
          released.y >= candidate.position.y &&
          released.y <= candidate.position.y + candidate.size.height,
      );
      if (moved && hit !== undefined) {
        try {
          const edgeId = store.createEdge({
            diagramId: store.activeDiagramId,
            source: node.id,
            target: hit.id,
          });
          store.setSelection({ nodeIds: [], edgeIds: [edgeId] });
          store.beginLabelEdit({ kind: "edge", id: edgeId });
        } catch (error) {
          toast({
            message:
              error instanceof Error
                ? error.message
                : "Could not create the relationship.",
            tone: "warning",
          });
        }
        return;
      }

      // A drag places the new element where the ghost was; a click puts it to
      // the right, reading order for a left-to-right relationship.
      const flowPosition: Point = moved
        ? {
            x: released.x - DEFAULT_NODE_SIZE.width,
            y: released.y - DEFAULT_NODE_SIZE.height,
          }
        : {
            x: node.position.x + node.size.width + RELATE_GAP,
            y: node.position.y,
          };

      // The menu opens at the new node's spot, so the choice appears where the
      // result will be — not back at the grip.
      const screen = flowToScreenPosition(flowPosition);
      setPendingConnect({
        sourceNodeId: node.id,
        flowPosition,
        screenPosition: { x: screen.x, y: screen.y },
      });
    },
    [
      flowToScreenPosition,
      node.id,
      node.position.x,
      node.position.y,
      node.size.width,
      screenToFlowPosition,
    ],
  );

  const handlePointerCancel = useCallback(() => {
    startFlowRef.current = null;
    setGhost(null);
  }, []);

  return (
    <>
      <button
        type="button"
        // `nodrag` keeps React Flow from dragging the parent node instead.
        // `af-relate-grip` is the hook canvas-motion.css uses to hide this
        // while a CONNECTION drag is in flight — otherwise a neighbour's grip
        // sits above its own node under the pointer and eats the drop.
        //
        // Accents to `--accent`, not `--primary`. The four connection dots own
        // primary and mean "attach to something that EXISTS"; this grip means
        // "make something NEW". They live a few dozen pixels apart on the same
        // node edge, so sharing an accent colour made two different outcomes
        // look like one control.
        className="af-relate-grip nodrag absolute -right-2 -bottom-2 z-[3] flex size-5 cursor-crosshair items-center justify-center rounded-full border border-node-border bg-node text-muted-foreground opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100 hover:border-accent hover:text-accent focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none"
        // Leads with the OUTCOME. The old title said "Drag to relate", which
        // is what the connection dots do — the one label on the node described
        // the neighbouring control's job.
        aria-label={`Add a NEW element related to ${node.name} — drag to place it, or click to put it alongside`}
        title="Drag out to add a new element"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finish}
        onPointerCancel={handlePointerCancel}
        // Never a drill target: this must not open the node.
        onDoubleClick={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <ArrowUpRight aria-hidden="true" className="size-3" />
      </button>
      {ghost !== null
        ? createPortal(
            <div
              aria-hidden="true"
              // Dashed + accent: the same language the connection preview uses for
              // its `create` verdict (lib/connect-verdict.ts), so "dashed accent
              // means something that does not exist yet" holds across both routes.
              className="pointer-events-none fixed z-50 rounded-lg border-2 border-dashed border-accent/70 bg-accent/5"
              style={{
                left: ghost.left,
                top: ghost.top,
                width: ghost.width,
                height: ghost.height,
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}

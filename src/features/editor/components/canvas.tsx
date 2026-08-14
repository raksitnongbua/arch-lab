"use client";

/**
 * The canvas (AF-E1-S1/S3/S4). FINAL THIS SPRINT (dev-handoff D9) — every
 * React Flow event handler any later ticket needs is already wired here,
 * delegating to store actions or to the interaction store below. Later
 * tickets fill their overlay/node/edge stubs; nobody reopens this file.
 *
 * Position ownership (integration risk R1): nodes and edges are DERIVED from
 * the editor store by `use-canvas-nodes`. During a drag, positions live only
 * in this component's local React Flow state; on drag stop exactly one
 * `moveNodes` call commits the absolute final positions — one undo entry per
 * press-to-release drag. Selection, hover and dimension changes never reach
 * the model (risk R2).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  applyEdgeChanges,
  applyNodeChanges,
  getNodesBounds,
  useReactFlow,
  useStore as useReactFlowStore,
  useStoreApi as useReactFlowStoreApi,
  type Connection,
  type Edge,
  type EdgeChange,
  type FinalConnectionState,
  type NodeChange,
  type NodePositionChange,
  type OnMoveEnd,
  type OnSelectionChangeParams,
  type Viewport,
} from "@xyflow/react";
import { create } from "zustand";

import "@xyflow/react/dist/style.css";

import { toast } from "@/components/ui/toast";
import {
  C4_LEVELS,
  hasChildDiagram,
  isBoundaryPlaceholder,
  isNodeTypeValidAtLevel,
  type C4Level,
  type C4NodeType,
  type Point,
} from "@/types";

import { useCanvasNodes } from "../hooks/use-canvas-nodes";
import {
  useShortcuts,
  type ShortcutBinding,
} from "../hooks/use-keyboard-shortcuts";
import {
  ALIGNMENT_THRESHOLD,
  CONNECT_SNAP_RADIUS,
  DEFAULT_NODE_SIZE,
  FIT_VIEW_PADDING_PX,
  GRID_SIZE,
  MAX_ZOOM,
  MIN_ZOOM,
  NUDGE_STEP,
  NUDGE_STEP_FINE,
  snapToGrid,
} from "../lib/canvas-constants";
import { duration } from "../lib/motion";
import { useEditorStore } from "../state";
import type { C4FlowEdge } from "./edges/c4-edge";
import { edgeTypes } from "./edges/edge-types";
import type { C4FlowNode } from "./nodes/c4-node";
import { nodeTypes } from "./nodes/node-types";
import {
  AlignmentGuides,
  clearAlignmentGuides,
  setAlignmentGuides,
  type AlignmentGuide,
} from "./overlays/alignment-guides";
import { DeleteConfirmDialog } from "./overlays/delete-confirm-dialog";
import { LevelTransition } from "./overlays/level-transition";
import { NodeContextMenu } from "./overlays/node-context-menu";
import { goToOriginal } from "../lib/goto-original";
import { ConnectHint } from "./overlays/connect-hint";
import { ShortcutHint } from "./overlays/shortcut-hint";
import { ConnectionLine } from "./edges/connection-line";
import { FrameLayer } from "./frame-layer";
import { CreateNodeDialog } from "./overlays/create-node-dialog";
import { QuickAddMenu } from "./overlays/quick-add-menu";
import { CanvasMinimap } from "@/components/ui/canvas-minimap";

import { ZoomIndicator } from "./zoom-indicator";

/* -------------------------------------------------------------------------- */
/* Canvas interaction store — the seam later tickets consume                   */
/*                                                                             */
/* canvas.tsx is final, so transient canvas gestures that later tickets react  */
/* to are published here instead of via props. QuickAddMenu (T2-B) reads       */
/* `pendingConnect`; NodeContextMenu (T2-C) reads `contextMenu`. Consumers     */
/* clear their slice when they close.                                          */
/* -------------------------------------------------------------------------- */

export interface PendingConnect {
  /** The node the aborted connection drag started from. */
  sourceNodeId: string;
  /** Release point in flow coordinates (where the new node should go). */
  flowPosition: Point;
  /** Release point in screen coordinates (where the menu should open). */
  screenPosition: Point;
}

export interface ContextMenuTarget {
  nodeId: string;
  screenPosition: Point;
}

/** An empty-canvas double-click asking for a new element at that spot. */
export interface PendingCreate {
  /** Where the new node's CENTRE should land, in flow coordinates. */
  flowPosition: Point;
}

interface CanvasInteractionState {
  pendingConnect: PendingConnect | null;
  contextMenu: ContextMenuTarget | null;
  pendingCreate: PendingCreate | null;
}

export const useCanvasInteraction = create<CanvasInteractionState>(() => ({
  pendingConnect: null,
  contextMenu: null,
  pendingCreate: null,
}));

export function setPendingConnect(value: PendingConnect | null): void {
  useCanvasInteraction.setState({ pendingConnect: value });
}

export function setContextMenu(value: ContextMenuTarget | null): void {
  useCanvasInteraction.setState({ contextMenu: value });
}

export function setPendingCreate(value: PendingCreate | null): void {
  useCanvasInteraction.setState({ pendingCreate: value });
}

/* -------------------------------------------------------------------------- */
/* Palette drag payload (dev-handoff §4.7)                                     */
/*                                                                             */
/* The codec lives in T2-B's `lib/drag-payload.ts` (Batch 2). This file is     */
/* final in Batch 1 and must build before that file exists, so it consumes     */
/* the FROZEN wire format directly: MIME type + JSON `{ nodeType, level }`.    */
/* -------------------------------------------------------------------------- */

const PALETTE_DRAG_MIME = "application/x-arch-lab-node-type";

interface PaletteDragPayload {
  nodeType: C4NodeType;
  level: C4Level;
}

function readPaletteDrag(dt: DataTransfer): PaletteDragPayload | null {
  const raw = dt.getData(PALETTE_DRAG_MIME);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const candidate = parsed as Record<string, unknown>;
  const level = candidate.level;
  const nodeType = candidate.nodeType;
  if (typeof level !== "string" || typeof nodeType !== "string") return null;
  if (!(C4_LEVELS as readonly string[]).includes(level)) return null;
  const typedLevel = level as C4Level;
  if (!isNodeTypeValidAtLevel(nodeType as C4NodeType, typedLevel)) return null;
  return { nodeType: nodeType as C4NodeType, level: typedLevel };
}

/* -------------------------------------------------------------------------- */
/* Geometry helpers                                                            */
/* -------------------------------------------------------------------------- */

interface AxisSnap {
  delta: number;
  guide: AlignmentGuide;
}

function bestAxisSnap(
  ownStops: readonly number[],
  otherStops: readonly number[],
  buildGuide: (alignedAt: number) => AlignmentGuide,
): AxisSnap | null {
  let best: AxisSnap | null = null;
  for (const own of ownStops) {
    for (const other of otherStops) {
      const delta = other - own;
      if (Math.abs(delta) > ALIGNMENT_THRESHOLD) continue;
      if (best !== null && Math.abs(delta) >= Math.abs(best.delta)) continue;
      best = { delta, guide: buildGuide(other) };
    }
  }
  return best;
}

/**
 * Snap `proposed` to sibling edges/centres within ALIGNMENT_THRESHOLD.
 * Returns the adjusted position and the guides to show — guides exist only
 * when an axis genuinely snapped (AF-E1-S3).
 */
function alignToSiblings(
  nodeId: string,
  proposed: Point,
  allNodes: readonly C4FlowNode[],
  excludeIds: ReadonlySet<string>,
): { position: Point; guides: AlignmentGuide[] } {
  const moving = allNodes.find((node) => node.id === nodeId);
  const width = moving?.width ?? DEFAULT_NODE_SIZE.width;
  const height = moving?.height ?? DEFAULT_NODE_SIZE.height;

  let bestX: AxisSnap | null = null;
  let bestY: AxisSnap | null = null;

  for (const other of allNodes) {
    if (other.id === nodeId || excludeIds.has(other.id)) continue;
    const ow = other.width ?? DEFAULT_NODE_SIZE.width;
    const oh = other.height ?? DEFAULT_NODE_SIZE.height;
    const ox = other.position.x;
    const oy = other.position.y;

    const verticalSpanFrom = Math.min(proposed.y, oy) - 24;
    const verticalSpanTo = Math.max(proposed.y + height, oy + oh) + 24;
    const candidateX = bestAxisSnap(
      [proposed.x, proposed.x + width / 2, proposed.x + width],
      [ox, ox + ow / 2, ox + ow],
      (alignedAt) => ({
        id: `v-${alignedAt}`,
        orientation: "vertical",
        position: alignedAt,
        from: verticalSpanFrom,
        to: verticalSpanTo,
      }),
    );
    if (
      candidateX !== null &&
      (bestX === null || Math.abs(candidateX.delta) < Math.abs(bestX.delta))
    ) {
      bestX = candidateX;
    }

    const horizontalSpanFrom = Math.min(proposed.x, ox) - 24;
    const horizontalSpanTo = Math.max(proposed.x + width, ox + ow) + 24;
    const candidateY = bestAxisSnap(
      [proposed.y, proposed.y + height / 2, proposed.y + height],
      [oy, oy + oh / 2, oy + oh],
      (alignedAt) => ({
        id: `h-${alignedAt}`,
        orientation: "horizontal",
        position: alignedAt,
        from: horizontalSpanFrom,
        to: horizontalSpanTo,
      }),
    );
    if (
      candidateY !== null &&
      (bestY === null || Math.abs(candidateY.delta) < Math.abs(bestY.delta))
    ) {
      bestY = candidateY;
    }
  }

  const guides: AlignmentGuide[] = [];
  const position = { ...proposed };
  if (bestX !== null) {
    position.x += bestX.delta;
    guides.push(bestX.guide);
  }
  if (bestY !== null) {
    position.y += bestY.delta;
    guides.push(bestY.guide);
  }
  return { position, guides };
}

function sameIdSets(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

const IS_MAC =
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad|ipod/i.test(navigator.platform);

/* -------------------------------------------------------------------------- */
/* The canvas                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Element-wise reference equality. Deliberately not a deep compare: React
 * Flow reuses the node object whenever a change leaves that node alone, so
 * identity is exactly the signal for "nothing happened here", and anything
 * deeper would cost more than the re-render it saves.
 */
function sameNodes(
  next: readonly C4FlowNode[],
  previous: readonly C4FlowNode[],
): boolean {
  if (next.length !== previous.length) return false;
  for (let i = 0; i < next.length; i += 1) {
    if (next[i] !== previous[i]) return false;
  }
  return true;
}

function CanvasInner(): React.JSX.Element {
  const activeDiagramId = useEditorStore((s) => s.activeDiagramId);
  // Frames follow their members, so this re-reads on every model change. The
  // selector returns the stored diagram object, which is referentially stable
  // between edits that do not touch it.
  const activeDiagram = useEditorStore(
    (s) => s.model.diagrams[s.activeDiagramId],
  );
  const { nodes: storeNodes, edges: storeEdges } = useCanvasNodes();
  const { fitView, screenToFlowPosition, setCenter, setViewport } =
    useReactFlow<C4FlowNode, C4FlowEdge>();

  // Local React Flow state: the store projection plus in-flight drag
  // positions. Never a source of truth for the model.
  const [nodes, setNodes] = useState<C4FlowNode[]>(storeNodes);
  const [edges, setEdges] = useState<C4FlowEdge[]>(storeEdges);

  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<C4FlowNode[]>(nodes);
  const altKeyRef = useRef(false);
  // Dragged node ids: the ref feeds event handlers, the state twin feeds the
  // render-time store resync below (refs must not be read during render).
  const draggingIdsRef = useRef<ReadonlySet<string>>(new Set());
  const [draggingIds, setDraggingIds] = useState<ReadonlySet<string>>(
    new Set(),
  );

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // True for the whole rubber-band gesture: React Flow sets it on the first
  // move and clears it on release. While it holds, React Flow is the author
  // of `selected` and the resync below must not answer back — see there.
  const userSelectionActive = useReactFlowStore(
    (state) => state.userSelectionActive,
  );

  // Resync from the store using the render-time derived-state pattern,
  // preserving in-flight drag positions (rare — a store update landing
  // mid-drag, e.g. the drag-start selection mirror).
  //
  // Held off for the duration of a rubber-band selection, which otherwise
  // runs away into "Maximum update depth exceeded" (React #185). Dragging a
  // box across two nodes spins this cycle once per mouse move:
  //
  //   React Flow grows the rect and emits `select` changes for the nodes it
  //   now covers  →  onSelectionChange mirrors those ids into our store  →
  //   `selection` changes, so `useCanvasNodes` re-projects and, because it
  //   maps over `diagram.nodes`, allocates a NEW object for every node  →
  //   this resync replaces the whole local array with that projection  →
  //   the `nodes` prop has a fresh identity, so React Flow's StoreUpdater
  //   pushes it into React Flow's own store  →  which re-derives, against
  //   those just-adopted objects, which of them the rect covers  →  more
  //   `select` changes, and round again.
  //
  // Neither existing guard can catch it: `sameIdSets` in
  // `handleSelectionChange` sees a genuinely different id set each time the
  // rect crosses a node, and `sameNodes` in `handleNodesChange` sees
  // genuinely different objects. Nothing is a no-op, so nothing bails —
  // the cycle is sustained by re-adoption, not by an echoed no-op.
  //
  // While the gesture is live React Flow already holds the selection it
  // just computed, so declining to hand it back costs nothing. Note we do
  // NOT advance `prevStoreNodes` when holding off: a model change that
  // lands mid-gesture stays pending and applies on the render triggered by
  // `userSelectionActive` going false.
  const [prevStoreNodes, setPrevStoreNodes] = useState(storeNodes);
  if (storeNodes !== prevStoreNodes && !userSelectionActive) {
    setPrevStoreNodes(storeNodes);
    if (draggingIds.size === 0) {
      setNodes(storeNodes);
    } else {
      const previousById = new Map(nodes.map((node) => [node.id, node]));
      setNodes(
        storeNodes.map((node) => {
          if (!draggingIds.has(node.id)) return node;
          const local = previousById.get(node.id);
          return local
            ? { ...node, position: local.position, dragging: true }
            : node;
        }),
      );
    }
  }

  // Held off during a rubber-band selection for the same reason as the nodes
  // above: the rect selects edges too (React Flow emits edge selection
  // changes on the same mouse moves), the projection re-allocates every edge
  // when `selection` changes, and handing that back re-adopts them mid-
  // gesture. Same cycle, same fix.
  const [prevStoreEdges, setPrevStoreEdges] = useState(storeEdges);
  if (storeEdges !== prevStoreEdges && !userSelectionActive) {
    setPrevStoreEdges(storeEdges);
    setEdges(storeEdges);
  }

  // Restore the per-diagram camera when navigating levels (AF-E2-S3 seam).
  useEffect(() => {
    const saved =
      useEditorStore.getState().viewportByDiagramId[activeDiagramId];
    if (saved) void setViewport(saved);
  }, [activeDiagramId, setViewport]);

  // `Alt` suspends grid snapping and alignment guides (AF-E1-S3).
  useEffect(() => {
    const update = (event: KeyboardEvent) => {
      altKeyRef.current = event.altKey;
    };
    const reset = () => {
      altKeyRef.current = false;
    };
    window.addEventListener("keydown", update);
    window.addEventListener("keyup", update);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", update);
      window.removeEventListener("keyup", update);
      window.removeEventListener("blur", reset);
    };
  }, []);

  /* ---- node changes: drags stay local, selection mirrors, nothing else ---- */

  const processPositionChange = useCallback(
    (change: NodePositionChange): NodePositionChange => {
      if (!change.position || !change.dragging) return change;
      if (altKeyRef.current) {
        clearAlignmentGuides();
        return change;
      }
      const quantised: Point = {
        x: snapToGrid(change.position.x),
        y: snapToGrid(change.position.y),
      };
      // Alignment guides only for single-node drags; multi-drags keep their
      // relative layout via per-node grid quantisation.
      if (draggingIdsRef.current.size > 1) {
        clearAlignmentGuides();
        return { ...change, position: quantised };
      }
      const { position, guides } = alignToSiblings(
        change.id,
        quantised,
        nodesRef.current,
        draggingIdsRef.current,
      );
      setAlignmentGuides(guides);
      return { ...change, position };
    },
    [],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange<C4FlowNode>[]) => {
      if (changes.length === 0) return;
      const processed = changes.map((change) =>
        change.type === "position" ? processPositionChange(change) : change,
      );
      setNodes((previous) => {
        const next = applyNodeChanges(processed, previous);
        // `applyNodeChanges` always allocates a new array, even when every
        // node it returns is the object it was given. Handing that back would
        // give the `nodes` prop a fresh identity for a change that changed
        // nothing — and React Flow's StoreUpdater pushes any new identity
        // straight back into its own store, which can emit another change,
        // which lands here again. Returning `previous` when the result is
        // element-wise identical breaks that echo at the only point where it
        // is provably a no-op; a real change still allocates and still lands.
        return sameNodes(next, previous) ? previous : next;
      });
    },
    [processPositionChange],
  );

  const handleEdgesChange = useCallback((changes: EdgeChange<C4FlowEdge>[]) => {
    setEdges((previous) => applyEdgeChanges(changes, previous));
  }, []);

  /* ---- selection: view state, never history (risk R2) --------------------- */

  const handleSelectionChange = useCallback(
    ({
      nodes: selectedNodes,
      edges: selectedEdges,
    }: OnSelectionChangeParams) => {
      const store = useEditorStore.getState();
      const nodeIds = selectedNodes.map((node) => node.id);
      const edgeIds = selectedEdges.map((edge) => edge.id);
      if (
        sameIdSets(store.selection.nodeIds, nodeIds) &&
        sameIdSets(store.selection.edgeIds, edgeIds)
      ) {
        return;
      }
      store.setSelection({ nodeIds, edgeIds });
    },
    [],
  );

  /* ---- drag lifecycle: exactly one moveNodes per press-to-release --------- */

  const handleNodeDragStart = useCallback(
    (_event: unknown, _node: C4FlowNode, draggedNodes: C4FlowNode[]) => {
      const ids: ReadonlySet<string> = new Set(
        draggedNodes.map((node) => node.id),
      );
      draggingIdsRef.current = ids;
      setDraggingIds(ids);
    },
    [],
  );

  const handleNodeDrag = useCallback(
    (event: React.MouseEvent | MouseEvent | TouchEvent) => {
      if ("altKey" in event) altKeyRef.current = event.altKey;
    },
    [],
  );

  const handleNodeDragStop = useCallback(
    (_event: unknown, _node: C4FlowNode, draggedNodes: C4FlowNode[]) => {
      const empty: ReadonlySet<string> = new Set();
      draggingIdsRef.current = empty;
      setDraggingIds(empty);
      clearAlignmentGuides();
      const store = useEditorStore.getState();
      const diagram = store.model.diagrams[store.activeDiagramId];
      if (!diagram) return;
      const localById = new Map(
        nodesRef.current.map((node) => [node.id, node]),
      );
      const positions: Record<string, Point> = {};
      for (const dragged of draggedNodes) {
        const final = localById.get(dragged.id)?.position ?? dragged.position;
        const rounded: Point = {
          x: Math.round(final.x),
          y: Math.round(final.y),
        };
        const before = diagram.nodes.find((node) => node.id === dragged.id);
        if (
          before &&
          (before.position.x !== rounded.x || before.position.y !== rounded.y)
        ) {
          positions[dragged.id] = rounded;
        }
      }
      if (Object.keys(positions).length > 0) {
        store.moveNodes(store.activeDiagramId, positions);
      }
    },
    [],
  );

  /* ---- edge creation (T2-B builds on these) -------------------------------- */

  /**
   * The one rule that makes a drop invalid. Kept here rather than inline so the
   * stylesheet's `.connectingto:not(.valid)` selector has a single, stated
   * meaning: "you are back on the element you started from".
   */
  const isValidConnection = useCallback(
    (connection: Connection | Edge) => connection.source !== connection.target,
    [],
  );

  const handleConnect = useCallback((connection: Connection) => {
    const store = useEditorStore.getState();
    try {
      // `connection.sourceHandle` / `targetHandle` are dropped ON PURPOSE.
      // Edges use floating anchoring (edges/c4-edge.tsx + lib/edge-geometry
      // `getFloatingAnchors`): the rendered edge always leaves the side of
      // the source facing the target, recomputed live as nodes move. A handle
      // pinned at connect time would go stale on the first node drag, and
      // persisting it would change the JSON schema for no benefit — the
      // handles are drag affordances, not routing decisions.
      const edgeId = store.createEdge({
        diagramId: store.activeDiagramId,
        source: connection.source,
        target: connection.target,
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
  }, []);

  const handleConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
      // Already committed by `onConnect` — the only legitimate no-op.
      if (connectionState.isValid) return;
      const sourceNodeId = connectionState.fromNode?.id;
      if (!sourceNodeId) return;
      // Released on a node that `isValidConnection` refused, which today can
      // only be the source itself. Returning to where a gesture started is the
      // universal abort, so it does exactly nothing — no toast, no menu. The
      // old code showed an "info" toast about self-relationships here, which
      // scolded people for cancelling.
      if (connectionState.toNode) return;
      // Released over empty canvas → the quick-add menu (T2-B) takes over.
      const point =
        "changedTouches" in event
          ? event.changedTouches[0]
          : (event as MouseEvent);
      setPendingConnect({
        sourceNodeId,
        flowPosition: screenToFlowPosition({
          x: point.clientX,
          y: point.clientY,
        }),
        screenPosition: { x: point.clientX, y: point.clientY },
      });
    },
    [screenToFlowPosition],
  );

  /* ---- palette drop (T2-B encodes, this file consumes §4.7) ---------------- */

  const handleDragOver = useCallback((event: ReactDragEvent) => {
    if (!event.dataTransfer.types.includes(PALETTE_DRAG_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDrop = useCallback(
    (event: ReactDragEvent) => {
      const payload = readPaletteDrag(event.dataTransfer);
      if (!payload) return;
      event.preventDefault();
      const store = useEditorStore.getState();
      const diagram = store.model.diagrams[store.activeDiagramId];
      // Reject a stale drag started while another level was active (§4.7).
      if (!diagram || diagram.level !== payload.level) return;
      const raw = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      try {
        const nodeId = store.createNode({
          diagramId: store.activeDiagramId,
          type: payload.nodeType,
          position: { x: snapToGrid(raw.x), y: snapToGrid(raw.y) },
        });
        store.setSelection({ nodeIds: [nodeId], edgeIds: [] });
        store.beginLabelEdit({ kind: "node", id: nodeId });
      } catch (error) {
        toast({
          message:
            error instanceof Error
              ? error.message
              : "That element type is not valid at this level.",
          tone: "warning",
        });
      }
    },
    [screenToFlowPosition],
  );

  /* ---- drill / rename / context menu (T2-A and T2-C build on these) -------- */

  const handleNodeDoubleClick = useCallback(
    (_event: unknown, flowNode: C4FlowNode) => {
      const store = useEditorStore.getState();
      const diagram = store.model.diagrams[store.activeDiagramId];
      const node = diagram?.nodes.find((n) => n.id === flowNode.id);
      if (!node) return;
      // A placeholder has nothing to drill into and nothing renameable, so the
      // gesture was previously dead on it. Reuse it for the one navigation that
      // makes sense: jump to the original it names. Consistent with the
      // non-placeholder meaning — double-click goes to where the detail lives.
      if (isBoundaryPlaceholder(node)) {
        goToOriginal(node);
        return;
      }
      // D5: double-click drills when a child diagram exists, renames when not.
      if (hasChildDiagram(node) && node.childDiagramId) {
        store.setActiveDiagram(node.childDiagramId);
      } else {
        store.beginLabelEdit({ kind: "node", id: node.id });
      }
    },
    [],
  );

  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, flowNode: C4FlowNode) => {
      event.preventDefault();
      const store = useEditorStore.getState();
      if (!store.selection.nodeIds.includes(flowNode.id)) {
        store.setSelection({ nodeIds: [flowNode.id], edgeIds: [] });
      }
      setContextMenu({
        nodeId: flowNode.id,
        screenPosition: { x: event.clientX, y: event.clientY },
      });
    },
    [],
  );

  /**
   * Disarms click-to-connect, for the Escape binding below.
   *
   * React Flow clears `connectionClickStartHandle` on a second HANDLE click and
   * nowhere else, so without this the mode outlives every gesture a user would
   * expect to abort it. Reaching into the React Flow store is the only route:
   * the field has no public setter, and duplicating it into our own store would
   * give one piece of state two owners.
   *
   * Click-outside is NOT wired here. `onPaneClick` cannot serve it — with
   * `selectionOnDrag` on, the Pane short-circuits its own click handler before
   * `onPaneClick` runs — so dismissal lives in `connect-hint.tsx`, on a
   * capture-phase listener that also covers the palette and the inspector.
   */
  const flowStore = useReactFlowStoreApi();

  const clearClickConnect = useCallback(() => {
    const state = flowStore.getState();
    if (state.connectionClickStartHandle !== null) {
      flowStore.setState({ connectionClickStartHandle: null });
    }
  }, [flowStore]);

  const handlePaneClick = useCallback(() => {
    setContextMenu(null);
    setPendingConnect(null);
  }, []);

  /**
   * Drop the canvas selection. Focusing a frame is a "this is what you are
   * looking at" claim, and so is a selected node — leaving both lit means the
   * diagram asserts two focal points at once.
   *
   * Deselects in local React Flow state rather than going through the store:
   * selection is view state here, and routing it through the model would put
   * a no-op on the undo stack.
   */
  const clearCanvasSelection = useCallback(() => {
    setContextMenu(null);
    setPendingConnect(null);
    setNodes((current) =>
      current.some((node) => node.selected)
        ? current.map((node) =>
            node.selected ? { ...node, selected: false } : node,
          )
        : current,
    );
    setEdges((current) =>
      current.some((edge) => edge.selected)
        ? current.map((edge) =>
            edge.selected ? { ...edge, selected: false } : edge,
          )
        : current,
    );
  }, []);

  /**
   * Double-click on empty canvas → the create dialog (AF-E1-S2's third entry
   * point, after palette drag and palette double-click).
   *
   * React Flow exposes `onPaneClick` but has no `onPaneDoubleClick`, so this
   * listens on the container and identifies the pane by its own class. The
   * check matters: without it a double-click on a node — which means "drill in
   * or rename" (D5) — would also open the dialog, and `onNodeDoubleClick`
   * fires on the same gesture.
   *
   * Safe to claim because `zoomOnDoubleClick` is already `false`, so nothing
   * else wanted this gesture.
   */
  const handleContainerDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target;
      if (
        !(target instanceof Element) ||
        !target.classList.contains("react-flow__pane")
      ) {
        return;
      }
      setPendingCreate({
        flowPosition: screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        }),
      });
    },
    [screenToFlowPosition],
  );

  /* ---- camera persistence --------------------------------------------------- */

  const handleMoveEnd = useCallback<OnMoveEnd>((_event, viewport: Viewport) => {
    const store = useEditorStore.getState();
    store.setViewport(store.activeDiagramId, {
      x: viewport.x,
      y: viewport.y,
      zoom: viewport.zoom,
    });
  }, []);

  /* ---- keyboard (registry §4.5; Batch-1 combos only) ------------------------ */

  const bindings = useMemo<ShortcutBinding[]>(() => {
    const nudge = (dx: number, dy: number) => {
      const store = useEditorStore.getState();
      const diagram = store.model.diagrams[store.activeDiagramId];
      if (!diagram) return;
      const selected = new Set(store.selection.nodeIds);
      if (selected.size === 0) return;
      const positions: Record<string, Point> = {};
      for (const node of diagram.nodes) {
        if (!selected.has(node.id) || isBoundaryPlaceholder(node)) continue;
        positions[node.id] = {
          x: node.position.x + dx,
          y: node.position.y + dy,
        };
      }
      if (Object.keys(positions).length > 0) {
        store.moveNodes(store.activeDiagramId, positions);
      }
    };
    const hasNodeSelection = () =>
      useEditorStore.getState().selection.nodeIds.length > 0;

    const nudgeBindings: ShortcutBinding[] = (
      [
        ["left", "ArrowLeft", -1, 0],
        ["right", "ArrowRight", 1, 0],
        ["up", "ArrowUp", 0, -1],
        ["down", "ArrowDown", 0, 1],
      ] as const
    ).flatMap(([name, key, dx, dy]) => [
      {
        id: `canvas.nudge-${name}`,
        combo: key,
        when: hasNodeSelection,
        run: () => nudge(dx * NUDGE_STEP, dy * NUDGE_STEP),
      },
      {
        id: `canvas.nudge-${name}-fine`,
        combo: `shift+${key}`,
        when: hasNodeSelection,
        run: () => nudge(dx * NUDGE_STEP_FINE, dy * NUDGE_STEP_FINE),
      },
    ]);

    return [
      {
        id: "editor.undo",
        combo: "mod+z",
        run: ({ store }) => store.undo(),
      },
      {
        id: "editor.redo",
        combo: "mod+shift+z",
        run: ({ store }) => store.redo(),
      },
      {
        id: "canvas.select-all",
        combo: "mod+a",
        run: ({ store }) => {
          const diagram = store.model.diagrams[store.activeDiagramId];
          if (!diagram) return;
          store.setSelection({
            nodeIds: diagram.nodes.map((node) => node.id),
            edgeIds: diagram.edges.map((edge) => edge.id),
          });
        },
      },
      {
        id: "canvas.escape",
        combo: "Escape",
        run: ({ store }) => {
          // Armed click-to-connect goes first: it is the most recent thing the
          // user did, so it is what Escape should undo — and leaving it armed
          // while clearing the selection would be the invisible-mode bug again.
          if (flowStore.getState().connectionClickStartHandle !== null) {
            clearClickConnect();
            return;
          }
          const interaction = useCanvasInteraction.getState();
          if (interaction.pendingConnect || interaction.contextMenu) {
            setPendingConnect(null);
            setContextMenu(null);
            return;
          }
          store.clearSelection();
        },
      },
      {
        id: "canvas.fit-view",
        combo: "shift+1",
        run: () => {
          void fitView({
            padding: `${FIT_VIEW_PADDING_PX}px`,
            duration: duration("fitView"),
            minZoom: MIN_ZOOM,
            maxZoom: MAX_ZOOM,
          });
        },
      },
      {
        id: "canvas.reset-zoom",
        combo: "shift+0",
        run: ({ store }) => {
          const selectedIds = new Set(store.selection.nodeIds);
          const selectedNodes = nodesRef.current.filter((node) =>
            selectedIds.has(node.id),
          );
          const animation = { zoom: 1, duration: duration("fitView") };
          if (selectedNodes.length > 0) {
            const bounds = getNodesBounds(selectedNodes);
            void setCenter(
              bounds.x + bounds.width / 2,
              bounds.y + bounds.height / 2,
              animation,
            );
            return;
          }
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          const centre = screenToFlowPosition({
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          });
          void setCenter(centre.x, centre.y, animation);
        },
      },
      ...nudgeBindings,
    ];
  }, [clearClickConnect, fitView, flowStore, screenToFlowPosition, setCenter]);

  useShortcuts(bindings);

  /* ---- render ---------------------------------------------------------------- */

  return (
    <div
      ref={containerRef}
      className="size-full"
      onDoubleClick={handleContainerDoubleClick}
    >
      <ReactFlow<C4FlowNode, C4FlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onSelectionChange={handleSelectionChange}
        onNodeDragStart={handleNodeDragStart}
        onNodeDrag={handleNodeDrag}
        onNodeDragStop={handleNodeDragStop}
        onConnect={handleConnect}
        onConnectEnd={handleConnectEnd}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeContextMenu={handleNodeContextMenu}
        onPaneClick={handlePaneClick}
        onMoveEnd={handleMoveEnd}
        connectionMode={ConnectionMode.Loose}
        connectionLineComponent={ConnectionLine}
        // The only false case is dropping back on the source. That gives the
        // source's own body handle `connectingto` WITHOUT `valid`, which is
        // what lets the stylesheet style "release to cancel" differently from
        // "release to relate" with no React state at all. Without this,
        // React Flow's `alwaysValid` marks the source's own handles valid and
        // the cancel gesture looks identical to a successful one.
        isValidConnection={isValidConnection}
        // Matches the dots' 32px hit box: one decision — how far off a dot
        // still counts — expressed once. Node interiors are covered by the
        // full-bleed body handle (node-chrome.tsx), NOT by this radius, so it
        // deliberately stays small enough never to reach a neighbour.
        connectionRadius={CONNECT_SNAP_RADIUS}
        // Click a dot, then click the element to relate to — the no-drag route,
        // and the only one that works on a trackpad without holding a button
        // across the whole canvas.
        //
        // React Flow's own version of this is unusable as shipped: it arms on a
        // handle click and clears ONLY on a second handle click — not on a pane
        // click, not on Escape — while `useConnection().inProgress` stays false,
        // so nothing on screen says the mode is active. It is armed here only
        // because all three gaps are closed: `connect-hint.tsx` reads
        // `connectionClickStartHandle` straight off the React Flow store and
        // shows the same caption the drag gets, the stylesheet lights the armed
        // dot and the source node, and `clearClickConnect` below is wired to
        // both Escape and a pane click.
        connectOnClick
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        zoomOnDoubleClick={false}
        zoomActivationKeyCode={IS_MAC ? "Meta" : "Control"}
        panOnDrag={[1, 2]}
        panActivationKeyCode="Space"
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode="Shift"
        deleteKeyCode={null}
        nodeDragThreshold={1}
        className="bg-canvas [&_.react-flow__pane]:cursor-default [&_.react-flow__selection]:rounded-sm [&_.react-flow__selection]:border [&_.react-flow__selection]:border-ring/60 [&_.react-flow__selection]:bg-selection"
      >
        {activeDiagram !== undefined ? (
          <FrameLayer diagram={activeDiagram} onFocus={clearCanvasSelection} />
        ) : null}
        <Background
          variant={BackgroundVariant.Dots}
          gap={GRID_SIZE * 2}
          size={1.5}
          color="var(--canvas-grid)"
        />
        <AlignmentGuides />
        <ConnectHint />
        <ShortcutHint />
        <CreateNodeDialog />
        <QuickAddMenu />
        <LevelTransition />
        <DeleteConfirmDialog />
        <NodeContextMenu />
        <Panel position="bottom-left">
          <ZoomIndicator />
        </Panel>
        {/* Not in a Panel: React Flow's MiniMap owns its own corner offsets. */}
        <CanvasMinimap />
      </ReactFlow>
    </div>
  );
}

/** The canvas mount. FINAL THIS SPRINT — see the header comment. */
export function Canvas(): React.JSX.Element {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}

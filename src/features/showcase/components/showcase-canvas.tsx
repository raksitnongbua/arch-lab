"use client";

/**
 * The showcase canvas: a view-only React Flow surface over the frozen demo
 * model, plus the interaction that is the whole point of the page — clicking
 * a node with a child layer zooms INTO it, and climbing back out reverses
 * the move (IcePanel-style continuous descent, not a screen swap).
 *
 * How a transition plays (mirrors the editor's proven LevelTransition
 * approach — snapshot + Web Animations API, `transform`/`opacity` only):
 *
 *   1. Before the swap, the outgoing `.react-flow__viewport` is cloned as a
 *      static snapshot and the anchor point (the clicked node's on-screen
 *      centre for drills; the owner node's incoming position for climbs) is
 *      computed arithmetically from viewport maths — no DOM measurement.
 *   2. The diagram state swaps; a layout effect applies the incoming level's
 *      viewport (its saved camera, or fit-to-bounds on first visit) before
 *      paint.
 *   3. Drill: the snapshot scales up past the camera and fades while the
 *      live renderer grows out of the clicked node (scale 0.7 → 1).
 *      Climb: the snapshot shrinks back into the owner node while the live
 *      renderer settles down from scale 1.42 → 1, then the owner node is
 *      briefly outlined.
 *
 * Durations come from the frozen `lib/motion.ts`; under
 * `prefers-reduced-motion`, `duration()` returns 0 and every animated path
 * is skipped — the swap is instant.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  MarkerType,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  getViewportForBounds,
  useReactFlow,
  type EdgeMarker,
  type EdgeTypes,
  type NodeTypes,
  type OnMoveEnd,
  type Viewport,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";

import type { C4Diagram, C4Edge } from "@/types";
import { childLevelOf, hasChildDiagram, isBoundaryPlaceholder } from "@/types";

import { duration } from "@/features/editor/lib/motion";

import { DEMO_MODEL } from "../data/demo-model";
import {
  breadcrumbFor,
  climbAnchorNodeId,
  findNode,
  getDiagram,
  type ShowcaseModel,
} from "../lib/model";
import { ShowcaseEdge, type ShowcaseFlowEdge } from "./showcase-edge";
import { ShowcaseNode, type ShowcaseFlowNode } from "./showcase-node";
import { ShowcaseToolbar } from "./showcase-toolbar";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2.5;
const FIT_PADDING = 0.14;

const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
/** How far the level "behind" the camera is scaled. Inverse pair. */
const SCALE_NEAR = 1.42;
const SCALE_FAR = 0.7;

const nodeTypes: NodeTypes = { c4: ShowcaseNode };
const edgeTypes: EdgeTypes = { c4: ShowcaseEdge };

/* -------------------------------------------------------------------------- */
/* Pure helpers                                                                */
/* -------------------------------------------------------------------------- */

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function diagramBounds(diagram: C4Diagram): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of diagram.nodes) {
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + node.size.width);
    maxY = Math.max(maxY, node.position.y + node.size.height);
  }
  if (minX === Infinity) return { x: 0, y: 0, width: 1, height: 1 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function fitViewportFor(
  diagram: C4Diagram,
  width: number,
  height: number,
): Viewport {
  return getViewportForBounds(
    diagramBounds(diagram),
    width,
    height,
    MIN_ZOOM,
    MAX_ZOOM,
    FIT_PADDING,
  );
}

/** Model-space rect → container-pixel rect under a given viewport. */
function flowRectToScreen(rect: Rect, viewport: Viewport): Rect {
  return {
    x: rect.x * viewport.zoom + viewport.x,
    y: rect.y * viewport.zoom + viewport.y,
    width: rect.width * viewport.zoom,
    height: rect.height * viewport.zoom,
  };
}

function nodeRect(diagram: C4Diagram, nodeId: string): Rect | null {
  const node = findNode(diagram, nodeId);
  if (node === null) return null;
  return {
    x: node.position.x,
    y: node.position.y,
    width: node.size.width,
    height: node.size.height,
  };
}

/** Group parallel edges by unordered endpoint pair. */
function parallelGroups(
  edges: readonly C4Edge[],
): Map<string, { index: number; count: number }> {
  const byPair = new Map<string, string[]>();
  for (const edge of edges) {
    const key =
      edge.source < edge.target
        ? `${edge.source}|${edge.target}`
        : `${edge.target}|${edge.source}`;
    const list = byPair.get(key);
    if (list) list.push(edge.id);
    else byPair.set(key, [edge.id]);
  }
  const out = new Map<string, { index: number; count: number }>();
  for (const ids of byPair.values()) {
    ids.forEach((id, index) => out.set(id, { index, count: ids.length }));
  }
  return out;
}

const LEVEL_SENTENCE: Record<C4Diagram["level"], string> = {
  context: "Context view",
  container: "Container view",
  component: "Component view",
  code: "Code view",
};

/* -------------------------------------------------------------------------- */
/* Transition bookkeeping                                                      */
/* -------------------------------------------------------------------------- */

interface PendingNav {
  kind: "drill" | "climb";
  /** transform-origin, in container pixels. */
  anchor: { x: number; y: number };
  /** Static clone of the outgoing viewport; null under reduced motion. */
  snapshot: HTMLElement | null;
  targetViewport: Viewport;
  /** Climb only: owner-node bounds under targetViewport, for the highlight. */
  highlight: Rect | null;
}

interface ActiveTransition {
  host: HTMLDivElement;
  animations: Animation[];
  renderer: HTMLElement | null;
  previousTransformOrigin: string;
}

function cancelTransition(active: ActiveTransition | null): void {
  if (active === null) return;
  for (const animation of active.animations) {
    try {
      animation.cancel();
    } catch {
      // Already finished/detached.
    }
  }
  active.host.remove();
  if (active.renderer !== null) {
    active.renderer.style.transformOrigin = active.previousTransformOrigin;
  }
}

/* -------------------------------------------------------------------------- */
/* The canvas                                                                  */
/* -------------------------------------------------------------------------- */

function ShowcaseCanvasInner({
  model,
}: {
  model: ShowcaseModel;
}): React.JSX.Element {
  const { getViewport, setViewport } = useReactFlow<
    ShowcaseFlowNode,
    ShowcaseFlowEdge
  >();

  const [diagramId, setDiagramId] = useState(model.rootDiagramId);
  const [announcement, setAnnouncement] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const diagramIdRef = useRef(diagramId);
  useEffect(() => {
    diagramIdRef.current = diagramId;
  }, [diagramId]);
  /** Last camera per diagram — climbing back returns to where you were. */
  const viewportsRef = useRef<Record<string, Viewport>>({});
  const pendingRef = useRef<PendingNav | null>(null);
  const activeRef = useRef<ActiveTransition | null>(null);

  const diagram = getDiagram(model, diagramId);
  const crumbs = useMemo(
    () => breadcrumbFor(model, diagramId),
    [model, diagramId],
  );

  /* ---- navigation ---------------------------------------------------------- */

  const navigateTo = useCallback(
    (
      targetId: string,
      kind: "drill" | "climb",
      anchorNodeId: string | null,
    ) => {
      const fromId = diagramIdRef.current;
      if (targetId === fromId) return;
      const container = containerRef.current;
      const target = getDiagram(model, targetId);

      if (container !== null) {
        const rect = container.getBoundingClientRect();
        const currentViewport = getViewport();
        viewportsRef.current[fromId] = currentViewport;
        const targetViewport =
          viewportsRef.current[targetId] ??
          fitViewportFor(target, rect.width, rect.height);

        const ms = duration("levelTransition");
        let snapshot: HTMLElement | null = null;
        let anchor = { x: rect.width / 2, y: rect.height / 2 };
        let highlight: Rect | null = null;

        if (ms > 0) {
          const viewportEl = container.querySelector(".react-flow__viewport");
          if (viewportEl instanceof HTMLElement) {
            snapshot = viewportEl.cloneNode(true) as HTMLElement;
          }
          if (anchorNodeId !== null) {
            if (kind === "drill") {
              // Anchor: the clicked node's centre, in the OUTGOING camera.
              const out = nodeRect(getDiagram(model, fromId), anchorNodeId);
              if (out !== null) {
                const screen = flowRectToScreen(out, currentViewport);
                anchor = {
                  x: screen.x + screen.width / 2,
                  y: screen.y + screen.height / 2,
                };
              }
            } else {
              // Anchor: the owner node's centre, in the INCOMING camera.
              const inRect = nodeRect(target, anchorNodeId);
              if (inRect !== null) {
                const screen = flowRectToScreen(inRect, targetViewport);
                highlight = screen;
                anchor = {
                  // Clamp: a saved camera may have panned the owner off-screen.
                  x: Math.min(
                    Math.max(screen.x + screen.width / 2, 0),
                    rect.width,
                  ),
                  y: Math.min(
                    Math.max(screen.y + screen.height / 2, 0),
                    rect.height,
                  ),
                };
              }
            }
          }
        }

        pendingRef.current = {
          kind,
          anchor,
          snapshot,
          targetViewport,
          highlight,
        };
      }

      setDiagramId(targetId);
      const owner = breadcrumbFor(model, targetId).at(-1);
      setAnnouncement(
        `${LEVEL_SENTENCE[target.level]} — ${owner?.label ?? model.title}. ` +
          `${target.nodes.length} elements.` +
          (target.parentDiagramId !== null ? " Press Escape to zoom out." : ""),
      );
    },
    [model, getViewport],
  );

  const drillInto = useCallback(
    (nodeId: string) => {
      const current = getDiagram(model, diagramIdRef.current);
      const node = findNode(current, nodeId);
      if (node === null || !hasChildDiagram(node) || !node.childDiagramId)
        return;
      navigateTo(node.childDiagramId, "drill", nodeId);
    },
    [model, navigateTo],
  );

  const climbTo = useCallback(
    (targetId: string) => {
      const anchorNodeId = climbAnchorNodeId(
        model,
        diagramIdRef.current,
        targetId,
      );
      navigateTo(targetId, "climb", anchorNodeId);
    },
    [model, navigateTo],
  );

  /* ---- play the transition after the incoming level committed -------------- */

  useLayoutEffect(() => {
    const pending = pendingRef.current;
    if (pending === null) return;
    pendingRef.current = null;

    cancelTransition(activeRef.current);
    activeRef.current = null;

    // Apply the incoming camera before paint. The renderer starts its
    // animation at opacity 0, so the pre-camera frame is never visible.
    void setViewport(pending.targetViewport);

    const container = containerRef.current;
    // Keyboard flow: keep focus at the canvas region so Tab reaches the new
    // level's drillable nodes and Escape keeps working.
    container?.focus({ preventScroll: true });

    const ms = duration("levelTransition");
    if (container === null || pending.snapshot === null || ms === 0) return;

    const origin = `${pending.anchor.x}px ${pending.anchor.y}px`;

    const host = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    host.className =
      "pointer-events-none absolute inset-0 z-[4] overflow-hidden";
    const wrapper = document.createElement("div");
    wrapper.className = "absolute inset-0";
    wrapper.style.transformOrigin = origin;
    wrapper.appendChild(pending.snapshot);
    host.appendChild(wrapper);
    container.appendChild(host);

    const rendererQuery = container.querySelector(".react-flow__renderer");
    const renderer =
      rendererQuery instanceof HTMLElement ? rendererQuery : null;
    const previousTransformOrigin = renderer?.style.transformOrigin ?? "";
    if (renderer !== null) renderer.style.transformOrigin = origin;

    const timing: KeyframeAnimationOptions = {
      duration: ms,
      easing: EASE_OUT,
      fill: "forwards",
    };
    const animations: Animation[] = [];

    if (pending.kind === "drill") {
      // Outgoing grows past the camera; incoming grows out of the node.
      animations.push(
        wrapper.animate(
          [
            { transform: "scale(1)", opacity: 1 },
            { transform: `scale(${SCALE_NEAR})`, opacity: 0 },
          ],
          timing,
        ),
      );
      if (renderer !== null) {
        animations.push(
          renderer.animate(
            [
              { transform: `scale(${SCALE_FAR})`, opacity: 0 },
              { transform: "scale(1)", opacity: 1 },
            ],
            timing,
          ),
        );
      }
    } else {
      // Inverse: outgoing shrinks back into the owner node; incoming settles
      // down from beyond the camera.
      animations.push(
        wrapper.animate(
          [
            { transform: "scale(1)", opacity: 1 },
            { transform: `scale(${SCALE_FAR})`, opacity: 0 },
          ],
          timing,
        ),
      );
      if (renderer !== null) {
        animations.push(
          renderer.animate(
            [
              { transform: `scale(${SCALE_NEAR})`, opacity: 0 },
              { transform: "scale(1)", opacity: 1 },
            ],
            timing,
          ),
        );
      }
      if (pending.highlight !== null) {
        const ring = document.createElement("div");
        ring.className =
          "pointer-events-none absolute rounded-lg border-2 border-accent";
        ring.style.left = `${pending.highlight.x - 4}px`;
        ring.style.top = `${pending.highlight.y - 4}px`;
        ring.style.width = `${pending.highlight.width + 8}px`;
        ring.style.height = `${pending.highlight.height + 8}px`;
        ring.style.opacity = "0";
        host.appendChild(ring);
        animations.push(
          ring.animate(
            [
              { opacity: 0 },
              { opacity: 1, offset: 0.35 },
              { opacity: 1, offset: 0.7 },
              { opacity: 0 },
            ],
            { duration: ms * 2, easing: "ease-in-out", fill: "forwards" },
          ),
        );
      }
    }

    const active: ActiveTransition = {
      host,
      animations,
      renderer,
      previousTransformOrigin,
    };
    activeRef.current = active;

    void Promise.allSettled(animations.map((a) => a.finished)).then(() => {
      if (activeRef.current === active) {
        cancelTransition(active);
        activeRef.current = null;
      }
    });
  }, [diagramId, setViewport]);

  useEffect(
    () => () => {
      cancelTransition(activeRef.current);
      activeRef.current = null;
    },
    [],
  );

  /* ---- Escape climbs one level --------------------------------------------- */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const current = getDiagram(model, diagramIdRef.current);
      if (current.parentDiagramId === null) return;
      event.preventDefault();
      climbTo(current.parentDiagramId);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [model, climbTo]);

  /* ---- projection: frozen model diagram → fresh React Flow objects --------- */

  const { nodes, edges } = useMemo(() => {
    const groups = parallelGroups(diagram.edges);
    const childLevel = childLevelOf(diagram.level);

    const flowNodes: ShowcaseFlowNode[] = diagram.nodes.map((node) => {
      const drillable =
        hasChildDiagram(node) && typeof node.childDiagramId === "string";
      return {
        id: node.id,
        type: "c4" as const,
        position: { x: node.position.x, y: node.position.y },
        width: node.size.width,
        height: node.size.height,
        draggable: false,
        connectable: false,
        selectable: false,
        focusable: false,
        data: {
          node,
          level: diagram.level,
          isPlaceholder: isBoundaryPlaceholder(node),
          drill:
            drillable && node.childDiagramId && childLevel !== null
              ? {
                  childDiagramId: node.childDiagramId,
                  childLevelLabel: childLevel,
                  childCount: getDiagram(model, node.childDiagramId).nodes
                    .length,
                  onDrill: drillInto,
                }
              : null,
        },
      };
    });

    const flowEdges: ShowcaseFlowEdge[] = diagram.edges.map((edge) => {
      const group = groups.get(edge.id) ?? { index: 0, count: 1 };
      const marker: EdgeMarker = {
        type: MarkerType.ArrowClosed,
        color: "var(--edge)",
        width: 18,
        height: 18,
      };
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "c4" as const,
        selectable: false,
        focusable: false,
        markerEnd: edge.direction === "none" ? undefined : marker,
        markerStart: edge.direction === "bidirectional" ? marker : undefined,
        data: { edge, parallelIndex: group.index, parallelCount: group.count },
      };
    });

    return { nodes: flowNodes, edges: flowEdges };
  }, [model, diagram, drillInto]);

  /* ---- camera persistence --------------------------------------------------- */

  const handleMoveEnd = useCallback<OnMoveEnd>((_event, viewport) => {
    viewportsRef.current[diagramIdRef.current] = viewport;
  }, []);

  /* ---- render ---------------------------------------------------------------- */

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="region"
      aria-label={`${diagram.title} — read-only diagram`}
      className="relative size-full outline-none"
    >
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <ReactFlow<ShowcaseFlowNode, ShowcaseFlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: FIT_PADDING }}
        onMoveEnd={handleMoveEnd}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        zoomOnDoubleClick={false}
        panOnDrag
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        deleteKeyCode={null}
        className="bg-canvas [&_.react-flow__pane]:cursor-grab [&_.react-flow__pane:active]:cursor-grabbing"
      >
        <Panel position="top-left" className="max-w-full">
          <ShowcaseToolbar
            crumbs={crumbs}
            currentLevel={diagram.level}
            onNavigate={climbTo}
          />
        </Panel>
        <Panel position="bottom-center" className="hidden sm:block">
          <p className="rounded-full border border-border/70 bg-card/80 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur">
            Click a{" "}
            <span className="font-medium text-primary">numbered node</span> to
            zoom in · <kbd className="font-mono text-[10px]">Esc</kbd> zooms out
            · drag to pan
          </p>
        </Panel>
      </ReactFlow>
    </div>
  );
}

/** The mount: provider + inner canvas, keyed to the frozen demo model. */
export function ShowcaseCanvas(): React.JSX.Element {
  return (
    <ReactFlowProvider>
      <ShowcaseCanvasInner model={DEMO_MODEL} />
    </ReactFlowProvider>
  );
}

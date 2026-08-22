"use client";

/**
 * The viewer canvas: a view-only React Flow surface over the frozen demo
 * model, plus the two interactions that are the whole point of the page:
 *
 *   - SELECT — single click (or Enter/Space) on any element or connector
 *     opens its detail panel and focuses the diagram on it. Element and
 *     relationship selection are mutually exclusive; the pane click or
 *     Escape clears whichever is active.
 *   - DRILL — the zoom chip on a node with a child layer, or double-click
 *     on the node body, zooms INTO it; climbing back out reverses the move
 *     (IcePanel-style continuous descent, not a screen swap).
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
  type EdgeMouseHandler,
  type EdgeTypes,
  type NodeMouseHandler,
  type NodeTypes,
  type OnMoveEnd,
  type OnNodeDrag,
  type Viewport,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";

import type { C4Diagram, C4Edge } from "@/types";
import { childLevelOf, hasChildDiagram, isBoundaryPlaceholder } from "@/types";

import { labelBiasByEdgeId } from "@/features/editor/lib/edge-geometry";
import { DURATIONS, duration } from "@/features/editor/lib/motion";
import { nodeColorStyle } from "@/features/editor/lib/node-colors";

import {
  breadcrumbFor,
  climbAnchorNodeId,
  findEdge,
  findNode,
  getDiagram,
  type ViewerModel,
} from "../lib/model";
import {
  EDGE_BASE_DASH_PERIOD,
  EDIT_GRID,
  FIT_PADDING,
  MAX_ZOOM,
  MIN_ZOOM,
} from "../lib/canvas-constants";
import { C4_ABSTRACTION } from "../lib/labels";
import { VIEWER_DURATIONS } from "../lib/motion";
import { ViewerEdgeDetail, type EdgeDetail } from "./viewer-edge-detail";
import { ViewerNodeDetail, type NodeDetail } from "./viewer-node-detail";
import {
  ViewerEdge,
  type EdgeEmphasis,
  type ViewerFlowEdge,
} from "./viewer-edge";
import { FrameLayer } from "@/features/editor/components/frame-layer";
import { ViewerNode, type ViewerFlowNode } from "./viewer-node";
import { ViewerToolbar } from "./viewer-toolbar";
import { CanvasMinimap } from "@/components/ui/canvas-minimap";
import { useModKey } from "@/lib/mod-key";

import { ViewerZoomControls } from "./viewer-zoom-controls";

const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
/** How far the level "behind" the camera is scaled. Inverse pair. */
const SCALE_NEAR = 1.42;
const SCALE_FAR = 0.7;

const nodeTypes: NodeTypes = { c4: ViewerNode };
const edgeTypes: EdgeTypes = { c4: ViewerEdge };

/**
 * Reports one finished node move, in MODEL coordinates, already snapped to
 * {@link EDIT_GRID}. Fired once per press-to-release — never per frame — so a
 * consumer that turns it into a text edit produces one undoable change per
 * gesture rather than one per pixel.
 *
 * ITS PRESENCE IS THE EDIT SWITCH. Passing it makes nodes draggable and
 * relabels the canvas region; omitting it leaves the read-only canvas
 * untouched. One prop rather than an `editable` boolean beside a callback,
 * because two props allow the state "editable with nowhere to write", which
 * would be a canvas that moves a node and then loses it on the next render.
 */
export type NodeMoveHandler = (
  diagramId: string,
  nodeId: string,
  position: { x: number; y: number },
) => void;

/** How far non-participants recede while a relationship is selected. */
const DIM_NODE_OPACITY = 0.3;

/*
 * The resting marching dash, in `pathLength=100` units — so these are
 * PERCENTAGES of a connector, not pixels, and every edge shows the same
 * rhythm whatever its length. Roughly seven dashes per connector: enough for
 * the direction to be unmistakable, few enough that a short edge still gets
 * two or three and does not read as a dotted line.
 */

/**
 * Connector interaction styling, in one scoped stylesheet: hover affordance,
 * selection emphasis, the flowing-gradient current along the selected path,
 * and the dim cross-fade behind it. `stroke`/`opacity` only — nothing
 * layout-bound. Continuously animated: the selected edge's overlay, or — when
 * an ELEMENT is selected — that node's own outline overlay (both a
 * stroke-dashoffset dash march, no JS per frame). Edges touching a selected
 * element hold perfectly still: they keep full strength while the rest of
 * the diagram dims, so the only moving light is the selection itself.
 *
 * The flow itself: viewer-edge.tsx paints three overlay copies of the
 * selected bezier with a per-edge gradient and normalises them to
 * `pathLength=100`, so the dash bands here are percentages of the true curve.
 * Every band's keyframes run `dashoffset: L → L − 100`, which puts each
 * leading edge at exactly `100t` — glow, tail and head stay in lockstep as
 * one comet however long the path is. The arrowhead keyframes are phased to
 * the same clock: warm accent exactly when the head lands on it (t = 1 ≡ 0),
 * relaxing back to primary while the next band sets off.
 *
 * `prefers-reduced-motion` stops the travel entirely (no slowed-down
 * variant): the head band un-dashes into a full-length static gradient
 * stroke over a faint full-length glow, and the arrowhead holds the
 * gradient's arrival colour.
 */
const EDGE_INTERACTION_CSS = `
.viewer-canvas .react-flow__edge { cursor: pointer; }
.viewer-canvas .viewer-edge-base {
  stroke: var(--edge);
  stroke-width: 1.5;
  transition:
    stroke ${VIEWER_DURATIONS.edgeHover}ms ease,
    stroke-width ${VIEWER_DURATIONS.edgeHover}ms ease,
    opacity ${VIEWER_DURATIONS.edgeFocus}ms ease;
}
.viewer-canvas .react-flow__edge:hover .viewer-edge-base {
  stroke: var(--primary);
  stroke-width: 2;
  opacity: 1;
}
.viewer-canvas .viewer-edge-base-dimmed { opacity: 0.2; }
.viewer-canvas .viewer-edge-base-selected,
.viewer-canvas .react-flow__edge:hover .viewer-edge-base-selected {
  stroke: var(--primary);
  stroke-width: 2.5;
  opacity: 0.35;
}
/*
 * What keeps resting motion from becoming noise on a twenty-edge diagram, and
 * the constraints any future tuning has to respect:
 *
 *   - it is SLOW — one traversal takes over five seconds — and the bands are
 *     no wider than the stroke they ride, apart from a blurred halo;
 *   - it is the edge ink lifted TOWARD primary, not a new hue, so the palette
 *     still belongs to the nodes and nothing competes with them;
 *   - each connector is staggered by a hash of its id, so the diagram never
 *     pulses in lockstep;
 *   - it hands over to the selection comet rather than layering with it, and
 *     disappears entirely on a dimmed edge — see the render guard.
 */
/* ---- the resting march on a DASHED connector ---------------------------- */
/* An async connector marches its OWN dash instead of wearing a second one.
   Unlike an overlay this is safe to animate: the pattern is already the edge's,
   so moving it cannot make the line say something it does not mean — and there
   is nothing to withdraw when motion stops, because a still dashed line is
   simply a dashed line. The step is exactly one period, so the infinite repeat
   never shows a seam. */
.viewer-canvas .viewer-edge-base-marching {
  animation: none;
}
[data-af-idle="on"] .viewer-canvas .viewer-edge-base-marching {
  animation: viewer-edge-dash-march ${VIEWER_DURATIONS.edgeDrift}ms linear
    infinite;
}
.viewer-canvas .react-flow__edge:hover .viewer-edge-base-marching {
  animation: viewer-edge-dash-march
    ${Math.round(VIEWER_DURATIONS.edgeDrift / 2.5)}ms linear infinite;
}
/* ---- the resting comet on a SOLID connector ----------------------------- */
/*
 * One band of light travelling source → target, the same shape the sequence
 * viewer gives a solid message. It replaced a repeating dash overlay, and the
 * reason is worth keeping: a pattern that covers the whole line must be drawn
 * over the whole line, and an overlay wide enough to see is wide enough to
 * blot out the stroke beneath it — which is how a solid connector came to look
 * broken. A single travelling band leaves every part of the line alone almost
 * all of the time.
 *
 * HIDDEN unless idle motion is on, and REMOVED rather than parked: these bands
 * are dash patterns, so a frozen one is not a resting connector but a stray
 * bright stripe sitting across it. Motion that cannot stop honestly has to
 * leave. Same rule as the sequence comet and the same gate — the data-af-idle
 * attribute on the shell (lib/idle-motion.ts), which carries both the reader's
 * toggle and their reduced-motion preference.
 * No backticks in here: this block lives inside a template literal.
 */
.viewer-canvas .viewer-edge-rest {
  display: none;
}
[data-af-idle="on"] .viewer-canvas .viewer-edge-rest {
  display: inline;
}
/* Hover survives the gate: the toggle turns off motion NOBODY ASKED FOR, and
   a reader holding the pointer on one connector has asked. */
.viewer-canvas .react-flow__edge:hover .viewer-edge-rest {
  display: inline;
}
.viewer-canvas .viewer-edge-rest-band {
  fill: none;
  stroke-linecap: round;
  /* The three bands share one clock and one delay (set per edge inline), which
     is what fuses them into a single comet instead of three lights chasing
     each other. They differ only in dash length, so they share a leading edge
     and trail behind it by different amounts. */
  animation-duration: ${VIEWER_DURATIONS.edgeRest}ms;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}
/* Each band starts its cycle at its OWN dash length and travels one whole path
   (100 units, from pathLength), which is what keeps the three aligned on one
   leading edge — the same arithmetic as the selected comet and the sequence
   viewer's. */
.viewer-canvas .viewer-edge-rest-glow {
  stroke: var(--primary);
  stroke-width: 5;
  opacity: 0.18;
  filter: blur(2px);
  stroke-dasharray: 26 74;
  animation-name: viewer-edge-rest-glow;
}
.viewer-canvas .viewer-edge-rest-tail {
  stroke: var(--edge-drift);
  stroke-width: 1.5;
  opacity: 0.5;
  stroke-dasharray: 18 82;
  animation-name: viewer-edge-rest-tail;
}
.viewer-canvas .viewer-edge-rest-head {
  stroke: var(--primary);
  stroke-width: 1.5;
  opacity: 0.95;
  stroke-dasharray: 7 93;
  animation-name: viewer-edge-rest-head;
}
/* Pointing at a connector brightens its comet and speeds it up — "which way
   does this go?" is a question asked by hovering. The per-edge stagger delay
   stays as it is, so the band does not jump when the pointer arrives. */
.viewer-canvas .react-flow__edge:hover .viewer-edge-rest-band {
  animation-duration: ${Math.round(VIEWER_DURATIONS.edgeRest / 3)}ms;
}
.viewer-canvas .react-flow__edge:hover .viewer-edge-rest-tail {
  stroke: var(--primary);
  opacity: 0.7;
}
.viewer-canvas .react-flow__edge:hover .viewer-edge-rest-glow {
  opacity: 0.3;
}
.viewer-canvas .viewer-edge-flow {
  fill: none;
  stroke-linecap: round;
}
.viewer-canvas .viewer-edge-flow-glow {
  stroke-width: 7;
  opacity: 0.35;
  filter: blur(2.5px);
  stroke-dasharray: 30 70;
  animation: viewer-edge-flow-glow ${VIEWER_DURATIONS.edgeFlow}ms linear infinite;
}
.viewer-canvas .viewer-edge-flow-tail {
  stroke-width: 2.5;
  opacity: 0.5;
  stroke-dasharray: 22 78;
  animation: viewer-edge-flow-tail ${VIEWER_DURATIONS.edgeFlow}ms linear infinite;
}
.viewer-canvas .viewer-edge-flow-head {
  stroke-width: 3;
  stroke-dasharray: 9 91;
  animation: viewer-edge-flow-head ${VIEWER_DURATIONS.edgeFlow}ms linear infinite;
}
.viewer-canvas .viewer-edge-flow-arrow {
  stroke-width: 1;
  animation: viewer-edge-flow-arrive ${VIEWER_DURATIONS.edgeFlow}ms linear infinite;
}
.viewer-canvas .react-flow__node {
  transition: opacity ${DURATIONS.nodeIn}ms ease;
}
/*
 * Selected-NODE outline comet (viewer-node.tsx renders the geometry: the
 * node's real perimeter — cylinder, pipe, rounded shoulders — normalised to
 * pathLength=100). Same bands, dash maths, keyframes and 1600ms clock as the
 * edge comets, so element selection reads as ONE effect: light circling the
 * node and streaming out along its connectors. Everything below is inert
 * until the selection stylesheet lights ONE node's overlay and attaches the
 * animations — unselected nodes carry zero running animations.
 */
.viewer-canvas .viewer-node-outline {
  opacity: 0;
  visibility: hidden;
  transition:
    opacity ${VIEWER_DURATIONS.edgeFocus}ms ease,
    visibility 0s linear ${VIEWER_DURATIONS.edgeFocus}ms;
}
.viewer-canvas .viewer-node-outline path {
  fill: none;
  stroke-linecap: round;
}
/* The constant affordance under the comet — never dips with the animation. */
.viewer-canvas .viewer-node-outline-base {
  stroke: var(--primary);
  stroke-width: 2;
  opacity: 0.5;
}
.viewer-canvas .viewer-node-flow-glow {
  stroke-width: 7;
  opacity: 0.35;
  filter: blur(2.5px);
  stroke-dasharray: 30 70;
}
.viewer-canvas .viewer-node-flow-tail {
  stroke-width: 2.5;
  opacity: 0.5;
  stroke-dasharray: 22 78;
}
.viewer-canvas .viewer-node-flow-head {
  stroke-width: 3;
  stroke-dasharray: 9 91;
}
/*
 * One-shot entrance: each node fades in with a slight rise (hero-diagram's
 * af-hero-rise vocabulary at canvas scale), offset per node in reading order
 * via --viewer-enter-delay (set inline by the projection); connectors fade
 * in as one layer once the first cards have landed. Both animate only
 * opacity/transform, on the node's INNER wrapper — never the React Flow
 * wrapper, whose transform is the node's position. \`backwards\` fill (not
 * \`both\`) holds a card invisible through its delay but releases the
 * property after finishing, so the forwards fill can never pin transform
 * against the hover lift that animates the same element.
 *
 * Why this cannot re-trigger on pan/zoom: a CSS animation restarts only
 * when its ELEMENT remounts, and these elements outlive interaction —
 * pan/zoom transforms only .react-flow__viewport, node data is stable
 * across selection (see the projection notes), and ViewerNode is memoised.
 * Remount happens exactly when a diagram enters — load, drill, climb —
 * which is exactly the moment the entrance belongs to. No will-change:
 * the animation is one-shot, and a permanent hint on every node would
 * cost compositor memory for the 99% of the time nothing moves.
 */
.viewer-canvas .viewer-node-enter {
  animation: viewer-node-enter ${VIEWER_DURATIONS.nodeEnter}ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
  animation-delay: var(--viewer-enter-delay, 0ms);
}
.viewer-canvas .react-flow__edge {
  animation: viewer-edge-enter ${VIEWER_DURATIONS.edgeEnter}ms ease-out backwards;
  animation-delay: ${VIEWER_DURATIONS.edgeEnterDelay}ms;
}
@keyframes viewer-node-enter {
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
}
@keyframes viewer-edge-enter {
  from { opacity: 0; }
}
@keyframes viewer-edge-rest-glow {
  from { stroke-dashoffset: 26; }
  to { stroke-dashoffset: -74; }
}
@keyframes viewer-edge-rest-tail {
  from { stroke-dashoffset: 18; }
  to { stroke-dashoffset: -82; }
}
@keyframes viewer-edge-rest-head {
  from { stroke-dashoffset: 7; }
  to { stroke-dashoffset: -93; }
}
@keyframes viewer-edge-dash-march {
  from { stroke-dashoffset: 0; }
  to { stroke-dashoffset: -${EDGE_BASE_DASH_PERIOD}; }
}
@keyframes viewer-edge-flow-glow {
  from { stroke-dashoffset: 30; }
  to { stroke-dashoffset: -70; }
}
@keyframes viewer-edge-flow-tail {
  from { stroke-dashoffset: 22; }
  to { stroke-dashoffset: -78; }
}
@keyframes viewer-edge-flow-head {
  from { stroke-dashoffset: 9; }
  to { stroke-dashoffset: -91; }
}
@keyframes viewer-edge-flow-arrive {
  0% { fill: var(--accent); stroke: var(--accent); }
  30%, 78% { fill: var(--primary); stroke: var(--primary); }
  100% { fill: var(--accent); stroke: var(--accent); }
}
@media (prefers-reduced-motion: reduce) {
  /* Entrances: parked on the natural frame, not merely sped up — with
     animation: none the backwards fill (and its stagger delay) never holds
     a card or connector invisible, so the whole diagram is simply there. */
  .viewer-canvas .viewer-node-enter,
  .viewer-canvas .react-flow__edge {
    animation: none;
  }
  .viewer-canvas .viewer-edge-flow,
  .viewer-canvas .viewer-edge-flow-arrow {
    animation: none;
  }
  /* The resting dash is motion and nothing else — a parked band would just be
     a stray bright segment sitting on one connector, so it goes away entirely
     rather than freezing mid-path. */
  .viewer-canvas .viewer-edge-rest,
  .viewer-canvas .react-flow__edge:hover .viewer-edge-rest {
    display: none;
  }
  /* The async march PARKS rather than disappearing — unlike the overlay, its
     resting frame is the meaningful one: a dashed line that is simply not
     moving. Nothing is lost by stopping it. */
  .viewer-canvas .viewer-edge-base-marching,
  .viewer-canvas .react-flow__edge:hover .viewer-edge-base-marching {
    animation: none;
    stroke-dashoffset: 0;
  }
  .viewer-canvas .viewer-edge-flow-tail { visibility: hidden; }
  .viewer-canvas .viewer-edge-flow-head {
    stroke-dasharray: none;
    stroke-dashoffset: 0;
  }
  .viewer-canvas .viewer-edge-flow-glow {
    stroke-dasharray: none;
    stroke-dashoffset: 0;
    opacity: 0.2;
  }
  .viewer-canvas .viewer-edge-flow-arrow {
    fill: var(--accent);
    stroke: var(--accent);
  }
}
`;

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

function ViewerCanvasInner({
  model,
  initialDiagramId,
  onDiagramChange,
  onNodeMove,
}: {
  model: ViewerModel;
  initialDiagramId?: string;
  onDiagramChange?: (diagramId: string) => void;
  onNodeMove?: NodeMoveHandler;
}): React.JSX.Element {
  /* The modifier's name for THIS reader's platform — "Ctrl + scroll" on a Mac
     names the gesture that zooms the operating system, not the canvas. */
  const mod = useModKey();
  const { getViewport, setViewport } = useReactFlow<
    ViewerFlowNode,
    ViewerFlowEdge
  >();

  // Deep links (share) may name a starting diagram; unknown ids fall back to
  // the root so a stale or hand-edited link still renders something honest.
  const [diagramId, setDiagramId] = useState(() =>
    initialDiagramId !== undefined &&
    model.diagrams[initialDiagramId] !== undefined
      ? initialDiagramId
      : model.rootDiagramId,
  );

  // Tell interested parents (export control, code panel) which diagram is on
  // screen. Fires for the initial diagram too, so consumers never start stale.
  useEffect(() => {
    onDiagramChange?.(diagramId);
  }, [diagramId, onDiagramChange]);
  const [announcement, setAnnouncement] = useState("");
  /** At most one relationship selected at a time; null ⇒ nothing selected. */
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  /** At most one element selected — mutually exclusive with the edge. */
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const diagramIdRef = useRef(diagramId);
  useEffect(() => {
    diagramIdRef.current = diagramId;
  }, [diagramId]);
  /** Mirrors for handlers that must read the selection synchronously. */
  const selectedEdgeIdRef = useRef<string | null>(null);
  const selectedNodeIdRef = useRef<string | null>(null);
  /** Last camera per diagram — climbing back returns to where you were. */
  const viewportsRef = useRef<Record<string, Viewport>>({});
  const pendingRef = useRef<PendingNav | null>(null);
  const activeRef = useRef<ActiveTransition | null>(null);

  const diagram = getDiagram(model, diagramId);
  const crumbs = useMemo(
    () => breadcrumbFor(model, diagramId),
    [model, diagramId],
  );

  /* ---- selection (one element OR one relationship, never both) -------------- */

  const clearEdgeSelection = useCallback((announce = true) => {
    if (selectedEdgeIdRef.current === null) return;
    selectedEdgeIdRef.current = null;
    setSelectedEdgeId(null);
    if (announce) setAnnouncement("Relationship deselected.");
  }, []);

  const clearNodeSelection = useCallback((announce = true) => {
    if (selectedNodeIdRef.current === null) return;
    selectedNodeIdRef.current = null;
    setSelectedNodeId(null);
    if (announce) setAnnouncement("Element deselected.");
  }, []);

  /** Clear whichever selection is active (they are mutually exclusive). */
  const clearSelection = useCallback(
    (announce = true) => {
      clearEdgeSelection(announce);
      clearNodeSelection(announce);
    },
    [clearEdgeSelection, clearNodeSelection],
  );

  const toggleEdgeSelection = useCallback(
    (edgeId: string) => {
      if (selectedEdgeIdRef.current === edgeId) {
        clearEdgeSelection();
        return;
      }
      const current = getDiagram(model, diagramIdRef.current);
      const edge = findEdge(current, edgeId);
      if (edge === null) return;
      // Mutually exclusive: an incoming edge selection displaces the node's.
      clearNodeSelection(false);
      const sourceName = findNode(current, edge.source)?.name ?? edge.source;
      const targetName = findNode(current, edge.target)?.name ?? edge.target;
      selectedEdgeIdRef.current = edgeId;
      setSelectedEdgeId(edgeId);
      const joiner = edge.direction === "bidirectional" ? "and" : "to";
      setAnnouncement(
        `Relationship selected: ${sourceName} ${joiner} ${targetName}` +
          (edge.label ? ` — ${edge.label}.` : ".") +
          " Details panel updated. Press Escape to deselect.",
      );
    },
    [model, clearEdgeSelection, clearNodeSelection],
  );

  // Selecting an already-selected node keeps it selected (idempotent, NOT a
  // toggle): a double-click's first two clicks land here, and a toggle would
  // flash the panel closed on the way into the drill.
  const selectNode = useCallback(
    (nodeId: string) => {
      if (selectedNodeIdRef.current === nodeId) return;
      const current = getDiagram(model, diagramIdRef.current);
      const node = findNode(current, nodeId);
      if (node === null) return;
      // Mutually exclusive: an incoming node selection displaces the edge's.
      clearEdgeSelection(false);
      selectedNodeIdRef.current = nodeId;
      setSelectedNodeId(nodeId);
      const drillHint = hasChildDiagram(node)
        ? " Use the zoom button to open its child view."
        : "";
      setAnnouncement(
        `Element selected: ${node.name} — ${C4_ABSTRACTION[node.type]}. ` +
          `Details panel updated.${drillHint} Press Escape to deselect.`,
      );
    },
    [model, clearEdgeSelection],
  );

  // Same pointer-events constraint as node drilling: with selection and focus
  // flags off, React Flow marks edges `inactive` (pointer-events: none)
  // UNLESS the flow declares an edge click handler — so the click must be
  // caught here at canvas level, never inside the edge component's SVG.
  const handleEdgeClick = useCallback<EdgeMouseHandler<ViewerFlowEdge>>(
    (_event, edge) => toggleEdgeSelection(edge.id),
    [toggleEdgeSelection],
  );

  const handlePaneClick = useCallback(() => clearSelection(), [clearSelection]);

  const handleDetailDismiss = useCallback(() => {
    clearSelection();
    // The close button unmounts with the panel — hand focus back to the
    // canvas region so keyboard users are not dropped at <body>.
    containerRef.current?.focus({ preventScroll: true });
  }, [clearSelection]);

  /* ---- navigation ---------------------------------------------------------- */

  const navigateTo = useCallback(
    (
      targetId: string,
      kind: "drill" | "climb",
      anchorNodeId: string | null,
    ) => {
      const fromId = diagramIdRef.current;
      if (targetId === fromId) return;
      // A selection belongs to one diagram; drop it before the level swaps.
      // Silent: the navigation announcement below supersedes it. This is also
      // what guarantees a drilling double-click leaves no stray selection
      // from its first click.
      clearSelection(false);
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
    [model, getViewport, clearSelection],
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

  /**
   * Jump from a `^ref` placeholder to the node it names, in the diagram that
   * owns it. Reaches the original from view mode, where a placeholder was
   * previously a dead end: it announced "this lives at the context level" and
   * gave you no way to get there.
   *
   * `"climb"` because a reference always points at an ANCESTOR diagram — that is
   * what `selectReferenceableNodes` enforces — so the transition should read as
   * zooming out, matching what the breadcrumb is about to show.
   *
   * The target node is passed as the anchor, so it is selected on arrival and
   * its detail panel is already open: the reason to follow a reference is to see
   * the real thing.
   */
  const openReference = useCallback(
    (nodeId: string) => {
      const current = getDiagram(model, diagramIdRef.current);
      const node = findNode(current, nodeId);
      const ref = node?.externalRef;
      if (ref === undefined) return;
      // A dangling ref is possible in a hand-written file; do nothing rather
      // than navigate to a diagram that is not there.
      const target = model.diagrams[ref.diagramId];
      if (target === undefined || findNode(target, ref.nodeId) === null) return;
      navigateTo(ref.diagramId, "climb", ref.nodeId);
    },
    [model, navigateTo],
  );

  // Element selection routes through React Flow's onNodeClick, not a handler
  // inside the node component: with every interactive flag off (draggable /
  // selectable / connectable all false), React Flow sets `pointer-events:
  // none` on the node wrapper unless the flow itself declares a node click
  // handler — an onClick inside the node would never receive the mouse.
  // Keyboard works through the same path: Enter/Space on the node's body
  // <button> dispatches a click that bubbles to the wrapper. The zoom chip
  // never lands here — it stops propagation and calls drillInto directly.
  const handleNodeClick = useCallback<NodeMouseHandler<ViewerFlowNode>>(
    (_event, node) => selectNode(node.id),
    [selectNode],
  );

  // Double-click on the node body drills (the chip is the other drill path).
  // The first click's selectNode is idempotent and navigateTo clears every
  // selection, so a completed double-click never strands a selection; on a
  // leaf, drillInto no-ops and the detail panel simply stays open.
  const handleNodeDoubleClick = useCallback<NodeMouseHandler<ViewerFlowNode>>(
    (_event, node) => drillInto(node.id),
    [drillInto],
  );

  /* ---- editing: a finished drag ---------------------------------------------
   * ON DRAG **STOP** ONLY, which is the whole reason this is three lines
   * rather than a gesture state machine. React Flow owns the node's position
   * for the duration of the press — it applies the pointer delta to its own
   * internal copy, snapping to `snapGrid` as it goes — so the position handed
   * over here is already the landed, snapped one, and the `nodes` memo above
   * is never touched mid-gesture. That matters beyond tidiness: replacing the
   * node objects per frame makes React Flow re-adopt them, and the note above
   * that memo records what re-adoption costs (every EdgeWrapper unmounts and
   * remounts, stealing focus mid-selection). One commit per press-to-release
   * keeps that invariant and produces exactly one text edit to undo.
   *
   * `Math.round` after the snap, not instead of it: `snapGrid` quantises, but
   * a zoomed canvas can still hand back a value carrying float error, and
   * `C4Node.position` is documented integral. */
  const handleNodeDragStop = useCallback<OnNodeDrag<ViewerFlowNode>>(
    (_event, node) => {
      onNodeMove?.(diagramIdRef.current, node.id, {
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
      });
    },
    [onNodeMove],
  );

  /** Editable is a property of the callback's presence — see NodeMoveHandler. */
  const editable = onNodeMove !== undefined;

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

  /* ---- Escape: deselect first, then climb one level ------------------------- */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // Native fullscreen owns Escape outright: the browser is about to exit
      // fullscreen on this very keypress, and consuming it here too would
      // make one press do two things. The viewer's own Escape ladder
      // (deselect → climb → leave immersive mode) resumes afterwards.
      if (document.fullscreenElement !== null) return;
      // Selection (element or relationship — never both) takes priority;
      // level-climb is the fallback.
      if (
        selectedEdgeIdRef.current !== null ||
        selectedNodeIdRef.current !== null
      ) {
        event.preventDefault();
        clearSelection();
        return;
      }
      const current = getDiagram(model, diagramIdRef.current);
      if (current.parentDiagramId === null) return;
      event.preventDefault();
      climbTo(current.parentDiagramId);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [model, climbTo, clearSelection]);

  /* ---- projection: frozen model diagram → fresh React Flow objects --------- */

  // Nodes deliberately do NOT depend on the edge selection: replacing the
  // node objects makes React Flow re-adopt them, and for one frame the edge
  // position lookup comes back null — every EdgeWrapper unmounts and
  // remounts, stealing focus from the edge's label button mid-selection.
  // Node dimming is done with a small dynamic stylesheet instead (below).
  const nodes = useMemo(() => {
    const childLevel = childLevelOf(diagram.level);

    // Entrance order = reading order (top-left → bottom-right), not array
    // order: the stagger should look like the diagram being drawn, and a
    // hand-edited .alab file's node order is whatever the author typed.
    // Delay is capped so a large diagram finishes settling with the level
    // transition instead of trickling in after it. Computed HERE (not in the
    // node component) because it needs the whole diagram; it rides the same
    // inline style as the colour variables, so nothing new re-renders.
    const enterDelay = new Map<string, number>();
    [...diagram.nodes]
      .sort(
        (a, b) => a.position.y - b.position.y || a.position.x - b.position.x,
      )
      .forEach((node, rank) => {
        enterDelay.set(
          node.id,
          Math.min(
            rank * VIEWER_DURATIONS.nodeEnterStagger,
            VIEWER_DURATIONS.nodeEnterMaxDelay,
          ),
        );
      });

    const flowNodes: ViewerFlowNode[] = diagram.nodes.map((node) => {
      const drillable =
        hasChildDiagram(node) && typeof node.childDiagramId === "string";
      // Gated on the child COUNT, not on `childDiagramId` merely existing: a
      // pointer at an empty diagram is nothing to zoom into, and a chip
      // reading "0" is an affordance that lies.
      const childCount =
        drillable && node.childDiagramId
          ? getDiagram(model, node.childDiagramId).nodes.length
          : 0;
      return {
        id: node.id,
        type: "c4" as const,
        position: { x: node.position.x, y: node.position.y },
        width: node.size.width,
        height: node.size.height,
        draggable: editable,
        connectable: false,
        selectable: false,
        focusable: false,
        // Same colour plumbing as the editor's projection: two custom
        // properties on the wrapper, inherited by the shape classes.
        // Author tagColors (frozen in model metadata) beat the type default.
        // The entrance delay rides along as a third custom property — the
        // wrapper's inline style is already the per-node channel, and the
        // animation itself lives on the INNER element (viewer-node.tsx), so
        // React Flow's positioning transform is never animated.
        style: {
          ...nodeColorStyle(node, model.file.metadata.tagColors),
          "--viewer-enter-delay": `${enterDelay.get(node.id) ?? 0}ms`,
        } as React.CSSProperties,
        data: {
          node,
          level: diagram.level,
          isPlaceholder: isBoundaryPlaceholder(node),
          // A dangling `^ref` resolves to null and renders no chip.
          refSourceLevel:
            node.externalRef !== undefined
              ? (model.diagrams[node.externalRef.diagramId]?.level ?? null)
              : null,
          onDrill: drillInto,
          onOpenReference: openReference,
          drill:
            node.childDiagramId && childLevel !== null && childCount > 0
              ? {
                  childDiagramId: node.childDiagramId,
                  childLevelLabel: childLevel,
                  childCount,
                }
              : null,
        },
      };
    });

    return flowNodes;
  }, [model, diagram, drillInto, openReference, editable]);

  const edges = useMemo(() => {
    const groups = parallelGroups(diagram.edges);
    const labelBias = labelBiasByEdgeId(diagram.edges);
    const selectedEdge =
      selectedEdgeId !== null ? findEdge(diagram, selectedEdgeId) : null;
    const nameById = new Map(diagram.nodes.map((n) => [n.id, n.name]));

    const flowEdges: ViewerFlowEdge[] = diagram.edges.map((edge) => {
      const group = groups.get(edge.id) ?? { index: 0, count: 1 };
      const isSelected = selectedEdge !== null && edge.id === selectedEdge.id;
      // Edge selected: it alone is emphasised (and animated), all else dims.
      // Node selected: the edges TOUCHING it keep full strength — they are
      // the payload (what this element talks to) — and the rest dim. The
      // animation stays on the node's own outline; the connectors hold still.
      const emphasis: EdgeEmphasis = isSelected
        ? "selected"
        : selectedEdge !== null
          ? "dimmed"
          : selectedNodeId !== null
            ? edge.source === selectedNodeId || edge.target === selectedNodeId
              ? "idle"
              : "dimmed"
            : "idle";
      const marker: EdgeMarker = {
        type: MarkerType.ArrowClosed,
        // Idle/dimmed arrowheads only — while selected, the edge component
        // swaps in its own pulsing marker that answers the gradient band
        // (see viewer-edge.tsx). Dimming reaches this one for free —
        // element opacity on the path applies to its markers too.
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
        // No zIndex elevation on select: a zIndex change moves the edge into
        // another SVG layer group, remounting it — which would steal focus
        // from the label button mid-keyboard-selection. Dimming the other
        // edges to 0.2 isolates the selection well enough without it.
        markerEnd: edge.direction === "none" ? undefined : marker,
        markerStart: edge.direction === "bidirectional" ? marker : undefined,
        data: {
          edge,
          parallelIndex: group.index,
          parallelCount: group.count,
          labelBias: labelBias.get(edge.id) ?? 0,
          sourceName: nameById.get(edge.source) ?? edge.source,
          targetName: nameById.get(edge.target) ?? edge.target,
          emphasis,
          onSelect: toggleEdgeSelection,
        },
      };
    });

    return flowEdges;
  }, [diagram, selectedEdgeId, selectedNodeId, toggleEdgeSelection]);

  /* ---- selected-relationship detail ----------------------------------------- */

  const detail = useMemo<EdgeDetail | null>(() => {
    if (selectedEdgeId === null) return null;
    const edge = findEdge(diagram, selectedEdgeId);
    if (edge === null) return null;
    const source = findNode(diagram, edge.source);
    const target = findNode(diagram, edge.target);
    if (source === null || target === null) return null;
    // Traceability: the parent-level relationship this one implements.
    let realizes: EdgeDetail["realizes"] = null;
    if (edge.realizes !== undefined && diagram.parentDiagramId !== null) {
      const parent = getDiagram(model, diagram.parentDiagramId);
      const parentEdge = findEdge(parent, edge.realizes);
      if (parentEdge !== null) {
        realizes = {
          label: parentEdge.label ?? parentEdge.id,
          level: parent.level,
        };
      }
    }
    return { edge, source, target, realizes };
  }, [model, diagram, selectedEdgeId]);

  /* ---- selected-element detail ------------------------------------------------ */

  const nodeDetail = useMemo<NodeDetail | null>(() => {
    if (selectedNodeId === null) return null;
    const node = findNode(diagram, selectedNodeId);
    if (node === null) return null;
    const nameById = new Map(diagram.nodes.map((n) => [n.id, n.name]));
    const outgoing = diagram.edges
      .filter((edge) => edge.source === selectedNodeId)
      .map((edge) => ({
        edge,
        otherName: nameById.get(edge.target) ?? edge.target,
      }));
    const incoming = diagram.edges
      .filter((edge) => edge.target === selectedNodeId)
      .map((edge) => ({
        edge,
        otherName: nameById.get(edge.source) ?? edge.source,
      }));
    const childLevel = childLevelOf(diagram.level);
    // Same rule as the canvas chip: an empty child diagram is not a drill-down.
    const childCount =
      hasChildDiagram(node) && node.childDiagramId
        ? getDiagram(model, node.childDiagramId).nodes.length
        : 0;
    const drill =
      childCount > 0 && childLevel !== null ? { childCount, childLevel } : null;
    return { node, level: diagram.level, outgoing, incoming, drill };
  }, [model, diagram, selectedNodeId]);

  const handleDetailZoomIn = useCallback(() => {
    if (selectedNodeIdRef.current !== null) {
      drillInto(selectedNodeIdRef.current);
    }
  }, [drillInto]);

  // Focus effect while an element is selected: the element and its direct
  // neighbours stay at full strength (the touching edges stay "idle" in the
  // edges memo — emphasised by contrast, never animated); everything else
  // recedes. Same stylesheet-driven approach as the relationship focus
  // (node ids are model slugs) so node objects never change with selection —
  // see the remount note above the `nodes` memo.
  const nodeFocusCss = useMemo<string | null>(() => {
    if (selectedNodeId === null) return null;
    const keep = new Set<string>([selectedNodeId]);
    for (const edge of diagram.edges) {
      if (edge.source === selectedNodeId) keep.add(edge.target);
      if (edge.target === selectedNodeId) keep.add(edge.source);
    }
    const excludeKeptSelector = [...keep]
      .map((id) => `:not([data-id="${id}"])`)
      .join("");
    const selected = `.viewer-canvas .react-flow__node[data-id="${selectedNodeId}"]`;
    // Selection affordance splits on motion preference. Motion: the node's
    // outline overlay lights up AND starts marching — the animation property
    // lives HERE, on the selected node only, so the other nodes' (invisible,
    // always-mounted) overlays never tick. The three bands reuse the edge
    // comets' keyframes and 1600ms clock verbatim, so element and
    // relationship selection read as one system — but while an element is
    // selected the ONLY moving light is this outline; its connectors hold
    // still at full strength. Reduced motion: nothing marches anywhere — the
    // classic static ring lights instead, exactly as before this animation
    // existed.
    const flowAnimation = (name: string): string =>
      `animation: ${name} ${VIEWER_DURATIONS.edgeFlow}ms linear infinite;`;
    return (
      `.viewer-canvas .react-flow__node${excludeKeptSelector} { opacity: ${DIM_NODE_OPACITY}; }\n` +
      `@media (prefers-reduced-motion: no-preference) {\n` +
      `  ${selected} .viewer-node-outline { opacity: 1; visibility: visible; transition-delay: 0s; }\n` +
      `  ${selected} .viewer-node-flow-glow { ${flowAnimation("viewer-edge-flow-glow")} }\n` +
      `  ${selected} .viewer-node-flow-tail { ${flowAnimation("viewer-edge-flow-tail")} }\n` +
      `  ${selected} .viewer-node-flow-head { ${flowAnimation("viewer-edge-flow-head")} }\n` +
      `}\n` +
      `@media (prefers-reduced-motion: reduce) {\n` +
      `  ${selected} .viewer-node-selected-ring { opacity: 1; }\n` +
      `}`
    );
  }, [diagram, selectedNodeId]);

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
      /* The label states which canvas this IS. A reader using a screen reader
         has no cursor to discover draggability with, so "read-only" must stop
         being said the moment it stops being true. */
      aria-label={
        editable
          ? `${diagram.title} — editable diagram`
          : `${diagram.title} — read-only diagram`
      }
      // absolute inset-0, not size-full: the shell's wrapper sizes itself with
      // min-h-96 + flex-1 (no definite `height`), so a percentage height here
      // would resolve to auto and collapse the canvas to zero (React Flow
      // error 004). Absolute positioning tracks the wrapper's USED box —
      // min-height clamp included — so the graph always has real dimensions.
      className="viewer-canvas absolute inset-0 outline-none"
    >
      <style>{EDGE_INTERACTION_CSS}</style>
      {detail !== null ? (
        // Focus effect while a relationship is selected: every node except
        // the two endpoints recedes. Stylesheet-driven (node ids are model
        // slugs) so the node objects themselves stay untouched — see the
        // remount note above the `nodes` memo.
        <style>{`.viewer-canvas .react-flow__node:not([data-id="${detail.edge.source}"]):not([data-id="${detail.edge.target}"]) { opacity: ${DIM_NODE_OPACITY}; }`}</style>
      ) : null}
      {nodeFocusCss !== null ? <style>{nodeFocusCss}</style> : null}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <ReactFlow<ViewerFlowNode, ViewerFlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: FIT_PADDING }}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onEdgeClick={handleEdgeClick}
        onPaneClick={handlePaneClick}
        onMoveEnd={handleMoveEnd}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        zoomOnDoubleClick={false}
        /* PAN IS TWO GESTURES, AND BOTH ARE SPELLED OUT ON PURPOSE.
           `panOnDrag` and `panActivationKeyCode` are both React Flow
           DEFAULTS (`panOnDrag = true`, `panActivationKeyCode = 'Space'`),
           so leaving them off the element would behave identically today.
           They are written anyway because an editable canvas is about to
           depend on them: once nodes become draggable, dragging a node MOVES
           it, and these two are then the only ways left to pan — the pane for
           empty canvas, Space for anywhere including over a node. A default
           that a feature depends on is a default that must not be able to
           change under it silently, whether by a library upgrade or by
           someone adding `selectionOnDrag` here the way the editor has it.
           `check:viewer-motion` pins the Space key to the editor's, which is
           the one place the same gesture is already declared. */
        panOnDrag
        panActivationKeyCode="Space"
        /* The pan comment above is the other half of this line: with nodes
           draggable, a drag STARTING ON A NODE moves it, and pan survives as
           the pane drag and Space + drag. */
        nodesDraggable={editable}
        onNodeDragStop={editable ? handleNodeDragStop : undefined}
        /* React Flow does the snapping DURING the gesture, so the node the
           reader is dragging is on the grid the whole way rather than jumping
           to it on release. `EDIT_GRID` is the format's own 8 — see its
           comment for why it is not the editor's copy of that number. */
        snapToGrid={editable}
        snapGrid={[EDIT_GRID, EDIT_GRID]}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        deleteKeyCode={null}
        /* An array joined with a space, never concatenated: a lost leading
           space merges two class names into one nonsense name, every rule
           targeting it silently stops applying, and CSS reports nothing. */
        className={[
          "bg-canvas [&_.react-flow__pane]:cursor-grab [&_.react-flow__pane:active]:cursor-grabbing",
          /* THE AFFORDANCE. Without this the node keeps the body button's
             pointer cursor and nothing on screen says it can be moved — the
             feature would be invisible until someone tried it by accident.
             Aimed at the WRAPPER and its button so the whole node reads as
             draggable, not just its margins. */
          editable
            ? "[&_.react-flow__node]:cursor-grab [&_.react-flow__node_button]:cursor-grab [&_.react-flow__node.dragging]:cursor-grabbing"
            : "",
        ].join(" ")}
      >
        {/* Before every Panel so frames sit behind the nodes and the chrome. */}
        <FrameLayer diagram={diagram} onFocus={clearSelection} />
        <Panel position="top-left" className="max-w-full">
          {/* No `currentLevel`: the last crumb already carries it, and two
              sources for one fact can disagree. */}
          <ViewerToolbar crumbs={crumbs} onNavigate={climbTo} />
        </Panel>
        <Panel
          position="top-right"
          className="max-w-[min(19rem,calc(100%-1rem))]"
        >
          {nodeDetail !== null ? (
            <ViewerNodeDetail
              detail={nodeDetail}
              onDismiss={handleDetailDismiss}
              onZoomIn={handleDetailZoomIn}
            />
          ) : (
            <ViewerEdgeDetail detail={detail} onDismiss={handleDetailDismiss} />
          )}
        </Panel>
        <Panel position="bottom-left">
          <ViewerZoomControls />
        </Panel>
        {/* Not in a Panel: React Flow's MiniMap positions itself, and
            wrapping it would fight its own corner offsets. */}
        <CanvasMinimap />
        {/* The gesture clause is here as well as in the zoom pill's menu, and
            the repetition is the point: a plain wheel PANS this canvas, so a
            reader who tries it concludes the wheel does not zoom and never
            reaches for the modifier. The failure looks like an answer, which
            is the one case worth saying twice. */}
        <Panel position="bottom-center" className="hidden sm:block">
          <p className="rounded-full border border-border/70 bg-card/80 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur">
            Click an <span className="font-medium text-primary">element</span>{" "}
            or <span className="font-medium text-primary">connector</span> for
            details ·{" "}
            <span className="font-medium text-primary">double-click</span> or
            the <span className="font-medium text-primary">zoom chip</span> to
            zoom in ·{" "}
            <span className="font-medium text-primary">{mod} + scroll</span>{" "}
            zooms · <kbd className="font-mono text-[10px]">Esc</kbd> steps back
            · drag or <kbd className="font-mono text-[10px]">Space</kbd> + drag
            to pan
          </p>
        </Panel>
      </ReactFlow>
    </div>
  );
}

/** The mount: provider + inner canvas over a (deep-frozen) viewer model. */
export function ViewerCanvas({
  model,
  initialDiagramId,
  onDiagramChange,
  onNodeMove,
}: {
  model: ViewerModel;
  /** Open on this diagram (share deep links); unknown ids fall back to root. */
  initialDiagramId?: string;
  /** Reports which diagram is on screen (initial diagram included). */
  onDiagramChange?: (diagramId: string) => void;
  /**
   * Makes the canvas EDITABLE. Absent (the default) and the canvas is exactly
   * the read-only surface it has always been — see {@link NodeMoveHandler}.
   */
  onNodeMove?: NodeMoveHandler;
}): React.JSX.Element {
  return (
    <ReactFlowProvider>
      <ViewerCanvasInner
        model={model}
        initialDiagramId={initialDiagramId}
        onDiagramChange={onDiagramChange}
        onNodeMove={onNodeMove}
      />
    </ReactFlowProvider>
  );
}

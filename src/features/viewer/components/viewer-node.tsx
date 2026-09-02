"use client";

/**
 * The viewer's read-only node. Shares the editor's visual language — the
 * same per-type silhouettes (`node-shapes`) and the same 16-icon registry —
 * but carries none of its machinery: no handles, no selection, no rename, no
 * store.
 *
 * Interaction model (mirrors connectors):
 *
 *   - The node BODY is a real <button> on every node — leaf, drillable, or
 *     placeholder alike. Click / Enter / Space selects the element and opens
 *     the detail panel; the click bubbles to the flow wrapper and the
 *     canvas's onNodeClick owns the state (viewer-canvas.tsx — the wrapper
 *     only receives pointer events because the flow declares that handler).
 *   - Drilling moved OFF the single click: the zoom CHIP (its own focusable
 *     <button>, sibling of the body so buttons never nest) and DOUBLE-CLICK
 *     on the body both zoom into the child diagram. The chip stops
 *     propagation so it never also opens the detail panel.
 *   - Selection emphasis is stylesheet-driven from the canvas (the
 *     `viewer-node-selected-ring` span below), so node data never changes
 *     with selection and edges never remount mid-interaction.
 */

import { createContext, memo, useContext, useId } from "react";
import { ZoomIn } from "lucide-react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import { cn } from "@/lib/utils";
import type { C4Level, C4Node, C4NodeType } from "@/types";

import { RefBadge } from "@/features/editor/components/nodes/ref-badge";
import { resolveIcon } from "@/features/editor/lib/icons/registry";
import { useIconStyle } from "@/lib/icon-style";
import {
  colorRoleForNode,
  EXTERNAL_DIM_CLASS,
} from "@/features/editor/lib/node-colors";
import {
  NodeShapeLayer,
  SHAPE_WRAPPER_CLASSES,
  hasSvgSilhouette,
} from "@/features/editor/components/nodes/node-shapes";

import { C4_ABSTRACTION } from "../lib/labels";
import {
  ViewerConnectGrip,
  type ViewerConnectActions,
} from "./viewer-connect-grip";

/**
 * PURE DATA, no callbacks — and that is load-bearing rather than tidy. The
 * canvas's projection reuses a node's object when its data is unchanged
 * (`lib/project-nodes.ts`), which is what keeps React Flow from re-adopting
 * every node on every edit; both navigations close over the model, so a
 * function in here would be new on every edit and defeat that, and a cached
 * object would be holding the closure it was built with. They arrive through
 * {@link ViewerNodeActionsProvider} instead.
 */
export interface ViewerNodeData extends Record<string, unknown> {
  /** The (frozen) model node. */
  node: C4Node;
  /** The containing diagram's level — a node's level is never stored on it. */
  level: C4Level;
  /**
   * Present ⇔ the node has a child diagram to zoom into. Shapes the chip;
   * the chip's own click handler drills directly (with propagation stopped,
   * so the body's selection path never fires alongside it).
   */
  drill: {
    childDiagramId: string;
    childLevelLabel: string;
    childCount: number;
  } | null;
  isPlaceholder: boolean;
  /**
   * For a placeholder, the LEVEL of the diagram it references — drives the
   * `↑ <level>` chip. Null when first-class, or when the referenced diagram
   * cannot be resolved (a dangling `^ref`).
   */
  refSourceLevel: C4Level | null;
}

export type ViewerFlowNode = Node<ViewerNodeData, "c4">;

/**
 * The two navigations a node can start, plus the connect grip's callbacks.
 * The canvas owns all of it — actions travel through context rather than
 * node data for the projection-cache reason the interface above states.
 */
export interface ViewerNodeActions {
  /** Zoom into this node's child diagram. */
  drillInto: (nodeId: string) => void;
  /** Follow a `^ref` placeholder to the node it names, and select it there. */
  openReference: (nodeId: string) => void;
  /**
   * The connect grip's callbacks — present exactly while the canvas is
   * editable, `null` otherwise, which is what withholds the grip: presence
   * is the signal, exactly as `edit` itself is on the canvas.
   */
  connect: ViewerConnectActions | null;
}

const ViewerNodeActionsContext = createContext<ViewerNodeActions | null>(null);

/**
 * Wraps the flow that renders these nodes. The value may change identity as
 * often as it likes — a context change re-renders the node components, which
 * is cheap, and never touches the node OBJECTS, which is what React Flow
 * measures its work by.
 */
export const ViewerNodeActionsProvider = ViewerNodeActionsContext.Provider;

/** Throws rather than no-op: a drill chip that silently does nothing reads as
 * a broken affordance, and only a canvas that forgot the provider can get
 * here. */
function useViewerNodeActions(): ViewerNodeActions {
  const actions = useContext(ViewerNodeActionsContext);
  if (actions === null) {
    throw new Error(
      "ViewerNode rendered outside ViewerNodeActionsProvider — the drill chip and reference chip would have nowhere to navigate.",
    );
  }
  return actions;
}

/* -------------------------------------------------------------------------- */
/* Selection-outline geometry                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Corner radii (px) of the CSS-box silhouettes, top/bottom — kept in lockstep
 * with `SHAPE_WRAPPER_CLASSES` and the theme's `--radius: 0.625rem` (10px):
 * rounded-t-[28px]/rounded-b-xl (person), rounded-lg (systems/containers),
 * rounded-md (component), rounded-sm (code element). `database` and `queue`
 * are SVG silhouettes and never consult this table.
 */
const BOX_CORNER_RADII: Record<C4NodeType, { top: number; bottom: number }> = {
  person: { top: 28, bottom: 14 },
  softwareSystem: { top: 10, bottom: 10 },
  externalSystem: { top: 10, bottom: 10 },
  container: { top: 10, bottom: 10 },
  component: { top: 8, bottom: 8 },
  codeElement: { top: 6, bottom: 6 },
  database: { top: 0, bottom: 0 },
  queue: { top: 0, bottom: 0 },
};

/** Native design-space of the editor's SVG silhouettes (node-shapes.tsx). */
const SILHOUETTE_VIEWBOX = { width: 176, height: 88 };

function roundedRectPath(
  width: number,
  height: number,
  topRadius: number,
  bottomRadius: number,
): string {
  const cap = Math.min(width, height) / 2;
  const rt = Math.min(topRadius, cap);
  const rb = Math.min(bottomRadius, cap);
  return (
    `M ${rt} 0 H ${width - rt} A ${rt} ${rt} 0 0 1 ${width} ${rt} ` +
    `V ${height - rb} A ${rb} ${rb} 0 0 1 ${width - rb} ${height} ` +
    `H ${rb} A ${rb} ${rb} 0 0 1 0 ${height - rb} ` +
    `V ${rt} A ${rt} ${rt} 0 0 1 ${rt} 0 Z`
  );
}

/**
 * The node's outer perimeter as a single closed path in its own pixel space,
 * traced clockwise from the top — the track the selection comet runs on.
 *
 * Box types reproduce the CSS border-radius geometry exactly (radii above).
 * `database`/`queue` re-trace the editor silhouette's outer edge: the same
 * curve coordinates as node-shapes.tsx, scaled from its 176×88 design space
 * to the node's real size (interior lines — the cylinder rim's lower arc,
 * the pipe's inner rim — are not part of the perimeter and are skipped).
 */
function outlinePath(type: C4NodeType, width: number, height: number): string {
  const sx = width / SILHOUETTE_VIEWBOX.width;
  const sy = height / SILHOUETTE_VIEWBOX.height;
  if (type === "database") {
    // Cylinder: over the top rim, down the right wall, under the bottom
    // bulge, up the left wall. Rim ellipse: centre y=12, rx=84, ry=10.
    const rx = 84 * sx;
    const ry = 10 * sy;
    return (
      `M ${4 * sx} ${12 * sy} A ${rx} ${ry} 0 0 1 ${172 * sx} ${12 * sy} ` +
      `L ${172 * sx} ${76 * sy} A ${rx} ${ry} 0 0 1 ${4 * sx} ${76 * sy} Z`
    );
  }
  if (type === "queue") {
    // Pipe: along the top, around the right end cap, back along the bottom,
    // around the open left rim (through its leftmost bulge at x=2).
    return (
      `M ${14 * sx} ${4 * sy} L ${160 * sx} ${4 * sy} ` +
      `A ${13 * sx} ${40 * sy} 0 0 1 ${160 * sx} ${84 * sy} ` +
      `L ${14 * sx} ${84 * sy} ` +
      `A ${12 * sx} ${40 * sy} 0 0 1 ${14 * sx} ${4 * sy} Z`
    );
  }
  const radii = BOX_CORNER_RADII[type];
  return roundedRectPath(width, height, radii.top, radii.bottom);
}

function ViewerNodeInner({
  data,
}: NodeProps<ViewerFlowNode>): React.JSX.Element {
  const { node, drill, isPlaceholder, refSourceLevel } = data;
  const { drillInto, openReference, connect } = useViewerNodeActions();
  const { def } = resolveIcon(node);
  const [iconStyle] = useIconStyle();
  const Icon = def.byStyle[iconStyle];

  // Per-instance gradient id (sanitised — useId's delimiters are not valid
  // inside url(#…)). Never shared: a duplicate id would silently recolour the
  // wrong node's outline.
  const outlineKey = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const outlineGradientId = `viewer-node-outline-grad-${outlineKey}`;
  // The comet's track: this node's outer perimeter, in its own pixel space.
  // Sizes are frozen in the model (the viewer never resizes), so the flow
  // node's width/height — and therefore this rendered box — equal node.size.
  const outline = outlinePath(node.type, node.size.width, node.size.height);

  const meta =
    node.technology !== undefined && node.technology !== ""
      ? `${C4_ABSTRACTION[node.type]}: ${node.technology}`
      : C4_ABSTRACTION[node.type];

  const svgSilhouette = hasSvgSilhouette(node.type);

  const frameClasses = cn(
    "relative flex size-full flex-col items-center justify-center px-3 py-1.5 text-center text-node-foreground",
    SHAPE_WRAPPER_CLASSES[node.type],
    !svgSilhouette && "shadow-sm",
    node.type === "database" && "pt-4",
    node.type === "queue" && "px-8",
    svgSilhouette && "rounded-lg",
    isPlaceholder && "opacity-60",
    // External elements (by type OR by the Mermaid-residue `external` tag)
    // recede — the shared constant, not a per-renderer literal.
    !isPlaceholder &&
      colorRoleForNode(node) === "external" &&
      EXTERNAL_DIM_CLASS,
  );

  const content = (
    <>
      {/*
       * Invisible anchor handles. React Flow will not CREATE an edge unless
       * both endpoint nodes expose a handle (error 008), even though our
       * ViewerEdge recomputes floating anchors itself and never draws from
       * these points. `visibility: hidden` keeps them measurable for React
       * Flow's internals while removing them from painting, hit-testing, and
       * the accessibility tree — the demo stays strictly view-only.
       */}
      <Handle
        type="source"
        position={Position.Top}
        isConnectable={false}
        className="!invisible"
      />
      <Handle
        type="target"
        position={Position.Bottom}
        isConnectable={false}
        className="!invisible"
      />
      <NodeShapeLayer type={node.type} />
      <div className="relative z-[1] flex w-full min-w-0 flex-col items-center gap-px overflow-hidden">
        <div className="flex w-full min-w-0 items-center justify-center gap-1.5">
          {/* Accent-tinted icon — same rule and rationale as node-chrome. */}
          <Icon
            aria-hidden="true"
            className="size-4 shrink-0 text-(--node-stroke)"
          />
          <span
            className={cn(
              "line-clamp-3 min-w-0 text-sm leading-tight font-medium break-words",
              node.type === "codeElement" && "font-mono",
            )}
          >
            {node.name}
          </span>
        </div>
        {/* text-node-meta on the coloured fills — same rule and measured
            ratios as node-chrome (which also explains the dropped /80). */}
        <span className="w-full truncate text-[10px] leading-tight text-node-meta">
          [{meta}]
        </span>
        {/* THE DESCRIPTION IS NOT DRAWN HERE. It used to be, clamped to one
            line, which for every description worth writing meant a sentence
            cut mid-word: "Validates the request and…", "Collections:
            templates,…". A clipped sentence is worse than no sentence — it
            costs the same height and delivers nothing a reader can use — and
            it competed with the two lines that CAN be read whole. The full
            text is one click away in the detail panel, and already in this
            element's `title` for a hover. */}
      </div>
      {/* Hover outline — always mounted, opacity-only transition. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-1 z-[2] rounded-[inherit] opacity-0 ring-2 ring-primary/50 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
      />
      {/* Selection ring — lit by the canvas's selection stylesheet (under
          prefers-reduced-motion only; motion users get the outline below). */}
      <span
        aria-hidden="true"
        className="viewer-node-selected-ring pointer-events-none absolute -inset-1 z-[2] rounded-[inherit] opacity-0 ring-2 ring-primary transition-opacity duration-150"
      />
      {/*
       * Selection outline — the ONE moving light while an element is
       * selected (its connectors stay emphasised but static).
       * Always mounted (selection must never remount nodes — see the canvas's
       * projection notes) and invisible until the canvas's selection
       * stylesheet lights it AND starts its animation; nothing here animates
       * for the other nodes. Same recipe as viewer-edge.tsx: the perimeter
       * normalised to pathLength=100, a static base stroke as the constant
       * "selected" affordance, then glow → tail → head dash bands riding the
       * SAME keyframes and 1600ms clock as the edge-selection comet,
       * recoloured primary → accent by one per-node gradient. The stroke
       * rides the border line itself, well clear of the padded label.
       */}
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${node.size.width} ${node.size.height}`}
        preserveAspectRatio="none"
        className="viewer-node-outline pointer-events-none absolute inset-0 z-[2] size-full overflow-visible"
      >
        <defs>
          {/*
           * Built from the node's OWN role colour (`--node-stroke`, set per
           * node by node-colors.ts), not a fixed ramp: a database's comet
           * runs teal, a person's violet, so the moving light belongs to the
           * thing it is tracing. A rainbow was tried and rejected — it read as
           * decoration bolted on rather than as this node being selected, and
           * it fought the palette the canvas had just been given.
           */}
          <linearGradient id={outlineGradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--node-stroke, var(--primary))" />
            <stop offset="55%" stopColor="var(--node-stroke, var(--primary))" />
            <stop
              offset="100%"
              stopColor="color-mix(in oklch, var(--node-stroke, var(--primary)) 35%, var(--accent))"
            />
          </linearGradient>
        </defs>
        <path d={outline} className="viewer-node-outline-base" />
        <path
          d={outline}
          pathLength={100}
          stroke={`url(#${outlineGradientId})`}
          className="viewer-node-flow-glow"
        />
        <path
          d={outline}
          pathLength={100}
          stroke={`url(#${outlineGradientId})`}
          className="viewer-node-flow-tail"
        />
        <path
          d={outline}
          pathLength={100}
          stroke={`url(#${outlineGradientId})`}
          className="viewer-node-flow-head"
        />
      </svg>
    </>
  );

  const detailLabel =
    `${node.name} — ${meta}. Show details` +
    (drill !== null ? ". Double-click to zoom in" : "");

  return (
    // The lift lives on this wrapper so body and chip travel together; the
    // one-shot entrance (viewer-node-enter, choreographed by the canvas
    // stylesheet with a per-node --viewer-enter-delay) animates the same
    // element — inner wrapper, never the React Flow wrapper, whose
    // transform IS the node's position.
    <div className="viewer-node-enter group relative size-full transition-transform duration-150 will-change-transform focus-within:-translate-y-0.5 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:focus-within:translate-y-0 motion-reduce:hover:translate-y-0">
      <button
        type="button"
        aria-label={detailLabel}
        title={node.description ?? `Show details for ${node.name}`}
        className={cn(
          frameClasses,
          "cursor-pointer",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas focus-visible:outline-none",
        )}
      >
        {/* Role-tinted glow under the hover/focus lift — replaces the old
            generic shadow-primary/10, so a database glows teal and a person
            violet (`.af-node-glow`, globals.css, has the full rationale
            including why only opacity transitions). Skipped for the SVG
            silhouettes exactly like shadow-sm — a rectangular glow would
            draw the box the cylinder/pipe shapes exist to avoid. */}
        {!svgSilhouette ? (
          <span
            aria-hidden="true"
            className="af-node-glow pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none"
          />
        ) : null}
        {content}
      </button>
      {drill !== null ? (
        // The drill affordance: an independently focusable control, sibling
        // (never child) of the body button. Click and double-click both stop
        // here so drilling never doubles as selection.
        <button
          type="button"
          data-child-badge
          /* `childCount === 0` is reachable only on an EDITABLE canvas (the
             projection's two-rules note, project-nodes.ts): the author just
             nested this child and the chip is their way into it. The wording
             says "empty" rather than counting to zero, because a chip
             promising "0 elements" reads as a broken count — the affordance
             is the way in, not the contents. */
          aria-label={
            drill.childCount > 0
              ? `Zoom into ${node.name} — ${drill.childLevelLabel} view, ${drill.childCount} elements`
              : `Zoom into ${node.name} — ${drill.childLevelLabel} view, empty — add elements there`
          }
          title={
            drill.childCount > 0
              ? `Zoom into ${node.name}`
              : `Zoom into ${node.name} and fill it in`
          }
          onClick={(event) => {
            event.stopPropagation();
            drillInto(node.id);
          }}
          onDoubleClick={(event) => event.stopPropagation()}
          className={cn(
            "absolute -right-2 -bottom-2 z-[3] flex cursor-zoom-in items-center gap-1 rounded-full border border-primary/40 bg-node px-1.5 py-0.5 text-[10px] leading-none font-medium text-primary shadow-sm",
            "transition-colors duration-150 hover:border-primary hover:bg-primary hover:text-primary-foreground",
            "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas focus-visible:outline-none",
          )}
        >
          <ZoomIn aria-hidden="true" className="size-3" />
          {/* The count only when there is one — the icon alone is the honest
              face for an empty child (see the aria-label note above). */}
          {drill.childCount > 0 ? drill.childCount : null}
        </button>
      ) : null}
      {refSourceLevel !== null ? (
        <RefBadge
          sourceLevel={refSourceLevel}
          nodeName={node.name}
          onOpen={() => openReference(node.id)}
        />
      ) : null}
      {/* The connect grip, top-right — the drill chip owns bottom-right and
          the ref badge bottom-left. Presence-gated on the context's connect
          actions, so a read-only or locked canvas renders no grip, never a
          disabled one. A `^ref` placeholder keeps it: an edge is a local
          fact of this diagram, the very thing a mirror exists to draw (the
          grouping's argument, restated at `connectTargets`). */}
      {connect !== null ? (
        <ViewerConnectGrip node={node} connect={connect} />
      ) : null}
    </div>
  );
}

export const ViewerNode = memo(ViewerNodeInner);

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

import { memo, useId } from "react";
import { ZoomIn } from "lucide-react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import { cn } from "@/lib/utils";
import type { C4Level, C4Node, C4NodeType } from "@/types";

import { RefBadge } from "@/features/editor/components/nodes/ref-badge";
import { resolveIcon } from "@/features/editor/lib/icons/registry";
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

export interface ViewerNodeData extends Record<string, unknown> {
  /** The (frozen) model node. */
  node: C4Node;
  /** The containing diagram's level — a node's level is never stored on it. */
  level: C4Level;
  /**
   * Present ⇔ the node has a child diagram to zoom into. Shapes the chip;
   * the chip's own click handler calls `onDrill` directly (with propagation
   * stopped, so the body's selection path never fires alongside it).
   */
  drill: {
    childDiagramId: string;
    childLevelLabel: string;
    childCount: number;
  } | null;
  /** Drill into this node's child diagram — the canvas owns navigation. */
  onDrill: (nodeId: string) => void;
  isPlaceholder: boolean;
  /**
   * For a placeholder, the LEVEL of the diagram it references — drives the
   * `↑ <level>` chip. Null when first-class, or when the referenced diagram
   * cannot be resolved (a dangling `^ref`).
   */
  refSourceLevel: C4Level | null;
  /** Follow this placeholder to the node it names, and select it there. */
  onOpenReference: (nodeId: string) => void;
}

export type ViewerFlowNode = Node<ViewerNodeData, "c4">;

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
  const {
    node,
    drill,
    onDrill,
    isPlaceholder,
    refSourceLevel,
    onOpenReference,
  } = data;
  const { def } = resolveIcon(node);
  const Icon = def.Svg;

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
        {node.description !== undefined && node.description !== "" ? (
          <span className="line-clamp-1 w-full text-[10px] leading-tight break-words text-node-meta">
            {node.description}
          </span>
        ) : null}
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
          aria-label={`Zoom into ${node.name} — ${drill.childLevelLabel} view, ${drill.childCount} elements`}
          title={`Zoom into ${node.name}`}
          onClick={(event) => {
            event.stopPropagation();
            onDrill(node.id);
          }}
          onDoubleClick={(event) => event.stopPropagation()}
          className={cn(
            "absolute -right-2 -bottom-2 z-[3] flex cursor-zoom-in items-center gap-1 rounded-full border border-primary/40 bg-node px-1.5 py-0.5 text-[10px] leading-none font-medium text-primary shadow-sm",
            "transition-colors duration-150 hover:border-primary hover:bg-primary hover:text-primary-foreground",
            "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas focus-visible:outline-none",
          )}
        >
          <ZoomIn aria-hidden="true" className="size-3" />
          {drill.childCount}
        </button>
      ) : null}
      {refSourceLevel !== null ? (
        <RefBadge
          sourceLevel={refSourceLevel}
          nodeName={node.name}
          onOpen={() => onOpenReference(node.id)}
        />
      ) : null}
    </div>
  );
}

export const ViewerNode = memo(ViewerNodeInner);

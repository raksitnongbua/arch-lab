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

import { memo } from "react";
import { ZoomIn } from "lucide-react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import { cn } from "@/lib/utils";
import type { C4Level, C4Node } from "@/types";

import { resolveIcon } from "@/features/editor/lib/icons/registry";
import {
  NodeShapeLayer,
  SHAPE_WRAPPER_CLASSES,
  hasSvgSilhouette,
} from "@/features/editor/components/nodes/node-shapes";

import { TYPE_LABEL } from "../lib/labels";

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
}

export type ViewerFlowNode = Node<ViewerNodeData, "c4">;

function ViewerNodeInner({
  data,
}: NodeProps<ViewerFlowNode>): React.JSX.Element {
  const { node, drill, onDrill, isPlaceholder } = data;
  const { def } = resolveIcon(node);
  const Icon = def.Svg;

  const meta =
    node.technology !== undefined && node.technology !== ""
      ? `${TYPE_LABEL[node.type]}: ${node.technology}`
      : TYPE_LABEL[node.type];

  const svgSilhouette = hasSvgSilhouette(node.type);

  const frameClasses = cn(
    "relative flex size-full flex-col items-center justify-center px-3 py-1.5 text-center text-node-foreground",
    SHAPE_WRAPPER_CLASSES[node.type],
    !svgSilhouette && "shadow-sm",
    node.type === "database" && "pt-4",
    node.type === "queue" && "px-8",
    svgSilhouette && "rounded-lg",
    isPlaceholder && "opacity-60",
    !isPlaceholder && node.type === "externalSystem" && "opacity-90",
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
          <Icon aria-hidden="true" className="size-4 shrink-0" />
          <span
            className={cn(
              "line-clamp-3 min-w-0 text-sm leading-tight font-medium break-words",
              node.type === "codeElement" && "font-mono",
            )}
          >
            {node.name}
          </span>
        </div>
        <span className="w-full truncate text-[10px] leading-tight text-muted-foreground">
          [{meta}]
        </span>
        {node.description !== undefined && node.description !== "" ? (
          <span className="line-clamp-1 w-full text-[10px] leading-tight break-words text-muted-foreground/80">
            {node.description}
          </span>
        ) : null}
      </div>
      {/* Hover outline — always mounted, opacity-only transition. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-1 z-[2] rounded-[inherit] opacity-0 ring-2 ring-primary/50 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
      />
      {/* Selection ring — lit by the canvas's selection stylesheet. */}
      <span
        aria-hidden="true"
        className="viewer-node-selected-ring pointer-events-none absolute -inset-1 z-[2] rounded-[inherit] opacity-0 ring-2 ring-primary transition-opacity duration-150"
      />
    </>
  );

  const detailLabel =
    `${node.name} — ${meta}. Show details` +
    (drill !== null ? ". Double-click to zoom in" : "");

  return (
    // The lift lives on this wrapper so body and chip travel together.
    <div className="group relative size-full transition-transform duration-150 will-change-transform focus-within:-translate-y-0.5 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:focus-within:translate-y-0 motion-reduce:hover:translate-y-0">
      <button
        type="button"
        aria-label={detailLabel}
        title={node.description ?? `Show details for ${node.name}`}
        className={cn(
          frameClasses,
          "cursor-pointer",
          !svgSilhouette &&
            "group-hover:shadow-lg group-hover:shadow-primary/10",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas focus-visible:outline-none",
        )}
      >
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
    </div>
  );
}

export const ViewerNode = memo(ViewerNodeInner);

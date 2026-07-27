"use client";

/**
 * The showcase's read-only node. Shares the editor's visual language — the
 * same per-type silhouettes (`node-shapes`) and the same 16-icon registry —
 * but carries none of its machinery: no handles, no selection, no rename, no
 * store.
 *
 * The drill affordance is the point of this file. A node with a child layer
 * renders as a real <button> (keyboard-reachable, honest semantics) with a
 * persistent "N ▸ zoom" chip; a leaf renders as a plain figure and never
 * pretends to be clickable.
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

export interface ShowcaseNodeData extends Record<string, unknown> {
  /** The (frozen) model node. */
  node: C4Node;
  /** The containing diagram's level — a node's level is never stored on it. */
  level: C4Level;
  /**
   * Present ⇔ the node has a child diagram to zoom into. Navigation itself
   * happens in the canvas's onNodeClick (see showcase-canvas.tsx — the node
   * wrapper only receives pointer events because the flow declares that
   * handler); this object only shapes the affordance.
   */
  drill: {
    childDiagramId: string;
    childLevelLabel: string;
    childCount: number;
  } | null;
  isPlaceholder: boolean;
}

export type ShowcaseFlowNode = Node<ShowcaseNodeData, "c4">;

function ShowcaseNodeInner({
  data,
}: NodeProps<ShowcaseFlowNode>): React.JSX.Element {
  const { node, drill, isPlaceholder } = data;
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
       * ShowcaseEdge recomputes floating anchors itself and never draws from
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
    </>
  );

  if (drill === null) {
    // Leaf: a plain figure. No cursor change, no hover lift, not focusable.
    return (
      <div title={node.description} className={frameClasses}>
        {content}
      </div>
    );
  }

  // Drillable: a genuine button so click, Enter, Space, and Tab all work for
  // free, with an unmistakable persistent chip naming what a click does.
  // No onClick of its own — the click (mouse, or synthesized by Enter/Space)
  // bubbles to the node wrapper and the canvas's onNodeClick performs the
  // drill, so navigation has exactly one code path.
  return (
    <button
      type="button"
      aria-label={`Zoom into ${node.name} — ${drill.childLevelLabel} view, ${drill.childCount} elements`}
      title={`Zoom into ${node.name}`}
      className={cn(
        frameClasses,
        "group cursor-zoom-in transition-[transform,box-shadow] duration-150 will-change-transform",
        "hover:-translate-y-0.5 focus-visible:-translate-y-0.5",
        !svgSilhouette && "hover:shadow-lg hover:shadow-primary/10",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas focus-visible:outline-none",
      )}
    >
      {content}
      {/* Hover/focus outline — always mounted, opacity-only transition. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-1 z-[2] rounded-[inherit] opacity-0 ring-2 ring-primary/50 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
      />
      {/* The affordance chip: only drillable nodes carry one. */}
      <span
        aria-hidden="true"
        className="absolute -right-2 -bottom-2 z-[3] flex items-center gap-1 rounded-full border border-primary/40 bg-node px-1.5 py-0.5 text-[10px] leading-none font-medium text-primary shadow-sm transition-colors duration-150 group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground"
      >
        <ZoomIn className="size-3" />
        {drill.childCount}
      </span>
    </button>
  );
}

export const ShowcaseNode = memo(ShowcaseNodeInner);

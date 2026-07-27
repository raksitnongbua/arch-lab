"use client";

/**
 * Read-only edge: the editor's floating-anchor geometry (edges re-anchor to
 * whichever sides face each other) and parallel-offset curves, minus label
 * editing, selection, and shortcuts.
 */

import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  useInternalNode,
  type Edge,
  type EdgeProps,
  type InternalNode,
} from "@xyflow/react";

import type { C4Edge } from "@/types";

import {
  getFloatingAnchors,
  getParallelEdgePath,
  type NodeRect,
} from "@/features/editor/lib/edge-geometry";

export interface ShowcaseEdgeData extends Record<string, unknown> {
  edge: C4Edge;
  /** 0-based position within the set of edges sharing this endpoint pair. */
  parallelIndex: number;
  /** Size of that set. 1 ⇒ straight bezier; >1 ⇒ offset curves. */
  parallelCount: number;
}

export type ShowcaseFlowEdge = Edge<ShowcaseEdgeData, "c4">;

function internalNodeRect(node: InternalNode | undefined): NodeRect | null {
  if (!node) return null;
  const width = node.measured.width ?? node.width;
  const height = node.measured.height ?? node.height;
  if (width === undefined || height === undefined) return null;
  return {
    x: node.internals.positionAbsolute.x,
    y: node.internals.positionAbsolute.y,
    width,
    height,
  };
}

function ShowcaseEdgeInner({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  markerStart,
  data,
}: EdgeProps<ShowcaseFlowEdge>): React.JSX.Element {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const sourceRect = internalNodeRect(sourceNode);
  const targetRect = internalNodeRect(targetNode);
  const anchors =
    sourceRect !== null && targetRect !== null
      ? getFloatingAnchors(sourceRect, targetRect)
      : { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition };

  const { path, labelX, labelY } = getParallelEdgePath({
    ...anchors,
    parallelIndex: data?.parallelIndex ?? 0,
    parallelCount: data?.parallelCount ?? 1,
  });

  const label = data?.edge.label;
  const technology = data?.edge.technology;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        markerStart={markerStart}
        style={{
          stroke: "var(--edge)",
          strokeWidth: 1.5,
          strokeDasharray: data?.edge.style === "dashed" ? "6 4" : undefined,
        }}
      />
      {label !== undefined && label !== "" ? (
        <EdgeLabelRenderer>
          <div
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            className="pointer-events-none absolute z-[1] flex max-w-44 flex-col items-center rounded-md border border-border/70 bg-canvas/90 px-1.5 py-0.5 text-center leading-tight backdrop-blur-[2px]"
          >
            <span className="line-clamp-2 text-[10px] text-muted-foreground">
              {label}
            </span>
            {technology !== undefined && technology !== "" ? (
              <span className="truncate font-mono text-[9px] text-muted-foreground/70">
                [{technology}]
              </span>
            ) : null}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const ShowcaseEdge = memo(ShowcaseEdgeInner);

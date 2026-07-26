"use client";

/**
 * STUB — ownership transfers to T2-A in Batch 2.
 *
 * The exported TYPE surface (`C4EdgeData`, `C4FlowEdge`,
 * `C4EdgeComponentProps`) is the frozen contract from dev-handoff §4.3.
 * The component body is minimal: T2-A replaces it with parallel-edge offset
 * geometry, label chips and inline label editing.
 */

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";

import type { C4Edge } from "@/types";

/* ---- Contract (dev-handoff §4.3, frozen) --------------------------------- */

export interface C4EdgeData extends Record<string, unknown> {
  edge: C4Edge;
  isEditingLabel: boolean;
  /** 0-based position within the set of edges sharing this source|target pair. */
  parallelIndex: number;
  /** Size of that set. 1 ⇒ draw straight; >1 ⇒ offset the curve. */
  parallelCount: number;
}

export type C4FlowEdge = Edge<C4EdgeData, "c4">;
export type C4EdgeComponentProps = EdgeProps<C4FlowEdge>;

/* ---- Stub rendering (replaced wholesale by T2-A) ------------------------- */

export function C4EdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  markerStart,
  selected,
  data,
}: C4EdgeComponentProps) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        markerStart={markerStart}
        style={{
          stroke: selected ? "var(--ring)" : "var(--edge)",
          strokeWidth: selected ? 2 : 1.5,
          strokeDasharray: data?.edge.style === "dashed" ? "6 4" : undefined,
        }}
      />
      {data?.edge.label ? (
        <EdgeLabelRenderer>
          <span
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            className="pointer-events-none absolute rounded-sm border border-border bg-popover px-1.5 py-0.5 text-[11px] text-popover-foreground"
          >
            {data.edge.label}
          </span>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

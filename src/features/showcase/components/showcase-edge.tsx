"use client";

/**
 * Read-only edge: the editor's floating-anchor geometry (edges re-anchor to
 * whichever sides face each other) and parallel-offset curves, minus label
 * editing and shortcuts — plus the ONE interaction the showcase adds on top:
 * click a connector to select it and inspect the relationship.
 *
 * Selection visuals are class-driven (`showcase-edge-*`), with the actual CSS
 * — hover emphasis, dim cross-fade, the marching-dash flow animation and its
 * `prefers-reduced-motion` fallback — defined once in showcase-canvas.tsx, so
 * no component ever re-checks the media query.
 *
 * The label chip is a real <button>: it is the keyboard path into edge
 * selection (edges' SVG paths are not tabbable in a view-only flow) and a
 * much larger click target than a 1.5px stroke. Mouse users can also click
 * the path itself — the canvas declares `onEdgeClick`, which is what makes
 * React Flow give edge wrappers pointer events at all when every interactive
 * flag is off (same wall, and same fix, as node drilling).
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

import { cn } from "@/lib/utils";
import type { C4Edge } from "@/types";

import {
  getFloatingAnchors,
  getParallelEdgePath,
  type NodeRect,
} from "@/features/editor/lib/edge-geometry";

/** How a connector renders relative to the current selection. */
export type EdgeEmphasis = "idle" | "selected" | "dimmed";

export interface ShowcaseEdgeData extends Record<string, unknown> {
  edge: C4Edge;
  /** 0-based position within the set of edges sharing this endpoint pair. */
  parallelIndex: number;
  /** Size of that set. 1 ⇒ straight bezier; >1 ⇒ offset curves. */
  parallelCount: number;
  /** Endpoint node names, for honest accessible labelling. */
  sourceName: string;
  targetName: string;
  emphasis: EdgeEmphasis;
  /** Toggle this edge's selection — the canvas owns the state. */
  onSelect: (edgeId: string) => void;
}

export type ShowcaseFlowEdge = Edge<ShowcaseEdgeData, "c4">;

/** Generous invisible hit stroke — a 1.5px line is not a click target. */
const EDGE_INTERACTION_WIDTH = 24;

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
  const emphasis = data?.emphasis ?? "idle";
  const isSelected = emphasis === "selected";
  const isDimmed = emphasis === "dimmed";

  const joiner = data?.edge.direction === "bidirectional" ? "and" : "to";
  const chipText = label || technology || "Unlabelled relationship";
  const accessibleName =
    `Relationship: ${data?.sourceName ?? source} ${joiner} ` +
    `${data?.targetName ?? target}${label ? ` — ${label}` : ""}. ` +
    (isSelected ? "Selected." : "Select to see details.");

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        markerStart={markerStart}
        interactionWidth={EDGE_INTERACTION_WIDTH}
        className={cn(
          "showcase-edge-base",
          isSelected && "showcase-edge-base-selected",
          isDimmed && "showcase-edge-base-dimmed",
        )}
        style={{
          strokeDasharray: data?.edge.style === "dashed" ? "6 4" : undefined,
        }}
      />
      {isSelected ? (
        // The flow overlay: dashes marching source → target along the exact
        // same path. Pure stroke animation — the CSS hides it entirely and
        // keeps only the static emphasis under prefers-reduced-motion.
        <path
          d={path}
          fill="none"
          aria-hidden="true"
          className="showcase-edge-march pointer-events-none"
        />
      ) : null}
      <EdgeLabelRenderer>
        <div
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
          className="pointer-events-none absolute z-[1]"
        >
          <button
            type="button"
            aria-label={accessibleName}
            aria-pressed={isSelected}
            title={
              isSelected ? "Deselect relationship" : "Inspect relationship"
            }
            onClick={(event) => {
              event.stopPropagation();
              data?.onSelect(id);
            }}
            className={cn(
              "pointer-events-auto flex max-w-44 cursor-pointer flex-col items-center rounded-md border px-1.5 py-0.5 text-center leading-tight backdrop-blur-[2px]",
              "transition-[opacity,border-color,box-shadow] duration-150",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-canvas focus-visible:outline-none",
              isSelected
                ? "border-primary bg-canvas/95 shadow-md shadow-primary/10"
                : "border-border/70 bg-canvas/90 hover:border-primary/60",
              isDimmed && "opacity-25 hover:opacity-100",
            )}
          >
            <span
              className={cn(
                "line-clamp-2 text-[10px]",
                isSelected
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {chipText}
            </span>
            {technology !== undefined && technology !== "" ? (
              <span className="truncate font-mono text-[9px] text-muted-foreground/70">
                [{technology}]
              </span>
            ) : null}
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const ShowcaseEdge = memo(ShowcaseEdgeInner);

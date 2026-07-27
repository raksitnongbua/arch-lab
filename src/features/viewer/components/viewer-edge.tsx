"use client";

/**
 * Read-only edge: the editor's floating-anchor geometry (edges re-anchor to
 * whichever sides face each other) and parallel-offset curves, minus label
 * editing and shortcuts — plus the ONE interaction the viewer adds on top:
 * click a connector to select it and inspect the relationship.
 *
 * Selection visuals are class-driven (`viewer-edge-*`), with the actual CSS
 * — hover emphasis, dim cross-fade, the flowing-gradient animation and its
 * `prefers-reduced-motion` fallback — defined once in viewer-canvas.tsx, so
 * no component ever re-checks the media query.
 *
 * The selected-edge flow treatment: a `userSpaceOnUse` linear gradient
 * oriented along this edge's own anchors paints THREE overlay paths that
 * reuse the exact bezier `d`. `pathLength={100}` normalises dash arithmetic,
 * so each overlay is a dash "band" whose leading edge travels source → target
 * along the true curve (never a straight-line approximation) while the fixed
 * gradient recolours it in flight. Stacked bands of decreasing length build
 * the comet falloff; a wide blurred one underneath is the glow. The arrowhead
 * joins in via a private pulsing <marker> swapped in only while selected.
 * All ids come from useId, so several selected instances could never collide.
 *
 * The label chip is a real <button>: it is the keyboard path into edge
 * selection (edges' SVG paths are not tabbable in a view-only flow) and a
 * much larger click target than a 1.5px stroke. Mouse users can also click
 * the path itself — the canvas declares `onEdgeClick`, which is what makes
 * React Flow give edge wrappers pointer events at all when every interactive
 * flag is off (same wall, and same fix, as node drilling).
 */

import { memo, useId } from "react";
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

export interface ViewerEdgeData extends Record<string, unknown> {
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

export type ViewerFlowEdge = Edge<ViewerEdgeData, "c4">;

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

function ViewerEdgeInner({
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
}: EdgeProps<ViewerFlowEdge>): React.JSX.Element {
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

  // Stable per-instance SVG ids (sanitised: useId's delimiters are not safe
  // inside url(#…) references). Duplicate gradient/marker ids across edges
  // would silently repaint the wrong instance, so these are never shared.
  const flowKey = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const gradientId = `viewer-flow-grad-${flowKey}`;
  const arrowId = `viewer-flow-arrow-${flowKey}`;

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
        // While selected, the stock arrowheads hand over to this edge's own
        // pulsing marker so the tip brightens in sympathy with the band
        // arriving — a live gradient line ending in a dull static arrow is
        // exactly the unfinished look this avoids. Geometry (viewBox, ref
        // point, strokeWidth units) mirrors React Flow's ArrowClosed marker
        // one-to-one, so the swap never moves the tip by a pixel.
        markerEnd={
          isSelected && markerEnd !== undefined ? `url(#${arrowId})` : markerEnd
        }
        markerStart={
          isSelected && markerStart !== undefined
            ? `url(#${arrowId})`
            : markerStart
        }
        interactionWidth={EDGE_INTERACTION_WIDTH}
        className={cn(
          "viewer-edge-base",
          isSelected && "viewer-edge-base-selected",
          isDimmed && "viewer-edge-base-dimmed",
        )}
        style={{
          strokeDasharray: data?.edge.style === "dashed" ? "6 4" : undefined,
        }}
      />
      {isSelected ? (
        // The flow overlay: one fixed gradient along this edge's anchors,
        // painted onto three dash bands that ride the exact same bezier
        // (pathLength normalises all dash maths to 0–100). Glow → tail →
        // head share one leading edge, so they read as a single comet whose
        // colour shifts primary → accent as it approaches the arrowhead.
        // Pure stroke animation — under prefers-reduced-motion the CSS stops
        // the travel and leaves the full-length gradient as static emphasis.
        <g aria-hidden="true" className="pointer-events-none">
          <defs>
            <linearGradient
              id={gradientId}
              gradientUnits="userSpaceOnUse"
              x1={anchors.sourceX}
              y1={anchors.sourceY}
              x2={anchors.targetX}
              y2={anchors.targetY}
            >
              <stop offset="0%" stopColor="var(--primary)" />
              <stop offset="55%" stopColor="var(--primary)" />
              <stop offset="100%" stopColor="var(--accent)" />
            </linearGradient>
            <marker
              id={arrowId}
              markerWidth="18"
              markerHeight="18"
              viewBox="-10 -10 20 20"
              markerUnits="strokeWidth"
              orient="auto-start-reverse"
              refX="0"
              refY="0"
            >
              <polyline
                className="viewer-edge-flow-arrow"
                points="-5,-4 0,0 -5,4 -5,-4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </marker>
          </defs>
          <path
            d={path}
            pathLength={100}
            stroke={`url(#${gradientId})`}
            className="viewer-edge-flow viewer-edge-flow-glow"
          />
          <path
            d={path}
            pathLength={100}
            stroke={`url(#${gradientId})`}
            className="viewer-edge-flow viewer-edge-flow-tail"
          />
          <path
            d={path}
            pathLength={100}
            stroke={`url(#${gradientId})`}
            className="viewer-edge-flow viewer-edge-flow-head"
          />
        </g>
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

export const ViewerEdge = memo(ViewerEdgeInner);

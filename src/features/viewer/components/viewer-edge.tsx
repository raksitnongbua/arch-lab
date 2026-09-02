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
 * The flow treatment (selected edge only — a selected NODE animates its own
 * outline instead, see viewer-node.tsx, and its touching edges stay static):
 * a `userSpaceOnUse` linear gradient oriented along this edge's own anchors
 * paints THREE overlay paths that reuse the exact bezier `d`.
 * `pathLength={100}` normalises dash arithmetic, so each overlay is a dash
 * "band" whose leading edge travels source → target along the true curve
 * (never a straight-line approximation) while the fixed gradient recolours it
 * in flight. Stacked bands of decreasing length build the comet falloff; a
 * wide blurred one underneath is the glow. The arrowhead joins in via a
 * private pulsing <marker> swapped in only while the flow is showing.
 * All ids come from useId, so several live instances can never collide.
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
import { EDGE_BASE_DASH } from "../lib/canvas-constants";
import { VIEWER_DURATIONS } from "../lib/motion";
import type { C4Edge } from "@/types";

import {
  getFloatingAnchors,
  getParallelEdgePath,
  type LabelBias,
  type NodeRect,
} from "@/features/editor/lib/edge-geometry";

/**
 * How a connector renders relative to the current selection. Edges touching
 * a selected NODE stay "idle" (full strength — the dimming of everything else
 * is what emphasises them); only a selected EDGE animates.
 */
export type EdgeEmphasis = "idle" | "selected" | "dimmed";

/**
 * How far a chip recedes while another relationship is selected. Matches the
 * connector dim in `viewer-canvas.tsx`'s `EDGE_INTERACTION_CSS` — the line and
 * the words naming it have to fade together, or the reader is left with a
 * floating sentence over an empty canvas.
 */
const EDGE_CHIP_DIM_OPACITY = 0.2;

export interface ViewerEdgeData extends Record<string, unknown> {
  edge: C4Edge;
  /** 0-based position within the set of edges sharing this endpoint pair. */
  parallelIndex: number;
  /** Size of that set. 1 ⇒ straight bezier; >1 ⇒ offset curves. */
  parallelCount: number;
  /** Slides the label off a shared endpoint (`labelBiasByEdgeId`). */
  labelBias: LabelBias;
  /**
   * Where the chip actually sits, from the canvas's whole-diagram placement
   * pass (`lib/edge-label-placement`). Null when this relationship has nothing
   * to say and so draws no chip — never a signal to fall back silently: the
   * anchor is only used if a placement is genuinely absent, which for a
   * labelled edge would mean the pass and this component disagree about which
   * edges have labels.
   */
  labelPlacement: { x: number; y: number; crowded: boolean } | null;
  /**
   * Boxes this connector must not cross — every element except its own two.
   * Handed down rather than read from React Flow's store here: an edge would
   * have to subscribe to every node's measured rect to work it out, which is
   * one subscription per edge for a list that only changes with the model.
   */
  obstacles: readonly { x: number; y: number; width: number; height: number }[];
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

/** Painted in order: the soft halo, the trail, then the bright head on top. */
const REST_BANDS = ["glow", "tail", "head"] as const;

/**
 * A stable phase offset for this edge's resting comet, in milliseconds.
 *
 * An FNV-1a hash of the edge id rather than its position in the array: an
 * index changes the moment an edge is added or the sort changes, which would
 * re-stagger every other connector on the canvas for no reason the reader
 * could see.
 */
function restPhaseMs(edgeId: string, cycleMs: number): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < edgeId.length; i += 1) {
    hash ^= edgeId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % cycleMs;
}

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
    labelBias: data?.labelBias ?? 0,
    obstacles: data?.obstacles,
  });

  // Stable per-instance SVG ids (sanitised: useId's delimiters are not safe
  // inside url(#…) references). Duplicate gradient/marker ids across edges
  // would silently repaint the wrong instance, so these are never shared.
  const flowKey = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const gradientId = `viewer-flow-grad-${flowKey}`;
  const arrowId = `viewer-flow-arrow-${flowKey}`;

  const chipX = data?.labelPlacement?.x ?? labelX;
  const chipY = data?.labelPlacement?.y ?? labelY;
  const label = data?.edge.label;
  const technology = data?.edge.technology;
  const emphasis = data?.emphasis ?? "idle";
  const isSelected = emphasis === "selected";
  const isDimmed = emphasis === "dimmed";
  // The comet flows on the selected edge alone — a selected NODE runs its
  // own outline comet (viewer-node.tsx) while its touching edges hold still.
  const showFlow = isSelected;
  // An ASYNC relationship is already drawn dashed, and that dash carries
  // meaning. Laying the drift overlay on top of it put TWO dash rhythms on one
  // curve — the base's `6 4` in pixels against the overlay's normalised `5 9`,
  // which never line up and cannot be made to, so the moving dashes landed
  // half in the static gaps and half on the static dashes. A dashed edge
  // marches its own pattern instead (below): one rhythm, still moving, and
  // marching a line that is already dashed cannot change what it means.
  const isDashed = data?.edge.style === "dashed";
  // The resting drift runs on every SOLID connector that is neither escalated
  // to the comet nor pushed into the background.
  const restingMotion = !isSelected && !isDimmed;
  const showRestingDash = restingMotion && !isDashed;
  const showDashMarch = restingMotion && isDashed;
  const restDelayMs = restPhaseMs(id, VIEWER_DURATIONS.edgeRest);

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
          showFlow && markerEnd !== undefined ? `url(#${arrowId})` : markerEnd
        }
        markerStart={
          showFlow && markerStart !== undefined
            ? `url(#${arrowId})`
            : markerStart
        }
        interactionWidth={EDGE_INTERACTION_WIDTH}
        className={cn(
          "viewer-edge-base",
          showFlow && "viewer-edge-base-selected",
          isDimmed && "viewer-edge-base-dimmed",
          showDashMarch && "viewer-edge-base-marching",
        )}
        style={{
          strokeDasharray: isDashed ? EDGE_BASE_DASH : undefined,
        }}
      />
      {showRestingDash ? (
        /*
         * The resting COMET on a solid connector — the same three-band shape
         * the sequence viewer gives a solid message, which is where this look
         * comes from and why the two now read as one product.
         *
         * WHY NOT THE REPEATING DASH IT REPLACES. A pattern that covers the
         * whole line has to be drawn over the whole line, and an overlay wide
         * enough to see is wide enough to blot out the stroke beneath it —
         * that is exactly how a solid connector came to look broken. One
         * travelling band touches any given millimetre for a moment and leaves
         * it alone the rest of the time, so the line underneath is never in
         * question. Direction still reads, from the direction of travel.
         *
         * SUBORDINATE TO SELECTION, deliberately. The selected comet is a
         * primary→accent gradient at stroke-width 7/2.5/3 with a pulsing
         * arrowhead; this one is edge-toned, thin, and slow. If resting motion
         * competed with selection, selecting an edge would stop meaning
         * anything.
         *
         * `pathLength={100}` normalises the dash maths so a short connector
         * and a long one show the same band, not one stubby dot and one streak.
         */
        <g aria-hidden="true" className="viewer-edge-rest pointer-events-none">
          {REST_BANDS.map((band) => (
            <path
              key={band}
              d={path}
              pathLength={100}
              className={`viewer-edge-rest-band viewer-edge-rest-${band}`}
              /*
               * Stagger, so twenty connectors do not pulse in lockstep — which
               * reads as one mechanism ticking rather than a system with
               * traffic on it. The offset is derived from the edge id, so it
               * is stable across re-renders and re-layouts (a random or
               * index-based delay would reshuffle the whole diagram whenever
               * an edge was added). NEGATIVE, so every band starts already
               * mid-flight instead of the diagram sitting dark for a beat.
               */
              style={{ animationDelay: `-${restDelayMs}ms` }}
            />
          ))}
        </g>
      ) : null}
      {showFlow ? (
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
          /* ADDRESSABLE FROM OUTSIDE, because a chip does not live in its own
           * edge's <g>: React Flow portals every label into one sibling
           * `.react-flow__edgelabel-renderer` div. So neither focus effect
           * could ever reach a chip through the edge it belongs to — dimming
           * `.react-flow__edge` left every label at full strength above the
           * lines that had just receded, which reads as the labels being the
           * thing in focus. The id is what lets the canvas's reveal dim them
           * with their own connectors. */
          data-edge-id={id}
          style={{
            /* Selection's own dim, which had the same hole: `emphasis` only
             * ever reached the path. Kept here rather than in the canvas's
             * stylesheet because this component already knows its emphasis,
             * and one dim per surface is one too few, not one too many. */
            opacity: isDimmed ? EDGE_CHIP_DIM_OPACITY : undefined,
            /* The placement pass's answer, which has cleared the node boxes
             * and the other chips. `labelX`/`labelY` — the raw curve midpoint
             * — is the fallback for an edge the pass never saw. */
            transform: `translate(-50%, -50%) translate(${chipX}px, ${chipY}px)`,
          }}
          className="viewer-edge-chip pointer-events-none absolute z-[1]"
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

"use client";

/**
 * The C4 edge component (T2-A — AF-E1-S5 parallel offset, AF-E1-S6 label
 * editing, AF-E3-S3 rendering).
 *
 * The exported TYPE surface (`C4EdgeData`, `C4FlowEdge`,
 * `C4EdgeComponentProps`) is the frozen contract from dev-handoff §4.3.
 *
 * Geometry (including the symmetric parallel-edge offset) comes from
 * `lib/edge-geometry.ts`; arrowheads (`markerEnd`/`markerStart` per
 * `direction`) come from the `use-canvas-nodes` projection. `F2`/`Enter` on a
 * solely-selected edge begin label editing, mirroring nodes.
 */

import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import {
  BaseEdge,
  useInternalNode,
  type Edge,
  type EdgeProps,
  type InternalNode,
} from "@xyflow/react";

import type { C4Edge } from "@/types";

import {
  useShortcuts,
  type ShortcutBinding,
  type ShortcutContext,
} from "../../hooks/use-keyboard-shortcuts";
import {
  getFloatingAnchors,
  getParallelEdgePath,
  type NodeRect,
} from "../../lib/edge-geometry";
import { duration } from "../../lib/motion";
import { useEditorStore } from "../../state";
import {
  ensureCanvasMotionRuntime,
  isFirstPresentation,
} from "../nodes/canvas-motion-runtime";
import { EdgeLabelChip } from "./edge-label";

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

/* ---- Component ------------------------------------------------------------ */

const NO_BINDINGS: ShortcutBinding[] = [];

/**
 * Bounds of an internal node in flow coordinates, or null before React Flow
 * has measured it. `positionAbsolute` tracks in-flight drags, so anchors
 * computed from this follow the node live, frame by frame — no DOM reads.
 */
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

export function C4EdgeComponent({
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
  selected,
  data,
}: C4EdgeComponentProps): React.JSX.Element {
  // Path-draw animation (AF-E6-S2): once, on the edge's first-ever
  // presentation, over `--motion-edge-draw` (200ms; 0 under reduced motion
  // via the frozen lib/motion.ts). While drawing, `pathLength={1}` +
  // `.af-edge-draw` (styles/canvas-motion.css) run the dashoffset sweep; on
  // animationend both are dropped so a dashed edge's own dasharray applies.
  const [drawing, setDrawing] = useState(
    () => isFirstPresentation("edge", id) && duration("edgeDraw") > 0,
  );

  // Installs the shared motion runtime (idempotent; nodes install it too,
  // but an edge render must not depend on a node having rendered first).
  useLayoutEffect(() => {
    ensureCanvasMotionRuntime();
  }, []);

  const handleAnimationEnd = useCallback(
    (event: React.AnimationEvent<SVGGElement>) => {
      if (event.animationName === "af-edge-draw") setDrawing(false);
    },
    [],
  );

  // Floating anchoring (see getFloatingAnchors): the four handles are drag
  // affordances only — the rendered edge re-anchors to whichever sides of the
  // two nodes face each other, from geometry React Flow already tracks in its
  // store (a few arithmetic ops per render — no DOM measurement, no memo
  // bookkeeping needed). The prop-based coordinates, which React Flow pins to
  // the first declared handle when the edge carries no handle id, are only a
  // fallback for the frame before a node is measured.
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

  const bindings = useMemo<ShortcutBinding[]>(() => {
    if (!selected) return NO_BINDINGS;
    const when = ({ store }: ShortcutContext) =>
      store.labelEdit === null &&
      store.selection.edgeIds.length === 1 &&
      store.selection.edgeIds[0] === id &&
      store.selection.nodeIds.length === 0;
    const run = ({ store }: ShortcutContext) =>
      store.beginLabelEdit({ kind: "edge", id });
    return [
      { id: `edge.rename.f2:${id}`, combo: "F2", when, run },
      { id: `edge.rename.enter:${id}`, combo: "Enter", when, run },
    ];
  }, [id, selected]);

  useShortcuts(bindings);

  return (
    <>
      {/* Double-click on the line (BaseEdge's interaction path bubbles here)
          begins label editing — the canvas wires node double-clicks only. */}
      <g
        onDoubleClick={(event) => {
          event.stopPropagation();
          useEditorStore.getState().beginLabelEdit({ kind: "edge", id });
        }}
        onAnimationEnd={handleAnimationEnd}
      >
        <BaseEdge
          id={id}
          path={path}
          markerEnd={markerEnd}
          markerStart={markerStart}
          interactionWidth={16}
          className={drawing ? "af-edge-draw" : undefined}
          pathLength={drawing ? 1 : undefined}
          style={{
            stroke: selected ? "var(--ring)" : "var(--edge)",
            strokeWidth: selected ? 2 : 1.5,
            // Suspended while drawing — the draw animation owns the dasharray.
            strokeDasharray:
              !drawing && data?.edge.style === "dashed" ? "6 4" : undefined,
          }}
        />
      </g>
      {data !== undefined ? (
        <EdgeLabelChip
          edge={data.edge}
          isEditing={data.isEditingLabel}
          labelX={labelX}
          labelY={labelY}
          selected={selected}
        />
      ) : null}
    </>
  );
}

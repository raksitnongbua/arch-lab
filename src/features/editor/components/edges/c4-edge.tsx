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

import { useMemo } from "react";
import { BaseEdge, type Edge, type EdgeProps } from "@xyflow/react";

import type { C4Edge } from "@/types";

import {
  useShortcuts,
  type ShortcutBinding,
  type ShortcutContext,
} from "../../hooks/use-keyboard-shortcuts";
import { getParallelEdgePath } from "../../lib/edge-geometry";
import { useEditorStore } from "../../state";
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
}: C4EdgeComponentProps): React.JSX.Element {
  const { path, labelX, labelY } = getParallelEdgePath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
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
      >
        <BaseEdge
          id={id}
          path={path}
          markerEnd={markerEnd}
          markerStart={markerStart}
          interactionWidth={16}
          style={{
            stroke: selected ? "var(--ring)" : "var(--edge)",
            strokeWidth: selected ? 2 : 1.5,
            strokeDasharray: data?.edge.style === "dashed" ? "6 4" : undefined,
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

"use client";

/**
 * Store model → React Flow projection (dev-handoff §4.2/§4.3, integration
 * risk R1). Nodes and edges are DERIVED from the editor store; React Flow
 * never owns model data. During a drag the canvas layers local positions on
 * top of this projection and commits exactly one `moveNodes` on drag stop.
 */

import { useMemo } from "react";
import { MarkerType, type EdgeMarker } from "@xyflow/react";

import {
  hasChildDiagram,
  isBoundaryPlaceholder,
  type C4NodeType,
} from "@/types";

import type { C4EdgeData, C4FlowEdge } from "../components/edges/c4-edge";
import type { C4FlowNode, C4NodeData } from "../components/nodes/c4-node";
import { labelBiasByEdgeId } from "../lib/edge-geometry";
import {
  selectChildCount,
  selectParallelEdgeGroups,
  useEditorStore,
} from "../state";

/**
 * Fallback icon slug per node type, using the 7 generic slugs from D15.
 * T2-A's icon registry (`DEFAULT_ICON_BY_TYPE`) is the authority once it
 * exists — these values must match it. `data.resolvedIcon` is a convenience;
 * the node component itself resolves through the registry (`resolveIcon`).
 */
const FALLBACK_ICON_BY_TYPE: Record<C4NodeType, string> = {
  person: "person",
  softwareSystem: "service",
  externalSystem: "external",
  container: "service",
  database: "database",
  queue: "queue",
  component: "service",
  codeElement: "service",
};

export interface CanvasProjection {
  nodes: C4FlowNode[];
  edges: C4FlowEdge[];
}

export function useCanvasNodes(): CanvasProjection {
  const model = useEditorStore((s) => s.model);
  const activeDiagramId = useEditorStore((s) => s.activeDiagramId);
  const selection = useEditorStore((s) => s.selection);
  const labelEdit = useEditorStore((s) => s.labelEdit);

  return useMemo<CanvasProjection>(() => {
    const diagram = model.diagrams[activeDiagramId];
    if (!diagram) return { nodes: [], edges: [] };

    // Consistent snapshot for the contract selectors that need full state.
    const state = useEditorStore.getState();
    const parallelGroups = selectParallelEdgeGroups(state);
    const labelBias = labelBiasByEdgeId(diagram.edges);
    const selectedNodeIds = new Set(selection.nodeIds);
    const selectedEdgeIds = new Set(selection.edgeIds);

    const nodes: C4FlowNode[] = diagram.nodes.map((node) => {
      const placeholder = isBoundaryPlaceholder(node);
      // A `childDiagramId` pointing at an EMPTY diagram is not a drill-down
      // affordance — a badge reading "0" advertises nothing to open. The badge
      // is gated on the child count, never on the pointer merely existing.
      // (`mod+ArrowDown` still drills in, so an empty child stays reachable.)
      const childCount = hasChildDiagram(node)
        ? selectChildCount(state, node.id)
        : 0;
      const data: C4NodeData = {
        node,
        level: diagram.level,
        hasChildren: childCount > 0,
        childCount,
        isPlaceholder: placeholder,
        // A dangling `^ref` (referenced diagram deleted) resolves to null and
        // simply renders no chip — never a crash, never a "↑ undefined".
        refSourceLevel:
          placeholder && node.externalRef !== undefined
            ? (model.diagrams[node.externalRef.diagramId]?.level ?? null)
            : null,
        isEditingLabel: labelEdit?.kind === "node" && labelEdit.id === node.id,
        resolvedIcon: node.icon ?? FALLBACK_ICON_BY_TYPE[node.type],
      };
      return {
        id: node.id,
        type: node.type,
        position: node.position,
        width: node.size.width,
        height: node.size.height,
        selected: selectedNodeIds.has(node.id),
        // Placeholders ARE draggable. "Read-only" means their identity is owned
        // elsewhere — name, type and technology mirror the original — but
        // `position` and `size` are per-diagram presentation and deliberately
        // NOT mirrored (see `REF_MIRRORED_KEYS`). Pinning them made every
        // reference land on the same spot with no way to separate them, which
        // is unusable in the one diagram whose whole job is layout.
        draggable: true,
        data,
      };
    });

    const edges: C4FlowEdge[] = diagram.edges.map((edge) => {
      const group = parallelGroups[edge.id] ?? { index: 0, count: 1 };
      const selected = selectedEdgeIds.has(edge.id);
      const marker: EdgeMarker = {
        type: MarkerType.ArrowClosed,
        color: selected ? "var(--ring)" : "var(--edge)",
        width: 18,
        height: 18,
      };
      const data: C4EdgeData = {
        edge,
        isEditingLabel: labelEdit?.kind === "edge" && labelEdit.id === edge.id,
        parallelIndex: group.index,
        parallelCount: group.count,
        labelBias: labelBias.get(edge.id) ?? 0,
      };
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "c4" as const,
        selected,
        markerEnd: edge.direction === "none" ? undefined : marker,
        markerStart: edge.direction === "bidirectional" ? marker : undefined,
        data,
      };
    });

    return { nodes, edges };
  }, [model, activeDiagramId, selection, labelEdit]);
}

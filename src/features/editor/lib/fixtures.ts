/**
 * Performance-fixture generator (T1-B acceptance: 150-node pan/drag at
 * ≥55fps). Not imported by production code — load it from the browser console
 * or a scratch page:
 *
 *   const { buildFixtureModel } = await import("@/features/editor/lib/fixtures");
 *   useEditorStore.getState().replaceModel(buildFixtureModel(150), { markSaved: false });
 */

import type { C4Diagram, C4Edge, C4Node, C4NodeType } from "@/types";

import { DEFAULT_NODE_SIZE } from "./canvas-constants";
import type { EditorModel } from "../state";

const CONTEXT_TYPES: readonly C4NodeType[] = [
  "softwareSystem",
  "person",
  "externalSystem",
];

/** Grid pitch between fixture nodes, multiples of 8 (D20). */
const PITCH_X = 224;
const PITCH_Y = 136;

export function buildFixtureModel(nodeCount = 150): EditorModel {
  const columns = Math.max(1, Math.ceil(Math.sqrt(nodeCount)));
  const nodes: C4Node[] = [];
  const edges: C4Edge[] = [];

  for (let i = 0; i < nodeCount; i += 1) {
    const id = `n-fixture-${String(i).padStart(3, "0")}`;
    nodes.push({
      id,
      type: CONTEXT_TYPES[i % CONTEXT_TYPES.length],
      name: `Fixture ${i + 1}`,
      position: {
        x: (i % columns) * PITCH_X,
        y: Math.floor(i / columns) * PITCH_Y,
      },
      size: { ...DEFAULT_NODE_SIZE },
    });
    if (i > 0) {
      const source = nodes[i - 1].id;
      edges.push({
        id: `e-${source}-${id}`,
        source,
        target: id,
        direction: "forward",
      });
    }
  }

  const rootDiagramId = "d-context-fixture";
  const diagram: C4Diagram = {
    id: rootDiagramId,
    level: "context",
    title: "Performance fixture",
    ownerNodeId: null,
    parentDiagramId: null,
    nodes,
    edges,
  };

  const now = new Date().toISOString();
  return {
    version: "1.0",
    metadata: {
      title: "Performance fixture",
      createdAt: now,
      updatedAt: now,
    },
    rootDiagramId,
    diagrams: { [rootDiagramId]: diagram },
    unknownFields: {},
  };
}

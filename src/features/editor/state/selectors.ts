/**
 * Pure selectors over `EditorState` (§4.1): `(state) => value`, side-effect
 * free, safe to pass to `useEditorStore(...)`.
 *
 * Selectors that build new objects (`selectBreadcrumb`,
 * `selectParallelEdgeGroups`) are memoized on the model / diagram object
 * identity — the store never mutates a model in place, so object identity is
 * a correct cache key and consumers get referentially stable results between
 * unrelated state changes.
 */

import {
  VALID_NODE_TYPES_BY_LEVEL,
  type C4Diagram,
  type C4Level,
  type C4NodeType,
} from "@/types";

import type { BreadcrumbSegment, EditorModel, EditorState } from "./store";

/** The diagram being edited. Falls back to the root if the id ever dangles. */
export function selectActiveDiagram(s: EditorState): C4Diagram {
  const active = s.model.diagrams[s.activeDiagramId];
  if (active !== undefined) return active;
  const root = s.model.diagrams[s.model.rootDiagramId];
  if (root !== undefined) return root;
  throw new Error("Model has no root diagram — the store is corrupt.");
}

export function selectActiveLevel(s: EditorState): C4Level {
  return selectActiveDiagram(s).level;
}

/** The node types the palette may offer at the active level (AF-E3-S1). */
export function selectValidNodeTypes(s: EditorState): readonly C4NodeType[] {
  return VALID_NODE_TYPES_BY_LEVEL[selectActiveLevel(s)];
}

/* -------------------------------------------------------------------------- */
/* Breadcrumb                                                                  */
/* -------------------------------------------------------------------------- */

const breadcrumbCache = new WeakMap<
  EditorModel,
  Map<string, BreadcrumbSegment[]>
>();

/**
 * Root → current, always at least one segment. Labels come from the owner
 * node's name at each hop (`parentDiagramId`/`ownerNodeId` back-pointers,
 * data-model.md), or the model title at the root.
 */
export function selectBreadcrumb(s: EditorState): BreadcrumbSegment[] {
  let byDiagram = breadcrumbCache.get(s.model);
  if (byDiagram === undefined) {
    byDiagram = new Map();
    breadcrumbCache.set(s.model, byDiagram);
  }
  const active = selectActiveDiagram(s);
  const cached = byDiagram.get(active.id);
  if (cached !== undefined) return cached;

  const segments: BreadcrumbSegment[] = [];
  let cursor: C4Diagram | undefined = active;
  // Depth is bounded at 4 in a valid file; the guard makes a corrupt
  // parent-pointer cycle terminate instead of hanging.
  let guard = 0;
  while (cursor !== undefined && guard < 8) {
    guard += 1;
    const diagram: C4Diagram = cursor;
    let label: string;
    if (diagram.parentDiagramId === null || diagram.ownerNodeId === null) {
      label = s.model.metadata.title;
    } else {
      const parent = s.model.diagrams[diagram.parentDiagramId];
      const ownerId = diagram.ownerNodeId;
      const owner = parent?.nodes.find((node) => node.id === ownerId);
      label = owner?.name ?? diagram.title;
    }
    segments.unshift({ diagramId: diagram.id, label, level: diagram.level });
    cursor =
      diagram.parentDiagramId !== null
        ? s.model.diagrams[diagram.parentDiagramId]
        : undefined;
  }

  byDiagram.set(active.id, segments);
  return segments;
}

/* -------------------------------------------------------------------------- */
/* Child counts                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Number of nodes inside `nodeId`'s child diagram, or 0 for a leaf. The node
 * is looked up in the active diagram first, then anywhere in the file (node
 * ids are unique file-wide).
 */
export function selectChildCount(s: EditorState, nodeId: string): number {
  const active = selectActiveDiagram(s);
  let node = active.nodes.find((n) => n.id === nodeId);
  if (node === undefined) {
    for (const diagram of Object.values(s.model.diagrams)) {
      node = diagram.nodes.find((n) => n.id === nodeId);
      if (node !== undefined) break;
    }
  }
  if (node?.childDiagramId == null || node.childDiagramId === "") return 0;
  return s.model.diagrams[node.childDiagramId]?.nodes.length ?? 0;
}

/* -------------------------------------------------------------------------- */
/* Parallel edge groups                                                        */
/* -------------------------------------------------------------------------- */

const parallelGroupsCache = new WeakMap<
  C4Diagram,
  Record<string, { index: number; count: number }>
>();

/**
 * For parallel-edge offsetting (§4.3): edgeId → { index, count } within its
 * source|target group, for the ACTIVE diagram's edges.
 *
 * Grouping uses the UNORDERED endpoint pair, so two A→B edges AND an A→B/B→A
 * pair both count as parallel — either way the curves overlap visually and
 * need offsetting. `index` is 0-based in edge-id order (stable across
 * renders because edges keep their ids).
 */
export function selectParallelEdgeGroups(
  s: EditorState,
): Record<string, { index: number; count: number }> {
  const diagram = selectActiveDiagram(s);
  const cached = parallelGroupsCache.get(diagram);
  if (cached !== undefined) return cached;

  const byPair = new Map<string, string[]>();
  for (const edge of diagram.edges) {
    const key =
      edge.source < edge.target
        ? `${edge.source}|${edge.target}`
        : `${edge.target}|${edge.source}`;
    const group = byPair.get(key);
    if (group === undefined) byPair.set(key, [edge.id]);
    else group.push(edge.id);
  }

  const result: Record<string, { index: number; count: number }> = {};
  for (const group of byPair.values()) {
    group.sort();
    group.forEach((edgeId, index) => {
      result[edgeId] = { index, count: group.length };
    });
  }

  parallelGroupsCache.set(diagram, result);
  return result;
}

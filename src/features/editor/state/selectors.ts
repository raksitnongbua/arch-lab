/**
 * Pure selectors over `EditorState`: `(state) => value`, side-effect
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
  type C4Node,
  type C4NodeType,
} from "@/types";

import { parallelEdgeGroups } from "@/lib/edge-fan";

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

/** The node types the palette may offer at the active level. */
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
 * ), or the model title at the root.
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
/* Referenceable ancestor nodes (`^ref` authoring)                             */
/* -------------------------------------------------------------------------- */

export interface ReferenceableNode {
  /** The diagram the original lives in. */
  sourceDiagramId: string;
  sourceLevel: C4Level;
  node: C4Node;
}

const referenceableCache = new WeakMap<
  EditorModel,
  Map<string, ReferenceableNode[]>
>();

/**
 * Nodes from ANCESTOR diagrams that may be placed into the active diagram as
 * boundary placeholders (`externalRef`).
 *
 * Only ancestors, never siblings or descendants: a `^ref` exists to draw the
 * people and systems at *this* diagram's boundary, which are by definition
 * things established further out. Referencing sideways or inwards would let
 * two diagrams claim the same element without a containment relationship.
 *
 * Three filters, each ruling out a way the model could go wrong:
 * - Level rules still apply. A `softwareSystem` is legal at `context` but not
 *   at `container`, so it never appears in a container diagram's list — the
 *   same `VALID_NODE_TYPES_BY_LEVEL` gate as a fresh node.
 * - A placeholder is never itself referenced. Chains of refs pointing at refs
 *   have no meaning; the reference must name the original.
 * - Anything already referenced here is dropped, so the list cannot produce a
 *   second placeholder for the same element in one diagram.
 *
 * Memoized on model identity + active diagram, like `selectBreadcrumb`.
 */
export function selectReferenceableNodes(s: EditorState): ReferenceableNode[] {
  let byDiagram = referenceableCache.get(s.model);
  if (byDiagram === undefined) {
    byDiagram = new Map();
    referenceableCache.set(s.model, byDiagram);
  }
  const active = selectActiveDiagram(s);
  const cached = byDiagram.get(active.id);
  if (cached !== undefined) return cached;

  const validTypes: readonly C4NodeType[] =
    VALID_NODE_TYPES_BY_LEVEL[active.level];
  // Already-referenced originals, keyed the same way `externalRef` stores them.
  const taken = new Set(
    active.nodes
      .filter((node) => node.externalRef !== undefined)
      .map(
        (node) => `${node.externalRef?.diagramId}/${node.externalRef?.nodeId}`,
      ),
  );

  // `selectBreadcrumb` is root → active; drop the last segment to get ancestors.
  const ancestors = selectBreadcrumb(s).slice(0, -1);
  const result: ReferenceableNode[] = [];
  for (const segment of ancestors) {
    const diagram = s.model.diagrams[segment.diagramId];
    if (diagram === undefined) continue;
    for (const node of diagram.nodes) {
      if (node.externalRef !== undefined) continue;
      if (!validTypes.includes(node.type)) continue;
      if (taken.has(`${diagram.id}/${node.id}`)) continue;
      result.push({
        sourceDiagramId: diagram.id,
        sourceLevel: diagram.level,
        node,
      });
    }
  }

  byDiagram.set(active.id, result);
  return result;
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
 * For parallel-edge offsetting: edgeId → { index, count } within its
 * source|target group, for the ACTIVE diagram's edges.
 *
 * The grouping itself is `lib/edge-fan`'s — this selector is the CACHE and the
 * shape conversion, nothing more. It used to be a third copy of that loop,
 * beside the viewer canvas's and the SVG exporter's, which is how the canvas
 * and the exporter came to be two independent implementations of a placement
 * they are required to agree on.
 */
export function selectParallelEdgeGroups(
  s: EditorState,
): Record<string, { index: number; count: number }> {
  const diagram = selectActiveDiagram(s);
  const cached = parallelGroupsCache.get(diagram);
  if (cached !== undefined) return cached;

  const result = Object.fromEntries(parallelEdgeGroups(diagram.edges));

  parallelGroupsCache.set(diagram, result);
  return result;
}

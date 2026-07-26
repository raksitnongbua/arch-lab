/**
 * Pure helpers over `EditorModel` (dev-handoff T1-A).
 *
 * Everything here is side-effect free: helpers either compute a value or
 * mutate ONLY the model instance they are handed (the store always hands them
 * a fresh clone). No function in this file touches the store.
 */

import {
  childLevelOf,
  type C4Diagram,
  type C4Edge,
  type C4Node,
  type C4NodeType,
  type Point,
  type Size,
} from "@/types";

import type { EditorModel } from "./store";

/* -------------------------------------------------------------------------- */
/* Geometry constants                                                          */
/*                                                                             */
/* These mirror D20 (lib/canvas-constants.ts, owned by T1-B). They are         */
/* duplicated here deliberately: state/ must not import from a same-batch      */
/* parallel ticket's files, and the store must be able to enforce its own      */
/* invariants (positions ×8, sizes ≥ 120×64) without a UI present.             */
/* -------------------------------------------------------------------------- */

export const GRID_SIZE = 8;
export const MIN_NODE_SIZE: Size = { width: 120, height: 64 };
export const DEFAULT_NODE_SIZE: Size = { width: 176, height: 88 };

/** Snap a coordinate to the nearest multiple of {@link GRID_SIZE}. */
export function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

/**
 * Snap a point to the grid. Used for *programmatic* placement (node creation,
 * paste offsets) where no pointer gesture expressed an intent.
 */
export function snapPoint(point: Point): Point {
  return { x: snapToGrid(point.x), y: snapToGrid(point.y) };
}

/**
 * Round a point to whole pixels without quantising to the grid.
 *
 * Drag commits go through this rather than {@link snapPoint} deliberately: the
 * canvas already applies grid snapping and sibling-alignment snapping during the
 * gesture, and honours Alt as an opt-out (AF-E1-S3). Re-quantising here would
 * override that decision and make Alt-drags visibly jump on release. The canvas
 * owns *where* a dragged node lands; the store only guarantees integral pixels.
 */
export function roundPoint(point: Point): Point {
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

/** Round to integers and clamp to the 120×64 minimum. */
export function clampSize(size: Size): Size {
  return {
    width: Math.max(MIN_NODE_SIZE.width, Math.round(size.width)),
    height: Math.max(MIN_NODE_SIZE.height, Math.round(size.height)),
  };
}

/* -------------------------------------------------------------------------- */
/* Slugs and ids                                                               */
/* -------------------------------------------------------------------------- */

/** Human-friendly default names per node type, used when `createNode` gets none. */
export const DEFAULT_NODE_NAME_BY_TYPE: Record<C4NodeType, string> = {
  person: "Person",
  softwareSystem: "Software System",
  externalSystem: "External System",
  container: "Container",
  database: "Database",
  queue: "Queue",
  component: "Component",
  codeElement: "Code Element",
};

/** Lowercase, dash-separated slug. Falls back to `fallback` for empty input. */
export function slugify(text: string, fallback = "node"): string {
  const slug = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? fallback : slug;
}

/**
 * De-collide a slug against a set of taken ids by suffixing `-2`, `-3`, …
 * (data-model.md: ids are unique within the file and stable across renames).
 */
export function uniqueId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** Every node id in the file. Node ids are unique file-wide. */
export function collectNodeIds(model: EditorModel): Set<string> {
  const ids = new Set<string>();
  for (const diagram of Object.values(model.diagrams)) {
    for (const node of diagram.nodes) ids.add(node.id);
  }
  return ids;
}

/** Every edge id in the file. Edge ids are unique file-wide. */
export function collectEdgeIds(model: EditorModel): Set<string> {
  const ids = new Set<string>();
  for (const diagram of Object.values(model.diagrams)) {
    for (const edge of diagram.edges) ids.add(edge.id);
  }
  return ids;
}

/* -------------------------------------------------------------------------- */
/* Lookups                                                                     */
/* -------------------------------------------------------------------------- */

export function getDiagram(
  model: EditorModel,
  diagramId: string,
): C4Diagram | undefined {
  return model.diagrams[diagramId];
}

export function getDiagramOrThrow(
  model: EditorModel,
  diagramId: string,
): C4Diagram {
  const diagram = model.diagrams[diagramId];
  if (diagram === undefined) {
    throw new Error(`Diagram "${diagramId}" does not exist.`);
  }
  return diagram;
}

export function findNode(
  diagram: C4Diagram,
  nodeId: string,
): C4Node | undefined {
  return diagram.nodes.find((node) => node.id === nodeId);
}

export function findEdge(
  diagram: C4Diagram,
  edgeId: string,
): C4Edge | undefined {
  return diagram.edges.find((edge) => edge.id === edgeId);
}

/** Locate a node anywhere in the file (ids are unique file-wide). */
export function findNodeAnywhere(
  model: EditorModel,
  nodeId: string,
): { diagram: C4Diagram; node: C4Node } | undefined {
  for (const diagram of Object.values(model.diagrams)) {
    const node = findNode(diagram, nodeId);
    if (node !== undefined) return { diagram, node };
  }
  return undefined;
}

/** Locate an edge anywhere in the file. */
export function findEdgeAnywhere(
  model: EditorModel,
  edgeId: string,
): { diagram: C4Diagram; edge: C4Edge } | undefined {
  for (const diagram of Object.values(model.diagrams)) {
    const edge = findEdge(diagram, edgeId);
    if (edge !== undefined) return { diagram, edge };
  }
  return undefined;
}

/* -------------------------------------------------------------------------- */
/* Cascade collection for delete                                               */
/* -------------------------------------------------------------------------- */

export interface DeleteCascade {
  /** Node ids to remove from the *containing* diagram. */
  nodeIds: Set<string>;
  /** Edge ids to remove from the containing diagram (incident edges). */
  edgeIds: Set<string>;
  /** Entire descendant diagrams to remove from the model, deepest first. */
  diagramIds: Set<string>;
  /** Totals across the whole cascade, for `DeleteResult`. */
  removedNodes: number;
  removedEdges: number;
  removedDiagrams: number;
}

/**
 * Compute everything `deleteNodes` must remove in ONE history entry
 * (AF-E3-S4): the nodes themselves, every incident edge in their diagram, and
 * each node's entire descendant diagram subtree. Counts include the nodes and
 * edges inside removed descendant diagrams.
 */
export function collectDeleteCascade(
  model: EditorModel,
  diagram: C4Diagram,
  nodeIds: readonly string[],
): DeleteCascade {
  const targetIds = new Set(
    nodeIds.filter((id) => findNode(diagram, id) !== undefined),
  );

  const edgeIds = new Set<string>();
  for (const edge of diagram.edges) {
    if (targetIds.has(edge.source) || targetIds.has(edge.target)) {
      edgeIds.add(edge.id);
    }
  }

  // Walk each deleted node's child-diagram subtree.
  const diagramIds = new Set<string>();
  let descendantNodes = 0;
  let descendantEdges = 0;
  const queue: string[] = [];
  for (const id of targetIds) {
    const node = findNode(diagram, id);
    if (node?.childDiagramId != null && node.childDiagramId !== "") {
      queue.push(node.childDiagramId);
    }
  }
  while (queue.length > 0) {
    const childId = queue.pop();
    if (childId === undefined || diagramIds.has(childId)) continue;
    const child = model.diagrams[childId];
    if (child === undefined) continue;
    diagramIds.add(childId);
    descendantNodes += child.nodes.length;
    descendantEdges += child.edges.length;
    for (const node of child.nodes) {
      if (node.childDiagramId != null && node.childDiagramId !== "") {
        queue.push(node.childDiagramId);
      }
    }
  }

  return {
    nodeIds: targetIds,
    edgeIds,
    diagramIds,
    removedNodes: targetIds.size + descendantNodes,
    removedEdges: edgeIds.size + descendantEdges,
    removedDiagrams: diagramIds.size,
  };
}

/**
 * Apply a computed cascade to `model` in place. The store hands this a fresh
 * clone; the caller's model is never touched.
 */
export function applyDeleteCascade(
  model: EditorModel,
  diagramId: string,
  cascade: DeleteCascade,
): void {
  const diagram = getDiagramOrThrow(model, diagramId);
  diagram.nodes = diagram.nodes.filter((node) => !cascade.nodeIds.has(node.id));
  diagram.edges = diagram.edges.filter((edge) => !cascade.edgeIds.has(edge.id));
  for (const id of cascade.diagramIds) {
    delete model.diagrams[id];
  }
}

/* -------------------------------------------------------------------------- */
/* Child-diagram creation (back-pointer maintenance)                           */
/* -------------------------------------------------------------------------- */

/**
 * Create the child diagram exactly one level below `diagram`, wiring BOTH
 * pointers of the doubly-linked tree (data-model.md "How drill-down works"):
 * `node.childDiagramId` downward, `ownerNodeId`/`parentDiagramId` upward.
 *
 * Mutates `model` in place (the store hands it a clone). Returns the new
 * diagram's id. The caller must have validated depth and node existence.
 */
export function attachChildDiagram(
  model: EditorModel,
  diagram: C4Diagram,
  node: C4Node,
): string {
  const childLevel = childLevelOf(diagram.level);
  if (childLevel === null) {
    throw new Error(`Diagram "${diagram.id}" is already at the deepest level.`);
  }
  const takenDiagramIds = new Set(Object.keys(model.diagrams));
  const childId = uniqueId(
    `d-${childLevel}-${slugify(node.id)}`,
    takenDiagramIds,
  );
  const child: C4Diagram = {
    id: childId,
    level: childLevel,
    title: node.name,
    ownerNodeId: node.id,
    parentDiagramId: diagram.id,
    nodes: [],
    edges: [],
  };
  model.diagrams[childId] = child;
  node.childDiagramId = childId;
  return childId;
}

/* -------------------------------------------------------------------------- */
/* Boot model (D16)                                                            */
/* -------------------------------------------------------------------------- */

export const ROOT_DIAGRAM_ID = "d-ctx-root";
export const SCHEMA_VERSION = "1.0";
export const UNTITLED_MODEL_TITLE = "Untitled model";

/** The empty in-memory model `/editor` boots with: one root Context diagram. */
export function createEmptyModel(now: Date = new Date()): EditorModel {
  const createdAt = now.toISOString();
  return {
    version: SCHEMA_VERSION,
    metadata: {
      title: UNTITLED_MODEL_TITLE,
      createdAt,
      updatedAt: createdAt,
    },
    rootDiagramId: ROOT_DIAGRAM_ID,
    diagrams: {
      [ROOT_DIAGRAM_ID]: {
        id: ROOT_DIAGRAM_ID,
        level: "context",
        title: UNTITLED_MODEL_TITLE,
        ownerNodeId: null,
        parentDiagramId: null,
        nodes: [],
        edges: [],
      },
    },
    unknownFields: {},
  };
}

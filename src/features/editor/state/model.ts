/**
 * Pure helpers over `EditorModel`.
 *
 * Everything here is side-effect free: helpers either compute a value or
 * mutate ONLY the model instance they are handed (the store always hands them
 * a fresh clone). No function in this file touches the store.
 */

import {
  childLevelOf,
  isNodeTypeValidAtLevel,
  type C4Diagram,
  type C4Edge,
  type C4Node,
  type C4NodeType,
  type Point,
  type Size,
} from "@/types";

import { slugify as baseSlugify } from "@/lib/slug";

import type { EditorModel } from "./store";

/* -------------------------------------------------------------------------- */
/* `^ref` placeholder mirroring                                                */
/* -------------------------------------------------------------------------- */

/**
 * The identity a `^ref` placeholder mirrors from its original. Position, size
 * and tags are deliberately absent: those are per-diagram presentation, and a
 * placeholder is placed and laid out independently of the node it names.
 *
 * `createRefNode` copies exactly these keys, and `syncRefPlaceholders` keeps
 * exactly these keys in step — one list, so creation and update cannot drift.
 */
export const REF_MIRRORED_KEYS = [
  "name",
  "type",
  "technology",
  "description",
  "icon",
  "iconSource",
] as const;

/** Copies {@link REF_MIRRORED_KEYS} onto `target`. Returns true if it changed. */
export function mirrorRefIdentity(target: C4Node, source: C4Node): boolean {
  let changed = false;
  for (const key of REF_MIRRORED_KEYS) {
    const value = source[key];
    const record = target as unknown as Record<string, unknown>;
    if (value === undefined) {
      // Clearing the original's technology must clear the mirror too, or the
      // placeholder keeps advertising a technology that no longer exists.
      if (record[key] !== undefined) {
        delete record[key];
        changed = true;
      }
    } else if (record[key] !== value) {
      record[key] = value;
      changed = true;
    }
  }
  return changed;
}

/** Every placeholder in `model` pointing at `sourceDiagramId/sourceNodeId`. */
export function findRefPlaceholders(
  model: EditorModel,
  sourceDiagramId: string,
  sourceNodeId: string,
): Array<{ diagram: C4Diagram; node: C4Node }> {
  const found: Array<{ diagram: C4Diagram; node: C4Node }> = [];
  for (const diagram of Object.values(model.diagrams)) {
    for (const node of diagram.nodes) {
      if (node.externalRef === undefined) continue;
      if (node.externalRef.diagramId !== sourceDiagramId) continue;
      if (node.externalRef.nodeId !== sourceNodeId) continue;
      found.push({ diagram, node });
    }
  }
  return found;
}

/**
 * Re-mirrors every placeholder that points at `sourceNodeId` onto the current
 * state of that node. Mutates `model` in place; returns true if anything moved.
 *
 * Validates BEFORE mutating. Retyping an original can make a placeholder
 * illegal at its own level — a `person` referenced into a container diagram is
 * fine, but retyping the original to `softwareSystem` is not, because
 * `softwareSystem` is not valid at `container`. Silently mirroring it would
 * produce a model that its own validator rejects, so this throws instead and
 * leaves the edit unapplied. The inspector's type control already catches and
 * toasts.
 */
export function syncRefPlaceholders(
  model: EditorModel,
  sourceDiagramId: string,
  sourceNodeId: string,
): boolean {
  const sourceDiagram = model.diagrams[sourceDiagramId];
  const source = sourceDiagram?.nodes.find((n) => n.id === sourceNodeId);
  if (source === undefined) return false;
  // A placeholder never mirrors another placeholder.
  if (source.externalRef !== undefined) return false;

  const placeholders = findRefPlaceholders(
    model,
    sourceDiagramId,
    sourceNodeId,
  );
  for (const { diagram } of placeholders) {
    if (!isNodeTypeValidAtLevel(source.type, diagram.level)) {
      throw new Error(
        `"${source.name}" is referenced in "${diagram.title || diagram.id}" (${diagram.level}), ` +
          `where a ${source.type} is not allowed. Remove that reference first.`,
      );
    }
  }

  let changed = false;
  for (const { node } of placeholders) {
    if (mirrorRefIdentity(node, source)) changed = true;
  }
  return changed;
}

/* -------------------------------------------------------------------------- */
/* Geometry constants                                                          */
/*                                                                             */
/* These mirror the canvas constants (lib/canvas-constants.ts). They are   */
/* duplicated here deliberately: state/ must not import from a same-batch      */
/* parallel ticket's files, and the store must be able to enforce its own      */
/* invariants (positions ×8, sizes ≥ 120×64) without a UI present.             */
/* -------------------------------------------------------------------------- */

export const GRID_SIZE = 8;
export const MIN_NODE_SIZE: Size = { width: 120, height: 64 };
export const DEFAULT_NODE_SIZE: Size = { width: 176, height: 88 };
/** Offset applied by paste/duplicate. Mirrors `PASTE_OFFSET` in the canvas constants. */
export const PASTE_OFFSET = 16;

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
 * gesture, and honours Alt as an opt-out. Re-quantising here would
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

/**
 * Lowercase, dash-separated slug. Falls back to `fallback` for empty input.
 *
 * Thin wrapper over the app-wide {@link baseSlugify}: this is the ID-minting
 * path, where the default matters \u2014 an element with no usable name still needs
 * an id, and `"node"` is the stem the de-collider then numbers.
 */
export function slugify(text: string, fallback = "node"): string {
  return baseSlugify(text, fallback);
}

/**
 * De-collide a slug against a set of taken ids by suffixing `-2`, `-3`, …
 * (ids are unique within the file and stable across renames).
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
  /**
   * `^ref` placeholders elsewhere in the file that point at a node being
   * removed, keyed by the diagram they live in — plus that diagram's edges
   * incident to them.
   *
   * These cannot ride in `nodeIds`/`edgeIds`: those are scoped to the ONE
   * containing diagram, and a placeholder by definition lives in a different
   * one. Without this, deleting an original left a placeholder pointing at
   * nothing, which `validate.ts` does not catch (it checks the ref's shape,
   * never that the target resolves).
   */
  refsByDiagramId: Map<string, { nodeIds: Set<string>; edgeIds: Set<string> }>;
  /** Totals across the whole cascade, for `DeleteResult`. */
  removedNodes: number;
  removedEdges: number;
  removedDiagrams: number;
}

/**
 * Compute everything `deleteNodes` must remove in ONE history entry
 *: the nodes themselves, every incident edge in their diagram, and
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

  // Every node this cascade destroys, wherever it lives — the direct targets
  // plus everything inside the descendant diagrams being dropped. A
  // placeholder pointing at ANY of them would be left dangling, so all of them
  // have to be checked, not just the ones clicked.
  const doomed = new Set<string>();
  for (const id of targetIds) doomed.add(`${diagram.id}/${id}`);
  for (const removedId of diagramIds) {
    const removed = model.diagrams[removedId];
    if (removed === undefined) continue;
    for (const node of removed.nodes) doomed.add(`${removedId}/${node.id}`);
  }

  const refsByDiagramId = new Map<
    string,
    { nodeIds: Set<string>; edgeIds: Set<string> }
  >();
  let refNodes = 0;
  let refEdges = 0;
  for (const other of Object.values(model.diagrams)) {
    // Diagrams already being deleted wholesale need no per-node bookkeeping.
    if (other.id === diagram.id || diagramIds.has(other.id)) continue;
    const nodeIds = new Set<string>();
    for (const node of other.nodes) {
      const ref = node.externalRef;
      if (ref === undefined) continue;
      if (!doomed.has(`${ref.diagramId}/${ref.nodeId}`)) continue;
      nodeIds.add(node.id);
    }
    if (nodeIds.size === 0) continue;
    // The placeholder's own relationships go with it.
    const refEdgeIds = new Set<string>();
    for (const edge of other.edges) {
      if (nodeIds.has(edge.source) || nodeIds.has(edge.target)) {
        refEdgeIds.add(edge.id);
      }
    }
    refsByDiagramId.set(other.id, { nodeIds, edgeIds: refEdgeIds });
    refNodes += nodeIds.size;
    refEdges += refEdgeIds.size;
  }

  return {
    nodeIds: targetIds,
    edgeIds,
    diagramIds,
    refsByDiagramId,
    removedNodes: targetIds.size + descendantNodes + refNodes,
    removedEdges: edgeIds.size + descendantEdges + refEdges,
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
  // Placeholders elsewhere that named a now-deleted node. Applied after the
  // diagram drops above, so a diagram removed wholesale is simply absent here.
  for (const [otherId, refs] of cascade.refsByDiagramId) {
    const other = model.diagrams[otherId];
    if (other === undefined) continue;
    other.nodes = other.nodes.filter((node) => !refs.nodeIds.has(node.id));
    other.edges = other.edges.filter((edge) => !refs.edgeIds.has(edge.id));
  }
}

/* -------------------------------------------------------------------------- */
/* Child-diagram creation (back-pointer maintenance)                           */
/* -------------------------------------------------------------------------- */

/**
 * Create the child diagram exactly one level below `diagram`, wiring BOTH
 * pointers of the doubly-linked tree:
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
/* Boot model                                                            */
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

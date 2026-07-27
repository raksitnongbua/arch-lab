/**
 * Viewer model helpers. A viewer model is a plain, deep-frozen, in-memory C4
 * model — no store, no persistence, no mutation path. Everything here is a
 * pure read over that structure. Instances come from the viewer's model
 * service, which parses hard-coded `.archflow.json` text through the
 * editor's real reader (`@/features/editor/io/deserialize`).
 */

import type { C4Diagram, C4Edge, C4Level, C4Node } from "@/types";

/* -------------------------------------------------------------------------- */
/* Shape                                                                       */
/* -------------------------------------------------------------------------- */

export interface ViewerModel {
  /** Service-registry id — also the `/view/[modelId]` route segment. */
  id: string;
  title: string;
  description: string;
  rootDiagramId: string;
  /** Flat, id-keyed — same shape decision as the saved-file format. */
  diagrams: Readonly<Record<string, C4Diagram>>;
}

/**
 * Recursively freeze the viewer model. This is what makes "view-only"
 * structurally true: any accidental write anywhere throws in dev (strict
 * mode) and no-ops in prod — the model cannot drift while browsing.
 */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

export function getDiagram(model: ViewerModel, id: string): C4Diagram {
  const found = model.diagrams[id];
  if (found === undefined) {
    throw new Error(`viewer: unknown diagram "${id}"`);
  }
  return found;
}

export function findNode(diagram: C4Diagram, nodeId: string): C4Node | null {
  return diagram.nodes.find((node) => node.id === nodeId) ?? null;
}

export function findEdge(diagram: C4Diagram, edgeId: string): C4Edge | null {
  return diagram.edges.find((edge) => edge.id === edgeId) ?? null;
}

/** The node (in the parent diagram) whose internals `diagram` shows. */
export function ownerNodeOf(
  model: ViewerModel,
  diagram: C4Diagram,
): C4Node | null {
  if (diagram.parentDiagramId === null || diagram.ownerNodeId === null) {
    return null;
  }
  return findNode(
    getDiagram(model, diagram.parentDiagramId),
    diagram.ownerNodeId,
  );
}

export interface Crumb {
  diagramId: string;
  label: string;
  level: C4Level;
}

/**
 * Breadcrumb from the root down to `diagramId`, built from the upward
 * pointers — O(depth), depth bounded at 4 by the level enum.
 */
export function breadcrumbFor(model: ViewerModel, diagramId: string): Crumb[] {
  const trail: Crumb[] = [];
  let cursor: C4Diagram | null = getDiagram(model, diagramId);
  let guard = 0;
  while (cursor !== null && guard < 8) {
    guard += 1;
    const owner = ownerNodeOf(model, cursor);
    trail.unshift({
      diagramId: cursor.id,
      label: owner?.name ?? model.title,
      level: cursor.level,
    });
    cursor =
      cursor.parentDiagramId !== null
        ? getDiagram(model, cursor.parentDiagramId)
        : null;
  }
  return trail;
}

/**
 * When climbing from somewhere at-or-below `fromId` up to `toId`: the node in
 * `toId` that contains the level we came from — the anchor the zoom-out
 * animation should land on. Null when `toId` is not an ancestor.
 */
export function climbAnchorNodeId(
  model: ViewerModel,
  fromId: string,
  toId: string,
): string | null {
  let cursor: C4Diagram | null = getDiagram(model, fromId);
  let guard = 0;
  while (cursor !== null && guard < 8) {
    guard += 1;
    if (cursor.parentDiagramId === toId) return cursor.ownerNodeId;
    cursor =
      cursor.parentDiagramId !== null
        ? getDiagram(model, cursor.parentDiagramId)
        : null;
  }
  return null;
}

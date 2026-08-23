/**
 * Viewer model helpers. A viewer model is a plain, deep-frozen, in-memory C4
 * model — no store, no persistence, no mutation path. Everything here is a
 * pure read over that structure. Instances come from the viewer's model
 * service, which parses hard-coded `.archlab.json` text through the
 * editor's real reader (`@/features/editor/io/deserialize`).
 */

import type {
  ArchLabFile,
  ArchLabMetadata,
  C4Diagram,
  C4Edge,
  C4Level,
  C4Node,
} from "@/types";

/* -------------------------------------------------------------------------- */
/* Shape                                                                       */
/* -------------------------------------------------------------------------- */

export interface ViewerModel {
  /** Service-registry id — also the `/live/[modelId]` route segment. */
  id: string;
  title: string;
  description: string;
  rootDiagramId: string;
  /** Flat, id-keyed — same shape decision as the saved-file format. */
  diagrams: Readonly<Record<string, C4Diagram>>;
  /**
   * The file-level fields that are not diagrams. `title` and `description`
   * above are conveniences read off `metadata`; this is what makes the model
   * whole, so `archLabFileFrom` can hand the EXACT document to something that
   * needs a file (the "Edit this diagram" handoff) instead of a reconstruction
   * that quietly drops `tagColors`, `customIcons` or a newer version's
   * unknown fields. Deliberately not the diagrams over again: those are right
   * here, and duplicating them would double the page payload.
   */
  file: Readonly<{
    version: string;
    metadata: ArchLabMetadata;
    /** Unknown top-level fields from a newer minor version, verbatim. */
    unknownFields: Readonly<Record<string, unknown>>;
  }>;
}

/**
 * The viewer model as the `ArchLabFile` it was parsed from — byte-for-byte the
 * same document, so serializing this is the same as serializing the original.
 */
export function archLabFileFrom(model: ViewerModel): ArchLabFile {
  const file: ArchLabFile = {
    version: model.file.version,
    metadata: model.file.metadata,
    rootDiagramId: model.rootDiagramId,
    diagrams: Object.values(model.diagrams),
  };
  for (const [key, value] of Object.entries(model.file.unknownFields)) {
    file[key] = value;
  }
  return file;
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

/**
 * Every diagram in DRILL order: the root first, then each of its children in
 * the order their owner nodes appear, depth-first.
 *
 * This is the order a reader met the diagrams in, so it is the order a
 * multi-diagram export should hand them over in — a zip listing then reads
 * top-down like the model does, instead of alphabetically by id, which
 * scatters the levels.
 *
 * Walks the DOWNWARD pointers (`childDiagramId` on nodes) rather than sorting
 * on `level`, because level alone cannot order two sibling component diagrams,
 * and it would put an unreachable diagram somewhere plausible instead of last.
 * Any diagram the walk never reaches — an orphan the file kept but nothing
 * points at — is appended at the end by id, so an export is never quietly
 * missing part of the file.
 */
export function diagramsInDrillOrder(model: ViewerModel): C4Diagram[] {
  const ordered: C4Diagram[] = [];
  const seen = new Set<string>();

  const walk = (diagramId: string): void => {
    if (seen.has(diagramId)) return;
    const diagram = model.diagrams[diagramId];
    if (diagram === undefined) return;
    seen.add(diagramId);
    ordered.push(diagram);
    // Node order is the file's own (sorted by id on write), which is what
    // makes this deterministic across runs.
    for (const node of diagram.nodes) {
      if (
        typeof node.childDiagramId === "string" &&
        node.childDiagramId !== ""
      ) {
        walk(node.childDiagramId);
      }
    }
  };

  walk(model.rootDiagramId);

  for (const id of Object.keys(model.diagrams).sort()) {
    if (!seen.has(id)) ordered.push(model.diagrams[id]);
  }
  return ordered;
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

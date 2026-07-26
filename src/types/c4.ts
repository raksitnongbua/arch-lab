/**
 * First-pass TypeScript sketch of the arch-flow saved-file format.
 *
 * Source of truth: `docs/product/data-model.md` (schema v1, status: proposed).
 * These types intentionally mirror that document field-for-field, including its
 * two structural rules:
 *
 *   - Diagrams are stored FLAT, never nested (readable diffs, O(1) lookup).
 *   - A node's C4 level is NOT stored on the node; it is the `level` of the
 *     diagram containing it (data-model.md, Assumption A6).
 *
 * Nothing here is validated at runtime yet — validation (the load-time hard
 * errors and warnings in data-model.md) belongs with the editor and will live
 * in `src/features/editor`.
 */

/* -------------------------------------------------------------------------- */
/* Levels                                                                      */
/* -------------------------------------------------------------------------- */

/** The four C4 levels, ordered outermost → innermost. */
export const C4_LEVELS = ["context", "container", "component", "code"] as const;

export type C4Level = (typeof C4_LEVELS)[number];

/** Depth is bounded at 4 by the level enum, so drill paths cannot cycle. */
export const MAX_C4_DEPTH = C4_LEVELS.length;

/** The level exactly one step deeper, or `null` at `code`. */
export type C4ChildLevel<L extends C4Level> = L extends "context"
  ? "container"
  : L extends "container"
    ? "component"
    : L extends "component"
      ? "code"
      : never;

/* -------------------------------------------------------------------------- */
/* Node types                                                                  */
/* -------------------------------------------------------------------------- */

export type C4NodeType =
  | "person"
  | "softwareSystem"
  | "externalSystem"
  | "container"
  | "database"
  | "queue"
  | "component"
  | "codeElement";

/**
 * Which node types are legal at each level (AF-E3-S1). The editor's palette and
 * paste/drop validation both read this map — one table, no duplicated rules.
 */
export const VALID_NODE_TYPES_BY_LEVEL = {
  context: ["person", "softwareSystem", "externalSystem"],
  container: ["container", "database", "queue", "externalSystem", "person"],
  component: ["component", "database", "queue", "externalSystem"],
  code: ["codeElement"],
} as const satisfies Record<C4Level, readonly C4NodeType[]>;

export type C4NodeTypeForLevel<L extends C4Level> =
  (typeof VALID_NODE_TYPES_BY_LEVEL)[L][number];

/* -------------------------------------------------------------------------- */
/* Geometry                                                                    */
/* -------------------------------------------------------------------------- */

/** Top-left in model coordinates. Always integral, snapped to multiples of 8. */
export interface Point {
  x: number;
  y: number;
}

/** Minimum 120x64 per data-model.md. */
export interface Size {
  width: number;
  height: number;
}

/** Last saved camera for a diagram, restored on open. */
export interface Viewport extends Point {
  zoom: number;
}

/* -------------------------------------------------------------------------- */
/* Nodes                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * `explicit` icons are user-chosen and are never auto-overridden when
 * `technology` changes; `inferred` icons are derived from it (AF-E4-S3).
 */
export type IconSource = "explicit" | "inferred";

/**
 * Points at the real element one level up. A node carrying this is a read-only
 * boundary placeholder (AF-E2-S5). Placeholders may chain.
 */
export interface ExternalRef {
  diagramId: string;
  nodeId: string;
}

export interface C4Node {
  /** Human-readable slug, unique within the file, stable across renames. */
  id: string;
  type: C4NodeType;
  name: string;
  /** <= 500 chars. */
  description?: string;
  /** Free text, e.g. "Go 1.22 / chi", "PostgreSQL 16". */
  technology?: string;
  /** Icon slug, e.g. "postgresql". Omitted => use the type default. */
  icon?: string;
  /** Present only when `icon` is. */
  iconSource?: IconSource;
  position: Point;
  size: Size;
  /** Sorted lexically on write. */
  tags?: string[];
  /** Downward drill-down pointer into `diagrams[].id`. Absent => leaf. */
  childDiagramId?: string | null;
  /** Relative path to another file holding the child subtree (AF-E5-S7). Mutually exclusive with `childDiagramId`. */
  childRef?: string;
  /** Present => read-only boundary placeholder. */
  externalRef?: ExternalRef;
  /** Excluded from Tidy layout (AF-E1-S10). */
  pinned?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Edges                                                                       */
/* -------------------------------------------------------------------------- */

export type EdgeDirection = "forward" | "bidirectional" | "none";
export type EdgeStyle = "solid" | "dashed";

export interface C4Edge {
  /** Slug, unique in file. Convention `e-<source>-<target>[-n]`. */
  id: string;
  /** Node id in the SAME diagram. */
  source: string;
  /** Node id in the SAME diagram. */
  target: string;
  label?: string;
  /** e.g. "gRPC", "HTTPS/JSON", "SQL/TCP". */
  technology?: string;
  direction: EdgeDirection;
  /** Defaults to "solid" when absent. */
  style?: EdgeStyle;
  tags?: string[];
  /** Edge id one level up that this relationship implements — the traceability link. */
  realizes?: string;
  /** Manual routing overrides. Absent => auto-routed. */
  waypoints?: Point[];
}

/* -------------------------------------------------------------------------- */
/* Diagrams                                                                    */
/* -------------------------------------------------------------------------- */

export interface C4Diagram {
  /** Slug, unique in file. Convention `d-<level>-<owner-slug>`. */
  id: string;
  level: C4Level;
  title: string;
  description?: string;
  /** The node (in `parentDiagramId`) whose internals this shows. `null` only for the root. */
  ownerNodeId: string | null;
  /** `null` only for the root Context diagram. */
  parentDiagramId: string | null;
  viewport?: Viewport;
  /** Sorted by `id` on write. */
  nodes: C4Node[];
  /** Sorted by `id` on write. */
  edges: C4Edge[];
}

/* -------------------------------------------------------------------------- */
/* File                                                                        */
/* -------------------------------------------------------------------------- */

/** Sanitised inline SVG, keyed by icon slug (AF-E4-S4). */
export interface CustomIcon {
  name: string;
  svg: string;
}

export interface ArchFlowMetadata {
  title: string;
  description?: string;
  /** Team or person accountable for accuracy. */
  owner?: string;
  tags?: string[];
  /** ISO-8601 UTC. Written once, never modified. */
  createdAt: string;
  /** ISO-8601 UTC. Written only when the model actually changed. */
  updatedAt: string;
  /** Drives the "review overdue" chip (AF-E5-S6). */
  lastReviewedAt?: string;
  /** `{ "<tag>": "<hex>" }` (AF-E3-S6). */
  tagColors?: Record<string, string>;
  customIcons?: Record<string, CustomIcon>;
  /** Diagnostic only; never read for behaviour. */
  generator?: { name: string; version: string };
}

/**
 * The whole saved model: one file, self-contained, no sibling assets.
 *
 * Unknown fields from a newer MINOR version must be preserved verbatim on
 * round-trip; an unknown MAJOR version is refused read-write. That is why the
 * type carries an index signature escape hatch rather than being sealed.
 */
export interface ArchFlowFile {
  /** URL of the JSON Schema, for editor autocomplete. */
  $schema?: string;
  /** "MAJOR.MINOR". */
  version: string;
  metadata: ArchFlowMetadata;
  /** The Context-level diagram; the entry point. */
  rootDiagramId: string;
  /** Every diagram at every level, flat, sorted by `id`. */
  diagrams: C4Diagram[];
  /** Forward tolerance: unknown fields from newer minor versions. */
  [unknown: string]: unknown;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** The level exactly one step deeper, or `null` at `code`. */
export function childLevelOf(level: C4Level): C4Level | null {
  const next = C4_LEVELS[C4_LEVELS.indexOf(level) + 1];
  return next ?? null;
}

/** Whether `type` may appear on a diagram at `level` (AF-E3-S1). */
export function isNodeTypeValidAtLevel(
  type: C4NodeType,
  level: C4Level,
): boolean {
  return (VALID_NODE_TYPES_BY_LEVEL[level] as readonly C4NodeType[]).includes(
    type,
  );
}

/** A placeholder mirrored in from one level up is read-only in its own diagram. */
export function isBoundaryPlaceholder(node: C4Node): boolean {
  return node.externalRef !== undefined;
}

/** A node with no child diagram is a leaf and offers "Drill into" instead. */
export function hasChildDiagram(node: C4Node): boolean {
  return typeof node.childDiagramId === "string" && node.childDiagramId !== "";
}

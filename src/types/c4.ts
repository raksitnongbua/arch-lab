/**
 * First-pass TypeScript sketch of the arch-lab saved-file format.
 *
 * Schema v1.
 * These types intentionally mirror that document field-for-field, including its
 * two structural rules:
 *
 *   - Diagrams are stored FLAT, never nested (readable diffs, O(1) lookup).
 *   - A node's C4 level is NOT stored on the node; it is the `level` of the
 *     diagram containing it.
 *
 * Nothing here is validated at runtime yet — validation (the load-time hard
 * errors and warnings) belongs with the editor and will live
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
 * Which node types are legal at each level. The editor's palette and
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

/**
 * The five C4 classifications an element can BE, as they should appear in the
 * `[...]` metadata line: c4model.com/diagrams/notation requires each element's
 * classification (Person, Software System, Container, Component) to be
 * explicit, and "Code" for the innermost level.
 */
export type C4Abstraction =
  "Person" | "Software System" | "Container" | "Component" | "Code";

/**
 * Which C4 abstraction each of our eight node types actually IS (the
 * companion table).
 *
 * The eight types collapse onto five abstractions for the same reason
 * `COLOR_ROLE_BY_TYPE` collapses them onto five colour roles: `database` and
 * `queue` are CONTAINERS that earn a silhouette of their own, not a fifth and
 * sixth kind of thing, and `externalSystem` is a software system that happens
 * to belong to somebody else. Shape and colour carry those distinctions —
 * this table carries the classification, and a renderer that shows
 * `[Database: PostgreSQL 16]` is naming the silhouette where C4 asks it to
 * name the abstraction.
 *
 * `codeElement` maps to "Code" rather than "Code Element": C4's fourth level
 * is called Code, and the extra word only ever restated the obvious.
 */
export const C4_ABSTRACTION: Record<C4NodeType, C4Abstraction> = {
  person: "Person",
  softwareSystem: "Software System",
  externalSystem: "Software System",
  container: "Container",
  database: "Container",
  queue: "Container",
  component: "Component",
  codeElement: "Code",
};

/* -------------------------------------------------------------------------- */
/* Geometry                                                                    */
/* -------------------------------------------------------------------------- */

/** Top-left in model coordinates. Always integral, snapped to multiples of 8. */
export interface Point {
  x: number;
  y: number;
}

/** Minimum 120x64. */
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
 * `technology` changes; `inferred` icons are derived from it.
 */
export type IconSource = "explicit" | "inferred";

/**
 * Points at the real element one level up. A node carrying this is a read-only
 * boundary placeholder. Placeholders may chain.
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
  /** Relative path to another file holding the child subtree. Mutually exclusive with `childDiagramId`. */
  childRef?: string;
  /** Present => read-only boundary placeholder. */
  externalRef?: ExternalRef;
  /**
   * The INNERMOST frame this node sits in, from `C4Diagram.frames`. Absent =>
   * the node is loose on the canvas.
   *
   * Innermost only, never a list: nesting is already recorded once, on the
   * frame's own `parentFrameId`. Storing the full ancestry per node would let
   * the two disagree, and every consumer that needs the chain can walk it.
   */
  frameId?: string;
  /** Excluded from Tidy layout. */
  pinned?: boolean;
}

/* -------------------------------------------------------------------------- */
/* The editable subset of an element                                           */
/* -------------------------------------------------------------------------- */

/**
 * What the details panel's colour control asks for. Colour is NOT a node
 * field: the format spells it as a `#tag` on the node plus a `tagcolor` line
 * in the file header, so the revision carries the INTENT and
 * `playground/input/canvas-edit.ts` derives both writes from it — deriving
 * them in the panel would split one decision across two modules.
 *
 *   - `"role"` — the type's own role colour: every colour-carrying tag comes
 *     OFF the node (the header keeps its `tagcolor` lines, because other
 *     nodes may wear them).
 *   - `"tag"` — colour via `tag`, minting `tagcolor <tag> "<color>"` in the
 *     header when the document does not already define it. When it does, the
 *     document's own colour wins and `color` is ignored: rewriting an
 *     existing `tagcolor` line would recolour every node wearing the tag,
 *     a blast radius a single-element panel must not have.
 */
export type C4NodeColorChoice =
  { kind: "role" } | { kind: "tag"; tag: string; color: string };

/**
 * What the details panel's boundary control asks for. Membership IS a node
 * field (`C4Node.frameId`), so unlike colour most of this is a plain value —
 * but joining a boundary that does not exist yet has to CREATE it, and a
 * `frame` line is a diagram-level declaration the panel must not spell
 * itself. So the revision carries the intent and
 * `playground/input/canvas-edit.ts` derives the writes, exactly as it does
 * for colour.
 *
 *   - `"none"` — the node stands loose on the canvas: `in=` comes off its
 *     line. The frame itself is left declared even if this empties it — an
 *     empty frame is not drawn (`C4Frame`), other nodes may rejoin it, and
 *     eating a declaration the author wrote over a membership change is the
 *     blast radius the colour choice already refuses to have.
 *   - `"existing"` — the node joins a frame the diagram already declares.
 *   - `"new"` — a `frame` line is minted from `label` and the node joins it.
 *     Always top-level: nesting a boundary is a statement about two frames,
 *     not about this node, and belongs in the text.
 */
export type C4NodeFrameChoice =
  | { kind: "none" }
  | { kind: "existing"; frameId: string }
  | { kind: "new"; label: string };

/**
 * The editable subset of a node, given WHOLE rather than as a diff — the same
 * contract as `SequenceMessageRevision` one file over, and here for the same
 * reason: the viewer's details panel collects it and
 * `playground/input/canvas-edit.ts` turns it into a line patch, and the viewer
 * must not import from the playground (the repo's import layering runs
 * editor → viewer → sequence, and the playground consumes all three).
 * `undefined` means the field is absent from the document, not "leave it as it
 * was" — the panel's form shows every field at once and submits every field.
 *
 * `id` IS DELIBERATELY NOT HERE, and this is a decision rather than an
 * omission: the id is what every relationship line and every `^ref` in the
 * file names, so renaming it on the canvas would mean rewriting lines all over
 * a multi-diagram document — a refactor rather than an edit, and it belongs in
 * the pane where the reader can see every line it touches. The display NAME is
 * the safe rename: nothing addresses a node by its name.
 *
 * `type` and `tags` as free text are absent because the panel has no control
 * for them yet; each arrives with the control that edits it, so this type
 * never promises a field the canvas cannot write. The drill-down pointers are
 * absent for a different reason: giving a node a child diagram writes a whole
 * diagram block as well as the node's own line, so it is its own gesture
 * (`nestedNodeEdit`) rather than a form field.
 */
export interface C4NodeRevision {
  name: string;
  technology?: string;
  description?: string;
  /** Absent means the type's default icon — the same omission the format
   *  writes, so clearing the picker genuinely removes the `@` token. */
  icon?: string;
  /** Present only when `icon` is, exactly as on `C4Node`. */
  iconSource?: IconSource;
  /**
   * THE ONE FIELD THAT IS NOT WHOLE-VALUE, deliberately: colour is a pairing
   * of the node's tags with the file header rather than a node field, and its
   * cleared state already has a spelling (`{ kind: "role" }`), so `undefined`
   * is free to mean "no claim — leave tags and header untouched". That is
   * what lets a caller that edits only wording keep its hands off a tag
   * vocabulary it never looked at.
   */
  color?: C4NodeColorChoice;
  /**
   * NOT WHOLE-VALUE EITHER, for colour's reason: the cleared state has its
   * own spelling (`{ kind: "none" }`), so `undefined` means "no claim — leave
   * membership and the diagram's frames untouched", which keeps a caller that
   * edits only wording away from boundaries it never looked at.
   */
  frame?: C4NodeFrameChoice;
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

/**
 * A labelled grouping frame drawn *behind* a set of nodes — the C4 boundary
 * ("Internal", "AWS Region", a trust boundary). Purely a view construct: a
 * frame owns no behaviour and carries no relationships, so it never appears as
 * an edge endpoint.
 *
 * Membership lives on the NODE (`C4Node.frameId`), not as a list here. One
 * direction only, because a list on both sides is a synchronisation bug
 * waiting to happen — and node-side membership is what the Mermaid importer
 * already produces (`boundary:<id>` tags, see `mermaid/lib/mapping.ts`), so
 * imported boundaries convert without reshaping.
 *
 * Deliberately NO geometry. A frame's rectangle is derived from the bounding
 * box of its members plus padding, the same reasoning as `.alab`'s omitted
 * node geometry (`archtext/lib/defaults.ts`): a stored rect would drift out of
 * step the moment a member moves, and "the frame is wrong" is a worse failure
 * than "the frame is auto-sized". A frame with no members therefore has no
 * rectangle and is not drawn — it is kept in the model rather than dropped so
 * that emptying a frame while editing is not a destructive act.
 */
export interface C4Frame {
  /** Slug, unique within its diagram. */
  id: string;
  /** Shown on the frame's edge, e.g. "Internal". */
  label: string;
  /**
   * Enclosing frame in the same diagram, for nested boundaries. `null` or
   * absent => top level. Cycles are rejected at validation.
   */
  parentFrameId?: string | null;
}

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
  /** Grouping frames drawn behind the nodes. Sorted by `id` on write. */
  frames?: C4Frame[];
  /** Sorted by `id` on write. */
  nodes: C4Node[];
  /** Sorted by `id` on write. */
  edges: C4Edge[];
}

/* -------------------------------------------------------------------------- */
/* File                                                                        */
/* -------------------------------------------------------------------------- */

/** Sanitised inline SVG, keyed by icon slug. */
export interface CustomIcon {
  name: string;
  svg: string;
}

export interface ArchLabMetadata {
  title: string;
  description?: string;
  /** Team or person accountable for accuracy. */
  owner?: string;
  tags?: string[];
  /** ISO-8601 UTC. Written once, never modified. */
  createdAt: string;
  /** ISO-8601 UTC. Written only when the model actually changed. */
  updatedAt: string;
  /** Drives the "review overdue" chip. */
  lastReviewedAt?: string;
  /** `{ "<tag>": "<hex>" }`. */
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
export interface ArchLabFile {
  /** URL of the JSON Schema, for editor autocomplete. */
  $schema?: string;
  /** "MAJOR.MINOR". */
  version: string;
  metadata: ArchLabMetadata;
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

/** Whether `type` may appear on a diagram at `level`. */
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

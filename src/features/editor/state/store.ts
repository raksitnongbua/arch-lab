/**
 * The one Zustand store (D6) — the in-memory model and every mutation this
 * sprint applies to it (D8). Implements the §4.1 contract of
 * `docs/product/dev-handoff.md` exactly.
 *
 * Invariants (see ./README.md):
 * - Every mutating action is exactly ONE history entry (AF-E1-S7).
 * - View-state actions (`setActiveDiagram`, `setSelection`, `setViewport`,
 *   `beginLabelEdit`, …) NEVER create a history entry.
 * - The `model` object is immutable once set: mutations run on a fresh
 *   `structuredClone` and swap it in.
 * - Every node `position` written is a multiple of 8; every `size` ≥ 120×64.
 * - Level rules (AF-E2-S1) are enforced here, not in the UI: `createNode`
 *   throws `InvalidNodeTypeError`, `createEdge` throws
 *   `CrossDiagramEdgeError`, `createChildDiagram` throws `MaxDepthError`.
 */

import { create } from "zustand";

import {
  childLevelOf,
  isNodeTypeValidAtLevel,
  VALID_NODE_TYPES_BY_LEVEL,
  type ArchLabMetadata,
  type C4Diagram,
  type C4Edge,
  type C4Frame,
  type C4Level,
  type C4Node,
  type C4NodeType,
  type EdgeDirection,
  type EdgeStyle,
  type Point,
  type Viewport,
} from "@/types";

import {
  CrossDiagramEdgeError,
  InvalidNodeTypeError,
  MaxDepthError,
} from "./errors";
import { createHistory } from "./history";
import {
  applyDeleteCascade,
  attachChildDiagram,
  clampSize,
  collectDeleteCascade,
  collectEdgeIds,
  collectNodeIds,
  createEmptyModel,
  DEFAULT_NODE_NAME_BY_TYPE,
  DEFAULT_NODE_SIZE,
  findEdge,
  findEdgeAnywhere,
  findNode,
  findNodeAnywhere,
  getDiagramOrThrow,
  mirrorRefIdentity,
  PASTE_OFFSET,
  slugify,
  roundPoint,
  snapPoint,
  syncRefPlaceholders,
  uniqueId,
} from "./model";

/* -------------------------------------------------------------------------- */
/* Contract types (§4.1)                                                       */
/* -------------------------------------------------------------------------- */

/** The model in memory. Diagrams keyed by id; serialized back to a sorted array. */
export interface EditorModel {
  version: string;
  metadata: ArchLabMetadata;
  rootDiagramId: string;
  diagrams: Record<string, C4Diagram>;
  /** Unknown top-level fields from a newer minor version, preserved verbatim. */
  unknownFields: Record<string, unknown>;
}

export interface Selection {
  nodeIds: string[];
  edgeIds: string[];
}

export interface LabelEditTarget {
  kind: "node" | "edge";
  id: string;
}

export interface BreadcrumbSegment {
  diagramId: string;
  /** Owner node's name, or the model title at the root. */
  label: string;
  level: C4Level;
}

export interface DeleteResult {
  removedNodes: number;
  removedEdges: number;
  removedDiagrams: number;
}

export interface EditorState {
  model: EditorModel;
  activeDiagramId: string;
  selection: Selection;
  labelEdit: LabelEditTarget | null;
  /** Per-diagram camera, for breadcrumb restore (AF-E2-S3). */
  viewportByDiagramId: Record<string, Viewport>;
  /** Per-diagram last selected node id, for breadcrumb restore. */
  lastSelectedByDiagramId: Record<string, string | null>;
  isDirty: boolean;
  /** epoch ms of the last successful save to disk, or null. */
  savedAt: number | null;
  canUndo: boolean;
  canRedo: boolean;
  /** Set by T3-A after a successful save; used for the draft key (D19). */
  fileHandleName: string | null;
}

export interface EditorActions {
  /* ---- model mutations. Each call is exactly ONE undo entry. ---- */
  createNode(input: {
    diagramId: string;
    type: C4NodeType;
    position: Point;
    name?: string;
    size?: { width: number; height: number };
  }): string; // new node id. Throws InvalidNodeTypeError.

  updateNode(
    diagramId: string,
    nodeId: string,
    patch: Partial<Omit<C4Node, "id">>,
    /** Successive calls sharing a coalesceKey collapse into one undo entry. */
    opts?: { coalesceKey?: string },
  ): void;

  /** Absolute final positions, keyed by node id. One entry for the whole drag. */
  moveNodes(diagramId: string, positions: Record<string, Point>): void;

  deleteNodes(diagramId: string, nodeIds: string[]): DeleteResult;

  /**
   * Clones `nodes` — plus the subset of `edges` whose BOTH endpoints are among
   * them — into `diagramId` as exactly ONE undo entry, and selects the result.
   *
   * Ids are regenerated file-wide, so a clipboard payload can be pasted
   * repeatedly and into a different diagram. A paste is a FLAT clone:
   * `childDiagramId`, `childRef` and `externalRef` are dropped rather than
   * aliased, so two nodes never point at one subtree.
   *
   * Throws `InvalidNodeTypeError` when any node's type is illegal at the
   * target diagram's level (AF-E2-S1 is enforced here, not in the UI).
   */
  pasteNodes(input: {
    diagramId: string;
    nodes: C4Node[];
    edges: C4Edge[];
    /** Added to every pasted position before snapping. Defaults to PASTE_OFFSET. */
    offset?: Point;
    /**
     * Whether to select the clones. Default true. Alt+drag-to-clone passes
     * false: it leaves a copy behind and keeps dragging the ORIGINAL, so
     * stealing the selection mid-gesture would drop the drag.
     */
    select?: boolean;
  }): { nodeIds: string[]; edgeIds: string[] };

  /**
   * Places a read-only boundary placeholder in `diagramId` pointing at
   * `sourceNodeId` in `sourceDiagramId` — the `^ctx-x/user` form in .alab.
   * ONE undo entry; returns the new node's id.
   *
   * Identity fields (name, type, technology, icon, description) are COPIED,
   * not read through the pointer, because the renderer and the serializer both
   * treat a node as self-describing. The `externalRef` records provenance so
   * the chip can say where it came from and validation can check the target
   * still exists.
   *
   * Throws `InvalidNodeTypeError` when the source's type is illegal at the
   * target level — a reference is not an escape hatch from the level rules.
   */
  createRefNode(input: {
    diagramId: string;
    sourceDiagramId: string;
    sourceNodeId: string;
    position: Point;
  }): string;

  createEdge(input: {
    diagramId: string;
    source: string;
    target: string;
    direction?: EdgeDirection;
    label?: string;
    technology?: string;
    style?: EdgeStyle;
  }): string; // new edge id. Throws CrossDiagramEdgeError; refuses source === target.

  updateEdge(
    diagramId: string,
    edgeId: string,
    patch: Partial<Omit<C4Edge, "id">>,
    opts?: { coalesceKey?: string },
  ): void;
  deleteEdges(diagramId: string, edgeIds: string[]): DeleteResult;

  updateDiagram(
    diagramId: string,
    patch: Partial<Pick<C4Diagram, "title" | "description">>,
    opts?: { coalesceKey?: string },
  ): void;
  updateMetadata(patch: Partial<ArchLabMetadata>): void;

  /* ---- frames: the C4 grouping boundaries drawn behind the nodes ---- */

  /**
   * Adds a frame to `diagramId` and returns its id.
   *
   * `nodeIds` are moved INTO the new frame as part of the same history entry,
   * which is the whole gesture in one step: the way a boundary gets created is
   * by selecting the things that belong in it. Passing none is allowed — an
   * empty frame is legal in the model (see `C4Frame`) and is how you make a
   * boundary before the elements exist.
   *
   * Throws when `parentFrameId` names a frame that is not in this diagram, or
   * when a node id is not.
   */
  createFrame(input: {
    diagramId: string;
    label?: string;
    nodeIds?: readonly string[];
    parentFrameId?: string | null;
  }): string;

  /**
   * Renames or re-parents a frame. Re-parenting is refused when it would make
   * the frame enclose itself — the file validator rejects such a file, so the
   * editor must never be able to produce one.
   */
  updateFrame(
    diagramId: string,
    frameId: string,
    patch: Partial<Omit<C4Frame, "id">>,
    opts?: { coalesceKey?: string },
  ): void;

  /**
   * Removes a frame. NEVER removes anything else: member nodes and nested
   * frames are re-homed to the deleted frame's own parent, so deleting the
   * outer of two boundaries leaves the inner one intact one level out.
   *
   * That asymmetry with `deleteNodes` is deliberate. A frame is scenery — it
   * owns no behaviour and carries no relationships — so cascading from it
   * would destroy elements the user never pointed at.
   */
  deleteFrame(diagramId: string, frameId: string): void;

  /**
   * Puts `nodeIds` in `frameId`, or takes them out of any frame when it is
   * `null`. One history entry for the whole batch.
   */
  setNodeFrame(
    diagramId: string,
    nodeIds: readonly string[],
    frameId: string | null,
  ): void;

  /** Creates the child diagram one level deeper and sets BOTH pointers. Throws MaxDepthError at `code`. */
  createChildDiagram(diagramId: string, nodeId: string): string; // child diagram id

  /** Groups several mutations into ONE undo entry. Nested calls join the outer transaction. */
  transact<T>(label: string, fn: () => T): T;

  /* ---- view state. NEVER an undo entry. ---- */
  setActiveDiagram(diagramId: string): void;
  setSelection(selection: Selection): void;
  toggleNodeSelection(nodeId: string): void;
  clearSelection(): void;
  setViewport(diagramId: string, viewport: Viewport): void;
  beginLabelEdit(target: LabelEditTarget): void;
  /** commit=false reverts. An empty committed value keeps the previous one. */
  endLabelEdit(commit: boolean, value?: string): void;

  /* ---- history ---- */
  undo(): void;
  redo(): void;

  /* ---- persistence seams ---- */
  replaceModel(
    model: EditorModel,
    opts: { markSaved: boolean; fileHandleName?: string | null },
  ): void;
  markSaved(at: number, fileHandleName?: string | null): void;
}

export type EditorStore = EditorState & EditorActions;

/* -------------------------------------------------------------------------- */
/* Internal helpers                                                            */
/* -------------------------------------------------------------------------- */

function emptySelection(): Selection {
  return { nodeIds: [], edgeIds: [] };
}

function cloneSelection(selection: Selection): Selection {
  return { nodeIds: [...selection.nodeIds], edgeIds: [...selection.edgeIds] };
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Apply a patch in place. A key explicitly set to `undefined` DELETES the
 * field (so the inspector can clear an optional like `description`; the
 * serializer omits absent fields per data-model.md), except keys listed in
 * `required`, which are never deleted. `"id"` is always ignored.
 */
function applyPatch(
  target: object,
  patch: object,
  required: ReadonlySet<string>,
  allowed?: ReadonlySet<string>,
): void {
  const record = target as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (key === "id") continue;
    if (allowed !== undefined && !allowed.has(key)) continue;
    if (value === undefined) {
      if (!required.has(key)) delete record[key];
    } else {
      record[key] = value;
    }
  }
}

const NODE_REQUIRED_KEYS: ReadonlySet<string> = new Set([
  "type",
  "name",
  "position",
  "size",
]);
const EDGE_REQUIRED_KEYS: ReadonlySet<string> = new Set([
  "source",
  "target",
  "direction",
]);
const DIAGRAM_PATCH_KEYS: ReadonlySet<string> = new Set([
  "title",
  "description",
]);
const DIAGRAM_REQUIRED_KEYS: ReadonlySet<string> = new Set(["title"]);
const FRAME_PATCH_KEYS: ReadonlySet<string> = new Set([
  "label",
  "parentFrameId",
]);
// `label` is required: the file validator rejects a frame with an empty one,
// and a frame's label is the only thing identifying it on the canvas.
const FRAME_REQUIRED_KEYS: ReadonlySet<string> = new Set(["label"]);

/** The default label for a new boundary — C4's most common one by far. */
const DEFAULT_FRAME_LABEL = "Internal";

function findFrameOrThrow(diagram: C4Diagram, frameId: string): C4Frame {
  const frame = (diagram.frames ?? []).find((each) => each.id === frameId);
  if (frame === undefined) {
    throw new Error(
      `Frame "${frameId}" does not exist in diagram "${diagram.id}".`,
    );
  }
  return frame;
}

/**
 * Whether making `parentId` the parent of `frameId` would close a loop.
 *
 * Walks up from the proposed parent looking for the frame itself. The file
 * validator already refuses a cyclic file (`io/validate.ts`), so the editor
 * producing one would mean writing a document it then cannot read back — the
 * check belongs on both sides.
 */
function wouldCycle(
  frames: readonly C4Frame[],
  frameId: string,
  parentId: string,
): boolean {
  const parentOf = new Map(
    frames.map((frame) => [frame.id, frame.parentFrameId ?? null]),
  );
  let cursor: string | null = parentId;
  // Bounded by the frame count: a chain longer than that has already revisited.
  for (let step = 0; cursor !== null && step <= frames.length; step += 1) {
    if (cursor === frameId) return true;
    cursor = parentOf.get(cursor) ?? null;
  }
  return false;
}

/** Frames sorted by id — the order the serializer writes, kept in memory too. */
function sortFrames(frames: C4Frame[]): C4Frame[] {
  return frames.sort((a, b) => a.id.localeCompare(b.id));
}

function findNodeOrThrow(diagram: C4Diagram, nodeId: string): C4Node {
  const node = findNode(diagram, nodeId);
  if (node === undefined) {
    throw new Error(
      `Node "${nodeId}" does not exist in diagram "${diagram.id}".`,
    );
  }
  return node;
}

function findEdgeOrThrow(diagram: C4Diagram, edgeId: string): C4Edge {
  const edge = findEdge(diagram, edgeId);
  if (edge === undefined) {
    throw new Error(
      `Edge "${edgeId}" does not exist in diagram "${diagram.id}".`,
    );
  }
  return edge;
}

/* -------------------------------------------------------------------------- */
/* The store                                                                   */
/* -------------------------------------------------------------------------- */

/** The only store. Zustand; use with a selector to avoid over-rendering. */
export const useEditorStore = create<EditorStore>()((set, get) => {
  const history = createHistory();

  /** Flags derived from the history manager after any history activity. */
  function historyFlags(): Pick<
    EditorState,
    "isDirty" | "canUndo" | "canRedo"
  > {
    return {
      isDirty: history.isDirty(),
      canUndo: history.canUndo,
      canRedo: history.canRedo,
    };
  }

  /**
   * Swap in a mutated clone as exactly one history entry (or as part of the
   * enclosing transaction / coalescing run). `extra` lets a mutation adjust
   * view state in the same set — never history-tracked.
   */
  function commitModel(
    next: EditorModel,
    coalesceKey?: string,
    extra?: Partial<EditorState>,
  ): void {
    history.recordMutation(get().model, coalesceKey);
    set({ model: next, ...historyFlags(), ...extra });
  }

  /** Selection with ids that no longer resolve in `model` pruned out. */
  function pruneViewState(
    model: EditorModel,
    state: EditorState,
  ): Partial<EditorState> {
    const activeDiagramId =
      model.diagrams[state.activeDiagramId] !== undefined
        ? state.activeDiagramId
        : model.rootDiagramId;
    const active = model.diagrams[activeDiagramId];
    const selection: Selection =
      active === undefined
        ? emptySelection()
        : {
            nodeIds: state.selection.nodeIds.filter(
              (id) => findNode(active, id) !== undefined,
            ),
            edgeIds: state.selection.edgeIds.filter(
              (id) => findEdge(active, id) !== undefined,
            ),
          };
    const labelEdit =
      state.labelEdit === null
        ? null
        : state.labelEdit.kind === "node"
          ? findNodeAnywhere(model, state.labelEdit.id) !== undefined
            ? state.labelEdit
            : null
          : findEdgeAnywhere(model, state.labelEdit.id) !== undefined
            ? state.labelEdit
            : null;
    return { activeDiagramId, selection, labelEdit };
  }

  const initialModel = createEmptyModel();

  return {
    /* ------------------------------ state ------------------------------ */
    model: initialModel,
    activeDiagramId: initialModel.rootDiagramId,
    selection: emptySelection(),
    labelEdit: null,
    viewportByDiagramId: {},
    lastSelectedByDiagramId: {},
    isDirty: false,
    savedAt: null,
    canUndo: false,
    canRedo: false,
    fileHandleName: null,

    /* -------------------------- model mutations ------------------------ */

    createNode(input) {
      const state = get();
      const diagram = getDiagramOrThrow(state.model, input.diagramId);
      if (!isNodeTypeValidAtLevel(input.type, diagram.level)) {
        throw new InvalidNodeTypeError(
          diagram.level,
          input.type,
          VALID_NODE_TYPES_BY_LEVEL[diagram.level],
        );
      }
      const name =
        input.name !== undefined && input.name.trim() !== ""
          ? input.name.trim()
          : DEFAULT_NODE_NAME_BY_TYPE[input.type];
      const id = uniqueId(
        slugify(name, slugify(input.type)),
        collectNodeIds(state.model),
      );
      const node: C4Node = {
        id,
        type: input.type,
        name,
        position: snapPoint(input.position),
        size: clampSize(input.size ?? DEFAULT_NODE_SIZE),
      };
      const next = structuredClone(state.model);
      getDiagramOrThrow(next, input.diagramId).nodes.push(node);
      commitModel(next);
      return id;
    },

    updateNode(diagramId, nodeId, patch, opts) {
      const state = get();
      findNodeOrThrow(getDiagramOrThrow(state.model, diagramId), nodeId);
      const normalized: Partial<Omit<C4Node, "id">> = { ...patch };
      if (normalized.position !== undefined) {
        normalized.position = roundPoint(normalized.position);
      }
      if (normalized.size !== undefined) {
        normalized.size = clampSize(normalized.size);
      }
      const next = structuredClone(state.model);
      const node = findNodeOrThrow(getDiagramOrThrow(next, diagramId), nodeId);
      const before = structuredClone(node);
      applyPatch(node, normalized, NODE_REQUIRED_KEYS);
      if (jsonEqual(before, node)) return; // no-op edits pollute neither model nor history
      // A `^ref` placeholder mirrors its original's identity. Renaming the
      // original has to reach every placeholder or the file goes stale — the
      // .alab stores the name on the ref line, so "fix it on render" would
      // still write the old string to disk. Same undo entry: one edit, one
      // history step, however many diagrams it touches.
      syncRefPlaceholders(next, diagramId, nodeId);
      commitModel(next, opts?.coalesceKey);
    },

    moveNodes(diagramId, positions) {
      const state = get();
      getDiagramOrThrow(state.model, diagramId);
      const next = structuredClone(state.model);
      const diagram = getDiagramOrThrow(next, diagramId);
      let changed = false;
      for (const [nodeId, position] of Object.entries(positions)) {
        const node = findNode(diagram, nodeId);
        if (node === undefined) continue; // tolerate a drag-stop race
        const snapped = roundPoint(position);
        if (node.position.x !== snapped.x || node.position.y !== snapped.y) {
          node.position = snapped;
          changed = true;
        }
      }
      if (!changed) return;
      commitModel(next);
    },

    deleteNodes(diagramId, nodeIds) {
      const state = get();
      const diagram = getDiagramOrThrow(state.model, diagramId);
      const cascade = collectDeleteCascade(state.model, diagram, nodeIds);
      if (cascade.nodeIds.size === 0) {
        return { removedNodes: 0, removedEdges: 0, removedDiagrams: 0 };
      }
      const next = structuredClone(state.model);
      // Delegated rather than inlined: this used to be a hand-rolled copy of
      // `applyDeleteCascade`, which left that helper dead and let the two
      // drift — the reason cross-diagram `^ref` cleanup was missing here.
      // One cascade, one applier.
      applyDeleteCascade(next, diagramId, cascade);
      // View-state cleanup for removed diagrams (never a history entry).
      const viewportByDiagramId = { ...state.viewportByDiagramId };
      const lastSelectedByDiagramId = { ...state.lastSelectedByDiagramId };
      for (const removedDiagramId of cascade.diagramIds) {
        delete viewportByDiagramId[removedDiagramId];
        delete lastSelectedByDiagramId[removedDiagramId];
      }
      commitModel(next, undefined, {
        viewportByDiagramId,
        lastSelectedByDiagramId,
        ...pruneViewState(next, {
          ...state,
          viewportByDiagramId,
          lastSelectedByDiagramId,
        }),
      });
      return {
        removedNodes: cascade.removedNodes,
        removedEdges: cascade.removedEdges,
        removedDiagrams: cascade.removedDiagrams,
      };
    },

    pasteNodes(input) {
      const state = get();
      const diagram = getDiagramOrThrow(state.model, input.diagramId);

      // Level rules first: reject the whole payload before mutating anything,
      // so a failed paste leaves no half-cloned diagram behind.
      for (const node of input.nodes) {
        if (!isNodeTypeValidAtLevel(node.type, diagram.level)) {
          throw new InvalidNodeTypeError(
            diagram.level,
            node.type,
            VALID_NODE_TYPES_BY_LEVEL[diagram.level],
          );
        }
      }

      const offset = input.offset ?? { x: PASTE_OFFSET, y: PASTE_OFFSET };
      // Mutated as we go: ids must be unique file-wide, and two clones in one
      // paste must not collide with each other either.
      const takenNodeIds = collectNodeIds(state.model);
      const takenEdgeIds = collectEdgeIds(state.model);

      /** Original node id → clone's node id. Rewires the copied edges. */
      const idMap = new Map<string, string>();

      const nodeClones: C4Node[] = input.nodes.map((node) => {
        const id = uniqueId(
          slugify(node.name, slugify(node.type)),
          takenNodeIds,
        );
        takenNodeIds.add(id);
        idMap.set(node.id, id);
        const clone: C4Node = {
          ...structuredClone(node),
          id,
          position: snapPoint({
            x: node.position.x + offset.x,
            y: node.position.y + offset.y,
          }),
          size: clampSize(node.size),
        };
        // A paste is a FLAT clone. Copying these pointers would alias the
        // original's subtree (two nodes owning one child diagram) or its
        // external file — both break the model's tree invariant.
        delete clone.childDiagramId;
        delete clone.childRef;
        delete clone.externalRef;
        return clone;
      });

      // TODO(human): build `edgeClones` from `input.edges`.
      //
      // Two rules, both load-bearing:
      //  1. Keep an edge ONLY if `idMap` has BOTH its `source` and its
      //     `target`. An edge with one endpoint outside the payload has
      //     nothing to attach to in the target diagram — dropping it silently
      //     is correct (C4Edge requires both endpoints in the SAME diagram).
      //  2. For a kept edge, `structuredClone` it, then rewire `source` and
      //     `target` through `idMap`, and mint a fresh id with
      //     `uniqueId(`e-${newSource}-${newTarget}`, takenEdgeIds)` —
      //     remembering to `takenEdgeIds.add(...)` so two pasted edges
      //     between the same pair don't collide.
      //
      // Also drop `realizes`: it points at an edge id one level up that this
      // clone does not implement.
      const edgeClones: C4Edge[] = [];

      const next = structuredClone(state.model);
      const target = getDiagramOrThrow(next, input.diagramId);
      target.nodes.push(...nodeClones);
      target.edges.push(...edgeClones);

      const nodeIds = nodeClones.map((node) => node.id);
      const edgeIds = edgeClones.map((edge) => edge.id);
      // Selecting the clones (never a history entry of its own — it rides
      // along in this commit) lets an immediate drag or nudge move the paste.
      commitModel(
        next,
        undefined,
        input.select === false
          ? undefined
          : { selection: { nodeIds, edgeIds } },
      );
      return { nodeIds, edgeIds };
    },

    createRefNode(input) {
      const state = get();
      const diagram = getDiagramOrThrow(state.model, input.diagramId);
      const sourceDiagram = getDiagramOrThrow(
        state.model,
        input.sourceDiagramId,
      );
      const source = findNodeOrThrow(sourceDiagram, input.sourceNodeId);

      if (source.externalRef !== undefined) {
        throw new Error(
          `Node "${source.id}" is itself a boundary placeholder — reference the original instead.`,
        );
      }
      // A reference is NOT an escape hatch from the level rules.
      if (!isNodeTypeValidAtLevel(source.type, diagram.level)) {
        throw new InvalidNodeTypeError(
          diagram.level,
          source.type,
          VALID_NODE_TYPES_BY_LEVEL[diagram.level],
        );
      }
      // One placeholder per original per diagram.
      const duplicate = diagram.nodes.find(
        (node) =>
          node.externalRef?.diagramId === input.sourceDiagramId &&
          node.externalRef?.nodeId === input.sourceNodeId,
      );
      if (duplicate !== undefined) {
        throw new Error(
          `"${source.name}" is already referenced in this diagram.`,
        );
      }

      const id = uniqueId(
        slugify(`${source.name}-ref`, slugify(source.type)),
        collectNodeIds(state.model),
      );
      const node: C4Node = {
        id,
        type: source.type,
        name: source.name,
        position: snapPoint(input.position),
        size: clampSize(source.size),
        externalRef: {
          diagramId: input.sourceDiagramId,
          nodeId: input.sourceNodeId,
        },
      };
      // The SAME mirror the rename cascade uses (`REF_MIRRORED_KEYS`), so a
      // freshly placed reference and a re-synced one always carry identical
      // fields. Optional keys are only set when present, so the serializer
      // never emits empty ones.
      mirrorRefIdentity(node, source);

      const next = structuredClone(state.model);
      getDiagramOrThrow(next, input.diagramId).nodes.push(node);
      // Placeholders are read-only, so there is nothing to rename or edit on
      // creation — select it so the user can see and position it, no more.
      commitModel(next, undefined, {
        selection: { nodeIds: [id], edgeIds: [] },
      });
      return id;
    },

    createEdge(input) {
      const state = get();
      const diagram = getDiagramOrThrow(state.model, input.diagramId);
      if (input.source === input.target) {
        throw new Error(
          "Self-edges are not supported: source and target are the same node.",
        );
      }
      for (const endpoint of [input.source, input.target]) {
        if (findNode(diagram, endpoint) === undefined) {
          if (findNodeAnywhere(state.model, endpoint) !== undefined) {
            throw new CrossDiagramEdgeError(
              `Node "${endpoint}" is not in diagram "${diagram.id}" — ` +
                "edges must connect two nodes in the same diagram.",
            );
          }
          throw new Error(`Node "${endpoint}" does not exist.`);
        }
      }
      const id = uniqueId(
        `e-${input.source}-${input.target}`,
        collectEdgeIds(state.model),
      );
      const edge: C4Edge = {
        id,
        source: input.source,
        target: input.target,
        direction: input.direction ?? "forward",
      };
      if (input.label !== undefined) edge.label = input.label;
      if (input.technology !== undefined) edge.technology = input.technology;
      if (input.style !== undefined) edge.style = input.style;
      const next = structuredClone(state.model);
      getDiagramOrThrow(next, input.diagramId).edges.push(edge);
      commitModel(next);
      return id;
    },

    updateEdge(diagramId, edgeId, patch, opts) {
      const state = get();
      findEdgeOrThrow(getDiagramOrThrow(state.model, diagramId), edgeId);
      const next = structuredClone(state.model);
      const edge = findEdgeOrThrow(getDiagramOrThrow(next, diagramId), edgeId);
      const before = structuredClone(edge);
      applyPatch(edge, patch, EDGE_REQUIRED_KEYS);
      if (jsonEqual(before, edge)) return;
      commitModel(next, opts?.coalesceKey);
    },

    deleteEdges(diagramId, edgeIds) {
      const state = get();
      const diagram = getDiagramOrThrow(state.model, diagramId);
      const existing = new Set(
        edgeIds.filter((id) => findEdge(diagram, id) !== undefined),
      );
      if (existing.size === 0) {
        return { removedNodes: 0, removedEdges: 0, removedDiagrams: 0 };
      }
      const next = structuredClone(state.model);
      const nextDiagram = getDiagramOrThrow(next, diagramId);
      nextDiagram.edges = nextDiagram.edges.filter(
        (edge) => !existing.has(edge.id),
      );
      commitModel(next, undefined, pruneViewState(next, state));
      return {
        removedNodes: 0,
        removedEdges: existing.size,
        removedDiagrams: 0,
      };
    },

    updateDiagram(diagramId, patch, opts) {
      const state = get();
      getDiagramOrThrow(state.model, diagramId);
      const next = structuredClone(state.model);
      const diagram = getDiagramOrThrow(next, diagramId);
      const before = structuredClone(diagram);
      applyPatch(diagram, patch, DIAGRAM_REQUIRED_KEYS, DIAGRAM_PATCH_KEYS);
      if (jsonEqual(before, diagram)) return;
      commitModel(next, opts?.coalesceKey);
    },

    updateMetadata(patch) {
      const state = get();
      const next = structuredClone(state.model);
      const before = structuredClone(next.metadata);
      // `title` and `createdAt` are required; never deleted by an undefined.
      applyPatch(
        next.metadata,
        patch,
        new Set(["title", "createdAt", "updatedAt"]),
      );
      if (jsonEqual(before, next.metadata)) return;
      commitModel(next);
    },

    createFrame({ diagramId, label, nodeIds = [], parentFrameId = null }) {
      const state = get();
      const existing = getDiagramOrThrow(state.model, diagramId);
      const trimmed = (label ?? "").trim();
      const frameLabel = trimmed === "" ? DEFAULT_FRAME_LABEL : trimmed;

      // Validate against the CURRENT model, before cloning: a throw must
      // leave the store exactly as it was, with no history entry.
      const frames = existing.frames ?? [];
      if (parentFrameId !== null && parentFrameId !== undefined) {
        findFrameOrThrow(existing, parentFrameId);
      }
      for (const nodeId of nodeIds) findNodeOrThrow(existing, nodeId);

      // Frame ids are unique WITHIN a diagram (data-model.md), not file-wide,
      // so the taken set is this diagram's frames — not every frame in the
      // file, which would needlessly suffix ids that cannot collide.
      const frameId = uniqueId(
        `f-${slugify(frameLabel, "frame")}`,
        new Set(frames.map((frame) => frame.id)),
      );

      const next = structuredClone(state.model);
      const diagram = getDiagramOrThrow(next, diagramId);
      const frame: C4Frame = { id: frameId, label: frameLabel };
      if (parentFrameId !== null && parentFrameId !== undefined) {
        frame.parentFrameId = parentFrameId;
      }
      diagram.frames = sortFrames([...(diagram.frames ?? []), frame]);
      // The members move in the SAME entry — creating a boundary around a
      // selection is one action, so undo must put it back in one step.
      for (const nodeId of nodeIds) {
        findNodeOrThrow(diagram, nodeId).frameId = frameId;
      }
      commitModel(next);
      return frameId;
    },

    updateFrame(diagramId, frameId, patch, opts) {
      const state = get();
      const current = getDiagramOrThrow(state.model, diagramId);
      const frames = current.frames ?? [];
      findFrameOrThrow(current, frameId);

      const parent = patch.parentFrameId;
      if (parent !== undefined && parent !== null) {
        findFrameOrThrow(current, parent);
        if (parent === frameId || wouldCycle(frames, frameId, parent)) {
          throw new Error(
            `Frame "${frameId}" cannot nest inside "${parent}" — ` +
              "that would make it enclose itself.",
          );
        }
      }

      const next = structuredClone(state.model);
      const diagram = getDiagramOrThrow(next, diagramId);
      const frame = findFrameOrThrow(diagram, frameId);
      const before = structuredClone(frame);
      applyPatch(frame, patch, FRAME_REQUIRED_KEYS, FRAME_PATCH_KEYS);
      // An all-whitespace rename would produce a file the validator refuses.
      if (typeof frame.label === "string" && frame.label.trim() === "") {
        frame.label = before.label;
      }
      if (jsonEqual(before, frame)) return;
      commitModel(next, opts?.coalesceKey);
    },

    deleteFrame(diagramId, frameId) {
      const state = get();
      const current = getDiagramOrThrow(state.model, diagramId);
      const doomed = findFrameOrThrow(current, frameId);
      // Where everything the frame held goes: one level out. `undefined`
      // rather than `null` for a top-level home, because `C4Node.frameId` is
      // absent-or-set and the serializer omits absent fields.
      const grandparent = doomed.parentFrameId ?? null;

      const next = structuredClone(state.model);
      const diagram = getDiagramOrThrow(next, diagramId);
      diagram.frames = (diagram.frames ?? []).filter(
        (frame) => frame.id !== frameId,
      );
      for (const frame of diagram.frames) {
        if ((frame.parentFrameId ?? null) === frameId) {
          if (grandparent === null) delete frame.parentFrameId;
          else frame.parentFrameId = grandparent;
        }
      }
      for (const node of diagram.nodes) {
        if (node.frameId === frameId) {
          if (grandparent === null) delete node.frameId;
          else node.frameId = grandparent;
        }
      }
      // An empty `frames` array and an absent one mean the same thing; drop it
      // so a diagram that never had boundaries round-trips byte-identically.
      if (diagram.frames.length === 0) delete diagram.frames;
      commitModel(next);
    },

    setNodeFrame(diagramId, nodeIds, frameId) {
      const state = get();
      const current = getDiagramOrThrow(state.model, diagramId);
      if (frameId !== null) findFrameOrThrow(current, frameId);
      for (const nodeId of nodeIds) findNodeOrThrow(current, nodeId);

      const next = structuredClone(state.model);
      const diagram = getDiagramOrThrow(next, diagramId);
      const before = structuredClone(diagram.nodes);
      for (const nodeId of nodeIds) {
        const node = findNodeOrThrow(diagram, nodeId);
        if (frameId === null) delete node.frameId;
        else node.frameId = frameId;
      }
      if (jsonEqual(before, diagram.nodes)) return;
      commitModel(next);
    },

    createChildDiagram(diagramId, nodeId) {
      const state = get();
      const diagram = getDiagramOrThrow(state.model, diagramId);
      const node = findNodeOrThrow(diagram, nodeId);
      if (childLevelOf(diagram.level) === null) {
        throw new MaxDepthError(
          `Diagram "${diagram.id}" is at level "code" — ` +
            "there is no level below it.",
        );
      }
      if (node.childDiagramId != null && node.childDiagramId !== "") {
        throw new Error(
          `Node "${nodeId}" already has a child diagram ("${node.childDiagramId}").`,
        );
      }
      if (node.childRef !== undefined) {
        throw new Error(
          `Node "${nodeId}" has a childRef — childDiagramId and childRef are mutually exclusive.`,
        );
      }
      if (node.externalRef !== undefined) {
        throw new Error(
          `Node "${nodeId}" is a read-only boundary placeholder and cannot be drilled into.`,
        );
      }
      const next = structuredClone(state.model);
      const nextDiagram = getDiagramOrThrow(next, diagramId);
      const nextNode = findNodeOrThrow(nextDiagram, nodeId);
      const childId = attachChildDiagram(next, nextDiagram, nextNode);
      commitModel(next);
      return childId;
    },

    transact(label, fn) {
      void label; // reserved for future history labelling / devtools
      const result = history.transact(
        () => get().model,
        (model) => {
          set({ model, ...historyFlags(), ...pruneViewState(model, get()) });
        },
        fn,
      );
      // The outermost commit may have pushed the grouped entry; refresh flags.
      if (!history.inTransaction) set(historyFlags());
      return result;
    },

    /* ----------------------------- view state -------------------------- */

    setActiveDiagram(diagramId) {
      const state = get();
      const diagram = state.model.diagrams[diagramId];
      if (diagram === undefined) {
        throw new Error(`Diagram "${diagramId}" does not exist.`);
      }
      // Restore that diagram's last selection (AF-E2-S3); breadcrumb code may
      // refine it, but a sensible default costs nothing.
      const last = state.lastSelectedByDiagramId[diagramId];
      const selection: Selection =
        typeof last === "string" && findNode(diagram, last) !== undefined
          ? { nodeIds: [last], edgeIds: [] }
          : emptySelection();
      set({ activeDiagramId: diagramId, selection, labelEdit: null });
    },

    setSelection(selection) {
      const state = get();
      const next = cloneSelection(selection);
      set({
        selection: next,
        lastSelectedByDiagramId: {
          ...state.lastSelectedByDiagramId,
          [state.activeDiagramId]:
            next.nodeIds[next.nodeIds.length - 1] ?? null,
        },
      });
    },

    toggleNodeSelection(nodeId) {
      const state = get();
      const nodeIds = state.selection.nodeIds.includes(nodeId)
        ? state.selection.nodeIds.filter((id) => id !== nodeId)
        : [...state.selection.nodeIds, nodeId];
      get().setSelection({ nodeIds, edgeIds: [...state.selection.edgeIds] });
    },

    clearSelection() {
      get().setSelection(emptySelection());
    },

    setViewport(diagramId, viewport) {
      const state = get();
      set({
        viewportByDiagramId: {
          ...state.viewportByDiagramId,
          [diagramId]: { x: viewport.x, y: viewport.y, zoom: viewport.zoom },
        },
      });
    },

    beginLabelEdit(target) {
      set({ labelEdit: { kind: target.kind, id: target.id } });
    },

    endLabelEdit(commit, value) {
      const state = get();
      const target = state.labelEdit;
      if (target === null) return;
      if (commit) {
        const trimmed = value === undefined ? "" : value.trim();
        // An empty committed value keeps the previous one (§4.1).
        if (trimmed !== "") {
          if (target.kind === "node") {
            const located = findNodeAnywhere(state.model, target.id);
            if (located !== undefined && located.node.name !== trimmed) {
              get().updateNode(located.diagram.id, target.id, {
                name: trimmed,
              });
            }
          } else {
            const located = findEdgeAnywhere(state.model, target.id);
            if (located !== undefined && located.edge.label !== trimmed) {
              get().updateEdge(located.diagram.id, target.id, {
                label: trimmed,
              });
            }
          }
        }
      }
      set({ labelEdit: null });
    },

    /* ------------------------------ history ---------------------------- */

    undo() {
      const state = get();
      const entry = history.undo(state.model);
      if (entry === null) return;
      set({
        model: entry.model,
        ...historyFlags(),
        ...pruneViewState(entry.model, state),
      });
    },

    redo() {
      const state = get();
      const entry = history.redo(state.model);
      if (entry === null) return;
      set({
        model: entry.model,
        ...historyFlags(),
        ...pruneViewState(entry.model, state),
      });
    },

    /* -------------------------- persistence seams ---------------------- */

    replaceModel(model, opts) {
      const next = structuredClone(model);
      history.reset(opts.markSaved);
      const viewportByDiagramId: Record<string, Viewport> = {};
      for (const diagram of Object.values(next.diagrams)) {
        if (diagram.viewport !== undefined) {
          viewportByDiagramId[diagram.id] = { ...diagram.viewport };
        }
      }
      set({
        model: next,
        activeDiagramId: next.rootDiagramId,
        selection: emptySelection(),
        labelEdit: null,
        viewportByDiagramId,
        lastSelectedByDiagramId: {},
        ...historyFlags(),
        savedAt: opts.markSaved ? Date.now() : null,
        // Undefined means "keep the current handle name" (draft recovery).
        ...(opts.fileHandleName !== undefined
          ? { fileHandleName: opts.fileHandleName }
          : {}),
      });
    },

    markSaved(at, fileHandleName) {
      history.markSaved();
      set({
        savedAt: at,
        ...historyFlags(),
        ...(fileHandleName !== undefined ? { fileHandleName } : {}),
      });
    },
  };
});

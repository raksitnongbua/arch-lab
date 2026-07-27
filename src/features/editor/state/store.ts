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
  slugify,
  roundPoint,
  snapPoint,
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
      const nextDiagram = getDiagramOrThrow(next, diagramId);
      nextDiagram.nodes = nextDiagram.nodes.filter(
        (node) => !cascade.nodeIds.has(node.id),
      );
      nextDiagram.edges = nextDiagram.edges.filter(
        (edge) => !cascade.edgeIds.has(edge.id),
      );
      for (const removedDiagramId of cascade.diagramIds) {
        delete next.diagrams[removedDiagramId];
      }
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

"use client";

/**
 * Delete with clear consequences.
 *
 * `requestDeleteSelection()` is the single entry point for every delete
 * gesture (Delete/Backspace via `hooks/use-delete-shortcut.ts`, the
 * inspector's Delete buttons). The rule for when a dialog appears:
 *
 * - No selected node owns a child diagram → delete IMMEDIATELY, no dialog.
 *   A toast states the exact counts from the store's `DeleteResult`
 *   ("Removed 1 node and 3 relationships") with a working Undo action.
 * - Any selected node owns a child diagram → this confirmation dialog first.
 *   It names the node and states the full blast radius — connected
 *   relationships, descendant nodes, and how many deeper diagram levels are
 *   removed with them. Cancel changes nothing.
 *
 * Rationale: a dialog is friction that only pays for itself when data the
 * user cannot see (a nested subtree) is at stake; edges are visible on the
 * canvas and one undo restores them, so they get a toast, not a dialog.
 *
 * Mixed node+edge selections delete inside one `transact`, so any delete —
 * however large — reverses in exactly one undo (store invariant).
 */

import { create } from "zustand";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import type { C4Diagram } from "@/types";

import { findRefPlaceholders } from "../../state/model";
import {
  selectActiveDiagram,
  useEditorStore,
  type DeleteResult,
  type EditorModel,
} from "../../state";

/* -------------------------------------------------------------------------- */
/* Pending-delete interaction state                                            */
/* -------------------------------------------------------------------------- */

export interface DeletePreview {
  diagramId: string;
  nodeIds: string[];
  edgeIds: string[];
  /** Names of the selected nodes, for the dialog title. */
  nodeNames: string[];
  /** Edges removed at this level: explicitly selected + incident, deduped. */
  edges: number;
  /** Nodes inside the descendant diagram subtree(s). */
  descendantNodes: number;
  /** Diagrams in the subtree(s). */
  descendantDiagrams: number;
  /** Distinct deeper levels those diagrams span. */
  descendantLevels: number;
  /**
   * `^ref` placeholders in OTHER diagrams that name a node being deleted, and
   * the titles of the diagrams losing them. Deleting an original destroys
   * content the user is not looking at, so this always forces a confirmation
   * even when there is no child-diagram subtree involved.
   */
  referencingPlaceholders: number;
  referencingDiagramNames: string[];
}

interface PendingDeleteState {
  pending: DeletePreview | null;
}

const usePendingDelete = create<PendingDeleteState>(() => ({ pending: null }));

/* -------------------------------------------------------------------------- */
/* Consequence collection (read-only walk; the store performs the delete)      */
/* -------------------------------------------------------------------------- */

function buildPreview(
  model: EditorModel,
  diagram: C4Diagram,
  nodeIds: string[],
  edgeIds: string[],
): DeletePreview {
  const nodeSet = new Set(nodeIds);
  const selectedNodes = diagram.nodes.filter((node) => nodeSet.has(node.id));

  const removedEdgeIds = new Set(
    edgeIds.filter((id) => diagram.edges.some((edge) => edge.id === id)),
  );
  for (const edge of diagram.edges) {
    if (nodeSet.has(edge.source) || nodeSet.has(edge.target)) {
      removedEdgeIds.add(edge.id);
    }
  }

  let descendantNodes = 0;
  let descendantDiagrams = 0;
  const levels = new Set<string>();
  const queue: string[] = [];
  for (const node of selectedNodes) {
    if (typeof node.childDiagramId === "string" && node.childDiagramId !== "") {
      queue.push(node.childDiagramId);
    }
  }
  const visited = new Set<string>();
  while (queue.length > 0) {
    const diagramId = queue.pop();
    if (diagramId === undefined || visited.has(diagramId)) continue;
    visited.add(diagramId);
    const child = model.diagrams[diagramId];
    if (child === undefined) continue;
    descendantDiagrams += 1;
    descendantNodes += child.nodes.length;
    levels.add(child.level);
    for (const node of child.nodes) {
      if (
        typeof node.childDiagramId === "string" &&
        node.childDiagramId !== ""
      ) {
        queue.push(node.childDiagramId);
      }
    }
  }

  // Placeholders naming any doomed node — the directly-selected ones and
  // everything inside the subtrees above. Uses the store's own
  // `findRefPlaceholders` predicate rather than re-deriving the match, so the
  // number shown here cannot disagree with what the delete actually removes.
  const doomed: Array<{ diagramId: string; nodeId: string }> =
    selectedNodes.map((node) => ({ diagramId: diagram.id, nodeId: node.id }));
  for (const descendantId of visited) {
    const child = model.diagrams[descendantId];
    if (child === undefined) continue;
    for (const node of child.nodes) {
      doomed.push({ diagramId: descendantId, nodeId: node.id });
    }
  }
  const removedDiagramIds = new Set(visited);
  let referencingPlaceholders = 0;
  const referencingDiagramNames = new Set<string>();
  for (const target of doomed) {
    for (const { diagram: host } of findRefPlaceholders(
      model,
      target.diagramId,
      target.nodeId,
    )) {
      // A diagram being deleted outright is not "losing a reference".
      if (host.id === diagram.id || removedDiagramIds.has(host.id)) continue;
      referencingPlaceholders += 1;
      referencingDiagramNames.add(host.title || host.id);
    }
  }

  return {
    diagramId: diagram.id,
    nodeIds: selectedNodes.map((node) => node.id),
    edgeIds: [...edgeIds],
    nodeNames: selectedNodes.map((node) => node.name),
    edges: removedEdgeIds.size,
    descendantNodes,
    descendantDiagrams,
    descendantLevels: levels.size,
    referencingPlaceholders,
    referencingDiagramNames: [...referencingDiagramNames],
  };
}

/* -------------------------------------------------------------------------- */
/* Executing the delete                                                        */
/* -------------------------------------------------------------------------- */

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function describeResult(result: DeleteResult): string {
  const parts: string[] = [];
  if (result.removedNodes > 0) parts.push(plural(result.removedNodes, "node"));
  if (result.removedEdges > 0) {
    parts.push(plural(result.removedEdges, "relationship"));
  }
  if (result.removedDiagrams > 0) {
    parts.push(plural(result.removedDiagrams, "child diagram"));
  }
  if (parts.length === 0) return "Removed nothing";
  if (parts.length === 1) return `Removed ${parts[0]}`;
  return `Removed ${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function performDelete(preview: DeletePreview): void {
  const store = useEditorStore.getState();
  const total: DeleteResult = {
    removedNodes: 0,
    removedEdges: 0,
    removedDiagrams: 0,
  };
  const add = (result: DeleteResult) => {
    total.removedNodes += result.removedNodes;
    total.removedEdges += result.removedEdges;
    total.removedDiagrams += result.removedDiagrams;
  };
  // One transaction = one undo entry, even for a mixed node+edge selection
  // whose selected edges are not incident to the selected nodes.
  store.transact("Delete selection", () => {
    if (preview.edgeIds.length > 0) {
      add(store.deleteEdges(preview.diagramId, preview.edgeIds));
    }
    if (preview.nodeIds.length > 0) {
      add(store.deleteNodes(preview.diagramId, preview.nodeIds));
    }
  });
  if (
    total.removedNodes === 0 &&
    total.removedEdges === 0 &&
    total.removedDiagrams === 0
  ) {
    return;
  }
  toast({
    message: describeResult(total),
    action: { label: "Undo", run: () => useEditorStore.getState().undo() },
  });
}

/**
 * Delete the current selection, confirming first when a nested subtree is at
 * stake. Safe to call with an empty selection (no-op). Every delete
 * gesture funnels through here.
 */
export function requestDeleteSelection(): void {
  const store = useEditorStore.getState();
  const diagram = selectActiveDiagram(store);
  const { nodeIds, edgeIds } = store.selection;
  if (nodeIds.length === 0 && edgeIds.length === 0) return;
  const preview = buildPreview(store.model, diagram, nodeIds, edgeIds);
  if (preview.nodeIds.length === 0 && preview.edgeIds.length === 0) return;
  // Confirm whenever the delete reaches beyond what the user can see: a nested
  // subtree, or placeholders in sibling diagrams that name this node.
  if (preview.descendantDiagrams > 0 || preview.referencingPlaceholders > 0) {
    usePendingDelete.setState({ pending: preview });
  } else {
    performDelete(preview);
  }
}

/* -------------------------------------------------------------------------- */
/* The dialog                                                                  */
/* -------------------------------------------------------------------------- */

function dialogTitle(preview: DeletePreview): string {
  if (preview.nodeIds.length === 1) return `Delete “${preview.nodeNames[0]}”?`;
  return `Delete ${preview.nodeIds.length} elements?`;
}

/**
 * The dialog now has two independent triggers — a nested subtree, or references
 * in sibling diagrams — so the lead sentence has to name the one that actually
 * fired. Telling a user their node "owns a nested diagram" when it merely
 * happens to be referenced elsewhere is simply false, and false explanations
 * teach people to dismiss confirmations without reading them.
 */
function dialogDescription(preview: DeletePreview): string {
  const nested = preview.descendantDiagrams > 0;
  const referenced = preview.referencingPlaceholders > 0;
  const tail = " One undo restores all of it.";
  if (nested && referenced) {
    return (
      "This selection owns a nested diagram and is referenced from other levels." +
      " Deleting it removes everything below and every reference to it." +
      tail
    );
  }
  if (nested) {
    return (
      "This selection owns a nested diagram. Deleting it removes everything" +
      " below —" +
      tail
    );
  }
  return (
    "This selection is referenced from other levels. Deleting it also removes" +
    " those references, in diagrams you are not currently viewing." +
    tail
  );
}

function consequenceLines(preview: DeletePreview): string[] {
  const lines: string[] = [];
  lines.push(
    preview.nodeIds.length === 1
      ? "The node itself"
      : `${plural(preview.nodeIds.length, "selected node")}` +
          (preview.edgeIds.length > 0
            ? ` and ${plural(preview.edgeIds.length, "selected relationship")}`
            : ""),
  );
  if (preview.edges > 0) {
    lines.push(`${plural(preview.edges, "connected relationship")}`);
  }
  if (preview.descendantDiagrams > 0) {
    lines.push(
      `Its nested subtree: ${plural(preview.descendantNodes, "descendant node")} across ` +
        `${plural(preview.descendantLevels, "deeper level")} ` +
        `(${plural(preview.descendantDiagrams, "diagram")})`,
    );
  }
  if (preview.referencingPlaceholders > 0) {
    // Names the diagrams, because this is the one consequence the user cannot
    // see from where they are standing.
    lines.push(
      `${plural(preview.referencingPlaceholders, "reference")} to it in ` +
        preview.referencingDiagramNames.map((name) => `“${name}”`).join(", "),
    );
  }
  return lines;
}

export function DeleteConfirmDialog(): React.JSX.Element | null {
  // Note: the Delete/Backspace bindings are registered by `InspectorPanel`
  // via `hooks/use-delete-shortcut.ts` — that hook imports
  // `requestDeleteSelection` from this file, so registering here would make
  // the two modules circular.
  const pending = usePendingDelete((s) => s.pending);
  if (pending === null) return null;

  const close = () => usePendingDelete.setState({ pending: null });
  const confirm = () => {
    close();
    performDelete(pending);
  };

  return (
    <Dialog
      open
      onClose={close}
      title={dialogTitle(pending)}
      description={dialogDescription(pending)}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={close}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="bg-destructive text-destructive-foreground shadow-destructive/25 hover:brightness-110"
            onClick={confirm}
          >
            Delete
          </Button>
        </>
      }
    >
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-foreground">
        {consequenceLines(pending).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </Dialog>
  );
}

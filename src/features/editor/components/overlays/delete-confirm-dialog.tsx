"use client";

/**
 * Delete with clear consequences (T2-D, AF-E3-S4).
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

  return {
    diagramId: diagram.id,
    nodeIds: selectedNodes.map((node) => node.id),
    edgeIds: [...edgeIds],
    nodeNames: selectedNodes.map((node) => node.name),
    edges: removedEdgeIds.size,
    descendantNodes,
    descendantDiagrams,
    descendantLevels: levels.size,
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
 * stake. Safe to call with an empty selection (no-op). Every T2-D delete
 * gesture funnels through here.
 */
export function requestDeleteSelection(): void {
  const store = useEditorStore.getState();
  const diagram = selectActiveDiagram(store);
  const { nodeIds, edgeIds } = store.selection;
  if (nodeIds.length === 0 && edgeIds.length === 0) return;
  const preview = buildPreview(store.model, diagram, nodeIds, edgeIds);
  if (preview.nodeIds.length === 0 && preview.edgeIds.length === 0) return;
  if (preview.descendantDiagrams > 0) {
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
  lines.push(
    `Its nested subtree: ${plural(preview.descendantNodes, "descendant node")} across ` +
      `${plural(preview.descendantLevels, "deeper level")} ` +
      `(${plural(preview.descendantDiagrams, "diagram")})`,
  );
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
      description="This selection owns a nested diagram. Deleting it removes everything below — one undo restores all of it."
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

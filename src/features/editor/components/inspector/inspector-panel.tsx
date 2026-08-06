"use client";

/**
 * The right-rail inspector (T2-D, AF-E3-S2/S3/S4). Props-free per the §4.4
 * mount contract — `editor-shell.tsx` is frozen and mounts exactly
 * `<InspectorPanel />`.
 *
 * Branches on the selection:
 * - exactly one node  → `NodeInspector` (name, description, technology,
 *   type, icon, tags)
 * - exactly one edge  → `EdgeInspector` (label, technology, direction, style)
 * - nothing selected  → `DiagramInspector` (title, description, updatedAt)
 * - anything else     → a multi-selection summary with a Delete action
 *
 * Also registers the Delete/Backspace shortcut (this component is always
 * mounted) and offers a Delete button for every non-empty selection — both
 * funnel through `requestDeleteSelection`, which owns the
 * confirm-vs-immediate rule.
 */

import { Copy, SquareDashed, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { isBoundaryPlaceholder } from "@/types";

import { useClipboardShortcuts } from "../../hooks/use-clipboard-shortcuts";
import { useDeleteShortcut } from "../../hooks/use-delete-shortcut";
import { duplicateSelection } from "../../lib/duplicate";
import { selectActiveDiagram, useEditorStore } from "../../state";
import { requestDeleteSelection } from "../overlays/delete-confirm-dialog";
import { DiagramInspector } from "./diagram-inspector";
import { EdgeInspector } from "./edge-inspector";
import { NodeInspector } from "./node-inspector";
import { RefInspector } from "./ref-inspector";

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * The pinned action footer. Actions share one `mt-auto` container so they sit
 * on a single divider — two separately-pinned blocks would stack two borders
 * and only the first would reach the bottom.
 *
 * Duplicate lives here rather than on the node itself: the node's corner grip
 * is spent on *relate*, which is a spatial gesture (drag to where the new
 * element goes) and so has to be on the canvas. Duplicate needs no aim, so a
 * panel button serves it fine — and it still has right-click and
 * `mod+c`/`mod+v`.
 *
 * `duplicateLabel` is omitted for selections that cannot be duplicated: an edge
 * alone (a relationship without its endpoints is meaningless) and read-only
 * boundary placeholders.
 */
/**
 * Wraps the selected nodes in a new boundary, then leaves the selection alone
 * so the group can be renamed straight away in the boundaries panel.
 *
 * Lives on the SELECTION footer, not in the boundaries panel, because that
 * panel sits on the diagram inspector — which by definition is only on screen
 * when nothing is selected. A "group the selection" button there could never
 * be pressed with a selection to group.
 */
function GroupIntoBoundaryButton({
  diagramId,
  nodeIds,
}: {
  diagramId: string;
  nodeIds: readonly string[];
}): React.JSX.Element {
  const createFrame = useEditorStore((s) => s.createFrame);
  const clearSelection = useEditorStore((s) => s.clearSelection);
  return (
    <Button
      variant="outline"
      size="sm"
      className="w-full"
      onClick={() => {
        createFrame({ diagramId, nodeIds });
        // Drop to the diagram inspector, which is where the new boundary's
        // label field is — otherwise the boundary appears on the canvas with a
        // default name and no visible way to rename it.
        clearSelection();
      }}
    >
      <SquareDashed aria-hidden="true" />
      {nodeIds.length === 1
        ? "Wrap in a boundary"
        : `Group ${plural(nodeIds.length, "node")} in a boundary`}
    </Button>
  );
}

function SelectionActions({
  deleteLabel,
  duplicateLabel,
  groupNodeIds,
  diagramId,
}: {
  deleteLabel: string;
  duplicateLabel?: string;
  /** Nodes to wrap in a new boundary. Omit (or empty) to hide the action. */
  groupNodeIds?: readonly string[];
  diagramId?: string;
}): React.JSX.Element {
  return (
    <div className="mt-auto flex flex-col gap-2 border-t border-border pt-3">
      {groupNodeIds !== undefined &&
      groupNodeIds.length > 0 &&
      diagramId !== undefined ? (
        <GroupIntoBoundaryButton diagramId={diagramId} nodeIds={groupNodeIds} />
      ) : null}
      {duplicateLabel !== undefined ? (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => duplicateSelection()}
        >
          <Copy aria-hidden="true" />
          {duplicateLabel}
        </Button>
      ) : null}
      <Button
        variant="outline"
        size="sm"
        className="w-full text-destructive hover:border-destructive/40 hover:bg-destructive/10"
        onClick={() => requestDeleteSelection()}
      >
        <Trash2 aria-hidden="true" />
        {deleteLabel}
      </Button>
    </div>
  );
}

function MultiSelectionSummary({
  nodeCount,
  edgeCount,
}: {
  nodeCount: number;
  edgeCount: number;
}): React.JSX.Element {
  const parts: string[] = [];
  if (nodeCount > 0) parts.push(plural(nodeCount, "node"));
  if (edgeCount > 0) parts.push(plural(edgeCount, "relationship"));
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        Multiple selected
      </h3>
      <p className="text-sm text-foreground">{parts.join(" and ")} selected.</p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Select a single element to edit its properties, or delete the whole
        selection below.
      </p>
    </section>
  );
}

export function InspectorPanel(): React.JSX.Element {
  useDeleteShortcut();
  useClipboardShortcuts();

  const diagram = useEditorStore(selectActiveDiagram);
  const selection = useEditorStore((s) => s.selection);

  const selectedNodes = diagram.nodes.filter((node) =>
    selection.nodeIds.includes(node.id),
  );
  const selectedEdges = diagram.edges.filter((edge) =>
    selection.edgeIds.includes(edge.id),
  );

  const singleNode =
    selectedNodes.length === 1 && selectedEdges.length === 0
      ? selectedNodes[0]
      : undefined;
  const singleEdge =
    selectedEdges.length === 1 && selectedNodes.length === 0
      ? selectedEdges[0]
      : undefined;
  const isEmpty = selectedNodes.length === 0 && selectedEdges.length === 0;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-3">
      <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        Inspector
      </h2>

      {singleNode !== undefined ? (
        <>
          {/* A placeholder's identity is owned by its original, so it gets a
              read-only panel with a route to the source instead of editable
              fields whose edits `syncRefPlaceholders` would overwrite. */}
          {isBoundaryPlaceholder(singleNode) ? (
            <RefInspector key={singleNode.id} node={singleNode} />
          ) : (
            <NodeInspector
              key={singleNode.id}
              diagramId={diagram.id}
              node={singleNode}
              level={diagram.level}
            />
          )}
          <SelectionActions
            deleteLabel={
              isBoundaryPlaceholder(singleNode)
                ? "Remove reference"
                : "Delete node"
            }
            duplicateLabel={
              isBoundaryPlaceholder(singleNode) ? undefined : "Duplicate node"
            }
            // A placeholder belongs to its original's diagram, so grouping it
            // here would put a boundary around something defined elsewhere.
            groupNodeIds={
              isBoundaryPlaceholder(singleNode) ? undefined : [singleNode.id]
            }
            diagramId={diagram.id}
          />
        </>
      ) : singleEdge !== undefined ? (
        <>
          <EdgeInspector
            key={singleEdge.id}
            diagramId={diagram.id}
            edge={singleEdge}
            nodes={diagram.nodes}
          />
          <SelectionActions deleteLabel="Delete relationship" />
        </>
      ) : isEmpty ? (
        <DiagramInspector key={diagram.id} diagram={diagram} />
      ) : (
        <>
          <MultiSelectionSummary
            nodeCount={selectedNodes.length}
            edgeCount={selectedEdges.length}
          />
          <SelectionActions
            deleteLabel="Delete selection"
            // Nodes present ⇒ duplicable. Edges ride along automatically when
            // both their endpoints are in the selection.
            duplicateLabel={
              selectedNodes.length > 0
                ? `Duplicate ${plural(selectedNodes.length, "node")}`
                : undefined
            }
            groupNodeIds={selectedNodes
              .filter((node) => !isBoundaryPlaceholder(node))
              .map((node) => node.id)}
            diagramId={diagram.id}
          />
        </>
      )}
    </div>
  );
}

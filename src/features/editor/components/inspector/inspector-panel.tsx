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

import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import { useDeleteShortcut } from "../../hooks/use-delete-shortcut";
import { selectActiveDiagram, useEditorStore } from "../../state";
import { requestDeleteSelection } from "../overlays/delete-confirm-dialog";
import { DiagramInspector } from "./diagram-inspector";
import { EdgeInspector } from "./edge-inspector";
import { NodeInspector } from "./node-inspector";

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function DeleteSelectionButton({
  label,
}: {
  label: string;
}): React.JSX.Element {
  return (
    <div className="mt-auto border-t border-border pt-3">
      <Button
        variant="outline"
        size="sm"
        className="w-full text-destructive hover:border-destructive/40 hover:bg-destructive/10"
        onClick={() => requestDeleteSelection()}
      >
        <Trash2 aria-hidden="true" />
        {label}
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
          <NodeInspector
            key={singleNode.id}
            diagramId={diagram.id}
            node={singleNode}
            level={diagram.level}
          />
          <DeleteSelectionButton label="Delete node" />
        </>
      ) : singleEdge !== undefined ? (
        <>
          <EdgeInspector
            key={singleEdge.id}
            diagramId={diagram.id}
            edge={singleEdge}
            nodes={diagram.nodes}
          />
          <DeleteSelectionButton label="Delete relationship" />
        </>
      ) : isEmpty ? (
        <DiagramInspector key={diagram.id} diagram={diagram} />
      ) : (
        <>
          <MultiSelectionSummary
            nodeCount={selectedNodes.length}
            edgeCount={selectedEdges.length}
          />
          <DeleteSelectionButton label="Delete selection" />
        </>
      )}
    </div>
  );
}

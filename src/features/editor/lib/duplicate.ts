"use client";

/**
 * One duplicate path, three entry points.
 *
 * Right-click → Duplicate, the inspector's Duplicate button, and Alt+drag all
 * funnel through here so they cannot drift apart in behaviour. Each is ONE
 * undo entry, because `store.pasteNodes` is.
 *
 * Duplicate is deliberately implemented on top of the clipboard's paste path
 * rather than beside it: both mean "clone these nodes into this diagram with
 * fresh ids", and the rules that make paste correct (flat clone, internal
 * edges only, level validation) are exactly the rules duplicate needs. The
 * only difference is that duplicate never touches the clipboard — duplicating
 * must not clobber whatever the user has copied.
 */

import { toast } from "@/components/ui/toast";
import type { Point } from "@/types";

import { selectActiveDiagram, useEditorStore } from "../state";

export interface DuplicateOptions {
  /** Defaults to `PASTE_OFFSET` in both axes (applied inside the store). */
  offset?: Point;
  /** Whether to select the clones. Default true; Alt+drag passes false. */
  select?: boolean;
  /** Whether to announce the result. Default true; Alt+drag passes false —
   *  the clone is visible under the cursor, so a toast is just noise. */
  notify?: boolean;
}

/**
 * Clones `nodeIds` (which must live in the active diagram) plus the edges
 * internal to that set. Returns the new node ids, or `[]` when there was
 * nothing to do or the store rejected the clone.
 */
export function duplicateNodes(
  nodeIds: string[],
  options: DuplicateOptions = {},
): string[] {
  const store = useEditorStore.getState();
  const diagram = selectActiveDiagram(store);
  const wanted = new Set(nodeIds);
  const nodes = diagram.nodes.filter((node) => wanted.has(node.id));
  if (nodes.length === 0) return [];

  try {
    const { nodeIds: created } = store.pasteNodes({
      diagramId: store.activeDiagramId,
      nodes,
      edges: diagram.edges,
      offset: options.offset,
      select: options.select,
    });
    if (options.notify !== false) {
      toast({
        message: `Duplicated ${created.length} element${created.length === 1 ? "" : "s"}.`,
        tone: "info",
      });
    }
    return created;
  } catch (error) {
    // Duplicating into the SAME diagram cannot fail the level check, so this
    // is a genuine surprise — surface it rather than swallowing it.
    toast({
      message: error instanceof Error ? error.message : "Could not duplicate.",
      tone: "warning",
    });
    return [];
  }
}

/** Duplicates the current node selection. The menu/button/shortcut entry. */
export function duplicateSelection(options?: DuplicateOptions): string[] {
  return duplicateNodes(useEditorStore.getState().selection.nodeIds, options);
}

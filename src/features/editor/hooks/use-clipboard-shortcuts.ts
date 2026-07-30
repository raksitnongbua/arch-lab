"use client";

/**
 * `mod+c` / `mod+v` → copy and paste the node selection.
 *
 * Both combos are claims in the §4.5 shortcut registry, which already
 * suppresses them while focus sits in an input, textarea, select or
 * contenteditable — so `mod+c` during an inline label edit copies TEXT, as a
 * user expects, and never the node.
 *
 * Copy snapshots into `lib/clipboard` (in-memory, not the system clipboard —
 * see that file for why). Paste funnels into the store's `pasteNodes`, which
 * is one undo entry, regenerates ids, and enforces the level rules.
 *
 * Edges are along for the ride, never the subject: `mod+c` with only edges
 * selected does nothing, because a pasted edge needs two pasted endpoints.
 *
 * Mounted by `InspectorPanel`, which is always in the tree.
 */

import { useMemo } from "react";

import { toast } from "@/components/ui/toast";

import {
  copyToClipboard,
  hasClipboardContent,
  readClipboard,
} from "../lib/clipboard";
import { selectActiveDiagram, useEditorStore } from "../state";
import { useShortcuts, type ShortcutBinding } from "./use-keyboard-shortcuts";

function copySelection(): void {
  const store = useEditorStore.getState();
  const diagram = selectActiveDiagram(store);
  const selectedIds = new Set(store.selection.nodeIds);
  const nodes = diagram.nodes.filter((node) => selectedIds.has(node.id));
  if (nodes.length === 0) return;

  copyToClipboard(nodes, diagram.edges, diagram.level);
  toast({
    message: `Copied ${nodes.length} element${nodes.length === 1 ? "" : "s"}.`,
    tone: "info",
  });
}

function pasteClipboard(): void {
  const store = useEditorStore.getState();
  const payload = readClipboard();
  if (payload === null || payload.nodes.length === 0) return;

  try {
    const { nodeIds } = store.pasteNodes({
      diagramId: store.activeDiagramId,
      nodes: payload.nodes,
      edges: payload.edges,
    });
    toast({
      message: `Pasted ${nodeIds.length} element${nodeIds.length === 1 ? "" : "s"}.`,
      tone: "info",
    });
  } catch (error) {
    // The common case is a level mismatch — e.g. a `component` copied from a
    // component view, pasted into a container view. Say which level it came
    // from; the store's own message says what the target level allows.
    toast({
      message:
        error instanceof Error
          ? `${error.message} (copied from a ${payload.level} view)`
          : "Could not paste here.",
      tone: "warning",
    });
  }
}

export function useClipboardShortcuts(): void {
  const bindings = useMemo<ShortcutBinding[]>(
    () => [
      {
        id: "t2e:clipboard:copy",
        combo: "mod+c",
        when: ({ store }) =>
          store.labelEdit === null && store.selection.nodeIds.length > 0,
        run: copySelection,
      },
      {
        id: "t2e:clipboard:paste",
        combo: "mod+v",
        when: ({ store }) => store.labelEdit === null && hasClipboardContent(),
        run: pasteClipboard,
      },
    ],
    [],
  );
  useShortcuts(bindings);
}

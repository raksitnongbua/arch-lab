"use client";

/**
 * `Delete` / `Backspace` → delete the current selection (T2-D, AF-E3-S4).
 *
 * Batch 1 deliberately disabled React Flow's own `deleteKeyCode`; these two
 * combos are T2-D's claim in the shortcut registry (§4.5). Both funnel into
 * `requestDeleteSelection`, which decides between immediate delete + counted
 * toast and the confirmation dialog (child-diagram cascade).
 *
 * The registry already suppresses bindings while focus is inside an input,
 * textarea, select or contenteditable (inline label edits included), so
 * Delete while typing edits text — it never deletes the node.
 *
 * Mounted by `InspectorPanel`, which is always in the tree.
 */

import { useMemo } from "react";

import { requestDeleteSelection } from "../components/overlays/delete-confirm-dialog";
import { useShortcuts, type ShortcutBinding } from "./use-keyboard-shortcuts";

export function useDeleteShortcut(): void {
  const bindings = useMemo<ShortcutBinding[]>(() => {
    const run = () => requestDeleteSelection();
    const when: ShortcutBinding["when"] = ({ store }) =>
      store.labelEdit === null &&
      (store.selection.nodeIds.length > 0 ||
        store.selection.edgeIds.length > 0);
    return [
      { id: "t2d:delete-selection:delete", combo: "Delete", when, run },
      { id: "t2d:delete-selection:backspace", combo: "Backspace", when, run },
    ];
  }, []);
  useShortcuts(bindings);
}

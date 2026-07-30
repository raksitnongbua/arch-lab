"use client";

/**
 * "Take me to the real one" — navigate from a `^ref` placeholder to the node it
 * names, in the diagram that owns it.
 *
 * A placeholder cannot be edited where it sits, so it needs a way out. Without
 * this, learning that a reference is read-only leaves the user stuck: they know
 * the original is *somewhere* above, but the only route is guessing which
 * breadcrumb hop holds it.
 *
 * Navigation is never a history entry, so this is safe to call freely — but the
 * SELECTION it leaves behind is what makes the jump useful: you arrive with the
 * original highlighted and its inspector open, ready to edit.
 */

import { toast } from "@/components/ui/toast";
import type { C4Node } from "@/types";

import { navigateToDiagram } from "../hooks/use-level-navigation";
import { useEditorStore } from "../state";

/**
 * Navigates to `node.externalRef`'s diagram and selects the original.
 * No-ops for a node that is not a placeholder.
 *
 * A dangling ref (target deleted, or a hand-edited .alab pointing at nothing)
 * reports rather than failing silently — the delete cascade prevents this for
 * refs created in-app, but a file can arrive from anywhere.
 */
export function goToOriginal(node: C4Node): void {
  const ref = node.externalRef;
  if (ref === undefined) return;

  const store = useEditorStore.getState();
  const target = store.model.diagrams[ref.diagramId];
  const original = target?.nodes.find((n) => n.id === ref.nodeId);
  if (target === undefined || original === undefined) {
    toast({
      message: `“${node.name}” points at an element that no longer exists (${ref.diagramId}/${ref.nodeId}).`,
      tone: "warning",
    });
    return;
  }

  navigateToDiagram(ref.diagramId);
  // After the diagram switch, so it is not pruned as a stale id by the
  // navigation's own selection restore.
  store.setSelection({ nodeIds: [original.id], edgeIds: [] });
}

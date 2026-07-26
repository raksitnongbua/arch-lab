"use client";

/**
 * T2-B's shortcut hook (dev-handoff §3 T2-B, registry §4.5) and the shared
 * create-and-connect command behind the quick-add menu (AF-E1-S5).
 *
 * §4.5 assigns T2-B no reserved global combos, so this hook claims nothing
 * that could collide with another ticket: it registers only plain digit
 * accelerators (`1`…`5` — unclaimed anywhere; `shift+1`/`shift+0` differ by
 * modifier) and only while the quick-add menu is open, letting a keyboard
 * user pick the nth offered node type without reaching for the mouse. The
 * menu's own focus movement (arrows) and dismissal (`Escape`) are handled
 * locally by the menu; `Escape` fall-through is also covered centrally by
 * the canvas's `canvas.escape` binding, which clears `pendingConnect`.
 */

import { useMemo } from "react";

import { toast } from "@/components/ui/toast";
import type { C4NodeType } from "@/types";

import { setPendingConnect, useCanvasInteraction } from "../components/canvas";
import { selectValidNodeTypes, useEditorStore } from "../state";
import { useShortcuts, type ShortcutBinding } from "./use-keyboard-shortcuts";

/** The container level offers 5 types — the widest palette this sprint. */
const MAX_QUICK_ADD_ACCELERATORS = 5;

/**
 * Creates a node of `type` at the pending connection's release point and the
 * edge from the drag's source node to it, as ONE undo entry (`transact`),
 * then puts the new node's name into inline edit. Closes the quick-add menu
 * either way. Errors (`InvalidNodeTypeError`, `CrossDiagramEdgeError`, …)
 * roll the transaction back and surface as a toast — never an unhandled
 * throw (AF-E1-S5).
 */
export function createConnectedNode(type: C4NodeType): void {
  const pending = useCanvasInteraction.getState().pendingConnect;
  if (!pending) return;
  setPendingConnect(null);

  const store = useEditorStore.getState();
  const diagramId = store.activeDiagramId;
  const diagram = store.model.diagrams[diagramId];
  // The source must still exist on the active diagram (stale gesture guard).
  if (
    !diagram ||
    !diagram.nodes.some((node) => node.id === pending.sourceNodeId)
  ) {
    return;
  }

  try {
    const nodeId = store.transact("Create connected element", () => {
      const createdId = store.createNode({
        diagramId,
        type,
        position: pending.flowPosition,
      });
      store.createEdge({
        diagramId,
        source: pending.sourceNodeId,
        target: createdId,
      });
      return createdId;
    });
    store.setSelection({ nodeIds: [nodeId], edgeIds: [] });
    store.beginLabelEdit({ kind: "node", id: nodeId });
  } catch (error) {
    toast({
      message:
        error instanceof Error
          ? error.message
          : "Could not create the connected element.",
      tone: "warning",
    });
  }
}

/**
 * Registers T2-B's bindings. Mounted once by the quick-add menu component
 * (which `canvas.tsx` always renders), per the one-hook-file-per-ticket rule.
 */
export function useConnectShortcuts(): void {
  const bindings = useMemo<ShortcutBinding[]>(
    () =>
      Array.from({ length: MAX_QUICK_ADD_ACCELERATORS }, (_, index) => ({
        id: `connect.quick-add-${index + 1}`,
        combo: `${index + 1}`,
        when: () => useCanvasInteraction.getState().pendingConnect !== null,
        run: ({ store }) => {
          const validTypes = selectValidNodeTypes(store);
          const type = validTypes[index];
          if (type !== undefined) createConnectedNode(type);
        },
      })),
    [],
  );
  useShortcuts(bindings);
}

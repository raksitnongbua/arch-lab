"use client";

/**
 * The C4 node component (T2-A — AF-E3-S1, AF-E4-S1, AF-E1-S6).
 *
 * The exported TYPE surface (`C4NodeData`, `C4FlowNode`,
 * `C4NodeComponentProps`) is the frozen contract from dev-handoff §4.2 —
 * `use-canvas-nodes.ts` and `canvas.tsx` (both final) build against it, so it
 * must not change.
 *
 * The component branches on `data.node.type` only — never on appearance.
 * Layout lives in `node-chrome.tsx`; per-type silhouettes in
 * `node-shapes.tsx`. This file additionally registers the `F2`/`Enter`
 * rename shortcuts (§4.5 claims them for T2-A): each node registers only
 * while selected, with a per-node-unique id, guarded to the single-selection
 * case, so the registry never sees a duplicate id.
 */

import { useLayoutEffect, useMemo, useState } from "react";
import type { Node, NodeProps } from "@xyflow/react";

import type { C4Level, C4Node, C4NodeType } from "@/types";

import { duration } from "../../lib/motion";
import {
  useShortcuts,
  type ShortcutBinding,
  type ShortcutContext,
} from "../../hooks/use-keyboard-shortcuts";
import {
  ensureCanvasMotionRuntime,
  isFirstPresentation,
} from "./canvas-motion-runtime";
import { NodeChrome } from "./node-chrome";

/* ---- Contract (dev-handoff §4.2, frozen) --------------------------------- */

export interface C4NodeData extends Record<string, unknown> {
  /** The model node. Read-only — mutate via the store, never in place. */
  node: C4Node;
  /** The containing diagram's level. A node's level is never stored on the node. */
  level: C4Level;
  hasChildren: boolean;
  childCount: number;
  /** node.externalRef present ⇒ read-only boundary placeholder. */
  isPlaceholder: boolean;
  /**
   * For a placeholder, the LEVEL of the diagram it references — drives the
   * `↑ <level>` chip. Null when the node is first-class, or when the
   * referenced diagram cannot be resolved (a dangling `^ref`).
   */
  refSourceLevel: C4Level | null;
  isEditingLabel: boolean;
  /** Icon slug after type-default resolution. Never empty. */
  resolvedIcon: string;
}

/** React Flow node id === C4Node.id. `type` === C4NodeType. */
export type C4FlowNode = Node<C4NodeData, C4NodeType>;
export type C4NodeComponentProps = NodeProps<C4FlowNode>;
// `selected`, `dragging`, `id`, `width`, `height` come from React Flow — do
// not duplicate them in data.

/* ---- Component ------------------------------------------------------------ */

const NO_BINDINGS: ShortcutBinding[] = [];

export function C4NodeComponent({
  id,
  data,
  selected,
  dragging,
}: C4NodeComponentProps): React.JSX.Element {
  const isPlaceholder = data.isPlaceholder;

  // Create animation (AF-E6-S2): once, on the node's first-ever presentation
  // — never on the remounts from level navigation or undo. `duration()`
  // (frozen lib/motion.ts) gates it off entirely under reduced motion.
  const [entering] = useState(
    // Record the sighting first so ids are tracked even under reduced motion.
    () => isFirstPresentation("node", id) && duration("nodeIn") > 0,
  );

  // Installs the shared motion runtime (duration custom properties + delete
  // ghosts) before this node's first paint. Idempotent.
  useLayoutEffect(() => {
    ensureCanvasMotionRuntime();
  }, []);

  const bindings = useMemo<ShortcutBinding[]>(() => {
    if (!selected || isPlaceholder) return NO_BINDINGS;
    const when = ({ store }: ShortcutContext) =>
      store.labelEdit === null &&
      store.selection.nodeIds.length === 1 &&
      store.selection.nodeIds[0] === id &&
      store.selection.edgeIds.length === 0;
    const run = ({ store }: ShortcutContext) =>
      store.beginLabelEdit({ kind: "node", id });
    return [
      { id: `node.rename.f2:${id}`, combo: "F2", when, run },
      { id: `node.rename.enter:${id}`, combo: "Enter", when, run },
    ];
  }, [id, selected, isPlaceholder]);

  useShortcuts(bindings);

  return (
    <NodeChrome
      data={data}
      selected={selected}
      dragging={dragging}
      entering={entering}
    />
  );
}

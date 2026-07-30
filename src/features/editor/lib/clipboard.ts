/**
 * The editor's in-memory clipboard for node copy/paste.
 *
 * Deliberately NOT the system clipboard (`navigator.clipboard`): that API is
 * async, permission-gated, and only round-trips text. A C4 payload is a graph
 * — nodes plus the edges between them — and paste must stay synchronous so it
 * lands in the same tick as the keystroke that asked for it, as exactly one
 * history entry.
 *
 * Module-level state, matching the shortcut registry's own pattern: one editor
 * per tab, so one clipboard per tab. It survives diagram switches on purpose —
 * copying a container in one view and pasting it into another is the point.
 *
 * A payload is a deep snapshot taken at COPY time. Deleting or renaming the
 * original afterwards must not change what a later paste produces, so nothing
 * here holds a live reference into the store's model.
 */

import type { C4Edge, C4Level, C4Node } from "@/types";

export interface ClipboardPayload {
  /** Deep copies, detached from the store. */
  nodes: C4Node[];
  /** Only edges whose BOTH endpoints are in `nodes`. */
  edges: C4Edge[];
  /**
   * The level the payload was copied FROM. The paste path uses it only to
   * explain a rejection ("copied from a container view"); the store is still
   * the authority on whether the types are legal at the target level.
   */
  level: C4Level;
}

let payload: ClipboardPayload | null = null;

/**
 * Snapshots `nodes` and the edges *internal* to them. Edges with an endpoint
 * outside the selection are dropped: they cannot be rewired at paste time,
 * because a `C4Edge` must connect two nodes in the same diagram.
 */
export function copyToClipboard(
  nodes: C4Node[],
  edges: C4Edge[],
  level: C4Level,
): void {
  const selectedIds = new Set(nodes.map((node) => node.id));
  payload = {
    nodes: structuredClone(nodes),
    edges: structuredClone(
      edges.filter(
        (edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target),
      ),
    ),
    level,
  };
}

/** The current payload, or null when nothing has been copied yet. */
export function readClipboard(): ClipboardPayload | null {
  return payload;
}

/** True when a paste has something to work with. Cheap enough for a `when`. */
export function hasClipboardContent(): boolean {
  return payload !== null && payload.nodes.length > 0;
}

/** Test seam — the editor itself never needs to clear the clipboard. */
export function resetClipboard(): void {
  payload = null;
}

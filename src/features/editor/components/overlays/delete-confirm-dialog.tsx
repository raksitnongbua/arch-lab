"use client";

/**
 * STUB — ownership transfers to T2-D in Batch 2 (AF-E3-S4 delete with clear
 * consequences).
 *
 * Contract (dev-handoff §4.4): props-free, mounted by `canvas.tsx`, reads the
 * store itself. The real implementation mounts `ui/dialog` when a delete
 * needs confirmation (node owning a child diagram), naming the node and the
 * descendant node/level counts from `deleteNodes`' cascade collection.
 */

export function DeleteConfirmDialog(): React.JSX.Element | null {
  return null;
}

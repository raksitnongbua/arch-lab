"use client";

/**
 * STUB — ownership transfers to T3-B in Batch 3 (AF-E5-S4 crash-safe draft
 * recovery).
 *
 * Contract (dev-handoff §4.4): props-free, mounted by `editor-shell.tsx`,
 * reads its state itself (IndexedDB draft vs on-disk timestamps), returns
 * null when there is no draft to offer. The real implementation mounts
 * `ui/dialog` with "Recover unsaved changes" / "Discard".
 */

export function RecoveryPrompt(): React.JSX.Element | null {
  return null;
}

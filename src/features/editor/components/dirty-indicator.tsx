"use client";

/**
 * STUB — ownership transfers to T3-B in Batch 3 (AF-E5-S3 unsaved-work
 * marker).
 *
 * Contract (dev-handoff §4.4): props-free, mounted by `editor-shell.tsx`,
 * reads the store itself, returns null when there is nothing to show. The
 * real implementation adds the `•` document-title prefix and the ≤100ms
 * clear-on-save guarantee; this stub already renders the header dot from
 * `isDirty` so the shell layout is honest.
 */

import { useEditorStore } from "../state";

export function DirtyIndicator(): React.JSX.Element | null {
  const isDirty = useEditorStore((s) => s.isDirty);
  if (!isDirty) return null;
  return (
    <span
      role="status"
      aria-label="Unsaved changes"
      title="Unsaved changes"
      className="size-2 shrink-0 rounded-full bg-warning"
    />
  );
}

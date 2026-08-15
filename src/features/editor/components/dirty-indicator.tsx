"use client";

/**
 * Unsaved-work marker. Props-free per,
 * mounted by the frozen `editor-shell.tsx` header, reads the store itself.
 *
 * Quiet but unmistakable: a warning-toned dot plus the word "Unsaved" — never
 * a bare dot with no text alternative. `role="status"` announces its
 * appearance to assistive tech; a tooltip explains how to clear it. This
 * component also hosts the two always-on guards (`beforeunload`, document
 * title), so they live and die with the shell without touching frozen files.
 *
 * `isDirty` is derived in the store as `revision !== savedRevision`, so
 * undoing back to the last save clears all three signals for free.
 */

import { Tooltip } from "@/components/ui/tooltip";

import { useDocumentTitle } from "../hooks/use-document-title";
import { useUnsavedWarning } from "../hooks/use-unsaved-warning";
import { useEditorStore } from "../state";

export function DirtyIndicator(): React.JSX.Element | null {
  useUnsavedWarning();
  useDocumentTitle();
  const isDirty = useEditorStore((s) => s.isDirty);
  if (!isDirty) return null;
  return (
    <Tooltip
      content="You have unsaved changes — save with ⌘S / Ctrl+S"
      side="bottom"
    >
      <span
        role="status"
        className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"
      >
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full bg-warning"
        />
        Unsaved
      </span>
    </Tooltip>
  );
}

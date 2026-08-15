"use client";

/**
 * Unsaved-work guard.
 *
 * Tab close / reload: a `beforeunload` handler that arms the browser's native
 * leave confirmation while `isDirty`. Honest limitation: modern browsers
 * ignore any custom message text and show their own generic wording — the
 * string below exists only for legacy `returnValue` plumbing. Dirtiness is
 * read from the store at event time (`revision !== savedRevision` derived by
 * Batch 1), so undoing back to the last save disarms the guard for free.
 *
 * In-app destructive transitions (opening another file, starting fresh) go
 * through `confirmDiscardUnsaved` below. The open flow ships its own
 * save / discard / cancel dialog per its acceptance criteria; this helper is
 * the shared fallback guard for any other destructive transition.
 *
 * Mounted by `DirtyIndicator`, which is always in the shell's tree.
 */

import { useEffect } from "react";

import { useEditorStore } from "../state";

const LEGACY_MESSAGE =
  "You have unsaved changes. They will be lost if you leave.";

export function useUnsavedWarning(): void {
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent): void => {
      if (!useEditorStore.getState().isDirty) return;
      event.preventDefault();
      // Ignored by modern browsers (they show generic text); required by
      // older Chromium for the dialog to appear at all.
      event.returnValue = LEGACY_MESSAGE;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);
}

/**
 * Guard for in-app destructive transitions. Returns true when proceeding is
 * safe: either nothing is unsaved, or the user explicitly confirmed the loss.
 *
 * @param action Verb phrase for the prompt, e.g. "open another file".
 */
export function confirmDiscardUnsaved(action = "continue"): boolean {
  if (!useEditorStore.getState().isDirty) return true;
  return window.confirm(
    `You have unsaved changes that will be lost if you ${action}. Continue?`,
  );
}

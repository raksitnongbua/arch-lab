"use client";

/**
 * `document.title` maintenance: the tab title tracks the
 * model title and carries a `•` prefix while there are unsaved changes.
 *
 * The clear-within-100ms-of-save guarantee holds because `markSaved` flips
 * `isDirty` synchronously in the store; this effect runs in the very next
 * React commit — microtask-scale, no timers, no animation frames.
 *
 * Mounted by `DirtyIndicator`, which is always in the shell's tree.
 */

import { useEffect } from "react";

import { useEditorStore } from "../state";

export function useDocumentTitle(): void {
  const isDirty = useEditorStore((s) => s.isDirty);
  const title = useEditorStore((s) => s.model.metadata.title);

  useEffect(() => {
    const original = document.title;
    return () => {
      document.title = original;
    };
  }, []);

  useEffect(() => {
    const base = `${title} — arch-lab`;
    document.title = isDirty ? `• ${base}` : base;
  }, [isDirty, title]);
}

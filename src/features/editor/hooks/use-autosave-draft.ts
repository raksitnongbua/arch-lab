"use client";

/**
 * Debounced IndexedDB draft autosave.
 *
 * Strategy: a trailing timer. The first dirty store change arms a single
 * 5-second timer; when it fires, one draft is written iff the model is still
 * dirty and the recovery gate is down. Nothing runs per keystroke or per drag
 * frame — the subscription body is a couple of comparisons — so an
 * interactive drag never pays for persistence. At most one write per 5s
 * (≤12 writes in a 60-second session), and only while dirty.
 *
 * Clearing on save: `markSaved` bumps `savedAt` WITHOUT replacing the model
 * object, while `replaceModel` (opening a file) always installs a fresh
 * clone. That referential difference is how a genuine save-to-disk is
 * recognised here — so opening a file never deletes its own crash draft
 * before the recovery prompt has seen it, and a successful save always
 * deletes the matching snapshot (wired through the store, never through
 * this hook's code).
 *
 * Mounted by `RecoveryPrompt`, which is always in the shell's tree.
 */

import { useEffect } from "react";

import {
  clearDraftsAfterSave,
  draftKey,
  isDraftAutosaveSuspended,
  writeDraft,
} from "../io/drafts";
import { useEditorStore } from "../state";

/** At most one draft write per this interval (: "every 5 seconds"). */
export const DRAFT_INTERVAL_MS = 5_000;

export function useAutosaveDraft(): void {
  useEffect(() => {
    let timer: number | null = null;

    const flush = (): void => {
      timer = null;
      const state = useEditorStore.getState();
      if (!state.isDirty || isDraftAutosaveSuspended()) return;
      void writeDraft(state.model, state.fileHandleName);
    };

    const unsubscribe = useEditorStore.subscribe((state, previous) => {
      const wasSaved =
        state.savedAt !== null &&
        state.savedAt !== previous.savedAt &&
        state.model === previous.model;
      if (wasSaved) {
        if (timer !== null) {
          window.clearTimeout(timer);
          timer = null;
        }
        void clearDraftsAfterSave(
          draftKey(state.fileHandleName, state.model.metadata.createdAt),
        );
        return;
      }
      if (state.isDirty && timer === null) {
        timer = window.setTimeout(flush, DRAFT_INTERVAL_MS);
      }
    });

    return () => {
      unsubscribe();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);
}

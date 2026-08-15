"use client";

/**
 * Draft-field editing for the inspector.
 *
 * One *editing session* (focus → typing → blur) must be exactly ONE undo
 * entry, never one per keystroke. The hook does this by:
 *
 * - keeping a local draft while the field is focused, so keystrokes render
 *   instantly without hitting the store;
 * - committing to the store after a 300ms debounce (the canvas updates live)
 *   and again — immediately — on blur;
 * - stamping every commit of the session with the SAME `coalesceKey`, so the
 *   store's history collapses the whole run into one entry;
 * - minting a NEW key on the next focus, so two separate sessions on the same
 *   field stay two separate undo entries.
 *
 * `Escape` reverts: it re-commits the value the field had at focus time
 * (under the same coalesce key, so any debounced mid-session commits fold
 * back into a no-op) and blurs. `Enter` on single-line fields just blurs,
 * which commits. Neither key leaks to the canvas — the shortcut registry
 * suppresses bindings while focus is in a form control.
 *
 * Draft and session state are tagged with `fieldKey`, so a selection change
 * mid-session simply orphans them — no reset effect needed.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from "react";

/** Monotonic session stamp — a new focus is a new undo entry. */
let sessionCounter = 0;

interface Draft {
  fieldKey: string;
  text: string;
}

interface Session {
  fieldKey: string;
  /** The coalesce key every commit of this session shares. */
  coalesceKey: string;
  /** The committed value at focus time, for Escape-revert. */
  valueAtFocus: string;
}

export interface InspectorFieldOptions {
  /** The committed value from the store. Empty string when the field is unset. */
  value: string;
  /**
   * Stable identity of the field, e.g. `node:<diagramId>:<nodeId>:name`.
   * Changing it (new selection) orphans any in-flight draft.
   */
  fieldKey: string;
  /**
   * Write `next` to the store, stamped with `coalesceKey`. Called after the
   * debounce and on blur; implementations decide how "" maps to the model
   * (clear the optional field, or keep the previous required value).
   */
  commit: (next: string, coalesceKey: string) => void;
  /** Default 300. */
  debounceMs?: number;
}

export interface InspectorFieldHandlers {
  /** Render value: the draft while editing, the store value otherwise. */
  value: string;
  /** True while a session is active (focused / uncommitted draft). */
  isEditing: boolean;
  onFocus: (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onChange: (next: string) => void;
  onBlur: () => void;
  /** Enter commits via blur (single-line only — skip for textareas); Escape reverts. */
  onKeyDown: (
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
}

export function useInspectorField({
  value,
  fieldKey,
  commit,
  debounceMs = 300,
}: InspectorFieldOptions): InspectorFieldHandlers {
  const [draft, setDraft] = useState<Draft | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => cancelTimer, [cancelTimer]);

  /** The active session, or null if none / it belongs to a previous field. */
  const currentSession = useCallback((): Session | null => {
    const session = sessionRef.current;
    return session !== null && session.fieldKey === fieldKey ? session : null;
  }, [fieldKey]);

  const endSession = useCallback(() => {
    cancelTimer();
    sessionRef.current = null;
    setDraft(null);
  }, [cancelTimer]);

  const onFocus = useCallback(
    (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      sessionCounter += 1;
      sessionRef.current = {
        fieldKey,
        coalesceKey: `${fieldKey}#${sessionCounter}`,
        valueAtFocus: value,
      };
      setDraft({ fieldKey, text: event.currentTarget.value });
    },
    [fieldKey, value],
  );

  const onChange = useCallback(
    (next: string) => {
      setDraft({ fieldKey, text: next });
      const session = currentSession();
      if (session === null) return;
      cancelTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        commit(next, session.coalesceKey);
      }, debounceMs);
    },
    [fieldKey, currentSession, cancelTimer, commit, debounceMs],
  );

  const onBlur = useCallback(() => {
    const session = currentSession();
    if (session !== null && draft !== null && draft.fieldKey === fieldKey) {
      cancelTimer();
      commit(draft.text, session.coalesceKey);
    }
    endSession();
  }, [currentSession, draft, fieldKey, cancelTimer, commit, endSession]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        event.currentTarget.blur(); // blur commits
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        const session = currentSession();
        if (session !== null) {
          // Fold any debounced mid-session commits back to the focus-time
          // value — same coalesce key, so the whole session nets to nothing.
          cancelTimer();
          commit(session.valueAtFocus, session.coalesceKey);
        }
        endSession();
        event.currentTarget.blur();
      }
    },
    [currentSession, cancelTimer, commit, endSession],
  );

  const draftApplies = draft !== null && draft.fieldKey === fieldKey;

  return {
    value: draftApplies ? draft.text : value,
    isEditing: draftApplies,
    onFocus,
    onChange,
    onBlur,
    onKeyDown,
  };
}

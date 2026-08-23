/**
 * The canvas lock, as ONE control for every canvas that has something to lock.
 *
 * It used to be written inline in the C4 branch of `view-playground.tsx`, and
 * that is exactly how it broke. When the sequence canvas became editable, the
 * lock started gating it too — `sequenceEditable` reads the same
 * `!canvasLocked` — but the button was still rendered inside
 * `doc.kind === "c4" ? (…)`, a branch a sequence document never reaches. A
 * reader who had ever locked the canvas to present a C4 diagram therefore
 * found the sequence canvas silently uneditable with NO CONTROL ANYWHERE to
 * turn it back on: the pencil and the insert button were withdrawn, and the
 * one thing that would have explained why was in the branch not taken.
 *
 * Every `check:canvas-edit` assertion passed throughout, because they all
 * asked whether the MODULE says a document is editable — not whether the
 * control that decides it is reachable from the branch that document renders
 * in. `codebase.md` habit 4: two halves, each self-consistent, that disagree.
 * The fix is that there is now one half. `check:canvas-edit` asserts this
 * component is rendered once per canvas branch that can be locked, derived
 * from the seed table rather than from a list of kind names.
 *
 * WHY THE WORDING IS A PROP and not derived here: the two canvases lock
 * different gestures. C4 stops a stray drag moving a box; sequence stops an
 * edit to a message's wording. A reader pressing this wants to know what it
 * just stopped, so the sentence names the gesture — and the announcement is
 * what a screen-reader user gets instead of the icon change.
 */

"use client";

import { Lock, LockOpen } from "lucide-react";

import { buttonClasses } from "@/components/ui/button";

export interface CanvasLockCopy {
  /** What unlocking lets the reader do, as a verb phrase completing
   * "Unlock the canvas — …". Lower case, no trailing stop. */
  unlockHint: string;
  /** Announced on unlocking. A full sentence: a screen-reader user gets this
   * instead of watching the icon change. */
  unlockedAnnouncement: string;
  /** Announced on locking, in the same voice. */
  lockedAnnouncement: string;
}

export function CanvasLockButton({
  locked,
  onToggle,
  onAnnounce,
  copy,
}: {
  locked: boolean;
  onToggle: (next: boolean) => void;
  onAnnounce: (message: string) => void;
  copy: CanvasLockCopy;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        onToggle(!locked);
        onAnnounce(
          locked ? copy.unlockedAnnouncement : copy.lockedAnnouncement,
        );
      }}
      aria-pressed={locked}
      title={
        locked
          ? `Unlock the canvas — ${copy.unlockHint}`
          : "Lock the canvas — make the diagram read-only to present it"
      }
      className={buttonClasses({ variant: "ghost", size: "sm" })}
    >
      {locked ? <Lock aria-hidden="true" /> : <LockOpen aria-hidden="true" />}
      <span className="hidden sm:inline">{locked ? "Locked" : "Editable"}</span>
    </button>
  );
}

/**
 * The wording for each canvas. A `Record` rather than a lookup with a
 * fallback, so adding a third editable canvas is a type error here rather than
 * a control that silently borrows another notation's sentence — the failure
 * mode this whole module exists to prevent.
 */
export const CANVAS_LOCK_COPY: Record<"c4" | "sequence", CanvasLockCopy> = {
  c4: {
    unlockHint: "drag nodes to move them",
    unlockedAnnouncement:
      "Canvas unlocked — drag a node to move it; arrow keys nudge the selection. Every change is written into the source text.",
    lockedAnnouncement:
      "Canvas locked — the diagram is read-only. Nothing on it can be moved or deleted.",
  },
  sequence: {
    unlockHint: "edit a message or add one",
    unlockedAnnouncement:
      "Canvas unlocked — click a message or a lifeline to edit its wording, and use the insert button to add one. Every change is written into the source text.",
    lockedAnnouncement:
      "Canvas locked — the diagram is read-only. Nothing on it can be edited or added.",
  },
};

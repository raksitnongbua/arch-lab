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
 *
 * EACH FACE OFFERS THE ACTION IT PERFORMS; NEITHER REPORTS THE STATE. This is
 * the part that carries the locked-by-default change in `canvas-lock.ts`, and
 * it is not a decoration on it — the default is only defensible while this
 * holds. A locked canvas withdraws the pencil, the insert buttons, the
 * drag-to-reorder and the numbering toggle, so the control is the ONLY thing
 * left on screen that can say the diagram is editable at all. A padlock
 * labelled "Locked" does not say it: it names the state a reader can already
 * see and leaves them to guess that pressing it is allowed, let alone what it
 * would give them. So the locked face is a PENCIL labelled "Edit" — the same
 * icon the sequence canvas puts on the gesture itself — and the unlocked face
 * is a padlock labelled "Lock". The state is not lost; it is one word away in
 * `canvasStateLabel`, which the strip shows beside this, so the pair reads
 * "Read-only ✏ Edit" or "Editable 🔒 Lock" with nothing to hover and nothing
 * to read twice.
 *
 * THE LABEL IS NEVER HIDDEN, and the `hidden sm:inline` it replaced is why
 * that is written down: on a phone the whole affordance was one 16px padlock
 * glyph, on the notation whose canvas had just learned five new gestures. An
 * icon-only face is exactly the "control nobody would think to look for" the
 * old default existed to avoid.
 *
 * NO `aria-pressed`, deliberately, and it was there before. A button whose
 * name is the action it performs cannot also carry a pressed state without
 * contradicting itself — "Edit, toggle button, pressed" tells a screen-reader
 * user the opposite of what pressing it does. State reaches assistive tech
 * through the two announcements instead, which are full sentences and say
 * what changed rather than which control moved.
 */

"use client";

import { Lock, Pencil } from "lucide-react";

import { buttonClasses } from "@/components/ui/button";

export interface CanvasLockCopy {
  /** What unlocking lets the reader do, as a verb phrase completing
   * "Edit — unlock the canvas to …". Lower case, no trailing stop. */
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
  /* The visible label is the FIRST WORDS of the accessible name, not a
     different string beside it: a voice-control user says "click Edit", and a
     name that begins somewhere else is a control they cannot reach by the word
     they can see (WCAG 2.5.3). The rest of the name is the hint that used to
     live only in a `title` — a tooltip no touch device shows. */
  const name = locked
    ? `Edit — unlock the canvas to ${copy.unlockHint}`
    : "Lock the canvas — make the diagram read-only to present it";
  return (
    <button
      type="button"
      onClick={() => {
        onToggle(!locked);
        onAnnounce(
          locked ? copy.unlockedAnnouncement : copy.lockedAnnouncement,
        );
      }}
      aria-label={name}
      title={name}
      className={buttonClasses(
        locked
          ? {
              /* The one emphasised control in the strip, and only while
                 locked. An outline with a primary tint reads as "you may
                 press this"; the ghost the unlocked face keeps reads as
                 "chrome", which is right once the reader is already editing
                 and the canvas itself carries the affordances. The tint is
                 the `primary` token, so every theme supplies its own — and
                 the LABEL rather than the tint is what carries the meaning,
                 so a theme whose primary is quiet still reads. */
              variant: "outline",
              size: "sm",
              className:
                "border-primary/40 hover:border-primary/70 hover:bg-primary/10",
            }
          : { variant: "ghost", size: "sm" },
      )}
    >
      {locked ? (
        <Pencil aria-hidden="true" className="text-primary" />
      ) : (
        <Lock aria-hidden="true" />
      )}
      <span>{locked ? "Edit" : "Lock"}</span>
    </button>
  );
}

/**
 * The one word the canvas strip shows beside the control, naming the state the
 * control deliberately does not.
 *
 * Here rather than at either call site because there are two strips — the C4
 * branch and the shared sequence/flowchart/use-case branch — and a canvas
 * reading "Locked" beside a control offering "Edit" while the other reads
 * "Read-only" is the drift this module was written to end.
 */
export function canvasStateLabel(locked: boolean) {
  return locked ? "Read-only" : "Editable";
}

/**
 * The wording for each canvas. A `Record` rather than a lookup with a
 * fallback, so adding a third editable canvas is a type error here rather than
 * a control that silently borrows another notation's sentence — the failure
 * mode this whole module exists to prevent.
 */
export const CANVAS_LOCK_COPY: Record<"c4" | "sequence", CanvasLockCopy> = {
  c4: {
    unlockHint: "drag nodes to move them, or edit one's wording",
    unlockedAnnouncement:
      "Canvas unlocked — drag a node to move it, arrow keys nudge the selection, and the details panel edits a selected node's wording. Every change is written into the source text.",
    lockedAnnouncement:
      "Canvas locked — the diagram is read-only. Nothing on it can be moved, edited or deleted.",
  },
  sequence: {
    unlockHint: "edit, add, reorder or remove a step",
    unlockedAnnouncement:
      "Canvas unlocked — click a message or a lifeline to edit it, drag either to reorder, and use the strip below to add one. Every change is written into the source text.",
    lockedAnnouncement:
      "Canvas locked — the diagram is read-only. Nothing on it can be edited or added.",
  },
};

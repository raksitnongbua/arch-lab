/**
 * The canvas lock, as ONE control for every canvas that has something to lock —
 * an icon-only padlock the host places at the CANVAS'S OWN TOP RIGHT.
 *
 * It used to be written inline in the C4 branch of `view-playground.tsx`, and
 * that is exactly how it broke. When the sequence canvas became editable, the
 * lock started gating it too — `sequenceEditable` reads the same
 * `!canvasLocked` — but the button was still rendered inside
 * `doc.kind === "c4" ? (…)`, a branch a sequence document never reaches. A
 * reader who had ever locked the canvas to present a C4 diagram therefore
 * found the sequence canvas silently uneditable with NO CONTROL ANYWHERE to
 * turn it back on. Every `check:canvas-edit` assertion passed throughout,
 * because they all asked whether the MODULE says a document is editable — not
 * whether the control that decides it is reachable from the branch that
 * document renders in. The fix is that there is now one control, and
 * `check:canvas-edit` asserts it is constructed once per lockable canvas
 * branch AND actually mounted by each canvas, derived from the seed table.
 *
 * THE SHAPE IS A DELIBERATE REVERSAL, decided by the product owner, and the
 * two rules it reverses were each bought by a shipped bug — recorded here
 * because the bugs stay real even though the rules moved:
 *
 * - The faces used to be ACTIONS WITH VISIBLE WORDS: a pencil labelled "Edit"
 *   while locked, a padlock labelled "Lock" while unlocked. That shape existed
 *   because a padlock labelled "Locked" names the state the reader can already
 *   see and leaves them guessing that pressing is even allowed — and because
 *   `hidden sm:inline` had once left the whole affordance as ONE 16px padlock
 *   glyph on a phone, with no state distinction and no name.
 * - The owner asked for an icon-only padlock pair on the canvas instead, and
 *   is the authority on that trade. So the control is now WORDLESS ON PURPOSE,
 *   and each old bug is answered by a different part of it:
 *   the phone bug (one glyph, no state) by TWO VISUALLY DISTINCT FACES — an
 *   OPEN padlock while the canvas is editable, a CLOSED one while it is
 *   locked, which the single glyph never had; the guessing bug by the
 *   ACCESSIBLE NAME, a full sentence naming what pressing DOES (the unlock
 *   action completed by each canvas's own hint), shown as the tooltip and
 *   read by screen readers and voice control; and the state itself by
 *   `canvasStateLabel`, which the playground's strip still prints — the word
 *   did not move onto the icon, it stayed where words fit.
 *
 * WHY THE WORDING IS A PROP and not derived here: the two canvases lock
 * different gestures. C4 stops a stray drag moving a box; sequence stops an
 * edit to a message's wording. A reader pressing this wants to know what it
 * just stopped, so the sentence names the gesture — and the announcement is
 * what a screen-reader user gets alongside the icon change.
 *
 * WITH NO VISIBLE TEXT, WCAG 2.5.3 (label in name) no longer applies — there
 * is no printed word for the spoken name to open with. That makes the name
 * carry MORE, not less: it is now the only channel a screen-reader or
 * voice-control user has, so it must be the action sentence, never a state
 * word, and `aria-label` and `title` are one string so hover and assistive
 * tech cannot drift apart. `check:canvas-edit` pins both.
 *
 * NO `aria-pressed`, deliberately, and it was there before. A button whose
 * name is the action it performs cannot also carry a pressed state without
 * contradicting itself — "Unlock…, toggle button, pressed" tells a
 * screen-reader user the opposite of what pressing it does. State reaches
 * assistive tech through the two announcements instead, which are full
 * sentences and say what changed rather than which control moved.
 */

"use client";

import { LockKeyhole, LockKeyholeOpen } from "lucide-react";

import { buttonClasses } from "@/components/ui/button";

export interface CanvasLockCopy {
  /** What unlocking lets the reader do, as a verb phrase completing
   * "Unlock the canvas to …". Lower case, no trailing stop. */
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
  /* ONE name for `aria-label` and `title`, saying what PRESSING DOES. The
     faces report the state (that is what a padlock pair can say); the name
     must therefore be the half a padlock cannot draw — the action — or an
     icon-only control regresses to the "Locked"-label bug the header
     records: a reader left guessing whether pressing is allowed. */
  const name = locked
    ? `Unlock the canvas to ${copy.unlockHint}`
    : "Lock the canvas — make the diagram read-only to present it";
  return (
    <button
      type="button"
      onClick={(event) => {
        onToggle(!locked);
        onAnnounce(
          locked ? copy.unlockedAnnouncement : copy.lockedAnnouncement,
        );
        /* POINTER ACTIVATION GIVES THE FOCUS BACK, and this is a bug fix with
           a name: hold Space to pan, having just clicked this button, and the
           canvas correctly declined to claim the key (a focused control keeps
           its activation) — so every Space press toggled the lock instead of
           panning. The reader was holding a key to drag and watching the
           diagram lock and unlock under them.

           `event.detail > 0` is the discriminator, not a pointer listener:
           the browser reports 0 for a click synthesised from Enter or Space
           and a real click count for a press. So a POINTER activation drops
           focus and hands Space back to the canvas, while a KEYBOARD user
           keeps focus exactly where they put it — blurring them would throw
           away their place in the tab order to fix a bug they never had. */
        if (event.detail > 0) event.currentTarget.blur();
      }}
      aria-label={name}
      title={name}
      className={buttonClasses({
        variant: "outline",
        size: "sm",
        /* `w-8 px-0` squares the button around its one glyph. Card backdrop
           and blur on BOTH faces because this floats over the drawing, where
           a ghost button disappears into whatever the diagram paints under
           it — the same chrome the canvas's other floating controls wear.
           The locked face keeps the primary tint the labelled control had:
           a locked canvas withdraws every other editing affordance, so this
           is the one thing left on screen that can say editing exists at
           all, and it has to read as pressable rather than as chrome. */
        className: locked
          ? "w-8 border-primary/40 bg-card/80 px-0 shadow-sm backdrop-blur hover:border-primary/70 hover:bg-primary/10"
          : "w-8 bg-card/80 px-0 shadow-sm backdrop-blur",
      })}
    >
      {locked ? (
        <LockKeyhole aria-hidden="true" className="text-primary" />
      ) : (
        <LockKeyholeOpen aria-hidden="true" />
      )}
    </button>
  );
}

/**
 * The one word the playground's canvas strip shows, naming the state the
 * control's faces draw but never spell. It used to sit BESIDE the control;
 * now that the control is an icon-only padlock down on the canvas, this word
 * in the strip is the only place the state is written out — which is why
 * `check:canvas-edit` pins one use per lockable canvas rather than letting
 * the control's move silently take the word with it.
 *
 * Here rather than at either call site because there are two strips — the C4
 * branch and the shared sequence/flowchart/use-case branch — and one canvas
 * reading "Locked" while the other reads "Read-only" is the drift this module
 * was written to end.
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
      "Canvas unlocked — drag a node to move it, arrow keys nudge the selection, and the details panel edits a selected node's wording, icon and colour. Every change is written into the source text.",
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

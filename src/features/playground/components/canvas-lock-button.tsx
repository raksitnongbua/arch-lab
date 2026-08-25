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

import { useEffect, useRef, useState } from "react";

import { LockKeyhole, LockKeyholeOpen } from "lucide-react";

import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  /* THE GLYPH ANSWERS A PRESS WITH ONE GESTURE — the closed padlock drops
     and clicks shut, the open one springs free — and NOTHING moves at rest
     or on arrival (the animation decision itself is argued beside the
     keyframes in globals.css). What this pair implements is the "never on
     first paint" half: the ref seeds from the CURRENT state, so the first
     render can never differ from it, and `travelled` only becomes true once
     the prop has actually changed — a reader opening a locked share link
     sees a still padlock, not one that theatrically slams shut on a lock
     they never pressed. Watching the PROP rather than the click matters
     too: the state can move from outside this control (the cookie, a host
     reset), and the faces must answer the change, not the gesture. */
  const previousLocked = useRef(locked);
  const [travelled, setTravelled] = useState(false);
  useEffect(() => {
    if (previousLocked.current !== locked) setTravelled(true);
    previousLocked.current = locked;
  }, [locked]);

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
        /* POINTER ACTIVATION GIVES THE FOCUS BACK. This shipped as the fix
           for hold-Space-to-pan toggling the lock on every key repeat; that
           pan is gone from the viewer canvas (an explicit Select/Pan toggle
           replaced it), but the hazard was never the pan's — it is the
           browser's. A focused button activates on Space and Enter, and
           after a click the reader's focus sits here without them having
           chosen it, so one reflex keypress — Space scrolls pages, and this
           canvas taught Space for a while — silently flips the lock they
           only meant to press once. Handing focus back to the drawing also
           re-aims the canvas's own keys (Escape, the nudge arrows) at what
           the reader is actually working on.

           `event.detail > 0` is the discriminator, not a pointer listener:
           the browser reports 0 for a click synthesised from Enter or Space
           and a real click count for a press. So a POINTER activation drops
           focus, while a KEYBOARD user keeps focus exactly where they put
           it — blurring them would throw away their place in the tab order
           to fix a bug they never had. */
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
        /* THE GRADIENT IS ON THE BUTTON, NEVER ON THE GLYPH'S STROKE, and
           that is a safety choice rather than a stylistic one. A lucide icon
           painted with `stroke="url(#id)"` renders NOTHING when the reference
           fails to resolve — a different component tree, an export, a
           `<defs>` that moved — and this control floats over the drawing as
           the only thing left saying the canvas can be edited. An icon that
           can vanish is the exact bug `check:icon-contrast` exists for. So
           the glyph keeps one solid token colour and the gradient lives
           behind it, where the worst failure is a flat button.

           THE TWO FACES READ AS SEALED AND OPEN. Locked pools the primary
           tint at the top-left and falls to the card — light on a closed
           thing. That pooled face is STILL, and it stays the whole story for
           anyone who never sees the gleam above it: the owner asked the
           locked state to be carried by a travelling gloss, and a highlight
           that were the ONLY thing saying "locked" would say nothing at all
           under reduced motion. Editable is near-flat and still, because a
           canvas the reader is working on should have no moving chrome at
           all. Every stop is a theme token, so each theme supplies its own
           and none of this is a hardcoded colour. `relative` is the
           positioning context the gleam layer below needs, and nothing else
           depends on it. */
        className: locked
          ? "relative w-8 border-primary/40 bg-gradient-to-br from-primary/25 via-primary/10 to-card/80 px-0 shadow-sm backdrop-blur hover:border-primary/70 hover:from-primary/35 hover:via-primary/15 motion-safe:transition-all motion-safe:duration-300"
          : "w-8 bg-gradient-to-br from-card/90 to-card/60 px-0 shadow-sm backdrop-blur hover:from-muted/60 hover:to-card/70 motion-safe:transition-all motion-safe:duration-300",
      })}
    >
      {/* THE GLEAM — a narrow highlight raked across the locked face, crossing
          in the first third of its cycle and resting for the remainder, so
          what repeats is a glint rather than a surface in permanent motion.
          The reversal it implements, and what the old still-face rule was
          protecting, are argued beside the keyframes in globals.css; the floor
          under its speed and the rule that only one lock animation may loop
          are pinned by check:canvas-edit.

          A LAYER OF ITS OWN, deliberately, rather than the face's own
          background travelling. It leaves the pooled tint underneath intact,
          which is what still says "locked" to a reader on reduced motion, and
          it keeps the sweep off the glyph entirely — the padlock rides above
          this, its colour still the flat token the header's rule requires.

          Rendered for `locked` alone and NOT gated on `travelled`, unlike the
          settles: those answer a press, so playing them on arrival would claim
          a press nobody made, while this reports a STATE and must therefore be
          there the moment a locked diagram opens. */}
      {locked ? (
        <span
          aria-hidden="true"
          className="af-lock-sheen pointer-events-none absolute inset-0 rounded-[inherit] motion-safe:animate-lock-sheen"
        />
      ) : null}
      {/* Each face animates on MOUNT (a toggle swaps the two glyphs, so the
          entering one plays its gesture), gated three ways: `travelled` skips
          the first paint, `motion-safe:` is the reduced-motion opt-out — in
          CSS, not JS, so it holds on that very first toggle frame — and the
          keyframes are transform-only, so the token colour below and the
          button's gradient stay the only paint either face ever has. */}
      {locked ? (
        <LockKeyhole
          aria-hidden="true"
          className={cn(
            "text-primary",
            travelled && "motion-safe:animate-lock-snap",
          )}
        />
      ) : (
        <LockKeyholeOpen
          aria-hidden="true"
          className={cn(travelled && "motion-safe:animate-lock-open")}
        />
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

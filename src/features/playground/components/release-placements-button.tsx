/**
 * "Hand this diagram back to the layout" — the sweep, as one control for the
 * two canvases that answer only `move`.
 *
 * WHY IT IS NOT IN THE VIEWER. The ER and use-case viewers take an `edit`
 * bundle with `onMoveElement`, `onPinElement` and `onReleaseElement` — three
 * gestures aimed at ONE element, each reachable from that element. The sweep
 * is aimed at the diagram, so there is nothing on the canvas for it to hang
 * off, and it sits beside the padlock in the host's own slot instead. That is
 * where the C4 canvas already puts its equivalent (inside
 * `LayoutDirectionMenu`, whose `onRelease` is the same idea), so a reader
 * moving between the three canvases finds it in one place —
 * `codebase.md` habit 2, and `canvas-editing.md`'s rule that a gesture the
 * neighbouring canvas already has must work the same way.
 *
 * ONE COMPONENT FOR BOTH CANVASES, in `playground/components` rather than in
 * `components/ui`: the two call sites are in the same file, so this is shared
 * WITHIN a feature. `dry.md` sends a control to `components/ui` when two
 * FEATURES need it — `CanvasModeToggle` moved there for exactly that — and
 * moving this one there now would be a cross-feature seam nobody crosses.
 *
 * ABSENT, NEVER DISABLED, WHEN THERE IS NOTHING TO HAND BACK. A disabled
 * button asks the reader to work out why, and the answer here is either "you
 * have not placed anything" — which the diagram already shows — or "everything
 * you placed is pinned", which is a different sentence and belongs in the
 * announcement the host makes when the sweep finds nothing. The lock beside it
 * takes the same view: a control that cannot change anything is worse than its
 * absence.
 *
 * IT NAMES THE COUNT, because the count is the thing a reader cannot see. Two
 * elements placed by hand out of eleven look no different from eleven, and a
 * bare "Reset" beside a padlock reads like it might undo the whole document.
 */

"use client";

import { RotateCcw } from "lucide-react";

import { buttonClasses } from "@/components/ui/button";

export interface ReleasePlacementsButtonProps {
  /**
   * How many elements state a position AND are not pinned — the number this
   * press will actually release.
   *
   * COUNTED FROM THE SOURCE'S OWN ANSWER by the caller (`position !==
   * undefined`), never by comparing coordinates against the solved layout.
   * Those are different questions with different answers, and answering the
   * first with the second is what once left a hand-placed C4 diagram silently
   * unmovable.
   */
  releasable: number;
  /** How many state a position and ARE pinned — named in the title so a
   *  reader can see why the count is lower than what they placed. */
  pinned: number;
  /** The noun this notation calls its elements, singular. */
  noun: string;
  onRelease: () => void;
}

export function ReleasePlacementsButton({
  releasable,
  pinned,
  noun,
  onRelease,
}: ReleasePlacementsButtonProps): React.JSX.Element | null {
  if (releasable === 0) return null;
  const plural = releasable === 1 ? noun : `${noun}s`;
  const skipped =
    pinned === 0
      ? ""
      : ` ${pinned} pinned ${pinned === 1 ? noun : `${noun}s`} ${pinned === 1 ? "keeps its" : "keep their"} place.`;
  return (
    <button
      type="button"
      onClick={onRelease}
      className={buttonClasses({ variant: "outline", size: "sm" })}
      /* THE FULL SENTENCE IS THE TITLE AND THE ACCESSIBLE NAME, one string so
         hover and assistive tech cannot drift apart — the pairing
         `canvas-lock-button.tsx` argues for and `check:canvas-edit` pins
         there. The visible label is shorter than the name on purpose, and
         WCAG 2.5.3 is satisfied because the name OPENS with the label. */
      title={`Hand ${releasable} ${plural} back to the layout.${skipped}`}
      aria-label={`Hand ${releasable} ${plural} back to the layout.${skipped}`}
    >
      <RotateCcw aria-hidden className="size-4" />
      <span>Hand {releasable} back</span>
    </button>
  );
}

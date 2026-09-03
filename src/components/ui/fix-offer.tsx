"use client";

/**
 * The rewrite a parse error offers, rendered inside the error panel that
 * already exists.
 *
 * NOTHING NEW OPENS. This takes the slot `IndentRepairOffer` occupied in the
 * playground — directly under the caret quote, above the "your work is safe"
 * footer — and the three surfaces that report a `.alab` failure all render it
 * there: the playground's source pane, the editor's text pane, and
 * `/validate`. A dialog, a popover or a lightbulb gutter icon were all
 * rejected for one reason: the reader is looking at the error, and a fix that
 * arrives somewhere else asks them to go and find it.
 *
 * TWO SHAPES, AND WHICH ONE APPEARS IS THE PARSER'S DECISION, not this
 * component's. A single `safe` candidate is a button, because the parser has
 * proved there is one correct rewrite (`check:quickfix` asserts every safe fix
 * both minimal and strictly advancing, and that it restores the MODEL). Anything
 * else is a radio list with an explicit Apply — never one click, never applied
 * by a keystroke while the list is closed. A `choice` is a guess, and a guess
 * one click from the author's text is what the whole `Fixability` distinction
 * exists to prevent.
 *
 * THE EDIT GOES THROUGH THE REAL `<textarea>`, via `setRangeText` over a
 * character range — the path Tab-to-indent already uses. That is the only way
 * to keep the caret AND get a native undo entry, so the reader can Cmd-Z a fix
 * they did not want. The whole-value `setText(...)` swap the indent repair used
 * did neither: the caret jumped to the top and Undo could not reach it.
 *
 * NO WASH, and it was considered. A `<textarea>` cannot paint one range of its
 * own text, so the only available flash is the whole pane — which for a
 * one-character edit is noise, and would need a motion surface with its own
 * reduced-motion policy and a `check:*-motion` to police it. The affordance
 * instead is where `setRangeText(…, "end")` leaves the caret: on the character
 * that changed. The reader's cursor IS the highlight.
 */

import { useId, useState } from "react";
import { Wand2 } from "lucide-react";

import { offsetOf } from "@/features/archtext";
import type {
  ArchTextIssue,
  FixCandidate,
  TextEdit,
} from "@/features/archtext";
import { buttonClasses } from "@/components/ui/button";

/** At most this many candidates. Beyond three a radio list becomes a quiz. */
const MAX_CANDIDATES = 3;

/**
 * Applies `edits` to a live textarea, preserving the caret and leaving one
 * native undo entry per edit.
 *
 * Back to front, so an earlier edit cannot move a later one's offsets — the
 * same ordering `applyTextEdit` uses, and for the same reason. `setRangeText`
 * rather than assigning `value`: assignment wipes the selection and is
 * invisible to the browser's own undo stack, which is what made the old
 * whole-document repair unrepealable.
 *
 * The caller must then hand `el.value` to its own change handler, exactly as
 * the Tab-to-indent path does — React's controlled value is not updated by a
 * DOM mutation, so skipping that step leaves the pane and the state disagreeing
 * until the next keystroke.
 */
export function applyFixToTextarea(
  el: HTMLTextAreaElement,
  edits: readonly TextEdit[],
): void {
  const ranges = edits
    .map((edit) => ({
      from: offsetOf(el.value, edit.start),
      to: offsetOf(el.value, edit.end),
      text: edit.text,
    }))
    .sort((a, b) => b.from - a.from);
  for (const range of ranges) {
    el.setRangeText(range.text, range.from, range.to, "end");
  }
}

/**
 * The candidates worth showing, best first.
 *
 * `rank` is the parser's own ordering and is honoured where present; a
 * candidate without one keeps its declared position, which is what the
 * single-`safe` case relies on.
 */
function candidatesOf(issue: ArchTextIssue): readonly FixCandidate[] {
  const fixes = issue.fixes ?? [];
  return [...fixes]
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
    .slice(0, MAX_CANDIDATES);
}

export function FixOffer({
  issue,
  onApply,
  shortcutHint = false,
}: {
  issue: ArchTextIssue | undefined;
  onApply: (fix: FixCandidate) => void;
  /**
   * Whether this pane binds Alt+Enter to the single safe fix. Passed rather
   * than assumed: the editor's text pane and `/validate` do not, and a panel
   * promising a key that nothing listens for is worse than no promise.
   */
  shortcutHint?: boolean;
}): React.JSX.Element | null {
  const groupId = useId();
  const candidates = issue === undefined ? [] : candidatesOf(issue);
  const [chosen, setChosen] = useState(0);

  if (candidates.length === 0) return null;

  const onlySafe = candidates.length === 1 && candidates[0].kind === "safe";

  if (onlySafe) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <button
          type="button"
          onClick={() => onApply(candidates[0])}
          className={buttonClasses({ variant: "outline", size: "sm" })}
        >
          <Wand2 aria-hidden="true" />
          {candidates[0].title}
        </button>
        {/* Says what the button is safe to press FOR, not how to fix the
            document by hand — the button already says that. */}
        <p className="text-xs text-muted-foreground">
          One correct rewrite, so this is the whole of it
          {shortcutHint ? " — or press Alt+Enter in the pane" : ""}. Undo puts
          it back.
        </p>
      </div>
    );
  }

  const selected = candidates[Math.min(chosen, candidates.length - 1)];
  return (
    <fieldset className="mt-3">
      <legend className="text-xs text-muted-foreground">
        {/* The honest framing, and it is load-bearing: a reader who is told
            the tool is guessing reads the options instead of trusting the
            first one. */}
        More than one rewrite would parse — pick the one you meant.
      </legend>
      <div className="mt-1.5 flex flex-col gap-1">
        {candidates.map((candidate, index) => (
          <label
            key={candidate.title}
            className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
          >
            <input
              type="radio"
              name={groupId}
              checked={index === Math.min(chosen, candidates.length - 1)}
              onChange={() => setChosen(index)}
              className="accent-accent"
            />
            <span className="font-mono text-xs">{candidate.title}</span>
          </label>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onApply(selected)}
        className={cnApply()}
      >
        <Wand2 aria-hidden="true" />
        Apply
      </button>
    </fieldset>
  );
}

/** The Apply button's classes, spelled once so the two shapes stay siblings. */
function cnApply(): string {
  return `mt-2 ${buttonClasses({ variant: "outline", size: "sm" })}`;
}

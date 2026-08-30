"use client";

/**
 * A textarea with a line-number gutter, whose long lines WRAP.
 *
 * WHY THIS IS NOT A CSS TRICK. A `<textarea>` cannot draw its own gutter — it
 * has no per-line boxes to hang a counter off — so the numbers are a separate
 * column, and the only hard part is keeping the two in step.
 *
 * THE OLD ANSWER WAS `wrap="off"`: one logical line was always one row, the
 * numbers were a plain list beside a scrolling textarea, and a long line ran off
 * to the right. That kept the gutter honest and made the pane unreadable. A
 * `desc` sentence or a Mermaid `section` line is routinely wider than a 30% rail,
 * and reading it meant dragging sideways and losing your place in the document —
 * on the pane whose entire job is that you can read what you are editing.
 *
 * SO THE LINES WRAP, AND THE GUTTER IS MEASURED BY THE TEXT ITSELF. Beside every
 * number sits an invisible copy of that line, in the same font, at the same
 * width the textarea gives it. The row is as tall as the copy, the copy is as
 * tall as the wrap, so number 40 stays level with line 40 no matter how many
 * rows line 39 turned into. Nothing is measured in JavaScript and nothing is
 * synchronised on scroll — the mirror and the textarea are the same text under
 * the same rules, and CSS lays both out the same way.
 *
 * Which is why the pieces below are constants rather than literals: the mirror
 * only predicts the wrap while it agrees with the textarea about the font, the
 * line height and BOTH horizontal insets. A padding changed on one side alone
 * would move the wrap points and the gutter would start to lie — and a gutter
 * that lies is worse than no gutter, because `/validate` and every parse error
 * quote line numbers at a reader who is counting these rows.
 *
 * THE WRAPPER SCROLLS, not the textarea. The textarea is laid over the mirror at
 * `inset-0`, so its height is the mirror's height — it is never taller than its
 * own content and so never scrolls itself. That also keeps the two columns
 * honest when a scrollbar appears: it narrows the mirror and the textarea by the
 * same pixels, because both sit inside the box it is taken out of.
 *
 * Height therefore comes from the WRAPPER (`className`), not from `rows`, which
 * is why `rows` is not accepted: it would size a box that no longer decides how
 * tall anything is.
 *
 * The gutter is `aria-hidden` and `select-none` — a screen reader announcing
 * "one two three" before every line would be noise, and a number caught in a
 * copy would break the paste, which for a pane whose whole job is text that
 * parses is the worst failure available. The mirror is hidden the same way, and
 * for the second reason twice over: it is the text you are already reading.
 */

import { Fragment, useMemo, type Ref } from "react";

import { sourceLines } from "@/lib/source-text";
import { cn } from "@/lib/utils";

export interface NumberedTextareaProps extends Omit<
  React.ComponentPropsWithoutRef<"textarea">,
  "wrap" | "ref" | "rows"
> {
  /** The text — read here as well as passed through, to lay out the gutter. */
  value: string;
  /** Forwarded to the real textarea, for callers that focus or measure it. */
  textareaRef?: Ref<HTMLTextAreaElement>;
  /** Classes for the WRAPPER, which is what has a height; see the header. */
  className?: string;
}

/* ---- shared by the mirror and the textarea; see the header --------------- */

/** The type scale. The rows only align while the line heights match. */
const TYPE = "font-mono text-xs leading-relaxed";
/** The vertical inset, so line 1 starts at the same y in both. */
const PAD_Y = "py-2.5";
/** The text column's insets, so both wrap at the same two edges. */
const PAD_X = "px-3";
/** …as a length, for the textarea, which is inset past the gutter as well. */
const PAD_X_LENGTH = "0.75rem";
/** The number column's insets, and their total — the gutter is digits + this. */
const NUMBER_PAD = "pr-2 pl-3";
const NUMBER_PAD_LENGTH = "1.25rem";

export function NumberedTextarea({
  value,
  textareaRef,
  className,
  style,
  ...rest
}: NumberedTextareaProps): React.JSX.Element {
  /* The trailing-newline rule lives in `sourceLines`, because `/syntax` numbers
     a block too and the surfaces were each carrying a private copy of it. */
  const lines = useMemo(() => sourceLines(value), [value]);

  /* WIDE ENOUGH FOR THE LAST NUMBER, in `ch` of the shared monospace type — so
     a 4-digit document gets a wider gutter than a 12-line one instead of both
     guessing at a fixed width, and nothing has to be measured to know it. Every
     element that reads this carries `TYPE`, which is what makes `ch` mean the
     same length in all of them. */
  const gutter = `calc(${String(lines.length).length}ch + ${NUMBER_PAD_LENGTH})`;

  return (
    <div
      className={cn(
        "relative min-w-0 overflow-auto rounded-lg border bg-card shadow-sm focus-within:ring-2 focus-within:ring-ring",
        className,
      )}
    >
      <div
        className={cn("relative grid min-h-full w-full", TYPE, PAD_Y)}
        style={{ gridTemplateColumns: `${gutter} 1fr` }}
      >
        {/* The gutter's own background, drawn full height rather than per row,
            so it still reaches the bottom of a pane the document does not fill.
            First in the DOM and unpositioned-content-first in paint order: the
            numbers are `relative` and therefore land on top of it. */}
        <div
          aria-hidden="true"
          className="absolute inset-y-0 left-0 border-r border-border/60 bg-secondary/30"
          style={{ width: gutter }}
        />
        {lines.map((line, index) => (
          <Fragment key={index}>
            <div
              aria-hidden="true"
              className={cn(
                "relative text-right text-muted-foreground/60 tabular-nums select-none",
                NUMBER_PAD,
              )}
            >
              {index + 1}
            </div>
            {/* THE ROW'S HEIGHT, and the only reason this copy exists. An empty
                line still has to be one row tall, and an empty box is not — so
                it stands in as a non-breaking space, which cannot itself wrap. */}
            <div
              aria-hidden="true"
              className={cn(
                "invisible break-words whitespace-pre-wrap select-none",
                PAD_X,
              )}
            >
              {line === "" ? "\u00a0" : line}
            </div>
          </Fragment>
        ))}
        <textarea
          {...rest}
          ref={textareaRef}
          value={value}
          /* See the header: the mirror below is what the numbers are measured
             against, and it wraps. `overflow-hidden` is a statement rather than
             a clip — the box is exactly its content's height, so a scrollbar
             here would mean the mirror and the text had disagreed. */
          wrap="soft"
          spellCheck={false}
          style={{ ...style, paddingLeft: `calc(${gutter} + ${PAD_X_LENGTH})` }}
          className={cn(
            "absolute inset-0 resize-none overflow-hidden bg-transparent break-words whitespace-pre-wrap text-foreground focus-visible:outline-none",
            TYPE,
            PAD_Y,
            /* `PAD_X` for the right edge — the inline `paddingLeft` above wins
               on the left, where the gutter has to be cleared as well. */
            PAD_X,
          )}
        />
      </div>
    </div>
  );
}

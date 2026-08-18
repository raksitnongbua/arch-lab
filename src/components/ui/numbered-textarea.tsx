"use client";

/**
 * A textarea with a line-number gutter.
 *
 * WHY THIS IS NOT A CSS TRICK. A `<textarea>` cannot draw its own gutter — it
 * has no per-line boxes to hang a counter off — so the numbers are a sibling
 * column, and the only hard part is keeping the two in step:
 *
 *   - THE GUTTER SCROLLS WITH THE TEXT. It mirrors the textarea's `scrollTop`
 *     on every scroll, so number 40 stays beside line 40 rather than beside
 *     wherever line 40 was when the pane last laid out.
 *   - `wrap="off"`, which is the load-bearing part. A soft-wrapped line occupies
 *     two visual rows and one number, so every number after the first wrap would
 *     be wrong — a gutter that lies is worse than no gutter. Off means one
 *     logical line is always one row, and long lines scroll sideways instead,
 *     which is what a code editor does anyway.
 *   - The two share `font-mono text-xs leading-relaxed` and the same vertical
 *     padding. They have to: the rows only line up while the line heights match,
 *     so both come from this file rather than from each caller.
 *
 * The gutter is `aria-hidden` and `select-none` — a screen reader announcing
 * "one two three" before every line would be noise, and a number caught in a
 * copy would break the paste, which for a pane whose whole job is text that
 * parses is the worst failure available.
 */

import { useCallback, useMemo, useRef, type Ref } from "react";

import { lineCount } from "@/lib/source-text";
import { cn } from "@/lib/utils";

export interface NumberedTextareaProps extends Omit<
  React.ComponentPropsWithoutRef<"textarea">,
  "wrap" | "ref"
> {
  /** The text — read here as well as passed through, to count the lines. */
  value: string;
  /** Forwarded to the real textarea, for callers that focus or measure it. */
  textareaRef?: Ref<HTMLTextAreaElement>;
  /** Classes for the WRAPPER; textarea styling is owned by this component. */
  className?: string;
}

/** Shared by both columns — the rows only align while these agree. */
const TYPE = "font-mono text-xs leading-relaxed";
const PAD_Y = "py-2.5";

export function NumberedTextarea({
  value,
  textareaRef,
  className,
  onScroll,
  ...rest
}: NumberedTextareaProps): React.JSX.Element {
  const gutterRef = useRef<HTMLDivElement | null>(null);

  /* The trailing-newline rule lives in `lineCount`, because `/syntax` draws a
     gutter too and the two were each carrying a private copy of the expression. */
  const count = useMemo(() => lineCount(value), [value]);

  const syncGutter = useCallback(
    (event: React.UIEvent<HTMLTextAreaElement>) => {
      const gutter = gutterRef.current;
      if (gutter !== null) {
        gutter.scrollTop = event.currentTarget.scrollTop;
      }
      onScroll?.(event);
    },
    [onScroll],
  );

  return (
    <div
      className={cn(
        "flex min-w-0 overflow-hidden rounded-lg border bg-card shadow-sm focus-within:ring-2 focus-within:ring-ring",
        className,
      )}
    >
      <div
        ref={gutterRef}
        aria-hidden="true"
        className={cn(
          "shrink-0 overflow-hidden border-r border-border/60 bg-secondary/30 pr-2 pl-3 text-right text-muted-foreground/60 tabular-nums select-none",
          TYPE,
          PAD_Y,
        )}
      >
        {Array.from({ length: count }, (_, index) => (
          <div key={index}>{index + 1}</div>
        ))}
      </div>
      <textarea
        {...rest}
        ref={textareaRef}
        value={value}
        onScroll={syncGutter}
        /* See the header: soft wrapping would put two rows against one number. */
        wrap="off"
        spellCheck={false}
        className={cn(
          "min-w-0 flex-1 resize-none bg-transparent px-3 text-foreground focus-visible:outline-none",
          TYPE,
          PAD_Y,
        )}
      />
    </div>
  );
}

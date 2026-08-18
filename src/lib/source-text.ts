/**
 * Reading positions back out of document source text.
 *
 * Parse errors carry a line number; the panes that report them need the line
 * itself to quote. Four modules had each written the one-liner below privately —
 * the C4 pane, the sequence pane, the editor's text pane, and the share-link
 * decoder — which meant four places to change if the newline handling ever had
 * to grow (a ` `, say, or a BOM).
 */

/**
 * The 1-indexed `line` of `text`, or `null` if the document has no such line.
 *
 * 1-indexed because that is how parsers and editors both count, so the caller
 * can pass an error's `line` through untouched. `\r\n` is handled, so a file
 * authored on Windows quotes the same as one authored anywhere else.
 */
export function sourceLineAt(text: string, line: number): string | null {
  return text.split(/\r?\n/)[line - 1] ?? null;
}

/**
 * How many lines a line-number gutter should draw for `text`.
 *
 * ONE RULE, and it is the kind that gets silently dropped when the expression is
 * retyped — which is why this is a function and not a copy per surface, the
 * mistake `sourceLineAt` above was extracted to fix: A TRAILING NEWLINE DOES NOT
 * MAKE A LINE. Every well-formed document ends with one, and counting it puts an
 * empty numbered row under the last line of every file. A newline in the MIDDLE
 * does make a line — a deliberate blank row is a row — so only the final one is
 * dropped.
 *
 * THE ≥1 FLOOR IS NOT WRITTEN HERE because it cannot be violated: `split` never
 * returns an empty array, so `""` already counts as one line and an empty pane
 * gets the line 1 it needs to be typed into for free. This carried a
 * `Math.max(1, …)` guard until `check:source-gutter` was asked to prove it did
 * something, and no input could be found that reached it. A guard that cannot
 * fire is a claim about the code that is not true.
 *
 * `\r?\n` matches `sourceLineAt` for consistency rather than for correctness:
 * splitting on `\n` alone counts CRLF documents identically. What it buys is that
 * the two functions cannot be read as disagreeing about what a line break is.
 */
export function lineCount(text: string): number {
  return text.replace(/\r?\n$/, "").split(/\r?\n/).length;
}

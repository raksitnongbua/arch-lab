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

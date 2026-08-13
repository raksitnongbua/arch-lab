/**
 * A parse error's offending source line, quoted verbatim with a caret under the
 * column — the `4 | some text` / `  |    ^` shape compilers have used forever.
 *
 * Shared by all three panes that report a located parse error (the C4
 * playground, the sequence playground, and the editor's text pane). They had
 * identical copies, and the sequence one carried a comment noting that the C4
 * component was private and "the format is the shared thing" — so the format is
 * now actually shared rather than described as such.
 */

/**
 * Width of the line-number gutter, in characters.
 *
 * The number line and the caret line must be padded to the SAME width or the
 * caret points at the wrong character — so the caret line measures the rendered
 * gutter rather than repeating this constant. That also keeps a five-digit line
 * number (a 10,000-line document) aligned instead of shifting the caret one
 * column left.
 */
const GUTTER_WIDTH = 4;

export function CaretQuote({
  line,
  column,
  lineText,
}: {
  line: number;
  /** 1-indexed, as parsers report it. */
  column: number;
  /** The source line, or `null` when the document has no such line. */
  lineText: string | null;
}): React.JSX.Element | null {
  // Nothing to quote is a normal outcome, not a caller's problem to branch on.
  if (lineText === null) return null;

  const gutter = String(line).padStart(GUTTER_WIDTH);
  const caretIndent = " ".repeat(Math.max(0, column - 1));

  return (
    <pre className="mt-2 overflow-x-auto rounded-md bg-card px-3 py-2 font-mono text-xs leading-relaxed text-foreground">
      {`${gutter} | ${lineText}\n`}
      <span aria-hidden="true">
        {`${" ".repeat(gutter.length)} | ${caretIndent}`}
        <span className="font-bold text-destructive">^</span>
      </span>
    </pre>
  );
}

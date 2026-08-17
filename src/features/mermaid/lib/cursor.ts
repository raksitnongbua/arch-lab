/**
 * The statement cursor shared by the LINE-ORIENTED Mermaid importers — the
 * flowchart reader (`./flowchart.ts`) and the use-case reader
 * (`./usecase.ts`), which parse the same `flowchart`/`graph` grammar under
 * two different conventions. Extracted the day the second reader appeared,
 * because every body here was about to be copied verbatim — and two copies
 * of a tokenizer drift, which in a parser means two dialects that disagree
 * about where a token ends.
 *
 * A cursor scans ONE statement over the RAW line (indentation included), so
 * `pos + 1` is the real 1-based column every error reports.
 *
 * Imported by `scripts/mermaid-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import { failAt } from "./errors";
import { decodeInlineBreaks, unescapeMermaidString } from "./text";

export interface Cursor {
  text: string;
  pos: number;
  line: number;
}

export const col = (cur: Cursor): number => cur.pos + 1;

export function skipSpaces(cur: Cursor): void {
  while (cur.pos < cur.text.length && /\s/.test(cur.text.charAt(cur.pos))) {
    cur.pos += 1;
  }
}

/** Characters that always end an id token. `-` and `=` are handled apart:
 * they only end it when they start a link (`--`, `-.`, `->`, `==`), so ids
 * like `my-node` survive. */
const ID_STOP = new Set([
  " ",
  "\t",
  '"',
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  "&",
  "|",
  ";",
  "<",
  ">",
  ":",
  ",",
]);

/** Reads an id token from the current position (callers skip spaces first,
 * so the start column is theirs to report). Returns "" when no id starts
 * here — the caller owns the error, because "expected a node id" and
 * "expected an element id" are different sentences. */
export function readIdToken(cur: Cursor): string {
  const startPos = cur.pos;
  while (cur.pos < cur.text.length) {
    const ch = cur.text.charAt(cur.pos);
    if (ID_STOP.has(ch)) break;
    const next = cur.text.charAt(cur.pos + 1);
    if (ch === "-" && (next === "-" || next === "." || next === ">")) break;
    if (ch === "=" && next === "=") break;
    cur.pos += 1;
  }
  return cur.text.slice(startPos, cur.pos);
}

/** A double-quoted run using the C4 dialect's `\"` / `\\` escapes; leaves
 * the cursor after the closing quote. */
export function readQuoted(cur: Cursor): string {
  const openCol = col(cur);
  let i = cur.pos + 1;
  while (i < cur.text.length && cur.text.charAt(i) !== '"') {
    if (cur.text.charAt(i) === "\\") i += 1;
    i += 1;
  }
  if (i >= cur.text.length) {
    failAt(cur.line, openCol, "the quoted text is never closed", '"');
  }
  const inner = cur.text.slice(cur.pos + 1, i);
  cur.pos = i + 1;
  return decodeInlineBreaks(unescapeMermaidString(inner));
}

/** Strips the optional quotes off label text that arrived already isolated
 * (a `|label|` body or a `[title]` tail), decoding the same two codecs. */
export function readLabelText(text: string): string {
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    return decodeInlineBreaks(unescapeMermaidString(text.slice(1, -1)));
  }
  return decodeInlineBreaks(text);
}

/**
 * The text between a node form's brackets: quoted (the emitters' spelling,
 * with the C4 dialect's escapes) or bare, running to the close token. The
 * trapezoid hint on the unclosed path can only trigger for the flowchart
 * dialect — the use-case reader refuses `[/` and `[\` as flowchart-only
 * openers before any bracket text is read.
 */
export function readBracketText(
  cur: Cursor,
  close: string,
  formCol: number,
): string {
  if (cur.text.charAt(cur.pos) === '"') {
    const inner = readQuoted(cur);
    if (!cur.text.startsWith(close, cur.pos)) {
      failAt(
        cur.line,
        col(cur),
        `expected "${close}" directly after the quoted label`,
        cur.text.slice(cur.pos, cur.pos + 10),
      );
    }
    cur.pos += close.length;
    return inner;
  }
  const closeAt = cur.text.indexOf(close, cur.pos);
  if (closeAt === -1) {
    /* The mixed trapezoid brackets are the common way to land here — name
       them, so the error teaches rather than baffles. */
    const what = /[/\\]\]/.test(cur.text.slice(cur.pos))
      ? " (a trapezoid mixes / and \\, which has no arch-lab flowchart shape)"
      : "";
    failAt(
      cur.line,
      formCol,
      `the node bracket is never closed — expected "${close}"${what}`,
      cur.text.slice(cur.pos, cur.pos + 20).trim(),
    );
  }
  const value = decodeInlineBreaks(cur.text.slice(cur.pos, closeAt).trim());
  cur.pos = closeAt + close.length;
  return value;
}

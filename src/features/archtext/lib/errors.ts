/**
 * Error type for the arch-lab text (`.alab`) parser. Mirrors the shape and
 * tone of the editor's `FileValidationError` (src/features/editor/io/
 * validate.ts) and the Mermaid feature's `MermaidParseError`
 * (src/features/mermaid/lib/errors.ts) so the UI can treat all three
 * uniformly: the message is user-presentable, always names the location
 * (line and column, 1-based) and, where there is a concrete lexeme to point
 * at, the offending text. A parse either succeeds completely or throws — no
 * half-built model is ever returned.
 *
 * Imported by `scripts/archtext-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import type { FixCandidate } from "./fix";
import type { IssueCode } from "./issue-codes";

export interface ArchTextIssue {
  /** 1-based line in the `.alab` source. */
  line: number;
  /** 1-based column in the `.alab` source. */
  column: number;
  message: string;
  /** The offending text, when there is a concrete lexeme to point at. */
  found?: string;
  /**
   * Which failure this is, for a caller that wants to act rather than print.
   *
   * OPTIONAL, AND THAT IS THE RATCHET. There are ~520 throw sites across nine
   * grammars and coding them in one change would be unreviewable, so a site
   * without a code is legal and `scripts/quickfix-check.mjs` holds the count
   * of them against a committed baseline: the number may fall, never rise.
   * Once it reaches zero this field becomes required and the ratchet comes
   * out. Never branch on `message` in its absence — nine sites share a
   * sentence byte for byte, and ~150 check assertions are free to reword any
   * of them.
   */
  code?: IssueCode;
  /**
   * Rewrites that would resolve this issue, best first.
   *
   * Absent, never empty: a code whose `fixability` is `none` must carry no
   * array at all, so `fixes === undefined` and `fixes.length === 0` cannot
   * come to mean different things in two surfaces.
   */
  fixes?: readonly FixCandidate[];
}

/**
 * Thrown by `parseArchText`. The message always reads
 * `line <n>, column <n>: <what is wrong and what was expected>`.
 */
export class ArchTextParseError extends Error {
  readonly issues: readonly ArchTextIssue[];
  /** Line of the first issue — convenience for editor gutter markers. */
  readonly line: number;
  /** Column of the first issue. */
  readonly column: number;

  constructor(issues: readonly ArchTextIssue[]) {
    const first = issues[0] ?? {
      line: 1,
      column: 1,
      message: "the source failed to parse",
    };
    const more =
      issues.length > 1
        ? ` (and ${issues.length - 1} more problem${issues.length > 2 ? "s" : ""})`
        : "";
    super(
      `line ${first.line}, column ${first.column}: ${first.message}${more}`,
    );
    this.name = "ArchTextParseError";
    this.issues = issues;
    this.line = first.line;
    this.column = first.column;
  }
}

/**
 * What a throw site knows beyond its sentence.
 *
 * A separate object rather than two more positional parameters because
 * `found` is already the fourth and optional: a site that wants a code but no
 * `found` would otherwise have to write `undefined` in the gap, and the
 * gap is where the ~520 existing calls live.
 */
export interface IssueDetail {
  code: IssueCode;
  /** Omit entirely when there is nothing to offer — never pass `[]`. */
  fixes?: readonly FixCandidate[];
}

/** Throws a single-issue `ArchTextParseError` at the given location. */
export function failAt(
  line: number,
  column: number,
  message: string,
  found?: string,
  detail?: IssueDetail,
): never {
  const issue: ArchTextIssue = { line, column, message };
  if (found !== undefined) issue.found = found;
  if (detail !== undefined) {
    issue.code = detail.code;
    if (detail.fixes !== undefined && detail.fixes.length > 0) {
      issue.fixes = detail.fixes;
    }
  }
  throw new ArchTextParseError([issue]);
}

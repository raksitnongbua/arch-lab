/**
 * Error type for the Mermaid C4 parser. Mirrors the tone and contract of the
 * editor's `FileValidationError` (src/features/editor/io/validate.ts): the
 * message is user-presentable, always names the location (line and column,
 * 1-based) and, where there is a concrete lexeme to point at, the offending
 * text. A parse either succeeds completely or throws — no half-built model
 * is ever returned.
 *
 * Imported by `scripts/mermaid-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

export interface MermaidIssue {
  /** 1-based line in the Mermaid source. */
  line: number;
  /** 1-based column in the Mermaid source. */
  column: number;
  message: string;
  /** The offending text, when there is a concrete lexeme to point at. */
  found?: string;
}

/**
 * Thrown by `parseMermaidC4`. The message always reads
 * `line <n>, column <n>: <what is wrong and what was expected>`.
 */
export class MermaidParseError extends Error {
  readonly issues: readonly MermaidIssue[];
  /** Line of the first issue — convenience for editor gutter markers. */
  readonly line: number;
  /** Column of the first issue. */
  readonly column: number;

  constructor(issues: readonly MermaidIssue[]) {
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
    this.name = "MermaidParseError";
    this.issues = issues;
    this.line = first.line;
    this.column = first.column;
  }
}

/** Throws a single-issue `MermaidParseError` at the given location. */
export function failAt(
  line: number,
  column: number,
  message: string,
  found?: string,
): never {
  const issue: MermaidIssue = { line, column, message };
  if (found !== undefined) issue.found = found;
  throw new MermaidParseError([issue]);
}

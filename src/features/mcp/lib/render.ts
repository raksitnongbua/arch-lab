/**
 * Turning results into the text an MCP client actually reads.
 *
 * Two rules shape everything here:
 *
 *   1. **A failure must be actionable in one read.** The `.alab` parser
 *      already knows the line, the column and the offending source line, so
 *      errors are rendered the way a compiler renders them — quoted line with
 *      a caret under the column. An agent that gets `line 7, column 18` plus
 *      the line can fix the file without asking for it back.
 *   2. **Success must be summarised, not dumped.** Handing back the whole
 *      model as proof of validity burns context for no gain, so the OK path
 *      reports structure (diagrams, levels, counts) and the caller asks for
 *      text explicitly via `convert_model`.
 *
 * Pure string formatting — no SDK types, no I/O, trivially testable.
 */

import type { CheckFormat, CheckIssue } from "@/features/validate/lib/check";
import { CHECK_FORMAT_LABEL } from "@/features/validate/lib/check";

/* -------------------------------------------------------------------------- */
/* MCP result envelopes                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The shape every tool in this feature returns: one text block, plus the
 * protocol's `isError` flag. Structurally compatible with the SDK's
 * `CallToolResult` without importing it, which keeps `tools/*` free of SDK
 * types and directly unit-testable.
 */
export interface McpTextResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
  /**
   * The protocol's result object is open (clients may carry extra keys), and
   * the SDK's own type models that with an index signature — matching it here
   * is what makes this interface assignable to `CallToolResult` without
   * importing it.
   */
  [key: string]: unknown;
}

export function textResult(text: string): McpTextResult {
  return { content: [{ type: "text", text }] };
}

/**
 * A tool-level failure. `isError` is the protocol's own flag: the client
 * shows it as a failed call instead of quietly treating the message as data.
 */
export function errorResult(text: string): McpTextResult {
  return { content: [{ type: "text", text }], isError: true };
}

/* -------------------------------------------------------------------------- */
/* Text building blocks                                                        */
/* -------------------------------------------------------------------------- */

/** Joins sections with exactly one blank line between them, trimming empties. */
export function joinSections(...sections: (string | null)[]): string {
  return sections
    .filter((section): section is string => section !== null && section !== "")
    .join("\n\n");
}

/** A fenced code block with a language tag. */
export function fence(language: string, body: string): string {
  return `\`\`\`${language}\n${body.replace(/\n$/, "")}\n\`\`\``;
}

/** Right-aligns line numbers so the caret gutter lines up. */
function gutter(text: string, width: number): string {
  return text.padStart(width, " ");
}

/**
 * A compiler-style quotation of the offending line:
 *
 * ```
 *    7 |   orders-service: "Orders Service"
 *      |                 ^
 * ```
 *
 * The caret is placed on the 1-based `column`; tabs in the source are not
 * expanded because `.alab` forbids them, so column and character offset
 * always agree.
 */
export function quoteSourceLine(
  lineText: string,
  line: number,
  column: number | undefined,
): string {
  const label = String(line);
  const width = Math.max(label.length, 3);
  const rows = [`${gutter(label, width)} | ${lineText}`];
  if (column !== undefined && column >= 1) {
    rows.push(`${gutter("", width)} | ${" ".repeat(column - 1)}^`);
  }
  return rows.join("\n");
}

/* -------------------------------------------------------------------------- */
/* Issues                                                                      */
/* -------------------------------------------------------------------------- */

/** One issue as a numbered entry, with its quoted line when it has one. */
function renderIssue(issue: CheckIssue, index: number, total: number): string {
  const ordinal = total > 1 ? `${index + 1}. ` : "";
  const location =
    issue.line !== undefined
      ? `line ${issue.line}` +
        (issue.column !== undefined ? `, column ${issue.column}` : "")
      : issue.path;

  const headline =
    location === undefined
      ? `${ordinal}${issue.message}`
      : `${ordinal}${location}: ${issue.message}`;

  if (issue.lineText === undefined || issue.line === undefined) return headline;
  return `${headline}\n\n${quoteSourceLine(issue.lineText, issue.line, issue.column)}`;
}

export function renderIssues(issues: readonly CheckIssue[]): string {
  return issues
    .map((issue, index) => renderIssue(issue, index, issues.length))
    .join("\n\n");
}

/* -------------------------------------------------------------------------- */
/* Summaries                                                                   */
/* -------------------------------------------------------------------------- */

/** How the format was arrived at, so an agent can tell detection from choice. */
export function formatNote(format: CheckFormat, autoDetected: boolean): string {
  const label = CHECK_FORMAT_LABEL[format];
  return autoDetected ? `${label} (auto-detected)` : label;
}

/**
 * The structure table shown on every successful read: one row per diagram,
 * with its level, id, title and counts. Aligned so a wide model stays
 * scannable.
 */
export function renderDiagramTable(
  diagrams: readonly {
    id: string;
    title: string;
    level: string;
    nodeCount: number;
    edgeCount: number;
  }[],
): string {
  if (diagrams.length === 0) return "(no diagrams)";
  const levelWidth = Math.max(...diagrams.map((d) => d.level.length));
  const idWidth = Math.max(...diagrams.map((d) => d.id.length));
  return diagrams
    .map(
      (diagram) =>
        `  @${diagram.level.padEnd(levelWidth)}  ` +
        `${diagram.id.padEnd(idWidth)}  ` +
        `${JSON.stringify(diagram.title)} — ` +
        `${diagram.nodeCount} node${diagram.nodeCount === 1 ? "" : "s"}, ` +
        `${diagram.edgeCount} edge${diagram.edgeCount === 1 ? "" : "s"}`,
    )
    .join("\n");
}

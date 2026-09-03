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

import {
  ADVISORY_RULES,
  groupAdvisories,
  type Advisory,
} from "@/features/validate/lib/advisories";
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

/**
 * Drops a location the message already opens with, so the headline states it
 * once.
 *
 * `ArchTextParseError.message` is built as `line N, column M: <what>` for the
 * editor's error strip, and the eight kind readers store that whole string as
 * their failure's `message` — so any renderer that prefixes the location again
 * emitted `line 5, column 14: line 5, column 14: …`. That shipped in all eight
 * `validate_<kind>` tools and in the generated syntax reference.
 *
 * MATCHED AGAINST THE ISSUE'S OWN LOCATION rather than a `/^line \d+/` regex:
 * a message that happens to begin by naming a DIFFERENT line ("line 3 opened a
 * block that never closes") is information, not a repeat, and must survive.
 */
function withoutRepeatedLocation(message: string, location: string): string {
  const prefix = `${location}: `;
  return message.startsWith(prefix) ? message.slice(prefix.length) : message;
}

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
      : `${ordinal}${location}: ${withoutRepeatedLocation(issue.message, location)}`;

  if (issue.lineText === undefined || issue.line === undefined) return headline;
  return `${headline}\n\n${quoteSourceLine(issue.lineText, issue.line, issue.column)}`;
}

export function renderIssues(issues: readonly CheckIssue[]): string {
  return issues
    .map((issue, index) => renderIssue(issue, index, issues.length))
    .join("\n\n");
}

/**
 * A located parse failure from one of the eight kind readers, rendered the way
 * `lib/read.ts` renders a C4 one: the verdict, then the issue with its quoted
 * line and caret.
 *
 * THE ONE COPY. Every `validate_<kind>` / `format_<kind>` pair carried its own
 * `renderReadError` — eight bodies that differed only in which
 * `<KIND>_FORMAT_LABEL` they indexed — which is why the doubled location above
 * had to be fixed in eight places to be fixed at all, and why it never was.
 * `formatLabel` is a parameter rather than a `kind` argument because each
 * reader owns its own label table and this module must not import nine of
 * them.
 */
export function renderKindParseFailure(
  /** The dialect the reader tried, e.g. `.alab flowchart`. */
  formatLabel: string,
  failure: {
    line: number;
    column: number;
    message: string;
    /**
     * `null` when the location points past the last line (an unexpected end
     * of input): there is nothing to quote and the message already says where.
     */
    lineText: string | null;
  },
): string {
  return joinSections(
    `INVALID as ${formatLabel}.`,
    renderIssues([
      {
        message: failure.message,
        line: failure.line,
        column: failure.column,
        lineText: failure.lineText ?? undefined,
      },
    ]),
  );
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

/**
 * The review notes as plain text, grouped by rule. Capped per group: an agent
 * needs to learn the RULE and see enough instances to recognise the shape,
 * not receive a line for each of ninety nodes — and the tail is identical
 * work once the first few are fixed. The count always states the true total,
 * so a cap can never read as "that was all of them".
 */
const MAX_ITEMS_PER_RULE = 8;

/**
 * Advisories for either document kind — here rather than in `tools/validate.ts`
 * so a C4 model and a sequence diagram report the same way. Both call it; the
 * `subject` is the only thing that differs.
 *
 * The preamble deliberately says "review note", not "C4 review note". Advisories
 * now come from two families (see `validate/lib/advisories.ts`) and a sequence
 * document raises only the format ones, so naming C4 in the header would have
 * announced a C4 review of a document with no C4 in it. Each rule states its own
 * source on its `Why:` line, which is where the citation belongs anyway.
 */
export function renderAdvisories(
  advisories: readonly Advisory[],
  /** What was checked, for the preamble: "model", "sequence diagram". */
  subject: string,
): string | null {
  const groups = groupAdvisories(advisories);
  if (groups.length === 0) return null;

  const total = advisories.length;
  const body = groups
    .map(({ rule, items }) => {
      const shown = items.slice(0, MAX_ITEMS_PER_RULE);
      const hidden = items.length - shown.length;
      return [
        `${ADVISORY_RULES[rule].title} (${items.length})`,
        `  Why: ${ADVISORY_RULES[rule].because}`,
        ...shown.map((item) => `  - ${item.where}: ${item.message}`),
        hidden > 0 ? `  - …and ${hidden} more of the same.` : null,
      ]
        .filter((line): line is string => line !== null)
        .join("\n");
    })
    .join("\n\n");

  return joinSections(
    `${total} review note(s) — the ${subject} is VALID; these are the things a ` +
      `parser cannot check, each with the rule it comes from. Worth fixing ` +
      `before the diagram is shared; none of them block anything.`,
    body,
  );
}

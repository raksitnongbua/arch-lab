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
 *   3. **A fork the server cannot settle is put to the human, in text.**
 *      See the ask-human envelope below: this deployment cannot ask a
 *      question over the protocol, so the question travels as the result.
 *
 * Pure string formatting — no SDK types, no I/O, trivially testable.
 */

import {
  ADVISORY_RULES,
  groupAdvisories,
  type Advisory,
  type AdvisoryRule,
} from "@/features/validate/lib/advisories";
import { applyTextEdit } from "@/features/archtext";
import type { ArchTextIssue, FixCandidate } from "@/features/archtext";
import type { CheckFormat, CheckIssue } from "@/features/validate/lib/check";
import { CHECK_FORMAT_LABEL } from "@/features/validate/lib/check";
import { sourceLines } from "@/lib/source-text";

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

/* -------------------------------------------------------------------------- */
/* Fixes                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The repair the parser already computed, rendered for the caller that has to
 * perform it by hand.
 *
 * WHY THIS EXISTS AT ALL. `checkSource` has attached `code` and `fixes` to
 * every `.alab` issue since the quick-fix work, and the playground, the text
 * pane and `/validate` all render them as buttons. This renderer dropped both
 * on the floor, so the ONE caller that cannot see the button — an agent, which
 * has to retype the line — was the only caller told nothing about the rewrite.
 * `fix.ts`'s own header claimed all three surfaces read the same candidates;
 * until this function it was two.
 *
 * WHY A BUTTON'S LABEL IS NOT ENOUGH HERE. `title` is imperative and capped at
 * 40 characters because it is a button, so "Use spaces instead of a tab" leaves
 * the width unsaid and an agent that guesses four has produced a document that
 * fails at the same line. The candidate's edits already settle it exactly, so
 * what is shown is the SOURCE AFTER THE EDIT, not a description of it.
 *
 * WHY A `choice` IS NOT AN `askHumanResult`. The ask envelope is for a fork the
 * wrong branch of which cannot be undone later (`lib/ask.ts`). A parse failure
 * is the most undoable state there is — the document does not parse, so nothing
 * downstream has consumed a wrong reading, and the agent can try again for the
 * cost of one call. Candidates are therefore INFORMATION, listed with the
 * parser's own admission that it cannot prove which was meant.
 */
function previewFix(candidate: FixCandidate, source: string): string | null {
  const edits = candidate.edits;
  if (edits.length === 0) return null;

  const firstLine = Math.min(...edits.map((edit) => edit.start.line));
  const lastLine = Math.max(...edits.map((edit) => edit.end.line));
  // How many lines the edited span gains or loses, so the window closes on the
  // right row afterwards: an inserted `@sequence` header pushes its successor
  // down, a deleted duplicate `archlab` line pulls one up.
  const lineDelta = edits.reduce(
    (total, edit) =>
      total +
      (edit.text.split("\n").length - 1) -
      (edit.end.line - edit.start.line),
    0,
  );
  const lastLineAfter = lastLine + lineDelta;
  if (lastLineAfter < firstLine) return null; // A pure deletion shows nothing.

  const lines = sourceLines(applyTextEdit(source, edits));
  const width = Math.max(String(lastLineAfter).length, 3);
  return lines
    .slice(firstLine - 1, lastLineAfter)
    .map(
      (text, offset) =>
        `${gutter(String(firstLine + offset), width)} | ${text}`,
    )
    .join("\n");
}

/**
 * The whole offer for one issue.
 *
 * `source` is optional because two callers legitimately have no document to
 * apply an edit to — a JSON validation failure and a Mermaid import failure
 * carry no candidates in the first place. Without it the titles still print:
 * knowing a repair exists and roughly what it is beats knowing nothing, and
 * silently omitting the block would make an absent document look like an
 * unfixable error.
 */
function renderFixes(
  fixes: readonly FixCandidate[],
  source: string | undefined,
): string | null {
  if (fixes.length === 0) return null;

  const body = fixes
    .map((candidate, index) => {
      const ordinal = fixes.length > 1 ? `  ${index + 1}. ` : "  ";
      const preview =
        source === undefined ? null : previewFix(candidate, source);
      const indented =
        preview === null
          ? null
          : preview
              .split("\n")
              .map((line) => `     ${line}`)
              .join("\n");
      return [`${ordinal}${candidate.title}`, indented]
        .filter((part): part is string => part !== null)
        .join("\n");
    })
    .join("\n");

  // The heading states the parser's own certainty, because that is the whole
  // difference between "apply this" and "read these and decide". A `safe`
  // candidate is one the mutation corpus in `scripts/quickfix-check.mjs` has
  // proven restores the ORIGINAL MODEL, not merely a document that parses.
  const heading =
    fixes.length > 1
      ? `Fixes — ${fixes.length} candidates; the parser cannot prove which was ` +
        `meant, so pick one or rewrite the line yourself:`
      : fixes[0].kind === "safe"
        ? "Fix — one provable rewrite:"
        : "Fix — one candidate, unproven; check it says what you meant:";

  return `${heading}\n${body}`;
}

/* -------------------------------------------------------------------------- */

/** One issue as a numbered entry, with its quoted line when it has one. */
function renderIssue(
  issue: CheckIssue,
  index: number,
  total: number,
  source: string | undefined,
): string {
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

  return joinSections(
    // The code is a STABLE NAME where the sentence is not — `issue-codes.ts`
    // says so in as many words — so an agent that meets the same failure twice
    // has something to match on that a reworded message cannot break.
    issue.code === undefined ? headline : `${headline}  [${issue.code}]`,
    issue.lineText === undefined || issue.line === undefined
      ? null
      : quoteSourceLine(issue.lineText, issue.line, issue.column),
    issue.fixes === undefined ? null : renderFixes(issue.fixes, source),
  );
}

/**
 * `source` is the document the issues were raised against, used to show what
 * each fix candidate leaves behind. Omitting it degrades to titles only.
 */
export function renderIssues(
  issues: readonly CheckIssue[],
  source?: string,
): string {
  return issues
    .map((issue, index) => renderIssue(issue, index, issues.length, source))
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
    /**
     * The `.alab` issue the reader flattened this from, when there is one —
     * every one of the eight readers already carries it, and it is where the
     * code and the fix candidates live. Absent for a Mermaid failure, which
     * has neither.
     */
    issue?: ArchTextIssue;
  },
  /** The document, so a fix can be shown as the line it leaves behind. */
  source?: string,
): string {
  return joinSections(
    `INVALID as ${formatLabel}.`,
    renderIssues(
      [
        {
          message: failure.message,
          line: failure.line,
          column: failure.column,
          lineText: failure.lineText ?? undefined,
          ...(failure.issue?.code === undefined
            ? {}
            : { code: failure.issue.code }),
          ...(failure.issue?.fixes === undefined
            ? {}
            : { fixes: failure.issue.fixes }),
        },
      ],
      source,
    ),
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
    /**
     * The drawn extent of this diagram, when the caller could measure one.
     *
     * PER DIAGRAM RATHER THAN PER MODEL, because a C4 model is several
     * pictures and only one of them is ever on the screen. A single number for
     * the file would answer a question nobody asks.
     */
    size?: { width: number; height: number };
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
        `${diagram.edgeCount} edge${diagram.edgeCount === 1 ? "" : "s"}` +
        (diagram.size === undefined
          ? ""
          : `, ${Math.round(diagram.size.width)} x ${Math.round(diagram.size.height)} px`),
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
 * An extra line for the rules whose fix an agent cannot make up.
 *
 * ADVISORIES STAY ADVISORIES — none of these becomes an `askHumanResult`,
 * because every one of them is something the agent can still fix after seeing
 * a normal result, and a fork that can be undone is not a fork. What one rule
 * needs is INSTRUCTION rather than a question: told only that "Uses" says
 * nothing, an agent's cheapest repair is to invent a plausible payload, and an
 * invented protocol in a diagram someone will present is worse than the vague
 * label it replaced. Sparse on purpose — a note on every rule is a note
 * nobody reads.
 */
const ADVISORY_INSTRUCTIONS: Partial<Record<AdvisoryRule, string>> = {
  "vague-relationship":
    "  If you do not know what flows here, ask — do not invent a payload.",
};

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
        ADVISORY_INSTRUCTIONS[rule] ?? null,
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

/* -------------------------------------------------------------------------- */
/* Asking the human                                                            */
/* -------------------------------------------------------------------------- */

/**
 * WHY THIS IS TEXT AND NOT PROTOCOL. MCP has `elicitation/create`, and the SDK
 * this server runs on (`@modelcontextprotocol/sdk` 1.30) ships
 * `Server.elicitInput()`. It cannot be used here, and the reason is structural
 * rather than a matter of taste:
 *
 *   - `mcp-handler` builds a fresh transport and a fresh `McpServer` PER POST
 *     with `sessionIdGenerator: undefined` (`app/api/mcp/route.ts`), which is
 *     what makes the serverless deployment correct.
 *   - `elicitInput` opens with
 *     `assertCapabilityForMethod("elicitation/create")`, which throws
 *     `Client does not support elicitation` unless `_clientCapabilities` is
 *     set — and only `initialize` sets it. A `tools/call` POST lands on a
 *     server that never saw `initialize`, so the call throws synchronously
 *     every time, whatever the client actually supports.
 *   - Even past that, the human's answer arrives as a NEW POST on a new
 *     instance with an empty request map, so the original handler would hang
 *     to `maxDuration` and time out. Sampling fails identically.
 *
 * Fixing either needs Redis or session affinity, which the feature README
 * ("Stateless. No sessions, no Redis") and `.claude/rules/deploy.md` rule out.
 * So the whole mechanism available is prose the client model reads: the tool
 * DESCRIPTION before it acts, and the tool RESULT after. The server cannot ask
 * the human; it can only make the client model ask, and make it hard not to.
 */
export interface AskOption {
  /** Short, stable key the human can answer with: `sequence`, `root`. */
  id: string;
  /** One line: what the choice IS. */
  label: string;
  /**
   * One line: what HAPPENS if it is chosen. Never a restatement of the label —
   * a consequence that only renames the option is what turns a fork into a
   * coin toss, so `check:mcp` asserts every consequence differs from its own
   * label.
   */
  consequence: string;
  /**
   * How to resume in one hop. `args` carries only what DIFFERS from the call
   * that raised the question — an empty object means "the same arguments",
   * which is the common case (the source text is already in the agent's hand
   * and must not be echoed back through `structuredContent`).
   */
  next?: { tool: string; args: Record<string, unknown> };
}

/** One fork the server can prove but must not settle. */
export interface AskHuman {
  /** Why the server refused to guess, in one sentence. */
  reason: string;
  /** The question, phrased for the HUMAN rather than for the agent. */
  question: string;
  /**
   * Two to five. One is not a fork; six is a menu nobody reads aloud, and the
   * whole point is that a person can be asked this in a sentence.
   * `check:mcp` enforces the bounds over every ask the fixtures provoke.
   */
  options: readonly AskOption[];
  /** The free-text escape. Always present: a list is never the whole world. */
  otherwise: string;
  /** `null` when there is no safe default and the human must be reached. */
  defaultId: string | null;
}

/**
 * A SHOUTED VERB, matching the `VALID` / `INVALID` convention every verdict in
 * this feature already opens with — an agent scanning the first line of a
 * result is the audience, and the existing checks already match on that line.
 *
 * Quoted verbatim in the server's `initialize` instructions, which is what
 * makes "stop when a result begins like this" a rule the agent has already
 * read by the time one arrives. `check:mcp` pins the two together.
 */
export const ASK_HUMAN_HEADLINE =
  "ASK YOUR HUMAN BEFORE CONTINUING — do not pick for them.";

/**
 * Plain-text wrap width for the consequence lines. 78 because these results
 * are read in terminals and chat transcripts that soft-wrap at 80, and
 * wrapping two columns inside that keeps the hanging indent visible.
 */
const ASK_WRAP_COLUMNS = 78;

function wrapAt(text: string, width: number, indentWidth: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter((part) => part !== "")) {
    const candidate = current === "" ? word : `${current} ${word}`;
    if (candidate.length + indentWidth > width && current !== "") {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  return lines.length === 0
    ? [current]
    : [...lines, ...(current === "" ? [] : [current])];
}

/**
 * One numbered option: the id, its label, and its consequence hanging UNDER
 * the label rather than beside it. The consequence is the half a reader skips
 * when it shares a line with the label, and it is the half that decides.
 */
function renderAskOption(
  option: AskOption,
  index: number,
  idWidth: number,
): string {
  const ordinal = `  ${index + 1}. `;
  const head = `${ordinal}${option.id.padEnd(idWidth)}  — ${option.label}`;
  // The arrow lands in the em dash's own column, so the label and what taking
  // it costs share one gutter and the eye drops straight down.
  const arrowIndent = " ".repeat(ordinal.length + idWidth + 2);
  const wrapped = wrapAt(
    option.consequence,
    ASK_WRAP_COLUMNS,
    arrowIndent.length + 2,
  );
  return [
    head,
    ...wrapped.map((line, position) =>
      position === 0 ? `${arrowIndent}→ ${line}` : `${arrowIndent}  ${line}`,
    ),
  ].join("\n");
}

/**
 * The whole question as the text an MCP client displays.
 *
 * `doneSoFar` — the work the call actually completed before it reached the
 * fork — sits UNDER the headline rather than above it, because the headline
 * has to be the first line: it is the one string the standing rule in the
 * server's `initialize` instructions tells the agent to stop on.
 */
export function renderAskHuman(ask: AskHuman, doneSoFar?: string): string {
  const idWidth = Math.max(...ask.options.map((option) => option.id.length));
  const defaultIndex = ask.options.findIndex(
    (option) => option.id === ask.defaultId,
  );
  return joinSections(
    ASK_HUMAN_HEADLINE,
    doneSoFar ?? null,
    ask.reason,
    ask.question,
    ask.options
      .map((option, index) => renderAskOption(option, index, idWidth))
      .join("\n"),
    `  ${ask.otherwise}`,
    // Only when there IS one. "No default" said out loud invites the agent to
    // invent one; saying nothing leaves the standing rule — stop and ask — as
    // the only instruction in the result.
    defaultIndex === -1
      ? null
      : `Default the server would take if you cannot ask: option ${defaultIndex + 1}.`,
  );
}

/**
 * The fork as a tool result.
 *
 * **`isError` IS DELIBERATELY UNSET.** The call did its work and stopped at a
 * fork; nothing failed. Marking it an error teaches the client model to "retry
 * differently" — a second call with a guessed argument — which is exactly the
 * guessing this envelope exists to stop. It also makes several clients collapse
 * the text, and the text is the question.
 *
 * `structuredContent` is a legal `CallToolResult` field in SDK 1.30 and
 * `McpTextResult`'s index signature already carries it. A client that ignores
 * it loses nothing: the rendered text is complete on its own, and that is a
 * requirement rather than an accident.
 */
export function askHumanResult(
  ask: AskHuman,
  doneSoFar?: string,
): McpTextResult {
  return {
    content: [{ type: "text", text: renderAskHuman(ask, doneSoFar) }],
    structuredContent: { archlab_ask: ask },
  };
}

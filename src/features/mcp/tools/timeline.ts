/**
 * `validate_timeline` and `format_timeline` — the milestone timeline's half of
 * the write-then-check loop.
 *
 * AN EIGHTH PAIR rather than a `kind` argument, for the reason the previous six
 * exist: the facts worth reporting about a timeline are none of the other
 * kinds'. C4 returns levels, sequence ordered messages, flowchart a guarded
 * graph, use case actors and their reach, ER tables and keys, a dictionary its
 * coverage, a gantt its duration and critical chain — and a history is none of
 * those.
 *
 * WHAT A PARSE CANNOT SEE HERE, which is the whole justification for this tool
 * beyond the parser. Two of the five findings below are specific to this
 * notation and neither exists anywhere else in the product:
 *
 *   - PERIODS OUT OF ORDER. The grammar deliberately never reads a period
 *     label as a date — `src/types/timeline.ts` argues that nothing here
 *     measures — so nothing in the app notices that "2024, 2019, 2025" is
 *     written out of sequence. The layout faithfully draws declaration order,
 *     which means the picture is a confident, well-formed lie about the
 *     history. This tool is the only place that can say so, and it only says
 *     it when EVERY label looks numeric, so a document of phrases is never
 *     second-guessed.
 *   - EVENTS WEARING A GANTT'S CLOTHES. A timeline is one keyword away from
 *     being a worse gantt at all times, and the way that actually happens is
 *     not a grammar change — it is an author writing the duration into the
 *     label ("Migration, three weeks") or the dependency into it ("after the
 *     freeze"). Those parse perfectly and are the signal that the document
 *     wants to be a different notation. Naming them is the most useful thing
 *     this validator does for an agent, which is exactly the caller most
 *     likely to produce them.
 *
 * The reader is `parseTimelineInput` — the SAME one `/live?d=timeline` uses,
 * itself a thin shell over `parseTimelineText` and `parseMermaidTimeline` — so
 * "the MCP server accepted it" means the playground renders it too.
 *
 * TWO READS AND TWO WRITES, unlike the gantt: `MERMAID_TIMELINE_CAVEAT` is
 * stated on a Mermaid read because the import normalises two spellings and
 * refuses `section`, but there is no one-way warning to give — a caller who
 * pastes Mermaid `timeline` can have it back.
 */

import type { TimelineLabFile } from "@/types/timeline";
import { timelineEvents } from "@/types/timeline";

import { serializeTimelineText } from "@/features/archtext";
/* THE VIEWER'S OWN LAYOUT, called server-side — pure, no DOM, so this tool
   reports the wrapping the browser will draw rather than a second estimate
   that could disagree with it. Imported from `lib/layout` rather than the
   feature barrel, exactly as `tools/gantt.ts` imports `layoutGantt`: the
   barrel re-exports `.tsx` components and `scripts/mcp-check.mjs` loads this
   module through Node's type stripping, which cannot resolve one. */
import { layoutTimeline } from "@/features/timeline/lib/layout";
import type { TimelineLayout } from "@/features/timeline/lib/layout";
import {
  MERMAID_TIMELINE_CAVEAT,
  parseTimelineInput,
  TIMELINE_FORMAT_LABEL,
  type TimelineInputError,
  type TimelineSourceFormat,
} from "@/features/timeline/input/parse";

import { guardSourceSize } from "../lib/limits";
import {
  errorResult,
  fence,
  joinSections,
  renderKindParseFailure,
  textResult,
  type McpTextResult,
} from "../lib/render";

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

export type ReadTimelineResult =
  | { status: "ok"; file: TimelineLabFile; format: TimelineSourceFormat }
  | {
      status: "error";
      kind: TimelineInputError["kind"] | "size";
      message: string;
    };

export function readTimeline(source: string): ReadTimelineResult {
  const size = guardSourceSize(source);
  if (!size.ok) return { status: "error", kind: "size", message: size.message };

  const result = parseTimelineInput(source);
  if (result.status === "error") {
    const { error } = result;
    return {
      status: "error",
      kind: error.kind,
      message:
        error.kind === "parse"
          ? renderKindParseFailure(TIMELINE_FORMAT_LABEL[error.format], error)
          : error.message,
    };
  }
  return { status: "ok", file: result.value.file, format: result.value.format };
}

/* -------------------------------------------------------------------------- */
/* The audit                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A period label read as a number, or `null` when it is not one.
 *
 * DELIBERATELY NARROW: a leading run of digits and nothing else that could be
 * a second number. "2024", "2024–2025" and "Q3 2024" all yield 2024; "Before
 * the rewrite" yields null. The narrowness is what makes the out-of-order
 * finding safe to report — it fires only when EVERY label in the document
 * parses, so a history of phrases is never told its periods are misordered.
 *
 * This function is the ONLY place in the product that reads a period label as
 * a quantity, and it may stay that way: doing it in the parser or the layout
 * would put a calendar into a notation that has none, which is the line
 * `src/types/timeline.ts` draws.
 */
function periodNumber(label: string): number | null {
  const match = /\d{1,6}/.exec(label);
  if (match === null) return null;
  return Number(match[0]);
}

/**
 * Vocabulary that says an event is carrying a duration or a dependency — the
 * two things this notation deliberately cannot express, written into the one
 * slot that will hold anything.
 *
 * A TABLE RATHER THAN ONE REGEX, so each finding can name the word it matched
 * and the caller is told what to look at rather than that "something matched".
 * Anchored on word boundaries: "afterwards" is a perfectly good event label
 * and must not trip the `after` entry.
 */
const GANTTISH_PATTERNS: readonly { pattern: RegExp; says: string }[] = [
  {
    pattern: /\b\d+\s*(?:d|days?|w|weeks?|months?|years?)\b/i,
    says: "a duration",
  },
  /* SPELLED-OUT NUMBERS TOO, because a person writing prose writes "three
     weeks" and only a person writing a plan writes "3w" — and the prose
     spelling is the one that ends up in a label, since the label IS prose. A
     digits-only pattern found none of the real cases. */
  {
    pattern:
      /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|a few)\s+(?:days?|weeks?|months?|years?|quarters?)\b/i,
    says: "a duration",
  },
  {
    pattern: /\b(?:takes|lasting|lasts|spanning|over the next)\b/i,
    says: "a duration",
  },
  {
    pattern: /\b(?:after|blocked by|depends on|waiting on|once .* is done)\b/i,
    says: "a dependency",
  },
];

interface GanttishEvent {
  period: string;
  label: string;
  says: string;
}

interface DuplicateEvent {
  period: string;
  label: string;
}

/**
 * The facts an agent writing a history it cannot see has no other way to
 * learn. Every one describes a document that PARSES — the grammar already
 * refuses an empty period, a duplicate period label and anything on an event
 * line but its label and tags — yet still says something a reviewer would call
 * wrong:
 *
 *   - `outOfOrder`  — every period label reads as a number and they do not
 *     ascend. THE ONE THAT MATTERS: nothing else in the product looks at a
 *     period label at all, so the diagram draws the wrong order confidently.
 *   - `ganttish`    — an event whose label carries a duration or a dependency.
 *     The document is asking for the notation next door.
 *   - `duplicateInPeriod` — the same label twice inside ONE band. Across bands
 *     it is legitimate (a thing can happen twice), which is why the parser
 *     allows it file-wide; inside one band it is a paste.
 *   - `singleEventPeriods` — a band holding one event. Reported as
 *     INFORMATION, not a fault: a year in which one thing happened is a real
 *     history. It is worth saying only because a whole document of them is a
 *     list with headings rather than a timeline.
 *   - `overlong`    — an event whose label wraps past three lines in the real
 *     layout. A point on a spine is a sentence, not a paragraph, and the
 *     author cannot see the wrapping from their own text.
 */
interface TimelineAudit {
  outOfOrder: string[] | null;
  ganttish: GanttishEvent[];
  duplicateInPeriod: DuplicateEvent[];
  singleEventPeriods: string[];
  overlong: { label: string; lines: number }[];
}

/** How many wrapped lines an event label may take before it stops being a
 * point on a spine. Three is the wrap the bundled examples reach at their
 * longest, so this fires above what the product itself ships rather than at
 * an invented threshold. */
const OVERLONG_LINES = 3;

function auditTimeline(
  file: TimelineLabFile,
  layout: TimelineLayout,
): TimelineAudit {
  const labels = file.periods.map((period) => period.label);
  const numbers = labels.map(periodNumber);
  /* Only when EVERY label reads as a number — see `periodNumber`. A document
     mixing "2024" and "Before the rewrite" is not misordered, it is a
     different kind of document. */
  const allNumeric =
    numbers.length > 1 && numbers.every((value) => value !== null);
  const ascends =
    !allNumeric ||
    numbers.every(
      (value, index) =>
        index === 0 || (value ?? 0) >= (numbers[index - 1] ?? 0),
    );

  const ganttish: GanttishEvent[] = [];
  const duplicateInPeriod: DuplicateEvent[] = [];
  for (const period of file.periods) {
    const seen = new Set<string>();
    for (const event of period.events) {
      const entry = GANTTISH_PATTERNS.find((candidate) =>
        candidate.pattern.test(event.label),
      );
      if (entry !== undefined) {
        ganttish.push({
          period: period.label,
          label: event.label,
          says: entry.says,
        });
      }
      if (seen.has(event.label)) {
        duplicateInPeriod.push({ period: period.label, label: event.label });
      }
      seen.add(event.label);
    }
  }

  return {
    outOfOrder: ascends ? null : labels,
    ganttish,
    duplicateInPeriod,
    singleEventPeriods: file.periods
      .filter((period) => period.events.length === 1)
      .map((period) => period.label),
    overlong: layout.events
      .filter((event) => event.labelLines.length > OVERLONG_LINES)
      .map((event) => ({
        label: event.label,
        lines: event.labelLines.length,
      })),
  };
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                   */
/* -------------------------------------------------------------------------- */

const quote = (text: string): string =>
  `"${text.length > 60 ? `${text.slice(0, 57)}…` : text}"`;

function renderSummary(file: TimelineLabFile, layout: TimelineLayout): string {
  const events = timelineEvents(file);
  const annotated = events.filter(
    (event) => typeof event.description === "string",
  ).length;
  return [
    `Title: ${file.metadata.title}`,
    `Periods: ${file.periods.length} — ${file.periods.map((period) => period.label).join(" → ")}`,
    `Events: ${events.length}, ${annotated} with a description`,
    /* The one number a caller genuinely cannot compute from their own text:
       the drawn height depends on how every label wrapped. */
    `Size: ${Math.round(layout.width)} x ${Math.round(layout.height)} px — the height is solved from the wrapped text, so a longer label makes a taller diagram.`,
  ].join("\n");
}

/** Every event as a row: which band it sits in, and how it draws. */
function renderEvents(layout: TimelineLayout): string {
  const rows = layout.events.map((event) => {
    const lines =
      event.labelLines.length === 1
        ? "1 line"
        : `${event.labelLines.length.toString()} lines`;
    const note =
      event.descriptionLines.length === 0
        ? "—"
        : `${event.descriptionLines.length.toString()} line${event.descriptionLines.length === 1 ? "" : "s"}`;
    return `| ${event.period} | ${event.label.replace(/\|/g, "\\|")} | ${lines} | ${note} |`;
  });
  return [
    "| Period | Event | Drawn as | Note |",
    "| --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

/**
 * The audit, rendered only when it has something to say, and worded as the
 * REMEDY rather than the complaint — the caller is a model about to edit the
 * document, and "move the 2019 band above the 2024 one" is actionable where
 * "periods out of order" is a label it must translate first.
 */
function renderAudit(audit: TimelineAudit): string | null {
  const notes: string[] = [];

  if (audit.outOfOrder !== null) {
    notes.push(
      `Periods out of order: ${audit.outOfOrder.map((label) => `\`${label}\``).join(" → ")} — every period here reads as a number, and they do not ascend. ` +
        "Nothing else in arch-lab looks at a period label: this notation " +
        "never parses one as a date, so the diagram draws them in the order " +
        "you wrote them and will look correct while saying the wrong thing. " +
        "Reorder the `period` blocks.",
    );
  }
  if (audit.ganttish.length > 0) {
    notes.push(
      `Events carrying ${[...new Set(audit.ganttish.map((entry) => entry.says))].join(" or ")}: ${audit.ganttish
        .map(
          (entry) =>
            `${quote(entry.label)} (in \`${entry.period}\`, reads as ${entry.says})`,
        )
        .join(
          "; ",
        )} — a timeline event is a POINT: it has no length and waits ` +
        "for nothing, so a duration or a dependency written into the label is " +
        "text the diagram cannot draw. If the plan genuinely has lengths and " +
        "prerequisites, write a gantt instead (`archlab 1.0 gantt`, " +
        "`validate_gantt`), which draws both and computes the critical path. " +
        "If it does not, reword the event so the label is only what happened.",
    );
  }
  if (audit.duplicateInPeriod.length > 0) {
    notes.push(
      `The same event twice in one period: ${audit.duplicateInPeriod
        .map((entry) => `${quote(entry.label)} in \`${entry.period}\``)
        .join("; ")} — the grammar allows a repeated label across the file, ` +
        "because a thing can happen twice in two different periods, so this " +
        "is not a parse error. Inside ONE band it draws two identical dots " +
        "with no way for a reader to tell them apart. Remove one, or say what " +
        "was different about the second.",
    );
  }
  if (audit.overlong.length > 0) {
    notes.push(
      `Events that wrap past ${OVERLONG_LINES.toString()} lines: ${audit.overlong
        .map(
          (entry) => `${quote(entry.label)} (${entry.lines.toString()} lines)`,
        )
        .join("; ")} — measured with the same layout the canvas draws, so ` +
        "this is what a reader will see rather than an estimate. A point on " +
        "the spine reads as a sentence; a paragraph belongs in the nested " +
        "`desc` line under it, which is drawn in the quieter style and is " +
        "there for exactly this.",
    );
  }
  if (audit.singleEventPeriods.length > 0) {
    notes.push(
      `Periods holding one event: ${audit.singleEventPeriods.map((label) => `\`${label}\``).join(", ")} — reported as information, not a fault: ` +
        "a year in which one thing happened is a real history, and the band " +
        "heights are solved from the event counts precisely so that shows. " +
        "Worth a second look only if every period is like this, which is a " +
        "list with headings rather than a timeline.",
    );
  }
  return notes.length === 0 ? null : notes.join("\n\n");
}

/* -------------------------------------------------------------------------- */
/* Tools                                                                       */
/* -------------------------------------------------------------------------- */

export function validateTimeline(source: string): McpTextResult {
  const read = readTimeline(source);
  if (read.status === "error") return errorResult(read.message);

  const layout = layoutTimeline(read.file);
  const audit = auditTimeline(read.file, layout);

  return textResult(
    joinSections(
      `VALID as ${TIMELINE_FORMAT_LABEL[read.format]}.`,
      renderSummary(read.file, layout),
      layout.events.length === 0 ? null : renderEvents(layout),
      renderAudit(audit),
      layout.events.length === 0
        ? "No events: the document parses, but a timeline with no points has " +
            "nothing to show. Add lines like " +
            '`event "Founded the company"` inside a `period`.'
        : null,
      read.format === "mermaid" ? MERMAID_TIMELINE_CAVEAT : null,
    ),
  );
}

export function formatTimeline(source: string): McpTextResult {
  const read = readTimeline(source);
  if (read.status === "error") return errorResult(read.message);

  return textResult(
    joinSections(
      `Canonical .alab timeline text, read as ${TIMELINE_FORMAT_LABEL[read.format]}.`,
      fence("", serializeTimelineText(read.file)),
      read.format === "mermaid" ? MERMAID_TIMELINE_CAVEAT : null,
    ),
  );
}

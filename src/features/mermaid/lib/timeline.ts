/**
 * Mermaid `timeline` → `TimelineLabFile`. The seventh dialect, beside the C4
 * reader in `./parse.ts`, the sequence reader in `./sequence.ts`, the
 * flowchart reader in `./flowchart.ts`, the use-case reader in `./usecase.ts`,
 * the ER reader in `./er.ts` and the gantt reader in `./gantt.ts`.
 *
 * TWO-WAY, unlike the gantt beside it, and `./timeline-mapping.ts` carries the
 * argument in full: a timeline says nothing that Mermaid cannot spell, so
 * `./timeline-emit.ts` exists and the share menu offers Mermaid for this kind.
 *
 * DETECTION IS EXACT, as it is for `erDiagram` and `gantt`: Mermaid has a real
 * `timeline` document type, so `detectMermaidTimeline` tests one word behind
 * any frontmatter and there is no convention to infer.
 *
 * The grammar read here, which is Mermaid's own:
 *
 *   timeline
 *     title History of social media
 *     2002 : LinkedIn
 *     2004 : Facebook : Google
 *          : YouTube
 *     2006 : Twitter
 *
 * A row is `<period> : <event> : <event>…`. A row that BEGINS with `:` adds
 * further events to the period above it — Mermaid's own continuation spelling,
 * and the one place this importer normalises rather than refuses, because the
 * two spellings mean the same document and arch-lab writes only the first.
 *
 * `<br>` INSIDE A LABEL becomes a real newline, the codec `decodeInlineBreaks`
 * already owns. That is not lossy in either direction: `./timeline-emit.ts`
 * re-encodes, and the `.alab` serializer JSON-quotes the label, so a two-line
 * event survives the whole round trip.
 *
 * WHAT IT REFUSES BY NAME rather than approximating: `section`, and a period
 * row with no events. Both are in `REFUSED_TIMELINE_CONSTRUCTS` / handled
 * beside it, and `scripts/mermaid-check.mjs` walks that table so a refusal
 * cannot quietly stop working.
 *
 * Imported by `scripts/mermaid-check.mjs` through Node's type stripping: keep
 * the syntax erasable and type-only imports as `import type`.
 */

import type { TimelineEvent, TimelineLabFile, TimelinePeriod } from "@/types";

import { MERMAID_IMPORT_TIMESTAMP } from "./defaults";
import { failAt } from "./errors";
import {
  decodeInlineBreaks,
  readMermaidFrontmatterTitle,
  stripMermaidFrontmatter,
  unescapeMermaidString,
} from "./text";
import {
  MERMAID_TIMELINE_CAVEAT,
  MERMAID_TIMELINE_HEADER_WORD,
  MERMAID_TIMELINE_SEPARATOR,
  REFUSED_TIMELINE_BY_KEYWORD,
} from "./timeline-mapping";

export { MERMAID_TIMELINE_CAVEAT };

/* -------------------------------------------------------------------------- */
/* Options                                                                     */
/* -------------------------------------------------------------------------- */

export interface ParseMermaidTimelineOptions {
  /** Same contract as the other importers: a fixed default keeps parsing a
   * pure function; pass `new Date().toISOString()` if provenance matters
   * more than byte-stable output. */
  timestamp?: string;
}

const DEFAULT_TITLE = "Untitled timeline";

/* -------------------------------------------------------------------------- */
/* Detection                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Whether `source` is a Mermaid timeline. EXACT: the first meaningful word
 * behind any frontmatter is `timeline` or it is not.
 *
 * The word alone is the whole test — Mermaid's `timeline` header takes no
 * direction and no argument, so a first line with anything after the word is
 * not one, and saying so here keeps a detector from recognising a header the
 * parser would then refuse.
 */
export function detectMermaidTimeline(source: string): boolean {
  for (const raw of stripMermaidFrontmatter(source).split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("%%")) continue;
    return line === MERMAID_TIMELINE_HEADER_WORD;
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* The importer                                                                */
/* -------------------------------------------------------------------------- */

/**
 * One `:`-separated cell of a row, carrying the column it started at so an
 * error about an event points at the event rather than at the line.
 */
interface Cell {
  text: string;
  column: number;
}

/**
 * Splits a row on `:` while keeping each cell's 1-based column.
 *
 * A HAND SPLIT rather than `String.split`, because the column is what makes
 * the refusals point somewhere useful — "this period has no events" wants to
 * sit on the period, not on the start of the line.
 */
function cellsOf(line: string, offset: number): Cell[] {
  const cells: Cell[] = [];
  let start = 0;
  for (let i = 0; i <= line.length; i += 1) {
    if (i === line.length || line[i] === MERMAID_TIMELINE_SEPARATOR) {
      cells.push({ text: line.slice(start, i), column: offset + start + 1 });
      start = i + 1;
    }
  }
  return cells;
}

/** A label as arch-lab stores it: Mermaid's escapes undone, `<br/>` decoded. */
const label = (text: string): string =>
  decodeInlineBreaks(unescapeMermaidString(text.trim()));

/**
 * Parses Mermaid `timeline` source into a `TimelineLabFile`. Deterministic:
 * the same source (and options) always yields the same model. Throws
 * `MermaidParseError` with line/column on malformed input, never returning a
 * partial model.
 */
export function parseMermaidTimeline(
  source: string,
  options?: ParseMermaidTimelineOptions,
): TimelineLabFile {
  const timestamp = options?.timestamp ?? MERMAID_IMPORT_TIMESTAMP;

  const periods: TimelinePeriod[] = [];
  const periodByLabel = new Map<string, TimelinePeriod>();
  let openPeriod: TimelinePeriod | null = null;
  let title: string | null = null;
  let seenHeader = false;
  let inFrontmatter = false;
  let frontmatterDone = false;

  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const lineNo = index + 1;
    const raw = lines[index];
    const trimmed = raw.trim();
    const indent = raw.length - raw.trimStart().length;

    if (trimmed === "" || trimmed.startsWith("%%")) continue;

    /* Frontmatter, handled exactly as the other importers handle it: the
       title is read, every other key is dropped, and the fence is skipped
       rather than parsed as diagram. */
    if (!seenHeader && !frontmatterDone) {
      if (trimmed === "---") {
        if (inFrontmatter) {
          inFrontmatter = false;
          frontmatterDone = true;
        } else inFrontmatter = true;
        continue;
      }
      if (inFrontmatter) {
        const match = /^title\s*:\s*(.+)$/.exec(trimmed);
        if (match !== null) title = readMermaidFrontmatterTitle(match[1]);
        continue;
      }
    }

    if (!seenHeader) {
      if (trimmed !== MERMAID_TIMELINE_HEADER_WORD) {
        failAt(
          lineNo,
          indent + 1,
          `expected the Mermaid header word "${MERMAID_TIMELINE_HEADER_WORD}" on its own line`,
          trimmed.slice(0, 40),
        );
      }
      seenHeader = true;
      continue;
    }

    const keyword = /^([A-Za-z][A-Za-z0-9_]*)\b/.exec(trimmed)?.[1];

    if (keyword === "title") {
      /* Mermaid's in-body `title` is bare text to end of line, not a quoted
         string — the same shape `./gantt.ts` reads. It wins over frontmatter
         because it is the spelling a hand-written document uses. */
      title = label(trimmed.slice("title".length));
      continue;
    }
    if (keyword === "accTitle" || keyword === "accDescr") {
      /* Page metadata common to every Mermaid diagram type. Dropped rather
         than refused, and named in the caveat: it says nothing about the
         timeline, so keeping it would mean inventing a model field for it. */
      continue;
    }

    const refusal =
      keyword === undefined
        ? undefined
        : REFUSED_TIMELINE_BY_KEYWORD.get(keyword);
    if (refusal !== undefined) {
      failAt(lineNo, indent + 1, refusal, keyword);
    }

    /* A row beginning `:` continues the period above it — Mermaid's own
       spelling for "more events, same period". */
    if (trimmed.startsWith(MERMAID_TIMELINE_SEPARATOR)) {
      if (openPeriod === null) {
        failAt(
          lineNo,
          indent + 1,
          `this row starts with "${MERMAID_TIMELINE_SEPARATOR}", which adds events to the period above it — but no period has been declared yet. Write the period first, e.g. 2024 : Founded the company.`,
          trimmed.slice(0, 40),
        );
      }
      for (const cell of cellsOf(trimmed.slice(1), indent + 1)) {
        pushEvent(openPeriod, cell);
      }
      continue;
    }

    const cells = cellsOf(trimmed, indent);
    const periodLabel = label(cells[0].text);
    if (periodLabel === "") {
      failAt(
        lineNo,
        cells[0].column,
        "a timeline row opens with the period it describes — this one names none",
        trimmed.slice(0, 40),
      );
    }
    if (cells.length < 2) {
      /* Refused by name: Mermaid draws a period with no events as a bare
         heading, and an arch-lab `period` must hold at least one `event`
         (`archtext/lib/timeline/parse.ts` refuses the empty band). Importing
         it would build a model the `.alab` parser then rejects, which is a
         worse experience than being told here. */
      failAt(
        lineNo,
        cells[0].column,
        `the period "${periodLabel}" lists no events — Mermaid draws it as a bare heading, and an arch-lab timeline has no such thing: a band with nothing in it is a heading rather than a timeline. Write at least one event, e.g. ${periodLabel} : What happened.`,
        trimmed.slice(0, 40),
      );
    }
    const existing = periodByLabel.get(periodLabel);
    if (existing !== undefined) {
      /* Mermaid tolerates the same period label twice and draws two bands;
         arch-lab refuses it, because a period has no id and its heading is
         the only way a reader can name it. Folding the second into the first
         would silently reorder the author's events, so this is a refusal. */
      failAt(
        lineNo,
        cells[0].column,
        `the period "${periodLabel}" is declared twice. An arch-lab period has no id, so its heading is the only way a reader can name it. Use the continuation spelling — a row beginning "${MERMAID_TIMELINE_SEPARATOR}" — to add more events to the first one, or give the second band its own name.`,
        periodLabel,
      );
    }

    const period: TimelinePeriod = { label: periodLabel, events: [] };
    for (const cell of cells.slice(1)) pushEvent(period, cell);
    if (period.events.length === 0) {
      /* Every cell after the period was blank (`2004 :` or `2004 : :`).
         Mermaid draws nothing for those, so this row is the empty-band case
         one spelling further along, and it gets the same refusal rather than
         building a period the `.alab` parser would then reject. */
      failAt(
        lineNo,
        cells[0].column,
        `the period "${periodLabel}" lists no events — every cell after it is empty. An arch-lab timeline has no bare heading: write at least one event, e.g. ${periodLabel} : What happened.`,
        trimmed.slice(0, 40),
      );
    }
    periods.push(period);
    periodByLabel.set(periodLabel, period);
    openPeriod = period;
  }

  if (!seenHeader) {
    failAt(
      1,
      1,
      `this is not a Mermaid timeline — the first meaningful line must be "${MERMAID_TIMELINE_HEADER_WORD}"`,
    );
  }
  if (periods.length === 0) {
    failAt(
      1,
      1,
      "the timeline has no periods — add a row like: 2024 : Founded the company",
    );
  }

  return {
    version: "1.0",
    kind: "timeline",
    metadata: {
      title: title !== null && title !== "" ? title : DEFAULT_TITLE,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    periods,
  };
}

/** One `:` cell as an event. An empty cell is skipped rather than refused:
 * `2004 : Facebook :` is a trailing separator, which Mermaid ignores and
 * which says nothing an author meant. */
function pushEvent(period: TimelinePeriod, cell: Cell): void {
  const text = label(cell.text);
  if (text === "") return;
  const event: TimelineEvent = { label: text };
  period.events.push(event);
}

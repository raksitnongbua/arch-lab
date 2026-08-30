/**
 * Mermaid `gantt` → `GanttLabFile`. The sixth dialect, beside the C4
 * reader in `./parse.ts`, the sequence reader in `./sequence.ts`, the
 * flowchart reader in `./flowchart.ts`, the use-case reader in `./usecase.ts`
 * and the ER reader in `./er.ts`.
 *
 * THE READING HALF OF A TWO-WAY CONVERSION. `./gantt-emit.ts` is the other
 * half and both read one table (`./gantt-mapping.ts`), so what one writes is
 * by construction what the other reads back. The two decisions that made the
 * pair possible — `at-risk` ⇄ `crit` as a bijection, and the computed
 * critical path staying computed and unserialized — are argued in that
 * module's header; this file's job is only to apply them.
 *
 * DETECTION IS EXACT, as it is for `erDiagram` and unlike the flowchart pair:
 * Mermaid has a real `gantt` document type, so `detectMermaidGantt` tests one
 * word behind any frontmatter and there is no convention to infer.
 *
 * The grammar read here, which is Mermaid's own (`ganttDb.parseData`), not a
 * dialect invented for this file:
 *
 *   gantt
 *     title Order store migration
 *     dateFormat YYYY-MM-DD
 *     section Prepare
 *       Schema audit    :done, audit, 2026-09-07, 5d
 *       Shadow writes   :active, shadow, after audit, 13d
 *       Parity          :milestone, parity, after shadow, 0d
 *     section Cut over
 *       Freeze writes   :freeze, 2026-10-01, 2026-10-03
 *       Backfill        :20d
 *
 * The metadata after the colon is a comma-separated list. STATUS TAGS ARE
 * POSITION-FREE and are stripped from anywhere in it (Mermaid's own
 * `getTaskTags` does exactly this), and what remains is read by COUNT, again
 * as Mermaid reads it:
 *
 *   one field    → the length; the row starts when the previous row ends
 *   two fields   → start, then length-or-end
 *   three fields → id, start, then length-or-end
 *
 * A start is a date or `after <id> <id>…`; a length is `30d` / `2w`, and an
 * end may be a date instead.
 *
 * DATES LIVE IN ONE FIELD, WHICH IS THE MODEL'S RULE AND THE REASON THIS
 * IMPORTER HAS TWO PASSES. `GanttLabFile` positions everything in whole
 * days from `origin`, so the earliest date in the chart becomes `origin` and
 * every other date becomes an offset from it — the layout, the router and the
 * exporter never see a calendar. Nothing can be normalised until the earliest
 * date is known, so pass one collects raw dates and pass two resolves them.
 *
 * WHAT IT REFUSES BY NAME rather than approximating: the working-week
 * keywords, `todayMarker`, the axis-granularity keywords, `until`, sub-day
 * durations, and a handful of task shapes that would state something the
 * model cannot mean. Every refusal names the construct it refused, which is
 * what `.claude/rules/new-diagram-type.md` asks of a converter — and what
 * `./flowchart.ts` does for the hexagon, the cylinder and the flag.
 *
 * What is merely LOSSY or NORMALISED is named, in full, by
 * `MERMAID_GANTT_CAVEAT` in the mapping module — the same honesty contract as
 * the other import caveats.
 *
 * Imported by `scripts/mermaid-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import type {
  GanttItem,
  GanttItemState,
  GanttLabFile,
  GanttSection,
} from "@/types";

import { MERMAID_IMPORT_TIMESTAMP } from "./defaults";
import { failAt } from "./errors";
import {
  alabSafeId,
  decodeInlineBreaks,
  readMermaidFrontmatterTitle,
  stripMermaidFrontmatter,
} from "./text";
import {
  DROPPED_GANTT_KEYWORDS,
  GANTT_AFTER_RE,
  GANTT_DATE_FORMAT,
  GANTT_DATE_RE,
  GANTT_DAYS_PER_UNIT,
  GANTT_DURATION_RE,
  GANTT_MILESTONE_TAG,
  GANTT_TAG_BY_STATE,
  GANTT_TASK_TAGS,
  GANTT_UNTIL_RE,
  MERMAID_GANTT_CAVEAT,
  MERMAID_GANTT_HEADER_WORD,
  REFUSED_GANTT_DURATION_UNITS,
  REFUSED_GANTT_KEYWORDS,
  ganttDayOffset,
  isRealGanttDate,
} from "./gantt-mapping";

/* Re-exported from the shared table module, where it sits beside the entries
   it describes — the arrangement `./timeline.ts` already has. Callers import
   it from the dialect they are using, not from the table. */
export { MERMAID_GANTT_CAVEAT };

/* -------------------------------------------------------------------------- */
/* Options                                                                     */
/* -------------------------------------------------------------------------- */

export interface ParseMermaidGanttOptions {
  /** Same contract as the other importers: a fixed default keeps parsing a
   * pure function; pass `new Date().toISOString()` if provenance matters
   * more than byte-stable output. */
  timestamp?: string;
}

const DEFAULT_TITLE = "Untitled gantt";

/* -------------------------------------------------------------------------- */
/* Detection                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Whether `source` is a Mermaid Gantt chart. EXACT: the first meaningful word
 * behind any frontmatter is `gantt` or it is not.
 *
 * The word alone is the whole test — Mermaid's `gantt` header takes no
 * direction and no argument, so a first line with anything after the word is
 * not one, and saying so here keeps a detector from recognising a header the
 * parser would then refuse (the rule `MERMAID_FLOWCHART_HEADER_RE` records).
 */
export function detectMermaidGantt(source: string): boolean {
  for (const raw of stripMermaidFrontmatter(source).split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("%%")) continue;
    return line === MERMAID_GANTT_HEADER_WORD;
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* Parser state                                                                */
/* -------------------------------------------------------------------------- */

/** One comma-separated metadata field, carrying the column it started at so
 * an error about a duration points at the duration rather than at the line. */
interface Field {
  text: string;
  column: number;
}

/**
 * A task as first read, before dates are known.
 *
 * `startDate` and `endDate` stay RAW here: the offset they become depends on
 * the earliest date in the whole document, which the last line of the file
 * can still change (essay in the file header).
 */
interface PendItem {
  id: string;
  label: string;
  milestone: boolean;
  state?: GanttItemState;
  /** Exactly one start form survives parsing: a date, a dependency list, or
   * the previous row's end (already resolved to that row's id). */
  startDate?: string;
  after?: string[];
  duration?: number;
  endDate?: string;
  /** Where the metadata sits, for the second pass's errors. */
  line: number;
  column: number;
}

interface PendSection {
  label: string;
  items: PendItem[];
  line: number;
}

/* -------------------------------------------------------------------------- */
/* The importer                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Parses Mermaid `gantt` source into a `GanttLabFile`. Deterministic: the
 * same source (and options) always yields the same model, ids included.
 * Throws `MermaidParseError` with line/column on malformed input, never
 * returning a partial model.
 */
export function parseMermaidGantt(
  source: string,
  options?: ParseMermaidGanttOptions,
): GanttLabFile {
  const timestamp = options?.timestamp ?? MERMAID_IMPORT_TIMESTAMP;

  const sections: PendSection[] = [];
  const sectionByLabel = new Map<string, PendSection>();
  /* Keyed by the id the AUTHOR wrote, because that is what `after` names;
     the value is the id the model will carry after slug normalisation. */
  const idByGantt = new Map<string, string>();
  const usedIds = new Set<string>();
  const allItems: PendItem[] = [];

  let openSection: PendSection | null = null;
  let title: string | null = null;
  let seenHeader = false;
  let inFrontmatter = false;
  let frontmatterDone = false;
  let frontmatterLine = 0;

  const lines = source.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const lineNo = index + 1;
    const raw = lines[index].endsWith("\r")
      ? lines[index].slice(0, -1)
      : lines[index];
    const startCol = raw.length - raw.trimStart().length + 1;
    const text = raw.trim();
    if (text === "") continue;

    /* ---- YAML frontmatter: only a `---` fence BEFORE the header opens one,
       and only `title` survives — the same rule and the same reason as the
       flowchart importer, whose emitter writes a title that way. */
    if (inFrontmatter) {
      if (text === "---") {
        inFrontmatter = false;
        frontmatterDone = true;
        continue;
      }
      const titled = /^title\s*:\s*(.*)$/.exec(text);
      if (titled !== null) title = readMermaidFrontmatterTitle(titled[1]);
      continue;
    }
    if (!seenHeader && !frontmatterDone && text === "---") {
      inFrontmatter = true;
      frontmatterLine = lineNo;
      continue;
    }

    if (text.startsWith("%%")) continue;

    /* ------------------------------- header ------------------------------ */
    if (!seenHeader) {
      if (text !== MERMAID_GANTT_HEADER_WORD) {
        failAt(
          lineNo,
          startCol,
          `"${text.split(/\s/, 1)[0]}" is not a gantt header — the first line must be "${MERMAID_GANTT_HEADER_WORD}" on its own`,
          text.slice(0, 40),
        );
      }
      seenHeader = true;
      continue;
    }

    /* ----------------------------- statements ---------------------------- */
    /* THE COLON-TAKING SETTINGS GO FIRST, and only these. `accTitle: Q3` and
       `accDescr: …` are the two gantt statements written with a colon rather
       than a space, and the colon is exactly what a task row is introduced by
       — so before they were tested for here they reached the task reader and
       failed with a ":"-shaped error about a row nobody had written.

       Deliberately NOT folded into the general keyword test below by teaching
       it to accept a colon: `section:Prepare` would then open a section
       labelled ":Prepare", and `Backfill:20d` — a real task row — would start
       being read as a setting named Backfill. The colon means "metadata
       follows" everywhere except on these two lines, so these two lines are
       the exception, spelled out. */
    const colonSetting = /^([A-Za-z][A-Za-z0-9_]*)\s*:/.exec(text)?.[1];
    if (
      colonSetting !== undefined &&
      DROPPED_GANTT_KEYWORDS.has(colonSetting)
    ) {
      continue;
    }

    const word = /^[A-Za-z]+/.exec(text)?.[0];
    const keyword =
      word !== undefined && new RegExp(`^${word}(\\s|$)`).test(text)
        ? word
        : undefined;

    if (keyword !== undefined) {
      const refused = REFUSED_GANTT_KEYWORDS.find(
        (candidate) => candidate.keyword === keyword,
      );
      if (refused !== undefined) {
        failAt(
          lineNo,
          startCol,
          `"${refused.keyword}" has no arch-lab gantt equivalent — ${refused.why}`,
          keyword,
        );
      }
      if (DROPPED_GANTT_KEYWORDS.has(keyword)) continue;

      if (keyword === "title") {
        title = decodeInlineBreaks(text.slice(keyword.length).trim());
        continue;
      }
      if (keyword === "dateFormat") {
        readDateFormat(lineNo, startCol, text.slice(keyword.length).trim());
        continue;
      }
      if (keyword === "section") {
        openSection = openGanttSection(
          sections,
          sectionByLabel,
          lineNo,
          startCol,
          text.slice(keyword.length).trim(),
        );
        continue;
      }
    }

    /* Anything else is a task row. */
    const item = readTaskLine(
      text,
      startCol,
      lineNo,
      allItems[allItems.length - 1],
      idByGantt,
      usedIds,
    );
    if (openSection === null) {
      /* Refused rather than filed under an invented band. Mermaid draws a
         section-less task in an unlabelled strip; every arch-lab item lives
         in a NAMED section (the model nests items inside sections, so
         "no section" is unspellable), and a label this importer made up
         would be drawn in the rail as if the author had written it. */
      failAt(
        lineNo,
        startCol,
        `the task ${JSON.stringify(item.label)} comes before the first "section" — every arch-lab gantt row belongs to a named band, so add a "section <name>" line above it`,
        item.label.slice(0, 40),
      );
    }
    openSection.items.push(item);
    allItems.push(item);
  }

  if (inFrontmatter) {
    failAt(
      frontmatterLine,
      1,
      'the frontmatter "---" fence is never closed — expected a second "---" line',
      "---",
    );
  }
  if (!seenHeader) {
    failAt(
      1,
      1,
      `the source is empty — expected "${MERMAID_GANTT_HEADER_WORD}" on the first line`,
    );
  }

  /* ---- pass two: dates → day offsets from the earliest of them ---------- */
  const origin = earliestDate(allItems);
  const knownIds = new Set(allItems.map((item) => item.id));
  const resolved: GanttSection[] = sections
    /* An empty section is dropped rather than kept, the same call the
       flowchart importer makes about an empty subgraph: a band with no rows
       has no drawing, and the `.alab` grammar cannot spell one. */
    .filter((section) => section.items.length > 0)
    .map((section) => ({
      label: section.label,
      items: section.items.map((item) =>
        resolveItem(item, origin, knownIds, idByGantt),
      ),
    }));

  return {
    version: "1.0",
    kind: "gantt",
    metadata: {
      title: title ?? DEFAULT_TITLE,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    ...(origin !== null ? { origin } : {}),
    sections: resolved,
  };
}

/* -------------------------------------------------------------------------- */
/* Header statements                                                           */
/* -------------------------------------------------------------------------- */

/** The `dateFormat` line, which this importer reads only to check it — the
 * one format it accepts is the one `GanttLabFile.origin` speaks (the
 * essay is on `GANTT_DATE_FORMAT`). */
function readDateFormat(line: number, column: number, value: string): void {
  if (value === GANTT_DATE_FORMAT) return;
  failAt(
    line,
    column,
    `dateFormat ${JSON.stringify(value)} is not supported — arch-lab reads ${GANTT_DATE_FORMAT} dates only, because guessing at another token order would import 01/02/2026 as either January or February with nothing on the chart to say which`,
    value,
  );
}

/** `section Prepare` — a named band. The name runs to the end of the line,
 * unquoted, exactly as Mermaid spells it. */
function openGanttSection(
  sections: PendSection[],
  sectionByLabel: Map<string, PendSection>,
  line: number,
  column: number,
  label: string,
): PendSection {
  if (label === "") {
    failAt(
      line,
      column,
      '"section" needs a name — write "section Prepare"',
      "section",
    );
  }
  const existing = sectionByLabel.get(label);
  if (existing !== undefined) {
    /* The `.alab` grammar refuses this too, and for its reason: a section has
       no id, so its heading is the only way a reader can name it, and two
       with one name is one the reader cannot name. Merging them instead
       would move rows across the chart. */
    failAt(
      line,
      column,
      `duplicate section ${JSON.stringify(label)} — already opened on line ${existing.line}, and an arch-lab section is named only by its heading`,
      label.slice(0, 40),
    );
  }
  const section: PendSection = {
    label: decodeInlineBreaks(label),
    items: [],
    line,
  };
  sections.push(section);
  sectionByLabel.set(label, section);
  return section;
}

/* -------------------------------------------------------------------------- */
/* Task lines                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `Schema audit :done, audit, 2026-09-07, 5d` — the text, a colon, then the
 * comma-separated metadata Mermaid reads by count.
 */
function readTaskLine(
  text: string,
  startCol: number,
  line: number,
  previous: PendItem | undefined,
  idByGantt: Map<string, string>,
  usedIds: Set<string>,
): PendItem {
  const colonAt = text.indexOf(":");
  if (colonAt === -1) {
    failAt(
      line,
      startCol,
      'expected a task row ("Label :id, 2026-09-07, 5d"), a "section" line or a gantt setting — a row\'s metadata is introduced by ":"',
      text.slice(0, 40),
    );
  }
  const label = text.slice(0, colonAt).trim();
  if (label === "") {
    failAt(
      line,
      startCol,
      'the task has no text before its ":" — the label is what the rail draws',
      ":",
    );
  }

  const fields = splitFields(text.slice(colonAt + 1), startCol + colonAt + 1);
  const tags = new Set<string>();
  const positional: Field[] = [];
  for (const field of fields) {
    /* Tags are stripped from ANY position, which is Mermaid's own rule and
       not a convenience: `:crit, done, after des1, 5d` is real Mermaid. */
    if (GANTT_TASK_TAGS.has(field.text)) tags.add(field.text);
    else positional.push(field);
  }

  const item: PendItem = {
    id: "",
    label: decodeInlineBreaks(label),
    milestone: tags.has(GANTT_MILESTONE_TAG),
    line,
    column: startCol,
  };
  const state = readState(tags, fields, line, startCol);
  if (state !== undefined) item.state = state;

  if (positional.length === 0 || positional.length > 3) {
    failAt(
      line,
      startCol + colonAt + 1,
      `a task's metadata is one, two or three fields after the status tags (a length; a start and a length; or an id, a start and a length) — this row has ${positional.length}`,
      text.slice(colonAt + 1, colonAt + 41).trim(),
    );
  }

  let ganttId: Field | undefined;
  let start: Field | undefined;
  let end: Field;
  if (positional.length === 3) {
    [ganttId, start, end] = positional;
  } else if (positional.length === 2) {
    [start, end] = positional;
  } else {
    [end] = positional;
  }

  item.id = claimId(ganttId, item.label, line, idByGantt, usedIds);
  readStart(item, start, previous, line, startCol);
  readEnd(item, end);
  return item;
}

/** Splits the metadata on commas, remembering where each field began so an
 * error can point at the offending field rather than at the row. */
function splitFields(meta: string, metaColumn: number): Field[] {
  const fields: Field[] = [];
  let at = 0;
  for (const part of meta.split(",")) {
    const lead = part.length - part.trimStart().length;
    fields.push({ text: part.trim(), column: metaColumn + at + lead });
    at += part.length + 1;
  }
  return fields.filter((field) => field.text !== "");
}

/**
 * The reporting state the status tags name, or `undefined` for the default
 * (`planned`) — which stays ABSENT in the model rather than being written
 * out, the round-trip rule `GanttItemState` documents.
 *
 * MERMAID STACKS TAGS AND ARCH-LAB HAS ONE FIELD, so the two combinations
 * that really occur in hand-written charts each get a decided answer rather
 * than a refusal, and the third stays refused:
 *
 *   - `crit, active` → `at-risk`. Not a conflict at all once `at-risk` is
 *     read for what it says: "in flight AND in trouble" already contains
 *     "in flight", so `active` adds nothing rather than contradicting.
 *   - `crit, done` → `done`, with the loss named in `MERMAID_GANTT_CAVEAT`.
 *     A finished task is no longer at risk, so the alarm is stale and the
 *     fact outranks the status of work that no longer exists. Refusing was
 *     considered and rejected: `crit, done` is common real Mermaid ("the
 *     risky bit, now landed"), and unlike the pair below it has a principled
 *     winner.
 *   - `done, active` → still refused. Neither word outranks the other, so a
 *     winner would have to be invented, and the fix is to delete one of them
 *     — which is why both are quoted back at the author.
 */
function readState(
  tags: ReadonlySet<string>,
  fields: readonly Field[],
  line: number,
  startCol: number,
): GanttItemState | undefined {
  const doneTag = GANTT_TAG_BY_STATE.done;
  const activeTag = GANTT_TAG_BY_STATE.active;
  if (tags.has(doneTag) && tags.has(activeTag)) {
    const at = fields.find((field) => field.text === activeTag);
    failAt(
      line,
      at?.column ?? startCol,
      `a task cannot be both "${doneTag}" and "${activeTag}" — an arch-lab row has one reporting state, so remove one of the two tags`,
      activeTag,
    );
  }
  /* THE PRECEDENCE IS SPELLED IN ARCH-LAB'S VOCABULARY and the Mermaid words
     are looked up, so a tag renamed in the table is renamed here too rather
     than silently ceasing to be recognised. Ordered by which claim survives
     the stack, which is the whole of the rules above: a finished task wins
     over its own stale alarm, and the alarm wins over the fact that the work
     is under way. */
  const precedence: readonly Exclude<GanttItemState, "planned">[] = [
    "done",
    "at-risk",
    "active",
  ];
  for (const state of precedence) {
    if (tags.has(GANTT_TAG_BY_STATE[state])) return state;
  }
  return undefined;
}

/**
 * The model id for this row.
 *
 * An id the author WROTE is kept (slug-normalised), because `after` names it
 * and a reader tracing a dependency should find the word they typed. A row
 * with no id gets one derived from its text — deterministic, so importing the
 * same chart twice yields the same file and a diff between two imports is a
 * real diff (the contract `alabSafeId` states).
 */
function claimId(
  ganttId: Field | undefined,
  label: string,
  line: number,
  idByGantt: Map<string, string>,
  usedIds: Set<string>,
): string {
  if (ganttId === undefined) return alabSafeId(label, usedIds);
  const existing = idByGantt.get(ganttId.text);
  if (existing !== undefined) {
    /* `alabSafeId` would quietly number the second one, and then half the
       `after` lines in the chart would point at the wrong bar. */
    failAt(
      line,
      ganttId.column,
      `duplicate task id "${ganttId.text}" — ids are what "after" refers to, so two rows cannot share one`,
      ganttId.text,
    );
  }
  const id = alabSafeId(ganttId.text, usedIds);
  idByGantt.set(ganttId.text, id);
  return id;
}

/** The start field: a date, `after <id> <id>…`, or — where the metadata gave
 * no start at all — the previous row's end, which this model spells as an
 * explicit dependency on that row. */
function readStart(
  item: PendItem,
  start: Field | undefined,
  previous: PendItem | undefined,
  line: number,
  startCol: number,
): void {
  if (start === undefined) {
    if (previous === undefined) {
      failAt(
        line,
        startCol,
        `${JSON.stringify(item.label)} gives only a length, which in Mermaid means "starts when the previous task ends" — it is the first task in the chart, so there is no previous task to start after`,
        item.label.slice(0, 40),
      );
    }
    /* Mermaid's implicit `prevTaskEnd` becomes an EXPLICIT `after`: the two
       say the same thing, and the explicit one survives an edit that moves
       the row somewhere else in the file. */
    item.after = [previous.id];
    return;
  }

  const after = GANTT_AFTER_RE.exec(start.text);
  if (after !== null) {
    /* Space-separated, not comma-separated: a comma already ended the
       field. Ids are resolved in pass two, once every row is known. */
    item.after = after[1].trim().split(/\s+/);
    return;
  }

  if (GANTT_DATE_RE.test(start.text)) {
    if (!isRealGanttDate(start.text)) {
      failAt(
        line,
        start.column,
        `"${start.text}" is not a day that exists — check the month and the day of the month`,
        start.text,
      );
    }
    item.startDate = start.text;
    return;
  }

  failAt(
    line,
    start.column,
    `"${start.text}" is not a start — expected a ${GANTT_DATE_FORMAT} date or "after <id>"`,
    start.text,
  );
}

/** The end field: a length (`30d`, `2w`), or an end date, which is a length
 * once the start is known. */
function readEnd(item: PendItem, end: Field): void {
  const until = GANTT_UNTIL_RE.exec(end.text);
  if (until !== null) {
    /* The reason is on `GANTT_UNTIL_RE`: this is arithmetic we could do, and
       the answer would be a number the author never wrote and cannot see. */
    failAt(
      item.line,
      end.column,
      `"until" has no arch-lab gantt equivalent — a row carries a length, not an end tied to another row, so give it a duration like 5d`,
      end.text,
    );
  }

  const duration = GANTT_DURATION_RE.exec(end.text);
  if (duration !== null) {
    const unit = duration[2];
    if (REFUSED_GANTT_DURATION_UNITS.has(unit)) {
      failAt(
        item.line,
        end.column,
        `"${end.text}" is shorter than a day, and an arch-lab duration is a whole number of calendar days — rounding it up would draw a bar longer than the task and rounding it down would turn the task into a milestone`,
        end.text,
      );
    }
    const days = GANTT_DAYS_PER_UNIT[unit];
    if (days === undefined) {
      failAt(
        item.line,
        end.column,
        `"${unit}" is not a duration unit — write days (5d) or weeks (2w)`,
        end.text,
      );
    }
    item.duration = Number(duration[1]) * days;
    return;
  }

  if (GANTT_DATE_RE.test(end.text)) {
    if (!isRealGanttDate(end.text)) {
      failAt(
        item.line,
        end.column,
        `"${end.text}" is not a day that exists — check the month and the day of the month`,
        end.text,
      );
    }
    if (item.startDate === undefined) {
      /* An end date only becomes a length when the start is a date too. With
         an `after` start (or the previous row's end) the start is solved by
         the layout, which happens long after parsing — so the length simply
         cannot be worked out here, and inventing one would be worse. */
      failAt(
        item.line,
        end.column,
        `"${end.text}" is an end date on a row whose start is a dependency, so there is no length to compute — give this row a duration like 5d instead`,
        end.text,
      );
    }
    item.endDate = end.text;
    return;
  }

  failAt(
    item.line,
    end.column,
    `"${end.text}" is neither a length (5d, 2w) nor a ${GANTT_DATE_FORMAT} end date`,
    end.text,
  );
}

/* -------------------------------------------------------------------------- */
/* Pass two: dates → offsets, references → ids                                 */
/* -------------------------------------------------------------------------- */

/**
 * The earliest date anywhere in the chart, which becomes day 0.
 *
 * `null` only for a chart with no surviving rows: Mermaid's `gantt` is
 * calendar-based — its first row cannot start `after` anything and cannot
 * inherit a previous row's end — so every importable chart carries at least
 * one date. The origin-less gantt the model allows, whose axis reads `W1,
 * W2, W3`, is reachable by writing `.alab` and not by importing.
 */
function earliestDate(items: readonly PendItem[]): string | null {
  let earliest: string | null = null;
  for (const item of items) {
    /* ISO dates sort as strings, which is the whole reason the model spells
       `origin` this way. */
    if (item.startDate !== undefined) {
      if (earliest === null || item.startDate < earliest) {
        earliest = item.startDate;
      }
    }
  }
  return earliest;
}

/** One pending row as the model holds it: dates normalised to day offsets,
 * `after` resolved to model ids, keys in the order `GANTT_ITEM_KEYS`
 * declares so an imported file reads like a written one. */
function resolveItem(
  item: PendItem,
  origin: string | null,
  knownIds: ReadonlySet<string>,
  idByGantt: ReadonlyMap<string, string>,
): GanttItem {
  const duration = resolveDuration(item);
  const after = item.after?.map((reference) =>
    resolveReference(item, reference, knownIds, idByGantt),
  );

  return {
    id: item.id,
    label: item.label,
    ...(duration !== undefined ? { duration } : {}),
    ...(item.milestone ? { milestone: true as const } : {}),
    ...(item.state !== undefined ? { state: item.state } : {}),
    ...(item.startDate !== undefined && origin !== null
      ? { at: ganttDayOffset(origin, item.startDate) }
      : {}),
    ...(after !== undefined && after.length > 0 ? { after } : {}),
  };
}

/** The row's length in whole calendar days — given, or the gap between two
 * dates — checked against what the SYMBOL can mean. Needs no origin: a gap
 * between two dates is the same number of days wherever day 0 falls. */
function resolveDuration(item: PendItem): number | undefined {
  let days = item.duration;
  if (item.endDate !== undefined && item.startDate !== undefined) {
    days = ganttDayOffset(item.startDate, item.endDate);
  }
  if (days === undefined) return undefined;

  if (days < 0) {
    failAt(
      item.line,
      item.column,
      `${JSON.stringify(item.label)} ends before it starts — check the two dates`,
      item.label.slice(0, 40),
    );
  }
  if (item.milestone) {
    /* A milestone is an INSTANT, and the model refuses to carry a length on
       one — a diamond with a width would be a bar drawn as a diamond. The
       `0d` Mermaid milestones conventionally carry is not an error, it is
       just nothing to keep. */
    if (days > 0) {
      failAt(
        item.line,
        item.column,
        `the milestone ${JSON.stringify(item.label)} has a length of ${days} day${days === 1 ? "" : "s"} — a milestone marks an instant, so drop the milestone tag to draw it as a bar, or give it 0d`,
        item.label.slice(0, 40),
      );
    }
    return undefined;
  }
  if (days === 0) {
    failAt(
      item.line,
      item.column,
      `${JSON.stringify(item.label)} has a length of zero — a zero-length row is a milestone, so add the "${GANTT_MILESTONE_TAG}" tag`,
      item.label.slice(0, 40),
    );
  }
  return days;
}

/** One `after` reference → the model id it names. */
function resolveReference(
  item: PendItem,
  reference: string,
  knownIds: ReadonlySet<string>,
  idByGantt: ReadonlyMap<string, string>,
): string {
  const id = idByGantt.get(reference);
  if (id === undefined || !knownIds.has(id)) {
    /* Refused rather than dropped, for the reason the `.alab` parser refuses
       it: a reference to a row that does not exist is not forward tolerance,
       it is a dependency the layout would have to invent. Rows with no id in
       their metadata are unreachable by `after` in Mermaid too, so this also
       catches a reference to a task's text. */
    failAt(
      item.line,
      item.column,
      `${JSON.stringify(item.label)} starts after "${reference}", which is not a task id in this chart — "after" names the id written in a task's metadata`,
      reference,
    );
  }
  return id;
}

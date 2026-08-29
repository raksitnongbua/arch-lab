/**
 * `.alab` timeline text → `TimelineLabFile`. The eighth sibling, sharing the
 * whole substrate — `LineCursor`, `ArchTextParseError`, the `!` escape reader,
 * `#tag` — so the nine grammars cannot drift apart where they overlap.
 *
 * Line shape (all indentation in spaces, never tabs):
 *
 *   archlab 1.0 timeline
 *   title "How the company grew"
 *
 *   @timeline
 *     period "2024"
 *       event "Founded the company"
 *       event "First ten customers"
 *         desc "Ten teams paying, six of them still customers."
 *     period "2025"
 *       event "Series A" #funding
 *
 * THE DEPTH RULE, the dictionary and gantt parsers' exactly: 0 for header
 * lines and `@timeline`, 2 a period, 4 an event, 6 an event's continuations.
 * Odd indents are an error.
 *
 * AN EVENT LINE IS A QUOTED STRING AND NOTHING ELSE (plus `#tag`s). There is
 * no duration, no `after`, no `at`, no state word and no id — `./keywords.ts`
 * argues each absence, and the short version is that every one of them is the
 * gantt's job. That is what makes this the only grammar in the family with no
 * bare-token slot at all, and therefore the only one whose round trip has no
 * bare/quoted symmetry to preserve.
 *
 * WHAT THE PARSER REFUSES, and what it leaves to a reader's judgement. It
 * refuses an empty period (a band that draws nothing is a heading pretending
 * to be a diagram) and two periods with one label (a period has no id, so its
 * heading is the only way a reader can name it). It does NOT refuse two
 * events with the same label — repetition is a real thing a history contains
 * ("Series A", "Series B", "Series C" is three events; "Raised money" twice
 * is two occasions), and there is no id for a duplicate to break.
 *
 * DOCUMENTS HEADED `archlab 1.0 timeline` USED TO BE GANTTS. The gantt's
 * header word was `timeline` until it was renamed; such a file reaches THIS
 * parser now, and its `@gantt` block fails here with a message naming the
 * gantt rather than a bare syntax error, so an author holding one is sent to
 * the right grammar instead of hunting a typo. `check:timeline` pins that
 * message.
 *
 * Every failure throws `ArchTextParseError` naming a 1-based line and column.
 *
 * Imported by `scripts/timeline-check.mjs` through Node's type stripping: keep
 * the syntax erasable and type-only imports as `import type`.
 */

import type { TimelineLabFile } from "@/types";

import { newerVersionMessage, SUPPORTED_MAJOR_VERSION } from "@/lib/constants";

import { LineCursor } from "../cursor";
import { DEFAULT_TIMESTAMP } from "../defaults";
import { DICT_HEADER_WORD } from "../dict/keywords";
import { ER_HEADER_WORD } from "../er/keywords";
import { failAt } from "../errors";
import { FLOWCHART_HEADER_WORD } from "../flowchart/keywords";
import {
  GANTT_BLOCK,
  GANTT_HEADER_WORD,
  STARTS_KEYWORD,
  TASK_KEYWORD,
} from "../gantt/keywords";
import {
  assemble,
  onceString,
  pick,
  readBangTail,
  readPath,
  readTag,
  segString,
} from "../parse";
import type { Loc, Pend } from "../parse";
import { META_KEYS } from "../schema";
import { SEQUENCE_HEADER_WORD } from "../sequence/keywords";
import { USECASE_HEADER_WORD } from "../usecase/keywords";
import {
  EVENT_KEYWORD,
  PERIOD_KEYWORD,
  RESERVED_TIMELINE_WORDS,
  TIMELINE_BLOCK,
  TIMELINE_HEADER_WORD,
} from "./keywords";
import {
  TIMELINE_EVENT_KEYS,
  TIMELINE_EVENT_RAW,
  TIMELINE_FILE_KEYS,
  TIMELINE_META_RAW,
  TIMELINE_PERIOD_KEYS,
  TIMELINE_PERIOD_RAW,
} from "./schema";

/* -------------------------------------------------------------------------- */
/* Pending structures                                                         */
/* -------------------------------------------------------------------------- */

interface PendEvent extends Loc {
  label: string;
  tags?: string[];
  description?: string;
  raw: Map<string, Pend>;
  unknowns: Pend[];
}

interface PendPeriod extends Loc {
  label: string;
  events: PendEvent[];
  raw: Map<string, Pend>;
  unknowns: Pend[];
}

interface Header {
  version?: string;
  schema?: string;
  title?: string;
  description?: string;
  owner?: string;
  tags?: string[];
  created?: string;
  updated?: string;
  reviewed?: string;
  metaRaw: Map<string, Pend>;
  metaUnknowns: Pend[];
  schemaRaw?: Pend;
  fileUnknowns: Pend[];
}

type Continuable =
  | { kind: "period"; indent: number; item: PendPeriod }
  | { kind: "event"; indent: number; item: PendEvent };

const PERIOD_KEYS_SET: ReadonlySet<string> = new Set(TIMELINE_PERIOD_KEYS);
const EVENT_KEYS_SET: ReadonlySet<string> = new Set(TIMELINE_EVENT_KEYS);

/* -------------------------------------------------------------------------- */
/* The parser                                                                 */
/* -------------------------------------------------------------------------- */

/** Parses `.alab` timeline source. Pure, deterministic, all-or-nothing. */
export function parseTimelineText(source: string): TimelineLabFile {
  const header: Header = {
    metaRaw: new Map(),
    metaUnknowns: [],
    fileUnknowns: [],
  };
  const periods: PendPeriod[] = [];
  const periodByLabel = new Map<string, PendPeriod>();
  let openPeriod: PendPeriod | null = null;
  let bodyOpened = false;
  let seenContent = false;
  let lastItem: Continuable | null = null;

  const lines = source.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const lineNo = index + 1;
    const text = lines[index].endsWith("\r")
      ? lines[index].slice(0, -1)
      : lines[index];
    if (text.trim() === "") continue;

    let indent = 0;
    while (indent < text.length && text.charAt(indent) === " ") indent += 1;
    if (text.charAt(indent) === "\t") {
      failAt(
        lineNo,
        indent + 1,
        "indentation must use spaces, not tabs",
        "\\t",
      );
    }
    if (text.trimStart().startsWith("//")) continue;
    if (indent % 2 !== 0) {
      failAt(
        lineNo,
        indent + 1,
        `inconsistent indentation of ${indent} space${indent === 1 ? "" : "s"} — timeline documents indent 2 spaces per level (0 header, 2 period, 4 event, 6 for a continuation)`,
        text.trim().slice(0, 40),
      );
    }

    const cursor = new LineCursor(text, lineNo, indent);

    /* --------------------------- first content line --------------------- */
    if (!seenContent) {
      seenContent = true;
      if (indent !== 0 || !text.startsWith("archlab ")) {
        failAt(
          lineNo,
          indent + 1,
          `the file must start with an "archlab <version> ${TIMELINE_HEADER_WORD}" line, e.g. archlab 1.0 ${TIMELINE_HEADER_WORD}`,
          text.trim().slice(0, 40),
        );
      }
      cursor.pos += "archlab".length;
      cursor.skipSpaces();
      const versionLoc = { line: lineNo, column: cursor.column };
      const version = cursor.readBare(
        /^\d+\.\d+/,
        'a schema version like "1.0"',
      );
      cursor.skipSpaces();
      if (cursor.atEnd()) {
        failAt(
          lineNo,
          cursor.column,
          `this is a C4 ".alab" header — a timeline must read "archlab ${version} ${TIMELINE_HEADER_WORD}"`,
          text.trim().slice(0, 40),
        );
      }
      const wordLoc = { line: lineNo, column: cursor.column };
      const word = cursor.readBare(/^[a-z]+/, `"${TIMELINE_HEADER_WORD}"`);
      if (word !== TIMELINE_HEADER_WORD) {
        const named: Record<string, string> = {
          [SEQUENCE_HEADER_WORD]: "sequence",
          [FLOWCHART_HEADER_WORD]: "flowchart",
          [USECASE_HEADER_WORD]: "use-case",
          [ER_HEADER_WORD]: "ER",
          [DICT_HEADER_WORD]: "dictionary",
          [GANTT_HEADER_WORD]: "gantt",
        };
        failAt(
          wordLoc.line,
          wordLoc.column,
          named[word] !== undefined
            ? `this is ${named[word] === "ER" ? "an" : "a"} ${named[word]} ".alab" header — a timeline must read "archlab ${version} ${TIMELINE_HEADER_WORD}"`
            : `"${word}" is not a document type — expected "archlab ${version} ${TIMELINE_HEADER_WORD}"`,
          word,
        );
      }
      cursor.expectEnd("the header line");
      if (Number.parseInt(version, 10) > SUPPORTED_MAJOR_VERSION) {
        failAt(
          versionLoc.line,
          versionLoc.column,
          newerVersionMessage(version),
          version,
        );
      }
      header.version = version;
      continue;
    }

    /* ------------------------------- indent 0 --------------------------- */
    if (indent === 0) {
      if (text.startsWith(TIMELINE_BLOCK)) {
        cursor.pos += TIMELINE_BLOCK.length;
        cursor.expectEnd(`the "${TIMELINE_BLOCK}" line`);
        if (bodyOpened) {
          failAt(
            lineNo,
            1,
            `duplicate "${TIMELINE_BLOCK}" — a timeline file holds exactly one timeline`,
            TIMELINE_BLOCK,
          );
        }
        bodyOpened = true;
        lastItem = null;
        continue;
      }
      /* THE RENAMED-GANTT CASE, named rather than reported as a stray header
         line. `archlab 1.0 timeline` used to head a gantt, so a file on
         somebody's disk can carry this header over a `@gantt` block; saying
         "header lines must appear before @timeline" would send its author
         hunting for a typo in a document whose only fault is its age. */
      if (text.startsWith(GANTT_BLOCK)) {
        failAt(
          lineNo,
          1,
          `this is a gantt body ("${GANTT_BLOCK}") under a timeline header — "${TIMELINE_HEADER_WORD}" named the gantt notation before it was renamed. Change the header to "archlab ${header.version ?? "1.0"} ${GANTT_HEADER_WORD}" to keep the plan, or replace the body with "${TIMELINE_BLOCK}" and "${PERIOD_KEYWORD}"/"${EVENT_KEYWORD}" lines to make it a milestone timeline.`,
          GANTT_BLOCK,
        );
      }
      if (bodyOpened) {
        failAt(
          lineNo,
          1,
          `header lines must appear before "${TIMELINE_BLOCK}"`,
          text.trim().slice(0, 40),
        );
      }
      if (cursor.peek() === "!") {
        parseHeaderBang(cursor, header);
        continue;
      }
      parseHeaderLine(cursor, header);
      continue;
    }

    /* ----------------------------- body lines --------------------------- */
    if (!bodyOpened) {
      failAt(
        lineNo,
        indent + 1,
        `this line is indented, but no "${TIMELINE_BLOCK}" block is open above it`,
        text.trim().slice(0, 40),
      );
    }

    /* Continuations bind tighter than block structure. `desc` is the only
       continuation keyword. */
    const firstWord = /^([a-z]+)(\s|$)/.exec(text.slice(indent))?.[1];
    const isContinuation = cursor.peek() === "!" || firstWord === "desc";
    if (lastItem !== null && indent === lastItem.indent + 2 && isContinuation) {
      parseContinuation(cursor, lastItem);
      continue;
    }

    if (openPeriod !== null && indent < 4) openPeriod = null;
    const itemIndent = openPeriod === null ? 2 : 4;
    if (indent !== itemIndent) {
      failAt(
        lineNo,
        indent + 1,
        `inconsistent indentation of ${indent} spaces — expected ${itemIndent} here (2 per level; a period's events are one level deeper than its opener)`,
        text.trim().slice(0, 40),
      );
    }

    lastItem = parseBodyLine(cursor, {
      openPeriod,
      periodByLabel,
      openPeriodBlock: (period) => {
        periods.push(period);
        periodByLabel.set(period.label, period);
        openPeriod = period;
      },
    });
  }

  if (!seenContent || header.version === undefined) {
    failAt(
      1,
      1,
      `the file is empty — expected an "archlab <version> ${TIMELINE_HEADER_WORD}" line`,
    );
  }
  if (!bodyOpened) {
    failAt(
      1,
      1,
      `the file has no "${TIMELINE_BLOCK}" block — add one after the header lines`,
    );
  }

  return resolve(header, periods);
}

/* -------------------------------------------------------------------------- */
/* Header                                                                     */
/* -------------------------------------------------------------------------- */

function parseHeaderLine(cursor: LineCursor, header: Header): void {
  const loc = { line: cursor.line, column: cursor.column };
  const keyword = cursor.readBare(/^[a-z]+/, "a header keyword");
  cursor.skipSpaces();
  switch (keyword) {
    case "archlab":
      cursor.fail(
        'duplicate "archlab" line — the version may only appear on line 1',
      );
      break;
    case "schema":
      onceString(cursor, header.schema, keyword);
      header.schema = cursor.readQuoted("the $schema URL");
      break;
    case "title":
      onceString(cursor, header.title, keyword);
      header.title = cursor.readQuoted("the file title");
      break;
    case "description":
      onceString(cursor, header.description, keyword);
      header.description = cursor.readQuoted("the file description");
      break;
    case "owner":
      onceString(cursor, header.owner, keyword);
      header.owner = cursor.readQuoted("the owner");
      break;
    case "tags": {
      if (header.tags !== undefined) {
        cursor.fail('duplicate "tags" line — it may appear only once');
      }
      const tags: string[] = [];
      while (!cursor.atEnd()) {
        tags.push(readTag(cursor));
        cursor.skipSpaces();
      }
      if (tags.length === 0) cursor.fail('expected at least one "#tag"');
      header.tags = tags;
      break;
    }
    case "created":
    case "updated":
    case "reviewed": {
      const key = keyword;
      onceString(cursor, header[key], keyword);
      header[key] =
        cursor.peek() === '"'
          ? cursor.readQuoted("the timestamp")
          : cursor.readBare(/^[^\s]+/, "an ISO-8601 timestamp");
      break;
    }
    default:
      failAt(
        loc.line,
        loc.column,
        /* `starts` IS NAMED SEPARATELY, and it is the header line a stale
           document is most likely to carry: `timeline` headed the GANTT
           grammar until it was renamed, and `starts` is that grammar's one
           extra header line. Reaching here means the file is almost certainly
           a pre-rename plan, so the message says so rather than listing eight
           keywords the author did not want. */
        keyword === STARTS_KEYWORD
          ? `"${STARTS_KEYWORD}" is a gantt header line, not a timeline one — nothing in a timeline measures, so day 0 has no date to set. "${TIMELINE_HEADER_WORD}" named the gantt notation before it was renamed; if this is a plan, change the header to "archlab ${header.version ?? "1.0"} ${GANTT_HEADER_WORD}".`
          : `"${keyword}" is not a timeline header keyword — expected archlab, schema, title, ` +
              `description, owner, tags, created, updated or reviewed (other metadata rides "! meta.<key> : <json>")`,
        keyword,
      );
  }
  cursor.expectEnd(`the "${keyword}" line`);
}

const META_DEDICATED: Readonly<Record<string, string>> = {
  title: 'the "title" line',
  createdAt: 'the "created" line',
  updatedAt: 'the "updated" line',
};

function parseHeaderBang(cursor: LineCursor, header: Header): void {
  cursor.expect("!", '"!"');
  cursor.skipSpaces();
  const path = readPath(cursor);
  const first = path[0];
  const tail = readBangTail(cursor);
  cursor.expectEnd('the "!" line');

  if (first.value === "meta" && !first.quoted) {
    if (path.length !== 2) {
      failAt(
        first.line,
        first.column,
        'timeline "! meta.…" paths are exactly one key deep — set whole objects, e.g. ! meta.generator : {"name":"…","version":"…"}',
      );
    }
    const second = path[1];
    const key = segString(second, "a metadata field name");
    const dedicated = META_DEDICATED[key];
    if (dedicated !== undefined && !second.quoted) {
      failAt(
        second.line,
        second.column,
        `"${key}" has dedicated syntax — use ${dedicated}`,
      );
    }
    const pend: Pend = {
      key,
      after: tail.after,
      value: tail.value,
      line: second.line,
      column: second.column,
    };
    if (TIMELINE_META_RAW.has(key)) {
      if (header.metaRaw.has(key)) {
        failAt(
          second.line,
          second.column,
          `duplicate "!" line for "meta.${key}"`,
        );
      }
      header.metaRaw.set(key, pend);
    } else if ((META_KEYS as readonly string[]).includes(key)) {
      failAt(
        second.line,
        second.column,
        `"meta.${key}" has dedicated syntax — set it with its header line`,
      );
    } else {
      if (header.metaUnknowns.some((p) => p.key === key)) {
        failAt(
          second.line,
          second.column,
          `duplicate "!" line for "meta.${key}"`,
        );
      }
      header.metaUnknowns.push(pend);
    }
    return;
  }

  if (path.length !== 1) {
    failAt(
      first.line,
      first.column,
      'top-level "!" paths cannot nest — only "! <key> : <json>" and "! meta.<key> : <json>" are valid in a timeline header',
    );
  }
  const key = segString(first, "a field name");
  if (key === "$schema") {
    if (header.schemaRaw !== undefined) {
      failAt(first.line, first.column, 'duplicate "!" line for "$schema"');
    }
    header.schemaRaw = {
      key,
      after: tail.after,
      value: tail.value,
      line: first.line,
      column: first.column,
    };
    return;
  }
  if ((TIMELINE_FILE_KEYS as readonly string[]).includes(key)) {
    failAt(
      first.line,
      first.column,
      `"${key}" has dedicated syntax — it cannot be set with a "!" line`,
    );
  }
  if (header.fileUnknowns.some((p) => p.key === key)) {
    failAt(first.line, first.column, `duplicate "!" line for "${key}"`);
  }
  header.fileUnknowns.push({
    key,
    after: tail.after,
    value: tail.value,
    line: first.line,
    column: first.column,
  });
}

/* -------------------------------------------------------------------------- */
/* Body                                                                       */
/* -------------------------------------------------------------------------- */

interface BodyState {
  openPeriod: PendPeriod | null;
  periodByLabel: Map<string, PendPeriod>;
  openPeriodBlock: (period: PendPeriod) => void;
}

function parseBodyLine(cursor: LineCursor, state: BodyState): Continuable {
  if (cursor.peek() === "!") {
    /* A period's own "!" lines sit at indent 4 and so do its event lines, so a
       "!" that reaches here is one written after the first event — past the
       window where it could still bind to the period. Same shape as the
       dictionary's and the gantt's rule. */
    cursor.fail(
      state.openPeriod !== null
        ? `a period's "!" lines come directly under its "${PERIOD_KEYWORD}" line, before the first event — at this indent, after an event, "!" would be ambiguous between the period and the event`
        : `file-level "!" lines belong in the header, before ${TIMELINE_BLOCK}`,
    );
  }

  const startLoc = { line: cursor.line, column: cursor.column };
  const quotedStart = cursor.peek() === '"';
  const first = quotedStart
    ? cursor.readQuoted(`"${PERIOD_KEYWORD}" or "${EVENT_KEYWORD}"`)
    : cursor.readBare(
        /^[A-Za-z0-9_][A-Za-z0-9_.-]*/,
        `"${PERIOD_KEYWORD}" or "${EVENT_KEYWORD}"`,
      );

  if (!quotedStart && RESERVED_TIMELINE_WORDS.has(first)) {
    switch (first) {
      case PERIOD_KEYWORD:
        return parsePeriodOpener(cursor, startLoc, state);
      case EVENT_KEYWORD:
        return parseEventLine(cursor, startLoc, state);
      default:
        failAt(
          startLoc.line,
          startLoc.column,
          '"desc" is a continuation — indent it 2 spaces under the event it describes',
          "desc",
        );
    }
  }

  failAt(
    startLoc.line,
    startLoc.column,
    state.openPeriod === null
      ? `a timeline body holds "${PERIOD_KEYWORD}" bands — write e.g. ${PERIOD_KEYWORD} "2024"`
      : `an event line starts with "${EVENT_KEYWORD}" — write e.g. ${EVENT_KEYWORD} "Founded the company". A timeline point carries no id, no duration and no dependency; if you need any of those, write a gantt.`,
    first,
  );
}

/**
 * `period "2024"`, with its events nested one level in. NESTING IS THE
 * MEMBERSHIP, the argument `TimelinePeriod` makes: an event belonging to no
 * band is unspellable rather than merely rejected.
 *
 * A period takes nothing but its label — no id, because nothing refers to a
 * period, and no dates, because nothing in this notation measures.
 */
function parsePeriodOpener(
  cursor: LineCursor,
  loc: Loc,
  state: BodyState,
): Continuable {
  if (state.openPeriod !== null) {
    failAt(
      loc.line,
      loc.column,
      `"${PERIOD_KEYWORD}" bands do not nest — close this one by dedenting before opening another`,
      PERIOD_KEYWORD,
    );
  }
  cursor.skipSpaces();
  const labelLoc = { line: cursor.line, column: cursor.column };
  if (cursor.peek() !== '"') {
    cursor.fail(`the "${PERIOD_KEYWORD}" label, in quotes`);
  }
  const label = cursor.readQuoted(`the "${PERIOD_KEYWORD}" label`);
  if (label === "") {
    failAt(
      labelLoc.line,
      labelLoc.column,
      `the "${PERIOD_KEYWORD}" label must not be empty — the heading names the band of events`,
    );
  }
  const existing = state.periodByLabel.get(label);
  if (existing !== undefined) {
    failAt(
      labelLoc.line,
      labelLoc.column,
      `duplicate period ${JSON.stringify(label)} — already declared on line ${existing.line}. A period has no id, so its heading is the only way a reader can name it, and two with one name is one the reader cannot name.`,
      label,
    );
  }
  cursor.expectEnd(`the "${PERIOD_KEYWORD}" line`);

  const period: PendPeriod = {
    ...loc,
    label,
    events: [],
    raw: new Map(),
    unknowns: [],
  };
  state.openPeriodBlock(period);
  return { kind: "period", indent: cursor.text.search(/\S/), item: period };
}

/**
 * `event "Founded the company" #funding`.
 *
 * ONE QUOTED LABEL AND THEN ONLY TAGS. Anything else on the line is refused
 * with the word that would have introduced it, because everything a reader
 * might reach for here — a date, a duration, `after` — is the gantt's
 * vocabulary and the refusal has to say so or the author will try the next
 * spelling.
 */
function parseEventLine(
  cursor: LineCursor,
  loc: Loc,
  state: BodyState,
): Continuable {
  const period = state.openPeriod;
  if (period === null) {
    failAt(
      loc.line,
      loc.column,
      `"${EVENT_KEYWORD}" draws one point, so it belongs inside a "${PERIOD_KEYWORD}" — indent it 2 spaces under one`,
      EVENT_KEYWORD,
    );
  }
  cursor.skipSpaces();
  const labelLoc = { line: cursor.line, column: cursor.column };
  if (cursor.peek() !== '"') {
    /* THE GANTT'S SHAPE IS THE MISTAKE BEING MADE, nine times in ten: a
       `task`/`milestone` line carries an ID before its quoted label, and a
       reader who has just written one reaches for the same shape here. Saying
       only "expected a quoted label" leaves them adding quotes around the id;
       naming the missing id explicitly is what stops the second attempt. */
    cursor.fail(
      `the ${EVENT_KEYWORD} label, in quotes — it is the whole of what an event says, so it is the one thing the line must carry. An event has no id (nothing in a timeline refers to anything), so there is no "${EVENT_KEYWORD} <id> \"Label\"" form: that is the gantt's ${TASK_KEYWORD} line, and a document that needs one wants "archlab 1.0 ${GANTT_HEADER_WORD}".`,
    );
  }
  const label = cursor.readQuoted(`the ${EVENT_KEYWORD} label`);
  if (label === "") {
    failAt(
      labelLoc.line,
      labelLoc.column,
      `the ${EVENT_KEYWORD} label must not be empty — a point with no name is a dot nobody can read`,
    );
  }

  const event: PendEvent = {
    ...loc,
    label,
    raw: new Map(),
    unknowns: [],
  };

  for (;;) {
    cursor.skipSpaces();
    if (cursor.atEnd()) break;
    const attrLoc = { line: cursor.line, column: cursor.column };
    if (cursor.peek() === "#") {
      event.tags = event.tags ?? [];
      event.tags.push(readTag(cursor));
      continue;
    }
    const rest = cursor.text.slice(cursor.pos).trim().slice(0, 40);
    failAt(
      attrLoc.line,
      attrLoc.column,
      `an ${EVENT_KEYWORD} line carries its label and "#tag"s, and nothing else — a timeline point has no duration, no start and no dependency. Write a gantt if the work has a length or waits for something; put anything else in a nested "desc" line.`,
      rest,
    );
  }

  period.events.push(event);
  return { kind: "event", indent: cursor.text.search(/\S/), item: event };
}

/* ----------------------------- continuations ------------------------------ */

function parseContinuation(cursor: LineCursor, target: Continuable): void {
  if (cursor.peek() !== "!") {
    const loc = { line: cursor.line, column: cursor.column };
    const keyword = cursor.readBare(/^[a-z]+/, "a continuation keyword");
    cursor.skipSpaces();
    if (keyword !== "desc") {
      failAt(
        loc.line,
        loc.column,
        `"${keyword}" is not a continuation keyword — "desc" is the only one a timeline has`,
        keyword,
      );
    }
    /* A period has no description in the model, so accepting one here would
       parse a line the serializer cannot write back — the note would vanish on
       the author's next save. */
    if (target.kind !== "event") {
      failAt(
        loc.line,
        loc.column,
        `a "${PERIOD_KEYWORD}" has no description — a band is named by its heading. Put "desc" under an "${EVENT_KEYWORD}".`,
        keyword,
      );
    }
    if (target.item.description !== undefined) {
      failAt(loc.line, loc.column, 'duplicate "desc" line for this event');
    }
    target.item.description = cursor.readQuoted("the event description");
    cursor.expectEnd('the "desc" line');
    return;
  }

  cursor.expect("!", '"!"');
  cursor.skipSpaces();
  const path = readPath(cursor);
  const tail = readBangTail(cursor);
  cursor.expectEnd('the "!" line');
  const first = path[0];
  const what = target.kind === "period" ? "period" : "event";
  if (path.length !== 1) {
    failAt(
      first.line,
      first.column,
      `${what} "!" paths are one key — nothing nests under ${what === "event" ? "an" : "a"} ${what}`,
    );
  }
  const key = segString(first, "a field name");
  const pend: Pend = {
    key,
    after: tail.after,
    value: tail.value,
    line: first.line,
    column: first.column,
  };
  const [rawAllowed, known] =
    target.kind === "period"
      ? ([TIMELINE_PERIOD_RAW, PERIOD_KEYS_SET] as const)
      : ([TIMELINE_EVENT_RAW, EVENT_KEYS_SET] as const);
  if (rawAllowed.has(key)) {
    if (target.item.raw.has(key)) {
      failAt(first.line, first.column, `duplicate "!" line for "${key}"`);
    }
    target.item.raw.set(key, pend);
  } else if (known.has(key)) {
    failAt(
      first.line,
      first.column,
      `"${key}" has dedicated syntax on the ${what} line — it cannot be set with a "!" line`,
    );
  } else {
    if (target.item.unknowns.some((p) => p.key === key)) {
      failAt(first.line, first.column, `duplicate "!" line for "${key}"`);
    }
    target.item.unknowns.push(pend);
  }
}

/* -------------------------------------------------------------------------- */
/* Resolve                                                                    */
/* -------------------------------------------------------------------------- */

function resolve(header: Header, periods: PendPeriod[]): TimelineLabFile {
  if (header.title === undefined) {
    failAt(
      1,
      1,
      'the file has no title — add a line like: title "How the company grew"',
    );
  }

  const metaPairs: (readonly [string, unknown])[] = [];
  const addMeta = (key: string, value: unknown): void => {
    if (value !== undefined) metaPairs.push([key, value]);
  };
  addMeta("title", header.title);
  addMeta(
    "description",
    pick(header.description, header.metaRaw, "description"),
  );
  addMeta("owner", pick(header.owner, header.metaRaw, "owner"));
  addMeta("tags", pick(header.tags, header.metaRaw, "tags"));
  addMeta("createdAt", header.created ?? DEFAULT_TIMESTAMP);
  addMeta("updatedAt", header.updated ?? DEFAULT_TIMESTAMP);
  addMeta(
    "lastReviewedAt",
    pick(header.reviewed, header.metaRaw, "lastReviewedAt"),
  );
  addMeta("tagColors", pick(undefined, header.metaRaw, "tagColors"));
  addMeta("customIcons", pick(undefined, header.metaRaw, "customIcons"));
  addMeta("generator", pick(undefined, header.metaRaw, "generator"));
  const metadata = assemble(metaPairs, header.metaUnknowns);

  const finalPeriods = periods.map((period) => {
    if (period.events.length === 0) {
      failAt(
        period.line,
        period.column,
        `the period ${JSON.stringify(period.label)} holds no events — indent them 2 spaces under it, or remove the period. A band with nothing in it draws a heading and no timeline.`,
        PERIOD_KEYWORD,
      );
    }
    const pairs: (readonly [string, unknown])[] = [["label", period.label]];
    pairs.push([
      "events",
      period.events.map((event) => {
        const eventPairs: (readonly [string, unknown])[] = [
          ["label", event.label],
        ];
        for (const key of ["tags", "description"] as const) {
          const value = pick(event[key], event.raw, key);
          if (value !== undefined) eventPairs.push([key, value]);
        }
        return assemble(eventPairs, event.unknowns);
      }),
    ]);
    return assemble(pairs, period.unknowns);
  });

  const file: Record<string, unknown> = {};
  const schemaValue =
    header.schemaRaw !== undefined
      ? (() => {
          if (header.schema !== undefined) {
            failAt(
              header.schemaRaw.line,
              header.schemaRaw.column,
              '"$schema" is set both by the "schema" line and this "!" line — remove one',
            );
          }
          return header.schemaRaw.value;
        })()
      : header.schema;
  if (schemaValue !== undefined) file.$schema = schemaValue;
  file.version = header.version;
  file.kind = "timeline";
  file.metadata = metadata;
  file.periods = finalPeriods;
  for (const pend of header.fileUnknowns) file[pend.key] = pend.value;
  return file as TimelineLabFile;
}

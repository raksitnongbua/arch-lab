/**
 * `.alab` gantt text → `GanttLabFile`. The seventh sibling, sharing the
 * whole substrate — `LineCursor`, `ArchTextParseError`, the `!` escape reader,
 * `#tag` — so the seven grammars cannot drift apart where they overlap.
 *
 * Line shape (all indentation in spaces, never tabs):
 *
 *   archlab 1.0 gantt
 *   title "Order store migration"
 *   starts 2026-09-07                                ← optional, day 0's date
 *
 *   @gantt
 *     section "Prepare"
 *       task audit "Schema audit" 5d done at 0
 *         desc "Read every column, write down what moves"
 *       task shadow "Shadow writes" 13d active after audit
 *       milestone parity "Parity signed off" after verify #gate
 *     section "Cut over"
 *       task freeze "Freeze writes" 2d after verify
 *
 * THE DEPTH RULE, the dictionary parser's exactly: 0 for header lines and
 * `@gantt`, 2 a section, 4 an item, 6 an item's continuations. Odd indents
 * are an error.
 *
 * EVERYTHING ABOUT AN ITEM IS ON ITS LINE except `desc`, and the reason is in
 * `./keywords.ts`: a duration, a state, a start and a dependency list are each
 * one token, and nesting four one-token values would turn a five-word plan
 * item into six lines. `desc` is the one slot that is genuinely prose, so it
 * is the one slot that nests — the same split every grammar in this family
 * makes. Its length is NOT checked here; the model documents 500 characters
 * and the dictionary parser does not enforce its own prose limits either, so
 * enforcing it here would make one grammar stricter than its siblings for no
 * reason a reader could predict.
 *
 * THE ITEM LINE'S PARTS ARE SELF-IDENTIFYING, which is why the parser does not
 * insist on the canonical order: a digit-led token is a duration, a bare word
 * is either `at`, `after` or a member of a closed state vocabulary, and a
 * `#`-led token is a tag. Nothing on the line is distinguished by POSITION
 * except the id and the label, so refusing a non-canonical order would only
 * reject text no reader could misread. The serializer restores the canonical
 * order on write, which is what `check:gantt` pins.
 *
 * `at` AND `after` TOGETHER ARE REFUSED rather than resolved by precedence —
 * see `./keywords.ts`. A dependency already fixes an item's earliest start, so
 * a line carrying both makes two claims about one number, and picking a winner
 * would draw a start that silently disagrees with a line the author can still
 * see.
 *
 * WHAT THE RESOLVE PASS CHECKS, and what it deliberately leaves alone. It
 * refuses an `after` that names nothing, in the manner of the ER parser
 * refusing a relationship endpoint that resolves to no entity: a reference to
 * an item that does not exist is not forward tolerance, it is a dependency the
 * layout would have to invent. It does NOT look for dependency CYCLES, and it
 * does not compute the critical path. Both are whole-graph properties rather
 * than line-local ones, both want to report every member of the offending
 * cycle rather than one line number, and the float pass in
 * `src/features/gantt/lib/layout.ts` is where the graph is already walked.
 * A parse is a gate on syntax and on references; the validator is the gate on
 * shape.
 *
 * Every failure throws `ArchTextParseError` naming a 1-based line and column.
 *
 * Imported by `scripts/gantt-check.mjs` through Node's type stripping: keep
 * the syntax erasable and type-only imports as `import type`.
 */

import type { GanttItemState, GanttLabFile } from "@/types";

import { newerVersionMessage, SUPPORTED_MAJOR_VERSION } from "@/lib/constants";

import { LineCursor } from "../cursor";
import { DEFAULT_TIMESTAMP } from "../defaults";
import { DICT_HEADER_WORD } from "../dict/keywords";
import { ER_HEADER_WORD } from "../er/keywords";
import { failAt } from "../errors";
import { FLOWCHART_HEADER_WORD } from "../flowchart/keywords";
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
  AFTER_KEYWORD,
  AT_KEYWORD,
  DURATION_PREFIX_RE,
  ITEM_STATE_SET,
  ITEM_STATES,
  MILESTONE_KEYWORD,
  ORIGIN_DATE_RE,
  RESERVED_GANTT_WORDS,
  SECTION_KEYWORD,
  STARTS_KEYWORD,
  STATE_IS_DEFAULT,
  TASK_KEYWORD,
  GANTT_BLOCK,
  GANTT_HEADER_WORD,
} from "./keywords";
import {
  GANTT_FILE_KEYS,
  GANTT_ITEM_KEYS,
  GANTT_ITEM_RAW,
  GANTT_META_RAW,
  GANTT_SECTION_KEYS,
  GANTT_SECTION_RAW,
} from "./schema";

/* -------------------------------------------------------------------------- */
/* Pending structures                                                         */
/* -------------------------------------------------------------------------- */

interface PendItem extends Loc {
  id: string;
  label: string;
  milestone: boolean;
  duration?: number;
  state?: GanttItemState;
  /** Separate from `state`, which is left `undefined` for `planned`: without
   * it a second `state` word on one line would go unnoticed. */
  sawState: boolean;
  at?: number;
  after?: string[];
  /** One per entry of `after`, so an id that resolves to nothing can be
   * pointed at rather than merely named. */
  afterLocs: Loc[];
  tags?: string[];
  description?: string;
  raw: Map<string, Pend>;
  unknowns: Pend[];
}

interface PendSection extends Loc {
  label: string;
  items: PendItem[];
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
  starts?: string;
  created?: string;
  updated?: string;
  reviewed?: string;
  metaRaw: Map<string, Pend>;
  metaUnknowns: Pend[];
  schemaRaw?: Pend;
  fileUnknowns: Pend[];
}

type Continuable =
  | { kind: "section"; indent: number; item: PendSection }
  | { kind: "item"; indent: number; item: PendItem };

const SECTION_KEYS_SET: ReadonlySet<string> = new Set(GANTT_SECTION_KEYS);
const ITEM_KEYS_SET: ReadonlySet<string> = new Set(GANTT_ITEM_KEYS);

/** `"planned", "active", "done" or "at-risk"` — from the one table, so an
 * added state names itself in every error mentioning the vocabulary. */
function stateList(): string {
  const words = ITEM_STATES.map((state) => `"${state}"`);
  return `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
}

/**
 * Whether an ISO date names a day that exists. `ORIGIN_DATE_RE` proves the
 * SHAPE and stops there on purpose; `2026-02-31` and `2026-13-01` both match
 * it and neither is a date. `Date.UTC` normalises rather than refusing — it
 * turns the 31st of February into the 3rd of March — so the only way to catch
 * one is to build the date and read the three fields back out.
 */
function isRealDate(value: string): boolean {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const built = new Date(Date.UTC(year, month - 1, day));
  return (
    built.getUTCFullYear() === year &&
    built.getUTCMonth() === month - 1 &&
    built.getUTCDate() === day
  );
}

/* -------------------------------------------------------------------------- */
/* The parser                                                                 */
/* -------------------------------------------------------------------------- */

/** Parses `.alab` gantt source. Pure, deterministic, all-or-nothing. */
export function parseGanttText(source: string): GanttLabFile {
  const header: Header = {
    metaRaw: new Map(),
    metaUnknowns: [],
    fileUnknowns: [],
  };
  const sections: PendSection[] = [];
  const sectionByLabel = new Map<string, PendSection>();
  /* File-wide, not per-section: `after` crosses sections freely, so an id that
     is unique only within its band would be a reference with two answers. */
  const itemById = new Map<string, PendItem>();
  let openSection: PendSection | null = null;
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
        `inconsistent indentation of ${indent} space${indent === 1 ? "" : "s"} — gantt documents indent 2 spaces per level (0 header, 2 section, 4 task or milestone, 6 for a continuation)`,
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
          `the file must start with an "archlab <version> ${GANTT_HEADER_WORD}" line, e.g. archlab 1.0 ${GANTT_HEADER_WORD}`,
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
          `this is a C4 ".alab" header — a gantt must read "archlab ${version} ${GANTT_HEADER_WORD}"`,
          text.trim().slice(0, 40),
        );
      }
      const wordLoc = { line: lineNo, column: cursor.column };
      const word = cursor.readBare(/^[a-z]+/, `"${GANTT_HEADER_WORD}"`);
      if (word !== GANTT_HEADER_WORD) {
        const named: Record<string, string> = {
          [SEQUENCE_HEADER_WORD]: "sequence",
          [FLOWCHART_HEADER_WORD]: "flowchart",
          [USECASE_HEADER_WORD]: "use-case",
          [ER_HEADER_WORD]: "ER",
          [DICT_HEADER_WORD]: "dictionary",
        };
        failAt(
          wordLoc.line,
          wordLoc.column,
          named[word] !== undefined
            ? `this is ${named[word] === "ER" ? "an" : "a"} ${named[word]} ".alab" header — a gantt must read "archlab ${version} ${GANTT_HEADER_WORD}"`
            : `"${word}" is not a document type — expected "archlab ${version} ${GANTT_HEADER_WORD}"`,
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
      if (text.startsWith(GANTT_BLOCK)) {
        cursor.pos += GANTT_BLOCK.length;
        cursor.expectEnd(`the "${GANTT_BLOCK}" line`);
        if (bodyOpened) {
          failAt(
            lineNo,
            1,
            `duplicate "${GANTT_BLOCK}" — a gantt file holds exactly one gantt`,
            GANTT_BLOCK,
          );
        }
        bodyOpened = true;
        lastItem = null;
        continue;
      }
      if (bodyOpened) {
        failAt(
          lineNo,
          1,
          `header lines must appear before "${GANTT_BLOCK}"`,
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
        `this line is indented, but no "${GANTT_BLOCK}" block is open above it`,
        text.trim().slice(0, 40),
      );
    }

    /* Continuations bind tighter than block structure. `desc` is the only
       continuation keyword, so unlike the dictionary there is no table to
       drive this from. */
    const firstWord = /^([a-z]+)(\s|$)/.exec(text.slice(indent))?.[1];
    const isContinuation = cursor.peek() === "!" || firstWord === "desc";
    if (lastItem !== null && indent === lastItem.indent + 2 && isContinuation) {
      parseContinuation(cursor, lastItem);
      continue;
    }

    if (openSection !== null && indent < 4) openSection = null;
    const itemIndent = openSection === null ? 2 : 4;
    if (indent !== itemIndent) {
      failAt(
        lineNo,
        indent + 1,
        `inconsistent indentation of ${indent} spaces — expected ${itemIndent} here (2 per level; a section's rows are one level deeper than its opener)`,
        text.trim().slice(0, 40),
      );
    }

    lastItem = parseBodyLine(cursor, {
      openSection,
      sectionByLabel,
      itemById,
      openSectionBlock: (section) => {
        sections.push(section);
        sectionByLabel.set(section.label, section);
        openSection = section;
      },
    });
  }

  if (!seenContent || header.version === undefined) {
    failAt(
      1,
      1,
      `the file is empty — expected an "archlab <version> ${GANTT_HEADER_WORD}" line`,
    );
  }
  if (!bodyOpened) {
    failAt(
      1,
      1,
      `the file has no "${GANTT_BLOCK}" block — add one after the header lines`,
    );
  }

  return resolve(header, sections, itemById);
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
    /* The one header line no other grammar has. It is a FILE field
       (`origin`), not metadata, because it changes what the axis draws — the
       model's rule that dates live in exactly one field is what makes
       absolute and relative one notation rather than two. */
    case STARTS_KEYWORD: {
      onceString(cursor, header.starts, keyword);
      const valueLoc = { line: cursor.line, column: cursor.column };
      const value =
        cursor.peek() === '"'
          ? cursor.readQuoted("the origin date")
          : cursor.readBare(/^[^\s]+/, `a date like "2026-09-07"`);
      if (!ORIGIN_DATE_RE.test(value)) {
        failAt(
          valueLoc.line,
          valueLoc.column,
          `"${value}" is not a calendar date — "${STARTS_KEYWORD}" takes YYYY-MM-DD, with no time and no timezone, because a plan measured in whole days has neither`,
          value,
        );
      }
      if (!isRealDate(value)) {
        failAt(
          valueLoc.line,
          valueLoc.column,
          `"${value}" is not a day that exists — check the month and the day of the month`,
          value,
        );
      }
      header.starts = value;
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
        `"${keyword}" is not a gantt header keyword — expected archlab, schema, title, ` +
          `description, owner, tags, ${STARTS_KEYWORD}, created, updated or reviewed (other metadata rides "! meta.<key> : <json>")`,
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
        'gantt "! meta.…" paths are exactly one key deep — set whole objects, e.g. ! meta.generator : {"name":"…","version":"…"}',
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
    if (GANTT_META_RAW.has(key)) {
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
      'top-level "!" paths cannot nest — only "! <key> : <json>" and "! meta.<key> : <json>" are valid in a gantt header',
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
  /* `origin` is in this list, so `! origin : "2026-09-07"` is refused by name
     and points at the `starts` line — one spelling of the calendar, or the
     round trip has two. */
  if ((GANTT_FILE_KEYS as readonly string[]).includes(key)) {
    failAt(
      first.line,
      first.column,
      key === "origin"
        ? `"origin" has dedicated syntax — set it with the "${STARTS_KEYWORD}" header line`
        : `"${key}" has dedicated syntax — it cannot be set with a "!" line`,
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
  openSection: PendSection | null;
  sectionByLabel: Map<string, PendSection>;
  itemById: Map<string, PendItem>;
  openSectionBlock: (section: PendSection) => void;
}

function parseBodyLine(cursor: LineCursor, state: BodyState): Continuable {
  if (cursor.peek() === "!") {
    /* A section's own "!" lines sit at indent 4 and so do its item lines, so a
       "!" that reaches here is one written after the first item — past the
       window where it could still bind to the section. Same shape as the
       dictionary's rule for a section `desc`. */
    cursor.fail(
      state.openSection !== null
        ? `a section's "!" lines come directly under its "${SECTION_KEYWORD}" line, before the first row — at this indent, after a row, "!" would be ambiguous between the section and the row`
        : `file-level "!" lines belong in the header, before ${GANTT_BLOCK}`,
    );
  }

  const startLoc = { line: cursor.line, column: cursor.column };
  const quotedStart = cursor.peek() === '"';
  const first = quotedStart
    ? cursor.readQuoted(
        `"${SECTION_KEYWORD}", "${TASK_KEYWORD}" or "${MILESTONE_KEYWORD}"`,
      )
    : cursor.readBare(
        /^[A-Za-z0-9_][A-Za-z0-9_.-]*/,
        `"${SECTION_KEYWORD}", "${TASK_KEYWORD}" or "${MILESTONE_KEYWORD}"`,
      );

  if (!quotedStart && RESERVED_GANTT_WORDS.has(first)) {
    switch (first) {
      case SECTION_KEYWORD:
        return parseSectionOpener(cursor, startLoc, state);
      case TASK_KEYWORD:
        return parseItemLine(cursor, startLoc, state, false);
      case MILESTONE_KEYWORD:
        return parseItemLine(cursor, startLoc, state, true);
      case "desc":
        failAt(
          startLoc.line,
          startLoc.column,
          '"desc" is a continuation — indent it 2 spaces under the task or milestone it describes',
          "desc",
        );
        break;
      default:
        failAt(
          startLoc.line,
          startLoc.column,
          `"${first}" belongs on an item line, not at the start of one — write e.g. ${TASK_KEYWORD} <id> "Label" 3d ${first} …`,
          first,
        );
    }
  }

  failAt(
    startLoc.line,
    startLoc.column,
    state.openSection === null
      ? `a gantt body holds "${SECTION_KEYWORD}" bands — write e.g. ${SECTION_KEYWORD} "Prepare"`
      : `a row starts with "${TASK_KEYWORD}" or "${MILESTONE_KEYWORD}" — write e.g. ${TASK_KEYWORD} ${first} "Label" 3d`,
    first,
  );
}

/**
 * `section "Prepare"`, with its rows nested one level in. NESTING IS THE
 * MEMBERSHIP, the argument `GanttSection` makes: an item belonging to no
 * band is unspellable rather than merely rejected.
 *
 * A section takes nothing but its label — no id, because nothing refers to a
 * section, and no tags, because the model has nowhere to keep them and a field
 * the serializer cannot write back is a field that silently disappears on
 * save.
 */
function parseSectionOpener(
  cursor: LineCursor,
  loc: Loc,
  state: BodyState,
): Continuable {
  if (state.openSection !== null) {
    failAt(
      loc.line,
      loc.column,
      `"${SECTION_KEYWORD}" bands do not nest — close this one by dedenting before opening another`,
      SECTION_KEYWORD,
    );
  }
  cursor.skipSpaces();
  const labelLoc = { line: cursor.line, column: cursor.column };
  if (cursor.peek() !== '"') {
    cursor.fail(`the "${SECTION_KEYWORD}" label, in quotes`);
  }
  const label = cursor.readQuoted(`the "${SECTION_KEYWORD}" label`);
  if (label === "") {
    failAt(
      labelLoc.line,
      labelLoc.column,
      `the "${SECTION_KEYWORD}" label must not be empty — the heading names the band of rows`,
    );
  }
  const existing = state.sectionByLabel.get(label);
  if (existing !== undefined) {
    failAt(
      labelLoc.line,
      labelLoc.column,
      `duplicate section ${JSON.stringify(label)} — already declared on line ${existing.line}. A section has no id, so its heading is the only way a reader can name it, and two with one name is one the reader cannot name.`,
      label,
    );
  }
  cursor.expectEnd(`the "${SECTION_KEYWORD}" line`);

  const section: PendSection = {
    ...loc,
    label,
    items: [],
    raw: new Map(),
    unknowns: [],
  };
  state.openSectionBlock(section);
  return { kind: "section", indent: cursor.text.search(/\S/), item: section };
}

/**
 * `task audit "Schema audit" 5d done at 0 #tag`, or the same line opened with
 * `milestone` and carrying no duration.
 *
 * Id and label are positional; everything after them identifies itself, so the
 * tail is read as an unordered bag with a one-of-each rule (see the file
 * header). Each part carries the location of its own token, because "the
 * duration is wrong" is only useful when it points at the duration.
 */
function parseItemLine(
  cursor: LineCursor,
  loc: Loc,
  state: BodyState,
  milestone: boolean,
): Continuable {
  const keyword = milestone ? MILESTONE_KEYWORD : TASK_KEYWORD;
  const section = state.openSection;
  if (section === null) {
    failAt(
      loc.line,
      loc.column,
      `"${keyword}" draws one row, so it belongs inside a "${SECTION_KEYWORD}" — indent it 2 spaces under one`,
      keyword,
    );
  }
  cursor.skipSpaces();
  const idLoc = { line: cursor.line, column: cursor.column };
  const quotedId = cursor.peek() === '"';
  const id = cursor.readIdToken(`the ${keyword} id`);
  if (!quotedId && RESERVED_GANTT_WORDS.has(id)) {
    failAt(
      idLoc.line,
      idLoc.column,
      `"${id}" is reserved — quote it (${JSON.stringify(id)}) to use it as an id`,
      id,
    );
  }
  const duplicate = state.itemById.get(id);
  if (duplicate !== undefined) {
    failAt(
      idLoc.line,
      idLoc.column,
      `duplicate id "${id}" — already declared on line ${duplicate.line}. Ids are unique across the whole file because "${AFTER_KEYWORD}" crosses sections.`,
      id,
    );
  }

  cursor.skipSpaces();
  const labelLoc = { line: cursor.line, column: cursor.column };
  if (cursor.peek() !== '"') {
    cursor.fail(
      `the ${keyword} label, in quotes — the rail draws it, and "${id}" is what "${AFTER_KEYWORD}" refers to`,
    );
  }
  const label = cursor.readQuoted(`the ${keyword} label`);
  if (label === "") {
    failAt(
      labelLoc.line,
      labelLoc.column,
      `the ${keyword} label must not be empty — a row with no name is a bar nobody can read`,
    );
  }

  const item: PendItem = {
    ...loc,
    id,
    label,
    milestone,
    sawState: false,
    afterLocs: [],
    raw: new Map(),
    unknowns: [],
  };

  for (;;) {
    cursor.skipSpaces();
    if (cursor.atEnd()) break;
    const attrLoc = { line: cursor.line, column: cursor.column };

    if (cursor.peek() === "#") {
      item.tags = item.tags ?? [];
      item.tags.push(readTag(cursor));
      continue;
    }

    if (/^\d/.test(cursor.peek())) {
      readDuration(cursor, item, attrLoc);
      continue;
    }

    const word = cursor.readBare(
      /^[a-z-]+/,
      `a duration like 5d, a state word, "${AT_KEYWORD}", "${AFTER_KEYWORD}" or a "#tag"`,
    );
    if (word === AT_KEYWORD) {
      readAt(cursor, item, attrLoc);
      continue;
    }
    if (word === AFTER_KEYWORD) {
      readAfter(cursor, item, attrLoc);
      continue;
    }
    if (ITEM_STATE_SET.has(word)) {
      if (item.sawState) {
        failAt(
          attrLoc.line,
          attrLoc.column,
          `"${id}" carries two state words — a row is drawn in one colour`,
          word,
        );
      }
      item.sawState = true;
      /* `planned` normalises to absence, so a model never distinguishes the
         word from its own default and the serializer never has to decide
         whether to write it back. `STATE_IS_DEFAULT` is the one constant both
         directions read. */
      if (word !== STATE_IS_DEFAULT) item.state = word as GanttItemState;
      continue;
    }
    failAt(
      attrLoc.line,
      attrLoc.column,
      `"${word}" is not part of an item line — the state vocabulary is closed (${stateList()}), and the only other words here are "${AT_KEYWORD}" and "${AFTER_KEYWORD}"`,
      word,
    );
  }
  cursor.expectEnd(`the "${keyword}" line`);

  if (!milestone && item.duration === undefined) {
    failAt(
      loc.line,
      loc.column,
      `"${id}" has no duration — a ${TASK_KEYWORD} is drawn as a bar on a measured axis, so it needs a length (e.g. 5d). An instant is a "${MILESTONE_KEYWORD}".`,
      keyword,
    );
  }

  section.items.push(item);
  state.itemById.set(id, item);
  return { kind: "item", indent: cursor.text.search(/\S/), item };
}

/** `5d` — whole calendar days, `d` suffix required (see `DURATION_RE`). */
function readDuration(cursor: LineCursor, item: PendItem, loc: Loc): void {
  const match = DURATION_PREFIX_RE.exec(cursor.text.slice(cursor.pos));
  if (match === null) {
    failAt(
      loc.line,
      loc.column,
      `expected a duration in whole days with a "d" suffix, like 5d — leading zeroes are refused so one length has one spelling`,
      cursor.foundHere(),
    );
  }
  cursor.pos += match[0].length;
  const next = cursor.peek();
  if (next !== "" && next !== " ") {
    failAt(
      loc.line,
      loc.column,
      `expected a duration in whole days with a "d" suffix, like 5d`,
      cursor.text
        .slice(loc.column - 1)
        .trimEnd()
        .slice(0, 40),
    );
  }
  const days = Number(match[1]);
  if (days === 0) {
    failAt(
      loc.line,
      loc.column,
      `a zero-day task is an instant, and an instant is a "${MILESTONE_KEYWORD}" — open the line with "${MILESTONE_KEYWORD}" and drop the "0d". The diamond is the point: a bar of no length is a bar nobody can see.`,
      match[0],
    );
  }
  /* Refused where the duration is READ rather than at the end of the line, so
     the error points at the token that has to go rather than at the keyword
     that is probably right. */
  if (item.milestone) {
    failAt(
      loc.line,
      loc.column,
      `a "${MILESTONE_KEYWORD}" marks an instant, so it takes no duration — remove "${match[0]}", or open the line with "${TASK_KEYWORD}"`,
      match[0],
    );
  }
  if (item.duration !== undefined) {
    failAt(
      loc.line,
      loc.column,
      `"${item.id}" carries two durations — a row has one length`,
      match[0],
    );
  }
  item.duration = days;
}

/** `at 0` — an explicit start, in whole days from the document origin. */
function readAt(cursor: LineCursor, item: PendItem, loc: Loc): void {
  if (item.at !== undefined) {
    failAt(
      loc.line,
      loc.column,
      `"${item.id}" carries two "${AT_KEYWORD}" clauses — a row has one start`,
      AT_KEYWORD,
    );
  }
  if (item.after !== undefined) failAtBothStarts(item, loc);
  cursor.skipSpaces();
  const valueLoc = { line: cursor.line, column: cursor.column };
  /* Non-negative, and leading zeroes refused for the reason `DURATION_RE`
     refuses them: `007` and `7` would be two spellings of one day. A negative
     start would place a row before day 0, which would make the origin not the
     origin and leave the axis with nowhere to draw it. */
  const raw = cursor.readBare(
    /^(0|[1-9]\d*)/,
    `the day "${AT_KEYWORD}" starts on — a whole number of days from the origin, counting from 0`,
  );
  const next = cursor.peek();
  if (next !== "" && next !== " ") {
    failAt(
      valueLoc.line,
      valueLoc.column,
      `"${AT_KEYWORD}" takes a whole number of days from the origin, counting from 0`,
      cursor.text
        .slice(valueLoc.column - 1)
        .trimEnd()
        .slice(0, 40),
    );
  }
  item.at = Number(raw);
}

/** `after audit, shadow` — the dependency list, in the author's order. */
function readAfter(cursor: LineCursor, item: PendItem, loc: Loc): void {
  if (item.after !== undefined) {
    failAt(
      loc.line,
      loc.column,
      `"${item.id}" carries two "${AFTER_KEYWORD}" clauses — list every dependency on one, e.g. ${AFTER_KEYWORD} audit, shadow`,
      AFTER_KEYWORD,
    );
  }
  if (item.at !== undefined) failAtBothStarts(item, loc);
  const ids: string[] = [];
  for (;;) {
    cursor.skipSpaces();
    const depLoc = { line: cursor.line, column: cursor.column };
    const quoted = cursor.peek() === '"';
    const dep = cursor.readIdToken(`an item id after "${AFTER_KEYWORD}"`);
    if (!quoted && RESERVED_GANTT_WORDS.has(dep)) {
      failAt(
        depLoc.line,
        depLoc.column,
        `"${dep}" is reserved — quote it (${JSON.stringify(dep)}) to name the item called that`,
        dep,
      );
    }
    if (dep === item.id) {
      failAt(
        depLoc.line,
        depLoc.column,
        `"${dep}" waits for itself — an item cannot be its own dependency, and nothing downstream of it could ever start`,
        dep,
      );
    }
    if (ids.includes(dep)) {
      failAt(
        depLoc.line,
        depLoc.column,
        `"${dep}" is listed twice in this "${AFTER_KEYWORD}" clause — a dependency is waited for once`,
        dep,
      );
    }
    ids.push(dep);
    item.afterLocs.push(depLoc);
    cursor.skipSpaces();
    if (!cursor.eat(",")) break;
  }
  item.after = ids;
}

/** The one refusal both start clauses share, worded once (see
 * `./keywords.ts` for the reasoning it carries). */
function failAtBothStarts(item: PendItem, loc: Loc): never {
  return failAt(
    loc.line,
    loc.column,
    `"${item.id}" sets its start twice — "${AFTER_KEYWORD}" already fixes the earliest day it can begin, so an "${AT_KEYWORD}" beside it makes two claims about one number. Drop one; picking a winner here would draw a start that disagrees with a line you can still see.`,
  );
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
        `"${keyword}" is not a continuation keyword — "desc" is the only one a gantt has`,
        keyword,
      );
    }
    /* A section has no description in the model, so accepting one here would
       parse a line the serializer cannot write back — the note would vanish on
       the author's next save. */
    if (target.kind !== "item") {
      failAt(
        loc.line,
        loc.column,
        `a "${SECTION_KEYWORD}" has no description — a band is named by its heading. Put "desc" under a "${TASK_KEYWORD}" or "${MILESTONE_KEYWORD}".`,
        keyword,
      );
    }
    if (target.item.description !== undefined) {
      failAt(loc.line, loc.column, 'duplicate "desc" line for this row');
    }
    target.item.description = cursor.readQuoted("the row description");
    cursor.expectEnd('the "desc" line');
    return;
  }

  cursor.expect("!", '"!"');
  cursor.skipSpaces();
  const path = readPath(cursor);
  const tail = readBangTail(cursor);
  cursor.expectEnd('the "!" line');
  const first = path[0];
  const what = target.kind === "section" ? "section" : "row";
  if (path.length !== 1) {
    failAt(
      first.line,
      first.column,
      `${what} "!" paths are one key — nothing nests under a ${what}`,
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
    target.kind === "section"
      ? ([GANTT_SECTION_RAW, SECTION_KEYS_SET] as const)
      : ([GANTT_ITEM_RAW, ITEM_KEYS_SET] as const);
  if (rawAllowed.has(key)) {
    if (target.item.raw.has(key)) {
      failAt(first.line, first.column, `duplicate "!" line for "${key}"`);
    }
    target.item.raw.set(key, pend);
  } else if (known.has(key)) {
    failAt(
      first.line,
      first.column,
      key === "milestone"
        ? `"milestone" is spelled by the keyword that opens the line, not by a value — write "${MILESTONE_KEYWORD}" instead of "${TASK_KEYWORD}"`
        : `"${key}" has dedicated syntax on the ${what} line — it cannot be set with a "!" line`,
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

function resolve(
  header: Header,
  sections: PendSection[],
  itemById: Map<string, PendItem>,
): GanttLabFile {
  if (header.title === undefined) {
    failAt(
      1,
      1,
      'the file has no title — add a line like: title "Order store migration"',
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

  /* Resolved here rather than as each line is read, so a dependency may name
     an item declared further down. Declaration order is the author's
     narration and the row solve reorders it anyway
     (`src/features/gantt/lib/layout.ts`), so demanding that a dependency
     be written first would impose an order the diagram does not have. */
  for (const item of itemById.values()) {
    if (item.after === undefined) continue;
    item.after.forEach((dep, index) => {
      if (itemById.has(dep)) return;
      const at = item.afterLocs[index];
      failAt(
        at.line,
        at.column,
        `"${item.id}" waits for "${dep}", which is not an id in this file — declare it as a "${TASK_KEYWORD}" or "${MILESTONE_KEYWORD}", or fix the spelling`,
        dep,
      );
    });
  }

  const finalSections = sections.map((section) => {
    if (section.items.length === 0) {
      failAt(
        section.line,
        section.column,
        `the section ${JSON.stringify(section.label)} draws no rows — indent them 2 spaces under it, or remove the section`,
        SECTION_KEYWORD,
      );
    }
    const pairs: (readonly [string, unknown])[] = [["label", section.label]];
    pairs.push([
      "items",
      section.items.map((item) => {
        const itemPairs: (readonly [string, unknown])[] = [
          ["id", item.id],
          ["label", item.label],
        ];
        if (item.duration !== undefined) {
          itemPairs.push(["duration", item.duration]);
        }
        if (item.milestone) itemPairs.push(["milestone", true]);
        if (item.state !== undefined) itemPairs.push(["state", item.state]);
        if (item.at !== undefined) itemPairs.push(["at", item.at]);
        if (item.after !== undefined) itemPairs.push(["after", item.after]);
        for (const key of ["tags", "description"] as const) {
          const value = pick(item[key], item.raw, key);
          if (value !== undefined) itemPairs.push([key, value]);
        }
        return assemble(itemPairs, item.unknowns);
      }),
    ]);
    return assemble(pairs, section.unknowns);
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
  file.kind = "gantt";
  file.metadata = metadata;
  if (header.starts !== undefined) file.origin = header.starts;
  file.sections = finalSections;
  for (const pend of header.fileUnknowns) file[pend.key] = pend.value;
  return file as GanttLabFile;
}

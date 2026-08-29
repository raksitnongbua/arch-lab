/**
 * `.alab` lifecycle text → `LifecycleLabFile`. The ninth sibling, sharing the
 * whole substrate — `LineCursor`, `ArchTextParseError`, the `!` escape reader,
 * `#tag` — so the nine grammars cannot drift apart where they overlap.
 *
 * Line shape (all indentation in spaces, never tabs):
 *
 *   archlab 1.0 lifecycle
 *   title "An order, end to end"
 *
 *   @lifecycle
 *     subject "Order"
 *       desc "One customer order, from checkout to the doormat."
 *     state placed "Placed"
 *       desc "Checkout finished. Nothing has been charged."
 *       exit "Cancelled" ends
 *         when "the customer changes their mind before paying"
 *     state paid "Paid"
 *     state shipped "Shipped"
 *       exit "Returned" rejoins paid
 *         when "the parcel comes back unopened"
 *     state delivered "Delivered" ends
 *
 * THE DEPTH RULE: 0 for header lines and `@lifecycle`, 2 the subject and each
 * state, 4 a state's continuations AND its exits, 6 an exit's continuations.
 * Odd indents are an error. Continuations bind tighter than block structure,
 * which is what lets `desc` and `exit` share indent 4 without ambiguity: a
 * continuation keyword one level under the last declaration belongs to it, and
 * `exit` is not a continuation keyword.
 *
 * ── WHAT THIS PARSER REFUSES, AND WHY THE REFUSALS ARE THE NOTATION ───────
 *
 * A lifecycle is ONE KEYWORD away from being a worse flowchart at all times
 * (`src/types/lifecycle.ts` records that the overlap was waived rather than
 * argued away). Every refusal below exists to keep the grammar unable to
 * express an arbitrary graph, and each NAMES THE FLOWCHART rather than saying
 * "not valid here" — a reader told the second tries another spelling, and a
 * reader told the first stops:
 *
 *   - NO EDGE BETWEEN TWO STATES. `to`, `next`, `then`, `goes`, `after` are
 *     all refused by name on a state line. The main track is consecutive
 *     declaration order; one edge keyword and an author can skip a state,
 *     and a set of arbitrary state-to-state edges IS the flowchart.
 *   - NO FORWARD REJOIN. `rejoins` must name a state declared STRICTLY
 *     EARLIER. Forward is a shortcut along the spine — the same arbitrary
 *     edge under a different keyword — and the refusal says so.
 *   - NO EXIT OFF AN EXIT. Branch depth is one; a tree of alternatives is a
 *     decision graph, which is what the flowchart draws with guards.
 *   - NO SELF-REJOIN. An exit that rejoins the state it left draws a loop
 *     that says the subject went nowhere.
 *   - NO SECOND SUBJECT, and no state before the subject: a lifecycle is one
 *     thing moving, and the states are states OF something.
 *
 * IT DOES NOT REFUSE two states with the same LABEL — only the same id.
 * "Pending" twice with different ids is a real document (pending review,
 * pending dispatch), and the id is the only thing anything points at.
 *
 * NOR DOES IT REFUSE an exit with no `when`, or a document that never ends,
 * or states after a final one. Every one of those is a document that PARSES
 * and is still wrong, which is exactly the class `validate_lifecycle`
 * reports — a parser that refused them would make the first draft of every
 * document an error.
 *
 * Every failure throws `ArchTextParseError` naming a 1-based line and column.
 *
 * Imported by `scripts/lifecycle-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import type { LifecycleLabFile } from "@/types";

import { newerVersionMessage, SUPPORTED_MAJOR_VERSION } from "@/lib/constants";

import { LineCursor } from "../cursor";
import { DEFAULT_TIMESTAMP } from "../defaults";
import { DICT_HEADER_WORD } from "../dict/keywords";
import { ER_HEADER_WORD } from "../er/keywords";
import { failAt } from "../errors";
import { FLOWCHART_HEADER_WORD } from "../flowchart/keywords";
import { GANTT_HEADER_WORD } from "../gantt/keywords";
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
import { TIMELINE_HEADER_WORD } from "../timeline/keywords";
import { USECASE_HEADER_WORD } from "../usecase/keywords";
import {
  ENDS_KEYWORD,
  EXIT_KEYWORD,
  GANTT_STATE_WORDS,
  LIFECYCLE_BLOCK,
  LIFECYCLE_HEADER_WORD,
  REFUSED_EDGE_WORDS,
  REJOINS_KEYWORD,
  RESERVED_LIFECYCLE_WORDS,
  STATE_KEYWORD,
  SUBJECT_KEYWORD,
  WHEN_KEYWORD,
} from "./keywords";
import {
  LIFECYCLE_EXIT_KEYS,
  LIFECYCLE_EXIT_RAW,
  LIFECYCLE_FILE_KEYS,
  LIFECYCLE_META_RAW,
  LIFECYCLE_STATE_KEYS,
  LIFECYCLE_STATE_RAW,
  LIFECYCLE_SUBJECT_KEYS,
  LIFECYCLE_SUBJECT_RAW,
} from "./schema";

/* -------------------------------------------------------------------------- */
/* Pending structures                                                         */
/* -------------------------------------------------------------------------- */

interface PendExit extends Loc {
  label: string;
  /** The id as written, with the location so a bad target can be reported at
   * the token rather than at the line. Absent for a terminal exit. */
  rejoins?: { id: string; loc: Loc };
  when?: string;
  tags?: string[];
  description?: string;
  raw: Map<string, Pend>;
  unknowns: Pend[];
}

interface PendState extends Loc {
  id: string;
  label: string;
  final: boolean;
  tags?: string[];
  description?: string;
  exits: PendExit[];
  raw: Map<string, Pend>;
  unknowns: Pend[];
}

interface PendSubject extends Loc {
  label: string;
  description?: string;
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
  | { kind: "subject"; indent: number; item: PendSubject }
  | { kind: "state"; indent: number; item: PendState }
  | { kind: "exit"; indent: number; item: PendExit };

const SUBJECT_KEYS_SET: ReadonlySet<string> = new Set(LIFECYCLE_SUBJECT_KEYS);
const STATE_KEYS_SET: ReadonlySet<string> = new Set(LIFECYCLE_STATE_KEYS);
const EXIT_KEYS_SET: ReadonlySet<string> = new Set(LIFECYCLE_EXIT_KEYS);

/** The keywords that continue the declaration above them, in one set so the
 * dispatch below cannot disagree with `parseContinuation`. */
const CONTINUATION_WORDS: ReadonlySet<string> = new Set(["desc", WHEN_KEYWORD]);

/* -------------------------------------------------------------------------- */
/* The parser                                                                 */
/* -------------------------------------------------------------------------- */

/** Parses `.alab` lifecycle source. Pure, deterministic, all-or-nothing. */
export function parseLifecycleText(source: string): LifecycleLabFile {
  const header: Header = {
    metaRaw: new Map(),
    metaUnknowns: [],
    fileUnknowns: [],
  };
  const states: PendState[] = [];
  const stateById = new Map<string, PendState>();
  let subject: PendSubject | null = null;
  let openState: PendState | null = null;
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
        `inconsistent indentation of ${indent} space${indent === 1 ? "" : "s"} — lifecycle documents indent 2 spaces per level (0 header, 2 subject and state, 4 exit, 6 for a continuation)`,
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
          `the file must start with an "archlab <version> ${LIFECYCLE_HEADER_WORD}" line, e.g. archlab 1.0 ${LIFECYCLE_HEADER_WORD}`,
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
          `this is a C4 ".alab" header — a lifecycle must read "archlab ${version} ${LIFECYCLE_HEADER_WORD}"`,
          text.trim().slice(0, 40),
        );
      }
      const wordLoc = { line: lineNo, column: cursor.column };
      const word = cursor.readBare(/^[a-z]+/, `"${LIFECYCLE_HEADER_WORD}"`);
      if (word !== LIFECYCLE_HEADER_WORD) {
        const named: Record<string, string> = {
          [SEQUENCE_HEADER_WORD]: "sequence",
          [FLOWCHART_HEADER_WORD]: "flowchart",
          [USECASE_HEADER_WORD]: "use-case",
          [ER_HEADER_WORD]: "ER",
          [DICT_HEADER_WORD]: "dictionary",
          [GANTT_HEADER_WORD]: "gantt",
          [TIMELINE_HEADER_WORD]: "timeline",
        };
        failAt(
          wordLoc.line,
          wordLoc.column,
          named[word] !== undefined
            ? `this is ${named[word] === "ER" ? "an" : "a"} ${named[word]} ".alab" header — a lifecycle must read "archlab ${version} ${LIFECYCLE_HEADER_WORD}"`
            : `"${word}" is not a document type — expected "archlab ${version} ${LIFECYCLE_HEADER_WORD}"`,
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
      if (text.startsWith(LIFECYCLE_BLOCK)) {
        cursor.pos += LIFECYCLE_BLOCK.length;
        cursor.expectEnd(`the "${LIFECYCLE_BLOCK}" line`);
        if (bodyOpened) {
          failAt(
            lineNo,
            1,
            `duplicate "${LIFECYCLE_BLOCK}" — a lifecycle file holds exactly one lifecycle`,
            LIFECYCLE_BLOCK,
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
          `header lines must appear before "${LIFECYCLE_BLOCK}"`,
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
        `this line is indented, but no "${LIFECYCLE_BLOCK}" block is open above it`,
        text.trim().slice(0, 40),
      );
    }

    const firstWord = /^([a-z]+)(\s|$)/.exec(text.slice(indent))?.[1];
    const isContinuation =
      cursor.peek() === "!" ||
      (firstWord !== undefined && CONTINUATION_WORDS.has(firstWord));
    if (lastItem !== null && indent === lastItem.indent + 2 && isContinuation) {
      parseContinuation(cursor, lastItem);
      continue;
    }

    if (openState !== null && indent < 4) openState = null;
    const itemIndent = openState === null ? 2 : 4;
    if (indent !== itemIndent) {
      /* THE BRANCH-OFF-A-BRANCH CASE, named rather than reported as an indent
         error. An `exit` one level under an exit is the shape a reader who
         thinks in flowcharts writes first, and "expected 4 spaces here" tells
         them to move it rather than that it cannot exist. */
      failAt(
        lineNo,
        indent + 1,
        firstWord === EXIT_KEYWORD && indent > itemIndent
          ? `an "${EXIT_KEYWORD}" cannot open inside another exit — a departure has no departures of its own, so branch depth here is always one. A tree of alternatives is a decision graph: write "archlab ${header.version ?? "1.0"} ${FLOWCHART_HEADER_WORD}".`
          : `inconsistent indentation of ${indent} spaces — expected ${itemIndent} here (2 per level; a state's exits are one level deeper than its opener)`,
        text.trim().slice(0, 40),
      );
    }

    lastItem = parseBodyLine(cursor, {
      subject,
      openState,
      stateById,
      openSubject: (value) => {
        subject = value;
      },
      openStateBlock: (state) => {
        states.push(state);
        stateById.set(state.id, state);
        openState = state;
      },
    });
  }

  if (!seenContent || header.version === undefined) {
    failAt(
      1,
      1,
      `the file is empty — expected an "archlab <version> ${LIFECYCLE_HEADER_WORD}" line`,
    );
  }
  if (!bodyOpened) {
    failAt(
      1,
      1,
      `the file has no "${LIFECYCLE_BLOCK}" block — add one after the header lines`,
    );
  }

  return resolve(header, subject, states);
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
        /* `subject` IS NAMED SEPARATELY because it is the one body keyword a
           reader is most likely to write up here: it names the thing the whole
           document is about, which FEELS like metadata. Saying "not a header
           keyword" would leave them looking for the right spelling instead of
           the right place. */
        keyword === SUBJECT_KEYWORD
          ? `"${SUBJECT_KEYWORD}" is a body line, not a header one — it names what the lifecycle is about rather than the file, so it belongs inside "${LIFECYCLE_BLOCK}", indented 2 spaces, before the first "${STATE_KEYWORD}".`
          : `"${keyword}" is not a lifecycle header keyword — expected archlab, schema, title, ` +
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
        'lifecycle "! meta.…" paths are exactly one key deep — set whole objects, e.g. ! meta.generator : {"name":"…","version":"…"}',
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
    if (LIFECYCLE_META_RAW.has(key)) {
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
      'top-level "!" paths cannot nest — only "! <key> : <json>" and "! meta.<key> : <json>" are valid in a lifecycle header',
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
  if ((LIFECYCLE_FILE_KEYS as readonly string[]).includes(key)) {
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
  subject: PendSubject | null;
  openState: PendState | null;
  stateById: Map<string, PendState>;
  openSubject: (subject: PendSubject) => void;
  openStateBlock: (state: PendState) => void;
}

function parseBodyLine(cursor: LineCursor, state: BodyState): Continuable {
  if (cursor.peek() === "!") {
    /* A state's own "!" lines sit at indent 4 and so do its exit lines, so a
       "!" that reaches here is one written after the first exit — past the
       window where it could still bind to the state. Same shape as the
       dictionary's, the gantt's and the timeline's rule. */
    cursor.fail(
      state.openState !== null
        ? `a state's "!" lines come directly under its "${STATE_KEYWORD}" line, before the first exit — at this indent, after an exit, "!" would be ambiguous between the state and the exit`
        : `file-level "!" lines belong in the header, before ${LIFECYCLE_BLOCK}`,
    );
  }

  const startLoc = { line: cursor.line, column: cursor.column };
  const quotedStart = cursor.peek() === '"';
  const first = quotedStart
    ? cursor.readQuoted(`"${STATE_KEYWORD}" or "${EXIT_KEYWORD}"`)
    : cursor.readBare(
        /^[A-Za-z0-9_][A-Za-z0-9_.-]*/,
        `"${STATE_KEYWORD}" or "${EXIT_KEYWORD}"`,
      );

  if (!quotedStart && RESERVED_LIFECYCLE_WORDS.has(first)) {
    switch (first) {
      case SUBJECT_KEYWORD:
        return parseSubjectLine(cursor, startLoc, state);
      case STATE_KEYWORD:
        return parseStateLine(cursor, startLoc, state);
      case EXIT_KEYWORD:
        return parseExitLine(cursor, startLoc, state);
      default:
        failAt(
          startLoc.line,
          startLoc.column,
          `"${first}" is a continuation — indent it 2 spaces under the ${first === WHEN_KEYWORD ? "exit it conditions" : "declaration it describes"}`,
          first,
        );
    }
  }

  failAt(
    startLoc.line,
    startLoc.column,
    state.openState === null
      ? `a lifecycle body holds one "${SUBJECT_KEYWORD}" and then "${STATE_KEYWORD}" lines — write e.g. ${STATE_KEYWORD} placed "Placed"`
      : `an exit line starts with "${EXIT_KEYWORD}" — write e.g. ${EXIT_KEYWORD} "Cancelled" ${ENDS_KEYWORD}. States are not joined to each other here: the track is the order they are written in, and a line between two of them would be a flowchart edge ("archlab 1.0 ${FLOWCHART_HEADER_WORD}").`,
    first,
  );
}

/**
 * `subject "Order"` — exactly once, before any state.
 *
 * THE ORDER IS ENFORCED rather than sorted out at the end, because the two
 * failures read differently to whoever hit them: a document with two subjects
 * is a paste, and a document whose subject comes after a state is somebody
 * treating it as an afterthought. Both are refused where they happen.
 */
function parseSubjectLine(
  cursor: LineCursor,
  loc: Loc,
  state: BodyState,
): Continuable {
  if (state.subject !== null) {
    failAt(
      loc.line,
      loc.column,
      `duplicate "${SUBJECT_KEYWORD}" — already declared on line ${state.subject.line}. A lifecycle follows exactly ONE thing through its states; two subjects would be a graph of two things, which is what a flowchart with lanes draws.`,
      SUBJECT_KEYWORD,
    );
  }
  if (state.stateById.size > 0) {
    failAt(
      loc.line,
      loc.column,
      `"${SUBJECT_KEYWORD}" must come before the first "${STATE_KEYWORD}" — the states are states OF something, and a reader meets the thing before what happens to it.`,
      SUBJECT_KEYWORD,
    );
  }
  cursor.skipSpaces();
  const labelLoc = { line: cursor.line, column: cursor.column };
  if (cursor.peek() !== '"') {
    cursor.fail(
      `the "${SUBJECT_KEYWORD}" label, in quotes — the singular noun this lifecycle follows, e.g. ${SUBJECT_KEYWORD} "Order". It carries no id: nothing in this grammar refers to the subject, because everything here is already about it.`,
    );
  }
  const label = cursor.readQuoted(`the "${SUBJECT_KEYWORD}" label`);
  if (label === "") {
    failAt(
      labelLoc.line,
      labelLoc.column,
      `the "${SUBJECT_KEYWORD}" label must not be empty — it names what the whole diagram is about`,
    );
  }
  cursor.expectEnd(`the "${SUBJECT_KEYWORD}" line`);

  const value: PendSubject = {
    ...loc,
    label,
    raw: new Map(),
    unknowns: [],
  };
  state.openSubject(value);
  return { kind: "subject", indent: cursor.text.search(/\S/), item: value };
}

/**
 * `state placed "Placed" #retail ends`.
 *
 * AN ID, A QUOTED LABEL, THEN ONLY TAGS AND `ends`. Everything else a reader
 * might reach for on this line joins one state to another, which is the edge
 * this notation exists without — so the refusal names the flowchart rather
 * than listing what the line accepts.
 */
function parseStateLine(
  cursor: LineCursor,
  loc: Loc,
  state: BodyState,
): Continuable {
  if (state.subject === null) {
    failAt(
      loc.line,
      loc.column,
      `a "${STATE_KEYWORD}" needs a "${SUBJECT_KEYWORD}" above it — a state is a state OF something, so the subject is declared first, e.g. ${SUBJECT_KEYWORD} "Order".`,
      STATE_KEYWORD,
    );
  }
  cursor.skipSpaces();
  const idLoc = { line: cursor.line, column: cursor.column };
  if (cursor.atEnd()) {
    cursor.fail(
      `the state id and its label — write e.g. ${STATE_KEYWORD} placed "Placed"`,
    );
  }
  const quotedId = cursor.peek() === '"';
  const id = quotedId
    ? cursor.readQuoted("the state id")
    : cursor.readBare(/^[A-Za-z0-9_][A-Za-z0-9_.-]*/, "the state id");
  if (!quotedId && RESERVED_LIFECYCLE_WORDS.has(id)) {
    /* The bare/quoted symmetry the serializer's `idToken` mirrors: a bare
       `ends` here would be read as the terminal marker on a state with no id,
       so the quoted spelling is the only one that can mean the name. */
    failAt(
      idLoc.line,
      idLoc.column,
      `"${id}" is a lifecycle keyword, so it cannot be a bare state id — write it in quotes (${STATE_KEYWORD} "${id}" "…") if the name is really this`,
      id,
    );
  }
  const existing = state.stateById.get(id);
  if (existing !== undefined) {
    failAt(
      idLoc.line,
      idLoc.column,
      `duplicate state id "${id}" — already declared on line ${existing.line}. An id is what "${REJOINS_KEYWORD}" points at, so two states with one id is a branch nobody can aim.`,
      id,
    );
  }

  cursor.skipSpaces();
  const labelLoc = { line: cursor.line, column: cursor.column };
  if (cursor.peek() !== '"') {
    cursor.fail(
      `the state label, in quotes — write e.g. ${STATE_KEYWORD} ${id} "Placed". A state is a place ${JSON.stringify(state.subject.label)} can BE, so the label is a condition ("Paid"), not an action ("Take payment"): actions are steps, and steps are what a flowchart draws.`,
    );
  }
  const label = cursor.readQuoted("the state label");
  if (label === "") {
    failAt(
      labelLoc.line,
      labelLoc.column,
      "the state label must not be empty — a state with no name is a box a reader cannot read",
    );
  }

  const pend: PendState = {
    ...loc,
    id,
    label,
    final: false,
    exits: [],
    raw: new Map(),
    unknowns: [],
  };

  for (;;) {
    cursor.skipSpaces();
    if (cursor.atEnd()) break;
    const attrLoc = { line: cursor.line, column: cursor.column };
    if (cursor.peek() === "#") {
      pend.tags = pend.tags ?? [];
      pend.tags.push(readTag(cursor));
      continue;
    }
    const word = cursor.readBare(/^[A-Za-z0-9_-]+/, 'a marker or a "#tag"');
    if (word === ENDS_KEYWORD) {
      if (pend.final) {
        failAt(
          attrLoc.line,
          attrLoc.column,
          `duplicate "${ENDS_KEYWORD}" on this state line`,
          ENDS_KEYWORD,
        );
      }
      pend.final = true;
      continue;
    }
    failAt(attrLoc.line, attrLoc.column, stateWordRefusal(word), word);
  }

  state.openStateBlock(pend);
  return { kind: "state", indent: cursor.text.search(/\S/), item: pend };
}

/**
 * The message for a word that is not `ends` and not a `#tag` on a state line.
 *
 * THREE ANSWERS, NOT ONE, because the three mistakes come from three
 * different places and a single "unexpected token" would help none of them.
 * Each names the notation that draws what the author is reaching for.
 */
function stateWordRefusal(word: string): string {
  if (REFUSED_EDGE_WORDS.includes(word)) {
    return `"${word}" would join this state to another one, and a lifecycle has no such line: the track IS the order the states are written in, which is what stops the picture becoming an arbitrary graph. Move the state to where it belongs in the order, or — if the states really do connect in a way the order cannot say — write "archlab 1.0 ${FLOWCHART_HEADER_WORD}", which draws exactly that.`;
  }
  if (GANTT_STATE_WORDS.includes(word)) {
    return `"${word}" is a gantt item state, not a lifecycle one — it describes work in flight, where a lifecycle state describes where the subject IS. The only marker a state line carries is "${ENDS_KEYWORD}", which says the subject stops there. If you are tracking work rather than a thing moving, write "archlab 1.0 ${GANTT_HEADER_WORD}".`;
  }
  return `a "${STATE_KEYWORD}" line carries an id, a quoted label, "#tag"s and "${ENDS_KEYWORD}", and nothing else — "${word}" is none of them. A branch out of this state is an "${EXIT_KEYWORD}" line nested under it; a note about it is a nested "desc".`;
}

/**
 * `exit "Returned" rejoins packed` or `exit "Cancelled" ends`.
 *
 * EXACTLY ONE OF THE TWO IS REQUIRED, and that is the rule that keeps a
 * branch from being a dangling node: an exit says where the subject LANDS,
 * because a departure that goes nowhere is a box on the page with no place in
 * the history.
 */
function parseExitLine(
  cursor: LineCursor,
  loc: Loc,
  state: BodyState,
): Continuable {
  const owner = state.openState;
  if (owner === null) {
    failAt(
      loc.line,
      loc.column,
      `"${EXIT_KEYWORD}" is a departure FROM a state, so it belongs inside one — indent it 2 spaces under a "${STATE_KEYWORD}" line`,
      EXIT_KEYWORD,
    );
  }
  cursor.skipSpaces();
  const labelLoc = { line: cursor.line, column: cursor.column };
  if (cursor.peek() !== '"') {
    cursor.fail(
      `the ${EXIT_KEYWORD} label, in quotes — the outcome's name, e.g. ${EXIT_KEYWORD} "Cancelled" ${ENDS_KEYWORD}. An exit carries no id: nothing points at a departure, only at a state ("${REJOINS_KEYWORD}" names one).`,
    );
  }
  const label = cursor.readQuoted(`the ${EXIT_KEYWORD} label`);
  if (label === "") {
    failAt(
      labelLoc.line,
      labelLoc.column,
      `the ${EXIT_KEYWORD} label must not be empty — an unnamed outcome tells a reader only that something else can happen`,
    );
  }

  const exit: PendExit = {
    ...loc,
    label,
    raw: new Map(),
    unknowns: [],
  };
  let ends = false;

  for (;;) {
    cursor.skipSpaces();
    if (cursor.atEnd()) break;
    const attrLoc = { line: cursor.line, column: cursor.column };
    if (cursor.peek() === "#") {
      exit.tags = exit.tags ?? [];
      exit.tags.push(readTag(cursor));
      continue;
    }
    const word = cursor.readBare(/^[A-Za-z0-9_-]+/, 'a marker or a "#tag"');
    if (word === ENDS_KEYWORD) {
      if (ends || exit.rejoins !== undefined) {
        failAt(
          attrLoc.line,
          attrLoc.column,
          `an ${EXIT_KEYWORD} says where the subject lands exactly once — "${ENDS_KEYWORD}" and "${REJOINS_KEYWORD}" are the two answers and they cannot both be given`,
          word,
        );
      }
      ends = true;
      continue;
    }
    if (word === REJOINS_KEYWORD) {
      if (ends || exit.rejoins !== undefined) {
        failAt(
          attrLoc.line,
          attrLoc.column,
          `an ${EXIT_KEYWORD} says where the subject lands exactly once — "${ENDS_KEYWORD}" and "${REJOINS_KEYWORD}" are the two answers and they cannot both be given`,
          word,
        );
      }
      cursor.skipSpaces();
      const targetLoc = { line: cursor.line, column: cursor.column };
      if (cursor.atEnd()) {
        cursor.fail(
          `the id of the state this rejoins — e.g. ${REJOINS_KEYWORD} ${owner.id}`,
        );
      }
      const target =
        cursor.peek() === '"'
          ? cursor.readQuoted("the state id to rejoin")
          : cursor.readBare(
              /^[A-Za-z0-9_][A-Za-z0-9_.-]*/,
              "the state id to rejoin",
            );
      exit.rejoins = { id: target, loc: targetLoc };
      continue;
    }
    failAt(
      attrLoc.line,
      attrLoc.column,
      REFUSED_EDGE_WORDS.includes(word)
        ? `"${word}" would point this exit at an arbitrary state, and an exit has only two destinations: it "${ENDS_KEYWORD}" or it "${REJOINS_KEYWORD}" a state the subject has already been in. A departure that can land anywhere is a flowchart edge ("archlab 1.0 ${FLOWCHART_HEADER_WORD}").`
        : `an "${EXIT_KEYWORD}" line carries a quoted label, "#tag"s, and exactly one of "${ENDS_KEYWORD}" or "${REJOINS_KEYWORD} <state id>" — "${word}" is none of them. The condition goes on a nested "${WHEN_KEYWORD}" line.`,
      word,
    );
  }

  if (!ends && exit.rejoins === undefined) {
    failAt(
      loc.line,
      loc.column,
      `this ${EXIT_KEYWORD} does not say where the subject lands — add "${ENDS_KEYWORD}" if it stops here, or "${REJOINS_KEYWORD} <state id>" naming a state declared earlier if it comes back. A departure with no destination is a box with no place in the history.`,
      EXIT_KEYWORD,
    );
  }

  owner.exits.push(exit);
  return { kind: "exit", indent: cursor.text.search(/\S/), item: exit };
}

/* ----------------------------- continuations ------------------------------ */

function parseContinuation(cursor: LineCursor, target: Continuable): void {
  if (cursor.peek() !== "!") {
    const loc = { line: cursor.line, column: cursor.column };
    const keyword = cursor.readBare(/^[a-z]+/, "a continuation keyword");
    cursor.skipSpaces();
    if (keyword === WHEN_KEYWORD) {
      /* A `when` anywhere but under an exit would be a condition on something
         that has no alternatives — a state the subject simply reaches, or the
         subject itself. Accepting it would parse a line the serializer cannot
         write back, so the note would vanish on the author's next save. */
      if (target.kind !== "exit") {
        failAt(
          loc.line,
          loc.column,
          `"${WHEN_KEYWORD}" is the condition on a DEPARTURE, so it belongs under an "${EXIT_KEYWORD}" — a ${target.kind} has no alternatives for a condition to choose between.`,
          keyword,
        );
      }
      if (target.item.when !== undefined) {
        failAt(loc.line, loc.column, `duplicate "${WHEN_KEYWORD}" line`);
      }
      target.item.when = cursor.readQuoted("the condition");
      cursor.expectEnd(`the "${WHEN_KEYWORD}" line`);
      return;
    }
    if (keyword !== "desc") {
      failAt(
        loc.line,
        loc.column,
        `"${keyword}" is not a continuation keyword — a lifecycle has "desc" and "${WHEN_KEYWORD}"`,
        keyword,
      );
    }
    if (target.item.description !== undefined) {
      failAt(loc.line, loc.column, 'duplicate "desc" line here');
    }
    target.item.description = cursor.readQuoted("the description");
    cursor.expectEnd('the "desc" line');
    return;
  }

  cursor.expect("!", '"!"');
  cursor.skipSpaces();
  const path = readPath(cursor);
  const tail = readBangTail(cursor);
  cursor.expectEnd('the "!" line');
  const first = path[0];
  const what = target.kind;
  if (path.length !== 1) {
    failAt(
      first.line,
      first.column,
      `${what} "!" paths are one key — nothing nests under ${what === "exit" ? "an" : "a"} ${what}`,
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
    what === "subject"
      ? ([LIFECYCLE_SUBJECT_RAW, SUBJECT_KEYS_SET] as const)
      : what === "state"
        ? ([LIFECYCLE_STATE_RAW, STATE_KEYS_SET] as const)
        : ([LIFECYCLE_EXIT_RAW, EXIT_KEYS_SET] as const);
  if (rawAllowed.has(key)) {
    if (target.item.raw.has(key)) {
      failAt(first.line, first.column, `duplicate "!" line for "${key}"`);
    }
    target.item.raw.set(key, pend);
  } else if (known.has(key)) {
    failAt(
      first.line,
      first.column,
      /* `rejoins` says so explicitly rather than sharing the generic message,
         because the reason it is dedicated-only is a rule and not a spelling:
         the line syntax is where the backward-only direction is enforced, and
         an escape hatch round it would let a document name a state declared
         later. See `./schema.ts`. */
      key === "rejoins"
        ? `"rejoins" cannot be set with a "!" line — it must be written on the "${EXIT_KEYWORD}" line, which is where this grammar checks that the target is a state the subject has ALREADY been in`
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
  subject: PendSubject | null,
  states: PendState[],
): LifecycleLabFile {
  if (header.title === undefined) {
    failAt(
      1,
      1,
      'the file has no title — add a line like: title "An order, end to end"',
    );
  }
  if (subject === null) {
    failAt(
      1,
      1,
      `the file has no "${SUBJECT_KEYWORD}" — a lifecycle is about ONE thing, so name it: ${SUBJECT_KEYWORD} "Order", indented 2 spaces inside "${LIFECYCLE_BLOCK}"`,
    );
  }
  if (states.length === 0) {
    failAt(
      subject.line,
      subject.column,
      `the lifecycle has no states — a subject that passes through nothing is a noun, not a history. Add lines like: ${STATE_KEYWORD} placed "Placed"`,
      SUBJECT_KEYWORD,
    );
  }

  /* THE DIRECTION CHECK, done here rather than at the exit line because a
     target declared LATER is not yet known when the exit is read — and the
     difference between "no such state" and "that state comes later" is the
     whole content of the message. Both are refused; only the second is the
     one this notation exists to refuse. */
  const indexById = new Map<string, number>();
  states.forEach((state, index) => indexById.set(state.id, index));
  states.forEach((state, stateIndex) => {
    for (const exit of state.exits) {
      const rejoins = exit.rejoins;
      if (rejoins === undefined) continue;
      const targetIndex = indexById.get(rejoins.id);
      if (targetIndex === undefined) {
        failAt(
          rejoins.loc.line,
          rejoins.loc.column,
          `"${REJOINS_KEYWORD} ${rejoins.id}" names no state — the ids in this lifecycle are ${states.map((s) => `"${s.id}"`).join(", ")}`,
          rejoins.id,
        );
      }
      if (targetIndex === stateIndex) {
        failAt(
          rejoins.loc.line,
          rejoins.loc.column,
          `this exit rejoins the state it leaves ("${rejoins.id}") — a departure that arrives where it left draws a loop saying the subject went nowhere. Drop the exit, or point it at an earlier state.`,
          rejoins.id,
        );
      }
      if (targetIndex > stateIndex) {
        failAt(
          rejoins.loc.line,
          rejoins.loc.column,
          `"${REJOINS_KEYWORD}" may only name a state declared EARLIER, and "${rejoins.id}" comes after "${state.id}". A rejoin is the subject re-doing part of what it already did; a forward one would be a shortcut along the track — an edge between two states the order itself does not have, which is what "archlab 1.0 ${FLOWCHART_HEADER_WORD}" is for.`,
          rejoins.id,
        );
      }
    }
  });

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

  const subjectPairs: (readonly [string, unknown])[] = [
    ["label", subject.label],
  ];
  const subjectDescription = pick(
    subject.description,
    subject.raw,
    "description",
  );
  if (subjectDescription !== undefined) {
    subjectPairs.push(["description", subjectDescription]);
  }

  const finalStates = states.map((state) => {
    const pairs: (readonly [string, unknown])[] = [
      ["id", state.id],
      ["label", state.label],
    ];
    /* Omitted at its default, exactly as the serializer omits the marker —
       the symmetry that makes the round trip byte-identical. */
    if (state.final) pairs.push(["final", true]);
    for (const key of ["tags", "description"] as const) {
      const value = pick(state[key], state.raw, key);
      if (value !== undefined) pairs.push([key, value]);
    }
    if (state.exits.length > 0) {
      pairs.push([
        "exits",
        state.exits.map((exit) => {
          const exitPairs: (readonly [string, unknown])[] = [
            ["label", exit.label],
          ];
          if (exit.rejoins !== undefined) {
            exitPairs.push(["rejoins", exit.rejoins.id]);
          }
          for (const key of ["when", "tags", "description"] as const) {
            const value = pick(exit[key], exit.raw, key);
            if (value !== undefined) exitPairs.push([key, value]);
          }
          return assemble(exitPairs, exit.unknowns);
        }),
      ]);
    }
    return assemble(pairs, state.unknowns);
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
  file.kind = "lifecycle";
  file.metadata = metadata;
  file.subject = assemble(subjectPairs, subject.unknowns);
  file.states = finalStates;
  for (const pend of header.fileUnknowns) file[pend.key] = pend.value;
  return file as LifecycleLabFile;
}

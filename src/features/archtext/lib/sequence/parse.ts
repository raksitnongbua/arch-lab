/**
 * `.alab` sequence text → `SequenceLabFile`. The sequence sibling of the C4
 * parser in `../parse.ts`, sharing its whole substrate — `LineCursor`,
 * `ArchTextParseError`, the `!` escape reader, `[technology]`, `#tag` — so
 * the two grammars cannot drift apart in the parts they share.
 *
 * Line shape (all indentation in spaces, never tabs):
 *
 *   archlab 1.0 sequence          ← the document-type discriminant (line 1)
 *   title "Checkout"              ← header keywords shared with C4 where
 *   created 2026-08-01T00:00:00Z    they mean the same thing
 *
 *   @sequence                     ← opens the single diagram body
 *     autonumber                  ← body flags at indent 2
 *     cust:actor "Customer"       ← participants (declared before any step)
 *     web "Web App" [Next.js]     ← kind omitted = unstated
 *
 *     cust -> web : "Clicks buy"  ← sync; ~> async; ..> reply; +/- activation
 *     alt "cart valid"            ← fragments open a block…
 *       web ->+ web : "reserve"   ← …whose body indents one step deeper
 *     else "cart empty"           ← branch separators sit at the OPENER's
 *       web ..> cust : "sorry"      indent, like Python's elif
 *
 * THE DEPTH RULE (the C4 grammar's fixed 0/2/4 does not survive nesting):
 * indentation is 2 spaces per structural level — 0 for header lines and
 * `@sequence`, 2 for the body, and each open fragment adds exactly one
 * level. A `desc` / `!` continuation sits one level deeper than the line it
 * continues. Depth is unbounded but always even; an odd indent is an error,
 * not a rounding.
 *
 * Every failure throws `ArchTextParseError` naming a 1-based line and
 * column; a parse is all-or-nothing.
 *
 * Imported by `scripts/sequence-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import { isMultiBranch } from "@/types";
import type {
  SequenceFragmentKind,
  SequenceLabFile,
  SequenceMessageKind,
  SequenceNotePlacement,
  SequenceParticipantKind,
} from "@/types";

import { LineCursor } from "../cursor";
import { DEFAULT_TIMESTAMP } from "../defaults";
import { failAt } from "../errors";
import {
  assemble,
  onceString,
  pick,
  readBangTail,
  readPath,
  readTag,
  readTechnology,
  segString,
} from "../parse";
import type { Loc, Pend } from "../parse";
import { META_KEYS } from "../schema";
import {
  BRANCH_KEYWORDS,
  FRAGMENT_KIND_BY_KEYWORD,
  PARTICIPANT_KIND_BY_KEYWORD,
  RESERVED_BODY_WORDS,
  SEQUENCE_ARROWS,
  SEQUENCE_BLOCK,
  SEQUENCE_HEADER_WORD,
} from "./keywords";
import {
  BRANCH_KEYS,
  FRAGMENT_KEYS,
  MESSAGE_KEYS,
  NOTE_KEYS,
  PARTICIPANT_KEYS,
  SEQ_BRANCH_RAW,
  SEQ_FILE_KEYS,
  SEQ_MESSAGE_RAW,
  SEQ_META_RAW,
  SEQ_PARTICIPANT_RAW,
} from "./schema";

/** Mirrors `SUPPORTED_MAJOR_VERSION` in `../parse.ts` — one arch-lab, one
 * major version, whichever grammar the file speaks. */
const SUPPORTED_MAJOR_VERSION = 1;

/* -------------------------------------------------------------------------- */
/* Pending structures collected during the line pass                          */
/* -------------------------------------------------------------------------- */

interface PendParticipant extends Loc {
  id: string;
  kind?: SequenceParticipantKind;
  name: string;
  technology?: string;
  description?: string;
  raw: Map<string, Pend>;
  unknowns: Pend[];
}

interface PendMessage extends Loc {
  step: "message";
  from: string;
  fromLoc: Loc;
  to: string;
  toLoc: Loc;
  kind: SequenceMessageKind;
  label: string;
  technology?: string;
  activate?: boolean;
  deactivate?: boolean;
  raw: Map<string, Pend>;
  unknowns: Pend[];
}

interface PendNote extends Loc {
  step: "note";
  placement: SequenceNotePlacement;
  participants: { id: string; loc: Loc }[];
  text: string;
  unknowns: Pend[];
}

interface PendBranch {
  label?: string;
  items: PendItem[];
  raw: Map<string, Pend>;
  unknowns: Pend[];
}

interface PendFragment extends Loc {
  step: "fragment";
  kind: SequenceFragmentKind;
  /** Indent of the opening keyword — `else`/`and` must reappear here. */
  openerIndent: number;
  branches: PendBranch[];
  unknowns: Pend[];
}

type PendItem = PendMessage | PendNote | PendFragment;

/** One open block: the root body, or one branch of one open fragment. */
interface Context {
  /** Indent items of this block sit at. */
  itemIndent: number;
  branch: PendBranch;
  /** `null` only for the root body context. */
  fragment: PendFragment | null;
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

/** What a continuation line (`desc` / `!` at indent + 2) may attach to. */
type Continuable =
  | { kind: "participant"; indent: number; item: PendParticipant }
  | { kind: "message"; indent: number; item: PendMessage }
  | { kind: "note"; indent: number; item: PendNote };

const FRAGMENT_KEYS_SET: ReadonlySet<string> = new Set(FRAGMENT_KEYS);
const BRANCH_KEYS_SET: ReadonlySet<string> = new Set(BRANCH_KEYS);
const PARTICIPANT_KEYS_SET: ReadonlySet<string> = new Set(PARTICIPANT_KEYS);
const MESSAGE_KEYS_SET: ReadonlySet<string> = new Set(MESSAGE_KEYS);
const NOTE_KEYS_SET: ReadonlySet<string> = new Set(NOTE_KEYS);

/* -------------------------------------------------------------------------- */
/* The parser                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Parses `.alab` sequence source into a `SequenceLabFile`. Pure and
 * deterministic. Throws `ArchTextParseError` (line + column) on any problem
 * — all-or-nothing.
 */
export function parseSequenceText(source: string): SequenceLabFile {
  const header: Header = {
    metaRaw: new Map(),
    metaUnknowns: [],
    fileUnknowns: [],
  };
  const participants: PendParticipant[] = [];
  const participantById = new Map<string, PendParticipant>();
  const rootBranch: PendBranch = { items: [], raw: new Map(), unknowns: [] };
  /* The context stack. Index 0 is the root body; a fragment opener pushes
     one context per open branch. Dedenting pops — there is no `end`
     keyword, the indentation IS the block structure. */
  const contexts: Context[] = [];
  let autonumber: boolean | undefined;
  let autonumberSeen = false;
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

    /* ------------------------------ indentation ------------------------- */
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
        `inconsistent indentation of ${indent} space${indent === 1 ? "" : "s"} — sequence documents indent 2 spaces per level (0 header, 2 body, +2 per open fragment, +2 for a continuation)`,
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
          `the file must start with an "archlab <version> ${SEQUENCE_HEADER_WORD}" line, e.g. archlab 1.0 ${SEQUENCE_HEADER_WORD}`,
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
          `this is a C4 ".alab" header — a sequence document must read "archlab ${version} ${SEQUENCE_HEADER_WORD}"`,
          text.trim().slice(0, 40),
        );
      }
      const wordLoc = { line: lineNo, column: cursor.column };
      const word = cursor.readBare(/^[a-z]+/, `"${SEQUENCE_HEADER_WORD}"`);
      if (word !== SEQUENCE_HEADER_WORD) {
        failAt(
          wordLoc.line,
          wordLoc.column,
          `"${word}" is not a document type — expected "archlab ${version} ${SEQUENCE_HEADER_WORD}"`,
          word,
        );
      }
      cursor.expectEnd("the header line");
      const major = Number.parseInt(version, 10);
      if (major > SUPPORTED_MAJOR_VERSION) {
        failAt(
          versionLoc.line,
          versionLoc.column,
          `"${version}" was written by a newer arch-lab than this one, which supports up to ` +
            `${SUPPORTED_MAJOR_VERSION}.x. Upgrade arch-lab to open this file — opening it here ` +
            "would silently drop data it cannot understand.",
          version,
        );
      }
      header.version = version;
      continue;
    }

    /* ------------------------------- indent 0 --------------------------- */
    if (indent === 0) {
      if (text.startsWith(SEQUENCE_BLOCK)) {
        cursor.pos += SEQUENCE_BLOCK.length;
        cursor.expectEnd(`the "${SEQUENCE_BLOCK}" line`);
        if (bodyOpened) {
          failAt(
            lineNo,
            1,
            `duplicate "${SEQUENCE_BLOCK}" — a sequence file holds exactly one diagram`,
            SEQUENCE_BLOCK,
          );
        }
        bodyOpened = true;
        contexts.push({ itemIndent: 2, branch: rootBranch, fragment: null });
        lastItem = null;
        continue;
      }
      if (bodyOpened) {
        failAt(
          lineNo,
          1,
          `header lines must appear before "${SEQUENCE_BLOCK}"`,
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
        `this line is indented, but no "${SEQUENCE_BLOCK}" block is open above it`,
        text.trim().slice(0, 40),
      );
    }

    /* Continuations bind tighter than block structure: `desc` / `!` exactly
       one level below the last participant/message/note attach to it. A
       fragment opener resets `lastItem` to null, so a `!` at a NEW block's
       item indent can never be mistaken for a continuation. */
    if (
      lastItem !== null &&
      indent === lastItem.indent + 2 &&
      (cursor.peek() === "!" || /^desc(\s|$)/.test(text.slice(indent)))
    ) {
      parseContinuation(cursor, lastItem);
      continue;
    }

    /* Dedenting closes fragments — pop until this line's indent is a legal
       item indent again. */
    while (
      contexts.length > 1 &&
      indent < contexts[contexts.length - 1].itemIndent
    ) {
      contexts.pop();
    }
    const top = contexts[contexts.length - 1];
    if (indent !== top.itemIndent) {
      failAt(
        lineNo,
        indent + 1,
        `inconsistent indentation of ${indent} spaces — expected ${top.itemIndent} here (2 per level; a fragment body is one level deeper than its opener)`,
        text.trim().slice(0, 40),
      );
    }

    lastItem = parseBodyLine(cursor, contexts, participants, participantById, {
      setAutonumber: (value, at) => {
        if (autonumberSeen) {
          failAt(at.line, at.column, 'duplicate "autonumber" line');
        }
        autonumberSeen = true;
        autonumber = value;
      },
      rootHasSteps: () => rootBranch.items.length > 0,
    });
  }

  if (!seenContent || header.version === undefined) {
    failAt(
      1,
      1,
      `the file is empty — expected an "archlab <version> ${SEQUENCE_HEADER_WORD}" line`,
    );
  }
  if (!bodyOpened) {
    failAt(
      1,
      1,
      `the file has no "${SEQUENCE_BLOCK}" block — add one after the header lines`,
    );
  }

  return resolve(header, participants, participantById, rootBranch, autonumber);
}

/* -------------------------------------------------------------------------- */
/* Header lines                                                               */
/* -------------------------------------------------------------------------- */

/** Header keywords: the C4 subset that means the same thing here. The C4
 * grammar's `tagcolor` / `customicon` / `generator` / `root` lines do NOT
 * exist in a sequence header — those fields ride the `! meta.<key>` escape
 * (see `SEQ_META_RAW` in `./schema.ts` for the why). */
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
        `"${keyword}" is not a sequence header keyword — expected archlab, schema, title, ` +
          'description, owner, tags, created, updated or reviewed (other metadata rides "! meta.<key> : <json>")',
        keyword,
      );
  }
  cursor.expectEnd(`the "${keyword}" line`);
}

/** Same table the C4 header uses — fields with a dedicated line. */
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

  /* ---- metadata: `! meta.<key>` (bare `meta` only) ---- */
  if (first.value === "meta" && !first.quoted) {
    if (path.length !== 2) {
      failAt(
        first.line,
        first.column,
        'sequence "! meta.…" paths are exactly one key deep — set whole objects, e.g. ! meta.generator : {"name":"…","version":"…"}',
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
    if (SEQ_META_RAW.has(key)) {
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

  /* ---- file scope ---- */
  if (path.length !== 1) {
    failAt(
      first.line,
      first.column,
      'top-level "!" paths cannot nest — only "! <key> : <json>" and "! meta.<key> : <json>" are valid in a sequence header',
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
  if ((SEQ_FILE_KEYS as readonly string[]).includes(key)) {
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
/* Body lines                                                                 */
/* -------------------------------------------------------------------------- */

interface BodyHooks {
  setAutonumber: (value: boolean, at: Loc) => void;
  rootHasSteps: () => boolean;
}

function parseBodyLine(
  cursor: LineCursor,
  contexts: Context[],
  participants: PendParticipant[],
  participantById: Map<string, PendParticipant>,
  hooks: BodyHooks,
): Continuable | null {
  const top = contexts[contexts.length - 1];
  const indent = cursor.pos;

  /* `!` at ITEM indent (not a continuation — the caller filtered those)
     attaches to the enclosing fragment/branch. */
  if (cursor.peek() === "!") {
    if (top.fragment === null) {
      cursor.fail(
        `file-level "!" lines belong in the header, before ${SEQUENCE_BLOCK}`,
      );
    }
    parseFragmentBang(cursor, top);
    return null;
  }

  const startLoc = { line: cursor.line, column: cursor.column };
  const quotedStart = cursor.peek() === '"';
  const first = quotedStart
    ? cursor.readQuoted("a participant or message id")
    : cursor.readBare(
        /^[A-Za-z0-9_][A-Za-z0-9_.-]*/,
        "a participant id, message source, note, fragment keyword or autonumber",
      );

  /* Reserved words only act as keywords when written BARE — a quoted
     "loop" is always an id, which is what lets `RESERVED_BODY_WORDS` stay a
     reservation on spelling rather than a hole in the id space. */
  if (!quotedStart && RESERVED_BODY_WORDS.has(first)) {
    switch (first) {
      case "autonumber": {
        if (top.fragment !== null) {
          failAt(
            startLoc.line,
            startLoc.column,
            '"autonumber" is a diagram flag — it cannot appear inside a fragment',
          );
        }
        cursor.skipSpaces();
        let value = true;
        if (!cursor.atEnd()) {
          const word = cursor.readBare(/^[a-z]+/, '"true" or "false"');
          if (word !== "true" && word !== "false") {
            cursor.fail(`autonumber takes "true" or "false", got "${word}"`);
          }
          value = word === "true";
        }
        cursor.expectEnd('the "autonumber" line');
        hooks.setAutonumber(value, startLoc);
        return null;
      }
      case "note":
        return parseNoteLine(cursor, startLoc, top);
      case "desc":
        failAt(
          startLoc.line,
          startLoc.column,
          '"desc" is a continuation — indent it 2 spaces under the participant it describes',
        );
        break;
      case "else":
      case "and":
        parseBranchLine(cursor, startLoc, first, contexts, indent);
        return null;
      default: {
        const kind = FRAGMENT_KIND_BY_KEYWORD[first];
        if (kind !== undefined) {
          parseFragmentOpener(cursor, startLoc, kind, contexts, top, indent);
          return null;
        }
        /* "null" — reserved so idToken quoting stays shared with C4. */
        failAt(
          startLoc.line,
          startLoc.column,
          `"${first}" is reserved — quote it ("${first}") to use it as an id`,
          first,
        );
      }
    }
  }

  /* `id:kind` (no space before the colon, same shape as a C4 node line). */
  if (
    cursor.peek() === ":" &&
    !cursor.text.startsWith(" ", cursor.pos + 1) &&
    cursor.text.charAt(cursor.pos + 1) !== ""
  ) {
    cursor.pos += 1;
    const kindLoc = { line: cursor.line, column: cursor.column };
    const kindWord = cursor.readBare(/^[a-z]+/, "a participant kind");
    const kind = PARTICIPANT_KIND_BY_KEYWORD[kindWord];
    if (kind === undefined) {
      failAt(
        kindLoc.line,
        kindLoc.column,
        `"${kindWord}" is not a participant kind — expected participant or actor`,
        kindWord,
      );
    }
    return parseParticipantLine(
      cursor,
      startLoc,
      first,
      kind,
      top,
      participants,
      participantById,
      hooks,
    );
  }

  cursor.skipSpaces();
  if (cursor.peek() === '"') {
    /* `id "Name"` — a participant with its kind unstated. */
    return parseParticipantLine(
      cursor,
      startLoc,
      first,
      undefined,
      top,
      participants,
      participantById,
      hooks,
    );
  }
  return parseMessageLine(cursor, startLoc, first, top);
}

/* ------------------------------ participants ----------------------------- */

function parseParticipantLine(
  cursor: LineCursor,
  loc: Loc,
  id: string,
  kind: SequenceParticipantKind | undefined,
  top: Context,
  participants: PendParticipant[],
  participantById: Map<string, PendParticipant>,
  hooks: BodyHooks,
): Continuable {
  if (id === "") {
    failAt(loc.line, loc.column, "the participant id must not be empty");
  }
  /* Participants only at the top of the body: the MODEL keeps them in a
     separate ordered array, so text that interleaved them with steps could
     not round-trip byte-identically — reject it rather than silently
     regroup. */
  if (top.fragment !== null) {
    failAt(
      loc.line,
      loc.column,
      `participant "${id}" is declared inside a fragment — declare every participant at the top of the ${SEQUENCE_BLOCK} body, before the first message`,
      id,
    );
  }
  if (hooks.rootHasSteps()) {
    failAt(
      loc.line,
      loc.column,
      `participant "${id}" is declared after the first message — participants come first, so the text order matches the model's participants array`,
      id,
    );
  }
  const existing = participantById.get(id);
  if (existing !== undefined) {
    failAt(
      loc.line,
      loc.column,
      `duplicate participant id "${id}" — already declared on line ${existing.line}`,
      id,
    );
  }
  cursor.skipSpaces();
  const name = cursor.readQuoted("the participant name");
  if (name === "") cursor.fail("the participant name must not be empty");

  const participant: PendParticipant = {
    ...loc,
    id,
    kind,
    name,
    raw: new Map(),
    unknowns: [],
  };
  cursor.skipSpaces();
  if (cursor.peek() === "[") {
    participant.technology = readTechnology(cursor);
  }
  cursor.expectEnd("the participant line");
  participants.push(participant);
  participantById.set(id, participant);
  return {
    kind: "participant",
    indent: cursor.text.search(/\S/),
    item: participant,
  };
}

/* -------------------------------- messages ------------------------------- */

function parseMessageLine(
  cursor: LineCursor,
  loc: Loc,
  from: string,
  top: Context,
): Continuable {
  let arrow: (typeof SEQUENCE_ARROWS)[number] | undefined;
  for (const candidate of SEQUENCE_ARROWS) {
    if (cursor.text.startsWith(candidate[0], cursor.pos)) {
      arrow = candidate;
      break;
    }
  }
  if (arrow === undefined) {
    cursor.fail(
      'expected an arrow (-> sync, ~> async, ..> reply) — or, for a participant, a quoted "Name" after the id',
      cursor.foundHere(),
    );
  }
  cursor.pos += arrow[0].length;

  /* Activation suffixes: `+` starts a bar on the target, `-` ends the bar on
     the source. Each at most once; both are legal on one arrow (a reply that
     hands the bar over). Canonical emission order is `+-`, but the parser
     accepts either order — leniency in reading costs nothing, strictness in
     writing is what byte-identity needs. */
  let activate = false;
  let deactivate = false;
  for (;;) {
    const at = { line: cursor.line, column: cursor.column };
    if (cursor.eat("+")) {
      if (activate)
        failAt(at.line, at.column, 'duplicate "+" activation suffix');
      activate = true;
      continue;
    }
    if (cursor.eat("-")) {
      if (deactivate) {
        failAt(at.line, at.column, 'duplicate "-" deactivation suffix');
      }
      deactivate = true;
      continue;
    }
    break;
  }

  cursor.skipSpaces();
  const toLoc = { line: cursor.line, column: cursor.column };
  const to = cursor.readIdToken("the target participant id");
  cursor.skipSpaces();
  cursor.expect(":", '":" before the message label');
  cursor.skipSpaces();
  const label = cursor.readQuoted("the message label");

  const message: PendMessage = {
    ...loc,
    step: "message",
    from,
    fromLoc: loc,
    to,
    toLoc,
    kind: arrow[1],
    label,
    raw: new Map(),
    unknowns: [],
  };
  if (activate) message.activate = true;
  if (deactivate) message.deactivate = true;

  cursor.skipSpaces();
  if (cursor.peek() === "[") {
    message.technology = readTechnology(cursor);
  }
  cursor.expectEnd("the message line");
  top.branch.items.push(message);
  return { kind: "message", indent: cursor.text.search(/\S/), item: message };
}

/* --------------------------------- notes --------------------------------- */

function parseNoteLine(
  cursor: LineCursor,
  loc: Loc,
  top: Context,
): Continuable {
  cursor.skipSpaces();
  const placementLoc = { line: cursor.line, column: cursor.column };
  const placement = cursor.readBare(/^[a-z]+/, "a note placement");
  if (placement !== "left" && placement !== "right" && placement !== "over") {
    failAt(
      placementLoc.line,
      placementLoc.column,
      `"${placement}" is not a note placement — expected left, right or over`,
      placement,
    );
  }
  const ids: { id: string; loc: Loc }[] = [];
  for (;;) {
    cursor.skipSpaces();
    if (cursor.peek() === ":" || cursor.atEnd()) break;
    const at = { line: cursor.line, column: cursor.column };
    ids.push({ id: cursor.readIdToken("a participant id"), loc: at });
  }
  const max = placement === "over" ? 2 : 1;
  if (ids.length === 0 || ids.length > max) {
    failAt(
      placementLoc.line,
      placementLoc.column,
      placement === "over"
        ? `"note over" names one or two participants, got ${ids.length}`
        : `"note ${placement}" names exactly one participant, got ${ids.length}`,
    );
  }
  cursor.skipSpaces();
  cursor.expect(":", '":" before the note text');
  cursor.skipSpaces();
  const text = cursor.readQuoted("the note text");
  cursor.expectEnd("the note line");

  const note: PendNote = {
    ...loc,
    step: "note",
    placement,
    participants: ids,
    text,
    unknowns: [],
  };
  top.branch.items.push(note);
  return { kind: "note", indent: cursor.text.search(/\S/), item: note };
}

/* ------------------------------- fragments -------------------------------- */

function parseFragmentOpener(
  cursor: LineCursor,
  loc: Loc,
  kind: SequenceFragmentKind,
  contexts: Context[],
  top: Context,
  indent: number,
): void {
  cursor.skipSpaces();
  const branch: PendBranch = { items: [], raw: new Map(), unknowns: [] };
  if (cursor.peek() === '"') {
    branch.label = cursor.readQuoted("the fragment label");
  }
  cursor.expectEnd(`the "${kind}" line`);
  const fragment: PendFragment = {
    ...loc,
    step: "fragment",
    kind,
    openerIndent: indent,
    branches: [branch],
    unknowns: [],
  };
  top.branch.items.push(fragment);
  contexts.push({ itemIndent: indent + 2, branch, fragment });
}

/** `else` (alt) / `and` (par) at the fragment OPENER's indent. By the time
 * this runs the caller has already popped the fragment's body context, so
 * the fragment to extend must be the LAST ITEM of the current branch with a
 * matching opener indent — anything else means the separator is orphaned. */
function parseBranchLine(
  cursor: LineCursor,
  loc: Loc,
  keyword: string,
  contexts: Context[],
  indent: number,
): void {
  const top = contexts[contexts.length - 1];
  const wantsKind = BRANCH_KEYWORDS[keyword];
  const last = top.branch.items[top.branch.items.length - 1];
  const fragment =
    last !== undefined &&
    last.step === "fragment" &&
    last.openerIndent === indent
      ? last
      : undefined;
  if (fragment === undefined) {
    failAt(
      loc.line,
      loc.column,
      `"${keyword}" does not continue a fragment — it must sit at the same indent as the "${wantsKind}" it extends, with no other step between them`,
      keyword,
    );
  }
  if (fragment.kind !== wantsKind) {
    failAt(
      loc.line,
      loc.column,
      isMultiBranch(fragment.kind)
        ? `"${keyword}" continues an "${wantsKind}" fragment, but this one is "${fragment.kind}" — use "${fragment.kind === "alt" ? "else" : "and"}"`
        : `"${fragment.kind}" fragments have a single branch — "${keyword}" only continues "${wantsKind}"`,
      keyword,
    );
  }
  cursor.skipSpaces();
  const branch: PendBranch = { items: [], raw: new Map(), unknowns: [] };
  if (cursor.peek() === '"') {
    branch.label = cursor.readQuoted("the branch label");
  }
  cursor.expectEnd(`the "${keyword}" line`);
  fragment.branches.push(branch);
  contexts.push({ itemIndent: indent + 2, branch, fragment });
}

/** `!` at a fragment body's item indent: `! <key>` → the current branch,
 * `! frag.<key>` → the fragment itself. Emitted by the serializer right
 * after the opener / `else` / `and` line, accepted anywhere in the block. */
function parseFragmentBang(cursor: LineCursor, top: Context): void {
  cursor.expect("!", '"!"');
  cursor.skipSpaces();
  const path = readPath(cursor);
  const tail = readBangTail(cursor);
  cursor.expectEnd('the "!" line');
  const first = path[0];

  if (first.value === "frag" && !first.quoted) {
    if (path.length !== 2) {
      failAt(
        first.line,
        first.column,
        'fragment "!" paths look like "frag.<key>"',
      );
    }
    const key = segString(path[1], "a fragment field name");
    if (FRAGMENT_KEYS_SET.has(key)) {
      failAt(
        path[1].line,
        path[1].column,
        `"frag.${key}" has dedicated syntax — it cannot be set with a "!" line`,
      );
    }
    const fragment = top.fragment as PendFragment;
    if (fragment.unknowns.some((p) => p.key === key)) {
      failAt(
        path[1].line,
        path[1].column,
        `duplicate "!" line for "frag.${key}"`,
      );
    }
    fragment.unknowns.push({
      key,
      after: tail.after,
      value: tail.value,
      line: path[1].line,
      column: path[1].column,
    });
    return;
  }

  if (path.length !== 1) {
    failAt(
      first.line,
      first.column,
      'branch "!" paths are one key — only "! <key>" and "! frag.<key>" nest here',
    );
  }
  const key = segString(first, "a branch field name");
  const pend: Pend = {
    key,
    after: tail.after,
    value: tail.value,
    line: first.line,
    column: first.column,
  };
  if (SEQ_BRANCH_RAW.has(key)) {
    if (top.branch.raw.has(key)) {
      failAt(first.line, first.column, `duplicate "!" line for "${key}"`);
    }
    top.branch.raw.set(key, pend);
  } else if (BRANCH_KEYS_SET.has(key)) {
    failAt(
      first.line,
      first.column,
      `"${key}" has dedicated syntax — it cannot be set with a "!" line`,
    );
  } else {
    if (top.branch.unknowns.some((p) => p.key === key)) {
      failAt(first.line, first.column, `duplicate "!" line for "${key}"`);
    }
    top.branch.unknowns.push(pend);
  }
}

/* ----------------------------- continuations ------------------------------ */

function parseContinuation(cursor: LineCursor, target: Continuable): void {
  if (cursor.peek() !== "!") {
    /* `desc` — participants only; a message's text is its label and a
       note's text is the note. */
    const loc = { line: cursor.line, column: cursor.column };
    cursor.pos += "desc".length;
    if (target.kind !== "participant") {
      failAt(
        loc.line,
        loc.column,
        target.kind === "message"
          ? 'messages have no description — the : "label" on the message line carries the text'
          : "notes have no description — the note text itself is the content",
      );
    }
    if (target.item.description !== undefined) {
      failAt(
        loc.line,
        loc.column,
        'duplicate "desc" line for this participant',
      );
    }
    cursor.skipSpaces();
    target.item.description = cursor.readQuoted("the participant description");
    cursor.expectEnd('the "desc" line');
    return;
  }

  cursor.expect("!", '"!"');
  cursor.skipSpaces();
  const path = readPath(cursor);
  const tail = readBangTail(cursor);
  cursor.expectEnd('the "!" line');
  const first = path[0];
  if (path.length !== 1) {
    failAt(
      first.line,
      first.column,
      `${target.kind} "!" paths are one key — nothing nests under a ${target.kind}`,
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
  const [rawAllowed, known, raw, unknowns] =
    target.kind === "participant"
      ? ([
          SEQ_PARTICIPANT_RAW,
          PARTICIPANT_KEYS_SET,
          target.item.raw,
          target.item.unknowns,
        ] as const)
      : target.kind === "message"
        ? ([
            SEQ_MESSAGE_RAW,
            MESSAGE_KEYS_SET,
            target.item.raw,
            target.item.unknowns,
          ] as const)
        : ([
            new Set<string>(),
            NOTE_KEYS_SET,
            new Map<string, Pend>(),
            target.item.unknowns,
          ] as const);
  if (rawAllowed.has(key)) {
    if (raw.has(key)) {
      failAt(first.line, first.column, `duplicate "!" line for "${key}"`);
    }
    raw.set(key, pend);
  } else if (known.has(key)) {
    failAt(
      first.line,
      first.column,
      `"${key}" has dedicated syntax on the ${target.kind} line — it cannot be set with a "!" line`,
    );
  } else {
    if (unknowns.some((p) => p.key === key)) {
      failAt(first.line, first.column, `duplicate "!" line for "${key}"`);
    }
    unknowns.push(pend);
  }
}

/* -------------------------------------------------------------------------- */
/* Resolve pass                                                               */
/* -------------------------------------------------------------------------- */

function resolve(
  header: Header,
  participants: PendParticipant[],
  participantById: Map<string, PendParticipant>,
  rootBranch: PendBranch,
  autonumber: boolean | undefined,
): SequenceLabFile {
  if (header.title === undefined) {
    failAt(1, 1, 'the file has no title — add a line like: title "Checkout"');
  }

  /* ------------------------------ metadata ------------------------------ */
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

  /* ---------------------------- participants ---------------------------- */
  const finalParticipants = participants.map((participant) => {
    const pairs: (readonly [string, unknown])[] = [];
    const add = (key: string, value: unknown): void => {
      if (value !== undefined) pairs.push([key, value]);
    };
    add("id", participant.id);
    add("kind", pick(participant.kind, participant.raw, "kind"));
    add("name", participant.name);
    add(
      "technology",
      pick(participant.technology, participant.raw, "technology"),
    );
    add(
      "description",
      pick(participant.description, participant.raw, "description"),
    );
    return assemble(pairs, participant.unknowns);
  });

  /* -------------------------------- items -------------------------------- */
  const requireParticipant = (id: string, at: Loc, what: string): void => {
    if (!participantById.has(id)) {
      failAt(
        at.line,
        at.column,
        `the ${what} "${id}" does not resolve to a participant — declare it at the top of the ${SEQUENCE_BLOCK} body`,
        id,
      );
    }
  };

  const finalizeItems = (items: PendItem[]): Record<string, unknown>[] =>
    items.map((item) => {
      if (item.step === "message") {
        requireParticipant(item.from, item.fromLoc, "message source");
        requireParticipant(item.to, item.toLoc, "message target");
        const pairs: (readonly [string, unknown])[] = [];
        const add = (key: string, value: unknown): void => {
          if (value !== undefined) pairs.push([key, value]);
        };
        add("step", "message");
        add("from", item.from);
        add("to", item.to);
        add("kind", item.kind);
        add("label", item.label);
        add("technology", pick(item.technology, item.raw, "technology"));
        add("activate", pick(item.activate, item.raw, "activate"));
        add("deactivate", pick(item.deactivate, item.raw, "deactivate"));
        return assemble(pairs, item.unknowns);
      }
      if (item.step === "note") {
        for (const entry of item.participants) {
          requireParticipant(entry.id, entry.loc, "note participant");
        }
        return assemble(
          [
            ["step", "note"],
            ["placement", item.placement],
            ["participants", item.participants.map((entry) => entry.id)],
            ["text", item.text],
          ],
          item.unknowns,
        );
      }
      const branches = item.branches.map((branch) => {
        const pairs: (readonly [string, unknown])[] = [];
        const label = pick(branch.label, branch.raw, "label");
        if (label !== undefined) pairs.push(["label", label]);
        pairs.push(["items", finalizeItems(branch.items)]);
        return assemble(pairs, branch.unknowns);
      });
      return assemble(
        [
          ["step", "fragment"],
          ["kind", item.kind],
          ["branches", branches],
        ],
        item.unknowns,
      );
    });

  const items = finalizeItems(rootBranch.items);

  /* -------------------------------- file --------------------------------- */
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
  file.kind = "sequence";
  file.metadata = metadata;
  file.participants = finalParticipants;
  if (autonumber !== undefined) file.autonumber = autonumber;
  file.items = items;
  for (const pend of header.fileUnknowns) {
    file[pend.key] = pend.value;
  }
  return file as SequenceLabFile;
}

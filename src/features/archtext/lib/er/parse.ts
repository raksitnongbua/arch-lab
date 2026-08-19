/**
 * `.alab` ER text → `ErLabFile`. The fifth sibling of the C4 parser in
 * `../parse.ts`, the sequence parser in `../sequence/parse.ts`, the flowchart
 * parser in `../flowchart/parse.ts` and the use-case parser in
 * `../usecase/parse.ts`, sharing their whole substrate — `LineCursor`,
 * `ArchTextParseError`, the `!` escape reader, `[technology]`, `#tag` — so
 * the five grammars cannot drift apart in the parts they share.
 *
 * Line shape (all indentation in spaces, never tabs):
 *
 *   archlab 1.0 er                   ← the document-type discriminant (line 1)
 *   title "Order database"           ← header keywords shared with the other
 *   created 2026-08-01T00:00:00Z       four document types
 *
 *   @er                              ← opens the single diagram body
 *     entity customer "Customer" [PostgreSQL] #billing
 *       desc "Someone who has ordered"  ← entity continuation, BEFORE its attrs
 *       attr id uuid pk              ← columns nest inside the entity
 *       attr email string uk
 *         desc "Login identity"      ← attribute continuation
 *
 *     customer ||--o{ order : places ← relationships, after every entity
 *     order }o..|| address : "ships to"
 *
 * THE DEPTH RULE, the use-case parser's exactly: 0 for header lines and
 * `@er`, 2 for the body, 4 inside an `entity`, and a `desc` / `!`
 * continuation sits one level deeper than the line it continues. Odd indents
 * are an error, not a rounding.
 *
 * WHY `desc` COMES BEFORE THE ATTRIBUTES. An entity's `desc` sits at indent 4
 * and so does an `attr` line, and continuations bind to the LAST item read.
 * Once an `attr` has been read, indent 4 is that attribute's sibling level,
 * not the entity's continuation level. Rather than track two continuation
 * targets at one indent — which would make `desc` after an attribute
 * ambiguous between "describes the entity" and "describes the column" — the
 * grammar requires the entity's description to follow its opener directly,
 * and says so by name when it does not.
 *
 * TWO ORDERING RULES, both inherited: entities before relationships (the
 * model keeps them in separate ordered arrays, so interleaved text could not
 * round-trip byte-identically), and attributes in the order written (column
 * order is a decision the diagram shows on purpose).
 *
 * The header grammar deliberately mirrors `../usecase/parse.ts` line for line
 * rather than importing its private functions — a fifth copy following the
 * C4→sequence→flowchart→use-case precedent, for the precedent's own reason:
 * the error voice names the document type ("not an ER header keyword"), and
 * the raw-key policies are only coincidentally equal today (`ER_META_RAW`
 * imports the set, so THAT cannot drift — only the messages are
 * per-grammar).
 *
 * Every failure throws `ArchTextParseError` naming a 1-based line and column.
 *
 * Imported by `scripts/er-check.mjs` through Node's type stripping: keep the
 * syntax erasable and type-only imports as `import type`.
 */

import type {
  ErAttributeKey,
  ErCardinality,
  ErLabFile,
  ErRelationshipKind,
} from "@/types";

import { newerVersionMessage, SUPPORTED_MAJOR_VERSION } from "@/lib/constants";

import { LineCursor } from "../cursor";
import { DEFAULT_TIMESTAMP } from "../defaults";
import { failAt } from "../errors";
import { FLOWCHART_HEADER_WORD } from "../flowchart/keywords";
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
import { SEQUENCE_HEADER_WORD } from "../sequence/keywords";
import { USECASE_HEADER_WORD } from "../usecase/keywords";
import { BARE_VALUE_RE } from "../text";
import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_KEYWORD,
  BARE_TYPE_PREFIX_RE,
  ENTITY_KEYWORD,
  ER_BLOCK,
  ER_HEADER_WORD,
  KIND_BY_CONNECTOR,
  LEFT_CARDINALITY,
  RELATIONSHIP_TOKEN_RE,
  RESERVED_ER_WORDS,
  RIGHT_CARDINALITY,
} from "./keywords";
import {
  ER_ATTRIBUTE_KEYS,
  ER_ATTRIBUTE_RAW,
  ER_ENTITY_KEYS,
  ER_ENTITY_RAW,
  ER_FILE_KEYS,
  ER_META_RAW,
  ER_RELATIONSHIP_KEYS,
  ER_RELATIONSHIP_RAW,
} from "./schema";

/* -------------------------------------------------------------------------- */
/* Pending structures collected during the line pass                          */
/* -------------------------------------------------------------------------- */

interface PendAttribute extends Loc {
  name: string;
  type: string;
  keys?: ErAttributeKey[];
  description?: string;
  raw: Map<string, Pend>;
  unknowns: Pend[];
}

interface PendEntity extends Loc {
  id: string;
  label: string;
  technology?: string;
  tags?: string[];
  description?: string;
  attributes: PendAttribute[];
  /** Names already used in this entity, for the duplicate-column error —
   * kept beside the array rather than derived on each `attr` line so the
   * error can name the line the first one was written on. */
  attributeByName: Map<string, PendAttribute>;
  /** True once an `attr` has been read, which is what closes the window for
   * this entity's `desc` (see the file header). */
  sawAttribute: boolean;
  raw: Map<string, Pend>;
  unknowns: Pend[];
}

interface PendRelationship extends Loc {
  from: string;
  fromLoc: Loc;
  fromCardinality: ErCardinality;
  to: string;
  toLoc: Loc;
  toCardinality: ErCardinality;
  kind: ErRelationshipKind;
  label?: string;
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

/** What a continuation line (`desc` / `!` one level in) may attach to. */
type Continuable =
  | { kind: "entity"; indent: number; item: PendEntity }
  | { kind: "attribute"; indent: number; item: PendAttribute }
  | { kind: "relationship"; indent: number; item: PendRelationship };

/** The bare form of a relationship label, derived from the shared
 * `BARE_VALUE_RE` the serializer writes with — same symmetry argument as
 * `BARE_TYPE_PREFIX_RE`, and the reason neither class is retyped here. */
const BARE_LABEL_PREFIX_RE = new RegExp(
  BARE_VALUE_RE.source.replace(/\$$/, ""),
);

const ENTITY_KEYS_SET: ReadonlySet<string> = new Set(ER_ENTITY_KEYS);
const ATTRIBUTE_KEYS_SET: ReadonlySet<string> = new Set(ER_ATTRIBUTE_KEYS);
const RELATIONSHIP_KEYS_SET: ReadonlySet<string> = new Set(
  ER_RELATIONSHIP_KEYS,
);

/** `"pk", "fk" or "uk"` — the closed vocabulary, spelled from the one table
 * so an added key names itself in every error mentioning it. */
function attributeKeyList(): string {
  const words = ATTRIBUTE_KEYS.map((key) => `"${key}"`);
  return `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
}

/** An example token, built from the tables, for the "expected a relationship
 * token" error — a menu of all 32 would be unreadable, so the message shows
 * the shape and one instance of it. */
function relationshipTokenHint(): string {
  return `a relationship token — a cardinality (${Object.keys(LEFT_CARDINALITY).join(" ")}), a connector (-- solid, .. dashed), then a mirrored cardinality (${Object.keys(RIGHT_CARDINALITY).join(" ")}), e.g. ||--o{`;
}

/* -------------------------------------------------------------------------- */
/* The parser                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Parses `.alab` ER source into an `ErLabFile`. Pure and deterministic.
 * Throws `ArchTextParseError` (line + column) on any problem —
 * all-or-nothing.
 */
export function parseErText(source: string): ErLabFile {
  const header: Header = {
    metaRaw: new Map(),
    metaUnknowns: [],
    fileUnknowns: [],
  };
  const entities: PendEntity[] = [];
  const entityById = new Map<string, PendEntity>();
  const relationships: PendRelationship[] = [];
  /* Non-null while an `entity` block is open. There is no context stack:
     entities are the only block and they do not nest, so one slot is the
     whole structure. Dedenting to the body indent closes it — no `end`
     keyword. */
  let openEntity: PendEntity | null = null;
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
        `inconsistent indentation of ${indent} space${indent === 1 ? "" : "s"} — ER documents indent 2 spaces per level (0 header, 2 body, +2 inside an entity, +2 for a continuation)`,
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
          `the file must start with an "archlab <version> ${ER_HEADER_WORD}" line, e.g. archlab 1.0 ${ER_HEADER_WORD}`,
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
          `this is a C4 ".alab" header — an ER document must read "archlab ${version} ${ER_HEADER_WORD}"`,
          text.trim().slice(0, 40),
        );
      }
      const wordLoc = { line: lineNo, column: cursor.column };
      const word = cursor.readBare(/^[a-z]+/, `"${ER_HEADER_WORD}"`);
      if (word !== ER_HEADER_WORD) {
        failAt(
          wordLoc.line,
          wordLoc.column,
          word === SEQUENCE_HEADER_WORD
            ? `this is a sequence ".alab" header — an ER document must read "archlab ${version} ${ER_HEADER_WORD}"`
            : word === FLOWCHART_HEADER_WORD
              ? `this is a flowchart ".alab" header — an ER document must read "archlab ${version} ${ER_HEADER_WORD}"`
              : word === USECASE_HEADER_WORD
                ? `this is a use-case ".alab" header — an ER document must read "archlab ${version} ${ER_HEADER_WORD}"`
                : `"${word}" is not a document type — expected "archlab ${version} ${ER_HEADER_WORD}"`,
          word,
        );
      }
      cursor.expectEnd("the header line");
      const major = Number.parseInt(version, 10);
      if (major > SUPPORTED_MAJOR_VERSION) {
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
      if (text.startsWith(ER_BLOCK)) {
        cursor.pos += ER_BLOCK.length;
        cursor.expectEnd(`the "${ER_BLOCK}" line`);
        if (bodyOpened) {
          failAt(
            lineNo,
            1,
            `duplicate "${ER_BLOCK}" — an ER file holds exactly one diagram`,
            ER_BLOCK,
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
          `header lines must appear before "${ER_BLOCK}"`,
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
        `this line is indented, but no "${ER_BLOCK}" block is open above it`,
        text.trim().slice(0, 40),
      );
    }

    /* Continuations bind tighter than block structure: `desc` / `!` exactly
       one level below the last item attach to it. An `attr` line at that
       same indent is NOT a continuation, which is what the keyword test
       below separates — and the reason an entity's `desc` must precede its
       columns (see the file header). */
    if (
      lastItem !== null &&
      indent === lastItem.indent + 2 &&
      (cursor.peek() === "!" || /^desc(\s|$)/.test(text.slice(indent)))
    ) {
      parseContinuation(cursor, lastItem);
      continue;
    }

    /* Dedenting to the body indent closes the open entity. */
    if (openEntity !== null && indent < 4) openEntity = null;
    const itemIndent = openEntity === null ? 2 : 4;
    if (indent !== itemIndent) {
      failAt(
        lineNo,
        indent + 1,
        `inconsistent indentation of ${indent} spaces — expected ${itemIndent} here (2 per level; an entity's columns are one level deeper than its opener)`,
        text.trim().slice(0, 40),
      );
    }

    lastItem = parseBodyLine(cursor, {
      indent,
      openEntity,
      entities,
      entityById,
      relationships,
      openEntityBlock: (entity) => {
        entities.push(entity);
        entityById.set(entity.id, entity);
        openEntity = entity;
      },
    });
  }

  if (!seenContent || header.version === undefined) {
    failAt(
      1,
      1,
      `the file is empty — expected an "archlab <version> ${ER_HEADER_WORD}" line`,
    );
  }
  if (!bodyOpened) {
    failAt(
      1,
      1,
      `the file has no "${ER_BLOCK}" block — add one after the header lines`,
    );
  }

  return resolve(header, entities, entityById, relationships);
}

/* -------------------------------------------------------------------------- */
/* Header lines                                                               */
/* -------------------------------------------------------------------------- */

/** Header keywords: the C4 subset that means the same thing here — the same
 * subset the sequence, flowchart and use-case headers take, for the same
 * reason. The C4 grammar's `tagcolor` / `customicon` / `generator` / `root`
 * lines do NOT exist in an ER header — those fields ride the `! meta.<key>`
 * escape (see `ER_META_RAW` in `./schema.ts` for the why). */
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
        `"${keyword}" is not an ER header keyword — expected archlab, schema, title, ` +
          'description, owner, tags, created, updated or reviewed (other metadata rides "! meta.<key> : <json>")',
        keyword,
      );
  }
  cursor.expectEnd(`the "${keyword}" line`);
}

/** Same table the other four headers use — fields with a dedicated line. */
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
        'ER "! meta.…" paths are exactly one key deep — set whole objects, e.g. ! meta.generator : {"name":"…","version":"…"}',
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
    if (ER_META_RAW.has(key)) {
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
      'top-level "!" paths cannot nest — only "! <key> : <json>" and "! meta.<key> : <json>" are valid in an ER header',
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
  if ((ER_FILE_KEYS as readonly string[]).includes(key)) {
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

interface BodyState {
  indent: number;
  openEntity: PendEntity | null;
  entities: PendEntity[];
  entityById: Map<string, PendEntity>;
  relationships: PendRelationship[];
  openEntityBlock: (entity: PendEntity) => void;
}

function parseBodyLine(
  cursor: LineCursor,
  state: BodyState,
): Continuable | null {
  if (cursor.peek() === "!") {
    cursor.fail(
      `file-level "!" lines belong in the header, before ${ER_BLOCK}`,
    );
  }

  const startLoc = { line: cursor.line, column: cursor.column };
  const quotedStart = cursor.peek() === '"';
  const first = quotedStart
    ? cursor.readQuoted(
        `an "${ENTITY_KEYWORD}" keyword or a relationship source id`,
      )
    : cursor.readBare(
        /^[A-Za-z0-9_][A-Za-z0-9_.-]*/,
        `"${ENTITY_KEYWORD}", "${ATTRIBUTE_KEYWORD}", or a relationship source id`,
      );

  /* Reserved words only act as keywords when written BARE — a quoted
     "entity" is always an id, which is what lets `RESERVED_ER_WORDS` stay a
     reservation on spelling rather than a hole in the id space. */
  if (!quotedStart && RESERVED_ER_WORDS.has(first)) {
    switch (first) {
      case "desc":
        failAt(
          startLoc.line,
          startLoc.column,
          state.openEntity !== null && state.openEntity.sawAttribute
            ? `an entity's "desc" comes directly under its "${ENTITY_KEYWORD}" line, before the first "${ATTRIBUTE_KEYWORD}" — at this indent, after a column, "desc" would be ambiguous between the entity and the column`
            : '"desc" is a continuation — indent it 2 spaces under the line it describes',
          "desc",
        );
        break;
      case ENTITY_KEYWORD:
        return parseEntityOpener(cursor, startLoc, state);
      case ATTRIBUTE_KEYWORD:
        return parseAttributeLine(cursor, startLoc, state);
      default:
        /* "null" — reserved so idToken quoting stays shared with C4. */
        failAt(
          startLoc.line,
          startLoc.column,
          `"${first}" is reserved — quote it ("${first}") to use it as an id`,
          first,
        );
    }
  }

  /* A bare id at the columns' indent is the commonest ER typo: the type was
     written without its keyword. Named here, because the fall-through
     ("expected a relationship token") would blame the relationship grammar
     for a column mistake. */
  if (state.openEntity !== null) {
    failAt(
      startLoc.line,
      startLoc.column,
      `a column line starts with "${ATTRIBUTE_KEYWORD}" — write e.g. ${ATTRIBUTE_KEYWORD} ${first} uuid pk`,
      first,
    );
  }

  cursor.skipSpaces();
  if (cursor.peek() === '"') {
    /* `id "Label"` — an entity line missing its keyword. */
    failAt(
      startLoc.line,
      startLoc.column,
      `an entity line starts with "${ENTITY_KEYWORD}" — write e.g. ${ENTITY_KEYWORD} ${first} ${cursor.foundHere() ?? '"Label"'}`,
      first,
    );
  }
  return parseRelationshipLine(cursor, startLoc, first, state);
}

/* --------------------------------- entities -------------------------------- */

/**
 * `entity customer "Customer" [PostgreSQL] #billing`, with its columns nested
 * one level in.
 *
 * NESTING IS THE MEMBERSHIP — the same argument `boundary` makes in the
 * use-case grammar and `group` in the flowchart grammar. An `attributes=`
 * list on the entity line, or `customer.email` dotted lines at the body
 * indent, would both let a document name columns that are not neighbours in
 * the text, and the serializer could not spell that back.
 */
function parseEntityOpener(
  cursor: LineCursor,
  loc: Loc,
  state: BodyState,
): Continuable {
  if (state.openEntity !== null) {
    failAt(
      loc.line,
      loc.column,
      `"${ENTITY_KEYWORD}" blocks do not nest — close this one by dedenting before opening another`,
      ENTITY_KEYWORD,
    );
  }
  cursor.skipSpaces();
  const idLoc = { line: cursor.line, column: cursor.column };
  const id = cursor.readIdToken("the entity id");
  /* Entities only at the top of the body: the MODEL keeps them in a separate
     ordered array, so text that interleaved them with relationships could
     not round-trip byte-identically — reject it rather than silently
     regroup. */
  if (state.relationships.length > 0) {
    failAt(
      idLoc.line,
      idLoc.column,
      `entity "${id}" is declared after the first relationship — entities come first, so the text order matches the model's entities array`,
      id,
    );
  }
  const existing = state.entityById.get(id);
  if (existing !== undefined) {
    failAt(
      idLoc.line,
      idLoc.column,
      `duplicate entity id "${id}" — already declared on line ${existing.line}`,
      id,
    );
  }
  cursor.skipSpaces();
  const label = cursor.readQuoted("the entity label");
  if (label === "") cursor.fail("the entity label must not be empty");

  const entity: PendEntity = {
    ...loc,
    id,
    label,
    attributes: [],
    attributeByName: new Map(),
    sawAttribute: false,
    raw: new Map(),
    unknowns: [],
  };
  /* `[technology]` then `#tag`s, the same spelling as a C4 node line — one
     vocabulary across the document kinds, so someone who has written one can
     write the other without a second lookup. */
  for (;;) {
    cursor.skipSpaces();
    if (cursor.atEnd()) break;
    const attrLoc = { line: cursor.line, column: cursor.column };
    if (cursor.peek() === "[") {
      if (entity.technology !== undefined) {
        failAt(
          attrLoc.line,
          attrLoc.column,
          "duplicate [technology] attribute",
        );
      }
      entity.technology = readTechnology(cursor);
      continue;
    }
    if (cursor.peek() === "#") {
      entity.tags = entity.tags ?? [];
      entity.tags.push(readTag(cursor));
      continue;
    }
    break;
  }
  cursor.expectEnd("the entity line");
  state.openEntityBlock(entity);
  return { kind: "entity", indent: cursor.text.search(/\S/), item: entity };
}

/* -------------------------------- attributes ------------------------------- */

/**
 * `attr id uuid pk fk` — name, then type, then zero or more key roles.
 *
 * NAME BEFORE TYPE, where Mermaid writes type before name. The name is what a
 * reader looks for and what every other line in this format leads with
 * (`entity order`, `actor customer`), and the Mermaid mapping swaps the two
 * in one place rather than the whole family reading backwards for one kind.
 */
function parseAttributeLine(
  cursor: LineCursor,
  loc: Loc,
  state: BodyState,
): Continuable {
  const entity = state.openEntity;
  if (entity === null) {
    failAt(
      loc.line,
      loc.column,
      `"${ATTRIBUTE_KEYWORD}" describes a column, so it belongs inside an "${ENTITY_KEYWORD}" — indent it 2 spaces under one`,
      ATTRIBUTE_KEYWORD,
    );
  }
  cursor.skipSpaces();
  const nameLoc = { line: cursor.line, column: cursor.column };
  const name = cursor.readIdToken("the column name");
  const duplicate = entity.attributeByName.get(name);
  if (duplicate !== undefined) {
    failAt(
      nameLoc.line,
      nameLoc.column,
      `duplicate column "${name}" in entity "${entity.id}" — already declared on line ${duplicate.line}`,
      name,
    );
  }
  cursor.skipSpaces();
  if (cursor.atEnd()) {
    cursor.fail(
      `the column type — every column is drawn with one, e.g. ${ATTRIBUTE_KEYWORD} ${name} uuid`,
    );
  }
  /* Free text, quoted only when `BARE_TYPE_RE` cannot spell it (a space, or
     a character outside the SQL-type set). The type vocabulary is every
     database's, so it is read verbatim and never interpreted — see
     `ErAttribute.type`. The bare class is the SERIALIZER's class, imported
     rather than restated: a type this reads bare but the serializer would
     quote back is a round-trip break. */
  const type =
    cursor.peek() === '"'
      ? cursor.readQuoted("the column type")
      : cursor.readBare(BARE_TYPE_PREFIX_RE, "the column type");
  if (type === "") cursor.fail("the column type must not be empty");

  const attribute: PendAttribute = {
    ...loc,
    name,
    type,
    raw: new Map(),
    unknowns: [],
  };

  for (;;) {
    cursor.skipSpaces();
    if (cursor.atEnd()) break;
    const keyLoc = { line: cursor.line, column: cursor.column };
    const word = cursor.readBare(
      /^[a-z]+/,
      `a key role — ${attributeKeyList()}`,
    );
    if (!(ATTRIBUTE_KEYS as readonly string[]).includes(word)) {
      failAt(
        keyLoc.line,
        keyLoc.column,
        `"${word}" is not a key role — the vocabulary is closed: ${attributeKeyList()}`,
        word,
      );
    }
    const key = word as ErAttributeKey;
    attribute.keys = attribute.keys ?? [];
    if (attribute.keys.includes(key)) {
      failAt(
        keyLoc.line,
        keyLoc.column,
        `"${key}" is listed twice on column "${name}" — each key role may appear once`,
        key,
      );
    }
    attribute.keys.push(key);
  }
  cursor.expectEnd("the column line");

  entity.attributes.push(attribute);
  entity.attributeByName.set(name, attribute);
  entity.sawAttribute = true;
  return {
    kind: "attribute",
    indent: cursor.text.search(/\S/),
    item: attribute,
  };
}

/* ------------------------------ relationships ------------------------------ */

function parseRelationshipLine(
  cursor: LineCursor,
  loc: Loc,
  from: string,
  state: BodyState,
): Continuable {
  const tokenLoc = { line: cursor.line, column: cursor.column };
  const match = RELATIONSHIP_TOKEN_RE.exec(cursor.text.slice(cursor.pos));
  if (match === null) {
    failAt(
      tokenLoc.line,
      tokenLoc.column,
      `expected ${relationshipTokenHint()}`,
      cursor.foundHere(),
    );
  }
  const [token, leftGlyph, connector, rightGlyph] = match;
  cursor.pos += token.length;

  cursor.skipSpaces();
  const toLoc = { line: cursor.line, column: cursor.column };
  const to = cursor.readIdToken("the target entity id");

  const relationship: PendRelationship = {
    ...loc,
    from,
    fromLoc: loc,
    fromCardinality: LEFT_CARDINALITY[leftGlyph],
    to,
    toLoc,
    toCardinality: RIGHT_CARDINALITY[rightGlyph],
    kind: KIND_BY_CONNECTOR[connector],
    raw: new Map(),
    unknowns: [],
  };

  /* The label is OPTIONAL, unlike Mermaid's, which requires `""` when there
     is nothing to say — see `ErRelationship.label`. Bare verbs are allowed
     unquoted (`: places`) because the commonest label is one word and
     quoting it is noise; anything with a space takes quotes. */
  cursor.skipSpaces();
  if (!cursor.atEnd()) {
    cursor.expect(
      ":",
      '":" before the relationship label — or nothing, for an unlabelled line',
    );
    cursor.skipSpaces();
    const label =
      cursor.peek() === '"'
        ? cursor.readQuoted("the relationship label")
        : cursor.readBare(BARE_LABEL_PREFIX_RE, "the relationship label");
    if (label === "") {
      cursor.fail(
        'the relationship label must not be empty — omit the ":" instead',
      );
    }
    relationship.label = label;
  }
  cursor.expectEnd("the relationship line");
  state.relationships.push(relationship);
  return {
    kind: "relationship",
    indent: cursor.text.search(/\S/),
    item: relationship,
  };
}

/* ----------------------------- continuations ------------------------------ */

function parseContinuation(cursor: LineCursor, target: Continuable): void {
  if (cursor.peek() !== "!") {
    const loc = { line: cursor.line, column: cursor.column };
    cursor.pos += "desc".length;
    /* Relationships have no description field: the label is the whole
       annotation a line carries, and detail belongs on the entities it
       joins — the same call the use-case grammar makes about edges. */
    if (target.kind === "relationship") {
      failAt(
        loc.line,
        loc.column,
        "relationships have no description — put detail on the entities the line joins",
      );
    }
    if (target.item.description !== undefined) {
      failAt(
        loc.line,
        loc.column,
        `duplicate "desc" line for this ${target.kind}`,
      );
    }
    cursor.skipSpaces();
    target.item.description = cursor.readQuoted(
      `the ${target.kind} description`,
    );
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
  const [rawAllowed, known] =
    target.kind === "entity"
      ? ([ER_ENTITY_RAW, ENTITY_KEYS_SET] as const)
      : target.kind === "attribute"
        ? ([ER_ATTRIBUTE_RAW, ATTRIBUTE_KEYS_SET] as const)
        : ([ER_RELATIONSHIP_RAW, RELATIONSHIP_KEYS_SET] as const);
  if (rawAllowed.has(key)) {
    if (target.item.raw.has(key)) {
      failAt(first.line, first.column, `duplicate "!" line for "${key}"`);
    }
    target.item.raw.set(key, pend);
  } else if (known.has(key)) {
    failAt(
      first.line,
      first.column,
      `"${key}" has dedicated syntax on the ${target.kind} line — it cannot be set with a "!" line`,
    );
  } else {
    if (target.item.unknowns.some((p) => p.key === key)) {
      failAt(first.line, first.column, `duplicate "!" line for "${key}"`);
    }
    target.item.unknowns.push(pend);
  }
}

/* -------------------------------------------------------------------------- */
/* Resolve pass                                                               */
/* -------------------------------------------------------------------------- */

function resolve(
  header: Header,
  entities: PendEntity[],
  entityById: Map<string, PendEntity>,
  relationships: PendRelationship[],
): ErLabFile {
  if (header.title === undefined) {
    failAt(
      1,
      1,
      'the file has no title — add a line like: title "Order database"',
    );
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

  /* ------------------------------- entities ------------------------------ */
  const finalEntities = entities.map((entity) => {
    const pairs: (readonly [string, unknown])[] = [];
    const add = (key: string, value: unknown): void => {
      if (value !== undefined) pairs.push([key, value]);
    };
    add("id", entity.id);
    add("label", entity.label);
    add("technology", pick(entity.technology, entity.raw, "technology"));
    add("tags", pick(entity.tags, entity.raw, "tags"));
    add("description", pick(entity.description, entity.raw, "description"));
    /* Omitted when the entity draws no columns: an empty array and no array
       would be two spellings of "no columns", and the serializer writes
       neither. */
    if (entity.attributes.length > 0) {
      add(
        "attributes",
        entity.attributes.map((attribute) => {
          const attrPairs: (readonly [string, unknown])[] = [
            ["name", attribute.name],
            ["type", attribute.type],
          ];
          if (attribute.keys !== undefined) {
            attrPairs.push(["keys", attribute.keys]);
          }
          const description = pick(
            attribute.description,
            attribute.raw,
            "description",
          );
          if (description !== undefined) {
            attrPairs.push(["description", description]);
          }
          return assemble(attrPairs, attribute.unknowns);
        }),
      );
    }
    return assemble(pairs, entity.unknowns);
  });

  /* ---------------------------- relationships ---------------------------- */
  const requireEntity = (id: string, at: Loc, what: string): PendEntity => {
    const entity = entityById.get(id);
    if (entity === undefined) {
      failAt(
        at.line,
        at.column,
        `the ${what} "${id}" does not resolve to an entity — declare it at the top of the ${ER_BLOCK} body`,
        id,
      );
    }
    return entity;
  };
  const finalRelationships = relationships.map((relationship) => {
    requireEntity(
      relationship.from,
      relationship.fromLoc,
      "relationship source",
    );
    requireEntity(relationship.to, relationship.toLoc, "relationship target");
    const pairs: (readonly [string, unknown])[] = [
      ["from", relationship.from],
      ["fromCardinality", relationship.fromCardinality],
      ["to", relationship.to],
      ["toCardinality", relationship.toCardinality],
      ["kind", relationship.kind],
    ];
    const label = pick(relationship.label, relationship.raw, "label");
    if (label !== undefined) pairs.push(["label", label]);
    return assemble(pairs, relationship.unknowns);
  });

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
  file.kind = "er";
  file.metadata = metadata;
  file.entities = finalEntities;
  file.relationships = finalRelationships;
  for (const pend of header.fileUnknowns) {
    file[pend.key] = pend.value;
  }
  return file as ErLabFile;
}

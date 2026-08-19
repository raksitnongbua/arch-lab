/**
 * `.alab` dictionary text → `DictLabFile`. The sixth sibling, sharing the whole
 * substrate — `LineCursor`, `ArchTextParseError`, the `!` escape reader,
 * `[technology]`, `#tag` — so the six grammars cannot drift apart where they
 * overlap.
 *
 * Line shape (all indentation in spaces, never tabs):
 *
 *   archlab 1.0 dict
 *   title "Customer API"
 *
 *   @dict
 *     section "Customer" [REST payload] #core
 *       desc "What every customer endpoint returns"   ← BEFORE the fields
 *       field id uuid required unique
 *         desc "Stable identifier, never reused"
 *         source "accounts.customer.id"
 *         values "RFC 4122"
 *         example "9f2a1c"
 *
 * THE DEPTH RULE, the ER parser's exactly: 0 for header lines and `@dict`, 2 a
 * section, 4 a field, 6 a field's continuations. Odd indents are an error.
 *
 * WHY A SECTION'S `desc` PRECEDES ITS FIELDS: it sits at indent 4 and so does a
 * `field` line, and continuations bind to the last item read — so after a field,
 * indent 4 is that field's sibling level. Rather than track two continuation
 * targets at one indent, the grammar requires the section's description to
 * follow its opener directly, and names the mistake when it does not. Identical
 * to the ER grammar's entity rule.
 *
 * NO EDGE LINES AT ALL, which makes this the shortest grammar in the family: a
 * dictionary connects nothing, so there is no token to tokenize and no endpoint
 * to resolve. The resolve pass does no reference checking.
 *
 * Every failure throws `ArchTextParseError` naming a 1-based line and column.
 *
 * Imported by `scripts/dict-check.mjs` through Node's type stripping: keep the
 * syntax erasable and type-only imports as `import type`.
 */

import type { DictFieldFlag, DictLabFile } from "@/types";

import { newerVersionMessage, SUPPORTED_MAJOR_VERSION } from "@/lib/constants";

import { LineCursor } from "../cursor";
import { DEFAULT_TIMESTAMP } from "../defaults";
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
  readTechnology,
  segString,
} from "../parse";
import type { Loc, Pend } from "../parse";
import { META_KEYS } from "../schema";
import { SEQUENCE_HEADER_WORD } from "../sequence/keywords";
import { USECASE_HEADER_WORD } from "../usecase/keywords";
import {
  BARE_DICT_TYPE_PREFIX_RE,
  DICT_BLOCK,
  DICT_HEADER_WORD,
  FIELD_DETAIL_KEYS,
  FIELD_FLAGS,
  FIELD_KEYWORD,
  RESERVED_DICT_WORDS,
  SECTION_KEYWORD,
} from "./keywords";
import {
  DICT_FIELD_KEYS,
  DICT_FIELD_RAW,
  DICT_FILE_KEYS,
  DICT_META_RAW,
  DICT_SECTION_KEYS,
  DICT_SECTION_RAW,
} from "./schema";

/* -------------------------------------------------------------------------- */
/* Pending structures                                                         */
/* -------------------------------------------------------------------------- */

interface PendField extends Loc {
  name: string;
  type: string;
  flags?: DictFieldFlag[];
  description?: string;
  source?: string;
  values?: string;
  example?: string;
  raw: Map<string, Pend>;
  unknowns: Pend[];
}

interface PendSection extends Loc {
  label: string;
  technology?: string;
  tags?: string[];
  description?: string;
  fields: PendField[];
  fieldByName: Map<string, PendField>;
  /** True once a `field` has been read, which closes this section's `desc`
   * window (see the file header). */
  sawField: boolean;
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
  | { kind: "section"; indent: number; item: PendSection }
  | { kind: "field"; indent: number; item: PendField };

const SECTION_KEYS_SET: ReadonlySet<string> = new Set(DICT_SECTION_KEYS);
const FIELD_KEYS_SET: ReadonlySet<string> = new Set(DICT_FIELD_KEYS);

/** `"required", "unique", "derived", "pii" or "deprecated"` — from the one
 * table, so an added flag names itself in every error mentioning it. */
function flagList(): string {
  const words = FIELD_FLAGS.map((flag) => `"${flag}"`);
  return `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
}

/* -------------------------------------------------------------------------- */
/* The parser                                                                 */
/* -------------------------------------------------------------------------- */

/** Parses `.alab` dictionary source. Pure, deterministic, all-or-nothing. */
export function parseDictText(source: string): DictLabFile {
  const header: Header = {
    metaRaw: new Map(),
    metaUnknowns: [],
    fileUnknowns: [],
  };
  const sections: PendSection[] = [];
  const sectionByLabel = new Map<string, PendSection>();
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
        `inconsistent indentation of ${indent} space${indent === 1 ? "" : "s"} — dictionary documents indent 2 spaces per level (0 header, 2 section, 4 field, 6 for a continuation)`,
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
          `the file must start with an "archlab <version> ${DICT_HEADER_WORD}" line, e.g. archlab 1.0 ${DICT_HEADER_WORD}`,
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
          `this is a C4 ".alab" header — a dictionary must read "archlab ${version} ${DICT_HEADER_WORD}"`,
          text.trim().slice(0, 40),
        );
      }
      const wordLoc = { line: lineNo, column: cursor.column };
      const word = cursor.readBare(/^[a-z]+/, `"${DICT_HEADER_WORD}"`);
      if (word !== DICT_HEADER_WORD) {
        const named: Record<string, string> = {
          [SEQUENCE_HEADER_WORD]: "sequence",
          [FLOWCHART_HEADER_WORD]: "flowchart",
          [USECASE_HEADER_WORD]: "use-case",
          [ER_HEADER_WORD]: "ER",
        };
        failAt(
          wordLoc.line,
          wordLoc.column,
          named[word] !== undefined
            ? `this is ${named[word] === "ER" ? "an" : "a"} ${named[word]} ".alab" header — a dictionary must read "archlab ${version} ${DICT_HEADER_WORD}"`
            : `"${word}" is not a document type — expected "archlab ${version} ${DICT_HEADER_WORD}"`,
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
      if (text.startsWith(DICT_BLOCK)) {
        cursor.pos += DICT_BLOCK.length;
        cursor.expectEnd(`the "${DICT_BLOCK}" line`);
        if (bodyOpened) {
          failAt(
            lineNo,
            1,
            `duplicate "${DICT_BLOCK}" — a dictionary file holds exactly one dictionary`,
            DICT_BLOCK,
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
          `header lines must appear before "${DICT_BLOCK}"`,
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
        `this line is indented, but no "${DICT_BLOCK}" block is open above it`,
        text.trim().slice(0, 40),
      );
    }

    /* Continuations bind tighter than block structure. The detail keywords are
       read from the ONE table, so adding a fifth cannot leave the dispatch
       behind. */
    const firstWord = /^([a-z]+)(\s|$)/.exec(text.slice(indent))?.[1];
    const isContinuation =
      cursor.peek() === "!" ||
      firstWord === "desc" ||
      (firstWord !== undefined && FIELD_DETAIL_KEYS[firstWord] !== undefined);
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
        `inconsistent indentation of ${indent} spaces — expected ${itemIndent} here (2 per level; a section's fields are one level deeper than its opener)`,
        text.trim().slice(0, 40),
      );
    }

    lastItem = parseBodyLine(cursor, {
      openSection,
      sections,
      sectionByLabel,
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
      `the file is empty — expected an "archlab <version> ${DICT_HEADER_WORD}" line`,
    );
  }
  if (!bodyOpened) {
    failAt(
      1,
      1,
      `the file has no "${DICT_BLOCK}" block — add one after the header lines`,
    );
  }

  return resolve(header, sections);
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
        `"${keyword}" is not a dictionary header keyword — expected archlab, schema, title, ` +
          'description, owner, tags, created, updated or reviewed (other metadata rides "! meta.<key> : <json>")',
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
        'dictionary "! meta.…" paths are exactly one key deep — set whole objects, e.g. ! meta.generator : {"name":"…"}',
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
    if (DICT_META_RAW.has(key)) {
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
      'top-level "!" paths cannot nest — only "! <key> : <json>" and "! meta.<key> : <json>" are valid in a dictionary header',
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
  if ((DICT_FILE_KEYS as readonly string[]).includes(key)) {
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
  openSection: PendSection | null;
  sections: PendSection[];
  sectionByLabel: Map<string, PendSection>;
  openSectionBlock: (section: PendSection) => void;
}

function parseBodyLine(cursor: LineCursor, state: BodyState): Continuable {
  if (cursor.peek() === "!") {
    cursor.fail(
      `file-level "!" lines belong in the header, before ${DICT_BLOCK}`,
    );
  }

  const startLoc = { line: cursor.line, column: cursor.column };
  const quotedStart = cursor.peek() === '"';
  const first = quotedStart
    ? cursor.readQuoted(`"${SECTION_KEYWORD}" or "${FIELD_KEYWORD}"`)
    : cursor.readBare(
        /^[A-Za-z0-9_][A-Za-z0-9_.-]*/,
        `"${SECTION_KEYWORD}" or "${FIELD_KEYWORD}"`,
      );

  if (!quotedStart && RESERVED_DICT_WORDS.has(first)) {
    switch (first) {
      case SECTION_KEYWORD:
        return parseSectionOpener(cursor, startLoc, state);
      case FIELD_KEYWORD:
        return parseFieldLine(cursor, startLoc, state);
      case "desc":
        failAt(
          startLoc.line,
          startLoc.column,
          state.openSection !== null && state.openSection.sawField
            ? `a section's "desc" comes directly under its "${SECTION_KEYWORD}" line, before the first "${FIELD_KEYWORD}" — at this indent, after a field, "desc" would be ambiguous between the section and the field`
            : '"desc" is a continuation — indent it 2 spaces under the line it describes',
          "desc",
        );
        break;
      default:
        failAt(
          startLoc.line,
          startLoc.column,
          FIELD_DETAIL_KEYS[first] !== undefined
            ? `"${first}" is a continuation — indent it 2 spaces under the "${FIELD_KEYWORD}" it describes`
            : `"${first}" is reserved — quote it ("${first}") to use it as a name`,
          first,
        );
    }
  }

  failAt(
    startLoc.line,
    startLoc.column,
    state.openSection === null
      ? `a dictionary body holds "${SECTION_KEYWORD}" blocks — write e.g. ${SECTION_KEYWORD} "Customer"`
      : `a field line starts with "${FIELD_KEYWORD}" — write e.g. ${FIELD_KEYWORD} ${first} uuid required`,
    first,
  );
}

/**
 * `section "Customer" [REST payload] #core`, with its fields nested one level
 * in. NESTING IS THE MEMBERSHIP, the argument `ErEntity` makes about its
 * attributes: a field belonging to no section is unspellable rather than
 * merely rejected.
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
      `"${SECTION_KEYWORD}" blocks do not nest — close this one by dedenting before opening another`,
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
      `the "${SECTION_KEYWORD}" label must not be empty — the heading names the group of fields`,
    );
  }
  const existing = state.sectionByLabel.get(label);
  if (existing !== undefined) {
    failAt(
      labelLoc.line,
      labelLoc.column,
      `duplicate section ${JSON.stringify(label)} — already declared on line ${existing.line}. A reader cites a section by its heading, so two with one name is one the reader cannot name.`,
      label,
    );
  }

  const section: PendSection = {
    ...loc,
    label,
    fields: [],
    fieldByName: new Map(),
    sawField: false,
    raw: new Map(),
    unknowns: [],
  };
  for (;;) {
    cursor.skipSpaces();
    if (cursor.atEnd()) break;
    const attrLoc = { line: cursor.line, column: cursor.column };
    if (cursor.peek() === "[") {
      if (section.technology !== undefined) {
        failAt(
          attrLoc.line,
          attrLoc.column,
          "duplicate [technology] attribute",
        );
      }
      section.technology = readTechnology(cursor);
      continue;
    }
    if (cursor.peek() === "#") {
      section.tags = section.tags ?? [];
      section.tags.push(readTag(cursor));
      continue;
    }
    break;
  }
  cursor.expectEnd(`the "${SECTION_KEYWORD}" line`);
  state.openSectionBlock(section);
  return { kind: "section", indent: cursor.text.search(/\S/), item: section };
}

/** `field id uuid required unique` — name, type, then zero or more flags. */
function parseFieldLine(
  cursor: LineCursor,
  loc: Loc,
  state: BodyState,
): Continuable {
  const section = state.openSection;
  if (section === null) {
    failAt(
      loc.line,
      loc.column,
      `"${FIELD_KEYWORD}" documents one field, so it belongs inside a "${SECTION_KEYWORD}" — indent it 2 spaces under one`,
      FIELD_KEYWORD,
    );
  }
  cursor.skipSpaces();
  const nameLoc = { line: cursor.line, column: cursor.column };
  const name = cursor.readIdToken("the field name");
  const duplicate = section.fieldByName.get(name);
  if (duplicate !== undefined) {
    failAt(
      nameLoc.line,
      nameLoc.column,
      `duplicate field "${name}" in section ${JSON.stringify(section.label)} — already declared on line ${duplicate.line}`,
      name,
    );
  }
  cursor.skipSpaces();
  if (cursor.atEnd()) {
    cursor.fail(
      `the field type — every field is drawn with one, e.g. ${FIELD_KEYWORD} ${name} uuid`,
    );
  }
  /* Bare when `BARE_DICT_TYPE_RE` accepts it, quoted otherwise. Both sides read
     the one constant, so what parses bare serializes bare. */
  const type =
    cursor.peek() === '"'
      ? cursor.readQuoted("the field type")
      : cursor.readBare(BARE_DICT_TYPE_PREFIX_RE, "the field type");
  if (type === "") cursor.fail("the field type must not be empty");

  const field: PendField = {
    ...loc,
    name,
    type,
    raw: new Map(),
    unknowns: [],
  };

  for (;;) {
    cursor.skipSpaces();
    if (cursor.atEnd()) break;
    const flagLoc = { line: cursor.line, column: cursor.column };
    const word = cursor.readBare(/^[a-z]+/, `a flag — ${flagList()}`);
    if (!(FIELD_FLAGS as readonly string[]).includes(word)) {
      failAt(
        flagLoc.line,
        flagLoc.column,
        `"${word}" is not a field flag — the vocabulary is closed: ${flagList()}`,
        word,
      );
    }
    const flag = word as DictFieldFlag;
    field.flags = field.flags ?? [];
    if (field.flags.includes(flag)) {
      failAt(
        flagLoc.line,
        flagLoc.column,
        `"${flag}" is listed twice on field "${name}" — each flag may appear once`,
        flag,
      );
    }
    field.flags.push(flag);
  }
  cursor.expectEnd("the field line");

  section.fields.push(field);
  section.fieldByName.set(name, field);
  section.sawField = true;
  return { kind: "field", indent: cursor.text.search(/\S/), item: field };
}

/* ----------------------------- continuations ------------------------------ */

function parseContinuation(cursor: LineCursor, target: Continuable): void {
  if (cursor.peek() !== "!") {
    const loc = { line: cursor.line, column: cursor.column };
    const keyword = cursor.readBare(/^[a-z]+/, "a continuation keyword");
    cursor.skipSpaces();

    if (keyword === "desc") {
      if (target.item.description !== undefined) {
        failAt(
          loc.line,
          loc.column,
          `duplicate "desc" line for this ${target.kind}`,
        );
      }
      target.item.description = cursor.readQuoted(
        `the ${target.kind} description`,
      );
      cursor.expectEnd('the "desc" line');
      return;
    }

    const key = FIELD_DETAIL_KEYS[keyword];
    if (key === undefined) {
      failAt(
        loc.line,
        loc.column,
        `"${keyword}" is not a continuation keyword — expected desc, ${Object.keys(FIELD_DETAIL_KEYS).join(", ")}`,
        keyword,
      );
    }
    /* Only a FIELD has provenance. A section's `source` would be a claim about
       every field it holds, which is not what the word means and not something
       the renderer has anywhere to draw. */
    if (target.kind !== "field") {
      failAt(
        loc.line,
        loc.column,
        `"${keyword}" describes one field, not a whole section — put it under a "${FIELD_KEYWORD}" line`,
        keyword,
      );
    }
    const slot = key as "source" | "values" | "example";
    if (target.item[slot] !== undefined) {
      failAt(
        loc.line,
        loc.column,
        `duplicate "${keyword}" line for this field`,
      );
    }
    target.item[slot] = cursor.readQuoted(`the ${keyword} text`);
    cursor.expectEnd(`the "${keyword}" line`);
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
    target.kind === "section"
      ? ([DICT_SECTION_RAW, SECTION_KEYS_SET] as const)
      : ([DICT_FIELD_RAW, FIELD_KEYS_SET] as const);
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
/* Resolve                                                                    */
/* -------------------------------------------------------------------------- */

function resolve(header: Header, sections: PendSection[]): DictLabFile {
  if (header.title === undefined) {
    failAt(
      1,
      1,
      'the file has no title — add a line like: title "Customer API"',
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

  const finalSections = sections.map((section) => {
    if (section.fields.length === 0) {
      failAt(
        section.line,
        section.column,
        `the section ${JSON.stringify(section.label)} documents no fields — indent them 2 spaces under it, or remove the section`,
        SECTION_KEYWORD,
      );
    }
    const pairs: (readonly [string, unknown])[] = [["label", section.label]];
    const add = (key: string, value: unknown): void => {
      if (value !== undefined) pairs.push([key, value]);
    };
    add("technology", pick(section.technology, section.raw, "technology"));
    add("tags", pick(section.tags, section.raw, "tags"));
    add("description", pick(section.description, section.raw, "description"));
    pairs.push([
      "fields",
      section.fields.map((field) => {
        const fieldPairs: (readonly [string, unknown])[] = [
          ["name", field.name],
          ["type", field.type],
        ];
        if (field.flags !== undefined) fieldPairs.push(["flags", field.flags]);
        for (const key of [
          "description",
          "source",
          "values",
          "example",
        ] as const) {
          const value = pick(field[key], field.raw, key);
          if (value !== undefined) fieldPairs.push([key, value]);
        }
        return assemble(fieldPairs, field.unknowns);
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
  file.kind = "dict";
  file.metadata = metadata;
  file.sections = finalSections;
  for (const pend of header.fileUnknowns) file[pend.key] = pend.value;
  return file as DictLabFile;
}

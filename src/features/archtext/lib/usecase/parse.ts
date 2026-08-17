/**
 * `.alab` use-case text → `UseCaseLabFile`. The fourth sibling of the C4
 * parser in `../parse.ts`, the sequence parser in `../sequence/parse.ts` and
 * the flowchart parser in `../flowchart/parse.ts`, sharing their whole
 * substrate — `LineCursor`, `ArchTextParseError`, the `!` escape reader,
 * `[technology]`, `#tag`, `tint=` — so the four grammars cannot drift apart
 * in the parts they share.
 *
 * Line shape (all indentation in spaces, never tabs):
 *
 *   archlab 1.0 usecase              ← the document-type discriminant (line 1)
 *   title "Food delivery"            ← header keywords shared with the other
 *   created 2026-08-01T00:00:00Z       three document types
 *
 *   @usecase                         ← opens the single diagram body
 *     actor customer "Customer"      ← elements (declared before any edge),
 *     boundary "Delivery" tint=#bfdfff  keyword-first: the kind is the verb
 *       usecase order "Place an order"  ← boundary members nest inside it
 *
 *     customer -- order : "1..*"     ← association (undirected; optional tail)
 *     order ..> pay : include        ← dependency (stereotype REQUIRED)
 *     admin --|> customer            ← generalization (no tail)
 *
 * THE DEPTH RULE, the flowchart's exactly, because nothing here recurses
 * either: 0 for header lines and `@usecase`, 2 for the body, 4 inside a
 * `boundary`, and a `desc` / `!` continuation sits one level deeper than the
 * line it continues. Odd indents are an error, not a rounding.
 *
 * The header grammar deliberately mirrors `../flowchart/parse.ts` line for
 * line rather than importing its private functions — a fourth copy following
 * the C4→sequence→flowchart precedent, for the precedent's own reason: the
 * error voice names the document type ("not a use-case header keyword"), and
 * the raw-key policies are only coincidentally equal today
 * (`USECASE_META_RAW` imports the set, so THAT cannot drift — only the
 * messages are per-grammar). Four copies is the point at which a shared
 * abstraction starts to tempt; it is still refused here because the copies
 * differ exactly where a parameterised version would need per-grammar
 * message tables, which is the same duplication wearing a costume.
 *
 * Every failure throws `ArchTextParseError` naming a 1-based line and
 * column; a parse is all-or-nothing.
 *
 * Imported by `scripts/usecase-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import type {
  UseCaseDependencyStereotype,
  UseCaseEdgeKind,
  UseCaseElementKind,
  UseCaseLabFile,
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
import { readTintAttribute } from "../sequence/parse";
import { SEQUENCE_HEADER_WORD } from "../sequence/keywords";
import {
  BOUNDARY_KEYWORD,
  DEPENDENCY_STEREOTYPES,
  ELEMENT_KIND_BY_KEYWORD,
  RESERVED_USECASE_WORDS,
  TOKEN_BY_EDGE_KIND,
  USECASE_BLOCK,
  USECASE_EDGE_TOKENS,
  USECASE_HEADER_WORD,
} from "./keywords";
import {
  USECASE_BOUNDARY_KEYS,
  USECASE_BOUNDARY_RAW,
  USECASE_EDGE_KEYS,
  USECASE_EDGE_RAW,
  USECASE_ELEMENT_KEYS,
  USECASE_ELEMENT_RAW,
  USECASE_FILE_KEYS,
  USECASE_META_RAW,
} from "./schema";

/* -------------------------------------------------------------------------- */
/* Pending structures collected during the line pass                          */
/* -------------------------------------------------------------------------- */

interface PendElement extends Loc {
  id: string;
  kind: UseCaseElementKind;
  label: string;
  technology?: string;
  tags?: string[];
  description?: string;
  raw: Map<string, Pend>;
  unknowns: Pend[];
}

/* One pending shape for all three edge kinds — the fields a kind cannot
   carry are refused at read time, so an unspellable combination never
   reaches the resolve pass. */
interface PendEdge extends Loc {
  kind: UseCaseEdgeKind;
  from: string;
  fromLoc: Loc;
  to: string;
  toLoc: Loc;
  label?: string;
  stereotype?: UseCaseDependencyStereotype;
  raw: Map<string, Pend>;
  unknowns: Pend[];
}

/** One open `boundary` block. Its members are the `usecase` lines nested
 * inside it, collected in text order — which is what makes a boundary
 * contiguous by construction rather than by a check. */
interface PendBoundary extends Loc {
  label: string;
  tint?: string;
  usecases: string[];
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

/** What a continuation line (`desc` / `!` at indent + 2) may attach to. */
type Continuable =
  | { kind: "element"; indent: number; item: PendElement }
  | { kind: "edge"; indent: number; item: PendEdge };

const ELEMENT_KEYS_SET: ReadonlySet<string> = new Set(USECASE_ELEMENT_KEYS);
const EDGE_KEYS_SET: ReadonlySet<string> = new Set(USECASE_EDGE_KEYS);

/** `"include" or "extend"` — the closed vocabulary, spelled from the one
 * table so an added stereotype names itself in every error mentioning it. */
function stereotypeList(): string {
  return DEPENDENCY_STEREOTYPES.map((word) => `"${word}"`).join(" or ");
}

/** `"--|>", "..>" or "--"` — the token menu, from the one ordered table. */
function edgeTokenList(): string {
  const tokens = USECASE_EDGE_TOKENS.map(([token]) => `"${token}"`);
  return `${tokens.slice(0, -1).join(", ")} or ${tokens[tokens.length - 1]}`;
}

/* -------------------------------------------------------------------------- */
/* The parser                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Parses `.alab` use-case source into a `UseCaseLabFile`. Pure and
 * deterministic. Throws `ArchTextParseError` (line + column) on any problem
 * — all-or-nothing.
 */
export function parseUseCaseText(source: string): UseCaseLabFile {
  const header: Header = {
    metaRaw: new Map(),
    metaUnknowns: [],
    fileUnknowns: [],
  };
  const elements: PendElement[] = [];
  const elementById = new Map<string, PendElement>();
  const boundaries: PendBoundary[] = [];
  const edges: PendEdge[] = [];
  /* Non-null while a `boundary` block is open. There is no context stack: a
     boundary is the only block and boundaries do not nest, so one slot is
     the whole structure. Dedenting to the body indent closes it — no `end`
     keyword. */
  let openBoundary: PendBoundary | null = null;
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
        `inconsistent indentation of ${indent} space${indent === 1 ? "" : "s"} — use-case documents indent 2 spaces per level (0 header, 2 body, +2 inside a boundary, +2 for a continuation)`,
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
          `the file must start with an "archlab <version> ${USECASE_HEADER_WORD}" line, e.g. archlab 1.0 ${USECASE_HEADER_WORD}`,
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
          `this is a C4 ".alab" header — a use-case document must read "archlab ${version} ${USECASE_HEADER_WORD}"`,
          text.trim().slice(0, 40),
        );
      }
      const wordLoc = { line: lineNo, column: cursor.column };
      const word = cursor.readBare(/^[a-z]+/, `"${USECASE_HEADER_WORD}"`);
      if (word !== USECASE_HEADER_WORD) {
        failAt(
          wordLoc.line,
          wordLoc.column,
          word === SEQUENCE_HEADER_WORD
            ? `this is a sequence ".alab" header — a use-case document must read "archlab ${version} ${USECASE_HEADER_WORD}"`
            : word === FLOWCHART_HEADER_WORD
              ? `this is a flowchart ".alab" header — a use-case document must read "archlab ${version} ${USECASE_HEADER_WORD}"`
              : `"${word}" is not a document type — expected "archlab ${version} ${USECASE_HEADER_WORD}"`,
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
      if (text.startsWith(USECASE_BLOCK)) {
        cursor.pos += USECASE_BLOCK.length;
        cursor.expectEnd(`the "${USECASE_BLOCK}" line`);
        if (bodyOpened) {
          failAt(
            lineNo,
            1,
            `duplicate "${USECASE_BLOCK}" — a use-case file holds exactly one diagram`,
            USECASE_BLOCK,
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
          `header lines must appear before "${USECASE_BLOCK}"`,
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
        `this line is indented, but no "${USECASE_BLOCK}" block is open above it`,
        text.trim().slice(0, 40),
      );
    }

    /* Continuations bind tighter than block structure: `desc` / `!` exactly
       one level below the last element/edge attach to it. A boundary opener
       resets `lastItem` to null, so a `!` at a boundary's member indent can
       never be mistaken for a continuation. */
    if (
      lastItem !== null &&
      indent === lastItem.indent + 2 &&
      (cursor.peek() === "!" || /^desc(\s|$)/.test(text.slice(indent)))
    ) {
      parseContinuation(cursor, lastItem);
      continue;
    }

    /* Dedenting to the body indent closes the open boundary. */
    if (openBoundary !== null && indent < 4) openBoundary = null;
    const itemIndent = openBoundary === null ? 2 : 4;
    if (indent !== itemIndent) {
      failAt(
        lineNo,
        indent + 1,
        `inconsistent indentation of ${indent} spaces — expected ${itemIndent} here (2 per level; a boundary body is one level deeper than its opener)`,
        text.trim().slice(0, 40),
      );
    }

    lastItem = parseBodyLine(cursor, {
      indent,
      openBoundary,
      elements,
      elementById,
      edges,
      openBoundaryBlock: (boundary) => {
        boundaries.push(boundary);
        openBoundary = boundary;
      },
    });
  }

  if (!seenContent || header.version === undefined) {
    failAt(
      1,
      1,
      `the file is empty — expected an "archlab <version> ${USECASE_HEADER_WORD}" line`,
    );
  }
  if (!bodyOpened) {
    failAt(
      1,
      1,
      `the file has no "${USECASE_BLOCK}" block — add one after the header lines`,
    );
  }

  return resolve(header, elements, elementById, boundaries, edges);
}

/* -------------------------------------------------------------------------- */
/* Header lines                                                               */
/* -------------------------------------------------------------------------- */

/** Header keywords: the C4 subset that means the same thing here — the same
 * subset the sequence and flowchart headers take, for the same reason. The
 * C4 grammar's `tagcolor` / `customicon` / `generator` / `root` lines do NOT
 * exist in a use-case header — those fields ride the `! meta.<key>` escape
 * (see `USECASE_META_RAW` in `./schema.ts` for the why). */
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
        `"${keyword}" is not a use-case header keyword — expected archlab, schema, title, ` +
          'description, owner, tags, created, updated or reviewed (other metadata rides "! meta.<key> : <json>")',
        keyword,
      );
  }
  cursor.expectEnd(`the "${keyword}" line`);
}

/** Same table the other three headers use — fields with a dedicated line. */
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
        'use-case "! meta.…" paths are exactly one key deep — set whole objects, e.g. ! meta.generator : {"name":"…","version":"…"}',
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
    if (USECASE_META_RAW.has(key)) {
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
      'top-level "!" paths cannot nest — only "! <key> : <json>" and "! meta.<key> : <json>" are valid in a use-case header',
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
  if ((USECASE_FILE_KEYS as readonly string[]).includes(key)) {
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
  openBoundary: PendBoundary | null;
  elements: PendElement[];
  elementById: Map<string, PendElement>;
  edges: PendEdge[];
  openBoundaryBlock: (boundary: PendBoundary) => void;
}

function parseBodyLine(
  cursor: LineCursor,
  state: BodyState,
): Continuable | null {
  /* `!` at ITEM indent (not a continuation — the caller filtered those)
     attaches to the enclosing boundary, when one is open. */
  if (cursor.peek() === "!") {
    if (state.openBoundary !== null) {
      parseBoundaryBang(cursor, state.openBoundary);
      return null;
    }
    cursor.fail(
      `file-level "!" lines belong in the header, before ${USECASE_BLOCK}`,
    );
  }

  const startLoc = { line: cursor.line, column: cursor.column };
  const quotedStart = cursor.peek() === '"';
  const first = quotedStart
    ? cursor.readQuoted("an element kind keyword or an edge source id")
    : cursor.readBare(
        /^[A-Za-z0-9_][A-Za-z0-9_.-]*/,
        `an element kind keyword (actor, usecase), a ${BOUNDARY_KEYWORD}, or an edge source id`,
      );

  /* Reserved words only act as keywords when written BARE — a quoted "actor"
     is always an id, which is what lets `RESERVED_USECASE_WORDS` stay a
     reservation on spelling rather than a hole in the id space. */
  if (!quotedStart && RESERVED_USECASE_WORDS.has(first)) {
    switch (first) {
      case "desc":
        failAt(
          startLoc.line,
          startLoc.column,
          '"desc" is a continuation — indent it 2 spaces under the element it describes',
        );
        break;
      case BOUNDARY_KEYWORD:
        parseBoundaryOpener(cursor, startLoc, state);
        return null;
      default: {
        const kind = ELEMENT_KIND_BY_KEYWORD[first];
        if (kind !== undefined) {
          return parseElementLine(cursor, startLoc, kind, state);
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

  cursor.skipSpaces();
  if (cursor.peek() === '"') {
    /* `id "Label"` — an element line missing its kind keyword. Named here
       because the fall-through error ("expected an edge token") would blame
       the edge grammar for an element-line mistake. */
    failAt(
      startLoc.line,
      startLoc.column,
      `an element line starts with its kind keyword — write e.g. usecase ${first} ${cursor.foundHere() ?? '"Label"'}`,
      first,
    );
  }
  return parseEdgeLine(cursor, startLoc, first, state);
}

/* --------------------------------- elements -------------------------------- */

function parseElementLine(
  cursor: LineCursor,
  loc: Loc,
  kind: UseCaseElementKind,
  state: BodyState,
): Continuable {
  /* THE one semantic a use-case diagram exists to draw: the boundary is the
     system's edge, and an actor stands OUTSIDE it by definition. Refused at
     the keyword, before the id is even read, because indentation alone
     would silently file the actor as a member. */
  if (kind === "actor" && state.openBoundary !== null) {
    failAt(
      loc.line,
      loc.column,
      `an "actor" cannot be declared inside a "${BOUNDARY_KEYWORD}" — an actor stands outside the system's edge by definition, and the boundary IS that edge; declare the actor at the body indent, before or after the block`,
      "actor",
    );
  }
  cursor.skipSpaces();
  const idLoc = { line: cursor.line, column: cursor.column };
  const id = cursor.readIdToken("the element id");
  /* Elements only at the top of the body: the MODEL keeps them in a separate
     ordered array, so text that interleaved them with edges could not
     round-trip byte-identically — reject it rather than silently regroup. */
  if (state.edges.length > 0) {
    failAt(
      idLoc.line,
      idLoc.column,
      `element "${id}" is declared after the first edge — elements come first, so the text order matches the model's elements array`,
      id,
    );
  }
  const existing = state.elementById.get(id);
  if (existing !== undefined) {
    failAt(
      idLoc.line,
      idLoc.column,
      `duplicate element id "${id}" — already declared on line ${existing.line}`,
      id,
    );
  }
  cursor.skipSpaces();
  const label = cursor.readQuoted("the element label");
  if (label === "") cursor.fail("the element label must not be empty");

  const element: PendElement = {
    ...loc,
    id,
    kind,
    label,
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
      if (element.technology !== undefined) {
        failAt(
          attrLoc.line,
          attrLoc.column,
          "duplicate [technology] attribute",
        );
      }
      element.technology = readTechnology(cursor);
      continue;
    }
    if (cursor.peek() === "#") {
      element.tags = element.tags ?? [];
      element.tags.push(readTag(cursor));
      continue;
    }
    break;
  }
  cursor.expectEnd("the element line");
  state.elements.push(element);
  state.elementById.set(id, element);
  /* Membership is recorded here, not on the boundary line, because the
     boundary line never names its members — being nested inside it IS the
     membership. */
  state.openBoundary?.usecases.push(id);
  return { kind: "element", indent: cursor.text.search(/\S/), item: element };
}

/* ---------------------------------- edges ---------------------------------- */

function parseEdgeLine(
  cursor: LineCursor,
  loc: Loc,
  from: string,
  state: BodyState,
): Continuable {
  /* Caught here rather than left to the indentation rules: an edge inside a
     boundary would otherwise read as a member and vanish from the diagram. */
  if (state.openBoundary !== null) {
    failAt(
      loc.line,
      loc.column,
      `an edge cannot sit inside a "${BOUNDARY_KEYWORD}" — the boundary encloses use cases, and edges come after it at the body's own indent`,
      from,
    );
  }
  /* LONGEST-FIRST, in `USECASE_EDGE_TOKENS`' own order: `--` is a prefix of
     `--|>`, and trying it first would read every generalization as an
     association pointing at an element named `|>`. */
  let matched: readonly [string, UseCaseEdgeKind] | undefined;
  for (const entry of USECASE_EDGE_TOKENS) {
    if (cursor.text.startsWith(entry[0], cursor.pos)) {
      matched = entry;
      break;
    }
  }
  if (matched === undefined) {
    cursor.fail(
      `expected ${edgeTokenList()} between the two element ids — or, for an element, its kind keyword (actor, usecase) before the id`,
      cursor.foundHere(),
    );
  }
  const [token, kind] = matched;
  cursor.pos += token.length;

  cursor.skipSpaces();
  const toLoc = { line: cursor.line, column: cursor.column };
  const to = cursor.readIdToken("the target element id");

  const edge: PendEdge = {
    ...loc,
    kind,
    from,
    fromLoc: loc,
    to,
    toLoc,
    raw: new Map(),
    unknowns: [],
  };

  cursor.skipSpaces();
  switch (kind) {
    /* The tail is OPTIONAL on an association (most lines say nothing; a
       multiplicity or role is the exception), REQUIRED on a dependency (a
       bare dashed arrow is ambiguous in exactly the way this document type
       exists to avoid), and FORBIDDEN on a generalization (the hollow
       triangle is the whole statement). */
    case "association":
      if (!cursor.atEnd()) {
        cursor.expect(
          ":",
          '":" before the association label — or nothing, for an unlabelled association',
        );
        cursor.skipSpaces();
        edge.label = cursor.readQuoted(
          "the association label (a multiplicity or role)",
        );
      }
      break;
    case "dependency": {
      cursor.expect(
        ":",
        `":" and a stereotype — a "${token}" dependency requires ${stereotypeList()}`,
      );
      cursor.skipSpaces();
      const wordLoc = { line: cursor.line, column: cursor.column };
      const word = cursor.readBare(
        /^[a-z]+/,
        `a bare stereotype word — ${stereotypeList()}`,
      );
      if (!(DEPENDENCY_STEREOTYPES as readonly string[]).includes(word)) {
        failAt(
          wordLoc.line,
          wordLoc.column,
          `"${word}" is not a dependency stereotype — the vocabulary is closed: ${stereotypeList()}`,
          word,
        );
      }
      edge.stereotype = word as UseCaseDependencyStereotype;
      break;
    }
    case "generalization":
      if (!cursor.atEnd()) {
        cursor.fail(
          `a "${token}" generalization carries no tail — the hollow triangle is the whole statement`,
          cursor.foundHere(),
        );
      }
      break;
  }
  cursor.expectEnd("the edge line");
  state.edges.push(edge);
  return { kind: "edge", indent: cursor.text.search(/\S/), item: edge };
}

/* -------------------------------- boundaries ------------------------------- */

/**
 * `boundary "Food Delivery Service" tint=#bfdfff`, with its member use cases
 * nested one level in.
 *
 * NESTING IS THE CONTIGUITY RULE — the same argument `group` makes in the
 * flowchart grammar and `box` in the sequence grammar: a `boundary=`
 * attribute on each element line would let a document name members that are
 * not neighbours in the declaration order, and the serializer could not
 * spell that back. Here the members are literally the lines inside the
 * block, so the order in the text IS the order in `elements`, and the run
 * cannot be broken without moving a line out of the block.
 */
function parseBoundaryOpener(
  cursor: LineCursor,
  loc: Loc,
  state: BodyState,
): void {
  if (state.openBoundary !== null) {
    failAt(
      loc.line,
      loc.column,
      `"${BOUNDARY_KEYWORD}" blocks do not nest — close this one by dedenting before opening another`,
      BOUNDARY_KEYWORD,
    );
  }
  if (state.edges.length > 0) {
    failAt(
      loc.line,
      loc.column,
      `"${BOUNDARY_KEYWORD}" declares use cases, so it comes before the first edge`,
      BOUNDARY_KEYWORD,
    );
  }
  cursor.skipSpaces();
  if (cursor.peek() !== '"') {
    cursor.fail(`the "${BOUNDARY_KEYWORD}" label, in quotes`);
  }
  const label = cursor.readQuoted(`the "${BOUNDARY_KEYWORD}" label`);
  if (label === "") {
    failAt(
      loc.line,
      loc.column,
      `the "${BOUNDARY_KEYWORD}" label must not be empty — the box names the system whose edge it draws`,
    );
  }
  const tint = readTintAttribute(cursor, BOUNDARY_KEYWORD);
  cursor.expectEnd(`the "${BOUNDARY_KEYWORD}" line`);

  state.openBoundaryBlock({
    ...loc,
    label,
    ...(tint !== undefined ? { tint } : {}),
    usecases: [],
    raw: new Map(),
    unknowns: [],
  });
}

/** `!` inside a `boundary` block: one key, scoped to the boundary. Same
 * three-way split as everywhere else — raw-able known key, dedicated-syntax
 * key (refused), or an unknown carried verbatim. */
function parseBoundaryBang(cursor: LineCursor, boundary: PendBoundary): void {
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
      `"${BOUNDARY_KEYWORD}" "!" paths are one key — nothing nests under a boundary`,
    );
  }
  const key = segString(first, "a boundary field name");
  const pend: Pend = {
    key,
    after: tail.after,
    value: tail.value,
    line: first.line,
    column: first.column,
  };
  if (USECASE_BOUNDARY_RAW.has(key)) {
    if (boundary.raw.has(key) || boundary.tint !== undefined) {
      failAt(
        first.line,
        first.column,
        `"${key}" is set twice — once on the "${BOUNDARY_KEYWORD}" line and once here`,
      );
    }
    boundary.raw.set(key, pend);
    return;
  }
  if ((USECASE_BOUNDARY_KEYS as readonly string[]).includes(key)) {
    failAt(
      first.line,
      first.column,
      `"${key}" has dedicated syntax — it cannot be set with a "!" line`,
    );
  }
  if (boundary.unknowns.some((p) => p.key === key)) {
    failAt(first.line, first.column, `duplicate "!" line for "${key}"`);
  }
  boundary.unknowns.push(pend);
}

/* ----------------------------- continuations ------------------------------ */

function parseContinuation(cursor: LineCursor, target: Continuable): void {
  if (cursor.peek() !== "!") {
    /* `desc` — elements only. An edge has no description field: an
       association's label is the whole annotation a line carries, and
       detail belongs on the elements it joins. */
    const loc = { line: cursor.line, column: cursor.column };
    cursor.pos += "desc".length;
    if (target.kind === "edge") {
      failAt(
        loc.line,
        loc.column,
        "edges have no description — put detail on the elements the edge joins",
      );
    }
    if (target.item.description !== undefined) {
      failAt(loc.line, loc.column, 'duplicate "desc" line for this element');
    }
    cursor.skipSpaces();
    target.item.description = cursor.readQuoted("the element description");
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
    target.kind === "element"
      ? ([USECASE_ELEMENT_RAW, ELEMENT_KEYS_SET] as const)
      : ([USECASE_EDGE_RAW, EDGE_KEYS_SET] as const);
  if (rawAllowed.has(key)) {
    /* `label` is raw-able but only MEANINGFUL on an association (see
       `USECASE_EDGE_RAW`'s essay): setting it on a dependency or a
       generalization would build a model the serializer cannot spell back. */
    if (
      target.kind === "edge" &&
      key === "label" &&
      target.item.kind !== "association"
    ) {
      failAt(
        first.line,
        first.column,
        `only an association ("${TOKEN_BY_EDGE_KIND.association}") may carry a label — a ${target.item.kind} has no label to set`,
      );
    }
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
  elements: PendElement[],
  elementById: Map<string, PendElement>,
  boundaries: PendBoundary[],
  edges: PendEdge[],
): UseCaseLabFile {
  if (header.title === undefined) {
    failAt(
      1,
      1,
      'the file has no title — add a line like: title "Food delivery"',
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

  /* ------------------------------- elements ------------------------------ */
  const finalElements = elements.map((element) => {
    const pairs: (readonly [string, unknown])[] = [];
    const add = (key: string, value: unknown): void => {
      if (value !== undefined) pairs.push([key, value]);
    };
    add("id", element.id);
    add("kind", element.kind);
    add("label", element.label);
    add("technology", pick(element.technology, element.raw, "technology"));
    add("tags", pick(element.tags, element.raw, "tags"));
    add("description", pick(element.description, element.raw, "description"));
    return assemble(pairs, element.unknowns);
  });

  /* ------------------------------ boundaries ----------------------------- */
  const finalBoundaries = boundaries.map((boundary) => {
    if (boundary.usecases.length === 0) {
      failAt(
        boundary.line,
        boundary.column,
        `the "${BOUNDARY_KEYWORD}" named ${JSON.stringify(boundary.label)} holds no use cases — indent them 2 spaces under it, or remove the boundary`,
        BOUNDARY_KEYWORD,
      );
    }
    const pairs: (readonly [string, unknown])[] = [["label", boundary.label]];
    const tint = pick(boundary.tint, boundary.raw, "tint");
    if (tint !== undefined) pairs.push(["tint", tint]);
    pairs.push(["usecases", boundary.usecases]);
    return assemble(pairs, boundary.unknowns);
  });

  /* -------------------------------- edges -------------------------------- */
  const requireElement = (id: string, at: Loc, what: string): PendElement => {
    const element = elementById.get(id);
    if (element === undefined) {
      failAt(
        at.line,
        at.column,
        `the ${what} "${id}" does not resolve to an element — declare it at the top of the ${USECASE_BLOCK} body`,
        id,
      );
    }
    return element;
  };
  const finalEdges = edges.map((edge) => {
    const fromEl = requireElement(edge.from, edge.fromLoc, "edge source");
    const toEl = requireElement(edge.to, edge.toLoc, "edge target");
    /* Kind rules, one per edge kind. Enforced here — after both endpoints
       resolve — because each rule reads the DECLARED kind of an endpoint,
       and a "wrong kind" error about an undeclared id would be a guess. */
    switch (edge.kind) {
      case "association":
        /* An association joins an actor and a use case: a same-kind pair is
           always a different statement wearing the wrong line. */
        if (fromEl.kind === toEl.kind) {
          failAt(
            edge.line,
            edge.column,
            fromEl.kind === "actor"
              ? `an association cannot join two actors — "is-a" between actors is a generalization ("${TOKEN_BY_EDGE_KIND.generalization}"); an association joins an actor and a use case`
              : `an association cannot join two use cases — relate use cases with "${TOKEN_BY_EDGE_KIND.dependency} : ${DEPENDENCY_STEREOTYPES.join("/")}" or "${TOKEN_BY_EDGE_KIND.generalization}"; an association joins an actor and a use case`,
            edge.from,
          );
        }
        break;
      case "dependency":
        for (const [element, at] of [
          [fromEl, edge.fromLoc],
          [toEl, edge.toLoc],
        ] as const) {
          if (element.kind === "actor") {
            failAt(
              at.line,
              at.column,
              `«${edge.stereotype}» joins two use cases — "${element.id}" is an actor, and an actor cannot include or extend behaviour`,
              element.id,
            );
          }
        }
        break;
      case "generalization":
        if (fromEl.kind !== toEl.kind) {
          failAt(
            edge.line,
            edge.column,
            `a generalization joins two elements of the same kind — "${edge.from}" is ${fromEl.kind === "actor" ? "an actor" : "a use case"} and "${edge.to}" is ${toEl.kind === "actor" ? "an actor" : "a use case"}; an actor–use-case line is an association ("${TOKEN_BY_EDGE_KIND.association}")`,
            edge.from,
          );
        }
        break;
    }
    const pairs: (readonly [string, unknown])[] = [
      ["kind", edge.kind],
      ["from", edge.from],
      ["to", edge.to],
    ];
    if (edge.kind === "dependency") {
      pairs.push(["stereotype", edge.stereotype]);
    }
    if (edge.kind === "association") {
      const label = pick(edge.label, edge.raw, "label");
      if (label !== undefined) pairs.push(["label", label]);
    }
    return assemble(pairs, edge.unknowns);
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
  file.kind = "usecase";
  file.metadata = metadata;
  file.elements = finalElements;
  /* Omitted when nothing bounds: an empty array and no array would be two
     spellings of "no boundaries", and the serializer writes neither. */
  if (finalBoundaries.length > 0) file.boundaries = finalBoundaries;
  file.edges = finalEdges;
  for (const pend of header.fileUnknowns) {
    file[pend.key] = pend.value;
  }
  return file as UseCaseLabFile;
}

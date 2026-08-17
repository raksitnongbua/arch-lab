/**
 * `.alab` flowchart text → `FlowchartLabFile`. The flowchart sibling of the
 * C4 parser in `../parse.ts` and the sequence parser in
 * `../sequence/parse.ts`, sharing their whole substrate — `LineCursor`,
 * `ArchTextParseError`, the `!` escape reader, `[technology]`, `#tag`,
 * `tint=` — so the three grammars cannot drift apart in the parts they share.
 *
 * Line shape (all indentation in spaces, never tabs):
 *
 *   archlab 1.0 flowchart         ← the document-type discriminant (line 1)
 *   title "Order intake"          ← header keywords shared with the other
 *   created 2026-08-01T00:00:00Z    two document types
 *
 *   @flowchart                    ← opens the single diagram body
 *     start s "Order received"    ← nodes (declared before any edge),
 *     step validate "Validate"      keyword-first: the shape is the verb
 *     decision ok "Cart valid?"
 *     group "Persistence"         ← a cluster: its members nest inside it
 *       io save "Write order"
 *
 *     s -> validate               ← an unlabelled edge
 *     ok -> save : "yes"          ← a labelled edge — a decision's branch
 *
 * THE DEPTH RULE, simpler than the sequence grammar's because nothing here
 * recurses: 0 for header lines and `@flowchart`, 2 for the body, 4 inside a
 * `group`, and a `desc` / `!` continuation sits one level deeper than the
 * line it continues. Odd indents are an error, not a rounding.
 *
 * The header grammar deliberately mirrors `../sequence/parse.ts` line for
 * line rather than importing its private functions: the error voice names
 * the document type ("not a flowchart header keyword"), and the two raw-key
 * policies are only coincidentally equal today (`FLOW_META_RAW` imports the
 * set, so THAT cannot drift — only the messages are per-grammar).
 *
 * Every failure throws `ArchTextParseError` naming a 1-based line and
 * column; a parse is all-or-nothing.
 *
 * Imported by `scripts/flowchart-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import type { FlowchartLabFile, FlowchartNodeShape } from "@/types";

import { newerVersionMessage, SUPPORTED_MAJOR_VERSION } from "@/lib/constants";

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
import { readTintAttribute } from "../sequence/parse";
import { SEQUENCE_HEADER_WORD } from "../sequence/keywords";
import { USECASE_HEADER_WORD } from "../usecase/keywords";
import {
  FLOWCHART_ARROW,
  FLOWCHART_BLOCK,
  FLOWCHART_HEADER_WORD,
  GROUP_KEYWORD,
  NODE_SHAPE_BY_KEYWORD,
  RESERVED_FLOWCHART_WORDS,
} from "./keywords";
import {
  FLOW_EDGE_KEYS,
  FLOW_EDGE_RAW,
  FLOW_FILE_KEYS,
  FLOW_GROUP_KEYS,
  FLOW_GROUP_RAW,
  FLOW_META_RAW,
  FLOW_NODE_KEYS,
  FLOW_NODE_RAW,
} from "./schema";

/* -------------------------------------------------------------------------- */
/* Pending structures collected during the line pass                          */
/* -------------------------------------------------------------------------- */

interface PendNode extends Loc {
  id: string;
  shape: FlowchartNodeShape;
  label: string;
  technology?: string;
  tags?: string[];
  description?: string;
  raw: Map<string, Pend>;
  unknowns: Pend[];
}

interface PendEdge extends Loc {
  from: string;
  fromLoc: Loc;
  to: string;
  toLoc: Loc;
  label?: string;
  raw: Map<string, Pend>;
  unknowns: Pend[];
}

/** One open `group` block. Its members are the node lines nested inside it,
 * collected in text order — which is what makes a group contiguous by
 * construction rather than by a check. */
interface PendGroup extends Loc {
  label: string;
  tint?: string;
  nodes: string[];
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
  | { kind: "node"; indent: number; item: PendNode }
  | { kind: "edge"; indent: number; item: PendEdge };

const NODE_KEYS_SET: ReadonlySet<string> = new Set(FLOW_NODE_KEYS);
const EDGE_KEYS_SET: ReadonlySet<string> = new Set(FLOW_EDGE_KEYS);

/* -------------------------------------------------------------------------- */
/* The parser                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Parses `.alab` flowchart source into a `FlowchartLabFile`. Pure and
 * deterministic. Throws `ArchTextParseError` (line + column) on any problem
 * — all-or-nothing.
 */
export function parseFlowchartText(source: string): FlowchartLabFile {
  const header: Header = {
    metaRaw: new Map(),
    metaUnknowns: [],
    fileUnknowns: [],
  };
  const nodes: PendNode[] = [];
  const nodeById = new Map<string, PendNode>();
  const groups: PendGroup[] = [];
  const edges: PendEdge[] = [];
  /* Non-null while a `group` block is open. There is no context stack: a
     group is the only block and groups do not nest, so one slot is the whole
     structure. Dedenting to the body indent closes it — no `end` keyword. */
  let openGroup: PendGroup | null = null;
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
        `inconsistent indentation of ${indent} space${indent === 1 ? "" : "s"} — flowchart documents indent 2 spaces per level (0 header, 2 body, +2 inside a group, +2 for a continuation)`,
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
          `the file must start with an "archlab <version> ${FLOWCHART_HEADER_WORD}" line, e.g. archlab 1.0 ${FLOWCHART_HEADER_WORD}`,
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
          `this is a C4 ".alab" header — a flowchart document must read "archlab ${version} ${FLOWCHART_HEADER_WORD}"`,
          text.trim().slice(0, 40),
        );
      }
      const wordLoc = { line: lineNo, column: cursor.column };
      const word = cursor.readBare(/^[a-z]+/, `"${FLOWCHART_HEADER_WORD}"`);
      if (word !== FLOWCHART_HEADER_WORD) {
        failAt(
          wordLoc.line,
          wordLoc.column,
          word === SEQUENCE_HEADER_WORD
            ? `this is a sequence ".alab" header — a flowchart document must read "archlab ${version} ${FLOWCHART_HEADER_WORD}"`
            : word === USECASE_HEADER_WORD
              ? `this is a use-case ".alab" header — a flowchart document must read "archlab ${version} ${FLOWCHART_HEADER_WORD}"`
              : `"${word}" is not a document type — expected "archlab ${version} ${FLOWCHART_HEADER_WORD}"`,
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
      if (text.startsWith(FLOWCHART_BLOCK)) {
        cursor.pos += FLOWCHART_BLOCK.length;
        cursor.expectEnd(`the "${FLOWCHART_BLOCK}" line`);
        if (bodyOpened) {
          failAt(
            lineNo,
            1,
            `duplicate "${FLOWCHART_BLOCK}" — a flowchart file holds exactly one diagram`,
            FLOWCHART_BLOCK,
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
          `header lines must appear before "${FLOWCHART_BLOCK}"`,
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
        `this line is indented, but no "${FLOWCHART_BLOCK}" block is open above it`,
        text.trim().slice(0, 40),
      );
    }

    /* Continuations bind tighter than block structure: `desc` / `!` exactly
       one level below the last node/edge attach to it. A group opener resets
       `lastItem` to null, so a `!` at a group's member indent can never be
       mistaken for a continuation. */
    if (
      lastItem !== null &&
      indent === lastItem.indent + 2 &&
      (cursor.peek() === "!" || /^desc(\s|$)/.test(text.slice(indent)))
    ) {
      parseContinuation(cursor, lastItem);
      continue;
    }

    /* Dedenting to the body indent closes the open group. */
    if (openGroup !== null && indent < 4) openGroup = null;
    const itemIndent = openGroup === null ? 2 : 4;
    if (indent !== itemIndent) {
      failAt(
        lineNo,
        indent + 1,
        `inconsistent indentation of ${indent} spaces — expected ${itemIndent} here (2 per level; a group body is one level deeper than its opener)`,
        text.trim().slice(0, 40),
      );
    }

    lastItem = parseBodyLine(cursor, {
      indent,
      openGroup,
      nodes,
      nodeById,
      edges,
      openGroupBlock: (group) => {
        groups.push(group);
        openGroup = group;
      },
    });
  }

  if (!seenContent || header.version === undefined) {
    failAt(
      1,
      1,
      `the file is empty — expected an "archlab <version> ${FLOWCHART_HEADER_WORD}" line`,
    );
  }
  if (!bodyOpened) {
    failAt(
      1,
      1,
      `the file has no "${FLOWCHART_BLOCK}" block — add one after the header lines`,
    );
  }

  return resolve(header, nodes, nodeById, groups, edges);
}

/* -------------------------------------------------------------------------- */
/* Header lines                                                               */
/* -------------------------------------------------------------------------- */

/** Header keywords: the C4 subset that means the same thing here — the same
 * subset the sequence header takes, for the same reason. The C4 grammar's
 * `tagcolor` / `customicon` / `generator` / `root` lines do NOT exist in a
 * flowchart header — those fields ride the `! meta.<key>` escape (see
 * `FLOW_META_RAW` in `./schema.ts` for the why). */
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
        `"${keyword}" is not a flowchart header keyword — expected archlab, schema, title, ` +
          'description, owner, tags, created, updated or reviewed (other metadata rides "! meta.<key> : <json>")',
        keyword,
      );
  }
  cursor.expectEnd(`the "${keyword}" line`);
}

/** Same table the C4 and sequence headers use — fields with a dedicated line. */
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
        'flowchart "! meta.…" paths are exactly one key deep — set whole objects, e.g. ! meta.generator : {"name":"…","version":"…"}',
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
    if (FLOW_META_RAW.has(key)) {
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
      'top-level "!" paths cannot nest — only "! <key> : <json>" and "! meta.<key> : <json>" are valid in a flowchart header',
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
  if ((FLOW_FILE_KEYS as readonly string[]).includes(key)) {
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
  openGroup: PendGroup | null;
  nodes: PendNode[];
  nodeById: Map<string, PendNode>;
  edges: PendEdge[];
  openGroupBlock: (group: PendGroup) => void;
}

function parseBodyLine(
  cursor: LineCursor,
  state: BodyState,
): Continuable | null {
  /* `!` at ITEM indent (not a continuation — the caller filtered those)
     attaches to the enclosing group, when one is open. */
  if (cursor.peek() === "!") {
    if (state.openGroup !== null) {
      parseGroupBang(cursor, state.openGroup);
      return null;
    }
    cursor.fail(
      `file-level "!" lines belong in the header, before ${FLOWCHART_BLOCK}`,
    );
  }

  const startLoc = { line: cursor.line, column: cursor.column };
  const quotedStart = cursor.peek() === '"';
  const first = quotedStart
    ? cursor.readQuoted("a node shape keyword or an edge source id")
    : cursor.readBare(
        /^[A-Za-z0-9_][A-Za-z0-9_.-]*/,
        "a node shape keyword (start, end, step, decision, io, call), a group, or an edge source id",
      );

  /* Reserved words only act as keywords when written BARE — a quoted "step"
     is always an id, which is what lets `RESERVED_FLOWCHART_WORDS` stay a
     reservation on spelling rather than a hole in the id space. */
  if (!quotedStart && RESERVED_FLOWCHART_WORDS.has(first)) {
    switch (first) {
      case "desc":
        failAt(
          startLoc.line,
          startLoc.column,
          '"desc" is a continuation — indent it 2 spaces under the node it describes',
        );
        break;
      case GROUP_KEYWORD:
        parseGroupOpener(cursor, startLoc, state);
        return null;
      default: {
        const shape = NODE_SHAPE_BY_KEYWORD[first];
        if (shape !== undefined) {
          return parseNodeLine(cursor, startLoc, shape, state);
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
    /* `id "Label"` — a node line missing its shape keyword. Named here
       because the fall-through error ("expected ->") would blame the edge
       grammar for a node-line mistake. */
    failAt(
      startLoc.line,
      startLoc.column,
      `a node line starts with its shape keyword — write e.g. step ${first} ${cursor.foundHere() ?? '"Label"'}`,
      first,
    );
  }
  return parseEdgeLine(cursor, startLoc, first, state);
}

/* ---------------------------------- nodes ---------------------------------- */

function parseNodeLine(
  cursor: LineCursor,
  loc: Loc,
  shape: FlowchartNodeShape,
  state: BodyState,
): Continuable {
  cursor.skipSpaces();
  const idLoc = { line: cursor.line, column: cursor.column };
  const id = cursor.readIdToken("the node id");
  /* Nodes only at the top of the body: the MODEL keeps them in a separate
     ordered array, so text that interleaved them with edges could not
     round-trip byte-identically — reject it rather than silently regroup. */
  if (state.edges.length > 0) {
    failAt(
      idLoc.line,
      idLoc.column,
      `node "${id}" is declared after the first edge — nodes come first, so the text order matches the model's nodes array`,
      id,
    );
  }
  const existing = state.nodeById.get(id);
  if (existing !== undefined) {
    failAt(
      idLoc.line,
      idLoc.column,
      `duplicate node id "${id}" — already declared on line ${existing.line}`,
      id,
    );
  }
  cursor.skipSpaces();
  const label = cursor.readQuoted("the node label");
  if (label === "") cursor.fail("the node label must not be empty");

  const node: PendNode = {
    ...loc,
    id,
    shape,
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
      if (node.technology !== undefined) {
        failAt(
          attrLoc.line,
          attrLoc.column,
          "duplicate [technology] attribute",
        );
      }
      node.technology = readTechnology(cursor);
      continue;
    }
    if (cursor.peek() === "#") {
      node.tags = node.tags ?? [];
      node.tags.push(readTag(cursor));
      continue;
    }
    break;
  }
  cursor.expectEnd("the node line");
  state.nodes.push(node);
  state.nodeById.set(id, node);
  /* Membership is recorded here, not on the group line, because the group
     line never names its members — being nested inside it IS the membership. */
  state.openGroup?.nodes.push(id);
  return { kind: "node", indent: cursor.text.search(/\S/), item: node };
}

/* ---------------------------------- edges ---------------------------------- */

function parseEdgeLine(
  cursor: LineCursor,
  loc: Loc,
  from: string,
  state: BodyState,
): Continuable {
  /* Caught here rather than left to the indentation rules: an edge inside a
     group would otherwise read as a member and vanish from the flow. */
  if (state.openGroup !== null) {
    failAt(
      loc.line,
      loc.column,
      `an edge cannot sit inside a "${GROUP_KEYWORD}" — the group clusters nodes, and edges come after it at the body's own indent`,
      from,
    );
  }
  if (!cursor.text.startsWith(FLOWCHART_ARROW, cursor.pos)) {
    cursor.fail(
      `expected "${FLOWCHART_ARROW}" between the two node ids — or, for a node, a shape keyword (start, end, step, decision, io, call) before the id`,
      cursor.foundHere(),
    );
  }
  cursor.pos += FLOWCHART_ARROW.length;

  cursor.skipSpaces();
  const toLoc = { line: cursor.line, column: cursor.column };
  const to = cursor.readIdToken("the target node id");

  const edge: PendEdge = {
    ...loc,
    from,
    fromLoc: loc,
    to,
    toLoc,
    raw: new Map(),
    unknowns: [],
  };

  /* The label tail is OPTIONAL, unlike a sequence message's (see the arrow
     essay in `./keywords.ts`): most flow arrows say nothing, and only a
     decision's branches carry a guard. */
  cursor.skipSpaces();
  if (!cursor.atEnd()) {
    cursor.expect(
      ":",
      '":" before the edge label — or nothing, for an unlabelled edge',
    );
    cursor.skipSpaces();
    edge.label = cursor.readQuoted("the edge label");
  }
  cursor.expectEnd("the edge line");
  state.edges.push(edge);
  return { kind: "edge", indent: cursor.text.search(/\S/), item: edge };
}

/* ---------------------------------- groups --------------------------------- */

/**
 * `group "Persistence" tint=#bfdfff`, with its members nested one level in.
 *
 * NESTING IS THE CONTIGUITY RULE — the same argument `box` makes in the
 * sequence grammar: a `group=` attribute on each node line would let a
 * document name members that are not neighbours in the declaration order,
 * and the serializer could not spell that back. Here the members are
 * literally the lines inside the block, so the order in the text IS the
 * order in `nodes`, and the run cannot be broken without moving a line out
 * of the block.
 */
function parseGroupOpener(
  cursor: LineCursor,
  loc: Loc,
  state: BodyState,
): void {
  if (state.openGroup !== null) {
    failAt(
      loc.line,
      loc.column,
      `"${GROUP_KEYWORD}" blocks do not nest — close this one by dedenting before opening another`,
      GROUP_KEYWORD,
    );
  }
  if (state.edges.length > 0) {
    failAt(
      loc.line,
      loc.column,
      `"${GROUP_KEYWORD}" declares nodes, so it comes before the first edge`,
      GROUP_KEYWORD,
    );
  }
  cursor.skipSpaces();
  if (cursor.peek() !== '"') {
    cursor.fail(`the "${GROUP_KEYWORD}" label, in quotes`);
  }
  const label = cursor.readQuoted(`the "${GROUP_KEYWORD}" label`);
  if (label === "") {
    failAt(
      loc.line,
      loc.column,
      `the "${GROUP_KEYWORD}" label must not be empty — a cluster with no name says nothing`,
    );
  }
  const tint = readTintAttribute(cursor, GROUP_KEYWORD);
  cursor.expectEnd(`the "${GROUP_KEYWORD}" line`);

  state.openGroupBlock({
    ...loc,
    label,
    ...(tint !== undefined ? { tint } : {}),
    nodes: [],
    raw: new Map(),
    unknowns: [],
  });
}

/** `!` inside a `group` block: one key, scoped to the group. Same three-way
 * split as everywhere else — raw-able known key, dedicated-syntax key
 * (refused), or an unknown carried verbatim. */
function parseGroupBang(cursor: LineCursor, group: PendGroup): void {
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
      `"${GROUP_KEYWORD}" "!" paths are one key — nothing nests under a group`,
    );
  }
  const key = segString(first, "a group field name");
  const pend: Pend = {
    key,
    after: tail.after,
    value: tail.value,
    line: first.line,
    column: first.column,
  };
  if (FLOW_GROUP_RAW.has(key)) {
    if (group.raw.has(key) || group.tint !== undefined) {
      failAt(
        first.line,
        first.column,
        `"${key}" is set twice — once on the "${GROUP_KEYWORD}" line and once here`,
      );
    }
    group.raw.set(key, pend);
    return;
  }
  if ((FLOW_GROUP_KEYS as readonly string[]).includes(key)) {
    failAt(
      first.line,
      first.column,
      `"${key}" has dedicated syntax — it cannot be set with a "!" line`,
    );
  }
  if (group.unknowns.some((p) => p.key === key)) {
    failAt(first.line, first.column, `duplicate "!" line for "${key}"`);
  }
  group.unknowns.push(pend);
}

/* ----------------------------- continuations ------------------------------ */

function parseContinuation(cursor: LineCursor, target: Continuable): void {
  if (cursor.peek() !== "!") {
    /* `desc` — nodes only. An edge has no description field: the label is
       the whole annotation an arrow carries, and detail belongs on the node
       the arrow leaves. */
    const loc = { line: cursor.line, column: cursor.column };
    cursor.pos += "desc".length;
    if (target.kind === "edge") {
      failAt(
        loc.line,
        loc.column,
        "edges have no description — the label is the whole annotation; put detail on the node the edge leaves",
      );
    }
    if (target.item.description !== undefined) {
      failAt(loc.line, loc.column, 'duplicate "desc" line for this node');
    }
    cursor.skipSpaces();
    target.item.description = cursor.readQuoted("the node description");
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
    target.kind === "node"
      ? ([FLOW_NODE_RAW, NODE_KEYS_SET] as const)
      : ([FLOW_EDGE_RAW, EDGE_KEYS_SET] as const);
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
  nodes: PendNode[],
  nodeById: Map<string, PendNode>,
  groups: PendGroup[],
  edges: PendEdge[],
): FlowchartLabFile {
  if (header.title === undefined) {
    failAt(
      1,
      1,
      'the file has no title — add a line like: title "Order intake"',
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

  /* -------------------------------- nodes -------------------------------- */
  const finalNodes = nodes.map((node) => {
    const pairs: (readonly [string, unknown])[] = [];
    const add = (key: string, value: unknown): void => {
      if (value !== undefined) pairs.push([key, value]);
    };
    add("id", node.id);
    add("shape", node.shape);
    add("label", node.label);
    add("technology", pick(node.technology, node.raw, "technology"));
    add("tags", pick(node.tags, node.raw, "tags"));
    add("description", pick(node.description, node.raw, "description"));
    return assemble(pairs, node.unknowns);
  });

  /* -------------------------------- groups ------------------------------- */
  const finalGroups = groups.map((group) => {
    if (group.nodes.length === 0) {
      failAt(
        group.line,
        group.column,
        `the "${GROUP_KEYWORD}" named ${JSON.stringify(group.label)} holds no nodes — indent them 2 spaces under it, or remove the group`,
        GROUP_KEYWORD,
      );
    }
    const pairs: (readonly [string, unknown])[] = [["label", group.label]];
    const tint = pick(group.tint, group.raw, "tint");
    if (tint !== undefined) pairs.push(["tint", tint]);
    pairs.push(["nodes", group.nodes]);
    return assemble(pairs, group.unknowns);
  });

  /* -------------------------------- edges -------------------------------- */
  const requireNode = (id: string, at: Loc, what: string): void => {
    if (!nodeById.has(id)) {
      failAt(
        at.line,
        at.column,
        `the ${what} "${id}" does not resolve to a node — declare it at the top of the ${FLOWCHART_BLOCK} body`,
        id,
      );
    }
  };
  const finalEdges = edges.map((edge) => {
    requireNode(edge.from, edge.fromLoc, "edge source");
    requireNode(edge.to, edge.toLoc, "edge target");
    const pairs: (readonly [string, unknown])[] = [
      ["from", edge.from],
      ["to", edge.to],
    ];
    const label = pick(edge.label, edge.raw, "label");
    if (label !== undefined) pairs.push(["label", label]);
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
  file.kind = "flowchart";
  file.metadata = metadata;
  file.nodes = finalNodes;
  /* Omitted when nothing groups: an empty array and no array would be two
     spellings of "no groups", and the serializer writes neither. */
  if (finalGroups.length > 0) file.groups = finalGroups;
  file.edges = finalEdges;
  for (const pend of header.fileUnknowns) {
    file[pend.key] = pend.value;
  }
  return file as FlowchartLabFile;
}

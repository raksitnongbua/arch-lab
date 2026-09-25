/**
 * `.alab` tree text → `TreeLabFile`. The tenth sibling, sharing the whole
 * substrate — `LineCursor`, `ArchTextParseError`, the `!` escape reader,
 * `#tag` — so the ten grammars cannot drift apart where they overlap.
 *
 * Line shape (all indentation in spaces, never tabs):
 *
 *   archlab 1.0 tree
 *   title "Account Recovery Reviews"
 *
 *   @tree
 *     columns "Preconditions" "Expected result"
 *     node suite "Account Recovery Reviews"
 *       node access "Reaching the page"
 *         node L-01 "A supervisor can open Reviews"
 *           cell "ROLE-SUP-A"
 *           cell "The queue table renders with its filter panel"
 *
 * ── THE DEPTH RULE, WHICH IS THE ONE THING THIS PARSER DOES DIFFERENTLY ───
 *
 * Every other grammar in the family checks indentation against a CLOSED SET
 * (C4 accepts 0, 2 and 4; a lifecycle 0, 2, 4 and 6) because each has a fixed
 * number of levels. This one cannot: unbounded depth is one of the two things
 * the notation adds over the nine (`src/types/tree.ts`), and a tree capped at
 * four levels is a data dictionary with extra steps.
 *
 * So the check is a MULTIPLE plus a STEP LIMIT, and both halves matter:
 *
 *   - an indent that is not a multiple of `INDENT_STEP` is an error, exactly
 *     as it is everywhere else in the family;
 *   - an indent MORE THAN ONE LEVEL deeper than the line above it is an
 *     error, because such a line names no parent. Accepting it would mean
 *     picking a parent by guesswork, and the guess is silent — a mistyped
 *     indent would reparent a whole subtree and still round-trip, which is
 *     the worst failure this format can have.
 *
 * Dedenting by more than one level is FINE and common: closing three branches
 * at once to start a new top-level one is what the end of any real document
 * looks like.
 *
 * ── HOW A CONTINUATION IS TOLD FROM A CHILD ──────────────────────────────
 *
 * They sit at the same indent, and the keyword is the whole distinction:
 * `cell` and `desc` continue the node above them, `node` opens a child of it.
 * That is the same rule `../lifecycle/parse.ts` uses to let `desc` and `exit`
 * share indent 4, and it is why neither keyword may ever be allowed to nest.
 */

import type { TreeLabFile } from "@/types";

import { newerVersionMessage, SUPPORTED_MAJOR_VERSION } from "@/lib/constants";

import { LineCursor } from "../cursor";
import { DEFAULT_TIMESTAMP } from "../defaults";
import { DICT_HEADER_WORD } from "../dict/keywords";
import { ER_HEADER_WORD } from "../er/keywords";
import { failAt } from "../errors";
import { FLOWCHART_HEADER_WORD } from "../flowchart/keywords";
import { GANTT_HEADER_WORD } from "../gantt/keywords";
import { LIFECYCLE_HEADER_WORD } from "../lifecycle/keywords";
import { assemble, onceString, pick, readBangTail, readTag } from "../parse";
import type { Loc, Pend } from "../parse";
import { META_KEYS } from "../schema";
import { SEQUENCE_HEADER_WORD } from "../sequence/keywords";
import { TIMELINE_HEADER_WORD } from "../timeline/keywords";
import { USECASE_HEADER_WORD } from "../usecase/keywords";
import {
  CELL_KEYWORD,
  COLUMNS_KEYWORD,
  DESC_KEYWORD,
  EMPTY_CELL_TOKEN,
  INDENT_STEP,
  LEVELS_KEYWORD,
  NODE_KEYWORD,
  TREE_BLOCK_MARKER,
  TREE_HEADER_WORD,
} from "./keywords";
import { TREE_META_RAW, TREE_NODE_KEYS, TREE_NODE_RAW } from "./schema";

/* -------------------------------------------------------------------------- */
/* Pending structures                                                         */
/* -------------------------------------------------------------------------- */

interface PendNode extends Loc {
  id: string;
  label: string;
  cells: string[];
  tags?: string[];
  description?: string;
  children: PendNode[];
  /** The indent this node's line sat at, which is what the stack pops on. */
  indent: number;
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

const NODE_KEYS_SET: ReadonlySet<string> = new Set(TREE_NODE_KEYS);

/** The keywords that continue the declaration above them rather than opening
 * a child. `node` is deliberately absent — see the file header. */
const CONTINUATION_WORDS: ReadonlySet<string> = new Set([
  CELL_KEYWORD,
  DESC_KEYWORD,
]);

/* -------------------------------------------------------------------------- */
/* The parser                                                                 */
/* -------------------------------------------------------------------------- */

/** Parses `.alab` tree source. Pure, deterministic, all-or-nothing. */
export function parseTreeText(source: string): TreeLabFile {
  const header: Header = {
    metaRaw: new Map(),
    metaUnknowns: [],
    fileUnknowns: [],
  };

  let columns: string[] | undefined;
  let columnsLoc: Loc | null = null;
  let levels: string[] | undefined;
  let levelsLoc: Loc | null = null;
  let maxDepth = 0;
  let root: PendNode | null = null;
  /** Open ancestors, outermost first. The last entry is the node a `cell` or
   * a deeper `node` belongs to. */
  const stack: PendNode[] = [];
  const idAt = new Map<string, Loc>();
  let bodyOpened = false;
  let seenContent = false;

  const lines = source.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const lineNo = index + 1;
    const raw = lines[index];
    const text = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
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
    if (indent % INDENT_STEP !== 0) {
      failAt(
        lineNo,
        indent + 1,
        `inconsistent indentation of ${indent} space${indent === 1 ? "" : "s"} — tree documents indent ${INDENT_STEP} spaces per level, and a node may nest as deep as you like`,
        text.trim().slice(0, 40),
      );
    }

    const cursor = new LineCursor(text, lineNo, indent);

    /* --------------------------- first content line --------------------- */
    if (!seenContent) {
      seenContent = true;
      readVersionLine(cursor, text, lineNo, indent, header);
      continue;
    }

    /* --------------------------- header keywords ------------------------ */
    if (indent === 0 && text !== TREE_BLOCK_MARKER) {
      if (bodyOpened) {
        failAt(
          lineNo,
          indent + 1,
          `header lines must come before "${TREE_BLOCK_MARKER}"`,
          text.trim().slice(0, 40),
        );
      }
      parseHeaderLine(cursor, header);
      continue;
    }

    if (text === TREE_BLOCK_MARKER) {
      if (bodyOpened) {
        failAt(
          lineNo,
          indent + 1,
          `duplicate "${TREE_BLOCK_MARKER}" line — a document holds one tree`,
          TREE_BLOCK_MARKER,
        );
      }
      bodyOpened = true;
      continue;
    }

    if (!bodyOpened) {
      failAt(
        lineNo,
        indent + 1,
        `"${TREE_BLOCK_MARKER}" must come before any node`,
        text.trim().slice(0, 40),
      );
    }

    /* --------------------------- the body ------------------------------- */
    const level = indent / INDENT_STEP - 1;
    if (level < 0) {
      failAt(
        lineNo,
        indent + 1,
        `this line sits outside "${TREE_BLOCK_MARKER}" — indent it ${INDENT_STEP} spaces`,
        text.trim().slice(0, 40),
      );
    }

    /* A `!` escape continues the node above it, exactly as the sugar
       continuations do, so it is read before the keyword dispatch. */
    if (cursor.peek() === "!") {
      const owner = stack[stack.length - 1];
      if (owner === undefined) {
        failAt(
          lineNo,
          cursor.column,
          `a "!" line must sit under a "${NODE_KEYWORD}"`,
          "!",
        );
      }
      if (level !== depthOf(owner) + 1) {
        failAt(
          lineNo,
          indent + 1,
          `a "!" line belongs to the node above it — indent it ${INDENT_STEP} spaces deeper than that "${NODE_KEYWORD}" line`,
          "!",
        );
      }
      cursor.pos += 1;
      cursor.skipSpaces();
      const keyLoc = { line: lineNo, column: cursor.column };
      const key = cursor.readBare(/^[A-Za-z0-9_-]+/, "a field name");
      const { after, value } = readBangTail(cursor);
      if (NODE_KEYS_SET.has(key) && !TREE_NODE_RAW.has(key)) {
        failAt(
          keyLoc.line,
          keyLoc.column,
          `"${key}" has dedicated syntax on a "${NODE_KEYWORD}" line — write it there instead of on a "!" line`,
          key,
        );
      }
      if (TREE_NODE_RAW.has(key)) {
        owner.raw.set(key, { key, after, value, ...keyLoc });
      } else {
        owner.unknowns.push({ key, after, value, ...keyLoc });
      }
      continue;
    }

    const wordLoc = { line: lineNo, column: cursor.column };
    const word = cursor.readBare(/^[a-z]+/, "a tree keyword");
    cursor.skipSpaces();

    if (word === COLUMNS_KEYWORD) {
      if (level !== 0) {
        failAt(
          wordLoc.line,
          wordLoc.column,
          `"${COLUMNS_KEYWORD}" belongs directly under "${TREE_BLOCK_MARKER}", at ${INDENT_STEP} spaces`,
          word,
        );
      }
      if (columns !== undefined) {
        failAt(
          wordLoc.line,
          wordLoc.column,
          `duplicate "${COLUMNS_KEYWORD}" line — the headers are declared once for the whole document`,
          word,
        );
      }
      if (root !== null) {
        failAt(
          wordLoc.line,
          wordLoc.column,
          `"${COLUMNS_KEYWORD}" must come before the first "${NODE_KEYWORD}" — a cell read before its header has nothing to be read under`,
          word,
        );
      }
      const headers: string[] = [];
      while (!cursor.atEnd()) {
        headers.push(cursor.readQuoted("a column header"));
        cursor.skipSpaces();
      }
      if (headers.length === 0) {
        failAt(
          wordLoc.line,
          wordLoc.column,
          `"${COLUMNS_KEYWORD}" needs at least one quoted header, e.g. ${COLUMNS_KEYWORD} "Owner"`,
          word,
        );
      }
      columns = headers;
      columnsLoc = wordLoc;
      continue;
    }

    if (word === LEVELS_KEYWORD) {
      if (level !== 0) {
        failAt(
          wordLoc.line,
          wordLoc.column,
          `"${LEVELS_KEYWORD}" belongs directly under "${TREE_BLOCK_MARKER}", at ${INDENT_STEP} spaces`,
          word,
        );
      }
      if (levels !== undefined) {
        failAt(
          wordLoc.line,
          wordLoc.column,
          `duplicate "${LEVELS_KEYWORD}" line — the depth names are declared once for the whole document`,
          word,
        );
      }
      if (root !== null) {
        failAt(
          wordLoc.line,
          wordLoc.column,
          `"${LEVELS_KEYWORD}" must come before the first "${NODE_KEYWORD}"`,
          word,
        );
      }
      const names: string[] = [];
      while (!cursor.atEnd()) {
        names.push(cursor.readQuoted("a depth name"));
        cursor.skipSpaces();
      }
      if (names.length === 0) {
        failAt(
          wordLoc.line,
          wordLoc.column,
          `"${LEVELS_KEYWORD}" needs at least one quoted name, e.g. ${LEVELS_KEYWORD} "Area"`,
          word,
        );
      }
      levels = names;
      levelsLoc = wordLoc;
      continue;
    }

    if (word === NODE_KEYWORD) {
      /* Pop every ancestor at or below this level. Dedenting several levels
         at once is ordinary — it is what closing three branches looks like. */
      while (stack.length > 0 && depthOf(stack[stack.length - 1]) >= level) {
        stack.pop();
      }
      const parent = stack[stack.length - 1];

      if (level === 0) {
        if (root !== null) {
          failAt(
            wordLoc.line,
            wordLoc.column,
            "a tree document holds exactly one root — a second one is a second document",
            word,
          );
        }
      } else if (parent === undefined || depthOf(parent) !== level - 1) {
        /* NAME THE INDENT THAT WOULD WORK, not the size of the mistake. The
           author cannot act on "two levels too deep" without counting
           columns, and counting columns is how the typo happened. */
        const legal =
          parent === undefined ? INDENT_STEP : parent.indent + INDENT_STEP;
        failAt(
          lineNo,
          indent + 1,
          `this "${NODE_KEYWORD}" is indented ${indent} spaces, which names no parent — a child sits exactly ${INDENT_STEP} spaces past its parent, so this line belongs at ${legal}`,
          text.trim().slice(0, 40),
        );
      }

      const id = cursor.readIdToken("a node id");
      const prior = idAt.get(id);
      if (prior !== undefined) {
        failAt(
          wordLoc.line,
          wordLoc.column,
          `id "${id}" is already used at line ${prior.line} — ids are unique across the document, because a node that appears twice is a graph rather than a tree`,
          id,
        );
      }
      cursor.skipSpaces();
      const label = cursor.readQuoted("the node label");
      cursor.skipSpaces();
      const tags: string[] = [];
      while (!cursor.atEnd() && cursor.peek() === "#") {
        tags.push(readTag(cursor));
        cursor.skipSpaces();
      }
      cursor.expectEnd(`the "${NODE_KEYWORD}" line`);

      const node: PendNode = {
        id,
        label,
        cells: [],
        tags: tags.length > 0 ? tags : undefined,
        children: [],
        indent,
        raw: new Map(),
        unknowns: [],
        line: wordLoc.line,
        column: wordLoc.column,
      };
      idAt.set(id, wordLoc);
      if (level > maxDepth) maxDepth = level;
      if (level === 0) root = node;
      else parent!.children.push(node);
      stack.push(node);
      continue;
    }

    if (CONTINUATION_WORDS.has(word)) {
      const owner = stack[stack.length - 1];
      if (owner === undefined) {
        failAt(
          wordLoc.line,
          wordLoc.column,
          `"${word}" continues a "${NODE_KEYWORD}", and none is open yet`,
          word,
        );
      }
      if (level !== depthOf(owner) + 1) {
        failAt(
          lineNo,
          indent + 1,
          `"${word}" belongs to the node above it — indent it exactly ${INDENT_STEP} spaces deeper than that "${NODE_KEYWORD}" line`,
          word,
        );
      }

      if (word === DESC_KEYWORD) {
        onceString(cursor, owner.description, DESC_KEYWORD);
        owner.description = cursor.readQuoted("the description");
        cursor.expectEnd(`the "${DESC_KEYWORD}" line`);
        continue;
      }

      /* CELL */
      if (columns === undefined) {
        failAt(
          wordLoc.line,
          wordLoc.column,
          `"${CELL_KEYWORD}" needs a "${COLUMNS_KEYWORD}" line — a cell with no header has nothing to be read under`,
          word,
        );
      }
      if (owner.cells.length >= columns.length) {
        failAt(
          wordLoc.line,
          wordLoc.column,
          `this node already fills all ${columns.length} column${columns.length === 1 ? "" : "s"} declared at line ${columnsLoc?.line ?? 1} — add a header before adding a cell`,
          word,
        );
      }
      if (cursor.peek() === EMPTY_CELL_TOKEN) {
        cursor.pos += 1;
        cursor.expectEnd(`the "${CELL_KEYWORD}" line`);
        owner.cells.push("");
        continue;
      }
      owner.cells.push(cursor.readQuoted("the cell text"));
      cursor.expectEnd(`the "${CELL_KEYWORD}" line`);
      continue;
    }

    failAt(
      wordLoc.line,
      wordLoc.column,
      `"${word}" is not a tree keyword — expected "${NODE_KEYWORD}", "${CELL_KEYWORD}", "${DESC_KEYWORD}" or "${COLUMNS_KEYWORD}"`,
      word,
    );
  }

  if (!seenContent) {
    failAt(1, 1, `the file is empty — a tree starts with "archlab 1.0 tree"`);
  }
  if (!bodyOpened) {
    failAt(
      1,
      1,
      `the document has no "${TREE_BLOCK_MARKER}" block, so it holds no tree`,
    );
  }
  if (root === null) {
    failAt(
      1,
      1,
      `the tree has no root — add one "${NODE_KEYWORD}" line under "${TREE_BLOCK_MARKER}"`,
    );
  }

  /* A HEADER OVER A DEPTH THAT DOES NOT EXIST LABELS NOTHING, and is the one
     mistake a `levels` line can make that the reader would see as a stray
     column. Shorter than the tree is deep is fine — that is a document being
     named incrementally. */
  if (levels !== undefined && levels.length > maxDepth + 1) {
    failAt(
      levelsLoc?.line ?? 1,
      levelsLoc?.column ?? 1,
      `"${LEVELS_KEYWORD}" names ${levels.length} depths but the tree is only ${maxDepth + 1} deep — a name over a depth that does not exist labels nothing`,
      LEVELS_KEYWORD,
    );
  }

  return buildFile(header, columns, levels, root);
}

/** A node's depth, derived from the indent its line sat at. */
function depthOf(node: PendNode): number {
  return node.indent / INDENT_STEP - 1;
}

/* -------------------------------------------------------------------------- */
/* Header                                                                      */
/* -------------------------------------------------------------------------- */

function readVersionLine(
  cursor: LineCursor,
  text: string,
  lineNo: number,
  indent: number,
  header: Header,
): void {
  if (indent !== 0 || !text.startsWith("archlab ")) {
    failAt(
      lineNo,
      indent + 1,
      `the file must start with an "archlab <version> ${TREE_HEADER_WORD}" line, e.g. archlab 1.0 ${TREE_HEADER_WORD}`,
      text.trim().slice(0, 40),
    );
  }
  cursor.pos += "archlab".length;
  cursor.skipSpaces();
  const versionLoc = { line: lineNo, column: cursor.column };
  const version = cursor.readBare(/^\d+\.\d+/, 'a schema version like "1.0"');
  cursor.skipSpaces();
  if (cursor.atEnd()) {
    failAt(
      lineNo,
      cursor.column,
      `this is a C4 ".alab" header — a tree must read "archlab ${version} ${TREE_HEADER_WORD}"`,
      text.trim().slice(0, 40),
    );
  }
  const wordLoc = { line: lineNo, column: cursor.column };
  const word = cursor.readBare(/^[a-z]+/, `"${TREE_HEADER_WORD}"`);
  if (word !== TREE_HEADER_WORD) {
    const named: Record<string, string> = {
      [SEQUENCE_HEADER_WORD]: "sequence",
      [FLOWCHART_HEADER_WORD]: "flowchart",
      [USECASE_HEADER_WORD]: "use-case",
      [ER_HEADER_WORD]: "ER",
      [DICT_HEADER_WORD]: "dictionary",
      [GANTT_HEADER_WORD]: "gantt",
      [TIMELINE_HEADER_WORD]: "timeline",
      [LIFECYCLE_HEADER_WORD]: "lifecycle",
    };
    failAt(
      wordLoc.line,
      wordLoc.column,
      named[word] !== undefined
        ? `this is ${named[word] === "ER" ? "an" : "a"} ${named[word]} ".alab" header — a tree must read "archlab ${version} ${TREE_HEADER_WORD}"`
        : `"${word}" is not a document type — expected "archlab ${version} ${TREE_HEADER_WORD}"`,
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
}

function parseHeaderLine(cursor: LineCursor, header: Header): void {
  const loc = { line: cursor.line, column: cursor.column };

  if (cursor.peek() === "!") {
    cursor.pos += 1;
    cursor.skipSpaces();
    const keyLoc = { line: cursor.line, column: cursor.column };
    const key = cursor.readBare(/^[A-Za-z0-9_-]+/, "a field name");
    const { after, value } = readBangTail(cursor);
    if (key === "$schema") {
      header.schemaRaw = { key, after, value, ...keyLoc };
      return;
    }
    if (TREE_META_RAW.has(key)) {
      header.metaRaw.set(key, { key, after, value, ...keyLoc });
      return;
    }
    if ((META_KEYS as readonly string[]).includes(key)) {
      failAt(
        keyLoc.line,
        keyLoc.column,
        `"${key}" has dedicated syntax — write it as a header line instead of on a "!" line`,
        key,
      );
    }
    header.metaUnknowns.push({ key, after, value, ...keyLoc });
    return;
  }

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
      header.description = cursor.readQuoted("the description");
      break;
    case "owner":
      onceString(cursor, header.owner, keyword);
      header.owner = cursor.readQuoted("the owner");
      break;
    case "created":
      onceString(cursor, header.created, keyword);
      header.created = cursor.readQuoted("the created timestamp");
      break;
    case "updated":
      onceString(cursor, header.updated, keyword);
      header.updated = cursor.readQuoted("the updated timestamp");
      break;
    case "reviewed":
      onceString(cursor, header.reviewed, keyword);
      header.reviewed = cursor.readQuoted("the reviewed timestamp");
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
      header.tags = tags;
      break;
    }
    default:
      failAt(
        loc.line,
        loc.column,
        `"${keyword}" is not a recognised header keyword`,
        keyword,
      );
  }
  cursor.expectEnd("the header line");
}

/* -------------------------------------------------------------------------- */
/* Assembly                                                                    */
/* -------------------------------------------------------------------------- */

function buildNode(node: PendNode): Record<string, unknown> {
  const pairs: [string, unknown][] = [
    ["id", node.id],
    ["label", node.label],
  ];
  const tags = pick(node.tags, node.raw, "tags");
  if (tags !== undefined) pairs.push(["tags", tags]);
  const description = pick(node.description, node.raw, "description");
  if (description !== undefined) pairs.push(["description", description]);
  /* Trailing empty cells are dropped: they are positions the author never
     filled, and writing them back would grow the file on every save. An empty
     cell with a filled one AFTER it is kept, because dropping that one would
     shift the author's prose a column left. */
  const trimmed = [...node.cells];
  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === "") {
    trimmed.pop();
  }
  if (trimmed.length > 0) pairs.push(["cells", trimmed]);
  if (node.children.length > 0) {
    pairs.push(["children", node.children.map(buildNode)]);
  }
  return assemble(pairs, node.unknowns);
}

function buildFile(
  header: Header,
  columns: string[] | undefined,
  levels: string[] | undefined,
  root: PendNode,
): TreeLabFile {
  /* THE METADATA KEY NAMES ARE THE MODEL'S, NOT THE KEYWORD'S. The text says
     `created`, the model says `createdAt` — `ArchLabMetadata` is shared by all
     ten kinds and this parser does not get to spell it differently. The two
     timestamps default to `DEFAULT_TIMESTAMP` rather than to "now", so parsing
     stays a pure function and the serializer's omission rule is symmetric. */
  const metaPairs: [string, unknown][] = [];
  const add = (key: string, value: unknown) => {
    if (value !== undefined) metaPairs.push([key, value]);
  };
  add("title", pick(header.title, header.metaRaw, "title") ?? "");
  add("description", pick(header.description, header.metaRaw, "description"));
  add("owner", pick(header.owner, header.metaRaw, "owner"));
  add("tags", pick(header.tags, header.metaRaw, "tags"));
  add(
    "createdAt",
    pick(header.created, header.metaRaw, "createdAt") ?? DEFAULT_TIMESTAMP,
  );
  add(
    "updatedAt",
    pick(header.updated, header.metaRaw, "updatedAt") ?? DEFAULT_TIMESTAMP,
  );
  add(
    "lastReviewedAt",
    pick(header.reviewed, header.metaRaw, "lastReviewedAt"),
  );
  const metadata = assemble(metaPairs, header.metaUnknowns);

  const file: Record<string, unknown> = {};
  /* A `! $schema` line wins over the `schema` sugar for the same reason the
     escape wins anywhere else: it is the only spelling a newer minor has. */
  if (header.schemaRaw !== undefined) file.$schema = header.schemaRaw.value;
  else if (header.schema !== undefined) file.$schema = header.schema;
  file.version = header.version;
  file.kind = TREE_HEADER_WORD;
  file.metadata = metadata;
  if (levels !== undefined) file.levels = levels;
  if (columns !== undefined) file.columns = columns;
  file.root = buildNode(root);

  return assemble(
    Object.entries(file),
    header.fileUnknowns,
  ) as unknown as TreeLabFile;
}

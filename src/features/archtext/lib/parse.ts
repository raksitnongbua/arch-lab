/**
 * `.alab` text → `ArchLabFile`. A line-structured recursive-descent parser:
 * the source is split into lines, each line is tokenized by a `LineCursor`,
 * significant indentation (0 = header/diagram, 2 = diagram body, 4 = node/
 * edge continuation, always spaces) selects the grammar production, and a
 * final resolve pass applies the canonical defaults and cross-references
 * (owner → parent inference, root inference, geometry defaults, edge ids,
 * level-chain and duplicate-id checks).
 *
 * Every failure throws `ArchTextParseError` naming a 1-based line and
 * column; a parse is all-or-nothing. Successful parses produce models that
 * pass the editor's `validateArchLabFile` unchanged.
 *
 * Imported by `scripts/archtext-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import { C4_LEVELS, VALID_NODE_TYPES_BY_LEVEL } from "@/types";
import type {
  ArchLabFile,
  C4Level,
  C4NodeType,
  EdgeDirection,
  EdgeStyle,
  IconSource,
} from "@/types";

import { newerVersionMessage, SUPPORTED_MAJOR_VERSION } from "@/lib/constants";

import { LineCursor } from "./cursor";
import { compareStrings, defaultEdgeId, DEFAULT_TIMESTAMP } from "./defaults";
import { defaultPositions, defaultSizeFor } from "./defaults";
import { failAt } from "./errors";
import { ARROWS, NODE_TYPE_BY_KEYWORD } from "./keywords";
import {
  DIAGRAM_RAW,
  EDGE_RAW,
  FILE_KEYS,
  META_KEYS,
  META_RAW,
  NODE_KEYS,
  NODE_RAW,
} from "./schema";

/* -------------------------------------------------------------------------- */
/* Pending structures collected during the line pass                          */
/* -------------------------------------------------------------------------- */

/* Exported (with the helpers below) for the sequence grammar in
   `./sequence/parse.ts`: both `.alab` document types share one `!` escape
   and one attribute vocabulary, so the code that reads them must be shared
   too — a copy would be a second source of truth waiting to drift. */
export interface Pend {
  key: string;
  after: string | null;
  value: unknown;
  line: number;
  column: number;
}

export interface Loc {
  line: number;
  column: number;
}

/**
 * A declaration that can own indent-4 continuation lines. `endLine` is the
 * last line of the block — the declaration line itself when it has none.
 *
 * Tracked so `parseArchTextWithSpans` can hand a caller the LINE RANGE each
 * node and edge occupies. That is what lets the editable canvas splice one
 * line into the author's own text instead of re-emitting the whole document,
 * which silently deleted every `//` comment in it (this parser drops comment
 * lines with no capture, and the serializer has nothing to write back).
 * See `playground/input/canvas-edit.ts`.
 */
interface PendingBlock extends Loc {
  endLine: number;
}

interface PendingNode extends PendingBlock {
  id: string;
  type: C4NodeType;
  /**
   * Absent when a `^ref` line omitted it; the resolve pass derives it from the
   * referenced node and every node reaches `assemble` with a name. Optional
   * here only, never in `C4Node`.
   */
  name?: string;
  description?: string;
  technology?: string;
  icon?: string;
  iconSource?: IconSource;
  tags?: string[];
  childDiagramId?: string | null;
  hasChildDiagramId: boolean;
  childRefValue?: string;
  childRefLoc?: Loc;
  externalRef?: { diagramId: string; nodeId: string };
  frameId?: string;
  frameIdLoc?: Loc;
  pinned?: boolean;
  geometry?: { x: number; y: number; width: number; height: number };
  raw: Map<string, Pend>;
  unknowns: Pend[];
  positionUnknowns: Pend[];
  sizeUnknowns: Pend[];
  externalRefUnknowns: Pend[];
}

/** A `frame <id> "Label" [in=<parent>]` line, before cross-checking. */
interface PendingFrame extends Loc {
  id: string;
  label: string;
  /** Meaningful only when `hasIn` is true; `null` = explicit `in=null`. */
  parentFrameId?: string | null;
  hasIn: boolean;
  inLoc?: Loc;
}

interface PendingEdge extends PendingBlock {
  source: string;
  sourceLoc: Loc;
  target: string;
  targetLoc: Loc;
  direction: EdgeDirection;
  style?: EdgeStyle;
  label?: string;
  technology?: string;
  tags?: string[];
  realizes?: string;
  explicitId?: string;
  waypoints?: { x: number; y: number }[];
  raw: Map<string, Pend>;
  unknowns: Pend[];
  waypointUnknowns: Map<number, Pend[]>;
}

interface PendingDiagram extends Loc {
  id: string;
  level: C4Level;
  title?: string;
  ownerAttr?: string;
  directionAttr?: "tb" | "lr";
  /** Meaningful only when `hasIn` is true; `null` = explicit `in=null`. */
  inAttr?: string | null;
  hasIn: boolean;
  inLoc?: Loc;
  description?: string;
  viewport?: { zoom: number; x: number; y: number };
  frames: PendingFrame[];
  nodes: PendingNode[];
  edges: PendingEdge[];
  raw: Map<string, Pend>;
  unknowns: Pend[];
  viewportUnknowns: Pend[];
}

interface Header {
  version?: string;
  versionLoc?: Loc;
  schema?: string;
  /** File-wide default layout direction; a diagram may override it. */
  direction?: "tb" | "lr";
  /** Source line of the `direction` line, for `ArchTextSpans.header`. */
  directionLine?: number;
  title?: string;
  description?: string;
  owner?: string;
  tags?: string[];
  created?: string;
  updated?: string;
  reviewed?: string;
  tagColors?: Map<string, string>;
  /** Source line of each `tagcolor` line, for `ArchTextSpans.header`. */
  tagColorLines?: Map<string, number>;
  customIcons?: Map<string, { name: string; svg: string }>;
  generator?: { name: string; version: string };
  root?: string;
  rootLoc?: Loc;
  metaRaw: Map<string, Pend>;
  metaUnknowns: Pend[];
  generatorUnknowns: Pend[];
  customIconUnknowns: Map<string, Pend[]>;
  schemaRaw?: Pend;
  fileUnknowns: Pend[];
}

export interface PathSegment {
  value: string | number;
  quoted: boolean;
  line: number;
  column: number;
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Builds an object from present known fields (already in schema order) plus
 * the unknown fields carried by `!` lines, each spliced in right after its
 * `after` anchor — the inverse of `splitUnknowns`, so the editor's JSON
 * serializer reproduces the original key positions byte-for-byte.
 */
export function assemble(
  pairs: readonly (readonly [string, unknown])[],
  unknowns: readonly Pend[],
): Record<string, unknown> {
  const knownKeys = new Set(pairs.map(([key]) => key));
  const seen = new Set<string>();
  for (const u of unknowns) {
    if (knownKeys.has(u.key)) {
      failAt(u.line, u.column, `"${u.key}" is already set on this element`);
    }
    if (seen.has(u.key)) {
      failAt(u.line, u.column, `duplicate "!" line for key "${u.key}"`);
    }
    seen.add(u.key);
    if (u.after !== null && !knownKeys.has(u.after)) {
      failAt(
        u.line,
        u.column,
        `the "after ${u.after}" anchor does not name a field present on this element`,
      );
    }
  }
  const out: Record<string, unknown> = {};
  for (const u of unknowns) {
    if (u.after === null) out[u.key] = u.value;
  }
  for (const [key, value] of pairs) {
    out[key] = value;
    for (const u of unknowns) {
      if (u.after === key) out[u.key] = u.value;
    }
  }
  return out;
}

/** Sugar value and raw `!` value for the same key are mutually exclusive. */
export function pick<T>(
  sugar: T | undefined,
  raw: Map<string, Pend>,
  key: string,
): unknown {
  const rawPend = raw.get(key);
  if (rawPend !== undefined) {
    if (sugar !== undefined) {
      failAt(
        rawPend.line,
        rawPend.column,
        `"${key}" is set both inline and by this "!" line — remove one`,
      );
    }
    return rawPend.value;
  }
  return sugar;
}

export function readTag(cursor: LineCursor): string {
  cursor.expect("#", 'a tag ("#name")');
  if (cursor.peek() === '"') return cursor.readQuoted("tag");
  return cursor.readBare(/^[A-Za-z0-9_][A-Za-z0-9_.:-]*/, "a tag name");
}

/** Reads a `!` path: `seg(.seg)*` where a segment is bare, quoted or an index. */
export function readPath(cursor: LineCursor): PathSegment[] {
  const segments: PathSegment[] = [];
  for (;;) {
    const line = cursor.line;
    const column = cursor.column;
    let value: string | number;
    let quoted = false;
    if (cursor.peek() === '"') {
      value = cursor.readQuoted("field name");
      quoted = true;
    } else {
      const raw = cursor.readBare(
        /^[A-Za-z0-9_-]+/,
        'a field name (bare, "quoted", or an array index)',
      );
      value = /^\d+$/.test(raw) ? Number(raw) : raw;
    }
    segments.push({ value, quoted, line, column });
    if (!cursor.eat(".")) break;
  }
  return segments;
}

/** Parses the shared tail of a `!` line: `[after <key>] : <json>`. */
export function readBangTail(cursor: LineCursor): {
  after: string | null;
  value: unknown;
} {
  cursor.skipSpaces();
  let after: string | null = null;
  if (
    cursor.text.startsWith("after", cursor.pos) &&
    cursor.text.charAt(cursor.pos + 5) === " "
  ) {
    cursor.pos += 5;
    cursor.skipSpaces();
    after =
      cursor.peek() === '"'
        ? cursor.readQuoted("anchor field name")
        : cursor.readBare(/^[A-Za-z0-9_-]+/, "an anchor field name");
    cursor.skipSpaces();
  }
  cursor.expect(":", '":" before the JSON value');
  const value = cursor.readJsonToEnd("the field value");
  return { after, value };
}

export function segString(segment: PathSegment, what: string): string {
  if (typeof segment.value !== "string") {
    failAt(
      segment.line,
      segment.column,
      `expected ${what}, not an array index`,
    );
  }
  return segment.value;
}

/* -------------------------------------------------------------------------- */
/* The parser                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The 1-based, INCLUSIVE line range one declaration occupies in the source,
 * continuation lines included. `start === end` for a single-line declaration.
 */
export interface LineSpan {
  start: number;
  end: number;
}

/**
 * Where each node and edge of a parse sits in the source text.
 *
 * Keyed by `spanKey(diagramId, memberId)` — ids are unique per diagram, not
 * per file, so the diagram has to be part of the key. Edge keys use the
 * RESOLVED id (the explicit `id=` or the default `e-<source>-<target>`), which
 * is the id the model carries, so a caller holding a model edge can look its
 * line up without re-deriving the default.
 *
 * The point of this is to make a text edit possible where a re-emit is
 * lossy: the serializer writes canonical text, which has no `//` comments, no
 * author blank lines and no fields omitted-at-default that the author wrote
 * out anyway. Splicing lines by span keeps every byte the edit did not touch.
 */
/**
 * Where the HEADER can be patched. Unlike nodes and edges the header is not
 * one block with one span — its lines carry unrelated keywords in author
 * order — so this records only what a header patch needs: where each
 * `tagcolor` line sits (a colour edit keys off the tag), and the last header
 * content line, after which a new header line may be inserted without ever
 * landing inside a diagram (`header lines must appear before the first "@"
 * diagram` is the parser's own rule).
 */
export interface HeaderSpans {
  /** 1-based line of the last header content line — insert AFTER this. */
  end: number;
  /** 1-based line of each `tagcolor` line, keyed by tag. */
  tagColors: ReadonlyMap<string, number>;
  /**
   * 1-based line of the `direction` line, when the file has one. Recorded for
   * the same reason `tagColors` is: the canvas's direction control replaces
   * that one line, and a gesture that had to FIND it would be re-implementing
   * the header parse in a module that already has the parse's answer.
   */
  direction?: number;
}

export interface ArchTextSpans {
  nodes: ReadonlyMap<string, LineSpan>;
  edges: ReadonlyMap<string, LineSpan>;
  /**
   * Each `frame` line, keyed by `spanKey(diagramId, frameId)`. Always a
   * single line (`start === end`): the frame grammar has no continuation
   * lines. Recorded so the boundary gesture can splice a minted `frame` line
   * beside the existing ones instead of scanning the text for them — the
   * second-parser move `codebase.md` bans.
   */
  frames: ReadonlyMap<string, LineSpan>;
  /**
   * The 1-based line of each diagram's `@<level>` head, keyed by diagram id.
   * The HEAD only, not the block: a diagram's members already have their own
   * spans above, and the one caller that removes a whole diagram
   * (`unnestedNodeEdit`) refuses anything but an EMPTY one — whose block IS
   * its head line.
   */
  diagramHeads: ReadonlyMap<string, number>;
  header: HeaderSpans;
}

/** The `ArchTextSpans` key for a member of a diagram. */
export function spanKey(diagramId: string, memberId: string): string {
  // A space is safe as the joiner where `.` or `-` would not be: the id
  // grammar is `[A-Za-z0-9_][A-Za-z0-9_.-]*`, so no id can contain a space and
  // therefore no pair of ids can forge another pair's key.
  return `${diagramId} ${memberId}`;
}

interface SpanCollector {
  nodes: Map<string, LineSpan>;
  edges: Map<string, LineSpan>;
  frames: Map<string, LineSpan>;
  diagramHeads: Map<string, number>;
  header: HeaderSpans;
}

/**
 * Parses `.alab` source into an `ArchLabFile`. Pure and deterministic; the
 * result passes the editor's `validateArchLabFile` unchanged. Throws
 * `ArchTextParseError` (line + column) on any problem — all-or-nothing.
 */
export function parseArchText(source: string): ArchLabFile {
  return parseArchTextWithSpans(source).file;
}

/**
 * `parseArchText`, plus where every node and edge came from — the same parse,
 * so the spans cannot describe a different reading of the text than the model
 * does. Callers that only want the model should use `parseArchText`.
 */
export function parseArchTextWithSpans(source: string): {
  file: ArchLabFile;
  spans: ArchTextSpans;
} {
  const header: Header = {
    metaRaw: new Map(),
    metaUnknowns: [],
    generatorUnknowns: [],
    customIconUnknowns: new Map(),
    fileUnknowns: [],
  };
  const diagrams: PendingDiagram[] = [];
  const diagramById = new Map<string, PendingDiagram>();
  const nodeHome = new Map<
    string,
    { diagram: PendingDiagram; node: PendingNode }
  >();

  let phase: "header" | "diagrams" = "header";
  let current: PendingDiagram | null = null;
  let member: PendingNode | PendingEdge | null = null;
  let seenContent = false;
  // The last header CONTENT line (comments and blanks between the header and
  // the first "@" belong to nobody, so an insertion after this line can never
  // split a diagram) — see `HeaderSpans.end`.
  let headerEnd = 0;

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
    if (indent !== 0 && indent !== 2 && indent !== 4) {
      failAt(
        lineNo,
        indent + 1,
        `inconsistent indentation of ${indent} space${indent === 1 ? "" : "s"} — expected 0 (header or "@" diagram), 2 (diagram body) or 4 (node/edge continuation)`,
        text.trim().slice(0, 40),
      );
    }

    const cursor = new LineCursor(text, lineNo, indent);

    /* --------------------------- first content line ---------------------- */
    if (!seenContent) {
      seenContent = true;
      if (indent !== 0 || !text.startsWith("archlab ")) {
        failAt(
          lineNo,
          indent + 1,
          'the file must start with an "archlab <version>" line, e.g. archlab 1.0',
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
      cursor.expectEnd("the version");
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
      header.versionLoc = versionLoc;
      headerEnd = lineNo;
      continue;
    }

    /* ------------------------------- indent 0 ---------------------------- */
    if (indent === 0) {
      current = null;
      member = null;
      if (cursor.peek() === "@") {
        phase = "diagrams";
        current = parseDiagramHeader(cursor, diagramById);
        diagrams.push(current);
        continue;
      }
      if (phase === "diagrams") {
        failAt(
          lineNo,
          1,
          'header lines must appear before the first "@" diagram',
          text.trim().slice(0, 40),
        );
      }
      if (cursor.peek() === "!") {
        parseHeaderBang(cursor, header);
        headerEnd = lineNo;
        continue;
      }
      parseHeaderLine(cursor, header);
      headerEnd = lineNo;
      continue;
    }

    /* ------------------------------- indent 2 ---------------------------- */
    if (indent === 2) {
      if (current === null) {
        failAt(
          lineNo,
          3,
          'this line is indented like a diagram body, but no "@" diagram is open above it',
          text.trim().slice(0, 40),
        );
      }
      member = parseBodyLine(cursor, current, nodeHome);
      continue;
    }

    /* ------------------------------- indent 4 ---------------------------- */
    if (member === null) {
      failAt(
        lineNo,
        5,
        "this continuation line has no node or edge line above it",
        text.trim().slice(0, 40),
      );
    }
    parseContinuation(cursor, member);
    // The block now reaches this line. Recorded here rather than inside
    // `parseContinuation` because this loop is the only place that knows a
    // line number without being handed one.
    member.endLine = lineNo;
  }

  if (!seenContent || header.version === undefined) {
    failAt(1, 1, 'the file is empty — expected an "archlab <version>" line');
  }

  const spans: SpanCollector = {
    nodes: new Map(),
    edges: new Map(),
    frames: new Map(),
    diagramHeads: new Map(),
    header: {
      end: headerEnd,
      tagColors: header.tagColorLines ?? new Map(),
      direction: header.directionLine,
    },
  };
  const file = resolve(header, diagrams, diagramById, nodeHome, spans);
  return { file, spans };
}

/* -------------------------------------------------------------------------- */
/* Header lines                                                               */
/* -------------------------------------------------------------------------- */

export function onceString(
  cursor: LineCursor,
  existing: string | undefined,
  keyword: string,
): void {
  if (existing !== undefined) {
    cursor.fail(`duplicate "${keyword}" line — it may appear only once`);
  }
}

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
    case "direction": {
      if (header.direction !== undefined) {
        cursor.fail('duplicate "direction" line — it may appear only once');
      }
      /* Bare, not quoted: it is one of two fixed words, like a node type,
       * rather than free text like a title. Refused BY NAME when it is
       * neither, because a silently ignored layout hint is a diagram that
       * lays out the way the author did not ask for with nothing to explain
       * why. */
      const value = cursor.readBare(/^[a-z]+/, '"tb" or "lr"');
      if (value !== "tb" && value !== "lr") {
        cursor.fail(
          `"${value}" is not a layout direction — expected "tb" (top-down, the default) or "lr" (left-to-right, folding a long flow into bands)`,
        );
      }
      header.direction = value;
      header.directionLine = loc.line;
      break;
    }
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
    case "tagcolor": {
      const tag =
        cursor.peek() === '"'
          ? cursor.readQuoted("the tag name")
          : cursor.readBare(/^[A-Za-z0-9_][A-Za-z0-9_.:-]*/, "a tag name");
      cursor.skipSpaces();
      const color = cursor.readQuoted("the colour");
      header.tagColors = header.tagColors ?? new Map();
      if (header.tagColors.has(tag)) {
        cursor.fail(`duplicate "tagcolor" line for tag "${tag}"`);
      }
      header.tagColors.set(tag, color);
      header.tagColorLines = header.tagColorLines ?? new Map();
      header.tagColorLines.set(tag, cursor.line);
      break;
    }
    case "customicon": {
      const slug =
        cursor.peek() === '"'
          ? cursor.readQuoted("the icon slug")
          : cursor.readBare(/^[A-Za-z0-9_][A-Za-z0-9_.-]*/, "an icon slug");
      cursor.skipSpaces();
      const name = cursor.readQuoted("the icon name");
      cursor.skipSpaces();
      const svg = cursor.readQuoted("the icon SVG");
      header.customIcons = header.customIcons ?? new Map();
      if (header.customIcons.has(slug)) {
        cursor.fail(`duplicate "customicon" line for slug "${slug}"`);
      }
      header.customIcons.set(slug, { name, svg });
      break;
    }
    case "generator": {
      if (header.generator !== undefined) {
        cursor.fail('duplicate "generator" line — it may appear only once');
      }
      const name = cursor.readQuoted("the generator name");
      cursor.skipSpaces();
      const version = cursor.readQuoted("the generator version");
      header.generator = { name, version };
      break;
    }
    case "root":
      onceString(cursor, header.root, keyword);
      header.rootLoc = { line: cursor.line, column: cursor.column };
      header.root = cursor.readIdToken("the root diagram id");
      break;
    default:
      failAt(
        loc.line,
        loc.column,
        `"${keyword}" is not a recognised header keyword — expected archlab, schema, title, ` +
          "description, owner, direction, tags, created, updated, reviewed, tagcolor, customicon, generator or root",
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

  /* ---- metadata tree: `! meta.…` (bare `meta` only) ---- */
  if (first.value === "meta" && !first.quoted) {
    if (path.length === 1) {
      failAt(
        first.line,
        first.column,
        'expected a metadata field after "meta." — e.g. ! meta.x-review : { … }',
      );
    }
    const second = path[1];
    const secondKey = segString(second, "a metadata field name");
    if (path.length === 2) {
      const dedicated = META_DEDICATED[secondKey];
      if (dedicated !== undefined && !second.quoted) {
        failAt(
          second.line,
          second.column,
          `"${secondKey}" has dedicated syntax — use ${dedicated}`,
        );
      }
      const pend: Pend = {
        key: secondKey,
        after: tail.after,
        value: tail.value,
        line: second.line,
        column: second.column,
      };
      if (META_RAW.has(secondKey)) {
        if (header.metaRaw.has(secondKey)) {
          failAt(
            second.line,
            second.column,
            `duplicate "!" line for "meta.${secondKey}"`,
          );
        }
        header.metaRaw.set(secondKey, pend);
      } else if ((META_KEYS as readonly string[]).includes(secondKey)) {
        failAt(
          second.line,
          second.column,
          `"meta.${secondKey}" has dedicated syntax — set it with its header line`,
        );
      } else {
        header.metaUnknowns.push(pend);
      }
      return;
    }
    if (secondKey === "generator" && path.length === 3) {
      const key = segString(path[2], "a generator field name");
      if (key === "name" || key === "version") {
        failAt(
          path[2].line,
          path[2].column,
          `"meta.generator.${key}" has dedicated syntax — use the "generator" line`,
        );
      }
      header.generatorUnknowns.push({
        key,
        after: tail.after,
        value: tail.value,
        line: path[2].line,
        column: path[2].column,
      });
      return;
    }
    if (secondKey === "customIcons" && path.length === 4) {
      const slug = segString(path[2], "an icon slug");
      const key = segString(path[3], "an icon field name");
      if (key === "name" || key === "svg") {
        failAt(
          path[3].line,
          path[3].column,
          `"meta.customIcons.${slug}.${key}" has dedicated syntax — use the "customicon" line`,
        );
      }
      const bucket = header.customIconUnknowns.get(slug) ?? [];
      bucket.push({
        key,
        after: tail.after,
        value: tail.value,
        line: path[3].line,
        column: path[3].column,
      });
      header.customIconUnknowns.set(slug, bucket);
      return;
    }
    failAt(
      second.line,
      second.column,
      `"meta.${secondKey}" cannot nest here — only meta.<key>, meta.generator.<key> and meta.customIcons.<slug>.<key> paths exist`,
    );
  }

  /* ---- file scope ---- */
  if (path.length !== 1) {
    failAt(
      first.line,
      first.column,
      'top-level "!" paths cannot nest — only "! <key> : <json>" and "! meta.…" are valid in the header',
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
  if ((FILE_KEYS as readonly string[]).includes(key)) {
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
/* Diagram header                                                             */
/* -------------------------------------------------------------------------- */

function parseDiagramHeader(
  cursor: LineCursor,
  diagramById: Map<string, PendingDiagram>,
): PendingDiagram {
  const loc = { line: cursor.line, column: cursor.column };
  cursor.expect("@", '"@"');
  const levelWord = cursor.readBare(/^[a-z]+/, "a C4 level");
  if (!(C4_LEVELS as readonly string[]).includes(levelWord)) {
    failAt(
      loc.line,
      loc.column,
      `"@${levelWord}" is not a C4 level — expected @context, @container, @component or @code`,
      `@${levelWord}`,
    );
  }
  cursor.skipSpaces();
  const idLoc = { line: cursor.line, column: cursor.column };
  const id = cursor.readIdToken("the diagram id");
  const existing = diagramById.get(id);
  if (existing !== undefined) {
    failAt(
      idLoc.line,
      idLoc.column,
      `duplicate diagram id "${id}" — already declared on line ${existing.line}`,
      id,
    );
  }
  const diagram: PendingDiagram = {
    ...loc,
    id,
    level: levelWord as C4Level,
    hasIn: false,
    frames: [],
    nodes: [],
    edges: [],
    raw: new Map(),
    unknowns: [],
    viewportUnknowns: [],
  };
  cursor.skipSpaces();
  if (cursor.peek() === '"') {
    diagram.title = cursor.readQuoted("the diagram title");
    cursor.skipSpaces();
  }
  while (!cursor.atEnd()) {
    const attrLoc = { line: cursor.line, column: cursor.column };
    const word = cursor.readBare(
      /^[a-z]+/,
      'a diagram attribute ("owner=", "in=" or "direction=")',
    );
    cursor.expect("=", `"=" after "${word}"`);
    if (word === "owner") {
      if (diagram.ownerAttr !== undefined) {
        failAt(attrLoc.line, attrLoc.column, 'duplicate "owner=" attribute');
      }
      diagram.ownerAttr = cursor.readIdToken("the owner node id");
    } else if (word === "direction") {
      if (diagram.directionAttr !== undefined) {
        failAt(
          attrLoc.line,
          attrLoc.column,
          'duplicate "direction=" attribute',
        );
      }
      const value = cursor.readBare(/^[a-z]+/, '"tb" or "lr"');
      if (value !== "tb" && value !== "lr") {
        failAt(
          attrLoc.line,
          attrLoc.column,
          `"${value}" is not a layout direction — expected "tb" (top-down, the default) or "lr" (left-to-right, folding a long flow into bands)`,
          value,
        );
      }
      diagram.directionAttr = value;
    } else if (word === "in") {
      if (diagram.hasIn) {
        failAt(attrLoc.line, attrLoc.column, 'duplicate "in=" attribute');
      }
      diagram.inLoc = { line: cursor.line, column: cursor.column };
      if (cursor.peek() === '"') {
        const quoted = cursor.readQuoted("the parent diagram id");
        if (quoted === "")
          cursor.fail("the parent diagram id must not be empty");
        diagram.inAttr = quoted;
      } else {
        const word2 = cursor.readBare(
          /^[A-Za-z0-9_][A-Za-z0-9_.-]*/,
          'a parent diagram id (or "null")',
        );
        diagram.inAttr = word2 === "null" ? null : word2;
      }
      diagram.hasIn = true;
    } else {
      failAt(
        attrLoc.line,
        attrLoc.column,
        `"${word}" is not a diagram attribute — expected owner=<node> or in=<diagram>`,
        word,
      );
    }
    cursor.skipSpaces();
  }
  diagramById.set(id, diagram);
  return diagram;
}

/* -------------------------------------------------------------------------- */
/* Diagram body: desc / view / ! / node / edge                                */
/* -------------------------------------------------------------------------- */

function parseBodyLine(
  cursor: LineCursor,
  diagram: PendingDiagram,
  nodeHome: Map<string, { diagram: PendingDiagram; node: PendingNode }>,
): PendingNode | PendingEdge | null {
  if (cursor.peek() === "!") {
    parseScopeBang(cursor, "diagram", {
      raw: diagram.raw,
      rawAllowed: DIAGRAM_RAW,
      known: DIAGRAM_KEYS_SET,
      unknowns: diagram.unknowns,
      nested: {
        viewport: { known: VIEWPORT_SET, bucket: diagram.viewportUnknowns },
      },
    });
    return null;
  }
  const startLoc = { line: cursor.line, column: cursor.column };
  const first =
    cursor.peek() === '"'
      ? cursor.readQuoted("a node or edge id")
      : cursor.readBare(
          /^[A-Za-z0-9_!][A-Za-z0-9_.-]*/,
          "a node id, edge source, desc, view or !",
        );

  if (
    cursor.peek() === ":" &&
    !cursor.text.startsWith(" ", cursor.pos + 1) &&
    cursor.text.charAt(cursor.pos + 1) !== ""
  ) {
    return parseNodeLine(cursor, startLoc, first, diagram, nodeHome);
  }
  if (first === "desc" && cursor.peek() === " ") {
    cursor.skipSpaces();
    if (cursor.peek() === '"') {
      if (diagram.description !== undefined) {
        failAt(
          startLoc.line,
          startLoc.column,
          'duplicate "desc" line for this diagram',
        );
      }
      diagram.description = cursor.readQuoted("the diagram description");
      cursor.expectEnd('the "desc" line');
      return null;
    }
  }
  if (first === "frame" && cursor.peek() === " ") {
    cursor.skipSpaces();
    const idLoc = { line: cursor.line, column: cursor.column };
    const id = cursor.readIdToken("the frame id");
    const duplicate = diagram.frames.find((f) => f.id === id);
    if (duplicate !== undefined) {
      failAt(
        idLoc.line,
        idLoc.column,
        `duplicate frame id "${id}" — already declared on line ${duplicate.line}; frame ids must be unique within a diagram`,
        id,
      );
    }
    cursor.skipSpaces();
    const label = cursor.readQuoted("the frame label");
    if (label === "") {
      cursor.fail("the frame label must not be empty");
    }
    const frame: PendingFrame = { ...idLoc, id, label, hasIn: false };
    cursor.skipSpaces();
    if (!cursor.atEnd()) {
      const inLoc = { line: cursor.line, column: cursor.column };
      const word = cursor.readBare(/^[a-z]+/, 'the "in=" attribute');
      if (word !== "in") {
        failAt(
          inLoc.line,
          inLoc.column,
          `"${word}" is not a frame attribute — only in=<frame> is allowed`,
          word,
        );
      }
      cursor.expect("=", '"=" after "in"');
      const parent = cursor.readBare(
        /^[A-Za-z0-9_][A-Za-z0-9_.-]*/,
        'an enclosing frame id (or "null")',
      );
      frame.parentFrameId = parent === "null" ? null : parent;
      frame.hasIn = true;
      frame.inLoc = inLoc;
    }
    cursor.expectEnd('the "frame" line');
    diagram.frames.push(frame);
    return null;
  }
  if (first === "view" && cursor.peek() === " ") {
    if (diagram.viewport !== undefined) {
      failAt(
        startLoc.line,
        startLoc.column,
        'duplicate "view" line for this diagram',
      );
    }
    cursor.skipSpaces();
    const zoom = cursor.readNumber("the zoom");
    cursor.skipSpaces();
    const x = cursor.readNumber("the viewport x");
    cursor.skipSpaces();
    const y = cursor.readNumber("the viewport y");
    cursor.expectEnd('the "view" line');
    diagram.viewport = { zoom, x, y };
    return null;
  }
  return parseEdgeLine(cursor, startLoc, first, diagram);
}

const DIAGRAM_KEYS_SET: ReadonlySet<string> = new Set([
  "id",
  "level",
  "title",
  "description",
  "ownerNodeId",
  "parentDiagramId",
  "viewport",
  "direction",
  "frames",
  "nodes",
  "edges",
]);
const NODE_KEYS_SET: ReadonlySet<string> = new Set(NODE_KEYS);
const EDGE_KEYS_SET: ReadonlySet<string> = new Set([
  "id",
  "source",
  "target",
  "label",
  "technology",
  "direction",
  "style",
  "tags",
  "realizes",
  "waypoints",
]);
const POINT_SET: ReadonlySet<string> = new Set(["x", "y"]);
const SIZE_SET: ReadonlySet<string> = new Set(["width", "height"]);
const REF_SET: ReadonlySet<string> = new Set(["diagramId", "nodeId"]);
const VIEWPORT_SET: ReadonlySet<string> = new Set(["zoom", "x", "y"]);

interface BangScope {
  raw: Map<string, Pend>;
  rawAllowed: ReadonlySet<string>;
  known: ReadonlySet<string>;
  unknowns: Pend[];
  nested: Readonly<
    Record<string, { known: ReadonlySet<string>; bucket: Pend[] }>
  >;
  /** Edge-only: `waypoints.<i>.<key>` buckets. */
  waypointBuckets?: Map<number, Pend[]>;
}

function parseScopeBang(
  cursor: LineCursor,
  what: "diagram" | "node" | "edge",
  scope: BangScope,
): void {
  cursor.expect("!", '"!"');
  cursor.skipSpaces();
  const path = readPath(cursor);
  const tail = readBangTail(cursor);
  cursor.expectEnd('the "!" line');
  const first = path[0];

  if (path.length === 1) {
    const key = segString(first, "a field name");
    const pend: Pend = {
      key,
      after: tail.after,
      value: tail.value,
      line: first.line,
      column: first.column,
    };
    if (scope.rawAllowed.has(key)) {
      if (scope.raw.has(key)) {
        failAt(first.line, first.column, `duplicate "!" line for "${key}"`);
      }
      scope.raw.set(key, pend);
    } else if (scope.known.has(key)) {
      failAt(
        first.line,
        first.column,
        `"${key}" has dedicated syntax on the ${what} line — it cannot be set with a "!" line`,
      );
    } else {
      scope.unknowns.push(pend);
    }
    return;
  }

  const head = segString(first, "a field name");
  if (head === "waypoints" && scope.waypointBuckets !== undefined) {
    if (path.length !== 3 || typeof path[1].value !== "number") {
      failAt(
        first.line,
        first.column,
        'waypoint paths look like "waypoints.<index>.<key>"',
      );
    }
    const index = path[1].value;
    const key = segString(path[2], "a waypoint field name");
    if (POINT_SET.has(key)) {
      failAt(
        path[2].line,
        path[2].column,
        `"waypoints.${index}.${key}" has dedicated syntax — use the "via (x,y)" attribute`,
      );
    }
    const bucket = scope.waypointBuckets.get(index) ?? [];
    bucket.push({
      key,
      after: tail.after,
      value: tail.value,
      line: path[2].line,
      column: path[2].column,
    });
    scope.waypointBuckets.set(index, bucket);
    return;
  }

  const nested = scope.nested[head];
  if (nested === undefined || path.length !== 2) {
    failAt(
      first.line,
      first.column,
      `"${head}" is not a known child object of a ${what}${
        Object.keys(scope.nested).length > 0
          ? ` — only ${Object.keys(scope.nested).join(", ")} nest here`
          : ""
      }`,
    );
  }
  const key = segString(path[1], "a field name");
  if (nested.known.has(key)) {
    failAt(
      path[1].line,
      path[1].column,
      `"${head}.${key}" has dedicated syntax — it cannot be set with a "!" line`,
    );
  }
  nested.bucket.push({
    key,
    after: tail.after,
    value: tail.value,
    line: path[1].line,
    column: path[1].column,
  });
}

/* -------------------------------------------------------------------------- */
/* Node lines                                                                 */
/* -------------------------------------------------------------------------- */

function parseNodeLine(
  cursor: LineCursor,
  loc: Loc,
  id: string,
  diagram: PendingDiagram,
  nodeHome: Map<string, { diagram: PendingDiagram; node: PendingNode }>,
): PendingNode {
  cursor.expect(":", '":"');
  const typeLoc = { line: cursor.line, column: cursor.column };
  const typeWord = cursor.readBare(/^[a-z]+/, "a node type");
  const type = NODE_TYPE_BY_KEYWORD[typeWord];
  if (type === undefined) {
    failAt(
      typeLoc.line,
      typeLoc.column,
      `"${typeWord}" is not a node type — expected person, system, external, container, database, queue, component or code`,
      typeWord,
    );
  }
  const valid = VALID_NODE_TYPES_BY_LEVEL[
    diagram.level
  ] as readonly C4NodeType[];
  if (!valid.includes(type)) {
    const keywords = Object.entries(NODE_TYPE_BY_KEYWORD)
      .filter(([, t]) => valid.includes(t))
      .map(([k]) => k);
    failAt(
      typeLoc.line,
      typeLoc.column,
      `"${typeWord}" is not valid at level "${diagram.level}" — valid types here: ${keywords.join(", ")}`,
      typeWord,
    );
  }
  if (id === "") {
    failAt(loc.line, loc.column, "the node id must not be empty");
  }
  const home = nodeHome.get(id);
  if (home !== undefined) {
    failAt(
      loc.line,
      loc.column,
      `duplicate node id "${id}" — already declared in diagram "${home.diagram.id}" on line ${home.node.line}; node ids must be unique across the whole file`,
      id,
    );
  }
  cursor.skipSpaces();
  // The name is optional on a `^ref` line, where it is derived from the node
  // being referenced (resolve pass below) — the same rule the diagram title
  // already follows when it equals its owner node's name. Peeking for the
  // opening quote keeps the error message for every OTHER node unchanged:
  // omitting a name without a `^ref` still fails, just later, once we know no
  // ref was present.
  let name: string | undefined;
  if (cursor.peek() === '"') {
    name = cursor.readQuoted("the node name");
    if (name === "") {
      cursor.fail("the node name must not be empty");
    }
  }

  const node: PendingNode = {
    ...loc,
    endLine: loc.line,
    id,
    type,
    name,
    hasChildDiagramId: false,
    raw: new Map(),
    unknowns: [],
    positionUnknowns: [],
    sizeUnknowns: [],
    externalRefUnknowns: [],
  };

  for (;;) {
    cursor.skipSpaces();
    if (cursor.atEnd()) break;
    const ch = cursor.peek();
    const attrLoc = { line: cursor.line, column: cursor.column };
    if (ch === "@") {
      if (node.icon !== undefined) {
        failAt(attrLoc.line, attrLoc.column, "duplicate @icon attribute");
      }
      cursor.pos += 1;
      node.icon = cursor.readIdToken("the icon slug");
      if (cursor.eat("!")) node.iconSource = "explicit";
      else if (cursor.eat("~")) node.iconSource = "inferred";
      continue;
    }
    if (ch === "[") {
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
    if (ch === "#") {
      node.tags = node.tags ?? [];
      node.tags.push(readTag(cursor));
      continue;
    }
    if (ch === ">") {
      cursor.pos += 1;
      if (cursor.peek() === ">") {
        cursor.pos += 1;
        if (node.childRefValue !== undefined) {
          failAt(attrLoc.line, attrLoc.column, 'duplicate >>"file" attribute');
        }
        node.childRefValue = cursor.readQuoted("the child file reference");
        node.childRefLoc = attrLoc;
        continue;
      }
      if (node.hasChildDiagramId) {
        failAt(attrLoc.line, attrLoc.column, "duplicate >child attribute");
      }
      if (cursor.peek() === '"') {
        const quoted = cursor.readQuoted("the child diagram id");
        if (quoted === "")
          cursor.fail("the child diagram id must not be empty");
        node.childDiagramId = quoted;
      } else {
        const word = cursor.readBare(
          /^[A-Za-z0-9_][A-Za-z0-9_.-]*/,
          'a child diagram id (or "null")',
        );
        node.childDiagramId = word === "null" ? null : word;
      }
      node.hasChildDiagramId = true;
      continue;
    }
    if (ch === "^") {
      if (node.externalRef !== undefined) {
        failAt(
          attrLoc.line,
          attrLoc.column,
          "duplicate ^diagram/node attribute",
        );
      }
      cursor.pos += 1;
      const diagramId = cursor.readIdToken("the referenced diagram id");
      cursor.expect("/", '"/" between the diagram id and node id');
      const nodeId = cursor.readIdToken("the referenced node id");
      node.externalRef = { diagramId, nodeId };
      continue;
    }
    if (ch === "(") {
      if (node.geometry !== undefined) {
        failAt(attrLoc.line, attrLoc.column, "duplicate (x,y w×h) attribute");
      }
      cursor.pos += 1;
      cursor.skipSpaces();
      const x = cursor.readNumber("the x position");
      cursor.skipSpaces();
      cursor.expect(",", '"," between x and y');
      cursor.skipSpaces();
      const y = cursor.readNumber("the y position");
      cursor.skipSpaces();
      const width = cursor.readNumber("the width");
      cursor.expect("x", '"x" between width and height');
      const height = cursor.readNumber("the height");
      cursor.skipSpaces();
      cursor.expect(")", '")" closing the geometry');
      node.geometry = { x, y, width, height };
      continue;
    }
    const word = cursor.readBare(/^[a-z]+/, "a node attribute");
    if (word === "in") {
      if (node.frameId !== undefined) {
        failAt(attrLoc.line, attrLoc.column, 'duplicate "in=" attribute');
      }
      cursor.expect("=", '"=" after "in"');
      node.frameId = cursor.readBare(
        /^[A-Za-z0-9_][A-Za-z0-9_.-]*/,
        "a frame id",
      );
      node.frameIdLoc = attrLoc;
      continue;
    }
    if (word === "pin") {
      if (node.pinned !== undefined) {
        failAt(attrLoc.line, attrLoc.column, 'duplicate "pin" attribute');
      }
      if (cursor.eat("=")) {
        const value = cursor.readBare(/^[a-z]+/, '"true" or "false"');
        if (value !== "true" && value !== "false") {
          failAt(
            attrLoc.line,
            attrLoc.column,
            `pin= must be "true" or "false", got "${value}"`,
            value,
          );
        }
        node.pinned = value === "true";
      } else {
        node.pinned = true;
      }
      continue;
    }
    failAt(
      attrLoc.line,
      attrLoc.column,
      `"${word}" is not a node attribute — expected pin, in=<frame>, @icon, [technology], #tag, >child, >>"file", ^diagram/node or (x,y w×h)`,
      word,
    );
  }

  // Only a `^ref` may go unnamed. Checked here rather than at the quote, so we
  // know whether a ref turned up — attributes are order-free, and `^ref` can
  // follow anything on the line.
  if (node.name === undefined && node.externalRef === undefined) {
    failAt(
      loc.line,
      loc.column,
      `node "${id}" has no name — only a node with a ^diagram/node reference may omit it, because there it is derived from the node being referenced`,
      id,
    );
  }

  nodeHome.set(id, { diagram, node });
  diagram.nodes.push(node);
  return node;
}

export function readTechnology(cursor: LineCursor): string {
  cursor.expect("[", '"["');
  if (cursor.peek() === '"') {
    const value = cursor.readQuoted("technology");
    cursor.expect("]", '"]" closing the technology');
    return value;
  }
  const close = cursor.text.indexOf("]", cursor.pos);
  if (close === -1) {
    cursor.fail(
      'the technology bracket opened here is never closed — expected "]"',
      cursor.foundHere(),
    );
  }
  const value = cursor.text.slice(cursor.pos, close);
  cursor.pos = close + 1;
  return value;
}

/* -------------------------------------------------------------------------- */
/* Edge lines                                                                 */
/* -------------------------------------------------------------------------- */

function parseEdgeLine(
  cursor: LineCursor,
  loc: Loc,
  source: string,
  diagram: PendingDiagram,
): PendingEdge {
  cursor.skipSpaces();
  let arrow: (typeof ARROWS)[number] | undefined;
  for (const candidate of ARROWS) {
    if (cursor.text.startsWith(candidate[0], cursor.pos)) {
      arrow = candidate;
      break;
    }
  }
  if (arrow === undefined) {
    cursor.fail(
      "expected an arrow (->, <->, --, ..>, <..>, ..) — or, for a node, the type must follow the id with no space (id:type)",
      cursor.foundHere(),
    );
  }
  cursor.pos += arrow[0].length;
  cursor.skipSpaces();
  const targetLoc = { line: cursor.line, column: cursor.column };
  const target = cursor.readIdToken("the target node id");

  const edge: PendingEdge = {
    ...loc,
    endLine: loc.line,
    source,
    sourceLoc: loc,
    target,
    targetLoc,
    direction: arrow[1].direction,
    raw: new Map(),
    unknowns: [],
    waypointUnknowns: new Map(),
  };
  if (arrow[1].style !== undefined) edge.style = arrow[1].style;

  for (;;) {
    cursor.skipSpaces();
    if (cursor.atEnd()) break;
    const ch = cursor.peek();
    const attrLoc = { line: cursor.line, column: cursor.column };
    if (ch === ":") {
      if (edge.label !== undefined) {
        failAt(attrLoc.line, attrLoc.column, 'duplicate : "label" attribute');
      }
      cursor.pos += 1;
      cursor.skipSpaces();
      edge.label = cursor.readQuoted("the edge label");
      continue;
    }
    if (ch === "[") {
      if (edge.technology !== undefined) {
        failAt(
          attrLoc.line,
          attrLoc.column,
          "duplicate [technology] attribute",
        );
      }
      edge.technology = readTechnology(cursor);
      continue;
    }
    if (ch === "#") {
      edge.tags = edge.tags ?? [];
      edge.tags.push(readTag(cursor));
      continue;
    }
    if (ch === "~") {
      if (edge.realizes !== undefined) {
        failAt(attrLoc.line, attrLoc.column, "duplicate ~realizes attribute");
      }
      cursor.pos += 1;
      edge.realizes = cursor.readIdToken("the realized parent edge id");
      continue;
    }
    const word = cursor.readBare(/^[a-z]+/, "an edge attribute");
    if (word === "id") {
      if (edge.explicitId !== undefined) {
        failAt(attrLoc.line, attrLoc.column, 'duplicate "id=" attribute');
      }
      cursor.expect("=", '"=" after "id"');
      edge.explicitId = cursor.readIdToken("the edge id");
      continue;
    }
    if (word === "style") {
      cursor.expect("=", '"=" after "style"');
      const value = cursor.readBare(/^[a-z]+/, '"solid" or "dashed"');
      if (value !== "solid" && value !== "dashed") {
        failAt(
          attrLoc.line,
          attrLoc.column,
          `style= must be "solid" or "dashed", got "${value}"`,
          value,
        );
      }
      if (value === "solid" && edge.style === "dashed") {
        failAt(
          attrLoc.line,
          attrLoc.column,
          "style=solid contradicts the dashed arrow on this line",
        );
      }
      edge.style = value;
      continue;
    }
    if (word === "via") {
      if (edge.waypoints !== undefined) {
        failAt(attrLoc.line, attrLoc.column, 'duplicate "via" attribute');
      }
      const points: { x: number; y: number }[] = [];
      cursor.skipSpaces();
      while (cursor.peek() === "(") {
        cursor.pos += 1;
        cursor.skipSpaces();
        const x = cursor.readNumber("the waypoint x");
        cursor.skipSpaces();
        cursor.expect(",", '"," between waypoint x and y');
        cursor.skipSpaces();
        const y = cursor.readNumber("the waypoint y");
        cursor.skipSpaces();
        cursor.expect(")", '")" closing the waypoint');
        points.push({ x, y });
        cursor.skipSpaces();
      }
      if (points.length === 0) {
        failAt(
          attrLoc.line,
          attrLoc.column,
          'expected at least one "(x,y)" waypoint after "via"',
        );
      }
      edge.waypoints = points;
      continue;
    }
    failAt(
      attrLoc.line,
      attrLoc.column,
      `"${word}" is not an edge attribute — expected : "label", [technology], #tag, ~realizes, id=, style= or via`,
      word,
    );
  }

  diagram.edges.push(edge);
  return edge;
}

/* -------------------------------------------------------------------------- */
/* Continuations (indent 4)                                                   */
/* -------------------------------------------------------------------------- */

function isNode(member: PendingNode | PendingEdge): member is PendingNode {
  // Discriminate on `type`, NOT on `name`. `name` is now absent on a `^ref`
  // line that omitted it, and a `"name" in member` test would silently route
  // that node's `desc` / `!` continuations into the edge branch — a wrong
  // answer rather than an error, which is the worst kind.
  // `type` is a C4NodeType that only nodes carry and is always set by
  // `parseNodeLine` before any continuation can be dispatched.
  return "type" in member;
}

function parseContinuation(
  cursor: LineCursor,
  member: PendingNode | PendingEdge,
): void {
  if (cursor.peek() === "!") {
    if (isNode(member)) {
      parseScopeBang(cursor, "node", {
        raw: member.raw,
        rawAllowed: NODE_RAW,
        known: NODE_KEYS_SET,
        unknowns: member.unknowns,
        nested: {
          position: { known: POINT_SET, bucket: member.positionUnknowns },
          size: { known: SIZE_SET, bucket: member.sizeUnknowns },
          externalRef: { known: REF_SET, bucket: member.externalRefUnknowns },
        },
      });
    } else {
      parseScopeBang(cursor, "edge", {
        raw: member.raw,
        rawAllowed: EDGE_RAW,
        known: EDGE_KEYS_SET,
        unknowns: member.unknowns,
        nested: {},
        waypointBuckets: member.waypointUnknowns,
      });
    }
    return;
  }
  const loc = { line: cursor.line, column: cursor.column };
  const word = cursor.readBare(/^[a-z]+/, '"desc" or "!"');
  if (word !== "desc") {
    failAt(
      loc.line,
      loc.column,
      `"${word}" is not a continuation — expected desc "…" or a "!" line`,
      word,
    );
  }
  if (!isNode(member)) {
    failAt(
      loc.line,
      loc.column,
      'edges have no description — did you mean the : "label" attribute on the edge line?',
    );
  }
  if (member.description !== undefined) {
    failAt(loc.line, loc.column, 'duplicate "desc" line for this node');
  }
  cursor.skipSpaces();
  member.description = cursor.readQuoted("the node description");
  cursor.expectEnd('the "desc" line');
}

/* -------------------------------------------------------------------------- */
/* Resolve pass                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The name for a `^ref` node that omitted one: the name of the node it points
 * at, following the chain if that node is itself an unnamed placeholder.
 *
 * Transitive because placeholder chains are legal, and
 * cycle-guarded because a hand-written file can point two refs at each other —
 * without the guard that is an infinite loop rather than a parse error.
 *
 * Runs in the resolve pass, not while reading the line: a ref may point forward
 * at a diagram declared later in the file, so the lookup table is only complete
 * once every line has been read.
 */
function deriveRefName(
  node: PendingNode,
  nodeHome: Map<string, { diagram: PendingDiagram; node: PendingNode }>,
): string {
  const seen = new Set<string>([node.id]);
  let cursor = node;
  for (;;) {
    const ref = cursor.externalRef;
    if (ref === undefined) {
      // Reached a node with no ref and no name — only possible if a named
      // ancestor was expected. `parseNodeLine` already rejects that case, so
      // this is a guard against future edits, not a reachable user error.
      failAt(
        node.line,
        node.column,
        `node "${node.id}" omits its name but the node it references has none either`,
        node.id,
      );
    }
    const target = nodeHome.get(ref.nodeId);
    if (target === undefined || target.diagram.id !== ref.diagramId) {
      failAt(
        node.line,
        node.column,
        `node "${node.id}" omits its name, but its reference ^${ref.diagramId}/${ref.nodeId} does not resolve — name it explicitly or fix the reference`,
        node.id,
      );
    }
    if (target.node.name !== undefined) return target.node.name;
    if (seen.has(target.node.id)) {
      failAt(
        node.line,
        node.column,
        `node "${node.id}" omits its name and its reference chain is circular — one node in the chain must have a name`,
        node.id,
      );
    }
    seen.add(target.node.id);
    cursor = target.node;
  }
}

function resolve(
  header: Header,
  diagrams: PendingDiagram[],
  diagramById: Map<string, PendingDiagram>,
  nodeHome: Map<string, { diagram: PendingDiagram; node: PendingNode }>,
  /* Filled as each member is assembled, so a span is only ever recorded for a
     member that survived the resolve pass — a span for a node the resolve
     rejected would point a caller at a line of a file that does not parse. */
  spans: SpanCollector,
): ArchLabFile {
  if (header.title === undefined && !header.metaRaw.has("title")) {
    failAt(1, 1, 'the file has no title — add a line like: title "My System"');
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

  const tagColorsSugar =
    header.tagColors === undefined
      ? undefined
      : Object.fromEntries(header.tagColors);
  addMeta("tagColors", pick(tagColorsSugar, header.metaRaw, "tagColors"));

  let customIconsSugar: Record<string, unknown> | undefined;
  if (header.customIcons !== undefined) {
    customIconsSugar = {};
    for (const [slug, icon] of header.customIcons) {
      customIconsSugar[slug] = assemble(
        [
          ["name", icon.name],
          ["svg", icon.svg],
        ],
        header.customIconUnknowns.get(slug) ?? [],
      );
    }
  }
  for (const [slug, bucket] of header.customIconUnknowns) {
    if (header.customIcons === undefined || !header.customIcons.has(slug)) {
      const first = bucket[0];
      failAt(
        first.line,
        first.column,
        `there is no "customicon ${slug} …" line for this "!" line to attach to`,
      );
    }
  }
  addMeta("customIcons", pick(customIconsSugar, header.metaRaw, "customIcons"));

  const generatorSugar =
    header.generator === undefined
      ? undefined
      : assemble(
          [
            ["name", header.generator.name],
            ["version", header.generator.version],
          ],
          header.generatorUnknowns,
        );
  if (header.generator === undefined && header.generatorUnknowns.length > 0) {
    const first = header.generatorUnknowns[0];
    failAt(
      first.line,
      first.column,
      'there is no "generator" line for this "!" line to attach to',
    );
  }
  addMeta("generator", pick(generatorSugar, header.metaRaw, "generator"));

  const metadata = assemble(metaPairs, header.metaUnknowns);

  /* ------------------------------ diagrams ------------------------------ */

  const finalDiagrams: Record<string, unknown>[] = [];
  const edgeHome = new Map<string, { diagramId: string; line: number }>();

  for (const diagram of diagrams) {
    /* owner / parent / title */
    const owner = diagram.ownerAttr ?? null;
    const ownerHome = owner === null ? undefined : nodeHome.get(owner);
    let parent: string | null;
    if (diagram.hasIn) {
      parent = diagram.inAttr ?? null;
    } else if (ownerHome !== undefined) {
      parent = ownerHome.diagram.id;
    } else {
      parent = null;
    }
    let title = diagram.title;
    if (title === undefined) {
      if (ownerHome !== undefined) {
        title = ownerHome.node.name;
      } else {
        failAt(
          diagram.line,
          diagram.column,
          owner === null
            ? `diagram "${diagram.id}" has no title — add one after the id, e.g. @${diagram.level} ${diagram.id} "Title"`
            : `diagram "${diagram.id}" has no title and its owner "${owner}" does not resolve to a node, so no title can be inferred`,
        );
      }
    }
    if (title === "") {
      failAt(
        diagram.line,
        diagram.column,
        `diagram "${diagram.id}" has an empty title`,
      );
    }

    /* level chain */
    if (parent !== null) {
      const parentDiagram = diagramById.get(parent);
      const at = diagram.inLoc ?? {
        line: diagram.line,
        column: diagram.column,
      };
      if (parentDiagram === undefined) {
        failAt(
          at.line,
          at.column,
          `in=${parent} does not resolve to a diagram in this file`,
          parent,
        );
      }
      const levelIndex = C4_LEVELS.indexOf(diagram.level);
      if (diagram.level === "context") {
        failAt(
          at.line,
          at.column,
          '"@context" diagrams cannot have a parent — context is the outermost level',
        );
      }
      const expectedParent = C4_LEVELS[levelIndex - 1];
      if (parentDiagram.level !== expectedParent) {
        failAt(
          at.line,
          at.column,
          `a "@${diagram.level}" diagram must sit exactly one level below a "@${expectedParent}" diagram, but "${parent}" is "@${parentDiagram.level}"`,
        );
      }
    }

    /* nodes */
    const sortedIds = diagram.nodes.map((n) => n.id).sort(compareStrings);
    const nodeIdSet = new Set(sortedIds);
    /* The effective direction: the diagram's own, else the file's, else the
     * original top-down. Resolved HERE rather than stored resolved, so a
     * diagram that inherits keeps inheriting when the file's line changes —
     * and so the serializer, which resolves the same way, omits exactly what
     * the author left out. */
    const layoutDirection = diagram.directionAttr ?? header.direction ?? "tb";
    const layout = defaultPositions(sortedIds, diagram.edges, layoutDirection);
    const finalNodes: Record<string, unknown>[] = [];
    for (const node of diagram.nodes) {
      // Fill in a derived name before assembly, so the JSON model always
      // carries one — `validate.ts` requires it and every consumer (viewer,
      // mermaid, MCP describe) reads it unconditionally. Optional in TEXT,
      // always present in the MODEL.
      if (node.name === undefined) {
        node.name = deriveRefName(node, nodeHome);
      }
      const geometry = node.geometry ?? {
        ...(layout.get(node.id) ?? { x: 40, y: 40 }),
        ...defaultSizeFor(node.type),
      };
      const position = assemble(
        [
          ["x", geometry.x],
          ["y", geometry.y],
        ],
        node.positionUnknowns,
      );
      const size = assemble(
        [
          ["width", geometry.width],
          ["height", geometry.height],
        ],
        node.sizeUnknowns,
      );
      let externalRef: Record<string, unknown> | undefined;
      if (node.externalRef !== undefined) {
        externalRef = assemble(
          [
            ["diagramId", node.externalRef.diagramId],
            ["nodeId", node.externalRef.nodeId],
          ],
          node.externalRefUnknowns,
        );
      } else if (node.externalRefUnknowns.length > 0) {
        const first = node.externalRefUnknowns[0];
        failAt(
          first.line,
          first.column,
          `node "${node.id}" has no ^diagram/node reference for this "!" line to attach to`,
        );
      }

      const childSugar: unknown = node.hasChildDiagramId
        ? node.childDiagramId
        : undefined;
      const childRaw = node.raw.get("childDiagramId");
      if (childRaw !== undefined && node.hasChildDiagramId) {
        failAt(
          childRaw.line,
          childRaw.column,
          '"childDiagramId" is set both inline and by this "!" line — remove one',
        );
      }
      const child = childRaw !== undefined ? childRaw.value : childSugar;
      const hasChild = node.hasChildDiagramId || childRaw !== undefined;
      const childRefRaw = node.raw.get("childRef");
      if (childRefRaw !== undefined && node.childRefValue !== undefined) {
        failAt(
          childRefRaw.line,
          childRefRaw.column,
          '"childRef" is set both inline and by this "!" line — remove one',
        );
      }
      const childRef: unknown =
        childRefRaw !== undefined ? childRefRaw.value : node.childRefValue;
      if (typeof child === "string" && child !== "" && childRef !== undefined) {
        const at =
          node.childRefLoc ??
          (childRefRaw !== undefined
            ? { line: childRefRaw.line, column: childRefRaw.column }
            : { line: node.line, column: node.column });
        failAt(
          at.line,
          at.column,
          `node "${node.id}" has both >${child} and a childRef — childDiagramId and childRef are mutually exclusive`,
        );
      }

      const pairs: (readonly [string, unknown])[] = [];
      const add = (key: string, value: unknown): void => {
        if (value !== undefined) pairs.push([key, value]);
      };
      add("id", node.id);
      add("type", node.type);
      add("name", node.name);
      add("description", pick(node.description, node.raw, "description"));
      add("technology", pick(node.technology, node.raw, "technology"));
      add("icon", pick(node.icon, node.raw, "icon"));
      add("iconSource", pick(node.iconSource, node.raw, "iconSource"));
      add("position", position);
      add("size", size);
      add("tags", pick(node.tags, node.raw, "tags"));
      if (hasChild) pairs.push(["childDiagramId", child ?? null]);
      add("childRef", childRef);
      add("externalRef", externalRef);
      add("frameId", node.frameId);
      add("pinned", pick(node.pinned, node.raw, "pinned"));
      finalNodes.push(assemble(pairs, node.unknowns));
      spans.nodes.set(spanKey(diagram.id, node.id), {
        start: node.line,
        end: node.endLine,
      });
    }

    /* edges */
    const finalEdges: Record<string, unknown>[] = [];
    for (const edge of diagram.edges) {
      for (const [endpoint, value, at] of [
        ["source", edge.source, edge.sourceLoc],
        ["target", edge.target, edge.targetLoc],
      ] as const) {
        if (!nodeIdSet.has(value)) {
          const elsewhere = nodeHome.get(value);
          if (elsewhere !== undefined) {
            failAt(
              at.line,
              at.column,
              `the ${endpoint} "${value}" is declared in diagram "${elsewhere.diagram.id}", not "${diagram.id}" — relationships must connect two nodes in the same diagram`,
              value,
            );
          }
          failAt(
            at.line,
            at.column,
            `the ${endpoint} "${value}" does not resolve to a node in this diagram`,
            value,
          );
        }
      }
      const id = edge.explicitId ?? defaultEdgeId(edge.source, edge.target);
      const existing = edgeHome.get(id);
      if (existing !== undefined) {
        failAt(
          edge.line,
          edge.column,
          `duplicate edge id "${id}" — already used in diagram "${existing.diagramId}" on line ${existing.line}` +
            (edge.explicitId === undefined
              ? '; give one of the edges an explicit "id=" attribute'
              : "; edge ids must be unique across the whole file"),
          id,
        );
      }
      edgeHome.set(id, { diagramId: diagram.id, line: edge.line });

      let waypoints: unknown;
      if (edge.waypoints !== undefined) {
        waypoints = edge.waypoints.map((point, i) =>
          assemble(
            [
              ["x", point.x],
              ["y", point.y],
            ],
            edge.waypointUnknowns.get(i) ?? [],
          ),
        );
        for (const [i, bucket] of edge.waypointUnknowns) {
          if (i >= edge.waypoints.length) {
            const first = bucket[0];
            failAt(
              first.line,
              first.column,
              `waypoint index ${i} is out of range — the "via" attribute has ${edge.waypoints.length} point(s)`,
            );
          }
        }
      } else {
        waypoints = pick(undefined, edge.raw, "waypoints");
        if (edge.waypointUnknowns.size > 0) {
          const buckets = [...edge.waypointUnknowns.values()];
          const first = buckets[0][0];
          failAt(
            first.line,
            first.column,
            'this edge has no "via" attribute for the waypoint "!" line to attach to',
          );
        }
      }

      const pairs: (readonly [string, unknown])[] = [];
      const add = (key: string, value: unknown): void => {
        if (value !== undefined) pairs.push([key, value]);
      };
      add("id", id);
      add("source", edge.source);
      add("target", edge.target);
      add("label", pick(edge.label, edge.raw, "label"));
      add("technology", pick(edge.technology, edge.raw, "technology"));
      add("direction", edge.direction);
      add("style", edge.style);
      add("tags", pick(edge.tags, edge.raw, "tags"));
      add("realizes", pick(edge.realizes, edge.raw, "realizes"));
      add("waypoints", waypoints);
      finalEdges.push(assemble(pairs, edge.unknowns));
      spans.edges.set(spanKey(diagram.id, id), {
        start: edge.line,
        end: edge.endLine,
      });
    }

    /* frames — cross-checked here, where every frame and node of this
       diagram is known. Membership and nesting are both by id, so a typo is
       otherwise a silently missing frame rather than an error. */
    const frameIdSet = new Set(diagram.frames.map((f) => f.id));
    const finalFrames: Record<string, unknown>[] = [];
    for (const frame of diagram.frames) {
      const parentId = frame.parentFrameId;
      if (frame.hasIn && parentId !== null && parentId !== undefined) {
        const at = frame.inLoc ?? { line: frame.line, column: frame.column };
        if (parentId === frame.id) {
          failAt(
            at.line,
            at.column,
            `frame "${frame.id}" is its own enclosing frame`,
            frame.id,
          );
        }
        if (!frameIdSet.has(parentId)) {
          failAt(
            at.line,
            at.column,
            `in=${parentId} does not name a frame in diagram "${diagram.id}" — a frame may only nest inside another frame of the same diagram`,
            parentId,
          );
        }
      }
      const pairs: (readonly [string, unknown])[] = [
        ["id", frame.id],
        ["label", frame.label],
      ];
      if (frame.hasIn)
        pairs.push(["parentFrameId", frame.parentFrameId ?? null]);
      finalFrames.push(assemble(pairs, []));
      // A frame line has no continuations, so its span is the one line.
      spans.frames.set(spanKey(diagram.id, frame.id), {
        start: frame.line,
        end: frame.line,
      });
    }
    // Walk each chain to its root. Cheap (frames per diagram are few) and it
    // reports the frame the author can actually see, not an internal cycle set.
    const parentOf = new Map<string, string | null>(
      diagram.frames.map((f) => [
        f.id,
        f.hasIn ? (f.parentFrameId ?? null) : null,
      ]),
    );
    for (const frame of diagram.frames) {
      const seen = new Set<string>([frame.id]);
      let cur = parentOf.get(frame.id) ?? null;
      while (cur !== null) {
        if (seen.has(cur)) {
          const at = frame.inLoc ?? { line: frame.line, column: frame.column };
          failAt(
            at.line,
            at.column,
            `frame "${frame.id}" encloses itself through in= — nested frames must form a tree`,
            frame.id,
          );
        }
        seen.add(cur);
        cur = parentOf.get(cur) ?? null;
      }
    }
    for (const node of diagram.nodes) {
      if (node.frameId !== undefined && !frameIdSet.has(node.frameId)) {
        const at = node.frameIdLoc ?? { line: node.line, column: node.column };
        failAt(
          at.line,
          at.column,
          `in=${node.frameId} does not name a frame in diagram "${diagram.id}" — declare it with a "frame ${node.frameId} \"…\"" line`,
          node.frameId,
        );
      }
    }

    /* the diagram object */
    let viewport: Record<string, unknown> | undefined;
    if (diagram.viewport !== undefined) {
      viewport = assemble(
        [
          ["zoom", diagram.viewport.zoom],
          ["x", diagram.viewport.x],
          ["y", diagram.viewport.y],
        ],
        diagram.viewportUnknowns,
      );
    } else if (diagram.viewportUnknowns.length > 0) {
      const first = diagram.viewportUnknowns[0];
      failAt(
        first.line,
        first.column,
        `diagram "${diagram.id}" has no "view" line for this "!" line to attach to`,
      );
    }
    const pairs: (readonly [string, unknown])[] = [
      ["id", diagram.id],
      ["level", diagram.level],
      ["title", title],
    ];
    const description = pick(diagram.description, diagram.raw, "description");
    if (description !== undefined) pairs.push(["description", description]);
    pairs.push(["ownerNodeId", owner]);
    pairs.push(["parentDiagramId", parent]);
    if (viewport !== undefined) pairs.push(["viewport", viewport]);
    if (diagram.directionAttr !== undefined) {
      pairs.push(["direction", diagram.directionAttr]);
    }
    if (finalFrames.length > 0) pairs.push(["frames", finalFrames]);
    pairs.push(["nodes", finalNodes]);
    pairs.push(["edges", finalEdges]);
    finalDiagrams.push(assemble(pairs, diagram.unknowns));
    spans.diagramHeads.set(diagram.id, diagram.line);
  }

  /* ------------------------------- root --------------------------------- */

  let root = header.root;
  if (root !== undefined) {
    const at = header.rootLoc ?? { line: 1, column: 1 };
    const diagram = diagramById.get(root);
    if (diagram === undefined) {
      failAt(
        at.line,
        at.column,
        `root "${root}" does not resolve to a diagram in this file`,
        root,
      );
    }
    checkRootShape(diagram);
  } else {
    const candidates = diagrams.filter(
      (d) =>
        d.level === "context" &&
        !d.hasIn &&
        resolveParent(d, nodeHome) === null,
    );
    if (candidates.length === 1) {
      root = candidates[0].id;
      checkRootShape(candidates[0]);
    } else if (candidates.length === 0) {
      failAt(
        1,
        1,
        'the file has no root Context diagram — add an "@context" diagram without in=, or a "root <id>" header line',
      );
    } else {
      const second = candidates[1];
      failAt(
        second.line,
        second.column,
        `two parentless @context diagrams ("${candidates[0].id}" and "${second.id}") — add a "root <id>" header line to pick the entry point`,
      );
    }
  }

  /* ------------------------------- the file ------------------------------ */

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
  if (header.direction !== undefined) file.direction = header.direction;
  file.metadata = metadata;
  file.rootDiagramId = root;
  file.diagrams = finalDiagrams;
  for (const pend of header.fileUnknowns) {
    file[pend.key] = pend.value;
  }
  return file as ArchLabFile;
}

function resolveParent(
  diagram: PendingDiagram,
  nodeHome: Map<string, { diagram: PendingDiagram; node: PendingNode }>,
): string | null {
  if (diagram.hasIn) return diagram.inAttr ?? null;
  if (diagram.ownerAttr !== undefined) {
    const home = nodeHome.get(diagram.ownerAttr);
    if (home !== undefined) return home.diagram.id;
  }
  return null;
}

function checkRootShape(diagram: PendingDiagram): void {
  if (diagram.level !== "context") {
    failAt(
      diagram.line,
      diagram.column,
      `the root diagram must be "@context", but "${diagram.id}" is "@${diagram.level}"`,
    );
  }
  if (diagram.ownerAttr !== undefined || diagram.hasIn) {
    failAt(
      diagram.line,
      diagram.column,
      `the root diagram "${diagram.id}" cannot have owner= or in= — it is the entry point`,
    );
  }
}

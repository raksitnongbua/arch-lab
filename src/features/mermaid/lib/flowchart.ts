/**
 * Mermaid `flowchart` / `graph` → `FlowchartLabFile`. One-way, like the two
 * importers next door — Mermaid is an import format, not a storage format.
 *
 * Like `sequenceDiagram` (and unlike the C4 grammar's function-call
 * statements), a flowchart is line-oriented, so this is its own small line
 * parser beside `./sequence.ts` rather than a bolt-on to the C4 scanner;
 * what it shares is the error contract (`MermaidParseError` via `failAt`,
 * every failure naming a line and column), the `<br/>` codec, the statement
 * cursor in `./cursor.ts` (also read by the use-case importer, which parses
 * this same grammar under a different convention), and the bracket/arrow
 * tables in `./flowchart-mapping.ts` that the emitter reads too.
 *
 * Supported: both header words with all five direction tokens, YAML
 * frontmatter (`title` kept, other keys dropped), node definitions in the
 * bracket forms of `MERMAID_NODE_FORMS` (quoted or bare text), implicit
 * declaration on first use, the whole link family (`-->`, `---`, dotted,
 * thick, cross/circle heads, `-->|label|` and `-- label -->`), chained
 * statements (`a --> b --> c`), `&` lists on either side of a link,
 * `subgraph` … `end`, a trailing `;` per line (the old `graph` spelling),
 * and `%%` comments. Styling and interaction lines (`style`, `linkStyle`,
 * `classDef`, `class`, `click`, `:::class`, `direction`) are parsed and
 * dropped, the same contract as the C4 dialect's `IGNORED_CALLS`.
 *
 * WHERE THE DIRECTION GOES: nowhere, on purpose. `FlowchartLabFile` has no
 * layout field — the model's only opinion about reading order is the order
 * of `nodes` and `edges`, and arch-lab's renderer owns the geometry, the
 * same split that made `UpdateLayoutConfig` droppable in the C4 dialect.
 * Keeping `TD`/`LR` would smuggle presentation into a format that keeps
 * presentation out. The emitter takes a direction as an OPTION instead: it
 * is a choice made at export time, not data carried in the model.
 *
 * WHY A SUBGRAPH'S MEMBERSHIP IS FIRST-MENTION. An arch-lab group is a
 * contiguous run of the declaration order by construction (the `.alab`
 * grammar cannot even spell a broken run), and `nodes` order is data —
 * reordering it to make a scattered Mermaid subgraph contiguous would
 * silently rewrite the model's reading order. So a node joins the subgraph
 * that FIRST mentions it (which keeps every member a fresh, consecutive
 * declaration), a later bare mention elsewhere never moves it (cross-links
 * written inside a subgraph stay just links), and a later bracketed
 * DEFINITION under a different subgraph context is refused rather than
 * silently placed — that spelling states a membership this model cannot
 * honour without reordering.
 *
 * What is LOSSY is named, in full, by `MERMAID_FLOWCHART_CAVEAT` below —
 * the same honesty contract as `MERMAID_CAVEAT` and
 * `MERMAID_SEQUENCE_CAVEAT`.
 *
 * Imported by `scripts/mermaid-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import type {
  FlowchartEdge,
  FlowchartGroup,
  FlowchartLabFile,
  FlowchartNode,
  FlowchartNodeShape,
} from "@/types";

import type { Cursor } from "./cursor";
import {
  col,
  readBracketText,
  readIdToken,
  readLabelText,
  readQuoted,
  skipSpaces,
} from "./cursor";
import { MERMAID_IMPORT_TIMESTAMP } from "./defaults";
import { failAt } from "./errors";
import {
  alabSafeId,
  decodeInlineBreaks,
  readMermaidFrontmatterTitle,
} from "./text";
import {
  MERMAID_FLOWCHART_DIRECTIONS,
  MERMAID_FLOWCHART_HEADER_RE,
  MERMAID_NODE_FORMS,
  MERMAID_PRESENTATION_KEYWORDS,
  REFUSED_NODE_FORMS,
  resolveTerminator,
} from "./flowchart-mapping";

/* -------------------------------------------------------------------------- */
/* The caveat — what a Mermaid flowchart import DROPS                          */
/* -------------------------------------------------------------------------- */

/**
 * Import is honest but not lossless. Named per item so the UI can say
 * exactly what changed, the way the other two import caveats do:
 */
export const MERMAID_FLOWCHART_CAVEAT =
  "Mermaid flowchart is an import format: converting it is one-way and " +
  "lossy — the direction word (TD/TB/BT/LR/RL) is layout, not model, and " +
  "is dropped (arch-lab lays the chart out itself), every link style " +
  "collapses to the one arch-lab arrow (dotted, thick and cross/circle-head " +
  "links become plain directed edges, and an undirected --- link reads left " +
  "to right), (...), ([...]) and the ((...)) circle all import as " +
  "terminators told apart by the arrows (no incoming arrow is a start, any " +
  "incoming arrow is an end — so a circle comes back out as a stadium), " +
  "styling and interaction lines (style, linkStyle, classDef, class, click, " +
  ":::class, direction) are dropped, frontmatter keys other than title are " +
  "dropped, node ids outside the .alab slug alphabet are renamed " +
  "deterministically, and a node first mentioned outside a subgraph stays " +
  "outside it (arch-lab groups are contiguous). Three shapes are still " +
  "refused rather than guessed, because any mapping would mislead: the " +
  "{{...}} hexagon (a preparation symbol — not a decision, not a plain " +
  "step), the [(...)] cylinder (a data store, which io or step would repaint " +
  "as an action), and the >...] flag (an asymmetry no arch-lab shape can " +
  "keep). Save as .alab to keep everything else.";

/* -------------------------------------------------------------------------- */
/* Options                                                                     */
/* -------------------------------------------------------------------------- */

export interface ParseMermaidFlowchartOptions {
  /** Same contract as the other two importers: a fixed default keeps parsing
   * a pure function; pass `new Date().toISOString()` if provenance matters
   * more than byte-stable output. */
  timestamp?: string;
}

const DEFAULT_TITLE = "Untitled flowchart";

/* -------------------------------------------------------------------------- */
/* Parser state                                                                */
/* -------------------------------------------------------------------------- */

interface PendGroup {
  label: string;
  nodes: string[];
  line: number;
  column: number;
}

interface PendNode {
  id: string;
  shape: FlowchartNodeShape | "terminator";
  label: string;
  /** Whether a bracket form has spelled the shape/label out. Implicit nodes
   * (bare first use) stay redefinable once; a second bracket is refused. */
  defined: boolean;
  /** The subgraph open at FIRST mention — membership, fixed for good. */
  group: PendGroup | null;
}

interface State {
  nodes: PendNode[];
  /** Keyed by the RAW Mermaid spelling — normalisation must map one raw id
   * to one node however often it recurs. */
  byRaw: Map<string, PendNode>;
  usedIds: Set<string>;
  groups: PendGroup[];
  openGroup: PendGroup | null;
  subgraphIds: Set<string>;
  edges: FlowchartEdge[];
}

/* -------------------------------------------------------------------------- */
/* The importer                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Parses Mermaid `flowchart` / `graph` source into a `FlowchartLabFile`.
 * Deterministic: the same source (and options) always yields the same
 * model, ids included. Throws `MermaidParseError` with line/column on
 * malformed input, never returning a partial model.
 */
export function parseMermaidFlowchart(
  source: string,
  options?: ParseMermaidFlowchartOptions,
): FlowchartLabFile {
  const timestamp = options?.timestamp ?? MERMAID_IMPORT_TIMESTAMP;

  const state: State = {
    nodes: [],
    byRaw: new Map(),
    usedIds: new Set(),
    groups: [],
    openGroup: null,
    subgraphIds: new Set(),
    edges: [],
  };

  let title: string | null = null;
  let seenHeader = false;
  let inFrontmatter = false;
  let frontmatterDone = false;
  let frontmatterLine = 0;

  const lines = source.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const lineNo = index + 1;
    let raw = lines[index].endsWith("\r")
      ? lines[index].slice(0, -1)
      : lines[index];
    const startCol = raw.length - raw.trimStart().length + 1;
    let text = raw.trim();
    if (text === "") continue;

    /* ---- YAML frontmatter: only a `---` fence BEFORE the header opens it,
       and only `title` survives — other keys are metadata Mermaid's own
       renderer ignores per-diagram, and the model has nowhere for them. */
    if (inFrontmatter) {
      if (text === "---") {
        inFrontmatter = false;
        frontmatterDone = true;
        continue;
      }
      const titled = /^title\s*:\s*(.*)$/.exec(text);
      if (titled !== null) title = readMermaidFrontmatterTitle(titled[1]);
      continue;
    }
    if (!seenHeader && !frontmatterDone && text === "---") {
      inFrontmatter = true;
      frontmatterLine = lineNo;
      continue;
    }

    if (text.startsWith("%%")) continue;
    /* The old `graph` spelling terminates lines with `;` — strip ONE, so
       `graph TD;` and `a-->b;` import. A mid-line `;` is still an error:
       multi-statement lines would need real quote-aware splitting, and a
       clear refusal beats a split that breaks on `a["x; y"]`. */
    if (text.endsWith(";")) {
      raw = raw.slice(0, raw.lastIndexOf(";"));
      text = text.slice(0, -1).trimEnd();
      if (text === "") continue;
    }

    /* ------------------------------- header ------------------------------ */
    if (!seenHeader) {
      const header = MERMAID_FLOWCHART_HEADER_RE.exec(text);
      if (header === null) {
        failAt(
          lineNo,
          startCol,
          `"${text.split(/\s/, 1)[0]}" is not a flowchart header — the first line must be "flowchart <direction>" or "graph <direction>"`,
          text.slice(0, 40),
        );
      }
      const direction = header[2];
      if (
        direction !== undefined &&
        !(MERMAID_FLOWCHART_DIRECTIONS as readonly string[]).includes(direction)
      ) {
        failAt(
          lineNo,
          startCol + text.indexOf(direction),
          `"${direction}" is not a flowchart direction — expected ${MERMAID_FLOWCHART_DIRECTIONS.join(", ")}`,
          direction,
        );
      }
      /* The direction itself is dropped here — layout, not model (essay in
         the file header). */
      seenHeader = true;
      continue;
    }

    /* ----------------------------- statements ---------------------------- */
    const word = /^[A-Za-z]+/.exec(text)?.[0];

    if (word === "subgraph" && /^subgraph(\s|$)/.test(text)) {
      openSubgraph(state, lineNo, startCol, text.slice("subgraph".length));
      continue;
    }
    if (text === "end") {
      if (state.openGroup === null) {
        failAt(
          lineNo,
          startCol,
          'unmatched "end" — there is no open subgraph to close',
          "end",
        );
      }
      state.openGroup = null;
      continue;
    }
    if (
      word !== undefined &&
      MERMAID_PRESENTATION_KEYWORDS.has(word) &&
      new RegExp(`^${word}(\\s|$)`).test(text)
    ) {
      continue;
    }

    parseChainStatement(state, { text: raw, pos: startCol - 1, line: lineNo });
  }

  if (inFrontmatter) {
    failAt(
      frontmatterLine,
      1,
      'the frontmatter "---" fence is never closed — expected a second "---" line',
      "---",
    );
  }
  if (!seenHeader) {
    failAt(
      1,
      1,
      'the source is empty — expected "flowchart <direction>" or "graph <direction>" on the first line',
    );
  }
  const open = state.openGroup;
  if (open !== null) {
    failAt(
      open.line,
      open.column,
      `the subgraph ${JSON.stringify(open.label)} opened here is never closed — expected "end"`,
      "subgraph",
    );
  }

  /* ---- resolve terminators by the arrows (essay in flowchart-mapping) ---- */
  const incoming = new Set(state.edges.map((edge) => edge.to));
  const nodes: FlowchartNode[] = state.nodes.map((node) => ({
    id: node.id,
    shape:
      node.shape === "terminator"
        ? resolveTerminator(incoming.has(node.id))
        : node.shape,
    label: node.label,
  }));

  /* An empty subgraph is dropped rather than kept: Mermaid allows
     `subgraph X / end` with nothing between, and a bracket over no nodes has
     no drawing — the same rule the sequence importer applies to an empty
     `box`, and the reason the `.alab` grammar refuses to spell one. */
  const groups: FlowchartGroup[] = state.groups
    .filter((group) => group.nodes.length > 0)
    .map((group) => ({ label: group.label, nodes: group.nodes }));

  return {
    version: "1.0",
    kind: "flowchart",
    metadata: {
      title: title ?? DEFAULT_TITLE,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    nodes,
    ...(groups.length > 0 ? { groups } : {}),
    edges: state.edges,
  };
}

/* -------------------------------------------------------------------------- */
/* Subgraphs                                                                   */
/* -------------------------------------------------------------------------- */

function openSubgraph(
  state: State,
  line: number,
  column: number,
  tail: string,
): void {
  if (state.openGroup !== null) {
    failAt(
      line,
      column,
      `a subgraph cannot open inside subgraph ${JSON.stringify(state.openGroup.label)} — arch-lab groups do not nest; close it with "end" first`,
      "subgraph",
    );
  }
  const rest = tail.trim();
  if (rest === "") {
    failAt(
      line,
      column,
      '"subgraph" needs a name — write "subgraph Payments" or "subgraph sg1 [Payments]"',
      "subgraph",
    );
  }
  /* `subgraph id [title]` or `subgraph title` — a bracketed title may be
     quoted, matching what the emitter writes. */
  const bracketed = /^(\S+)\s*\[(.*)\]$/.exec(rest);
  const id = bracketed === null ? rest : bracketed[1];
  const bracketText =
    bracketed === null ? rest : readLabelText(bracketed[2].trim());
  const label = bracketText === "" ? id : bracketText;
  state.subgraphIds.add(id);
  const group: PendGroup = {
    label: decodeInlineBreaks(label),
    nodes: [],
    line,
    column,
  };
  /* Pushed at OPEN time: `groups` order is subgraph declaration order. */
  state.groups.push(group);
  state.openGroup = group;
}

/* -------------------------------------------------------------------------- */
/* Node / edge statements                                                      */
/* -------------------------------------------------------------------------- */

/**
 * One `a --> b & c -->|x| d` statement: node lists joined by links, each
 * link fanning out one edge per (from, to) pair in narration order — which
 * is how Mermaid itself expands a chain, so the edge order a reader sees in
 * the text is the order the model keeps.
 */
function parseChainStatement(state: State, cur: Cursor): void {
  let current = readNodeList(state, cur);
  for (;;) {
    skipSpaces(cur);
    if (cur.pos >= cur.text.length) return;
    const label = readLink(cur);
    const targets = readNodeList(state, cur);
    for (const from of current) {
      for (const to of targets) {
        state.edges.push({
          from,
          to,
          ...(label !== undefined ? { label } : {}),
        });
      }
    }
    current = targets;
  }
}

/** `a & b & c` — one or more node references joined by `&`. */
function readNodeList(state: State, cur: Cursor): string[] {
  const ids = [readNodeRef(state, cur)];
  for (;;) {
    skipSpaces(cur);
    if (cur.text.charAt(cur.pos) !== "&") return ids;
    cur.pos += 1;
    ids.push(readNodeRef(state, cur));
  }
}

function readNodeRef(state: State, cur: Cursor): string {
  skipSpaces(cur);
  const startPos = cur.pos;
  const rawId = readIdToken(cur);
  if (rawId === "") {
    failAt(
      cur.line,
      col(cur),
      "expected a node id",
      cur.text.slice(cur.pos, cur.pos + 20).trim(),
    );
  }
  if (state.subgraphIds.has(rawId)) {
    /* Left unrefused, `sg --> x` would auto-declare a NODE named after the
       subgraph and quietly split one thing into two. */
    failAt(
      cur.line,
      startPos + 1,
      `"${rawId}" is a subgraph, not a node — an edge to a subgraph has no arch-lab equivalent; connect a node inside it instead`,
      rawId,
    );
  }
  const node = declare(state, rawId);

  /* Bracket form directly after the id spells the shape and label. */
  const refused = REFUSED_NODE_FORMS.find((form) =>
    cur.text.startsWith(form.open, cur.pos),
  );
  if (refused !== undefined) {
    failAt(
      cur.line,
      col(cur),
      `"${refused.open}" opens ${refused.what}, which has no arch-lab flowchart shape — use [...] (step), {...} (decision), ([...]) or ((...)) (terminator), [/.../] (io) or [[...]] (call)`,
      refused.open,
    );
  }
  const form = MERMAID_NODE_FORMS.find((candidate) =>
    cur.text.startsWith(candidate.open, cur.pos),
  );
  if (form !== undefined) {
    const formCol = col(cur);
    cur.pos += form.open.length;
    const label = readBracketText(cur, form.close, formCol);
    if (label === "") {
      failAt(
        cur.line,
        formCol,
        `node "${rawId}" has an empty label — the text inside the brackets is required`,
        form.open,
      );
    }
    applyDefinition(state, node, rawId, form.shape, label, cur.line, formCol);
  }

  /* `:::className` — styling, dropped like the other style lines. */
  const styled = /^:::[A-Za-z0-9_,-]+/.exec(cur.text.slice(cur.pos));
  if (styled !== null) cur.pos += styled[0].length;

  return node.id;
}

/**
 * First mention creates the node — implicitly a `step` labelled with its own
 * raw spelling, exactly what Mermaid draws for a bare id — and fixes its
 * group membership (essay in the file header).
 */
function declare(state: State, rawId: string): PendNode {
  const existing = state.byRaw.get(rawId);
  if (existing !== undefined) return existing;
  const node: PendNode = {
    id: alabSafeId(rawId, state.usedIds),
    shape: "step",
    label: rawId,
    defined: false,
    group: state.openGroup,
  };
  state.byRaw.set(rawId, node);
  state.nodes.push(node);
  state.openGroup?.nodes.push(node.id);
  return node;
}

function applyDefinition(
  state: State,
  node: PendNode,
  rawId: string,
  shape: FlowchartNodeShape | "terminator",
  label: string,
  line: number,
  column: number,
): void {
  if (node.defined) {
    failAt(
      line,
      column,
      `node "${rawId}" is defined twice — a second bracket would silently overwrite the first label`,
      rawId,
    );
  }
  if (node.group !== state.openGroup) {
    /* Refused, not reordered: membership is fixed by first mention (file
       header essay), and this spelling states a membership the model cannot
       honour without rewriting the declaration order. */
    failAt(
      line,
      column,
      `node "${rawId}" is defined under a different subgraph than the one that first mentioned it — arch-lab groups are contiguous runs of the declaration order, so membership is fixed by first mention; move this definition next to that mention`,
      rawId,
    );
  }
  node.shape = shape;
  node.label = label;
  node.defined = true;
}

/* -------------------------------------------------------------------------- */
/* Links                                                                       */
/* -------------------------------------------------------------------------- */

/** Plain link tokens, tried IN ORDER: arrows before open links so `--->`
 * is a long arrow, not `---` plus junk; head shapes before the inline-label
 * form so `--x b` is a cross-head link, not a label starting with "x".
 * Every one of them is the same model edge — the collapse the caveat names. */
const PLAIN_LINKS: readonly RegExp[] = [
  /^-{2,}>/,
  /^-{2,}[xo](?![A-Za-z0-9_])/,
  /^-{3,}(?![->])/,
  /^-\.+->/,
  /^={2,}>/,
  /^={3,}(?![=>])/,
];

/**
 * One link between two node lists. Returns the label, if any — from either
 * the inline `-- label -->` spelling or the `|label|` tail — and leaves the
 * cursor before the target list.
 */
function readLink(cur: Cursor): string | undefined {
  const rest = cur.text.slice(cur.pos);
  const linkCol = col(cur);

  if (rest.startsWith("<")) {
    failAt(
      cur.line,
      linkCol,
      "two-headed and reverse arrows (<-->, <--) have no arch-lab flowchart edge — every edge has one direction; write it that way round (b --> a)",
      rest.slice(0, 4),
    );
  }
  if (/^->/.test(rest)) {
    failAt(
      cur.line,
      linkCol,
      '"->" is not a Mermaid flowchart link — links take two dashes (a --> b)',
      "->",
    );
  }

  let inlineLabel: string | undefined;
  const plain = PLAIN_LINKS.find((pattern) => pattern.test(rest));
  if (plain !== undefined) {
    cur.pos += (plain.exec(rest) as RegExpExecArray)[0].length;
  } else if (/^--(?![-.>])/.test(rest)) {
    inlineLabel = readInlineLabel(cur, 2, ["-->", "---"]);
  } else if (/^-\./.test(rest)) {
    inlineLabel = readInlineLabel(cur, 2, [".->"]);
  } else if (/^==(?![=>])/.test(rest)) {
    inlineLabel = readInlineLabel(cur, 2, ["==>"]);
  } else {
    failAt(
      cur.line,
      linkCol,
      `expected a link (-->, ---, -->|label|, -- label -->) or "&" between node ids`,
      rest.split(/\s/, 1)[0].slice(0, 10),
    );
  }

  /* The `|label|` tail, on any link form. */
  skipSpaces(cur);
  if (cur.text.charAt(cur.pos) === "|") {
    const pipeCol = col(cur);
    if (inlineLabel !== undefined) {
      failAt(
        cur.line,
        pipeCol,
        "the link already carries a label in its dashes — it cannot take a |label| too",
        "|",
      );
    }
    cur.pos += 1;
    let value: string;
    if (cur.text.charAt(cur.pos) === '"') {
      /* The emitter quote-wraps a label a bare pipe pair could not hold
         (one containing `|`), so the quoted body is read as a string, not
         scanned for the next pipe. */
      value = readQuoted(cur);
    } else {
      const closeAt = cur.text.indexOf("|", cur.pos);
      if (closeAt === -1) {
        failAt(cur.line, pipeCol, 'the "|label|" is never closed', "|");
      }
      value = readLabelText(cur.text.slice(cur.pos, closeAt).trim());
      cur.pos = closeAt;
    }
    if (cur.text.charAt(cur.pos) !== "|") {
      failAt(cur.line, col(cur), 'the "|label|" is never closed', "|");
    }
    cur.pos += 1;
    return value === "" ? undefined : value;
  }
  return inlineLabel === "" ? undefined : inlineLabel;
}

/** `-- label -->` and its dotted/thick siblings: the label runs from after
 * the opening dashes to the earliest closing token. */
function readInlineLabel(
  cur: Cursor,
  openLength: number,
  closers: readonly string[],
): string {
  const startCol = col(cur);
  const from = cur.pos + openLength;
  let closeAt = -1;
  let closer = "";
  for (const candidate of closers) {
    const at = cur.text.indexOf(candidate, from);
    if (at !== -1 && (closeAt === -1 || at < closeAt)) {
      closeAt = at;
      closer = candidate;
    }
  }
  if (closeAt === -1) {
    failAt(
      cur.line,
      startCol,
      `the link label is never closed — expected "${closers[0]}" after the text`,
      cur.text.slice(cur.pos, cur.pos + 20).trim(),
    );
  }
  const value = readLabelText(cur.text.slice(from, closeAt).trim());
  cur.pos = closeAt + closer.length;
  return value;
}

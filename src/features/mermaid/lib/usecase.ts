/**
 * Mermaid `flowchart` / `graph` read under the USE-CASE convention →
 * `UseCaseLabFile`. One-way, like the importers next door — Mermaid is an
 * import format, not a storage format.
 *
 * Mermaid has no use-case grammar; this parses the SAME line-oriented
 * `flowchart` grammar as `./flowchart.ts` (same header words, same
 * frontmatter, same `%%` comments, same statement cursor from `./cursor.ts`)
 * but reads it under the convention real documents use: `((circle))` =
 * actor, `([stadium])` / `(round)` = use case, `subgraph` = system
 * boundary. Which reading a pasted document gets is decided by
 * `detectMermaidUseCase` below — the whole decision, and why it cannot
 * steal a genuine flowchart, is argued in `./usecase-mapping.ts`.
 *
 * STRICT ON PURPOSE. This parser refuses everything that signals a genuine
 * flowchart — step/decision/io/call brackets, labelled solid arrows outside
 * the closed `|generalizes|` word, thick and cross/circle-head links, a
 * dashed arrow without its `|include|`/`|extend|` stereotype — because the
 * refusals ARE the detection heuristic's narrowing (condition 1 in the
 * mapping file's essay). Every such error names the flowchart importer as
 * the way to get the other reading, so a deliberate use-case import of a
 * flowchart teaches rather than baffles.
 *
 * WHAT THE READING IMPOSES, beyond the flowchart importer's own losses:
 * arrowheads on plain links are DROPPED — a UML association is undirected,
 * so `Customer --> UC1` and `Customer --- UC1` are the same statement, and
 * `from`/`to` record only which side each id was written on. The UML kind
 * rules are enforced after parsing, exactly as the `.alab` parser enforces
 * them, so an import can never build a model the `.alab` round trip then
 * refuses.
 *
 * Boundary membership is FIRST-MENTION, the flowchart importer's rule for
 * the same reason (its file-header essay): `UseCaseBoundary` members must be
 * a contiguous run of the declaration order, and first-mention is the one
 * assignment that keeps every member a fresh, consecutive declaration. An
 * element first mentioned bare (no brackets) is a use case labelled with its
 * own raw spelling until a bracket defines it — a use case rather than an
 * actor because in this convention the actor is the marked case (the double
 * bracket) and the use case is the unmarked one.
 *
 * What is LOSSY is named, in full, by `MERMAID_USECASE_CAVEAT` below — the
 * same honesty contract as the other three import caveats.
 *
 * Imported by `scripts/mermaid-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import type {
  UseCaseBoundary,
  UseCaseDependencyStereotype,
  UseCaseEdge,
  UseCaseElement,
  UseCaseElementKind,
  UseCaseLabFile,
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
  MERMAID_PRESENTATION_KEYWORDS,
} from "./flowchart-mapping";
import {
  FLOWCHART_ONLY_OPENERS,
  MERMAID_DEPENDENCY_ARROW,
  MERMAID_DEPENDENCY_STEREOTYPES,
  MERMAID_GENERALIZATION_LABEL,
  MERMAID_USECASE_NODE_FORMS,
  readsAsUseCase,
} from "./usecase-mapping";

/* -------------------------------------------------------------------------- */
/* The caveat — what the use-case reading of a Mermaid flowchart DROPS         */
/* -------------------------------------------------------------------------- */

/**
 * Import is honest but not lossless — and here it is also an ASSUMPTION,
 * which the first clause names. Named per item so the UI can say exactly
 * what changed, the way the other three import caveats do:
 */
export const MERMAID_USECASE_CAVEAT =
  "Mermaid has no use-case diagram: this import reads the flowchart " +
  "CONVENTION for one — ((circles)) are actors, ([stadiums]) and (rounds) " +
  "are use cases, and a subgraph is the system boundary — so the reading " +
  "is an assumption; a document meant as a genuine flowchart gets the " +
  "other reading by being imported as a flowchart instead. The conversion " +
  "is one-way and lossy: arrowheads on plain links are dropped (a UML " +
  "association is undirected, so --> and --- read as the same line, " +
  "recording only which side each id was written on), -.->|include| and " +
  "-.->|extend| become «include»/«extend» dependencies and -->|generalizes| " +
  "a generalization, the direction word (TD/TB/BT/LR/RL) is layout and is " +
  "dropped, styling and interaction lines (style, linkStyle, classDef, " +
  "class, click, :::class, direction) are dropped, frontmatter keys other " +
  "than title are dropped, element ids outside the .alab slug alphabet are " +
  "renamed deterministically, and an empty subgraph is dropped. Save as " +
  ".alab to keep everything else.";

/* -------------------------------------------------------------------------- */
/* Options                                                                     */
/* -------------------------------------------------------------------------- */

export interface ParseMermaidUseCaseOptions {
  /** Same contract as the other three importers: a fixed default keeps
   * parsing a pure function; pass `new Date().toISOString()` if provenance
   * matters more than byte-stable output. */
  timestamp?: string;
}

const DEFAULT_TITLE = "Untitled use-case diagram";

/* -------------------------------------------------------------------------- */
/* Parser state                                                                */
/* -------------------------------------------------------------------------- */

interface PendBoundary {
  label: string;
  usecases: string[];
  line: number;
  column: number;
}

interface PendElement {
  id: string;
  kind: UseCaseElementKind;
  label: string;
  /** Whether a bracket form has spelled the kind/label out. Implicit
   * elements (bare first use) stay redefinable once; a second bracket is
   * refused. */
  defined: boolean;
  /** The boundary open at FIRST mention — membership, fixed for good. */
  boundary: PendBoundary | null;
}

/** Edge endpoints are element REFERENCES, not ids: the UML kind rules read
 * each endpoint's kind, and a bracket may define that kind lines after the
 * edge mentioned it. Locations are kept so the post-parse rules can blame
 * the edge line, exactly as the `.alab` parser does. */
interface PendEdge {
  kind: UseCaseEdge["kind"];
  from: PendElement;
  to: PendElement;
  label?: string;
  stereotype?: UseCaseDependencyStereotype;
  line: number;
  column: number;
}

interface State {
  elements: PendElement[];
  /** Keyed by the RAW Mermaid spelling — normalisation must map one raw id
   * to one element however often it recurs. */
  byRaw: Map<string, PendElement>;
  usedIds: Set<string>;
  boundaries: PendBoundary[];
  openBoundary: PendBoundary | null;
  subgraphIds: Set<string>;
  edges: PendEdge[];
}

/* -------------------------------------------------------------------------- */
/* Detection                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Should this Mermaid `flowchart`/`graph` source get the use-case reading?
 * True only when the strict parser accepts the whole document AND the model
 * reads as a use-case diagram (`readsAsUseCase`) — so true GUARANTEES that
 * `parseMermaidUseCase(source)` succeeds; the two cannot disagree, because
 * this is the parser. False means the caller keeps its current behaviour:
 * the flowchart importer, which is the documented fallback. The full
 * decision, and why this cannot steal a genuine flowchart, is the essay in
 * `./usecase-mapping.ts`.
 */
export function detectMermaidUseCase(source: string): boolean {
  try {
    return readsAsUseCase(parseMermaidUseCase(source));
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* The importer                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Parses Mermaid `flowchart` / `graph` source as a use-case diagram into a
 * `UseCaseLabFile`. Deterministic: the same source (and options) always
 * yields the same model, ids included. Throws `MermaidParseError` with
 * line/column on malformed input — or on flowchart-only constructs, whose
 * errors name the flowchart importer — never returning a partial model.
 */
export function parseMermaidUseCase(
  source: string,
  options?: ParseMermaidUseCaseOptions,
): UseCaseLabFile {
  const timestamp = options?.timestamp ?? MERMAID_IMPORT_TIMESTAMP;

  const state: State = {
    elements: [],
    byRaw: new Map(),
    usedIds: new Set(),
    boundaries: [],
    openBoundary: null,
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

    /* ---- YAML frontmatter — the flowchart importer's contract verbatim:
       only a `---` fence BEFORE the header opens it, only `title` survives. */
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
    /* Old `graph` spelling: strip ONE trailing `;` (see `./flowchart.ts`). */
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
          `"${text.split(/\s/, 1)[0]}" is not a flowchart header — the use-case convention rides Mermaid's flowchart grammar, so the first line must be "flowchart <direction>" or "graph <direction>"`,
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
      /* The direction itself is dropped — layout, not model (the flowchart
         importer's essay; a use-case model has even less use for it). */
      seenHeader = true;
      continue;
    }

    /* ----------------------------- statements ---------------------------- */
    const word = /^[A-Za-z]+/.exec(text)?.[0];

    if (word === "subgraph" && /^subgraph(\s|$)/.test(text)) {
      openBoundary(state, lineNo, startCol, text.slice("subgraph".length));
      continue;
    }
    if (text === "end") {
      if (state.openBoundary === null) {
        failAt(
          lineNo,
          startCol,
          'unmatched "end" — there is no open subgraph to close',
          "end",
        );
      }
      state.openBoundary = null;
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
  const open = state.openBoundary;
  if (open !== null) {
    failAt(
      open.line,
      open.column,
      `the subgraph ${JSON.stringify(open.label)} opened here is never closed — expected "end"`,
      "subgraph",
    );
  }

  /* ---- UML kind rules, enforced after parsing when every kind is final —
     the same post-resolution placement (and the same three rules) as the
     `.alab` parser, so an import can never build a model the `.alab` round
     trip then refuses. */
  const edges: UseCaseEdge[] = state.edges.map((edge) => finishEdge(edge));

  /* An empty subgraph is dropped rather than kept — the flowchart importer's
     rule, and the `.alab` grammar cannot spell a memberless boundary. */
  const boundaries: UseCaseBoundary[] = state.boundaries
    .filter((boundary) => boundary.usecases.length > 0)
    .map((boundary) => ({
      label: boundary.label,
      usecases: boundary.usecases,
    }));

  const elements: UseCaseElement[] = state.elements.map((element) => ({
    id: element.id,
    kind: element.kind,
    label: element.label,
  }));

  return {
    version: "1.0",
    kind: "usecase",
    metadata: {
      title: title ?? DEFAULT_TITLE,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    elements,
    ...(boundaries.length > 0 ? { boundaries } : {}),
    edges,
  };
}

/* -------------------------------------------------------------------------- */
/* Boundaries                                                                  */
/* -------------------------------------------------------------------------- */

function openBoundary(
  state: State,
  line: number,
  column: number,
  tail: string,
): void {
  if (state.openBoundary !== null) {
    failAt(
      line,
      column,
      `a subgraph cannot open inside subgraph ${JSON.stringify(state.openBoundary.label)} — a use-case system boundary does not nest; close it with "end" first`,
      "subgraph",
    );
  }
  const rest = tail.trim();
  if (rest === "") {
    failAt(
      line,
      column,
      '"subgraph" needs a name — write "subgraph Deliveries" or "subgraph sg1 [Food Delivery Service]"',
      "subgraph",
    );
  }
  /* `subgraph id [Display Title]` or `subgraph title` — the DISPLAY TITLE is
     the label when both exist, because it is what Mermaid itself draws on
     the box; labelling the boundary with the id would put `MyService` on
     screen where the author wrote `Food Delivery Service`. */
  const bracketed = /^(\S+)\s*\[(.*)\]$/.exec(rest);
  const id = bracketed === null ? rest : bracketed[1];
  const bracketText =
    bracketed === null ? rest : readLabelText(bracketed[2].trim());
  const label = bracketText === "" ? id : bracketText;
  state.subgraphIds.add(id);
  const boundary: PendBoundary = {
    label: decodeInlineBreaks(label),
    usecases: [],
    line,
    column,
  };
  /* Pushed at OPEN time: `boundaries` order is subgraph declaration order. */
  state.boundaries.push(boundary);
  state.openBoundary = boundary;
}

/* -------------------------------------------------------------------------- */
/* Element / edge statements                                                   */
/* -------------------------------------------------------------------------- */

/**
 * One `Customer --> UC1 & UC2` statement: element lists joined by links,
 * each link fanning out one edge per (from, to) pair in narration order —
 * the flowchart importer's expansion, unchanged, so the edge order a reader
 * sees in the text is the order the model keeps.
 */
function parseChainStatement(state: State, cur: Cursor): void {
  let current = readElementList(state, cur);
  for (;;) {
    skipSpaces(cur);
    if (cur.pos >= cur.text.length) return;
    const linkLine = cur.line;
    const linkColumn = col(cur);
    const link = readLink(cur);
    const targets = readElementList(state, cur);
    for (const from of current) {
      for (const to of targets) {
        state.edges.push({
          kind: link.kind,
          from,
          to,
          ...(link.label !== undefined ? { label: link.label } : {}),
          ...(link.stereotype !== undefined
            ? { stereotype: link.stereotype }
            : {}),
          line: linkLine,
          column: linkColumn,
        });
      }
    }
    current = targets;
  }
}

/** `a & b & c` — one or more element references joined by `&`. */
function readElementList(state: State, cur: Cursor): PendElement[] {
  const elements = [readElementRef(state, cur)];
  for (;;) {
    skipSpaces(cur);
    if (cur.text.charAt(cur.pos) !== "&") return elements;
    cur.pos += 1;
    elements.push(readElementRef(state, cur));
  }
}

function readElementRef(state: State, cur: Cursor): PendElement {
  skipSpaces(cur);
  const startPos = cur.pos;
  const rawId = readIdToken(cur);
  if (rawId === "") {
    failAt(
      cur.line,
      col(cur),
      "expected an element id",
      cur.text.slice(cur.pos, cur.pos + 20).trim(),
    );
  }
  if (state.subgraphIds.has(rawId)) {
    /* Left unrefused, `sg --> x` would auto-declare a use case named after
       the boundary and quietly split one thing into two. */
    failAt(
      cur.line,
      startPos + 1,
      `"${rawId}" is a system boundary (a subgraph), not an element — an edge to a boundary has no use-case equivalent; connect a use case inside it instead`,
      rawId,
    );
  }
  const element = declare(state, rawId);

  /* Bracket form directly after the id spells the kind and label. A
     flowchart-only bracket is refused BEFORE the use-case forms, longest
     first — it is the strongest signal this document is a flowchart, and
     the strictness is what keeps detection narrow (mapping-file essay). */
  const refused = FLOWCHART_ONLY_OPENERS.find((opener) =>
    cur.text.startsWith(opener, cur.pos),
  );
  if (refused !== undefined) {
    failAt(
      cur.line,
      col(cur),
      `"${refused}" opens a flowchart shape, which the use-case reading has no symbol for — an actor is a ((circle)) and a use case a ([stadium]); if this document is a flowchart, import it as a flowchart instead`,
      refused,
    );
  }
  const form = MERMAID_USECASE_NODE_FORMS.find((candidate) =>
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
        `element "${rawId}" has an empty label — the text inside the brackets is required`,
        form.open,
      );
    }
    applyDefinition(state, element, rawId, form.kind, label, cur.line, formCol);
  }

  /* `:::className` — styling, dropped like the other style lines. */
  const styled = /^:::[A-Za-z0-9_,-]+/.exec(cur.text.slice(cur.pos));
  if (styled !== null) cur.pos += styled[0].length;

  return element;
}

/**
 * First mention creates the element — implicitly a `usecase` labelled with
 * its own raw spelling (the unmarked case of this convention; the file
 * header says why) — and fixes its boundary membership.
 */
function declare(state: State, rawId: string): PendElement {
  const existing = state.byRaw.get(rawId);
  if (existing !== undefined) return existing;
  const element: PendElement = {
    id: alabSafeId(rawId, state.usedIds),
    kind: "usecase",
    label: rawId,
    defined: false,
    boundary: state.openBoundary,
  };
  state.byRaw.set(rawId, element);
  state.elements.push(element);
  state.openBoundary?.usecases.push(element.id);
  return element;
}

function applyDefinition(
  state: State,
  element: PendElement,
  rawId: string,
  kind: UseCaseElementKind,
  label: string,
  line: number,
  column: number,
): void {
  if (element.defined) {
    failAt(
      line,
      column,
      `element "${rawId}" is defined twice — a second bracket would silently overwrite the first label`,
      rawId,
    );
  }
  if (element.boundary !== state.openBoundary) {
    /* Refused, not reordered: membership is fixed by first mention (file
       header), and this spelling states a membership the model cannot
       honour without rewriting the declaration order. */
    failAt(
      line,
      column,
      `element "${rawId}" is defined under a different subgraph than the one that first mentioned it — a use-case boundary is a contiguous run of the declaration order, so membership is fixed by first mention; move this definition next to that mention`,
      rawId,
    );
  }
  if (kind === "actor" && state.openBoundary !== null) {
    /* The `.alab` grammar's actor-outside-the-edge rule, applied at the
       Mermaid gate: the subgraph IS the system boundary in this reading,
       and an actor stands outside it by definition. Also the reason a
       boundary's member list can never end up holding an actor. */
    failAt(
      line,
      column,
      `the ((circle)) actor "${rawId}" is declared inside subgraph ${JSON.stringify(state.openBoundary.label)} — in the use-case reading the subgraph is the system boundary and an actor stands outside it; move the actor out, or import this document as a flowchart`,
      rawId,
    );
  }
  element.kind = kind;
  element.label = label;
  element.defined = true;
}

/* -------------------------------------------------------------------------- */
/* Links                                                                       */
/* -------------------------------------------------------------------------- */

interface LinkReading {
  kind: UseCaseEdge["kind"];
  label?: string;
  stereotype?: UseCaseDependencyStereotype;
}

const stereotypeList = (): string =>
  MERMAID_DEPENDENCY_STEREOTYPES.map(
    (word) => `${MERMAID_DEPENDENCY_ARROW}|${word}|`,
  ).join(" or ");

/**
 * One link between two element lists. The accepted set is deliberately
 * smaller than the flowchart importer's — every refusal here is one
 * condition of the detection heuristic (mapping-file essay), so each error
 * names the flowchart importer as the way to the other reading.
 */
function readLink(cur: Cursor): LinkReading {
  const rest = cur.text.slice(cur.pos);
  const linkCol = col(cur);

  if (rest.startsWith("<")) {
    failAt(
      cur.line,
      linkCol,
      "two-headed and reverse arrows (<-->, <--) have no use-case line — an association is undirected already; write it plain (a --- b)",
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
  if (/^={2,}/.test(rest)) {
    failAt(
      cur.line,
      linkCol,
      "a thick link (==>) is a flowchart spelling with no use-case meaning — write the association plain (a --- b), or import this document as a flowchart",
      rest.slice(0, 3),
    );
  }
  if (/^-{2,}[xo](?![A-Za-z0-9_])/.test(rest)) {
    failAt(
      cur.line,
      linkCol,
      "cross- and circle-head links (--x, --o) are flowchart spellings with no use-case meaning — write the association plain (a --- b), or import this document as a flowchart",
      rest.slice(0, 3),
    );
  }

  /* Dashed arrow: a dependency, whose |stereotype| is REQUIRED — a bare
     dashed arrow is ambiguous in exactly the way the use-case model exists
     to avoid, so absence is an error rather than a guess. */
  if (/^-\./.test(rest)) {
    const arrow = /^-\.+->/.exec(rest);
    if (arrow === null) {
      failAt(
        cur.line,
        linkCol,
        `a dashed line here must be the dependency arrow — write ${stereotypeList()}`,
        rest.split(/\s/, 1)[0].slice(0, 10),
      );
    }
    cur.pos += arrow[0].length;
    const word = readPipeTail(cur);
    const stereotype = MERMAID_DEPENDENCY_STEREOTYPES.find(
      (candidate) => candidate === word,
    );
    if (stereotype === undefined) {
      failAt(
        cur.line,
        linkCol,
        `a dashed dependency arrow needs its stereotype label — the vocabulary is closed: ${stereotypeList()}${word === undefined ? "" : ` (got |${word}|)`}`,
        arrow[0],
      );
    }
    return { kind: "dependency", stereotype };
  }

  /* Solid arrow: unlabelled = an association with the arrowhead dropped
     (the caveat's named loss); the one label it may carry is the closed
     generalization word. Any other label is the signature of a genuine
     flowchart and fails the reading rather than being absorbed. */
  const solid = /^-{2,}>/.exec(rest);
  if (solid !== null) {
    cur.pos += solid[0].length;
    const label = readPipeTail(cur);
    if (label === undefined) return { kind: "association" };
    if (label === MERMAID_GENERALIZATION_LABEL) {
      return { kind: "generalization" };
    }
    failAt(
      cur.line,
      linkCol,
      `a labelled arrow (-->|${label}|) reads as a flowchart edge, not a use-case line — the only arrow label this reading knows is |${MERMAID_GENERALIZATION_LABEL}|; spell «include»/«extend» as ${stereotypeList()}, put an association label on the undirected line (a ---|label| b), or import this document as a flowchart`,
      `|${label}|`,
    );
  }

  /* Undirected line: the association, optionally labelled with a
     multiplicity or role — the one place a label is welcome, because an
     undirected labelled line has no flowchart reading to collide with. */
  const undirected = /^-{3,}(?![->])/.exec(rest);
  if (undirected !== null) {
    cur.pos += undirected[0].length;
    const label = readPipeTail(cur);
    return { kind: "association", ...(label !== undefined ? { label } : {}) };
  }

  if (/^--(?![->])/.test(rest)) {
    failAt(
      cur.line,
      linkCol,
      'the inline "-- label -->" spelling reads as a flowchart edge — write an association label in pipes on the undirected line (a ---|label| b), or import this document as a flowchart',
      rest.split(/\s/, 1)[0].slice(0, 10),
    );
  }
  failAt(
    cur.line,
    linkCol,
    `expected a link (---, -->, ---|label|, ${stereotypeList()}) or "&" between element ids`,
    rest.split(/\s/, 1)[0].slice(0, 10),
  );
}

/** The optional `|label|` tail after a link token. Returns `undefined` for
 * no tail and for an empty one — empty and absent are one spelling in
 * Mermaid's pipe form, the flowchart emitter's documented rule. */
function readPipeTail(cur: Cursor): string | undefined {
  skipSpaces(cur);
  if (cur.text.charAt(cur.pos) !== "|") return undefined;
  const pipeCol = col(cur);
  cur.pos += 1;
  let value: string;
  if (cur.text.charAt(cur.pos) === '"') {
    /* The emitter quote-wraps a label a bare pipe pair could not hold. */
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

/* -------------------------------------------------------------------------- */
/* The UML kind rules                                                          */
/* -------------------------------------------------------------------------- */

const kindName = (kind: UseCaseElementKind): string =>
  kind === "actor" ? "an actor" : "a use case";

/** One finished edge, with the `.alab` parser's three kind rules applied —
 * both endpoints' kinds are final here, which is why this runs after the
 * line loop. Key order matches the `.alab` parser's `resolve`, so the two
 * paths to a model are deep-equal comparable. */
function finishEdge(edge: PendEdge): UseCaseEdge {
  const { from, to } = edge;
  switch (edge.kind) {
    case "association":
      if (from.kind === to.kind) {
        failAt(
          edge.line,
          edge.column,
          from.kind === "actor"
            ? `an association cannot join two actors — "is-a" between actors is a generalization (-->|${MERMAID_GENERALIZATION_LABEL}|); an association joins an actor and a use case`
            : `an association cannot join two use cases — relate use cases with ${stereotypeList()} or -->|${MERMAID_GENERALIZATION_LABEL}|; an association joins an actor and a use case (if these are flow steps, this document is a flowchart — import it as one)`,
          from.id,
        );
      }
      return {
        kind: "association",
        from: from.id,
        to: to.id,
        ...(edge.label !== undefined ? { label: edge.label } : {}),
      };
    case "dependency":
      for (const end of [from, to]) {
        if (end.kind === "actor") {
          failAt(
            edge.line,
            edge.column,
            `«${edge.stereotype}» joins two use cases — "${end.id}" is an actor, and an actor cannot include or extend behaviour`,
            end.id,
          );
        }
      }
      return {
        kind: "dependency",
        from: from.id,
        to: to.id,
        stereotype: edge.stereotype as UseCaseDependencyStereotype,
      };
    case "generalization":
      if (from.kind !== to.kind) {
        failAt(
          edge.line,
          edge.column,
          `a generalization joins two elements of the same kind — "${from.id}" is ${kindName(from.kind)} and "${to.id}" is ${kindName(to.kind)}; an actor–use-case line is an association (a --- b)`,
          from.id,
        );
      }
      return { kind: "generalization", from: from.id, to: to.id };
  }
}

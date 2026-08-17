/**
 * The mapping tables of the Mermaid flowchart dialect, shared by the
 * importer (`./flowchart.ts`) and the emitter (`./flowchart-emit.ts`) — the
 * flowchart counterpart of `./mapping.ts`, kept as one module for the same
 * reason: a table used by both directions cannot let import and export
 * disagree about what a bracket means.
 *
 * THE ONE NON-BIJECTIVE CELL. Mermaid has a single terminator drawing (the
 * stadium `([...])`, the rounded `(...)` used the same way in practice, and
 * the circle `((...))` — the round shape people reach for to draw actors and
 * entry/exit points), while the arch-lab model splits it into `start` and
 * `end` because the two symbols make different statements. All three bracket
 * forms therefore map to `"terminator"` here, and `resolveTerminator` tells
 * them apart by the arrows: no incoming edge is a `start`, any incoming edge
 * is an `end`. That rule is deterministic but not lossless — a `start`
 * someone draws an arrow INTO comes back as an `end`, and a circle comes
 * back as the stadium the emitter writes — and both caveats name it.
 * Carrying a marker tag instead (the C4 tables' trick) was rejected: a shape
 * is the statement a node makes, and hiding it in a tag would make the tag
 * load-bearing for the model rather than for the converter. The circle was
 * REFUSED at first ("no arch-lab symbol"), and that refusal blocked a real
 * user document whose actors were circles — a named, documented
 * approximation renders the chart; a refusal renders nothing.
 *
 * Imported by `scripts/mermaid-check.mjs` through Node's type stripping:
 * keep the syntax erasable (no enums) and type-only imports as `import type`.
 */

import type { FlowchartNodeShape } from "@/types";

/* -------------------------------------------------------------------------- */
/* Header                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The two words that open a Mermaid flowchart — `flowchart` (current) and
 * `graph` (the original spelling, still everywhere in the wild). One table
 * imported by the importer's header check AND the input detectors
 * (`sequence/input/parse.ts`'s first-line sniff), so "what counts as a
 * flowchart header" is spelled once — a detector recognising a word the
 * parser then refuses would route a paste into an error about its own line 1.
 */
export const MERMAID_FLOWCHART_HEADER_WORDS = ["flowchart", "graph"] as const;

/** Built from the word table above, so the detectors and BOTH readers of
 * this grammar (the flowchart importer and the use-case importer, which
 * parse the same header) can never recognise a header a parser then
 * refuses. Group 1 is the header word, group 2 the direction token. */
export const MERMAID_FLOWCHART_HEADER_RE = new RegExp(
  `^(${MERMAID_FLOWCHART_HEADER_WORDS.join("|")})(?:\\s+(\\S+))?\\s*$`,
);

/** Statement keywords parsed and DROPPED by both readers of this grammar:
 * presentation and interactivity, which arch-lab models on its own terms
 * (see the direction essay in `./flowchart.ts`). Only when followed by
 * whitespace — `style[...]` is a node named style. */
export const MERMAID_PRESENTATION_KEYWORDS: ReadonlySet<string> = new Set([
  "style",
  "linkStyle",
  "classDef",
  "class",
  "click",
  "direction",
]);

/* -------------------------------------------------------------------------- */
/* Direction                                                                   */
/* -------------------------------------------------------------------------- */

/** The direction words Mermaid's flowchart header accepts. Direction is
 * LAYOUT, not model — see the essay in `./flowchart.ts` for where it goes. */
export const MERMAID_FLOWCHART_DIRECTIONS = [
  "TD",
  "TB",
  "BT",
  "LR",
  "RL",
] as const;

export type MermaidFlowchartDirection =
  (typeof MERMAID_FLOWCHART_DIRECTIONS)[number];

/* -------------------------------------------------------------------------- */
/* Node shapes                                                                 */
/* -------------------------------------------------------------------------- */

export interface MermaidNodeForm {
  /** The bracket that opens the shape, directly after the node id. */
  open: string;
  /** The bracket that closes it. */
  close: string;
  /** The arch-lab shape, or `"terminator"` for the start/end pair the
   * importer resolves with `resolveTerminator`. */
  shape: FlowchartNodeShape | "terminator";
}

/**
 * Mermaid bracket → shape, LONGEST OPEN FIRST — the only ordering that keeps
 * `([` from being read as `(`, and `[[` / `[/` / `[\` from being read as
 * `[` (the same rule the sequence importer's arrow table follows).
 */
export const MERMAID_NODE_FORMS: readonly MermaidNodeForm[] = [
  { open: "((", close: "))", shape: "terminator" },
  { open: "([", close: "])", shape: "terminator" },
  { open: "[[", close: "]]", shape: "call" },
  { open: "[/", close: "/]", shape: "io" },
  { open: "[\\", close: "\\]", shape: "io" },
  { open: "[", close: "]", shape: "step" },
  { open: "{", close: "}", shape: "decision" },
  { open: "(", close: ")", shape: "terminator" },
];

/**
 * Mermaid shapes still refused, by name rather than guessed — each because
 * every candidate mapping would MISLEAD, not merely lose a curve:
 *
 *   - `{{...}}` hexagon: Mermaid's preparation symbol. Mapping it to
 *     `decision` would invent a branch point the author never drew; mapping
 *     it to `step` erases the one statement the hexagon makes.
 *   - `[(...)]` cylinder: a data STORE. `io` is a data OPERATION and `step`
 *     is a process — either repaints a database as an action, which is a
 *     wrong model, not a rounder corner.
 *   - `>...]` flag: an odd-one-out marker with no analogue; any box shape
 *     silently deletes the asymmetry that was its entire meaning.
 *
 * The circle `((...))` USED to sit here and was moved into
 * `MERMAID_NODE_FORMS` as a terminator: a circle is how real documents draw
 * actors and entry/exit points, and the terminator is honestly the same
 * statement drawn rounder — the caveat names the approximation. Refusals are
 * checked BEFORE `MERMAID_NODE_FORMS`, longest first.
 */
export const REFUSED_NODE_FORMS: readonly { open: string; what: string }[] = [
  { open: "{{", what: "a hexagon (Mermaid's preparation symbol)" },
  { open: "[(", what: "a cylinder (a data store)" },
  { open: ">", what: "an asymmetric flag" },
];

/**
 * Shape → the bracket pair the emitter writes. `start` and `end` both write
 * the stadium — Mermaid draws one terminator, and the import direction gets
 * them back apart through `resolveTerminator` — and `io` writes the
 * forward parallelogram (the backslash form reads the same shape, so one
 * canonical spelling goes out). Every pair here appears in
 * `MERMAID_NODE_FORMS`; the round-trip assertions in
 * `scripts/mermaid-check.mjs` pin the two tables together.
 */
export const BRACKETS_BY_SHAPE: Readonly<
  Record<FlowchartNodeShape, readonly [string, string]>
> = {
  start: ["([", "])"],
  end: ["([", "])"],
  step: ["[", "]"],
  decision: ["{", "}"],
  io: ["[/", "/]"],
  call: ["[[", "]]"],
};

/** Which half of the start/end pair a Mermaid terminator is — decided by the
 * arrows, the only signal Mermaid's one-terminator grammar leaves. */
export function resolveTerminator(hasIncoming: boolean): FlowchartNodeShape {
  return hasIncoming ? "end" : "start";
}

/* -------------------------------------------------------------------------- */
/* Edges                                                                       */
/* -------------------------------------------------------------------------- */

/** The one arrow the emitter writes. The importer reads the whole family
 * (dotted, thick, open, cross/circle heads) and collapses it onto the
 * model's single edge kind — the same many-in, one-out contract as the
 * sequence dialect's eight-arrow table. */
export const MERMAID_FLOWCHART_ARROW = "-->";

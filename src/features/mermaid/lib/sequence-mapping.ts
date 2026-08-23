/**
 * The arrow table of the Mermaid `sequenceDiagram` dialect, shared by the
 * importer (`./sequence.ts`) and the emitter (`./sequence-emit.ts`) — the
 * sequence counterpart of `./mapping.ts` and `./flowchart-mapping.ts`, and
 * new with the two-axis arrow model.
 *
 * IT EXISTS BECAUSE THE CONVERSION IS NOW BIJECTIVE. While the importer
 * collapsed eight Mermaid arrows onto three model kinds and the emitter wrote
 * one canonical arrow per kind, the two directions could not share a table:
 * one was many-to-one and the other one-to-one, and each held its own list.
 * That is precisely how the two bidirectional arrows (`<<->>`, `<<-->>`) came
 * to be handled by neither — they appeared in no list, so they were not
 * supported and, worse, not refused by name either. With one table read in
 * both directions an arrow cannot be missing from one half.
 *
 * THE TABLE IS THE GRID, not a list of ten. Mermaid's ten sequence arrows are
 * two orthogonal axes — solid/dotted line, and five tips — exactly like the
 * model's (`SequenceLineStyle`). A `Record<line, Record<head, string>>` will
 * not compile with a hole in it, so "all ten" is a type error rather than a
 * thing to remember. `MERMAID_SEQUENCE_ARROW_MATCH_ORDER` is derived from it
 * for the tokenizer, and `MERMAID_SEQUENCE_ARROW_LIST` for the prose that
 * quotes the vocabulary.
 *
 * Imported by `scripts/mermaid-check.mjs` and `scripts/sequence-check.mjs`
 * through Node's type stripping: keep the syntax erasable (no enums) and
 * type-only imports as `import type`.
 */

import type {
  SequenceArrow,
  SequenceHeadStyle,
  SequenceLineStyle,
} from "@/types";

import { SEQUENCE_ARROWS_GRID } from "@/types";

/**
 * line style → head style → the Mermaid arrow that spells it, verbatim from
 * https://mermaid.js.org/syntax/sequenceDiagram.html#supported-arrow-types.
 *
 * Mermaid's own spelling logic is the mirror of the `.alab` grammar's: the
 * shaft says the line (`-` solid, `--` dotted) and the tip says the head
 * (`>` a line with no head, `>>` an arrowhead, `x` a cross, `)` an open
 * async head), with the two bidirectional forms wrapping the shaft in `<<`
 * and `>>`.
 */
export const MERMAID_SEQUENCE_ARROWS: Readonly<
  Record<SequenceLineStyle, Readonly<Record<SequenceHeadStyle, string>>>
> = {
  solid: {
    none: "->",
    arrow: "->>",
    cross: "-x",
    open: "-)",
    bidirectional: "<<->>",
  },
  dotted: {
    none: "-->",
    arrow: "-->>",
    cross: "--x",
    open: "--)",
    bidirectional: "<<-->>",
  },
};

/** The Mermaid arrow for one `{ lineStyle, headStyle }` pair — so no caller
 * indexes the nested table by hand. */
export function mermaidSequenceArrow(arrow: SequenceArrow): string {
  return MERMAID_SEQUENCE_ARROWS[arrow.lineStyle][arrow.headStyle];
}

/**
 * Every Mermaid arrow with the model arrow it means, LONGEST FIRST — the only
 * ordering that keeps `-->>` from being read as `-->` followed by a `>`, or
 * `->` from shadowing `->>`. Derived by length from the table rather than
 * hand-ordered: a hand-ordered list is one a new arrow gets appended to in
 * the wrong place, and the failure is silent (a `->>` read as `->` imports as
 * a headless line, which draws).
 */
export const MERMAID_SEQUENCE_ARROW_MATCH_ORDER: readonly (readonly [
  string,
  SequenceArrow,
])[] = SEQUENCE_ARROWS_GRID.map((arrow): readonly [string, SequenceArrow] => [
  mermaidSequenceArrow(arrow),
  arrow,
]).sort((a, b) => b[0].length - a[0].length);

/**
 * The vocabulary as prose, for the caveats and the MCP tool descriptions —
 * interpolated rather than retyped, because an agent-facing list that names
 * nine of the ten arrows is a contract that lies.
 */
export const MERMAID_SEQUENCE_ARROW_LIST: string = SEQUENCE_ARROWS_GRID.map(
  (arrow) => mermaidSequenceArrow(arrow),
).join(" ");

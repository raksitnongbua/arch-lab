/**
 * Keyword tables of the `.alab` FLOWCHART grammar — the third document type
 * of the arch-lab text format, next to the C4 grammar in `../keywords.ts`
 * and the sequence grammar in `../sequence/keywords.ts`. One table per
 * mapping, used by both directions, so parser and serializer can never
 * disagree.
 *
 * It lives inside `src/features/archtext/` for the reason the sequence
 * grammar does (see the essay in `../sequence/keywords.ts`): all three
 * document types are the SAME text format — same `archlab` header, same
 * header keywords, same `!` escape, same `LineCursor`, same
 * `ArchTextParseError`, same `[technology]` and `#tag` micro-grammars —
 * and owning the family in one feature keeps every shared rule imported,
 * never copied.
 *
 * DOCUMENT-TYPE DETECTION (first meaningful line — see `../sequence/detect.ts`):
 *
 *   archlab 1.0            → a C4 document
 *   archlab 1.0 sequence   → a sequence document
 *   archlab 1.0 flowchart  → a flowchart document
 *
 * This parser demands the `flowchart` word, the sequence parser demands
 * `sequence`, and the C4 parser calls `expectEnd` after the version — so the
 * three grammars are mutually exclusive from line 1.
 *
 * THE EDGE ARROW. One token, `->`, the same forward arrow the C4 grammar and
 * the sequence grammar both already spell — someone who has written either
 * can write a flowchart edge without a second lookup. The labelled form
 * appends the sequence message's own label tail:
 *
 *   ok -> save            (an unlabelled arrow)
 *   ok -> done : "no"     (a branch — the label is the guard)
 *
 * The label is OPTIONAL here where a sequence message requires it, because
 * the two lines mean different things: a message IS its words (an unlabelled
 * arrow between lifelines says nothing), while most flow arrows carry no
 * words at all and only a decision's branches need a guard. No second arrow
 * token exists (`~>`, `..>` stay sequence-only): a flowchart draws one kind
 * of line, and the semantic weight lives on the SHAPES it connects. That is
 * also what keeps the grammars collision-free — every sequence arrow but
 * `->` is unspellable here, and a `->` line parses identically in spirit in
 * both (from, arrow, to, optional/required `: "label"`).
 *
 * WHY `group`, NOT `@group`. The `@` sigil marks the top-level block openers
 * (`@context`, `@sequence`, `@flowchart`) at indent 0; a group lives INSIDE
 * the diagram body, exactly where the sequence grammar puts `box`, so it
 * takes the same spelling: a bare keyword whose members are the node lines
 * nested one level in. Nesting is the membership — a non-contiguous group is
 * unspellable, not merely rejected.
 *
 * Imported by `scripts/flowchart-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import type { FlowchartNodeShape } from "@/types";

/** The word after the version that marks a flowchart document. */
export const FLOWCHART_HEADER_WORD = "flowchart";

/** The single body block opener (`@flowchart`, no id: one diagram per file). */
export const FLOWCHART_BLOCK = "@flowchart";

/**
 * Every word a flowchart header line may open with, in the order
 * `parseHeaderLine`'s switch reads them.
 *
 * EQUAL TO `SEQUENCE_HEADER_KEYWORDS` TODAY AND DELIBERATELY NOT IMPORTED
 * FROM IT — the same argument the header grammar in `./parse.ts` already
 * makes about mirroring the sequence header line for line rather than sharing
 * its private functions. The equality is a coincidence of two document types
 * currently needing the same metadata, not a rule; importing would make a
 * flowchart-only header line a change to the sequence grammar. What IS shared
 * is the shape of the offer (`retypeChoices`) and the joining of the sentence,
 * neither of which cares what is in the set.
 */
export const FLOWCHART_HEADER_KEYWORDS: readonly string[] = [
  "archlab",
  "schema",
  "title",
  "description",
  "owner",
  "tags",
  "created",
  "updated",
  "reviewed",
];

/** The one edge token (see the essay above for why there is exactly one). */
export const FLOWCHART_ARROW = "->";

/**
 * Node keyword → shape (the keywords ARE the shapes — kept as a table anyway
 * so the parser has one membership test, mirroring the sequence grammar's
 * `FRAGMENT_KIND_BY_KEYWORD`). The keyword opens the line: `step validate
 * "Validate cart"`, keyword-first unlike a participant's `id:kind`, because
 * here the shape is required and reads as the line's verb.
 */
export const NODE_SHAPE_BY_KEYWORD: Readonly<
  Record<string, FlowchartNodeShape>
> = {
  start: "start",
  end: "end",
  step: "step",
  decision: "decision",
  io: "io",
  call: "call",
};

/** The block that clusters a contiguous run of nodes under one label
 * (`FlowchartGroup`). Its members are the node lines nested inside it —
 * nesting is what makes a non-contiguous group unspellable. */
export const GROUP_KEYWORD = "group";

/**
 * Words that open a construct at the start of a body line, and so may not be
 * used as a BARE node id — a node literally named `step` must be quoted on
 * an edge line (`"step" -> done`). Same contract as the sequence grammar's
 * `RESERVED_BODY_WORDS`: one set feeding both sides, the parser's dispatch
 * and the serializer's quoting decision, which is what keeps the round trip
 * unambiguous.
 */
export const RESERVED_FLOWCHART_WORDS: ReadonlySet<string> = new Set([
  "desc",
  "null",
  GROUP_KEYWORD,
  ...Object.keys(NODE_SHAPE_BY_KEYWORD),
]);

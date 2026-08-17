/**
 * Keyword tables of the `.alab` USE-CASE grammar — the fourth document type
 * of the arch-lab text format, next to the C4 grammar in `../keywords.ts`,
 * the sequence grammar in `../sequence/keywords.ts` and the flowchart
 * grammar in `../flowchart/keywords.ts`. One table per mapping, used by both
 * directions, so parser and serializer can never disagree.
 *
 * It lives inside `src/features/archtext/` for the reason the sequence
 * grammar does (see the essay in `../sequence/keywords.ts`): all four
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
 *   archlab 1.0 usecase    → a use-case document
 *
 * This parser demands the `usecase` word, the sequence and flowchart parsers
 * each demand theirs, and the C4 parser calls `expectEnd` after the version —
 * so the four grammars are mutually exclusive from line 1.
 *
 * THE THREE EDGE TOKENS, and why there are three where the flowchart has
 * one: UML draws three genuinely different lines in a use-case diagram, and
 * collapsing them would lose the meaning the diagram exists to carry.
 *
 *   customer -- search            (association — UNDIRECTED, no arrowhead;
 *   customer -- search : "1..*"    the optional tail is a multiplicity/role)
 *   order ..> pay : include       (dependency — dashed, directed, and the
 *   refund ..> pay : extend        stereotype tail is REQUIRED: the two bare
 *                                  words are a closed vocabulary)
 *   admin --|> customer           (generalization — hollow triangle, between
 *                                  two actors or two use cases, no tail)
 *
 * COLLISION CHECK against the other three grammars' tokens, done from line 1
 * of this file's history so nobody has to redo it:
 *
 *   - `--`  is also the C4 grammar's undirected edge — DELIBERATE reuse:
 *     both spell "a plain line with no arrowhead". It is unspellable in the
 *     sequence grammar (`->`, `~>`, `..>`) and the flowchart grammar (`->`).
 *   - `..>` is the C4 grammar's dashed forward arrow and the sequence
 *     grammar's reply — in all three it draws a DASHED directed line, so
 *     the reuse is semantic, not accidental.
 *   - `--|>` exists in no other grammar.
 *
 * No cross-grammar collision can mis-route a document, because the header
 * word decides the parser before any edge line is read. WITHIN this grammar,
 * `--` is a prefix of `--|>`, so — unlike the sequence table, which is
 * prefix-free — this table is ordered LONGEST-FIRST and the tokenizer must
 * try it in order, exactly like the C4 `ARROWS` table (`<..>` before `..>`).
 *
 * WHY `boundary`, NOT `@boundary`. The `@` sigil marks the top-level block
 * openers (`@context`, `@sequence`, `@flowchart`, `@usecase`) at indent 0; a
 * boundary lives INSIDE the diagram body, exactly where the flowchart puts
 * `group` and the sequence grammar puts `box`, so it takes the same
 * spelling: a bare keyword whose members are the use-case lines nested one
 * level in. Nesting is the membership — a non-contiguous boundary is
 * unspellable, not merely rejected.
 *
 * Imported by `scripts/usecase-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import type {
  UseCaseDependencyStereotype,
  UseCaseEdgeKind,
  UseCaseElementKind,
} from "@/types";

/** The word after the version that marks a use-case document. */
export const USECASE_HEADER_WORD = "usecase";

/** The single body block opener (`@usecase`, no id: one diagram per file). */
export const USECASE_BLOCK = "@usecase";

/**
 * Edge token ⇄ edge kind (bijective). ORDERED LONGEST-FIRST and matched in
 * order, because `--` is a prefix of `--|>` (see the essay above) — a
 * shortest-first tokenizer would read every generalization as an association
 * pointing at an element named `|>`.
 */
export const USECASE_EDGE_TOKENS: readonly (readonly [
  string,
  UseCaseEdgeKind,
])[] = [
  ["--|>", "generalization"],
  ["..>", "dependency"],
  ["--", "association"],
];

/** Edge kind → canonical token (inverse of `USECASE_EDGE_TOKENS`). */
export const TOKEN_BY_EDGE_KIND: Readonly<Record<UseCaseEdgeKind, string>> = {
  association: "--",
  dependency: "..>",
  generalization: "--|>",
};

/**
 * Element keyword → kind (the keywords ARE the kinds — kept as a table
 * anyway so the parser has one membership test, mirroring the flowchart
 * grammar's `NODE_SHAPE_BY_KEYWORD`). The keyword opens the line:
 * `actor customer "Customer"`, keyword-first like a flowchart node, because
 * here the kind is required and reads as the line's verb.
 */
export const ELEMENT_KIND_BY_KEYWORD: Readonly<
  Record<string, UseCaseElementKind>
> = {
  actor: "actor",
  usecase: "usecase",
};

/** The block that draws the system boundary around a contiguous run of use
 * cases (`UseCaseBoundary`). Its members are the `usecase` lines nested
 * inside it — nesting is what makes a non-contiguous boundary unspellable. */
export const BOUNDARY_KEYWORD = "boundary";

/**
 * The closed `..>` stereotype vocabulary, verbatim. Bare words, not quoted
 * strings, BECAUSE the vocabulary is closed: a quoted string invites free
 * text, and a dependency whose stereotype is neither «include» nor «extend»
 * is not a use-case dependency at all — the parser names these two and
 * rejects anything else.
 */
export const DEPENDENCY_STEREOTYPES: readonly UseCaseDependencyStereotype[] = [
  "include",
  "extend",
];

/**
 * Words that open a construct at the start of a body line, and so may not be
 * used as a BARE element id — an element literally named `actor` must be
 * quoted on an edge line (`"actor" -- search`). Same contract as the
 * flowchart grammar's `RESERVED_FLOWCHART_WORDS`: one set feeding both
 * sides, the parser's dispatch and the serializer's quoting decision, which
 * is what keeps the round trip unambiguous. `include` / `extend` are NOT
 * reserved: they only ever appear after a `:` on a dependency line, never at
 * the start of one, so they cannot collide with an id.
 */
export const RESERVED_USECASE_WORDS: ReadonlySet<string> = new Set([
  "desc",
  "null",
  BOUNDARY_KEYWORD,
  ...Object.keys(ELEMENT_KIND_BY_KEYWORD),
]);

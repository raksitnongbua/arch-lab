/**
 * Keyword tables of the `.alab` SEQUENCE grammar — the second document type
 * of the arch-lab text format, next to the C4 grammar in `../keywords.ts`.
 * One table per mapping, used by both directions, so parser and serializer
 * can never disagree.
 *
 * WHY THIS LIVES INSIDE `src/features/archtext/` rather than as a sibling
 * feature: both document types are the SAME text format — same `archlab`
 * header, same header keywords, same `!` escape, same `LineCursor`, same
 * `ArchTextParseError`, same `[technology]` and `#tag` micro-grammars. A
 * sibling feature would either duplicate all of that (two sources of truth)
 * or reach into another feature's `lib/` internals (which nothing else in
 * this codebase does). Owning the whole `.alab` grammar family in one
 * feature keeps every shared rule imported, never copied.
 *
 * DOCUMENT-TYPE DETECTION (first meaningful line — `check.ts` and
 * `detect.ts` both sniff only the head of the text):
 *
 *   archlab 1.0            → a C4 document
 *   archlab 1.0 sequence   → a sequence document
 *   archlab 1.0 flowchart  → a flowchart document (`../flowchart/`)
 *
 * The C4 parser calls `expectEnd` after the version, so it REJECTS any
 * trailing word rather than silently reading another kind as C4; this
 * parser and the flowchart parser each demand their own word, so the three
 * grammars are mutually exclusive from line 1. See `./detect.ts` for the
 * sniffing helper.
 *
 * Imported by `scripts/sequence-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import type {
  SequenceArrow,
  SequenceFragmentKind,
  SequenceHeadStyle,
  SequenceLineStyle,
  SequenceNotePlacement,
  SequenceParticipantKind,
} from "@/types";

import { SEQUENCE_ARROWS_GRID, sequenceArrowPhrase } from "@/types";

/** The word after the version that marks a sequence document. */
export const SEQUENCE_HEADER_WORD = "sequence";

/** The single body block opener (`@sequence`, no id: one diagram per file). */
export const SEQUENCE_BLOCK = "@sequence";

/**
 * Every word a sequence header line may open with — the C4 subset that means
 * the same thing here, in the order `parseHeaderLine`'s switch reads them.
 *
 * Its own array rather than a slice of `C4_HEADER_KEYWORDS`, and the reason is
 * the same one that keeps this whole module separate: the C4 header's
 * `tagcolor` / `customicon` / `generator` / `root` lines DO NOT EXIST here —
 * those fields ride the `! meta.<key>` escape (`SEQ_META_RAW` in
 * `./schema.ts`). Deriving this from the C4 list would mean an exclusion list
 * that has to be edited every time a C4-only header line is added, which is
 * the same drift with an extra step in it.
 *
 * Read twice: the refusal joins it into the sentence that names the set, and
 * `closestMatches` ranks a misspelling against it. `check:quickfix` pins it to
 * the switch's own `case "…":` labels.
 */
export const SEQUENCE_HEADER_KEYWORDS: readonly string[] = [
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

/**
 * THE ARROW GRID: line style → head style → the one token that spells it.
 * A total `Record<Record<>>` rather than a flat list of ten pairs, so the
 * table cannot be written with a hole in it — see `SequenceLineStyle` for why
 * the model is two axes instead of ten names.
 *
 * HOW A TOKEN IS SPELLED. Every token ends in the glyph that says what the
 * tip is, and what comes before it says what the LINE is:
 *
 *   - The line: `..` is dotted, exactly as it is in the C4 grammar's `..>`
 *     and in this grammar's own `..>` reply. Solid writes `-` in the plain
 *     `->`, and writes nothing before a head glyph — `-~>` and `-x>` read as
 *     two operators fighting, and `~>` has spelled solid+open since 1.0 and
 *     must keep doing so byte for byte.
 *   - The tip: bare `>` is an arrowhead, `x>` is a cross (the spelling both
 *     Mermaid and PlantUML use for a lost message), `~>` is an open head
 *     (the tilde reads as "fire and forget").
 *   - THE TWO EXTREMES ARE BORROWED VERBATIM FROM THE C4 GRAMMAR rather than
 *     invented here: `--`/`..` for a line with no head and `<->`/`<..>` for
 *     one with a head at each end are the same four tokens `ARROWS` in
 *     `../keywords.ts` has spelled that way since 1.0. An author who knows
 *     one grammar already knows these, and a second spelling for one drawing
 *     would be the "two halves that disagree" failure in the vocabulary
 *     itself.
 *
 * ORDERING NOW MATTERS, and it did not before. With three tokens no token
 * was a prefix of another; `..` is a prefix of `..>`, `..x>` and `..~>`, so
 * the parser must try candidates LONGEST FIRST or `a .. b` and `a ..> b`
 * become the same statement. `SEQUENCE_ARROW_MATCH_ORDER` is that ordering,
 * derived from this table by length rather than hand-listed — a hand-listed
 * order is one that a new token gets appended to in the wrong place.
 */
export const SEQUENCE_ARROW_TOKENS: Readonly<
  Record<SequenceLineStyle, Readonly<Record<SequenceHeadStyle, string>>>
> = {
  solid: {
    none: "--",
    arrow: "->",
    cross: "x>",
    open: "~>",
    bidirectional: "<->",
  },
  dotted: {
    none: "..",
    arrow: "..>",
    cross: "..x>",
    open: "..~>",
    bidirectional: "<..>",
  },
};

/** The one token that spells `arrow` — the inverse direction of the grid,
 * as a function so no caller indexes the nested table by hand. */
export function sequenceArrowToken(arrow: SequenceArrow): string {
  return SEQUENCE_ARROW_TOKENS[arrow.lineStyle][arrow.headStyle];
}

/**
 * Every token with the arrow it means, LONGEST FIRST — the order the parser
 * must try them in. Derived from `SEQUENCE_ARROW_TOKENS` and from the grid
 * product, so a token added to the table joins this list in the right place
 * without anybody editing a second list.
 */
export const SEQUENCE_ARROW_MATCH_ORDER: readonly (readonly [
  string,
  SequenceArrow,
])[] = SEQUENCE_ARROWS_GRID.map((arrow): readonly [string, SequenceArrow] => [
  sequenceArrowToken(arrow),
  arrow,
]).sort((a, b) => b[0].length - a[0].length);

/**
 * The token menu quoted by the parser's "expected an arrow" error, in grid
 * order so the reader sees the two axes rather than an alphabet soup. Built
 * from the table for the reason every agent- and user-facing string in this
 * repo is: a menu that lists nine of ten tokens is worse than no menu.
 */
export const SEQUENCE_ARROW_MENU: string = SEQUENCE_ARROWS_GRID.map(
  (arrow) => `${sequenceArrowToken(arrow)} ${sequenceArrowPhrase(arrow)}`,
).join(", ");

/** `id:keyword` participant kinds — same `id:type` shape as C4 node lines.
 * A participant line WITHOUT `:kind` means kind unstated (absent in the
 * model), so all three states round-trip. */
export const PARTICIPANT_KIND_BY_KEYWORD: Readonly<
  Record<string, SequenceParticipantKind>
> = {
  participant: "participant",
  actor: "actor",
};

/** Fragment opener keyword → kind (the keywords ARE the kinds — kept as a
 * table anyway so the parser has one membership test, not a string union
 * check duplicated per call site). */
export const FRAGMENT_KIND_BY_KEYWORD: Readonly<
  Record<string, SequenceFragmentKind>
> = {
  loop: "loop",
  opt: "opt",
  alt: "alt",
  par: "par",
  critical: "critical",
  break: "break",
  rect: "rect",
};

/** Branch-separator keyword → the fragment kind it may extend. */
export const BRANCH_KEYWORDS: Readonly<Record<string, SequenceFragmentKind>> = {
  else: "alt",
  and: "par",
  option: "critical",
};

/** Fragment kind → the keyword that opens its SECOND and later branches.
 * Derived from `BRANCH_KEYWORDS` rather than written twice, so a new
 * multi-branch kind cannot be given a separator here and forgotten there. */
export const BRANCH_KEYWORD_BY_KIND: Readonly<
  Partial<Record<SequenceFragmentKind, string>>
> = Object.fromEntries(
  Object.entries(BRANCH_KEYWORDS).map(([keyword, kind]) => [kind, keyword]),
);

/**
 * The one trailing attribute a `rect` or a `box` line may carry, spelled
 * `key=value` like the C4 grammar's `owner=` and `in=`. A separate word
 * rather than a second quoted string, because a `rect "…"` already means a
 * LABEL and a colour that looked like one would be the kind of ambiguity
 * this grammar exists to avoid.
 */
export const TINT_ATTRIBUTE = "tint";

/** The block that groups a contiguous run of lifelines under one bracket
 * (`SequenceBox`). Its members are the participant lines nested inside it —
 * nesting is what makes a non-contiguous box unspellable. */
export const BOX_KEYWORD = "box";

/** `note <placement> …` placements, verbatim. */
export const NOTE_PLACEMENTS: readonly SequenceNotePlacement[] = [
  "left",
  "right",
  "over",
];

/**
 * Words that open a construct at the start of a body line, and so may not be
 * used as a BARE participant id — a participant literally named `loop` must
 * be quoted (`"loop":participant "Loop"`). One set feeding both sides:
 * the parser tries these words before falling through to a participant or
 * message id, and the serializer quotes any id in this set, which is what
 * keeps the round trip unambiguous.
 */
export const RESERVED_BODY_WORDS: ReadonlySet<string> = new Set([
  "note",
  "autonumber",
  "desc",
  "null",
  BOX_KEYWORD,
  ...Object.keys(FRAGMENT_KIND_BY_KEYWORD),
  ...Object.keys(BRANCH_KEYWORDS),
]);

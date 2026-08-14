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
 *
 * The C4 parser calls `expectEnd` after the version, so it REJECTS the
 * `sequence` word rather than silently reading a sequence file as C4; this
 * parser demands the word, so the two grammars are mutually exclusive from
 * line 1. See `./detect.ts` for the sniffing helper.
 *
 * Imported by `scripts/sequence-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import type {
  SequenceFragmentKind,
  SequenceMessageKind,
  SequenceNotePlacement,
  SequenceParticipantKind,
} from "@/types";

/** The word after the version that marks a sequence document. */
export const SEQUENCE_HEADER_WORD = "sequence";

/** The single body block opener (`@sequence`, no id: one diagram per file). */
export const SEQUENCE_BLOCK = "@sequence";

/**
 * Arrow token ⇄ message kind (bijective). Chosen so that no token is a
 * prefix of another — unlike the C4 `ARROWS` table this one needs no
 * longest-first ordering, which removes a whole class of tokenizer bugs:
 *
 *   ->   sync   (solid, filled head — matches the C4 grammar's forward arrow)
 *   ~>   async  (the tilde reads as "fire and forget"; `-)` was rejected as
 *                unbalanced-paren noise and `->>` as a prefix trap on `->`)
 *   ..>  reply  (dashed return, same dash spelling the C4 grammar uses)
 *
 * An arrow may carry activation suffixes (see the parser): `+` starts a bar
 * on the target, `-` ends the bar on the source; canonical order is `+-`.
 */
export const SEQUENCE_ARROWS: readonly (readonly [
  string,
  SequenceMessageKind,
])[] = [
  ["->", "sync"],
  ["~>", "async"],
  ["..>", "reply"],
];

/** Message kind → canonical arrow token (inverse of `SEQUENCE_ARROWS`). */
export const ARROW_BY_MESSAGE_KIND: Readonly<
  Record<SequenceMessageKind, string>
> = {
  sync: "->",
  async: "~>",
  reply: "..>",
};

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

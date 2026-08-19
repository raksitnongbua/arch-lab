/**
 * Keyword tables of the `.alab` ENTITY-RELATIONSHIP grammar — the fifth
 * document type of the arch-lab text format, next to the C4 grammar in
 * `../keywords.ts`, the sequence grammar in `../sequence/keywords.ts`, the
 * flowchart grammar in `../flowchart/keywords.ts` and the use-case grammar
 * in `../usecase/keywords.ts`. One table per mapping, used by both
 * directions, so parser and serializer can never disagree.
 *
 * It lives inside `src/features/archtext/` for the reason the sequence
 * grammar does (see the essay in `../sequence/keywords.ts`): all five
 * document types are the SAME text format — same `archlab` header, same
 * header keywords, same `!` escape, same `LineCursor`, same
 * `ArchTextParseError`, same `[technology]` and `#tag` micro-grammars — and
 * owning the family in one feature keeps every shared rule imported, never
 * copied.
 *
 * DOCUMENT-TYPE DETECTION (first meaningful line — see `../sequence/detect.ts`):
 *
 *   archlab 1.0            → a C4 document
 *   archlab 1.0 sequence   → a sequence document
 *   archlab 1.0 flowchart  → a flowchart document
 *   archlab 1.0 usecase    → a use-case document
 *   archlab 1.0 er         → an ER document
 *
 * This parser demands the `er` word, the other three non-C4 parsers each
 * demand theirs, and the C4 parser calls `expectEnd` after the version — so
 * the five grammars are mutually exclusive from line 1.
 *
 * THE RELATIONSHIP TOKEN, and why it is assembled rather than tabled. Every
 * other grammar here has a small closed list of edge tokens. This one has
 * THIRTY-TWO: four cardinalities on the left, four on the right, two
 * connectors. Writing them out would be a table nobody could check, so the
 * token is built from three parts and matched by one anchored regex:
 *
 *   customer ||--o{ order : places      (one customer, zero or more orders,
 *                                        identifying — a solid line)
 *   order }o..|| customer : "belongs to" (zero or more orders, exactly one
 *                                        customer, non-identifying — dashed)
 *
 *   left  ∈ { ||  |o  }|  }o }          crow's foot opens AWAY from the line
 *   conn  ∈ { --  .. }                  solid = identifying, dashed = not
 *   right ∈ { ||  o|  |{  o{ }          mirrored: the foot faces the entity
 *
 * THE MIRROR IS THE WHOLE POINT and is why `ErCardinality` is stored by name
 * rather than as the token: "zero or more" is `}o` on the left and `o{` on
 * the right. Two tables below, `LEFT_CARDINALITY` and `RIGHT_CARDINALITY`,
 * map each side's glyphs onto the same four names, and `TOKEN_BY_CARDINALITY`
 * inverts them per side for the serializer. A single table would have forced
 * the serializer to reverse the string, which silently produces `{o` — a
 * token that parses as nothing and draws as nothing.
 *
 * COLLISION CHECK against the other four grammars' tokens, done once so
 * nobody has to redo it:
 *
 *   - `--` is the C4 grammar's undirected edge and the use-case grammar's
 *     association. Here it NEVER appears bare: it is always flanked by two
 *     cardinality glyphs, so the assembled token `||--o{` cannot be produced
 *     by either of those grammars.
 *   - `..` is a prefix of the C4 and use-case `..>` and the sequence reply,
 *     but the ER connector is never followed by `>` — a trailing `>` fails
 *     the anchored token regex rather than matching a shorter form.
 *   - The cardinality glyphs `|o`, `}|`, `}o`, `o|`, `|{`, `o{` exist in no
 *     other grammar.
 *
 * No cross-grammar collision can mis-route a document anyway, because the
 * header word decides the parser before any relationship line is read. The
 * check above is about a reader's eye, not the tokenizer's.
 *
 * WHY ATTRIBUTES ARE NESTED, not `entity.attr` dotted lines. Nesting is the
 * membership, exactly as the use-case grammar nests use cases inside
 * `boundary` and the flowchart nests nodes inside `group`. An attribute that
 * belongs to no entity is unspellable rather than merely rejected, and the
 * text's visual shape is the box the renderer draws.
 *
 * Imported by `scripts/er-check.mjs` through Node's type stripping: keep the
 * syntax erasable and type-only imports as `import type`.
 */

import type {
  ErAttributeKey,
  ErCardinality,
  ErRelationshipKind,
} from "@/types";

/** The word after the version that marks an ER document. */
export const ER_HEADER_WORD = "er";

/** The single body block opener (`@er`, no id: one diagram per file). */
export const ER_BLOCK = "@er";

/** Opens an entity, whose attributes are the lines nested one level in. */
export const ENTITY_KEYWORD = "entity";

/** Opens one attribute line inside an entity block. Keyword-first like every
 * other line in this family (`actor customer`, `entity order`), so the
 * parser's dispatch is a single first-word test rather than a shape guess. */
export const ATTRIBUTE_KEYWORD = "attr";

/* -------------------------------------------------------------------------- */
/* Cardinality                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Left-hand glyph → cardinality. The crow's foot (`}`) opens away from the
 * connector, so a "many" end is `}` and a "one" end is `|`; the inner
 * character is the optionality (`o` = zero allowed, `|` = at least one).
 */
export const LEFT_CARDINALITY: Readonly<Record<string, ErCardinality>> = {
  "||": "one",
  "|o": "zero-or-one",
  "}|": "one-or-more",
  "}o": "zero-or-more",
};

/** Right-hand glyph → cardinality. The mirror of `LEFT_CARDINALITY`: the
 * same four names, with the foot and the optionality marker swapped so both
 * feet face outward from the line. */
export const RIGHT_CARDINALITY: Readonly<Record<string, ErCardinality>> = {
  "||": "one",
  "o|": "zero-or-one",
  "|{": "one-or-more",
  "o{": "zero-or-more",
};

/**
 * Cardinality → canonical glyph, per side (the inverse of the two tables
 * above). PER SIDE, because the two are not each other's reverse: reversing
 * `o{` gives `{o`, which parses as nothing. The serializer indexes this by
 * the end it is writing.
 */
export const TOKEN_BY_CARDINALITY: Readonly<
  Record<"from" | "to", Readonly<Record<ErCardinality, string>>>
> = {
  from: {
    one: "||",
    "zero-or-one": "|o",
    "one-or-more": "}|",
    "zero-or-more": "}o",
  },
  to: {
    one: "||",
    "zero-or-one": "o|",
    "one-or-more": "|{",
    "zero-or-more": "o{",
  },
};

/** Connector token ⇄ relationship kind (bijective). Solid draws identifying,
 * dashed draws non-identifying — the standard ER reading, and the reason the
 * distinction is kept rather than collapsed to one token. */
export const CONNECTOR_BY_KIND: Readonly<Record<ErRelationshipKind, string>> = {
  identifying: "--",
  "non-identifying": "..",
};

/** Inverse of `CONNECTOR_BY_KIND`. */
export const KIND_BY_CONNECTOR: Readonly<Record<string, ErRelationshipKind>> = {
  "--": "identifying",
  "..": "non-identifying",
};

/**
 * The whole relationship token. Built from the three tables above rather
 * than spelled out, so a cardinality added in one place cannot be forgotten
 * here — the regex is derived, and `scripts/er-check.mjs` asserts it accepts
 * exactly the 4 x 2 x 4 combinations the tables describe and nothing else.
 *
 * ANCHORED AT THE START ONLY, not at both ends, because the parser matches it
 * against the rest of the line: `customer ||--o{order` (no space before the
 * target id) must read the token and leave `order`, not fail. A both-ends
 * anchor would have forced the parser to first guess where the token stopped,
 * and the only available guess — a run of token characters — swallows the `o`
 * of `order`, because `o` is a cardinality glyph and the first letter of a
 * very ordinary entity id.
 */
const alternation = (glyphs: readonly string[]): string =>
  glyphs
    .slice()
    /* Longest-first so a two-character glyph is never shadowed by a
       one-character prefix of it. Every glyph here is two characters today,
       which makes this a no-op — it is written anyway because the ordering
       bug it prevents is invisible until the day a one-character cardinality
       is added, and by then the token regex is load-bearing for every ER
       file on disk. */
    .sort((a, b) => b.length - a.length)
    .map((glyph) => glyph.replace(/[.|{}()[\]\\^$*+?]/g, "\\$&"))
    .join("|");

export const RELATIONSHIP_TOKEN_RE = new RegExp(
  `^(${alternation(Object.keys(LEFT_CARDINALITY))})` +
    `(${alternation(Object.values(CONNECTOR_BY_KIND))})` +
    `(${alternation(Object.keys(RIGHT_CARDINALITY))})`,
);

/* -------------------------------------------------------------------------- */
/* Attribute keys                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The closed key vocabulary, verbatim and lowercase. Bare words, not quoted
 * strings, BECAUSE the vocabulary is closed — the same call the use-case
 * grammar makes for `include` / `extend`. A quoted string invites free text,
 * and a key role that is none of these three has no glyph to draw.
 */
export const ATTRIBUTE_KEYS: readonly ErAttributeKey[] = ["pk", "fk", "uk"];

/* -------------------------------------------------------------------------- */
/* Token classes                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A column type that may be written without quotes.
 *
 * ER-SPECIFIC, where every other bare value in this format uses
 * `BARE_VALUE_RE` from `../text.ts`: SQL type names carry parentheses,
 * commas and brackets — `numeric(10,2)`, `varchar(255)`, `int[]` — and
 * `BARE_VALUE_RE` rejects all three. Reusing it would have made the parser
 * accept `numeric(10,2)` bare while the serializer wrote it back quoted,
 * which is a round-trip break: open a file, change nothing, save, and the
 * bytes differ.
 *
 * BOTH SIDES READ THIS ONE CONSTANT — the parser to decide what it may read
 * unquoted, the serializer to decide what it may write unquoted — which is
 * the single-source-of-truth rule `../text.ts` states for the shared
 * classes. `scripts/er-check.mjs` pins the symmetry.
 *
 * A space is still the one character that forces quotes, because the space
 * is what separates the type from the key roles after it.
 */
export const BARE_TYPE_RE = /^[A-Za-z0-9_()[\],.+-]+$/;

/** `BARE_TYPE_RE` without its end anchor, for the parser — which matches
 * against the rest of the line and needs the token's extent, not a verdict
 * on the whole remainder. Derived, so the two can never describe different
 * character sets. */
export const BARE_TYPE_PREFIX_RE = new RegExp(
  BARE_TYPE_RE.source.replace(/\$$/, ""),
);

/**
 * Words that open a construct at the start of a body line, and so may not be
 * used as a BARE entity id — an entity literally named `entity` must be
 * quoted on a relationship line (`"entity" ||--o{ order`). Same contract as
 * the flowchart grammar's `RESERVED_FLOWCHART_WORDS` and the use-case
 * grammar's `RESERVED_USECASE_WORDS`: one set feeding both the parser's
 * dispatch and the serializer's quoting decision, which is what keeps the
 * round trip unambiguous.
 *
 * `pk` / `fk` / `uk` are NOT reserved: they only ever appear after a name
 * and a type on an `attr` line, never at the start of one, so they cannot
 * collide with an id.
 */
export const RESERVED_ER_WORDS: ReadonlySet<string> = new Set([
  "desc",
  "null",
  ENTITY_KEYWORD,
  ATTRIBUTE_KEYWORD,
]);

/**
 * Keyword tables of the `.alab` DATA DICTIONARY grammar — the sixth document
 * type, beside the C4, sequence, flowchart, use-case and ER grammars. One
 * table per mapping, used by both directions, so parser and serializer cannot
 * disagree.
 *
 * DOCUMENT-TYPE DETECTION (first meaningful line, `../sequence/detect.ts`):
 * `archlab 1.0 dict`. The six grammars are mutually exclusive from line 1.
 *
 * THERE ARE NO EDGE TOKENS, which makes this the simplest grammar in the
 * family and is the whole shape of the document type: a dictionary connects
 * nothing. Everything is a `section` holding `field` lines, so the only
 * ambiguity to resolve is which keyword opens a line — and each is a distinct
 * word, so there is no longest-first ordering problem of the kind the ER and
 * use-case tables carry.
 *
 * Imported by `scripts/dict-check.mjs` through Node's type stripping: keep the
 * syntax erasable and type-only imports as `import type`.
 */

import type { DictFieldFlag } from "@/types";

/** The word after the version that marks a dictionary document. */
export const DICT_HEADER_WORD = "dict";

/** The single body block opener (`@dict`, no id: one dictionary per file). */
export const DICT_BLOCK = "@dict";

/** Opens a section, whose fields are the lines nested one level in. */
export const SECTION_KEYWORD = "section";

/** Opens one field line inside a section. */
export const FIELD_KEYWORD = "field";

/**
 * The closed flag vocabulary, verbatim and lowercase. Bare words because the
 * vocabulary is closed — the call `ATTRIBUTE_KEYS` makes in the ER grammar,
 * and for the same reason: a flag outside this set has no badge to draw.
 */
export const FIELD_FLAGS: readonly DictFieldFlag[] = [
  "required",
  "unique",
  "derived",
  "pii",
  "deprecated",
];

/**
 * The quoted-string continuation keywords a `field` accepts, each mapping to
 * its model key. ONE TABLE rather than a switch, so the parser's dispatch, the
 * serializer's emission order and the reserved-word set below are all derived
 * from the same list — adding a fifth cannot be half-done.
 *
 * `desc` is NOT here: it is the family-wide description keyword, shared by
 * every other document type, and giving it a per-grammar entry would suggest
 * this grammar owns a spelling it does not.
 */
export const FIELD_DETAIL_KEYS: Readonly<Record<string, string>> = {
  source: "source",
  values: "values",
  example: "example",
};

/**
 * Words that open a construct at the start of a body line, and so may not be a
 * BARE field name — a field literally called `field` must be quoted. Same
 * contract as `RESERVED_ER_WORDS`: one set feeding the parser's dispatch and
 * the serializer's quoting decision.
 *
 * The flags are NOT reserved: they only ever appear after a name and a type on
 * a `field` line, never at the start of one.
 */
export const RESERVED_DICT_WORDS: ReadonlySet<string> = new Set([
  "desc",
  "null",
  SECTION_KEYWORD,
  FIELD_KEYWORD,
  ...Object.keys(FIELD_DETAIL_KEYS),
]);

/**
 * A field type that may be written without quotes — the ER grammar's
 * `BARE_TYPE_RE`, restated here rather than imported because the two are
 * independent decisions about two grammars that merely agree today: an ER type
 * is a SQL type, a dictionary type may be `Money` or `ISO8601` or a language's
 * type name. Both sides of THIS grammar read this constant, which is the
 * property that matters — what parses bare must serialize bare.
 */
export const BARE_DICT_TYPE_RE = /^[A-Za-z0-9_()[\],.+-]+$/;

/** `BARE_DICT_TYPE_RE` without its end anchor, for the parser. Derived, so the
 * two cannot describe different character sets. */
export const BARE_DICT_TYPE_PREFIX_RE = new RegExp(
  BARE_DICT_TYPE_RE.source.replace(/\$$/, ""),
);

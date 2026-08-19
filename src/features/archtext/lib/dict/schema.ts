/**
 * Schema-declared key knowledge shared by the `.alab` dictionary parser and
 * serializer — the dictionary counterpart of `../er/schema.ts`, with the same
 * three-way split: `*_KEYS` is canonical key order, `*_RAW` is the optional
 * fields a `! <key> : <json>` escape may set, and everything else known has
 * dedicated syntax and is refused on a `!` line.
 *
 * `META_KEYS` is not redeclared: a dictionary reuses `ArchLabMetadata`.
 *
 * Imported by `scripts/dict-check.mjs` through Node's type stripping.
 */

import { SEQ_META_RAW } from "../sequence/schema";

export const DICT_FILE_KEYS = [
  "$schema",
  "version",
  "kind",
  "metadata",
  "sections",
] as const;

/* `fields` last, matching the text: the section line, then its nested rows. */
export const DICT_SECTION_KEYS = [
  "label",
  "technology",
  "tags",
  "description",
  "fields",
] as const;

/* The order a `field` line and its continuations write them: name and type on
   the line, flags after them, then the four prose slots in the order the
   grammar accepts. */
export const DICT_FIELD_KEYS = [
  "name",
  "type",
  "flags",
  "description",
  "source",
  "values",
  "example",
] as const;

/** Imported, not copied, exactly as `ER_META_RAW` is. */
export const DICT_META_RAW: ReadonlySet<string> = SEQ_META_RAW;

/** `label` is required and `fields` is STRUCTURAL — it is the nesting in the
 * text, so a raw `! fields` line would build a table the serializer cannot
 * spell back. */
export const DICT_SECTION_RAW: ReadonlySet<string> = new Set([
  "technology",
  "tags",
  "description",
]);

/** `name` and `type` have dedicated syntax; `flags` is a closed vocabulary and
 * an unexpected value there is a new grammar production, not forward
 * tolerance — the call `ER_ATTRIBUTE_RAW` makes about `keys`. */
export const DICT_FIELD_RAW: ReadonlySet<string> = new Set([
  "description",
  "source",
  "values",
  "example",
]);

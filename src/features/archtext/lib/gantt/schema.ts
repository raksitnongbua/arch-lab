/**
 * Schema-declared key knowledge shared by the `.alab` gantt parser and
 * serializer — the gantt counterpart of `../dict/schema.ts`, with the same
 * three-way split: `*_KEYS` is canonical key order, `*_RAW` is the optional
 * fields a `! <key> : <json>` escape may set, and everything else known has
 * dedicated syntax and is refused on a `!` line.
 *
 * `META_KEYS` is not redeclared: a gantt reuses `ArchLabMetadata`.
 *
 * Imported by `scripts/gantt-check.mjs` through Node's type stripping.
 */

import { SEQ_META_RAW } from "../sequence/schema";

/* `origin` sits between `metadata` and `sections`, matching the text: it is a
   header line, written after the metadata block and before `@gantt`. */
export const GANTT_FILE_KEYS = [
  "$schema",
  "version",
  "kind",
  "metadata",
  "origin",
  "sections",
] as const;

/* `items` last, matching the text: the section line, then its nested rows. */
export const GANTT_SECTION_KEYS = ["label", "items"] as const;

/* The order an item line and its continuation write them: id and label on the
   line, then duration, state, start and dependencies in canonical order, then
   tags, then the one nested prose slot. `milestone` is not in this list — it
   is spelled by WHICH KEYWORD opens the line, not by a value after one, so a
   raw `! milestone` escape would produce a line the serializer cannot write
   back. */
export const GANTT_ITEM_KEYS = [
  "id",
  "label",
  "duration",
  "milestone",
  "state",
  "at",
  "after",
  "tags",
  "description",
] as const;

/** Imported, not copied, exactly as `DICT_META_RAW` is. */
export const GANTT_META_RAW: ReadonlySet<string> = SEQ_META_RAW;

/** `label` is required and `items` is STRUCTURAL — it is the nesting in the
 * text, so a raw `! items` line would build a band the serializer cannot
 * spell back. A section has no other fields, so this set is empty and is
 * declared anyway: an empty set is the statement that nothing here is
 * escapable, where an absent one would read as an oversight. */
export const GANTT_SECTION_RAW: ReadonlySet<string> = new Set<string>();

/**
 * `id`, `label`, `duration`, `at` and `after` all have dedicated syntax.
 *
 * `state` is EXCLUDED for the reason `DICT_FIELD_RAW` excludes `flags` and
 * `ER_ATTRIBUTE_RAW` excludes `keys`: it is a closed vocabulary, and an
 * unexpected value there is a new grammar production — a new colour on the
 * canvas — not forward tolerance from a newer minor.
 *
 * `milestone` is EXCLUDED because it selects the keyword that opens the line.
 * A `! milestone : true` escape on a `task` line would describe a diamond
 * written with the bar keyword, which the serializer cannot spell and the
 * layout would have to guess at.
 */
export const GANTT_ITEM_RAW: ReadonlySet<string> = new Set([
  "tags",
  "description",
]);

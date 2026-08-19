/**
 * Schema-declared key knowledge shared by the `.alab` ER parser and
 * serializer — the ER counterpart of `../schema.ts`, `../sequence/schema.ts`,
 * `../flowchart/schema.ts` and `../usecase/schema.ts`, following the same
 * three-way split:
 *
 *   - `*_KEYS` — canonical key order per object. The parser assembles
 *     objects in exactly this order and the serializer walks objects with it
 *     to split known keys from unknown forward-compatible keys, so the JSON
 *     a round trip produces is key-stable.
 *   - `*_RAW` — known keys that may be set through a raw `! <key> : <json>`
 *     escape line: the OPTIONAL fields a forward-compatible file could carry
 *     with an unexpected shape.
 *   - Everything else known has dedicated syntax and is rejected on a `!`
 *     line, so there is exactly one spelling per field.
 *
 * `META_KEYS` is NOT redeclared here: an ER file reuses `ArchLabMetadata`, so
 * it reuses `../schema.ts`'s `META_KEYS` too — one table for one type.
 *
 * Imported by `scripts/er-check.mjs` through Node's type stripping: keep the
 * syntax erasable and type-only imports as `import type`.
 */

import { SEQ_META_RAW } from "../sequence/schema";

export const ER_FILE_KEYS = [
  "$schema",
  "version",
  "kind",
  "metadata",
  "entities",
  "relationships",
] as const;

/* `technology` sits between `label` and `tags`, and `attributes` last,
   matching the order the text writes them — `entity order "Order"
   [PostgreSQL] #billing` on one line, then the nested `attr` lines below it.
   The key order and the line order are the same order, which is what keeps a
   round trip byte-stable without anyone holding two sequences in their
   head. */
export const ER_ENTITY_KEYS = [
  "id",
  "label",
  "technology",
  "tags",
  "description",
  "attributes",
] as const;

/* `attr id uuid pk fk` writes name, then type, then keys — so the table
   reads in that order too. `description` is last because it arrives on a
   `desc` continuation line under the attribute, never on the line itself. */
export const ER_ATTRIBUTE_KEYS = [
  "name",
  "type",
  "keys",
  "description",
] as const;

/* The four positional fields in the order the token spells them —
   `from`, its cardinality, `to`, its cardinality — rather than grouping the
   two ids and then the two cardinalities. `customer ||--o{ order` reads
   left to right as from / fromCardinality / toCardinality / to, and this
   ordering is the closest a key list gets to that while keeping each
   cardinality adjacent to the end it belongs to. Pairing is what stops a
   reader of the JSON attaching the wrong glyph to the wrong entity. */
export const ER_RELATIONSHIP_KEYS = [
  "from",
  "fromCardinality",
  "to",
  "toCardinality",
  "kind",
  "label",
] as const;

/**
 * Imported, not copied, from the sequence grammar, exactly as
 * `FLOW_META_RAW` and `USECASE_META_RAW` are: every non-C4 header makes the
 * same call for the same reason — no dedicated `tagcolor` / `customicon` /
 * `generator` lines exist because no editor writes those fields here yet, so
 * they ride the raw `!` escape losslessly (see `SEQ_META_RAW`'s essay). When
 * that reasoning diverges, this alias becomes its own set.
 */
export const ER_META_RAW: ReadonlySet<string> = SEQ_META_RAW;

/**
 * `id` and `label` are required with dedicated syntax, and `attributes` is
 * STRUCTURAL — it is the nesting in the text, so a raw `! attributes` line
 * would build a box whose rows the serializer cannot spell back. These three
 * are the optional fields a newer minor could carry with an odd shape.
 */
export const ER_ENTITY_RAW: ReadonlySet<string> = new Set([
  "technology",
  "tags",
  "description",
]);

/**
 * `description` only. `name` and `type` are required with dedicated syntax,
 * and `keys` is deliberately NOT raw-able: it is a closed vocabulary with
 * dedicated syntax, and an unexpected value there is a new grammar
 * production (a major change), not forward tolerance — the same call
 * `USECASE_EDGE_RAW` makes about `stereotype`.
 */
export const ER_ATTRIBUTE_RAW: ReadonlySet<string> = new Set(["description"]);

/**
 * `label` only. Both cardinalities and `kind` are read from the relationship
 * token itself, so a raw line setting one would let the JSON disagree with
 * the glyph the text draws — the one thing a round trip must never allow.
 */
export const ER_RELATIONSHIP_RAW: ReadonlySet<string> = new Set(["label"]);

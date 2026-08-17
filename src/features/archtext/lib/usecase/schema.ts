/**
 * Schema-declared key knowledge shared by the `.alab` use-case parser and
 * serializer — the use-case counterpart of `../schema.ts`,
 * `../sequence/schema.ts` and `../flowchart/schema.ts`, following the same
 * three-way split:
 *
 *   - `*_KEYS` — canonical key order per object. The parser assembles
 *     objects in exactly this order and the serializer walks objects with
 *     it to split known keys from unknown forward-compatible keys, so the
 *     JSON a round trip produces is key-stable.
 *   - `*_RAW` — known keys that may be set through a raw
 *     `! <key> : <json>` escape line: the OPTIONAL fields a
 *     forward-compatible file could carry with an unexpected shape.
 *   - Everything else known has dedicated syntax and is rejected on a `!`
 *     line, so there is exactly one spelling per field.
 *
 * `META_KEYS` is NOT redeclared here: a use-case file reuses
 * `ArchLabMetadata`, so it reuses `../schema.ts`'s `META_KEYS` too — one
 * table for one type.
 *
 * Imported by `scripts/usecase-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import { SEQ_META_RAW } from "../sequence/schema";

export const USECASE_FILE_KEYS = [
  "$schema",
  "version",
  "kind",
  "metadata",
  "elements",
  "boundaries",
  "edges",
] as const;

/* `technology` sits between `label` and `tags`, matching the order the text
   writes them (`actor admin "Administrator" [internal] #ops`) — the key
   order and the line order are the same order, which is what keeps a round
   trip byte-stable without anyone holding two sequences in their head. */
export const USECASE_ELEMENT_KEYS = [
  "id",
  "kind",
  "label",
  "technology",
  "tags",
  "description",
] as const;

/* One table for all three edge kinds: `stereotype` and `label` never
   co-occur (a dependency carries only the former, an association only the
   latter, a generalization neither), so a single membership list serves the
   whole union without ordering ambiguity. */
export const USECASE_EDGE_KEYS = [
  "kind",
  "from",
  "to",
  "stereotype",
  "label",
] as const;

/** A system boundary (`UseCaseBoundary`). `usecases` is structural — it is
 * the nesting in the text — so only `label` and `tint` are ever written. */
export const USECASE_BOUNDARY_KEYS = ["label", "tint", "usecases"] as const;

/**
 * Imported, not copied, from the sequence grammar, exactly as
 * `FLOW_META_RAW` is: every non-C4 header makes the same call for the same
 * reason — no dedicated `tagcolor` / `customicon` / `generator` lines exist
 * because no editor writes those fields here yet, so they ride the raw `!`
 * escape losslessly (see `SEQ_META_RAW`'s essay). When that reasoning
 * diverges, this alias becomes its own set.
 */
export const USECASE_META_RAW: ReadonlySet<string> = SEQ_META_RAW;

/** `id`, `kind` and `label` are required with dedicated syntax; these three
 * are the optional fields a newer minor could carry with an odd shape. */
export const USECASE_ELEMENT_RAW: ReadonlySet<string> = new Set([
  "technology",
  "tags",
  "description",
]);

/**
 * `label` only, and only meaningful on an ASSOCIATION — the parser enforces
 * that per edge kind, because a raw `label` on a dependency or a
 * generalization would build a model the serializer cannot spell back.
 * `stereotype` is deliberately NOT raw-able: it is a closed vocabulary with
 * dedicated syntax, and an unexpected shape there is a new grammar
 * production (a major change), not forward tolerance.
 */
export const USECASE_EDGE_RAW: ReadonlySet<string> = new Set(["label"]);

/** A boundary's `tint` may arrive from a newer minor as something other than
 * a normalised colour; `label` is required and has dedicated syntax. */
export const USECASE_BOUNDARY_RAW: ReadonlySet<string> = new Set(["tint"]);

/**
 * Schema-declared key knowledge shared by the `.alab` flowchart parser and
 * serializer — the flowchart counterpart of `../schema.ts` and
 * `../sequence/schema.ts`, following the same three-way split:
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
 * `META_KEYS` is NOT redeclared here: a flowchart file reuses
 * `ArchLabMetadata`, so it reuses `../schema.ts`'s `META_KEYS` too — one
 * table for one type.
 *
 * Imported by `scripts/flowchart-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import { SEQ_META_RAW } from "../sequence/schema";

export const FLOW_FILE_KEYS = [
  "$schema",
  "version",
  "kind",
  "metadata",
  "nodes",
  "groups",
  "edges",
] as const;

/* `technology` sits between `label` and `tags`, matching the order the text
   writes them (`step validate "Validate cart" [Go 1.22] #checkout`) — the key
   order and the line order are the same order, which is what keeps a round
   trip byte-stable without anyone holding two sequences in their head. */
export const FLOW_NODE_KEYS = [
  "id",
  "shape",
  "label",
  "technology",
  "tags",
  "description",
] as const;

export const FLOW_EDGE_KEYS = ["from", "to", "label"] as const;

/** A node cluster (`FlowchartGroup`). `nodes` is structural — it is the
 * nesting in the text — so only `label` and `tint` are ever written. */
export const FLOW_GROUP_KEYS = ["label", "tint", "nodes"] as const;

/**
 * Imported, not copied, from the sequence grammar: both non-C4 headers make
 * the same call for the same reason — no dedicated `tagcolor` / `customicon`
 * / `generator` lines exist because no editor writes those fields here yet,
 * so they ride the raw `!` escape losslessly (see `SEQ_META_RAW`'s essay).
 * When that reasoning diverges, this alias becomes its own set.
 */
export const FLOW_META_RAW: ReadonlySet<string> = SEQ_META_RAW;

/** `id`, `shape` and `label` are required with dedicated syntax; these three
 * are the optional fields a newer minor could carry with an odd shape. */
export const FLOW_NODE_RAW: ReadonlySet<string> = new Set([
  "technology",
  "tags",
  "description",
]);

/** `label` only: an edge's other known keys (`from`, `to`) are structural. */
export const FLOW_EDGE_RAW: ReadonlySet<string> = new Set(["label"]);

/** A group's `tint` may arrive from a newer minor as something other than a
 * normalised colour; `label` is required and has dedicated syntax. */
export const FLOW_GROUP_RAW: ReadonlySet<string> = new Set(["tint"]);

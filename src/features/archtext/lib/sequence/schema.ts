/**
 * Schema-declared key knowledge shared by the `.alab` sequence parser and
 * serializer — the sequence counterpart of `../schema.ts`, following the
 * same three-way split:
 *
 *   - `*_KEYS` — canonical key order per object. The parser assembles
 *     objects in exactly this order and the serializer walks objects with
 *     it to split known keys from unknown forward-compatible keys, so the
 *     JSON a round trip produces is key-stable.
 *   - `*_RAW` — known keys that may be set through a raw
 *     `! <key> : <json>` escape line. These are the OPTIONAL fields a
 *     forward-compatible file could carry with an unexpected shape (a
 *     `kind` value from a newer minor, a non-string `technology`); the raw
 *     form keeps even those lossless instead of forcing the serializer to
 *     throw or drop.
 *   - Everything else known has dedicated syntax and is rejected on a `!`
 *     line, so there is exactly one spelling per field.
 *
 * `META_KEYS` is NOT redeclared here: a sequence file reuses
 * `ArchLabMetadata`, so it reuses `../schema.ts`'s `META_KEYS` too — one
 * table for one type.
 *
 * Imported by `scripts/sequence-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

export const SEQ_FILE_KEYS = [
  "$schema",
  "version",
  "kind",
  "metadata",
  "participants",
  "boxes",
  "autonumber",
  "items",
] as const;

/** A participant box (`SequenceBox`). `participants` is structural — it is
 * the nesting in the text — so only `label` and `tint` are ever written. */
export const BOX_KEYS = ["label", "tint", "participants"] as const;

/* `icon` sits between `name` and `technology`, matching the order the text
   writes them (`api:participant "Order API" @golang [Go]`) — the key order and
   the line order are the same order, which is what keeps a round trip
   byte-stable without anyone holding two sequences in their head. */
export const PARTICIPANT_KEYS = [
  "id",
  "kind",
  "name",
  "icon",
  "technology",
  "description",
] as const;

export const MESSAGE_KEYS = [
  "step",
  "from",
  "to",
  "kind",
  "label",
  "technology",
  "description",
  "activate",
  "deactivate",
] as const;

export const NOTE_KEYS = ["step", "placement", "participants", "text"] as const;

export const FRAGMENT_KEYS = ["step", "kind", "tint", "branches"] as const;

export const BRANCH_KEYS = ["label", "items"] as const;

/**
 * Sequence metadata raw set: wider than the C4 grammar's `META_RAW` because
 * the sequence header has no `tagcolor` / `customicon` / `generator`
 * dedicated lines — those C4 lines exist for fields the C4 EDITOR writes,
 * and no sequence editor exists yet. Until one does, the raw `!` escape
 * carries them losslessly without growing the grammar; when an editor
 * arrives, dedicated lines can be added and these keys removed from the set
 * without breaking old files (the parser would then reject the raw form
 * with "has dedicated syntax", exactly like C4 does today).
 */
export const SEQ_META_RAW: ReadonlySet<string> = new Set([
  "description",
  "owner",
  "tags",
  "lastReviewedAt",
  "tagColors",
  "customIcons",
  "generator",
]);

export const SEQ_PARTICIPANT_RAW: ReadonlySet<string> = new Set([
  "kind",
  "icon",
  "technology",
  "description",
]);

export const SEQ_MESSAGE_RAW: ReadonlySet<string> = new Set([
  "technology",
  "description",
  "activate",
  "deactivate",
]);

/** `label` only: a branch's other known key (`items`) is structural. */
export const SEQ_BRANCH_RAW: ReadonlySet<string> = new Set(["label"]);

/** A fragment's `tint` may arrive from a newer minor as something other than
 * a normalised colour; the raw escape keeps it rather than dropping it. */
export const SEQ_FRAGMENT_RAW: ReadonlySet<string> = new Set(["tint"]);

/** Same for a box's `tint`; `label` is required and has dedicated syntax. */
export const SEQ_BOX_RAW: ReadonlySet<string> = new Set(["tint"]);

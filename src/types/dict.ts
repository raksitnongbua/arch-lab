/**
 * TypeScript model of the arch-lab DATA DICTIONARY — the sixth document type,
 * next to the C4 model, the sequence model, the flowchart, the use-case
 * diagram and the ER diagram. Same conventions as all five: stable
 * human-readable ids, deterministic key order on write, no per-element
 * timestamps, forward tolerance for unknown fields from newer minors.
 *
 * WHAT IT ANSWERS THAT NO OTHER KIND HERE DOES: what a field MEANS, where it
 * comes from, and which values are legal. Every other kind draws structure or
 * behaviour; this one is the contract on the data itself.
 *
 * THE OVERLAP WITH ER IS REAL AND WAS ARGUED BEFORE THIS FILE EXISTED, because
 * `.claude/rules/new-diagram-type.md` requires a new notation to answer a
 * question the existing ones cannot. `ErAttribute` already carries a name, a
 * type, key roles and a description, so the honest summary of this type is
 * "ER's attribute rows, expanded, with the relationships removed". It earns
 * its own document type on three grounds:
 *
 *   1. IT IS NOT A DIAGRAM OF A DATABASE. A dictionary describes fields on an
 *      API payload, a CSV export, an event envelope, a form — things with no
 *      tables and no cardinality to draw. Modelling it as an ER document would
 *      force a relationship vocabulary onto documents that have none.
 *   2. ITS FIELDS ARE ABOUT PROVENANCE AND LEGALITY (`source`, `values`,
 *      `example`, `pii`), which an ER diagram has nowhere to put and would not
 *      draw if it did — an entity box has room for a name and a type, not for
 *      a sentence about where the value originates.
 *   3. IT RENDERS AS A TABLE, not as boxes and lines. The layout solves rows
 *      and columns; there is no graph, so nothing in `features/er/lib/layout`
 *      applies.
 *
 * Two structural rules, both inherited:
 *
 *   - **Order is data.** `sections` is declaration order and each section's
 *     `fields` is the order the author wrote. Nothing is sorted on write — a
 *     dictionary's order is editorial (the identifying fields first, the
 *     audit columns last) and re-sorting it alphabetically would overrule a
 *     decision the reader is being shown.
 *   - **Fields are nested, not a flat list with a `section` field.** The text
 *     nests them and nesting IS the membership, exactly as `ErEntity` holds
 *     its attributes. A field belonging to no section is unspellable rather
 *     than merely rejected.
 *
 * Nothing here is validated at runtime; the `.alab` dictionary parser is the
 * loading gate.
 */

import type { ArchLabMetadata } from "./c4";

/* -------------------------------------------------------------------------- */
/* Fields                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The closed flag vocabulary — the properties a reader scans a dictionary for,
 * each drawn as its own badge.
 *
 * A CLOSED SET for the reason `ErAttributeKey` is one: each gets a glyph and a
 * colour, and a sixth spelling would either draw as nothing or draw as a
 * surprise. Chosen as the five that change how a consumer must WRITE code
 * against the field, which is the test for whether a property belongs on the
 * row rather than in the description:
 *
 *   - `required`   — absent or null is invalid. The commonest question asked
 *                    of a dictionary and the reason most people open one.
 *   - `unique`     — no two records share a value.
 *   - `derived`    — computed, not supplied; writing to it is a mistake.
 *   - `pii`        — personal data. Drawn loudest, because the consequence of
 *                    missing it is legal rather than a bug.
 *   - `deprecated` — still present, no longer to be used.
 */
export type DictFieldFlag =
  "required" | "unique" | "derived" | "pii" | "deprecated";

/** One documented field — a row in the rendered table. */
export interface DictField {
  /** The field's name, as a consumer spells it. Unique within its section. */
  name: string;
  /**
   * The type, as drawn — `uuid`, `string`, `decimal(10,2)`, `Money`.
   *
   * FREE TEXT for the reason `ErAttribute.type` is: the set of type names is
   * every language's and every schema's, and a closed vocabulary here would be
   * wrong for most users. Drawn verbatim, never interpreted.
   */
  type: string;
  /** Flags, in the order written. Absent = a plain optional field, and
   * absence survives the round trip as absence rather than as `[]`. */
  flags?: DictFieldFlag[];
  /**
   * What the field MEANS. Optional in the type but the point of the document:
   * a dictionary whose fields have no descriptions is a schema dump, and the
   * MCP validator says so rather than passing it silently.
   */
  description?: string;
  /** Where the value originates — a table, an endpoint, an upstream system.
   * The provenance half of what a dictionary is for. */
  source?: string;
  /** The legal values or the constraint, in words: "ISO 4217", "0–100",
   * "one of draft | sent | paid". Free text, because half of real constraints
   * are prose and a closed shape would push those into the description. */
  values?: string;
  /** One concrete value. A single example resolves more ambiguity about a
   * field than a paragraph, which is why it has its own slot. */
  example?: string;
}

/* -------------------------------------------------------------------------- */
/* Sections                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A group of fields under one heading — a table, a payload, an event, a form.
 *
 * `label` rather than `id` + `label` as `ErEntity` has, because nothing refers
 * to a section: there are no relationships in this document type, so a section
 * needs a name to read and not an identifier to point at. Adding an unused id
 * would be a second spelling of the heading.
 */
export interface DictSection {
  /** The heading. Required, and unique within the file so a reader can cite
   * it. */
  label: string;
  /** Free text, e.g. "PostgreSQL", "REST payload" — the same `[technology]`
   * micro-grammar every other document type spells. */
  technology?: string;
  /** Same `#tag` vocabulary as every other kind: one tag namespace. */
  tags?: string[];
  /** What this group of fields is, in a sentence. */
  description?: string;
  /** Ordered: the order the author wrote them. At least one. */
  fields: DictField[];
}

/* -------------------------------------------------------------------------- */
/* File                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The whole saved dictionary: one file, self-contained.
 *
 * `kind: "dict"` is the JSON-level discriminant, placed right after `version` —
 * the same first-line rule the `.alab` text header follows.
 *
 * Unknown fields from a newer MINOR version must be preserved verbatim on
 * round-trip; an unknown MAJOR version is refused read-write.
 */
export interface DictLabFile {
  /** URL of the JSON Schema, for editor autocomplete. */
  $schema?: string;
  /** "MAJOR.MINOR" — shares the arch-lab version line. */
  version: string;
  /** Document-type discriminant. Always `"dict"`. */
  kind: "dict";
  /** Reused, not redeclared. */
  metadata: ArchLabMetadata;
  /** Ordered: declaration order. Never sorted. */
  sections: DictSection[];
  /** Forward tolerance: unknown fields from newer minor versions. */
  [unknown: string]: unknown;
}

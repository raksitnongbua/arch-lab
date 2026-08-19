/**
 * TypeScript model of the arch-lab ENTITY-RELATIONSHIP document — the fifth
 * document type, next to the C4 model in `./c4.ts`, the sequence model in
 * `./sequence.ts`, the flowchart model in `./flowchart.ts` and the use-case
 * model in `./usecase.ts`. Same conventions as all four: stable
 * human-readable ids, deterministic key order on write, no per-element
 * timestamps, and forward tolerance for unknown fields from newer minors.
 *
 * WHAT AN ER DIAGRAM ANSWERS THAT NO OTHER KIND HERE DOES: what you store,
 * and how one record finds another. The other four draw behaviour or
 * structure between systems; this one draws the shape of the data inside
 * one. That is the test `.claude/rules/new-diagram-type.md` sets before a
 * fifth notation may exist, and it is the reason this is not modelled as a
 * C4 document with tables for nodes:
 *
 *   - A C4 relationship is a labelled arrow. An ER relationship is a pair of
 *     CARDINALITIES, one per end, and neither end is "the arrow's
 *     direction" — `customer ||--o{ order` says one customer, zero or more
 *     orders, and reversing the ends must reverse both glyphs together.
 *     There is nowhere in the C4 edge to put the second cardinality.
 *   - An entity's ATTRIBUTES are the diagram's payload. A C4 node has a
 *     label, a technology and a description — three strings — where an
 *     entity has an ordered list of typed, keyed columns that render as rows
 *     inside the box. Squeezing them into `description` would make them
 *     unqueryable, unstyleable and unable to round-trip.
 *
 * Three structural rules, all inherited from the flowchart and use-case
 * models:
 *
 *   - **Order is data.** `entities` is the declaration order, each entity's
 *     `attributes` is the column order the author wrote, and `relationships`
 *     is the narration order. Nothing is sorted on write. Reordering an
 *     array is a real model change and must show up in a diff as one — for
 *     attributes especially, because column order is a decision a reader of
 *     the diagram is being shown on purpose.
 *
 *   - **Attributes are nested, not a flat list with an `entity` field.** The
 *     text nests them inside the entity block and nesting IS the membership,
 *     exactly as `UseCaseBoundary` makes a non-contiguous boundary
 *     unspellable. A flat `attributes` array keyed by entity id would make
 *     an attribute belonging to no entity constructible, and would let the
 *     JSON disagree with the text about which box a column is drawn in.
 *
 *   - **Cardinality is a closed pair, not free text.** Both ends come from
 *     the same four-value vocabulary, so a relationship can be drawn without
 *     the renderer parsing prose, and so Mermaid conversion is total in both
 *     directions rather than best-effort.
 *
 * Nothing here is validated at runtime; the `.alab` ER parser
 * (`src/features/archtext/lib/er/parse.ts`) is the loading gate.
 */

import type { ArchLabMetadata } from "./c4";

/* -------------------------------------------------------------------------- */
/* Attributes                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The closed key vocabulary drawn beside an attribute.
 *
 * A CLOSED SET, and free text was rejected: these three are what a reader
 * scans an entity box for, each gets its own glyph and its own colour in the
 * renderer, and a fourth spelling ("primary", "PRIMARY KEY", "id") would
 * either draw as nothing or draw as a surprise. They are also exactly
 * Mermaid's three (`PK`, `FK`, `UK`), which is what makes the conversion in
 * `src/features/mermaid/lib/er.ts` total rather than lossy.
 *
 * Lowercase in the model and in the text, uppercase only when emitting
 * Mermaid — one spelling per value, normalised at the parser, in the manner
 * of `FlowchartGroup.tint`.
 */
export type ErAttributeKey = "pk" | "fk" | "uk";

/**
 * One column of an entity — the row drawn inside the box.
 *
 * `keys` is an ARRAY, not a single optional value, because a foreign key can
 * also be part of the primary key (`attr order_id uuid pk fk`), which is the
 * normal shape of a join table's columns. Modelling it as one value would
 * make the most common composite-key diagram undrawable. It is ordered and
 * written back in the order given, so `pk fk` and `fk pk` are different
 * bytes and the round trip preserves whichever the author chose; the parser
 * refuses a repeat, so neither spelling can say the same thing twice.
 */
export interface ErAttribute {
  /** The column name, as drawn. Unique within its entity. */
  name: string;
  /**
   * The data type, as drawn — `uuid`, `string`, `timestamptz`, `numeric(10,2)`.
   *
   * FREE TEXT on purpose, where `keys` is closed: the set of type names is
   * the set of type names in every database anyone might model, and a closed
   * vocabulary here would either be wrong for most users or be a
   * SQL-dialect decision this format has no business making. It is drawn
   * verbatim and never interpreted.
   */
  type: string;
  /** Key roles, in the order written. Absent = a plain column, and absence
   * survives the round trip as absence rather than as an empty array. */
  keys?: ErAttributeKey[];
  /** <= 500 chars, same budget as `C4Node.description`: the note behind the
   * column, revealed on focus, never drawn inside the box — an entity with
   * twelve columns has no room for twelve sentences. */
  description?: string;
}

/* -------------------------------------------------------------------------- */
/* Entities                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One entity — the labelled box, and the columns inside it.
 *
 * Array position in `ErLabFile.entities` is the declaration order; there is
 * no separate `order` field to drift out of step with it.
 */
export interface ErEntity {
  /** Human-readable slug, unique within the file, stable across renames. */
  id: string;
  /**
   * The name drawn on the box. Required, and deliberately not derived from
   * `id`: a table called `order_line_item` is drawn as "Order line item" in
   * a diagram meant to be presented, and the id is what the relationship
   * lines refer to.
   */
  label: string;
  /** Free text, e.g. "PostgreSQL", "partitioned" — the same `[technology]`
   * micro-grammar every other document type spells. */
  technology?: string;
  /** Same `#tag` vocabulary as a C4 node, for the reason the flowchart and
   * use-case models share it: one tag namespace across the document kinds. */
  tags?: string[];
  /** <= 500 chars — what the entity IS, revealed on focus. */
  description?: string;
  /**
   * The columns, in the order written. Optional and never an empty array:
   * an entity with no attributes is a legitimate diagram — the overview that
   * shows only tables and the lines between them — and it must round-trip as
   * an absent key rather than as `[]`.
   */
  attributes?: ErAttribute[];
}

/* -------------------------------------------------------------------------- */
/* Relationships                                                               */
/* -------------------------------------------------------------------------- */

/**
 * One end's cardinality, in crow's-foot terms.
 *
 * These four are the whole vocabulary, and they are Mermaid's four, chosen
 * over inventing arch-lab names for the same idea because the crow's-foot
 * glyphs are what a reader of an ER diagram already knows how to read, and
 * because a one-to-one mapping is what keeps `er.ts` ⇄ Mermaid total.
 *
 *   - `one`          — exactly one          (`||`)
 *   - `zero-or-one`  — optional, at most one (`|o` / `o|`)
 *   - `one-or-more`  — at least one          (`}|` / `|{`)
 *   - `zero-or-more` — any number            (`}o` / `o{`)
 *
 * Named rather than stored as the glyph pair, because the glyph is
 * SIDE-DEPENDENT — "zero or more" is `}o` on the left of the connector and
 * `o{` on its right — and a model that stored the raw token would make
 * swapping a relationship's ends a text transformation instead of a data
 * one, and would let a file carry a left glyph on the right end.
 */
export type ErCardinality =
  "one" | "zero-or-one" | "one-or-more" | "zero-or-more";

/**
 * Whether the child's identity depends on the parent — the ER distinction
 * drawn as a solid line (identifying) versus a dashed one
 * (non-identifying). Kept because it is half of what the two connector
 * tokens mean, and dropping it would make `--` and `..` two spellings of one
 * thing, which this format refuses everywhere else.
 */
export type ErRelationshipKind = "identifying" | "non-identifying";

/**
 * A line between two entities, with a cardinality at each end.
 *
 * `from`/`to` are the sides the ids were written on, and `fromCardinality`
 * belongs to `from` — the pairing is positional, not inferred, so that
 * reversing the ends is a mechanical swap of two pairs rather than a
 * re-reading of the glyphs.
 *
 * There is no `kind` discriminant on a union here, unlike `UseCaseEdge`,
 * because there is only one shape of ER relationship: `kind` is a FIELD
 * describing the line's style, not a tag selecting between differently
 * shaped records.
 */
export interface ErRelationship {
  /** Entity id — the end written left of the connector token. */
  from: string;
  /** Cardinality at the `from` end. */
  fromCardinality: ErCardinality;
  /** Entity id — the end written right of the connector token. */
  to: string;
  /** Cardinality at the `to` end. */
  toCardinality: ErCardinality;
  /** Solid or dashed. Required: the parser reads it from the connector
   * token, so there is no "unstated" state a file could be in. */
  kind: ErRelationshipKind;
  /**
   * The verb drawn on the line — "places", "contains", "belongs to".
   *
   * Optional here where Mermaid requires one, because an unlabelled line is
   * a real choice in a dense diagram and forcing `""` would put an empty
   * quoted string in every file that made it. The Mermaid emitter supplies
   * `""` when absent; the importer drops an empty one back to absent, so the
   * absence survives a round trip through Mermaid rather than becoming a
   * label nobody wrote.
   */
  label?: string;
}

/* -------------------------------------------------------------------------- */
/* File                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The whole saved ER document: one file, self-contained.
 *
 * `kind: "er"` is the JSON-level discriminant against `ArchLabFile` (no
 * `kind` key), `SequenceLabFile`, `FlowchartLabFile` and `UseCaseLabFile`,
 * placed right after `version` — the same first-line rule the `.alab` text
 * header follows.
 *
 * Unknown fields from a newer MINOR version must be preserved verbatim on
 * round-trip; an unknown MAJOR version is refused read-write. Same index
 * signature escape hatch as the other four file types, for the same reason.
 */
export interface ErLabFile {
  /** URL of the JSON Schema, for editor autocomplete. */
  $schema?: string;
  /** "MAJOR.MINOR" — shares the arch-lab version line. */
  version: string;
  /** Document-type discriminant. Always `"er"`. */
  kind: "er";
  /** Reused, not redeclared: an ER file carries the same title / ownership /
   * timestamp story as the other four document types. */
  metadata: ArchLabMetadata;
  /** Ordered: declaration order. Never sorted. */
  entities: ErEntity[];
  /** Ordered: the author's narration order. */
  relationships: ErRelationship[];
  /** Forward tolerance: unknown fields from newer minor versions. */
  [unknown: string]: unknown;
}

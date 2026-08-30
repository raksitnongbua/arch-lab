/**
 * TypeScript model of the arch-lab USE-CASE document — the fourth document
 * type next to the C4 model in `./c4.ts`, the sequence model in
 * `./sequence.ts` and the flowchart model in `./flowchart.ts`. Same
 * conventions as all three: stable human-readable ids, deterministic key
 * order on write, no per-element timestamps, and forward tolerance for
 * unknown fields from newer minor versions.
 *
 * WHY THIS IS NOT A FLOWCHART. A use-case diagram has no flow: its actors
 * are participants, not `start` terminators; its associations are UNDIRECTED
 * lines, which the flowchart's single `->` arrow cannot spell; and its
 * layout is actor columns against a system boundary, not a rank ordering by
 * longest path. Importing a use-case diagram as a flowchart silently
 * mis-models it — actors become starts, use cases become ends, and the
 * flowchart audit reports every use case as a dead end — which is the
 * concrete bug this type exists to fix.
 *
 * Two structural rules, both inherited from the flowchart model:
 *
 *   - **Order is data.** `elements` is the declaration order and `edges` is
 *     the author's narration order. Nothing is sorted on write; reordering
 *     an array is a real model change and must show up in a diff as one.
 *
 *   - **One `edges` array, discriminated by `kind` — not three arrays.**
 *     UML draws three genuinely different lines here (association,
 *     «include»/«extend» dependency, generalization) and the model keeps all
 *     three, but in ONE ordered array. Three arrays were rejected because
 *     they destroy narration order: an author who interleaves the kinds
 *     ("customer uses search, search includes ranking, customer also
 *     orders") would have that reading order shredded into three lists, and
 *     the serializer would be forced to regroup them into blocks — a silent
 *     canonicalisation this format refuses everywhere else. A single edge
 *     shape with all-optional fields and no `kind` was also rejected: it
 *     makes unspellable states constructible (a generalization carrying a
 *     stereotype), and the discriminant is what lets TypeScript refuse them
 *     at compile time instead.
 *
 * The same argument settles `elements`: one array with a `kind`
 * ("actor" | "usecase"), not an `actors` array and a `usecases` array,
 * because the text may interleave the two and two arrays cannot round-trip
 * that order byte-identically.
 *
 * Nothing here is validated at runtime; the `.alab` use-case parser
 * (`src/features/archtext/lib/usecase/parse.ts`) is the loading gate.
 */

import type { ArchLabMetadata } from "./c4";

/* -------------------------------------------------------------------------- */
/* Elements                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The two participant classes of a use-case diagram:
 *
 *   - `actor`   — a stick figure, standing OUTSIDE the system boundary.
 *   - `usecase` — an ellipse, normally inside one.
 *
 * REQUIRED, like a flowchart node's `shape` and unlike a sequence
 * participant's optional `kind`: which of the two an element is IS the
 * statement the element makes, and "unstated" would just be a second
 * spelling of one of them.
 */
export type UseCaseElementKind = "actor" | "usecase";

/** One participant. Array position in `UseCaseLabFile.elements` is the
 * declaration order — there is no separate `order` field to drift out of
 * step with it. */
export interface UseCaseElement {
  /** Human-readable slug, unique within the file, stable across renames. */
  id: string;
  kind: UseCaseElementKind;
  /** Required — the text drawn under the figure or inside the ellipse. */
  label: string;
  /** Free text, e.g. "internal", "OAuth 2.0" — the same `[technology]`
   * micro-grammar every other document type spells. */
  technology?: string;
  /** Same `#tag` vocabulary as a C4 node, for the same reason the flowchart
   * shares it: one tag namespace across the document kinds. */
  tags?: string[];
  /** <= 500 chars, same budget as `C4Node.description`: the detail behind
   * the label, revealed on focus, never drawn inside the ellipse. */
  description?: string;
}

/* -------------------------------------------------------------------------- */
/* Edges                                                                       */
/* -------------------------------------------------------------------------- */

/** The three UML relationship lines. See the file header for why they share
 * one array and carry this discriminant. */
export type UseCaseEdgeKind = "association" | "dependency" | "generalization";

/** The closed «include»/«extend» vocabulary — a dependency means nothing in
 * a use-case diagram without one of these two words. */
export type UseCaseDependencyStereotype = "include" | "extend";

/**
 * A plain association — an actor uses a use case. UNDIRECTED: it draws as a
 * line with no arrowhead. `from`/`to` record which side of the `--` token
 * each id was written on (the round trip preserves the spelling), not a
 * direction of travel.
 */
export interface UseCaseAssociation {
  kind: "association";
  /** Element id — one end is an actor, the other a use case. */
  from: string;
  /** Element id. */
  to: string;
  /** A multiplicity or role ("1..*", "as guest"). Absent = an unlabelled
   * line, and absence survives the round trip as absence. */
  label?: string;
}

/**
 * A dashed, directed «include» or «extend» dependency between two use
 * cases. `stereotype` is REQUIRED: a bare dashed arrow is ambiguous in
 * exactly the way this document type exists to avoid.
 */
export interface UseCaseDependency {
  kind: "dependency";
  /** Use-case id — the depending end, where the arrow starts. */
  from: string;
  /** Use-case id — where the arrowhead lands. */
  to: string;
  stereotype: UseCaseDependencyStereotype;
}

/**
 * A generalization — hollow-triangle "is-a" between two actors or two use
 * cases (never a mixed pair; the parser refuses one). It carries neither a
 * label nor a stereotype: the triangle is the whole statement.
 */
export interface UseCaseGeneralization {
  kind: "generalization";
  /** Element id — the more specific end. */
  from: string;
  /** Element id — the more general end, where the hollow triangle sits. */
  to: string;
}

export type UseCaseEdge =
  UseCaseAssociation | UseCaseDependency | UseCaseGeneralization;

/* -------------------------------------------------------------------------- */
/* Boundaries                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A system boundary — the labelled box the use cases sit inside, which is
 * the "edge of the system" a use-case diagram exists to draw. The use-case
 * counterpart of `FlowchartGroup`, with the same two design calls for the
 * same reasons: a separate list rather than a `boundary=` field on each
 * element (the boundary is a thing with its own label and colour, not a
 * value repeated on every member), and contiguity as a rule — the `.alab`
 * grammar makes a non-contiguous boundary unspellable, because members are
 * nested inside the boundary block and nesting IS the membership. Only use
 * cases may be members; an actor stands outside by definition.
 */
export interface UseCaseBoundary {
  /** Required — the system's name, drawn on the box. */
  label: string;
  /** Normalised lowercase `#rrggbb`, drawn as a wash — same one-spelling
   * rule and same treatment as `FlowchartGroup.tint`. */
  tint?: string;
  /** Use-case element ids, in declaration order. At least one. */
  usecases: string[];
}

/* -------------------------------------------------------------------------- */
/* File                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The whole saved use-case document: one file, self-contained.
 *
 * `kind: "usecase"` is the JSON-level discriminant against `ArchLabFile`
 * (no `kind` key), `SequenceLabFile` (`kind: "sequence"`) and
 * `FlowchartLabFile` (`kind: "flowchart"`), placed right after `version` —
 * the same first-line rule the `.alab` text header follows.
 *
 * Unknown fields from a newer MINOR version must be preserved verbatim on
 * round-trip; an unknown MAJOR version is refused read-write. Same index
 * signature escape hatch as the other three file types, for the same reason.
 */
export interface UseCaseLabFile {
  /** URL of the JSON Schema, for editor autocomplete. */
  $schema?: string;
  /** "MAJOR.MINOR" — shares the arch-lab version line. */
  version: string;
  /** Document-type discriminant. Always `"usecase"`. */
  kind: "usecase";
  /** Reused, not redeclared: a use-case file carries the same title /
   * ownership / timestamp story as the other three document types. */
  metadata: ArchLabMetadata;
  /** Ordered: declaration order, actors and use cases interleaved as the
   * author wrote them. Never sorted. */
  elements: UseCaseElement[];
  /** System boundaries over contiguous runs of use-case `elements`. Absent
   * when the document draws none — an empty array is not written. */
  boundaries?: UseCaseBoundary[];
  /** Ordered: the author's narration order, all three kinds interleaved. */
  edges: UseCaseEdge[];
  /** Forward tolerance: unknown fields from newer minor versions. */
  [unknown: string]: unknown;
}

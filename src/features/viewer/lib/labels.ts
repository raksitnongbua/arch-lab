/**
 * The two label vocabularies for a C4 node type, kept apart on purpose.
 *
 *   - `C4_ABSTRACTION` (re-exported from `@/types`) is what the element IS —
 *     Person, Software System, Container, Component, Code. It belongs in the
 *     `[...]` metadata line every renderer draws, because that line is the
 *     one place c4model.com/diagrams/notation requires the classification to
 *     be explicit.
 *   - `SHAPE_LABEL` is what the element LOOKS LIKE — the silhouette's own
 *     name. It belongs in the legend, the type picker and the icon picker,
 *     where the reader is choosing or decoding a shape rather than reading a
 *     classification.
 *
 * They were one table until the metadata line was found saying
 * `[Database: PostgreSQL 16]` — naming a silhouette where C4 asks for an
 * abstraction, leaving a reader unable to tell which of the four levels' kinds
 * of thing they were looking at. The cylinder and the teal still say
 * "database"; the label now says "Container".
 */

import { C4_ABSTRACTION as C4_ABSTRACTION_MAP, type C4NodeType } from "@/types";

export { C4_ABSTRACTION, type C4Abstraction } from "@/types";

/**
 * The silhouette's own name — legend rows, the editor's type picker, and the
 * "use the generic X icon" affordance. Sentence case: these read as UI copy,
 * not as the Title Case classifications above.
 */
export const SHAPE_LABEL: Record<C4NodeType, string> = {
  person: "Person",
  softwareSystem: "Software system",
  externalSystem: "External system",
  container: "Container",
  database: "Database",
  queue: "Queue",
  component: "Component",
  codeElement: "Code element",
};

/**
 * Whether naming the silhouette alongside the classification tells the reader
 * anything they did not already have.
 *
 * For five of the eight types it does not: `person` and `container` use the
 * same word for both, `softwareSystem` differs only in capitalisation, and
 * `codeElement`'s "Code element" is "Code" plus a noun. Printing those gives
 * "Software System (software system)" and "Code (code element)" — pure noise
 * that makes the genuinely informative cases harder to notice.
 *
 * The test is containment rather than equality, which is what handles all
 * three of those shapes at once: append only when the silhouette's name does
 * not already contain the abstraction's. That leaves exactly the three that
 * earn it — `database` and `queue` (Container), and `externalSystem`
 * (Software System).
 */
export function shapeAddsInformation(type: C4NodeType): boolean {
  return !SHAPE_LABEL[type]
    .toLowerCase()
    .includes(C4_ABSTRACTION_MAP[type].toLowerCase());
}

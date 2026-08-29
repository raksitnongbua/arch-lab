/**
 * TypeScript model of the arch-lab MILESTONE TIMELINE — the eighth document
 * type, next to the C4 model in `./c4.ts`, the sequence model in
 * `./sequence.ts`, the flowchart model in `./flowchart.ts`, the use-case model
 * in `./usecase.ts`, the ER model in `./er.ts`, the data dictionary in
 * `./dict.ts` and the gantt in `./gantt.ts`. Same conventions as all seven:
 * deterministic key order on write, no per-element timestamps, and forward
 * tolerance for unknown fields from newer minors.
 *
 * ── THE BAR, AND THE FACT THAT THIS KIND DOES NOT CLEAR IT ────────────────
 *
 * `.claude/rules/new-diagram-type.md` requires a new notation to answer a
 * question the existing ones cannot. THIS ONE DOES NOT, and that is recorded
 * here rather than left for a future reader to discover and assume was an
 * oversight. A milestone timeline is a list of dated events; a list of dated
 * events reads nearly as well as prose, which is precisely why this notation
 * was REJECTED during design. It ships because the user asked for it
 * explicitly and reaffirmed after being shown the overlap.
 *
 * THE OVERLAP, NAMED. Two neighbours cover most of what a timeline says:
 *
 *   - A GANTT (`./gantt.ts`) already draws WHEN, on a measured axis, and
 *     already has a zero-duration `milestone`. A gantt made entirely of
 *     milestones would draw this document's content with more machinery —
 *     which is exactly the shape `validate_gantt` reports as
 *     `barlessSections`, "a band that draws diamonds and nothing with
 *     length". So this notation's whole content is a thing the gantt
 *     validator calls a defect in a gantt.
 *   - A SEQUENCE diagram (`./sequence.ts`) already owns ORDER down a page.
 *     Its axis is the index of a message, which is what an event's position
 *     is here too.
 *
 * WHAT IS ACTUALLY DIFFERENT, stated as narrowly as it deserves: a timeline
 * has NO duration, NO dependency and NO participant. Every one of those is a
 * subtraction, not a capability, and a notation defined by what it removes is
 * a weaker case than any of the other seven made. What the subtraction buys
 * is presentational rather than expressive — a page of long event labels with
 * nothing else competing for the width — and `purpose.md` does say
 * presentation is the product. That is the strongest honest argument for it,
 * and it is not the argument the rule asks for.
 *
 * Do not read this header as a licence. A NINTH notation still has to clear
 * the bar; this one was waived by name, once, on request.
 *
 * ── THE MODEL ─────────────────────────────────────────────────────────────
 *
 * Three structural rules, each of which is what keeps this from becoming a
 * gantt by accretion:
 *
 *   - **NOTHING HERE MEASURES.** There is no duration, no date arithmetic and
 *     no axis with a scale. A period's label is a STRING (`"2024"`, `"Early
 *     days"`, `"After the acquisition"`) and is never parsed as a date, so
 *     the layout can never be asked where between two labels a third belongs.
 *     The moment a number gets a unit here, this notation is a worse gantt.
 *
 *   - **ORDER IS DECLARATION ORDER, AND IT IS THE ONLY ORDER.** Periods are
 *     written earliest-first and events within a period likewise; nothing is
 *     sorted, on read or on write. There is no `after`, no `at` and no id to
 *     point one event at another — an event that waited for another event
 *     would be a dependency, which is the gantt's job and the one line this
 *     notation may not cross.
 *
 *   - **AN EVENT HAS NO ID**, unlike every other kind here. Ids exist so one
 *     element can NAME another, and nothing in this grammar refers to
 *     anything: there are no connectors, no `after`, no relationship lines.
 *     An id would be a key with no reader, and — worse — a key an author
 *     would reasonably expect to be able to point at. Absence is the honest
 *     answer, and it is what keeps `event "…"` a single quoted string rather
 *     than the slug-plus-label pair every other kind carries.
 *
 * Nothing here is validated at runtime; the `.alab` timeline parser
 * (`src/features/archtext/lib/timeline/parse.ts`) is the loading gate.
 */

import type { ArchLabMetadata } from "./c4";

/* -------------------------------------------------------------------------- */
/* Events                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * One point on the timeline — a thing that happened.
 *
 * THE LABEL IS THE WHOLE ELEMENT, which is why this interface is three
 * optional fields around one required string. There is no type, no state and
 * no role: every event is drawn identically, and that is a decision rather
 * than an unfinished palette. A vocabulary of event kinds ("launch",
 * "incident", "hire") would be a taxonomy this notation has no way to
 * validate and every reader would spell differently — and it is the exact
 * move that would earn this kind a `check:timeline-palette` it currently and
 * correctly does not have.
 */
export interface TimelineEvent {
  /**
   * What happened, in the author's own words. Required.
   *
   * EXPECTED TO BE LONG, and the layout is built for that: labels wrap to a
   * measured column and each event's height is solved from its own wrapped
   * text. This is the field the vertical layout exists to serve.
   */
  label: string;
  /** Same `#tag` vocabulary as every other document kind. */
  tags?: string[];
  /** The note behind the point, revealed on focus. Wrapped and drawn under
   * the label rather than inside it — an event is a dot, and a dot has no
   * interior. */
  description?: string;
  /** Forward tolerance: unknown fields from newer minor versions. */
  [unknown: string]: unknown;
}

/* -------------------------------------------------------------------------- */
/* Periods                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A labelled band of events — "2024", "Before the rewrite", "Q3".
 *
 * Events are NESTED, not a flat list with a `period` field, for the reason
 * `GanttSection.items` and `ErEntity.attributes` are nested: membership IS
 * the nesting, so an event belonging to no period is unspellable and the JSON
 * cannot disagree with the text about which band a dot is drawn in.
 *
 * A period has no id and no dates. Nothing refers to a period, and the label
 * is deliberately opaque — see the file header on why nothing here measures.
 */
export interface TimelinePeriod {
  /** The name drawn in the rail beside the band. */
  label: string;
  /** Ordered: declaration order, earliest first. Never sorted. */
  events: TimelineEvent[];
  /** Forward tolerance: unknown fields from newer minor versions. */
  [unknown: string]: unknown;
}

/* -------------------------------------------------------------------------- */
/* File                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The whole saved timeline document: one file, self-contained.
 *
 * `kind: "timeline"` is the JSON-level discriminant against `ArchLabFile` (no
 * `kind` key) and the six other tagged file types, placed right after
 * `version` — the same first-line rule the `.alab` text header follows.
 */
export interface TimelineLabFile {
  /** URL of the JSON Schema, for editor autocomplete. */
  $schema?: string;
  /** "MAJOR.MINOR" — shares the arch-lab version line. */
  version: string;
  /** Document-type discriminant. Always `"timeline"`. */
  kind: "timeline";
  /** Reused, not redeclared: a timeline carries the same title / ownership /
   * timestamp story as the other seven document types. */
  metadata: ArchLabMetadata;
  /** Ordered: declaration order, earliest first. Never sorted. */
  periods: TimelinePeriod[];
  /** Forward tolerance: unknown fields from newer minor versions. */
  [unknown: string]: unknown;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Every event in the file, in declaration order, flattened across periods. */
export function timelineEvents(file: TimelineLabFile): TimelineEvent[] {
  return file.periods.flatMap((period) => period.events);
}

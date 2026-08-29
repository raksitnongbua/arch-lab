/**
 * TypeScript model of the arch-lab GANTT document — the seventh document
 * type, next to the C4 model in `./c4.ts`, the sequence model in
 * `./sequence.ts`, the flowchart model in `./flowchart.ts`, the use-case model
 * in `./usecase.ts`, the ER model in `./er.ts` and the data dictionary in
 * `./dict.ts`. Same conventions as all six: stable human-readable ids,
 * deterministic key order on write, no per-element timestamps, and forward
 * tolerance for unknown fields from newer minors.
 *
 * WHAT A GANTT ANSWERS THAT NO OTHER KIND HERE DOES: how long each piece
 * takes, and what cannot start until it is done. The other six draw order,
 * structure or storage; this one draws DURATION on a measured axis. That is
 * the test `.claude/rules/new-diagram-type.md` sets before a seventh notation
 * may exist, and it is worth being precise about why the two nearest
 * neighbours do not already cover it:
 *
 *   - A SEQUENCE diagram owns *order*. Its vertical axis is the index of a
 *     message, not a quantity — message three is after message two, and the
 *     gap between them means nothing. There is nowhere in it to say "this
 *     takes thirteen days", and adding one would make the axis mean two
 *     incompatible things at once.
 *   - A FLOWCHART owns *dependency*. `a --> b` says b follows a, which is the
 *     same relation `after` spells here — but a flowchart rank is a
 *     topological position, not a date, so two steps on one rank are drawn
 *     side by side whether one takes an hour and the other a quarter. Bolting
 *     dates onto a flowchart would leave the ranks and the dates free to
 *     disagree, and the picture would show the ranks.
 *
 * The distinguishing capability is therefore the SCALED AXIS, and everything
 * below follows from keeping it honest.
 *
 * Four structural rules:
 *
 *   - **The model is RELATIVE. Dates live in exactly one field.** Every
 *     position in this file is a whole number of days from the document's
 *     origin. `origin` is the only field that knows what a calendar is, and
 *     it is optional: a document without one is a perfectly good plan whose
 *     axis reads "W1, W2, W3". This is what makes absolute and relative ONE
 *     notation rather than two — the parser normalises `2026-09-14` to `7` at
 *     the boundary, so layout, float, routing and the critical path never see
 *     a date. A calendar that leaked past this line would have to be
 *     understood by the router, the exporter and every check script.
 *
 *   - **A duration is a count of CALENDAR days.** Not working days. The
 *     alternative needs a working-week definition, then holidays, then
 *     per-region holidays, which is a scheduling engine and not a diagramming
 *     tool. Mermaid's own answer to this is `excludes weekends`, which the
 *     importer refuses by name rather than approximating.
 *
 *   - **Order is data, but position is DERIVED.** `sections` and each
 *     section's `items` are the declaration order and are never sorted on
 *     write. The order a reader SEES is solved from the dependency graph
 *     (`src/features/gantt/lib/layout.ts`), with declaration order as the
 *     tie-break. There is deliberately no `row` or `x` field: a gantt is
 *     laid out from its relationships, in the manner of ER's columns and the
 *     flowchart's ranks, and a coordinate in the text would be a second
 *     source of truth that the next parse would contradict.
 *
 *   - **The critical path is COMPUTED, never declared.** There is no `crit`
 *     flag on an item, and this is the one place the model deliberately
 *     departs from Mermaid's `gantt`, whose `crit` is a decoration the author
 *     types. A declared critical path can disagree with the arithmetic, and
 *     when it does the picture is simply wrong. `GanttItemState` therefore
 *     carries reporting status only; criticality falls out of the float pass.
 *
 * Nothing here is validated at runtime; the `.alab` gantt parser
 * (`src/features/archtext/lib/gantt/parse.ts`) is the loading gate.
 */

import type { ArchLabMetadata } from "./c4";

/* -------------------------------------------------------------------------- */
/* Items                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The closed reporting vocabulary drawn as an item's colour.
 *
 * A CLOSED SET, for the reason `ErAttributeKey` is closed: each value gets its
 * own fill and border from the audited role ramp, and a fourth spelling
 * ("blocked", "in progress", "WIP") would either draw as `planned` or draw as
 * a surprise. Four values, mapped onto colours that already exist in every
 * theme rather than onto a new colour family:
 *
 *   - `planned`  — nothing has happened yet   (`--node-external`, matte)
 *   - `active`   — in flight now              (`--node-internal`, blue)
 *   - `done`     — finished                   (`--node-queue`, green)
 *   - `at-risk`  — in flight and in trouble   (`--flow-decision`, amber)
 *
 * `at-risk` is the one value with no Mermaid `gantt` equivalent, and it is
 * half the reason the converter is import-only: an emit would silently
 * downgrade it to `active` and tell nobody.
 *
 * Absent means `planned`, and absence survives the round trip as absence
 * rather than as the word — a plan where nothing has started should not have
 * `planned` typed on every line.
 */
export type GanttItemState = "planned" | "active" | "done" | "at-risk";

/**
 * One row of the diagram — a task with a duration, or a zero-duration
 * milestone.
 *
 * MILESTONES ARE THE SAME RECORD, not a separate array, and `milestone: true`
 * is a field rather than a discriminated union tag, because everything else
 * about them is identical: they carry an id, they sit in a section, they take
 * `after`, they receive connectors and they occupy a row. Splitting them into
 * their own collection would duplicate the dependency graph across two arrays
 * and let a milestone depend on something in a section it cannot see.
 *
 * The one thing that differs is that a milestone has no `duration`, which the
 * parser enforces — a milestone with a duration is refused rather than
 * silently drawn as a bar, because the whole point of the diamond is that it
 * marks an instant.
 */
export interface GanttItem {
  /** Human-readable slug, unique within the file, stable across renames. */
  id: string;
  /**
   * The name drawn in the label rail. Required, and deliberately not derived
   * from `id`: `dual_read_off` is drawn as "Dual-read off" in a diagram meant
   * to be presented, and the id is what `after` refers to.
   */
  label: string;
  /**
   * Whole calendar days. Required for a task, absent for a milestone.
   *
   * A number rather than a string like `"13d"`: the unit is fixed by the
   * model rule above, so a string would only add a second spelling of the
   * same integer and a parse step for every consumer. The `.alab` text writes
   * `13d` for readability and the parser strips the suffix.
   */
  duration?: number;
  /** Marks a zero-duration instant, drawn as a diamond on the axis. */
  milestone?: boolean;
  /**
   * Ids this item waits for. Ordered as written, never sorted: the order is
   * the author's narration and shows up in a diff as a real change.
   *
   * Absent, not `[]`, when the item waits for nothing — the same
   * absence-survives-round-trip rule `ErEntity.attributes` follows.
   */
  after?: string[];
  /**
   * An explicit start, in days from the document origin.
   *
   * Only meaningful on an item with no `after`: a dependency already fixes
   * the earliest start, and letting both speak would let a file say a task
   * begins before the thing it waits for. The parser refuses `at` together
   * with `after` rather than picking a winner.
   */
  at?: number;
  /** Reporting status. Absent = `planned`. */
  state?: GanttItemState;
  /** Same `#tag` vocabulary as every other document kind. */
  tags?: string[];
  /** <= 500 chars — the note behind the bar, revealed on focus, never drawn
   * inside it: a bar six pixels wide has no room for a sentence. */
  description?: string;
}

/* -------------------------------------------------------------------------- */
/* Sections                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A named band of items — "Prepare", "Cut over", "Retire".
 *
 * Items are NESTED, not a flat list with a `section` field, for the reason
 * `ErEntity.attributes` is nested: membership IS the nesting, so an item
 * belonging to no section is unspellable and the JSON cannot disagree with
 * the text about which band a bar is drawn in.
 *
 * A section has no id. Nothing refers to a section — `after` refers to items,
 * and dependencies cross sections freely — so an id would be a key with no
 * reader, and the label is what the rail draws.
 */
export interface GanttSection {
  /** The name drawn in the rail above the band. */
  label: string;
  /** Ordered: declaration order. Never sorted; the row solve reorders for
   * display without touching this. */
  items: GanttItem[];
}

/* -------------------------------------------------------------------------- */
/* File                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The whole saved gantt document: one file, self-contained.
 *
 * `kind: "gantt"` is the JSON-level discriminant against `ArchLabFile` (no
 * `kind` key) and the five other tagged file types, placed right after
 * `version` — the same first-line rule the `.alab` text header follows.
 */
export interface GanttLabFile {
  /** URL of the JSON Schema, for editor autocomplete. */
  $schema?: string;
  /** "MAJOR.MINOR" — shares the arch-lab version line. */
  version: string;
  /** Document-type discriminant. Always `"gantt"`. */
  kind: "gantt";
  /** Reused, not redeclared: a gantt carries the same title / ownership /
   * timestamp story as the other six document types. */
  metadata: ArchLabMetadata;
  /**
   * The calendar date day 0 falls on, as `YYYY-MM-DD`.
   *
   * THE ONLY CALENDAR-AWARE FIELD IN THE MODEL. Present, and the axis draws
   * dates; absent, and the same document draws `W1, W2, W3`. Nothing else
   * changes — not a bar, not a row, not a connector — because every other
   * position is already a day offset.
   *
   * A plain string rather than a `Date`: this survives JSON, sorts correctly,
   * and carries no timezone, which a plan expressed in whole days must not
   * have. Interpreted as UTC midnight wherever a real date is needed.
   */
  origin?: string;
  /** Ordered: declaration order. Never sorted. */
  sections: GanttSection[];
  /** Forward tolerance: unknown fields from newer minor versions. */
  [unknown: string]: unknown;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Every item in the file, in declaration order, flattened across sections. */
export function ganttItems(file: GanttLabFile): GanttItem[] {
  return file.sections.flatMap((section) => section.items);
}

/**
 * The date an offset falls on, or `null` for a document with no origin.
 *
 * The ONE place day-offset arithmetic meets a calendar, kept here beside the
 * field it reads so the axis renderer does not grow its own copy. UTC
 * throughout: a plan in whole days has no timezone, and using local time here
 * would make a document render a day earlier for readers west of the author.
 */
export function ganttDateAt(
  file: GanttLabFile,
  dayOffset: number,
): Date | null {
  if (!file.origin) return null;
  const parsed = Date.parse(`${file.origin}T00:00:00Z`);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed + dayOffset * 86_400_000);
}

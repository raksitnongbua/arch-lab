/**
 * Keyword tables of the `.alab` TIMELINE grammar — the eighth document type of
 * the arch-lab text format, next to the C4 grammar in `../keywords.ts`, the
 * sequence grammar in `../sequence/keywords.ts`, the flowchart grammar in
 * `../flowchart/keywords.ts`, the use-case grammar in `../usecase/keywords.ts`,
 * the ER grammar in `../er/keywords.ts`, the dictionary grammar in
 * `../dict/keywords.ts` and the gantt grammar in `../gantt/keywords.ts`. One
 * table per mapping, used by both directions, so parser and serializer can
 * never disagree.
 *
 * It lives inside `src/features/archtext/` for the reason every other grammar
 * here does: all nine document types are the SAME text format — same
 * `archlab` header, same header keywords, same `!` escape, same `LineCursor`,
 * same `ArchTextParseError`, same `#tag` micro-grammar — and owning the family
 * in one feature keeps every shared rule imported, never copied.
 *
 * DOCUMENT-TYPE DETECTION (first meaningful line — see `../sequence/detect.ts`):
 *
 *   archlab 1.0            → a C4 document
 *   archlab 1.0 sequence   → a sequence document
 *   archlab 1.0 flowchart  → a flowchart document
 *   archlab 1.0 usecase    → a use-case document
 *   archlab 1.0 er         → an ER document
 *   archlab 1.0 dict       → a data dictionary
 *   archlab 1.0 gantt      → a gantt
 *   archlab 1.0 timeline   → a milestone timeline
 *
 * This parser demands the `timeline` word, so the nine grammars stay mutually
 * exclusive from line 1.
 *
 * THE WHOLE GRAMMAR IS TWO WORDS, and that is the point rather than an
 * unfinished state:
 *
 *   @timeline
 *     period "2024"
 *       event "Founded the company"
 *       event "First ten customers"
 *         desc "Ten teams paying, six of them still customers."
 *     period "2025"
 *       event "Series A" #funding
 *
 * WHAT IS DELIBERATELY ABSENT, and why each absence is load-bearing. This
 * notation sits one keyword away from being a worse gantt at all times
 * (`src/types/timeline.ts` records that the overlap was waived rather than
 * argued away), so the refusals are the design:
 *
 *   - NO DURATION. `5d` on an event would put a length on a point.
 *   - NO `after` AND NO `at`. Both spell a dependency or a coordinate; a
 *     dependency is the gantt's whole subject and a coordinate is what the
 *     `.alab` family solves rather than stores.
 *   - NO STATE VOCABULARY. `planned` / `active` / `done` are about work in
 *     flight; a timeline is about what already happened.
 *   - NO ID. Nothing in this grammar refers to anything, so an id would be a
 *     key with no reader — and an author would reasonably expect to be able
 *     to point at one. See `TimelineEvent`.
 *
 * If a future change finds itself adding any of the four, the honest move is
 * to write a gantt, not to widen this.
 *
 * COLLISION CHECK against the other seven grammars' tokens, done once so
 * nobody has to redo it:
 *
 *   - `timeline` appears in no other grammar as a header word. It was the
 *     gantt's header word until the gantt was renamed to `gantt`, so an old
 *     document headed `archlab 1.0 timeline` will now be READ AS A TIMELINE
 *     and refused by this parser's body rules rather than half-parsed as a
 *     plan — the rename is recorded in `CHANGELOG.md` as the breaking change
 *     it was, and that refusal is asserted by `check:timeline`.
 *   - `period` and `event` appear in no other grammar.
 *   - `desc` is the shared prose continuation, spelled and nested exactly as
 *     it is everywhere else in the family.
 *
 * Imported by `scripts/timeline-check.mjs` through Node's type stripping: keep
 * the syntax erasable and type-only imports as `import type`.
 */

/** The word after the version that marks a timeline document. */
export const TIMELINE_HEADER_WORD = "timeline";

/** The single body block opener (`@timeline`, no id: one timeline per file). */
export const TIMELINE_BLOCK = "@timeline";

/** Opens a band of events, whose events are the lines nested one level in. */
export const PERIOD_KEYWORD = "period";

/** Opens one event — a point inside the period it is nested in. */
export const EVENT_KEYWORD = "event";

/**
 * Words that open a construct at the start of a body line.
 *
 * SMALLER THAN EVERY OTHER GRAMMAR'S RESERVED SET, and it is smaller for a
 * structural reason rather than because the list is short: the sibling
 * grammars reserve words so a BARE ID cannot collide with a keyword
 * (`RESERVED_GANTT_WORDS` exists for `task after "…"`), and this grammar has
 * no bare tokens at all — a period and an event each carry exactly one
 * QUOTED string. So this set feeds only the parser's dispatch, and never a
 * serializer quoting decision, because there is nothing here the serializer
 * could choose to write bare.
 *
 * That is also what makes this grammar's round trip the simplest in the
 * family: with no bare/quoted choice to mirror, the bare-and-quoted symmetry
 * bug class the other seven all have to guard cannot occur here.
 */
export const RESERVED_TIMELINE_WORDS: ReadonlySet<string> = new Set([
  "desc",
  PERIOD_KEYWORD,
  EVENT_KEYWORD,
]);

/**
 * The tables of the Mermaid `gantt` dialect, shared by the importer in
 * `./gantt.ts` and the emitter in `./gantt-emit.ts` — the gantt counterpart of
 * `./timeline-mapping.ts` and `./er-mapping.ts`, and kept as one module for
 * their reason: a table both directions read cannot let import and export
 * disagree about what a glyph means.
 *
 * THE CONVERSION RUNS BOTH WAYS, and the two decisions that make that honest
 * are stated here once, because every other file on this path points at them:
 *
 *   - `at-risk` ⇄ `crit`, A BIJECTION OVER THE CLOSED VOCABULARY. The insight
 *     is that Mermaid's `crit` is a HAND-TYPED DECORATION, and arch-lab
 *     already has a hand-typed alarm: it is called `at-risk`. What the tag
 *     carries across the boundary is the author's own claim "this bar is in
 *     trouble / must not slip", which is exactly the register of `at-risk` —
 *     red in Mermaid, amber here, both louder than `active` and neither
 *     silent. Downgrading it to `active` was the alternative and is the
 *     dishonesty this dialect was import-only to avoid; carrying it in a `%%`
 *     comment was the other, and it leaves the alarm out of the PICTURE,
 *     which is where a status belongs in a product whose product is the
 *     picture.
 *
 *   - THE CRITICAL PATH IS STILL COMPUTED, NEVER DECLARED, and never
 *     SERIALIZED. `crit` maps as a state, not as a path claim. No `crit`
 *     keyword joins the `.alab` grammar, `GanttItem` gains no field, and
 *     `LaidGanttItem.critical` in `src/features/gantt/lib/layout.ts` remains
 *     the only place the word is decided. Emitting the float pass's result as
 *     `crit` was rejected three times over: it would make the emitter import
 *     the gantt feature's scheduling internals for a decoration; it would
 *     write a derived truth as an authored claim that the next edit to a
 *     duration silently falsifies; and it would collide with the mapping
 *     above, since one tag cannot carry both the state and the arithmetic.
 *
 * WHAT EACH DIRECTION LOSES is named in words by the two caveats at the foot
 * of this file. Neither loses a date, a length, a dependency or a state —
 * only metadata AROUND the plan, which is the same shape of loss
 * `MERMAID_TIMELINE_EXPORT_CAVEAT` names.
 *
 * THE ONE DOCUMENT THAT CANNOT TRAVEL is the origin-less plan, whose axis
 * reads `W1, W2, W3`. Mermaid `gantt` has no relative axis — every chart
 * anchors to a real date through `dateFormat` — so `serializeMermaidGantt`
 * refuses it BY NAME rather than inventing a day 0. The argument is on that
 * function.
 *
 * Imported by `scripts/mermaid-check.mjs` through Node's type stripping:
 * keep the syntax erasable (no enums) and type-only imports as `import type`.
 */

import type { GanttItemState } from "@/types";

/* -------------------------------------------------------------------------- */
/* Header                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The word that opens a Mermaid Gantt chart. EXACT, like `erDiagram` and
 * unlike the flowchart pair: Mermaid has a real `gantt` document type, so
 * detection tests one word rather than reading a convention out of another
 * diagram's grammar (the essay `./usecase-mapping.ts` carries).
 */
export const MERMAID_GANTT_HEADER_WORD = "gantt";

/* -------------------------------------------------------------------------- */
/* Task tags                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Mermaid's status tags → the arch-lab reporting state.
 *
 * TOTAL OVER BOTH VOCABULARIES, which is what makes the conversion a
 * bijection rather than an approximation: `GanttItemState` has four values,
 * Mermaid has three tags, and `planned` is the absent tag on both sides (both
 * formats agree that unmarked means not started). Every other value has
 * exactly one spelling here and exactly one there.
 *
 * `crit` earns its row by being read AS A STATE. Mermaid's own docs gloss it
 * as "critical", and a reader of the raw text sees a near-synonym rather than
 * the word `at-risk` — that approximation is stated in both caveats. What it
 * is NOT is a claim about the computed critical path; the file header says
 * why the two are different things that happen to share a word.
 */
export const GANTT_STATE_BY_TAG: Readonly<Record<string, GanttItemState>> = {
  done: "done",
  active: "active",
  crit: "at-risk",
};

/** The tag that makes the row an instant rather than a bar. */
export const GANTT_MILESTONE_TAG = "milestone";

/**
 * The arch-lab reporting state → the tag the emitter writes. DERIVED from
 * `GANTT_STATE_BY_TAG` rather than typed out beside it, so import and export
 * cannot drift: a tag renamed on one side is renamed on the other by
 * construction, and a fifth state would fail to typecheck here until it had a
 * spelling (`.claude/rules/dry.md`, "derive lookups rather than retyping
 * them").
 *
 * `planned` is excluded at the TYPE level, not merely omitted: its Mermaid
 * spelling is the absence of a tag, and a `Record` claiming otherwise would
 * invite a caller to look up a string that does not exist.
 */
export const GANTT_TAG_BY_STATE: Readonly<
  Record<Exclude<GanttItemState, "planned">, string>
> = Object.fromEntries(
  Object.entries(GANTT_STATE_BY_TAG).map(([tag, state]) => [state, tag]),
) as Record<Exclude<GanttItemState, "planned">, string>;

/**
 * Every tag Mermaid may sprinkle through a task's metadata, in any position.
 * Derived from the tables above so a tag can never be recognised by the
 * splitter and then be unknown to the reader that acts on it.
 *
 * POSITION-FREE ON PURPOSE, matching Mermaid's own parser: `getTaskTags`
 * strips these from anywhere in the comma list before the remaining one, two
 * or three fields are read positionally. `:crit, done, after des1, 5d` is
 * real Mermaid and has to import. THE EMITTER READS THIS SET TOO, for the
 * mirror of the same rule: a task id that happens to spell a tag would be
 * stripped out of the metadata by any reader following Mermaid, taking the
 * field count with it, so `gantt-emit.ts` renames such an id rather than
 * writing a row that cannot be read back.
 */
export const GANTT_TASK_TAGS: ReadonlySet<string> = new Set([
  ...Object.keys(GANTT_STATE_BY_TAG),
  GANTT_MILESTONE_TAG,
]);

/* -------------------------------------------------------------------------- */
/* Statement keywords                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Statement keywords parsed and DROPPED, the same contract as the flowchart
 * dialect's `MERMAID_PRESENTATION_KEYWORDS`: each is presentation or
 * interactivity, which arch-lab owns on its own terms.
 *
 *   - `displayMode` (`compact`) and `topAxis` are layout choices, and this
 *     model carries no layout — the same call the flowchart importer makes
 *     about `TD`/`LR`.
 *   - `click` binds a callback or a URL to a bar. A saved `.alab` file has
 *     nowhere to keep it and a shared link must not carry one.
 *   - `accTitle` and `accDescr` are PAGE metadata that every Mermaid diagram
 *     type accepts, saying nothing about the plan — the same call
 *     `./timeline.ts` makes about them. They arrive written with a colon
 *     (`accTitle: Q3 plan`), which is why `./gantt.ts` tests for them
 *     separately from the space-separated settings above; before they were
 *     listed here that colon carried them into the TASK reader, where they
 *     failed with an error about a row that was never a row.
 *
 * Note what is NOT here: the working-week, marker and axis-granularity
 * keywords are REFUSED below rather than dropped, because each of them
 * changes what the picture MEANS rather than how it looks.
 */
export const DROPPED_GANTT_KEYWORDS: ReadonlySet<string> = new Set([
  "displayMode",
  "topAxis",
  "click",
  "accTitle",
  "accDescr",
]);

/**
 * Mermaid Gantt keywords refused BY NAME, each with the sentence the error
 * quotes. A refusal here is never "we did not get round to it": every one of
 * these would otherwise make the chart state something the model cannot mean.
 *
 *   - The working-week family (`excludes`, `includes`, `weekend`,
 *     `weekdays`) declares which days do not count. A duration in this model
 *     is a count of CALENDAR days — the rule is written into
 *     `src/types/gantt.ts`, and honouring `excludes weekends` would make
 *     `5d` draw seven days wide while still reading `5d` in the text.
 *     Dropping it silently is worse: the bars would simply be in the wrong
 *     places, with nothing on the page to say so.
 *   - `todayMarker` is deliberately not a feature. A diagram here is made to
 *     be PRESENTED and shared by link (`.claude/rules/purpose.md`), and a
 *     line drawn at "now" makes a shared link rot visibly — the same chart
 *     reads as on-track in September and as three months late in December,
 *     without anyone having edited it.
 *   - `axisFormat`, `tickInterval` and the singular `weekday` set the axis
 *     granularity, which `src/features/gantt/lib/layout.ts` DERIVES from the
 *     span so that a four-week plan and a four-year plan are both legible. An
 *     author-set interval would be a second source of truth for one number,
 *     and the derived one would win, so the author's would be a setting that
 *     does nothing. `weekday` is the newest entry and is easy to mistake for
 *     the plural `weekdays` above it: that one declares a WORKING WEEK and is
 *     refused on the model's calendar-days rule, this one only says which day
 *     a tick-week starts on.
 *   - `inclusiveEndDates` moves every end date by a day. Taking it would
 *     change what every date on the chart means; ignoring it would make
 *     every bar one day short. There is no third option that is honest.
 */
export const REFUSED_GANTT_KEYWORDS: readonly {
  keyword: string;
  why: string;
}[] = [
  {
    keyword: "excludes",
    why: "it declares a working week, and an arch-lab duration is a count of calendar days — a 5d bar would stop being five days wide",
  },
  {
    keyword: "includes",
    why: "it declares a working week, and an arch-lab duration is a count of calendar days — a 5d bar would stop being five days wide",
  },
  {
    keyword: "weekend",
    why: "it declares which days a working week skips, and an arch-lab duration is a count of calendar days",
  },
  {
    keyword: "weekdays",
    why: "it declares which days a working week counts, and an arch-lab duration is a count of calendar days",
  },
  {
    keyword: "todayMarker",
    why: 'arch-lab has no "today" line on purpose — a diagram meant to be shared by link would read as on-track today and as late next quarter, without anyone editing it',
  },
  {
    keyword: "weekday",
    why: "it names the day a tick-week starts, and arch-lab derives the axis granularity from the span of the plan rather than taking it dictated",
  },
  {
    keyword: "axisFormat",
    why: "arch-lab derives the axis granularity from the span of the plan, so an author-set format would be a second source of truth for the same number",
  },
  {
    keyword: "tickInterval",
    why: "arch-lab derives the tick interval from the span of the plan, so an author-set interval would be a second source of truth for the same number",
  },
  {
    keyword: "inclusiveEndDates",
    why: "it changes what every end date on the chart means, and arch-lab has one meaning for a date — taking it would move every bar, ignoring it would shorten every bar",
  },
];

/* -------------------------------------------------------------------------- */
/* Dates                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The one `dateFormat` this importer reads — Mermaid's own default, and the
 * only spelling `GanttLabFile.origin` has.
 *
 * Other formats are refused rather than parsed. Mermaid's date parsing is
 * dayjs's, whose token language (`DD/MM/YYYY`, `X` for a unix timestamp,
 * locale month names) is a whole dependency's worth of behaviour; guessing at
 * a subset would import `01/02/2026` as either January or February with
 * nothing on the page to say which was chosen. A refusal that names the
 * format leaves the author one edit away from a chart that is right.
 */
export const GANTT_DATE_FORMAT = "YYYY-MM-DD";

/** Shape only — `2026-02-31` matches. Existence is `isRealGanttDate`. */
export const GANTT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Whether an ISO date names a day that exists.
 *
 * A TWIN of the `.alab` gantt parser's private `isRealDate`, and
 * deliberately a second copy: that one is not exported, and the mermaid
 * feature never deep-imports the archtext feature (features meet through
 * barrels — the same call `alabSafeId` in `./text.ts` records about the slug
 * alphabet). Nothing is coupled by the duplication either, because the two
 * answer the same question about the same fixed grammar: `YYYY-MM-DD` is not
 * going to acquire a new meaning on one side only.
 *
 * `Date.UTC` NORMALISES rather than refusing — it turns the 31st of February
 * into the 3rd of March — so the only way to catch one is to build the date
 * and read the three fields back.
 */
export function isRealGanttDate(value: string): boolean {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const built = new Date(Date.UTC(year, month - 1, day));
  return (
    built.getUTCFullYear() === year &&
    built.getUTCMonth() === month - 1 &&
    built.getUTCDate() === day
  );
}

/** Whole days between two `YYYY-MM-DD` dates, `to - from`. UTC midnight on
 * both sides, so the count never depends on the reader's timezone — the same
 * rule `ganttDateAt` states for the other direction. */
export function ganttDayOffset(from: string, to: string): number {
  const MS_PER_DAY = 86_400_000;
  return (
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
    MS_PER_DAY
  );
}

/* -------------------------------------------------------------------------- */
/* Durations                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Duration units accepted, and the days each is worth.
 *
 * Two entries, because a day is the model's atom: `w` is exact arithmetic
 * (seven calendar days, no working week involved — see the refusal table),
 * and everything smaller is refused below rather than rounded.
 */
export const GANTT_DAYS_PER_UNIT: Readonly<Record<string, number>> = {
  d: 1,
  w: 7,
};

/**
 * Sub-day units Mermaid accepts and this importer refuses by name.
 *
 * Rounding was the obvious alternative and is wrong in both directions: `12h`
 * up to `1d` draws a bar twice its length, and down to `0d` turns a task into
 * a milestone — which is a different SYMBOL, not a shorter bar. A plan whose
 * unit is the hour is a plan this notation cannot draw, and saying so is the
 * only honest answer.
 */
export const REFUSED_GANTT_DURATION_UNITS: ReadonlySet<string> = new Set([
  "ms",
  "s",
  "m",
  "h",
]);

/** `30d`, `2w` — a whole count and a unit, with nothing else on the field.
 * Group 1 is the count, group 2 the unit; both tables above judge them. */
export const GANTT_DURATION_RE = /^(\d+)([A-Za-z]+)$/;

/* -------------------------------------------------------------------------- */
/* Start / end forms                                                           */
/* -------------------------------------------------------------------------- */

/** `after des1 des2` — Mermaid's dependency start, ids separated by spaces
 * (not commas: a comma ends the field). Group 1 is the id list. */
export const GANTT_AFTER_RE = /^after\s+(.+)$/;

/**
 * `until des1` — an end tied to another task's start.
 *
 * Refused by name in `./gantt.ts` rather than resolved. It is arithmetic
 * we could do, but only after the whole file is read (the named task may be
 * declared later), and the result would be a `duration` number the author
 * never wrote and cannot see — so the next edit to the OTHER task silently
 * makes this one wrong. A `GanttItem` has a length, not an end.
 */
export const GANTT_UNTIL_RE = /^until\s+(.+)$/;

/* -------------------------------------------------------------------------- */
/* The caveats — what each direction cannot keep                               */
/* -------------------------------------------------------------------------- */

/**
 * What an IMPORT from Mermaid normalises, drops and refuses.
 *
 * Per item, so the UI can say exactly what changed — the same honesty
 * contract as the other import caveats. Leading with the STATE mapping,
 * because `crit` is the entry a Mermaid author is most likely to be looking
 * for and the one whose reading changed.
 */
export const MERMAID_GANTT_CAVEAT =
  "Mermaid gantt converts both ways, and the status tags map one-for-one: " +
  "done is done, active is active, crit is at-risk, and an untagged task is " +
  "planned. crit reads as a STATE and not as a critical path — in arch-lab " +
  "the critical path is computed from the durations and dependencies, so " +
  "nothing you type decides it, while crit and at-risk are both the author " +
  "saying a bar is in trouble. The one combination that loses something is " +
  "crit on a done task: it imports as done and the crit is DROPPED, because " +
  "a finished task is no longer at risk. (done and active together are " +
  "refused instead — neither word outranks the other.) Dates are normalised: " +
  "the earliest date in the chart becomes the document origin and every " +
  "other date becomes a whole number of days from it (the model keeps a " +
  "calendar in exactly one field), and a week-long duration (2w) becomes 14 " +
  "calendar days. Task ids are kept where the metadata gives one and derived " +
  "from the task's text where it does not, renamed deterministically into " +
  'the .alab slug alphabet; a task whose only start is "the previous task ' +
  'ends" imports as an explicit after on that task. displayMode, topAxis and ' +
  "click lines are dropped (layout and interactivity, which arch-lab owns on " +
  "its own terms), accTitle and accDescr are dropped as page metadata, and " +
  "frontmatter keys other than title are dropped. Refused rather than " +
  "guessed, because each would make the chart mean something else: excludes " +
  "/ includes / weekend / weekdays (an arch-lab duration is calendar days), " +
  "todayMarker (a shared link must not rot), axisFormat / tickInterval / " +
  "weekday (the axis granularity is derived from the span), until (an item " +
  "has a length, not an end tied to another task), sub-day durations, and a " +
  `dateFormat other than ${GANTT_DATE_FORMAT}. Save as .alab to keep ` +
  "everything else.";

/**
 * What an EXPORT to Mermaid drops. The mirror of `MERMAID_GANTT_CAVEAT`.
 *
 * NOTHING THE PLAN CLAIMS IS LOST — every section, every row, every date,
 * length, dependency and state survives. What goes is metadata AROUND the
 * plan, plus the computed critical path, which Mermaid has no slot for and
 * which this converter refuses to fake with a hand-typed `crit`
 * (`./gantt-emit.ts` carries that argument). Same shape of loss as
 * `MERMAID_TIMELINE_EXPORT_CAVEAT`.
 */
export const MERMAID_GANTT_EXPORT_CAVEAT =
  "Export to Mermaid keeps the whole plan — every section, row, start, " +
  "length, dependency and state — and drops what gantt has nowhere to put: " +
  "an item's desc, its #tags, and the .alab header beyond the title. The " +
  "COMPUTED CRITICAL PATH is not written either: Mermaid's crit is a tag an " +
  "author types, and this export spends it on the at-risk state, so a " +
  "derived chain written there would be indistinguishable from one somebody " +
  "claimed — use validate_gantt or the canvas, which both show the chain and " +
  "the float. Positions become dates, because every Mermaid gantt anchors to " +
  "a calendar: day 0 is the .alab starts date, durations are always written " +
  "in days (14d, never 2w), and a row with no explicit start is written as " +
  "the origin date rather than left implicit. A PLAN WITH NO starts DATE " +
  "CANNOT BE EXPORTED at all — Mermaid gantt has no relative axis, and no " +
  "date is invented. Two labels are rewritten rather than dropped: a colon " +
  'becomes " - " (it is the dialect\'s separator and has no escape), and a ' +
  "label whose first word is a gantt keyword is written behind a leading " +
  '"- " so the row is not re-read as a setting. A task id that spells a ' +
  "Mermaid tag (done, active, crit, milestone) or carries a character the " +
  "dialect cannot hold is renamed, and every after that names it follows.";

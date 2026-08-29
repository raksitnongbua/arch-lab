/**
 * The tables of the Mermaid `gantt` dialect, read by the importer in
 * `./gantt.ts` — the gantt counterpart of `./flowchart-mapping.ts`,
 * `./usecase-mapping.ts` and `./er-mapping.ts`.
 *
 * THIS IS THE FIRST MAPPING MODULE WITH ONLY ONE READER, and that is the
 * decision the whole pair records: `gantt` is IMPORT-ONLY. Its siblings are
 * shared by an importer and an emitter so the two directions cannot disagree
 * about what a glyph means; here there is no second direction, because two
 * things a gantt says have no Mermaid spelling at all:
 *
 *   - `at-risk`. Mermaid's task vocabulary is `done` / `active` / `crit`
 *     (plus `milestone`), and the closest of those to "in flight and in
 *     trouble" is `active`. An emit would write `active` and tell nobody the
 *     amber bar had turned blue.
 *   - THE CRITICAL PATH. Ours is COMPUTED by the float pass in
 *     `src/features/gantt/lib/layout.ts`; Mermaid's `crit` is a
 *     decoration the author types. Writing our derived path out as `crit`
 *     would turn an arithmetic result into a hand-typed claim that the next
 *     editor of the file can silently falsify — and writing nothing would
 *     drop the one line of the plan that matters most.
 *
 * So the tables below are one-way by construction, and the file that would
 * hold the other direction (`gantt-emit.ts`) does not exist. If a "Copy as
 * Mermaid" item ever seems missing from the gantt share menu, this
 * paragraph is the answer.
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
 * Only two entries, and the gap is the point: `GanttItemState` has four
 * values and Mermaid has two spellings. `planned` is the absent tag (both
 * formats agree that unmarked means not started), and `at-risk` has no
 * Mermaid tag at all — which is half of why this converter is import-only,
 * argued in the file header.
 */
export const GANTT_STATE_BY_TAG: Readonly<Record<string, GanttItemState>> = {
  done: "done",
  active: "active",
};

/** The tag that makes the row an instant rather than a bar. */
export const GANTT_MILESTONE_TAG = "milestone";

/**
 * The tag this importer reads, drops, and names when it drops it.
 *
 * `crit` is not lossiness we regret — it is a construct we refuse to honour.
 * Mermaid's `crit` paints a bar red because someone typed the word; ours
 * falls out of the float pass, which knows the arithmetic. Honouring the
 * typed one would let a document draw a critical path the numbers on the
 * same page disagree with, and the reader has no way to tell which is
 * lying. `MERMAID_GANTT_CAVEAT` names it so the drop is stated rather than
 * discovered.
 */
export const GANTT_CRIT_TAG = "crit";

/**
 * Every tag Mermaid may sprinkle through a task's metadata, in any position.
 * Derived from the tables above so a tag can never be recognised by the
 * splitter and then be unknown to the reader that acts on it.
 *
 * POSITION-FREE ON PURPOSE, matching Mermaid's own parser: `getTaskTags`
 * strips these from anywhere in the comma list before the remaining one, two
 * or three fields are read positionally. `:crit, done, after des1, 5d` is
 * real Mermaid and has to import.
 */
export const GANTT_TASK_TAGS: ReadonlySet<string> = new Set([
  ...Object.keys(GANTT_STATE_BY_TAG),
  GANTT_MILESTONE_TAG,
  GANTT_CRIT_TAG,
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
 *
 * Note what is NOT here: the working-week, marker and axis-granularity
 * keywords are REFUSED below rather than dropped, because each of them
 * changes what the picture MEANS rather than how it looks.
 */
export const DROPPED_GANTT_KEYWORDS: ReadonlySet<string> = new Set([
  "displayMode",
  "topAxis",
  "click",
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
 *   - `axisFormat` and `tickInterval` set the axis granularity, which
 *     `src/features/gantt/lib/layout.ts` DERIVES from the span so that a
 *     four-week plan and a four-year plan are both legible. An author-set
 *     interval would be a second source of truth for one number, and the
 *     derived one would win, so the author's would be a setting that does
 *     nothing.
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

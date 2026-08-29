/**
 * The mapping tables of the Mermaid `timeline` dialect, shared by the importer
 * (`./timeline.ts`) and the emitter (`./timeline-emit.ts`) — the timeline
 * counterpart of `./er-mapping.ts`, kept as one module for the same reason: a
 * table used by both directions cannot let import and export disagree about
 * what a construct means.
 *
 * MERMAID HAS A REAL TIMELINE, and — unlike the gantt next door — it is small
 * enough that CONVERSION IS TWO-WAY. That decision is stated here once and
 * every other file points at it:
 *
 *   - DETECTION IS EXACT, as it is for `erDiagram` and `gantt`: the first
 *     meaningful word behind any frontmatter is `timeline` or it is not.
 *   - CONVERSION IS TWO-WAY. `./timeline-emit.ts` exists, and the share menu
 *     and the pane's format toggle both offer Mermaid for this kind. The
 *     gantt's import-only rule does NOT apply here and the reason is precise:
 *     the gantt refuses to emit because two things it says — `at-risk` and a
 *     COMPUTED critical path — have no Mermaid spelling, so an emit would
 *     downgrade one and misrepresent the other. A timeline says neither. It
 *     has no state vocabulary and nothing derived: a period is a label and an
 *     event is a label, and Mermaid `timeline` holds both exactly.
 *
 * WHAT EACH DIRECTION LOSES, and why neither loss is the gantt's kind of loss:
 *
 *   - IMPORT loses nothing about the diagram, and refuses (rather than
 *     approximates) the one construct Mermaid has that arch-lab does not —
 *     see `REFUSED_TIMELINE_CONSTRUCTS`.
 *   - EXPORT loses `#tag`s, an event's `desc` and the `.alab` header beyond
 *     the title. Mermaid `timeline` has no slot for any of them. That is the
 *     same shape of loss `MERMAID_ER_EXPORT_CAVEAT` names — metadata around
 *     the diagram, never a claim the diagram makes — and it is why this is
 *     "two-way" in the sense C4, sequence and ER are, not "lossless".
 *
 * THE STRUCTURAL MISMATCH, which is the whole of the refusal list. Mermaid's
 * timeline has THREE levels — `section` › period › event — and arch-lab's has
 * TWO: period › event. There is no honest flattening:
 *
 *   - Mapping `section` onto `period` strands the Mermaid period rows, whose
 *     labels are the thing a reader is actually reading.
 *   - Dropping `section` merges bands the author separated, and two periods
 *     that were distinct under different sections could collide on one label.
 *
 * So `section` is REFUSED BY NAME, which `new-diagram-type.md` demands of
 * anything Mermaid can express that arch-lab cannot. A sectioned Mermaid
 * timeline is a real document and the refusal says what to do with it rather
 * than only that it was refused.
 *
 * Imported by `scripts/mermaid-check.mjs` through Node's type stripping:
 * keep the syntax erasable (no enums) and type-only imports as `import type`.
 */

/** The Mermaid header word that opens a timeline document. Exact, not sniffed. */
export const MERMAID_TIMELINE_HEADER_WORD = "timeline";

/** Mermaid's separator between a period and each of its events. */
export const MERMAID_TIMELINE_SEPARATOR = ":";

/**
 * Every Mermaid `timeline` construct this importer refuses BY NAME rather
 * than approximating, each with the sentence the error carries.
 *
 * A TABLE RATHER THAN A LIST OF `if`s, so `scripts/mermaid-check.mjs` can walk
 * it and prove each entry really is refused — the arrangement
 * `REFUSED_GANTT_KEYWORDS` already has. A refusal nobody exercises is a
 * refusal that stops working the first time the parser is restructured.
 */
export const REFUSED_TIMELINE_CONSTRUCTS: readonly {
  /** The Mermaid keyword, as it appears at the start of a line. */
  keyword: string;
  /** What the importer says, worded as what to do next. */
  because: string;
}[] = [
  {
    keyword: "section",
    because:
      "Mermaid groups periods under a `section`, which is a second level of " +
      "grouping above the period. An arch-lab timeline has exactly one: a " +
      "`period` holding `event`s. Flattening would either strand the period " +
      "labels or merge bands you separated, so it is refused rather than " +
      "guessed. Remove the `section` lines, or fold each section's name into " +
      "the period labels under it.",
  },
];

/** Lookup for the importer's dispatch, derived so the two cannot drift. */
export const REFUSED_TIMELINE_BY_KEYWORD: ReadonlyMap<string, string> = new Map(
  REFUSED_TIMELINE_CONSTRUCTS.map((entry) => [entry.keyword, entry.because]),
);

/**
 * What an IMPORT from Mermaid cannot keep. Short, because `timeline` is a
 * small notation and arch-lab's is the same size.
 */
export const MERMAID_TIMELINE_CAVEAT =
  "Mermaid's timeline carries a period label and its event labels, and both " +
  "are imported exactly — including `<br>` line breaks, which become real " +
  "newlines. Two spellings are NORMALISED rather than lost: a continuation " +
  "row (a line beginning `:`) is folded into the period above it, and a " +
  "period written across several rows comes back as one `period` block. " +
  "Frontmatter keys other than `title`, and `accTitle` / `accDescr`, are " +
  "dropped — they are page metadata, not diagram. Refused rather than " +
  "guessed: `section`, because Mermaid groups periods one level above the " +
  "period and arch-lab has only the period itself; and a period row with no " +
  "events, because a band that draws nothing is a heading rather than a " +
  "timeline. Save as .alab to add descriptions and #tags, which Mermaid has " +
  "nowhere to put.";

/** What an EXPORT to Mermaid drops. The mirror of `MERMAID_TIMELINE_CAVEAT`. */
export const MERMAID_TIMELINE_EXPORT_CAVEAT =
  "Export to Mermaid keeps the whole diagram — every period, every event and " +
  "the order of both — and drops what `timeline` has nowhere to put: an " +
  "event's `desc`, its `#tag`s, and the .alab header beyond the title. A " +
  "label containing a newline goes out as `<br/>`, which is Mermaid's own " +
  "spelling and imports back as the newline. Nothing about the timeline " +
  "itself is approximated, which is why this conversion runs both ways.";

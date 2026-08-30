/**
 * `TimelineLabFile` → Mermaid `timeline` code: the reverse of `./timeline.ts`,
 * sitting beside `./er-emit.ts` as the emitting half of the seventh dialect.
 * Both directions read the SAME table (`./timeline-mapping.ts`), so what this
 * writes is by construction what the importer reads back.
 *
 * WHY THIS EMITS UNCONDITIONALLY AND `gantt-emit.ts` DOES NOT, since the two
 * kinds are neighbours and the surviving asymmetry is easy to mistake for an
 * inconsistency: a gantt is anchored to a CALENDAR through Mermaid's
 * `dateFormat`, so a plan with no `starts` line has no date to write and its
 * emitter refuses that document by name rather than inventing one. A timeline
 * is anchored to nothing — a period is a label, an event is a label, and
 * Mermaid holds both exactly — so there is no document of this kind that
 * cannot travel, and this function has no refusal in it at all.
 *
 * WHAT MERMAID CANNOT HOLD, and therefore what this drops — the same honesty
 * contract as the other export caveats, stated by
 * `MERMAID_TIMELINE_EXPORT_CAVEAT`:
 *
 *   - An event's `desc` and its `#tag`s. `timeline` has a slot for neither.
 *   - Everything the `.alab` header carries beyond the title.
 *
 * Nothing about the diagram itself is lost: every period, every event and the
 * order of both survive, and a newline in a label goes out as `<br/>`, which
 * `./timeline.ts` decodes straight back.
 *
 * THE ONE SUBSTITUTION, and it is narrow and deliberate in the manner of
 * `er-emit.ts`'s `typeToken`: `:` is Mermaid's separator between a period and
 * its events, and the dialect gives it no escape. A label containing one is
 * therefore rewritten rather than dropped — a dropped event is a lie about
 * the history, where a rewritten one is a visible approximation the caveat
 * names.
 *
 * Deterministic — identical models always produce identical text, and
 * iteration follows the model's own order.
 *
 * Imported by `scripts/mermaid-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import type { TimelineLabFile, TimelinePeriod } from "@/types";

import { mermaidSeparatorFreeLabel } from "./text";
import {
  MERMAID_TIMELINE_EXPORT_CAVEAT,
  MERMAID_TIMELINE_HEADER_WORD,
  MERMAID_TIMELINE_SEPARATOR,
} from "./timeline-mapping";

export { MERMAID_TIMELINE_EXPORT_CAVEAT };

export interface SerializeMermaidTimelineOptions {
  /** Write the document title as YAML frontmatter. Default true — the same
   * spelling and the same default as the other emitters here. */
  title?: boolean;
}

/**
 * What a cell whose label was made ENTIRELY of separators falls back to.
 *
 * An empty first cell would do the substitution's damage from the other end:
 * the row would open `  : …` and Mermaid would read it as a CONTINUATION of
 * the period above, reparenting every event on it. `-` is the visible
 * placeholder that cannot — worse than the author's label, better than a
 * silently moved event. `mermaidSeparatorFreeLabel` (shared with the gantt
 * emitter, which passes its own) is where the collapse happens.
 */
const EMPTIED_CELL = "-";

/** A label Mermaid's timeline tokenizer can carry: `:` has no escape in this
 * dialect, so "Q3: the rebuild" goes out as "Q3 - the rebuild" — spaced, so
 * the result reads as prose rather than as a hyphenated compound. */
function cellText(text: string): string {
  return mermaidSeparatorFreeLabel(
    text,
    MERMAID_TIMELINE_SEPARATOR,
    EMPTIED_CELL,
  );
}

function periodLine(period: TimelinePeriod): string {
  const cells = [
    cellText(period.label),
    ...period.events.map((event) => cellText(event.label)),
  ];
  return `  ${cells.join(` ${MERMAID_TIMELINE_SEPARATOR} `)}`;
}

/**
 * Serializes a `TimelineLabFile` to Mermaid `timeline` code. Pure and
 * deterministic.
 */
export function serializeMermaidTimeline(
  file: TimelineLabFile,
  options: SerializeMermaidTimelineOptions = {},
): string {
  const lines: string[] = [];
  const title = file.metadata?.title;
  if (options.title !== false && typeof title === "string" && title !== "") {
    lines.push("---", `title: ${JSON.stringify(title)}`, "---");
  }
  lines.push(MERMAID_TIMELINE_HEADER_WORD);

  for (const period of file.periods) {
    lines.push(periodLine(period));
  }

  return `${lines.join("\n")}\n`;
}

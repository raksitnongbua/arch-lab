/**
 * `TimelineLabFile` → Mermaid `timeline` code: the reverse of `./timeline.ts`,
 * sitting beside `./er-emit.ts` as the emitting half of the seventh dialect.
 * Both directions read the SAME table (`./timeline-mapping.ts`), so what this
 * writes is by construction what the importer reads back.
 *
 * WHY THIS FILE EXISTS AND `gantt-emit.ts` DOES NOT, since the two kinds are
 * neighbours and the asymmetry looks arbitrary until it is stated: the gantt
 * refuses to emit because two things it says — the `at-risk` state and a
 * COMPUTED critical path — have no Mermaid spelling, so writing one back would
 * downgrade the first and restate the second as a hand-typed claim the next
 * editor can falsify. A timeline says neither. It has no state vocabulary and
 * derives nothing: a period is a label, an event is a label, and Mermaid holds
 * both exactly. So this conversion runs both ways.
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

import { encodeInlineBreaks } from "./text";
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
 * A label Mermaid's timeline tokenizer can carry.
 *
 * `:` becomes ` - `, spaced so the result still reads as prose rather than as
 * a hyphenated compound: "Q3: the rebuild" goes out as "Q3 - the rebuild".
 * Runs of separators collapse, and the result is trimmed, so `":: x"` does not
 * export as a row that opens with the continuation spelling — which would
 * change which period the event belongs to, and is the one way this
 * substitution could have changed the diagram rather than only its wording.
 *
 * A label made ENTIRELY of separators (`":"`, `"::"`) collapses to nothing,
 * and an empty cell would do that same damage from the other end: the row
 * would open `  : …` and Mermaid would read it as a continuation of the
 * period above. So an emptied cell falls back to `-`. A visible placeholder is
 * worse than the original label and better than a silently reparented event,
 * which is the trade every substitution in this file makes.
 */
const EMPTIED_CELL = "-";

function cellText(text: string): string {
  const withoutSeparators = text
    .split(MERMAID_TIMELINE_SEPARATOR)
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .join(" - ");
  return withoutSeparators === ""
    ? EMPTIED_CELL
    : encodeInlineBreaks(withoutSeparators);
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

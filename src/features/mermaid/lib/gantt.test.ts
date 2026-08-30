/**
 * Unit cover for the Mermaid `gantt` importer — the pure layer beneath
 * `check:mermaid`, per the two-layer split in `.claude/rules/codebase.md`.
 *
 * What these prove, and why each is here rather than left to the check suite:
 *
 *   - THE MAPPING: sections, tasks, milestones, states, `after`, and the
 *     three metadata arities Mermaid reads by count.
 *   - DATE NORMALISATION: the earliest date becomes `origin` and every other
 *     position is a whole number of days from it. This is the model's central
 *     rule, and it is arithmetic — so a failure should name the function, not
 *     say "something moved".
 *   - THE `crit` MAPPING: `crit` is the `at-risk` state in both directions,
 *     and the two stacked combinations Mermaid allows resolve the way §1 of
 *     the design decided. This is the field the dialect was import-only over,
 *     so it is pinned BY NAME rather than left to a round-trip assertion that
 *     would still pass if every state collapsed to `planned`.
 *   - EVERY REFUSAL, BY NAME: each refused construct fails with the construct
 *     in the message. A refusal whose message does not name what it refused
 *     is a dead end for the author, which is what `./flowchart.ts` learned
 *     when a refused circle blocked a real document.
 *   - THE EMIT PATH: the round trip in both generations, the substitutions
 *     that keep a row a row, and the ONE document this converter refuses to
 *     write — the plan with no `starts` date, which Mermaid has no axis for.
 */

import { describe, expect, it } from "vitest";

import { MermaidParseError } from "./errors";
import {
  MERMAID_GANTT_CAVEAT,
  detectMermaidGantt,
  parseMermaidGantt,
} from "./gantt";
import {
  MERMAID_GANTT_EXPORT_CAVEAT,
  MERMAID_GANTT_ORIGIN_REFUSAL,
  serializeMermaidGantt,
} from "./gantt-emit";

/** The message of the `MermaidParseError` the source throws, or a failure —
 * every refusal below asserts on the words the author will read. */
function refusal(source: string): string {
  try {
    parseMermaidGantt(source);
  } catch (error) {
    if (error instanceof MermaidParseError) return error.message;
    throw error;
  }
  throw new Error("expected the import to be refused, but it succeeded");
}

const CHART = `gantt
    title Order store migration
    dateFormat YYYY-MM-DD
    section Prepare
        Schema audit    :done, audit, 2026-09-07, 5d
        Shadow writes   :active, shadow, after audit, 13d
        Parity          :milestone, parity, after shadow, 0d
    section Cut over
        Freeze writes   :freeze, 2026-09-21, 2026-09-23
        Backfill        :20d
`;

describe("detectMermaidGantt", () => {
  it("recognises the header word alone, behind frontmatter and comments", () => {
    expect(detectMermaidGantt(CHART)).toBe(true);
    expect(
      detectMermaidGantt("---\ntitle: Plan\n---\n\n%% note\ngantt\n"),
    ).toBe(true);
  });

  it("does not claim a document whose first line merely mentions gantt", () => {
    expect(detectMermaidGantt("flowchart TD\n  gantt --> x\n")).toBe(false);
    expect(detectMermaidGantt("gantt chart\n")).toBe(false);
  });
});

describe("parseMermaidGantt — the mapping", () => {
  const file = parseMermaidGantt(CHART);

  it("keeps the title, the sections and their order", () => {
    expect(file.kind).toBe("gantt");
    expect(file.metadata.title).toBe("Order store migration");
    expect(file.sections.map((section) => section.label)).toEqual([
      "Prepare",
      "Cut over",
    ]);
  });

  it("maps a task's id, label, duration and state", () => {
    expect(file.sections[0].items[0]).toEqual({
      id: "audit",
      label: "Schema audit",
      duration: 5,
      state: "done",
      at: 0,
    });
    expect(file.sections[0].items[1]).toEqual({
      id: "shadow",
      label: "Shadow writes",
      duration: 13,
      state: "active",
      after: ["audit"],
    });
  });

  it("maps the milestone tag to an instant with no duration", () => {
    expect(file.sections[0].items[2]).toEqual({
      id: "parity",
      label: "Parity",
      milestone: true,
      after: ["shadow"],
    });
  });

  it("leaves an untagged task's state absent rather than writing planned", () => {
    // The model's rule: absence survives the round trip as absence, so a plan
    // where nothing has started does not carry `planned` on every row.
    expect(file.sections[1].items[0].state).toBeUndefined();
  });

  it("reads an end date as a length", () => {
    expect(file.sections[1].items[0].duration).toBe(2);
  });

  it("spells Mermaid's implicit `starts when the previous row ends` as after", () => {
    // One field of metadata is a length; Mermaid starts that row at the
    // previous row's end, and the explicit dependency survives an edit that
    // moves the row.
    expect(file.sections[1].items[1]).toEqual({
      id: "Backfill",
      label: "Backfill",
      duration: 20,
      after: ["freeze"],
    });
  });

  it("derives a deterministic id from the label when the metadata gives none", () => {
    const twice = parseMermaidGantt(
      "gantt\nsection S\n  A task :2026-01-01, 5d\n  A task :2026-01-02, 3d\n",
    );
    expect(twice.sections[0].items.map((item) => item.id)).toEqual([
      "A_task",
      "A_task_2",
    ]);
  });

  it("reads status tags from any position, as Mermaid's own parser does", () => {
    // Mermaid strips tags from anywhere in the comma list before reading what
    // is left by count, so a trailing `done` is real Mermaid and must import.
    const trailing = parseMermaidGantt(
      "gantt\nsection S\n  Work :w1, 2026-01-01, 5d, done\n",
    );
    expect(trailing.sections[0].items[0]).toEqual({
      id: "w1",
      label: "Work",
      duration: 5,
      state: "done",
      at: 0,
    });
  });

  it("converts a week to seven calendar days", () => {
    const file = parseMermaidGantt(
      "gantt\nsection S\n  Work :w1, 2026-01-01, 2w\n",
    );
    expect(file.sections[0].items[0].duration).toBe(14);
  });

  it("drops an empty section rather than drawing a band with no rows", () => {
    const file = parseMermaidGantt(
      "gantt\nsection Empty\nsection Real\n  Work :2026-01-01, 1d\n",
    );
    expect(file.sections.map((section) => section.label)).toEqual(["Real"]);
  });

  it("drops accessibility metadata rather than failing on its colon", () => {
    // These are the two gantt settings written with a colon, and the colon is
    // what introduces a task's metadata — so before they were handled they
    // reached the task reader and failed with a ":"-shaped error about a row
    // nobody had written.
    const file = parseMermaidGantt(
      "gantt\naccTitle: A chart\naccDescr: What it shows\nsection S\n  A :a, 2026-01-01, 1d\n",
    );
    expect(file.sections).toHaveLength(1);
    expect(JSON.stringify(file)).not.toContain("accTitle");
  });

  it("is deterministic: the same source imports byte-identically", () => {
    expect(JSON.stringify(parseMermaidGantt(CHART))).toBe(
      JSON.stringify(parseMermaidGantt(CHART)),
    );
  });
});

describe("parseMermaidGantt — dates become day offsets", () => {
  it("makes the earliest date the origin and everything else an offset", () => {
    const file = parseMermaidGantt(
      `gantt
section S
  Later   :b, 2026-09-21, 3d
  Earlier :a, 2026-09-07, 2d
`,
    );
    expect(file.origin).toBe("2026-09-07");
    expect(file.sections[0].items[0].at).toBe(14);
    expect(file.sections[0].items[1].at).toBe(0);
  });

  it("counts the offset in UTC days across a month and a leap day", () => {
    const file = parseMermaidGantt(
      "gantt\nsection S\n  A :a, 2028-02-27, 1d\n  B :b, 2028-03-01, 1d\n",
    );
    // 2028 is a leap year: 27 Feb → 1 Mar is three days, not two.
    expect(file.sections[0].items[1].at).toBe(3);
  });

  it("leaves origin absent only when no row survived to carry a date", () => {
    // Mermaid's gantt is calendar-based — its first row must give a real
    // start — so an imported chart with rows always has an origin. The
    // absent-origin document (an axis reading W1, W2, W3) is reachable by
    // writing `.alab` directly, not by importing.
    expect(parseMermaidGantt("gantt\nsection Empty\n").origin).toBeUndefined();
  });
});

describe("parseMermaidGantt — crit is the at-risk state", () => {
  it("imports a bare crit task as at-risk", () => {
    const file = parseMermaidGantt(
      "gantt\nsection S\n  Cutover :crit, cut, 2026-01-01, 3d\n",
    );
    expect(file.sections[0].items[0]).toEqual({
      id: "cut",
      label: "Cutover",
      duration: 3,
      state: "at-risk",
      at: 0,
    });
  });

  it("reads `crit, active` as at-risk, which already means in flight", () => {
    // Not a conflict: "in flight and in trouble" contains "in flight", so
    // `active` adds nothing rather than contradicting.
    const file = parseMermaidGantt(
      "gantt\nsection S\n  Cutover :crit, active, cut, 2026-01-01, 3d\n",
    );
    expect(file.sections[0].items[0].state).toBe("at-risk");
  });

  it("reads `crit, done` as done, dropping an alarm that has gone stale", () => {
    // A finished task is no longer at risk, so the fact outranks the status of
    // work that no longer exists. Refusing was rejected: `crit, done` is
    // common real Mermaid, and unlike `done, active` it has a principled
    // winner.
    const file = parseMermaidGantt(
      "gantt\nsection S\n  Cutover :crit, done, cut, 2026-01-01, 3d\n",
    );
    expect(file.sections[0].items[0].state).toBe("done");
  });

  it("names the crit mapping and the crit-on-done drop in the caveat", () => {
    expect(MERMAID_GANTT_CAVEAT).toContain("crit is at-risk");
    expect(MERMAID_GANTT_CAVEAT).toContain("DROPPED");
    expect(MERMAID_GANTT_CAVEAT).toContain("critical path");
  });

  it("no longer calls the conversion one-way, because it is not", () => {
    // The word was load-bearing in this string for a release: the share menu
    // and the format toggle both quoted the decision it recorded.
    expect(MERMAID_GANTT_CAVEAT).not.toContain("one-way");
  });
});

describe("parseMermaidGantt — refusals name the construct", () => {
  const chart = (line: string) =>
    `gantt\n${line}\nsection S\n  A :a, 2026-01-01, 1d\n`;

  it("refuses the working-week keywords", () => {
    expect(refusal(chart("excludes weekends"))).toContain('"excludes"');
    expect(refusal(chart("excludes weekends"))).toContain("calendar days");
    expect(refusal(chart("includes 2026-01-03"))).toContain('"includes"');
    expect(refusal(chart("weekend friday"))).toContain('"weekend"');
    expect(refusal(chart("weekdays monday"))).toContain('"weekdays"');
  });

  it("refuses todayMarker, naming the rot it would cause", () => {
    const message = refusal(chart("todayMarker off"));
    expect(message).toContain('"todayMarker"');
    expect(message).toContain("shared by link");
  });

  it("refuses the axis-granularity keywords as a second source of truth", () => {
    expect(refusal(chart("axisFormat %d/%m"))).toContain('"axisFormat"');
    expect(refusal(chart("tickInterval 1week"))).toContain('"tickInterval"');
    expect(refusal(chart("axisFormat %d/%m"))).toContain(
      "second source of truth",
    );
  });

  it("refuses the singular weekday, which sets the axis granularity", () => {
    // Easy to mistake for the plural `weekdays` above: that one declares a
    // working week, this one only says which day a tick-week starts on — so
    // it is refused on the axis-is-derived rule, not the calendar-days one.
    const message = refusal(chart("weekday monday"));
    expect(message).toContain('"weekday"');
    expect(message).toContain("span of the plan");
  });

  it("refuses inclusiveEndDates, which would move every bar", () => {
    expect(refusal(chart("inclusiveEndDates"))).toContain(
      '"inclusiveEndDates"',
    );
  });

  it("refuses a dateFormat it cannot read, naming the format", () => {
    const message = refusal("gantt\ndateFormat DD/MM/YYYY\n");
    expect(message).toContain("DD/MM/YYYY");
    expect(message).toContain("YYYY-MM-DD");
  });

  it("refuses `until`, which ties a length to another row", () => {
    const message = refusal(
      "gantt\nsection S\n  A :a, 2026-01-01, 1d\n  B :b, 2026-01-02, until a\n",
    );
    expect(message).toContain('"until"');
  });

  it("refuses a sub-day duration rather than rounding it", () => {
    const message = refusal("gantt\nsection S\n  A :a, 2026-01-01, 12h\n");
    expect(message).toContain('"12h"');
    expect(message).toContain("calendar days");
  });

  it("refuses a task that arrives before the first section", () => {
    const message = refusal("gantt\n  A :a, 2026-01-01, 1d\n");
    expect(message).toContain('"A"');
    expect(message).toContain("section");
  });

  it("refuses a milestone that carries a length", () => {
    const message = refusal(
      "gantt\nsection S\n  Cut :milestone, m1, 2026-01-01, 3d\n",
    );
    expect(message).toContain("milestone");
    expect(message).toContain("instant");
  });

  it("refuses a zero-length task, which is a milestone", () => {
    expect(refusal("gantt\nsection S\n  A :a, 2026-01-01, 0d\n")).toContain(
      "milestone",
    );
  });

  it("refuses two reporting states on one row", () => {
    const message = refusal(
      "gantt\nsection S\n  A :done, active, a, 2026-01-01, 1d\n",
    );
    expect(message).toContain('"done"');
    expect(message).toContain('"active"');
  });

  it("refuses a duplicate task id, which `after` could not resolve", () => {
    const message = refusal(
      "gantt\nsection S\n  A :a, 2026-01-01, 1d\n  B :a, 2026-01-02, 1d\n",
    );
    expect(message).toContain('duplicate task id "a"');
  });

  it("refuses a duplicate section, which a reader could not name", () => {
    const message = refusal(
      "gantt\nsection S\n  A :a, 2026-01-01, 1d\nsection S\n  B :b, 1d\n",
    );
    expect(message).toContain("duplicate section");
  });

  it("refuses an `after` that names nothing", () => {
    expect(refusal("gantt\nsection S\n  A :a, after ghost, 1d\n")).toContain(
      '"ghost"',
    );
  });

  it("refuses an end date on a row whose start is a dependency", () => {
    const message = refusal(
      "gantt\nsection S\n  A :a, 2026-01-01, 1d\n  B :b, after a, 2026-01-09\n",
    );
    expect(message).toContain("2026-01-09");
    expect(message).toContain("dependency");
  });

  it("refuses a date that is not a day", () => {
    expect(refusal("gantt\nsection S\n  A :a, 2026-02-31, 1d\n")).toContain(
      "not a day that exists",
    );
  });

  it("refuses a first row that can only start after the previous one", () => {
    expect(refusal("gantt\nsection S\n  A :5d\n")).toContain("previous task");
  });

  it("locates every refusal with a line and a column", () => {
    expect(refusal(chart("todayMarker off"))).toMatch(/^line 2, column 1: /);
  });

  it("refuses a source whose first line is not the header", () => {
    expect(refusal("flowchart TD\n  a --> b\n")).toContain("gantt header");
  });
});

describe("serializeMermaidGantt", () => {
  it("round-trips a parsed chart unchanged in what it draws", () => {
    const file = parseMermaidGantt(CHART);
    const back = parseMermaidGantt(serializeMermaidGantt(file));
    expect(back.sections).toEqual(file.sections);
    expect(back.origin).toBe(file.origin);
    expect(back.metadata.title).toBe(file.metadata.title);
  });

  it("is byte-identical in the second generation", () => {
    // First-generation identity is NOT promised — `2w` canonicalises to `14d`,
    // tags reorder, end dates become durations. What IS promised is that once
    // the text came out of this emitter, emitting it again changes nothing.
    const emitted = serializeMermaidGantt(parseMermaidGantt(CHART));
    expect(serializeMermaidGantt(parseMermaidGantt(emitted))).toBe(emitted);
  });

  it("writes the in-body title, and can be asked not to", () => {
    const file = parseMermaidGantt(CHART);
    expect(serializeMermaidGantt(file)).toContain(
      "title Order store migration",
    );
    expect(serializeMermaidGantt(file, { title: false })).not.toContain(
      "title ",
    );
  });

  it("always writes the dateFormat the dates below it are in", () => {
    const file = parseMermaidGantt(CHART);
    expect(serializeMermaidGantt(file)).toContain("dateFormat YYYY-MM-DD");
  });

  it("carries at-risk out as crit and back as at-risk", () => {
    // The headline claim of the two-way conversion, pinned by name: this is
    // the field the dialect was import-only over.
    const file = parseMermaidGantt(
      "gantt\nsection S\n  Cutover :crit, cut, 2026-01-01, 3d\n",
    );
    const emitted = serializeMermaidGantt(file);
    expect(emitted).toContain("crit");
    expect(parseMermaidGantt(emitted).sections[0].items[0].state).toBe(
      "at-risk",
    );
  });

  it("writes exactly one state tag, never crit beside active", () => {
    const file = parseMermaidGantt(
      "gantt\nsection S\n  Cutover :crit, active, cut, 2026-01-01, 3d\n",
    );
    expect(serializeMermaidGantt(file)).not.toContain("active");
  });

  it("never writes the computed critical path — the emitter cannot see one", () => {
    // The half of the old argument that survives: `crit` is spent on the
    // authored state, and a derived chain written there would be
    // indistinguishable from one somebody claimed. A plan whose every task is
    // on the critical path (one chain, no slack) must still emit no `crit`.
    const file = parseMermaidGantt(
      "gantt\nsection S\n  A :a, 2026-01-01, 3d\n  B :b, after a, 3d\n",
    );
    expect(serializeMermaidGantt(file)).not.toContain("crit");
  });

  it("writes a milestone as the milestone tag and Mermaid's 0d", () => {
    const file = parseMermaidGantt(CHART);
    const emitted = serializeMermaidGantt(file);
    expect(emitted).toContain("milestone");
    expect(emitted).toContain("0d");
    expect(parseMermaidGantt(emitted).sections[0].items[2].milestone).toBe(
      true,
    );
  });

  it("canonicalises a week to 14d rather than re-emitting 2w", () => {
    // One spelling per length is what makes the second generation stable.
    const file = parseMermaidGantt(
      "gantt\nsection S\n  Work :w1, 2026-01-01, 2w\n",
    );
    const emitted = serializeMermaidGantt(file);
    expect(emitted).toContain("14d");
    expect(emitted).not.toContain("2w");
  });

  it("gives a row with neither `at` nor `after` the origin's own date", () => {
    // Emit must write SOME start, and day 0's date is the honest one — the
    // same normalisation the importer applies to Mermaid's implicit
    // previous-row start, in reverse.
    //
    // A SECOND, ANCHORED ROW IS LOAD-BEARING and not scene-setting. With the
    // unanchored row alone this assertion cannot fail: the importer recomputes
    // the origin as the earliest date in the chart, so whatever day the emit
    // picks becomes day 0 and `at: 0` comes back regardless. Written with one
    // row first, it passed with the emitter deliberately writing day 1. The
    // anchored row fixes the origin, so a shifted start shows up as `at: 5`
    // becoming `at: 4`.
    const file = parseMermaidGantt(
      "gantt\nsection S\n  Late :late, 2026-01-06, 3d\n  Early :early, 2026-01-01, 2d\n",
    );
    delete file.sections[0].items[1].at;
    const back = parseMermaidGantt(serializeMermaidGantt(file));
    expect(back.sections[0].items[1].at).toBe(0);
    expect(back.sections[0].items[0].at).toBe(5);
  });

  it("renames a task id that spells a Mermaid tag, and its `after` follows", () => {
    // Mermaid strips tags from ANY metadata position, so an id of `done`
    // would be eaten and the row would read its start as its id. `.alab`
    // reserves none of these words, so the collision is reachable.
    const file = parseMermaidGantt(
      "gantt\nsection S\n  A :a, 2026-01-01, 3d\n  B :b, after a, 2d\n",
    );
    file.sections[0].items[0].id = "done";
    file.sections[0].items[1].after = ["done"];
    const emitted = serializeMermaidGantt(file);
    const back = parseMermaidGantt(emitted);
    expect(back.sections[0].items[0].id).toBe("t_done");
    expect(back.sections[0].items[1].after).toEqual(["t_done"]);
  });

  it("renames an id carrying a character the metadata field cannot hold", () => {
    // A comma ends the field and whitespace splits an `after` list, so either
    // would silently change the row's arity rather than only its spelling.
    const file = parseMermaidGantt(
      "gantt\nsection S\n  A :a, 2026-01-01, 3d\n  B :b, after a, 2d\n",
    );
    file.sections[0].items[0].id = "cut, over";
    file.sections[0].items[1].after = ["cut, over"];
    const back = parseMermaidGantt(serializeMermaidGantt(file));
    expect(back.sections[0].items[0].id).toBe("cut__over");
    expect(back.sections[0].items[1].after).toEqual(["cut__over"]);
  });

  it("leaves a dotted or hyphenated id alone, since the field can hold it", () => {
    // The alphabet is `alabSafeId`'s, so an id this converter produced on the
    // way in survives the way out — otherwise every imported `e-commerce`
    // would drift a character on each trip.
    const file = parseMermaidGantt(
      "gantt\nsection S\n  A :e-commerce.v2, 2026-01-01, 3d\n",
    );
    expect(
      parseMermaidGantt(serializeMermaidGantt(file)).sections[0].items[0].id,
    ).toBe("e-commerce.v2");
  });

  it("substitutes a colon in a label rather than emitting a row that re-splits", () => {
    const file = parseMermaidGantt(
      "gantt\nsection S\n  A :a, 2026-01-01, 3d\n",
    );
    file.sections[0].items[0].label = "Q3: the rebuild";
    const emitted = serializeMermaidGantt(file);
    expect(emitted).toContain("Q3 - the rebuild");
    expect(parseMermaidGantt(emitted).sections[0].items[0].label).toBe(
      "Q3 - the rebuild",
    );
  });

  it("hides a label whose first word is a keyword behind a leading dash", () => {
    // `section review :r, …` would open a SECTION and the task would vanish.
    const file = parseMermaidGantt(
      "gantt\nsection S\n  A :a, 2026-01-01, 3d\n",
    );
    file.sections[0].items[0].label = "section review";
    const back = parseMermaidGantt(serializeMermaidGantt(file));
    expect(back.sections).toHaveLength(1);
    expect(back.sections[0].items[0].label).toBe("- section review");
  });

  it("re-encodes a newline in a label as `<br/>`", () => {
    const file = parseMermaidGantt(
      "gantt\nsection S\n  one<br/>two :a, 2026-01-01, 3d\n",
    );
    expect(serializeMermaidGantt(file)).toContain("one<br/>two");
  });

  it("drops desc and #tags, and the export caveat names both", () => {
    const file = parseMermaidGantt(
      "gantt\nsection S\n  A :a, 2026-01-01, 3d\n",
    );
    file.sections[0].items[0].description = "A note Mermaid has nowhere to put";
    file.sections[0].items[0].tags = ["risky"];
    const item = parseMermaidGantt(serializeMermaidGantt(file)).sections[0]
      .items[0];
    expect(item.description).toBeUndefined();
    expect(item.tags).toBeUndefined();
    expect(MERMAID_GANTT_EXPORT_CAVEAT).toMatch(/desc/i);
    expect(MERMAID_GANTT_EXPORT_CAVEAT).toMatch(/#tag/i);
    expect(MERMAID_GANTT_EXPORT_CAVEAT).toMatch(/critical path/i);
  });

  it("refuses a plan with no `starts` date, naming the line to add", () => {
    // Mermaid gantt has no relative axis — every chart anchors to a calendar
    // through `dateFormat` — and no date is invented here. This is the one
    // document of this kind that cannot travel.
    const file = parseMermaidGantt(
      "gantt\nsection S\n  A :a, 2026-01-01, 3d\n",
    );
    delete file.origin;
    expect(() => serializeMermaidGantt(file)).toThrow(/starts/);
    expect(MERMAID_GANTT_ORIGIN_REFUSAL).toContain("starts YYYY-MM-DD");
  });

  it("is deterministic", () => {
    const file = parseMermaidGantt(CHART);
    expect(serializeMermaidGantt(file)).toBe(serializeMermaidGantt(file));
  });
});

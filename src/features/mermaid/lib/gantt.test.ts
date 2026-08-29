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
 *   - THE `crit` DROP: a crit task imports as an ordinary one, and the caveat
 *     names the tag. The drop is deliberate (the critical path here is
 *     computed), so the test asserts the SILENCE is broken, not just that the
 *     field is absent.
 *   - EVERY REFUSAL, BY NAME: each refused construct fails with the construct
 *     in the message. A refusal whose message does not name what it refused
 *     is a dead end for the author, which is what `./flowchart.ts` learned
 *     when a refused circle blocked a real document.
 *   - NO EMIT PATH: the module exports no serializer, and that absence is a
 *     decision worth a failing test if someone adds one.
 */

import { describe, expect, it } from "vitest";

import { MermaidParseError } from "./errors";
import {
  MERMAID_GANTT_CAVEAT,
  detectMermaidGantt,
  parseMermaidGantt,
} from "./gantt";

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

describe("parseMermaidGantt — crit is dropped, and said out loud", () => {
  it("imports a crit task as an ordinary one", () => {
    const file = parseMermaidGantt(
      "gantt\nsection S\n  Cutover :crit, cut, 2026-01-01, 3d\n",
    );
    expect(file.sections[0].items[0]).toEqual({
      id: "cut",
      label: "Cutover",
      duration: 3,
      at: 0,
    });
  });

  it("keeps a crit tag from blocking the state beside it", () => {
    const file = parseMermaidGantt(
      "gantt\nsection S\n  Cutover :crit, active, cut, 2026-01-01, 3d\n",
    );
    expect(file.sections[0].items[0].state).toBe("active");
  });

  it("names crit in the caveat, so the drop is stated and not discovered", () => {
    expect(MERMAID_GANTT_CAVEAT).toContain("crit");
    expect(MERMAID_GANTT_CAVEAT).toContain("critical path");
  });

  it("names the one-way decision and its two reasons in the caveat", () => {
    expect(MERMAID_GANTT_CAVEAT).toContain("one-way");
    expect(MERMAID_GANTT_CAVEAT).toContain("at-risk");
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

describe("the gantt dialect has no emit path", () => {
  it("exports no serializer, because at-risk and the computed critical path have no Mermaid spelling", async () => {
    const dialect = await import("./gantt");
    expect(
      Object.keys(dialect).filter((name) => name.startsWith("serialize")),
    ).toEqual([]);
  });
});

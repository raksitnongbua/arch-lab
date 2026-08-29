/**
 * Unit tests for the Mermaid `timeline` dialect — the pure mapping, field by
 * field, in the layer `codebase.md` reserves for exactly this: "if it can be
 * proved with a pure function over data, it is a unit test".
 *
 * `scripts/mermaid-check.mjs` covers what only the integration layer can see
 * (that an emit path exists at all, that the refusal table is walked, that no
 * dialect steals another's document). This file covers what a failure should
 * NAME A FUNCTION for.
 */

import { describe, expect, it } from "vitest";

import { MermaidParseError } from "./errors";
import { detectMermaidTimeline, parseMermaidTimeline } from "./timeline";
import { serializeMermaidTimeline } from "./timeline-emit";

const SAMPLE = `timeline
    title How the platform grew
    2016 : Two people and a prototype
    2018 : First paying customer : Split the monolith
    2024 : Opened the public API
`;

describe("detectMermaidTimeline", () => {
  it("claims a document whose first meaningful word is `timeline`", () => {
    expect(detectMermaidTimeline(SAMPLE)).toBe(true);
  });

  it("looks behind frontmatter and comments", () => {
    expect(
      detectMermaidTimeline(
        "---\ntitle: T\n---\n%% a note\ntimeline\n  a : b\n",
      ),
    ).toBe(true);
  });

  it("refuses a header carrying anything after the word", () => {
    // The header takes no argument, so a line with more on it is not one —
    // recognising it here would hand the parser a document it then refuses.
    expect(detectMermaidTimeline("timeline LR\n  a : b\n")).toBe(false);
  });

  it("refuses the other dialects' headers", () => {
    for (const header of [
      "gantt",
      "erDiagram",
      "sequenceDiagram",
      "flowchart TD",
    ]) {
      expect(detectMermaidTimeline(`${header}\n`)).toBe(false);
    }
  });
});

describe("parseMermaidTimeline", () => {
  it("reads periods and their events in order", () => {
    const file = parseMermaidTimeline(SAMPLE);
    expect(file.kind).toBe("timeline");
    expect(file.periods.map((period) => period.label)).toEqual([
      "2016",
      "2018",
      "2024",
    ]);
    expect(file.periods[1].events.map((event) => event.label)).toEqual([
      "First paying customer",
      "Split the monolith",
    ]);
  });

  it("takes the in-body title over frontmatter", () => {
    // The in-body spelling is what a hand-written document uses, so it wins.
    const file = parseMermaidTimeline(
      '---\ntitle: "From the fence"\n---\ntimeline\n  title From the body\n  2024 : x\n',
    );
    expect(file.metadata.title).toBe("From the body");
  });

  it("folds a continuation row into the period above it", () => {
    const file = parseMermaidTimeline(
      "timeline\n  2004 : Facebook\n       : Google\n",
    );
    expect(file.periods).toHaveLength(1);
    expect(file.periods[0].events.map((event) => event.label)).toEqual([
      "Facebook",
      "Google",
    ]);
  });

  it("decodes `<br>` to a real newline", () => {
    const file = parseMermaidTimeline("timeline\n  2024 : one<br/>two\n");
    expect(file.periods[0].events[0].label).toBe("one\ntwo");
  });

  it("skips an empty trailing cell rather than making an empty event", () => {
    const file = parseMermaidTimeline("timeline\n  2024 : one :\n");
    expect(file.periods[0].events).toHaveLength(1);
  });

  it("drops accessibility metadata rather than refusing it", () => {
    const file = parseMermaidTimeline(
      "timeline\n  accTitle: A\n  accDescr: B\n  2024 : x\n",
    );
    expect(file.periods).toHaveLength(1);
  });

  it("is deterministic — the same source gives the same model", () => {
    expect(JSON.stringify(parseMermaidTimeline(SAMPLE))).toBe(
      JSON.stringify(parseMermaidTimeline(SAMPLE)),
    );
  });

  it("refuses `section` by name, because arch-lab has one level of grouping", () => {
    expect(() =>
      parseMermaidTimeline("timeline\n  section 1700s\n  1750 : Steam\n"),
    ).toThrow(/section/);
  });

  it("refuses a period row with no events", () => {
    expect(() => parseMermaidTimeline("timeline\n  2002\n")).toThrow(
      /no events/i,
    );
  });

  it("refuses the same period label twice", () => {
    expect(() =>
      parseMermaidTimeline("timeline\n  2002 : a\n  2002 : b\n"),
    ).toThrow(/twice/i);
  });

  it("refuses a continuation row with no period above it", () => {
    expect(() => parseMermaidTimeline("timeline\n  : orphan\n")).toThrow(
      /no period has been declared/i,
    );
  });

  it("locates every failure", () => {
    try {
      parseMermaidTimeline("timeline\n  2002 : a\n  section X\n");
      throw new Error("it parsed");
    } catch (error) {
      expect(error).toBeInstanceOf(MermaidParseError);
      expect((error as MermaidParseError).line).toBe(3);
      expect((error as MermaidParseError).column).toBeGreaterThan(0);
    }
  });
});

describe("serializeMermaidTimeline", () => {
  it("round-trips a parsed document unchanged in what it draws", () => {
    const file = parseMermaidTimeline(SAMPLE);
    const back = parseMermaidTimeline(serializeMermaidTimeline(file));
    expect(back.periods).toEqual(file.periods);
  });

  it("writes the title as frontmatter, and can be asked not to", () => {
    const file = parseMermaidTimeline(SAMPLE);
    expect(serializeMermaidTimeline(file)).toContain("title:");
    expect(serializeMermaidTimeline(file, { title: false })).not.toContain(
      "title:",
    );
  });

  it("re-encodes a newline as `<br/>`", () => {
    const file = parseMermaidTimeline("timeline\n  2024 : one<br/>two\n");
    expect(serializeMermaidTimeline(file)).toContain("one<br/>two");
  });

  it("substitutes `:` rather than emitting a row Mermaid would re-split", () => {
    // `:` is the dialect's separator and has no escape, so a label carrying
    // one is rewritten — a visible approximation beats an event that silently
    // becomes two.
    const file = parseMermaidTimeline("timeline\n  2024 : x\n");
    file.periods[0].events[0].label = "Q3: the rebuild";
    const emitted = serializeMermaidTimeline(file);
    expect(emitted).toContain("Q3 - the rebuild");
    expect(parseMermaidTimeline(emitted).periods[0].events).toHaveLength(1);
  });

  it("never emits a row that opens with the continuation spelling", () => {
    // A label made entirely of separators collapses to nothing, and an empty
    // first cell would reparent every event on the row to the period above.
    const file = parseMermaidTimeline("timeline\n  2024 : x\n");
    file.periods[0].label = ":";
    const emitted = serializeMermaidTimeline(file);
    expect(
      emitted.split("\n").some((line) => line.trim().startsWith(":")),
    ).toBe(false);
    expect(parseMermaidTimeline(emitted).periods).toHaveLength(1);
  });

  it("is deterministic", () => {
    const file = parseMermaidTimeline(SAMPLE);
    expect(serializeMermaidTimeline(file)).toBe(serializeMermaidTimeline(file));
  });
});

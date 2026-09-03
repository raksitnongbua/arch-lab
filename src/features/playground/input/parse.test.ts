/**
 * The pane reader's repair offer.
 *
 * `.alab` indentation is significant, so text copied out of somewhere that had
 * its own indentation — a chat window, a nested code block — arrives shifted
 * on every line and refuses at the first line where the shift becomes
 * illegal. The error names one line when every line moved, which is the least
 * useful accurate thing a parser can say.
 *
 * These pin the two halves of the answer: the offer appears when a dedent
 * genuinely fixes the document, and it does NOT appear otherwise — a button
 * that might not work is worse than no button, because a reader who presses it
 * and sees the same failure now distrusts the panel as well as their paste.
 */

import { describe, expect, it } from "vitest";

import { indentRepairFor, parseViewSource } from "./parse";

const GOOD = `archlab 1.0
title "T"

@context ctx "Root"
  a:person "A"
  b:system "B"

  a -> b : "asks"
`;

/** `GOOD` with every line from the diagram header down shifted right. */
function shifted(by: number): string {
  const pad = " ".repeat(by);
  return GOOD.split("\n")
    .map((line, index) => (index < 2 || line === "" ? line : `${pad}${line}`))
    .join("\n");
}

describe("indentRepairFor", () => {
  it("offers nothing for text that already parses", () => {
    expect(parseViewSource(GOOD).status).toBe("ok");
    expect(indentRepairFor(GOOD)).toBeNull();
  });

  /* The reported case: a paste that picked up two spaces of surrounding
     indentation, which refuses at the `@context` line. */
  it("undoes a two-space shift and says how far", () => {
    const broken = shifted(2);
    expect(parseViewSource(broken).status).toBe("error");
    const repair = indentRepairFor(broken);
    expect(repair?.spaces).toBe(2);
    expect(repair?.text).toBe(GOOD);
  });

  it("undoes a four-space shift too", () => {
    expect(indentRepairFor(shifted(4))?.spaces).toBe(4);
  });

  /* Proved, never guessed: the offer exists only because the real reader
     accepted the rewrite, so it cannot suggest a second failure. */
  it("returns text the reader actually accepts", () => {
    const repair = indentRepairFor(shifted(6));
    expect(repair).not.toBeNull();
    expect(parseViewSource(repair!.text).status).toBe("ok");
  });

  it("offers nothing when the failure is not the indentation", () => {
    const typo = GOOD.replace("a:person", "a:persson");
    expect(parseViewSource(typo).status).toBe("error");
    expect(indentRepairFor(typo)).toBeNull();
  });

  /* A shift deeper than the grammar's deepest rung is not a shift, it is a
     different document — and dedenting it would not produce one that parses,
     so nothing is offered. */
  it("offers nothing for a shift past every rung of the ladder", () => {
    expect(indentRepairFor(shifted(9))).toBeNull();
  });

  it("offers nothing for text with no indentation to give back", () => {
    expect(indentRepairFor("nonsense\n")).toBeNull();
  });
});

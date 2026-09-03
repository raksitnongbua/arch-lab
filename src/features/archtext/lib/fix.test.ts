/**
 * The quick-fix primitives. Every function here decides where an edit LANDS,
 * so a failure is a mangled document rather than a wrong answer — which is
 * why these are unit tests and not left to `check:quickfix`: the check proves
 * a fix advances the parse, and would report an off-by-one in `offsetOf` as
 * "the fix did not help" without ever naming the arithmetic that broke.
 */

import { describe, expect, it } from "vitest";

import {
  applyTextEdit,
  closestMatches,
  commentStart,
  deleteLine,
  insertLineBefore,
  offsetOf,
  quoteTail,
  reindentLine,
  replaceOnLine,
} from "./fix";
import { sourceLines } from "@/lib/source-text";

const DOC = 'archlab 1.0\ntitle "Payments"\n\n@context root "Ctx"\n';

describe("offsetOf", () => {
  it("agrees with sourceLines on where every line starts", () => {
    const lines = sourceLines(DOC);
    for (let i = 0; i < lines.length; i += 1) {
      const start = offsetOf(DOC, { line: i + 1, column: 1 });
      expect(DOC.slice(start, start + lines[i].length)).toBe(lines[i]);
    }
  });

  /* A CRLF document must not shift every offset below line 1 by one per line.
     Assumed separators of width 1 land the edit inside the previous token. */
  it("reads the separator width off the source, so CRLF lands right", () => {
    const crlf = DOC.replace(/\n/g, "\r\n");
    const start = offsetOf(crlf, { line: 4, column: 1 });
    expect(crlf.slice(start, start + 8)).toBe("@context");
  });

  it("clamps rather than throwing on a position past the end", () => {
    expect(offsetOf(DOC, { line: 99, column: 99 })).toBeLessThanOrEqual(
      DOC.length,
    );
  });
});

describe("applyTextEdit", () => {
  it("applies two edits on one line without either moving the other", () => {
    const out = applyTextEdit("a -> b", [
      replaceOnLine(1, 1, 2, "api"),
      replaceOnLine(1, 6, 7, "web"),
    ]);
    expect(out).toBe("api -> web");
  });

  /* Refused rather than resolved: a candidate whose halves fight is a bug in
     the parser that built it, and silently picking one produces a document
     neither half meant. */
  it("refuses overlapping edits", () => {
    expect(() =>
      applyTextEdit("abcdef", [
        replaceOnLine(1, 1, 4, "x"),
        replaceOnLine(1, 3, 6, "y"),
      ]),
    ).toThrow(/overlapping/);
  });

  it("inserts a whole line above another", () => {
    expect(applyTextEdit("b\nc\n", [insertLineBefore(1, "a")])).toBe(
      "a\nb\nc\n",
    );
  });

  /* Deleting to the end of the line leaves a blank row — a visible scar on a
     document the reader asked to have repaired. */
  it("deletes a line without leaving a blank row", () => {
    expect(applyTextEdit("a\nb\nc\n", [deleteLine(2)])).toBe("a\nc\n");
  });
});

describe("reindentLine", () => {
  it("replaces a tab indent outright rather than adding spaces beside it", () => {
    const text = '@sequence\n\tuser -> api : "Hi"\n';
    expect(applyTextEdit(text, [reindentLine(text, 2, 2)])).toBe(
      '@sequence\n  user -> api : "Hi"\n',
    );
  });

  it("widens an indent that is one rung short", () => {
    const text = '@context root "Ctx"\n api:person "A"\n';
    expect(applyTextEdit(text, [reindentLine(text, 2, 2)])).toBe(
      '@context root "Ctx"\n  api:person "A"\n',
    );
  });
});

describe("closestMatches", () => {
  const TYPES = [
    "person",
    "system",
    "container",
    "component",
    "database",
    "queue",
    "external",
    "group",
  ];

  it("ranks the intended keyword first for a one-letter slip", () => {
    expect(closestMatches("sistem", TYPES)[0]).toBe("system");
  });

  /* The transposition is the whole reason for Damerau over Levenshtein: plain
     Levenshtein scores `sytem` at 2, far enough to lose to an unrelated word
     of the same length. */
  it("catches a transposition", () => {
    expect(closestMatches("sytem", TYPES)[0]).toBe("system");
  });

  it("returns nothing for a word no candidate is near", () => {
    expect(closestMatches("aardvark", TYPES)).toEqual([]);
  });

  /* A flat cutoff of 2 matches almost the whole set on the two- and
     three-character tokens this format is full of, and a list of near-misses
     that are not near makes the reader audit the suggestions instead of the
     document. */
  it("keeps a short token from matching everything", () => {
    expect(closestMatches("=>", ["->", "..>"]).length).toBeLessThanOrEqual(1);
  });

  it("breaks a tie by declared order, not alphabetically", () => {
    // Both are distance 1 from "cont"; the table's order must decide.
    expect(closestMatches("con", ["container", "component", "cont"])).toEqual([
      "cont",
    ]);
    expect(closestMatches("xont", ["container", "cont", "font"])).toEqual([
      "cont",
      "font",
    ]);
  });

  it("treats case as a near match rather than a distant one", () => {
    expect(closestMatches("System", TYPES)[0]).toBe("system");
  });
});

describe("quoteTail", () => {
  /* A tail carrying a quote or a backslash wrapped by hand fails at a NEW
     column, and a fix that trades one error for another is worse than none. */
  it("is the exact inverse of the parser's JSON.parse", () => {
    const raw = 'a "quoted" \\ path';
    expect(JSON.parse(quoteTail(raw))).toBe(raw);
  });

  it("drops trailing spaces that would otherwise land inside the string", () => {
    expect(quoteTail("Pays   ")).toBe('"Pays"');
  });
});

describe("commentStart", () => {
  it("finds the comment a fix must not be allowed to rewrite", () => {
    expect(commentStart("api -> web // for now")).toBe(11);
    expect(commentStart("api -> web")).toBe(-1);
  });
});

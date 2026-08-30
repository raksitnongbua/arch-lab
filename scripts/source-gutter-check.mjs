#!/usr/bin/env node
/**
 * Line-number gutters: one rule, every surface that draws one.
 *
 * THE HAZARD IS THE ONE `lib/source-text.ts` ALREADY EXISTS FOR. Its own header
 * records that four modules had each privately written `split("\n")` before
 * `sourceLineAt` was extracted. Line NUMBERING then repeated the mistake
 * immediately: `/live`'s editable gutter and `/syntax`'s read-only one each
 * carried their own copy of "drop the trailing newline, then count", and the
 * copies had already diverged — the read-only one had lost the floor of 1, so an
 * empty snippet drew no number at all. Meanwhile `/validate`, the one page whose
 * entire output is "line 12, column 4", had no gutter whatsoever.
 *
 * None of that is visible in review: three surfaces that look alike, one of them
 * subtly wrong and one of them missing. So this asserts the sharing rather than
 * the appearance:
 *
 *   1. `lineCount` is the only place the trailing-newline rule lives, and it
 *      really applies it — proved by cases that return a different number
 *      without it, not by cases that pass either way.
 *   2. Every gutter derives its count from it — no surface may recompute.
 *   3. Every pane a reader types a DOCUMENT into has a gutter, `/validate`
 *      included, because a parse error's line number is useless against rows
 *      nobody can count.
 *   4. Every gutter is `aria-hidden` and `select-none`. A number caught in a
 *      copy breaks the paste, which on panes whose whole job is text that parses
 *      is the worst failure available.
 *   5. A gutter whose lines WRAP measures its rows against the text itself. The
 *      editable pane wraps now — long `desc` lines were unreadable running off
 *      to the right — and soft wrap is the other way for a gutter to lie: one
 *      line becomes several rows, and a plain list of numbers drifts from the
 *      first wrap onwards.
 *
 * WHAT IS DELIBERATELY NOT ASSERTED: that the surfaces share a type scale. The
 * rows only have to align WITHIN one surface, so an editable pane and a read-only
 * snippet both landing on `text-xs` is coincidence. Pinning it would invent a
 * constraint and then make a legitimate change to one surface fail.
 *
 * Run with: pnpm check:source-gutter
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { lineCount, sourceLines } from "../src/lib/source-text.ts";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

/** Every surface that draws numbers beside text, and what kind it is. */
const GUTTERS = [
  {
    label: "the editable gutter",
    file: "src/components/ui/numbered-textarea.tsx",
    /* This one WRAPS, which is a second way for a gutter to lie — see 5. */
    wraps: true,
  },
  {
    label: "the read-only gutter",
    file: "src/features/syntax-docs/components/code-block.tsx",
  },
];

/** Every pane a reader types a whole document into. */
const DOCUMENT_PANES = [
  {
    label: "/live",
    file: "src/features/playground/components/view-playground.tsx",
  },
  {
    label: "/validate",
    file: "src/features/validate/components/validator.tsx",
  },
];

let assertions = 0;
let failures = 0;
function check(label, run) {
  assertions += 1;
  try {
    run();
    console.log(`  ✓ ${label}`);
  } catch (error) {
    failures += 1;
    console.error(`  ✗ ${label}`);
    console.error(`    ${error instanceof Error ? error.message : error}`);
  }
}

/* ---- 1. the rule itself, exercised rather than read ---------------------- */

check("lineCount drops only the final newline", () => {
  /* Imported and CALLED, not regex-matched: this script loads the real module
     through Node's type stripping, the same way the rest of the suite exercises
     shipped code instead of a copy of it.

     The first group DISCRIMINATES — each case returns a different number if the
     trailing-newline rule is removed, which is what makes them worth running.
     The second group pins a contract that holds for free and is here so a future
     rewrite cannot quietly change it. That split is stated because an assertion
     which cannot fail is worse than no assertion: it reads as coverage. Asking
     this question of the old `Math.max(1, …)` floor is what revealed the floor
     could never fire, and it has since been deleted. */
  assert.equal(lineCount("a\n"), 1, "a trailing newline is not a line");
  assert.equal(lineCount("a\nb\n"), 2, "…nor at the end of a real document");
  assert.equal(lineCount("\n"), 1, "a lone newline is one empty line, not two");
  assert.equal(lineCount("a\n\n"), 2, "a deliberate blank line IS a line");

  assert.equal(lineCount(""), 1, "an empty pane must still offer a line 1");
  assert.equal(lineCount("a"), 1);
  assert.equal(lineCount("a\nb"), 2);
  assert.equal(lineCount("a\r\nb\r\n"), 2, "CRLF counts the same as LF");

  /* And the two exports cannot drift apart, because one is the other's length
     — asserted rather than assumed, since a gutter that lays a number beside
     each line and a count that says how many numbers there are would put the
     document one row out of step if they ever disagreed. */
  for (const text of ["", "a", "a\n", "a\nb", "a\n\n", "a\r\nb\r\n"]) {
    assert.equal(sourceLines(text).length, lineCount(text));
  }
  assert.deepEqual(sourceLines("a\nb\n"), ["a", "b"]);
});

/* ---- 2. nobody recomputes it -------------------------------------------- */

check("every gutter derives its count from lineCount", () => {
  for (const { label, file } of GUTTERS) {
    const source = read(file);
    /* Either name: a gutter that wraps needs the LINES (it lays each number
       out beside a copy of its own line), one that does not needs only how
       many there are. Both come from the same rule — `lineCount` is defined
       as `sourceLines(...).length` — so importing either is importing it. */
    assert.match(
      source,
      /import \{ (lineCount|sourceLines) \} from "@\/lib\/source-text"/,
      `${label} (${file}) imports neither lineCount nor sourceLines`,
    );
    /* The private expression, in either of the two shapes it appeared in. A
       third surface writing it again is the regression this catches. */
    assert.ok(
      !/replace\(\/\\r\?\?\\n\$\/[^)]*\)\s*\.\s*split/.test(source) &&
        !/\.split\("\\n"\)\.length/.test(source),
      `${label} still computes a line count itself`,
    );
  }
});

/* ---- 3. every document pane has one ------------------------------------- */

check("every pane a document is typed into is numbered", () => {
  for (const { label, file } of DOCUMENT_PANES) {
    const source = read(file);
    assert.match(
      source,
      /<NumberedTextarea\b/,
      `${label} takes a whole document but has no line-number gutter — a parse ` +
        `error's "line 12" is unusable against rows nobody can count`,
    );
    /* A bare `Textarea` here is how `/validate` came to differ from `/live` in
       the first place: the shared component was added, two surfaces adopted it,
       and the third kept the plain control it already had. */
    assert.ok(
      !/<Textarea\b/.test(source),
      `${label} still mounts a plain Textarea for document source`,
    );
  }
});

/* ---- 4. the numbers can never reach a clipboard ------------------------- */

check("no gutter is selectable or announced", () => {
  for (const { label, file } of GUTTERS) {
    const source = read(file);
    for (const rule of ['aria-hidden="true"', "select-none"]) {
      assert.ok(
        source.includes(rule),
        `${label} is missing ${rule} — a number in a paste breaks the parse, ` +
          `and a screen reader reading "one two three" before every line is noise`,
      );
    }
  }
});

/* ---- 5. a wrapping gutter is measured by the text ----------------------- */

check("the wrapping gutter mirrors the text it numbers", () => {
  for (const { label, file, wraps } of GUTTERS) {
    if (wraps !== true) continue;
    /* COMMENTS STRIPPED FIRST, and that is not tidiness. Every rule below
       greps for the very words the file's own header uses to explain the rule
       — the `content-start` assertion was written, run green, and then proved
       green against code with `content-start` DELETED, because the prose two
       lines above still said it. An assertion that reads the explanation of
       the code instead of the code passes forever. */
    const source = read(file).replace(/\/\*[\s\S]*?\*\//g, "");

    /* THE FAILURE THIS EXISTS FOR: soft wrap turns one line into several rows
       while a plain list of numbers still draws one row per line, so every
       number after the first wrapped line sits beside the wrong text. The fix
       is that each number is laid out beside an invisible copy of its own
       line, so the row is as tall as the wrap made it. Losing the copy — or
       losing the wrapping on it — silently reintroduces the drift. */
    assert.ok(
      /wrap="soft"/.test(source),
      `${label} no longer soft-wraps; if that is deliberate, this rule and the ` +
        `mirror it guards should go with it`,
    );
    assert.ok(
      /invisible[^"]*whitespace-pre-wrap/.test(source),
      `${label} has no invisible wrapping mirror beside its numbers — the rows ` +
        `no longer measure the wrap, so every number after a wrapped line lies`,
    );

    /* The mirror only predicts the wrap while it agrees with the textarea
       about the type scale and BOTH horizontal insets. Shared constants are
       the mechanism; a literal reappearing on one side is the regression. */
    for (const shared of ["const TYPE", "const PAD_Y", "const PAD_X"]) {
      assert.ok(
        source.includes(shared),
        `${label} lost ${shared} — the mirror and the textarea must take their ` +
          `font, line height and insets from one place or the wrap points move`,
      );
    }
    /* THE SECOND WAY THE ROWS DRIFT, and it shipped: the rows sit in a grid
       that is `min-h-full` so the gutter's ground reaches the bottom of a
       pane the document does not fill — and a grid's default `align-content`
       spends that leftover height BY GROWING THE ROWS. The textarea laid over
       them does not grow, so a short document drew its numbers down a pane
       twice as tall as its text. Only start-alignment leaves the slack at the
       bottom where it belongs. */
    assert.ok(
      !/\bmin-h-full\b/.test(source) || /\bcontent-start\b/.test(source),
      `${label} stretches a min-height grid without content-start — the spare ` +
        `height is shared out among the rows and every number drifts down`,
    );
    assert.ok(
      !/\brows=\{/.test(source),
      `${label} sizes itself with rows again — the textarea is laid over the ` +
        `mirror and is as tall as its content, so height belongs to the wrapper`,
    );
  }
});

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} source-gutter assertions passed.`);

#!/usr/bin/env node
/**
 * The heading a canvas draws: retyping it has to become TEXT, and it has to
 * leave the rest of the author's header alone.
 *
 * `retitle` is the FIFTH canvas-edit ability and the only one that addresses
 * the DOCUMENT rather than an element. That is what earned it a row:
 * `title` and `description` are the shared header, so no grammar can refuse
 * this on `"grammar"` grounds and no per-element span is involved — what a
 * cell gates on instead is whether its canvas draws the heading at all.
 *
 * It loads the REAL module through Node's type stripping, which also PINS THE
 * PURITY of `retitle-edit.ts` the way `check:canvas-edit` does for its
 * siblings: type stripping cannot read `.tsx`, so an import reaching a feature
 * barrel that exports a component fails here loudly instead of silently
 * removing the module from the only harness it has.
 *
 * What it asserts:
 *
 *   1. THE GESTURE ASKS THE GRID ITSELF. Pointed at a notation whose cell
 *      refuses, it returns null — the refusal is real at the gesture, not
 *      advisory at the table.
 *   2. A RETITLE IS A ONE-LINE PATCH. The title line is replaced in place and
 *      every other header line, comment and blank line is untouched. Proved
 *      from deliberately non-canonical text, because a re-emit of canonical
 *      text IS canonical text and would pass a weaker test.
 *   3. AN EMPTY TITLE IS REFUSED. Every grammar requires a title, so accepting
 *      a cleared field would write a document this repo's own parser rejects.
 *   4. ABSENT AND EMPTY ARE DIFFERENT for the description: `undefined` leaves
 *      the line alone, `""` REMOVES it. Writing `description ""` would be a
 *      document the canonical form cannot contain, so the next save would
 *      delete it and the round trip would disagree with the pane in between.
 *   5. WRITING A DESCRIPTION WHERE THERE WAS NONE IS AN INSERT, and it lands
 *      inside the header — after its last content line, never inside the body,
 *      and never by reordering the author's own header lines.
 *   6. A NO-OP COSTS NOTHING. Retyping the title it already has, or asking for
 *      neither field, returns null: no text change, no undo entry.
 *   7. IT SURVIVES THE ROUND TRIP. The patched text re-parses to the heading
 *      that was typed, and retitling back returns byte-identical text.
 *   8. A MERMAID PANE IS REFUSED, and so is a pane whose text describes a
 *      different document — splicing by line numbers that mean something else
 *      corrupts the reader's file rather than preserving it.
 */

import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

/* ----------------------------------------------------------------------- */
/* Module resolution: `@/*` alias + extensionless relative imports -> .ts   */
/* ----------------------------------------------------------------------- */

registerHooks({
  resolve(specifier, context, nextResolve) {
    let resolved = specifier;
    if (resolved.startsWith("@/")) {
      resolved = pathToFileURL(path.join(ROOT, "src", resolved.slice(2))).href;
    }
    if (
      (resolved.startsWith("./") || resolved.startsWith("../")) &&
      typeof context.parentURL === "string"
    ) {
      resolved = new URL(resolved, context.parentURL).href;
    }
    if (resolved.startsWith("file:")) {
      const asPath = fileURLToPath(resolved);
      const isFile = existsSync(asPath) && statSync(asPath).isFile();
      if (!isFile) {
        if (existsSync(`${asPath}.ts`)) {
          resolved = pathToFileURL(`${asPath}.ts`).href;
        } else if (existsSync(path.join(asPath, "index.ts"))) {
          resolved = pathToFileURL(path.join(asPath, "index.ts")).href;
        }
      }
    }
    return nextResolve(resolved, context);
  },
});

const load = async (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

const { retitledEdit } = await load(
  "src/features/playground/input/retitle-edit.ts",
);
const { parseViewSource, convertedSourceText, VIEW_SEED_TEXT } = await load(
  "src/features/playground/input/parse.ts",
);
const { CANVAS_EDIT_OFFERS } = await load(
  "src/features/playground/input/canvas-edit.ts",
);

let assertions = 0;
let failures = 0;
function check(label, condition, detail) {
  assertions += 1;
  if (condition) {
    console.log(`  ✓ ${label}`);
    return;
  }
  failures += 1;
  console.error(`  ✗ ${label}`);
  if (detail) console.error(`    ${detail}`);
}

const parse = (source) => {
  const parsed = parseViewSource(source);
  if (parsed.status !== "ok") {
    throw new Error(`fixture does not parse: ${JSON.stringify(parsed)}`);
  }
  return parsed.value;
};
const comments = (text) => (text.match(/^\s*\/\//gm) ?? []).length;
const headerOf = (text) => text.split("\n").slice(0, 6);

/* NON-CANONICAL ON PURPOSE: a comment, an author blank line, an `owner` line
   AFTER the description (canonical order puts them in a fixed sequence), and
   a body below. A re-emit would tidy all of that away and still round-trip. */
const WITH_DESC = `archlab 1.0 usecase
title "Food delivery"
description "Who does what at the edge."
owner "Platform"

// A comment the author wrote and expects to keep.
@usecase
  actor guest "Guest"
  usecase browse "Browse restaurants"

  guest -- browse
`;
const NO_DESC = WITH_DESC.replace(
  'description "Who does what at the edge."\n',
  "",
);

/* --------------------------------------------------------------------- */

console.log("");
console.log("retitle: the gesture asks the grid itself");

{
  /* DERIVED, so this cannot go stale the day a refusing canvas grows a
     heading editor: every notation whose cell refuses `retitle` must be
     refused by the gesture too. */
  const refusing = Object.keys(CANVAS_EDIT_OFFERS.retitle).filter(
    (kind) => !CANVAS_EDIT_OFFERS.retitle[kind].offers,
  );
  check(
    "some notation still refuses `retitle`, so this section is not vacuous",
    refusing.length >= 1,
    "every notation offers it; the assertions below prove nothing",
  );
  for (const kind of refusing) {
    const seed = VIEW_SEED_TEXT[kind];
    if (typeof seed !== "string") continue;
    check(
      `the gesture declines a ${kind} document, whose cell refuses`,
      retitledEdit(parse(seed), seed, { title: "Anything" }) === null,
      "it acted on a canvas with nowhere to type",
    );
  }
}

console.log("");
console.log("retitle: what it writes");

{
  const doc = parse(WITH_DESC);

  const renamed = retitledEdit(doc, WITH_DESC, { title: "Meal delivery" });
  check("a retitle produces an edit", renamed !== null, "got null");
  if (renamed !== null) {
    const changed = WITH_DESC.split("\n").filter(
      (line, index) => line !== renamed.text.split("\n")[index],
    );
    check(
      "a retitle rewrites exactly one line, and it is the title line",
      changed.length === 1 && changed[0].startsWith("title "),
      `${changed.length} changed: ${JSON.stringify(changed)}`,
    );
    check(
      "every other header line, comment and blank line survives it",
      renamed.text.includes('owner "Platform"') &&
        renamed.text.includes('description "Who does what at the edge."') &&
        comments(renamed.text) === comments(WITH_DESC) &&
        renamed.text.split("\n").length === WITH_DESC.split("\n").length,
      `header: ${JSON.stringify(headerOf(renamed.text))}`,
    );
    check(
      "it is a patch, and the patched text re-parses to the new title",
      renamed.path === "patch" &&
        parse(renamed.text).file.metadata?.title === "Meal delivery",
      `path ${renamed.path}`,
    );
    /* THE ROUND TRIP. Retitling back has to return the author's own bytes, or
       every accidental rename permanently reformats their header. */
    const back = retitledEdit(renamed.doc, renamed.text, {
      title: "Food delivery",
    });
    check(
      "retitling back returns byte-identical text",
      back !== null && back.text === WITH_DESC,
      back === null ? "got null" : "the header did not come back",
    );
  }

  const redescribed = retitledEdit(doc, WITH_DESC, {
    description: "New words.",
  });
  check(
    "a description is replaced in place, leaving the title alone",
    redescribed !== null &&
      redescribed.text.includes('description "New words."') &&
      redescribed.text.includes('title "Food delivery"') &&
      redescribed.text.split("\n").length === WITH_DESC.split("\n").length,
    `header: ${JSON.stringify(headerOf(redescribed?.text ?? ""))}`,
  );

  /* ABSENT IS NOT EMPTY, and this is the pair `canvas-editing.md` warns about:
     a toggle must put back what it found, and `description ""` is not a
     document the canonical form can contain. */
  const cleared = retitledEdit(doc, WITH_DESC, { description: "" });
  check(
    "clearing the description REMOVES its line rather than writing an empty one",
    cleared !== null &&
      !cleared.text.includes("description") &&
      cleared.text.split("\n").length === WITH_DESC.split("\n").length - 1 &&
      cleared.text.includes('owner "Platform"'),
    `header: ${JSON.stringify(headerOf(cleared?.text ?? ""))}`,
  );
  check(
    "and the cleared document still parses, with no description",
    cleared !== null &&
      parse(cleared.text).file.metadata?.description === undefined,
    "the removal left a document the parser refuses",
  );
}

console.log("");
console.log("retitle: the insert, and the refusals");

{
  const bare = parse(NO_DESC);
  const inserted = retitledEdit(bare, NO_DESC, {
    description: "Freshly added.",
  });
  check(
    "writing a description where there was none INSERTS one line",
    inserted !== null &&
      inserted.text.split("\n").length === NO_DESC.split("\n").length + 1 &&
      inserted.text.includes('description "Freshly added."'),
    `header: ${JSON.stringify(headerOf(inserted?.text ?? ""))}`,
  );
  check(
    "the insert lands inside the HEADER, never inside the body",
    inserted !== null &&
      inserted.text.indexOf("description ") < inserted.text.indexOf("@usecase"),
    "a header line under the `@` head is a document the parser refuses",
  );
  /* THE POSITION, PINNED — and this assertion used to be weaker than its own
     label. It read `indexOf(title) < indexOf(owner)`, which is true of the
     author's untouched header AND of an insert dropped anywhere below the
     title, so a break that appended the description after `owner` passed it.
     A test that cannot fail for the reason it names is worse than no test.
     The claim is that the line lands in the CANONICAL slot, so measure the
     line NUMBER: immediately after the title, with every pre-existing header
     line still in the order the author wrote it. */
  check(
    "the insert lands immediately after the title, in the canonical slot",
    inserted !== null &&
      inserted.text.split("\n")[1] === 'title "Food delivery"' &&
      inserted.text.split("\n")[2] === 'description "Freshly added."' &&
      inserted.text.split("\n")[3] === 'owner "Platform"',
    `header: ${JSON.stringify(headerOf(inserted?.text ?? ""))}`,
  );
  check(
    "and the author's own header lines keep the order they were written in",
    inserted !== null &&
      NO_DESC.split("\n")
        .filter((line) => line.trim() !== "" && !line.startsWith("@"))
        .every((line, index, own) =>
          index === 0
            ? true
            : inserted.text.indexOf(own[index - 1]) <
              inserted.text.indexOf(line),
        ),
    "the edit tidied a header it was not asked to touch",
  );
  check(
    "clearing a description that is already absent costs nothing",
    retitledEdit(bare, NO_DESC, { description: "" }) === null,
    "it rewrote the pane for nothing",
  );

  const doc = parse(WITH_DESC);
  check(
    "an empty title is refused — every grammar requires one",
    retitledEdit(doc, WITH_DESC, { title: "   " }) === null,
    "it wrote a document its own parser rejects",
  );
  check(
    "retyping the title it already has costs no undo entry",
    retitledEdit(doc, WITH_DESC, { title: "Food delivery" }) === null,
    "a form submitted with nothing changed in it rewrote the pane",
  );
  check(
    "asking for neither field is refused",
    retitledEdit(doc, WITH_DESC, {}) === null,
    "it produced an edit with nothing in it",
  );

  const asMermaid = convertedSourceText(doc, "mermaid");
  if (typeof asMermaid === "string" && asMermaid !== "") {
    check(
      "a Mermaid pane is refused — it has no .alab line numbers to splice",
      retitledEdit(parse(asMermaid), asMermaid, { title: "X" }) === null,
      "it spliced into a pane holding another language",
    );
  } else {
    check(
      "the fixture converts to Mermaid, so the pane assertion is real",
      false,
      "conversion produced nothing",
    );
  }
  check(
    "a pane whose text describes a DIFFERENT document is refused",
    retitledEdit(doc, WITH_DESC.replace("Browse restaurants", "Browse menus"), {
      title: "X",
    }) === null,
    "splicing into line numbers that mean something else corrupts the file",
  );
}

console.log("");
if (failures > 0) {
  console.error(`${failures} of ${assertions} assertions failed.`);
  process.exit(1);
}
console.log(`All ${assertions} retitle assertions passed.`);

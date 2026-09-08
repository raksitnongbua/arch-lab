#!/usr/bin/env node
/**
 * Data-dictionary REORDER check. Loads the REAL library from
 * `src/features/archtext/**` and the REAL gesture module
 * `src/features/playground/input/dict-edit.ts` via Node's built-in TypeScript
 * type stripping plus a resolve hook for the `@/*` alias, so this script and
 * the app exercise the exact same code.
 *
 * WHAT A DICTIONARY GESTURE IS. A dictionary has no coordinate and will not
 * get one: `layoutDict` solves the column grid once across the whole document
 * so two sections can be scanned against each other, so the `move` cell
 * refuses on `"grammar"` grounds permanently. What a drag here writes is a
 * REORDER — a section or a field taking its neighbour's slot in the reading
 * order — which `canvas-editing.md` classes under `revise`, and which needs no
 * format change because order already IS the text.
 *
 * What it proves, and the failure each clause prevents:
 *
 *   1. SPANS EXIST AND REACH THE END OF THE BLOCK. A section's span covers its
 *      fields and their continuations, because `canonicalDictSectionBlock`
 *      writes them: a span stopping at the heading would leave the rows
 *      orphaned under a heading that no longer introduces them.
 *   2. FIELD SPANS ARE NESTED UNDER THEIR SECTION'S LABEL, so a field name
 *      that belongs to the section next door does not resolve at all. "A field
 *      cannot escape into a neighbouring section" is then true by construction
 *      rather than by a guard somebody could delete.
 *   3. A REORDER REWRITES ONLY THE LINES IT CONCERNS. This is the whole reason
 *      spans exist: `serializeDictText` writes canonical text, so a re-emit
 *      deletes every `//` comment and every author blank line — and passes
 *      every round-trip assertion while doing it, because canonical text
 *      re-emitted IS canonical text (`0a9cbf1` bought that rule on the
 *      flowchart canvas). So the fixture below is DELIBERATELY NON-CANONICAL:
 *      comments in three places, author blank lines, and field continuations
 *      two levels deeper than the section opener.
 *   4. A SECTION CARRIES ITS FIELDS, and a field moves inside its own section.
 *   5. THE PATCHED TEXT RE-PARSES TO THE NEW ORDER — the gesture is measured
 *      by the parser's reading of what it wrote, not by its own idea of it.
 *   6. A NO-OP IS REFUSED: the first section cannot go earlier, the last
 *      cannot go later, and neither costs a text change or an undo entry.
 *   7. A REORDER IS A PURE PERMUTATION. The multiset of sections, and of each
 *      section's fields, is unchanged — a reorder writes no line the document
 *      did not already hold, so it cannot add, drop or duplicate a row.
 *   8. EVERY GESTURE ASKS THE GRID ITSELF. The dict `revise` cell ships as a
 *      refusal until a surface exists, so the gestures are exercised with that
 *      cell FLIPPED IN MEMORY (the technique `check:canvas-edit` already uses
 *      to prove its refusal prose is derived), and the shipped verdict is read
 *      back out of the grid rather than typed here — so this script says the
 *      right thing on both sides of the day that cell changes.
 *
 * ONE KNOWN LIMIT, deliberately not asserted as a promise: a `//` comment
 * written INSIDE a section or field block is rewritten with the block, because
 * the replacement is the serializer's canonical form of it. That is the same
 * trade the ER move makes, and it is why the fixture's comments sit between
 * blocks — which is also where an author writes them.
 *
 * Exits non-zero on any failure. Run with: pnpm check:dict-reorder
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

const load = (relative) =>
  import(pathToFileURL(path.join(ROOT, relative)).href);

const {
  parseDictText,
  parseDictTextWithSpans,
  canonicalDictFieldBlock,
  canonicalDictSectionBlock,
  serializeDictText,
} = await load("src/features/archtext/index.ts");

/* The REAL gesture module and the REAL grid it asks, not copies of them —
   this script exists to prove those two agree. */
const { dictReorderRefusal, reorderedDictFieldEdit, reorderedDictSectionEdit } =
  await load("src/features/playground/input/dict-edit.ts");
const { CANVAS_EDIT_OFFERS, canvasEditability } = await load(
  "src/features/playground/input/canvas-edit.ts",
);

/* ----------------------------------------------------------------------- */
/* Harness                                                                  */
/* ----------------------------------------------------------------------- */

let failures = 0;
let assertions = 0;

function ok(label) {
  assertions += 1;
  console.log(`  ✓ ${label}`);
}

function fail(label, detail) {
  assertions += 1;
  failures += 1;
  console.error(`  ✗ ${label}`);
  if (detail) console.error(`    ${detail}`);
}

function check(label, condition, detail) {
  if (condition) ok(label);
  else fail(label, detail);
}

/* ----------------------------------------------------------------------- */
/* The fixture: deliberately non-canonical                                  */
/* ----------------------------------------------------------------------- */

/* Comments before the body, between the two sections and after the last one;
   author blank lines; and every field carrying continuations two levels deeper
   than its section's opener. The two section blocks are DIFFERENT LENGTHS on
   purpose: a patch that assumed a swap preserves line offsets would pass on
   equal-length blocks and corrupt this one. */
const MESSY = `archlab 1.0 dict
title "Customer API"

// The customer payload is what every endpoint returns.
@dict
  section "Customer" [REST payload] #core
    desc "What every customer endpoint returns"
    field id uuid required unique
      desc "Stable identifier, never reused"
      source "accounts.customer.id"
    field email string required
      values "RFC 5322"
      example "ada@example.com"

  // Orders hang off the customer, and are read far more often.
  section "Order" #core
    field id uuid required
      desc "Order number as printed on the receipt"
    field total "numeric(10,2)" required
      source "billing.order.total"
      values "Two decimal places, minor units never used"
      example "19.99"

// Nothing below this line has been reviewed.
`;

const docOf = (text) => ({
  kind: "dict",
  format: "alab",
  file: parseDictText(text),
});

const commentCount = (text) => (text.match(/^\s*\/\//gm) ?? []).length;
const blankCount = (text) =>
  text.split("\n").filter((line) => line.trim() === "").length;
const labelsOf = (file) => file.sections.map((section) => section.label);
const fieldsOf = (file, label) =>
  file.sections
    .find((section) => section.label === label)
    ?.fields.map((field) => field.name) ?? null;
/** Every (section, field) pair as one flat list — the multiset a permutation
 *  must preserve, sorted so order is exactly what it does NOT measure. */
const rowMultiset = (file) =>
  file.sections
    .flatMap((section) =>
      section.fields.map((field) => `${section.label}.${field.name}`),
    )
    .sort()
    .join("|");

/* ----------------------------------------------------------------------- */
/* 1. Spans                                                                 */
/* ----------------------------------------------------------------------- */

console.log("spans (what a reorder addresses)");

const { file: MESSY_FILE, spans } = parseDictTextWithSpans(MESSY);
const MESSY_LINES = MESSY.split("\n");

check(
  "every section the model holds has a span, keyed by its heading",
  labelsOf(MESSY_FILE).every((label) => spans.sections.get(label)) &&
    spans.sections.size === 2,
  `model: ${labelsOf(MESSY_FILE).join(", ")} / spans: ${[...spans.sections.keys()].join(", ")}`,
);

check(
  "a section's span STARTS on the heading line it names",
  labelsOf(MESSY_FILE).every((label) =>
    MESSY_LINES[spans.sections.get(label).start - 1].includes(
      JSON.stringify(label),
    ),
  ),
  "a span pointing at the wrong line patches the wrong block",
);

/* THE SPAN COVERS THE WHOLE BLOCK. `Order`'s last line is its last field's
   `example`, which is the deepest and last line in the body — the one a
   heading-only span cannot see, and the one that would be left behind under
   the wrong heading. */
{
  const order = spans.sections.get("Order");
  check(
    "a section's span reaches its last field's last continuation",
    MESSY_LINES[order.end - 1].includes('example "19.99"'),
    `Order span: ${JSON.stringify(order)} ends at: ${MESSY_LINES[order.end - 1]}`,
  );
  check(
    "and stops before the comment that follows the block",
    !MESSY_LINES.slice(order.start - 1, order.end).some((line) =>
      line.includes("//"),
    ),
    "a span that swallowed the trailing comment would move it with the block",
  );
}

check(
  "a field's span is nested under its own section, so a neighbour's field name does not resolve",
  spans.fields.get("Customer").get("email") !== undefined &&
    spans.fields.get("Customer").get("total") === undefined &&
    spans.fields.get("Order").get("total") !== undefined,
  "a flat field map would let a reorder address a field in the section next door",
);

check(
  "a field's span reaches its own continuations and no further",
  MESSY_LINES[spans.fields.get("Customer").get("id").start - 1].includes(
    "field id",
  ) &&
    MESSY_LINES[spans.fields.get("Customer").get("id").end - 1].includes(
      "accounts.customer.id",
    ),
  `id span: ${JSON.stringify(spans.fields.get("Customer").get("id"))}`,
);

/* ----------------------------------------------------------------------- */
/* 2. The gestures                                                          */
/* ----------------------------------------------------------------------- */

/* THE CELL IS FLIPPED IN MEMORY for this section, and restored after it. The
   dict `revise` cell ships as a `"surface"` refusal — the canvas has no handle
   to drag — so every gesture correctly returns `null` today, and a check that
   only observed that would prove nothing about the reorder itself. Flipping
   the grid to exercise the code under it is the technique `check:canvas-edit`
   already uses to prove its refusal prose is derived. Section 3 reads the
   SHIPPED verdict back out of the grid, so nothing here is hand-typed. */
const SHIPPED_REVISE = CANVAS_EDIT_OFFERS.revise.dict;
CANVAS_EDIT_OFFERS.revise.dict = {
  offers: true,
  noun: "data dictionaries",
  shortNoun: "dictionary",
  onCanvas: "a dictionary section or field drags into a new reading order",
};

console.log("");
console.log("reordering a section");

{
  const doc = docOf(MESSY);
  const edit = reorderedDictSectionEdit(doc, MESSY, "Order", "earlier");
  check(
    "moving a section earlier produces a line patch, not a re-emit",
    edit !== null && edit.path === "patch",
    `edit: ${edit === null ? "null" : edit.path}`,
  );

  /* A NULL EDIT MUST NOT CRASH THIS SCRIPT. `canvas-editing.md` lists "an
     assertion that crashed instead of failing" among the ways a break has
     been missed on this branch: a thrown TypeError kills the run before the
     later sections report, so the reader sees one stack trace instead of the
     assertion that named the fault. */
  const patched = edit === null ? MESSY : edit.text;
  check(
    "the patched text re-parses to the new section order",
    labelsOf(parseDictText(patched)).join(",") === "Order,Customer",
    `order after: ${labelsOf(parseDictText(patched)).join(", ")}`,
  );

  /* ONLY THE LINES IT CONCERNS. Measured three ways, because each catches a
     different mistake: the lines BEFORE the first block catch a patch that
     rewrote the header, the lines AFTER the last block catch one that ran off
     the end, and the run BETWEEN the two blocks catches the tempting
     implementation — lift the block out and re-insert it — which would drag
     the author's comment along with whichever block it followed. */
  const first = spans.sections.get("Customer");
  const last = spans.sections.get("Order");
  const patchedLines = patched.split("\n");
  check(
    "every line above the first moved block is byte-identical",
    MESSY_LINES.slice(0, first.start - 1).join("\n") ===
      patchedLines.slice(0, first.start - 1).join("\n"),
    "the patch reached above the block it was given",
  );
  const tail = MESSY_LINES.length - last.end;
  check(
    "every line below the last moved block is byte-identical",
    MESSY_LINES.slice(-tail).join("\n") ===
      patchedLines.slice(-tail).join("\n"),
    "the patch ran past the end of the block it was given",
  );
  const between = MESSY_LINES.slice(first.end, last.start - 1).join("\n");
  check(
    "the author's comment and blank line BETWEEN the two blocks stay between them",
    patched.includes(between) &&
      between.includes("// Orders hang off the customer"),
    `run between the blocks: ${JSON.stringify(between)}`,
  );
  check(
    "no comment and no blank line is lost anywhere in the file",
    commentCount(patched) === commentCount(MESSY) &&
      blankCount(patched) === blankCount(MESSY),
    `comments ${commentCount(MESSY)} → ${commentCount(patched)}, blanks ${blankCount(MESSY)} → ${blankCount(patched)}`,
  );
  check(
    "and a re-emit of the same document would have lost them — which is why the patch exists",
    commentCount(serializeDictText(MESSY_FILE)) === 0,
    "if the serializer keeps comments, this whole mechanism is unnecessary",
  );

  /* THE SECTION CARRIES ITS FIELDS. Asserted per section rather than over the
     flat list, because the flat list is order-blind by design: fields landing
     under the wrong heading would keep the multiset intact. */
  const after = parseDictText(patched);
  check(
    "each section still holds exactly the fields it held, in the same order",
    fieldsOf(after, "Customer").join(",") === "id,email" &&
      fieldsOf(after, "Order").join(",") === "id,total",
    `Customer: ${fieldsOf(after, "Customer")} / Order: ${fieldsOf(after, "Order")}`,
  );
  check(
    "a section's own attributes travel with it",
    after.sections[0].label === "Order" &&
      after.sections[1].technology === "REST payload" &&
      after.sections[1].description === "What every customer endpoint returns",
    `moved section: ${JSON.stringify(after.sections[0].label)}`,
  );
  check(
    "the reorder is a pure permutation: the same rows, differently ordered",
    rowMultiset(after) === rowMultiset(MESSY_FILE) &&
      labelsOf(after).join(",") !== labelsOf(MESSY_FILE).join(","),
    `${rowMultiset(MESSY_FILE)} → ${rowMultiset(after)}`,
  );

  /* A REWRITTEN BLOCK IS CANONICAL, and the fixture is built to show where
     that stops. `"numeric(10,2)"` is quoted in the author's text and the
     serializer writes that class of type bare, so the block the gesture
     rewrites comes back bare — while every byte outside the two blocks is
     untouched, which the three assertions above measure. Naming it here is
     what keeps it a known trade rather than a surprise in a diff. */
  const canonicalised = MESSY.replace('"numeric(10,2)"', "numeric(10,2)");
  check(
    "a rewritten block is canonical: a quoted type the parser accepts bare comes back bare",
    patched.includes("field total numeric(10,2) required") &&
      !patched.includes('"numeric(10,2)"'),
    "the block was spliced back verbatim, so the canonical block is not being used",
  );

  /* THE OTHER DIRECTION IS THE SAME EDIT. Not a second code path — the check
     is here because a `direction` read backwards would produce a document
     that still parses, still permutes, and is simply wrong. */
  const back = reorderedDictSectionEdit(
    docOf(patched),
    patched,
    "Order",
    "later",
  );
  check(
    "moving it back later restores every line, the canonicalised type aside",
    back !== null && back.text === canonicalised,
    back === null ? "the return trip refused" : "the round trip changed bytes",
  );
}

console.log("");
console.log("reordering a field inside its section");

{
  const doc = docOf(MESSY);
  const edit = reorderedDictFieldEdit(
    doc,
    MESSY,
    "Customer",
    "email",
    "earlier",
  );
  check(
    "moving a field earlier produces a line patch",
    edit !== null && edit.path === "patch",
    `edit: ${edit === null ? "null" : edit.path}`,
  );
  const after = parseDictText(edit === null ? MESSY : edit.text);
  check(
    "the patched text re-parses with the field in its new place",
    fieldsOf(after, "Customer").join(",") === "email,id",
    `Customer fields: ${fieldsOf(after, "Customer")}`,
  );
  check(
    "the neighbouring section is untouched",
    fieldsOf(after, "Order").join(",") === "id,total" &&
      labelsOf(after).join(",") === "Customer,Order",
    `Order fields: ${fieldsOf(after, "Order")}`,
  );
  check(
    "the field brought its own continuations with it",
    after.sections[0].fields[0].name === "email" &&
      after.sections[0].fields[0].values === "RFC 5322" &&
      after.sections[0].fields[0].example === "ada@example.com",
    `first field: ${JSON.stringify(after.sections[0].fields[0])}`,
  );
  check(
    "the field reorder is a pure permutation too",
    rowMultiset(after) === rowMultiset(MESSY_FILE),
    `${rowMultiset(MESSY_FILE)} → ${rowMultiset(after)}`,
  );
  const fieldPatched = edit === null ? MESSY : edit.text;
  check(
    "no comment and no blank line is lost",
    commentCount(fieldPatched) === commentCount(MESSY) &&
      blankCount(fieldPatched) === blankCount(MESSY),
    `comments ${commentCount(MESSY)} → ${commentCount(fieldPatched)}`,
  );

  /* A FIELD CANNOT ESCAPE ITS SECTION, the two ways it could be asked to. */
  check(
    "the last field of a section cannot be moved later into the next section",
    reorderedDictFieldEdit(doc, MESSY, "Customer", "email", "later") === null,
    "a field escaping its section would sit under a heading that never declared it",
  );
  check(
    "and a field named from the neighbouring section does not resolve at all",
    reorderedDictFieldEdit(doc, MESSY, "Customer", "total", "earlier") === null,
    "the field map is nested per section for exactly this reason",
  );
}

console.log("");
console.log("no-ops are refused, with a sentence rather than a shrug");

{
  const doc = docOf(MESSY);
  const cases = [
    [
      "the first section moved earlier",
      () => reorderedDictSectionEdit(doc, MESSY, "Customer", "earlier"),
      dictReorderRefusal(
        MESSY_FILE,
        { kind: "section", sectionLabel: "Customer" },
        "earlier",
      ),
      /first section/,
    ],
    [
      "the last section moved later",
      () => reorderedDictSectionEdit(doc, MESSY, "Order", "later"),
      dictReorderRefusal(
        MESSY_FILE,
        { kind: "section", sectionLabel: "Order" },
        "later",
      ),
      /last section/,
    ],
    [
      "the first field of a section moved earlier",
      () => reorderedDictFieldEdit(doc, MESSY, "Customer", "id", "earlier"),
      dictReorderRefusal(
        MESSY_FILE,
        { kind: "field", sectionLabel: "Customer", fieldName: "id" },
        "earlier",
      ),
      /first field/,
    ],
    [
      "a section the pane renamed out from under the gesture",
      () => reorderedDictSectionEdit(doc, MESSY, "Invoice", "later"),
      dictReorderRefusal(
        MESSY_FILE,
        { kind: "section", sectionLabel: "Invoice" },
        "later",
      ),
      /not in this dictionary/,
    ],
  ];
  for (const [label, gesture, refusal, expected] of cases) {
    check(
      `${label} costs no text change and no undo entry`,
      gesture() === null,
      "a no-op that returns an edit puts an entry in the undo stack for nothing",
    );
    check(
      `and says why: ${label}`,
      typeof refusal === "string" && expected.test(refusal),
      `refusal: ${refusal}`,
    );
  }
  /* The refusal is read by someone who just tried something, so it may not
     read as a roadmap entry — the same rule `check:canvas-edit` applies to the
     grid's own cells. */
  const everyRefusal = cases.map(([, , refusal]) => refusal).join(" ");
  check(
    "no refusal reads as unfinished work",
    !/not yet|coming soon|for now|not supported/i.test(everyRefusal),
    everyRefusal,
  );
}

console.log("");
console.log("a pane that disagrees with the canvas is refused");

{
  /* THE PANE AND THE CANVAS CAN DISAGREE — the keystroke debounce leaves a
     change un-parsed for a moment, and the canvas keeps drawing the last good
     version. Splicing the OLD document's line numbers into the NEW text would
     corrupt the author's file rather than preserve it, so agreement is
     measured by re-serialising both sides. */
  const stale = MESSY.replace('section "Order" #core', 'section "Invoice"');
  check(
    "a gesture whose source text is a different document than the canvas holds refuses",
    reorderedDictSectionEdit(docOf(MESSY), stale, "Order", "earlier") === null,
    "the gesture spliced into text describing a document it was not shown",
  );
  check(
    "and text the parser refuses outright refuses too, rather than throwing",
    reorderedDictSectionEdit(
      docOf(MESSY),
      `${MESSY}  section "Empty"\n`,
      "Order",
      "earlier",
    ) === null,
    "an unparseable pane must drop the edit, not surface a parse error",
  );
}

/* ----------------------------------------------------------------------- */
/* 3. The guard, against the SHIPPED grid                                   */
/* ----------------------------------------------------------------------- */

CANVAS_EDIT_OFFERS.revise.dict = SHIPPED_REVISE;

console.log("");
console.log("every gesture asks the grid itself");

{
  const doc = docOf(MESSY);
  const shipped = canvasEditability(doc, "revise");
  check(
    "the grid was restored, so this section sees the real answer",
    CANVAS_EDIT_OFFERS.revise.dict === SHIPPED_REVISE,
    "the flipped cell leaked out of the section above",
  );
  /* DERIVED, NOT TYPED. The dict `revise` cell ships refused today; the day it
     offers, this branch flips with it rather than going stale — which is the
     failure `canvas-editing.md` records three times in other files. */
  if (shipped.editable) {
    check(
      "the grid offers revise for a dictionary, so both gestures act on the shipped grid",
      reorderedDictSectionEdit(doc, MESSY, "Order", "earlier") !== null &&
        reorderedDictFieldEdit(doc, MESSY, "Customer", "email", "earlier") !==
          null,
      "the grid offers the ability and the gestures still refuse it",
    );
  } else {
    check(
      "while the grid refuses revise for a dictionary, both gestures refuse on their own",
      reorderedDictSectionEdit(doc, MESSY, "Order", "earlier") === null &&
        reorderedDictFieldEdit(doc, MESSY, "Customer", "email", "earlier") ===
          null,
      "a gesture that trusts its caller is unguarded the day somebody points it at another notation",
    );
    check(
      "and the refusal a reader would be shown points somewhere",
      typeof shipped.reason === "string" && shipped.reason.length > 0,
      `reason: ${shipped.reason}`,
    );
  }
}

/* ----------------------------------------------------------------------- */
/* 4. The canonical blocks the patch is built from                          */
/* ----------------------------------------------------------------------- */

console.log("");
console.log("canonical blocks");

check(
  "a section's canonical block carries its heading and every field line",
  canonicalDictSectionBlock(MESSY_FILE, "Order").length ===
    spans.sections.get("Order").end - spans.sections.get("Order").start + 1,
  `block: ${JSON.stringify(canonicalDictSectionBlock(MESSY_FILE, "Order"))}`,
);
check(
  "a section's canonical block is pinned to the parser's own indent",
  canonicalDictSectionBlock(MESSY_FILE, "Order")[0].startsWith("  section ") &&
    canonicalDictFieldBlock(MESSY_FILE, "Order", "total")[0].startsWith(
      "    field ",
    ),
  "a block written at the wrong depth changes what declares what",
);
check(
  "a block asked for by a name the file does not hold is null, not a throw",
  canonicalDictSectionBlock(MESSY_FILE, "Invoice") === null &&
    canonicalDictFieldBlock(MESSY_FILE, "Customer", "total") === null,
  "the gesture drops an edit it cannot build; it must not surface an exception",
);

/* ----------------------------------------------------------------------- */

console.log("");
if (failures === 0) {
  console.log(`dict reorder check: ${assertions} assertions, all passed`);
  process.exit(0);
}
console.error(`dict reorder check: ${failures} of ${assertions} FAILED`);
process.exit(1);

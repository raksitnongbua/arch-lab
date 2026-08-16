#!/usr/bin/env node
/**
 * The merged `/view` playground's READER: one pane, five accepted shapes, one
 * rendered document.
 *
 * This exists because the merge collapsed two pages into one and detection is
 * now the thing standing between a paste and a blank canvas. Nothing else can
 * catch a regression in it: `pnpm build` type-checks the routing but cannot
 * say that Mermaid C4 still lands on the C4 canvas, and the page's own errors
 * are rendered, not asserted. A reader who pastes a `sequenceDiagram` and gets
 * "could not detect the format" has no way to know it is a bug.
 *
 * What it asserts:
 *
 *   1. every shape the pane advertises is detected as the right KIND — C4
 *      `.alab`, sequence `.alab`, arch-lab JSON, Mermaid C4, Mermaid
 *      `sequenceDiagram`;
 *   2. the bundled seeds for both routes parse (a broken seed would ship a
 *      playground that opens on an error);
 *   3. a failure keeps its parser's own precision — a located line/column for
 *      the text grammars, a JSON-path for the JSON validator — because the UI
 *      renders a caret quote from exactly those fields;
 *   4. nothing recognisable is answered with "unknown format", which is the
 *      one verdict a reader cannot act on.
 *
 * It also pins the module's PURITY: this script loads it through Node's type
 * stripping, so an import that reaches a `.tsx` (a feature barrel exporting a
 * component) fails here rather than silently removing the reader from test.
 * That regression already happened once during the merge.
 *
 * Exits non-zero on any failure. Run with: pnpm check:view-input
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(ROOT, relative), "utf8");

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

const { parseViewSource, VIEW_SEED_TEXT, describeDocument } = await import(
  pathToFileURL(path.join(ROOT, "src/features/playground/input/parse.ts")).href
);

/* ----------------------------------------------------------------------- */
/* Harness                                                                  */
/* ----------------------------------------------------------------------- */

let failures = 0;
let assertions = 0;

function check(label, condition, detail) {
  assertions += 1;
  if (condition) {
    console.log(`  ✓ ${label}`);
    return;
  }
  failures += 1;
  console.error(`  ✗ ${label}`);
  if (detail !== undefined) console.error(`    ${detail}`);
}

/* ----------------------------------------------------------------------- */
/* 1. Every accepted shape lands on the right canvas                        */
/* ----------------------------------------------------------------------- */

console.log("one pane, five shapes");

const MERMAID_C4 = `C4Context
    title Coffee Shop
    Person(customer, "Customer")
    System(shop, "Coffee Shop System")
    Rel(customer, shop, "Places orders with", "HTTPS")
`;

/* The bug report that started the Mermaid work, kept as an input here too:
   it is the shortest paste that exercises detection AND a block the importer
   once refused outright. */
const MERMAID_SEQUENCE = `sequenceDiagram
    participant Alice
    participant Bob
    rect rgb(191, 223, 255)
        Alice->>Bob: Hello Bob
        Bob-->>Alice: Hi Alice
    end
`;

/* Derived, never hand-written: the JSON case has to be the JSON this app
   actually emits, or the test proves something about a document nobody
   produces. */
const seededC4 = parseViewSource(VIEW_SEED_TEXT.c4);
const C4_JSON =
  seededC4.status === "ok" && seededC4.value.kind === "c4"
    ? seededC4.value.synced.jsonText
    : "";

for (const [label, text, kind] of [
  ["C4 .alab", VIEW_SEED_TEXT.c4, "c4"],
  ["sequence .alab", VIEW_SEED_TEXT.sequence, "sequence"],
  ["arch-lab JSON", C4_JSON, "c4"],
  ["Mermaid C4", MERMAID_C4, "c4"],
  ["Mermaid sequenceDiagram", MERMAID_SEQUENCE, "sequence"],
]) {
  const result = parseViewSource(text);
  check(
    `${label} renders as a ${kind} document`,
    result.status === "ok" && result.value.kind === kind,
    result.status === "ok"
      ? `got kind "${result.value.kind}"`
      : JSON.stringify(result.error),
  );
  if (result.status === "ok") {
    check(
      `${label} describes itself for the UI`,
      typeof describeDocument(result.value) === "string" &&
        describeDocument(result.value).length > 0,
    );
  }
}

/* ----------------------------------------------------------------------- */
/* 2. Both route seeds parse                                                */
/* ----------------------------------------------------------------------- */

console.log("\nthe seeds the three routes open with");

for (const seed of ["c4", "sequence"]) {
  const result = parseViewSource(VIEW_SEED_TEXT[seed]);
  check(
    `the "${seed}" seed parses — the page never opens on an error`,
    result.status === "ok" && result.value.kind === seed,
    result.status === "ok" ? undefined : JSON.stringify(result.error),
  );
}

/* ----------------------------------------------------------------------- */
/* 3. Failures keep their parser's precision                                */
/* ----------------------------------------------------------------------- */

console.log("\nfailures stay located");

const BROKEN_C4 = `archlab 1.0
title "Broken"

@context d-ctx "Context"
  a:sistem "A"
`;
const BROKEN_SEQUENCE = `archlab 1.0 sequence
title "Broken"

@sequence
  a -> ghost : "x"
`;
const BROKEN_MERMAID_SEQUENCE = "sequenceDiagram\n  A->>B hello\n";

for (const [label, text] of [
  ["a C4 .alab typo", BROKEN_C4],
  ["a sequence .alab typo", BROKEN_SEQUENCE],
  ["a Mermaid sequence typo", BROKEN_MERMAID_SEQUENCE],
]) {
  const result = parseViewSource(text);
  const located =
    result.status === "error" &&
    Number.isInteger(result.error.line) &&
    result.error.line >= 1 &&
    typeof result.error.message === "string" &&
    /line \d+, column \d+/.test(result.error.message);
  check(
    `${label} fails with a line and a column the caret quote can use`,
    located,
    JSON.stringify(result.status === "error" ? result.error : result).slice(
      0,
      160,
    ),
  );
}

{
  /* JSON is the one reader that locates by PATH rather than line/column, and
     the UI renders that instead of a caret — so "located" means something
     different here and is asserted separately rather than loosened above. */
  const broken = C4_JSON.replace('"version"', '"verzion"');
  const result = parseViewSource(broken);
  check(
    "a JSON typo fails with the validator's own issues",
    result.status === "error" &&
      result.error.kind === "json" &&
      Array.isArray(result.error.issues) &&
      result.error.issues.length > 0,
    JSON.stringify(result.status === "error" ? result.error : result).slice(
      0,
      160,
    ),
  );
}

/* ----------------------------------------------------------------------- */
/* 4. "Unknown format" is reserved for text nobody could route              */
/* ----------------------------------------------------------------------- */

console.log("\nunknown-format is the last resort, not the first");

for (const [label, text] of [
  ["prose", "hello there, this is not a diagram"],
  ["an empty pane", "   \n  "],
]) {
  const result = parseViewSource(text);
  check(
    `${label} is reported as unrecognised, with something to do about it`,
    result.status === "error" &&
      result.error.kind === "unknown-format" &&
      result.error.message.length > 0,
    JSON.stringify(result.status === "error" ? result.error : result).slice(
      0,
      160,
    ),
  );
}

for (const [label, text] of [
  ["a recognisable C4 header", BROKEN_C4],
  ["a recognisable sequence header", BROKEN_SEQUENCE],
  ["a recognisable Mermaid header", BROKEN_MERMAID_SEQUENCE],
]) {
  const result = parseViewSource(text);
  check(
    `${label} is never answered with "unknown format"`,
    result.status === "error" && result.error.kind !== "unknown-format",
    JSON.stringify(result.status === "error" ? result.error.kind : result),
  );
}

/* ----------------------------------------------------------------------- */

/* ----------------------------------------------------------------------- */
/* `?e=` is one flat namespace over both example registries                 */
/* ----------------------------------------------------------------------- */

{
  /* Read from SOURCE, not by importing the services: they pull in
     `.archlab.json` through import attributes this harness deliberately does
     not support — the same purity constraint that makes this script catch a
     barrel import dragging in a `.tsx`. The ids are literals, so reading them
     is exact. */
  const idsIn = (file) =>
    [...read(file).matchAll(/^\s*(?:\{\s*)?id: "([a-z0-9-]+)"/gm)].map(
      (m) => m[1],
    );

  const c4 = idsIn("src/features/viewer/service/model-service.ts");
  const seq = idsIn("src/features/sequence/service/example-service.ts");
  const clash = c4.filter((id) => seq.includes(id));

  /* `?e=` spans both registries so a reader never has to know which kind an
     id belongs to. The day the two collide it resolves whichever is looked up
     first — a bundled example quietly opening as the wrong document. */
  check(
    `example ids are unique across both registries (${c4.length} C4 + ${seq.length} sequence)`,
    clash.length === 0 && c4.length > 0 && seq.length > 0,
    clash.length > 0
      ? `both define: ${clash.join(", ")}`
      : "no ids parsed — has a registry moved?",
  );

  const resolver = read("src/features/playground/lib/example-param.ts");
  check(
    "the resolver tries BOTH registries before giving up",
    resolver.includes("loadViewerModel") &&
      resolver.includes("loadSequenceExample"),
  );
  check(
    "an unknown ?e= falls back rather than throwing",
    /return null;/.test(resolver),
    "a stale link should still open a working playground",
  );
  check(
    "the route feeds ?e= to the playground server-side",
    read("src/app/view/page.tsx").includes("exampleTextFor"),
    "resolving after hydration would show the seed, then replace it",
  );
}

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} view-input assertions passed.`);

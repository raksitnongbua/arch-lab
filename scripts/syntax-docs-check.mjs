#!/usr/bin/env node
/**
 * Syntax reference page check: every `.aft` snippet displayed on `/syntax`
 * must actually work. The page renders its snippets from ONE data module
 * (`src/features/syntax-docs/content/snippets.ts`); this script imports that
 * same module — through the same `registerHooks` resolver pattern as
 * `scripts/archtext-check.mjs`, so the REAL parser is exercised — and:
 *
 *   1. parses every valid snippet (full examples and each table row's
 *      example, wrapped into a complete file by the module's own helpers)
 *      through the real `parseArchText`, asserting success;
 *   2. parses every deliberately-invalid snippet in the errors section,
 *      asserting it FAILS with an `ArchTextParseError` whose line, column
 *      and full message equal what the page displays, verbatim.
 *
 * Exits non-zero on any failure. Run with: pnpm check:syntax-docs
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

const { parseArchText, ArchTextParseError } = await import(
  pathToFileURL(path.join(ROOT, "src/features/archtext/index.ts")).href
);
const { checkedSources, INVALID_SNIPPETS } = await import(
  pathToFileURL(path.join(ROOT, "src/features/syntax-docs/content/snippets.ts"))
    .href
);

/* ----------------------------------------------------------------------- */
/* Harness                                                                  */
/* ----------------------------------------------------------------------- */

let failures = 0;
let validated = 0;

function ok(label) {
  validated += 1;
  console.log(`  ✓ ${label}`);
}

function fail(label, detail) {
  validated += 1;
  failures += 1;
  console.error(`  ✗ ${label}`);
  if (detail) console.error(`    ${detail}`);
}

/* ---- 1. every valid snippet parses -------------------------------------- */

console.log("valid snippets (must parse)");

for (const { id, source } of checkedSources()) {
  try {
    parseArchText(source);
    ok(id);
  } catch (error) {
    fail(
      id,
      `did not parse: ${error instanceof Error ? error.message : error}`,
    );
  }
}

/* ---- 2. every invalid snippet fails exactly as displayed ---------------- */

console.log(
  "invalid snippets (must fail with the displayed line/column/message)",
);

for (const snippet of INVALID_SNIPPETS) {
  let result;
  try {
    result = parseArchText(snippet.code);
  } catch (error) {
    if (!(error instanceof ArchTextParseError)) {
      fail(snippet.id, `expected ArchTextParseError, got: ${error}`);
      continue;
    }
    const { line, column, message } = snippet.expected;
    if (error.line !== line || error.column !== column) {
      fail(
        snippet.id,
        `expected line ${line}, column ${column}; got line ${error.line}, column ${error.column} — ${error.message}`,
      );
      continue;
    }
    if (error.message !== message) {
      fail(
        snippet.id,
        `displayed message differs from the parser's.\n    displayed: ${message}\n    actual:    ${error.message}`,
      );
      continue;
    }
    ok(`${snippet.id} — "${error.message.slice(0, 90)}"`);
    continue;
  }
  fail(
    snippet.id,
    `expected a parse error, but parsing succeeded: ${JSON.stringify(result?.metadata?.title)}`,
  );
}

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${validated} snippet(s) FAILED`);
  process.exit(1);
}
console.log(
  `\nAll ${validated} syntax-docs snippets validated against the real parser.`,
);

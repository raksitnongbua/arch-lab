#!/usr/bin/env node
/**
 * `/validate` samples check: the one-click samples on the model checker page
 * must behave the way the page implies. The page renders them from ONE data
 * module (`src/features/validate/content/samples.ts`); this script imports
 * that same module, plus the page's own `checkSource`, through the same
 * `registerHooks` resolver pattern as `scripts/syntax-docs-check.mjs` — so
 * the REAL parsers are exercised — and asserts:
 *
 *   1. every sample labelled as valid checks OK under auto-detect, and is
 *      auto-detected as the format its label claims;
 *   2. the deliberately broken sample FAILS, with at least one located
 *      issue — otherwise the page would demonstrate error reporting with a
 *      document that quietly parses.
 *
 * Exits non-zero on any failure. Run with: pnpm check:validate-samples
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

const { checkSource } = await import(
  pathToFileURL(path.join(ROOT, "src/features/validate/lib/check.ts")).href
);
const { SAMPLES } = await import(
  pathToFileURL(path.join(ROOT, "src/features/validate/content/samples.ts"))
    .href
);

/* ----------------------------------------------------------------------- */
/* What each sample is supposed to do                                       */
/* ----------------------------------------------------------------------- */

/** label -> expected auto-detected format, or `null` for "must not parse". */
const EXPECTED = new Map([
  [".alab", "alab"],
  ["Mermaid C4", "mermaid"],
  ["A broken one", null],
]);

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

/* ---- every sample behaves as labelled ----------------------------------- */

console.log("/validate samples (checked through the real parsers)");

if (SAMPLES.length !== EXPECTED.size) {
  fail(
    "sample list",
    `SAMPLES has ${SAMPLES.length} entries but this script expects ${EXPECTED.size} — add the new sample's expectation here.`,
  );
}

for (const sample of SAMPLES) {
  if (!EXPECTED.has(sample.label)) {
    fail(sample.label, "no expectation declared in this script");
    continue;
  }
  const expected = EXPECTED.get(sample.label);
  const result = checkSource(sample.source, "auto");

  if (expected === null) {
    if (result.status !== "error") {
      fail(
        sample.label,
        `expected a parse failure, got status "${result.status}"`,
      );
      continue;
    }
    if (result.issues.length === 0) {
      fail(sample.label, "failed with no issues to show");
      continue;
    }
    ok(`${sample.label} — fails as intended: ${result.message}`);
    continue;
  }

  if (result.status !== "ok") {
    fail(
      sample.label,
      `expected a valid ${expected} model, got status "${result.status}": ${result.message}`,
    );
    continue;
  }
  if (result.format !== expected) {
    fail(
      sample.label,
      `auto-detected as "${result.format}", expected "${expected}"`,
    );
    continue;
  }
  const { diagrams, nodeCount, edgeCount } = result.summary;
  if (diagrams.length === 0 || nodeCount === 0) {
    fail(sample.label, "parsed to an empty model — not a useful sample");
    continue;
  }
  ok(
    `${sample.label} — ${diagrams.length} diagram(s), ${nodeCount} nodes, ${edgeCount} edges`,
  );
}

/* ---- /convert samples convert, through the real importers --------------- */

/*
 * Same contract, other page: `/convert` offers one sample per Mermaid dialect
 * and promises each becomes `.alab`. A sample that stopped converting would
 * hand a reader a broken paste on the page whose entire job is conversion, so
 * it is asserted here rather than left to be noticed.
 *
 * The round trip is the part worth pinning: converting is only useful if what
 * comes out is a document the rest of the app READS BACK — which is what makes
 * "copy this into your repo" a true instruction.
 */
console.log("\n/convert samples (converted through the real importers)");

const { convertMermaid } = await import(
  pathToFileURL(path.join(ROOT, "src/features/convert/lib/convert.ts")).href
);
const { CONVERT_SAMPLES } = await import(
  pathToFileURL(path.join(ROOT, "src/features/convert/content/samples.ts")).href
);
const { detectAlabKind, parseArchText, parseSequenceText } = await import(
  pathToFileURL(path.join(ROOT, "src/features/archtext/index.ts")).href
);

/** label -> the document kind the conversion must produce. */
const CONVERT_EXPECTED = new Map([
  ["Mermaid sequenceDiagram", "sequence"],
  ["Mermaid C4", "c4"],
]);

if (CONVERT_SAMPLES.length !== CONVERT_EXPECTED.size) {
  fail(
    "convert sample list",
    `CONVERT_SAMPLES has ${CONVERT_SAMPLES.length} entries but this script expects ${CONVERT_EXPECTED.size} — add the new sample's expectation here.`,
  );
}

for (const sample of CONVERT_SAMPLES) {
  if (!CONVERT_EXPECTED.has(sample.label)) {
    fail(sample.label, "no expectation declared in this script");
    continue;
  }
  const expected = CONVERT_EXPECTED.get(sample.label);
  const result = convertMermaid(sample.source);
  if (result.status !== "ok") {
    fail(
      sample.label,
      `expected a ${expected} conversion, got status "${result.status}": ${result.message}`,
    );
    continue;
  }
  if (result.kind !== expected) {
    fail(sample.label, `converted to "${result.kind}", expected "${expected}"`);
    continue;
  }
  if (detectAlabKind(result.alabText) !== expected) {
    fail(
      sample.label,
      `the .alab it produced does not announce itself as ${expected} on line 1`,
    );
    continue;
  }
  try {
    if (expected === "sequence") parseSequenceText(result.alabText);
    else parseArchText(result.alabText);
  } catch (error) {
    fail(sample.label, `the .alab it produced does not parse back: ${error}`);
    continue;
  }
  if (result.caveat.length === 0) {
    fail(sample.label, "converted with no caveat — the loss must be named");
    continue;
  }
  ok(`${sample.label} — converts to ${result.kind} .alab that parses back`);
}

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${validated} sample check(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${validated} /validate and /convert samples verified.`);

#!/usr/bin/env node
/**
 * Round-trip fidelity check — the roadmap's headline
 * persistence criterion: open a file, change nothing, save, and the bytes
 * must be identical.
 *
 * Loads the REAL serializer/deserializer from `src/features/editor/io/**`
 * via Node's built-in TypeScript type stripping (Node >= 23.6). A small
 * resolve hook maps the repo's `@/*` path alias and extensionless relative
 * imports onto the actual `.ts` files, so this script and the app exercise
 * the exact same code.
 *
 * What it proves, on the committed fixture:
 *   1. deserialize -> serialize is byte-identical (including line endings and
 *      the trailing newline), with `updatedAt` untouched.
 *   2. The pass is idempotent (serialize(deserialize(out)) === out).
 *   3. The fixture actually carries the hard cases (unknown fields at file,
 *      diagram, node AND edge level; a node with every optional present and
 *      one with none) — so a serializer that dropped them could not pass.
 *   4. An explicit `updatedAt` override changes exactly one line.
 *   5. Each of the schema's 8 load-time hard errors is detected on a
 *      deliberately broken copy, with the offending JSON path named.
 *
 * Exits non-zero on any failure. Run with: pnpm check:roundtrip
 */

import { existsSync, readFileSync, statSync } from "node:fs";
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

const { serializeModel } = await import(
  pathToFileURL(path.join(ROOT, "src/features/editor/io/serialize.ts")).href
);
const { deserializeModel } = await import(
  pathToFileURL(path.join(ROOT, "src/features/editor/io/deserialize.ts")).href
);
const { FileValidationError } = await import(
  pathToFileURL(path.join(ROOT, "src/features/editor/io/validate.ts")).href
);

/* ----------------------------------------------------------------------- */
/* Harness                                                                  */
/* ----------------------------------------------------------------------- */

let failures = 0;

function ok(label) {
  console.log(`  ✓ ${label}`);
}

function fail(label, detail) {
  failures += 1;
  console.error(`  ✗ ${label}`);
  if (detail) console.error(`    ${detail}`);
}

function check(label, condition, detail) {
  if (condition) ok(label);
  else fail(label, detail);
}

function firstDifference(a, b) {
  const aLines = a.split("\n");
  const bLines = b.split("\n");
  const max = Math.max(aLines.length, bLines.length);
  for (let i = 0; i < max; i += 1) {
    if (aLines[i] !== bLines[i]) {
      return `line ${i + 1}:\n    fixture:    ${JSON.stringify(aLines[i])}\n    serialized: ${JSON.stringify(bLines[i])}`;
    }
  }
  return "(no line-level difference — check encoding/line endings)";
}

/* ----------------------------------------------------------------------- */
/* 1+2. Byte-identical round-trip on the committed fixture                  */
/* ----------------------------------------------------------------------- */

const FIXTURE_PATH = path.join(
  ROOT,
  "src/features/editor/io/__fixtures__/shopflow.archlab.json",
);

console.log("round-trip fidelity");

const fixtureBytes = readFileSync(FIXTURE_PATH);
const fixtureText = fixtureBytes.toString("utf8");

check(
  "fixture uses LF line endings only",
  !fixtureText.includes("\r"),
  "found a carriage return",
);
check(
  "fixture ends with exactly one trailing newline",
  fixtureText.endsWith("\n") && !fixtureText.endsWith("\n\n"),
);

const model = deserializeModel(fixtureText);
const out = serializeModel(model);

if (Buffer.compare(Buffer.from(out, "utf8"), fixtureBytes) === 0) {
  ok("open → save is byte-identical (no-op round-trip)");
} else {
  fail(
    "open → save is byte-identical (no-op round-trip)",
    `first difference at ${firstDifference(fixtureText, out)}`,
  );
}

check(
  "second pass is idempotent",
  serializeModel(deserializeModel(out)) === out,
);

/* ----------------------------------------------------------------------- */
/* 3. The fixture actually carries the hard cases (integration risk R4)    */
/* ----------------------------------------------------------------------- */

console.log("fixture coverage");

const MARKERS = [
  ['unknown field at file level ("x-workspace")', '"x-workspace"'],
  ['unknown field inside metadata ("x-checksum")', '"x-checksum"'],
  ['unknown field at diagram level ("x-layout-hint")', '"x-layout-hint"'],
  ['unknown field at node level ("x-badge")', '"x-badge"'],
  ['unknown field at edge level ("x-confidence")', '"x-confidence"'],
  ['integral zoom written as an integer ("zoom": 1)', '"zoom": 1,'],
  ["a fully-optional node (pinned present)", '"pinned": true'],
  ["edge waypoints present", '"waypoints"'],
  ["a bare node with no optionals", '"legacy-erp"'],
];
for (const [label, marker] of MARKERS) {
  check(
    `${label} survives in fixture and output`,
    fixtureText.includes(marker) && out.includes(marker),
    `marker ${marker} missing`,
  );
}

// In-position preservation: the node-level unknown key must still sit
// immediately after the known key it follows in the source.
check(
  "node-level unknown field stays in position (after technology)",
  /"technology": "Go 1\.22",\n\s+"x-badge": "beta",/.test(out),
);

/* ----------------------------------------------------------------------- */
/* 4. updatedAt is written only when asked — and changes exactly one line   */
/* ----------------------------------------------------------------------- */

console.log("updatedAt discipline");

const bumped = serializeModel(model, { updatedAt: "2099-01-01T00:00:00.000Z" });
const beforeLines = out.split("\n");
const afterLines = bumped.split("\n");
const changed = [];
for (let i = 0; i < Math.max(beforeLines.length, afterLines.length); i += 1) {
  if (beforeLines[i] !== afterLines[i]) changed.push(i);
}
check(
  "an explicit updatedAt override changes exactly one line",
  changed.length === 1 &&
    afterLines[changed[0]].includes('"updatedAt": "2099-01-01T00:00:00.000Z"'),
  `changed lines: ${changed.map((i) => i + 1).join(", ") || "(none)"}`,
);
check(
  "plain serialize leaves updatedAt untouched",
  out === serializeModel(model),
);

/* ----------------------------------------------------------------------- */
/* 5. The 8 load-time hard errors are detected, with the JSON path named   */
/* ----------------------------------------------------------------------- */

console.log("load-time hard errors");

function expectRefusal(label, mutate, expectedPathFragment) {
  const doc = JSON.parse(fixtureText);
  mutate(doc);
  try {
    deserializeModel(JSON.stringify(doc));
    fail(label, "expected FileValidationError, but the file was accepted");
  } catch (error) {
    if (!(error instanceof FileValidationError)) {
      fail(label, `expected FileValidationError, got: ${error}`);
      return;
    }
    if (
      error.issues.some((issue) => issue.path.includes(expectedPathFragment))
    ) {
      ok(`${label} — "${error.message.slice(0, 88)}…"`);
    } else {
      fail(
        label,
        `no issue path contains "${expectedPathFragment}": ${error.issues
          .map((issue) => issue.path)
          .join(", ")}`,
      );
    }
  }
}

expectRefusal(
  "1. newer major version is refused with an upgrade explanation",
  (doc) => {
    doc.version = "2.0";
  },
  "version",
);
expectRefusal(
  "2. unresolvable rootDiagramId is refused",
  (doc) => {
    doc.rootDiagramId = "d-missing";
  },
  "rootDiagramId",
);
expectRefusal(
  "3. duplicate node id across the file is refused",
  (doc) => {
    doc.diagrams[1].nodes[0].id = doc.diagrams[0].nodes[0].id;
  },
  "diagrams[1].nodes[0].id",
);
expectRefusal(
  "4. edge endpoint outside its diagram is refused",
  (doc) => {
    doc.diagrams[0].edges[0].target = doc.diagrams[1].nodes[1].id;
  },
  "diagrams[0].edges[0].target",
);
expectRefusal(
  "5. node type invalid for its level is refused",
  (doc) => {
    doc.diagrams[0].nodes[0].type = "servcie";
  },
  "diagrams[0].nodes[0].type",
);
expectRefusal(
  "6. child level not one step deeper is refused",
  (doc) => {
    const child = doc.diagrams.find((d) => d.parentDiagramId !== null);
    child.level = "code";
  },
  ".level",
);
expectRefusal(
  "7. parentDiagramId cycle is refused",
  (doc) => {
    const root = doc.diagrams.find((d) => d.parentDiagramId === null);
    const child = doc.diagrams.find((d) => d.parentDiagramId === root.id);
    root.parentDiagramId = child.id;
    root.ownerNodeId = child.nodes[0].id;
  },
  "parentDiagramId",
);
expectRefusal(
  "8. childDiagramId + childRef on one node is refused",
  (doc) => {
    for (const diagram of doc.diagrams) {
      for (const node of diagram.nodes) {
        if (typeof node.childDiagramId === "string") {
          node.childRef = "./elsewhere.archlab.json";
          return;
        }
      }
    }
  },
  "childRef",
);
try {
  deserializeModel("{ not json");
  fail("malformed JSON throws FileValidationError");
} catch (error) {
  check(
    "malformed JSON throws FileValidationError naming the problem",
    error instanceof FileValidationError &&
      error.message.includes("not valid JSON"),
    String(error),
  );
}

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll round-trip checks passed.");

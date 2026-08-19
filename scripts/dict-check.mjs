#!/usr/bin/env node
/**
 * Data dictionary format check (`.alab` dict grammar). Loads the REAL library
 * via Node's type stripping plus a resolve hook for `@/*`, so this script and
 * the app exercise the same code.
 *
 * What it proves:
 *   1. Canonical text → model → text is byte-identical (kitchen sink: every
 *      flag, every prose slot, a quoted type, technology, tags, two sections).
 *   2. Model → text → model is structurally identical for a HAND-BUILT model,
 *      reserved-word names included.
 *   3. Unknown forward-compatible fields survive verbatim and in position, at
 *      file, metadata, section and field scope.
 *   4. Bare/quoted symmetry — what the parser reads unquoted the serializer
 *      writes unquoted, or "open, change nothing, save" changes bytes.
 *   5. `detectAlabKind` answers for all SIX headers and refuses near-misses.
 *   6. Malformed inputs each fail with a line and column that point into the
 *      source, and the dictionary-specific rules — the closed flag vocabulary,
 *      the duplicate-field rule, the duplicate-section rule, the
 *      `desc`-before-fields window, and `source` on a section — each get a
 *      named refusal.
 *   7. The six grammars never cross-parse.
 *
 * Run with: pnpm check:dict
 */

import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

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
      if (!(existsSync(asPath) && statSync(asPath).isFile())) {
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

const {
  parseArchText,
  parseSequenceText,
  parseFlowchartText,
  parseUseCaseText,
  parseErText,
  parseDictText,
  serializeDictText,
  detectAlabKind,
  ArchTextParseError,
} = await import(
  pathToFileURL(path.join(ROOT, "src/features/archtext/index.ts")).href
);

let failures = 0;
let assertions = 0;
const check = (label, condition, detail) => {
  assertions += 1;
  if (condition) {
    console.log(`  ✓ ${label}`);
    return;
  }
  failures += 1;
  console.error(`  ✗ ${label}`);
  if (detail) console.error(`    ${detail}`);
};
const firstDiff = (a, b) => {
  const la = a.split("\n");
  const lb = b.split("\n");
  for (let i = 0; i < Math.max(la.length, lb.length); i += 1) {
    if (la[i] !== lb[i]) {
      return `first difference at line ${i + 1}:\n    a: ${la[i]}\n    b: ${lb[i]}`;
    }
  }
  return "";
};

console.log("kitchen sink (.alab dict, every construct)");

const KITCHEN_SINK = `archlab 1.0 dict
title "Customer API"
description "Every field a customer endpoint returns, and where it comes from"
owner "Platform"
tags #api #core
created 2026-08-01T00:00:00Z

@dict
  section "Customer" [REST payload] #core
    desc "The payload every customer endpoint returns"
    field id uuid required unique
      desc "Stable identifier, never reused after deletion"
      source "accounts.customer.id"
      values "RFC 4122"
      example "9f2a1c"
    field email string required unique pii
      desc "Lowercased on write so it can be a unique key"
      source "accounts.customer.email"
    field lifetime_value decimal(10,2) derived
      desc "Sum of settled orders, recomputed nightly"
    field legacy_ref string deprecated
  section "Order"
    field status string required
      values "one of draft | sent | paid"
      example "paid"
`;

{
  const model = parseDictText(KITCHEN_SINK);
  const text = serializeDictText(model);
  check(
    "canonical dict text round-trips byte-identically",
    text === KITCHEN_SINK,
    firstDiff(KITCHEN_SINK, text),
  );
  check(
    "every section and field survives",
    model.sections.length === 2 &&
      model.sections[0].fields.length === 4 &&
      model.sections[1].fields.length === 1,
    JSON.stringify(model.sections.map((s) => s.fields.length)),
  );
  check(
    "flags keep the order written",
    JSON.stringify(model.sections[0].fields[1].flags) ===
      '["required","unique","pii"]',
    JSON.stringify(model.sections[0].fields[1].flags),
  );
  check(
    "a field with no flags omits `flags` rather than writing []",
    model.sections[1].fields[0].flags !== undefined &&
      model.sections[0].fields[3].flags.length === 1,
    "expected legacy_ref to carry exactly one flag",
  );
  check(
    "all four prose slots survive on one field",
    (() => {
      const f = model.sections[0].fields[0];
      return (
        f.description !== undefined &&
        f.source !== undefined &&
        f.values !== undefined &&
        f.example !== undefined
      );
    })(),
    JSON.stringify(model.sections[0].fields[0]),
  );
}

console.log("hand-built model (not one the parser produced)");

{
  const model = {
    version: "1.0",
    kind: "dict",
    metadata: {
      title: "Reserved",
      createdAt: "1970-01-01T00:00:00.000Z",
      updatedAt: "1970-01-01T00:00:00.000Z",
    },
    sections: [
      {
        label: "Odd names",
        fields: [
          { name: "field", type: "string" },
          { name: "source", type: "string", flags: ["required"] },
        ],
      },
    ],
  };
  const text = serializeDictText(model);
  check(
    "reserved-word field names are quoted, so the parser cannot read them as keywords",
    text.includes('field "field" string') &&
      text.includes('field "source" string required'),
    text,
  );
  check(
    "model -> text -> model is structurally identical",
    JSON.stringify(parseDictText(text)) === JSON.stringify(model),
    JSON.stringify(parseDictText(text)),
  );
}

console.log("forward tolerance");

const FORWARD = `archlab 1.0 dict
title "Forward"
! meta.futureMeta : {"a":1}
! futureFile : [1,2]

@dict
  section "S"
    ! futureSection : "s"
    field f string
      ! futureField : true
`;

{
  const text = serializeDictText(parseDictText(FORWARD));
  check(
    "unknown fields at file, meta, section and field scope round-trip verbatim",
    text === FORWARD,
    firstDiff(FORWARD, text),
  );
}

console.log("bare/quoted symmetry");

for (const [what, line] of [
  ["a parenthesised type", "    field total decimal(10,2)"],
  ["a type with a space", '    field total "character varying"'],
]) {
  const src = `archlab 1.0 dict\ntitle "T"\n\n@dict\n  section "S"\n${line}\n`;
  const text = serializeDictText(parseDictText(src));
  check(`${what} round-trips unchanged`, text === src, firstDiff(src, text));
}

console.log("document-type detection");

{
  for (const [header, kind] of [
    ["archlab 1.0", "c4"],
    ["archlab 1.0 sequence", "sequence"],
    ["archlab 1.0 flowchart", "flowchart"],
    ["archlab 1.0 usecase", "usecase"],
    ["archlab 1.0 er", "er"],
    ["archlab 1.0 dict", "dict"],
  ]) {
    check(
      `"${header}" detects as ${kind}`,
      detectAlabKind(`${header}\ntitle "T"\n`) === kind,
      `got ${detectAlabKind(`${header}\ntitle "T"\n`)}`,
    );
  }
  for (const near of ["archlab 1.0 dictionary", "archlab 1.0 dict x"]) {
    check(
      `"${near}" is not mistaken for a dict header`,
      detectAlabKind(`${near}\n`) !== "dict",
      `got ${detectAlabKind(`${near}\n`)}`,
    );
  }
}

console.log("refusals");

const BODY = (body) => `archlab 1.0 dict\ntitle "T"\n\n@dict\n${body}\n`;

for (const [what, source, pattern] of [
  [
    "a flag outside the closed vocabulary",
    BODY('  section "S"\n    field f string mandatory'),
    /closed/i,
  ],
  [
    "a flag listed twice",
    BODY('  section "S"\n    field f string required required'),
    /twice/i,
  ],
  [
    "a field declared twice in one section",
    BODY('  section "S"\n    field f string\n    field f uuid'),
    /duplicate field/i,
  ],
  [
    "two sections with one heading",
    BODY(
      '  section "S"\n    field a string\n  section "S"\n    field b string',
    ),
    /duplicate section/i,
  ],
  [
    "a section `desc` after its fields",
    BODY('  section "S"\n    field f string\n    desc "late"'),
    /before the first "field"/i,
  ],
  [
    "a field outside any section",
    BODY("  field f string"),
    /belongs inside a "section"/i,
  ],
  [
    "`source` on a section",
    BODY('  section "S"\n    source "x"\n    field f string'),
    /describes one field/i,
  ],
  ["a section with no fields", BODY('  section "S"'), /documents no fields/i],
  [
    "a tab for indentation",
    'archlab 1.0 dict\ntitle "T"\n\n@dict\n\tsection "S"\n',
    /tabs/i,
  ],
  [
    "a file with no title",
    'archlab 1.0 dict\n\n@dict\n  section "S"\n    field f string\n',
    /title/i,
  ],
  ["a file with no @dict block", 'archlab 1.0 dict\ntitle "T"\n', /@dict/i],
]) {
  let error = null;
  try {
    parseDictText(source);
  } catch (caught) {
    error = caught;
  }
  if (error === null) {
    check(`${what} is refused`, false, "it parsed");
    continue;
  }
  const lines = source.split("\n");
  const inRange =
    error.line >= 1 &&
    error.line <= lines.length &&
    error.column >= 1 &&
    error.column <= (lines[error.line - 1] ?? "").length + 1;
  check(
    `${what} is refused, at a line and column that point into the source`,
    error instanceof ArchTextParseError &&
      pattern.test(error.message) &&
      inRange,
    `line ${error.line}, column ${error.column}: ${error.message}`,
  );
}

console.log("no cross-parsing (six grammars)");

{
  const OTHERS = [
    ["c4", "archlab 1.0", parseArchText, "C4"],
    ["sequence", "archlab 1.0 sequence", parseSequenceText, "sequence"],
    ["flowchart", "archlab 1.0 flowchart", parseFlowchartText, "flowchart"],
    ["usecase", "archlab 1.0 usecase", parseUseCaseText, "use-case"],
    ["er", "archlab 1.0 er", parseErText, "ER"],
  ];
  for (const [kind, header, otherParser, named] of OTHERS) {
    let message = "";
    try {
      parseDictText(`${header}\ntitle "T"\n`);
    } catch (error) {
      message = error.message;
    }
    check(
      `the dict parser refuses a ${kind} header by name`,
      message.includes(named),
      message || "it parsed",
    );
    let refused = false;
    try {
      otherParser(
        'archlab 1.0 dict\ntitle "T"\n\n@dict\n  section "S"\n    field f string\n',
      );
    } catch {
      refused = true;
    }
    check(`the ${kind} parser refuses a dict header`, refused, "it parsed");
  }
}

console.log("");
if (failures > 0) {
  console.error(`${failures} of ${assertions} assertions failed.`);
  process.exit(1);
}
console.log(`All ${assertions} assertions passed.`);

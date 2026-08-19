#!/usr/bin/env node
/**
 * ER document format check (`.alab` er grammar). Follows the pattern of
 * `scripts/usecase-check.mjs`: loads the REAL library from
 * `src/features/archtext/**` via Node's built-in TypeScript type stripping
 * plus a resolve hook for the `@/*` alias, so this script and the app
 * exercise the exact same code.
 *
 * What it proves — and why it matters: the ER format makes the same promise
 * the other four `.alab` grammars make, "text and model are two faces of the
 * same document"; each clause below is one way that promise could silently
 * break.
 *
 *   1. Canonical `.alab` er text → model → text is byte-identical (kitchen
 *      sink exercising every construct: entities with and without columns,
 *      composite keys, a quoted type, technology, tags, entity and column
 *      descriptions, bare and quoted relationship labels, an unlabelled
 *      relationship, and both connector styles).
 *   2. Model → text → model is structurally identical for a hand-built
 *      model (not one the parser produced), reserved-word ids included.
 *   3. Unknown forward-compatible fields survive a round trip verbatim AND
 *      in their original key position, at file, metadata, entity, column and
 *      relationship scope.
 *   4. THE CARDINALITY MIRROR. Every one of the 4 x 2 x 4 tokens parses to
 *      the cardinality pair its glyphs name, and serializes back to the same
 *      token. This is the check that would have caught the bug the model was
 *      shaped to prevent: `}o` on the left and `o{` on the right mean the
 *      same thing, so a serializer that reverses one string to make the
 *      other emits `{o` — which parses as nothing and draws as nothing. A
 *      test that only round-tripped ONE token would pass with that bug in
 *      place, so this walks the whole product of the tables.
 *   5. THE BARE/QUOTED SYMMETRY. Whatever the parser accepts unquoted, the
 *      serializer must write unquoted, or "open a file, change nothing,
 *      save" changes bytes. Checked at the two places ER has its own token
 *      class: a column type (`numeric(10,2)` — parens, which the shared
 *      `BARE_VALUE_RE` rejects) and a relationship label.
 *   6. `detectAlabKind` gives the right verdict for all FIVE headers and
 *      refuses near-misses — a wrong-but-confident answer routes text to the
 *      wrong parser, whose error would then mislead.
 *   7. Malformed inputs each fail with an error naming a line and a column
 *      that points into the source (so the offending line can be quoted),
 *      and the parse is all-or-nothing. The ER-specific semantics — the
 *      closed key vocabulary, the duplicate-column rule, the
 *      entities-before-relationships rule, and the `desc`-before-columns
 *      window — each get a named refusal here, because each is a statement
 *      the diagram type exists to make and a parser that let one through
 *      would draw a lie.
 *   8. The five document types never cross-parse: the ER parser refuses the
 *      other four kinds at their header line, by name, and each of the other
 *      four refuses an ER header the same way — none of them answered with a
 *      misleading line-1 syntax error.
 *
 * Exits non-zero on any failure. Run with: pnpm check:er
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

const {
  parseArchText,
  parseSequenceText,
  parseFlowchartText,
  parseUseCaseText,
  parseErText,
  serializeErText,
  detectAlabKind,
  ArchTextParseError,
} = await import(
  pathToFileURL(path.join(ROOT, "src/features/archtext/index.ts")).href
);

const { LEFT_CARDINALITY, RIGHT_CARDINALITY, CONNECTOR_BY_KIND } = await import(
  pathToFileURL(path.join(ROOT, "src/features/archtext/lib/er/keywords.ts"))
    .href
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

function firstDiff(a, b) {
  const la = a.split("\n");
  const lb = b.split("\n");
  for (let i = 0; i < Math.max(la.length, lb.length); i += 1) {
    if (la[i] !== lb[i]) {
      return `first difference at line ${i + 1}:\n    a: ${la[i]}\n    b: ${lb[i]}`;
    }
  }
  return "";
}

/* ----------------------------------------------------------------------- */
/* 1. Kitchen sink — canonical text, byte-identical round trip             */
/* ----------------------------------------------------------------------- */

console.log("kitchen sink (.alab er, every construct)");

const KITCHEN_SINK = `archlab 1.0 er
title "Order database"
description "What the shop stores, and how a record finds another"
owner "Platform"
tags #billing #core
created 2026-08-01T00:00:00Z
reviewed 2026-08-19T00:00:00Z

@er
  entity customer "Customer" [PostgreSQL] #core
    desc "Someone who has ordered at least once"
    attr id uuid pk
    attr email string uk
      desc "Login identity, lowercased on write"
    attr name string
  entity order "Order" [PostgreSQL]
    attr id uuid pk
    attr customer_id uuid pk fk
    attr total numeric(10,2)
    attr placed_at timestamptz
  entity address "Address"
  entity audit_log "Audit log" #core
    attr id bigserial pk
    attr note "character varying"

  customer ||--o{ order : places
  order }o..|| address : "ships to"
  customer |o--|{ address
  order }|..o{ audit_log : writes
`;

{
  const model = parseErText(KITCHEN_SINK);
  const text = serializeErText(model);
  check(
    "canonical er text round-trips byte-identically",
    text === KITCHEN_SINK,
    firstDiff(KITCHEN_SINK, text),
  );
  check(
    "every entity and relationship survives",
    model.entities.length === 4 && model.relationships.length === 4,
    `got ${model.entities.length} entities, ${model.relationships.length} relationships`,
  );
  /* An entity with no columns must carry NO `attributes` key — an empty
     array would be a second spelling of the same document, and two
     spellings is what breaks a byte-identical round trip. */
  const address = model.entities.find((e) => e.id === "address");
  check(
    "an entity with no columns omits `attributes` rather than writing []",
    address !== undefined && address.attributes === undefined,
    `got ${JSON.stringify(address?.attributes)}`,
  );
  const composite = model.entities
    .find((e) => e.id === "order")
    .attributes.find((a) => a.name === "customer_id");
  check(
    "a composite key keeps both roles, in the order written",
    JSON.stringify(composite.keys) === '["pk","fk"]',
    `got ${JSON.stringify(composite.keys)}`,
  );
  const plain = model.entities
    .find((e) => e.id === "customer")
    .attributes.find((a) => a.name === "name");
  check(
    "a plain column omits `keys` rather than writing []",
    plain.keys === undefined,
    `got ${JSON.stringify(plain.keys)}`,
  );
  const unlabelled = model.relationships.find(
    (r) => r.to === "address" && r.from === "customer",
  );
  check(
    'an unlabelled relationship omits `label` rather than writing ""',
    unlabelled.label === undefined,
    `got ${JSON.stringify(unlabelled.label)}`,
  );
}

/* ----------------------------------------------------------------------- */
/* 2. Model -> text -> model, from a hand-built model                      */
/* ----------------------------------------------------------------------- */

console.log("hand-built model (not one the parser produced)");

{
  /* `entity` and `attr` as ids: the reserved words must come back quoted, or
     the text this produces would be read as a keyword line. */
  const model = {
    version: "1.0",
    kind: "er",
    metadata: {
      title: "Reserved words",
      createdAt: "1970-01-01T00:00:00.000Z",
      updatedAt: "1970-01-01T00:00:00.000Z",
    },
    entities: [
      { id: "entity", label: "Entity" },
      {
        id: "attr",
        label: "Attr",
        attributes: [{ name: "desc", type: "text" }],
      },
    ],
    relationships: [
      {
        from: "entity",
        fromCardinality: "one",
        to: "attr",
        toCardinality: "zero-or-more",
        kind: "identifying",
      },
    ],
  };
  const text = serializeErText(model);
  check(
    "reserved-word ids are quoted on the lines that would otherwise dispatch on them",
    text.includes('entity "entity" "Entity"') &&
      text.includes('"entity" ||--o{ "attr"') &&
      text.includes('attr "desc" text'),
    text,
  );
  const back = parseErText(text);
  check(
    "model -> text -> model is structurally identical",
    JSON.stringify(back) === JSON.stringify(model),
    `\n    a: ${JSON.stringify(model)}\n    b: ${JSON.stringify(back)}`,
  );
}

/* ----------------------------------------------------------------------- */
/* 3. Forward tolerance — unknown fields at every scope                    */
/* ----------------------------------------------------------------------- */

console.log("forward tolerance (unknown fields from a newer minor)");

const FORWARD = `archlab 1.0 er
title "Forward"
! meta.futureMeta : {"a":1}
! futureFile : [1,2]

@er
  entity customer "Customer"
    ! futureEntity : "e"
    attr id uuid pk
      ! futureColumn : true

  customer ||--o{ customer : loops
    ! futureRelationship : 7
`;

{
  const model = parseErText(FORWARD);
  const text = serializeErText(model);
  check(
    "unknown fields at file, meta, entity, column and relationship scope round-trip verbatim",
    text === FORWARD,
    firstDiff(FORWARD, text),
  );
  check(
    "an unknown field keeps its value, not a stringified copy",
    model.futureFile.length === 2 && model.entities[0].futureEntity === "e",
    JSON.stringify(model.futureFile),
  );
}

/* ----------------------------------------------------------------------- */
/* 4. The cardinality mirror — every token in the product of the tables    */
/* ----------------------------------------------------------------------- */

console.log("cardinality mirror (all 4 x 2 x 4 tokens)");

{
  const lefts = Object.entries(LEFT_CARDINALITY);
  const rights = Object.entries(RIGHT_CARDINALITY);
  const connectors = Object.entries(CONNECTOR_BY_KIND);
  let wrong = null;
  let count = 0;
  for (const [leftGlyph, leftName] of lefts) {
    for (const [kind, connector] of connectors) {
      for (const [rightGlyph, rightName] of rights) {
        const token = `${leftGlyph}${connector}${rightGlyph}`;
        const src = `archlab 1.0 er\ntitle "T"\n\n@er\n  entity a "A"\n  entity b "B"\n\n  a ${token} b\n`;
        count += 1;
        let model;
        try {
          model = parseErText(src);
        } catch (error) {
          wrong = wrong ?? `${token} failed to parse: ${error.message}`;
          continue;
        }
        const rel = model.relationships[0];
        if (
          rel.fromCardinality !== leftName ||
          rel.toCardinality !== rightName ||
          rel.kind !== kind
        ) {
          wrong =
            wrong ??
            `${token} parsed as ${rel.fromCardinality}/${rel.kind}/${rel.toCardinality}, expected ${leftName}/${kind}/${rightName}`;
          continue;
        }
        const back = serializeErText(model);
        if (back !== src) {
          wrong = wrong ?? `${token} did not serialize back to itself`;
        }
      }
    }
  }
  check(
    `all ${count} relationship tokens parse to the pair their glyphs name and serialize back unchanged`,
    wrong === null &&
      count === lefts.length * connectors.length * rights.length,
    wrong ??
      `expected ${lefts.length * connectors.length * rights.length}, walked ${count}`,
  );
  /* The specific reversal bug the per-side table exists to prevent. */
  check(
    "`{o` — the string reversal of a right-hand glyph — is refused, not drawn",
    (() => {
      try {
        parseErText(
          `archlab 1.0 er\ntitle "T"\n\n@er\n  entity a "A"\n  entity b "B"\n\n  a ||--{o b\n`,
        );
        return false;
      } catch {
        return true;
      }
    })(),
    "a reversed glyph parsed — the serializer could emit an undrawable token",
  );
}

/* ----------------------------------------------------------------------- */
/* 5. Bare/quoted symmetry — what parses bare must serialize bare          */
/* ----------------------------------------------------------------------- */

console.log("bare/quoted symmetry (open, change nothing, save)");

{
  for (const [what, line, expectQuoted] of [
    ["a parenthesised column type", "    attr total numeric(10,2)", false],
    ["a column type with a space", '    attr total "character varying"', true],
    ["a one-word relationship label", "  a ||--o{ b : places", false],
    ["a relationship label with a space", '  a ||--o{ b : "ships to"', true],
  ]) {
    const isColumn = line.includes("attr");
    const src = isColumn
      ? `archlab 1.0 er\ntitle "T"\n\n@er\n  entity a "A"\n${line}\n  entity b "B"\n\n  a ||--o{ b\n`
      : `archlab 1.0 er\ntitle "T"\n\n@er\n  entity a "A"\n  entity b "B"\n\n${line}\n`;
    let text;
    try {
      text = serializeErText(parseErText(src));
    } catch (error) {
      fail(`${what} round-trips unchanged`, error.message);
      continue;
    }
    check(
      `${what} round-trips unchanged (${expectQuoted ? "stays quoted" : "stays bare"})`,
      text === src,
      firstDiff(src, text),
    );
  }
}

/* ----------------------------------------------------------------------- */
/* 6. Document-type detection across all five grammars                     */
/* ----------------------------------------------------------------------- */

console.log("document-type detection");

{
  const HEADERS = [
    ["archlab 1.0", "c4"],
    ["archlab 1.0 sequence", "sequence"],
    ["archlab 1.0 flowchart", "flowchart"],
    ["archlab 1.0 usecase", "usecase"],
    ["archlab 1.0 er", "er"],
  ];
  for (const [header, kind] of HEADERS) {
    check(
      `"${header}" detects as ${kind}`,
      detectAlabKind(`${header}\ntitle "T"\n`) === kind,
      `got ${detectAlabKind(`${header}\ntitle "T"\n`)}`,
    );
  }
  /* Anchored to the whole line: a confidently wrong answer routes text to
     the wrong parser, and that error misleads worse than no answer. */
  for (const near of ["archlab 1.0 erd", "archlab 1.0 er x", "archlab 1.0er"]) {
    check(
      `"${near}" is not mistaken for an er header`,
      detectAlabKind(`${near}\n`) !== "er",
      `got ${detectAlabKind(`${near}\n`)}`,
    );
  }
}

/* ----------------------------------------------------------------------- */
/* 7. Refusals — each names a line, a column, and the rule                 */
/* ----------------------------------------------------------------------- */

console.log("refusals (line, column, and the rule by name)");

const BODY = (body) => `archlab 1.0 er\ntitle "T"\n\n@er\n${body}\n`;

const REFUSALS = [
  [
    "a column key outside the closed vocabulary",
    BODY('  entity a "A"\n    attr id uuid primary'),
    /closed/i,
  ],
  [
    "a column declared twice in one entity",
    BODY('  entity a "A"\n    attr id uuid pk\n    attr id text'),
    /duplicate column/i,
  ],
  [
    "one key role listed twice on a column",
    BODY('  entity a "A"\n    attr id uuid pk pk'),
    /twice/i,
  ],
  [
    "an entity declared after the first relationship",
    BODY('  entity a "A"\n  entity b "B"\n\n  a ||--o{ b\n  entity c "C"'),
    /entities come first/i,
  ],
  [
    "an entity `desc` written after its columns",
    BODY('  entity a "A"\n    attr id uuid\n    desc "late"'),
    /before the first "attr"/i,
  ],
  [
    "an `attr` outside any entity",
    BODY("  attr id uuid"),
    /belongs inside an "entity"/i,
  ],
  [
    "a relationship naming an entity that was never declared",
    BODY('  entity a "A"\n\n  a ||--o{ ghost'),
    /does not resolve to an entity/i,
  ],
  [
    "a relationship with no cardinality token",
    BODY('  entity a "A"\n  entity b "B"\n\n  a -- b'),
    /relationship token/i,
  ],
  [
    "an empty relationship label",
    BODY('  entity a "A"\n  entity b "B"\n\n  a ||--o{ b : ""'),
    /must not be empty/i,
  ],
  [
    "a tab for indentation",
    'archlab 1.0 er\ntitle "T"\n\n@er\n\tentity a "A"\n',
    /tabs/i,
  ],
  [
    "an odd indent",
    'archlab 1.0 er\ntitle "T"\n\n@er\n   entity a "A"\n',
    /indentation/i,
  ],
  ["a file with no title", 'archlab 1.0 er\n\n@er\n  entity a "A"\n', /title/i],
  ["a file with no @er block", 'archlab 1.0 er\ntitle "T"\n', /@er/i],
];

for (const [what, source, pattern] of REFUSALS) {
  let error = null;
  try {
    parseErText(source);
  } catch (caught) {
    error = caught;
  }
  if (error === null) {
    fail(`${what} is refused`, "it parsed");
    continue;
  }
  if (!(error instanceof ArchTextParseError)) {
    fail(
      `${what} is refused`,
      `threw ${error.constructor.name}, not ArchTextParseError`,
    );
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
    pattern.test(error.message) && inRange,
    `line ${error.line}, column ${error.column}: ${error.message}`,
  );
}

/* ----------------------------------------------------------------------- */
/* 8. No cross-parsing between the five grammars                           */
/* ----------------------------------------------------------------------- */

console.log("no cross-parsing (five grammars, both directions)");

{
  const OTHERS = [
    ["c4", "archlab 1.0", parseArchText, /er/i],
    ["sequence", "archlab 1.0 sequence", parseSequenceText, /er/i],
    ["flowchart", "archlab 1.0 flowchart", parseFlowchartText, /er/i],
    ["usecase", "archlab 1.0 usecase", parseUseCaseText, /er/i],
  ];
  for (const [kind, header, otherParser] of OTHERS) {
    /* The ER parser, shown another kind's header, must name that kind. */
    let message = "";
    try {
      parseErText(`${header}\ntitle "T"\n`);
    } catch (error) {
      message = error.message;
    }
    check(
      `the er parser refuses a ${kind} header by name`,
      message.includes(
        kind === "c4" ? "C4" : kind === "usecase" ? "use-case" : kind,
      ),
      message || "it parsed",
    );

    /* And the other parser, shown an ER header, must refuse it rather than
       half-parsing a document it cannot draw. */
    let refused = false;
    try {
      otherParser('archlab 1.0 er\ntitle "T"\n\n@er\n  entity a "A"\n');
    } catch {
      refused = true;
    }
    check(`the ${kind} parser refuses an er header`, refused, "it parsed");
  }
}

/* ----------------------------------------------------------------------- */

console.log("");
if (failures > 0) {
  console.error(`${failures} of ${assertions} assertions failed.`);
  process.exit(1);
}
console.log(`All ${assertions} assertions passed.`);

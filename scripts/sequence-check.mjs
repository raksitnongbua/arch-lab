#!/usr/bin/env node
/**
 * Sequence document format check (`.alab` sequence grammar + the Mermaid
 * `sequenceDiagram` importer). Follows the pattern of
 * `scripts/archtext-check.mjs`: loads the REAL library from
 * `src/features/archtext/**` and `src/features/mermaid/**` via Node's
 * built-in TypeScript type stripping plus a resolve hook for the `@/*`
 * alias, so this script and the app exercise the exact same code.
 *
 * What it proves — and why it matters: the sequence format's whole promise
 * is "text and model are two faces of the same document"; each clause below
 * is one way that promise could silently break.
 *
 *   1. Canonical `.alab` sequence text → model → text is byte-identical
 *      (kitchen sink exercising every construct: both participant kinds and
 *      the unstated kind, all three arrows, activation suffixes, notes in
 *      all placements, fragments nested three deep with else/and branches).
 *   2. Model → text → model is structurally identical for a hand-built
 *      model (not one the parser produced), nested fragments three deep.
 *   3. Unknown forward-compatible fields survive a round trip verbatim AND
 *      in their original key position, at file, metadata, participant,
 *      message, fragment and branch scope.
 *   4. A realistic Mermaid `sequenceDiagram` imports, covering every
 *      supported construct at least once, and the imported model survives
 *      a serialize → parse trip.
 *   5. Malformed inputs each fail with an error naming a line and a column
 *      that points into the source (so the offending line can be quoted),
 *      and the parse is all-or-nothing.
 *   6. A C4 document is never mistaken for a sequence document, nor vice
 *      versa — in `.alab` (both parsers and the sniffing helper) and in
 *      Mermaid (both importers).
 *
 * Exits non-zero on any failure. Run with: pnpm check:sequence
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
  serializeSequenceText,
  detectAlabKind,
  ArchTextParseError,
} = await import(
  pathToFileURL(path.join(ROOT, "src/features/archtext/index.ts")).href
);
const {
  parseMermaidC4,
  parseMermaidSequence,
  MermaidParseError,
  MERMAID_SEQUENCE_CAVEAT,
} = await import(
  pathToFileURL(path.join(ROOT, "src/features/mermaid/index.ts")).href
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
/* 1. Kitchen sink — canonical text, byte-identical round trip              */
/* ----------------------------------------------------------------------- */

console.log("kitchen sink (.alab sequence, every construct)");

const KITCHEN_SINK = `archlab 1.0 sequence
schema "https://arch-lab.dev/schema/v1/sequence.schema.json"
title "Checkout Sequence"
description "Order placement, happy and unhappy paths."
owner "Payments Team"
tags #checkout #payments
created 2026-08-01T00:00:00Z
updated 2026-08-09T00:00:00Z
reviewed 2026-08-05T00:00:00Z
! meta.generator : {"name":"arch-lab","version":"0.1.0"}
! meta.x-review after updatedAt : {"cycle":30}
! x-pipeline : {"stage":"prod"}

@sequence
  autonumber
  cust:actor "Customer"
  web "Web App" [Next.js]
  api:participant "Order API" [Go 1.22 / chi]
    desc "Owns order state."
    ! x-owner after name : "payments"
  db:participant "Orders DB" [PostgreSQL 16]

  cust -> web : "Clicks buy"
  web ->+ api : "POST /orders" [HTTPS]
    ! x-trace after label : true
  note right api : "Validates the cart first"
  alt "cart valid"
    ! frag.x-frag after kind : 1
    ! x-branch after label : true
    api -> db : "INSERT order" [SQL]
    loop "retry x3"
      par "email"
        api ~> cust : "Sends receipt"
      and "audit"
        api ~> db : "Writes audit row"
    api ..>- web : "201 Created"
  else "cart empty"
    api ..>- web : "400 Bad Request"
  note over cust web : "Order flow complete"
`;

const sink = parseSequenceText(KITCHEN_SINK);
const sinkEmitted = serializeSequenceText(sink);
check(
  "kitchen-sink text → model → text is byte-identical",
  sinkEmitted === KITCHEN_SINK,
  firstDiff(sinkEmitted, KITCHEN_SINK),
);
check(
  "serialization is deterministic (two serializations are identical)",
  serializeSequenceText(parseSequenceText(KITCHEN_SINK)) === sinkEmitted,
);
check(
  "parsing is deterministic (two parses are deep-equal)",
  JSON.stringify(parseSequenceText(KITCHEN_SINK)) === JSON.stringify(sink),
);

check(
  "file shape: version, kind discriminant, $schema",
  sink.version === "1.0" &&
    sink.kind === "sequence" &&
    sink.$schema === "https://arch-lab.dev/schema/v1/sequence.schema.json",
);
check(
  "metadata: title, description, owner, tags, timestamps, reviewed",
  sink.metadata.title === "Checkout Sequence" &&
    sink.metadata.owner === "Payments Team" &&
    JSON.stringify(sink.metadata.tags) === '["checkout","payments"]' &&
    sink.metadata.createdAt === "2026-08-01T00:00:00Z" &&
    sink.metadata.lastReviewedAt === "2026-08-05T00:00:00Z",
);
check(
  "participants keep declaration order (it IS the lifeline order)",
  JSON.stringify(sink.participants.map((p) => p.id)) ===
    '["cust","web","api","db"]',
);
const web = sink.participants.find((p) => p.id === "web");
const api = sink.participants.find((p) => p.id === "api");
check(
  "participant kinds: actor, stated participant, and unstated all survive",
  sink.participants.find((p) => p.id === "cust")?.kind === "actor" &&
    api?.kind === "participant" &&
    web?.kind === undefined &&
    !("kind" in web),
);
check(
  "participant technology and description survive",
  api?.technology === "Go 1.22 / chi" &&
    api?.description === "Owns order state.",
);
check("autonumber survives", sink.autonumber === true);
check(
  "items keep source order (ordering is the point of a sequence diagram)",
  JSON.stringify(sink.items.map((i) => i.step)) ===
    '["message","message","note","fragment","note"]',
);
const post = sink.items[1];
check(
  "message: kind, label, technology and the + activation suffix survive",
  post.from === "web" &&
    post.to === "api" &&
    post.kind === "sync" &&
    post.label === "POST /orders" &&
    post.technology === "HTTPS" &&
    post.activate === true,
);
const alt = sink.items[3];
const happy = alt.branches[0];
const reply201 = happy.items[2];
check(
  "the ..>- reply deactivates its source",
  reply201.kind === "reply" &&
    reply201.deactivate === true &&
    reply201.from === "api",
);
check(
  "fragments nest three deep with labels intact (alt > loop > par)",
  alt.kind === "alt" &&
    alt.branches.length === 2 &&
    happy.label === "cart valid" &&
    happy.items[1].kind === "loop" &&
    happy.items[1].branches[0].label === "retry x3" &&
    happy.items[1].branches[0].items[0].kind === "par" &&
    happy.items[1].branches[0].items[0].branches
      .map((b) => b.label)
      .join("|") === "email|audit",
  JSON.stringify(alt),
);
check(
  "async messages (~>) land in the innermost par branches",
  happy.items[1].branches[0].items[0].branches[0].items[0].kind === "async" &&
    happy.items[1].branches[0].items[0].branches[1].items[0].to === "db",
);
check(
  "notes: right-of-one and over-two both survive",
  sink.items[2].placement === "right" &&
    JSON.stringify(sink.items[2].participants) === '["api"]' &&
    sink.items[4].placement === "over" &&
    JSON.stringify(sink.items[4].participants) === '["cust","web"]',
);

/* ----------------------------------------------------------------------- */
/* 2. Model → text → model, structurally identical (hand-built model)       */
/* ----------------------------------------------------------------------- */

console.log("model → text → model (hand-built, three-deep fragments)");

/* Built by hand in canonical key order — deliberately NOT a parser product,
   so this proves the serializer accepts models born in an editor, not just
   its own parser's output. */
const HAND_MODEL = {
  version: "1.0",
  kind: "sequence",
  metadata: {
    title: "Hand-built",
    createdAt: "1970-01-01T00:00:00Z",
    updatedAt: "1970-01-01T00:00:00Z",
  },
  participants: [
    { id: "a", kind: "actor", name: "A" },
    { id: "b", name: "B" },
    { id: "loop", name: "Reserved Word Lifeline" },
  ],
  items: [
    {
      step: "message",
      from: "a",
      to: "loop",
      kind: "sync",
      label: "uses a reserved id",
    },
    {
      step: "fragment",
      kind: "opt",
      branches: [
        {
          label: "level 1",
          items: [
            {
              step: "fragment",
              kind: "alt",
              branches: [
                {
                  label: "level 2, branch 1",
                  items: [
                    {
                      step: "fragment",
                      kind: "loop",
                      branches: [
                        {
                          label: "level 3",
                          items: [
                            {
                              step: "message",
                              from: "b",
                              to: "b",
                              kind: "async",
                              label: "self-message at depth 3",
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
                {
                  /* An unlabelled, EMPTY branch — both legal. */
                  items: [],
                },
              ],
            },
            {
              step: "message",
              from: "b",
              to: "a",
              kind: "reply",
              label: "done",
              activate: true,
              deactivate: true,
            },
          ],
        },
      ],
    },
    { step: "note", placement: "over", participants: ["a", "b"], text: "fin" },
  ],
};

{
  const text = serializeSequenceText(HAND_MODEL);
  const reparsed = parseSequenceText(text);
  check(
    "model → text → model is structurally identical (JSON.stringify equal)",
    JSON.stringify(reparsed) === JSON.stringify(HAND_MODEL),
    firstDiff(
      JSON.stringify(reparsed, null, 2),
      JSON.stringify(HAND_MODEL, null, 2),
    ),
  );
  check(
    "…and the emitted text round-trips byte-identically too",
    serializeSequenceText(reparsed) === text,
    firstDiff(serializeSequenceText(reparsed), text),
  );
  check(
    "a reserved-word participant id is quoted in the text",
    text.includes('"loop" "Reserved Word Lifeline"') &&
      text.includes('a -> "loop" : "uses a reserved id"'),
    text,
  );
  check(
    "the +- suffix pair survives on one arrow",
    text.includes('b ..>+- a : "done"'),
    text,
  );
  check(
    "the default sentinel timestamps produce no created/updated lines",
    !text.includes("created ") && !text.includes("updated "),
    text,
  );
}

/* ----------------------------------------------------------------------- */
/* 3. Unknown forward-compatible fields, verbatim and in position           */
/* ----------------------------------------------------------------------- */

console.log("unknown forward-compatible fields (in position)");

check(
  "file-level unknown survives after items",
  JSON.stringify(sink["x-pipeline"]) === '{"stage":"prod"}',
);
check(
  "metadata unknown is anchored after updatedAt; raw generator survives",
  JSON.stringify(sink.metadata).includes(
    '"updatedAt":"2026-08-09T00:00:00Z","x-review":{"cycle":30}',
  ) &&
    JSON.stringify(sink.metadata.generator) ===
      '{"name":"arch-lab","version":"0.1.0"}',
  JSON.stringify(sink.metadata),
);
check(
  "participant unknown is anchored after name",
  JSON.stringify(api).includes('"name":"Order API","x-owner":"payments"'),
  JSON.stringify(api),
);
check(
  "message unknown is anchored after label",
  JSON.stringify(post).includes('"label":"POST /orders","x-trace":true'),
  JSON.stringify(post),
);
check(
  "fragment unknown (frag.<key>) is anchored after kind",
  JSON.stringify(alt).includes('"kind":"alt","x-frag":1'),
  JSON.stringify(alt),
);
check(
  "branch unknown is anchored after label",
  JSON.stringify(happy).includes('"label":"cart valid","x-branch":true'),
  JSON.stringify(happy),
);
check(
  "all six unknown scopes re-emit as anchored ! lines",
  sinkEmitted.includes("! meta.x-review after updatedAt : ") &&
    sinkEmitted.includes("! x-pipeline : ") &&
    sinkEmitted.includes('    ! x-owner after name : "payments"') &&
    sinkEmitted.includes("    ! x-trace after label : true") &&
    sinkEmitted.includes("    ! frag.x-frag after kind : 1") &&
    sinkEmitted.includes("    ! x-branch after label : true"),
  sinkEmitted
    .split("\n")
    .filter((l) => l.includes("!"))
    .join("\n"),
);

/* ----------------------------------------------------------------------- */
/* 4. Mermaid sequenceDiagram import — every supported construct            */
/* ----------------------------------------------------------------------- */

console.log("mermaid sequenceDiagram import");

const MERMAID_SAMPLE = `sequenceDiagram
    %% a comment line
    title Checkout happy path
    autonumber
    actor C as Customer
    participant W as Web App
    participant A as Order API
    C->>W: Clicks buy
    W->>+A: POST /orders
    Note right of A: Validates the cart
    alt cart valid
        A->>DB: INSERT order
        activate DB
        DB-->>-A: ok
        loop retry x3
            par email
                A-)C: Sends receipt
            and audit
                A--)DB: Writes audit row
            end
        end
        A-->>-W: 201 Created
    else cart empty
        A--xW: 400 Bad Request
    end
    opt survey
        W->C: Asks for feedback
        C-->W: Shrugs
    end
    A-xA: Drops temp state
    Note left of C: Happy
    Note over C,W: Order flow complete
`;

const imported = parseMermaidSequence(MERMAID_SAMPLE);
check(
  "title, autonumber and the kind discriminant import",
  imported.metadata.title === "Checkout happy path" &&
    imported.autonumber === true &&
    imported.kind === "sequence",
);
check(
  "declared participants keep aliases; implicit DB is auto-declared in first-use order",
  JSON.stringify(imported.participants) ===
    JSON.stringify([
      { id: "C", kind: "actor", name: "Customer" },
      { id: "W", kind: "participant", name: "Web App" },
      { id: "A", kind: "participant", name: "Order API" },
      { id: "DB", name: "DB" },
    ]),
  JSON.stringify(imported.participants),
);
check(
  "import is deterministic (fixed default timestamp, two parses deep-equal)",
  imported.metadata.createdAt === "2026-01-01T00:00:00.000Z" &&
    JSON.stringify(parseMermaidSequence(MERMAID_SAMPLE)) ===
      JSON.stringify(imported),
);
const [m1, m2, note1, altFrag, optFrag, selfMsg, note2, note3] = imported.items;
check(
  "->> maps to sync and the + shorthand activates the target",
  m1.kind === "sync" && m2.activate === true && m2.to === "A",
);
check(
  "Note right of / left of / over X,Y all import",
  note1.placement === "right" &&
    note1.participants[0] === "A" &&
    note2.placement === "left" &&
    note3.placement === "over" &&
    JSON.stringify(note3.participants) === '["C","W"]',
);
const altBranches = altFrag.branches;
check(
  "alt/else branches carry their guard labels",
  altFrag.kind === "alt" &&
    altBranches.length === 2 &&
    altBranches[0].label === "cart valid" &&
    altBranches[1].label === "cart empty",
);
const inAlt = altBranches[0].items;
check(
  "a standalone activate folds onto the message that arrived at it",
  inAlt[0].to === "DB" && inAlt[0].activate === true,
  JSON.stringify(inAlt[0]),
);
check(
  "the - shorthand deactivates the sender of the reply",
  inAlt[1].kind === "reply" &&
    inAlt[1].deactivate === true &&
    inAlt[3].deactivate === true,
);
check(
  "loop > par nest inside alt; -) and --) import as async",
  inAlt[2].kind === "loop" &&
    inAlt[2].branches[0].items[0].kind === "par" &&
    inAlt[2].branches[0].items[0].branches[0].items[0].kind === "async" &&
    inAlt[2].branches[0].items[0].branches[1].items[0].kind === "async",
  JSON.stringify(inAlt[2]),
);
check(
  "--x imports as async (the ✗ head is the documented loss)",
  altBranches[1].items[0].kind === "async" &&
    altBranches[1].items[0].label === "400 Bad Request",
);
check(
  "opt imports; -> and --> map to sync and reply",
  optFrag.kind === "opt" &&
    optFrag.branches[0].items[0].kind === "sync" &&
    optFrag.branches[0].items[1].kind === "reply",
);
check(
  "a self-message imports (from === to)",
  selfMsg.from === "A" && selfMsg.to === "A" && selfMsg.kind === "async",
);
check(
  "the caveat names every dropped thing (arrowheads, autonumber args, unanchored activations)",
  MERMAID_SEQUENCE_CAVEAT.includes("arrowheads collapse") &&
    MERMAID_SEQUENCE_CAVEAT.includes("autonumber start/step") &&
    MERMAID_SEQUENCE_CAVEAT.includes("activate/deactivate"),
);

/* The imported model must be a first-class citizen of the .alab grammar. */
{
  const text = serializeSequenceText(imported);
  const reparsed = parseSequenceText(text);
  check(
    "the imported model survives .alab serialize → parse structurally",
    JSON.stringify(reparsed) === JSON.stringify(imported),
    firstDiff(
      JSON.stringify(reparsed, null, 2),
      JSON.stringify(imported, null, 2),
    ),
  );
}

/* ----------------------------------------------------------------------- */
/* 5. Malformed inputs — line, column and a quotable source line            */
/* ----------------------------------------------------------------------- */

console.log("malformed inputs (.alab sequence)");

function expectParseError(label, source, expectFragment, parse, ErrorType) {
  let result;
  try {
    result = parse(source);
  } catch (error) {
    if (!(error instanceof ErrorType)) {
      fail(label, `expected ${ErrorType.name}, got: ${error}`);
      return;
    }
    const named =
      Number.isInteger(error.line) &&
      error.line >= 1 &&
      Number.isInteger(error.column) &&
      error.column >= 1 &&
      /^line \d+, column \d+: /.test(error.message);
    if (!named) {
      fail(label, `error does not name a line/column: ${error.message}`);
      return;
    }
    /* The line must point INTO the source so a UI can quote the offending
       line — the check `check.ts` relies on to attach `lineText`. */
    const lineText = source.split("\n")[error.line - 1];
    if (typeof lineText !== "string") {
      fail(
        label,
        `line ${error.line} is outside the ${source.split("\n").length}-line source`,
      );
      return;
    }
    if (
      expectFragment !== undefined &&
      !error.message.includes(expectFragment)
    ) {
      fail(label, `message lacks "${expectFragment}": ${error.message}`);
      return;
    }
    ok(
      `${label} — "${error.message.slice(0, 100)}" @ "${lineText.trim().slice(0, 40)}"`,
    );
    return;
  }
  fail(
    label,
    `expected a parse error, but parsing succeeded: ${JSON.stringify(result?.metadata?.title)}`,
  );
}

const seqError = (label, source, fragment) =>
  expectParseError(
    label,
    source,
    fragment,
    parseSequenceText,
    ArchTextParseError,
  );

const SEQ_HEAD =
  'archlab 1.0 sequence\ntitle "T"\n\n@sequence\n  a:actor "A"\n  b "B"\n';

seqError("empty source is refused", "", "archlab");
seqError(
  "a newer major version is refused",
  'archlab 2.0 sequence\ntitle "T"\n\n@sequence\n',
  "newer arch-lab",
);
seqError(
  "tab indentation is refused",
  `${SEQ_HEAD}\ta -> b : "x"\n`,
  "spaces, not tabs",
);
seqError(
  "odd indentation is refused",
  `${SEQ_HEAD}   a -> b : "x"\n`,
  "inconsistent indentation of 3 spaces",
);
seqError(
  "over-indentation (no open fragment) is refused",
  `${SEQ_HEAD}    a -> b : "x"\n`,
  "expected 2 here",
);
seqError(
  "an unknown arrow is refused",
  `${SEQ_HEAD}  a => b : "x"\n`,
  "expected an arrow",
);
seqError(
  "an undeclared message target is refused",
  `${SEQ_HEAD}  a -> ghost : "x"\n`,
  '"ghost" does not resolve to a participant',
);
seqError(
  "a duplicate participant id is refused",
  `${SEQ_HEAD}  a:actor "Again"\n`,
  'duplicate participant id "a"',
);
seqError(
  "a participant after the first message is refused",
  `${SEQ_HEAD}  a -> b : "x"\n  late "Late"\n`,
  "participants come first",
);
seqError(
  "an else without an alt is refused",
  `${SEQ_HEAD}  else "nope"\n`,
  '"else" does not continue a fragment',
);
seqError(
  "an else on a loop is refused",
  `${SEQ_HEAD}  loop "l"\n    a -> b : "x"\n  else "nope"\n`,
  '"loop" fragments have a single branch',
);
seqError(
  "an and on an alt is refused",
  `${SEQ_HEAD}  alt "l"\n    a -> b : "x"\n  and "nope"\n`,
  'use "else"',
);
seqError(
  "a message without a label is refused",
  `${SEQ_HEAD}  a -> b\n`,
  '":" before the message label',
);
seqError(
  "a note over three participants is refused",
  `${SEQ_HEAD}  c "C"\n  note over a b c : "x"\n`,
  "one or two participants",
);
seqError(
  "a missing title is refused",
  "archlab 1.0 sequence\n\n@sequence\n",
  "no title",
);
seqError(
  "a missing @sequence block is refused",
  'archlab 1.0 sequence\ntitle "T"\n',
  'no "@sequence" block',
);
seqError(
  "a duplicate @sequence block is refused",
  `${SEQ_HEAD}\n@sequence\n`,
  'duplicate "@sequence"',
);
seqError(
  "a header line after @sequence is refused",
  `${SEQ_HEAD.replace('title "T"\n', "")}title "Late"\n`,
  'header lines must appear before "@sequence"',
);
seqError(
  "a ! line for a field with dedicated syntax is refused",
  'archlab 1.0 sequence\ntitle "T"\n! participants : []\n\n@sequence\n',
  "has dedicated syntax",
);
seqError(
  "a bare reserved word as an id is refused",
  `${SEQ_HEAD}  null -> b : "x"\n`,
  "reserved",
);

/* --- all-or-nothing: a failing parse never returns a partial model --- */
{
  let threw = false;
  try {
    parseSequenceText(`${SEQ_HEAD}  a -> b : "ok"\n  a -> ghost : "bad"\n`);
  } catch (error) {
    threw = error instanceof ArchTextParseError;
  }
  check("a broken parse throws and applies nothing (all-or-nothing)", threw);
}

console.log("malformed inputs (mermaid sequenceDiagram)");

const mmdError = (label, source, fragment) =>
  expectParseError(
    label,
    source,
    fragment,
    parseMermaidSequence,
    MermaidParseError,
  );

mmdError(
  "a message missing its colon is refused",
  "sequenceDiagram\n  A->>B hello\n",
  'missing ":"',
);
mmdError(
  "an unmatched end is refused",
  "sequenceDiagram\n  end\n",
  'unmatched "end"',
);
mmdError(
  "an unclosed block is refused, pointing at its opener",
  "sequenceDiagram\n  loop forever\n    A->>B: hi\n",
  "never closed",
);
mmdError(
  "an else outside alt is refused",
  "sequenceDiagram\n  par lane\n    A->>B: hi\n  else other\n  end\n",
  'without an open "alt"',
);
mmdError(
  "an unsupported block (rect) is refused by name",
  "sequenceDiagram\n  rect rgb(0,0,0)\n  A->>B: hi\n  end\n",
  '"rect" is not supported',
);
mmdError(
  "gibberish is refused with the statement list",
  "sequenceDiagram\n  what is this\n",
  "not a recognised sequenceDiagram statement",
);

/* ----------------------------------------------------------------------- */
/* 6. Document types never cross-detect                                     */
/* ----------------------------------------------------------------------- */

console.log("document-type separation (C4 vs sequence)");

const C4_SAMPLE = `archlab 1.0
title "ShopFlow Platform"

@context ctx-root "ShopFlow Platform"
  customer:person "Customer"
  shop:system "ShopFlow Platform"

  customer -> shop : "Places an order" [HTTPS]
`;

check(
  "detectAlabKind: sequence header → sequence, C4 header → c4, junk → null",
  detectAlabKind(KITCHEN_SINK) === "sequence" &&
    detectAlabKind(C4_SAMPLE) === "c4" &&
    detectAlabKind("// comment\n\narchlab 1.0\n") === "c4" &&
    detectAlabKind("archlab 1.0 sequenced\n") === null &&
    detectAlabKind("{}") === null,
);
seqError(
  "the sequence parser refuses a C4 document at its header line",
  C4_SAMPLE,
  'C4 ".alab" header',
);
expectParseError(
  "the C4 parser refuses a sequence document at its header line",
  KITCHEN_SINK,
  "unexpected text after the version",
  parseArchText,
  ArchTextParseError,
);
check(
  "the C4 sample still parses as C4 (the existing path is untouched)",
  parseArchText(C4_SAMPLE).rootDiagramId === "ctx-root",
);
expectParseError(
  "the Mermaid sequence importer refuses a C4Context document",
  'C4Context\n  Person(a, "A")\n',
  "not a sequence diagram header",
  parseMermaidSequence,
  MermaidParseError,
);
expectParseError(
  "the Mermaid C4 importer refuses a sequenceDiagram document",
  MERMAID_SAMPLE,
  "not a Mermaid C4 diagram type",
  parseMermaidC4,
  MermaidParseError,
);

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} sequence-check assertions passed.`);

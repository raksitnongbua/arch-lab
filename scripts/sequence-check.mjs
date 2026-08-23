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
 *   7. THE EDITABLE CANVAS IS A LINE PATCH, so the author's own bytes survive
 *      it. This section exists because the alternative — re-serialising the
 *      document — passes every assertion 1-6 while silently deleting every
 *      `//` comment and every author blank line in the file, and canonical
 *      text cannot catch it (a re-emit of canonical text IS canonical text).
 *      So the gestures are driven from deliberately NON-canonical text and
 *      every line the gesture is not about is compared byte for byte. The
 *      patched block itself is compared against what a FULL serialise emits,
 *      because a patch that writes almost-canonical text trades a silent loss
 *      for a worse one. And the STEP-TO-ADDRESS resolution is pinned against
 *      the layout's own walk and across a fold, because a step number is a
 *      layout ordinal over what is DRAWN — an edit fired against one while a
 *      lifeline is folded would land on a neighbouring message, silently, with
 *      the pane visibly changing either way.
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
  parseSequenceTextWithSpans,
  canonicalMessageBlock,
  canonicalParticipantBlock,
} = await import(
  pathToFileURL(path.join(ROOT, "src/features/archtext/index.ts")).href
);
const { sequenceItemAt, sequenceItemKey, sequenceMessagePaths } = await import(
  pathToFileURL(path.join(ROOT, "src/types/index.ts")).href
);
const { layoutSequence } = await import(
  pathToFileURL(path.join(ROOT, "src/features/sequence/lib/layout.ts")).href
);
const { collapseSequence, hiddenParticipants } = await import(
  pathToFileURL(path.join(ROOT, "src/features/sequence/lib/collapse.ts")).href
);
const { messagePathForStep } = await import(
  pathToFileURL(path.join(ROOT, "src/features/sequence/lib/address.ts")).href
);
const { parseViewSource, VIEW_SEED_TEXT } = await import(
  pathToFileURL(path.join(ROOT, "src/features/playground/input/parse.ts")).href
);
const {
  INSERTED_MESSAGE_LABEL,
  INSERTED_PARTICIPANT_NAME,
  activationRefusal,
  deletedMessageEdit,
  deletedParticipantEdit,
  insertedMessageEdit,
  insertedParticipantEdit,
  participantRemovalRefusal,
  repointedMessageEdit,
  revisedMessageEdit,
  revisedParticipantEdit,
} = await import(
  pathToFileURL(
    path.join(ROOT, "src/features/playground/input/sequence-edit.ts"),
  ).href
);
const {
  parseMermaidC4,
  parseMermaidSequence,
  serializeMermaidSequence,
  MermaidParseError,
  MERMAID_SEQUENCE_CAVEAT,
  MERMAID_SEQUENCE_EXPORT_CAVEAT,
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
  web ->+ api : "Place the order" [HTTPS]
    desc "POST /api/v1/orders\\nbody { cartId }\\n201 → { orderId }"
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
    post.label === "Place the order" &&
    post.technology === "HTTPS" &&
    post.activate === true,
);
check(
  "message desc survives as `description`, separate from the label",
  post.description ===
    "POST /api/v1/orders\nbody { cartId }\n201 → { orderId }" &&
    post.label !== post.description,
);
check(
  /* The dock renders a description pre-wrapped, so an author can lay a detail
     out over several lines. That only works if a `\n` survives the round trip
     as ONE escaped line of canonical text — a real newline in the emitted
     `desc` would re-parse as an over-indented junk line. */
  "a multi-line desc round-trips as a single escaped line",
  post.description.split("\n").length === 3 &&
    sinkEmitted.includes(
      '    desc "POST /api/v1/orders\\nbody { cartId }\\n201 → { orderId }"',
    ) &&
    !sinkEmitted.includes('201 → { orderId }"\n    body'),
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
/* 2b. Boxes, rect tints and the two fragment kinds that arrived with them  */
/* ----------------------------------------------------------------------- */

/*
 * A second canonical document rather than more lines in the kitchen sink:
 * these constructs are the ones whose TEXT SHAPE is new — a block that holds
 * participants (`box`), an attribute tail (`tint=`), and two fragment
 * keywords with a separator (`option`) the grammar had no equivalent of. The
 * round trip is the assertion that matters; everything below it names one
 * thing that could break while the bytes still matched by accident.
 */
console.log("boxes, tints and the critical/break/rect fragments");

const GROUPED = `archlab 1.0 sequence
title "Grouped"

@sequence
  box "Front of house" tint=#bfdfff
    cust:actor "Customer"
    web "Storefront" [Next.js]
      desc "The shop."
  api:participant "Order API"
  box "Data"
    db:participant "Orders DB"

  rect tint=#bfdfff
    cust -> web : "Clicks buy"
  critical "Reserve stock"
    api -> db : "INSERT"
  option "sold out"
    api ..> web : "409"
  break "payment declined"
    api ..> web : "402"
  rect "Cleanup"
    api ~> db : "audit"
`;

const grouped = parseSequenceText(GROUPED);
const groupedText = serializeSequenceText(grouped);
check(
  "a document with boxes, tints and every fragment kind round-trips byte-identically",
  groupedText === GROUPED,
  firstDiff(groupedText, GROUPED),
);
check(
  "boxes are a file-level list of contiguous runs, in document order",
  JSON.stringify(grouped.boxes) ===
    JSON.stringify([
      {
        label: "Front of house",
        tint: "#bfdfff",
        participants: ["cust", "web"],
      },
      { label: "Data", participants: ["db"] },
    ]),
  JSON.stringify(grouped.boxes),
);
check(
  "a boxed participant is still an ordinary member of `participants`, in text order",
  JSON.stringify(grouped.participants.map((p) => p.id)) ===
    '["cust","web","api","db"]',
);
check(
  "a `desc` continuation still binds inside a box (one indent level deeper)",
  grouped.participants[1].description === "The shop.",
);
check(
  "`tint` rides the fragment, not the branch, and only on a rect",
  grouped.items[0].kind === "rect" &&
    grouped.items[0].tint === "#bfdfff" &&
    grouped.items[0].branches[0].label === undefined &&
    grouped.items[3].kind === "rect" &&
    grouped.items[3].tint === undefined &&
    grouped.items[3].branches[0].label === "Cleanup",
  JSON.stringify(grouped.items[0]),
);
check(
  "`option` opens a second branch of a critical, `break` stays single-branch",
  grouped.items[1].kind === "critical" &&
    grouped.items[1].branches.length === 2 &&
    grouped.items[1].branches[1].label === "sold out" &&
    grouped.items[2].kind === "break" &&
    grouped.items[2].branches.length === 1,
);
check(
  "a colour is NORMALISED on the way in — one spelling per colour in the file",
  parseSequenceText(GROUPED.replace("tint=#bfdfff", "tint=rgb(191,223,255)"))
    .boxes[0].tint === "#bfdfff",
);
check(
  "a document with no boxes has NO `boxes` key (absent, not empty)",
  !("boxes" in parseSequenceText(KITCHEN_SINK)),
);

/* ----------------------------------------------------------------------- */
/* 2c. Participant icons                                                    */
/* ----------------------------------------------------------------------- */

/*
 * `@icon` on a participant, spelled and ordered exactly as a C4 node line
 * spells it. The risk this pins is not "does it parse" but "does it stay put":
 * the token sits BETWEEN the name and `[technology]`, and the model's key
 * order has to agree with that, or a round trip reorders the line and stops
 * being byte-identical.
 */
console.log("participant icons");

const ICONED = `archlab 1.0 sequence
title "Icons"

@sequence
  cust:actor "Customer" @person
  api:participant "Order API" @golang [Go 1.22]
    desc "Owns order state."
  db:participant "Orders DB" @postgresql [PostgreSQL 16]
  plain "No icon here"

  cust -> api : "Place the order"
  api -> db : "INSERT"
`;

const iconed = parseSequenceText(ICONED);
const iconedText = serializeSequenceText(iconed);
check(
  "a document with icons round-trips byte-identically",
  iconedText === ICONED,
  firstDiff(iconedText, ICONED),
);
check(
  "the icon lands between name and technology, in the model's key order",
  JSON.stringify(iconed.participants[1]) ===
    '{"id":"api","kind":"participant","name":"Order API","icon":"golang","technology":"Go 1.22","description":"Owns order state."}',
  JSON.stringify(iconed.participants[1]),
);
check(
  "a participant without one carries NO icon key (absent, not empty)",
  !("icon" in iconed.participants[3]),
);
/* Inline rather than via `seqError`, which is declared with the other
   malformed-input helpers further down and is not initialised yet here. */
check(
  "a second @icon on one participant is refused",
  (() => {
    try {
      parseSequenceText(
        'archlab 1.0 sequence\ntitle "T"\n\n@sequence\n  c "C" @one @two\n',
      );
      return false;
    } catch (error) {
      return (
        error instanceof ArchTextParseError &&
        error.message.includes("duplicate @icon")
      );
    }
  })(),
);
check(
  "the export caveat says Mermaid cannot carry an icon",
  MERMAID_SEQUENCE_EXPORT_CAVEAT.includes("icon"),
);

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
  JSON.stringify(post).includes('"label":"Place the order","x-trace":true'),
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
  "the caveat names what is still lost (arrowheads, autonumber args, unanchored activations, unstorable colours, create/destroy) AND that every block survives",
  MERMAID_SEQUENCE_CAVEAT.includes("arrowheads collapse") &&
    MERMAID_SEQUENCE_CAVEAT.includes("autonumber start/step") &&
    MERMAID_SEQUENCE_CAVEAT.includes("activate/deactivate") &&
    MERMAID_SEQUENCE_CAVEAT.includes("colour") &&
    MERMAID_SEQUENCE_CAVEAT.includes("create/destroy") &&
    MERMAID_SEQUENCE_CAVEAT.includes("Every block itself survives") &&
    /* The caveat must not go back to claiming a block is approximated — that
       sentence outlived the behaviour once already. */
    !MERMAID_SEQUENCE_CAVEAT.includes("becomes alt") &&
    !MERMAID_SEQUENCE_CAVEAT.includes("becomes opt"),
);

/*
 * EVERY BLOCK MERMAID DRAWS, imported as itself. Two earlier versions of the
 * importer got this wrong in opposite directions — refusing `rect` by name
 * (rejecting a whole diagram over a background tint) and then flattening it
 * (silently deleting a grouping the author drew) — so the assertions below
 * pin the shape of the RESULT, not just the absence of an error. The sample
 * opens with the bug report that started it.
 */
const MERMAID_BLOCKS = `sequenceDiagram
    box Aqua Front of house
        participant Alice
        participant Bob
    end
    rect rgb(191, 223, 255)
        Alice->>Bob: Hello Bob
        Bob-->>Alice: Hi Alice
    end
    Alice->>Bob: How are you?
    create participant Cache as Redis
    Alice->>Cache: warm
    critical Establish a connection
        Alice->>Bob: connect
    option network timeout
        Alice->>Bob: retry
    end
    break booking failed
        Alice->>Bob: cancel
    end
    destroy Cache
`;
const blocks = parseMermaidSequence(MERMAID_BLOCKS);
check(
  "participants import in first-use order, `create` alias included",
  JSON.stringify(blocks.participants) ===
    JSON.stringify([
      { id: "Alice", kind: "participant", name: "Alice" },
      { id: "Bob", kind: "participant", name: "Bob" },
      { id: "Cache", kind: "participant", name: "Redis" },
    ]),
  JSON.stringify(blocks.participants),
);
check(
  "a `box` imports as a SequenceBox: label, normalised colour, its members",
  JSON.stringify(blocks.boxes) ===
    JSON.stringify([
      {
        label: "Front of house",
        tint: "#00ffff",
        participants: ["Alice", "Bob"],
      },
    ]),
  JSON.stringify(blocks.boxes),
);
check(
  "a `box` never claims a lifeline declared after it closed",
  !(blocks.boxes?.[0].participants ?? []).includes("Cache"),
);
check(
  "`rect rgb(...)` imports as a rect fragment holding its own messages, tint normalised to hex",
  blocks.items[0].step === "fragment" &&
    blocks.items[0].kind === "rect" &&
    blocks.items[0].tint === "#bfdfff" &&
    blocks.items[0].label === undefined &&
    blocks.items[0].branches.length === 1 &&
    blocks.items[0].branches[0].items.length === 2 &&
    blocks.items[0].branches[0].items[0].label === "Hello Bob",
  JSON.stringify(blocks.items[0]),
);
check(
  "the message AFTER the rect stays outside it (the block bounds the right steps)",
  blocks.items[1].step === "message" &&
    blocks.items[1].label === "How are you?",
  JSON.stringify(blocks.items[1]),
);
check(
  "`critical`/`option` import as a critical with both guard labels — not as an alt",
  blocks.items[3].step === "fragment" &&
    blocks.items[3].kind === "critical" &&
    blocks.items[3].branches.length === 2 &&
    blocks.items[3].branches[0].label === "Establish a connection" &&
    blocks.items[3].branches[1].label === "network timeout",
  JSON.stringify(blocks.items[3]),
);
check(
  "`break` imports as a break, single-branch, keeping its label",
  blocks.items[4].kind === "break" &&
    blocks.items[4].branches.length === 1 &&
    blocks.items[4].branches[0].label === "booking failed",
  JSON.stringify(blocks.items[4]),
);
check(
  "`create participant X as Y` declares X; `destroy` adds no item",
  blocks.items[2].to === "Cache" &&
    blocks.items.length === 5 &&
    blocks.items.every((item) => item.step !== "note"),
  JSON.stringify(blocks.items.map((item) => item.step)),
);
check(
  "a `rect` with a WORD after it is a labelled rect, not a failed colour",
  (() => {
    const one = parseMermaidSequence(
      "sequenceDiagram\n  rect Payment leg\n    A->>B: x\n  end\n",
    ).items[0];
    return (
      one.kind === "rect" &&
      one.tint === undefined &&
      one.branches[0].label === "Payment leg"
    );
  })(),
);
check(
  "an unstorable colour is DROPPED, not fatal — the caveat's one remaining block loss",
  (() => {
    const one = parseMermaidSequence(
      "sequenceDiagram\n  rect var(--sneaky)\n    A->>B: x\n  end\n",
    ).items[0];
    return one.kind === "rect" && one.tint === undefined;
  })(),
);
check(
  "an empty `box` is dropped rather than kept as a bracket over nothing",
  parseMermaidSequence("sequenceDiagram\n  box Empty\n  end\n  A->>B: x\n")
    .boxes === undefined,
);
check(
  "`autonumber off` withdraws an earlier `autonumber` (last word wins)",
  parseMermaidSequence("sequenceDiagram\n  autonumber\n  A->>B: x\n")
    .autonumber === true &&
    parseMermaidSequence(
      "sequenceDiagram\n  autonumber\n  autonumber off\n  A->>B: x\n",
    ).autonumber === undefined,
);

/* The imported model must be a first-class citizen of the .alab grammar. */
for (const [label, model] of [
  ["the imported model", imported],
  ["the every-block model", blocks],
]) {
  const text = serializeSequenceText(model);
  const reparsed = parseSequenceText(text);
  check(
    `${label} survives .alab serialize → parse structurally`,
    JSON.stringify(reparsed) === JSON.stringify(model),
    firstDiff(
      JSON.stringify(reparsed, null, 2),
      JSON.stringify(model, null, 2),
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
  "a desc on a NOTE is refused (a note is already its own text)",
  `${SEQ_HEAD}  note right a : "x"\n    desc "y"\n`,
  "notes have no description",
);
seqError(
  "a second desc on one message is refused",
  `${SEQ_HEAD}  a -> b : "x"\n    desc "one"\n    desc "two"\n`,
  'duplicate "desc" line for this message',
);
seqError(
  "a desc at ITEM indent is refused (it is a continuation)",
  `${SEQ_HEAD}  a -> b : "x"\n  desc "y"\n`,
  "indent it 2 spaces under the participant or message",
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
  "an unclosed transparent group is refused, pointing at its opener",
  "sequenceDiagram\n  rect rgb(0,0,0)\n  A->>B: hi\n",
  'the "rect" block opened here is never closed',
);
mmdError(
  "an option outside critical is refused (naming critical, not alt)",
  "sequenceDiagram\n  alt one\n    A->>B: hi\n  option two\n  end\n",
  'without an open "critical"',
);
mmdError(
  "create must introduce a participant",
  "sequenceDiagram\n  create thing X\n",
  '"create" introduces a participant',
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

/* ---- 7. every REGISTERED EXAMPLE is a real, round-tripping document ------ */

/*
 * The demo index lists example sequence documents and counts their
 * participants, messages and fragment kinds from the parsed file. A registered
 * example that does not parse would surface there as a "Failed to parse" card —
 * honest, but only to whoever happens to load the page. These assertions make it
 * a build failure instead, and add the round trip the page cannot check: an
 * example is the thing a reader will copy, so it has to be canonical text, not
 * merely valid text.
 */
const { listSequenceExamples, loadSequenceExample, listSequenceExampleIds } =
  await import(
    pathToFileURL(
      path.join(ROOT, "src/features/sequence/service/example-service.ts"),
    ).href
  );

const exampleIds = listSequenceExampleIds();
check("at least two sequence examples are registered", exampleIds.length >= 2);

for (const listing of listSequenceExamples()) {
  check(
    `example "${listing.status === "ok" ? listing.summary.id : listing.id}" parses`,
    listing.status === "ok",
    listing.status === "ok" ? undefined : listing.message,
  );
  if (listing.status !== "ok") continue;
  const { summary } = listing;
  check(
    `example "${summary.id}" has a title, participants and messages`,
    summary.title.length > 0 &&
      summary.participantCount > 0 &&
      summary.messageCount > 0,
  );
}

for (const id of exampleIds) {
  const example = loadSequenceExample(id);
  if (example.status !== "ok") continue;
  const once = serializeSequenceText(example.file);
  check(
    `example "${id}" is CANONICAL text — what a reader copies is what we would write`,
    serializeSequenceText(parseSequenceText(once)) === once,
  );
}

check(
  "an unregistered id reports not-found rather than throwing",
  loadSequenceExample("no-such-example").status === "not-found",
);

/*
 * Between them the examples must demonstrate every fragment kind, or the demo
 * page is teaching an incomplete grammar: someone reading the examples to learn
 * the format would never meet `loop` if only the checkout flow existed.
 */
const shownKinds = new Set(
  listSequenceExamples().flatMap((listing) =>
    listing.status === "ok" ? [...listing.summary.fragmentKinds] : [],
  ),
);
for (const kind of ["alt", "par", "opt", "loop"]) {
  check(
    `the examples between them demonstrate \`${kind}\``,
    shownKinds.has(kind),
  );
}

/* ---- 7b. …and survives the trip OUT to Mermaid and back ------------------ */

/*
 * The export half (`serializeMermaidSequence`), added so the playground can
 * offer a real `.alab` ⇄ Mermaid toggle rather than a one-way door.
 *
 * The assertion is a ROUND TRIP through Mermaid with the documented losses
 * normalised away, run over every bundled example — the same "the examples
 * are the proof" discipline the canonical-text check above uses. Anything the
 * export drops has to be dropped ON PURPOSE and named in the caveat; this is
 * what stops a quiet fourth loss appearing later.
 */
console.log("\nmermaid sequenceDiagram export (.alab → Mermaid → .alab)");

check(
  "the export caveat names every loss (desc, technology, header, unstated kind, tinted rect label)",
  MERMAID_SEQUENCE_EXPORT_CAVEAT.includes("desc") &&
    MERMAID_SEQUENCE_EXPORT_CAVEAT.includes("[technology]") &&
    MERMAID_SEQUENCE_EXPORT_CAVEAT.includes("header field") &&
    MERMAID_SEQUENCE_EXPORT_CAVEAT.includes("unstated") &&
    MERMAID_SEQUENCE_EXPORT_CAVEAT.includes("rect"),
);

/**
 * Everything Mermaid CAN hold, in a comparable shape. The three fields
 * stripped here are the three the caveat promises to lose — normalising them
 * is how this test distinguishes "documented loss" from "bug", and adding a
 * fourth stripped field to make a failure go away is the thing not to do.
 */
const mermaidComparable = (file) =>
  JSON.stringify({
    title: file.metadata.title,
    autonumber: file.autonumber ?? null,
    participants: file.participants.map((p) => ({
      id: p.id,
      // Unstated → participant: Mermaid has only the two words.
      kind: p.kind ?? "participant",
      name: p.name,
    })),
    boxes: file.boxes ?? null,
    items: JSON.parse(
      JSON.stringify(file.items, (key, value) =>
        key === "description" || key === "technology" ? undefined : value,
      ),
    ),
  });

for (const id of exampleIds) {
  const example = loadSequenceExample(id);
  if (example.status !== "ok") continue;
  const mermaid = serializeMermaidSequence(example.file);
  check(
    `example "${id}" exports to Mermaid and imports back with everything Mermaid can hold`,
    mermaidComparable(parseMermaidSequence(mermaid)) ===
      mermaidComparable(example.file),
    firstDiff(
      JSON.stringify(
        JSON.parse(mermaidComparable(parseMermaidSequence(mermaid))),
        null,
        1,
      ),
      JSON.stringify(JSON.parse(mermaidComparable(example.file)), null, 1),
    ),
  );
  check(
    `example "${id}" exports deterministically`,
    serializeMermaidSequence(example.file) === mermaid,
  );
}

check(
  "the export writes a Mermaid header and indents its body",
  serializeMermaidSequence(
    loadSequenceExample("payment-capture").file,
  ).startsWith("sequenceDiagram\n    title "),
);
check(
  "a semicolon in a note survives the export verbatim (punctuation is not rewritten)",
  serializeMermaidSequence(
    parseSequenceText(
      `${SEQ_HEAD}  note right a : "holds; only the capture is late"\n`,
    ),
  ).includes("holds; only the capture is late"),
);
check(
  "an id Mermaid cannot spell is substituted, not emitted raw",
  serializeMermaidSequence(
    parseSequenceText(
      'archlab 1.0 sequence\ntitle "T"\n\n@sequence\n  "a.b" "A"\n  c "C"\n  "a.b" -> c : "x"\n',
    ),
  ).includes("a_b"),
);

/* ---- 8. a sequence document survives the SHARE codec --------------------- */

/*
 * Sequence share links reuse the C4 codec — one compression path and one
 * alphabet for both document kinds (see sequence/share/share-button.tsx). That
 * reuse is only safe while a sequence document actually survives the trip, and
 * the failure mode if it stops is the worst kind: a link that copies fine and
 * breaks for the RECIPIENT, who has no way to tell what went wrong.
 *
 * Also asserts the payload is materially smaller than the source. Compression
 * is the whole reason a flow fits in a URL at all, and a codec that silently
 * stopped compressing would push documents past the length tiers with no
 * visible cause.
 */
const { encodeShareFragment, decodeShareFragment } = await import(
  pathToFileURL(path.join(ROOT, "src/features/viewer/share/codec.ts")).href
);

for (const id of exampleIds) {
  const example = loadSequenceExample(id);
  if (example.status !== "ok") continue;
  const source = serializeSequenceText(example.file);
  const fragment = await encodeShareFragment(source, null);
  const decoded = await decodeShareFragment(`#${fragment}`);
  check(
    `example "${id}" survives encode → decode byte-for-byte`,
    decoded.status === "ok" && decoded.aftText === source,
    decoded.status === "ok" ? undefined : JSON.stringify(decoded),
  );
  check(
    `example "${id}" re-parses from the decoded text`,
    decoded.status === "ok" &&
      serializeSequenceText(parseSequenceText(decoded.aftText)) === source,
  );
  check(
    `example "${id}" compresses — the link is smaller than the document`,
    fragment.length < source.length,
    `fragment ${fragment.length} vs source ${source.length}`,
  );
}

check(
  "a fragment with no payload decodes as `none`, not as an error",
  (await decodeShareFragment("#nothing-here")).status === "none",
);

/* ----------------------------------------------------------------------- */
/* 7. The editable canvas: a line patch, not a re-emit                      */
/* ----------------------------------------------------------------------- */

console.log(
  "\nThe editable sequence canvas patches lines, it does not re-emit",
);

{
  const canonical = VIEW_SEED_TEXT.sequence;

  /* NON-CANONICAL ON PURPOSE, and every deviation is one the serializer would
     erase. A `//` comment and a blank line the parser drops with no capture;
     `updated` and `:participant` and `autonumber false` written out at values
     canonical form omits. If a gesture re-emits, this text is what it destroys
     — and only THIS text can show it, because a re-emit of canonical text is
     canonical text. */
  const authored = canonical
    .replace(
      "@sequence\n",
      "@sequence\n  // Reviewed 2026-08-01 — do not reorder these lines.\n\n",
    )
    .replace('title "', 'updated 2026-08-01T00:00:00.000Z\ntitle "');
  check(
    "the deliberately non-canonical fixture still parses",
    (() => {
      try {
        parseSequenceText(authored);
        return true;
      } catch {
        return false;
      }
    })(),
    "the fixture is broken, so everything below it would be vacuous",
  );
  check(
    "the fixture really is non-canonical — otherwise this section proves nothing",
    serializeSequenceText(parseSequenceText(authored)) !== authored,
    "canonical input cannot show a re-emit destroying anything",
  );

  const doc = parseViewSource(authored);
  check(
    "the pane reader accepts it as an editable .alab sequence document",
    doc.status === "ok" &&
      doc.value.kind === "sequence" &&
      doc.value.format === "alab",
    `status: ${doc.status}`,
  );
  const file = doc.value.file;
  const paths = sequenceMessagePaths(file.items);

  /* ---- spans -------------------------------------------------------------- */

  const { spans } = parseSequenceTextWithSpans(authored);
  const lines = authored.split("\n");

  /* A SPAN MUST POINT AT ITS OWN DECLARATION. The cheap way for this to be
     wrong is an off-by-one that patches the line above — which for a message
     inside a fragment is a `desc` or an `else`, so the file stops parsing and
     the edit is dropped with no explanation. Measured by reading the line back
     and finding the element's own text on it. */
  for (const [id, span] of spans.participants) {
    check(
      `the span for participant "${id}" points at its declaration line`,
      lines[span.start - 1].trim().startsWith(id) && span.end >= span.start,
      `line ${span.start}: ${lines[span.start - 1]}`,
    );
  }
  let blockSpanChecked = 0;
  for (const path of paths) {
    const message = sequenceItemAt(file.items, path);
    const span = spans.items.get(sequenceItemKey(path));
    check(
      `the span for message [${path}] contains its label`,
      span !== undefined && lines[span.start - 1].includes(message.label),
      `span: ${JSON.stringify(span)}`,
    );
    /* AND THE BLOCK REACHES ITS CONTINUATIONS. `endLine` exists for exactly
       this: a message owns its `desc` line, and a patch that replaces only the
       declaration line would leave an orphaned `desc` indented under a
       message that no longer claims it. */
    if (message.description !== undefined) {
      check(
        `the span for message [${path}] reaches past its desc line`,
        span.end > span.start && lines[span.end - 1].trim().startsWith("desc"),
        `span: ${JSON.stringify(span)}, last line: ${lines[span.end - 1]}`,
      );
      blockSpanChecked += 1;
    }
  }
  check(
    "the fixture has messages with a desc, so the block rule was exercised",
    blockSpanChecked >= 2,
    `only ${blockSpanChecked} message(s) with a desc — the endLine rule is untested`,
  );

  /* NO SPAN FOR A LINE THE PARSE REJECTED. The C4 parser fills its collector
     inside `resolve` for this reason and so does this one: a span recorded for
     an element the resolve threw out points a caller at a line of a file that
     does not parse. */
  check(
    "a document the resolve rejects yields no spans at all",
    (() => {
      try {
        parseSequenceTextWithSpans(
          authored.replace(
            'cust -> web : "Clicks Place order"',
            'ghost -> web : "x"',
          ),
        );
        return false;
      } catch {
        return true;
      }
    })(),
    "an unresolvable participant did not fail the parse",
  );

  /* ---- step -> address ---------------------------------------------------- */

  /* THE TWO WALKS AGREE. The layout numbers messages 1..n as it walks its own
     recursion; `sequenceMessagePaths` walks the model. Nothing makes them one
     function, so this is the pin: if either walk changes its order, an edit
     starts landing on the wrong message and nothing else notices. */
  const laid = layoutSequence(file);
  check(
    "every layout step resolves to the message the layout drew",
    laid.stepCount === paths.length &&
      laid.messages.every(
        (m) => sequenceItemAt(file.items, paths[m.step - 1]).label === m.label,
      ),
    `stepCount ${laid.stepCount} vs ${paths.length} paths`,
  );

  /* ACROSS A FOLD, which is the case a step number cannot survive on its own:
     `collapseSequence` renumbers, so step 4 of the folded view and step 4 of
     the file are different messages. Resolution is by OBJECT IDENTITY (see
     `lib/address.ts`), and this is what pins that contract. */
  let foldChecked = 0;
  for (const participant of file.participants) {
    const hidden = hiddenParticipants(file, new Set([participant.id]));
    if (hidden.size === 0) continue;
    const shown = collapseSequence(file, hidden);
    const folded = layoutSequence(shown);
    if (folded.stepCount === laid.stepCount) continue; // nothing renumbered
    check(
      `folding ${participant.id} renumbers the steps, so the fixture is real`,
      folded.stepCount < laid.stepCount,
      `${folded.stepCount} vs ${laid.stepCount}`,
    );
    check(
      `every step of the ${participant.id}-folded view resolves to the message it draws`,
      folded.messages.every((m) => {
        const resolved = messagePathForStep(file, shown, m.step);
        return (
          resolved !== null &&
          sequenceItemAt(file.items, resolved).label === m.label
        );
      }),
      "a folded step resolved to a different message — an edit would land on it",
    );
    /* AND THE NUMBERS REALLY DID MOVE, so the assertion above is not passing
       because the fold happened to change nothing: at least one step must
       resolve to a DIFFERENT address than the unfolded view gives it. */
    /* `?? "none"` rather than indexing the result: an unresolvable step is a
       real outcome (see `lib/address.ts`) and this assertion must REPORT it,
       not crash the script — a thrown check is a check that cannot tell you
       which of its clauses broke. */
    const addressOf = (step) => {
      const resolved = messagePathForStep(file, shown, step);
      return resolved === null ? "none" : sequenceItemKey(resolved);
    };
    check(
      `folding ${participant.id} moves at least one step's address`,
      folded.messages.some(
        (m) => addressOf(m.step) !== sequenceItemKey(paths[m.step - 1]),
      ),
      "no step moved — this fold cannot show the renumbering bug",
    );
    foldChecked += 1;
    break;
  }
  check(
    "a fold that renumbers was found, so the address rule was exercised",
    foldChecked === 1,
    "no participant in the seed folds anything — the fold rule is untested",
  );

  /* THE IDENTITY CONTRACT ITSELF, stated at `filterItems`. Cloning a surviving
     message there would break every fold resolution above with nothing on
     screen to show it, so it is asserted directly rather than only through its
     consequence. */
  {
    const target = file.participants.find(
      (p) => hiddenParticipants(file, new Set([p.id])).size > 0,
    );
    const shown = collapseSequence(
      file,
      hiddenParticipants(file, new Set([target.id])),
    );
    const survivors = sequenceMessagePaths(shown.items).map((p) =>
      sequenceItemAt(shown.items, p),
    );
    const originals = new Set(paths.map((p) => sequenceItemAt(file.items, p)));
    check(
      "a collapsed view holds the SAME message objects, not copies",
      survivors.length > 0 && survivors.every((m) => originals.has(m)),
      "filterItems cloned a message — every fold-time edit would refuse",
    );
  }

  /* ---- revise: the patch keeps every other byte ---------------------------- */

  /** Lines of `a` that differ from `b`, as 1-based numbers. */
  const changedLines = (a, b) => {
    const la = a.split("\n");
    const lb = b.split("\n");
    const out = [];
    for (let i = 0; i < Math.max(la.length, lb.length); i += 1) {
      if (la[i] !== lb[i]) out.push(i + 1);
    }
    return out;
  };

  /** Notes anywhere in the tree — the count a delete must not change. */
  const countNotes = (items) =>
    items.reduce(
      (total, item) =>
        item.step === "note"
          ? total + 1
          : item.step === "fragment"
            ? total + item.branches.reduce((n, b) => n + countNotes(b.items), 0)
            : total,
      0,
    );

  /** How many messages and notes name `id` — the numbers a refusal quotes. */
  const countReferences = (items, id) =>
    items.reduce(
      (total, item) => {
        if (item.step === "message") {
          return item.from === id || item.to === id
            ? { messages: total.messages + 1, notes: total.notes }
            : total;
        }
        if (item.step === "note") {
          return item.participants.includes(id)
            ? { messages: total.messages, notes: total.notes + 1 }
            : total;
        }
        return item.branches.reduce((running, b) => {
          const inner = countReferences(b.items, id);
          return {
            messages: running.messages + inner.messages,
            notes: running.notes + inner.notes,
          };
        }, total);
      },
      { messages: 0, notes: 0 },
    );

  const spansOf = (text) => parseSequenceTextWithSpans(text).spans;

  const withDesc = paths.find(
    (p) => sequenceItemAt(file.items, p).description !== undefined,
  );

  /* TWO SUBJECTS THE STALE-PANE LOOP AT THE END OF THIS SECTION NEEDS, hoisted
     here because getting them wrong is the specific way that loop passes for
     the wrong reason. It asserts "refused because the pane disagrees with the
     canvas" — but a message carrying `+` is refused by the ACTIVATION guard and
     a referenced lifeline by the REFERENCE guard, whichever pane it is handed.
     Both would have gone green while the staleness check they exist to prove
     was missing entirely. So the loop is given a message with no activation
     flag, and a document with a lifeline nothing points at. */
  const deletableMsg = paths.find((p) => {
    const m = sequenceItemAt(file.items, p);
    return m.activate === undefined && m.deactivate === undefined;
  });
  /* NULL-TOLERANT ON PURPOSE. These feed a dozen assertions below, and when
     the gesture under test breaks they go null — at which point a bare
     `withSpare.text` throws and takes the whole script down with a stack
     trace, hiding every assertion after it. A crash is technically a failure,
     but it is a failure that reports the wrong thing: this is how a broken
     insert once looked like a broken check. So the shape is preserved and one
     assertion says which half is missing. */
  const withSpare = insertedParticipantEdit(doc.value, authored);
  const spareDoc =
    withSpare === null
      ? { status: "skipped" }
      : parseViewSource(withSpare.text);
  const spareId =
    spareDoc.status === "ok"
      ? spareDoc.value.file.participants.at(-1).id
      : null;
  check(
    "the stale-pane loop has a message and a lifeline that nothing else refuses",
    deletableMsg !== undefined &&
      spareId !== null &&
      activationRefusal(doc.value, deletableMsg) === null &&
      participantRemovalRefusal(spareDoc.value, spareId) === null,
    `deletableMsg ${JSON.stringify(deletableMsg)}, spare ${JSON.stringify(spareId)} — the staleness assertions below would otherwise pass on another guard's refusal`,
  );
  /* Stand-ins so a missing fixture costs one ✗ above rather than a stack trace
     here. They are deliberately the UNMODIFIED document, which makes every
     assertion that depends on the spare lifeline fail rather than skip. */
  const spareText = withSpare === null ? authored : withSpare.text;
  const spareValue = spareDoc.status === "ok" ? spareDoc.value : doc.value;

  /* A SECOND NON-CANONICAL FIXTURE, and the reason it exists is worth stating
     because it is the same trap as the one above. The repoint and delete
     assertions need a message that owns CONTINUATION LINES — that is the only
     way to show the block is the patch unit and that a `desc` comes back
     byte-identical — and that does NOT carry an activation flag, or the guard
     refuses it and every assertion below reads "refused" as "correct".
     Measured: no message in the seed is both. So this one is built.

     Non-canonical in the same three ways the seed fixture is (a `//` comment, a
     blank line the parser drops, `updated` and `:participant` written out at
     values canonical form omits), because that is what makes a re-emit visible.
     It also carries a NOTE directly after the message under test, which is what
     the "a note is carried, not eaten" assertion needs. */
  const BLOCKY = [
    "archlab 1.0 sequence",
    "updated 2026-08-01T00:00:00.000Z",
    'title "Blocky"',
    "",
    "@sequence",
    "  // Reviewed 2026-08-01 — do not reorder these lines.",
    "",
    '  cust:actor "Customer"',
    '  web:participant "Storefront"',
    '  api "Order API"',
    "",
    '  cust -> web : "Clicks buy" [HTTPS]',
    '    desc "POST /cart\\nreturns 200"',
    "    ! x-trace after label : true",
    '  note right web : "explains the click"',
    '  web -> api : "Place the order"',
    "",
  ].join("\n");
  const blockyDoc = parseViewSource(BLOCKY);
  const blockySpans = spansOf(BLOCKY);
  const blockyTarget = [0];
  check(
    "the block fixture parses, is non-canonical, and its first message owns a 3-line block",
    blockyDoc.status === "ok" &&
      serializeSequenceText(parseSequenceText(BLOCKY)) !== BLOCKY &&
      blockySpans.items.get(sequenceItemKey(blockyTarget)).end -
        blockySpans.items.get(sequenceItemKey(blockyTarget)).start ===
        2 &&
      activationRefusal(blockyDoc.value, blockyTarget) === null,
    `status ${blockyDoc.status}`,
  );
  const before = sequenceItemAt(file.items, withDesc);
  const revision = {
    label: "Place the order, revised",
    kind: before.kind,
    technology: before.technology,
    description: before.description,
  };
  const revised = revisedMessageEdit(doc.value, authored, withDesc, revision);
  check(
    "a revision reports the patch path, never a re-emit",
    revised !== null && revised.path === "patch",
    `edit: ${JSON.stringify(revised && revised.path)}`,
  );
  check(
    "the author's comment survives a revision",
    revised.text.includes(
      "// Reviewed 2026-08-01 — do not reorder these lines.",
    ),
    "the comment was deleted — this is the whole bug this section exists for",
  );
  check(
    "the author's blank line survives a revision",
    /do not reorder these lines\.\n\n/.test(revised.text),
    "blank lines were reflowed",
  );
  check(
    "a field written out that canonical form omits at its default survives",
    revised.text.includes("updated 2026-08-01T00:00:00.000Z") &&
      revised.text.includes("autonumber") &&
      revised.text.includes(":participant"),
    "an omitted-at-default field was normalised away",
  );
  /* ONLY THE ELEMENT'S OWN BLOCK CHANGED. Measured as a line set rather than
     by eye: a patch that quietly reflowed a neighbour would still contain the
     comment and still parse. */
  {
    const span = spans.items.get(sequenceItemKey(withDesc));
    const touched = changedLines(authored, revised.text);
    check(
      "a revision changes only the lines of its own block",
      touched.length > 0 &&
        touched.every((line) => line >= span.start && line <= span.end),
      `changed lines ${touched.join(",")} vs span ${JSON.stringify(span)}`,
    );
  }
  /* THE PATCHED LINES ARE CANONICAL, and derived from the serializer rather
     than compared against a hand-written expected string — a hand-written
     expectation is a second serializer, free to disagree with the real one. */
  {
    const span = spans.items.get(sequenceItemKey(withDesc));
    const patched = revised.text
      .split("\n")
      .slice(span.start - 1, span.start - 1 + (span.end - span.start + 1));
    /* The pad is read off the block being replaced — the same rule the patch
       itself uses, and the only source that cannot be wrong about the fragment
       depth indentation encodes. A hardcoded pad here would be a second answer
       to the question the patch already answers. */
    const emitted = canonicalMessageBlock(
      revised.doc.file,
      withDesc,
      /^ */.exec(lines[span.start - 1])[0],
    );
    check(
      "the patched block is byte-identical to what a full serialise would write",
      emitted !== null && patched.join("\n") === emitted.join("\n"),
      `patched:\n${patched.join("\n")}\nemitted:\n${(emitted ?? []).join("\n")}`,
    );
  }
  check(
    "the revision survives the round trip — the label read back is the label written",
    sequenceItemAt(revised.doc.file.items, withDesc).label === revision.label,
    "the patched text does not mean what the edit intended",
  );
  check(
    "a revision that changes nothing is refused, so it costs no undo entry",
    revisedMessageEdit(doc.value, authored, withDesc, {
      label: before.label,
      kind: before.kind,
      technology: before.technology,
      description: before.description,
    }) === null,
    "an unchanged form rewrote the pane",
  );
  /* CLEARING A FIELD REMOVES IT rather than writing an empty one. `desc ""`
     and `[""]` are spellable, and both render as a blank the reader cannot
     tell from an absence. */
  {
    const cleared = revisedMessageEdit(doc.value, authored, withDesc, {
      label: before.label,
      kind: before.kind,
    });
    const readBack = sequenceItemAt(cleared.doc.file.items, withDesc);
    check(
      "clearing technology and details removes the fields, never blanks them",
      readBack.technology === undefined && readBack.description === undefined,
      `read back: ${JSON.stringify(readBack)}`,
    );
  }

  /* A PARTICIPANT'S BLOCK, same rules. Its own case because a participant can
     sit inside a `box` at four spaces rather than two, and a patch that
     re-derived the pad from the model would dedent it out of the box. */
  {
    const participant = file.participants[1];
    const edit = revisedParticipantEdit(doc.value, authored, participant.id, {
      name: "Store Front",
      kind: "actor",
      technology: participant.technology,
      description: "The public site.",
    });
    const span = spans.participants.get(participant.id);
    check(
      "a participant revision is a patch that keeps the comment",
      edit !== null &&
        edit.path === "patch" &&
        edit.text.includes("// Reviewed 2026-08-01"),
      `edit: ${JSON.stringify(edit && edit.path)}`,
    );
    check(
      "a participant revision changes only its own block, and grows it by the desc",
      changedLines(authored, edit.text).every((line) => line >= span.start),
      "a line above the participant moved",
    );
    check(
      "the participant revision reads back as written",
      (() => {
        const read = edit.doc.file.participants.find(
          (p) => p.id === participant.id,
        );
        return (
          read.name === "Store Front" &&
          read.kind === "actor" &&
          read.description === "The public site."
        );
      })(),
      "the patched text does not mean what the edit intended",
    );
    check(
      "the patched participant block matches what a full serialise would write",
      (() => {
        const emitted = canonicalParticipantBlock(
          edit.doc.file,
          participant.id,
          "  ",
        );
        const patched = edit.text
          .split("\n")
          .slice(span.start - 1, span.start - 1 + emitted.length);
        return patched.join("\n") === emitted.join("\n");
      })(),
      "the patch wrote almost-canonical text",
    );
  }

  /* ---- insert: exactly one line -------------------------------------------- */

  const anchor = paths[1];
  const inserted = insertedMessageEdit(
    doc.value,
    authored,
    anchor,
    file.participants[0].id,
    file.participants[1].id,
  );
  check(
    "an insert adds exactly one line",
    inserted !== null &&
      inserted.text.split("\n").length === authored.split("\n").length + 1,
    `delta ${inserted === null ? "null" : inserted.text.split("\n").length - authored.split("\n").length}`,
  );
  check(
    "an insert reports the patch path and keeps the comment",
    inserted.path === "patch" &&
      inserted.text.includes("// Reviewed 2026-08-01"),
    "the insert re-emitted",
  );
  /* IT LANDS AFTER THE ANCHOR'S WHOLE BLOCK, not after its declaration line.
     The anchor here carries a `desc`; inserting between the two would put a
     continuation line under a message that does not own it, and the document
     would stop parsing. */
  {
    const span = spans.items.get(sequenceItemKey(anchor));
    check(
      "the new line lands after the anchor's last continuation line",
      inserted.text.split("\n")[span.end].includes(INSERTED_MESSAGE_LABEL),
      `line ${span.end + 1}: ${inserted.text.split("\n")[span.end]}`,
    );
  }
  /* AND AS A SIBLING AT THE ANCHOR'S OWN DEPTH. Indentation IS fragment
     membership in this grammar, so a wrong pad silently moves the message into
     or out of the fragment the reader was looking at. */
  {
    const span = spans.items.get(sequenceItemKey(anchor));
    const anchorIndent = /^ */.exec(authored.split("\n")[span.start - 1])[0];
    const newLine = inserted.text.split("\n")[span.end];
    check(
      "the new message sits at the anchor's own indentation",
      /^ */.exec(newLine)[0] === anchorIndent,
      `anchor "${anchorIndent}" vs new "${/^ */.exec(newLine)[0]}"`,
    );
    const siblingPath = [...anchor.slice(0, -1), anchor[anchor.length - 1] + 1];
    check(
      "the new message is the anchor's next sibling in the model",
      sequenceItemAt(inserted.doc.file.items, siblingPath).label ===
        INSERTED_MESSAGE_LABEL,
      `at ${siblingPath}: ${JSON.stringify(sequenceItemAt(inserted.doc.file.items, siblingPath))}`,
    );
  }
  /* NESTED, which is the case a root-only insert would pass while breaking:
     an anchor inside a fragment must keep the new message inside it. */
  {
    const nested = paths.find((p) => p.length > 1);
    const edit = insertedMessageEdit(
      doc.value,
      authored,
      nested,
      file.participants[0].id,
      file.participants[0].id,
    );
    const siblingPath = [...nested.slice(0, -1), nested[nested.length - 1] + 1];
    check(
      "an insert anchored inside a fragment stays inside that fragment",
      edit !== null &&
        edit.text.split("\n").length === authored.split("\n").length + 1 &&
        sequenceItemAt(edit.doc.file.items, siblingPath).label ===
          INSERTED_MESSAGE_LABEL,
      `nested anchor ${nested} produced ${JSON.stringify(edit && sequenceItemAt(edit.doc.file.items, siblingPath))}`,
    );
    /* A SELF-MESSAGE IS LEGAL and this is the case that proves the two clicks
       may name the same lifeline — refusing it would forbid a construct the
       grammar and the layout both draw. */
    check(
      "the two clicks may name the same lifeline (a self-message)",
      sequenceItemAt(edit.doc.file.items, siblingPath).from ===
        sequenceItemAt(edit.doc.file.items, siblingPath).to,
      "a self-message insert was mangled",
    );
  }
  /* APPEND, and it must land after the last thing the PARSER saw rather than
     at the end of the file: a document ending in a comment would otherwise
     have the new message pushed past prose written about the flow. */
  {
    const trailing = `${authored}// A closing note about the whole flow.\n`;
    const trailingDoc = parseViewSource(trailing);
    const edit = insertedMessageEdit(
      trailingDoc.value,
      trailing,
      null,
      file.participants[0].id,
      file.participants[1].id,
    );
    const out = edit.text.split("\n");
    check(
      "an append adds one line and leaves the trailing comment last",
      edit !== null &&
        out.length === trailing.split("\n").length + 1 &&
        out[out.length - 2].startsWith("// A closing note"),
      `tail: ${JSON.stringify(out.slice(-3))}`,
    );
    check(
      "an appended message is the last root item of the model",
      (() => {
        const items = edit.doc.file.items;
        return items[items.length - 1].label === INSERTED_MESSAGE_LABEL;
      })(),
      "the append did not land at the end of the flow",
    );
    check(
      "an appended root message sits at the grammar's body indentation",
      /^ {2}\S/.test(out.find((l) => l.includes(INSERTED_MESSAGE_LABEL))),
      `appended line: ${JSON.stringify(out.find((l) => l.includes(INSERTED_MESSAGE_LABEL)))}`,
    );
  }

  /* ROOT_ITEM_INDENT MEASURED, not trusted, and it needs a document with NO
     items to reach: with a sibling to copy, an append takes the sibling's
     indentation and the constant is never consulted. That is exactly the shape
     an untested fallback hides in — the first person to append to an empty
     flow would get a line the parser refuses. */
  {
    const empty = [
      "archlab 1.0 sequence",
      'title "Empty"',
      "",
      "@sequence",
      '  cust:actor "Customer"',
      '  web "Storefront"',
      "",
    ].join("\n");
    const emptyDoc = parseViewSource(empty);
    check(
      "the items-less fixture parses, so the append fallback is reachable",
      emptyDoc.status === "ok" && emptyDoc.value.file.items.length === 0,
      `status: ${emptyDoc.status}`,
    );
    const edit = insertedMessageEdit(
      emptyDoc.value,
      empty,
      null,
      "cust",
      "web",
    );
    const line = edit?.text
      .split("\n")
      .find((l) => l.includes(INSERTED_MESSAGE_LABEL));
    check(
      "the first message appended to an empty flow lands at the body indent",
      line !== undefined && /^ {2}\S/.test(line),
      `appended line: ${JSON.stringify(line)}`,
    );
    check(
      "…and the document it produces re-parses with that message in it",
      edit !== null &&
        edit.doc.file.items.length === 1 &&
        edit.doc.file.items[0].label === INSERTED_MESSAGE_LABEL,
      "the append did not survive the re-parse",
    );
  }
  /* AN UNDECLARED ENDPOINT IS REFUSED. The parser rejects a message naming a
     participant that does not exist, so accepting one would hand the reader a
     parse error over a diagram they could no longer edit. */
  check(
    "an insert naming an undeclared participant is refused",
    insertedMessageEdit(
      doc.value,
      authored,
      null,
      "ghost",
      file.participants[0].id,
    ) === null,
    "an undeclared endpoint was accepted",
  );

  /* ---- repoint: the endpoints move and nothing else does ------------------- */

  /* A REPOINT IS THE ONE GESTURE WHOSE WHOLE JOB IS ON THE DECLARATION LINE
     while its patch unit is the BLOCK, so it is the one that can quietly
     rewrite a `desc` or reorder a `!` escape and still look right on the
     canvas. Every assertion here is about the bytes it did NOT touch. */
  {
    const target = blockyTarget; // owns a desc and a `!` escape below it
    const source = BLOCKY;
    const at = blockyDoc.value;
    const message = sequenceItemAt(at.file.items, target);
    const elsewhere = at.file.participants.find(
      (p) => p.id !== message.from && p.id !== message.to,
    );
    check(
      "the repoint fixture has a third lifeline to move the arrow to",
      elsewhere !== undefined,
      "the fixture has too few participants for this to prove anything",
    );

    const moved = repointedMessageEdit(
      at,
      source,
      target,
      message.from,
      elsewhere.id,
    );
    check(
      "a repoint reports the patch path, never a re-emit",
      moved !== null && moved.path === "patch",
      `got ${JSON.stringify(moved && moved.path)}`,
    );
    check(
      "the author's comment and blank line survive a repoint",
      moved !== null &&
        moved.text.includes("// Reviewed 2026-08-01") &&
        moved.text.split("\n")[6] === "",
      "the comment or the author's blank line was eaten",
    );
    check(
      "a field written out that canonical form omits survives a repoint",
      moved !== null &&
        moved.text.includes("updated 2026-08-01T00:00:00.000Z") &&
        moved.text.includes(":participant"),
      "a re-emit normalised the author's explicit defaults away",
    );

    /* THE DECLARATION LINE AND NOTHING ELSE. The block is the patch unit, so
       the `desc` and `!` lines inside it are REWRITTEN — byte-identically,
       which is the whole claim. If they ever stop being byte-identical this is
       the assertion that says so, because the canvas would look right either
       way. */
    const movedSpan = blockySpans.items.get(sequenceItemKey(target));
    check(
      "a repoint changes exactly one line — the declaration, not the block's desc",
      moved !== null &&
        changedLines(source, moved.text).length === 1 &&
        changedLines(source, moved.text)[0] === movedSpan.start,
      `changed ${JSON.stringify(moved && changedLines(source, moved.text))}, span starts at ${movedSpan.start}`,
    );

    /* DERIVED FROM THE SERIALIZER, never a hand-written expected string: a
       patch that writes almost-canonical text trades a silent loss for a worse
       one, and only the serializer knows what canonical is. */
    const movedDoc = parseViewSource(moved.text);
    check(
      "the repointed document re-parses as an .alab sequence document",
      movedDoc.status === "ok" && movedDoc.value.format === "alab",
      `status: ${movedDoc.status}`,
    );
    const movedPad = /^ */.exec(source.split("\n")[movedSpan.start - 1])[0];
    check(
      "the repointed block is byte-identical to what a full serialise would write",
      canonicalMessageBlock(movedDoc.value.file, target, movedPad).join(
        "\n",
      ) ===
        moved.text
          .split("\n")
          .slice(movedSpan.start - 1, movedSpan.end)
          .join("\n"),
      "the patched block is not what the serializer would emit",
    );
    const after = sequenceItemAt(movedDoc.value.file.items, target);
    check(
      "the repoint reads back as written, and moves only the endpoint asked for",
      after.to === elsewhere.id &&
        after.from === message.from &&
        after.label === message.label &&
        after.description === message.description &&
        after.technology === message.technology,
      `read back ${JSON.stringify(after)}`,
    );
    check(
      "a repoint to the endpoints the message already has is refused",
      repointedMessageEdit(at, source, target, message.from, message.to) ===
        null,
      "an unchanged repoint cost an undo entry",
    );
    check(
      "a repoint naming an undeclared lifeline is refused",
      repointedMessageEdit(at, source, target, "ghost", message.to) === null,
      "an undeclared endpoint was accepted",
    );
  }

  /* ---- the activation guard ------------------------------------------------- */

  /* `+`/`-` IS UNPAIRED AND UNVALIDATED, so deleting or repointing the message
     that carries one changes a bar SEVERAL ROWS AWAY and the layout does not
     complain — measured: an unmatched close is dropped, an unmatched open runs
     to the bottom of the lifeline. Both gestures refuse, and the refusal is a
     SENTENCE, because a control that declines in silence reads as broken. */
  {
    const activating = paths.find((p) => {
      const m = sequenceItemAt(file.items, p);
      return m.activate === true || m.deactivate === true;
    });
    check(
      "the seed really does carry an activation flag, so this guard is exercised",
      activating !== undefined,
      "no activating message in the fixture — the guard below proves nothing",
    );
    const reason = activationRefusal(doc.value, activating);
    check(
      "an activating message reports a refusal a reader can act on",
      typeof reason === "string" && reason.length > 40,
      `reason: ${JSON.stringify(reason)}`,
    );
    check(
      "the refusal names the source text as the place to fix it",
      typeof reason === "string" && reason.includes("source text"),
      "a refusal that does not say what to do next is a dead end",
    );
    check(
      "deleting an activating message is refused",
      deletedMessageEdit(doc.value, authored, activating) === null,
      "an unbalanced activation bar was allowed",
    );
    check(
      "repointing an activating message is refused",
      repointedMessageEdit(
        doc.value,
        authored,
        activating,
        file.participants[0].id,
        file.participants[1].id,
      ) === null,
      "an activation bar was moved to another lifeline",
    );

    const plain = paths.find(
      (p) =>
        sequenceItemAt(file.items, p).activate === undefined &&
        sequenceItemAt(file.items, p).deactivate === undefined,
    );
    check(
      "a message with no activation flag reports no refusal",
      activationRefusal(doc.value, plain) === null,
      "the guard refuses messages it has no business refusing",
    );
  }

  /* ---- delete a message: its own block, and only its own block -------------- */

  {
    /* CHOSEN FOR ITS CONTINUATION LINES. A delete that removed only the
       declaration line would leave a `desc` at indent + 2 with nothing above it
       to attach to — which is why the span reaches to `endLine` at all. The
       purpose-built fixture is used because no seed message owns a `desc`
       without also carrying an activation flag; see where BLOCKY is defined. */
    const target = blockyTarget;
    const source = BLOCKY;
    const at = blockyDoc.value;
    const span = blockySpans.items.get(sequenceItemKey(target));
    check(
      "the message under test owns continuation lines",
      span.end - span.start === 2,
      `span ${span.start}..${span.end} is not three lines`,
    );

    const gone = deletedMessageEdit(at, source, target);
    check(
      "a delete reports the patch path, never a re-emit",
      gone !== null && gone.path === "patch",
      `got ${JSON.stringify(gone && gone.path)}`,
    );
    check(
      "a delete removes exactly its own block — declaration and continuations",
      gone !== null &&
        gone.text.split("\n").length ===
          source.split("\n").length - (span.end - span.start + 1),
      `line count went ${source.split("\n").length} -> ${gone && gone.text.split("\n").length}, block is ${span.end - span.start + 1} lines`,
    );
    /* EVERY OTHER LINE IS STILL THERE, IN ORDER. Compared as the two halves
       either side of the removed span rather than by counting: a delete that
       removed the right NUMBER of lines from the wrong place would pass a count
       and fail this. */
    const src = source.split("\n");
    check(
      "every byte outside the deleted block survives, in order",
      gone !== null &&
        gone.text ===
          [...src.slice(0, span.start - 1), ...src.slice(span.end)].join("\n"),
      "a delete disturbed a line it was not about",
    );
    check(
      "the author's comment, blank line and explicit defaults survive a delete",
      gone !== null &&
        gone.text.includes("// Reviewed 2026-08-01") &&
        gone.text.includes("updated 2026-08-01T00:00:00.000Z") &&
        gone.text.includes(":participant"),
      "the comment or an explicit default was eaten",
    );
    const goneDoc = parseViewSource(gone.text);
    check(
      "the document left behind parses, with one message fewer",
      goneDoc.status === "ok" &&
        sequenceMessagePaths(goneDoc.value.file.items).length ===
          sequenceMessagePaths(at.file.items).length - 1,
      `status ${goneDoc.status}`,
    );
    /* THE NOTE SAT DIRECTLY AFTER THE DELETED MESSAGE, which is the only
       position where "carried or eaten" is a real question — a note attaches by
       text position, not by any id, so the one following the message is exactly
       the one a cascade would take. */
    check(
      "a note the delete did not name is CARRIED, not eaten with the message",
      goneDoc.status === "ok" &&
        countNotes(goneDoc.value.file.items) === 1 &&
        countNotes(at.file.items) === 1,
      "deleting a message took the neighbouring note with it",
    );

    /* AN EMPTIED FRAGMENT BRANCH IS LEGAL, so the delete needs no guard for it.
       Measured here rather than assumed, because the whole verdict rests on it:
       if the grammar ever stops accepting an empty branch, this delete starts
       producing documents the parser refuses. */
    const lonely = [
      "archlab 1.0 sequence",
      'title "Lonely"',
      "",
      "@sequence",
      '  a "A"',
      '  b "B"',
      "",
      '  alt "only"',
      '    a -> b : "the only step in here"',
      "",
    ].join("\n");
    const lonelyDoc = parseViewSource(lonely);
    const emptied = deletedMessageEdit(lonelyDoc.value, lonely, [0, 0, 0]);
    check(
      "deleting the only message in a fragment branch leaves a document that parses",
      emptied !== null && parseViewSource(emptied.text).status === "ok",
      `got ${JSON.stringify(emptied && emptied.text)}`,
    );
    check(
      "...and the branch is still there, empty, rather than the fragment vanishing",
      emptied !== null &&
        parseViewSource(emptied.text).value.file.items[0].branches[0].items
          .length === 0,
      "the fragment did not survive its last message",
    );
  }

  /* ---- remove a lifeline: refused while anything still points at it -------- */

  {
    /* THE REFUSAL IS THE FEATURE HERE. Removing a referenced participant makes
       a document the parser refuses outright ("does not resolve to a
       participant"), so a gesture that let it through would hand the reader a
       parse error over a diagram they could no longer edit. The C4 canvas
       cascades instead; `deletedParticipantEdit` argues why this one must not. */
    const referenced = file.participants[0].id;
    const reason = participantRemovalRefusal(doc.value, referenced);
    check(
      "removing a referenced lifeline is refused with a reason",
      typeof reason === "string" && reason.length > 40,
      `reason: ${JSON.stringify(reason)}`,
    );
    /* THE COUNT IS IN THE SENTENCE, and it is the REAL count — a refusal
       saying "some messages" leaves the reader with no way to know when they
       are done. Derived by walking the model, so the wording cannot drift from
       the document. */
    const uses = countReferences(file.items, referenced);
    check(
      "the refusal quotes the true number of messages still pointing at it",
      typeof reason === "string" &&
        uses.messages > 0 &&
        reason.includes(String(uses.messages)),
      `${uses.messages} messages, reason: ${JSON.stringify(reason)}`,
    );
    check(
      "the refusal counts notes as referrers too, not just messages",
      uses.notes === 0 || reason.includes(String(uses.notes)),
      `${uses.notes} notes, reason: ${JSON.stringify(reason)}`,
    );
    check(
      "and the gesture itself declines, so text is never produced for it",
      deletedParticipantEdit(doc.value, authored, referenced) === null,
      "a referenced lifeline was removed anyway",
    );

    /* A LIFELINE NOTHING REFERS TO CAN GO, or the refusal above would just be
       a gesture that never works. The spare one hoisted at the top of this
       section is exactly that: added by the insert gesture, named by nothing. */
    const addedDoc = spareDoc;
    const freshId = spareId;
    check(
      "a lifeline nothing refers to reports no refusal",
      freshId !== null &&
        participantRemovalRefusal(addedDoc.value, freshId) === null,
      `reason: ${JSON.stringify(freshId === null ? "no spare lifeline" : participantRemovalRefusal(addedDoc.value, freshId))}`,
    );
    const removed = deletedParticipantEdit(spareValue, spareText, freshId);
    check(
      "removing it reports the patch path",
      removed !== null && removed.path === "patch",
      `got ${JSON.stringify(removed && removed.path)}`,
    );
    /* THE ROUND TRIP IS THE STRONGEST FORM THIS CAN TAKE: add a lifeline, take
       it away, and the file is the reader's original BYTES — comment, blank
       line, explicit defaults and all. Nothing weaker distinguishes "put the
       text back" from "re-emitted something equivalent". */
    check(
      "add a lifeline then remove it and the text is byte-identical to the original",
      removed !== null && removed.text === authored,
      removed === null
        ? "the removal was refused"
        : firstDiff(removed.text, authored),
    );

    /* THE GUARD IS DERIVED FROM THE PARSER, not from a second opinion about
       what the parser accepts — habit 4 in `codebase.md`, and the reason this
       assertion is worth more than the individual refusals above. For EVERY
       lifeline in the fixture: the refusal says no exactly when removing that
       lifeline's block would produce text the real parser rejects. Too strict
       and a removable lifeline is stuck; too lax and the reader gets a parse
       error over a diagram they can no longer edit. Both directions fail here.

       The text is spliced directly rather than through the gesture, because the
       gesture consults the guard — asking it would be asking the guard about
       itself. */
    for (const participant of file.participants) {
      const span = spans.participants.get(participant.id);
      const src = authored.split("\n");
      const without = [
        ...src.slice(0, span.start - 1),
        ...src.slice(span.end),
      ].join("\n");
      let parses = true;
      try {
        parseSequenceText(without);
      } catch {
        parses = false;
      }
      check(
        `the removal guard for ${participant.id} agrees with the parser`,
        (participantRemovalRefusal(doc.value, participant.id) === null) ===
          parses,
        `guard says ${JSON.stringify(participantRemovalRefusal(doc.value, participant.id))}, parser ${parses ? "accepts" : "rejects"} the text`,
      );
    }

    /* A LIFELINE ONLY A NOTE MENTIONS. The loop above cannot reach this case —
       every lifeline in the fixture is also named by a message, so dropping the
       note count entirely would not change one of its verdicts. It is the
       cheapest way for the guard to be wrong: a note's participants are checked
       by the parser exactly like a message's, so missing them means producing a
       document that does not parse. */
    const noteOnly = [
      "archlab 1.0 sequence",
      'title "Annotated"',
      "",
      "@sequence",
      '  a "A"',
      '  b "B"',
      '  watcher "Watcher"',
      "",
      '  a -> b : "hi"',
      '  note over watcher : "only a note mentions this one"',
      "",
    ].join("\n");
    const noteOnlyDoc = parseViewSource(noteOnly);
    check(
      "the note-only fixture parses, with a lifeline no message names",
      noteOnlyDoc.status === "ok" &&
        countReferences(noteOnlyDoc.value.file.items, "watcher").messages ===
          0 &&
        countReferences(noteOnlyDoc.value.file.items, "watcher").notes === 1,
      `status ${noteOnlyDoc.status}`,
    );
    const noteReason = participantRemovalRefusal(noteOnlyDoc.value, "watcher");
    check(
      "a lifeline only a note mentions is still refused, and the note is counted",
      typeof noteReason === "string" && noteReason.includes("1 note"),
      `reason: ${JSON.stringify(noteReason)}`,
    );
    check(
      "and the gesture declines, so no unparseable document is produced",
      deletedParticipantEdit(noteOnlyDoc.value, noteOnly, "watcher") === null,
      "a lifeline a note still names was removed",
    );

    /* THE ONE-MEMBER BOX. Taking the only lifeline out of a box leaves a
       bracket around nothing, which the parser refuses ("holds no
       participants"). Tested on its own fixture because the seed has no box. */
    const boxed = [
      "archlab 1.0 sequence",
      'title "Boxed"',
      "",
      "@sequence",
      '  a "A"',
      '  box "Data"',
      '    b "B"',
      "",
    ].join("\n");
    const boxedDoc = parseViewSource(boxed);
    check(
      "the box fixture parses with a one-member box and no messages",
      boxedDoc.status === "ok" &&
        boxedDoc.value.file.boxes.length === 1 &&
        boxedDoc.value.file.boxes[0].participants.length === 1,
      `status ${boxedDoc.status}`,
    );
    const boxReason = participantRemovalRefusal(boxedDoc.value, "b");
    check(
      "removing a box's only member is refused, naming the box",
      typeof boxReason === "string" && boxReason.includes("Data"),
      `reason: ${JSON.stringify(boxReason)}`,
    );
    check(
      "and the gesture declines rather than producing a bracket around nothing",
      deletedParticipantEdit(boxedDoc.value, boxed, "b") === null,
      "an empty box was written",
    );
  }

  /* ---- add a lifeline ------------------------------------------------------- */

  {
    const added = withSpare;
    check(
      "adding a lifeline reports the patch path and keeps the comment",
      added !== null &&
        added.path === "patch" &&
        added.text.includes("// Reviewed 2026-08-01"),
      `got ${JSON.stringify(added && added.path)}`,
    );
    check(
      "adding a lifeline adds exactly one line",
      spareText.split("\n").length === authored.split("\n").length + 1,
      `${authored.split("\n").length} -> ${spareText.split("\n").length}`,
    );
    /* AFTER THE LAST PARTICIPANT THE PARSER SAW, not at the end of the section:
       the blank line separating the lifelines from the flow is the author's and
       stays below the new declaration. */
    const lastEnd = Math.max(
      ...[...spans.participants.values()].map((s) => s.end),
    );
    check(
      "the new lifeline lands directly after the last one the parser saw",
      spareText.split("\n")[lastEnd].trimStart().startsWith("NewParticipant"),
      `line ${lastEnd + 1} is ${JSON.stringify(spareText.split("\n")[lastEnd])}`,
    );
    const addedDoc = parseViewSource(spareText);
    check(
      "the document re-parses with one lifeline more, at the end of the order",
      addedDoc.status === "ok" &&
        addedDoc.value.file.participants.length ===
          file.participants.length + 1 &&
        addedDoc.value.file.participants.at(-1).name ===
          INSERTED_PARTICIPANT_NAME,
      `status ${addedDoc.status}`,
    );
    /* DERIVED FROM THE SERIALIZER. A hand-written expected line would pass
       while the emitter changed underneath it. */
    const freshId = addedDoc.value.file.participants.at(-1).id;
    check(
      "the new line is byte-identical to what a full serialise would write",
      canonicalParticipantBlock(addedDoc.value.file, freshId, "  ").join(
        "\n",
      ) === spareText.split("\n")[lastEnd],
      "the inserted line is not what the serializer would emit",
    );

    /* PRESSED TWICE. The id is the name every message refers to, so a
       duplicate is not a cosmetic problem — it is two lifelines the parser
       cannot tell apart. */
    const again = insertedParticipantEdit(addedDoc.value, spareText);
    const againDoc = again === null ? null : parseViewSource(again.text);
    const ids =
      againDoc === null || againDoc.status !== "ok"
        ? []
        : againDoc.value.file.participants.map((p) => p.id);
    check(
      "adding a second lifeline gives it a different id",
      ids.length > 0 && new Set(ids).size === ids.length,
      `ids: ${ids.join(", ")}`,
    );

    /* A BOX MUST NOT SWALLOW IT. The new line is written at the ROOT body
       indent, so appending after a lifeline that sits inside a box leaves the
       box's run contiguous — the rule `serialize.ts` refuses a document for
       breaking. */
    const boxed = [
      "archlab 1.0 sequence",
      'title "Boxed"',
      "",
      "@sequence",
      "  // keep me",
      '  a "A"',
      '  box "Data"',
      '    b "B"',
      "",
      '  a -> b : "hi"',
      "",
    ].join("\n");
    const boxedDoc = parseViewSource(boxed);
    const boxedAdd = insertedParticipantEdit(boxedDoc.value, boxed);
    check(
      "the box fixture accepts a new lifeline at all",
      boxedAdd !== null,
      "the box assertions below would be vacuous",
    );
    const boxedAfter =
      boxedAdd === null
        ? { status: "skipped" }
        : parseViewSource(boxedAdd.text);
    check(
      "a lifeline added after a box run lands OUTSIDE the box",
      boxedAfter.status === "ok" &&
        boxedAfter.value.file.boxes.length === 1 &&
        boxedAfter.value.file.boxes[0].participants.length === 1 &&
        boxedAfter.value.file.boxes[0].participants[0] === "b",
      `boxes: ${JSON.stringify(boxedAfter.status === "ok" ? boxedAfter.value.file.boxes : boxedAfter.error)}`,
    );
    check(
      "...at the root body indent, so the dedent is what closes the box",
      boxedAdd !== null &&
        /^ {2}\S/.test(
          boxedAdd.text.split("\n").find((l) => l.includes("NewParticipant")) ??
            "",
        ),
      "the new lifeline was indented into the box",
    );
    check(
      "...and the box still round-trips through the serializer",
      boxedAfter.status === "ok" &&
        serializeSequenceText(boxedAfter.value.file).includes('box "Data"'),
      "the serializer refused the box the insert left behind",
    );

    /* THE EMPTY DOCUMENT is the case with no participant span to sit after, and
       the one where "add a lifeline" matters most. `spans.bodyLine` is what
       makes it reachable. */
    const bare = [
      "archlab 1.0 sequence",
      'title "Nothing yet"',
      "",
      "@sequence",
      "",
    ].join("\n");
    const bareDoc = parseViewSource(bare);
    check(
      "a document with no lifelines at all parses, so the fallback is reachable",
      bareDoc.status === "ok" && bareDoc.value.file.participants.length === 0,
      `status ${bareDoc.status}`,
    );
    const first = insertedParticipantEdit(bareDoc.value, bare);
    check(
      "the first lifeline of an empty document lands right after the @sequence line",
      first !== null &&
        first.text.split("\n")[spansOf(bare).bodyLine] ===
          `  NewParticipant "${INSERTED_PARTICIPANT_NAME}"`,
      `got ${JSON.stringify(first && first.text)}`,
    );
    check(
      "...and the document it produces re-parses with that lifeline in it",
      first !== null &&
        parseViewSource(first.text).status === "ok" &&
        parseViewSource(first.text).value.file.participants.length === 1,
      "the first lifeline produced text the parser refuses",
    );

    /* A LIFELINE MAY PRECEDE `autonumber`, which is what makes the line
       straight after the opener a legal home. Measured, because the whole
       fallback rests on it. */
    const numbered = [
      "archlab 1.0 sequence",
      'title "Numbered"',
      "",
      "@sequence",
      "  autonumber",
      "",
    ].join("\n");
    const numberedAdd = insertedParticipantEdit(
      parseViewSource(numbered).value,
      numbered,
    );
    check(
      "a lifeline inserted above an autonumber line still parses",
      numberedAdd !== null &&
        parseViewSource(numberedAdd.text).status === "ok" &&
        parseViewSource(numberedAdd.text).value.file.autonumber === true,
      `got ${JSON.stringify(numberedAdd && numberedAdd.text)}`,
    );
  }

  /* ---- there is no re-emit path at all ------------------------------------- */

  /* THE SHARPEST DIFFERENCE FROM THE C4 CANVAS, and the one most likely to be
     "fixed" back: when the pane cannot be patched, these gestures REFUSE.
     The C4 canvas falls back to a whole-document re-emit because its JSON pane
     has no comments to lose; a sequence document has no JSON pane, so the
     fallback would only ever eat the reader's comments. */
  const stale = `${authored}  cust -> web : "typed but not parsed yet"\n`;
  for (const [name, edit] of [
    [
      "a revision",
      revisedMessageEdit(doc.value, stale, withDesc, {
        label: "x",
        kind: "sync",
      }),
    ],
    [
      "a participant revision",
      revisedParticipantEdit(doc.value, stale, file.participants[0].id, {
        name: "x",
      }),
    ],
    [
      "an insert",
      insertedMessageEdit(
        doc.value,
        stale,
        null,
        file.participants[0].id,
        file.participants[1].id,
      ),
    ],
    /* THE FOUR NEWER GESTURES ARE IN THIS LOOP FOR THE SAME REASON THE FIRST
       THREE ARE: each is its own entry point into the splice, and the one that
       forgets to ask whether the pane agrees with the canvas is the one that
       corrupts the reader's file rather than refusing. A delete is the worst
       case of it — it would remove lines by numbers that describe a document
       that is no longer on screen. */
    [
      "a repoint",
      repointedMessageEdit(
        doc.value,
        stale,
        deletableMsg,
        file.participants[0].id,
        file.participants[1].id,
      ),
    ],
    ["a message delete", deletedMessageEdit(doc.value, stale, deletableMsg)],
    [
      "a lifeline removal",
      deletedParticipantEdit(
        spareValue,
        `${spareText}  cust -> web : "typed but not parsed yet"\n`,
        spareId,
      ),
    ],
    ["a lifeline insert", insertedParticipantEdit(doc.value, stale)],
  ]) {
    check(
      `${name} against a pane that disagrees with the canvas is refused, not re-emitted`,
      edit === null,
      `got ${JSON.stringify(edit && edit.path)}`,
    );
  }
  check(
    "no sequence gesture can report the lossy path",
    [
      revised,
      inserted,
      revisedParticipantEdit(doc.value, authored, file.participants[0].id, {
        name: "Renamed",
      }),
      /* EVERY GESTURE, not a sample. `"reemit"` is reachable from any of them
         the moment one grows a fallback, and the whole reason this section
         exists is that a re-emit passes every other assertion in this file
         while deleting the reader's comments. */
      repointedMessageEdit(
        blockyDoc.value,
        BLOCKY,
        blockyTarget,
        sequenceItemAt(blockyDoc.value.file.items, blockyTarget).from,
        blockyDoc.value.file.participants.at(-1).id,
      ),
      deletedMessageEdit(doc.value, authored, deletableMsg),
      deletedParticipantEdit(spareValue, spareText, spareId),
      insertedParticipantEdit(doc.value, authored),
    ].every((edit) => edit !== null && edit.path === "patch"),
    "a sequence edit re-emitted, which would delete the reader's comments",
  );
}

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} sequence-check assertions passed.`);

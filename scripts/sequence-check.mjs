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
const {
  sequenceItemAt,
  sequenceItemKey,
  sequenceMessagePaths,
  SEQUENCE_ARROWS_GRID,
  SEQUENCE_HEAD_STYLES,
  SEQUENCE_LINE_STYLES,
} = await import(pathToFileURL(path.join(ROOT, "src/types/index.ts")).href);
const { SEQUENCE_ARROW_MATCH_ORDER, sequenceArrowToken } = await import(
  pathToFileURL(path.join(ROOT, "src/features/archtext/index.ts")).href
);
const { MERMAID_SEQUENCE_ARROW_MATCH_ORDER, mermaidSequenceArrow } =
  await import(
    pathToFileURL(
      path.join(ROOT, "src/features/mermaid/lib/sequence-mapping.ts"),
    ).href
  );
const { SEQUENCE_HEAD_SHAPES } = await import(
  pathToFileURL(path.join(ROOT, "src/features/sequence/lib/arrow-heads.ts"))
    .href
);
const { layoutSequence } = await import(
  pathToFileURL(path.join(ROOT, "src/features/sequence/lib/layout.ts")).href
);
const { collapseSequence, hiddenParticipants } = await import(
  pathToFileURL(path.join(ROOT, "src/features/sequence/lib/collapse.ts")).href
);
const {
  fileWithMessageMoved,
  fileWithParticipantMoved,
  messageReorderRange,
  messageReorderRefusal,
  participantReorderRefusal,
} = await import(
  pathToFileURL(path.join(ROOT, "src/features/sequence/lib/reorder.ts")).href
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
  reorderedMessageEdit,
  reorderedParticipantEdit,
  repointedMessageEdit,
  revisedMessageEdit,
  revisedParticipantEdit,
  toggledAutonumberEdit,
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
  "message: both arrow axes, label, technology and the + suffix survive",
  post.from === "web" &&
    post.to === "api" &&
    post.lineStyle === "solid" &&
    post.headStyle === "arrow" &&
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
  reply201.lineStyle === "dotted" &&
    reply201.headStyle === "arrow" &&
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
  happy.items[1].branches[0].items[0].branches[0].items[0].lineStyle ===
    "solid" &&
    happy.items[1].branches[0].items[0].branches[0].items[0].headStyle ===
      "open" &&
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
      lineStyle: "solid",
      headStyle: "arrow",
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
                              lineStyle: "solid",
                              headStyle: "open",
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
              lineStyle: "dotted",
              headStyle: "arrow",
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
  "->> imports as solid+arrow and the + shorthand activates the target",
  m1.lineStyle === "solid" &&
    m1.headStyle === "arrow" &&
    m2.activate === true &&
    m2.to === "A",
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
  inAlt[1].lineStyle === "dotted" &&
    inAlt[1].deactivate === true &&
    inAlt[3].deactivate === true,
);
check(
  "loop > par nest inside alt; -) and --) keep their line styles apart",
  inAlt[2].kind === "loop" &&
    inAlt[2].branches[0].items[0].kind === "par" &&
    inAlt[2].branches[0].items[0].branches[0].items[0].headStyle === "open" &&
    inAlt[2].branches[0].items[0].branches[0].items[0].lineStyle === "solid" &&
    inAlt[2].branches[0].items[0].branches[1].items[0].headStyle === "open" &&
    inAlt[2].branches[0].items[0].branches[1].items[0].lineStyle === "dotted",
  JSON.stringify(inAlt[2]),
);
check(
  "--x imports as dotted+cross — the head shape is no longer a loss",
  altBranches[1].items[0].lineStyle === "dotted" &&
    altBranches[1].items[0].headStyle === "cross" &&
    altBranches[1].items[0].label === "400 Bad Request",
);
check(
  /* `->` and `-->` are Mermaid's HEADLESS arrows, and reading them as a call
     and a reply was the collapse this grammar extension removed. */
  "opt imports; -> and --> map to headless solid and headless dotted",
  optFrag.kind === "opt" &&
    optFrag.branches[0].items[0].headStyle === "none" &&
    optFrag.branches[0].items[0].lineStyle === "solid" &&
    optFrag.branches[0].items[1].headStyle === "none" &&
    optFrag.branches[0].items[1].lineStyle === "dotted",
);
check(
  "a self-message imports (from === to)",
  selfMsg.from === "A" &&
    selfMsg.to === "A" &&
    selfMsg.lineStyle === "solid" &&
    selfMsg.headStyle === "cross",
);
check(
  /* The arrowhead clause is GONE from the list of losses on purpose: it was
     the one thing this caveat named that is no longer true, and a caveat that
     over-claims loss is as misleading as one that under-claims it. What the
     assertion pins now is that it says so POSITIVELY — "every arrow intact" —
     rather than merely dropping the sentence, because a silent deletion reads
     as an oversight to the next person to open the file. */
  "the caveat names what is still lost (autonumber args, unanchored activations, unstorable colours, create/destroy), says every arrow now survives, AND that every block survives",
  MERMAID_SEQUENCE_CAVEAT.includes("every arrow intact") &&
    !MERMAID_SEQUENCE_CAVEAT.includes("arrowheads collapse") &&
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
/* THE WHOLE SENTENCE, not a fragment. The keyword list is joined from
   `SEQUENCE_HEADER_KEYWORDS`, which the near-match quick fix also ranks
   against, so a reordered array would silently reword a message readers have
   had since 1.0. Same assertion, same reasoning, in `archtext-check.mjs` and
   `flowchart-check.mjs` — three sets, three sentences, three pins. */
seqError(
  "an unknown header keyword is refused, naming the whole closed set",
  'archlab 1.0 sequence\ntitle "T"\ndescriptoin "d"\n\n@sequence\n  a "A"\n',
  '"descriptoin" is not a sequence header keyword — expected archlab, schema, ' +
    "title, description, owner, tags, created, updated or reviewed " +
    '(other metadata rides "! meta.<key> : <json>")',
);
seqError(
  "a header line indented before the block is refused",
  'archlab 1.0 sequence\ntitle "T"\n  owner "O"\n\n@sequence\n  a "A"\n',
  'this line is indented, but no "@sequence" block is open above it',
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
    lineStyle: before.lineStyle,
    headStyle: before.headStyle,
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
      lineStyle: before.lineStyle,
      headStyle: before.headStyle,
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
      lineStyle: before.lineStyle,
      headStyle: before.headStyle,
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

  /* ---- numbering: three states, and the one that must not be written ------- */

  /* WHY THIS SUBSECTION IS LONGER THAN THE GESTURE. `autonumber` is one of the
     three fields `serialize.ts` omits at its default, and the three states —
     absent, `autonumber`, `autonumber false` — are the exact shape of the bug
     the whole line-patch architecture was built to stop. A toggle that turned
     "the author wrote nothing" into "the author wrote false" would be a
     re-emit's normalisation, arriving one gesture at a time and passing every
     other assertion in this file.

     Each transition is measured on the SAME non-canonical fixture the rest of
     this section uses, so the comment line and the blank line are in the file
     while the flag moves. Every assertion below reads the whole text back, not
     just the model: the model cannot show a lost comment. */
  {
    /* THE THREE FIXTURES, derived from `authored` rather than hand-written, so
       none of them can drift from the document the gestures above are proven
       on. `authored` carries `autonumber` (the seed does), which makes it the
       ON fixture; removing the line gives ABSENT; rewriting it gives FALSE. */
    const numberedOn = authored;
    const absent = authored.replace("  autonumber\n", "");
    const explicitFalse = authored.replace(
      "  autonumber\n",
      "  autonumber false\n",
    );
    check(
      "the three numbering fixtures really are three different states",
      parseSequenceText(numberedOn).autonumber === true &&
        parseSequenceText(absent).autonumber === undefined &&
        parseSequenceText(explicitFalse).autonumber === false,
      `on ${parseSequenceText(numberedOn).autonumber}, absent ${parseSequenceText(absent).autonumber}, false ${parseSequenceText(explicitFalse).autonumber}`,
    );
    /* THE SPAN THE GESTURE STEERS BY. A flag line found by scanning for the
       word would also match a `desc` that mentions it; the parser records the
       keyword's own line, and `null` is how "absent" is told apart from
       "false". */
    check(
      "the parser reports the autonumber line, and null when there is none",
      parseSequenceTextWithSpans(numberedOn).spans.autonumberLine !== null &&
        numberedOn
          .split("\n")
          [
            parseSequenceTextWithSpans(numberedOn).spans.autonumberLine - 1
          ].trim() === "autonumber" &&
        parseSequenceTextWithSpans(absent).spans.autonumberLine === null &&
        parseSequenceTextWithSpans(explicitFalse).spans.autonumberLine !== null,
      `on ${parseSequenceTextWithSpans(numberedOn).spans.autonumberLine}, absent ${parseSequenceTextWithSpans(absent).spans.autonumberLine}`,
    );

    /**
     * The 1-based line `longer` has and `shorter` does not, or `null` when they
     * are not one line apart.
     *
     * `changedLines` CANNOT ANSWER THIS and using it here is how these
     * assertions first "failed": it compares line N with line N, so inserting
     * or removing a line reports every line after it as changed. The revise
     * gestures replace in place and are fine with it; a flag being added or
     * taken away needs the multiset question instead — remove the candidate
     * line and the rest must be byte-identical.
     */
    const oneLineApart = (shorter, longer) => {
      const a = shorter.split("\n");
      const b = longer.split("\n");
      if (b.length !== a.length + 1) return null;
      const at = b.findIndex((line, index) => line !== a[index]);
      const index = at === -1 ? b.length - 1 : at;
      return b.filter((_, i) => i !== index).join("\n") === shorter
        ? index + 1
        : null;
    };

    /* ONE TOGGLE, THROUGH THE HOST'S OWN RULE. `toggledAutonumberEdit` takes
       the off spelling as an argument because the text cannot supply it once the
       flag reads `autonumber` (see its header). Calling it with the default
       here would assert a call the shipped host never makes for a document that
       arrived numbered — a check narrower than the behaviour, which is how the
       silent deletion of a hand-written `autonumber false` got through in the
       first place.

       So this mirrors `handleToggleAutonumber`: the ref starts empty, is
       captured on the way ON, and falls back to `"false"` for a file that was
       never off. `check:canvas-edit` asserts the host still follows it. */
    const makeToggle = () => {
      let remembered = null;
      return (text) => {
        const parsed = parseViewSource(text);
        if (parsed.status !== "ok") return null;
        if (parsed.value.file.autonumber !== true) {
          remembered =
            parsed.value.file.autonumber === false ? "false" : "absent";
        }
        return toggledAutonumberEdit(parsed.value, text, remembered ?? "false");
      };
    };
    /** One toggle from `text` by a reader who has pressed nothing before. */
    const toggle = (text) => makeToggle()(text);

    const offFromOn = toggle(numberedOn);
    /* THE OFF POSITION RESTORES, IT DOES NOT NORMALISE. A file that arrived
       numbered was never off, so the off position has to invent an off state,
       and it writes `autonumber false` IN PLACE rather than removing the line.
       Removing it loses WHERE the author put the flag: a new one is written
       after the block's leading prose, so a flag above an opening comment came
       back below it. Both spellings render the same; only one leaves the rest
       of the file alone. */
    check(
      "turning numbering off on a file that arrived numbered keeps the flag's own line",
      offFromOn !== null &&
        offFromOn.doc.file.autonumber === false &&
        (offFromOn.text.match(/^\s*autonumber\b/gm) ?? []).length === 1 &&
        offFromOn.text.split("\n").length === numberedOn.split("\n").length,
      `got ${JSON.stringify(offFromOn && offFromOn.text.match(/.*autonumber.*/g))}`,
    );
    /* THE ROUND TRIP THAT DECIDED IT. Removing rather than writing `false` is
       what makes a reader who presses the control twice out of curiosity end
       where they started, byte for byte — the property the alternative loses
       for every document that had never mentioned numbering. */
    const backOn = offFromOn === null ? null : toggle(offFromOn.text);
    check(
      "on → off → on returns the file byte-for-byte, comment and blank line included",
      backOn !== null && backOn.text === numberedOn,
      backOn === null
        ? "the second toggle refused"
        : `first difference at line ${changedLines(backOn.text, numberedOn)[0]}`,
    );

    const onFromAbsent = toggle(absent);
    check(
      "turning numbering on from an absent field adds exactly one line, the flag",
      onFromAbsent !== null &&
        onFromAbsent.doc.file.autonumber === true &&
        oneLineApart(absent, onFromAbsent.text) !== null &&
        onFromAbsent.text
          .split("\n")
          [oneLineApart(absent, onFromAbsent.text) - 1].trim() === "autonumber",
      `got ${JSON.stringify(onFromAbsent && onFromAbsent.text.match(/.*autonumber.*/g))}`,
    );
    /* PAST THE AUTHOR'S LEADING PROSE, not straight after the opener. The
       fixture opens its body with a comment and a blank line, so a flag written
       at the opener would push both down — which is the specific reason the
       round trip above is byte-identical rather than merely equivalent. */
    check(
      "the inserted flag lands after the comment the body opens with, not above it",
      onFromAbsent !== null &&
        (() => {
          const written = onFromAbsent.text.split("\n");
          const at = written.findIndex((line) => line.trim() === "autonumber");
          return at > 0 && written[at - 1].trim() === "";
        })(),
      "the flag was written above prose the author put at the head of the block",
    );

    const onFromFalse = toggle(explicitFalse);
    check(
      "turning numbering on from an explicit false REPLACES that line, never adds a second",
      onFromFalse !== null &&
        onFromFalse.doc.file.autonumber === true &&
        onFromFalse.text.split("\n").length ===
          explicitFalse.split("\n").length &&
        (onFromFalse.text.match(/^\s*autonumber\b/gm) ?? []).length === 1,
      `got ${JSON.stringify(onFromFalse && onFromFalse.text.match(/.*autonumber.*/g))}`,
    );

    /* THE WHOLE POINT, ONE ASSERTION: no transition may touch a byte that is
       not the flag's own line. This is what a re-emit fails, and it is checked
       across all three starting states at once so a gesture cannot be safe on
       the fixture it was written against and lossy on the other two. */
    for (const [name, before, after] of [
      ["on → off", numberedOn, offFromOn],
      ["absent → on", absent, onFromAbsent],
      ["false → on", explicitFalse, onFromFalse],
    ]) {
      /* Whichever direction the line count went, the flag's own line is the
         only difference: a removal is one line apart the other way round, and a
         `false` → `true` rewrite is the same length and answers to
         `changedLines`. */
      const differs =
        after === null
          ? null
          : after.text.split("\n").length === before.split("\n").length
            ? changedLines(after.text, before)
            : [
                oneLineApart(after.text, before) ??
                  oneLineApart(before, after.text),
              ].filter((line) => line !== null);
      check(
        `${name} changes exactly one line, and it is the flag's`,
        differs !== null &&
          differs.length === 1 &&
          /autonumber/.test(
            `${before.split("\n")[differs[0] - 1] ?? ""}${after.text.split("\n")[differs[0] - 1] ?? ""}`,
          ),
        `differing lines ${JSON.stringify(differs)}`,
      );
      check(
        `${name} keeps the author's comment and blank line`,
        after !== null &&
          after.text.includes("// Reviewed 2026-08-01") &&
          after.text.includes("updated 2026-08-01T00:00:00.000Z"),
        "a numbering toggle normalised a field it was not asked about",
      );
    }

    /* PRESS IT TWICE AND THE FILE IS WHERE YOU LEFT IT — from EVERY starting
       state, which is the assertion that was missing when this shipped.

       The toggle has two positions and the field has three states: absent,
       `autonumber false`, and `autonumber`. The first two render identically,
       so one off position stands for both, and the earlier rule — off always
       removes the line — silently deleted an `autonumber false` an author had
       written by hand. Nothing looked wrong, because the diagram numbers
       nothing either way. The assertions above passed throughout: they measured
       absent → on → off and never the state they broke.

       Looped over the three starting states rather than written out for the one
       that failed, because the failure a hand-picked pair cannot notice is a
       fourth spelling of the same field. Three presses, so the second is also
       checked to be reversible rather than merely to look like the first. */
    for (const [name, start] of [
      ["absent", absent],
      ["an explicit `autonumber false`", explicitFalse],
      ["`autonumber`", numberedOn],
    ]) {
      const press = makeToggle();
      const one = press(start);
      const two = one === null ? null : press(one.text);
      const three = two === null ? null : press(two.text);
      check(
        `pressing the toggle twice from ${name} returns the file byte for byte`,
        two !== null && two.text === start,
        two === null
          ? "a press refused"
          : `first difference at line ${changedLines(two.text, start)[0]}`,
      );
      check(
        `and a third press from ${name} lands exactly where the first did`,
        three !== null && one !== null && three.text === one.text,
        "the toggle is not idempotent across a full cycle",
      );
      check(
        `every press from ${name} flips what the canvas draws`,
        one !== null &&
          two !== null &&
          (one.doc.file.autonumber === true) !==
            (two.doc.file.autonumber === true),
        "the toggle changed bytes without changing the numbering",
      );
    }

    /* A CANVAS THE READER LOCKED, and a document that is not a sequence at
       all: the same two refusals every other gesture here owes, asserted
       because this one takes no address and so has fewer chances to notice. */
    check(
      "a C4 document refuses the numbering toggle",
      toggledAutonumberEdit(
        parseViewSource(VIEW_SEED_TEXT.c4).value,
        VIEW_SEED_TEXT.c4,
      ) === null,
      "a gesture for the sequence canvas answered for another notation",
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
        lineStyle: "solid",
        headStyle: "arrow",
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
    ["a numbering toggle", toggledAutonumberEdit(doc.value, stale)],
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
      toggledAutonumberEdit(doc.value, authored),
    ].every((edit) => edit !== null && edit.path === "patch"),
    "a sequence edit re-emitted, which would delete the reader's comments",
  );
}

/* ----------------------------------------------------------------------- */
/* 9. Reordering: a swap of two blocks, and nothing else moves              */
/* ----------------------------------------------------------------------- */

/* WHY THIS SECTION IS BYTE-LEVEL RATHER THAN MODEL-LEVEL. A reorder is the one
   gesture on this canvas that changes NOTHING about the elements it touches, so
   every model-level assertion about it is trivially satisfied by a whole-
   document re-emit — which is exactly the failure `line-patch.ts` exists to
   prevent, and which passed every assertion in this file for a release while
   deleting every `//` comment on the first drag. The only thing that can catch
   it is: which BYTES changed, measured against text the serializer would
   normalise.

   AND THE MEANING IS DERIVED FROM THE SERIALIZER, never from a hand-written
   expectation. `fileWithMessageMoved` is the model-level description of the
   move; the assertion is that the patched text canonicalises to exactly what
   the serializer emits for that model. A hand-typed expected block would be a
   second authority on what a reorder means, free to agree with a bug. */
console.log("\nA reorder swaps two blocks and moves nothing else");

{
  /* NON-CANONICAL IN FIVE WAYS, each one something the serializer erases: a
     leading `//` comment, blank lines, a comment BETWEEN two steps, a written-
     out `updated`, and an explicit `:participant`. A multi-line `desc` on the
     message being moved is the sixth, and the one that separates "swaps the
     block" from "swaps the line". */
  const spansOf = (text) => parseSequenceTextWithSpans(text).spans;
  const REORDER = [
    "archlab 1.0 sequence",
    "updated 2026-08-01T00:00:00.000Z",
    'title "Reorder"',
    "",
    "@sequence",
    "  // The cast, in reading order.",
    "",
    '  cust:actor "Customer"',
    '  web:participant "Storefront"',
    '  api "Order API"',
    "",
    '  cust -> web : "Clicks buy" [HTTPS]',
    '    desc "POST /cart\\nreturns 200"',
    "    ! x-trace after label : true",
    '  web -> api : "Place the order"',
    "",
    "  // Everything below is the happy path.",
    '  api ..> web : "201 Created"',
    '  web ..> cust : "Shows the receipt"',
    "",
  ].join("\n");
  const doc = parseViewSource(REORDER);
  check(
    "the reorder fixture parses, is non-canonical, and its first message owns a 4-line block",
    doc.status === "ok" &&
      serializeSequenceText(parseSequenceText(REORDER)) !== REORDER &&
      spansOf(REORDER).items.get(sequenceItemKey([0])).end -
        spansOf(REORDER).items.get(sequenceItemKey([0])).start ===
        2,
    `status ${doc.status}`,
  );

  /* ---- the block moves, and only the block ------------------------------- */

  /* GUARDED, so a broken fixture FAILS the assertion above rather than
     crashing the script three assertions later — one of these went in as a
     crash once, which reports as a stack trace and no verdict. */
  if (doc.status !== "ok") {
    console.error("    the reorder fixture did not parse — section skipped");
    failures += 1;
    assertions += 1;
  } else {
    const moved = reorderedMessageEdit(doc.value, REORDER, [0], 1);
    check(
      "a message reorder reports the patch path, never a re-emit",
      moved !== null && moved.path === "patch",
      `path ${moved && moved.path}`,
    );
    /* THE WHOLE BLOCK TRAVELS. Moving only the declaration line would leave the
     `desc` and the `!` escape behind, attached to whatever now sits above them
     — a document that either refuses to parse or quietly re-attributes the
     author's detail to a different step. Counted as a SET of lines rather than
     positionally, because their positions are exactly what changed. */
    const before = REORDER.split("\n");
    const after = (moved?.text ?? "").split("\n");
    check(
      "the reorder changes no line COUNT — nothing is added or dropped",
      after.length === before.length,
      `${before.length} lines before, ${after.length} after`,
    );
    check(
      "every line of the file is still present, byte for byte",
      [...before].sort().join(" ") === [...after].sort().join(" "),
      /* A reorder is a permutation of lines. Any line that gained or lost a byte
       means a block was rewritten from the model rather than lifted — which is
       how a `desc` the author wrapped their own way comes back canonicalised. */
      "a line was rewritten rather than moved",
    );
    const movedRange = (text, first) => {
      const lines = text.split("\n");
      const at = lines.indexOf(first);
      return at;
    };
    check(
      "the moved message now sits BELOW the one it traded with",
      movedRange(moved?.text ?? "", '  cust -> web : "Clicks buy" [HTTPS]') >
        movedRange(moved?.text ?? "", '  web -> api : "Place the order"'),
      "the swap went the wrong way, or did not happen",
    );
    check(
      "its desc and its `!` escape came with it, still directly beneath it",
      /  web -> api : "Place the order"\n  cust -> web : "Clicks buy" \[HTTPS\]\n    desc "POST \/cart\\nreturns 200"\n    ! x-trace after label : true\n/.test(
        moved?.text ?? "",
      ),
      "the declaration line moved without the continuation lines it owns",
    );

    /* THE AUTHOR'S OWN BYTES OUTSIDE THE TWO BLOCKS ARE UNTOUCHED, which is the
     assertion the re-emit this replaced could never have passed. */
    for (const survivor of [
      "  // The cast, in reading order.",
      "  // Everything below is the happy path.",
      "updated 2026-08-01T00:00:00.000Z",
      '  web:participant "Storefront"',
    ]) {
      check(
        `a reorder leaves ${JSON.stringify(survivor.trim().slice(0, 34))} exactly where it was`,
        (moved?.text ?? "").split("\n").indexOf(survivor) ===
          before.indexOf(survivor),
        "the line survived but moved, so a block wider than the gesture was spliced",
      );
    }

    /* ---- the patched text MEANS the model move ----------------------------- */

    /* DERIVED FROM THE SERIALIZER. `fileWithMessageMoved` is the model-level
     description of a reorder; canonicalising both sides is what proves the text
     patch and the array move are the same operation. Without this the byte
     assertions above would happily pass on a swap that landed in the wrong
     slot. */
    for (const [from, to] of [
      [0, 1],
      [0, 3],
      [3, 0],
      [2, 1],
    ]) {
      const edit = reorderedMessageEdit(doc.value, REORDER, [from], to);
      const model = fileWithMessageMoved(doc.value.file, [from], to);
      check(
        `moving step ${from + 1} to slot ${to + 1} produces the canonical text of that array move`,
        edit !== null &&
          model !== null &&
          serializeSequenceText(edit.doc.file) === serializeSequenceText(model),
        "the text patch and the model move disagree about where the step landed",
      );
    }

    /* ---- the keyboard and the drag are ONE operation ----------------------- */

    /* THE ASSERTION THAT MAKES "PARITY" MEAN SOMETHING. A drag is aimed and lands
     several slots away; a press is counted and lands one. If they were two
     implementations, the long move would be the one nobody tested. Chained
     single steps must produce the SAME BYTES as one multi-step call. */
    const dragged = reorderedMessageEdit(doc.value, REORDER, [0], 3);
    let keyDoc = doc.value;
    let keyText = REORDER;
    for (let at = 0; at < 3; at += 1) {
      const step = reorderedMessageEdit(keyDoc, keyText, [at], at + 1);
      if (step === null) break;
      keyDoc = step.doc;
      keyText = step.text;
    }
    check(
      "a three-row drag is byte-identical to three single-slot keypresses",
      dragged !== null && dragged.text === keyText,
      firstDiff(dragged?.text ?? "", keyText),
    );

    /* ---- putting it back leaves the file where it started ------------------ */

    /* THE LOSSLESS PAIR, on the same reasoning as the numbering toggle's
     on-off-on: a reader who drags something and drags it back must get their
     file, not a normalised version of it. This is the assertion a re-emit
     cannot pass, and it is also what proves the comment-between-steps decision
     is at least symmetrical. */
    const there = reorderedMessageEdit(doc.value, REORDER, [0], 2);
    const back =
      there === null
        ? null
        : reorderedMessageEdit(there.doc, there.text, [2], 0);
    check(
      "moving a step down and back up returns the file byte for byte",
      back !== null && back.text === REORDER,
      firstDiff(back?.text ?? "", REORDER),
    );

    /* ---- a no-op costs nothing -------------------------------------------- */

    check(
      "dropping a step back on its own row is refused, so it costs no undo entry",
      reorderedMessageEdit(doc.value, REORDER, [0], 0) === null,
      "a drag that landed where it began would still rewrite the pane",
    );

    /* ---- the RANGE and the REFUSAL are one answer -------------------------- */

    /* THE FAILURE THIS PREVENTS IS THE WORST ONE AVAILABLE HERE: the drag offers
     a slot the edit declines, so the reader drops onto an indicator and gets a
     refusal. The viewer draws its indicator from `messageReorderRange` and the
     edit guards with `messageReorderRefusal`, so the two must agree on EVERY
     slot of every document — walked exhaustively rather than sampled, because a
     disagreement at one boundary is exactly the shape this would take. */
    const BLOCKED = [
      "archlab 1.0 sequence",
      'title "Blocked"',
      "",
      "@sequence",
      '  a "A"',
      '  b "B"',
      '  box "Core"',
      '    c "C"',
      '    d "D"',
      '  e "E"',
      "",
      '  a -> b : "one"',
      '  note over a : "an aside"',
      '  a -> b : "two"',
      '  a ->+ b : "three opens a bar"',
      '  a -> b : "four"',
      '  opt "maybe"',
      '    a -> b : "inside"',
      '  a -> b : "five"',
      "",
    ].join("\n");
    const blocked = parseViewSource(BLOCKED);
    check(
      "the blocker fixture parses and holds all four kinds of blocker",
      blocked.status === "ok" &&
        blocked.value.file.items.length === 7 &&
        blocked.value.file.items[1].step === "note" &&
        blocked.value.file.items[3].activate === true &&
        blocked.value.file.items[5].step === "fragment" &&
        (blocked.value.file.boxes ?? []).length === 1,
      `parsed ${blocked.status}`,
    );

    {
      const file = blocked.value.file;
      let disagreements = 0;
      let probes = 0;
      for (const path of sequenceMessagePaths(file.items)) {
        const range = messageReorderRange(file, path);
        const siblings =
          path.length === 1
            ? file.items
            : sequenceItemAt(file.items, path.slice(0, -2)).branches[
                path[path.length - 2]
              ].items;
        for (let to = 0; to < siblings.length; to += 1) {
          probes += 1;
          const inRange = range !== null && to >= range.min && to <= range.max;
          const refused =
            activationRefusal(blocked.value, path) !== null ||
            messageReorderRefusal(file, path, to) !== null;
          const edited = reorderedMessageEdit(blocked.value, BLOCKED, path, to);
          /* THREE THINGS IN LOCKSTEP: the range the drag offers, the refusal the
           host speaks, and whether the edit actually produces text. A slot in
           range must not be refused, and a slot the edit accepted must have
           been in range. */
          if (inRange && to !== range.at && refused) disagreements += 1;
          if (edited !== null && !inRange) disagreements += 1;
          if (!inRange && to !== (range?.at ?? -1) && edited !== null) {
            disagreements += 1;
          }
        }
      }
      check(
        `the offered range and the refusal agree on all ${probes} message slots`,
        probes > 20 && disagreements === 0,
        `${disagreements} slot(s) where the drag and the edit disagree`,
      );
    }

    /* ---- each refusal says WHAT is in the way ------------------------------ */

    /* A REFUSAL WITHOUT A NOUN IS A DEAD CONTROL. `participantRemovalRefusal`
     already sets this bar with its counts; these four have to clear it, and
     each names the thing the reader has to go and move in the source pane. */
    const REFUSALS = [
      ["a note", [0], 2, /note/i],
      ["an activation flag on the neighbour", [2], 3, /activation flag/i],
      ["a fragment", [4], 6, /fragment/i],
    ];
    for (const [what, path, to, pattern] of REFUSALS) {
      const reason = messageReorderRefusal(blocked.value.file, path, to);
      check(
        `crossing ${what} is refused, and the sentence names it`,
        typeof reason === "string" &&
          reason.length > 40 &&
          pattern.test(reason),
        `reason: ${JSON.stringify(reason)}`,
      );
      check(
        `...and the edit itself declines, not just the predicate`,
        reorderedMessageEdit(blocked.value, BLOCKED, path, to) === null,
        "the refusal is advisory — the gesture went ahead anyway",
      );
    }
    /* THE DRAGGED MESSAGE'S OWN FLAG belongs to `activationRefusal`, which every
     other gesture on a message already speaks. Two wordings for one fact is how
     two surfaces come to describe the same refusal differently, so this asserts
     the split rather than a second sentence. */
    check(
      "a message carrying its own activation flag cannot be dragged at all",
      messageReorderRange(blocked.value.file, [3]) === null &&
        activationRefusal(blocked.value, [3]) !== null &&
        reorderedMessageEdit(blocked.value, BLOCKED, [3], 2) === null,
      "an unpaired +/- would be moved rows away from the bar it opens",
    );

    /* ---- lifelines: the box rule, cross-checked against the serializer ----- */

    const boxed = reorderedParticipantEdit(blocked.value, BLOCKED, "c", 3);
    check(
      "two lifelines inside one box trade places, and the box block still parses",
      boxed !== null &&
        boxed.path === "patch" &&
        parseViewSource(boxed.text).status === "ok" &&
        boxed.doc.file.participants.map((p) => p.id).join() === "a,b,d,c,e",
      `got ${JSON.stringify(boxed && boxed.doc.file.participants.map((p) => p.id))}`,
    );
    check(
      "a box member keeps its two extra spaces, so it stays inside the bracket",
      /  box "Core"\n    d "D"\n    c "C"\n  e "E"/.test(boxed?.text ?? ""),
      "the swap changed an indent, which is what moves a lifeline in or out of a box",
    );

    /* THE RULE IS CROSS-CHECKED AGAINST `serialize.ts`, which is the authority on
     what a `box` may bracket: a box whose members are not a contiguous run is a
     model it refuses to spell. So every slot the box rule PERMITS must be a
     model the serializer accepts. Walked exhaustively — this is the assertion
     that would have caught a rule written from the model alone. */
    {
      const file = blocked.value.file;
      let permittedButUnwritable = 0;
      let probes = 0;
      for (const participant of file.participants) {
        for (let to = 0; to < file.participants.length; to += 1) {
          probes += 1;
          if (participantReorderRefusal(file, participant.id, to) !== null) {
            continue;
          }
          const model = fileWithParticipantMoved(file, participant.id, to);
          try {
            serializeSequenceText(model);
          } catch {
            permittedButUnwritable += 1;
          }
        }
      }
      check(
        `every column swap the box rule permits is one the serializer can write (${probes} probes)`,
        probes > 20 && permittedButUnwritable === 0,
        `${permittedButUnwritable} permitted move(s) produce a document serialize.ts refuses`,
      );
    }
    /* AND THE ONE CASE THE SERIALIZER WOULD WAVE THROUGH. A box of exactly one
     member stays trivially contiguous under any move, so a serializer-only
     guard accepts it — while the text patch would leave the bracket wrapped
     around nothing. This is why the rule is stated in `reorder.ts` rather than
     delegated, and it is measured rather than argued. */
    {
      const SOLE = [
        "archlab 1.0 sequence",
        'title "Sole"',
        "",
        "@sequence",
        '  a "A"',
        '  box "Alone"',
        '    b "B"',
        '  c "C"',
        "",
        '  a -> b : "one"',
        '  b -> c : "two"',
        "",
      ].join("\n");
      const sole = parseViewSource(SOLE);
      const model = fileWithParticipantMoved(sole.value.file, "b", 2);
      let serialises = true;
      try {
        serializeSequenceText(model);
      } catch {
        serialises = false;
      }
      check(
        "a one-member box is refused even though the serializer would accept the model",
        sole.status === "ok" &&
          serialises &&
          participantReorderRefusal(sole.value.file, "b", 2) !== null &&
          reorderedParticipantEdit(sole.value, SOLE, "b", 2) === null,
        "the bracket would be left wrapped around nothing",
      );
    }
    check(
      "crossing a box boundary is refused, and the sentence names the box",
      /Core/.test(
        participantReorderRefusal(blocked.value.file, "e", 3) ?? "",
      ) && reorderedParticipantEdit(blocked.value, BLOCKED, "e", 3) === null,
      "a lifeline would be dragged into a bracket the reader never widened",
    );

    /* ---- autonumber renumbers, and no assertion pins a step number --------- */

    /* EXPECTED, NOT A BUG: numbering is positional, so a reorder renumbers. What
     this asserts is that the renumbering FOLLOWS THE TEXT rather than being
     predicted — the count is stable and the moved message's own label is what
     identifies it, never its step. */
    {
      const NUMBERED = REORDER.replace(
        "@sequence\n",
        "@sequence\n  autonumber\n",
      );
      const numbered = parseViewSource(NUMBERED);
      const shuffled = reorderedMessageEdit(numbered.value, NUMBERED, [0], 2);
      check(
        "reordering a numbered flow keeps the flag, the step count and every label",
        shuffled !== null &&
          shuffled.doc.file.autonumber === true &&
          shuffled.doc.file.items.length === numbered.value.file.items.length &&
          sequenceMessagePaths(shuffled.doc.file.items)
            .map((p) => sequenceItemAt(shuffled.doc.file.items, p).label)
            .sort()
            .join("|") ===
            sequenceMessagePaths(numbered.value.file.items)
              .map((p) => sequenceItemAt(numbered.value.file.items, p).label)
              .sort()
              .join("|"),
        "a label was lost or duplicated by the swap",
      );
    }

    /* ---- inside a fragment branch ----------------------------------------- */

    /* A BRANCH IS A SIBLING LIST LIKE ANY OTHER, and the indent is what keeps it
     one: two messages inside an `alt` lane sit four spaces deep, and a swap
     that read the indent from the model instead of the source would lift one of
     them out of the fragment. */
    {
      const NESTED = [
        "archlab 1.0 sequence",
        'title "Nested"',
        "",
        "@sequence",
        '  a "A"',
        '  b "B"',
        "",
        '  alt "card accepted"',
        '    a -> b : "charge"',
        '    b ..> a : "receipt"',
        '  else "declined"',
        '    b ..> a : "sorry"',
        "",
      ].join("\n");
      const nested = parseViewSource(NESTED);
      const swapped = reorderedMessageEdit(nested.value, NESTED, [0, 0, 0], 1);
      check(
        "two messages in one fragment branch trade places at their own indent",
        swapped !== null &&
          /    b \.\.> a : "receipt"\n    a -> b : "charge"\n/.test(
            swapped.text,
          ) &&
          parseViewSource(swapped.text).value.file.items[0].branches[0].items
            .length === 2,
        `got ${JSON.stringify(swapped && swapped.text)}`,
      );
      check(
        "a message cannot be dragged out of its branch into another one",
        /* THE FRAGMENT DECISION, measured: an item's identity is a PATH, so
         crossing a branch boundary changes the message's nesting rather than
         its time — and `SequenceSpans` records no span for a fragment, so there
         is nothing to trade lines with even if it were wanted. The range simply
         does not reach outside the branch. */
        messageReorderRange(nested.value.file, [0, 0, 0]).max === 1 &&
          reorderedMessageEdit(nested.value, NESTED, [0, 0, 0], 2) === null,
        "a drag reached into a sibling branch",
      );
    }
  }
}

/* ----------------------------------------------------------------------- */
/* 8. THE ARROW GRID — all ten arrows, driven from the grid                 */
/* ----------------------------------------------------------------------- */

/*
 * WHY THIS SECTION IS A LOOP AND NOT TEN ASSERTIONS. The arrow vocabulary is
 * a cartesian product (2 line styles x 5 head styles), and the failure this
 * section exists to prevent is an ELEVENTH arrow being added to the model with
 * no token, no Mermaid spelling, or no canvas head — none of which a
 * hand-listed set of ten can notice. Everything below iterates
 * `SEQUENCE_ARROWS_GRID`, which is computed from the two axis arrays, so the
 * coverage grows with the type rather than with somebody's memory.
 *
 * The three arrows the grammar shipped with (`->`, `~>`, `..>`) are three
 * points in that product and are asserted to still spell themselves, from
 * NON-CANONICAL source text — a canonical fixture cannot tell a serializer
 * that reformats from one that does not.
 */

console.log("\nthe arrow grid (ten arrows, both directions)");

const gridDoc = (token) =>
  `archlab 1.0 sequence\ntitle "Grid"\n\n@sequence\n  a:participant "A"\n  b:participant "B"\n\n  a ${token} b : "m"\n`;

check(
  "the grid is the cartesian product of the two axes — ten arrows, no hand-listed set",
  SEQUENCE_ARROWS_GRID.length ===
    SEQUENCE_LINE_STYLES.length * SEQUENCE_HEAD_STYLES.length &&
    SEQUENCE_ARROWS_GRID.length === 10,
  `grid holds ${SEQUENCE_ARROWS_GRID.length}`,
);

{
  /* NO TOKEN MAY BE A PREFIX OF AN EARLIER CANDIDATE. `..` is a prefix of
     `..>`, `..x>` and `..~>`, so a first-match loop over an unordered table
     reads every dotted arrow as a headless line and the tip glyphs fail as the
     target id. The parser's order is derived by length; this asserts the
     property that ordering has to deliver, not the ordering itself, so a
     future token that breaks it by some other route is still caught. */
  const order = SEQUENCE_ARROW_MATCH_ORDER.map(([token]) => token);
  let shadowed = null;
  for (let i = 0; i < order.length; i += 1) {
    for (let j = i + 1; j < order.length; j += 1) {
      if (order[j].startsWith(order[i]))
        shadowed = `${order[i]} shadows ${order[j]}`;
    }
  }
  check(
    "no .alab arrow token shadows a later candidate — the match order is prefix-safe",
    shadowed === null,
    shadowed ?? "",
  );
  check(
    "every token in the match order is distinct, so no two arrows share a spelling",
    new Set(order).size === order.length,
    order.join(" "),
  );
}

{
  /* THE MERMAID TABLE IS THE SAME SHAPE and needs the same property, and this
     is the assertion the missing bidirectional support would have failed:
     `<<->>` and `<<-->>` appeared in no table at all. */
  const order = MERMAID_SEQUENCE_ARROW_MATCH_ORDER.map(([token]) => token);
  let shadowed = null;
  for (let i = 0; i < order.length; i += 1) {
    for (let j = i + 1; j < order.length; j += 1) {
      if (order[j].startsWith(order[i]))
        shadowed = `${order[i]} shadows ${order[j]}`;
    }
  }
  check(
    "no Mermaid arrow shadows a later candidate — longest-first holds for all ten",
    shadowed === null,
    shadowed ?? "",
  );
  check(
    "all ten Mermaid arrows are distinct",
    new Set(order).size === order.length,
    order.join(" "),
  );
}

for (const arrow of SEQUENCE_ARROWS_GRID) {
  const label = `${arrow.lineStyle}+${arrow.headStyle}`;
  const token = sequenceArrowToken(arrow);
  const mermaidArrow = mermaidSequenceArrow(arrow);

  /* ---- .alab, both directions ------------------------------------------ */
  const text = gridDoc(token);
  let parsed = null;
  let failure = null;
  try {
    parsed = parseSequenceText(text);
  } catch (error) {
    failure = String(error && error.message);
  }
  check(
    `${label}: "${token}" parses to exactly that pair`,
    parsed !== null &&
      parsed.items[0].lineStyle === arrow.lineStyle &&
      parsed.items[0].headStyle === arrow.headStyle,
    failure ?? JSON.stringify(parsed && parsed.items[0]),
  );
  check(
    `${label}: "${token}" serializes back byte-identically`,
    parsed !== null && serializeSequenceText(parsed) === text,
    parsed === null
      ? (failure ?? "")
      : firstDiff(serializeSequenceText(parsed), text),
  );

  /* ---- Mermaid, both directions ---------------------------------------- */
  const mm = `sequenceDiagram\n    participant a\n    participant b\n    a${mermaidArrow}b: m\n`;
  let mermaidFile = null;
  let mermaidFailure = null;
  try {
    mermaidFile = parseMermaidSequence(mm);
  } catch (error) {
    mermaidFailure = String(error && error.message);
  }
  check(
    `${label}: Mermaid "${mermaidArrow}" imports to exactly that pair`,
    mermaidFile !== null &&
      mermaidFile.items[0].lineStyle === arrow.lineStyle &&
      mermaidFile.items[0].headStyle === arrow.headStyle,
    mermaidFailure ?? JSON.stringify(mermaidFile && mermaidFile.items[0]),
  );
  check(
    `${label}: exporting to Mermaid writes "${mermaidArrow}" back`,
    mermaidFile !== null &&
      serializeMermaidSequence(mermaidFile).includes(`a${mermaidArrow}b:`),
    mermaidFile === null
      ? (mermaidFailure ?? "")
      : serializeMermaidSequence(mermaidFile),
  );

  /* ---- the canvas draws it -------------------------------------------- */
  const shape = SEQUENCE_HEAD_SHAPES[arrow.headStyle](
    { x: 100, y: 40, direction: 1 },
    { x: 20, y: 40, direction: -1 },
  );
  check(
    `${label}: the canvas has a head shape for it (or deliberately none)`,
    shape !== undefined &&
      Array.isArray(shape.filled) &&
      Array.isArray(shape.stroked) &&
      (arrow.headStyle === "none"
        ? shape.filled.length === 0 && shape.stroked.length === 0
        : shape.filled.length + shape.stroked.length > 0),
    JSON.stringify(shape),
  );
}

{
  /* EVERY HEAD DRAWS A DISTINCT MARK, derived from the head union rather than
     from a list of five. Two head styles that emit the same path data are two
     arrows a reader cannot tell apart, which is exactly the "half-populated
     option" `purpose.md` refuses — and it is the failure a copy-paste in the
     shape table produces. `none` is excluded because its emptiness IS its
     mark. */
  const drawn = new Map();
  let collision = null;
  for (const headStyle of SEQUENCE_HEAD_STYLES) {
    if (headStyle === "none") continue;
    const shape = SEQUENCE_HEAD_SHAPES[headStyle](
      { x: 100, y: 40, direction: 1 },
      { x: 20, y: 40, direction: -1 },
    );
    const key = JSON.stringify([shape.filled, shape.stroked]);
    if (drawn.has(key))
      collision = `${drawn.get(key)} and ${headStyle} draw the same mark`;
    drawn.set(key, headStyle);
  }
  check(
    "every head style but `none` draws a mark no other head style draws",
    collision === null,
    collision ?? "",
  );
  check(
    "the head table is total over the head union — a style with no entry would draw nothing",
    SEQUENCE_HEAD_STYLES.every(
      (headStyle) => typeof SEQUENCE_HEAD_SHAPES[headStyle] === "function",
    ),
    Object.keys(SEQUENCE_HEAD_SHAPES).join(" "),
  );
}

{
  /* AN UNKNOWN TOKEN IS REFUSED BY NAME. Forward tolerance for a grammar is
     not "half-parse the line": an older parser meeting a token from a newer
     minor must say what it found, at the column it found it, and quote the
     menu — which is what lets the reader upgrade rather than guess. `=>` is
     chosen because it is a plausible future arrow and is not a prefix of any
     token in the table, so it reaches the refusal rather than a length
     mismatch. */
  let message = null;
  let found = null;
  try {
    parseSequenceText(gridDoc("=>"));
  } catch (error) {
    message = String(error && error.message);
    found = error && error.issues && error.issues[0] && error.issues[0].found;
  }
  check(
    "an unknown arrow token is refused, naming the token it found and the whole menu",
    message !== null &&
      message.includes("expected an arrow") &&
      typeof found === "string" &&
      found.startsWith("=>") &&
      SEQUENCE_ARROWS_GRID.every((arrow) =>
        message.includes(sequenceArrowToken(arrow)),
      ),
    message === null
      ? "the parser ACCEPTED an arrow it does not know"
      : `${message} @ ${JSON.stringify(found)}`,
  );
}

{
  /* THE THREE ARROWS THAT SHIPPED, from NON-CANONICAL text. A file on
     somebody's disk cannot change because this shipped, and canonical
     fixtures cannot prove that: a serializer that reformats emits canonical
     text either way. The source below is deliberately wrong in every way the
     serializer would fix — a comment, a blank line, two spaces around the
     colon, an un-normalised indent — so anything but a faithful re-emit of the
     ARROW shows up. */
  const LEGACY = `archlab 1.0 sequence
title "Legacy"

@sequence
  web:participant "Web"
  api:participant "API"

  // Authored by hand in 2026; the arrows below must never be rewritten.
  web -> api : "call"
  api ~> web : "notify"
  api ..> web : "return"
`;
  const legacy = parseSequenceText(LEGACY);
  check(
    "a hand-authored document using the three original tokens round-trips byte-identically",
    serializeSequenceText(legacy) ===
      LEGACY.replace(
        "  // Authored by hand in 2026; the arrows below must never be rewritten.\n",
        "",
      ),
    firstDiff(serializeSequenceText(legacy), LEGACY),
  );
  check(
    "-> is still solid+arrow, ~> still solid+open, ..> still dotted+arrow",
    legacy.items[0].lineStyle === "solid" &&
      legacy.items[0].headStyle === "arrow" &&
      legacy.items[1].lineStyle === "solid" &&
      legacy.items[1].headStyle === "open" &&
      legacy.items[2].lineStyle === "dotted" &&
      legacy.items[2].headStyle === "arrow",
    JSON.stringify(legacy.items),
  );
  check(
    "and each of the three emits the token it was written as, not a synonym",
    (() => {
      const emitted = serializeSequenceText(legacy);
      return (
        emitted.includes('web -> api : "call"') &&
        emitted.includes('api ~> web : "notify"') &&
        emitted.includes('api ..> web : "return"')
      );
    })(),
    serializeSequenceText(legacy),
  );
}

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} sequence-check assertions passed.`);

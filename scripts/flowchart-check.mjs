#!/usr/bin/env node
/**
 * Flowchart document format check (`.alab` flowchart grammar). Follows the
 * pattern of `scripts/sequence-check.mjs`: loads the REAL library from
 * `src/features/archtext/**` via Node's built-in TypeScript type stripping
 * plus a resolve hook for the `@/*` alias, so this script and the app
 * exercise the exact same code.
 *
 * What it proves — and why it matters: the flowchart format makes the same
 * promise the other two `.alab` grammars make, "text and model are two faces
 * of the same document"; each clause below is one way that promise could
 * silently break.
 *
 *   1. Canonical `.alab` flowchart text → model → text is byte-identical
 *      (kitchen sink exercising every construct: all six node shapes,
 *      technology and tags, descriptions, a tinted group, labelled and
 *      unlabelled edges).
 *   2. Model → text → model is structurally identical for a hand-built
 *      model (not one the parser produced), reserved-word ids included.
 *   3. Unknown forward-compatible fields survive a round trip verbatim AND
 *      in their original key position, at file, metadata, node, edge and
 *      group scope.
 *   4. `detectAlabKind` gives the right verdict for all three headers and
 *      refuses near-misses — a wrong-but-confident answer routes text to
 *      the wrong parser, whose error would then mislead.
 *   5. Malformed inputs each fail with an error naming a line and a column
 *      that points into the source (so the offending line can be quoted),
 *      and the parse is all-or-nothing.
 *   6. The three document types never cross-parse: each parser refuses the
 *      other two kinds at their header line, by name.
 *
 * Exits non-zero on any failure. Run with: pnpm check:flowchart
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
  serializeFlowchartText,
  detectAlabKind,
  ArchTextParseError,
} = await import(
  pathToFileURL(path.join(ROOT, "src/features/archtext/index.ts")).href
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

console.log("kitchen sink (.alab flowchart, every construct)");

const KITCHEN_SINK = `archlab 1.0 flowchart
schema "https://arch-lab.dev/schema/v1/flowchart.schema.json"
title "Order Intake Flow"
description "From click to confirmation."
owner "Checkout Team"
tags #checkout #orders
created 2026-08-01T00:00:00Z
updated 2026-08-09T00:00:00Z
reviewed 2026-08-05T00:00:00Z
! meta.generator : {"name":"arch-lab","version":"0.1.0"}
! meta.x-review after updatedAt : {"cycle":30}
! x-pipeline : {"stage":"prod"}

@flowchart
  start s "Order received"
  step validate "Validate cart" [Go 1.22] #checkout
    desc "Runs the validation rules in order."
    ! x-owner after label : "payments"
  decision ok "Cart valid?"
  group "Persistence" tint=#bfdfff
    ! x-lane : "back"
    io save "Write order" [PostgreSQL 16]
    call notify "Send receipt"
      desc "Fans out to email and push."
  end done "Done"

  s -> validate
  validate -> ok
  ok -> save : "yes"
    ! x-weight after label : 3
  ok -> done : "no"
  save -> notify
  notify -> done
`;

const sink = parseFlowchartText(KITCHEN_SINK);
const sinkEmitted = serializeFlowchartText(sink);
check(
  "kitchen-sink text → model → text is byte-identical",
  sinkEmitted === KITCHEN_SINK,
  firstDiff(sinkEmitted, KITCHEN_SINK),
);
check(
  "serialization is deterministic (two serializations are identical)",
  serializeFlowchartText(parseFlowchartText(KITCHEN_SINK)) === sinkEmitted,
);
check(
  "parsing is deterministic (two parses are deep-equal)",
  JSON.stringify(parseFlowchartText(KITCHEN_SINK)) === JSON.stringify(sink),
);

check(
  "file shape: version, kind discriminant, $schema",
  sink.version === "1.0" &&
    sink.kind === "flowchart" &&
    sink.$schema === "https://arch-lab.dev/schema/v1/flowchart.schema.json",
);
check(
  "metadata: title, description, owner, tags, timestamps, reviewed",
  sink.metadata.title === "Order Intake Flow" &&
    sink.metadata.owner === "Checkout Team" &&
    JSON.stringify(sink.metadata.tags) === '["checkout","orders"]' &&
    sink.metadata.createdAt === "2026-08-01T00:00:00Z" &&
    sink.metadata.lastReviewedAt === "2026-08-05T00:00:00Z",
);
check(
  "nodes keep declaration order (order is data, never sorted)",
  JSON.stringify(sink.nodes.map((n) => n.id)) ===
    '["s","validate","ok","save","notify","done"]',
);
check(
  "every shape survives as itself",
  JSON.stringify(sink.nodes.map((n) => n.shape)) ===
    '["start","step","decision","io","call","end"]',
);
const validate = sink.nodes.find((n) => n.id === "validate");
check(
  "node technology, tags and description survive",
  validate?.technology === "Go 1.22" &&
    JSON.stringify(validate?.tags) === '["checkout"]' &&
    validate?.description === "Runs the validation rules in order.",
);
check(
  "a group is a file-level cluster: label, normalised tint, its member run",
  Array.isArray(sink.groups) &&
    sink.groups.length === 1 &&
    sink.groups[0].label === "Persistence" &&
    sink.groups[0].tint === "#bfdfff" &&
    JSON.stringify(sink.groups[0].nodes) === '["save","notify"]',
  JSON.stringify(sink.groups),
);
check(
  "a grouped node is still an ordinary member of `nodes`, in text order",
  sink.nodes[3].id === "save" &&
    sink.nodes[4].description === "Fans out to email and push.",
);
check(
  "edges keep narration order; unlabelled edges carry NO label key",
  JSON.stringify(sink.edges.map((e) => `${e.from}>${e.to}`)) ===
    '["s>validate","validate>ok","ok>save","ok>done","save>notify","notify>done"]' &&
    !("label" in sink.edges[0]),
);
check(
  "a decision's branches are its outgoing labelled edges, in edge order",
  JSON.stringify(
    sink.edges.filter((e) => e.from === "ok").map((e) => e.label),
  ) === '["yes","no"]',
);
check(
  "a colour is NORMALISED on the way in — one spelling per colour in the file",
  parseFlowchartText(
    KITCHEN_SINK.replace("tint=#bfdfff", "tint=rgb(191,223,255)"),
  ).groups[0].tint === "#bfdfff",
);

/* ----------------------------------------------------------------------- */
/* 2. Model → text → model, structurally identical (hand-built model)       */
/* ----------------------------------------------------------------------- */

console.log("model → text → model (hand-built, reserved-word ids)");

/* Built by hand in canonical key order — deliberately NOT a parser product,
   so this proves the serializer accepts models born in an editor, not just
   its own parser's output. */
const HAND_MODEL = {
  version: "1.0",
  kind: "flowchart",
  metadata: {
    title: "Hand-built",
    createdAt: "1970-01-01T00:00:00Z",
    updatedAt: "1970-01-01T00:00:00Z",
  },
  nodes: [
    { id: "a", shape: "start", label: "Start" },
    { id: "step", shape: "step", label: "Reserved Word Node" },
    { id: "b", shape: "end", label: "End" },
  ],
  edges: [
    { from: "a", to: "step" },
    { from: "step", to: "step", label: "retry" },
    { from: "step", to: "b", label: "done" },
  ],
};

{
  const text = serializeFlowchartText(HAND_MODEL);
  const reparsed = parseFlowchartText(text);
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
    serializeFlowchartText(reparsed) === text,
    firstDiff(serializeFlowchartText(reparsed), text),
  );
  check(
    "a reserved-word node id is quoted on edge lines, bare after its keyword",
    text.includes('step "step" "Reserved Word Node"') &&
      text.includes('a -> "step"') &&
      text.includes('"step" -> b : "done"'),
    text,
  );
  check(
    "a self-loop is spellable (from === to)",
    text.includes('"step" -> "step" : "retry"'),
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
  "file-level unknown survives after edges",
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
  "node unknown is anchored after label",
  JSON.stringify(validate).includes(
    '"label":"Validate cart","x-owner":"payments"',
  ),
  JSON.stringify(validate),
);
check(
  "edge unknown is anchored after label",
  JSON.stringify(sink.edges[2]).includes('"label":"yes","x-weight":3'),
  JSON.stringify(sink.edges[2]),
);
check(
  "group unknown survives (unanchored, leading)",
  JSON.stringify(sink.groups[0]).startsWith('{"x-lane":"back","label":'),
  JSON.stringify(sink.groups[0]),
);
check(
  "all five unknown scopes re-emit as ! lines",
  sinkEmitted.includes("! meta.x-review after updatedAt : ") &&
    sinkEmitted.includes("! x-pipeline : ") &&
    sinkEmitted.includes('    ! x-owner after label : "payments"') &&
    sinkEmitted.includes("    ! x-weight after label : 3") &&
    sinkEmitted.includes('    ! x-lane : "back"'),
  sinkEmitted
    .split("\n")
    .filter((l) => l.includes("!"))
    .join("\n"),
);

/* ----------------------------------------------------------------------- */
/* 4. detectAlabKind — the right verdict for every header                   */
/* ----------------------------------------------------------------------- */

console.log("document-type detection (c4 / sequence / flowchart / garbage)");

const C4_SAMPLE = `archlab 1.0
title "ShopFlow Platform"

@context ctx-root "ShopFlow Platform"
  customer:person "Customer"
  shop:system "ShopFlow Platform"

  customer -> shop : "Places an order" [HTTPS]
`;

const SEQUENCE_SAMPLE = `archlab 1.0 sequence
title "Checkout"

@sequence
  cust:actor "Customer"
  web "Web App"

  cust -> web : "Clicks buy"
`;

check(
  "detectAlabKind: flowchart → flowchart, sequence → sequence, C4 → c4",
  detectAlabKind(KITCHEN_SINK) === "flowchart" &&
    detectAlabKind(SEQUENCE_SAMPLE) === "sequence" &&
    detectAlabKind(C4_SAMPLE) === "c4",
);
check(
  "comments and blank lines before the header do not blind the sniffer",
  detectAlabKind("// comment\n\narchlab 1.0 flowchart\n") === "flowchart",
);
check(
  "near-misses and garbage detect as null, never as a confident wrong answer",
  detectAlabKind("archlab 1.0 flowcharted\n") === null &&
    detectAlabKind("archlab 1.0 flowchart extra\n") === null &&
    detectAlabKind("archlab 1.0 sequenced\n") === null &&
    detectAlabKind("{}") === null &&
    detectAlabKind("") === null,
);

/* ----------------------------------------------------------------------- */
/* 5. Malformed inputs — line, column and a quotable source line            */
/* ----------------------------------------------------------------------- */

console.log("malformed inputs (.alab flowchart)");

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

const flowError = (label, source, fragment) =>
  expectParseError(
    label,
    source,
    fragment,
    parseFlowchartText,
    ArchTextParseError,
  );

const FLOW_HEAD =
  'archlab 1.0 flowchart\ntitle "T"\n\n@flowchart\n  start a "A"\n  end b "B"\n';

flowError("empty source is refused", "", "archlab");
flowError(
  "a newer major version is refused",
  'archlab 2.0 flowchart\ntitle "T"\n\n@flowchart\n',
  "newer arch-lab",
);
flowError(
  "tab indentation is refused",
  `${FLOW_HEAD}\ta -> b\n`,
  "spaces, not tabs",
);
flowError(
  "odd indentation is refused",
  `${FLOW_HEAD}   a -> b\n`,
  "inconsistent indentation of 3 spaces",
);
flowError(
  "over-indentation (no open group) is refused",
  `${FLOW_HEAD}    a -> b\n`,
  "expected 2 here",
);
flowError(
  "a missing arrow is refused",
  `${FLOW_HEAD}  a => b\n`,
  'expected "->"',
);
flowError(
  "a node line without its shape keyword is refused, by name",
  `${FLOW_HEAD}  c "C"\n`,
  "starts with its shape keyword",
);
flowError(
  "an undeclared edge target is refused",
  `${FLOW_HEAD}  a -> ghost\n`,
  '"ghost" does not resolve to a node',
);
flowError(
  "a duplicate node id is refused",
  `${FLOW_HEAD}  step a "Again"\n`,
  'duplicate node id "a"',
);
flowError(
  "a node after the first edge is refused",
  `${FLOW_HEAD}  a -> b\n  step late "Late"\n`,
  "nodes come first",
);
flowError(
  "an edge label without its colon is refused",
  `${FLOW_HEAD}  a -> b "yes"\n`,
  '":" before the edge label',
);
flowError(
  "a missing title is refused",
  "archlab 1.0 flowchart\n\n@flowchart\n",
  "no title",
);
flowError(
  "a missing @flowchart block is refused",
  'archlab 1.0 flowchart\ntitle "T"\n',
  'no "@flowchart" block',
);
flowError(
  "a duplicate @flowchart block is refused",
  `${FLOW_HEAD}\n@flowchart\n`,
  'duplicate "@flowchart"',
);
flowError(
  "a header line after @flowchart is refused",
  `${FLOW_HEAD.replace('title "T"\n', "")}title "Late"\n`,
  'header lines must appear before "@flowchart"',
);
flowError(
  "a ! line for a field with dedicated syntax is refused",
  'archlab 1.0 flowchart\ntitle "T"\n! nodes : []\n\n@flowchart\n',
  "has dedicated syntax",
);
flowError(
  "a desc on an EDGE is refused (the label is the whole annotation)",
  `${FLOW_HEAD}  a -> b\n    desc "y"\n`,
  "edges have no description",
);
flowError(
  "a second desc on one node is refused",
  `${FLOW_HEAD}  step c "C"\n    desc "one"\n    desc "two"\n  a -> b\n`,
  'duplicate "desc" line for this node',
);
flowError(
  "a desc at ITEM indent is refused (it is a continuation)",
  `${FLOW_HEAD}  desc "y"\n`,
  "indent it 2 spaces under the node",
);
flowError(
  "a bare reserved word as an id is refused",
  `${FLOW_HEAD}  null -> b\n`,
  "reserved",
);
flowError(
  "a group inside a group is refused (groups do not nest)",
  `${FLOW_HEAD}  group "Outer"\n    group "Inner"\n`,
  "do not nest",
);
flowError(
  "an edge inside a group is refused, by name",
  `${FLOW_HEAD}  group "G"\n    a -> b\n`,
  'cannot sit inside a "group"',
);
flowError(
  "an empty group is refused",
  `${FLOW_HEAD}  group "Empty"\n  a -> b\n`,
  "holds no nodes",
);
flowError(
  "a group after the first edge is refused",
  `${FLOW_HEAD}  a -> b\n  group "Late"\n    step c "C"\n`,
  "before the first edge",
);

/* --- the location is exact, not merely present --------------------------- */
{
  let caught = null;
  try {
    parseFlowchartText(`${FLOW_HEAD}  a => b\n`);
  } catch (error) {
    caught = error;
  }
  check(
    "the error's line and column point at the offending token (line 7, column 5)",
    caught instanceof ArchTextParseError &&
      caught.line === 7 &&
      caught.column === 5,
    caught === null ? "no error thrown" : caught.message,
  );
}

/* --- all-or-nothing: a failing parse never returns a partial model --- */
{
  let threw = false;
  try {
    parseFlowchartText(`${FLOW_HEAD}  a -> b\n  a -> ghost\n`);
  } catch (error) {
    threw = error instanceof ArchTextParseError;
  }
  check("a broken parse throws and applies nothing (all-or-nothing)", threw);
}

/* ----------------------------------------------------------------------- */
/* 6. Document types never cross-parse                                      */
/* ----------------------------------------------------------------------- */

console.log("document-type separation (C4 vs sequence vs flowchart)");

flowError(
  "the flowchart parser refuses a C4 document at its header line",
  C4_SAMPLE,
  'C4 ".alab" header',
);
flowError(
  "the flowchart parser refuses a sequence document at its header line",
  SEQUENCE_SAMPLE,
  'sequence ".alab" header',
);
expectParseError(
  "the sequence parser refuses a flowchart document at its header line",
  KITCHEN_SINK,
  'flowchart ".alab" header',
  parseSequenceText,
  ArchTextParseError,
);
expectParseError(
  "the C4 parser refuses a flowchart document at its header line",
  KITCHEN_SINK,
  "unexpected text after the version",
  parseArchText,
  ArchTextParseError,
);
check(
  "the C4 sample still parses as C4 (the existing path is untouched)",
  parseArchText(C4_SAMPLE).rootDiagramId === "ctx-root",
);
check(
  "the sequence sample still parses as sequence (the existing path is untouched)",
  parseSequenceText(SEQUENCE_SAMPLE).kind === "sequence",
);

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} flowchart-check assertions passed.`);

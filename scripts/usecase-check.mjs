#!/usr/bin/env node
/**
 * Use-case document format check (`.alab` use-case grammar). Follows the
 * pattern of `scripts/flowchart-check.mjs`: loads the REAL library from
 * `src/features/archtext/**` via Node's built-in TypeScript type stripping
 * plus a resolve hook for the `@/*` alias, so this script and the app
 * exercise the exact same code.
 *
 * What it proves — and why it matters: the use-case format makes the same
 * promise the other three `.alab` grammars make, "text and model are two
 * faces of the same document"; each clause below is one way that promise
 * could silently break.
 *
 *   1. Canonical `.alab` use-case text → model → text is byte-identical
 *      (kitchen sink exercising every construct: both element kinds, all
 *      three edge kinds, a tinted boundary, technology, tags, descriptions,
 *      labelled and unlabelled associations).
 *   2. Model → text → model is structurally identical for a hand-built
 *      model (not one the parser produced), reserved-word ids included.
 *   3. Unknown forward-compatible fields survive a round trip verbatim AND
 *      in their original key position, at file, metadata, element, edge and
 *      boundary scope.
 *   4. `detectAlabKind` gives the right verdict for all FOUR headers and
 *      refuses near-misses — a wrong-but-confident answer routes text to
 *      the wrong parser, whose error would then mislead.
 *   5. Malformed inputs each fail with an error naming a line and a column
 *      that points into the source (so the offending line can be quoted),
 *      and the parse is all-or-nothing. The use-case-specific semantics —
 *      the closed stereotype vocabulary, the same-kind generalization rule,
 *      the actor–usecase association rule, and the actor-outside-the-
 *      boundary rule — each get a named refusal here, because each is a
 *      statement the diagram type exists to make and a parser that let one
 *      through would draw a lie.
 *   6. The four document types never cross-parse: each parser refuses the
 *      other three kinds at their header line, by name — twelve pairs, none
 *      of them answered with a misleading line-1 syntax error.
 *
 * Exits non-zero on any failure. Run with: pnpm check:usecase
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
  serializeUseCaseText,
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

console.log("kitchen sink (.alab usecase, every construct)");

const KITCHEN_SINK = `archlab 1.0 usecase
schema "https://arch-lab.dev/schema/v1/usecase.schema.json"
title "Food Delivery"
description "Who can do what, and where the system's edge is."
owner "Platform Team"
tags #delivery #scope
created 2026-08-01T00:00:00Z
updated 2026-08-09T00:00:00Z
reviewed 2026-08-05T00:00:00Z
! meta.generator : {"name":"arch-lab","version":"0.1.0"}
! meta.x-review after updatedAt : {"cycle":30}
! x-pipeline : {"stage":"prod"}

@usecase
  actor customer "Customer"
    desc "Orders food from nearby restaurants."
    ! x-persona after label : "guest"
  actor admin "Administrator" [internal] #ops
  boundary "Food Delivery Service" tint=#bfdfff
    ! x-lane : "core"
    usecase search "Search restaurants"
      desc "Browse and filter by cuisine, distance and rating."
    usecase order "Place an order" #checkout
    usecase pay "Take payment" [Stripe]
    usecase refund "Issue a refund"

  customer -- search
  customer -- order : "1..*"
    ! x-weight after label : 3
  admin -- refund
  order ..> pay : include
  refund ..> pay : extend
  admin --|> customer
`;

const sink = parseUseCaseText(KITCHEN_SINK);
const sinkEmitted = serializeUseCaseText(sink);
check(
  "kitchen-sink text → model → text is byte-identical",
  sinkEmitted === KITCHEN_SINK,
  firstDiff(sinkEmitted, KITCHEN_SINK),
);
check(
  "serialization is deterministic (two serializations are identical)",
  serializeUseCaseText(parseUseCaseText(KITCHEN_SINK)) === sinkEmitted,
);
check(
  "parsing is deterministic (two parses are deep-equal)",
  JSON.stringify(parseUseCaseText(KITCHEN_SINK)) === JSON.stringify(sink),
);

check(
  "file shape: version, kind discriminant, $schema",
  sink.version === "1.0" &&
    sink.kind === "usecase" &&
    sink.$schema === "https://arch-lab.dev/schema/v1/usecase.schema.json",
);
check(
  "metadata: title, description, owner, tags, timestamps, reviewed",
  sink.metadata.title === "Food Delivery" &&
    sink.metadata.owner === "Platform Team" &&
    JSON.stringify(sink.metadata.tags) === '["delivery","scope"]' &&
    sink.metadata.createdAt === "2026-08-01T00:00:00Z" &&
    sink.metadata.lastReviewedAt === "2026-08-05T00:00:00Z",
);
check(
  "elements keep declaration order, actors and use cases interleaved as written",
  JSON.stringify(sink.elements.map((e) => e.id)) ===
    '["customer","admin","search","order","pay","refund"]',
);
check(
  "both element kinds survive as themselves",
  JSON.stringify(sink.elements.map((e) => e.kind)) ===
    '["actor","actor","usecase","usecase","usecase","usecase"]',
);
const admin = sink.elements.find((e) => e.id === "admin");
const customer = sink.elements.find((e) => e.id === "customer");
check(
  "element technology, tags and description survive",
  admin?.technology === "internal" &&
    JSON.stringify(admin?.tags) === '["ops"]' &&
    customer?.description === "Orders food from nearby restaurants.",
);
check(
  "a boundary is a file-level box: label, normalised tint, its member run",
  Array.isArray(sink.boundaries) &&
    sink.boundaries.length === 1 &&
    sink.boundaries[0].label === "Food Delivery Service" &&
    sink.boundaries[0].tint === "#bfdfff" &&
    JSON.stringify(sink.boundaries[0].usecases) ===
      '["search","order","pay","refund"]',
  JSON.stringify(sink.boundaries),
);
check(
  "a bounded use case is still an ordinary member of `elements`, in text order",
  sink.elements[2].id === "search" &&
    sink.elements[2].description ===
      "Browse and filter by cuisine, distance and rating.",
);
check(
  "edges keep narration order with all three kinds interleaved as written",
  JSON.stringify(sink.edges.map((e) => e.kind)) ===
    '["association","association","association","dependency","dependency","generalization"]',
);
check(
  "an unlabelled association carries NO label key (absence survives as absence)",
  !("label" in sink.edges[0]) && sink.edges[1].label === "1..*",
);
check(
  "both stereotypes survive as themselves; a generalization carries neither tail",
  sink.edges[3].stereotype === "include" &&
    sink.edges[4].stereotype === "extend" &&
    !("stereotype" in sink.edges[5]) &&
    !("label" in sink.edges[5]),
);
check(
  "a colour is NORMALISED on the way in — one spelling per colour in the file",
  parseUseCaseText(
    KITCHEN_SINK.replace("tint=#bfdfff", "tint=rgb(191,223,255)"),
  ).boundaries[0].tint === "#bfdfff",
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
  kind: "usecase",
  metadata: {
    title: "Hand-built",
    createdAt: "1970-01-01T00:00:00Z",
    updatedAt: "1970-01-01T00:00:00Z",
  },
  elements: [
    { id: "guest", kind: "actor", label: "Guest" },
    { id: "actor", kind: "actor", label: "Reserved Word Actor" },
    { id: "browse", kind: "usecase", label: "Browse" },
    { id: "buy", kind: "usecase", label: "Buy" },
  ],
  edges: [
    { kind: "association", from: "guest", to: "browse" },
    { kind: "association", from: "actor", to: "buy", label: "0..1" },
    { kind: "dependency", from: "buy", to: "browse", stereotype: "include" },
    { kind: "generalization", from: "actor", to: "guest" },
  ],
};

{
  const text = serializeUseCaseText(HAND_MODEL);
  const reparsed = parseUseCaseText(text);
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
    serializeUseCaseText(reparsed) === text,
    firstDiff(serializeUseCaseText(reparsed), text),
  );
  check(
    "a reserved-word element id is quoted on edge lines, bare after its keyword",
    text.includes('actor "actor" "Reserved Word Actor"') &&
      text.includes('"actor" -- buy : "0..1"') &&
      text.includes('"actor" --|> guest'),
    text,
  );
  check(
    "the default sentinel timestamps produce no created/updated lines",
    !text.includes("created ") && !text.includes("updated "),
    text,
  );
}

/* The serializer refuses, never silently drops, a field its edge kind cannot
   spell — dropping would break the round trip, writing would produce text
   the parser rejects. */
{
  const withBadLabel = JSON.parse(JSON.stringify(HAND_MODEL));
  withBadLabel.edges[3].label = "sneaky";
  let threw = false;
  try {
    serializeUseCaseText(withBadLabel);
  } catch {
    threw = true;
  }
  check("a label on a generalization is refused by the serializer", threw);
}
{
  const withActorInside = JSON.parse(JSON.stringify(HAND_MODEL));
  withActorInside.boundaries = [{ label: "Box", usecases: ["actor"] }];
  let threw = false;
  try {
    serializeUseCaseText(withActorInside);
  } catch {
    threw = true;
  }
  check(
    "a boundary claiming an actor is refused by the serializer (unspellable text)",
    threw,
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
  "element unknown is anchored after label",
  JSON.stringify(customer).includes('"label":"Customer","x-persona":"guest"'),
  JSON.stringify(customer),
);
check(
  "edge unknown is anchored after label",
  JSON.stringify(sink.edges[1]).includes('"label":"1..*","x-weight":3'),
  JSON.stringify(sink.edges[1]),
);
check(
  "boundary unknown survives (unanchored, leading)",
  JSON.stringify(sink.boundaries[0]).startsWith('{"x-lane":"core","label":'),
  JSON.stringify(sink.boundaries[0]),
);
check(
  "all five unknown scopes re-emit as ! lines",
  sinkEmitted.includes("! meta.x-review after updatedAt : ") &&
    sinkEmitted.includes("! x-pipeline : ") &&
    sinkEmitted.includes('    ! x-persona after label : "guest"') &&
    sinkEmitted.includes("    ! x-weight after label : 3") &&
    sinkEmitted.includes('    ! x-lane : "core"'),
  sinkEmitted
    .split("\n")
    .filter((l) => l.includes("!"))
    .join("\n"),
);

/* ----------------------------------------------------------------------- */
/* 4. detectAlabKind — the right verdict for every header                   */
/* ----------------------------------------------------------------------- */

console.log("document-type detection (c4 / sequence / flowchart / usecase)");

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

const FLOWCHART_SAMPLE = `archlab 1.0 flowchart
title "Order intake"

@flowchart
  start s "Order received"
  end done "Done"

  s -> done
`;

check(
  "detectAlabKind: all four headers get their own verdict",
  detectAlabKind(KITCHEN_SINK) === "usecase" &&
    detectAlabKind(FLOWCHART_SAMPLE) === "flowchart" &&
    detectAlabKind(SEQUENCE_SAMPLE) === "sequence" &&
    detectAlabKind(C4_SAMPLE) === "c4",
);
check(
  "comments and blank lines before the header do not blind the sniffer",
  detectAlabKind("// comment\n\narchlab 1.0 usecase\n") === "usecase",
);
check(
  "near-misses and garbage detect as null, never as a confident wrong answer",
  detectAlabKind("archlab 1.0 usecases\n") === null &&
    detectAlabKind("archlab 1.0 usecase extra\n") === null &&
    detectAlabKind("archlab 1.0 usecased\n") === null &&
    detectAlabKind("{}") === null &&
    detectAlabKind("") === null,
);

/* ----------------------------------------------------------------------- */
/* 5. Malformed inputs — line, column and a quotable source line            */
/* ----------------------------------------------------------------------- */

console.log("malformed inputs (.alab usecase)");

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

const usecaseError = (label, source, fragment) =>
  expectParseError(
    label,
    source,
    fragment,
    parseUseCaseText,
    ArchTextParseError,
  );

/* A minimal valid prefix: one actor, two use cases, ready for one appended
   bad line per test. */
const USE_HEAD =
  'archlab 1.0 usecase\ntitle "T"\n\n@usecase\n  actor a "A"\n  usecase b "B"\n  usecase c "C"\n';

usecaseError("empty source is refused", "", "archlab");
usecaseError(
  "a newer major version is refused",
  'archlab 2.0 usecase\ntitle "T"\n\n@usecase\n',
  "newer arch-lab",
);
usecaseError(
  "tab indentation is refused",
  `${USE_HEAD}\ta -- b\n`,
  "spaces, not tabs",
);
usecaseError(
  "odd indentation is refused",
  `${USE_HEAD}   a -- b\n`,
  "inconsistent indentation of 3 spaces",
);
usecaseError(
  "over-indentation (no open boundary) is refused",
  `${USE_HEAD}    a -- b\n`,
  "expected 2 here",
);
usecaseError(
  "an unknown edge token is refused, naming all three real ones",
  `${USE_HEAD}  a -> b\n`,
  '"--|>", "..>" or "--"',
);
usecaseError(
  "an element line without its kind keyword is refused, by name",
  `${USE_HEAD}  d "D"\n`,
  "starts with its kind keyword",
);
usecaseError(
  "an undeclared edge target is refused",
  `${USE_HEAD}  a -- ghost\n`,
  '"ghost" does not resolve to an element',
);
usecaseError(
  "a duplicate element id is refused",
  `${USE_HEAD}  usecase a "Again"\n`,
  'duplicate element id "a"',
);
usecaseError(
  "an element after the first edge is refused",
  `${USE_HEAD}  a -- b\n  usecase late "Late"\n`,
  "elements come first",
);
usecaseError(
  "an association label without its colon is refused",
  `${USE_HEAD}  a -- b "1..*"\n`,
  '":" before the association label',
);
usecaseError(
  "a missing title is refused",
  "archlab 1.0 usecase\n\n@usecase\n",
  "no title",
);
usecaseError(
  "a missing @usecase block is refused",
  'archlab 1.0 usecase\ntitle "T"\n',
  'no "@usecase" block',
);
usecaseError(
  "a duplicate @usecase block is refused",
  `${USE_HEAD}\n@usecase\n`,
  'duplicate "@usecase"',
);
usecaseError(
  "a header line after @usecase is refused",
  `${USE_HEAD.replace('title "T"\n', "")}title "Late"\n`,
  'header lines must appear before "@usecase"',
);
usecaseError(
  "a ! line for a field with dedicated syntax is refused",
  'archlab 1.0 usecase\ntitle "T"\n! elements : []\n\n@usecase\n',
  "has dedicated syntax",
);
usecaseError(
  "a desc on an EDGE is refused (detail belongs on the elements)",
  `${USE_HEAD}  a -- b\n    desc "y"\n`,
  "edges have no description",
);
usecaseError(
  "a second desc on one element is refused",
  `${USE_HEAD}  usecase d "D"\n    desc "one"\n    desc "two"\n  a -- b\n`,
  'duplicate "desc" line for this element',
);
usecaseError(
  "a desc at ITEM indent is refused (it is a continuation)",
  `${USE_HEAD}  desc "y"\n`,
  "indent it 2 spaces under the element",
);
usecaseError(
  "a bare reserved word as an id is refused",
  `${USE_HEAD}  null -- b\n`,
  "reserved",
);

/* --- the use-case-specific semantics, each a statement the diagram type
   exists to make (see the type essay in src/types/usecase.ts) ------------- */

usecaseError(
  "a THIRD stereotype word is refused, naming both valid ones (closed vocabulary)",
  `${USE_HEAD}  b ..> c : uses\n`,
  'the vocabulary is closed: "include" or "extend"',
);
usecaseError(
  "a bare dependency with no stereotype tail is refused (the arrow alone is ambiguous)",
  `${USE_HEAD}  b ..> c\n`,
  '"include" or "extend"',
);
usecaseError(
  "a quoted string where the bare stereotype belongs is refused",
  `${USE_HEAD}  b ..> c : "include"\n`,
  "a bare stereotype word",
);
usecaseError(
  "an include/extend whose endpoint is an ACTOR is refused (only use cases include behaviour)",
  `${USE_HEAD}  a ..> b : include\n`,
  '"a" is an actor',
);
usecaseError(
  "a mixed-kind generalization is refused, saying the kinds must match",
  `${USE_HEAD}  a --|> b\n`,
  "two elements of the same kind",
);
usecaseError(
  "a generalization with a tail is refused (the triangle is the whole statement)",
  `${USE_HEAD}  a --|> a2 : "x"\n  actor a2 "A2"\n`,
  "carries no tail",
);
usecaseError(
  "an actor–actor association is refused, pointing at generalization",
  `${USE_HEAD}  actor a2 "A2"\n  a -- a2\n`,
  "cannot join two actors",
);
usecaseError(
  "a usecase–usecase association is refused, pointing at ..> and --|>",
  `${USE_HEAD}  b -- c\n`,
  "cannot join two use cases",
);
usecaseError(
  "an ACTOR declared inside a boundary is refused — the boundary IS the system's edge",
  'archlab 1.0 usecase\ntitle "T"\n\n@usecase\n  boundary "Box"\n    actor a "A"\n',
  "outside the system's edge by definition",
);
usecaseError(
  "a nested boundary is refused (boundaries do not nest)",
  'archlab 1.0 usecase\ntitle "T"\n\n@usecase\n  boundary "Outer"\n    boundary "Inner"\n',
  "do not nest",
);
usecaseError(
  "an edge inside a boundary is refused, by name",
  `${USE_HEAD}  boundary "Box"\n    a -- b\n`,
  'cannot sit inside a "boundary"',
);
usecaseError(
  "an empty boundary is refused",
  `${USE_HEAD}  boundary "Empty"\n  a -- b\n`,
  "holds no use cases",
);
usecaseError(
  "a boundary after the first edge is refused",
  `${USE_HEAD}  a -- b\n  boundary "Late"\n    usecase d "D"\n`,
  "before the first edge",
);
usecaseError(
  "a raw ! label on a dependency is refused (only an association carries one)",
  `${USE_HEAD}  b ..> c : include\n    ! label : "x"\n`,
  "only an association",
);

/* --- the location is exact, not merely present --------------------------- */
{
  /* Line 8 is the appended edge line; "ghost" starts at column 8
     ("  a -- ghost"). Pinning the exact coordinates catches an error that
     names a line/column but points at the line start instead of the token —
     which would put the UI's caret under the wrong character. */
  let caught = null;
  try {
    parseUseCaseText(`${USE_HEAD}  a -- ghost\n`);
  } catch (error) {
    caught = error;
  }
  check(
    "an unknown endpoint fails at the id's own column (line 8, column 8)",
    caught instanceof ArchTextParseError &&
      caught.line === 8 &&
      caught.column === 8,
    caught === null ? "no error thrown" : caught.message,
  );
}
{
  /* The bad stereotype word starts at column 13 ("  b ..> c : uses"). */
  let caught = null;
  try {
    parseUseCaseText(`${USE_HEAD}  b ..> c : uses\n`);
  } catch (error) {
    caught = error;
  }
  check(
    "a bad stereotype fails at the word's own column (line 8, column 13)",
    caught instanceof ArchTextParseError &&
      caught.line === 8 &&
      caught.column === 13,
    caught === null ? "no error thrown" : caught.message,
  );
}

/* --- all-or-nothing: a failing parse never returns a partial model --- */
{
  let threw = false;
  try {
    parseUseCaseText(`${USE_HEAD}  a -- b\n  a -- ghost\n`);
  } catch (error) {
    threw = error instanceof ArchTextParseError;
  }
  check("a broken parse throws and applies nothing (all-or-nothing)", threw);
}

/* ----------------------------------------------------------------------- */
/* 6. Document types never cross-parse — four ways, twelve pairs            */
/* ----------------------------------------------------------------------- */

console.log("document-type separation (C4 / sequence / flowchart / usecase)");

/* Every refusal must NAME the kind it recognised (or, for the C4 parser,
   refuse at the exact spot the extra word starts) — a misleading line-1
   syntax error would send the author debugging syntax that is fine. */
usecaseError(
  "the use-case parser refuses a C4 document at its header line",
  C4_SAMPLE,
  'C4 ".alab" header',
);
usecaseError(
  "the use-case parser refuses a sequence document at its header line",
  SEQUENCE_SAMPLE,
  'sequence ".alab" header',
);
usecaseError(
  "the use-case parser refuses a flowchart document at its header line",
  FLOWCHART_SAMPLE,
  'flowchart ".alab" header',
);
expectParseError(
  "the sequence parser refuses a use-case document at its header line",
  KITCHEN_SINK,
  'use-case ".alab" header',
  parseSequenceText,
  ArchTextParseError,
);
expectParseError(
  "the flowchart parser refuses a use-case document at its header line",
  KITCHEN_SINK,
  'use-case ".alab" header',
  parseFlowchartText,
  ArchTextParseError,
);
expectParseError(
  "the C4 parser refuses a use-case document at its header line",
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
check(
  "the flowchart sample still parses as flowchart (the existing path is untouched)",
  parseFlowchartText(FLOWCHART_SAMPLE).kind === "flowchart",
);

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} usecase-check assertions passed.`);

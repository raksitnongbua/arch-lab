#!/usr/bin/env node
/**
 * arch-lab text format (`.alab`) ⇄ JSON check. Follows the pattern of
 * `scripts/roundtrip-check.mjs` and `scripts/mermaid-check.mjs`: loads the
 * REAL library from `src/features/archtext/**` (and the editor's real
 * deserializer/serializer/validator) via Node's built-in TypeScript type
 * stripping plus a resolve hook for the `@/*` alias, so this script and the
 * app exercise the exact same code.
 *
 * What it proves:
 *   1. Text → model → text is byte-identical for the canonical form of the
 *      user's reference sample, and for a hand-written kitchen-sink text
 *      exercising every field in the model (geometry, viewport, realizes,
 *      externalRef, childRef, tags, tagColors, pinned, waypoints,
 *      iconSource, explicit solid style, none direction, unknown fields).
 *   2. JSON → text → JSON is byte-identical for BOTH committed example
 *      models (shopflow + order-shop), through the editor's real
 *      `deserialize.ts` and `serialize.ts`.
 *   3. Unknown forward-compatible fields survive a full JSON → text → JSON
 *      round trip verbatim and in position.
 *   4. Every emitted model passes the editor's `validateArchLabFile`
 *      unchanged, and every node type is legal at its diagram's level.
 *   5. A set of malformed inputs each fail with an ArchTextParseError
 *      naming a line and column (and the parse is all-or-nothing).
 *   6. `parseArchTextWithSpans` locates every node and edge in the SOURCE, and
 *      `canonicalNodeLine` agrees with the whole-file serialiser line for line.
 *      The editable canvas patches a single line of the author's text using
 *      exactly these two facts (`playground/input/canvas-edit.ts`); if a span
 *      were off by one, or if the single-node emitter reached a different
 *      verdict about a geometry token than a full serialise, a drag would
 *      corrupt the file rather than edit it. Both are asserted against the
 *      TEXT rather than against expected numbers, so they still hold for a
 *      fixture nobody updated.
 *
 * Exits non-zero on any failure. Run with: pnpm check:archtext
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

const {
  parseArchText,
  parseArchTextWithSpans,
  serializeArchText,
  spanKey,
  canonicalNodeLine,
  ArchTextParseError,
} = await import(
  pathToFileURL(path.join(ROOT, "src/features/archtext/index.ts")).href
);
const { deserializeModel } = await import(
  pathToFileURL(path.join(ROOT, "src/features/editor/io/deserialize.ts")).href
);
const { serializeModel } = await import(
  pathToFileURL(path.join(ROOT, "src/features/editor/io/serialize.ts")).href
);
const { validateArchLabFile } = await import(
  pathToFileURL(path.join(ROOT, "src/features/editor/io/validate.ts")).href
);
const { isNodeTypeValidAtLevel } = await import(
  pathToFileURL(path.join(ROOT, "src/types/index.ts")).href
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

function checkValid(label, file) {
  try {
    validateArchLabFile(JSON.parse(JSON.stringify(file)));
    const legal = file.diagrams.every((d) =>
      d.nodes.every((n) => isNodeTypeValidAtLevel(n.type, d.level)),
    );
    check(label, legal, "a node type is illegal at its diagram's level");
  } catch (error) {
    fail(label, String(error));
  }
}

/** Rebuilds an ArchLabFile from the editor's EditorModel, key order intact. */
function fileFromModel(model) {
  const file = {};
  if (typeof model.unknownFields.$schema === "string") {
    file.$schema = model.unknownFields.$schema;
  }
  file.version = model.version;
  file.metadata = model.metadata;
  file.rootDiagramId = model.rootDiagramId;
  file.diagrams = Object.values(model.diagrams);
  for (const [key, value] of Object.entries(model.unknownFields)) {
    if (key !== "$schema") file[key] = value;
  }
  return file;
}

/* ----------------------------------------------------------------------- */
/* 1. The user's reference sample                                           */
/* ----------------------------------------------------------------------- */

console.log("the user's reference sample");

const USER_SAMPLE = `archlab 1.0
title "ShopFlow Platform"

@context ctx-root "ShopFlow Platform"
  customer:person "Customer" #shopper
  shop:system "ShopFlow Platform" @nextjs >cnt-shop
  stripe:external "Stripe"

  customer -> shop : "Places an order" [HTTPS]
  shop <-> stripe : "Authorises payment" [HTTPS/JSON]

@container cnt-shop owner=shop
  web:container "Web App" @nextjs
  db:database "Orders DB" @postgresql
  web -> db : "Reads and writes" [SQL/TCP]
`;

/* Canonical form = the user's sample plus the one blank line the canonical
   layout always puts between a diagram's node block and edge block. */
const CANONICAL_SAMPLE = USER_SAMPLE.replace(
  '  db:database "Orders DB" @postgresql\n  web -> db',
  '  db:database "Orders DB" @postgresql\n\n  web -> db',
);

const sampleFile = parseArchText(USER_SAMPLE);
check(
  "the sample parses into 2 diagrams with rootDiagramId inferred",
  sampleFile.diagrams.length === 2 && sampleFile.rootDiagramId === "ctx-root",
  JSON.stringify({ root: sampleFile.rootDiagramId }),
);
const sampleCtx = sampleFile.diagrams.find((d) => d.id === "ctx-root");
const sampleCnt = sampleFile.diagrams.find((d) => d.id === "cnt-shop");
check(
  "metadata gets the title and the fixed default timestamps",
  sampleFile.metadata.title === "ShopFlow Platform" &&
    sampleFile.metadata.createdAt === "1970-01-01T00:00:00Z" &&
    sampleFile.metadata.updatedAt === "1970-01-01T00:00:00Z",
);
check(
  "the container diagram infers title, owner and parent from owner=shop",
  sampleCnt?.title === "ShopFlow Platform" &&
    sampleCnt?.ownerNodeId === "shop" &&
    sampleCnt?.parentDiagramId === "ctx-root" &&
    sampleCtx?.parentDiagramId === null,
);
const shopNode = sampleCtx?.nodes.find((n) => n.id === "shop");
check(
  "node sugar maps: type keyword, icon, tag, drill-down",
  shopNode?.type === "softwareSystem" &&
    shopNode?.icon === "nextjs" &&
    shopNode?.childDiagramId === "cnt-shop" &&
    sampleCtx?.nodes.find((n) => n.id === "customer")?.tags?.[0] === "shopper",
);
check(
  "omitted geometry gets the deterministic grid defaults",
  sampleCtx?.nodes.every(
    (n) => Number.isFinite(n.position.x) && Number.isFinite(n.size.width),
  ) &&
    JSON.stringify(
      sampleCtx?.nodes.find((n) => n.id === "customer")?.position,
    ) === '{"x":40,"y":40}' &&
    JSON.stringify(sampleCtx?.nodes.find((n) => n.id === "customer")?.size) ===
      '{"width":160,"height":96}',
);
const sampleEdge = sampleCtx?.edges.find((e) => e.id === "e-customer-shop");
check(
  "edges get conventional ids, labels, technology and direction",
  sampleEdge?.label === "Places an order" &&
    sampleEdge?.technology === "HTTPS" &&
    sampleEdge?.direction === "forward" &&
    sampleCtx?.edges.find((e) => e.id === "e-shop-stripe")?.direction ===
      "bidirectional",
);
checkValid(
  "the sample model passes validate.ts and per-level node types",
  sampleFile,
);

const sampleEmitted = serializeArchText(sampleFile);
check(
  "serialize(parse(sample)) equals the canonical sample byte-for-byte",
  sampleEmitted === CANONICAL_SAMPLE,
  firstDiff(sampleEmitted, CANONICAL_SAMPLE),
);
check(
  "canonical text → model → text is byte-identical",
  serializeArchText(parseArchText(CANONICAL_SAMPLE)) === CANONICAL_SAMPLE,
  firstDiff(
    serializeArchText(parseArchText(CANONICAL_SAMPLE)),
    CANONICAL_SAMPLE,
  ),
);
check(
  "the user's sample and its canonical form parse to the same model",
  JSON.stringify(parseArchText(CANONICAL_SAMPLE)) ===
    JSON.stringify(sampleFile),
);
check(
  "parsing is deterministic (two parses are deep-equal)",
  JSON.stringify(parseArchText(USER_SAMPLE)) === JSON.stringify(sampleFile),
);

/* ----------------------------------------------------------------------- */
/* 2. Kitchen sink — every field, byte-identical round trip                 */
/* ----------------------------------------------------------------------- */

console.log("kitchen sink (every model field)");

const KITCHEN_SINK = `archlab 1.0
schema "https://arch-lab.dev/schema/v1/diagram.schema.json"
title "Kitchen Sink"
description "Exercises every field of the model."
owner "Platform Team"
tags #demo #everything
created 2026-01-01T00:00:00Z
updated 2026-07-27T00:00:00Z
reviewed 2026-07-20T00:00:00Z
tagcolor payments "#e11d48"
tagcolor "weird tag" "#0ea5e9"
customicon warehouse "Warehouse" "<svg viewBox=\\"0 0 24 24\\"/>"
! meta.customIcons.warehouse.x-license after svg : "MIT"
generator "arch-lab" "0.1.0"
! meta.generator.x-build after version : 42
! meta.x-review after updatedAt : {"cycle":30}
root d-ctx-a
! x-pipeline : {"stage":"prod"}

@context d-ctx-a "Kitchen Context"
  desc "Root context."
  view 0.75 -120 64
  ! viewport.x-locked after zoom : true
  ! x-diagram-flag : true
  alice:person "Alice" @person! #vip (48,48 160x96)
    desc "Says \\"hello\\" on line one.\\nLine two."
    ! x-node-meta after name : [1,2]
    ! position.x-anchor after y : "se"
  ext-b:external "Billing SaaS" >>"./billing.archlab.json"
  sys-a:system "Kitchen System" @service~ [Go 1.22 / chi] #core #vip >d-cnt-a pin (320,48 480x128)

  alice -> sys-a : "Uses" [HTTPS]
  sys-a <..> ext-b : "Bills via" ["OAuth2 [m2m]"] #payments id=e-billing
    ! x-edge-meta after label : true

@context d-ctx-b "Secondary Context"
  solo:person "Solo"

@container d-cnt-a owner=sys-a
  frame internal "Internal"
  frame loose "Explicitly Top Level" in=null
  frame storage "Data Layer" in=internal
  db-a:database "Kitchen DB" @postgresql [PostgreSQL 16] >null in=storage pin=false (48,320 176x88)
  q-a:queue "Kitchen Bus" in=internal (288,320 176x88)
  web-a:container "Kitchen Web" ^d-ctx-a/alice in=loose (528,320 176x88)
  alice-ref:person ^d-ctx-a/alice (768,320 176x88)

  db-a .. q-a
  q-a -- web-a : "Peers with"
  web-a -> db-a : "Writes" [SQL/TCP] ~e-alice-sys-a style=solid via (600,400) (560,480)
    ! waypoints.0.x-kind after y : "bend"
`;

const sink = parseArchText(KITCHEN_SINK);
const sinkEmitted = serializeArchText(sink);
check(
  "kitchen-sink text → model → text is byte-identical",
  sinkEmitted === KITCHEN_SINK,
  firstDiff(sinkEmitted, KITCHEN_SINK),
);
checkValid(
  "the kitchen-sink model passes validate.ts and per-level node types",
  sink,
);
check(
  "serialization is deterministic (two serializations are identical)",
  serializeArchText(parseArchText(KITCHEN_SINK)) === sinkEmitted,
);

const ctxA = sink.diagrams.find((d) => d.id === "d-ctx-a");
const cntA = sink.diagrams.find((d) => d.id === "d-cnt-a");
const alice = ctxA?.nodes.find((n) => n.id === "alice");
const sysA = ctxA?.nodes.find((n) => n.id === "sys-a");
const extB = ctxA?.nodes.find((n) => n.id === "ext-b");
const dbA = cntA?.nodes.find((n) => n.id === "db-a");
const webA = cntA?.nodes.find((n) => n.id === "web-a");
const writes = cntA?.edges.find((e) => e.id === "e-web-a-db-a");
const billing = ctxA?.edges.find((e) => e.id === "e-billing");

check(
  "metadata: description, owner, tags, timestamps, lastReviewedAt",
  sink.metadata.description === "Exercises every field of the model." &&
    sink.metadata.owner === "Platform Team" &&
    JSON.stringify(sink.metadata.tags) === '["demo","everything"]' &&
    sink.metadata.createdAt === "2026-01-01T00:00:00Z" &&
    sink.metadata.lastReviewedAt === "2026-07-20T00:00:00Z",
);
check(
  "tagColors survive with insertion order and quoted keys",
  JSON.stringify(sink.metadata.tagColors) ===
    '{"payments":"#e11d48","weird tag":"#0ea5e9"}',
);
check(
  "customIcons survive (name, svg with escaped quotes, unknown key in position)",
  JSON.stringify(sink.metadata.customIcons) ===
    '{"warehouse":{"name":"Warehouse","svg":"<svg viewBox=\\"0 0 24 24\\"/>","x-license":"MIT"}}',
);
check(
  "generator + its unknown field survive",
  JSON.stringify(sink.metadata.generator) ===
    '{"name":"arch-lab","version":"0.1.0","x-build":42}',
);
check(
  "$schema, explicit root and top-level unknown field survive",
  sink.$schema === "https://arch-lab.dev/schema/v1/diagram.schema.json" &&
    sink.rootDiagramId === "d-ctx-a" &&
    JSON.stringify(sink["x-pipeline"]) === '{"stage":"prod"}',
);
check(
  "viewport survives with its unknown key anchored after zoom",
  JSON.stringify(ctxA?.viewport) ===
    '{"zoom":0.75,"x-locked":true,"x":-120,"y":64}',
);
check(
  "diagram description and unknown field survive",
  ctxA?.description === "Root context." && ctxA?.["x-diagram-flag"] === true,
);
check(
  "explicit positions and sizes survive exactly",
  alice?.position.x === 48 &&
    alice?.position.y === 48 &&
    JSON.stringify(sysA?.position) === '{"x":320,"y":48}' &&
    JSON.stringify(sysA?.size) === '{"width":480,"height":128}' &&
    JSON.stringify(dbA?.position) === '{"x":48,"y":320}',
  JSON.stringify({ alice: alice?.position, sysA: sysA?.size }),
);
check(
  "omitted geometry gets the layered default (alice → sys-a → ext-b puts ext-b on row 2)",
  JSON.stringify(extB?.position) === '{"x":40,"y":472}' &&
    JSON.stringify(extB?.size) === '{"width":176,"height":88}',
);
check(
  "node description with escapes and newline survives",
  alice?.description === 'Says "hello" on line one.\nLine two.',
);
check(
  "iconSource explicit (!) and inferred (~) both survive",
  alice?.icon === "person" &&
    alice?.iconSource === "explicit" &&
    sysA?.icon === "service" &&
    sysA?.iconSource === "inferred",
);
check(
  "childDiagramId, explicit >null and childRef all survive",
  sysA?.childDiagramId === "d-cnt-a" &&
    dbA?.childDiagramId === null &&
    extB?.childRef === "./billing.archlab.json",
);
check(
  "externalRef placeholder survives",
  JSON.stringify(webA?.externalRef) ===
    '{"diagramId":"d-ctx-a","nodeId":"alice"}',
);
check(
  "pinned true and pinned false both survive",
  sysA?.pinned === true && dbA?.pinned === false,
);
check(
  "node unknown field survives anchored after name",
  JSON.stringify(alice).includes('"name":"Alice","x-node-meta":[1,2]'),
  JSON.stringify(alice),
);
check(
  "position unknown key is anchored after y",
  JSON.stringify(alice?.position) === '{"x":48,"y":48,"x-anchor":"se"}',
  JSON.stringify(alice?.position),
);
check(
  "edge: quoted technology containing ']' and explicit id survive",
  billing?.technology === "OAuth2 [m2m]" &&
    billing?.direction === "bidirectional" &&
    billing?.style === "dashed" &&
    JSON.stringify(billing?.tags) === '["payments"]',
);
check(
  "edge unknown field is anchored after label",
  JSON.stringify(billing).includes('"label":"Bills via","x-edge-meta":true'),
  JSON.stringify(billing),
);
check(
  "none direction: dashed (..) and solid (--) both survive",
  cntA?.edges.find((e) => e.id === "e-db-a-q-a")?.direction === "none" &&
    cntA?.edges.find((e) => e.id === "e-db-a-q-a")?.style === "dashed" &&
    cntA?.edges.find((e) => e.id === "e-q-a-web-a")?.direction === "none" &&
    cntA?.edges.find((e) => e.id === "e-q-a-web-a")?.style === undefined,
);
check(
  "realizes chain, explicit solid style and waypoints survive",
  writes?.realizes === "e-alice-sys-a" &&
    writes?.style === "solid" &&
    JSON.stringify(writes?.waypoints) ===
      '[{"x":600,"y":400,"x-kind":"bend"},{"x":560,"y":480}]',
  JSON.stringify(writes),
);
check(
  "the container diagram title/parent are inferred from owner=sys-a",
  cntA?.title === "Kitchen System" &&
    cntA?.ownerNodeId === "sys-a" &&
    cntA?.parentDiagramId === "d-ctx-a",
);

/* ----------------------------------------------------------------------- */
/* 3. Headline: JSON → text → JSON byte-identical for BOTH fixtures         */
/* ----------------------------------------------------------------------- */

console.log("JSON → text → JSON (both committed example models)");

for (const name of ["shopflow", "order-shop"]) {
  const raw = readFileSync(
    path.join(ROOT, `src/features/viewer/service/data/${name}.archlab.json`),
    "utf8",
  );
  const model = deserializeModel(raw);
  const canonical = serializeModel(model);
  check(
    `${name}: the committed JSON is already canonical (deserialize → serialize is identity)`,
    canonical === raw,
    firstDiff(canonical, raw),
  );
  const text = serializeArchText(fileFromModel(model));
  const reparsed = parseArchText(text);
  checkValid(
    `${name}: the model parsed back from text passes validate.ts`,
    reparsed,
  );
  const out = serializeModel(deserializeModel(JSON.stringify(reparsed)));
  check(
    `${name}: JSON → text → JSON is BYTE-IDENTICAL to the committed file`,
    out === raw,
    firstDiff(out, raw),
  );
  check(
    `${name}: text → model → text is byte-identical`,
    serializeArchText(reparsed) === text,
    firstDiff(serializeArchText(reparsed), text),
  );
}

/* ----------------------------------------------------------------------- */
/* 4. Unknown forward-compatible fields injected into a real model          */
/* ----------------------------------------------------------------------- */

console.log("unknown forward-compatible fields (in position)");

function insertAfter(obj, anchor, key, value) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = v;
    if (k === anchor) out[key] = value;
  }
  return out;
}

{
  const raw = readFileSync(
    path.join(ROOT, "src/features/viewer/service/data/shopflow.archlab.json"),
    "utf8",
  );
  let mutated = JSON.parse(raw);
  mutated = insertAfter(mutated, "rootDiagramId", "x-workspace", {
    org: "shopflow",
    seats: 12,
  });
  mutated.metadata = insertAfter(mutated.metadata, "updatedAt", "x-review", {
    cycleDays: 30,
  });
  mutated.diagrams[0] = insertAfter(
    mutated.diagrams[0],
    "level",
    "x-flag",
    true,
  );
  mutated.diagrams[0].nodes[0] = insertAfter(
    mutated.diagrams[0].nodes[0],
    "technology",
    "x-node",
    ["a", 1],
  );
  mutated.diagrams[0].nodes[0].position = insertAfter(
    mutated.diagrams[0].nodes[0].position,
    "x",
    "x-align",
    "center",
  );
  mutated.diagrams[0].edges[0] = insertAfter(
    mutated.diagrams[0].edges[0],
    "direction",
    "x-edge",
    { weight: 3 },
  );

  const mutatedJson = JSON.stringify(mutated);
  const baseline = serializeModel(deserializeModel(mutatedJson));
  const text = serializeArchText(fileFromModel(deserializeModel(mutatedJson)));
  check(
    "the text carries the unknown fields as anchored ! lines",
    text.includes('! x-workspace : {"org":"shopflow","seats":12}') &&
      text.includes('! meta.x-review after updatedAt : {"cycleDays":30}') &&
      text.includes("  ! x-flag after level : true") &&
      text.includes('    ! x-node after technology : ["a",1]') &&
      text.includes('    ! position.x-align after x : "center"') &&
      text.includes('    ! x-edge after direction : {"weight":3}'),
    text
      .split("\n")
      .filter((l) => l.includes("!"))
      .join("\n"),
  );
  const reparsed = parseArchText(text);
  checkValid(
    "the mutated model parsed back from text passes validate.ts",
    reparsed,
  );
  const out = serializeModel(deserializeModel(JSON.stringify(reparsed)));
  check(
    "a model with unknown fields survives JSON → text → JSON byte-identically, fields in position",
    out === baseline,
    firstDiff(out, baseline),
  );
  check(
    "the mutated text round-trips byte-identically as text too",
    serializeArchText(reparsed) === text,
    firstDiff(serializeArchText(reparsed), text),
  );
}

/* ----------------------------------------------------------------------- */
/* 5. Malformed inputs — every error names a line and column                */
/* ----------------------------------------------------------------------- */

console.log("malformed inputs");

function expectParseError(label, source, expectFragment) {
  let result;
  try {
    result = parseArchText(source);
  } catch (error) {
    if (!(error instanceof ArchTextParseError)) {
      fail(label, `expected ArchTextParseError, got: ${error}`);
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
    if (
      expectFragment !== undefined &&
      !error.message.includes(expectFragment)
    ) {
      fail(label, `message lacks "${expectFragment}": ${error.message}`);
      return;
    }
    ok(`${label} — "${error.message.slice(0, 110)}"`);
    return;
  }
  fail(
    label,
    `expected an ArchTextParseError, but parsing succeeded: ${JSON.stringify(result?.metadata?.title)}`,
  );
}

const OK_HEAD = 'archlab 1.0\ntitle "T"\n';

/* ---- frames ---- */
const FRAME_HEAD = `${OK_HEAD}@context d-x "X"\n`;
expectParseError(
  "a duplicate frame id is refused",
  `${FRAME_HEAD}  frame f "One"\n  frame f "Two"\n  n:person "N"\n`,
  "duplicate frame id",
);
expectParseError(
  "an empty frame label is refused",
  `${FRAME_HEAD}  frame f ""\n  n:person "N"\n`,
  "must not be empty",
);
expectParseError(
  "a frame nesting inside a missing frame is refused",
  `${FRAME_HEAD}  frame f "F" in=nope\n  n:person "N"\n`,
  "does not name a frame",
);
expectParseError(
  "a frame enclosing itself is refused",
  `${FRAME_HEAD}  frame f "F" in=f\n  n:person "N"\n`,
  "its own enclosing frame",
);
expectParseError(
  "a frame cycle is refused",
  `${FRAME_HEAD}  frame a "A" in=b\n  frame b "B" in=a\n  n:person "N"\n`,
  "encloses itself",
);
expectParseError(
  "a node in a missing frame is refused",
  `${FRAME_HEAD}  n:person "N" in=nope\n`,
  "does not name a frame",
);
expectParseError(
  "an unknown frame attribute is refused",
  `${FRAME_HEAD}  frame f "F" nope=1\n  n:person "N"\n`,
  "not a frame attribute",
);

expectParseError("empty source is refused", "", "archlab");
expectParseError(
  "a file not starting with archlab is refused",
  'title "T"\n',
  'must start with an "archlab',
);
expectParseError(
  "a newer major version is refused",
  'archlab 2.0\ntitle "T"\n@context d "C"\n',
  "newer arch-lab",
);
expectParseError(
  "bad indentation (3 spaces) is refused",
  `${OK_HEAD}@context d "C"\n   a:person "A"\n`,
  "inconsistent indentation of 3 spaces",
);
expectParseError(
  "tab indentation is refused",
  `${OK_HEAD}@context d "C"\n\ta:person "A"\n`,
  "spaces, not tabs",
);
expectParseError(
  "an unknown level is refused",
  `${OK_HEAD}@warehouse d "C"\n`,
  '"@warehouse" is not a C4 level',
);
expectParseError(
  "an unknown node type is refused",
  `${OK_HEAD}@context d "C"\n  a:blob "A"\n`,
  '"blob" is not a node type',
);
expectParseError(
  "a node type illegal at its level is refused",
  `${OK_HEAD}@context c "C"\n  s:system "S" >k\n@container k owner=s\n  a:person "A"\n@code x "X" in=k\n  a2:person "A2"\n`,
  'not valid at level "code"',
);
expectParseError(
  "an edge referencing a missing node is refused",
  `${OK_HEAD}@context d "C"\n  a:person "A"\n  a -> ghost : "Uses"\n`,
  '"ghost" does not resolve to a node in this diagram',
);
expectParseError(
  "a cross-diagram edge is refused",
  `${OK_HEAD}@context c "C"\n  s:system "S" >k\n  a:person "A"\n@container k owner=s\n  w:container "W"\n  a -> w : "Uses"\n`,
  "relationships must connect two nodes in the same diagram",
);
expectParseError(
  "a duplicate node id is refused (file-wide)",
  `${OK_HEAD}@context c "C"\n  s:system "S" >k\n@container k owner=s\n  s:container "Again"\n`,
  'duplicate node id "s"',
);
expectParseError(
  "a duplicate diagram id is refused",
  `${OK_HEAD}@context d "C"\n@context d "Again"\n`,
  'duplicate diagram id "d"',
);
expectParseError(
  "a duplicate edge id is refused",
  `${OK_HEAD}@context d "C"\n  a:person "A"\n  b:system "B"\n  a -> b : "One"\n  a -> b : "Two"\n`,
  'duplicate edge id "e-a-b"',
);
expectParseError(
  "an unterminated string is refused",
  `${OK_HEAD}@context d "C\n`,
  "never closed",
);
expectParseError(
  "a missing file title is refused",
  'archlab 1.0\n@context d "C"\n',
  "no title",
);
expectParseError(
  "a wrong level step (in=) is refused",
  `${OK_HEAD}@context c "C"\n@component x "X" in=c\n`,
  'must sit exactly one level below a "@container" diagram',
);
expectParseError(
  "a context diagram with a parent is refused",
  `${OK_HEAD}@context c "C"\n@context c2 "C2" in=c\n`,
  "cannot have a parent",
);
expectParseError(
  "a file without a root context diagram is refused",
  `${OK_HEAD}@container k "K"\n`,
  "no root Context diagram",
);
expectParseError(
  "two parentless context diagrams without a root line are refused",
  `${OK_HEAD}@context c "C"\n@context c2 "C2"\n`,
  'add a "root <id>" header line',
);
expectParseError(
  "a header line after the first diagram is refused",
  `${OK_HEAD}@context d "C"\nowner "Team"\n`,
  'header lines must appear before the first "@" diagram',
);
expectParseError(
  "a ! line for a field with dedicated syntax is refused",
  `archlab 1.0\ntitle "T"\n! version : "9.9"\n@context d "C"\n`,
  '"version" has dedicated syntax',
);
expectParseError(
  "a duplicate ! line for the same unknown key is refused",
  `archlab 1.0\ntitle "T"\n! x-a : 1\n! x-a : 2\n@context d "C"\n`,
  'duplicate "!" line',
);
expectParseError(
  "childDiagramId and childRef together are refused",
  `${OK_HEAD}@context c "C"\n  s:system "S" >k >>"./x.json"\n@container k owner=s\n`,
  "mutually exclusive",
);
expectParseError(
  "a continuation with no node or edge above is refused",
  `${OK_HEAD}@context d "C"\n    desc "floating"\n`,
  "no node or edge line above",
);

/* --- an omitted node name is legal ONLY with a resolvable ^ref --- */

expectParseError(
  "an omitted name with no ^ref is refused",
  `${OK_HEAD}@context d "C"\n  lonely:person\n`,
  "only a node with a ^diagram/node reference may omit it",
);
expectParseError(
  "an omitted name whose ^ref does not resolve is refused",
  `${OK_HEAD}@context d "C"\n  a:person "A"\n  s:system "S" >k\n@container k owner=s\n  bad:person ^d/nope\n`,
  "does not resolve",
);
expectParseError(
  "an omitted name on a circular ^ref chain is refused",
  `${OK_HEAD}@context d "C"\n  a:person "A"\n  s:system "S" >k\n@container k owner=s\n  x:person ^k/y\n  y:person ^k/x\n`,
  "circular",
);

/* ----------------------------------------------------------------------- */
/* 6. Spans locate every member, and one node line matches a full serialise */
/* ----------------------------------------------------------------------- */

{
  /* THE KITCHEN SINK, which is the point: it is the fixture with continuation
     lines, `!` escapes, `^ref`s and non-default geometry, so a span that only
     ever covered single-line declarations would be caught here. */
  const { file, spans } = parseArchTextWithSpans(KITCHEN_SINK);
  const lines = KITCHEN_SINK.split("\n");

  const members = file.diagrams.flatMap((diagram) => [
    ...diagram.nodes.map((node) => ({
      what: `node ${diagram.id}/${node.id}`,
      span: spans.nodes.get(spanKey(diagram.id, node.id)),
      /* The declaration line must NAME the member. For a node that is
         `<id>:<keyword>`; the id alone would also match a mention of it in an
         edge line, which is the off-by-a-few-lines failure this has to see. */
      opens: `${node.id}:`,
    })),
    ...diagram.edges.map((edge) => ({
      what: `edge ${diagram.id}/${edge.id}`,
      span: spans.edges.get(spanKey(diagram.id, edge.id)),
      opens: `${edge.source} `,
    })),
  ]);

  check(
    "the fixture has members to locate, and every one has a span",
    members.length > 0 && members.every((m) => m.span !== undefined),
    `missing: ${members
      .filter((m) => m.span === undefined)
      .map((m) => m.what)
      .join(", ")}`,
  );

  const mislocated = members.filter(
    (m) =>
      m.span === undefined ||
      !(lines[m.span.start - 1] ?? "").trimStart().startsWith(m.opens),
  );
  check(
    "every span's start line is the line that declares that member",
    mislocated.length === 0,
    mislocated
      .map(
        (m) =>
          `${m.what} -> line ${m.span?.start}: ${JSON.stringify(lines[m.span?.start - 1])}`,
      )
      .join("; "),
  );

  /* A SPAN COVERS THE CONTINUATIONS AND NOTHING ELSE, asserted as the
     relationship (indent 4 inside, not indent 4 immediately after) rather than
     as line numbers. A span that stopped at the declaration would leave a
     `desc` line orphaned by a delete, and the file would stop parsing with
     "this continuation line has no node or edge line above it". */
  const isContinuation = (i) => /^ {4}\S/.test(lines[i] ?? "");
  const badTail = members.filter((m) => {
    if (m.span === undefined) return true;
    for (let i = m.span.start; i < m.span.end; i += 1) {
      if (!isContinuation(i)) return true; // a gap inside the block
    }
    return isContinuation(m.span.end); // a continuation left outside it
  });
  check(
    "every span covers exactly its own continuation lines",
    badTail.length === 0,
    badTail
      .map((m) => `${m.what} spans ${m.span?.start}-${m.span?.end}`)
      .join("; "),
  );

  /* THE SINGLE-NODE EMITTER AGREES WITH THE WHOLE-FILE ONE. This is the
     assertion that keeps a patched line honest: `canonicalNodeLine` computes
     the default layout and the `^ref` name lookup for itself, and if either
     disagreed with the full serialise the patched line would be text the rest
     of the file contradicts. Compared against the serialiser's OWN output for
     every node in the fixture, never against a hand-written string. */
  const emitted = serializeArchText(file).split("\n");
  const disagreeing = file.diagrams.flatMap((diagram) =>
    diagram.nodes.flatMap((node) => {
      const one = canonicalNodeLine(file, diagram.id, node.id);
      return emitted.includes(one) ? [] : [`${diagram.id}/${node.id}: ${one}`];
    }),
  );
  check(
    "canonicalNodeLine emits a line the full serialiser also emits, for every node",
    disagreeing.length === 0,
    disagreeing.join("; "),
  );
  check(
    "canonicalNodeLine returns null for a member that is not there",
    canonicalNodeLine(file, "no-such-diagram", "x") === null &&
      canonicalNodeLine(file, file.diagrams[0].id, "no-such-node") === null,
    "it returned a line for something that does not exist",
  );
}

/* --- all-or-nothing: a failing parse never returns a partial model --- */

{
  const broken = `${OK_HEAD}@context d "C"\n  a:person "A"\n  b:blob "B"\n`;
  let threw = false;
  try {
    parseArchText(broken);
  } catch (error) {
    threw = error instanceof ArchTextParseError;
  }
  check("a broken parse throws and applies nothing (all-or-nothing)", threw);
}

/* ----------------------------------------------------------------------- */
/* Layout direction — an authored opt-in, not a change of default           */
/*                                                                          */
/* The whole compatibility argument for this field is that a document which */
/* never mentions it is laid out exactly as it was before the field existed, */
/* and that both halves of the format resolve it the same way. The parser    */
/* fills omitted geometry from `defaultPositions`; the serializer OMITS      */
/* geometry that matches it. Resolve differently on the two sides and the    */
/* first save of a document that INHERITS its direction stamps an explicit   */
/* (x,y) onto every node — no error, an unrecognisable diff.                 */
/*                                                                          */
/* Forgetting `direction` in DIAGRAM_KEYS did exactly that in a milder form: */
/* the serializer wrote the head attribute AND a `!` unknown line, and the   */
/* next parse refused the file it had just written. The round trip caught it.*/
/* ----------------------------------------------------------------------- */

console.log("\nLayout direction");

{
  const COORD = /\(-?\d+,\s*-?\d+/;
  const shapeOf = (file, id) => {
    const diagram = file.diagrams.find((d) => d.id === id);
    const xs = diagram.nodes.map((n) => n.position.x);
    const ys = diagram.nodes.map((n) => n.position.y);
    const right = Math.max(
      ...diagram.nodes.map((n) => n.position.x + n.size.width),
    );
    const bottom = Math.max(
      ...diagram.nodes.map((n) => n.position.y + n.size.height),
    );
    return {
      width: right - Math.min(...xs),
      height: bottom - Math.min(...ys),
    };
  };
  const ratio = (file, id) => {
    const { width, height } = shapeOf(file, id);
    return width / height;
  };

  const CHAIN = (extra, attr) => `archlab 1.0
title "Chain"${extra}

@context ctx-root "Chain"${attr}
  a:system "A"
  b:system "B"
  c:system "C"
  d:system "D"
  e:system "E"
  f:system "F"

  a -> b : "Hands on"
  b -> c : "Hands on"
  c -> d : "Hands on"
  d -> e : "Hands on"
  e -> f : "Hands on"
`;

  const plain = parseArchText(CHAIN("", ""));
  const headerLr = parseArchText(CHAIN("\ndirection lr", ""));
  const diagramLr = parseArchText(CHAIN("", " direction=lr"));
  const override = parseArchText(CHAIN("\ndirection lr", " direction=tb"));

  check(
    "a document that never mentions direction is laid out top-down",
    ratio(plain, "ctx-root") < 0.5,
    `ratio ${ratio(plain, "ctx-root").toFixed(2)} — a six-deep chain should be a column`,
  );
  check(
    "the header line turns the same document landscape",
    ratio(headerLr, "ctx-root") > 1,
    `ratio ${ratio(headerLr, "ctx-root").toFixed(2)}`,
  );
  check(
    "a diagram attribute does it on its own, with no header line",
    JSON.stringify(shapeOf(diagramLr, "ctx-root")) ===
      JSON.stringify(shapeOf(headerLr, "ctx-root")),
    `${JSON.stringify(shapeOf(diagramLr, "ctx-root"))} vs ${JSON.stringify(shapeOf(headerLr, "ctx-root"))}`,
  );
  check(
    "a diagram attribute OVERRIDES the header, not the other way round",
    JSON.stringify(shapeOf(override, "ctx-root")) ===
      JSON.stringify(shapeOf(plain, "ctx-root")),
    `override ${JSON.stringify(shapeOf(override, "ctx-root"))} vs plain ${JSON.stringify(shapeOf(plain, "ctx-root"))}`,
  );

  for (const [label, file, source] of [
    ["no direction", plain, CHAIN("", "")],
    ["header", headerLr, CHAIN("\ndirection lr", "")],
    ["attribute", diagramLr, CHAIN("", " direction=lr")],
    ["override", override, CHAIN("\ndirection lr", " direction=tb")],
  ]) {
    const written = serializeArchText(file);
    check(
      `${label}: the serializer still omits the geometry it filled in`,
      !COORD.test(written),
      `first offending line: ${written
        .split("\n")
        .find((l) => COORD.test(l))
        ?.trim()}`,
    );
    check(
      `${label}: round-trips byte-identically`,
      written === source,
      `re-serialized:\n${written}`,
    );
    check(
      `${label}: the re-serialized text parses`,
      (() => {
        try {
          parseArchText(written);
          return true;
        } catch (error) {
          return `threw: ${error.message}`;
        }
      })() === true,
      "the serializer wrote a document its own parser refuses",
    );
  }

  check(
    "a long flow FOLDS into bands rather than becoming a ribbon",
    (() => {
      /* Turning the column on its side is not enough on its own: ten layers
       * laid along X is 3200 wide and 152 tall, which a landscape frame
       * shrinks by as much as the column did. A ribbon is a column. Asserted
       * as a bound on the shape, because "> 1" passes for a ribbon too —
       * which is how deleting the fold first went unnoticed here. */
      const ids = "abcdefghij".split("");
      const body = ids
        .map((id) => `  ${id}:system "${id.toUpperCase()}"`)
        .join("\n");
      const edges = ids
        .slice(0, -1)
        .map((id, i) => `  ${id} -> ${ids[i + 1]} : "Hands on"`)
        .join("\n");
      const file = parseArchText(
        `archlab 1.0\ntitle "Ribbon"\ndirection lr\n\n@context ctx-root "Ribbon"\n${body}\n\n${edges}\n`,
      );
      const { width, height } = shapeOf(file, "ctx-root");
      const r = width / height;
      // 16:9 is 1.78; a ribbon would be about 21.
      return r > 1 && r < 4
        ? true
        : `ten layers came out ${Math.round(width)}x${Math.round(height)} (ratio ${r.toFixed(2)})`;
    })() === true,
    "a ten-layer flow was stretched into a strip instead of folded",
  );
  check(
    "a diagram already wider than deep is left top-down even under lr",
    (() => {
      /* The other half of the axis choice. Turning a hub with five dependents
       * sideways would recreate the column the other way round. */
      const fan = `archlab 1.0
title "Fan"
direction lr

@context ctx-root "Fan"
  hub:system "Hub"
  one:external "One"
  two:external "Two"
  three:external "Three"
  four:external "Four"
  five:external "Five"

  hub -> one : "Calls"
  hub -> two : "Calls"
  hub -> three : "Calls"
  hub -> four : "Calls"
  hub -> five : "Calls"
`;
      const lr = shapeOf(parseArchText(fan), "ctx-root");
      const tb = shapeOf(
        parseArchText(fan.replace("\ndirection lr", "")),
        "ctx-root",
      );
      return JSON.stringify(lr) === JSON.stringify(tb);
    })(),
    "lr turned an already-landscape diagram sideways, making a column of it",
  );
  check(
    "a direction that is neither tb nor lr is refused BY NAME",
    (() => {
      try {
        parseArchText(CHAIN("\ndirection sideways", ""));
        return false;
      } catch (error) {
        return /sideways/.test(error.message) && /tb|lr/.test(error.message);
      }
    })(),
    "a silently ignored layout hint is a diagram laid out the way nobody asked",
  );
  check(
    "a bad direction on a DIAGRAM is refused by name too",
    (() => {
      try {
        parseArchText(CHAIN("", " direction=sideways"));
        return false;
      } catch (error) {
        return /sideways/.test(error.message);
      }
    })(),
  );
  check(
    "a hand-written coordinate is honoured whichever way the layout runs",
    (() => {
      const pinned = `archlab 1.0
title "Pinned"
direction lr

@context ctx-root "Pinned"
  a:system "A" (776,344 176x88)
  b:external "B"

  a -> b : "Calls"
`;
      const file = parseArchText(pinned);
      const a = file.diagrams[0].nodes.find((n) => n.id === "a");
      return (
        a.position.x === 776 &&
        a.position.y === 344 &&
        serializeArchText(file) === pinned
      );
    })(),
    "lr moved a pinned node, or the pin stopped round-tripping",
  );
}

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} archtext-check assertions passed.`);

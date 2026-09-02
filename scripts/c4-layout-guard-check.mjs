#!/usr/bin/env node
/**
 * C4 DEFAULT-GEOMETRY GUARD — proves that the geometry `.alab` fills in for a
 * document that omits it cannot change under the people who already have
 * files.
 *
 * WHY THIS EXISTS AS ITS OWN CHECK. `defaultPositions`
 * (`src/features/archtext/lib/defaults.ts`) is not one feature's layout: it is
 * read by the PARSER (fill in what the text omitted), by the SERIALIZER (omit
 * what matches the rule) and by the CANVAS EDITOR's text patcher, which
 * `canvas-edit.ts` says out loud must agree with a file opened from disk. That
 * three-way symmetry is what makes terse text and geometry-carrying text two
 * faces of one lossless format — and it is invisible in a diff. Change the
 * layout on one side only and the failure is not an error: a reader opens a
 * terse diagram they have had for months, nudges one label, saves, and the
 * editor stamps an explicit `(x,y)` onto EVERY node, because the positions no
 * longer match the ones the serializer would have omitted. Nothing logs. The
 * file still parses. The diff is unrecognisable.
 *
 * So the golden tables here are deliberately SNAPSHOTS, which no other check
 * in this repo keeps. The usual rule — assert relationally, never restate the
 * implementation — is about assertions that should survive a refactor. These
 * assert the opposite thing on purpose: the coordinates are a published
 * interface, and their job is to fail when one moves. A layout change does not
 * edit them; it gates itself on the document's own `archlab <version>` header
 * and brings its own table.
 *
 * There are now TWO such tables, and both are load-bearing. `1.0` keeps the
 * top-down layered layout it has always had. From `1.1` the same layering
 * chooses its long axis and folds a long flow into bands — re-recording one
 * table without the other has changed a published answer for whichever set was
 * left behind.
 *
 * What it proves, clause by clause:
 *   1. GOLDEN GEOMETRY at 1.0. Five shapes — a chain, a fan-out, a cycle, a
 *      real two-level document and a ten-layer ribbon — land on exactly the
 *      coordinates recorded here.
 *   2. SYMMETRY. A document that omits geometry survives parse → serialize
 *      with its geometry still omitted. This is the assertion that goes red
 *      when a layout change touches the parser without the serializer.
 *   3. PINS SURVIVE. A document that DOES carry coordinates round-trips them
 *      byte-identically, so the guard cannot be satisfied by freezing
 *      everything.
 *   4. NOTHING BUT THE MODEL REACHES THE LAYOUT. Declaration order in the
 *      text does not move a single node, AND the layout sorts its own ids, so
 *      the three callers cannot disagree because one walked an array another
 *      sorted.
 *   5. THE 8-PX GRID. Every default coordinate is a multiple of 8.
 *   6. THE GATE IS WIRED. A `1.0` document and a `1.1` document of the same
 *      text get DIFFERENT geometry, and the version survives serialization so
 *      the gate cannot be lost on save.
 *   7. WHAT 1.1 IS FOR, measured rather than asserted about the algorithm. A
 *      short flow runs along X unfolded; a fan-out — already wider than it is
 *      deep — is left byte-identical to 1.0; and a ten-layer flow that was a
 *      0.09-ratio column lands within a third of 16:9 by folding, not by
 *      stretching into an equally unusable ribbon. Clause 2's symmetry and
 *      clause 5's grid are re-proved for 1.1, because a gate that moved the
 *      silent-stamping bug to the documents that opted in would be no gate.
 *
 * Runs the REAL parser and serializer through Node's type stripping and the
 * `@/*` resolve hook (`scripts/lib/resolve-ts.mjs`).
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { registerTsResolution } from "./lib/resolve-ts.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = registerTsResolution(ROOT);

const { parseArchText, serializeArchText, defaultPositions } = await load(
  "src/features/archtext/index.ts",
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

/** Every node of every diagram, as `id=x,y`, in the file's own order. */
const geometryOf = (file) =>
  file.diagrams.map((diagram) => ({
    id: diagram.id,
    at: diagram.nodes.map((node) => ({
      id: node.id,
      x: node.position.x,
      y: node.position.y,
    })),
  }));

const flat = (file) =>
  geometryOf(file)
    .map(
      ({ id, at }) =>
        `${id}:${at.map((n) => `${n.id}=${n.x},${n.y}`).join(" ")}`,
    )
    .join(" | ");

/** A coordinate pair anywhere in `.alab` text — `(40,256)` or `(40,256 176x88)`. */
const COORD = /\(-?\d+,\s*-?\d+/;

/* ----------------------------------------------------------------------- */
/* Fixtures                                                                 */
/* ----------------------------------------------------------------------- */

const CHAIN = `archlab 1.0
title "Chain"

@context ctx-root "Chain"
  a:person "A"
  b:system "B"
  c:external "C"

  a -> b : "Sends"
  b -> c : "Forwards"
`;

const FAN = `archlab 1.0
title "Fan"

@context ctx-root "Fan"
  hub:system "Hub"
  one:external "One"
  two:external "Two"
  three:external "Three"

  hub -> one : "Calls"
  hub -> two : "Calls"
  hub -> three : "Calls"
`;

const CYCLE = `archlab 1.0
title "Cycle"

@context ctx-root "Cycle"
  a:system "A"
  b:system "B"
  c:system "C"

  a -> b : "Down"
  b -> c : "Down"
  c -> a : "Back"
`;

/**
 * A real two-level document — the notification-email platform ported from a
 * user's diagram during the review that prompted this guard. Kept because a
 * fixture that came from someone's actual file is the one that catches the
 * change nobody modelled.
 */
const NOTIFY = `archlab 1.0
title "Notification Email Platform"

@context ctx-root "Notification Email Platform"
  admin:person "Admin / Dev"
  bitkub1:external "Bitkub 1.0"
  other-svc:external "Other Service"
  notify:system "Notification Email Platform" >cnt-notify
  sendgrid:external "SendGrid"
  slack:external "Slack"
  customer:person "Customer"

  admin -> notify : "Manages email templates" [HTTPS]
  bitkub1 -> notify : "Requests an email" [HTTPS]
  other-svc -> notify : "Requests an email" [HTTP]
  notify -> sendgrid : "Submits the message" [HTTPS/JSON]
  sendgrid -> customer : "Delivers the email" [SMTP]
  sendgrid -> notify : "Reports delivery events" [HTTPS webhook]
  notify -> slack : "Alerts on a failed event" [HTTPS]

@container cnt-notify "Containers" owner=notify
  kong-in:container "Kong Gateway" [Kong]
  email-svc:container "Email Service" [RESTful API]
  template-svc:container "Template Engine" [Template API]
  email-consumer:container "Email Consumer" [AMQP consumer]
  email-webhook:container "Email Webhook" [RESTful API]
  mongodb:database "MongoDB" [MongoDB]
  rabbitmq:queue "RabbitMQ" [AMQP]

  kong-in -> email-svc : "Routes the send request" [HTTPS]
  kong-in -> template-svc : "Routes template CRUD" [HTTPS]
  email-svc -> mongodb : "Reads and writes email_logs" [MongoDB wire]
  email-svc -> rabbitmq : "Publishes send_email" [AMQP]
  rabbitmq -> email-consumer : "Delivers send_email" [AMQP]
  template-svc -> mongodb : "Reads and writes templates" [MongoDB wire]
  email-webhook -> email-svc : "Updates activities" [HTTP]
`;

/**
 * Ten layers, one node each — the shape that motivated the fold, and the one
 * that shows why turning the column sideways is not on its own a fix: laid
 * along X it is 3200 px wide and 152 tall, which a landscape frame shrinks by
 * as much as the column did.
 */
const RIBBON = `archlab 1.0
title "Ribbon"

@context ctx-root "Ribbon"
  a:system "A"
  b:system "B"
  c:system "C"
  d:system "D"
  e:system "E"
  f:system "F"
  g:system "G"
  h:system "H"
  i:system "I"
  j:system "J"

  a -> b : "Step 1"
  b -> c : "Step 2"
  c -> d : "Step 3"
  d -> e : "Step 4"
  e -> f : "Step 5"
  f -> g : "Step 6"
  g -> h : "Step 7"
  h -> i : "Step 8"
  i -> j : "Step 9"
`;

/** The same three nodes as CHAIN, declared in reverse. Clause 4. */
const CHAIN_REVERSED = `archlab 1.0
title "Chain"

@context ctx-root "Chain"
  c:external "C"
  b:system "B"
  a:person "A"

  b -> c : "Forwards"
  a -> b : "Sends"
`;

/** Coordinates written by hand. Clause 3 — the guard must not freeze these away. */
const PINNED = `archlab 1.0
title "Pinned"

@context ctx-root "Pinned"
  a:system "A" (776,344 176x88)
  b:external "B" (-208,912 176x88)

  a -> b : "Calls"
`;

/**
 * GOLDEN GEOMETRY, recorded from the shipped implementation. See the header:
 * when the layout is meant to change, these do not get edited — the new
 * layout is gated on the document version and gets fixtures of its own.
 */
const GOLDEN = {
  chain: "ctx-root:a=40,40 b=40,256 c=40,472",
  fan: "ctx-root:hub=304,40 one=40,256 two=568,256 three=304,256",
  cycle: "ctx-root:a=40,40 b=40,256 c=40,472",
  notify:
    "ctx-root:admin=40,40 bitkub1=304,40 other-svc=568,40 notify=304,256 " +
    "sendgrid=176,472 slack=440,472 customer=304,688 | " +
    "cnt-notify:kong-in=304,40 email-svc=40,256 template-svc=304,256 " +
    "email-consumer=176,688 email-webhook=40,40 mongodb=304,472 rabbitmq=40,472",
  ribbon:
    "ctx-root:a=40,40 b=40,256 c=40,472 d=40,688 e=40,904 f=40,1120 " +
    "g=40,1336 h=40,1552 i=40,1768 j=40,1984",
};

/**
 * The SAME fixtures with `archlab 1.1`. Two halves of one interface: the table
 * above must not move, and this one must not move either — a layout tune that
 * only re-records one of them has changed a published answer for whichever set
 * it left behind.
 */
const GOLDEN_11 = {
  chain: "ctx-root:a=40,40 b=360,40 c=680,40",
  fan: "ctx-root:hub=304,40 one=40,256 two=568,256 three=304,256",
  cycle: "ctx-root:a=40,40 b=360,40 c=680,40",
  notify:
    "ctx-root:admin=40,40 bitkub1=40,192 other-svc=40,344 notify=360,192 " +
    "sendgrid=680,120 slack=680,272 customer=1000,192 | " +
    "cnt-notify:kong-in=40,192 email-svc=360,40 template-svc=360,192 " +
    "email-consumer=1000,120 email-webhook=40,40 mongodb=680,192 rabbitmq=680,40",
  ribbon:
    "ctx-root:a=40,40 b=360,40 c=680,40 d=1000,40 e=40,312 f=360,312 " +
    "g=680,312 h=1000,312 i=40,584 j=360,584",
};

/* ----------------------------------------------------------------------- */
/* 1. Golden geometry                                                       */
/* ----------------------------------------------------------------------- */

console.log("\nGolden geometry — a 1.0 document lands where it always has");

const parsed = {
  chain: parseArchText(CHAIN),
  fan: parseArchText(FAN),
  cycle: parseArchText(CYCLE),
  notify: parseArchText(NOTIFY),
  ribbon: parseArchText(RIBBON),
};

for (const [name, file] of Object.entries(parsed)) {
  const actual = flat(file);
  check(
    `${name}: every node sits on its recorded coordinate`,
    actual === GOLDEN[name],
    actual === GOLDEN[name]
      ? undefined
      : `recorded ${GOLDEN[name]}\n    got      ${actual}`,
  );
}

/* A shape assertion beside the snapshot, so the fixtures keep meaning
 * something if the numbers are ever legitimately re-recorded for 1.1. */
{
  const rows = new Map();
  for (const node of parsed.chain.diagrams[0].nodes) {
    rows.set(node.id, node.position.y);
  }
  check(
    "chain: each target sits strictly below its source",
    rows.get("a") < rows.get("b") && rows.get("b") < rows.get("c"),
    `a=${rows.get("a")} b=${rows.get("b")} c=${rows.get("c")}`,
  );

  const fan = new Map(
    parsed.fan.diagrams[0].nodes.map((n) => [n.id, n.position]),
  );
  check(
    "fan: the three targets share one row below the hub",
    fan.get("one").y === fan.get("two").y &&
      fan.get("two").y === fan.get("three").y &&
      fan.get("one").y > fan.get("hub").y,
    `hub=${fan.get("hub").y} one=${fan.get("one").y} two=${fan.get("two").y} three=${fan.get("three").y}`,
  );
  check(
    "fan: tied barycentres order the row by sorted id, not by text order",
    fan.get("one").x < fan.get("three").x &&
      fan.get("three").x < fan.get("two").x,
    `one=${fan.get("one").x} three=${fan.get("three").x} two=${fan.get("two").x}`,
  );

  const cyc = new Map(
    parsed.cycle.diagrams[0].nodes.map((n) => [n.id, n.position]),
  );
  check(
    "cycle: the back edge is dropped, so the three still descend one row each",
    cyc.get("a").y < cyc.get("b").y && cyc.get("b").y < cyc.get("c").y,
    `a=${cyc.get("a").y} b=${cyc.get("b").y} c=${cyc.get("c").y}`,
  );
}

/* ----------------------------------------------------------------------- */
/* 2. Symmetry: parse → serialize keeps omitted geometry omitted            */
/* ----------------------------------------------------------------------- */

console.log(
  "\nSymmetry — the serializer omits exactly what the parser filled in",
);

for (const [name, file] of Object.entries(parsed)) {
  const source = {
    chain: CHAIN,
    fan: FAN,
    cycle: CYCLE,
    notify: NOTIFY,
    ribbon: RIBBON,
  }[name];
  const written = serializeArchText(file);
  check(
    `${name}: re-serialized text carries NO coordinate the author never wrote`,
    !COORD.test(written),
    COORD.test(written)
      ? `first offending line: ${written
          .split("\n")
          .find((line) => COORD.test(line))
          ?.trim()}`
      : undefined,
  );
  check(
    `${name}: parse → serialize → parse lands on the same geometry`,
    flat(parseArchText(written)) === flat(file),
    `${flat(parseArchText(written))}\n    vs ${flat(file)}`,
  );
  check(
    `${name}: the author's own text survives the round trip`,
    parseArchText(written).diagrams.length === file.diagrams.length &&
      source.includes("archlab 1.0"),
  );
}

/* ----------------------------------------------------------------------- */
/* 3. Pins survive                                                          */
/* ----------------------------------------------------------------------- */

console.log(
  "\nHand-written coordinates — the guard freezes defaults, not pins",
);

{
  const file = parseArchText(PINNED);
  const at = new Map(file.diagrams[0].nodes.map((n) => [n.id, n.position]));
  check(
    "a pinned coordinate parses to exactly the number in the text",
    at.get("a").x === 776 && at.get("a").y === 344,
    `a=${at.get("a").x},${at.get("a").y}`,
  );
  check(
    "a negative pinned coordinate is preserved, not clamped",
    at.get("b").x === -208 && at.get("b").y === 912,
    `b=${at.get("b").x},${at.get("b").y}`,
  );
  const written = serializeArchText(file);
  check(
    "a pinned coordinate is written back out, not omitted as a default",
    COORD.test(written) &&
      written.includes("(776,344") &&
      written.includes("(-208,912"),
    written
      .split("\n")
      .filter((line) => COORD.test(line))
      .join(" / "),
  );
  check(
    "a pinned document is byte-identical after parse → serialize",
    written === PINNED,
    `re-serialized:\n${written}`,
  );
}

/* ----------------------------------------------------------------------- */
/* 4. Only the model reaches the layout                                     */
/* ----------------------------------------------------------------------- */

console.log("\nInputs — nothing but ids and edges can move a node");

{
  const forward = flat(parsed.chain);
  const reversed = parseArchText(CHAIN_REVERSED);
  const byId = (file) =>
    [...file.diagrams[0].nodes]
      .map((n) => `${n.id}=${n.position.x},${n.position.y}`)
      .sort()
      .join(" ");
  check(
    "reversing every declaration in the text moves no node",
    byId(reversed) === byId(parsed.chain),
    `reversed ${byId(reversed)}\n    forward  ${byId(parsed.chain)}`,
  );
  check(
    "parsing the same text twice gives byte-identical geometry",
    flat(parseArchText(CHAIN)) === forward,
  );
  check(
    "calling the layout directly agrees with what the parser filled in",
    (() => {
      const direct = defaultPositions(
        ["a", "b", "c"],
        [
          { source: "a", target: "b" },
          { source: "b", target: "c" },
        ],
      );
      return [...direct.entries()].every(([id, point]) => {
        const node = parsed.chain.diagrams[0].nodes.find((n) => n.id === id);
        return node.position.x === point.x && node.position.y === point.y;
      });
    })(),
    "the parser and defaultPositions disagree — the serializer will too",
  );

  /* The assertion above reaches the layout THROUGH the parser, which hands it
   * ids it has already sorted — so it cannot see whether the layout sorts for
   * itself. It does not, for the parse path, and that is fine there. It is not
   * fine for `mermaid/lib/layout.ts` and `canvas-edit.ts`, which pass ids in
   * whatever order they hold them: if the layout stops sorting, the SAME model
   * imported from Mermaid and opened from `.alab` lays out differently, and
   * the editor and the file disagree about what to omit. Proven by deleting
   * the sort — the assertions above all still passed, and only this one
   * turned red. */
  {
    const edges = [
      { source: "hub", target: "one" },
      { source: "hub", target: "two" },
      { source: "hub", target: "three" },
    ];
    const asWritten = defaultPositions(["hub", "one", "two", "three"], edges);
    const shuffled = defaultPositions(["two", "hub", "three", "one"], edges);
    const show = (map) =>
      [...map.entries()]
        .map(([id, p]) => `${id}=${p.x},${p.y}`)
        .sort()
        .join(" ");
    check(
      "the layout sorts its own ids — a caller's array order moves no node",
      show(asWritten) === show(shuffled),
      `as written ${show(asWritten)}\n    shuffled   ${show(shuffled)}`,
    );
  }
}

/* ----------------------------------------------------------------------- */
/* 5. The 8-px grid                                                         */
/* ----------------------------------------------------------------------- */

console.log("\nGrid — every default coordinate is a multiple of 8");

{
  const offenders = [];
  for (const file of Object.values(parsed)) {
    for (const diagram of file.diagrams) {
      for (const node of diagram.nodes) {
        if (node.position.x % 8 !== 0 || node.position.y % 8 !== 0) {
          offenders.push(`${node.id}=${node.position.x},${node.position.y}`);
        }
      }
    }
  }
  check(
    "no default coordinate falls off the 8-px grid",
    offenders.length === 0,
    offenders.join(" "),
  );
}

/* ----------------------------------------------------------------------- */
/* 6. The version gate is available                                         */
/* ----------------------------------------------------------------------- */

console.log("\nVersion gate — the header can carry the decision already");

{
  check(
    "a 1.0 document reports version 1.0 through the parse",
    parseArchText(CHAIN).version === "1.0",
    `version=${parseArchText(CHAIN).version}`,
  );
  const next = parseArchText(CHAIN.replace("archlab 1.0", "archlab 1.1"));
  check(
    "a 1.1 document parses and reports version 1.1",
    next.version === "1.1",
    `version=${next.version}`,
  );
  check(
    "the version survives serialization, so the gate cannot be lost on save",
    serializeArchText(next).startsWith("archlab 1.1"),
    serializeArchText(next).split("\n")[0],
  );
  check(
    "a 1.1 document does NOT get 1.0 geometry — the gate is live",
    flat(next) !== GOLDEN.chain,
    `1.1 laid out identically to 1.0 (${flat(next)}) — the gate is not wired`,
  );
}

/* ----------------------------------------------------------------------- */
/* 7. The other half of the gate: what 1.1 is FOR                           */
/* ----------------------------------------------------------------------- */

console.log("\n1.1 — layers choose the long axis, and a long flow folds");

const at11 = (source) =>
  parseArchText(source.replace("archlab 1.0", "archlab 1.1"));

const parsed11 = {
  chain: at11(CHAIN),
  fan: at11(FAN),
  cycle: at11(CYCLE),
  notify: at11(NOTIFY),
  ribbon: at11(RIBBON),
};

for (const [name, file] of Object.entries(parsed11)) {
  const actual = flat(file);
  check(
    `1.1 ${name}: every node sits on its recorded coordinate`,
    actual === GOLDEN_11[name],
    actual === GOLDEN_11[name]
      ? undefined
      : `recorded ${GOLDEN_11[name]}\n    got      ${actual}`,
  );
}

/** Bounding box of one diagram, in the units the viewer frames. */
function extent(diagram) {
  const xs = diagram.nodes.map((n) => n.position.x);
  const ys = diagram.nodes.map((n) => n.position.y);
  return {
    width: Math.max(...xs) - Math.min(...xs) + 176,
    height: Math.max(...ys) - Math.min(...ys) + 96,
  };
}
const ratio = (diagram) => {
  const { width, height } = extent(diagram);
  return width / height;
};
const TARGET = 16 / 9;

{
  /* A flow runs along X, unfolded while it is short. */
  const chain = parsed11.chain.diagrams[0].nodes;
  check(
    "1.1: a three-layer flow runs along X on one row",
    new Set(chain.map((n) => n.position.y)).size === 1 &&
      chain[0].position.x < chain[1].position.x &&
      chain[1].position.x < chain[2].position.x,
    chain.map((n) => `${n.id}=${n.position.x},${n.position.y}`).join(" "),
  );
  check(
    "1.1: a short flow is NOT folded — a two-box band reads worse than the run",
    new Set(chain.map((n) => n.position.y)).size === 1,
    "the fold floor let a three-layer flow wrap",
  );

  /* An already-landscape diagram is left exactly alone. This is the assertion
   * that stops the fix from becoming the same bug rotated: a hub with more
   * dependents than layers must not be turned on its side. */
  check(
    "1.1: a fan-out — wider than it is deep — is byte-identical to 1.0",
    flat(parsed11.fan) === GOLDEN.fan,
    `1.1 ${flat(parsed11.fan)}\n    1.0 ${GOLDEN.fan}`,
  );

  /* The shape claim, measured rather than asserted about the algorithm. */
  const before = parsed.ribbon.diagrams[0];
  const after = parsed11.ribbon.diagrams[0];
  check(
    "1.1: a ten-layer flow was a column no frame could hold at full size",
    ratio(before) < 0.2,
    `1.0 ratio ${ratio(before).toFixed(2)} (${extent(before).width}x${extent(before).height})`,
  );
  check(
    "1.1: the same flow lands within a third of a 16:9 frame",
    Math.abs(ratio(after) - TARGET) < TARGET / 3,
    `1.1 ratio ${ratio(after).toFixed(2)} (${extent(after).width}x${extent(after).height}), target ${TARGET.toFixed(2)}`,
  );
  check(
    "1.1: it got there by FOLDING, not by stretching into a ribbon",
    new Set(after.nodes.map((n) => n.position.y)).size > 1 &&
      extent(after).width < extent(before).height,
    `bands=${new Set(after.nodes.map((n) => n.position.y)).size} width=${extent(after).width} vs 1.0 height=${extent(before).height}`,
  );
  check(
    "1.1: folding is strictly closer to the frame than not folding",
    Math.abs(ratio(after) - TARGET) < Math.abs(ratio(before) - TARGET),
    `1.1 ${ratio(after).toFixed(2)} vs 1.0 ${ratio(before).toFixed(2)}`,
  );

  /* Every band is full before the next one starts, or the fold has produced a
   * ragged shape that reads as two diagrams rather than one folded flow. */
  const byBand = new Map();
  for (const node of after.nodes) {
    const band = byBand.get(node.position.y) ?? [];
    band.push(node);
    byBand.set(node.position.y, band);
  }
  const sizes = [...byBand.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, band]) => band.length);
  check(
    "1.1: no band is fuller than the one before it",
    sizes.every((size, i) => i === 0 || size <= sizes[i - 1]),
    `band sizes ${sizes.join(", ")}`,
  );
}

/* Everything clause 2 proves for 1.0 has to hold for 1.1, or the version gate
 * has simply moved the silent-stamping bug to the documents that opted in. */
for (const [name, file] of Object.entries(parsed11)) {
  const written = serializeArchText(file);
  check(
    `1.1 ${name}: re-serialized text carries NO coordinate the author never wrote`,
    !COORD.test(written),
    COORD.test(written)
      ? `first offending line: ${written
          .split("\n")
          .find((line) => COORD.test(line))
          ?.trim()}`
      : undefined,
  );
  check(
    `1.1 ${name}: parse → serialize → parse lands on the same geometry`,
    flat(parseArchText(written)) === flat(file),
  );
}

{
  const offenders = [];
  for (const file of Object.values(parsed11)) {
    for (const diagram of file.diagrams) {
      for (const node of diagram.nodes) {
        if (node.position.x % 8 !== 0 || node.position.y % 8 !== 0) {
          offenders.push(`${node.id}=${node.position.x},${node.position.y}`);
        }
      }
    }
  }
  check(
    "1.1: no coordinate falls off the 8-px grid",
    offenders.length === 0,
    offenders.join(" "),
  );
}

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(
    `\n${failures} of ${assertions} c4-layout-guard assertions FAILED.`,
  );
  process.exit(1);
}
console.log(`\nAll ${assertions} c4-layout-guard assertions passed.`);

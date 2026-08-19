#!/usr/bin/env node
/**
 * Mermaid C4 ⇄ arch-lab converter check. Follows the pattern of
 * `scripts/roundtrip-check.mjs`: loads the REAL library from
 * `src/features/mermaid/**` (and the editor's real validator) via Node's
 * built-in TypeScript type stripping plus a resolve hook for the `@/*`
 * alias, so this script and the app exercise the exact same code.
 *
 * What it proves:
 *   1. The user's reference sample parses, and every element and
 *      relationship is present with the right types, tags, text and
 *      technology — including `<br/>` decoding, `_Ext` externality,
 *      Db/Queue mapping and BiRel bidirectionality.
 *   2. Nested boundaries survive as `boundary:<id>` tags plus the
 *      `x-mermaid.boundaries` tree, nesting intact.
 *   3. The emitted model passes the editor's `validate.ts` unchanged, and
 *      every node type is legal at its diagram's level.
 *   4. parse → serialize → parse is stable (model-equivalent), and
 *      serialize(parse(serialize(parse(src)))) is byte-identical.
 *   5. Container/Component/Dynamic/Deployment sources map to the right
 *      levels and stay validator-clean (including synthetic wrappers).
 *   6. A set of malformed inputs each fail with a MermaidParseError naming
 *      a line and column (and the parse is all-or-nothing).
 *   7. The flowchart dialect: `.alab` → Mermaid → `.alab` round-trips to an
 *      equal model for every shape and both edge label forms, both header
 *      words and all five direction tokens parse to the same model
 *      (direction is layout, not model), subgraphs map to contiguous
 *      groups, id normalisation is deterministic, and malformed flowcharts
 *      fail with the right line and column rather than a silently wrong
 *      model.
 *   8. The use-case dialect: the user-reported Thai document (verbatim)
 *      detects and imports as a correct use-case model — two actors, four
 *      use cases, one boundary labelled with the subgraph's DISPLAY title,
 *      five associations, Thai byte-identical — and round-trips through
 *      `.alab`; genuine flowcharts (decisions, steps, labelled edges, no
 *      circles, chained terminators) are NOT stolen: the detector says
 *      flowchart and `parseMermaidFlowchart` still owns them; `.alab` →
 *      Mermaid → `.alab` round-trips all three edge kinds; and
 *      flowchart-flavoured constructs fail the use-case reading with a
 *      located error that names the flowchart importer as the way out.
 *
 * Exits non-zero on any failure. Run with: pnpm check:mermaid
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
  parseMermaidC4,
  serializeMermaidC4,
  parseMermaidFlowchart,
  serializeMermaidFlowchart,
  parseMermaidUseCase,
  serializeMermaidUseCase,
  detectMermaidUseCase,
  parseMermaidEr,
  serializeMermaidEr,
  detectMermaidEr,
  MermaidParseError,
} = await import(
  pathToFileURL(path.join(ROOT, "src/features/mermaid/index.ts")).href
);
const {
  parseFlowchartText,
  serializeFlowchartText,
  parseUseCaseText,
  serializeUseCaseText,
  parseErText,
  serializeErText,
} = await import(
  pathToFileURL(path.join(ROOT, "src/features/archtext/index.ts")).href
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

/* ----------------------------------------------------------------------- */
/* The user-supplied reference sample                                       */
/* ----------------------------------------------------------------------- */

const SAMPLE = `C4Context
    title System Context diagram for Internet Banking System
    Enterprise_Boundary(b0, "BankBoundary0") {
        Person(customerA, "Banking Customer A", "A customer of the bank, with personal bank accounts.")
        Person(customerB, "Banking Customer B")
        Person_Ext(customerC, "Banking Customer C", "desc")

        Person(customerD, "Banking Customer D", "A customer of the bank, <br/> with personal bank accounts.")

        System(SystemAA, "Internet Banking System", "Allows customers to view information about their bank accounts, and make payments.")

        Enterprise_Boundary(b1, "BankBoundary") {
            SystemDb_Ext(SystemE, "Mainframe Banking System", "Stores all of the core banking information about customers, accounts, transactions, etc.")

            System_Boundary(b2, "BankBoundary2") {
                System(SystemA, "Banking System A")
                System(SystemB, "Banking System B", "A system of the bank, with personal bank accounts. next line.")
            }

            System_Ext(SystemC, "E-mail system", "The internal Microsoft Exchange e-mail system.")
            SystemDb(SystemD, "Banking System D Database", "A system of the bank, with personal bank accounts.")

            Boundary(b3, "BankBoundary3", "boundary") {
                SystemQueue(SystemF, "Banking System F Queue", "A system of the bank.")
                SystemQueue_Ext(SystemG, "Banking System G Queue", "A system of the bank, with personal bank accounts.")
            }
        }
    }

    BiRel(customerA, SystemAA, "Uses")
    BiRel(SystemAA, SystemE, "Uses")
    Rel(SystemAA, SystemC, "Sends e-mails", "SMTP")
    Rel(SystemC, customerA, "Sends e-mails to")
`;

console.log("parsing the reference sample");

const file = parseMermaidC4(SAMPLE);
const main = file.diagrams.find((d) => d.id === file.rootDiagramId);
const nodeById = new Map(main.nodes.map((n) => [n.id, n]));
const tagsOf = (id) => nodeById.get(id)?.tags ?? [];

check(
  "the sample parses into a single context diagram",
  file.diagrams.length === 1 && main?.level === "context",
);
check(
  "the title is captured",
  main?.title === "System Context diagram for Internet Banking System" &&
    file.metadata.title === main?.title,
);
check(
  "all 12 elements are present as nodes",
  main?.nodes.length === 12 &&
    [
      "customerA",
      "customerB",
      "customerC",
      "customerD",
      "SystemAA",
      "SystemE",
      "SystemA",
      "SystemB",
      "SystemC",
      "SystemD",
      "SystemF",
      "SystemG",
    ].every((id) => nodeById.has(id)),
  `got: ${main?.nodes.map((n) => n.id).join(", ")}`,
);

/* --- element types and text --- */

check(
  "Person maps to type person",
  nodeById.get("customerA")?.type === "person",
);
check(
  "customerA keeps name and description",
  nodeById.get("customerA")?.name === "Banking Customer A" &&
    nodeById.get("customerA")?.description ===
      "A customer of the bank, with personal bank accounts.",
);
check(
  "customerB's absent description is omitted, not empty",
  nodeById.get("customerB")?.description === undefined &&
    !("description" in nodeById.get("customerB")),
);
check(
  "Person_Ext (customerC) stays type person and is marked external",
  nodeById.get("customerC")?.type === "person" &&
    tagsOf("customerC").includes("external"),
);
check(
  "customerD's <br/> becomes a real line break",
  nodeById.get("customerD")?.description ===
    "A customer of the bank, \n with personal bank accounts.",
  JSON.stringify(nodeById.get("customerD")?.description),
);
check(
  "System maps to softwareSystem",
  nodeById.get("SystemAA")?.type === "softwareSystem" &&
    nodeById.get("SystemA")?.type === "softwareSystem" &&
    nodeById.get("SystemB")?.type === "softwareSystem",
);
check(
  "SystemDb_Ext (SystemE) maps to externalSystem tagged database + external",
  nodeById.get("SystemE")?.type === "externalSystem" &&
    tagsOf("SystemE").includes("database") &&
    tagsOf("SystemE").includes("external"),
  JSON.stringify(nodeById.get("SystemE")),
);
check(
  "System_Ext (SystemC) maps to externalSystem",
  nodeById.get("SystemC")?.type === "externalSystem" &&
    tagsOf("SystemC").includes("external"),
);
check(
  "SystemDb (SystemD) maps to softwareSystem tagged database (context level has no database type)",
  nodeById.get("SystemD")?.type === "softwareSystem" &&
    tagsOf("SystemD").includes("database"),
);
check(
  "SystemQueue (SystemF) maps to softwareSystem tagged queue",
  nodeById.get("SystemF")?.type === "softwareSystem" &&
    tagsOf("SystemF").includes("queue"),
);
check(
  "SystemQueue_Ext (SystemG) maps to externalSystem tagged queue + external",
  nodeById.get("SystemG")?.type === "externalSystem" &&
    tagsOf("SystemG").includes("queue") &&
    tagsOf("SystemG").includes("external"),
);

/* --- relationships --- */

const edgeByPair = new Map(
  main.edges.map((e) => [`${e.source}->${e.target}`, e]),
);
check("all 4 relationships are present", main?.edges.length === 4);
check(
  "BiRel(customerA, SystemAA) is bidirectional with label",
  edgeByPair.get("customerA->SystemAA")?.direction === "bidirectional" &&
    edgeByPair.get("customerA->SystemAA")?.label === "Uses",
);
check(
  "BiRel(SystemAA, SystemE) is bidirectional",
  edgeByPair.get("SystemAA->SystemE")?.direction === "bidirectional",
);
check(
  'Rel(SystemAA, SystemC, "Sends e-mails", "SMTP") keeps its technology',
  edgeByPair.get("SystemAA->SystemC")?.direction === "forward" &&
    edgeByPair.get("SystemAA->SystemC")?.label === "Sends e-mails" &&
    edgeByPair.get("SystemAA->SystemC")?.technology === "SMTP",
);
check(
  "Rel(SystemC, customerA) is one-way with no technology",
  edgeByPair.get("SystemC->customerA")?.direction === "forward" &&
    edgeByPair.get("SystemC->customerA")?.technology === undefined,
);

/* --- boundaries --- */

console.log("boundary representation");

const ext = file["x-mermaid"];
const boundaries = ext?.boundaries?.[main.id] ?? [];
const boundaryById = new Map(boundaries.map((b) => [b.id, b]));

check(
  "all 4 boundaries are recorded in x-mermaid.boundaries",
  boundaries.length === 4 &&
    ["b0", "b1", "b2", "b3"].every((id) => boundaryById.has(id)),
  JSON.stringify(boundaries),
);
check(
  "boundary kinds and labels survive",
  boundaryById.get("b0")?.kind === "enterprise" &&
    boundaryById.get("b0")?.label === "BankBoundary0" &&
    boundaryById.get("b2")?.kind === "system" &&
    boundaryById.get("b3")?.kind === "generic" &&
    boundaryById.get("b3")?.typeLabel === "boundary",
);
check(
  "nesting is preserved (b0 ⊃ b1 ⊃ b2, b1 ⊃ b3)",
  boundaryById.get("b0")?.parentId === null &&
    boundaryById.get("b1")?.parentId === "b0" &&
    boundaryById.get("b2")?.parentId === "b1" &&
    boundaryById.get("b3")?.parentId === "b1",
);
check(
  "membership tags name each node's innermost boundary",
  tagsOf("customerA").includes("boundary:b0") &&
    tagsOf("SystemE").includes("boundary:b1") &&
    tagsOf("SystemA").includes("boundary:b2") &&
    tagsOf("SystemB").includes("boundary:b2") &&
    tagsOf("SystemF").includes("boundary:b3") &&
    tagsOf("SystemG").includes("boundary:b3"),
);

/* --- validator + level legality --- */

console.log("model validity");

try {
  validateArchLabFile(JSON.parse(JSON.stringify(file)));
  ok("the parsed model passes the editor's validate.ts unchanged");
} catch (error) {
  fail(
    "the parsed model passes the editor's validate.ts unchanged",
    String(error),
  );
}
check(
  "every node type is legal at its diagram's level",
  file.diagrams.every((d) =>
    d.nodes.every((n) => isNodeTypeValidAtLevel(n.type, d.level)),
  ),
);

/* --- layout determinism / sanity --- */

console.log("layout");

const again = parseMermaidC4(SAMPLE);
check(
  "parsing is deterministic (two parses are deep-equal)",
  JSON.stringify(file) === JSON.stringify(again),
);
const posKeys = new Set(
  main.nodes.map((n) => `${n.position.x},${n.position.y}`),
);
check("no two nodes share a position", posKeys.size === main.nodes.length);
check(
  "positions and sizes are integral multiples of 8 meeting the size minimum",
  main.nodes.every(
    (n) =>
      n.position.x % 8 === 0 &&
      n.position.y % 8 === 0 &&
      n.size.width >= 120 &&
      n.size.height >= 64,
  ),
);

/* ----------------------------------------------------------------------- */
/* Round-trip stability                                                     */
/* ----------------------------------------------------------------------- */

console.log("round-trip");

const emitted = serializeMermaidC4(file);
const reparsed = parseMermaidC4(emitted);
check(
  "parse → serialize → parse yields an equivalent model",
  JSON.stringify(reparsed) === JSON.stringify(file),
  (() => {
    const a = JSON.stringify(file, null, 2).split("\n");
    const b = JSON.stringify(reparsed, null, 2).split("\n");
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      if (a[i] !== b[i])
        return `first difference at line ${i + 1}:\n    parse1: ${a[i]}\n    parse2: ${b[i]}`;
    }
    return "";
  })(),
);
check(
  "serialize is idempotent over the round-trip (byte-identical Mermaid)",
  serializeMermaidC4(reparsed) === emitted,
);
check(
  "emitted code re-encodes line breaks as <br/>",
  emitted.includes(
    "A customer of the bank, <br/> with personal bank accounts.",
  ),
);
check(
  "emitted code preserves the element forms",
  [
    "Person_Ext(customerC",
    "SystemDb_Ext(SystemE",
    "SystemDb(SystemD",
    "SystemQueue(SystemF",
    "SystemQueue_Ext(SystemG",
    "BiRel(customerA, SystemAA",
    'Rel(SystemAA, SystemC, "Sends e-mails", "SMTP")',
  ].every((marker) => emitted.includes(marker)),
  emitted,
);
check(
  "emitted code preserves boundary nesting",
  /Enterprise_Boundary\(b0[\s\S]*Enterprise_Boundary\(b1[\s\S]*System_Boundary\(b2[\s\S]*Boundary\(b3, "BankBoundary3", "boundary"\)/.test(
    emitted,
  ),
);

/* --- escaped quotes survive a full cycle --- */

const QUOTED = `C4Context
    title Quotes
    Person(p1, "Says \\"hello\\"", "A \\"quoted\\" description")
    System(s1, "Sys")
    Rel(p1, s1, "asks \\"why\\"")
`;
const quotedFile = parseMermaidC4(QUOTED);
const quotedNode = quotedFile.diagrams[0].nodes.find((n) => n.id === "p1");
check(
  'escaped quotes decode ("Says "hello"") and re-encode stably',
  quotedNode?.name === 'Says "hello"' &&
    quotedNode?.description === 'A "quoted" description' &&
    JSON.stringify(parseMermaidC4(serializeMermaidC4(quotedFile))) ===
      JSON.stringify(quotedFile),
);

/* ----------------------------------------------------------------------- */
/* Other diagram types and their levels                                     */
/* ----------------------------------------------------------------------- */

console.log("diagram types → levels");

const CONTAINER_SRC = `C4Container
    title Container diagram
    Person(user, "User")
    Container_Boundary(cb, "Web App") {
        Container(spa, "SPA", "React", "Single page app")
        ContainerDb(db, "Database", "PostgreSQL 16", "Stores things")
        ContainerQueue(mq, "Bus", "Kafka")
    }
    System_Ext(mail, "Mail system")
    Rel(user, spa, "Uses", "HTTPS")
    Rel_Back(db, spa, "Reads")
    Rel_R(spa, mq, "Publishes")
    Rel_Down(spa, db, "Writes")
`;
const containerFile = parseMermaidC4(CONTAINER_SRC);
const containerMain = containerFile.diagrams.find(
  (d) => d.id === containerFile["x-mermaid"].sourceDiagramId,
);
check(
  "C4Container maps to level container",
  containerMain?.level === "container",
);
check(
  "a container source gets a synthetic context root that drills into it",
  containerFile.diagrams.length === 2 &&
    containerFile.diagrams.find((d) => d.id === containerFile.rootDiagramId)
      ?.level === "context" &&
    containerMain?.parentDiagramId === containerFile.rootDiagramId,
);
check(
  "Container/ContainerDb/ContainerQueue map to container/database/queue with technology kept",
  containerMain?.nodes.find((n) => n.id === "spa")?.type === "container" &&
    containerMain?.nodes.find((n) => n.id === "spa")?.technology === "React" &&
    containerMain?.nodes.find((n) => n.id === "db")?.type === "database" &&
    containerMain?.nodes.find((n) => n.id === "db")?.technology ===
      "PostgreSQL 16" &&
    containerMain?.nodes.find((n) => n.id === "mq")?.type === "queue",
);
check(
  "directional Rel_* variants parse as forward relationships",
  ["e-db-spa", "e-spa-mq", "e-spa-db"].every(
    (id) =>
      containerMain?.edges.find((e) => e.id === id)?.direction === "forward",
  ),
);
try {
  validateArchLabFile(JSON.parse(JSON.stringify(containerFile)));
  ok("the container-source model (with synthetic root) passes validate.ts");
} catch (error) {
  fail(
    "the container-source model (with synthetic root) passes validate.ts",
    String(error),
  );
}
check(
  "container round-trip is stable",
  JSON.stringify(parseMermaidC4(serializeMermaidC4(containerFile))) ===
    JSON.stringify(containerFile),
);

const COMPONENT_SRC = `C4Component
    title Component diagram
    Container_Boundary(api, "API") {
        Component(sign, "Sign-in Controller", "Spring MVC", "Signs users in")
        ComponentDb(store, "Store", "Redis")
    }
    Rel(sign, store, "Reads")
`;
const componentFile = parseMermaidC4(COMPONENT_SRC);
const componentMain = componentFile.diagrams.find(
  (d) => d.id === componentFile["x-mermaid"].sourceDiagramId,
);
check(
  "C4Component maps to level component",
  componentMain?.level === "component",
);
check(
  "a component source gets context + container wrappers (3 diagrams, level chain intact)",
  componentFile.diagrams.length === 3 &&
    componentFile.diagrams.find((d) => d.id === componentFile.rootDiagramId)
      ?.level === "context",
);
try {
  validateArchLabFile(JSON.parse(JSON.stringify(componentFile)));
  ok("the component-source model passes validate.ts");
} catch (error) {
  fail("the component-source model passes validate.ts", String(error));
}
check(
  "component round-trip is stable",
  JSON.stringify(parseMermaidC4(serializeMermaidC4(componentFile))) ===
    JSON.stringify(componentFile),
);

const dynamicFile = parseMermaidC4(
  'C4Dynamic\n    Container(c1, "One")\n    Container(c2, "Two")\n    Rel(c1, c2, "Calls")\n',
);
check(
  "C4Dynamic maps to level container (no dynamic level in arch-lab)",
  dynamicFile.diagrams.find(
    (d) => d.id === dynamicFile["x-mermaid"].sourceDiagramId,
  )?.level === "container",
);
const deployFile = parseMermaidC4(
  'C4Deployment\n    Deployment_Node(aws, "AWS", "Cloud") {\n        Container(web, "Web Server", "nginx")\n    }\n',
);
const deployMain = deployFile.diagrams.find(
  (d) => d.id === deployFile["x-mermaid"].sourceDiagramId,
);
check(
  "C4Deployment maps to level container with Deployment_Node as a boundary",
  deployMain?.level === "container" &&
    deployFile["x-mermaid"]?.boundaries?.[deployMain.id]?.[0]?.kind ===
      "deployment" &&
    deployMain?.nodes[0]?.tags?.includes("boundary:aws"),
);

/* ----------------------------------------------------------------------- */
/* Malformed inputs — every error names a line and column                   */
/* ----------------------------------------------------------------------- */

console.log("malformed inputs");

function expectErrorWith(parse, label, source, expectFragment) {
  let result;
  try {
    result = parse(source);
  } catch (error) {
    if (!(error instanceof MermaidParseError)) {
      fail(label, `expected MermaidParseError, got: ${error}`);
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
    ok(`${label} — "${error.message.slice(0, 100)}"`);
    return;
  }
  fail(
    label,
    `expected a MermaidParseError, but parsing succeeded: ${JSON.stringify(result?.metadata?.title)}`,
  );
}

function expectParseError(label, source, expectFragment) {
  expectErrorWith(parseMermaidC4, label, source, expectFragment);
}

function expectFlowchartError(label, source, expectFragment) {
  expectErrorWith(parseMermaidFlowchart, label, source, expectFragment);
}

expectParseError("empty source is refused", "", "expected a diagram type");
expectParseError(
  "unknown diagram type is refused",
  "flowchart TD\n    a --> b\n",
  "not a Mermaid C4 diagram type",
);
expectParseError(
  "unknown statement keyword is refused",
  'C4Context\n    Persn(a, "A")\n',
  '"Persn" is not a recognised C4 statement',
);
expectParseError(
  "missing closing parenthesis is refused",
  'C4Context\n    Person(a, "A"\n',
  "never closed",
);
expectParseError(
  "unterminated string is refused",
  'C4Context\n    Person(a, "A)\n',
  "never closed",
);
expectParseError(
  "unclosed boundary block is refused",
  'C4Context\n    Enterprise_Boundary(b0, "B") {\n    Person(a, "A")\n',
  'expected "}"',
);
expectParseError(
  "duplicate alias is refused",
  'C4Context\n    Person(a, "A")\n    System(a, "Again")\n',
  'duplicate alias "a"',
);
expectParseError(
  "relationship to an undeclared alias is refused",
  'C4Context\n    Person(a, "A")\n    Rel(a, ghost, "Uses")\n',
  '"ghost" does not resolve',
);
expectParseError(
  "relationship to a boundary is refused",
  'C4Context\n    Enterprise_Boundary(b0, "B") {\n        Person(a, "A")\n    }\n    Rel(a, b0, "Uses")\n',
  "is a boundary, not an element",
);
expectParseError(
  "element without a label is refused",
  "C4Context\n    Person(a)\n",
  "has no name",
);
expectParseError(
  "quoted alias is refused",
  'C4Context\n    Person("a", "A")\n',
  "must be a bare identifier",
);

/* --- all-or-nothing: a failing parse never returns a partial model --- */

{
  const broken = 'C4Context\n    Person(a, "A")\n    Persn(b, "B")\n';
  let threw = false;
  try {
    parseMermaidC4(broken);
  } catch (error) {
    threw = error instanceof MermaidParseError;
  }
  check("a broken parse throws and applies nothing (all-or-nothing)", threw);
}

/* ----------------------------------------------------------------------- */
/* Flowchart dialect                                                        */
/* ----------------------------------------------------------------------- */

console.log("flowchart: .alab → Mermaid → .alab round-trip");

/** Where two models first diverge, for a failure a human can act on. */
function firstDiff(a, b) {
  const left = JSON.stringify(a, null, 2).split("\n");
  const right = JSON.stringify(b, null, 2).split("\n");
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    if (left[i] !== right[i])
      return `first difference at line ${i + 1}:\n    expected: ${left[i]}\n    actual:   ${right[i]}`;
  }
  return "";
}

/* Every shape, both edge label states and a group, inside the survivable
   subset (no desc/[technology]/#tags — the export caveat names those as
   dropped, so a fixture carrying them could never come back equal). The
   timestamps are pinned to the importer's fixed stamp so the whole metadata
   object can be compared, not skirted. */
const FLOW_ALAB = `archlab 1.0 flowchart
title "Order intake"
created "2026-01-01T00:00:00.000Z"
updated "2026-01-01T00:00:00.000Z"

@flowchart
  start s "Order received"
  step validate "Validate cart"
  decision ok "Cart valid?"
  group "Persistence"
    io save "Write order"
    call notify "Notify shipping"
  end done "Done"

  s -> validate
  validate -> ok
  ok -> save : "yes"
  ok -> validate : "no"
  save -> notify
  notify -> done
`;

const flowFile = parseFlowchartText(FLOW_ALAB);
const flowMermaid = serializeMermaidFlowchart(flowFile);
const flowBack = parseMermaidFlowchart(flowMermaid);

/* This is the two-table agreement proof: if the emitter's bracket for any
   shape ever stopped being a bracket the importer maps back to that shape
   (or the arrow/label spelling drifted), the models could not be equal. */
check(
  ".alab → Mermaid → .alab reproduces the model (all six shapes, labelled and unlabelled edges, a group, the title)",
  JSON.stringify(flowBack) === JSON.stringify(flowFile),
  firstDiff(flowFile, flowBack),
);
check(
  "flowchart serialize is idempotent over the round-trip (byte-identical Mermaid)",
  serializeMermaidFlowchart(flowBack) === flowMermaid,
);
/* The reimported model must still be a model the .alab serializer accepts
   and reproduces — otherwise the importer can emit files this app then
   refuses to save, which is the worst possible import. */
check(
  "the reimported model round-trips through .alab text byte-identically",
  serializeFlowchartText(flowBack) === serializeFlowchartText(flowFile),
);
check(
  "the emitted Mermaid spells each shape with its table bracket and the title as frontmatter",
  [
    's(["Order received"])',
    'validate["Validate cart"]',
    'ok{"Cart valid?"}',
    'save[/"Write order"/]',
    'notify[["Notify shipping"]]',
    'done(["Done"])',
    'subgraph sg1 ["Persistence"]',
    "ok -->|yes| save",
    'title: "Order intake"',
  ].every((marker) => flowMermaid.includes(marker)),
  flowMermaid,
);

/* --- headers and directions: layout must never leak into the model --- */

check(
  '"graph" (the older header word) parses to the same model as "flowchart"',
  JSON.stringify(
    parseMermaidFlowchart(flowMermaid.replace("flowchart TD", "graph TD")),
  ) === JSON.stringify(flowBack),
);
check(
  "all five direction tokens parse to the same model — direction is layout, not data, so changing it must not show up in a diff of the model",
  ["TD", "TB", "BT", "LR", "RL"].every(
    (direction) =>
      JSON.stringify(
        parseMermaidFlowchart(
          flowMermaid.replace("flowchart TD", `flowchart ${direction}`),
        ),
      ) === JSON.stringify(flowBack),
  ),
);
check(
  "the direction option changes only the header line of the output",
  serializeMermaidFlowchart(flowFile, { direction: "LR" }) ===
    flowMermaid.replace("flowchart TD", "flowchart LR"),
);

/* --- importing hand-written Mermaid forms --- */

console.log("flowchart: Mermaid source forms");

const FLOW_SRC = `flowchart LR
    a([Start]) --> b[Do thing]
    b --> c{OK?}
    c -->|yes| d[/Write/]
    c -- no --> e[[Retry]]
    d --- f(Finish)
    e --> f
`;
const srcFile = parseMermaidFlowchart(FLOW_SRC);
const srcShape = (id) => srcFile.nodes.find((n) => n.id === id)?.shape;
check(
  "each bracket form maps to its shape, and both terminator brackets resolve by the arrows (no incoming = start, incoming = end)",
  srcShape("a") === "start" &&
    srcShape("b") === "step" &&
    srcShape("c") === "decision" &&
    srcShape("d") === "io" &&
    srcShape("e") === "call" &&
    srcShape("f") === "end",
  JSON.stringify(srcFile.nodes),
);
check(
  "both edge label spellings (-->|yes| and -- no -->) land on the edge label",
  srcFile.edges.find((e) => e.from === "c" && e.to === "d")?.label === "yes" &&
    srcFile.edges.find((e) => e.from === "c" && e.to === "e")?.label === "no",
  JSON.stringify(srcFile.edges),
);
check(
  "an undirected --- link imports as a directed edge reading left to right — refusing it would reject half the flowcharts in the wild, and the caveat names the imposed direction",
  srcFile.edges.some(
    (e) => e.from === "d" && e.to === "f" && e.label === undefined,
  ),
);
check(
  "an import always yields a model the .alab flowchart serializer accepts and reproduces",
  JSON.stringify(parseFlowchartText(serializeFlowchartText(srcFile))) ===
    JSON.stringify(srcFile),
);

const chainFile = parseMermaidFlowchart("flowchart TD\n    a --> b --> c\n");
check(
  "a chained statement expands to consecutive edges in narration order",
  JSON.stringify(chainFile.edges) ===
    JSON.stringify([
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ]),
  JSON.stringify(chainFile.edges),
);
const fanFile = parseMermaidFlowchart(
  "flowchart TD\n    a --> b & c\n    x & y --> z\n",
);
check(
  "& lists fan out one edge per pair, in reading order",
  JSON.stringify(fanFile.edges) ===
    JSON.stringify([
      { from: "a", to: "b" },
      { from: "a", to: "c" },
      { from: "x", to: "z" },
      { from: "y", to: "z" },
    ]),
  JSON.stringify(fanFile.edges),
);
const oldStyle = parseMermaidFlowchart("graph TD;\n    p-->q;\n");
check(
  'the old "graph TD;" spelling (trailing semicolons, unspaced arrows) still imports — a huge share of snippets in the wild are written this way',
  oldStyle.nodes.length === 2 &&
    JSON.stringify(oldStyle.edges) === JSON.stringify([{ from: "p", to: "q" }]),
);
const collapsed = parseMermaidFlowchart(
  "flowchart TD\n    a -.-> b ==> c --- d\n    a -. later .-> d\n",
);
check(
  "dotted, thick and open links all collapse to the one model edge (the caveat's documented loss), keeping their labels",
  JSON.stringify(collapsed.edges) ===
    JSON.stringify([
      { from: "a", to: "b" },
      { from: "b", to: "c" },
      { from: "c", to: "d" },
      { from: "a", to: "d", label: "later" },
    ]),
  JSON.stringify(collapsed.edges),
);

/* --- ids: deterministic normalisation --- */

const weird = parseMermaidFlowchart(
  "flowchart TD\n    weird*id[One] --> weird_id[Two]\n",
);
check(
  "an id outside the slug alphabet is renamed and a collision takes a numbered suffix in first-come order — nondeterministic renames would break diffs between two imports of the same file",
  JSON.stringify(weird.nodes.map((n) => n.id)) ===
    JSON.stringify(["weird_id", "weird_id_2"]) &&
    weird.edges[0]?.from === "weird_id" &&
    weird.edges[0]?.to === "weird_id_2",
  JSON.stringify(weird.nodes),
);
check(
  "the same input always produces the same ids (two parses are deep-equal)",
  JSON.stringify(weird) ===
    JSON.stringify(
      parseMermaidFlowchart(
        "flowchart TD\n    weird*id[One] --> weird_id[Two]\n",
      ),
    ),
);

/* --- subgraphs and groups --- */

const grouped = parseMermaidFlowchart(
  [
    "flowchart TD",
    "    x[Outside]",
    "    subgraph s1 [Inside]",
    "        m1[M1] --> m2[M2]",
    "    end",
    "    x --> m1",
    "",
  ].join("\n"),
);
check(
  "a subgraph becomes a group over exactly the nodes it introduces, and a cross-link into it stays just a link",
  JSON.stringify(grouped.groups) ===
    JSON.stringify([{ label: "Inside", nodes: ["m1", "m2"] }]) &&
    grouped.nodes.map((n) => n.id).join(",") === "x,m1,m2",
  JSON.stringify(grouped.groups),
);
const emptyGroup = parseMermaidFlowchart(
  "flowchart TD\n    subgraph s1 [Empty]\n    end\n    a[A]\n",
);
check(
  "an empty subgraph is dropped, not kept — a bracket over no nodes has no drawing, the same rule the sequence importer applies to an empty box",
  !("groups" in emptyGroup),
);

/* --- titles --- */

check(
  "a source without frontmatter gets the default title",
  parseMermaidFlowchart("flowchart TD\n    a\n").metadata.title ===
    "Untitled flowchart",
);
const fronted = parseMermaidFlowchart(
  "---\ntitle: Checkout flow\nconfig: dropped\n---\nflowchart LR\n    a --> b\n",
);
check(
  "a hand-written (unquoted) frontmatter title survives and other frontmatter keys are dropped",
  fronted.metadata.title === "Checkout flow",
);

/* --- malformed flowcharts: refused, never silently mis-modelled --- */

console.log("flowchart: malformed inputs");

/* The circle `((...))` was REFUSED here until a real user document arrived
   drawn entirely with circle actors — a refusal that renders nothing lost to
   a named approximation that renders the chart. It now imports as a
   terminator (resolved by the arrows like the other two round brackets); the
   assertions moved to the "user-reported document" section below. The three
   refusals that SURVIVE are each pinned, because each mapping candidate
   would mislead (the reasons live on REFUSED_NODE_FORMS). */
expectFlowchartError(
  "a hexagon is refused by name — Mermaid's preparation symbol; mapping it to decision would invent a branch point, mapping it to step erases its meaning",
  "flowchart TD\n    a{{Hex}}\n",
  "hexagon",
);
expectFlowchartError(
  "a cylinder is refused by name — a data STORE; io or step would repaint a database as an action",
  "flowchart TD\n    a[(DB)]\n",
  "cylinder",
);
expectFlowchartError(
  "an asymmetric flag is refused by name — no arch-lab shape keeps the asymmetry that is its meaning",
  "flowchart TD\n    a>Flag]\n",
  "flag",
);
expectFlowchartError(
  "a two-headed arrow is refused — a model edge has one direction, and importing <--> as one arrow would silently delete the other half",
  "flowchart TD\n    a <--> b\n",
  "one direction",
);
expectFlowchartError(
  'a single-dash "->" is refused with the fix in the message',
  "flowchart TD\n    a -> b\n",
  "two dashes",
);
expectFlowchartError(
  "nested subgraphs are refused — arch-lab groups do not nest",
  "flowchart TD\n    subgraph s1 [A]\n    subgraph s2 [B]\n    end\n    end\n",
  "do not nest",
);
expectFlowchartError(
  "an unclosed subgraph is refused, blaming the opener's line",
  "flowchart TD\n    subgraph s1 [A]\n    a[A]\n",
  "never closed",
);
expectFlowchartError(
  'an unmatched "end" is refused',
  "flowchart TD\n    end\n",
  'unmatched "end"',
);
expectFlowchartError(
  "a sequenceDiagram header is refused — routing it to the wrong parser would produce misleading errors",
  "sequenceDiagram\n    A->>B: hi\n",
  "not a flowchart header",
);
expectFlowchartError(
  "empty source is refused",
  "",
  'expected "flowchart <direction>"',
);
expectFlowchartError(
  "an unknown direction word is refused",
  "flowchart XX\n    a --> b\n",
  "not a flowchart direction",
);
expectFlowchartError(
  "an edge to a subgraph id is refused — auto-declaring a node named after the subgraph would silently split one thing into two",
  "flowchart TD\n    subgraph s1 [G]\n        a[A]\n    end\n    b[B] --> s1\n",
  "is a subgraph, not a node",
);
expectFlowchartError(
  "defining a node twice is refused — the second bracket would silently overwrite the first label",
  "flowchart TD\n    a[One]\n    a[Two]\n",
  "defined twice",
);
expectFlowchartError(
  "defining an already-used node inside a subgraph is refused — membership is fixed by first mention because groups are contiguous runs of the declaration order",
  "flowchart TD\n    a --> b\n    subgraph s1 [G]\n        b[Named]\n    end\n",
  "fixed by first mention",
);
expectFlowchartError(
  "an empty node label is refused — the model requires the text a symbol draws",
  "flowchart TD\n    a[]\n",
  "empty label",
);

/* The caret must land on the offending bracket, not the line start —
   an editor gutter marker one token off sends the author hunting. */
{
  let placed = false;
  try {
    parseMermaidFlowchart("flowchart TD\n    a{{Hex}}\n");
  } catch (error) {
    placed =
      error instanceof MermaidParseError &&
      error.line === 2 &&
      error.column === 6;
    if (!placed)
      fail(
        "the refused-shape error points at the bracket itself (line 2, column 6)",
        `got line ${error.line}, column ${error.column}`,
      );
  }
  if (placed)
    ok(
      "the refused-shape error points at the bracket itself (line 2, column 6)",
    );
}

/* --- the user-reported document, verbatim -------------------------------- */

/*
 * A real document a user pasted and this importer REFUSED (the circle
 * actors), kept verbatim as a fixture so the exact failure cannot return.
 * It concentrates five things no other fixture has together: `((...))`
 * circle nodes, a subgraph with an id AND a bracketed display title, Thai
 * (non-Latin, spaceless) labels, NO explicit start terminator (every
 * terminator's role comes from the arrows), and the LR direction the
 * importer drops.
 *
 * The same text is now ALSO the use-case dialect's happy-path fixture (the
 * section below): `detectMermaidUseCase` routes it to `parseMermaidUseCase`,
 * which is the reading the author meant. The assertions HERE call
 * `parseMermaidFlowchart` directly and pin the FALLBACK reading — the
 * flowchart importer must keep accepting this document, because a caller
 * that skips detection (or a user who asks for the flowchart reading) still
 * lands on it.
 */

console.log("flowchart: the user-reported Thai use-case document");

const USER_THAI_DOC = `flowchart LR
    %% กำหนดผู้ใช้งาน (Actors)
    Customer((ลูกค้า))
    Admin((ผู้ดูแลระบบ))

    %% กรอบของระบบเรา (System Boundary)
    subgraph MyService [Food Delivery Service]
        UC1([ค้นหาร้านอาหาร])
        UC2([สั่งอาหารและชำระเงิน])
        UC3([จัดการเมนูอาหาร])
        UC4([ดูรายงานยอดขาย])
    end

    Customer --> UC1
    Customer --> UC2

    Admin --> UC1
    Admin --> UC3
    Admin --> UC4
`;

const thaiDoc = parseMermaidFlowchart(USER_THAI_DOC);
check(
  "the user's document parses at all — this exact text was refused wholesale when circles sat on the refusal list",
  thaiDoc.nodes.length === 6 && thaiDoc.edges.length === 5,
  JSON.stringify(thaiDoc.nodes.map((n) => n.id)),
);
check(
  "circle actors with no incoming arrows import as start terminators — the document has no explicit start, so the arrows are the only signal and they must be enough",
  thaiDoc.nodes.find((n) => n.id === "Customer")?.shape === "start" &&
    thaiDoc.nodes.find((n) => n.id === "Admin")?.shape === "start",
  JSON.stringify(thaiDoc.nodes.map((n) => [n.id, n.shape])),
);
check(
  "the stadium use-cases (all with incoming arrows) resolve as end terminators",
  ["UC1", "UC2", "UC3", "UC4"].every(
    (id) => thaiDoc.nodes.find((n) => n.id === id)?.shape === "end",
  ),
);
check(
  "the subgraph's bracketed DISPLAY title becomes the group label — labelling the group with the id would put `MyService` on screen where the author wrote `Food Delivery Service`",
  JSON.stringify(thaiDoc.groups) ===
    JSON.stringify([
      { label: "Food Delivery Service", nodes: ["UC1", "UC2", "UC3", "UC4"] },
    ]),
  JSON.stringify(thaiDoc.groups),
);
check(
  "Thai labels survive import byte-for-byte — a codec that mangles non-Latin text fails silently for every reader who cannot proofread it",
  thaiDoc.nodes.find((n) => n.id === "Customer")?.label === "ลูกค้า" &&
    thaiDoc.nodes.find((n) => n.id === "UC2")?.label === "สั่งอาหารและชำระเงิน",
);
check(
  "the user's document round-trips to .alab and back model-equal — import must yield a file this app can save and reopen",
  JSON.stringify(parseFlowchartText(serializeFlowchartText(thaiDoc))) ===
    JSON.stringify(thaiDoc),
);
check(
  "the LR direction parses and is dropped — the model is identical under TD, so layout cannot leak into the file",
  JSON.stringify(
    parseMermaidFlowchart(
      USER_THAI_DOC.replace("flowchart LR", "flowchart TD"),
    ),
  ) === JSON.stringify(thaiDoc),
);

/* ----------------------------------------------------------------------- */
/* Use-case dialect                                                         */
/* ----------------------------------------------------------------------- */

/*
 * Mermaid has no use-case diagram — `parseMermaidUseCase` reads the
 * flowchart CONVENTION for one (circles = actors, stadiums = use cases,
 * subgraph = system boundary), and `detectMermaidUseCase` decides which
 * reading a flowchart-headed paste gets. The two failure modes this section
 * exists to prevent pull in opposite directions: a use-case document
 * silently mis-modelled as a flow (the bug the dialect fixes), and a
 * genuine flowchart silently stolen by the heuristic (the bug the dialect
 * must not introduce). Both are pinned below.
 */

console.log("usecase: the user's document gets the use-case reading");

check(
  "the user's Thai document DETECTS as a use-case diagram — this is the document that was silently mis-modelled as a flowchart (actors became starts, use cases became ends), the concrete bug the dialect exists to fix",
  detectMermaidUseCase(USER_THAI_DOC) === true,
);

const thaiUC = parseMermaidUseCase(USER_THAI_DOC);
check(
  "two circle actors and four stadium use cases, in declaration order — the shapes carry the kinds, so a swap here is the original mis-modelling back again",
  JSON.stringify(thaiUC.elements.map((e) => [e.id, e.kind])) ===
    JSON.stringify([
      ["Customer", "actor"],
      ["Admin", "actor"],
      ["UC1", "usecase"],
      ["UC2", "usecase"],
      ["UC3", "usecase"],
      ["UC4", "usecase"],
    ]),
  JSON.stringify(thaiUC.elements),
);
check(
  "one boundary labelled with the subgraph's DISPLAY title over the four use cases — labelling it with the id would put `MyService` on screen where the author wrote `Food Delivery Service`",
  JSON.stringify(thaiUC.boundaries) ===
    JSON.stringify([
      {
        label: "Food Delivery Service",
        usecases: ["UC1", "UC2", "UC3", "UC4"],
      },
    ]),
  JSON.stringify(thaiUC.boundaries),
);
check(
  "five associations in narration order, arrowheads dropped (a UML association is undirected — the caveat's named loss) and none invented",
  JSON.stringify(thaiUC.edges) ===
    JSON.stringify(
      [
        ["Customer", "UC1"],
        ["Customer", "UC2"],
        ["Admin", "UC1"],
        ["Admin", "UC3"],
        ["Admin", "UC4"],
      ].map(([from, to]) => ({ kind: "association", from, to })),
    ),
  JSON.stringify(thaiUC.edges),
);
check(
  "Thai labels survive byte-for-byte — a codec that mangles non-Latin text fails silently for every reader who cannot proofread it",
  thaiUC.elements.find((e) => e.id === "Customer")?.label === "ลูกค้า" &&
    thaiUC.elements.find((e) => e.id === "Admin")?.label === "ผู้ดูแลระบบ" &&
    thaiUC.elements.find((e) => e.id === "UC2")?.label ===
      "สั่งอาหารและชำระเงิน",
);
check(
  "the imported model round-trips through .alab text losslessly — import must yield a file this app can save and reopen",
  JSON.stringify(parseUseCaseText(serializeUseCaseText(thaiUC))) ===
    JSON.stringify(thaiUC),
  firstDiff(thaiUC, parseUseCaseText(serializeUseCaseText(thaiUC))),
);
check(
  "the imported model round-trips through the use-case dialect's OWN emitter — the two-table agreement proof for this dialect",
  JSON.stringify(parseMermaidUseCase(serializeMermaidUseCase(thaiUC))) ===
    JSON.stringify(thaiUC),
  firstDiff(thaiUC, parseMermaidUseCase(serializeMermaidUseCase(thaiUC))),
);
check(
  '"graph" and every direction token parse to the same use-case model — the header word and layout must not leak into the model, same contract as the flowchart dialect',
  JSON.stringify(
    parseMermaidUseCase(USER_THAI_DOC.replace("flowchart LR", "graph LR")),
  ) === JSON.stringify(thaiUC) &&
    ["TD", "TB", "BT", "LR", "RL"].every(
      (direction) =>
        JSON.stringify(
          parseMermaidUseCase(
            USER_THAI_DOC.replace("flowchart LR", `flowchart ${direction}`),
          ),
        ) === JSON.stringify(thaiUC),
    ),
);

/* --- a genuine flowchart is NEVER stolen --------------------------------- */

console.log("usecase: genuine flowcharts are not stolen");

/** Pins BOTH verdicts on one source: the detector says flowchart, and the
 * flowchart importer still accepts it — a detector that said "no" while the
 * flowchart parser also refused would strand the document entirely. */
function checkNotStolen(label, source) {
  let flowchartParses = false;
  try {
    parseMermaidFlowchart(source);
    flowchartParses = true;
  } catch {
    /* asserted below */
  }
  check(
    label,
    detectMermaidUseCase(source) === false && flowchartParses,
    `detect=${detectMermaidUseCase(source)}, flowchartParses=${flowchartParses}`,
  );
}

checkNotStolen(
  "a flowchart with a decision, labelled branches and every shape (the reference FLOW_SRC) stays a flowchart — stealing it would render a control flow as participants, the dialect's own bug mirrored",
  FLOW_SRC,
);
checkNotStolen(
  "circles + a subgraph are NOT enough when a step node appears — one flowchart-only shape is a stronger signal than any count of circles",
  [
    "flowchart TD",
    "    a((poll))",
    "    subgraph s [loop]",
    "        b([wait])",
    "    end",
    "    a --> b",
    "    c[log it]",
    "",
  ].join("\n"),
);
checkNotStolen(
  "circles + a subgraph are NOT enough when an edge carries a branch label — labelled directed edges are the signature of a flow, and the use-case reading only knows the closed |generalizes| word",
  [
    "flowchart TD",
    "    a((poll))",
    "    subgraph s [loop]",
    "        b([wait])",
    "    end",
    "    a -->|retry| b",
    "",
  ].join("\n"),
);
checkNotStolen(
  "no subgraph, no theft — without a system boundary the document does not read as a use-case diagram, however many circles it draws",
  "flowchart TD\n    a((idle)) --> b([done])\n",
);
checkNotStolen(
  "no circle, no theft — a subgraph of stadiums with an outside stadium is a flowchart with terminators, not actors against a system",
  [
    "flowchart TD",
    "    a([start])",
    "    subgraph s [work]",
    "        b([mid])",
    "    end",
    "    a --> b",
    "",
  ].join("\n"),
);
checkNotStolen(
  "chained round nodes are NOT stolen — a flowchart FLOWS, so its steps point at each other, and under the use-case reading a stadium-to-stadium plain arrow is an illegal use-case-to-use-case association; this is the rule that keeps terminator-only flowcharts safe",
  [
    "flowchart TD",
    "    a((go))",
    "    subgraph s [pipeline]",
    "        b([fetch])",
    "        c([store])",
    "    end",
    "    a --> b",
    "    b --> c",
    "",
  ].join("\n"),
);
check(
  "garbage detects as NOT a use-case diagram instead of throwing — the detector is a router, and a router that throws strands the paste before any parser can name the real problem",
  detectMermaidUseCase("") === false &&
    detectMermaidUseCase("sequenceDiagram\n    A->>B: hi\n") === false,
);

/* --- .alab → Mermaid → .alab: all three edge kinds ----------------------- */

console.log("usecase: .alab → Mermaid → .alab round-trip");

/* All three edge kinds, both association label states, a boundary and an
   element outside it, inside the survivable subset (no desc/[technology]/
   #tags/tint — the export caveat names those as dropped). Timestamps pinned
   to the importer's fixed stamp so the whole metadata object compares. */
const USECASE_ALAB = `archlab 1.0 usecase
title "Food delivery"
created "2026-01-01T00:00:00.000Z"
updated "2026-01-01T00:00:00.000Z"

@usecase
  actor customer "Customer"
  actor admin "Administrator"
  boundary "Delivery"
    usecase search "Find restaurants"
    usecase order "Order and pay"
    usecase pay "Take payment"
  usecase report "Read the reports"

  customer -- search
  customer -- order : "as guest"
  order ..> pay : include
  report ..> order : extend
  admin --|> customer
  admin -- report
`;

const ucFile = parseUseCaseText(USECASE_ALAB);
const ucMermaid = serializeMermaidUseCase(ucFile);
const ucBack = parseMermaidUseCase(ucMermaid);

/* The two-table agreement proof: if the emitter's bracket for a kind ever
   stopped being a bracket the importer maps back to that kind (or an edge
   spelling drifted off the closed vocabulary), the models could not be
   equal. */
check(
  ".alab → Mermaid → .alab reproduces the model (both kinds, all three edge kinds, labelled and unlabelled associations, a boundary and a free use case)",
  JSON.stringify(ucBack) === JSON.stringify(ucFile),
  firstDiff(ucFile, ucBack),
);
check(
  "use-case serialize is idempotent over the round-trip (byte-identical Mermaid)",
  serializeMermaidUseCase(ucBack) === ucMermaid,
);
check(
  "the reimported model round-trips through .alab text byte-identically — otherwise the importer can emit files this app then refuses to save",
  serializeUseCaseText(ucBack) === serializeUseCaseText(ucFile),
);
check(
  "the emitted Mermaid spells each kind and edge with its table form: circle actors, stadium use cases, a subgraph boundary, --- associations, |include|/|extend| on dashed arrows, |generalizes| on a solid one, the title as frontmatter",
  [
    'customer(("Customer"))',
    'subgraph sg1 ["Delivery"]',
    'search(["Find restaurants"])',
    'report(["Read the reports"])',
    "customer --- search",
    "customer ---|as guest| order",
    "order -.->|include| pay",
    "report -.->|extend| order",
    "admin -->|generalizes| customer",
    'title: "Food delivery"',
  ].every((marker) => ucMermaid.includes(marker)),
  ucMermaid,
);
check(
  "the emitter's own output passes the detector — an export the importer would route back to the flowchart reading would flip kind on a save/reopen cycle",
  detectMermaidUseCase(ucMermaid) === true,
);

/* --- source forms and ids ------------------------------------------------ */

console.log("usecase: source forms");

check(
  "a round (single-paren) node imports as a use case, like the stadium — real documents use the two interchangeably for the ellipse",
  parseMermaidUseCase(
    "flowchart LR\n    a((A)) --> b(Do thing)\n",
  ).elements.find((e) => e.id === "b")?.kind === "usecase",
);
check(
  "a subgraph with no bracketed title labels the boundary with its name — the fallback when there is no display title to prefer",
  JSON.stringify(
    parseMermaidUseCase(
      "flowchart LR\n    a((A))\n    subgraph Backoffice\n        b([B])\n    end\n    a --> b\n",
    ).boundaries,
  ) === JSON.stringify([{ label: "Backoffice", usecases: ["b"] }]),
);
check(
  "a source without frontmatter gets the default title, and a frontmatter title survives",
  parseMermaidUseCase(USER_THAI_DOC).metadata.title ===
    "Untitled use-case diagram" &&
    parseMermaidUseCase(`---\ntitle: Deliveries\n---\n${USER_THAI_DOC}`)
      .metadata.title === "Deliveries",
);
{
  const weirdSrc =
    "flowchart LR\n    weird*id((A)) --> weird_id([B])\n    subgraph s [S]\n        weird_id2([C])\n    end\n    weird*id --> weird_id2\n";
  const weirdUC = parseMermaidUseCase(weirdSrc);
  check(
    "ids outside the slug alphabet are renamed deterministically with first-come collision suffixes — the flowchart importer's exact rule, so the two readings of one document cannot rename differently",
    JSON.stringify(weirdUC.elements.map((e) => e.id)) ===
      JSON.stringify(["weird_id", "weird_id_2", "weird_id2"]) &&
      JSON.stringify(weirdUC) === JSON.stringify(parseMermaidUseCase(weirdSrc)),
    JSON.stringify(weirdUC.elements),
  );
}

/* --- malformed and flowchart-flavoured inputs: located, teaching errors --- */

console.log("usecase: refused inputs");

function expectUseCaseError(label, source, expectFragment) {
  expectErrorWith(parseMermaidUseCase, label, source, expectFragment);
}

expectUseCaseError(
  "a bare dashed arrow is refused — without |include|/|extend| it is ambiguous in exactly the way the use-case model exists to avoid",
  "flowchart LR\n    a((A))\n    subgraph s [S]\n        b([B])\n    end\n    b -.-> b\n",
  "stereotype",
);
expectUseCaseError(
  "a labelled solid arrow outside |generalizes| is refused and the error names the flowchart importer — absorbing it would steal the branch label that marks a genuine flowchart",
  "flowchart LR\n    a((A)) -->|uses| b([B])\n",
  "import this document as a flowchart",
);
expectUseCaseError(
  "a flowchart-only shape (a {decision}) is refused by name with the flowchart importer as the way out",
  "flowchart LR\n    a((A)) --> b{OK?}\n",
  "flowchart shape",
);
expectUseCaseError(
  "an actor declared inside a subgraph is refused — the subgraph IS the system boundary in this reading, and an actor stands outside it",
  "flowchart LR\n    subgraph s [S]\n        a((A))\n    end\n",
  "stands outside",
);
expectUseCaseError(
  "an association between two actors is refused — same-kind pairs are a different statement wearing the wrong line, the .alab parser's rule applied at the Mermaid gate",
  "flowchart LR\n    a((A)) --> b((B))\n",
  "cannot join two actors",
);
expectUseCaseError(
  "an «include» whose endpoint is an actor is refused — an actor cannot include or extend behaviour",
  "flowchart LR\n    a((A)) -.->|include| b([B])\n",
  "cannot include or extend",
);
expectUseCaseError(
  "a generalization across kinds is refused — it joins two elements of the same kind",
  "flowchart LR\n    a((A)) -->|generalizes| b([B])\n",
  "same kind",
);
expectUseCaseError(
  "a thick link is refused as a flowchart spelling rather than silently absorbed",
  "flowchart LR\n    a((A)) ==> b([B])\n",
  "flowchart spelling",
);

/* The caret must land on the offending bracket, not the line start — the
   same editor-gutter contract the flowchart dialect pins. */
{
  let placed = false;
  try {
    parseMermaidUseCase("flowchart LR\n    a{Choice}\n");
  } catch (error) {
    placed =
      error instanceof MermaidParseError &&
      error.line === 2 &&
      error.column === 6;
    if (!placed)
      fail(
        "the refused-shape error points at the bracket itself (line 2, column 6)",
        `got line ${error.line}, column ${error.column}`,
      );
  }
  if (placed)
    ok(
      "the refused-shape error points at the bracket itself (line 2, column 6)",
    );
}

/* ----------------------------------------------------------------------- */
/* Mermaid erDiagram <-> .alab er                                          */
/* ----------------------------------------------------------------------- */

/*
 * The ER dialect is the only one here whose conversion is TWO-WAY AND TOTAL
 * over the diagram's substance, because Mermaid has a real `erDiagram` rather
 * than a convention someone writes in a flowchart. These assertions exist to
 * keep that claim true — every one of them is a way "total" could quietly
 * become "lossy" without anyone noticing:
 *
 *   - a composite key losing half of itself (`PK,FK` read as `PK`) — a real
 *     bug this suite caught, and the reason `keys` is an array at all;
 *   - a column type Mermaid's own parser cannot hold (`numeric(10,2)`) being
 *     emitted verbatim, which produces an export that looks fine until
 *     something tries to render it;
 *   - an unlabelled relationship coming back labelled `""`, because Mermaid
 *     requires a label where `.alab` makes it optional.
 */

console.log("\nmermaid erDiagram <-> .alab er");

const ER_ALAB = `archlab 1.0 er
title "Order database"

@er
  entity customer "Customer"
    attr id uuid pk
    attr email string uk
      desc "Login identity"
  entity order_line "Order line"
    attr id uuid pk
    attr order_id uuid pk fk
    attr tags text[]
  entity audit "Audit"

  customer ||--o{ order_line : places
  order_line }o..|| audit
`;

{
  const model = parseErText(ER_ALAB);
  const mermaid = serializeMermaidEr(model);

  check(
    "an exported erDiagram is detected as one",
    detectMermaidEr(mermaid),
    mermaid,
  );
  check(
    "a use-case reading is not offered for an erDiagram",
    !detectMermaidUseCase(mermaid),
    "detectMermaidUseCase claimed an erDiagram",
  );

  const back = parseMermaidEr(mermaid);
  const backText = serializeErText(back);

  /* The metadata line is the documented loss (Mermaid carries no created /
     updated), so the comparison is against the same document re-stamped —
     everything BELOW the header must survive exactly. */
  const body = (text) => text.slice(text.indexOf("@er"));
  check(
    "every entity, column, key role and relationship survives the trip out and back",
    body(backText) === body(ER_ALAB),
    firstDiff(body(ER_ALAB), body(backText)),
  );

  const composite = back.entities
    .find((e) => e.id === "order_line")
    .attributes.find((a) => a.name === "order_id");
  check(
    "a composite key keeps BOTH roles through Mermaid (`PK,FK`, not `PK`)",
    JSON.stringify(composite.keys) === '["pk","fk"]',
    `got ${JSON.stringify(composite.keys)}`,
  );

  const unlabelled = back.relationships.find((r) => r.to === "audit");
  check(
    'an unlabelled relationship comes back unlabelled, not labelled ""',
    unlabelled.label === undefined,
    `got ${JSON.stringify(unlabelled.label)}`,
  );

  check(
    "a column description rides Mermaid's comment slot",
    back.entities.find((e) => e.id === "customer").attributes[1].description ===
      "Login identity",
    JSON.stringify(back.entities.find((e) => e.id === "customer").attributes),
  );

  check(
    "an array type survives Mermaid's `[]`",
    back.entities.find((e) => e.id === "order_line").attributes[2].type ===
      "text[]",
    mermaid,
  );
}

{
  /* Mermaid's attribute grammar is alphanumerics and `[]` only. A SQL type
     it cannot spell must be SUBSTITUTED, not emitted verbatim — an export
     Mermaid refuses to render is worse than a visibly approximated one. */
  const model = parseErText(
    `archlab 1.0 er\ntitle "T"\n\n@er\n  entity a "A"\n    attr total numeric(10,2)\n`,
  );
  const mermaid = serializeMermaidEr(model);
  check(
    "a SQL type Mermaid cannot hold is substituted, not emitted verbatim",
    !mermaid.includes("numeric(10,2)") && mermaid.includes("numeric_10_2"),
    mermaid,
  );
  check(
    "the substituted export still parses as Mermaid",
    (() => {
      try {
        parseMermaidEr(mermaid);
        return true;
      } catch (error) {
        return error.message;
      }
    })() === true,
    "the emitter wrote a document its own importer refuses",
  );
}

{
  /* Hand-written Mermaid, in the spelling a person actually types: bare
     entity names, no alias, a lowercase key role. */
  const HAND = `erDiagram
    CUSTOMER ||--o{ ORDER : places
    CUSTOMER {
        string name PK
        string email
    }
`;
  const model = parseMermaidEr(HAND);
  check(
    "hand-written Mermaid imports in first-mention order",
    model.entities.map((e) => e.id).join(",") === "CUSTOMER,ORDER",
    model.entities.map((e) => e.id).join(","),
  );
  check(
    "an entity mentioned before its block still gets its columns",
    model.entities[0].attributes.length === 2,
    JSON.stringify(model.entities[0]),
  );
  check(
    "an entity that never gets a block carries no columns",
    model.entities[1].attributes === undefined,
    JSON.stringify(model.entities[1]),
  );
}

for (const [what, source, pattern] of [
  [
    "a cardinality glyph outside the vocabulary",
    "erDiagram\n  A ||--xx B : r\n",
    /cardinality/i,
  ],
  [
    "a key role outside PK/FK/UK",
    "erDiagram\n  A {\n    string id PRIMARY\n  }\n",
    /key role/i,
  ],
  [
    "a second block for one entity",
    "erDiagram\n  A {\n    string id\n  }\n  A {\n    string x\n  }\n",
    /already has a block/i,
  ],
  [
    "a duplicate column",
    "erDiagram\n  A {\n    string id\n    uuid id\n  }\n",
    /duplicate column/i,
  ],
  [
    "a relationship with no label, which Mermaid requires",
    "erDiagram\n  A ||--o{ B\n",
    /label/i,
  ],
]) {
  let error = null;
  try {
    parseMermaidEr(source);
  } catch (caught) {
    error = caught;
  }
  check(
    `${what} is refused by name`,
    error !== null &&
      error instanceof MermaidParseError &&
      pattern.test(error.message),
    error === null ? "it parsed" : error.message,
  );
}

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} mermaid-check assertions passed.`);

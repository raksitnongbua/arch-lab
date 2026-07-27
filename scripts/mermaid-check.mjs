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

const { parseMermaidC4, serializeMermaidC4, MermaidParseError } = await import(
  pathToFileURL(path.join(ROOT, "src/features/mermaid/index.ts")).href
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

function expectParseError(label, source, expectFragment) {
  let result;
  try {
    result = parseMermaidC4(source);
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

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} mermaid-check assertions passed.`);

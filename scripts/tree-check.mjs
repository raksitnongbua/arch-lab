/**
 * `check:tree` — the decomposition-tree grammar.
 *
 * What it proves, and why each rule exists rather than being obvious:
 *
 *   1. ROUND TRIP IS BYTE-IDENTICAL, on the seed and on every bundled example,
 *      and idempotent on a second pass. The hard invariant of every grammar in
 *      this family.
 *   2. UNBOUNDED DEPTH REALLY IS UNBOUNDED. Every other grammar here validates
 *      indentation against a closed set; this one multiplies. A cap that crept
 *      in would turn the notation into a data dictionary with extra steps,
 *      which is the one thing `src/types/tree.ts` says must never happen — so
 *      a deep tree is built and parsed rather than assumed.
 *   3. THE REFUSALS THAT ARE THE NOTATION. A second root, a repeated id, a
 *      cell past the last header, a cell with no `columns` line, an orphan
 *      indent jump, a `levels` line longer than the tree is deep. The orphan
 *      jump is the important one: accepting it would reparent a subtree
 *      SILENTLY and still round-trip, which is the worst failure this format
 *      can have.
 *   4. NO EDGE KEYWORD EVER PARSES. `to`, `next`, `parent` and `ref` are the
 *      single change that would make this a worse flowchart. If one of them
 *      ever becomes legal, this check fails before a reader finds out.
 *   5. NO CROSS-PARSING, both directions, across all ten grammars.
 *
 * Exits non-zero on any failure. Run with: pnpm check:tree
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { registerTsResolution } from "./lib/resolve-ts.mjs";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const load = registerTsResolution(ROOT);

const {
  parseArchText,
  parseSequenceText,
  parseFlowchartText,
  parseUseCaseText,
  parseErText,
  parseDictText,
  parseGanttText,
  parseTimelineText,
  parseLifecycleText,
  parseTreeText,
  serializeTreeText,
  detectAlabKind,
} = await load("src/features/archtext/index.ts");

const { INDENT_STEP } = await load("src/features/archtext/lib/tree/keywords.ts");
const { TREE_EXAMPLE } = await load("src/features/tree/input/example.ts");
const { listTreeExampleIds, loadTreeExample } = await load(
  "src/features/tree/service/example-service.ts",
);

let failures = 0;
let assertions = 0;
const ok = (label) => {
  assertions += 1;
  console.log(`  ✓ ${label}`);
};
const fail = (label, detail) => {
  assertions += 1;
  failures += 1;
  console.error(`  ✗ ${label}`);
  if (detail) console.error(`    ${detail}`);
};
const check = (label, condition, detail) =>
  condition ? ok(label) : fail(label, detail);

const refuses = (label, text, detail) => {
  try {
    parseTreeText(text);
    fail(label, detail ?? "it parsed");
  } catch {
    ok(label);
  }
};

/* ----------------------------------------------------------------------- */
console.log("\n1. Round trip");

const seed = parseTreeText(TREE_EXAMPLE);
const seedOut = serializeTreeText(seed);
check(
  "the seed round-trips byte for byte",
  seedOut === TREE_EXAMPLE,
  "open, change nothing, save — the bytes must be identical",
);
check(
  "a second pass changes nothing",
  serializeTreeText(parseTreeText(seedOut)) === seedOut,
  "serialisation is not idempotent, so a save loop would keep rewriting",
);

for (const id of listTreeExampleIds()) {
  const loaded = loadTreeExample(id);
  if (loaded.status !== "ok") {
    fail(`bundled tree \`${id}\` parses`, loaded.message ?? "not found");
    continue;
  }
  const text = serializeTreeText(loaded.file);
  check(
    `bundled tree \`${id}\` round-trips`,
    serializeTreeText(parseTreeText(text)) === text,
    "canonical output does not re-serialise to itself",
  );
}

/* ----------------------------------------------------------------------- */
console.log("\n2. Depth is unbounded, and that is the notation");

/** A tree `depth` levels deep, written at the grammar's own indent step. */
function deepTree(depth) {
  const lines = ["archlab 1.0 tree", 'title "Deep"', "", "@tree"];
  for (let level = 0; level < depth; level += 1) {
    lines.push(`${" ".repeat((level + 1) * INDENT_STEP)}node n${level} "N${level}"`);
  }
  return `${lines.join("\n")}\n`;
}

for (const depth of [1, 2, 5, 12, 40]) {
  const text = deepTree(depth);
  let parsed = null;
  try {
    parsed = parseTreeText(text);
  } catch (error) {
    fail(`a ${depth}-level tree parses`, error.message);
    continue;
  }
  check(
    `a ${depth}-level tree parses and round-trips`,
    serializeTreeText(parsed) === text,
    "a depth this grammar accepts must also serialise back",
  );
}

/* THE CAP TEST. If someone adds a closed indent set here — the shape every
   other grammar in the family uses — this is what fails. */
refuses(
  "an indent that is not a multiple of the step is refused",
  deepTree(3).replace(`${" ".repeat(INDENT_STEP * 2)}node n1`, `${" ".repeat(INDENT_STEP * 2 + 1)}node n1`),
  "an odd indent parsed, so indentation is not being checked at all",
);

/* ----------------------------------------------------------------------- */
console.log("\n3. The refusals that are the notation");

const BASE = `archlab 1.0 tree
title "T"

@tree
  levels "Top" "Under"
  columns "One"
  node root "Root"
    node a "A"
      cell "x"
`;

check("the base document parses", (() => {
  try {
    parseTreeText(BASE);
    return true;
  } catch {
    return false;
  }
})(), "the fixture below is broken, so every refusal here proves nothing");

refuses(
  "a second root is refused",
  BASE + '  node other "Second"\n',
  "a forest parsed — a document holds one tree",
);
refuses(
  "a repeated id is refused",
  BASE.replace('node a "A"', 'node root "A"'),
  "a node reachable twice is a graph, not a tree",
);
refuses(
  "a cell past the last header is refused",
  BASE + '      cell "y"\n',
  "a cell with no header has nothing to be read under",
);
refuses(
  "a cell with no columns line is refused",
  `archlab 1.0 tree\ntitle "T"\n\n@tree\n  node root "Root"\n    cell "x"\n`,
  "a column was invented for a document that declared none",
);
refuses(
  "an orphan indent jump is refused",
  BASE + `${" ".repeat(INDENT_STEP * 4)}node deep "Deep"\n`,
  "THE WORST ONE: a line naming no parent was reparented silently",
);
refuses(
  "a levels line longer than the tree is deep is refused",
  BASE.replace('levels "Top" "Under"', 'levels "A" "B" "C" "D" "E"'),
  "a header over a depth that does not exist labels nothing",
);
refuses(
  "a tab indent is refused",
  BASE.replace("  node root", "\tnode root"),
  "tabs and spaces would make one document two shapes",
);

/* THE EDGE KEYWORDS. Each of these is the single change that would make this
   notation a worse flowchart, so each is refused by name. */
for (const word of ["to", "next", "then", "parent", "ref"]) {
  refuses(
    `\`${word}\` is not a tree keyword`,
    BASE.replace('    node a "A"', `    node a "A"\n    ${word} root\n`),
    `an edge keyword parsed — a set of node-to-node edges IS the flowchart`,
  );
}

/* ----------------------------------------------------------------------- */
console.log("\n4. No cross-parsing, ten grammars, both directions");

const OTHERS = {
  c4: parseArchText,
  sequence: parseSequenceText,
  flowchart: parseFlowchartText,
  usecase: parseUseCaseText,
  er: parseErText,
  dict: parseDictText,
  gantt: parseGanttText,
  timeline: parseTimelineText,
  lifecycle: parseLifecycleText,
};

for (const [kind, parse] of Object.entries(OTHERS)) {
  let refused = false;
  try {
    parse(TREE_EXAMPLE);
  } catch {
    refused = true;
  }
  check(
    `the ${kind} parser refuses a tree`,
    refused,
    "a wrong-but-confident parse routes text to the wrong error message",
  );
}

for (const header of [
  "archlab 1.0",
  "archlab 1.0 sequence",
  "archlab 1.0 flowchart",
  "archlab 1.0 usecase",
  "archlab 1.0 er",
  "archlab 1.0 dict",
  "archlab 1.0 gantt",
  "archlab 1.0 timeline",
  "archlab 1.0 lifecycle",
]) {
  refuses(
    `the tree parser refuses \`${header}\``,
    `${header}\ntitle "X"\n`,
    "the ten grammars must stay mutually exclusive from line 1",
  );
}

check(
  "detection names a tree, and names it only from its own header",
  detectAlabKind(TREE_EXAMPLE) === "tree" &&
    detectAlabKind("archlab 1.0 treeish\n") === null &&
    detectAlabKind("archlab 1.0 tree extra\n") === null,
  "the header regex is not anchored to the whole line",
);

/* ----------------------------------------------------------------------- */

console.log("");
if (failures > 0) {
  console.error(`${failures} of ${assertions} assertions failed.`);
  process.exit(1);
}
console.log(`All ${assertions} assertions passed.`);

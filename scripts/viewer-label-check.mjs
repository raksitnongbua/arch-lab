#!/usr/bin/env node
/**
 * C4 EDGE-LABEL PLACEMENT check — the chip has to be readable, and both
 * surfaces have to put it in the same place.
 *
 * WHAT SHIPPED BEFORE THIS. The chip went wherever `getParallelEdgePath`'s
 * curve midpoint fell, slid along the line by the fan bias so that edges
 * meeting at one node did not stack their labels. That was the whole of it:
 * nothing in the viewer asked whether the chip had landed on a NODE, or on
 * another chip. A relationship passing near a third element put the sentence
 * naming it on top of an unrelated box — the reader could see there was a
 * label and not what it said, which is worse than no label, because the space
 * is spent either way.
 *
 * TWO KINDS OF ASSERTION HERE, deliberately:
 *
 *   - GEOMETRY, run against the real `placeEdgeLabels` through Node's type
 *     stripping. Every one is relational — "clear of", "not overlapping",
 *     "closer to its anchor than" — never a coordinate, because a coordinate
 *     passes forever after somebody tunes a rung.
 *   - WIRING, read as text out of the two surfaces that draw a chip. The
 *     module cannot make them call it, and the failure it exists to prevent is
 *     precisely two halves each self-consistent: a canvas that avoids a box
 *     the exporter draws somewhere else is the same bug with an extra step.
 *
 * Run with: pnpm check:viewer-labels
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { registerTsResolution } from "./lib/resolve-ts.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = registerTsResolution(ROOT);
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const { placeEdgeLabels, edgeChipSize, CHIP_LABEL_MAX_WIDTH } = await load(
  "src/features/viewer/lib/edge-label-placement.ts",
);

const canvas = read("src/features/viewer/components/viewer-canvas.tsx");
const edge = read("src/features/viewer/components/viewer-edge.tsx");
const exporter = read("src/features/viewer/export/render-svg.ts");

let assertions = 0;
let failures = 0;
function check(label, run) {
  assertions += 1;
  try {
    run();
    console.log(`  ✓ ${label}`);
  } catch (error) {
    failures += 1;
    console.error(`  ✗ ${label}`);
    console.error(`    ${error instanceof Error ? error.message : error}`);
  }
}

/* ----------------------------------------------------------------------- */
/* Helpers                                                                  */
/* ----------------------------------------------------------------------- */

const NODE = { width: 176, height: 88 };
const boxAround = (centre, size) => ({
  x: centre.x - size.width / 2,
  y: centre.y - size.height / 2,
  width: size.width,
  height: size.height,
});
const hits = (a, b) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

/* ----------------------------------------------------------------------- */
/* Geometry                                                                 */
/* ----------------------------------------------------------------------- */

console.log("\nPlacement — a chip ends up somewhere a reader can read it");

/**
 * The shape that produced the report: three elements in a column, and a
 * relationship from the top one to the bottom one whose midpoint lands on the
 * middle one. The chip here estimates 171 wide against a 176-wide box, so
 * sideways cannot save it and the escape has to be along the line — which is
 * what made this the fixture that caught a walk one rung too short.
 */
const OBSTRUCTED = {
  nodes: [
    { x: 40, y: 40, ...NODE },
    { x: 40, y: 256, ...NODE },
    { x: 40, y: 472, ...NODE },
  ],
  anchor: { x: 128, y: 300 },
};

check("a chip whose anchor lands on a node does not stay there", () => {
  const size = edgeChipSize("Reads and writes email_logs", "MongoDB wire");
  assert.ok(size, "the fixture's relationship produced no chip at all");

  const before = boxAround(OBSTRUCTED.anchor, size);
  assert.ok(
    OBSTRUCTED.nodes.some((node) => hits(before, node)),
    "the fixture stopped being obstructed — it no longer proves anything, so " +
      "fix the fixture rather than deleting the assertion",
  );

  const placed = placeEdgeLabels(
    [
      {
        id: "e1",
        anchorX: OBSTRUCTED.anchor.x,
        anchorY: OBSTRUCTED.anchor.y,
        dirX: 0,
        dirY: 1,
        ...size,
      },
    ],
    OBSTRUCTED.nodes,
  );
  const result = placed.get("e1");
  assert.ok(result, "the pass returned nothing for the only chip it was given");
  const after = boxAround(result, size);
  assert.ok(
    !OBSTRUCTED.nodes.some((node) => hits(after, node)),
    `the chip still sits on a node at (${result.x}, ${result.y})`,
  );
  assert.equal(
    result.crowded,
    false,
    "the chip found room but is still reported crowded — a caller cannot " +
      "tell 'clear' from 'gave up'",
  );
});

check("two chips at the same anchor do not stack", () => {
  const size = edgeChipSize("Publishes send_email", "AMQP");
  const placed = placeEdgeLabels(
    [
      { id: "a", anchorX: 600, anchorY: 300, dirX: 1, dirY: 0, ...size },
      { id: "b", anchorX: 604, anchorY: 302, dirX: 1, dirY: 0, ...size },
    ],
    [],
  );
  const a = boxAround(placed.get("a"), size);
  const b = boxAround(placed.get("b"), size);
  assert.ok(
    !hits(a, b),
    `both chips landed on each other: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`,
  );
});

check("a chip stays as near its own line as the room allows", () => {
  // The point of a bounded walk: a chip that wanders far enough to clear
  // everything stops being attached to the relationship it names.
  const size = edgeChipSize("Calls", undefined);
  const placed = placeEdgeLabels(
    [{ id: "e", anchorX: 400, anchorY: 400, dirX: 1, dirY: 0, ...size }],
    [],
  );
  const result = placed.get("e");
  assert.equal(
    result.x,
    400,
    "an unobstructed chip moved off its anchor — the walk should stop at the " +
      "first candidate, which is the anchor itself",
  );
  assert.equal(result.y, 400, "same, on the other axis");
});

check("nodes outrank chips when nothing clears both", () => {
  /* A corridor with room for exactly one chip: whatever the second one does,
   * it has to overlap something. It must choose the other CHIP, because a
   * label crossing a label is a reader's problem for a second and a label
   * under a node is not there at all. */
  const size = edgeChipSize("Reads and writes email_logs", "MongoDB wire");
  const walls = [
    { x: 0, y: 0, width: 2000, height: 300 },
    { x: 0, y: 372, width: 2000, height: 300 },
  ];
  const placed = placeEdgeLabels(
    [
      { id: "a", anchorX: 500, anchorY: 336, dirX: 1, dirY: 0, ...size },
      { id: "b", anchorX: 505, anchorY: 336, dirX: 1, dirY: 0, ...size },
    ],
    walls,
  );
  for (const id of ["a", "b"]) {
    const box = boxAround(placed.get(id), size);
    assert.ok(
      !walls.some((wall) => hits(box, wall)),
      `chip ${id} retreated onto a node box instead of onto the other chip`,
    );
  }
});

check("a chip with nowhere to go says so rather than pretending", () => {
  const size = edgeChipSize("Reads and writes email_logs", "MongoDB wire");
  const boxedIn = [{ x: -500, y: -500, width: 2000, height: 2000 }];
  const placed = placeEdgeLabels(
    [{ id: "e", anchorX: 400, anchorY: 400, dirX: 1, dirY: 0, ...size }],
    boxedIn,
  );
  const result = placed.get("e");
  assert.equal(
    result.crowded,
    true,
    "every candidate collided and the pass reported the chip placed — a " +
      "silent fallback is how the old anchor bug survived",
  );
  assert.equal(result.x, 400, "a crowded chip should fall back to its anchor");
});

check(
  "the same diagram places identically whatever order it arrives in",
  () => {
    const size = edgeChipSize("Requests an email", "HTTPS");
    const labels = [
      { id: "a", anchorX: 200, anchorY: 200, dirX: 1, dirY: 0, ...size },
      { id: "b", anchorX: 210, anchorY: 205, dirX: 1, dirY: 0, ...size },
      { id: "c", anchorX: 220, anchorY: 210, dirX: 0, dirY: 1, ...size },
    ];
    const nodes = [{ x: 300, y: 150, ...NODE }];
    const show = (map) =>
      [...map.entries()]
        .map(([id, at]) => `${id}=${at.x},${at.y}`)
        .sort()
        .join(" ");
    const forward = placeEdgeLabels(labels, nodes);
    const reversed = placeEdgeLabels([...labels].reverse(), nodes);
    assert.equal(
      show(forward),
      show(reversed),
      "the pass depends on its caller's array order — the canvas and the " +
        "exporter build theirs differently, so the PNG would not match the screen",
    );
  },
);

console.log("\nChip size — one rectangle, measured once");

check("an unlabelled relationship reserves no space", () => {
  assert.equal(
    edgeChipSize(undefined, undefined),
    null,
    'the "Unlabelled relationship" affordance is an interaction, not content — ' +
      "a box for it would push real labels off their lines",
  );
  assert.equal(edgeChipSize("", ""), null, "same, for empty strings");
});

check("a very long label is measured at the width it is DRAWN", () => {
  const long = edgeChipSize("x".repeat(400), undefined);
  assert.ok(
    long.width <= CHIP_LABEL_MAX_WIDTH + 20,
    `a 400-character label measured ${long.width} wide — the exporter ` +
      "ellipsises to " +
      `${CHIP_LABEL_MAX_WIDTH}, so anything wider has the pass shoving ` +
      "neighbours aside for width nobody draws",
  );
});

check("technology adds a line rather than widening one", () => {
  const one = edgeChipSize("Calls", undefined);
  const two = edgeChipSize("Calls", "HTTPS");
  assert.ok(
    two.height > one.height,
    "the technology line stopped adding height, so the chip that draws two " +
      "lines is avoided as though it drew one",
  );
});

/* ----------------------------------------------------------------------- */
/* Wiring                                                                   */
/* ----------------------------------------------------------------------- */

console.log("\nWiring — the screen and the export agree by construction");

check("both surfaces get their placement from the one module", () => {
  for (const [name, source] of [
    ["the canvas", canvas],
    ["the exporter", exporter],
  ]) {
    assert.match(
      source,
      /placeEdgeLabels\(/,
      `${name} draws chips without asking the placement pass`,
    );
    assert.match(
      source,
      /edgeChipSize\(/,
      `${name} sizes a chip with its own formula`,
    );
  }
});

check("the exporter paints the chip where the pass put it", () => {
  // It used to paint at `labelX`/`labelY` — the raw anchor — which is exactly
  // what would leave the export disagreeing with the screen.
  assert.match(
    exporter,
    /const chipX = chipCentreX - chipWidth \/ 2;/,
    "the exported chip's rectangle stopped following the placement",
  );
  assert.match(
    exporter,
    /<text x="\$\{fmt\(chipCentreX\)\}"/,
    "the exported chip's TEXT stopped following its own rectangle — the box " +
      "moves and the words stay behind",
  );
});

check("the exporter's ellipsis cap is the cap the size uses", () => {
  assert.match(
    exporter,
    /ellipsize\(label, labelSize, CHIP_LABEL_MAX_WIDTH\)/,
    "the exporter ellipsises at a hand-typed width again — two numbers for " +
      "one rectangle is how the drawn chip and the avoided chip drift apart",
  );
  assert.match(
    exporter,
    /ellipsize\(technology, techSize, CHIP_TECH_MAX_WIDTH\)/,
    "same, for the technology line",
  );
});

check("the screen chip renders at the placed centre", () => {
  assert.match(
    edge,
    /translate\(\$\{chipX\}px, \$\{chipY\}px\)/,
    "the on-screen chip is back on the raw curve midpoint",
  );
  assert.match(
    edge,
    /data\?\.labelPlacement\?\.x \?\? labelX/,
    "the chip no longer reads the placement the canvas computed for it",
  );
});

check("the placement module stays loadable by this check", () => {
  /* Comments stripped before scanning. The first version of this matched
   * `@xyflow/react` inside the module's own header — the paragraph explaining
   * why it does NOT import it — so the assertion failed on the documentation
   * that proves it is satisfied. A text check has to read the code. */
  const placementSource = read(
    "src/features/viewer/lib/edge-label-placement.ts",
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  // Type stripping cannot follow an import into React, and `@xyflow/react` is
  // where the geometry helpers live. An import added here would not fail a
  // build — it would fail every assertion above, at load, with a stack trace
  // instead of a verdict.
  assert.doesNotMatch(
    placementSource,
    /@xyflow\/react|from "react"/,
    "the module imports React, so it can no longer be loaded outside a " +
      "browser — the geometry assertions above would stop running",
  );
  assert.doesNotMatch(
    placementSource,
    /document\.|window\./,
    "the module touched the DOM; it is meant to be pure data in, data out",
  );
});

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(
    `\n${failures} of ${assertions} viewer-label assertions FAILED`,
  );
  process.exit(1);
}
console.log(`\nAll ${assertions} viewer-label assertions passed.`);

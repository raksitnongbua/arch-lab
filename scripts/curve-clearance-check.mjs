#!/usr/bin/env node
/**
 * CURVE CLEARANCE check — a connector must not disappear behind an element it
 * does not connect, and must not be bent out of shape trying.
 *
 * A connector crossing an unrelated box is a connector the reader cannot
 * follow: it vanishes behind one element and reappears past it, and on a dense
 * diagram the eye reconnects the wrong two ends. `clearingOffset` bows the
 * curve around the obstruction — the smallest fix that reads correctly, rather
 * than orthogonal routing, which would give a C4 diagram a second visual
 * language for the same information.
 *
 * THE ASSERTIONS INCLUDE THE LIMIT, on purpose. A quadratic deviates by half
 * its control offset at the midpoint, so a box the line runs through the
 * CENTRE of needs about 188 — past the point where a bowed connector reads as
 * a third element's border. That case is declined and the straight line kept,
 * and the assertion below pins the decline rather than pretending the bow is
 * total. A check that only tested the case that works would report a
 * capability the module does not have.
 *
 * The module is pure arithmetic in `src/lib` precisely so this can run: the
 * curve maths it was extracted from imports `@xyflow/react`, and type
 * stripping cannot follow an import into React.
 *
 * Run with: pnpm check:curve-clearance
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { registerTsResolution } from "./lib/resolve-ts.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = registerTsResolution(ROOT);
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const { clearingOffset } = await load("src/lib/curve-clearance.ts");

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

/** Sampled points of the quadratic that lie inside `box`. */
function hits(line, offset, box) {
  const cx = (line.sourceX + line.targetX) / 2 + line.normalX * offset;
  const cy = (line.sourceY + line.targetY) / 2 + line.normalY * offset;
  let count = 0;
  for (let i = 1; i < 24; i += 1) {
    const t = i / 24;
    const u = 1 - t;
    const x = u * u * line.sourceX + 2 * u * t * cx + t * t * line.targetX;
    const y = u * u * line.sourceY + 2 * u * t * cy + t * t * line.targetY;
    if (
      x > box.x &&
      x < box.x + box.width &&
      y > box.y &&
      y < box.y + box.height
    ) {
      count += 1;
    }
  }
  return count;
}

const NODE = { width: 176, height: 88 };

console.log("\nClearance — a connector gets past what it does not connect");

check("a grazed element is cleared", () => {
  const box = { x: 190, y: 256, ...NODE };
  const line = {
    sourceX: 128,
    sourceY: 128,
    targetX: 300,
    targetY: 472,
    normalX: 0.894,
    normalY: -0.447,
  };
  assert.ok(
    hits(line, 0, box) > 0,
    "the fixture stopped being obstructed — fix the fixture, not the assertion",
  );
  const offset = clearingOffset({ ...line, base: 0, obstacles: [box] });
  assert.equal(
    hits(line, offset, box),
    0,
    `offset ${offset} still leaves the curve inside the element`,
  );
});

check("an unobstructed connector is left exactly alone", () => {
  const line = {
    sourceX: 0,
    sourceY: 0,
    targetX: 400,
    targetY: 0,
    normalX: 0,
    normalY: 1,
  };
  assert.equal(
    clearingOffset({
      ...line,
      base: 0,
      obstacles: [{ x: 0, y: 200, width: 100, height: 50 }],
    }),
    0,
    "a connector with nothing in its way was bowed anyway — every existing " +
      "diagram would redraw",
  );
});

check("a parallel edge keeps the offset its group gave it", () => {
  const line = {
    sourceX: 0,
    sourceY: 0,
    targetX: 400,
    targetY: 0,
    normalX: 0,
    normalY: 1,
  };
  assert.equal(
    clearingOffset({ ...line, base: 48 }),
    48,
    "the clearing pass overrode the parallel-group offset, so two edges " +
      "between the same pair would collapse onto one curve",
  );
});

check("a centred obstruction is DECLINED, not half-bowed", () => {
  // The limit, pinned. Clearing a box the line runs through the centre of
  // needs ~188 — past the point where a bowed connector reads as a third
  // element's border. A bow that fails has moved the connector AND still
  // crosses, so the straight line is kept instead.
  const box = { x: 40, y: 256, ...NODE };
  const line = {
    sourceX: 128,
    sourceY: 128,
    targetX: 128,
    targetY: 472,
    normalX: 1,
    normalY: 0,
  };
  const offset = clearingOffset({ ...line, base: 0, obstacles: [box] });
  assert.equal(
    offset,
    0,
    `the pass bowed to ${offset} and still crosses (${hits(line, offset, box)} ` +
      "sampled points inside) — a half-bow is worse than the straight line",
  );
});

check("the search is symmetric and does not depend on edge direction", () => {
  const box = { x: 190, y: 256, ...NODE };
  const forward = {
    sourceX: 128,
    sourceY: 128,
    targetX: 300,
    targetY: 472,
    normalX: 0.894,
    normalY: -0.447,
  };
  // Same line, endpoints swapped, same canonical normal (that is the point of
  // making the normal canonical in `edge-geometry`).
  const reversed = {
    sourceX: 300,
    sourceY: 472,
    targetX: 128,
    targetY: 128,
    normalX: 0.894,
    normalY: -0.447,
  };
  assert.equal(
    clearingOffset({ ...forward, base: 0, obstacles: [box] }),
    clearingOffset({ ...reversed, base: 0, obstacles: [box] }),
    "an A→B and a B→A connector between the same pair bow differently, so " +
      "one of them would be drawn on the wrong side of the obstruction",
  );
});

check("both sides of the line are tried, not just one", () => {
  /* An obstruction sitting mostly to one side of the connector is only
   * clearable by pushing the other way. Deleting the `base + push` attempt
   * left the symmetry assertion above green — it compares two directions of
   * the SAME line, which the canonical normal already makes equal — so this
   * is the one that catches a half-search.
   *
   * The box straddles the line with most of its width to the left, so
   * clearing rightwards needs an offset of 72 and clearing leftwards would
   * need about -228, well past the cap. */
  const box = { x: 20, y: 240, width: 120, height: 40 };
  const line = {
    sourceX: 128,
    sourceY: 100,
    targetX: 128,
    targetY: 400,
    normalX: 1,
    normalY: 0,
  };
  assert.ok(
    hits(line, 0, box) > 0,
    "the fixture stopped being obstructed — fix the fixture, not the assertion",
  );
  const offset = clearingOffset({ ...line, base: 0, obstacles: [box] });
  assert.ok(
    offset > 0,
    `the pass chose ${offset}: the only way past this box is to the right, so ` +
      "a search that tries one side only cannot find it",
  );
  assert.equal(
    hits(line, offset, box),
    0,
    `offset ${offset} still leaves the curve inside the element`,
  );
});

check("it stays loadable — pure arithmetic, no imports", () => {
  const source = read("src/lib/curve-clearance.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(
    source,
    /^import /m,
    "the module grew an import; if it ever reaches React, every assertion " +
      "above stops running and reports a stack trace instead of a verdict",
  );
  assert.doesNotMatch(
    source,
    /document\.|window\./,
    "the module touched the DOM",
  );
});

check("both viewer surfaces hand it the obstacles", () => {
  const canvas = read("src/features/viewer/components/viewer-canvas.tsx");
  const exporter = read("src/features/viewer/export/render-svg.ts");
  assert.match(
    canvas,
    /obstacles: modelRects\.filter\(/,
    "the canvas stopped telling a connector what it must avoid",
  );
  assert.match(
    exporter,
    /obstacles: obstaclesFor\(edge, rectById\)/,
    "the exporter stopped telling a connector what it must avoid, so the PNG " +
      "routes differently from the screen",
  );
  assert.equal(
    (exporter.match(/obstacles: obstaclesFor\(edge, rectById\)/g) ?? []).length,
    2,
    "the exporter computes the path twice — once for the label anchor and " +
      "once for the drawn line — and both have to see the same obstacles",
  );
});

if (failures > 0) {
  console.error(
    `\n${failures} of ${assertions} curve-clearance assertions FAILED`,
  );
  process.exit(1);
}
console.log(`\nAll ${assertions} curve-clearance assertions passed.`);

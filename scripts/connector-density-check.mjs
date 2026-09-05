#!/usr/bin/env node
/**
 * CONNECTOR DENSITY check — when several connectors leave one node, a reader
 * must be able to tell them apart.
 *
 * Every connector used to attach at the MIDPOINT of the side facing the other
 * end, so six edges leaving the bottom of a system all began at one pixel and
 * left as a sheaf. Nothing was wrong — each line went where it should — and the
 * diagram was still unreadable, because a reader following one line back cannot
 * say which of six it was. `lib/edge-fan.ts` spreads them at `L·k/(N+1)`.
 *
 * THE ASSERTIONS INCLUDE THE LIMIT, in the manner `check:curve-clearance`
 * established: a side too short to give every connector `MIN_FAN_SPACING` is
 * REPORTED as crowded rather than having the gap squeezed until the arrows
 * touch, and the assertion pins the report rather than pretending the fan is
 * total. A check that only tested the case that works would claim a capability
 * the module does not have.
 *
 * IT ALSO PINS THE THREE-WAY AGREEMENT. The canvas, the SVG exporter and the
 * editor's selector each carried their own copy of the parallel-edge grouping,
 * and the first two are REQUIRED to place a connector in the same spot — a PNG
 * whose lines meet their boxes somewhere else than the screen's is the
 * two-halves failure `codebase.md` §4 names. All three now read one module, and
 * the last assertions here are what stop a fourth copy appearing.
 *
 * The module is pure arithmetic in `src/lib` precisely so this can run:
 * `edge-geometry.ts` imports `@xyflow/react`, and type stripping cannot follow
 * an import into React.
 *
 * Run with: pnpm check:connector-density
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { registerTsResolution } from "./lib/resolve-ts.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = registerTsResolution(ROOT);
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const {
  MIN_FAN_SPACING,
  assignFanSlots,
  facingSide,
  fanOffset,
  fanSpacing,
  isCrowded,
  parallelEdgeGroups,
  pointOnSide,
  sideLength,
} = await load("src/lib/edge-fan.ts");

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

/** A default C4 element. */
const box = (x, y) => ({ x, y, width: 176, height: 88 });

/** Where an edge actually meets each of its nodes, given the whole diagram. */
function attachments(edges, rects) {
  const slots = assignFanSlots(edges, rects);
  const out = new Map();
  for (const edge of edges) {
    const source = rects.get(edge.source);
    const target = rects.get(edge.target);
    if (source === undefined || target === undefined) continue;
    const dx = target.x + target.width / 2 - (source.x + source.width / 2);
    const dy = target.y + target.height / 2 - (source.y + source.height / 2);
    const sourceSide = facingSide(source, dx, dy);
    const targetSide = facingSide(target, -dx, -dy);
    const slot = slots.get(edge.id);
    out.set(edge.id, {
      sourceSide,
      targetSide,
      from: pointOnSide(
        source,
        sourceSide,
        fanOffset(
          slot.source.index,
          slot.source.count,
          sideLength(source, sourceSide),
        ),
      ),
      to: pointOnSide(
        target,
        targetSide,
        fanOffset(
          slot.target.index,
          slot.target.count,
          sideLength(target, targetSide),
        ),
      ),
    });
  }
  return out;
}

console.log("\n1. A lone connector is exactly where it always was");

check("one edge still meets both nodes at the side midpoint", () => {
  /* THE NO-CHANGE CASE, asserted first because it is the one a regression
     would be invisible in: most diagrams are mostly one-connector sides, and
     if those moved, every existing document would have shifted for nothing. */
  const rects = new Map([
    ["a", box(0, 0)],
    ["b", box(0, 400)],
  ]);
  const found = attachments([{ id: "e1", source: "a", target: "b" }], rects);
  const { from, to } = found.get("e1");
  assert.deepEqual(from, { x: 88, y: 88 }, "source left its bottom midpoint");
  assert.deepEqual(to, { x: 88, y: 400 }, "target left its top midpoint");
});

console.log("\n2. Several connectors on one side are separated, and ordered");

/**
 * One hub with `count` targets in a row directly beneath it — close enough
 * that `facingSide` sends every connector out of the hub's BOTTOM, which is
 * what makes them share a side and so share a fan.
 *
 * The first draft of this fixture spread the row wide enough that the outer
 * targets pulled their connectors out of the hub's left and right sides
 * instead. Nothing was wrong with the fan; the fixture was simply no longer
 * testing one, and an assertion below caught it by finding an attachment
 * sitting exactly on a corner — which is what an attachment on a vertical side
 * looks like when you measure it in x.
 *
 * THE EDGE IDS RUN BACKWARDS AGAINST THE ROW, and that is the whole point of
 * them. The second draft numbered them left to right, which made lexical order
 * and spatial order the same thing — so the no-crossing assertion below passed
 * whether the fan sorted by position or by id, and could not catch the one
 * defect it is named after. Reversing them makes an id sort produce a fan that
 * crosses every one of its own lines.
 */
function hubAndRow(count) {
  const rects = new Map([["hub", box(500, 0)]]);
  const edges = [];
  for (let i = 0; i < count; i += 1) {
    rects.set(`n${i}`, box(500 + (i - (count - 1) / 2) * 130, 400));
    edges.push({ id: `e${count - 1 - i}`, source: "hub", target: `n${i}` });
  }
  return { rects, edges };
}

check("six connectors leaving one side land on six distinct points", () => {
  const { rects, edges } = hubAndRow(6);
  const found = attachments(edges, rects);
  const xs = edges.map((edge) => found.get(edge.id).from.x);
  assert.equal(
    new Set(xs).size,
    6,
    `six connectors share ${6 - new Set(xs).size + 1} attachment points`,
  );
});

check("the gaps are even, and every one clears the floor", () => {
  const { rects, edges } = hubAndRow(6);
  const found = attachments(edges, rects);
  const xs = edges
    .map((edge) => found.get(edge.id).from.x)
    .sort((a, b) => a - b);
  const gaps = xs.slice(1).map((x, i) => x - xs[i]);
  for (const gap of gaps) {
    assert.ok(
      Math.abs(gap - gaps[0]) < 1e-9,
      `uneven fan: gaps ${gaps.map((g) => g.toFixed(2)).join(", ")}`,
    );
    assert.ok(
      gap >= MIN_FAN_SPACING,
      `${gap.toFixed(1)}px between neighbours is under the ${MIN_FAN_SPACING}px floor`,
    );
  }
});

check("no attachment sits on a corner", () => {
  /* `L·k/(N+1)` keeps a margin at each end, which is what stops a connector
     meeting the node on its rounded corner — where the arrowhead lands half
     off the shape and reads as pointing at nothing. Measured along whichever
     axis the side actually runs, so a connector leaving a vertical side is not
     judged by an x that is constant by definition. */
  const { rects, edges } = hubAndRow(6);
  const found = attachments(edges, rects);
  const hub = rects.get("hub");
  for (const edge of edges) {
    const { sourceSide, from } = found.get(edge.id);
    assert.equal(sourceSide, "bottom", "the fixture stopped sharing a side");
    assert.ok(
      from.x > hub.x && from.x < hub.x + hub.width,
      `attachment at ${from.x} is on or past a corner of [${hub.x}, ${hub.x + hub.width}]`,
    );
  }
});

check(
  "attachments run the same way the targets do, so the lines do not cross",
  () => {
    /* THE DEFECT THE OBVIOUS FIX INTRODUCES. Fanning by edge id spreads the
     connectors apart and then crosses them over each other on the way out —
     two problems for the price of one. Ordering by where the far end sits is
     what makes the fan an improvement rather than a trade. */
    const { rects, edges } = hubAndRow(5);
    const found = attachments(edges, rects);
    const rows = edges
      .map((edge) => ({
        attachX: found.get(edge.id).from.x,
        targetX: rects.get(edge.target).x + rects.get(edge.target).width / 2,
      }))
      .sort((a, b) => a.targetX - b.targetX);
    for (let i = 1; i < rows.length; i += 1) {
      assert.ok(
        rows[i].attachX > rows[i - 1].attachX,
        "a connector to a node further right attaches further left — the fan " +
          "crosses its own lines at the node",
      );
    }
  },
);

console.log("\n3. The limit is reported, not hidden");

check("a side too short for the floor is reported as crowded", () => {
  const side = 176;
  const fits = Math.floor(side / MIN_FAN_SPACING) - 1;
  assert.ok(
    !isCrowded(fits, side),
    `${fits} connectors should still fit a ${side}px side`,
  );
  assert.ok(
    isCrowded(fits + 2, side),
    `${fits + 2} connectors on a ${side}px side is under the floor and must ` +
      "be reported",
  );
});

check("crowding is reported rather than repaired", () => {
  /* The gap is NOT clamped up to the floor when it will not fit: doing that
     would push attachments past the corners and hide a too-dense diagram
     behind arrows that merely look placed. `curve-clearance` declines a
     centred obstruction for the same reason. */
  const side = 176;
  const many = 40;
  assert.ok(isCrowded(many, side));
  assert.ok(
    fanSpacing(many, side) < MIN_FAN_SPACING,
    "the spacing was silently widened to the floor instead of being reported",
  );
  const offsets = Array.from({ length: many }, (_, i) =>
    fanOffset(i, many, side),
  );
  assert.ok(
    offsets.every((offset) => offset > 0 && offset < side),
    "a crowded fan pushed an attachment off the side it belongs to",
  );
});

console.log("\n4. Parallel groups are a different question, still answered");

check("two edges between the same pair share a parallel group", () => {
  const groups = parallelEdgeGroups([
    { id: "a", source: "x", target: "y" },
    { id: "b", source: "y", target: "x" },
    { id: "c", source: "x", target: "z" },
  ]);
  assert.equal(groups.get("a").count, 2, "an A→B / B→A pair must group");
  assert.equal(groups.get("b").count, 2);
  assert.equal(groups.get("c").count, 1);
  assert.notEqual(groups.get("a").index, groups.get("b").index);
});

console.log("\n5. One definition — the canvas and the exporter cannot drift");

const SHARED_READERS = [
  "src/features/viewer/components/viewer-canvas.tsx",
  "src/features/viewer/export/render-svg.ts",
  "src/features/editor/state/selectors.ts",
];

check(
  "every surface that groups parallel edges reads the shared module",
  () => {
    /* This existed three times over. The canvas and the exporter are required to
     place a connector identically, so the two that mattered most were the two
     with nothing holding them together — the failure only shows up in an
     exported PNG, which nobody diffs. */
    for (const rel of SHARED_READERS) {
      const source = read(rel);
      assert.ok(
        /parallelEdgeGroups/.test(source),
        `${rel} does not call the shared parallelEdgeGroups`,
      );
      assert.ok(
        !/function parallelGroups\s*\(/.test(source),
        `${rel} has grown its own copy of the parallel-edge grouping again`,
      );
    }
  },
);

check("the canvas and the exporter fan from the same module", () => {
  for (const rel of SHARED_READERS.slice(0, 2)) {
    assert.ok(
      /assignFanSlots\(/.test(read(rel)),
      `${rel} anchors connectors without consulting the fan, so its lines ` +
        "meet their nodes somewhere the other surface's do not",
    );
  }
});

check("the fan module stays loadable by a check script", () => {
  /* The whole reason it lives in `src/lib` rather than beside the curve maths.
     One import of React and this file cannot run at all — which is how the
     geometry stops being proved and starts being believed. */
  const source = read("src/lib/edge-fan.ts");
  assert.ok(
    !/from ["']@?xyflow/.test(source) && !/from ["']react/.test(source),
    "lib/edge-fan.ts imported React — Node's type stripping cannot follow it " +
      "and this check would silently stop running",
  );
});

console.log(
  failures === 0
    ? `\nAll ${assertions} connector-density assertions passed.`
    : `\n${failures} of ${assertions} assertion(s) FAILED`,
);
process.exit(failures === 0 ? 0 : 1);

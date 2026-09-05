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
const {
  HOP_RADIUS,
  MAX_HOPS_PER_EDGE,
  assignHops,
  curveLength,
  parseCurve,
  pathWithHops,
  pointAt,
  splitAt,
} = await load("src/lib/edge-crossings.ts");

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

console.log("\n4b. Where two connectors cross, the SHORTER one steps over");

/* One long horizontal connector crossed by one short vertical one — the scene
   the decision was drawn out on. */
const LONG = "M 100,132 Q 228,132 356,132";
const SHORT = "M 240,54 Q 240,125 240,196";

check("the shorter connector is the one that hops", () => {
  const hops = assignHops([
    { id: "e-long", curve: parseCurve(LONG) },
    { id: "e-short", curve: parseCurve(SHORT) },
  ]);
  assert.ok(
    curveLength(parseCurve(SHORT)) < curveLength(parseCurve(LONG)),
    "the fixture stopped having a shorter connector",
  );
  assert.deepEqual([...hops.keys()], ["e-short"], "the wrong line hopped");
  assert.equal(hops.get("e-short").length, 1);
});

check("never both — one crossing is one bridge", () => {
  /* Bridging both lines reads as two mistakes rather than as one going over,
     which is the whole reason the rule names a single winner. */
  const hops = assignHops([
    { id: "e-long", curve: parseCurve(LONG) },
    { id: "e-short", curve: parseCurve(SHORT) },
  ]);
  assert.equal(hops.has("e-long"), false, "the line underneath hopped too");
});

check("the winner does not change when the ids are swapped", () => {
  /* THE PROPERTY THAT MADE THIS OPTION WORTH PICKING over letting the document
     decide: nothing about how the file is written can move the bridge. */
  const forward = assignHops([
    { id: "aaa", curve: parseCurve(LONG) },
    { id: "zzz", curve: parseCurve(SHORT) },
  ]);
  const swapped = assignHops([
    { id: "zzz", curve: parseCurve(LONG) },
    { id: "aaa", curve: parseCurve(SHORT) },
  ]);
  assert.deepEqual([...forward.keys()], ["zzz"]);
  assert.deepEqual([...swapped.keys()], ["aaa"]);
});

check("two connectors of equal length settle it by id, not by chance", () => {
  /* The one cost of deciding by geometry: near-equal lengths could trade the
     bridge as a node moves. The tie-break has to be something that does not
     move at all. */
  const a = "M 0,100 Q 100,100 200,100";
  const b = "M 100,0 Q 100,100 100,200";
  assert.ok(
    Math.abs(curveLength(parseCurve(a)) - curveLength(parseCurve(b))) <= 1,
    "the fixture stopped being a tie",
  );
  const first = assignHops([
    { id: "e-a", curve: parseCurve(a) },
    { id: "e-b", curve: parseCurve(b) },
  ]);
  const reversed = assignHops([
    { id: "e-b", curve: parseCurve(b) },
    { id: "e-a", curve: parseCurve(a) },
  ]);
  assert.deepEqual(
    [...first.keys()],
    [...reversed.keys()],
    "the tie was settled by which connector came first in the list",
  );
});

check("a crossing near an end is declined", () => {
  /* An arc there lands on the arrowhead or against the node the connector just
     left, where a bridge does not read as one. Declined, like a centred
     obstruction in `curve-clearance`. */
  const long = "M 0,100 Q 200,100 400,100";
  const nearEnd = "M 20,0 Q 20,100 20,200";
  const hops = assignHops([
    { id: "e-long", curve: parseCurve(long) },
    { id: "e-near", curve: parseCurve(nearEnd) },
  ]);
  assert.equal(
    hops.size,
    0,
    "a bridge was drawn within a twelfth of a connector's end",
  );
});

console.log("\n4c. The bridge is cut into the line, not painted over it");

check("the hopped path interrupts its own curve with an arc", () => {
  const hops = assignHops([
    { id: "e-long", curve: parseCurve(LONG) },
    { id: "e-short", curve: parseCurve(SHORT) },
  ]);
  const drawn = pathWithHops(SHORT, hops.get("e-short"));
  assert.match(drawn, /\bA /, "no arc — the line was left running straight");
  assert.notEqual(drawn, SHORT);
  /* An arc PAINTED OVER the line would leave the original path intact and add
     a second one. Cutting means the curve command appears twice, once per
     side of the bridge. */
  assert.equal(
    (drawn.match(/\bQ /g) ?? []).length,
    2,
    "the curve was not split — an arc laid on top still shows the line under it",
  );
});

check("the bridge sits on the crossing, not near it", () => {
  const hops = assignHops([
    { id: "e-long", curve: parseCurve(LONG) },
    { id: "e-short", curve: parseCurve(SHORT) },
  ]);
  const t = hops.get("e-short")[0];
  const at = pointAt(parseCurve(SHORT), t);
  assert.ok(
    Math.abs(at.y - 132) < 2,
    `the bridge is at y=${at.y.toFixed(1)}, the crossing is at y=132`,
  );
  const drawn = pathWithHops(SHORT, [t]);
  const arc = /A [\d.]+ [\d.]+ 0 0 1 ([\d.-]+),([\d.-]+)/.exec(drawn);
  assert.ok(arc !== null, "no arc to measure");
  assert.ok(
    Math.abs(Number(arc[2]) - 132) <= HOP_RADIUS + 1,
    "the arc ends further than its own radius from the crossing",
  );
});

check("a connector left alone is returned byte for byte", () => {
  assert.equal(pathWithHops(LONG, []), LONG);
  assert.equal(
    pathWithHops("M 0,0 L 10,10", [0.5]),
    "M 0,0 L 10,10",
    "an unrecognised path shape was cut anyway — a connector with a gap in it",
  );
});

check("a connector crossing too many others keeps its straight line", () => {
  /* A line carrying six bumps has stopped being a line, so the honest report
     is the diagram's crossing count — not a connector drawn as a dotted arc. */
  const shortOne = {
    id: "e-short",
    curve: parseCurve("M 200,0 Q 200,200 200,400"),
  };
  const crossers = Array.from({ length: MAX_HOPS_PER_EDGE + 2 }, (_, i) => ({
    id: `x${i}`,
    curve: parseCurve(
      `M 0,${60 + i * 60} Q 300,${60 + i * 60} 600,${60 + i * 60}`,
    ),
  }));
  const hops = assignHops([shortOne, ...crossers]);
  assert.equal(
    hops.has("e-short"),
    false,
    `a connector was given more than ${MAX_HOPS_PER_EDGE} bridges`,
  );
});

check("splitting a curve does not move it", () => {
  /* De Casteljau is exact, and this is what says so: the halves must meet, and
     a point on the original must still be on the piece it fell in. */
  for (const path of [LONG, "M 0,0 C 50,0 50,100 100,100"]) {
    const curve = parseCurve(path);
    const [head, tail] = splitAt(curve, 0.4);
    assert.deepEqual(
      head.points[head.points.length - 1],
      tail.points[0],
      "the two halves do not meet",
    );
    const onOriginal = pointAt(curve, 0.2);
    const onHead = pointAt(head, 0.5);
    assert.ok(
      Math.hypot(onOriginal.x - onHead.x, onOriginal.y - onHead.y) < 1e-6,
      "the split moved the curve",
    );
  }
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
  for (const rel of ["src/lib/edge-fan.ts", "src/lib/edge-crossings.ts"]) {
    const source = read(rel);
    assert.ok(
      !/from ["']@?xyflow/.test(source) && !/from ["']react/.test(source),
      `${rel} imported React — Node's type stripping cannot follow it and ` +
        "this check would silently stop running",
    );
  }
});

console.log(
  failures === 0
    ? `\nAll ${assertions} connector-density assertions passed.`
    : `\n${failures} of ${assertions} assertion(s) FAILED`,
);
process.exit(failures === 0 ? 0 : 1);

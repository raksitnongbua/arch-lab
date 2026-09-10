/**
 * Proves the C4 connector's right-angle route, by computing it.
 *
 * WHAT THIS REPLACED. `check:bezier-path` pinned the old cubic to React
 * Flow's own `getBezierPath` string-for-string, and `check:curve-clearance`
 * proved the quadratic bow got past a grazed box. Both went with the curve.
 * The properties worth keeping are the ones that were true of the curve for
 * reasons that had nothing to do with it being a curve — a connector leaves
 * its node cleanly, two parallels do not lie on top of each other, a label
 * sits on the line — so they are asserted here against the polyline instead.
 *
 * WHY THESE ASSERTIONS AND NOT A GOLDEN PATH STRING. A `d` fixture would
 * fail on every deliberate change and prove nothing about whether the result
 * is readable. What matters about an orthogonal route is structural: every
 * segment is axis-aligned, the run leaving a node points OUT of the side it
 * leaves by and is long enough to give the arrowhead an honest tangent, and
 * the label lands on the line rather than near it. Those are computable, and
 * a change that breaks one of them is a change the reader would see.
 *
 * MUTATION-TESTED. Each assertion here was confirmed to fail with the
 * corresponding property broken in the module — a stub of 0, a corridor
 * offset ignored, `simplify` disabled, the early/late corner choice inverted.
 *
 * Run with: pnpm check:orthogonal-route
 */

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/* The same resolver every geometry check installs: `@/` aliases and
   extensionless relative imports, which Node's type stripping does not
   resolve on its own. */
registerHooks({
  resolve(specifier, context, nextResolve) {
    let resolved = specifier;
    if (resolved.startsWith("@/")) {
      resolved = pathToFileURL(join(root, "src", resolved.slice(2))).href;
    }
    if (
      (resolved.startsWith("./") || resolved.startsWith("../")) &&
      typeof context.parentURL === "string"
    ) {
      resolved = new URL(resolved, context.parentURL).href;
    }
    if (resolved.startsWith("file:")) {
      const asPath = fileURLToPath(resolved);
      if (!(existsSync(asPath) && statSync(asPath).isFile())) {
        if (existsSync(`${asPath}.ts`)) {
          resolved = pathToFileURL(`${asPath}.ts`).href;
        } else if (existsSync(join(asPath, "index.ts"))) {
          resolved = pathToFileURL(join(asPath, "index.ts")).href;
        }
      }
    }
    return nextResolve(resolved, context);
  },
});

const load = (rel) => import(pathToFileURL(join(root, rel)).href);
const read = (rel) => readFileSync(join(root, rel), "utf8");

const { orthogonalRoute, EDGE_STUB } = await load(
  "src/lib/orthogonal-route.ts",
);
const {
  roundedPolylinePath,
  polylineLength,
  pointAlongPolyline,
  CORNER_RADIUS,
} = await load("src/lib/polyline-path.ts");
const { facingSide, fanOffset, pointOnSide, sideLength } = await load(
  "src/lib/edge-fan.ts",
);

let assertions = 0;
let failures = 0;
const check = (name, run) => {
  try {
    run();
    assertions += 1;
  } catch (error) {
    failures += 1;
    console.error(`FAIL  ${name}\n      ${error.message}`);
  }
};

const OUTWARD = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
};

/* -------------------------------------------------------------------------- */
/* 1. Every route is orthogonal, in every combination of sides                 */
/* -------------------------------------------------------------------------- */

/* THE GRID IS DERIVED FROM `facingSide`, NOT HAND-LISTED. Enumerating all
   sixteen side combinations looks more thorough and is actually worse: half
   of them are unreachable (with the target to the right, `facingSide` never
   returns `left` for the source), so a router would be held to wrap-around
   cases the product cannot produce while the reachable mixed-axis case —
   a WIDE source and a TALL target picking different axes, because
   `facingSide` divides by each rect's own half-extent — could be missed
   entirely. `codebase.md` §4 says to derive a check from the data rather
   than from a list of names; this is that, applied to geometry.

   Every pair below is run through the same two calls `getFloatingAnchors`
   makes, so what is routed is what the canvas routes. */
const SHAPES = [
  { width: 176, height: 100 },
  { width: 320, height: 80 },
  { width: 90, height: 260 },
];
const OFFSETS = [
  { dx: 420, dy: 0 },
  { dx: -420, dy: 0 },
  { dx: 0, dy: 320 },
  { dx: 0, dy: -320 },
  { dx: 420, dy: 320 },
  { dx: -420, dy: 320 },
  { dx: 420, dy: -320 },
  { dx: -420, dy: -320 },
  /* Close enough to overlap on one axis — the case with no legal crossing
     run, which sent the corridor to the other axis. */
  { dx: 60, dy: 300 },
  { dx: 300, dy: 40 },
];

const anchorsFor = (source, target, sourceSlot, targetSlot) => {
  const dx = target.x + target.width / 2 - (source.x + source.width / 2);
  const dy = target.y + target.height / 2 - (source.y + source.height / 2);
  const sourceSide = facingSide(source, dx, dy);
  const targetSide = facingSide(target, -dx, -dy);
  const from = pointOnSide(
    source,
    sourceSide,
    fanOffset(
      sourceSlot.index,
      sourceSlot.count,
      sideLength(source, sourceSide),
    ),
  );
  const to = pointOnSide(
    target,
    targetSide,
    fanOffset(
      targetSlot.index,
      targetSlot.count,
      sideLength(target, targetSide),
    ),
  );
  return { from, to, sourceSide, targetSide };
};

const alone = { index: 0, count: 1 };
const everyRoute = [];
for (const sourceShape of SHAPES) {
  for (const targetShape of SHAPES) {
    for (const { dx, dy } of OFFSETS) {
      for (const corridorOffset of [0, -48, 48]) {
        const source = { x: 0, y: 0, ...sourceShape };
        const target = { x: dx, y: dy, ...targetShape };
        const { from, to, sourceSide, targetSide } = anchorsFor(
          source,
          target,
          alone,
          alone,
        );
        const input = {
          sourceX: from.x,
          sourceY: from.y,
          sourceSide,
          targetX: to.x,
          targetY: to.y,
          targetSide,
          corridorOffset,
        };
        everyRoute.push({ input, points: orthogonalRoute(input) });
      }
    }
  }
}

check("the grid actually reaches the mixed-axis case", () => {
  /* Otherwise every assertion below would be testing one branch and
     reporting on three. */
  const mixed = everyRoute.filter(
    ({ input }) =>
      (input.sourceSide === "left" || input.sourceSide === "right") !==
      (input.targetSide === "left" || input.targetSide === "right"),
  );
  assert.ok(
    mixed.length > 0,
    "no pair in the grid picked sides on different axes",
  );
  const both = everyRoute.filter(({ points }) => points.length >= 4);
  assert.ok(both.length > 0, "no pair in the grid needed a corridor");
});

check(`every segment is axis-aligned (${everyRoute.length} routes)`, () => {
  for (const { input, points } of everyRoute) {
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      const axisAligned = a.x === b.x || a.y === b.y;
      assert.ok(
        axisAligned,
        `${input.sourceSide}→${input.targetSide} segment ${i} is diagonal: ` +
          `(${a.x},${a.y})→(${b.x},${b.y})`,
      );
    }
  }
});

check("no route repeats a point or keeps a collinear corner", () => {
  for (const { input, points } of everyRoute) {
    for (let i = 1; i < points.length; i += 1) {
      assert.ok(
        points[i].x !== points[i - 1].x || points[i].y !== points[i - 1].y,
        `${input.sourceSide}→${input.targetSide} repeats a point at ${i}`,
      );
    }
    for (let i = 1; i < points.length - 1; i += 1) {
      const [p, h, n] = [points[i - 1], points[i], points[i + 1]];
      const collinear =
        (p.x === h.x && h.x === n.x) || (p.y === h.y && h.y === n.y);
      assert.ok(
        !collinear,
        `${input.sourceSide}→${input.targetSide} keeps a corner that is not a ` +
          `turn at ${i} — roundedPolylinePath would draw an arc on a straight run`,
      );
    }
  }
});

check("both ends land exactly on the attachment points they were given", () => {
  for (const { input, points } of everyRoute) {
    const first = points[0];
    const last = points[points.length - 1];
    assert.equal(first.x, input.sourceX);
    assert.equal(first.y, input.sourceY);
    assert.equal(last.x, input.targetX);
    assert.equal(last.y, input.targetY);
  }
});

/* -------------------------------------------------------------------------- */
/* 2. The stub: an arrowhead's tangent is the approach, not a corner arc       */
/* -------------------------------------------------------------------------- */

check("the first run leaves along the source side's outward normal", () => {
  for (const { input, points } of everyRoute) {
    const out = OUTWARD[input.sourceSide];
    const step = { x: points[1].x - points[0].x, y: points[1].y - points[0].y };
    const along = step.x * out.x + step.y * out.y;
    assert.ok(
      along > 0,
      `${input.sourceSide}→${input.targetSide} leaves the node sideways or ` +
        `backwards (dot ${along})`,
    );
  }
});

check("the last run arrives against the target side's outward normal", () => {
  for (const { input, points } of everyRoute) {
    const out = OUTWARD[input.targetSide];
    const last = points[points.length - 1];
    const prev = points[points.length - 2];
    const step = { x: last.x - prev.x, y: last.y - prev.y };
    const along = step.x * out.x + step.y * out.y;
    assert.ok(
      along < 0,
      `${input.sourceSide}→${input.targetSide} arrives from inside the node ` +
        `(dot ${along})`,
    );
  }
});

/* The straight run either side of a turn has to outlast the arc that rounds
   it, or `orient="auto-start-reverse"` reads the arc's tangent and the
   arrowhead enters the box at an angle. `roundedPolylinePath` takes at most
   half a segment per corner, so a terminal run of 2·CORNER_RADIUS is the
   floor; EDGE_STUB is checked against it here so the two constants cannot
   drift apart silently. */
check("EDGE_STUB clears the corner radius with room to spare", () => {
  assert.ok(
    EDGE_STUB >= 2 * CORNER_RADIUS,
    `EDGE_STUB ${EDGE_STUB} is not at least twice CORNER_RADIUS ${CORNER_RADIUS}`,
  );
});

check("every terminal run is at least the stub long", () => {
  for (const { input, points } of everyRoute) {
    const head = Math.hypot(
      points[1].x - points[0].x,
      points[1].y - points[0].y,
    );
    const last = points[points.length - 1];
    const prev = points[points.length - 2];
    const tail = Math.hypot(last.x - prev.x, last.y - prev.y);
    assert.ok(
      head >= EDGE_STUB - 1e-9,
      `${input.sourceSide}→${input.targetSide} leaves with a ${head} run`,
    );
    assert.ok(
      tail >= EDGE_STUB - 1e-9,
      `${input.sourceSide}→${input.targetSide} arrives on a ${tail} run`,
    );
  }
});

/* -------------------------------------------------------------------------- */
/* 3. The degenerate case still draws one straight line                        */
/* -------------------------------------------------------------------------- */

/* THE CASE MOST DIAGRAMS ARE MOSTLY MADE OF. Two boxes level with each other,
   one connector between them: the reader should see a plain horizontal line,
   not a line with two invisible kinks in it where the corridor arithmetic
   happened to land. */
check("two level nodes, one connector ⇒ exactly two points", () => {
  const points = orthogonalRoute({
    sourceX: 300,
    sourceY: 200,
    sourceSide: "right",
    targetX: 700,
    targetY: 200,
    targetSide: "left",
  });
  assert.deepEqual(points, [
    { x: 300, y: 200 },
    { x: 700, y: 200 },
  ]);
  assert.ok(
    !roundedPolylinePath(points).includes("Q"),
    "a straight connector was drawn with a corner arc in it",
  );
});

check("two stacked nodes, one connector ⇒ exactly two points", () => {
  const points = orthogonalRoute({
    sourceX: 200,
    sourceY: 300,
    sourceSide: "bottom",
    targetX: 200,
    targetY: 700,
    targetSide: "top",
  });
  assert.equal(points.length, 2);
});

check("a diagonal pair turns exactly once", () => {
  /* Source leaves rightwards, target is entered from the top: one corner is
     the whole route, and it is the shape the reference screenshot is full
     of. Three points, not five. */
  const points = orthogonalRoute({
    sourceX: 300,
    sourceY: 200,
    sourceSide: "right",
    targetX: 700,
    targetY: 600,
    targetSide: "top",
  });
  assert.equal(points.length, 3, `expected one turn, got ${points.length - 1}`);
  assert.deepEqual(points[1], { x: 700, y: 200 });
});

/* -------------------------------------------------------------------------- */
/* 4. Parallels separate along their whole length, not just at the ends        */
/* -------------------------------------------------------------------------- */

/* THE DEFECT THIS EXISTS FOR. `edge-fan` already gives two A→B connectors
   different attachment points, so a naive route would leave apart, MERGE
   along the shared corridor, and part again — which reads worse than not
   separating at all, because the reader watches two lines become one and
   cannot tell which came out the other side. */
check("two parallels never share a corridor coordinate", () => {
  const common = {
    sourceX: 300,
    sourceSide: "right",
    targetX: 800,
    targetSide: "left",
  };
  const a = orthogonalRoute({
    ...common,
    sourceY: 180,
    targetY: 520,
    corridorOffset: -24,
  });
  const b = orthogonalRoute({
    ...common,
    sourceY: 220,
    targetY: 560,
    corridorOffset: 24,
  });
  const verticalRunX = (points) => {
    for (let i = 1; i < points.length; i += 1) {
      if (points[i].x === points[i - 1].x) return points[i].x;
    }
    return null;
  };
  const xa = verticalRunX(a);
  const xb = verticalRunX(b);
  assert.ok(xa !== null && xb !== null, "neither route had a crossing run");
  assert.ok(
    Math.abs(xa - xb) >= 48 - 1e-9,
    `the two corridors are ${Math.abs(xa - xb)} apart, so the parallels merge`,
  );
});

check("a lone connector takes no corridor offset at all", () => {
  const withOffset = orthogonalRoute({
    sourceX: 300,
    sourceY: 180,
    sourceSide: "right",
    targetX: 800,
    targetY: 520,
    targetSide: "left",
    corridorOffset: 0,
  });
  const withoutArgument = orthogonalRoute({
    sourceX: 300,
    sourceY: 180,
    sourceSide: "right",
    targetX: 800,
    targetY: 520,
    targetSide: "left",
  });
  assert.deepEqual(withoutArgument, withOffset);
});

/* -------------------------------------------------------------------------- */
/* 5. The label sits ON the line                                               */
/* -------------------------------------------------------------------------- */

/* The curve put its anchor at a formula on control points and then slid it
   along the STRAIGHT source→target line, on the grounds that the two were
   within a couple of pixels at those curvatures. On an elbow the straight
   line between the ends is the diagonal the route exists to avoid, so the
   anchor is measured along the polyline — and this is what says so. */
const onSegment = (points, p) => {
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const withinX =
      p.x >= Math.min(a.x, b.x) - 0.001 && p.x <= Math.max(a.x, b.x) + 0.001;
    const withinY =
      p.y >= Math.min(a.y, b.y) - 0.001 && p.y <= Math.max(a.y, b.y) + 0.001;
    const collinear =
      Math.abs(a.x - b.x) < 1e-9
        ? Math.abs(p.x - a.x) < 0.001
        : Math.abs(p.y - a.y) < 0.001;
    if (withinX && withinY && collinear) return true;
  }
  return false;
};

check("the midpoint anchor lands on the route, for every route", () => {
  for (const { input, points } of everyRoute) {
    const anchor = pointAlongPolyline(points, polylineLength(points) / 2);
    assert.ok(
      onSegment(points, anchor),
      `${input.sourceSide}→${input.targetSide} put its label at ` +
        `(${anchor.x},${anchor.y}), which is off the line`,
    );
  }
});

check("a slid (fan-biased) anchor also lands on the route", () => {
  for (const { points } of everyRoute) {
    const length = polylineLength(points);
    for (const bias of [-1, 1]) {
      const shift = Math.min(56, length * 0.22) * bias;
      const anchor = pointAlongPolyline(points, length / 2 + shift);
      assert.ok(onSegment(points, anchor), "a biased label left the line");
    }
  }
});

check(
  "the anchor's direction is the segment it sits on, not the diagonal",
  () => {
    /* A pure L whose two legs are very different lengths: the halfway point is
     on the long leg, so its direction must be that leg's — and the diagonal
     between the ends points somewhere else entirely. Taking the diagonal is
     what put a chip in the wrong quadrant, so this is the assertion that
     would catch a revert to it. */
    const points = orthogonalRoute({
      sourceX: 300,
      sourceY: 200,
      sourceSide: "right",
      targetX: 1100,
      targetY: 300,
      targetSide: "top",
    });
    const anchor = pointAlongPolyline(points, polylineLength(points) / 2);
    assert.equal(
      Math.abs(anchor.dy),
      0,
      "the anchor claimed a vertical direction",
    );
    assert.equal(anchor.dx, 1);
    const diagonal = Math.hypot(1100 - 300, 300 - 200);
    assert.ok(
      Math.abs((300 - 200) / diagonal) > 0.1,
      "the fixture's diagonal is too flat to tell the two apart",
    );
  },
);

/* -------------------------------------------------------------------------- */
/* 6. It composes with the fan, on real node rectangles                        */
/* -------------------------------------------------------------------------- */

/* `edge-fan` is the module the route trusts for side selection and spacing,
   and the ER renderer has driven orthogonal connectors from it all along.
   This drives the two together the way `edge-geometry.ts` does, so a change
   to either that breaks the pairing fails here rather than on a canvas. */
check("six connectors off one node leave on six separate runs", () => {
  const source = { x: 0, y: 0, width: 176, height: 100 };
  const targets = Array.from({ length: 6 }, (_, i) => ({
    x: -400 + i * 220,
    y: 400,
    width: 176,
    height: 100,
  }));
  const side = "bottom";
  const length = sideLength(source, side);
  const firstRuns = targets.map((target, index) => {
    const attach = pointOnSide(
      source,
      side,
      fanOffset(index, targets.length, length),
    );
    const targetSide = facingSide(
      target,
      source.x + source.width / 2 - (target.x + target.width / 2),
      source.y + source.height / 2 - (target.y + target.height / 2),
    );
    const points = orthogonalRoute({
      sourceX: attach.x,
      sourceY: attach.y,
      sourceSide: side,
      targetX: target.x + target.width / 2,
      targetY: target.y,
      targetSide,
    });
    return points[1].x;
  });
  const unique = new Set(firstRuns.map((x) => Math.round(x * 100)));
  assert.equal(
    unique.size,
    6,
    `six connectors left the node on ${unique.size} distinct runs`,
  );
});

/* -------------------------------------------------------------------------- */
/* 7. The wiring: one router, every surface                                    */
/* -------------------------------------------------------------------------- */

/* THE HALF A GEOMETRY CHECK CANNOT SEE. Everything above proves the module is
   right; none of it proves the product calls it. The C4 connector is drawn on
   four surfaces — editor canvas, drag line, viewer, exporter (and through the
   exporter, /api/render) — and the failure this guards is the quiet one: a
   surface that keeps its own copy and drifts, which is `codebase.md` §4's
   two-halves failure and exactly what happened to the marketing hero. */
const hub = read("src/features/editor/lib/edge-geometry.ts");

check("the hub routes rather than curving", () => {
  assert.match(
    hub,
    /import \{ orthogonalRoute \} from "@\/lib\/orthogonal-route"/,
  );
  assert.ok(
    !/bezierPath|clearingOffset/.test(hub),
    "edge-geometry still reaches for the curve",
  );
});

check("no module imports the deleted curve helpers", () => {
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (/\.(ts|tsx|mjs)$/.test(entry.name)) {
        const text = read(rel);
        if (/from "[^"]*(curve-clearance|bezier-path)"/.test(text))
          offenders.push(rel);
      }
    }
  };
  walk("src");
  walk("scripts");
  assert.deepEqual(offenders, []);
});

check("every C4 surface reaches the route through the one hub", () => {
  const surfaces = [
    "src/features/editor/components/edges/c4-edge.tsx",
    "src/features/editor/components/edges/connection-line.tsx",
    "src/features/viewer/components/viewer-edge.tsx",
    "src/features/viewer/export/render-svg.ts",
    "src/features/viewer/components/viewer-canvas.tsx",
  ];
  for (const surface of surfaces) {
    const text = read(surface);
    assert.match(
      text,
      /getParallelEdgePath\(/,
      `${surface} does not call the shared path helper`,
    );
    assert.ok(
      !/orthogonalRoute\(/.test(text),
      `${surface} routes for itself instead of going through the hub`,
    );
  }
});

check(
  "the corner-rounder has one definition, shared with the flowchart",
  () => {
    for (const consumer of [
      "src/features/flowchart/components/flowchart-diagram.tsx",
      "src/features/flowchart/export/render-svg.ts",
    ]) {
      assert.match(
        read(consumer),
        /import \{ roundedPolylinePath \} from "@\/lib\/polyline-path"/,
        `${consumer} does not use the shared corner-rounder`,
      );
    }
    assert.ok(
      !/export function roundedPolylinePath/.test(
        read("src/features/flowchart/lib/shapes.ts"),
      ),
      "the flowchart kept a second copy of the corner-rounder",
    );
  },
);

/* Both modules must stay loadable by this script, which is the whole reason
   they are in `src/lib/` instead of beside the renderer that draws them. */
check("the geometry modules stay pure", () => {
  for (const rel of [
    "src/lib/orthogonal-route.ts",
    "src/lib/polyline-path.ts",
  ]) {
    const text = read(rel);
    const imports = [
      ...text.matchAll(/^\s*import[^;]*?from\s+"([^"]+)"/gm),
    ].map((match) => match[1]);
    for (const specifier of imports) {
      assert.ok(
        !/^react|^@xyflow|\.tsx$/.test(specifier),
        `${rel} imports ${specifier}, which a check script cannot load`,
      );
    }
  }
});

if (failures > 0) {
  console.error(
    `\n${failures} of ${assertions + failures} orthogonal-route assertions FAILED`,
  );
  process.exit(1);
}
console.log(`\nAll ${assertions} orthogonal-route assertions passed.`);

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

const { orthogonalRoute, EDGE_STUB, MAX_ANCHOR_SLIDE } = await load(
  "src/lib/orthogonal-route.ts",
);
const {
  roundedPolylinePath,
  polylineLength,
  pointAlongPolyline,
  CORNER_RADIUS,
} = await load("src/lib/polyline-path.ts");
const {
  assignFanSlots,
  facingSide,
  fanOffset,
  MIN_FAN_SPACING,
  parallelEdgeGroups,
  pointOnSide,
  sideLength,
} = await load("src/lib/edge-fan.ts");
const { getFloatingAnchors, getParallelEdgePath } = await load(
  "src/features/editor/lib/edge-geometry.ts",
);
const { deserializeModel } = await load(
  "src/features/editor/io/deserialize.ts",
);
const { SEED_MODEL } = await load("src/features/viewer/input/sync.ts");

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
    /import \{[^}]*orthogonalRoute[^}]*\} from "@\/lib\/orthogonal-route"/,
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

/* -------------------------------------------------------------------------- */
/* 8. A near-miss is absorbed, not drawn as a jog                              */
/* -------------------------------------------------------------------------- */

/* THE DEFECT, and it was on the front page. A person element is 160 wide and
   a system 176, so two of them centre-aligned — every default layout — have
   their attachments 8 units apart, and a right angle draws that honestly as a
   run, an 8-unit jog, and another run. Eight shipped documents had one,
   including the seed `/live` opens with. The curve this replaced hid it by
   sloping imperceptibly. `purpose.md`: correct and ugly is a bug here. */

check(
  "the slide is bounded by the closest two attachments may ever sit",
  () => {
    /* Not a free constant: the justification for the number IS this equality,
     so a change to either has to face the other. */
    assert.equal(MAX_ANCHOR_SLIDE, MIN_FAN_SPACING);
  },
);

check("a near-miss inside the slack draws one straight run", () => {
  for (const gap of [1, 4, 8, MAX_ANCHOR_SLIDE]) {
    const points = orthogonalRoute({
      sourceX: 300,
      sourceY: 200,
      sourceSide: "bottom",
      targetX: 300 + gap,
      targetY: 600,
      targetSide: "top",
      slack: MAX_ANCHOR_SLIDE,
    });
    assert.equal(
      points.length,
      2,
      `a ${gap}-unit misalignment still drew ${points.length} points`,
    );
  }
});

check("and neither end travels more than half the gap", () => {
  const gap = MAX_ANCHOR_SLIDE;
  const points = orthogonalRoute({
    sourceX: 300,
    sourceY: 200,
    sourceSide: "bottom",
    targetX: 300 + gap,
    targetY: 600,
    targetSide: "top",
    slack: MAX_ANCHOR_SLIDE,
  });
  assert.ok(
    Math.abs(points[0].x - 300) <= gap / 2 + 1e-9 &&
      Math.abs(points[points.length - 1].x - (300 + gap)) <= gap / 2 + 1e-9,
    "one end absorbed the whole misalignment instead of meeting in the middle",
  );
});

check("past the slack it is still drawn as a jog", () => {
  /* A slide that reached further would move an attachment past where a
     neighbour is entitled to sit, and would start hiding real misalignment
     the author can see and fix. */
  const points = orthogonalRoute({
    sourceX: 300,
    sourceY: 200,
    sourceSide: "bottom",
    targetX: 300 + MAX_ANCHOR_SLIDE + 1,
    targetY: 600,
    targetSide: "top",
    slack: MAX_ANCHOR_SLIDE,
  });
  assert.ok(points.length > 2, "the slide reached past its own bound");
});

check("no slack, no slide — the default is to draw what it is given", () => {
  const points = orthogonalRoute({
    sourceX: 300,
    sourceY: 200,
    sourceSide: "bottom",
    targetX: 308,
    targetY: 600,
    targetSide: "top",
  });
  assert.ok(points.length > 2, "a route slid without being granted slack");
});

check("slack is granted only to a connector alone on both of its sides", () => {
  const hub = { x: 0, y: 0, width: 480, height: 128 };
  const one = { x: 100, y: 400, width: 160, height: 80 };
  const lone = getFloatingAnchors(hub, one);
  assert.equal(
    lone.anchorSlack,
    MAX_ANCHOR_SLIDE,
    "a lone connector was refused the slide",
  );
  const shared = getFloatingAnchors(hub, one, {
    source: { index: 0, count: 3 },
    target: { index: 0, count: 1 },
  });
  assert.equal(
    shared.anchorSlack,
    0,
    "a connector sharing a side was allowed to slide into its neighbour's gap",
  );
});

/* THE REGRESSION ITSELF, measured on every document the product ships rather
   than on a fixture — `codebase.md` §4: a check written from a hand-listed
   set cannot notice the thing it has never heard of. */
check("no shipped document draws a small kink on a lone connector", () => {
  const documents = [["seed", (SEED_MODEL.file ?? SEED_MODEL).diagrams]];
  const dir = "src/features/viewer/service/data";
  for (const name of readdirSync(join(root, dir)).sort()) {
    if (!name.endsWith(".archlab.json")) continue;
    documents.push([
      name,
      Object.values(deserializeModel(read(`${dir}/${name}`)).diagrams),
    ]);
  }
  assert.ok(documents.length > 1, "no documents were scanned");

  const offenders = [];
  let lone = 0;
  for (const [label, diagrams] of documents) {
    for (const diagram of diagrams) {
      const rectById = new Map(
        diagram.nodes.map((node) => [
          node.id,
          {
            x: node.position.x,
            y: node.position.y,
            width: node.size.width,
            height: node.size.height,
          },
        ]),
      );
      const fans = assignFanSlots(diagram.edges, rectById);
      const groups = parallelEdgeGroups(diagram.edges);
      for (const edge of diagram.edges) {
        const source = rectById.get(edge.source);
        const target = rectById.get(edge.target);
        if (source === undefined || target === undefined) continue;
        const anchors = getFloatingAnchors(source, target, fans.get(edge.id));
        if (anchors.anchorSlack === 0) continue;
        lone += 1;
        const group = groups.get(edge.id) ?? { index: 0, count: 1 };
        const laid = getParallelEdgePath({
          ...anchors,
          parallelIndex: group.index,
          parallelCount: group.count,
        });
        const vertical =
          anchors.sourcePosition === "top" ||
          anchors.sourcePosition === "bottom";
        const off = vertical
          ? Math.abs(anchors.targetX - anchors.sourceX)
          : Math.abs(anchors.targetY - anchors.sourceY);
        if (laid.points.length > 2 && off > 0 && off <= MAX_ANCHOR_SLIDE) {
          offenders.push(
            `${label}/${diagram.id} ${edge.source}->${edge.target} (${off})`,
          );
        }
      }
    }
  }
  assert.ok(
    lone > 0,
    "no lone connector was scanned — the sweep proves nothing",
  );
  assert.deepEqual(offenders, []);
});

/* -------------------------------------------------------------------------- */
/* 9. The corridor picks a lane clear of what it passes                        */
/* -------------------------------------------------------------------------- */

/* WHAT THIS DOES NOT CLAIM. Only the long middle run moves. The two ends are
   attachment points chosen before the route is built, so a connector whose
   final approach passes through a box still passes through it — the remedy
   there is re-choosing which SIDE it arrives by, which is not attempted. The
   assertions below are written to that boundary rather than to "no connector
   ever crosses anything", which would be a promise the code does not make. */

const boxAt = (x, y, width = 200, height = 100) => ({ x, y, width, height });

check("a corridor steps aside for a box in its way", () => {
  /* Source and target level, a box squarely on the midpoint corridor. */
  const between = boxAt(540, 200, 120, 400);
  const points = orthogonalRoute({
    sourceX: 300,
    sourceY: 250,
    sourceSide: "right",
    targetX: 900,
    targetY: 550,
    targetSide: "left",
    obstacles: [between],
  });
  const crossing = points.find((p, i) => i > 0 && p.x === points[i - 1].x);
  assert.ok(crossing !== undefined, "the route had no crossing run to move");
  assert.ok(
    crossing.x <= between.x || crossing.x >= between.x + between.width,
    `the crossing run sits at x=${crossing.x}, inside the box at ` +
      `${between.x}..${between.x + between.width}`,
  );
});

check("a lane is judged by the whole Z, not by its crossing run alone", () => {
  /* THE DEFECT THIS PINS. A lane used to be accepted as soon as the short
     crossing run missed every box, while the two legs that reach it — most of
     the connector — were never looked at. The box below is placed to make the
     difference visible: it stands on the SOURCE's leg and clear of the
     target's, and it stops short of the midpoint lane, so testing the run
     alone accepts a route that goes straight through it. Without the legs in
     the predicate the search never steps past this box, because as far as it
     can tell there was nothing to step past. */
  const beside = { x: 450, y: 300, width: 60, height: 100 };
  const points = orthogonalRoute({
    sourceX: 500,
    sourceY: 100,
    sourceSide: "bottom",
    targetX: 520,
    targetY: 700,
    targetSide: "top",
    obstacles: [beside],
  });
  const through = points.slice(1).some((point, index) => {
    const previous = points[index];
    return (
      Math.max(previous.x, point.x) > beside.x &&
      Math.min(previous.x, point.x) < beside.x + beside.width &&
      Math.max(previous.y, point.y) > beside.y &&
      Math.min(previous.y, point.y) < beside.y + beside.height
    );
  });
  assert.ok(
    !through,
    `the route runs through the box at ${beside.x},${beside.y}: ` +
      points.map((p) => `${p.x},${p.y}`).join(" "),
  );
});

check("and does not move when nothing is in the way", () => {
  const plain = {
    sourceX: 300,
    sourceY: 250,
    sourceSide: "right",
    targetX: 900,
    targetY: 550,
    targetSide: "left",
  };
  assert.deepEqual(
    orthogonalRoute({ ...plain, obstacles: [boxAt(300, 900)] }),
    orthogonalRoute(plain),
    "a box nowhere near the run moved the corridor anyway",
  );
});

check("a box it only grazes is not treated as in the way", () => {
  /* Strict comparisons on purpose: a run along an element's edge touches
     nothing, and stepping away from it would move connectors for no reason. */
  const plain = {
    sourceX: 300,
    sourceY: 250,
    sourceSide: "right",
    targetX: 900,
    targetY: 550,
    targetSide: "left",
  };
  const bare = orthogonalRoute(plain);
  const run = bare.find((p, i) => i > 0 && p.x === bare[i - 1].x);
  assert.deepEqual(
    orthogonalRoute({
      ...plain,
      obstacles: [boxAt(run.x, 200, 120, 400)],
    }),
    bare,
    "a box whose edge the run lies along pushed the corridor aside",
  );
});

check("the open-ended search is bounded by its reach", () => {
  /* TWO ENDS LEAVING THE SAME WAY — both exit right — so the corridor's
     feasible region has no far edge and only CHANNEL_REACH stops the search.
     The facing case is bounded by the gap between the two stubs instead, so
     it cannot exercise this and an earlier version of this section thought
     it did: the "walled in" assertion below passed with the reach set to
     100000. Walled for further than the reach, the route must give up and
     keep its lane rather than run off the diagram. */
  const plain = {
    sourceX: 300,
    sourceY: 200,
    sourceSide: "right",
    targetX: 300,
    targetY: 600,
    targetSide: "right",
  };
  const bare = orthogonalRoute(plain);
  const lane = bare.find((p, i) => i > 0 && p.x === bare[i - 1].x);
  const walled = orthogonalRoute({
    ...plain,
    obstacles: [boxAt(lane.x - 10, 100, 4000, 600)],
  });
  const walledLane = walled.find((p, i) => i > 0 && p.x === walled[i - 1].x);
  assert.ok(
    walledLane.x - lane.x <= 480,
    `the corridor ran ${walledLane.x - lane.x} past its lane looking for a ` +
      "gap — a connector flung off the diagram is worse than one that crosses",
  );
});

check("an unreachable lane leaves the route where it was", () => {
  /* Walled in on both sides: a connector that crosses a box is bad, and one
     flung to the far edge of the diagram to avoid it is worse. */
  const plain = {
    sourceX: 300,
    sourceY: 250,
    sourceSide: "right",
    targetX: 900,
    targetY: 550,
    targetSide: "left",
  };
  const wall = boxAt(320, 100, 560, 600);
  assert.deepEqual(
    orthogonalRoute({ ...plain, obstacles: [wall] }),
    orthogonalRoute(plain),
    "the corridor fled a box it could not get past",
  );
});

/* THE MEASURED RESULT ON REAL DOCUMENTS, and the bound it must not exceed.
   Routes are drawn from every shipped document with the obstacle list the
   exporter passes, and no point may fall outside the elements' own bounding
   box. `viewer/export/render-svg.ts` frames from node and frame rects only,
   so a route that detoured past them would be CLIPPED in every PNG — the
   corridor's reach is what keeps that from happening, and this is what says
   so before a reader finds it. */
check("no routed corridor leaves the elements' bounding box", () => {
  const documents = [["seed", (SEED_MODEL.file ?? SEED_MODEL).diagrams]];
  const dir = "src/features/viewer/service/data";
  for (const name of readdirSync(join(root, dir)).sort()) {
    if (!name.endsWith(".archlab.json")) continue;
    documents.push([
      name,
      Object.values(deserializeModel(read(`${dir}/${name}`)).diagrams),
    ]);
  }

  let routed = 0;
  for (const [label, diagrams] of documents) {
    for (const diagram of diagrams) {
      const rects = diagram.nodes.map((node) => ({
        id: node.id,
        x: node.position.x,
        y: node.position.y,
        width: node.size.width,
        height: node.size.height,
      }));
      if (rects.length === 0) continue;
      const rectById = new Map(rects.map((rect) => [rect.id, rect]));
      const bounds = {
        x1: Math.min(...rects.map((r) => r.x)),
        y1: Math.min(...rects.map((r) => r.y)),
        x2: Math.max(...rects.map((r) => r.x + r.width)),
        y2: Math.max(...rects.map((r) => r.y + r.height)),
      };
      const fans = assignFanSlots(diagram.edges, rectById);
      const groups = parallelEdgeGroups(diagram.edges);
      for (const edge of diagram.edges) {
        const source = rectById.get(edge.source);
        const target = rectById.get(edge.target);
        if (source === undefined || target === undefined) continue;
        const group = groups.get(edge.id) ?? { index: 0, count: 1 };
        const laid = getParallelEdgePath({
          ...getFloatingAnchors(source, target, fans.get(edge.id)),
          parallelIndex: group.index,
          parallelCount: group.count,
          obstacles: rects.filter(
            (rect) => rect.id !== edge.source && rect.id !== edge.target,
          ),
        });
        routed += 1;
        for (const point of laid.points) {
          assert.ok(
            point.x >= bounds.x1 &&
              point.x <= bounds.x2 &&
              point.y >= bounds.y1 &&
              point.y <= bounds.y2,
            `${label}/${diagram.id} ${edge.source}->${edge.target} routed to ` +
              `(${point.x},${point.y}), outside ${JSON.stringify(bounds)} — ` +
              "the exporter frames from the elements and would clip it",
          );
        }
      }
    }
  }
  assert.ok(routed > 0, "no connector was routed — the sweep proves nothing");
});

if (failures > 0) {
  console.error(
    `\n${failures} of ${assertions + failures} orthogonal-route assertions FAILED`,
  );
  process.exit(1);
}
console.log(`\nAll ${assertions} orthogonal-route assertions passed.`);

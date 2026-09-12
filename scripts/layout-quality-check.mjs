#!/usr/bin/env node
/**
 * Auto-arrange quality check: pressing "let the layout place them" must not
 * make a diagram harder to read than the author's own placement did.
 *
 * WHY THIS EXISTS. The release row in the layout-direction menu hands a
 * diagram's geometry back to `defaultPositions`. For as long as that produced
 * a worse picture than the person had already made, the row was a control
 * nobody could be advised to press, and the only evidence either way was a
 * screenshot somebody happened to take. `purpose.md` asks for a `check:*`
 * script behind any surface that offers a choice, in the manner of
 * `check:themes`: this is that script for the layout, and the number it
 * defends is the one the feature was blocked on.
 *
 * WHAT A CROSSING IS, AND WHY THE TWO KINDS ARE COUNTED SEPARATELY. Conflating
 * them is what sent an earlier attempt at this after the wrong lever. Two
 * connectors meeting (`connector`) is an ORDERING fault — the barycentre sweep
 * already handles it, and best-of-eight sweeps on the reported diagram scored
 * five before and five after. A connector drawn through an element it does not
 * touch (`element`) is a ROOM fault: the row it crosses was ordered as though
 * that connector did not exist. Reserved lanes (`archtext/lib/defaults.ts`)
 * are the answer to the second, and this script is what says so.
 *
 * MEASURED ON THE ROUTES THE PRODUCT DRAWS. The geometry comes from
 * `defaultPositions` and the routes from `edge-geometry`, obstacles included,
 * which is what the exporter and both canvases pass. Counting on routes
 * computed without obstacles was an earlier mistake here and it inflated every
 * number on both sides of the comparison.
 *
 * THE CORPUS IS READ FROM THE FILESYSTEM, never a hand-listed set — a check
 * written against names cannot notice the document it has never heard of
 * (`codebase.md`, habit 4). Every `*.archlab.json` under the viewer's data
 * directory is scored, and adding one puts it under this bar automatically.
 *
 * What it proves:
 *
 *   1. Per diagram, the arranged geometry scores no more total crossings than
 *      the geometry its author wrote.
 *   2. Across the corpus, the arranged geometry draws NO connector through an
 *      element. This is what reserved lanes buy; a non-zero count means a lane
 *      was not reserved for an edge that skips a row, or was not honoured.
 * WHAT IS DELIBERATELY NOT ASSERTED. A lane holds a column open; it does not
 * steer the connector into that column, because both attachments are chosen by
 * `edge-fan` before the route is drawn. A source and a target sitting directly
 * above one another, with an unrelated element beside them, can still be joined
 * by a line drawn through it — a three-element fixture does exactly that. An
 * assertion written to that case would fail on code that is working as
 * designed, so the bar is set on the documents people actually have, which is
 * also where the defect was reported. If a bundled document ever reaches that
 * shape, assertion 2 is what will say so.
 *
 * Exits non-zero on any failure. Run with: pnpm check:layout-quality
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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
      if (!(existsSync(asPath) && statSync(asPath).isFile())) {
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

const load = (relative) =>
  import(pathToFileURL(path.join(ROOT, relative)).href);

const { defaultPositions } = await load(
  "src/features/archtext/lib/defaults.ts",
);
const { deserializeModel } = await load(
  "src/features/editor/io/deserialize.ts",
);
const {
  assignFanSlots,
  parallelEdgeGroups,
  labelBiasByEdgeId,
  getFloatingAnchors,
  getParallelEdgePath,
} = await load("src/features/editor/lib/edge-geometry.ts");

/* ----------------------------------------------------------------------- */
/* Harness                                                                  */
/* ----------------------------------------------------------------------- */

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

const fail = (message) => {
  throw new Error(message);
};

/* ----------------------------------------------------------------------- */
/* Geometry                                                                 */
/* ----------------------------------------------------------------------- */

const rectsOf = (diagram) =>
  new Map(
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

/** Every connector's polyline, routed exactly as the exporter routes it. */
const routesOf = (diagram) => {
  const rects = rectsOf(diagram);
  const fans = assignFanSlots(diagram.edges, rects);
  const groups = parallelEdgeGroups(diagram.edges);
  const bias = labelBiasByEdgeId(diagram.edges);
  return diagram.edges.map((edge) => {
    const anchors = getFloatingAnchors(
      rects.get(edge.source),
      rects.get(edge.target),
      fans.get(edge.id),
    );
    const group = groups.get(edge.id) ?? { index: 0, count: 1 };
    const obstacles = [...rects]
      .filter(([id]) => id !== edge.source && id !== edge.target)
      .map(([, rect]) => rect);
    return {
      source: edge.source,
      target: edge.target,
      points: getParallelEdgePath({
        ...anchors,
        parallelIndex: group.index,
        parallelCount: group.count,
        labelBias: bias.get(edge.id) ?? 0,
        obstacles,
      }).points,
    };
  });
};

const segmentsOf = (points) =>
  points.slice(1).map((point, index) => [points[index], point]);

/** Whether two segments properly cross — touching at an endpoint does not count. */
const segmentsCross = ([a, b], [c, d]) => {
  const side = (p, q, r) =>
    Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  const [s1, s2, s3, s4] = [
    side(a, b, c),
    side(a, b, d),
    side(c, d, a),
    side(c, d, b),
  ];
  return s1 !== s2 && s3 !== s4 && s1 !== 0 && s2 !== 0 && s3 !== 0 && s4 !== 0;
};

/** Whether an axis-aligned segment passes through a rectangle's interior. */
const segmentEntersRect = ([a, b], rect) =>
  Math.max(a.x, b.x) > rect.x + 1 &&
  Math.min(a.x, b.x) < rect.x + rect.width - 1 &&
  Math.max(a.y, b.y) > rect.y + 1 &&
  Math.min(a.y, b.y) < rect.y + rect.height - 1;

/**
 * Crossings on a diagram, by kind. A connector is counted at most once in
 * `element` however many elements it runs through: the reader's complaint is
 * "that line goes through a box", not how many.
 */
const scoreOf = (diagram) => {
  const routes = routesOf(diagram);
  let connector = 0;
  for (let i = 0; i < routes.length; i += 1) {
    for (let j = i + 1; j < routes.length; j += 1) {
      const [one, other] = [routes[i], routes[j]];
      // Two connectors that share an endpoint MEET; they do not cross.
      const shares =
        one.source === other.source ||
        one.source === other.target ||
        one.target === other.source ||
        one.target === other.target;
      if (shares) continue;
      const crosses = segmentsOf(one.points).some((a) =>
        segmentsOf(other.points).some((b) => segmentsCross(a, b)),
      );
      if (crosses) connector += 1;
    }
  }
  let element = 0;
  const rects = rectsOf(diagram);
  for (const route of routes) {
    const through = [...rects].some(
      ([id, rect]) =>
        id !== route.source &&
        id !== route.target &&
        segmentsOf(route.points).some((segment) =>
          segmentEntersRect(segment, rect),
        ),
    );
    if (through) element += 1;
  }
  return { connector, element, total: connector + element };
};

/** How landscape a diagram's elements are: width over height of their bounds. */
const shapeOf = (diagram) => {
  const rects = [...rectsOf(diagram).values()];
  const width =
    Math.max(...rects.map((r) => r.x + r.width)) -
    Math.min(...rects.map((r) => r.x));
  const height =
    Math.max(...rects.map((r) => r.y + r.height)) -
    Math.min(...rects.map((r) => r.y));
  return height === 0 ? 0 : width / height;
};

/** The shape every screen a diagram is presented on has. */
const TARGET_RATIO = 16 / 9;

/** The same diagram with every element placed by the layout instead. */
const arranged = (diagram, direction) => {
  const frameOf = new Map(
    diagram.nodes
      .filter((node) => typeof node.frameId === "string")
      .map((node) => [node.id, node.frameId]),
  );
  const placed = defaultPositions(
    diagram.nodes.map((node) => node.id),
    diagram.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
    })),
    direction ?? diagram.layoutDirection ?? "tb",
    frameOf,
  );
  return {
    ...diagram,
    nodes: diagram.nodes.map((node) => ({
      ...node,
      position: placed.get(node.id) ?? node.position,
    })),
  };
};

/* ----------------------------------------------------------------------- */
/* The corpus, read from the filesystem                                     */
/* ----------------------------------------------------------------------- */

const DATA_DIR = path.join(ROOT, "src/features/viewer/service/data");

/**
 * Diagrams small enough to have no layout to get wrong are skipped: with four
 * elements every arrangement scores zero, so including them would pad the
 * corpus with assertions that cannot fail.
 */
const MIN_ELEMENTS = 5;

const corpus = [];
for (const file of readdirSync(DATA_DIR).filter((name) =>
  name.endsWith(".archlab.json"),
)) {
  const model = deserializeModel(
    readFileSync(path.join(DATA_DIR, file), "utf8"),
  );
  for (const diagram of Object.values(model.diagrams)) {
    if (diagram.kind !== undefined && diagram.kind !== "c4") continue;
    if (diagram.nodes.length < MIN_ELEMENTS) continue;
    corpus.push({ doc: file.replace(".archlab.json", ""), diagram });
  }
}

if (corpus.length === 0) {
  console.error(`FAIL  no C4 diagrams found under ${DATA_DIR}`);
  process.exit(1);
}

/* ----------------------------------------------------------------------- */
/* 1. The bar: no diagram gets worse                                        */
/* ----------------------------------------------------------------------- */

let arrangedElementCrossings = 0;

for (const { doc, diagram } of corpus) {
  check(`${doc}/${diagram.id} is no worse arranged than as authored`, () => {
    const before = scoreOf(diagram);
    const after = scoreOf(arranged(diagram));
    arrangedElementCrossings += after.element;
    if (after.total > before.total) {
      fail(
        `arranged scores ${after.total} crossings ` +
          `(${after.connector} connector, ${after.element} element) against ` +
          `${before.total} as authored ` +
          `(${before.connector} connector, ${before.element} element)`,
      );
    }
  });
}

/* ----------------------------------------------------------------------- */
/* 2b. `direction=fit` holds the same bar, and improves the shape           */
/* ----------------------------------------------------------------------- */

for (const { doc, diagram } of corpus) {
  check(`${doc}/${diagram.id} arranged with direction=fit is no worse`, () => {
    const before = scoreOf(diagram);
    const after = scoreOf(arranged(diagram, "fit"));
    if (after.total > before.total) {
      fail(
        `fit scores ${after.total} crossings against ${before.total} as authored`,
      );
    }
  });
}

check("direction=fit lands nearer the shape of a screen than tb does", () => {
  /* THE WHOLE CLAIM OF `fit`, and the only assertion that can catch it
     quietly doing nothing. It is measured as a MEAN over the corpus rather
     than per diagram: fit picks from a set that always includes plain `tb`,
     so per diagram it can only tie or win, and an assertion saying so would
     restate the implementation. The mean is what says the extra candidates
     are worth offering at all. */
  const distance = (diagram, direction) =>
    Math.abs(shapeOf(arranged(diagram, direction)) - TARGET_RATIO);
  const mean = (direction) =>
    corpus.reduce((sum, { diagram }) => sum + distance(diagram, direction), 0) /
    corpus.length;
  const topDown = mean("tb");
  const fitted = mean("fit");
  if (!(fitted < topDown)) {
    fail(
      `fit is a mean ${fitted.toFixed(2)} from 16:9 against tb's ` +
        `${topDown.toFixed(2)} — it is picking no better than top-down`,
    );
  }
});

/* ----------------------------------------------------------------------- */
/* 2. What the lanes buy                                                    */
/* ----------------------------------------------------------------------- */

check("no arranged diagram draws a connector through an element", () => {
  if (arrangedElementCrossings !== 0) {
    fail(
      `${arrangedElementCrossings} connector(s) run through an element they ` +
        `do not touch. A lane is reserved in every row an edge crosses ` +
        `without belonging to it; this count going above zero means one was ` +
        `not reserved, or the row was laid out without it.`,
    );
  }
});

/* ----------------------------------------------------------------------- */
/* 3. A lane holds its column open                                          */
/* ----------------------------------------------------------------------- */

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(
    `\n${failures} of ${assertions + failures} layout-quality assertions FAILED`,
  );
  process.exit(1);
}
console.log(`All ${assertions} layout-quality assertions passed.`);

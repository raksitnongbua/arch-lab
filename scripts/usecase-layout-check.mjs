#!/usr/bin/env node
/**
 * Use-case LAYOUT check — proves the pure layout function
 * (`src/features/usecase/lib/layout.ts`) derives correct geometry from a
 * `UseCaseLabFile`, using the REAL parser, the real layout and the real
 * exporter via Node's type stripping + the `@/*` resolve hook (the
 * `registerHooks` pattern of `scripts/flowchart-layout-check.mjs`).
 *
 * Every assertion is RELATIONAL or MEASURED — "outside", "inside", "clear
 * of", "byte-identical" — never a restatement of the implementation,
 * because an assertion that restates the code passes forever and catches
 * nothing. What it proves, clause by clause:
 *   1. Determinism: the same model twice gives byte-identical layout.
 *   2. No two element boxes overlap, and everything lies inside the canvas.
 *   3. EVERY ACTOR'S BOX LIES OUTSIDE EVERY BOUNDARY RECTANGLE — the single
 *      most important semantic in the picture: the boundary is the system's
 *      edge and an actor stands outside it by definition.
 *   4. Every use case declared in a boundary lies INSIDE that boundary's
 *      rectangle, and the boundary encloses EXACTLY its members — a frame
 *      that swallows a neighbour asserts a membership the document never
 *      declared. Use cases in NO boundary sit below the boundaries.
 *   5. A use-case label's wrapped text box fits inside its ELLIPSE, tested
 *      with the ellipse inequality at all four corners — the bounding box
 *      is NOT enough, because an ellipse's inscribed rectangle is smaller
 *      than its box, and box-only testing is exactly how text pokes through
 *      the curve.
 *   6. The boundary's title band overlaps neither its own border nor any
 *      member — the defect the flowchart's group label shipped (its label
 *      sat on the dashed line).
 *   7. Every edge label is clear of every edge line, every element and
 *      every other label; every dependency CARRIES its «stereotype» label,
 *      because a bare dashed arrow is the ambiguity this document type
 *      exists to remove.
 *   8. An association ships with NO arrowhead and a generalization's
 *      triangle is HOLLOW and sits at the PARENT end — asserted both on the
 *      layout (tip on the parent's outline) and on the real exported SVG
 *      markup, so a renderer regression cannot pass on layout data alone.
 *   9. No edge segment passes through an element it does not connect.
 *  10. A long spaceless Thai label still fits its ellipse — the flowchart
 *      shipped a slice() that cut Thai base characters from combining
 *      marks; the ellipse case is proven here, measured, not assumed.
 *  11. TS↔CSS motion pins: every duration fallback in usecase-motion.css
 *      equals its USECASE_DURATIONS constant; everything animated (and the
 *      draw's dasharray) sits inside the reduced-motion gate; and NOTHING
 *      in the stylesheet loops (`infinite`) — the "no idle pulse, no
 *      marching dash" promise, held by measurement.
 *  12. Palette pins: the `--uc-*` aliases in globals.css name exactly the
 *      role pairs `USECASE_ROLE_BY_KIND` maps to (screen and export cannot
 *      diverge), each declared exactly once so no theme block can shadow
 *      one into a half-populated variant.
 *
 * Exits non-zero on any failure. Run with: pnpm check:usecase-layout
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

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

const { parseUseCaseText } = await import(
  pathToFileURL(path.join(ROOT, "src/features/archtext/index.ts")).href
);
const { layoutUseCase, UC } = await import(
  pathToFileURL(path.join(ROOT, "src/features/usecase/lib/layout.ts")).href
);
const { USECASE_KIND_TOKENS, USECASE_ROLE_BY_KIND } = await import(
  pathToFileURL(path.join(ROOT, "src/features/usecase/lib/shapes.ts")).href
);
const { USECASE_DURATIONS } = await import(
  pathToFileURL(path.join(ROOT, "src/features/usecase/lib/motion.ts")).href
);
const { renderUseCaseSvg } = await import(
  pathToFileURL(path.join(ROOT, "src/features/usecase/export/render-svg.ts"))
    .href
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

const est = (text, fontSize) =>
  Math.ceil(text.length * fontSize * UC.charWidthRatio);
const box = (r) => `[x ${r.x}, y ${r.y}, w ${r.width}, h ${r.height}]`;

function rectsOverlap(a, b, pad = 0) {
  return (
    a.x - pad < b.x + b.width &&
    a.x + a.width + pad > b.x &&
    a.y - pad < b.y + b.height &&
    a.y + a.height + pad > b.y
  );
}

/** General (possibly diagonal) segment vs rect, rect inflated by `pad`. */
function segmentHitsRect(a, b, rect, pad = 0) {
  const r = {
    x: rect.x - pad,
    y: rect.y - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
  const inside = (p) =>
    p.x > r.x && p.x < r.x + r.width && p.y > r.y && p.y < r.y + r.height;
  if (inside(a) || inside(b)) return true;
  const corners = [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height },
    { x: r.x, y: r.y + r.height },
  ];
  const cross = (o, p, q) =>
    (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const segsIntersect = (p1, p2, p3, p4) => {
    const d1 = cross(p3, p4, p1);
    const d2 = cross(p3, p4, p2);
    const d3 = cross(p1, p2, p3);
    const d4 = cross(p1, p2, p4);
    return (
      ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
    );
  };
  for (let i = 0; i < 4; i += 1) {
    if (segsIntersect(a, b, corners[i], corners[(i + 1) % 4])) return true;
  }
  return false;
}

/** An edge's drawable segments, triangle tip included when present. */
const segments = (edge) => {
  const points = edge.tip === null ? edge.points : [...edge.points, edge.tip];
  const out = [];
  for (let i = 0; i + 1 < points.length; i += 1) {
    out.push([points[i], points[i + 1]]);
  }
  return out;
};

const rectInside = (inner, outer, pad = 0) =>
  inner.x >= outer.x + pad &&
  inner.y >= outer.y + pad &&
  inner.x + inner.width <= outer.x + outer.width - pad &&
  inner.y + inner.height <= outer.y + outer.height - pad;

/* Shared per-fixture structural assertions — run against EVERY fixture,
 * because a placement regression shows up on whichever document trips it,
 * not the one someone was editing. */
function assertStructure(label, file, layout) {
  const elementById = new Map(layout.elements.map((e) => [e.id, e]));

  check(
    `${label}: the same model twice gives byte-identical layout — the layout is the contract between renderer, exporter and this script, and a nondeterministic one lets the export differ from the screen`,
    JSON.stringify(layoutUseCase(file)) === JSON.stringify(layout),
  );

  check(
    `${label}: no two element boxes overlap — overlapping symbols are the first visible failure of any placement bug, invisible to a test that only checks assignments`,
    layout.elements.every((a, i) =>
      layout.elements.every((b, j) => i >= j || !rectsOverlap(a, b)),
    ),
    layout.elements.map((e) => `${e.id}${box(e)}`).join(" "),
  );

  check(
    `${label}: every element, boundary, edge point and label lies inside the canvas — clipped geometry is invisible geometry`,
    layout.elements.every(
      (e) =>
        e.x >= 0 &&
        e.y >= 0 &&
        e.x + e.width <= layout.width &&
        e.y + e.height <= layout.height,
    ) &&
      layout.boundaries.every((b) =>
        rectInside(b, {
          x: 0,
          y: 0,
          width: layout.width,
          height: layout.height,
        }),
      ) &&
      layout.edges.every((e) =>
        segments(e).every(
          ([a, b]) =>
            a.x >= 0 &&
            a.x <= layout.width &&
            b.x >= 0 &&
            b.x <= layout.width &&
            a.y >= 0 &&
            a.y <= layout.height &&
            b.y >= 0 &&
            b.y <= layout.height,
        ),
      ),
    `canvas ${layout.width}×${layout.height}`,
  );

  /* THE semantic of the picture. */
  const actors = layout.elements.filter((e) => e.kind === "actor");
  check(
    `${label}: every actor's box lies OUTSIDE every boundary rectangle — the boundary is the system's edge and an actor stands outside it by definition; an actor drawn inside silently redraws the system's scope`,
    actors.every((a) => layout.boundaries.every((b) => !rectsOverlap(a, b))),
  );

  layout.boundaries.forEach((boundary, index) => {
    const members = new Set(boundary.usecases);
    check(
      `${label}: boundary ${index} ("${boundary.label}") holds every declared member fully inside its rectangle — a member poking out redraws the membership the document declared`,
      boundary.usecases.every((id) => {
        const e = elementById.get(id);
        return e !== undefined && rectInside(e, boundary);
      }),
      `frame ${box(boundary)}`,
    );
    check(
      `${label}: boundary ${index} encloses EXACTLY its members — every non-member element's centre lies outside, because a frame that swallows a neighbour asserts a grouping the document never made`,
      layout.elements
        .filter((e) => !members.has(e.id))
        .every(
          (e) =>
            e.cx <= boundary.x ||
            e.cx >= boundary.x + boundary.width ||
            e.cy <= boundary.y ||
            e.cy >= boundary.y + boundary.height,
        ),
    );
    check(
      `${label}: boundary ${index}'s title band clears its own border (≥4px from the top and sides) and every member — the flowchart's group label sat ON its dashed border; this canvas must not repeat it`,
      boundary.labelBox.y >= boundary.y + 4 &&
        boundary.labelBox.x >= boundary.x + 4 &&
        boundary.labelBox.x + boundary.labelBox.width <=
          boundary.x + boundary.width - 4 &&
        boundary.usecases.every((id) => {
          const e = elementById.get(id);
          return e !== undefined && !rectsOverlap(boundary.labelBox, e, 2);
        }),
      `band ${box(boundary.labelBox)} in ${box(boundary)}`,
    );
  });

  if (layout.boundaries.length > 0 && layout.unbounded.length > 0) {
    const lastBottom = Math.max(
      ...layout.boundaries.map((b) => b.y + b.height),
    );
    check(
      `${label}: use cases outside every boundary sit BELOW the boundaries — outside the rectangle is the statement they make, and below keeps the flanks free for the actors`,
      layout.unbounded.every((id) => {
        const e = elementById.get(id);
        return e !== undefined && e.cy > lastBottom;
      }),
    );
  }

  /* The ellipse inequality, corner by corner — the bounding box is NOT the
   * test, because the inscribed rectangle is smaller than the box. */
  check(
    `${label}: every use-case label's text box fits inside its ELLIPSE — all four corners satisfy (dx/rx)² + (dy/ry)² ≤ 1, the exact place box-only testing lets text poke through the curve`,
    layout.elements
      .filter((e) => e.kind === "usecase")
      .every((e) => {
        const corners = [
          { x: e.labelBox.x, y: e.labelBox.y },
          { x: e.labelBox.x + e.labelBox.width, y: e.labelBox.y },
          { x: e.labelBox.x, y: e.labelBox.y + e.labelBox.height },
          {
            x: e.labelBox.x + e.labelBox.width,
            y: e.labelBox.y + e.labelBox.height,
          },
        ];
        return corners.every(
          (c) =>
            ((c.x - e.cx) / e.rx) ** 2 + ((c.y - e.cy) / e.ry) ** 2 <= 1.000001,
        );
      }),
  );

  check(
    `${label}: every wrapped line measures within its label box — a line wider than the box is the clipped-text bug regardless of script`,
    layout.elements.every((e) =>
      e.lines.every((line) => est(line, UC.nodeFontSize) <= e.labelBox.width),
    ),
  );

  /* Edge integrity. */
  check(
    `${label}: no edge segment passes through an element it does not connect — a line drawn across a foreign ellipse's body is unreadable exactly where the diagram is densest`,
    layout.edges.every((e) =>
      segments(e).every(([a, b]) =>
        layout.elements.every(
          (el) =>
            el.id === e.from || el.id === e.to || !segmentHitsRect(a, b, el, 0),
        ),
      ),
    ),
  );

  check(
    `${label}: only generalizations carry a triangle tip — an association is undirected BY TYPE, so any direction mark on one is a modelling error shipped as pixels`,
    layout.edges.every((e) =>
      e.kind === "generalization" ? e.tip !== null : e.tip === null,
    ),
  );

  check(
    `${label}: every generalization's triangle sits at the PARENT end — its tip lies on the parent's outline (ellipse equation ≈ 1, or the actor's box perimeter), because a triangle at the child end inverts the "is-a"`,
    layout.edges
      .filter((e) => e.kind === "generalization")
      .every((e) => {
        const parent = elementById.get(e.to);
        if (parent === undefined || e.tip === null) return false;
        if (parent.kind === "usecase") {
          const v =
            ((e.tip.x - parent.cx) / parent.rx) ** 2 +
            ((e.tip.y - parent.cy) / parent.ry) ** 2;
          return Math.abs(v - 1) < 0.01;
        }
        const onX =
          Math.abs(e.tip.x - parent.x) < 0.01 ||
          Math.abs(e.tip.x - (parent.x + parent.width)) < 0.01;
        const onY =
          Math.abs(e.tip.y - parent.y) < 0.01 ||
          Math.abs(e.tip.y - (parent.y + parent.height)) < 0.01;
        return (
          (onX || onY) &&
          e.tip.x >= parent.x - 0.01 &&
          e.tip.x <= parent.x + parent.width + 0.01 &&
          e.tip.y >= parent.y - 0.01 &&
          e.tip.y <= parent.y + parent.height + 0.01
        );
      }),
  );

  check(
    `${label}: every generalization's line stops one triangle-length short of the tip — a line running through the hollow triangle refills it`,
    layout.edges
      .filter((e) => e.kind === "generalization")
      .every((e) => {
        const base = e.points[e.points.length - 1];
        return (
          e.tip !== null &&
          Math.abs(
            Math.hypot(e.tip.x - base.x, e.tip.y - base.y) - UC.triangleLength,
          ) < 0.01
        );
      }),
  );

  /* Labels. */
  check(
    `${label}: every dependency carries its «stereotype» label box — a bare dashed arrow is ambiguous in exactly the way this document type exists to avoid`,
    layout.edges
      .filter((e) => e.kind === "dependency")
      .every((e) => e.labelBox !== null && e.labelLines.length > 0),
  );
  const labelled = layout.edges.filter((e) => e.labelBox !== null);
  check(
    `${label}: every edge label is clear of EVERY edge line — a multiplicity drawn on top of a line is unreadable in exactly the diagram that needed it`,
    labelled.every((e) =>
      layout.edges.every((other) =>
        segments(other).every(
          ([a, b]) => !segmentHitsRect(a, b, e.labelBox, 1),
        ),
      ),
    ),
    labelled.map((e) => `${e.from}->${e.to} ${box(e.labelBox)}`).join(" "),
  );
  check(
    `${label}: every edge label is clear of every element box`,
    labelled.every((e) =>
      layout.elements.every((el) => !rectsOverlap(e.labelBox, el, 1)),
    ),
  );
  check(
    `${label}: no two edge labels overlap, and none overlaps a boundary title — equidistant, stacked labels are swappable labels`,
    labelled.every(
      (a, i) =>
        labelled.every(
          (b, j) => i >= j || !rectsOverlap(a.labelBox, b.labelBox, 1),
        ) &&
        layout.boundaries.every(
          (bd) => !rectsOverlap(a.labelBox, bd.labelBox, 1),
        ),
    ),
  );

  check(
    `${label}: the heading carries the document's title and the diagram starts below it`,
    layout.heading.titleLines.join(" ") === file.metadata.title &&
      layout.elements.every(
        (e) => e.y >= UC.marginTop + layout.heading.height,
      ) &&
      layout.boundaries.every(
        (b) => b.y >= UC.marginTop + layout.heading.height,
      ),
  );
}

/* ----------------------------------------------------------------------- */
/* Fixture 1 — a realistic platform: four actors (one generalization        */
/* family), a boundary big enough to need two columns, dependencies of      */
/* both stereotypes, a use-case generalization, and an unbounded use case.  */
/* ----------------------------------------------------------------------- */

console.log("food delivery (every construct in realistic use)");

const PLATFORM = `archlab 1.0 usecase
title "Food delivery platform"
description "Who can do what, and where the platform's responsibility ends."

@usecase
  actor customer "Customer"
  actor guest "Guest"
  actor admin "Administrator"
  actor support "Support agent"
  boundary "Food delivery platform" tint=#bfdfff
    usecase search "Search restaurants"
    usecase order "Place an order"
    usecase track "Track the courier"
    usecase pay "Pay online"
    usecase refund "Issue a refund"
    usecase report "Review weekly order reports"
  usecase feedback "Send feedback by email"

  customer -- search
  customer -- order : "1..*"
  customer -- track
  guest -- search
  admin -- refund
  admin -- report
  support -- refund : "on ticket"
  customer -- feedback
  order ..> pay : include
  refund ..> pay : extend
  track --|> order
  admin --|> support
`;

const file = parseUseCaseText(PLATFORM);
const layout = layoutUseCase(file);
const el = (id) => layout.elements.find((e) => e.id === id);

assertStructure("food delivery", file, layout);

/* ---- the actor split, tested by its consequences, not its code ---- */
{
  const boundary = layout.boundaries[0];
  const sideOf = (id) =>
    el(id).cx < boundary.x
      ? "left"
      : el(id).cx > boundary.x + boundary.width
        ? "right"
        : "inside";
  check(
    "every actor stands on a flank — strictly left or strictly right of the boundary, never above or below it, which is what makes the associations read as spokes into the system",
    ["customer", "guest", "admin", "support"].every(
      (id) => sideOf(id) !== "inside",
    ),
    ["customer", "guest", "admin", "support"]
      .map((id) => `${id}:${sideOf(id)}`)
      .join(" "),
  );
  check(
    "actors joined by a generalization share a side, so the hollow-triangle line never stretches across the system box crossing every association on its way",
    sideOf("admin") === sideOf("support"),
  );
  check(
    "the actor–actor generalization crosses no boundary rectangle — the visible consequence of the same-side rule",
    (() => {
      const gen = layout.edges.find(
        (e) => e.kind === "generalization" && e.from === "admin",
      );
      return segments(gen).every(([a, b]) =>
        layout.boundaries.every((bd) => !segmentHitsRect(a, b, bd, 0)),
      );
    })(),
  );
  check(
    "both flanks are used — a split that piles every actor on one side is not a split, and doubles the crossings the flanking exists to avoid",
    new Set(["customer", "guest", "admin", "support"].map((id) => sideOf(id)))
      .size === 2,
  );
  check(
    "same-side actors stack in the vertical order of the use cases they talk to — customer (search/order/track, high in the box) sits above any same-side actor whose use cases sit lower",
    (() => {
      const meanCy = (ids) =>
        ids.reduce((sum, id) => sum + el(id).cy, 0) / ids.length;
      const pairs = [
        ["customer", meanCy(["search", "order", "track", "feedback"])],
        ["guest", meanCy(["search"])],
        ["admin", meanCy(["refund", "report"])],
        ["support", meanCy(["refund"])],
      ];
      for (const [a, ay] of pairs) {
        for (const [b, by] of pairs) {
          if (a === b || sideOf(a) !== sideOf(b)) continue;
          // Family contiguity may locally reorder inside a family; only
          // cross-family order is asserted.
          if (
            (a === "admin" || a === "support") &&
            (b === "admin" || b === "support")
          )
            continue;
          if (ay < by - 1 && el(a).cy > el(b).cy) return false;
        }
      }
      return true;
    })(),
  );
}

/* ---- the unbounded use case ---- */
check(
  'the unbounded use case is reported as such ("feedback"), and only it',
  layout.unbounded.length === 1 && layout.unbounded[0] === "feedback",
);
check(
  "the unbounded use case's box lies outside the boundary rectangle — outside is the statement the author made by not nesting it",
  !rectsOverlap(el("feedback"), layout.boundaries[0]),
);

/* ---- association labels exist where authored ---- */
check(
  "every authored association label kept a label box (1..* and on ticket)",
  layout.edges.filter((e) => e.kind === "association" && e.labelBox !== null)
    .length === 2,
);

/* ----------------------------------------------------------------------- */
/* Fixture 1b — the exported SVG: the marks are the meaning                 */
/* ----------------------------------------------------------------------- */

console.log("exported SVG (arrowheads are kind, hollow means hollow)");

/* A stub palette with distinguishable literals: the exporter must place
 * THESE strings, so fill/stroke swaps are visible to string assertions. */
const STUB_THEME = {
  canvas: "#0c0c1c",
  node: "#222233",
  nodeForeground: "#eeeeff",
  nodeBorder: "#8888aa",
  edge: "#7d828f",
  edgeDrift: "#7d828f",
  primary: "#4f46e5",
  mutedForeground: "#9a9ab0",
  nodeMeta: "#9a9ab0",
  foreground: "#f0f0ff",
  nodeRoles: {
    person: { fill: "#332244", border: "#aa88ff" },
    internal: { fill: "#223344", border: "#88aaff" },
    external: { fill: "#333333", border: "#888888" },
    database: { fill: "#224444", border: "#88ffff" },
    queue: { fill: "#224422", border: "#88ff88" },
  },
  flowShapes: {
    start: { fill: "#224422", border: "#88ff88" },
    end: { fill: "#442222", border: "#ff8888" },
    step: { fill: "#223344", border: "#88aaff" },
    decision: { fill: "#443322", border: "#ffaa88" },
    io: { fill: "#224444", border: "#88ffff" },
    call: { fill: "#332244", border: "#aa88ff" },
  },
};

const { svg } = renderUseCaseSvg(file, STUB_THEME);

/** The exporter's edge groups, split by balanced <g> scanning (a regex
 * would stop at the nested label group's `</g>`). */
function edgeGroups(markup) {
  const groups = [];
  const open = /<g class="af-export-uc-edge" data-uc-kind="([a-z]+)">/g;
  let match;
  while ((match = open.exec(markup)) !== null) {
    let depth = 1;
    let cursor = open.lastIndex;
    while (depth > 0) {
      const nextOpen = markup.indexOf("<g", cursor);
      const nextClose = markup.indexOf("</g>", cursor);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth += 1;
        cursor = nextOpen + 2;
      } else {
        depth -= 1;
        cursor = nextClose + 4;
      }
    }
    groups.push({
      kind: match[1],
      markup: markup.slice(open.lastIndex, cursor),
    });
  }
  return groups;
}
const groups = edgeGroups(svg);

check(
  "the export carries one edge group per parsed edge — the data-uc-kind hooks are the contract these assertions read; a renamed hook must fail here rather than silently test nothing",
  groups.length === file.edges.length &&
    file.edges.every((e, i) => groups[i].kind === e.kind),
  groups.map((g) => g.kind).join(","),
);
check(
  "no association group contains any head or triangle markup — an association is UNDIRECTED, and an arrowhead on one silently converts it into a dependency to every reader",
  groups
    .filter((g) => g.kind === "association")
    .every(
      (g) =>
        !g.markup.includes("af-export-uc-head") &&
        !g.markup.includes("af-export-uc-tri") &&
        !g.markup.includes("stroke-dasharray"),
    ),
);
check(
  "every dependency group draws dashed with a FILLED head in the edge ink — the dash plus «stereotype» is the kind's whole identity",
  groups
    .filter((g) => g.kind === "dependency")
    .every(
      (g) =>
        g.markup.includes("stroke-dasharray") &&
        g.markup.includes(`class="af-export-uc-head" d="M`) &&
        g.markup.includes(`fill="${STUB_THEME.edge}"`),
    ),
);
check(
  "every generalization group draws a HOLLOW triangle — canvas-filled under an edge-ink outline, never the filled head, because a filled triangle reads as a plain arrow and inverts nothing visibly",
  groups
    .filter((g) => g.kind === "generalization")
    .every(
      (g) =>
        g.markup.includes("af-export-uc-tri") &&
        g.markup.includes(
          `fill="${STUB_THEME.canvas}" stroke="${STUB_THEME.edge}"`,
        ) &&
        !g.markup.includes("af-export-uc-head") &&
        !g.markup.includes("stroke-dasharray"),
    ),
);
check(
  "actors export as stick figures, not boxes — a head circle plus limb strokes inside every actor group (the one glance-level mark of the diagram type)",
  (svg.match(/<g class="af-export-uc-element" data-uc-kind="actor">/g) ?? [])
    .length === 4 && (svg.match(/<circle /g) ?? []).length >= 4,
);
check(
  "the boundary tint exports as a wash at the shared TINT_WASH_OPACITY, over the normalised #bfdfff the parser stored",
  svg.includes(`fill="#bfdfff" fill-opacity="0.18"`),
);

/* ----------------------------------------------------------------------- */
/* Fixture 2 — no boundary at all (legal), one actor each side of nothing   */
/* ----------------------------------------------------------------------- */

console.log("boundary-less document (unbounded placement is still a layout)");

const BARE = `archlab 1.0 usecase
title "Sketch"

@usecase
  actor a "Author"
  actor r "Reviewer"
  usecase draft "Draft the note"
  usecase publish "Publish the note"

  a -- draft
  r -- publish
  draft ..> publish : include
`;

const bareFile = parseUseCaseText(BARE);
const bareLayout = layoutUseCase(bareFile);
assertStructure("bare", bareFile, bareLayout);
check(
  "with no boundary, every use case is reported unbounded and still laid out — the grammar allows it, so the layout must not require a rectangle to exist",
  bareLayout.unbounded.length === 2 && bareLayout.boundaries.length === 0,
);

/* ----------------------------------------------------------------------- */
/* Fixture 3 — Thai: spaceless labels, combining marks, the ellipse case    */
/* ----------------------------------------------------------------------- */

console.log("thai labels (spaceless text meets the ellipse inequality)");

const THAI = `archlab 1.0 usecase
title "บริการสั่งอาหาร"

@usecase
  actor customer "ลูกค้า"
  boundary "ระบบสั่งอาหารออนไลน์"
    usecase order "สั่งอาหารและชำระเงินออนไลน์ผ่านแอปพลิเคชันมือถือ"
    usecase track "ติดตามสถานะการจัดส่ง"

  customer -- order
  customer -- track
`;

const thaiFile = parseUseCaseText(THAI);
const thaiLayout = layoutUseCase(thaiFile);
assertStructure("thai", thaiFile, thaiLayout);

/* Thai combining marks (vowels above/below, tone marks): U+0E31, U+0E34–3A,
   U+0E47–4E. A line OPENING with one means a grapheme cluster was cut —
   the dotted-circle defect the flowchart shipped on spaceless Thai. */
const THAI_COMBINING_START = /^[ัิ-ฺ็-๎]/;
check(
  "no Thai line opens with an orphaned combining mark — the hard split must land between grapheme clusters even though Thai gives it no spaces to prefer",
  thaiLayout.elements.every((e) =>
    e.lines.every((line) => !THAI_COMBINING_START.test(line)),
  ),
  JSON.stringify(thaiLayout.elements.map((e) => e.lines)),
);
check(
  "the long spaceless Thai label actually exercises the hard split (more than one line) — otherwise this fixture proves nothing about wrapping",
  (thaiLayout.elements.find((e) => e.id === "order")?.lines.length ?? 0) > 1,
);
/* The headline case this fixture exists for: assertStructure already ran
 * the four-corner ellipse test over these elements, so a Thai label that
 * escaped its ellipse has ALREADY failed above; this pins that the fixture
 * genuinely covers the non-Latin path (a Thai ellipse exists and is text-
 * driven, larger than the minimum). */
check(
  "the Thai ellipse is sized by its text, not the floor — so the corner containment proven above tested the estimator against real Thai, not the minimum ellipse",
  (thaiLayout.elements.find((e) => e.id === "order")?.rx ?? 0) >
    UC.ellipseMinRx,
);

/* ----------------------------------------------------------------------- */
/* TS ↔ CSS pins — motion                                                   */
/* ----------------------------------------------------------------------- */

console.log("motion pins (usecase-motion.css ↔ lib/motion.ts)");

const motionCss = readFileSync(
  path.join(ROOT, "src/features/usecase/styles/usecase-motion.css"),
  "utf8",
);

/** var name → USECASE_DURATIONS key. One table; a fallback the table does
 * not know fails, so a new duration cannot ship unpinned. */
/* DERIVED from the constants, not hand-listed. The hand-written table was the
   right idea — it caught four unpinned fallbacks the moment idle motion was
   added — but it made every new duration a two-place edit, and the second place
   is the one people forget. `castStagger` -> `--uc-cast-stagger` mechanically,
   so a new constant is pinned the moment the stylesheet reads it, and a
   stylesheet var with NO matching constant still fails (the property that
   made the original table worth having). */
/* Per-element STAMPS, not durations: their value is written per edge by the
   renderer, so a `0ms` fallback is correct rather than unpinned. Exempted by
   name — and each one's STAMP is asserted separately below, because the
   flowchart shipped a scatter whose stamp was deleted with every CSS
   assertion still green (the fallback simply took over and the gesture
   silently flattened). */
const STAMPED_VARS = new Set(["uc-breath-phase"]);

const VAR_TO_KEY = Object.fromEntries(
  Object.keys(USECASE_DURATIONS).map((key) => [
    `uc-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`,
    key,
  ]),
);
{
  const seen = new Set();
  let allPinned = true;
  const fallback = /var\(--([a-z-]+),\s*(\d+)ms\)/g;
  let match;
  while ((match = fallback.exec(motionCss)) !== null) {
    if (STAMPED_VARS.has(match[1])) continue;
    const key = VAR_TO_KEY[match[1]];
    if (key === undefined || USECASE_DURATIONS[key] !== Number(match[2])) {
      allPinned = false;
      fail(
        `stylesheet fallback --${match[1]}: ${match[2]}ms matches no constant — CSS cannot import TypeScript, so an unpinned fallback is a second, driftable source of truth`,
      );
    }
    seen.add(match[1]);
  }
  if (allPinned) {
    ok(
      "every duration fallback in the stylesheet equals its USECASE_DURATIONS constant — the genuinely duplicated numbers cannot drift",
    );
  }
  check(
    "every USECASE_DURATIONS constant appears as a fallback at least once — a constant nothing reads is a lie about where timing lives",
    Object.keys(VAR_TO_KEY).every((name) => seen.has(name)),
    [...seen].join(","),
  );
}

{
  const gateStart = motionCss.indexOf(
    "@media (prefers-reduced-motion: no-preference)",
  );
  let gateEnd = -1;
  if (gateStart !== -1) {
    let depth = 0;
    for (let i = gateStart; i < motionCss.length; i += 1) {
      if (motionCss[i] === "{") depth += 1;
      else if (motionCss[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          gateEnd = i;
          break;
        }
      }
    }
  }
  const inGate = (index) => index > gateStart && index < gateEnd;
  const animIndexes = [];
  const anim = /animation(?:-delay)?\s*:/g;
  let m;
  while ((m = anim.exec(motionCss)) !== null) animIndexes.push(m.index);
  check(
    "every animation declaration sits inside the prefers-reduced-motion gate — the reveal is first-paint, so ONLY the media query (never JS) can suppress it for a reduced-motion reader",
    gateStart !== -1 && gateEnd !== -1 && animIndexes.every(inGate),
  );
  // The semicolon matters: the bare phrase also appears in the header
  // comment (before the gate), and matching it would test the essay.
  const dashIndex = motionCss.indexOf("stroke-dasharray: 1;");
  check(
    "the draw's stroke-dasharray: 1 sits inside the gate — applied without its animation it would park every solid line mid-draw for reduced-motion readers",
    dashIndex !== -1 && inGate(dashIndex),
  );
  /* THE QUIETNESS RULE, REWRITTEN. It used to be `no "infinite" anywhere`,
     which held the promise by forbidding the mechanism outright. The user then
     asked for more animation, so the mechanism is allowed and the PROMISE has
     to be held some other way: every looping animation must be OPT-IN (behind
     the reader's idle toggle), must stop for reduced motion, and must not
     invent a fourth copy of a walk the canvas already owns. Deleting the rule
     instead of rewriting it would have left nothing to stop this drifting into
     a light show. */
  /* THE WIRING, not just the rules. Every CSS assertion below passed while the
     idle stylesheet was DEAD CODE: the diagram emitted neither class and the
     viewer stamped no gate, so nothing looped on screen and no check noticed.
     That is the flowchart's four shipped motion bugs in one shape — a rule
     verified, a behaviour absent — so the markup and the gate are pinned here
     too. */
  {
    const src = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
    const diagramSrc = src(
      "src/features/usecase/components/usecase-diagram.tsx",
    );
    const viewerSrc = src("src/features/usecase/components/usecase-viewer.tsx");
    check(
      "the diagram emits af-uc-march on DEPENDENCIES only — the march is the already-dashed rule made real, and on a solid association it would read as async",
      /edge\.kind === "dependency" && "af-uc-march"/.test(diagramSrc),
    );
    check(
      "the diagram renders drift tracks for ASSOCIATIONS only — dependencies march instead, and two gestures on one edge would be two stories at once",
      /edge\.kind === "association" \? \([\s\S]{0,400}af-uc-drift-out[\s\S]{0,300}af-uc-drift-back/.test(
        diagramSrc,
      ),
    );
    check(
      "both drift tracks carry pathLength=1 — without it the dash fractions are user units, a sliver on a long association and a blanket on a short one",
      (diagramSrc.match(/af-uc-drift-(?:out|back) pointer-events-none"\s*\n?\s*d=\{d\}\s*\n?\s*pathLength=\{1\}/g) ?? [])
        .length === 2,
    );
    check(
      "the diagram STAMPS --uc-breath-phase from usecaseBreathPhase — the CSS fallback is 0ms, so a missing stamp silently flattens the scatter into every association swelling in unison, with every CSS assertion still green (the flowchart shipped exactly this)",
      /"--uc-breath-phase":\s*`\$\{usecaseBreathPhase\(edge\.index\)\}ms`/.test(
        diagramSrc,
      ),
    );
    check(
      "the viewer stamps data-af-idle from the SHARED idleMotionState — without the gate attribute the whole idle block is dead CSS, and a second way to read the preference would let one canvas disagree with the other three",
      /data-af-idle=\{idleState\}/.test(viewerSrc) &&
        /idleMotionState\(reduced, idleMotion\)/.test(viewerSrc) &&
        /from "@\/lib\/idle-motion"/.test(viewerSrc),
    );
    check(
      "the viewer arms data-af-idle-resume from the toggle handler and never at load — the initial settle exists to let the entrance finish, and re-serving it to a click is the shipped 'toggle broken' report",
      /if \(next\) setIdleResumed\(true\)/.test(viewerSrc) &&
        /idleResumed \? \{ "data-af-idle-resume"/.test(viewerSrc),
    );
    check(
      "the toggle is disabled under reduced motion with aria-pressed staying honest — a control claiming to enable motion it will not run would be lying",
      /disabled=\{reduced\}/.test(viewerSrc) &&
        /aria-pressed=\{!reduced && idleMotion\}/.test(viewerSrc),
    );
    /* The ONE-HAND rule, on the SCREEN. The exported-markup assertion further
       down already proved equal weights in the SVG the exporter writes — and it
       passed while the component still carried hardcoded 1.5s against a 1.25
       boundary, i.e. while the figure and the ellipses on screen genuinely were
       two different pens, the exact defect the user reported. Testing the
       exporter is not testing the renderer. */
    check(
      "the diagram component hardcodes NO stroke width — every one reads UC_STROKE, the named focus exception, or the named transparent hit stroke, which is what makes the figure, the ellipses and the lines one hand on screen and not only in the export",
      !/strokeWidth=\{[\d.]+\}/.test(diagramSrc) &&
        /strokeWidth=\{UC_STROKE\}/.test(diagramSrc) &&
        /strokeWidth=\{focused \? UC_FOCUS_STROKE : UC_STROKE\}/.test(
          diagramSrc,
        ),
    );
    check(
      "no source file reaches for Math.random() — the breath scatter is a hash so a re-render cannot reshuffle a resting diagram and the exporter stays deterministic",
      !/Math\.random\(/.test(
        diagramSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""),
      ),
    );
  }

  {
    const loops = [...motionCss.matchAll(/animation:[^;]*infinite/g)];
    check(
      "every looping animation is gated on [data-af-idle] — a loop that runs whether the reader wants it or not is decoration, and the toggle exists precisely so ambient motion is a choice",
      loops.length > 0 &&
        loops.every((m) => {
          const rule = motionCss.lastIndexOf("{", m.index);
          const selector = motionCss.slice(
            motionCss.lastIndexOf("}", rule) + 1,
            rule,
          );
          return selector.includes('[data-af-idle="on"]');
        }),
    );
    check(
      "every looping animation sits inside the reduced-motion gate — ambient motion must not run for a reader who asked for none, and the gate is the only authority (a JS-written property arrives after first paint)",
      loops.length > 0 && loops.every((m) => inGate(m.index)),
    );
    check(
      "the dashed march REUSES the canvas-wide af-frame-march keyframes and declares no private copy — four canvases walking one dash pattern at one speed is why that keyframe is global, and the house rule beside it allows only an already-dashed line to march",
      /animation:\s*af-frame-march\s/.test(motionCss) &&
        !/@keyframes af-uc-[a-z-]*march/.test(motionCss),
    );
    /* DIRECTION-NEUTRALITY, by symmetry rather than by stillness. The first cut
       forbade stroke-dashoffset outright — a band travelling along an undirected
       association would state a direction it does not have — and got an in-place
       opacity swell that read as a blink rather than as motion. The gesture now
       travels, and stays neutral because the two bands are EXACT MIRRORS: equal
       speed, opposite ways, no net direction. Pinned as the mirror property,
       because a lone drift, or two drifts at different speeds, is a direction
       again. */
    check(
      "the two drift keyframes are exact mirrors of each other — a lone band, or an unequal pair, states a direction an undirected association does not have",
      (() => {
        const range = (name) => {
          const m = motionCss.match(
            new RegExp(
              `@keyframes ${name}\\s*\\{\\s*from\\s*\\{\\s*stroke-dashoffset:\\s*(-?[\\d.]+)\\s*;\\s*\\}\\s*to\\s*\\{\\s*stroke-dashoffset:\\s*(-?[\\d.]+)\\s*;`,
            ),
          );
          return m === null ? null : [Number(m[1]), Number(m[2])];
        };
        const out = range("af-uc-drift-out");
        const back = range("af-uc-drift-back");
        return (
          out !== null &&
          back !== null &&
          out[0] === back[1] &&
          out[1] === back[0]
        );
      })(),
    );
    check(
      "the drift is STEADY: linear timing and exactly one dash period per cycle, so it holds one speed and its wrap is invisible — an eased loop reads as slipping and any other span parks the band somewhere new at each wrap",
      (() => {
        const dash = motionCss.match(
          /\.af-uc-breath\s*\{[^}]*stroke-dasharray:\s*([\d.]+)\s+([\d.]+)/,
        );
        const out = motionCss.match(
          /@keyframes af-uc-drift-out\s*\{\s*from\s*\{\s*stroke-dashoffset:\s*([\d.]+)\s*;\s*\}\s*to\s*\{\s*stroke-dashoffset:\s*(-?[\d.]+)\s*;/,
        );
        if (dash === null || out === null) return false;
        const lit = Number(dash[1]);
        const period = lit + Number(dash[2]);
        return (
          /animation-timing-function:\s*linear/.test(motionCss) &&
          Number(out[1]) === lit &&
          Number(out[2]) === lit - period
        );
      })(),
    );
    check(
      "the drift declares the `backwards` fill — without it a waiting band paints its static dash on the line for the whole delay, which is the flowchart's 'gradient stick on refresh' report",
      /animation-fill-mode:\s*backwards/.test(motionCss),
    );
    check(
      "an explicit toggle-ON answers promptly via [data-af-idle-resume] for EVERY idle class — re-serving the entrance settle to a click shipped on the flowchart as 'idle motion toggle broken', because a control whose effect is invisible for seconds is indistinguishable from a dead one",
      (() => {
        const resume = motionCss.match(
          /((?:\[data-af-idle="on"\]\[data-af-idle-resume\][^,{]*,?\s*)+)\{/,
        );
        if (resume === null) return false;
        return ["af-uc-march", "af-uc-breath"].every((cls) =>
          resume[1].includes(cls),
        );
      })(),
    );
  }
}

/* ----------------------------------------------------------------------- */
/* CSS pins — palette aliases                                               */
/* ----------------------------------------------------------------------- */

console.log("palette pins (globals.css ↔ lib/shapes.ts)");

const globalsCss = readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8");
for (const [kind, tokens] of Object.entries(USECASE_KIND_TOKENS)) {
  const role = USECASE_ROLE_BY_KIND[kind];
  const fillAlias = `${tokens.fill}: var(--node-${role});`;
  const borderAlias = `${tokens.border}: var(--node-${role}-border);`;
  check(
    `globals.css aliases ${tokens.fill} to the measured --node-${role} pair — the exact pair the exporter resolves through USECASE_ROLE_BY_KIND, so screen and export cannot name different colours`,
    globalsCss.includes(fillAlias) && globalsCss.includes(borderAlias),
    `${fillAlias} / ${borderAlias}`,
  );
  check(
    `${tokens.fill} is declared exactly once — a per-theme redeclaration could shadow the alias in SOME themes, shipping the half-populated variant purpose.md calls worse than no option`,
    (globalsCss.match(new RegExp(`${tokens.fill}:`, "g")) ?? []).length === 1 &&
      (globalsCss.match(new RegExp(`${tokens.border}:`, "g")) ?? []).length ===
        1,
  );
}

/* ----------------------------------------------------------------------- */

/* ---- shaped focus rings ---------------------------------------------------- */

/* A CSS `outline` boxes the BOUNDING BOX, always — so a focused ellipse,
   stadium, diamond or diagonal edge wore a RECTANGLE. Shipped on both canvases
   and reported as "on focus border should be shaped, not square". The fix is a
   real SVG ring beside the hit target, revealed by a sibling combinator; these
   pin both halves, because either alone lets the box back. */
{
  const focusSrc = readFileSync(
    path.join(ROOT, "src/features/usecase/components/usecase-diagram.tsx"),
    "utf8",
  );
  const globals = readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8");
  check(
    "no focus-visible:outline-* utility survives on an interactive shape — that utility is what drew the rectangle, and it reads as a rendering fault on a canvas made of shapes",
    !/focus-visible:outline-(?!none)/.test(focusSrc),
  );
  /* Pinned as a REAL CSS rule, not as a utility class in the markup. The
     utility was there and the violet box still shipped: `@layer base` gives
     every element an outline colour, so the browser's native focus indicator
     paints in --ring, and a utility that did not take effect looked exactly
     like a fix. The sequence canvas's rule is the precedent. */
  check(
    "a real CSS rule kills the native outline on PLAIN :focus, not only :focus-visible — clicking an SVG element with a tabindex gives it :focus alone, and Chrome still paints outline: auto for that, which is the rounded box that survived the first two attempts at this fix",
    new RegExp("\\." + "af-uc-hit" + ":focus[,\\s][^{]*\\{[^}]*outline:\\s*none").test(
      globals,
    ),
  );
  check(
    "every interactive element also carries outline-none in the markup — belt and braces, and it documents the intent at the call site",
    (focusSrc.match(/af-uc-hit cursor-pointer focus-visible:outline-none/g) ?? [])
      .length >= 2,
  );
  check(
    "a shaped .af-uc-ring is emitted for BOTH a node/element and an edge — an edge's ring must follow its path, since a diagonal line's bounding box is a rectangle across half the diagram",
    (focusSrc.match(/af-uc-ring/g) ?? []).length >= 2,
  );
  check(
    "the ring is revealed by a :focus-visible SIBLING rule and rests at opacity 0 — absent rather than transparent, so it can never take a click or a hit test",
    /\.af-uc-ring[^{]*\{[^}]*opacity:\s*0/.test(globals) &&
      new RegExp("\\.af-uc-hit:focus-visible ~ \\.af-uc-ring").test(globals),
  );
  check(
    "the ring paints --ring, the app's focus colour, never a role token — focus is a state, so a focused diagram element must match a focused button",
    /\.af-uc-ring[\s\S]{0,200}stroke:\s*var\(--ring\)/.test(globals),
  );
}


if (failures > 0) {
  console.error(`\n${failures} of ${assertions} assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} use-case layout assertions passed.`);

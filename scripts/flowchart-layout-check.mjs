#!/usr/bin/env node
/**
 * Flowchart LAYOUT check — proves the pure layout function
 * (`src/features/flowchart/lib/layout.ts`) derives correct geometry from a
 * `FlowchartLabFile`, using the REAL parser and the real layout code via
 * Node's type stripping + the `@/*` resolve hook (the `registerHooks`
 * pattern of `scripts/sequence-layout-check.mjs`).
 *
 * Every assertion is RELATIONAL or MEASURED — "clear of", "inside", "below",
 * "byte-identical" — never a restatement of the implementation, because an
 * assertion that restates the code passes forever and catches nothing.
 * What it proves, clause by clause:
 *   1. Determinism: the same model twice gives byte-identical layout.
 *   2. No two node boxes overlap, and everything lies inside the canvas.
 *   3. Ranking is longest-path: a re-merge lands BELOW the longest branch,
 *      and a decision's branches share a row (not a naive vertical stack).
 *   4. Forward arrows descend; a back edge climbs a corridor that HUGS the
 *      rows it spans and reads as a returning arrow, never as a frame — its
 *      bounding box encloses no stranger, it never closes a circuit of
 *      horizontal runs beyond both end rows, and it lands sideways on its
 *      target's flank; no edge segment passes through a foreign node's body.
 *      (The rule this replaces — "corridor outside EVERY row" — is what
 *      forced maximally-far routing and made a loop look like a group frame;
 *      fixture 3 is that user report verbatim.)
 *   5. Every edge starts on its source's bottom half and ends on its
 *      target's top half — arrows that float near their boxes are the
 *      classic sign of a second, disagreeing geometry — and every edge ends
 *      with room for a VISIBLE arrowhead that no unrelated node covers.
 *   6. A diamond's inscribed text box fits INSIDE the rhombus (corner by
 *      corner), and every node's text fits its label box — the two places
 *      naive flowchart layout visibly breaks.
 *   7. Edge labels sit clear of EVERY edge path, every node and every other
 *      label — a guard drawn on top of an arrow is unreadable in exactly the
 *      chart that needed the guard.
 *   8. A self-loop stays outside its node's body.
 *   9. Group frames enclose exactly their members, with the label band clear
 *      of them; non-members stay outside.
 *
 * Exits non-zero on any failure. Run with: pnpm check:flowchart-layout
 */

import { existsSync, statSync } from "node:fs";
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

const { parseFlowchartText } = await import(
  pathToFileURL(path.join(ROOT, "src/features/archtext/index.ts")).href
);
const { layoutFlowchart, FLOW } = await import(
  pathToFileURL(path.join(ROOT, "src/features/flowchart/lib/layout.ts")).href
);
const { ARROW_LENGTH } = await import(
  pathToFileURL(path.join(ROOT, "src/features/flowchart/lib/shapes.ts")).href
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
  Math.ceil(text.length * fontSize * FLOW.charWidthRatio);
const box = (r) => `[x ${r.x}, y ${r.y}, w ${r.width}, h ${r.height}]`;

function rectsOverlap(a, b, pad = 0) {
  return (
    a.x - pad < b.x + b.width &&
    a.x + a.width + pad > b.x &&
    a.y - pad < b.y + b.height &&
    a.y + a.height + pad > b.y
  );
}

/** Axis-aligned segment vs rect, with the rect inflated by `pad`. */
function segmentHitsRect(a, b, rect, pad = 0) {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  return (
    minX < rect.x + rect.width + pad &&
    maxX > rect.x - pad &&
    minY < rect.y + rect.height + pad &&
    maxY > rect.y - pad
  );
}

const segments = (edge) => {
  const out = [];
  for (let i = 0; i + 1 < edge.points.length; i += 1) {
    out.push([edge.points[i], edge.points[i + 1]]);
  }
  return out;
};

/** Bounding box of an edge's polyline. */
const edgeBBox = (edge) => {
  const xs = edge.points.map((p) => p.x);
  const ys = edge.points.map((p) => p.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
};

/** True when rect `inner` lies fully inside rect `outer`. */
const rectInside = (inner, outer) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

/** Distance from a point to an axis-aligned segment. */
const pointToSegment = (p, a, b) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq),
        );
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/** Distance from a point to the nearest point on an edge's polyline. */
const pointToEdge = (p, edge) =>
  Math.min(...segments(edge).map(([a, b]) => pointToSegment(p, a, b)));

/* Shared per-fixture assertions for the defects a loop or an arrowhead can
 * ship — run against EVERY fixture, because the routing regression this
 * suite exists for showed up on the user's chart, not on the one someone
 * was editing. */
function assertBackEdgesReadAsArrows(label, layout) {
  const nodeById = new Map(layout.nodes.map((n) => [n.id, n]));
  const backs = layout.edges.filter((e) => e.back && !e.self);

  /* THE FRAME-CONFUSION CATCHERS — the user-reported defect: a back edge
   * routed to a corridor outside every row drew a dashed rounded rectangle
   * around half the chart, indistinguishable from a group frame. */
  check(
    `${label}: no back edge's bounding box swallows a node it does not connect — a dashed outline enclosing strangers reads as a grouping frame the document never declared`,
    backs.every((e) =>
      layout.nodes.every(
        (n) => n.id === e.from || n.id === e.to || !rectInside(n, edgeBBox(e)),
      ),
    ),
  );
  check(
    `${label}: no back edge runs horizontally beyond BOTH end rows — a run below its source's box plus a run above its target's box closes three sides of a rectangle, and a reader sees a frame, not an arrow`,
    backs.every((e) => {
      const from = nodeById.get(e.from);
      const to = nodeById.get(e.to);
      const horizontal = segments(e).filter(
        ([a, b]) => a.y === b.y && a.x !== b.x,
      );
      const belowSource = horizontal.some(([a]) => a.y > from.y + from.height);
      const aboveTarget = horizontal.some(([a]) => a.y < to.y);
      return !(belowSource && aboveTarget);
    }),
  );
  check(
    `${label}: every back edge HUGS the rows it spans — its corridor stays within corridorGap plus one step per loop of the spanned rows' flank, instead of the far-outside routing that made a loop look like a frame`,
    backs.every((e) => {
      const from = nodeById.get(e.from);
      const to = nodeById.get(e.to);
      const spanned = layout.nodes.filter(
        (n) =>
          n.rank >= Math.min(from.rank, to.rank) &&
          n.rank <= Math.max(from.rank, to.rank),
      );
      const slack = FLOW.corridorGap + backs.length * FLOW.corridorStep;
      const box = edgeBBox(e);
      const spanLeft = Math.min(...spanned.map((n) => n.x));
      const spanRight = Math.max(...spanned.map((n) => n.x + n.width));
      // Whichever flank it took, it must not stray past the hug budget.
      return (
        box.x >= spanLeft - slack && box.x + box.width <= spanRight + slack
      );
    }),
  );

  /* THE ARROWHEAD — the user saw a loop with no visible landing at all. */
  check(
    `${label}: every edge's final segment is at least one arrowhead long, and the head's base is covered by no unrelated node — a head buried in a corner or under a box is an arrow that does not read as directed`,
    layout.edges.every((e) => {
      if (e.points.length < 2) return true;
      const tip = e.points[e.points.length - 1];
      const prev = e.points[e.points.length - 2];
      const len = Math.hypot(tip.x - prev.x, tip.y - prev.y);
      if (len < ARROW_LENGTH) return false;
      const base = {
        x: tip.x - ((tip.x - prev.x) / len) * ARROW_LENGTH,
        y: tip.y - ((tip.y - prev.y) / len) * ARROW_LENGTH,
      };
      return layout.nodes.every(
        (n) =>
          n.id === e.from ||
          n.id === e.to ||
          !(
            base.x > n.x &&
            base.x < n.x + n.width &&
            base.y > n.y &&
            base.y < n.y + n.height
          ),
      );
    }),
  );

  /* THE BRANCH LABELS — the user's "yes"/"no" pair flanked one overlap point
   * below the diamond, so neither guard was attributable to its line. */
  const labelled = layout.edges.filter((e) => e.labelBox !== null);
  check(
    `${label}: every edge label sits strictly closer to ITS OWN line than to any other labelled line — equidistant guards are swappable guards, exactly the yes/no ambiguity that was reported`,
    labelled.every((e) => {
      const centre = {
        x: e.labelBox.x + e.labelBox.width / 2,
        y: e.labelBox.y + e.labelBox.height / 2,
      };
      const own = pointToEdge(centre, e);
      return labelled.every((o) => o === e || own < pointToEdge(centre, o));
    }),
  );
  check(
    `${label}: edges leaving one node depart through distinct points (>= 8px apart) — branches that share a departure point cannot be told apart at the vertex they leave`,
    layout.nodes.every((n) => {
      const exits = layout.edges
        .filter((e) => e.from === n.id && !e.self && e.points.length >= 2)
        .map((e) => e.points[0]);
      return exits.every((a, i) =>
        exits.every((b, j) => i >= j || Math.hypot(a.x - b.x, a.y - b.y) >= 8),
      );
    }),
  );
}

/* ----------------------------------------------------------------------- */
/* Fixture 1 — a realistic order-intake chart: every shape, a decision with */
/* labelled branches, a self-loop, a back edge (a real retry loop), a group */
/* ----------------------------------------------------------------------- */

console.log("order intake (every construct in realistic use)");

const INTAKE = `archlab 1.0 flowchart
title "Order intake"
description "How a raw order becomes a persisted one, with the retry loop the support team keeps asking about."

@flowchart
  start s "Order received"
  step validate "Validate the order payload against the catalogue" [Go 1.22]
  decision ok "Cart valid?"
  io fix "Ask the buyer to correct the cart"
  call price "Price the cart" [pricing-svc]
  group "Persistence" tint=#bfdfff
    step save "Write the order"
    io receipt "Emit the receipt"
  end done "Done"

  s -> validate
  validate -> validate : "retry transient fetch"
  validate -> ok
  ok -> price : "yes"
  ok -> fix : "no"
  fix -> validate : "resubmitted"
  price -> save
  save -> receipt
  receipt -> done
`;

const file = parseFlowchartText(INTAKE);
const layout = layoutFlowchart(file);
const nodeById = new Map(layout.nodes.map((n) => [n.id, n]));

/* ---- determinism ----
 * The layout is the contract between the renderer, the exporter and this
 * script. If two runs on one model can differ, the export can differ from
 * the screen — so byte-identical output is asserted literally, not assumed
 * from code inspection. */
check(
  "the same model twice gives byte-identical layout",
  JSON.stringify(layoutFlowchart(parseFlowchartText(INTAKE))) ===
    JSON.stringify(layout),
);

/* ---- boxes ----
 * Overlapping node boxes are the failure a rank/order bug produces first,
 * and they are invisible in a unit test that only checks ranks. */
check(
  "no two node boxes overlap",
  layout.nodes.every((a, i) =>
    layout.nodes.every((b, j) => i >= j || !rectsOverlap(a, b)),
  ),
  layout.nodes.map((n) => `${n.id}${box(n)}`).join(" "),
);
check(
  "every node lies inside the canvas",
  layout.nodes.every(
    (n) =>
      n.x >= 0 &&
      n.y >= 0 &&
      n.x + n.width <= layout.width &&
      n.y + n.height <= layout.height,
  ),
  `canvas ${layout.width}×${layout.height}`,
);
check(
  "every edge point and label box lies inside the canvas",
  layout.edges.every(
    (e) =>
      e.points.every(
        (p) =>
          p.x >= 0 && p.x <= layout.width && p.y >= 0 && p.y <= layout.height,
      ) &&
      (e.labelBox === null ||
        (e.labelBox.x >= 0 &&
          e.labelBox.y >= 0 &&
          e.labelBox.x + e.labelBox.width <= layout.width &&
          e.labelBox.y + e.labelBox.height <= layout.height)),
  ),
);

/* ---- direction ----
 * The reading order is the product: forward arrows must descend the page.
 * (Back edges and self-loops are exempt — they are the loops.) */
check(
  "every forward arrow descends: its target's box starts below its source's box",
  layout.edges.every((e) => {
    if (e.back || e.self) return true;
    const from = nodeById.get(e.from);
    const to = nodeById.get(e.to);
    return to.y > from.y + from.height;
  }),
);

/* ---- a decision's branches share a row ----
 * `price` and `fix` are both one step after the decision. A naive
 * top-to-bottom stack would place them in successive rows; a layered layout
 * puts them side by side, which is what makes the branch READ as a branch. */
{
  const price = nodeById.get("price");
  const fix = nodeById.get("fix");
  check(
    "the decision's two branch targets sit side by side, not stacked",
    price.rank === fix.rank,
    `price rank ${price.rank} @y ${price.y}, fix rank ${fix.rank} @y ${fix.y}`,
  );
  check(
    "branch targets in one row do not overlap horizontally",
    price.x + price.width <= fix.x || fix.x + fix.width <= price.x,
    `price ${box(price)}, fix ${box(fix)}`,
  );
}

/* ---- edges meet their boxes ----
 * An arrow that starts or ends off its node is the visible symptom of a
 * second geometry. Start: on the source's lower half, inside its width.
 * End: on the target's upper half, inside its width. */
check(
  "every edge leaves its source's bottom half and enters its target's top half",
  layout.edges.every((e) => {
    if (e.self) return true;
    const from = nodeById.get(e.from);
    const to = nodeById.get(e.to);
    const p0 = e.points[0];
    const pn = e.points[e.points.length - 1];
    return (
      p0.x >= from.x &&
      p0.x <= from.x + from.width &&
      p0.y >= from.cy &&
      p0.y <= from.y + from.height &&
      pn.x >= to.x &&
      pn.x <= to.x + to.width &&
      pn.y >= to.y &&
      pn.y <= to.cy
    );
  }),
);

/* ---- no edge through a foreign node ----
 * The whole point of channel-and-corridor routing. Tested against every
 * segment of every edge, because the regression this prevents — a lane or a
 * corridor drifting into a row — shows up on whichever edge happens to route
 * there, not on the one someone was editing. */
check(
  "no edge segment passes through a node it does not connect",
  layout.edges.every((e) =>
    segments(e).every(([a, b]) =>
      layout.nodes.every(
        (n) => n.id === e.from || n.id === e.to || !segmentHitsRect(a, b, n, 0),
      ),
    ),
  ),
);

/* ---- the back edge ----
 * `fix -> validate` points against the reading order. It must be marked,
 * climb (end above where it started), and land SIDEWAYS on its target — a
 * loop that dives into the same top edge the forward arrows use has no
 * landing of its own, which is how the user's loop showed "no arrowhead".
 *
 * REWRITTEN: the assertion that used to live here — "the corridor runs
 * clear of every node column" — was WRONG: its legitimate intent was only
 * "a back edge must not pass through a node body" (held above by the
 * through-a-foreign-node rule), but as written it FORCED the corridor
 * outside the whole chart, which is precisely what drew the frame-lookalike
 * rectangle the user reported. The hug/enclosure/circuit rules in
 * `assertBackEdgesReadAsArrows` are its replacement. */
{
  const back = layout.edges.find(
    (e) => e.from === "fix" && e.to === "validate",
  );
  const validate = nodeById.get("validate");
  check("the retry edge is classified as a back edge", back?.back === true);
  check(
    "the back edge ends above where it started (it climbs)",
    back !== undefined &&
      back.points[back.points.length - 1].y < back.points[0].y,
    JSON.stringify(back?.points),
  );
  check(
    "the back edge lands horizontally ON its target's flank at mid-height — the sideways arrowhead is the loop's own landing, on an edge no forward arrow uses",
    (() => {
      if (back === undefined) return false;
      const tip = back.points[back.points.length - 1];
      const prev = back.points[back.points.length - 2];
      return (
        tip.y === prev.y &&
        tip.y === validate.cy &&
        (tip.x === validate.x || tip.x === validate.x + validate.width)
      );
    })(),
    JSON.stringify(back?.points),
  );
}

assertBackEdgesReadAsArrows("order intake", layout);

/* ---- the self-loop ----
 * `validate -> validate` must draw BESIDE its node, never across it: a loop
 * across the body strikes the label through. */
{
  const self = layout.edges.find((e) => e.self);
  const host = nodeById.get("validate");
  check(
    "the self-loop stays entirely off its node's right flank",
    self !== undefined &&
      self.points.every((p) => p.x >= host.x + host.width) &&
      self.points.every((p) => p.y > host.y && p.y < host.y + host.height),
    JSON.stringify(self?.points),
  );
  check(
    "the self-loop's label sits beside the loop, not on the node",
    self !== undefined &&
      self.labelBox !== null &&
      !rectsOverlap(self.labelBox, host),
  );
}

/* ---- diamonds fit their labels ----
 * THE classic naive-flowchart defect: text poking through the rhombus's
 * sloped edges. A centred rect (w×h) fits a rhombus (W×H) iff every corner
 * satisfies |dx|/(W/2) + |dy|/(H/2) ≤ 1 — asserted corner by corner from the
 * MEASURED label box, not from the sizing formula that produced the shape. */
check(
  "every decision's inscribed text box fits inside its rhombus",
  layout.nodes
    .filter((n) => n.shape === "decision")
    .every((n) => {
      const corners = [
        { x: n.labelBox.x, y: n.labelBox.y },
        { x: n.labelBox.x + n.labelBox.width, y: n.labelBox.y },
        { x: n.labelBox.x, y: n.labelBox.y + n.labelBox.height },
        {
          x: n.labelBox.x + n.labelBox.width,
          y: n.labelBox.y + n.labelBox.height,
        },
      ];
      return corners.every(
        (c) =>
          Math.abs(c.x - n.cx) / (n.width / 2) +
            Math.abs(c.y - n.cy) / (n.height / 2) <=
          1,
      );
    }),
);

/* ---- text fits ----
 * The label box must hold its own wrapped lines (the estimator that sized
 * the box is re-applied to the lines it produced), and sit inside the node —
 * otherwise the box lies about the text, the defect wrapText exists for. */
check(
  "every node's widest wrapped line fits its label box, which fits the node",
  layout.nodes.every((n) => {
    const widest = Math.max(
      ...n.lines.map((line) => est(line, FLOW.nodeFontSize)),
    );
    return (
      widest <= n.labelBox.width &&
      n.labelBox.x >= n.x &&
      n.labelBox.x + n.labelBox.width <= n.x + n.width &&
      n.labelBox.y >= n.y &&
      n.labelBox.y + n.labelBox.height <= n.y + n.height
    );
  }),
);
check(
  "wrapping loses no words",
  layout.nodes.every(
    (n) => n.lines.join(" ").split(/\s+/).join(" ") === n.label,
  ),
);

/* ---- edge labels ----
 * A guard drawn over a line (or another guard) is unreadable exactly where
 * reading matters. Clearance is asserted against EVERY edge's every segment
 * — including the label's own edge — every node and every other label. */
{
  const labelled = layout.edges.filter((e) => e.labelBox !== null);
  check(
    "every labelled edge kept its label box",
    labelled.length === file.edges.filter((e) => e.label !== undefined).length,
    `${labelled.length} boxes`,
  );
  check(
    "every edge label is clear of every edge path",
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
    "every edge label is clear of every node box",
    labelled.every((e) =>
      layout.nodes.every((n) => !rectsOverlap(e.labelBox, n, 1)),
    ),
  );
  check(
    "no two edge labels overlap",
    labelled.every((a, i) =>
      labelled.every(
        (b, j) => i >= j || !rectsOverlap(a.labelBox, b.labelBox, 1),
      ),
    ),
  );
}

/* ---- the group frame ----
 * The frame is a claim about membership; geometry must honour it exactly.
 * Members inside (label band clear above them), non-members outside — a
 * frame that swallows a neighbour asserts a grouping the document never
 * made. */
{
  const [group] = layout.groups;
  const members = new Set(["save", "receipt"]);
  check("one group in, one frame placed", layout.groups.length === 1);
  check(
    "the frame keeps its label and normalised tint",
    group.label === "Persistence" && group.tint === "#bfdfff",
  );
  check(
    "every member's box lies fully inside the frame",
    [...members].every((id) => {
      const n = nodeById.get(id);
      return (
        n.x > group.x &&
        n.y > group.y &&
        n.x + n.width < group.x + group.width &&
        n.y + n.height < group.y + group.height
      );
    }),
    `frame ${box(group)}`,
  );
  check(
    "the frame's label band is clear of every member",
    [...members].every((n) => nodeById.get(n).y >= group.y + FLOW.groupPadTop),
  );
  check(
    "every non-member's centre lies outside the frame",
    layout.nodes
      .filter((n) => !members.has(n.id))
      .every(
        (n) =>
          n.cx <= group.x ||
          n.cx >= group.x + group.width ||
          n.cy <= group.y ||
          n.cy >= group.y + group.height,
      ),
  );
}

/* ---- the heading ---- */
check(
  "the heading carries the document's title and the chart starts below it",
  layout.heading.titleLines.join(" ") === file.metadata.title &&
    layout.nodes.every((n) => n.y >= FLOW.marginTop + layout.heading.height),
  `heading ${layout.heading.height}px, first node y ${Math.min(...layout.nodes.map((n) => n.y))}`,
);

/* ----------------------------------------------------------------------- */
/* Fixture 2 — a re-merge: longest path, not breadth-first                  */
/* ----------------------------------------------------------------------- */

console.log("re-merging branches (the longest-path case)");

const MERGE = `archlab 1.0 flowchart
title "Merge"

@flowchart
  start s "Start"
  decision d "Which path?"
  step long1 "Slow leg, first step"
  step long2 "Slow leg, second step"
  step z "Merge point"
  end e "End"

  s -> d
  d -> long1 : "slow"
  long1 -> long2
  long2 -> z
  d -> z : "fast"
  z -> e
`;

const merge = layoutFlowchart(parseFlowchartText(MERGE));
const mnode = (id) => merge.nodes.find((n) => n.id === id);

/* The one assertion that separates longest-path ranking from a naive BFS or
 * a declaration-order stack: `z` has a DIRECT edge from the decision, but its
 * row must be below the END of the slow leg, so the fast branch's arrow is
 * long and the merge reads as a merge. */
check(
  "the merge point sits below the LONGEST branch, despite its direct edge",
  mnode("z").y > mnode("long2").y + mnode("long2").height,
  `z @y ${mnode("z").y}, long2 bottom ${mnode("long2").y + mnode("long2").height}`,
);
check(
  "the rank-skipping fast branch routes around the slow leg, not through it",
  (() => {
    const fast = merge.edges.find((e) => e.from === "d" && e.to === "z");
    return segments(fast).every(([a, b]) =>
      merge.nodes.every(
        (n) => n.id === "d" || n.id === "z" || !segmentHitsRect(a, b, n, 0),
      ),
    );
  })(),
);
check(
  "the fast branch's corridor runs outside every node column",
  (() => {
    const fast = merge.edges.find((e) => e.from === "d" && e.to === "z");
    const rowsRight = Math.max(...merge.nodes.map((n) => n.x + n.width));
    const rowsLeft = Math.min(...merge.nodes.map((n) => n.x));
    const extreme = Math.max(...fast.points.map((p) => p.x));
    const extremeLeft = Math.min(...fast.points.map((p) => p.x));
    return extreme > rowsRight || extremeLeft < rowsLeft;
  })(),
);
check(
  "fixture 2 is deterministic too",
  JSON.stringify(layoutFlowchart(parseFlowchartText(MERGE))) ===
    JSON.stringify(merge),
);

assertBackEdgesReadAsArrows("merge", merge);

/* ----------------------------------------------------------------------- */
/* Fixture 3 — the user-reported chart, verbatim: a four-node loop whose    */
/* back edge rendered as a dashed rectangle around the left half of the     */
/* drawing, with no visible arrowhead and interchangeable yes/no labels.    */
/* Kept as a fixture so THAT report can never quietly come back.            */
/* ----------------------------------------------------------------------- */

console.log("the reported loop chart (regression, user report verbatim)");

const REPORTED = `archlab 1.0 flowchart
title "Your flowchart"

@flowchart
  start s "Start"
  step work "Do the thing"
  decision ok "Did it work?"
  end done "Done"

  s -> work
  work -> ok
  ok -> done : "yes"
  ok -> work : "no"
`;

const reported = layoutFlowchart(parseFlowchartText(REPORTED));
const rnode = (id) => reported.nodes.find((n) => n.id === id);

{
  const back = reported.edges.find((e) => e.from === "ok" && e.to === "work");
  const ok = rnode("ok");
  const work = rnode("work");
  check(
    "the no-branch is a back edge and a HOOK, not a circuit: at most four points — out of the diamond's flank, up beside the column, into the step's flank",
    back !== undefined && back.back && back.points.length <= 4,
    JSON.stringify(back?.points),
  );
  check(
    "the loop leaves the decision through its SIDE VERTEX, not the bottom the yes-branch uses — the two branches part ways at the diamond itself",
    back !== undefined &&
      back.points[0].y === ok.cy &&
      (back.points[0].x === ok.x || back.points[0].x === ok.x + ok.width),
    JSON.stringify(back?.points),
  );
  check(
    "the loop lands horizontally on the step's flank at mid-height, where its arrowhead is the only thing that ever lands — the report said no arrowhead was visible at all",
    (() => {
      if (back === undefined) return false;
      const tip = back.points[back.points.length - 1];
      const prev = back.points[back.points.length - 2];
      return (
        tip.y === prev.y &&
        tip.y === work.cy &&
        (tip.x === work.x || tip.x === work.x + work.width)
      );
    })(),
    JSON.stringify(back?.points),
  );
}

assertBackEdgesReadAsArrows("reported loop chart", reported);

check(
  "fixture 3 is deterministic too",
  JSON.stringify(layoutFlowchart(parseFlowchartText(REPORTED))) ===
    JSON.stringify(reported),
);

/* ----------------------------------------------------------------------- */
/* Fixture 4 — non-Latin (Thai) labels: measured, not assumed               */
/* ----------------------------------------------------------------------- */
/* From a user's real Mermaid use-case diagram (Thai throughout). Thai has
 * NO spaces between words, so the word wrap's only break opportunity is the
 * hard split — and the hard split used to cut at a raw character index,
 * splitting a base character from its combining vowel/tone marks so the
 * continuation line opened with an orphaned mark on a dotted circle. The
 * width estimate (CHAR_WIDTH_RATIO) is Latin-derived too, so containment is
 * asserted MEASURED, per node, rather than trusted. The estimator counts
 * zero-advance combining marks as full glyphs, which errs roomy — the safe
 * direction — and these assertions keep it that way around.                */

console.log("thai labels (spaceless text, combining marks)");

const THAI = `archlab 1.0 flowchart
title "บริการสั่งอาหาร"

@flowchart
  start customer "ลูกค้า"
  step search "ค้นหาร้านอาหาร"
  decision pay "สั่งอาหารและชำระเงินสำเร็จหรือไม่"
  step retry "สั่งอาหารและชำระเงินออนไลน์ผ่านแอปพลิเคชันมือถืออีกครั้ง"
  end done "เสร็จสิ้น"

  customer -> search
  search -> pay
  pay -> done : "ใช่"
  pay -> retry : "ไม่ใช่"
  retry -> pay
`;

const thai = layoutFlowchart(parseFlowchartText(THAI));

/* Thai combining marks (vowels above/below, tone marks): U+0E31, U+0E34–3A,
   U+0E47–4E. A line OPENING with one means a cluster was cut. */
const THAI_COMBINING_START = /^[ัิ-ฺ็-๎]/;

for (const node of thai.nodes) {
  check(
    `"${node.id}" wraps between grapheme clusters — no line opens with an orphaned combining mark (the dotted-circle defect a raw slice ships on spaceless Thai)`,
    node.lines.length > 0 &&
      node.lines.every((line) => !THAI_COMBINING_START.test(line)),
    JSON.stringify(node.lines),
  );
  check(
    `"${node.id}"'s measured text box fits inside its shape box — the Latin-derived width estimate must stay on the roomy side for Thai, or glyphs clip with no ellipsis to hide behind`,
    rectInside(node.labelBox, {
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
    }),
    `label ${box(node.labelBox)} vs node ${box({ x: node.x, y: node.y, width: node.width, height: node.height })}`,
  );
  check(
    `every wrapped line of "${node.id}" measures within its label box — a line wider than the box is the clipped-text bug regardless of script`,
    node.lines.every(
      (line) => est(line, FLOW.nodeFontSize) <= node.labelBox.width,
    ),
    JSON.stringify(node.lines),
  );
}

{
  /* The DIAMOND case by corners: the inscribed text box must fit the rhombus
     (w/W + h/H <= 1 at every text-box corner), because the diamond doubles
     every extra pixel of line width — the first shape a bad estimate breaks. */
  const pay = thai.nodes.find((n) => n.id === "pay");
  const inRhombus = (px, py) => {
    const dx = Math.abs(px - pay.cx) / (pay.width / 2);
    const dy = Math.abs(py - pay.cy) / (pay.height / 2);
    return dx + dy <= 1.000001;
  };
  const b = pay.labelBox;
  check(
    "the Thai decision's text box corners all sit inside the rhombus — spaceless wrapping must not let a long Thai line poke through the sloped edges",
    pay.shape === "decision" &&
      inRhombus(b.x, b.y) &&
      inRhombus(b.x + b.width, b.y) &&
      inRhombus(b.x, b.y + b.height) &&
      inRhombus(b.x + b.width, b.y + b.height),
    `labelBox ${box(b)} in diamond ${box({ x: pay.x, y: pay.y, width: pay.width, height: pay.height })}`,
  );
  check(
    "the long spaceless Thai label actually exercises the hard split (more than one line) — otherwise this fixture proves nothing about wrapping",
    (thai.nodes.find((n) => n.id === "retry")?.lines.length ?? 0) > 1,
  );
}

check(
  "fixture 4 is deterministic too — grapheme segmentation must not vary run to run",
  JSON.stringify(layoutFlowchart(parseFlowchartText(THAI))) ===
    JSON.stringify(thai),
);

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} flowchart-layout assertions passed.`);

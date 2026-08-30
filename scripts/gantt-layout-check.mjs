#!/usr/bin/env node
/**
 * Gantt layout check. Loads the REAL `layoutGantt` from
 * `src/features/gantt/lib/layout.ts` through Node's type stripping, so this
 * measures the geometry the canvas and the SVG exporter actually draw rather
 * than a copy of it.
 *
 * Every assertion here is RELATIONAL or MEASURED — "below", "inside", "does
 * not cross", "equals the path that is drawn" — never a restatement of a
 * constant. `codebase.md` names the failure mode: an assertion that says
 * `rowHeight === 34` passes forever and catches nothing.
 *
 * What it proves, and why each rule is here:
 *
 *   1. EVERY CONNECTOR POINTS DOWNWARD — the source's row is above the
 *      target's. This is the property the topological row solve BUYS, and it
 *      is the whole justification for solving the rows at all rather than
 *      drawing them in the order they were typed. `purpose.md` forbids a grid
 *      fallback and a Gantt is where that rule is easiest to break, because
 *      "one row per item, in the order written" looks like a layout and is
 *      really a list. A list would produce upward connectors the moment an
 *      author declared a dependency before the thing it waits for, so this
 *      assertion is what tells the two apart.
 *   2. NO CONNECTOR CROSSES AN ITEM IT DOES NOT TOUCH. `new-diagram-type.md`
 *      states the rule; on a Gantt it is not free, because the rectangle
 *      between a source's right edge and a later target's left edge is
 *      usually occupied. The rectangles are rebuilt here FROM THE LAYOUT —
 *      milestones included, at half-width `GANTT.milestoneRadius` — rather than
 *      taken from the router's own `boxesOf`, so a router that both routes
 *      and measures against a wrong box cannot pass by agreeing with itself.
 *   3. EVERY BAR LIES INSIDE THE PLOT. x is `day * pxPerDay` against a span
 *      that is recomputed per document; a bar escaping `[plotX0, plotX1]` is
 *      a row drawn over the rail or off the canvas.
 *   4. A CONNECTOR'S `length` EQUALS THE PATH IN ITS OWN `d` STRING. The
 *      length is COMPUTED rather than measured, because the canvas is
 *      server-rendered and `getTotalLength()` needs a DOM. That is the right
 *      call and it costs this: the number and the path are two artefacts that
 *      must agree, and nothing at runtime would notice if they stopped. They
 *      are the `stroke-dasharray` and the geometry of the same line — the
 *      moment they disagree, the draw-on animation stops short or overruns
 *      and the ambient current's head lands somewhere off the line.
 *   5. THE CRITICAL PATH IS EXACTLY THE ZERO-FLOAT SET, and the float
 *      arithmetic is right in specific, hand-checked places. Criticality is
 *      COMPUTED here rather than declared in the grammar precisely so it
 *      cannot contradict the arithmetic — which makes the arithmetic the only
 *      thing left to get wrong.
 *   6. A DEPENDENCY CYCLE TERMINATES. Both solving passes are iterative and
 *      bounded for this reason; a recursive one would blow the stack on a
 *      document the parser happily accepts (it refuses self-reference, not
 *      cycles — refusing those is `validate_gantt`'s job). The canvas's
 *      contract is that it draws whatever parsed.
 *
 * Exits non-zero on any failure. Run with: pnpm check:gantt-layout
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { registerTsResolution } from "./lib/resolve-ts.mjs";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const load = registerTsResolution(ROOT);

const { parseGanttText } = await load("src/features/archtext/index.ts");
const { layoutGantt, GANTT, GANTT_FRAME_PAD, ganttHitRegions } = await load(
  "src/features/gantt/lib/layout.ts",
);
const { GANTT_EXAMPLE } = await load("src/features/gantt/input/example.ts");
const { itemSchedule } = await load("src/features/gantt/lib/axis.ts");
const { DIAGRAM_SURFACE_PAD } = await load("src/lib/diagram-surface.ts");
const { listGanttExampleIds, loadGanttExample } = await load(
  "src/features/gantt/service/example-service.ts",
);

const read = (relative) => readFileSync(path.join(ROOT, relative), "utf8");

let failures = 0;
let assertions = 0;
const check = (label, condition, detail) => {
  assertions += 1;
  if (condition) {
    console.log(`  ✓ ${label}`);
    return;
  }
  failures += 1;
  console.error(`  ✗ ${label}`);
  if (detail) console.error(`    ${detail}`);
};

const seed = layoutGantt(parseGanttText(GANTT_EXAMPLE));

/* EVERY REGISTERED EXAMPLE, not only the seed, and derived from the registry
   so a third example is covered the day it is added rather than the day
   somebody remembers to list it here (`codebase.md`: a hardcoded list cannot
   notice the thing it has never heard of). */
const ALL = [
  ["seed", seed],
  ...listGanttExampleIds().map((id) => {
    const example = loadGanttExample(id);
    return [id, example.status === "ok" ? layoutGantt(example.file) : null];
  }),
].filter(([, value]) => value !== null);

/* ----------------------------------------------------------------------- */
/* Path arithmetic — the `d` string is re-read, never trusted               */
/* ----------------------------------------------------------------------- */

/**
 * The segments a browser would draw from a `d` string, as absolute pairs.
 *
 * Parsed back out of the string rather than taken from the router's point
 * list, because the string is what ships: the SVG file, the export and the
 * page all carry `d`, and a length that agrees with an intermediate array the
 * browser never sees would prove nothing.
 */
function segmentsOf(d) {
  const tokens = d.match(/[MHV] ?-?[\d.]+(?: -?[\d.]+)?/g) ?? [];
  let x = 0;
  let y = 0;
  const segments = [];
  for (const token of tokens) {
    const command = token[0];
    const numbers = token.slice(1).trim().split(" ").map(Number);
    if (command === "M") {
      [x, y] = numbers;
      continue;
    }
    const next = command === "H" ? { x: numbers[0], y } : { x, y: numbers[0] };
    segments.push({ x0: x, y0: y, x1: next.x, y1: next.y });
    x = next.x;
    y = next.y;
  }
  return segments;
}

/** The rectangle an item occupies, rebuilt from the layout — see clause 2. */
const rectanglesOf = (layout) =>
  layout.items.map((item) =>
    item.milestone
      ? {
          id: item.id,
          x0: item.x0 - GANTT.milestoneRadius,
          x1: item.x0 + GANTT.milestoneRadius,
          y0: item.midY - GANTT.milestoneRadius,
          y1: item.midY + GANTT.milestoneRadius,
        }
      : {
          id: item.id,
          x0: item.x0,
          x1: Math.max(item.x1, item.x0 + GANTT.minBarWidth),
          y0: item.barY,
          y1: item.barY + GANTT.barHeight,
        },
  );

/* ----------------------------------------------------------------------- */
console.log("rows");

{
  check(
    `the examples are big enough to be a layout (${ALL.length} documents, ${ALL.reduce((n, [, l]) => n + l.items.length, 0)} rows, ${ALL.reduce((n, [, l]) => n + l.dependencies.length, 0)} connectors)`,
    ALL.length >= 2 &&
      ALL.every(([, layout]) => layout.dependencies.length >= 3),
    ALL.map(([name, l]) => `${name}: ${l.dependencies.length} deps`).join(", "),
  );

  /* Two rows on one y is two bars drawn on top of each other — the one
     failure that makes a Gantt unreadable rather than merely ugly. */
  const collided = [];
  for (const [name, layout] of ALL) {
    const seen = new Map();
    for (const item of layout.items) {
      if (seen.has(item.rowY)) {
        collided.push(
          `${name}: ${item.id} shares row ${item.rowY} with ${seen.get(item.rowY)}`,
        );
      }
      seen.set(item.rowY, item.id);
    }
  }
  check("no two items share a row", collided.length === 0, collided.join(", "));

  const outside = [];
  for (const [name, layout] of ALL) {
    for (const item of layout.items) {
      if (
        item.rowY < layout.plotTop ||
        item.rowY + GANTT.rowHeight > layout.height
      ) {
        outside.push(`${name}: ${item.id}`);
      }
    }
  }
  check(
    "every row sits below the axis and inside the canvas the layout reports",
    outside.length === 0,
    outside.join(", "),
  );

  /* THE MEASURED AXIS, which is the whole notation: x is a quantity, not a
     rank. A bar escaping the plot is a row drawn over the label rail. */
  const escaped = [];
  for (const [name, layout] of ALL) {
    for (const item of layout.items) {
      const right = item.milestone
        ? item.x0 + GANTT.milestoneRadius
        : Math.max(item.x1, item.x0 + GANTT.minBarWidth);
      const left = item.milestone ? item.x0 - GANTT.milestoneRadius : item.x0;
      if (left < GANTT.plotX0 - 0.001 || right > GANTT.plotX1 + 0.001) {
        escaped.push(
          `${name}: ${item.id} spans ${left.toFixed(1)}..${right.toFixed(1)}`,
        );
      }
    }
  }
  check(
    `every bar and diamond lies inside the plot [${GANTT.plotX0}, ${GANTT.plotX1}]`,
    escaped.length === 0,
    escaped.join(", "),
  );

  /* The axis is a measure, so equal durations must be equal widths and a
     longer task must be a longer bar. Relational, so it survives any retune of
     the plot width. */
  const misscaled = [];
  for (const [name, layout] of ALL) {
    const tasks = layout.items.filter((item) => !item.milestone);
    for (const a of tasks) {
      for (const b of tasks) {
        const wider = a.x1 - a.x0 > b.x1 - b.x0 + 0.001;
        if (a.duration === b.duration && wider) {
          misscaled.push(
            `${name}: ${a.id}/${b.id} same days, different widths`,
          );
        }
        if (a.duration < b.duration && wider) {
          misscaled.push(
            `${name}: ${a.id} is shorter than ${b.id} but drawn wider`,
          );
        }
      }
    }
  }
  check(
    "bar width is proportional to duration — equal days draw equal, fewer days draw shorter",
    misscaled.length === 0,
    misscaled.slice(0, 4).join("; "),
  );
}

/* ----------------------------------------------------------------------- */
console.log("connectors");

{
  /* 1. THE PROPERTY THE ROW SOLVE BUYS. */
  const upward = [];
  for (const [name, layout] of ALL) {
    const byId = new Map(layout.items.map((item) => [item.id, item]));
    for (const dependency of layout.dependencies) {
      const from = byId.get(dependency.from);
      const to = byId.get(dependency.to);
      if (from === undefined || to === undefined) {
        upward.push(
          `${name}: ${dependency.from}->${dependency.to} has no endpoint`,
        );
        continue;
      }
      if (from.rowY >= to.rowY) {
        upward.push(
          `${name}: ${dependency.from}(row ${from.rowY}) -> ${dependency.to}(row ${to.rowY})`,
        );
      }
    }
  }
  check(
    "every connector points downward — its source's row is above its target's",
    upward.length === 0,
    `${upward.join(", ")} — an upward arrow means the rows were listed, not solved`,
  );

  /* 2. NO VERTICAL RUN CROSSES A RECTANGLE THAT IS NOT ITS OWN ENDPOINT.
     One pixel of tolerance on every side: a channel that merely grazes a
     bar's border is flush against it, not through it. */
  const through = [];
  for (const [name, layout] of ALL) {
    const rectangles = rectanglesOf(layout);
    for (const dependency of layout.dependencies) {
      for (const segment of segmentsOf(dependency.path)) {
        if (segment.x0 !== segment.x1) continue;
        const top = Math.min(segment.y0, segment.y1);
        const bottom = Math.max(segment.y0, segment.y1);
        for (const rectangle of rectangles) {
          if (
            rectangle.id === dependency.from ||
            rectangle.id === dependency.to
          ) {
            continue;
          }
          if (
            segment.x0 >= rectangle.x0 - 1 &&
            segment.x0 <= rectangle.x1 + 1 &&
            bottom > rectangle.y0 + 1 &&
            top < rectangle.y1 - 1
          ) {
            through.push(
              `${name}: ${dependency.from}->${dependency.to} runs down x=${segment.x0.toFixed(1)} through ${rectangle.id}`,
            );
          }
        }
      }
    }
  }
  check(
    "no connector's vertical run crosses an item it does not join",
    through.length === 0,
    through.slice(0, 4).join("; "),
  );

  const diagonal = [];
  for (const [name, layout] of ALL) {
    for (const dependency of layout.dependencies) {
      for (const segment of segmentsOf(dependency.path)) {
        if (segment.x0 !== segment.x1 && segment.y0 !== segment.y1) {
          diagonal.push(`${name}: ${dependency.from}->${dependency.to}`);
        }
      }
    }
  }
  check(
    "every connector segment is horizontal or vertical",
    diagonal.length === 0,
    diagonal.join(", "),
  );

  /* 4. THE NUMBER AND THE PATH ARE ONE THING. */
  const drifted = [];
  for (const [name, layout] of ALL) {
    for (const dependency of layout.dependencies) {
      const drawn = segmentsOf(dependency.path).reduce(
        (total, segment) =>
          total +
          Math.abs(segment.x1 - segment.x0) +
          Math.abs(segment.y1 - segment.y0),
        0,
      );
      if (Math.abs(drawn - dependency.length) > 1e-9) {
        drifted.push(
          `${name}: ${dependency.from}->${dependency.to} reports ${dependency.length}, draws ${drawn}`,
        );
      }
    }
  }
  check(
    "every connector's reported length equals the path its own `d` draws",
    drifted.length === 0,
    `${drifted.join("; ")} — the length IS the stroke-dasharray, so a drift makes the draw stop short or overrun`,
  );

  /* The arrowhead is drawn by hand from `tipX`/`tipY`/`tipDirection`, so the
     tip must actually be the path's last point — a tip elsewhere is a
     triangle floating beside its line. */
  const stray = [];
  for (const [name, layout] of ALL) {
    for (const dependency of layout.dependencies) {
      const segments = segmentsOf(dependency.path);
      const last = segments[segments.length - 1];
      if (
        Math.abs(last.x1 - dependency.tipX) > 0.001 ||
        Math.abs(last.y1 - dependency.tipY) > 0.001
      ) {
        stray.push(`${name}: ${dependency.from}->${dependency.to}`);
        continue;
      }
      const travelling = last.x0 === last.x1 ? "down" : "right";
      if (travelling !== dependency.tipDirection) {
        stray.push(
          `${name}: ${dependency.from}->${dependency.to} arrives ${travelling}, points ${dependency.tipDirection}`,
        );
      }
    }
  }
  check(
    "every arrowhead sits on its path's last point, pointing the way the line arrives",
    stray.length === 0,
    stray.join("; "),
  );

  /* A connector is painted critical only when BOTH ends are — a slack item
     depending on a critical one is not itself on the chain, and painting that
     connector as critical would draw a path the float pass disagrees with. */
  const mispainted = [];
  for (const [name, layout] of ALL) {
    const byId = new Map(layout.items.map((item) => [item.id, item]));
    for (const dependency of layout.dependencies) {
      const both =
        byId.get(dependency.from).critical && byId.get(dependency.to).critical;
      if (both !== dependency.critical) {
        mispainted.push(`${name}: ${dependency.from}->${dependency.to}`);
      }
    }
  }
  check(
    "a connector is critical exactly when both of its ends are",
    mispainted.length === 0,
    mispainted.join(", "),
  );
}

/* ----------------------------------------------------------------------- */
console.log("float and the critical path");

{
  const disagreed = [];
  for (const [name, layout] of ALL) {
    for (const item of layout.items) {
      if (item.critical !== item.float <= 0) {
        disagreed.push(
          `${name}: ${item.id} float ${item.float}, critical ${item.critical}`,
        );
      }
    }
  }
  check(
    "the critical set is exactly the zero-float set",
    disagreed.length === 0,
    disagreed.join(", "),
  );

  /* Float is the difference between the two passes, so it can only be checked
     against arithmetic done independently. These are hand-computed from the
     seed and named, because a float pass that is merely self-consistent
     (always zero, say) would pass every relational assertion above. */
  const byId = new Map(seed.items.map((item) => [item.id, item]));
  const floatOf = (id) => byId.get(id)?.float;

  check(
    "`backfill` carries exactly 1 day of float — it finishes a day before `verify` can start",
    floatOf("backfill") === 1,
    `got ${floatOf("backfill")}`,
  );
  check(
    "`archive` carries exactly 5 days of float — it hangs off `cutover` and nothing waits for it",
    floatOf("archive") === 5,
    `got ${floatOf("archive")}`,
  );

  /* THE NON-OBVIOUS ONE, asserted rather than left to be "fixed" by the next
     reader. A TERMINAL MILESTONE HAS FLOAT. `parity` and `live` are
     zero-duration and sit on the critical chain by eye — they are the
     signed-off moments of the phases that decide the end date — and they are
     NOT critical, correctly:
       - float is `latestStart - earliestStart`, and an item's latest start is
         bounded by its SUCCESSORS. A terminal milestone has none, so its
         bound is the project end;
       - `parity` can therefore slip from day 24 to day 39 without moving the
         end date, because nothing is waiting on it to happen.
     That is what float MEANS, and it is the same reason a task nobody depends
     on is never critical. It looks like a bug — a milestone drawn in the slack
     weight in the middle of the critical chain — and it is not, so it is
     asserted here rather than "corrected" into a special case. Special-casing
     it would put a declared criticality back into a model whose whole point is
     that criticality is computed. */
  check(
    "a TERMINAL MILESTONE has float: `parity` and `live` are not critical (nothing waits on them)",
    floatOf("parity") > 0 &&
      floatOf("live") > 0 &&
      byId.get("parity").critical === false &&
      byId.get("live").critical === false,
    `parity float ${floatOf("parity")}, live float ${floatOf("live")}`,
  );

  /* The chain that IS critical, end to end: it must reach the project's end,
     or "critical" is naming something other than the path that decides the
     date. */
  const critical = seed.items.filter((item) => item.critical);
  check(
    `the critical chain runs from day 0 to the project end (${seed.end} days)`,
    critical.length > 0 &&
      Math.min(...critical.map((item) => item.start)) === 0 &&
      Math.max(...critical.map((item) => item.finish)) === seed.end,
    critical
      .map((item) => `${item.id} ${item.start}..${item.finish}`)
      .join(", "),
  );

  /* FLOAT IS A MEASUREMENT, so it is measured: each slack item is pinned
     later with `at` — the one model field the schedule pass reads and the
     geometry does not — and the project's end is read back. Slipping by
     exactly the float must cost nothing; slipping by one more day must cost a
     day. A one-sided version of this would pass against a float pass that
     always returned a huge number. */
  const wrong = [];
  for (const slack of ["backfill", "archive"]) {
    const item = byId.get(slack);
    const pinAt = (day) => {
      const shifted = GANTT_EXAMPLE.replace(
        new RegExp(`(task ${slack} "[^"]*" \\d+d)( [a-z-]+)? after [a-z, ]+`),
        `$1 at ${day}`,
      );
      if (shifted === GANTT_EXAMPLE) {
        wrong.push(`${slack}: the fixture rewrite matched nothing`);
        return null;
      }
      return layoutGantt(parseGanttText(shifted)).end;
    };
    const onTime = pinAt(item.start + item.float);
    const late = pinAt(item.start + item.float + 1);
    if (onTime !== null && onTime !== seed.end) {
      wrong.push(`${slack} slipping ${item.float}d moved the end to ${onTime}`);
    }
    if (late !== null && late !== seed.end + 1) {
      wrong.push(
        `${slack} slipping ${item.float + 1}d ended at ${late}, expected ${seed.end + 1}`,
      );
    }
  }
  check(
    "an item slipping by exactly its float costs nothing, and one day more costs a day",
    wrong.length === 0,
    wrong.join("; "),
  );
}

/* ----------------------------------------------------------------------- */
console.log("waves (the entrance order the stagger carries)");

{
  /* The stagger is dependency RANK, so a dependent must never rise before the
     thing it waits for. The cap is what makes this an inequality rather than a
     strict one: past `GANTT.waveCap` every rank collapses onto the cap. */
  const early = [];
  for (const [name, layout] of ALL) {
    const byId = new Map(layout.items.map((item) => [item.id, item]));
    for (const item of layout.items) {
      for (const dep of item.after) {
        const parent = byId.get(dep);
        if (parent !== undefined && item.wave < parent.wave) {
          early.push(
            `${name}: ${item.id} (wave ${item.wave}) before ${dep} (${parent.wave})`,
          );
        }
      }
    }
  }
  check(
    "no item rises before something it waits for",
    early.length === 0,
    early.join(", "),
  );

  const overCap = [];
  for (const [name, layout] of ALL) {
    for (const item of layout.items) {
      if (item.wave > GANTT.waveCap) overCap.push(`${name}: ${item.id}`);
    }
    for (const dependency of layout.dependencies) {
      if (dependency.wave > GANTT.edgeWaveCap) {
        overCap.push(`${name}: ${dependency.from}->${dependency.to}`);
      }
    }
  }
  check(
    `every wave index is capped (rows at ${GANTT.waveCap}, connectors at ${GANTT.edgeWaveCap}) — the reveal budget is computed from the cap`,
    overCap.length === 0,
    overCap.join(", "),
  );
}

/* ----------------------------------------------------------------------- */
console.log("the row solve does work the declaration order does not");

{
  /* THE FIXTURE THAT MAKES CLAUSE 1 BITE. Both registered examples happen to
     declare their rows in an order that is already topological, so on those
     documents "solve the rows" and "keep the order typed" produce the same
     picture — and an upward-connector assertion measured only against them
     passes with the solve deleted. That was verified by deleting it. This
     document declares its dependent FIRST, so a layout that merely listed the
     rows would draw an arrow travelling up the page. */
  const outOfOrder = layoutGantt(
    parseGanttText(`archlab 1.0 gantt
title "Declared backwards"

@gantt
  section "One band"
    task last "Declared first, runs last" 3d after middle
    task middle "Declared second, runs second" 2d after first
    task first "Declared last, runs first" 4d
`),
  );
  const rows = outOfOrder.items.map((item) => item.id);
  check(
    "an item declared before the thing it waits for is still drawn below it",
    rows.join(",") === "first,middle,last",
    `rows read ${rows.join(", ")} — declaration order was kept instead of solved`,
  );
  const byId = new Map(outOfOrder.items.map((item) => [item.id, item]));
  check(
    "and its connectors still all point downward",
    outOfOrder.dependencies.every(
      (dependency) =>
        byId.get(dependency.from).rowY < byId.get(dependency.to).rowY,
    ),
    outOfOrder.dependencies.map((d) => `${d.from}->${d.to}`).join(", "),
  );

  /* Declaration order is still the tie-break, so two INDEPENDENT items keep
     the order their author typed. Without this the solve would be free to
     reorder rows nothing constrains, and a save-and-reopen would shuffle a
     plan the author had arranged deliberately. */
  const independent = layoutGantt(
    parseGanttText(`archlab 1.0 gantt
title "Independent"

@gantt
  section "One band"
    task zulu "Z" 3d
    task alpha "A" 2d
    task mike "M" 4d
`),
  );
  check(
    "independent items keep declaration order — the solve only reorders what it must",
    independent.items.map((item) => item.id).join(",") === "zulu,alpha,mike",
    independent.items.map((item) => item.id).join(", "),
  );

  /* A CROSS-SECTION dependency must NOT drag an item out of its band:
     membership is the nesting, and the layout does not get to overrule it. */
  const crossing = layoutGantt(
    parseGanttText(`archlab 1.0 gantt
title "Cross-section"

@gantt
  section "Later band"
    task tail "Waits on the other band" 3d after head
  section "Earlier band"
    task head "Runs first" 2d
`),
  );
  check(
    "a cross-section dependency does not move a row out of the band it was written in",
    crossing.items[0].id === "tail" && crossing.items[1].id === "head",
    crossing.items.map((item) => item.id).join(", "),
  );
}

/* ----------------------------------------------------------------------- */
console.log("untrusted graphs");

{
  /* A CYCLE MUST TERMINATE. The parser refuses self-reference and dangling
     ids but NOT a cycle — that is `validate_gantt`'s job — so a cyclic
     document reaches this layout, and both solving passes are iterative
     rather than recursive for exactly this case. A hang here is not a wrong
     picture; it is a page that never renders. */
  const cyclic = parseGanttText(`archlab 1.0 gantt
title "Cycle"

@gantt
  section "Loop"
    task a "A" 3d after c
    task b "B" 2d after a
    task c "C" 4d after b
    task free "Independent" 5d
`);
  let laid = null;
  let error = null;
  try {
    laid = layoutGantt(cyclic);
  } catch (caught) {
    error = caught;
  }
  check(
    "a three-item dependency cycle lays out instead of hanging or throwing",
    error === null && laid !== null && laid.items.length === 4,
    error === null ? `got ${laid?.items.length} items` : error.message,
  );
  check(
    "the cycle's members are still drawn, on the canvas rather than off it",
    laid !== null &&
      laid.items.every(
        (item) =>
          Number.isFinite(item.x0) &&
          Number.isFinite(item.x1) &&
          item.x0 >= GANTT.plotX0 - 0.001,
      ),
    "a NaN coordinate poisons the whole SVG, not one row",
  );
  check(
    "a cyclic document still routes every connector to a finite path",
    laid !== null &&
      laid.dependencies.every(
        (dependency) =>
          Number.isFinite(dependency.length) &&
          !dependency.path.includes("NaN"),
      ),
    laid?.dependencies.map((d) => d.path).join(" | "),
  );
}

/* ----------------------------------------------------------------------- */

/* ----------------------------------------------------------------------- */
console.log("the exported file has air around it");

{
  const exportSvg = readFileSync(
    path.join(ROOT, "src/features/gantt/export/render-svg.ts"),
    "utf8",
  );
  const pad = Number(/const EXPORT_PADDING = (\d+);/.exec(exportSvg)?.[1]);

  /* NOTHING ON THIS CANVAS IS LAID OUT WITH A MARGIN — the axis caption and
     every section label start at x=0 and the section rules run from there — so
     the screen gets its air from the viewer's CSS and an exported file, which
     inherits no stylesheet, got none at all. A user reported the PNG cropped
     to the label rail. The raster step adds nothing either: it is a pure
     scale-and-blit of width x height drawn at the origin, so the fix has to be
     in the SVG and this is what asserts it stayed there. */
  check(
    `the export declares a padding at all (${pad})`,
    Number.isFinite(pad) && pad > 0,
    "without it the label rail sits flush against the left edge of the PNG",
  );
  check(
    "the padded box is the layout plus twice the padding, on both axes",
    /const width = layout\.width \+ EXPORT_PADDING \* 2;/.test(exportSvg) &&
      /const height = layout\.height \+ EXPORT_PADDING \* 2;/.test(exportSvg) &&
      /return \{ svg: parts\.join\(""\), width, height \}/.test(exportSvg),
    "the reported size must be the padded size, or the rasteriser crops back to the unpadded box",
  );
  check(
    "the content is translated into the pad, and the ground is painted outside it",
    /<g transform="translate\(\$\{EXPORT_PADDING\} \$\{EXPORT_PADDING\}\)">/.test(
      exportSvg,
    ) &&
      exportSvg.indexOf('fill="${theme.canvas}"') <
        exportSvg.indexOf("<g transform="),
    "a background emitted INSIDE the group is inset by exactly the margin it exists to fill, and the pad exports transparent",
  );

  /* A WHOLE NUMBER OF HATCH TILES. The bar hatch is `userSpaceOnUse`, so the
     translate carries the tile grid with it and the stripes stay locked to the
     bars either way — but a pad that is a whole number of tiles keeps the
     grid's PHASE identical to the unpadded file, and an integer pad keeps the
     hairlines off half-pixel boundaries when the PNG rasterises at scale 1. */
  check(
    `the padding is a whole number of hatch tiles (${pad} / ${GANTT.hatchTile})`,
    Number.isInteger(pad / GANTT.hatchTile),
    `${pad} is not a multiple of ${GANTT.hatchTile} — the hatch phase shifts against the unpadded file and the hairlines land off pixel boundaries at scale 1`,
  );

  /* THE SCREEN IS FRAMED THE SAME WAY, and nothing else was checking it. The
     header above used to reason that the screen needed no margin of its own
     because the viewer's CSS supplied it. That was never quite true: a gantt is
     the only one of the nine kinds that draws TEXT at x=0 — the axis caption
     and every section heading — and CSS padding sits outside the `<svg>`, so it
     cannot put air between a heading and the drawing's own edge.

     A field drawn inside the `<svg>` briefly made the crop obvious, and the
     assertion below was originally written against it. That field now lives on
     the pane, so the field clause is gone; the pad is not, because the reason
     for it never depended on the field. These two assertions stop the file and
     the canvas from framing one plan two different ways. */
  check(
    `the screen frames the sheet with the same pad the file does (${GANTT_FRAME_PAD} / ${pad})`,
    GANTT_FRAME_PAD === pad,
    `the canvas pads by ${GANTT_FRAME_PAD} and the export by ${pad} — a reader ` +
      "downloading what they are looking at would get a differently framed plan",
  );

  /* THE SURFACE MUST NOT SIT ON THE DRAWING'S OWN EDGE, which is the failure
     the pad assertions above could not see and did not catch.

     They measure the SHEET's margin, and that is all they measure. The plan
     then got its own `--node` panel and the panel was drawn at the drawing's
     bounds — a hard, stroked, rounded edge back at x=0, precisely where the
     pad had just moved one away from. "SHAPE IT" and the axis caption touched
     the border, on screen and in every downloaded file, and every assertion
     here stayed green because the sheet around the panel was still correctly
     padded.

     So the thing to assert is not "there is a pad" but "the panel CONTAINS the
     drawing, with air on every side" — a relation between two boxes rather
     than a number restated. The remainder matters too: a surface pad equal to
     the frame pad would put the panel's stroke on the trim, where the viewBox
     clips half of it.

     THE SCREEN/FILE PARITY THIS USED TO ASSERT IS NOW STRUCTURAL. Both sides
     take their box from `diagramSurfaceBox` in `@/lib/diagram-surface`, so
     they cannot disagree about it; what is worth checking is that both still
     go THROUGH that module rather than having grown a rect of their own back.
     The panel is shared with the timeline and the lifecycle now, and each of
     their layout checks asserts the same use. */
  check(
    `the surface holds the drawing with air on every side (${DIAGRAM_SURFACE_PAD} in, ${GANTT_FRAME_PAD - DIAGRAM_SURFACE_PAD} out)`,
    DIAGRAM_SURFACE_PAD > 0 && DIAGRAM_SURFACE_PAD < GANTT_FRAME_PAD,
    "the plan's surface is drawn at the drawing's own bounds — the axis " +
      "caption and every section heading, the only text in the nine kinds " +
      "drawn at x=0, touch the panel border",
  );
  check(
    "the file paints its surface from the shared geometry",
    /diagramSurfaceMarkup\(/.test(exportSvg),
    "the gantt exporter emits a panel rect of its own — the screen and the " +
      "file frame one plan two different ways again the moment either moves",
  );

  const diagram = readFileSync(
    path.join(ROOT, "src/features/gantt/components/gantt-diagram.tsx"),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  check(
    "the canvas grows its box by the pad and moves its origin out to meet it",
    /const sheetWidth = layout\.width \+ GANTT_FRAME_PAD \* 2;/.test(diagram) &&
      /const sheetHeight = layout\.height \+ GANTT_FRAME_PAD \* 2;/.test(
        diagram,
      ) &&
      /viewBox=\{`\$\{-GANTT_FRAME_PAD\} \$\{-GANTT_FRAME_PAD\} \$\{sheetWidth\} \$\{sheetHeight\}`\}/.test(
        diagram,
      ),
    "the sheet is the drawing plus its margin and the viewBox starts at the " +
      "margin — without both, the section headings and the axis caption, " +
      "which are the only text in the nine kinds drawn at x=0, sit hard " +
      "against the edge",
  );
  check(
    "the canvas draws its surface around the drawing, not on it",
    /<DiagramSurface\s+width=\{layout\.width\}\s+height=\{layout\.height\}\s*\/>/.test(
      diagram,
    ),
    "the `--node` panel is back to being this canvas's own rect — the pad " +
      "above is then air on the wrong side of a stroked edge, which is " +
      "exactly the state that shipped once already",
  );
}

/* ----------------------------------------------------------------------- */
console.log("a selected bar names the days it actually occupies");

/* THE ARITHMETIC A READER SHOULD NOT HAVE TO DO. A bar is labelled with its
   duration, which is the one number the plan already states; what a reader
   stopping on it wants is the other end — "six days from the 12th, so done
   WHEN". Selecting one now answers that, and this is where the answer is
   checked.

   THE OFF-BY-ONE IS THE WHOLE ASSERTION. `finish` is EXCLUSIVE: a six-day task
   starting on day 12 has `finish` 18, because 18 is where the next thing may
   start. Printing `finish` names a day the work is not being done on, every
   task silently claims a day it does not use, and NOTHING LOOKS WRONG — the
   dates are plausible and the bar is drawn correctly either way. So the label
   is measured back into days and compared with the duration the plan states,
   over every bundled document, rather than eyeballed on one.

   MEASURED THROUGH THE REAL FORMATTER, not by re-deriving it: the check parses
   the string `itemSchedule` produced and counts the days between its ends, so
   a change to the wording that broke the arithmetic fails here. */
{
  const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
  const wrong = [];
  let labelled = 0;
  for (const id of listGanttExampleIds()) {
    const example = loadGanttExample(id);
    if (example.status !== "ok" || !example.file.origin) continue;
    const laid = layoutGantt(example.file);
    for (const item of laid.items) {
      const label = itemSchedule(example.file, item);
      labelled += 1;
      /* Both spellings the formatter can produce: "12–17 Apr" when one month
         covers it, "28 Apr – 3 May" when it does not, and a bare date for a
         milestone or a one-day task. */
      const same = /^(\d+)–(\d+) (\w+)$/.exec(label);
      const split = /^(\d+) (\w+) – (\d+) (\w+)$/.exec(label);
      const one = /^(\d+) (\w+)$/.exec(label);
      const year = new Date(
        `${example.file.origin}T00:00:00Z`,
      ).getUTCFullYear();
      const at = (day, month) =>
        Date.UTC(year, MONTHS.indexOf(month), Number(day));
      let days = null;
      if (same) days = Number(same[2]) - Number(same[1]) + 1;
      else if (split) {
        const from = at(split[1], split[2]);
        const to = at(split[3], split[4]);
        days = (to - from) / 86_400_000 + 1;
      } else if (one) days = item.milestone ? 0 : 1;
      const want = item.milestone ? 0 : item.duration;
      if (days === null || days !== want) {
        wrong.push(
          `${id}/${item.id}: "${label}" spans ${days} day(s), plan says ${want}`,
        );
      }
    }
  }
  check(
    `every bundled bar's dates span exactly its duration (${labelled} items)`,
    labelled > 0 && wrong.length === 0,
    wrong.length === 0
      ? "no dated example was reached, so this measured nothing"
      : `${wrong.slice(0, 4).join("; ")} — printing the EXCLUSIVE finish claims a day the work is not done on, and nothing looks wrong when it does`,
  );

  /* AND A DOCUMENT WITH NO `starts` LINE STILL ANSWERS, in the relative units
     its axis is already labelled in. Saying nothing there would make the
     affordance appear and disappear depending on a header the reader may not
     have written. */
  const relative = layoutGantt(
    parseGanttText(GANTT_EXAMPLE.replace(/^\s*starts .*$/m, "")),
  );
  const withoutOrigin = relative.items.map((item) =>
    itemSchedule(
      parseGanttText(GANTT_EXAMPLE.replace(/^\s*starts .*$/m, "")),
      item,
    ),
  );
  check(
    `without a start date the label falls back to day numbers (${withoutOrigin[0]})`,
    withoutOrigin.every((label) => /^day \d+(–\d+)?$/.test(label)),
    `${withoutOrigin.filter((l) => !/^day \d+(–\d+)?$/.test(l)).join(", ")} — a calendar was invented for a plan that named no origin`,
  );
}

/* ----------------------------------------------------------------------- */
console.log("selecting one bar lights one bar and its neighbours");

/* IT USED TO LIGHT THE WHOLE CHAIN, transitively, in both directions — every
   ancestor back to the first task and every descendant on to the last. On a
   plan where most work is sequenced that is nearly the entire document, so
   selecting one bar dimmed almost nothing. Reported as clicking one bar
   focusing the lot.

   MEASURED AS A SHARE OF THE PLAN, not by reading the walk. A cap on the count
   would pass on a small document and say nothing about a large one; what has
   to be true is that a selection SEPARATES the thing chosen from the rest, and
   on the biggest bundled plan the old behaviour lit most of it. The bound is
   the one-hop neighbourhood, so it is stated as exactly that: the item, plus
   the ids it names and the ids that name it, and nothing two hops away. */
{
  const overreach = [];
  for (const id of listGanttExampleIds()) {
    const example = loadGanttExample(id);
    if (example.status !== "ok") continue;
    const laid = layoutGantt(example.file);
    const byId = new Map(laid.items.map((item) => [item.id, item]));
    for (const item of laid.items) {
      /* THE NEIGHBOURHOOD, rebuilt here from the model rather than taken from
         the viewer — a viewer that both lit and measured its own set would
         agree with itself whatever it did. */
      const want = new Set([item.id]);
      for (const parent of item.after) want.add(parent);
      for (const other of laid.items) {
        if (other.after.includes(item.id)) want.add(other.id);
      }
      /* Two hops must NOT be in it: a grandparent is the case the transitive
         walk swept in, and the one a reader noticed. */
      const twoHops = item.after.flatMap(
        (parent) => byId.get(parent)?.after ?? [],
      );
      const leaked = twoHops.filter((far) => want.has(far) && far !== item.id);
      if (leaked.length > 0) {
        overreach.push(`${id}/${item.id} reaches ${leaked.join(", ")}`);
      }
      if (want.size > laid.items.length * 0.75 && laid.items.length > 4) {
        overreach.push(
          `${id}/${item.id} lights ${want.size} of ${laid.items.length}`,
        );
      }
    }
  }
  check(
    "no selection reaches two hops, or most of the plan",
    overreach.length === 0,
    `${overreach.slice(0, 3).join("; ")} — a selection that lights nearly everything has not selected anything`,
  );

  /* AND THE VIEWER BUILDS THAT SET WITHOUT WALKING. Asserted against the code
     because the shape of the bug was a recursive walk, and a walk is what
     someone reaching for "show me the whole chain" would write again. */
  const viewer = read("src/features/gantt/components/gantt-viewer.tsx");
  const litBlock = /const litIds = useMemo\(\(\) => \{[\s\S]*?\}, \[/.exec(
    viewer,
  );
  check(
    "the viewer's lit set is one hop, with no recursion",
    litBlock !== null && !/walk\(/.test(litBlock[0]),
    "a transitive walk is back — it is the natural way to write 'the whole chain', and it lights the plan",
  );

  /* CLICKING EMPTY GROUND CLEARS THE SELECTION. There was no way out but
     clicking the same bar again — which means finding it — or Escape, which
     nobody discovers. Reported as being hard to unfocus. */
  /* THE HANDLER IS ATTACHED, not merely declared. The first version of this
     asked whether the NAME appeared in the file, and a break that deleted the
     `onClick` line sailed through — the function was still defined, unused and
     unreachable. Present-and-wired are two claims; this asks for the wiring. */
  /* THE HANDLER IS ATTACHED, AND IT CLEARS. Two earlier drafts of this were
     green over a break. The first asked whether the NAME appeared anywhere, and
     deleting the `onClick` left the function defined and unreachable. The
     second bounded nothing — `const handleBackdropClick[\s\S]*?setPinned` runs
     past the end of the handler and finds the `setPinned(null)` in the dock's
     CLOSE BUTTON, so gutting the handler still matched. The body is now cut at
     the next declaration, which is a real boundary rather than a hopeful one. */
  const backdropBody = (() => {
    const at = viewer.indexOf("const handleBackdropClick");
    if (at < 0) return "";
    const rest = viewer.slice(at + 1);
    const next = rest.search(/\n  (const |return |function )/);
    return next < 0 ? rest : rest.slice(0, next);
  })();
  check(
    "clicking the pane clears the selection",
    /onClick=\{handleBackdropClick\}/.test(viewer) &&
      /setPinned\(null\)/.test(backdropBody),
    "the only ways out are re-clicking the bar you already lost track of, and a key nobody presses",
  );

  /* AND THE DOCK CARRIES THE DATES, which is where they went from the bar. */
  check(
    "the selected item's days are shown in the dock",
    /itemSchedule\(file, focusedItem\)/.test(viewer),
    "the dates went nowhere when they left the bar's label",
  );
}

/* ----------------------------------------------------------------------- */
console.log("a click lands on the ink, not on the row around it");

/* THE HIT TARGET WAS THE WHOLE ROW, end to end, so the empty plot between and
   after the bars selected whatever row it happened to fall in. On a plan whose
   bars occupy a fifth of their row that is most of what a pointer crosses, and
   every near-miss landed on something. Reported as being easy to misclick.

   MEASURED THROUGH THE FUNCTION THE CANVAS DRAWS WITH, which is why it lives
   in `lib/layout.ts` rather than beside the element: a copy in the `.tsx` — a
   file this script cannot load at all — would mean checking a re-derivation
   and calling it the canvas. Two halves, each self-consistent, free to
   disagree.

   FOUR THINGS HAVE TO HOLD, and the last three are all the ways narrowing a
   hit target goes wrong quietly. */
{
  const parseBoxes = (d) =>
    [...d.matchAll(/M (-?[\d.]+) (-?[\d.]+) H (-?[\d.]+)/g)].map((match) => ({
      x0: Number(match[1]),
      y: Number(match[2]),
      x1: Number(match[3]),
    }));

  let rowTotal = 0;
  let hitTotal = 0;
  let narrowest = Infinity;
  const offCanvas = [];
  const merged = [];
  const missing = [];

  for (const id of listGanttExampleIds()) {
    const example = loadGanttExample(id);
    if (example.status !== "ok") continue;
    const laid = layoutGantt(example.file);
    for (const item of laid.items) {
      const width = Math.max(item.x1 - item.x0, GANTT.minBarWidth);
      const boxes = parseBoxes(ganttHitRegions(item, width));
      rowTotal += GANTT.width;
      for (const box of boxes) hitTotal += box.x1 - box.x0;

      /* A TASK KEEPS TWO REGIONS AND A MILESTONE ONE, because a milestone has
         no rail entry — its name sits beside its diamond. A task collapsing to
         one region would mean its name or its bar had stopped being clickable
         and nothing else would say so. */
      const want = item.milestone ? 1 : 2;
      if (boxes.length !== want) {
        missing.push(
          `${id}/${item.id}: ${boxes.length} region(s), want ${want}`,
        );
      }
      if (boxes.some((box) => box.x0 < 0 || box.x1 > GANTT.width)) {
        offCanvas.push(
          `${id}/${item.id}: ${boxes.map((b) => `${b.x0.toFixed(1)}–${b.x1.toFixed(1)}`).join(", ")}`,
        );
      }
      if (!item.milestone && boxes.length === 2) {
        /* STRICTLY GREATER. They ABUT for anything starting on day 0: the
           rail region ends at 194 (railWidth 196, less the label's 8, plus 6
           of pad) and the bar's begins at 194 (plotX0 200, less the same 6).
           Touching is not overlapping, and the six units between the rail and
           the plot being clickable for a day-0 task is fine — it is one
           continuous target for one item. `>=` called that a defect. */
        if (boxes[0].x1 > boxes[1].x0) {
          merged.push(`${id}/${item.id}: the rail region reaches the bar`);
        }
        narrowest = Math.min(narrowest, boxes[1].x1 - boxes[1].x0);
      }
    }
  }

  const share = hitTotal / rowTotal;
  check(
    `the clickable area is a fraction of the row (${(share * 100).toFixed(1)}%)`,
    share < 0.5,
    `${(share * 100).toFixed(1)}% — the empty plot is a target again, and every near-miss selects something`,
  );
  check(
    `every item keeps a region for its name and one for its bar (${missing.length} exception(s))`,
    missing.length === 0,
    missing.slice(0, 3).join("; "),
  );
  /* THE THIN-BAR CASE IS THE ONE NARROWING BREAKS. A one-day bar is six units
     wide, and the full-row target is what used to make it reachable at all —
     `GANTT.minHitWidth` is now the only thing that does.

     NOT MEASURED ON THE BUNDLED PLANS, because it cannot be. Their narrowest
     bar is 52 units against a floor of 24, so deleting the floor changes
     nothing any of them can see: the assertion passed because the data never
     reaches the rule, which is a check that cannot fail dressed as one that
     can. Proved by breaking it and watching nothing happen.

     SO THE CASE IS BUILT. A one-day bar is `plotWidth / span` wide, which
     falls under `minBarWidth` only past about 133 days — a half-year roadmap
     with a one-day cutover in it, which is an ordinary document rather than a
     contrived one. On that plan the floor is the whole difference between a
     six-unit target and a reachable one. */
  const longPlan = parseGanttText(
    [
      "archlab 1.0 gantt",
      'title "A long road"',
      "starts 2026-01-05",
      "",
      "@gantt",
      '  section "The year"',
      '    task groundwork "Groundwork" 200d',
      '    task cutover "Cutover" 1d after groundwork',
    ].join("\n"),
  );
  const longLaid = layoutGantt(longPlan);
  const cutover = longLaid.items.find((item) => item.id === "cutover");
  const cutoverWidth = Math.max(cutover.x1 - cutover.x0, GANTT.minBarWidth);
  const cutoverBoxes = parseBoxes(ganttHitRegions(cutover, cutoverWidth));
  const cutoverHit = cutoverBoxes[1].x1 - cutoverBoxes[1].x0;
  check(
    `a one-day bar on a ${longLaid.span}-day plan draws ${cutoverWidth.toFixed(1)} and is hit at ${cutoverHit.toFixed(1)}`,
    cutoverWidth <= GANTT.minBarWidth + 0.001 &&
      cutoverHit >= GANTT.minHitWidth,
    `drawn ${cutoverWidth.toFixed(1)}, hit ${cutoverHit.toFixed(1)} against a floor of ${GANTT.minHitWidth} — if the drawn width is not at the minimum this plan no longer exercises the floor, and if the hit is under it a one-day task is unreachable`,
  );
  /* AND THE FLOOR IS REACHABLE AT ALL. The assertion above compares the hit
     against `minHitWidth`, so it agrees with itself for any value — setting the
     floor back to the dead 18 it started as left it green. A floor at
     `minBarWidth + 2 × hitPad` is what padding already gives, so it can never
     raise anything; this is the one question that cannot be asked by measuring
     an item, because no item can tell you about the rule it never met. */
  check(
    `the floor can bind at all (${GANTT.minHitWidth} > ${GANTT.minBarWidth} + 2 × ${GANTT.hitPad})`,
    GANTT.minHitWidth > GANTT.minBarWidth + 2 * GANTT.hitPad,
    `${GANTT.minHitWidth} is at or under what the padding alone gives — a dead line that reads as a guarantee`,
  );
  check(
    `and every bundled bar clears the floor too (${narrowest.toFixed(1)} units)`,
    narrowest >= GANTT.minHitWidth,
    `${narrowest.toFixed(1)} — under the floor, so a short task has become unhittable`,
  );
  check(
    "no name region runs off the canvas or into the plot",
    offCanvas.length === 0 && merged.length === 0,
    `${[...offCanvas, ...merged].slice(0, 3).join("; ")} — a target outside the viewBox cannot be clicked, and one reaching the bar has re-made the row`,
  );
}

/* ----------------------------------------------------------------------- */

console.log("");
if (failures > 0) {
  console.error(`${failures} of ${assertions} assertions failed.`);
  process.exit(1);
}
console.log(`All ${assertions} assertions passed.`);

#!/usr/bin/env node
/**
 * Milestone-timeline layout check. Loads the REAL `layoutTimeline` from
 * `src/features/timeline/lib/layout.ts` through Node's type stripping, so this
 * measures the geometry the canvas and the SVG exporter actually draw rather
 * than a copy of it.
 *
 * Every assertion here is RELATIONAL or MEASURED — "does not overlap",
 * "inside", "taller than", "equals the text that is drawn" — never a
 * restatement of a constant. `codebase.md` names the failure mode: an
 * assertion that says `labelWidth === 620` passes forever and catches nothing.
 *
 * What it proves, and why each rule is here:
 *
 *   1. NO TWO EVENT BOXES OVERLAP, and no event box crosses its period's
 *      heading. THIS IS THE ASSERTION THE WHOLE LAYOUT EXISTS FOR. A row of
 *      dots on a line is exactly what a grid looks like, so `purpose.md`'s
 *      no-grid rule is easier to break here than anywhere else in the repo —
 *      and a grid would not merely look wrong, it would produce collisions the
 *      moment an author wrote a sentence longer than one line. The boxes are
 *      rebuilt HERE from the wrapped line counts rather than taken from the
 *      layout's own `y0`/`y1`, so a layout that both places and measures
 *      against a wrong height cannot pass by agreeing with itself.
 *   2. THE HEIGHTS ARE DERIVED FROM THE TEXT, proved by DIFFERENCE rather than
 *      by reading the code: a two-line event must be measurably taller than a
 *      one-line one, and an event with a description taller than the same
 *      event without. A fixed row pitch passes clause 1 and fails these — it
 *      is what separates "no collisions" from "not a grid".
 *   3. A PERIOD'S BAND IS THE SUM OF ITS EVENTS'. Two periods with different
 *      event counts must have different heights, in the same order. This is
 *      the claim the demo card's "4 periods · 11 events" makes visually.
 *   4. EVERYTHING IS INSIDE THE CANVAS. Every dot, every text baseline and
 *      every wrapped line's estimated right edge must fall within
 *      `[0, width] × [0, height]`. Off-box coordinates are invisible rather
 *      than wrong-looking, which is how illustrations ship broken.
 *   5. THE SPINE IS CLIPPED TO THE EVENTS — it starts at the first dot and
 *      ends at the last, never at the canvas edges. A line running past the
 *      outermost event would imply time either side of the document, which
 *      this notation has no way to claim.
 *   6. THE WRAPPING IS REAL. Every drawn line must be an actual segment of the
 *      label, and the lines rejoined must reproduce it — a layout that
 *      silently truncated a long label would pass every geometric assertion
 *      above while throwing away the only content this notation carries.
 *   7. IT IS TOTAL. An empty document and a period with one very long event
 *      both produce a layout rather than throwing, because the canvas's
 *      contract is that it draws whatever parsed.
 *
 * Exits non-zero on any failure. Run with: pnpm check:timeline-layout
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { registerTsResolution } from "./lib/resolve-ts.mjs";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const load = registerTsResolution(ROOT);

const { parseTimelineText } = await load("src/features/archtext/index.ts");
const { layoutTimeline, TIMELINE, TIMELINE_FRAME_PAD } = await load(
  "src/features/timeline/lib/layout.ts",
);
const { TIMELINE_EXAMPLE } = await load(
  "src/features/timeline/input/example.ts",
);
const { listTimelineExampleIds, loadTimelineExample } = await load(
  "src/features/timeline/service/example-service.ts",
);
const { CHAR_WIDTH_RATIO } = await load("src/lib/text-metrics.ts");
const { DIAGRAM_SURFACE_PAD } = await load("src/lib/diagram-surface.ts");

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

const seed = layoutTimeline(parseTimelineText(TIMELINE_EXAMPLE));

/* EVERY REGISTERED EXAMPLE, not only the seed, and derived from the registry
   so a third example is covered the day it is added rather than the day
   somebody remembers to list it here (`codebase.md`: a hardcoded list cannot
   notice the thing it has never heard of). */
const ALL = [
  ["seed", seed],
  ...listTimelineExampleIds().map((id) => {
    const example = loadTimelineExample(id);
    return [id, example.status === "ok" ? layoutTimeline(example.file) : null];
  }),
].filter(([, value]) => value !== null);

check(
  `every bundled document lays out (${ALL.length} documents, from the registry)`,
  ALL.length >= 3,
  `only ${ALL.length} laid out — a registered example failed to parse`,
);

/* ----------------------------------------------------------------------- */
/* The box an event really occupies — rebuilt, never trusted                */
/* ----------------------------------------------------------------------- */

/**
 * The vertical extent an event's drawn text actually covers, computed from the
 * LINE COUNTS and the type metrics rather than read off `y0`/`y1`.
 *
 * REBUILT ON PURPOSE, which is clause 1's whole point: if this read the
 * layout's own box, a layout that placed events by one rule and sized them by
 * another would agree with itself and pass. Text extents here are baseline
 * minus ascent to baseline plus descent, approximated as the font size either
 * side — deliberately GENEROUS, so a near-miss counts as a collision.
 */
function inkOf(event) {
  const top = event.labelY - TIMELINE.labelSize;
  const labelBottom =
    event.labelY + (event.labelLines.length - 1) * TIMELINE.labelLineHeight;
  const bottom =
    event.descY === null
      ? labelBottom
      : event.descY +
        (event.descriptionLines.length - 1) * TIMELINE.descLineHeight +
        TIMELINE.descSize * 0.3;
  return { top, bottom };
}

/* ----------------------------------------------------------------------- */
/* 1. Nothing collides                                                      */
/* ----------------------------------------------------------------------- */

console.log("nothing collides (the assertion the layout exists for)");

for (const [name, layout] of ALL) {
  const inks = layout.events.map((event) => ({
    key: event.key,
    lines: event.labelLines.length,
    ...inkOf(event),
  }));

  const overlaps = [];
  for (let i = 1; i < inks.length; i += 1) {
    if (inks[i].top < inks[i - 1].bottom) {
      overlaps.push(
        `${inks[i - 1].key} (${inks[i - 1].lines} lines, ends ${inks[i - 1].bottom.toFixed(1)}) into ${inks[i].key} (starts ${inks[i].top.toFixed(1)})`,
      );
    }
  }
  check(
    `${name}: no two event labels overlap, at the wrapping they actually get`,
    overlaps.length === 0,
    overlaps.join("; "),
  );

  /* A PERIOD HEADING IS TEXT TOO, and it sits in the same column band as the
     rail. Its own ink must clear the last event of the band above it, or the
     heading prints over a sentence — the collision a reader notices first,
     because it is the one that breaks the grouping. */
  const headingClashes = [];
  for (const period of layout.periods) {
    const headTop = period.labelY - TIMELINE.periodSize;
    const above = layout.events.filter(
      (event) => inkOf(event).bottom <= headTop,
    );
    const previous = above[above.length - 1];
    if (previous === undefined) continue;
    if (inkOf(previous).bottom > headTop) {
      headingClashes.push(`${period.label} over ${previous.key}`);
    }
    /* And the band's own first event must start below its heading's rule. */
    const first = layout.events.find((event) => event.period === period.label);
    if (first !== undefined && inkOf(first).top < period.ruleY) {
      headingClashes.push(
        `${first.key} starts at ${inkOf(first).top.toFixed(1)}, above the ${period.label} rule at ${period.ruleY}`,
      );
    }
  }
  check(
    `${name}: no event runs into a period heading or its rule`,
    headingClashes.length === 0,
    headingClashes.join("; "),
  );
}

/* THE ADVERSARIAL DOCUMENT, which the bundled examples cannot supply: labels
   long enough to wrap several times, next to one-word ones, with and without
   descriptions. A fixed row pitch passes on the bundled documents (their
   labels are short) and fails here, which is the point of writing it. */
console.log("nothing collides on a document built to break a grid");

const ADVERSARIAL = layoutTimeline(
  parseTimelineText(`archlab 1.0 timeline
title "Adversarial"

@timeline
  period "Long and short together"
    event "A"
    event "${"word ".repeat(60).trim()}"
    event "B"
      desc "${"note ".repeat(80).trim()}"
    event "C"
    event "${"another ".repeat(40).trim()}"
      desc "${"and ".repeat(50).trim()}"
  period "One more"
    event "D"
`),
);

{
  const inks = ADVERSARIAL.events.map((event) => ({
    key: event.key,
    lines: event.labelLines.length,
    ...inkOf(event),
  }));
  const overlaps = inks.filter(
    (ink, index) => index > 0 && ink.top < inks[index - 1].bottom,
  );
  check(
    "a document of six-line labels beside one-word ones still collides nowhere",
    overlaps.length === 0,
    overlaps.map((ink) => ink.key).join(", "),
  );
  check(
    "and the long labels really did wrap — the case is not passing vacuously",
    inks.some((ink) => ink.lines >= 4),
    `longest label is ${Math.max(...inks.map((ink) => ink.lines))} line(s); this document is not exercising the wrap`,
  );
}

/* ----------------------------------------------------------------------- */
/* 2. The heights are derived, not a pitch                                  */
/* ----------------------------------------------------------------------- */

console.log(
  "the heights come from the text (this is what makes it not a grid)",
);

{
  const oneLine = ADVERSARIAL.events.find(
    (event) => event.labelLines.length === 1 && event.descY === null,
  );
  const manyLines = ADVERSARIAL.events.find(
    (event) => event.labelLines.length >= 3 && event.descY === null,
  );
  const withNote = ADVERSARIAL.events.find(
    (event) => event.descY !== null && event.labelLines.length === 1,
  );

  const height = (event) => {
    const ink = inkOf(event);
    return ink.bottom - ink.top;
  };

  check(
    "a multi-line event is taller than a one-line one",
    oneLine !== undefined &&
      manyLines !== undefined &&
      height(manyLines) > height(oneLine),
    oneLine === undefined || manyLines === undefined
      ? "the fixture does not contain both shapes"
      : `${height(manyLines).toFixed(1)} vs ${height(oneLine).toFixed(1)}`,
  );
  check(
    "an event with a description is taller than one without",
    withNote !== undefined &&
      oneLine !== undefined &&
      height(withNote) > height(oneLine),
    withNote === undefined
      ? "the fixture has no annotated one-line event"
      : `${height(withNote).toFixed(1)} vs ${height(oneLine).toFixed(1)}`,
  );

  /* THE SAME CLAIM STATED AS A NEGATIVE, because it is the one a grid would
     satisfy: the set of event heights must not be a single value. A layout
     with a row pitch produces one number here however long the labels are. */
  const distinct = new Set(
    ADVERSARIAL.events.map((event) => Math.round(height(event))),
  );
  check(
    "event heights are not all one number — a row pitch would make them so",
    distinct.size >= 3,
    `only ${distinct.size} distinct height(s): ${[...distinct].join(", ")}`,
  );
}

/* ----------------------------------------------------------------------- */
/* 3. A band is the sum of its events                                       */
/* ----------------------------------------------------------------------- */

console.log("a period's band is solved from its events");

for (const [name, layout] of ALL) {
  const bands = layout.periods.map((period) => ({
    label: period.label,
    count: period.eventCount,
    height: period.y1 - period.y,
  }));
  /* MONOTONIC IN THE EVENT COUNT, compared PAIRWISE rather than as a single
     ordering: two bands with the same count may differ in height (their
     labels wrap differently), but a band with strictly more events must never
     be shorter than one with fewer. That is the property a reader is being
     invited to read off the picture. */
  const wrong = [];
  for (const a of bands) {
    for (const b of bands) {
      if (a.count > b.count && a.height <= b.height) {
        wrong.push(
          `${a.label} holds ${a.count} events in ${a.height.toFixed(0)}px, ${b.label} holds ${b.count} in ${b.height.toFixed(0)}px`,
        );
      }
    }
  }
  check(
    `${name}: a band with more events is never shorter than one with fewer`,
    wrong.length === 0,
    wrong.join("; "),
  );
}

check(
  "the seed really does have bands of different sizes — the claim is visible",
  new Set(seed.periods.map((period) => Math.round(period.y1 - period.y)))
    .size >= 3,
  seed.periods.map((period) => (period.y1 - period.y).toFixed(0)).join(", "),
);

/* ----------------------------------------------------------------------- */
/* 4. Everything is inside the canvas                                       */
/* ----------------------------------------------------------------------- */

console.log("everything is inside the canvas");

for (const [name, layout] of ALL.concat([["adversarial", ADVERSARIAL]])) {
  const outside = [];
  const widest = (line, size) => line.length * size * CHAR_WIDTH_RATIO;

  for (const event of layout.events) {
    if (event.dotY < 0 || event.dotY > layout.height) {
      outside.push(`${event.key} dot at y=${event.dotY.toFixed(1)}`);
    }
    const ink = inkOf(event);
    if (ink.top < 0 || ink.bottom > layout.height) {
      outside.push(
        `${event.key} text spans ${ink.top.toFixed(1)}–${ink.bottom.toFixed(1)}`,
      );
    }
    for (const line of event.labelLines) {
      const right = TIMELINE.labelX + widest(line, TIMELINE.labelSize);
      if (right > layout.width) {
        outside.push(`${event.key} label runs to x=${right.toFixed(0)}`);
      }
    }
    for (const line of event.descriptionLines) {
      const right = TIMELINE.labelX + widest(line, TIMELINE.descSize);
      if (right > layout.width) {
        outside.push(`${event.key} note runs to x=${right.toFixed(0)}`);
      }
    }
  }
  for (const period of layout.periods) {
    if (period.labelY < 0 || period.labelY > layout.height) {
      outside.push(`period ${period.label} at y=${period.labelY.toFixed(1)}`);
    }
  }
  check(
    `${name}: every dot, baseline and wrapped line is inside the canvas box`,
    outside.length === 0,
    outside.join("; "),
  );
}

/* THE MEASURE IS ACTUALLY HONOURED, which is a different claim from "inside
   the canvas": a wrap that overshot `labelWidth` by a little would still fit
   the 1020-unit box and would still be wrong, because the measure is what
   makes the text readable rather than what makes it fit. */
{
  const over = [];
  for (const [name, layout] of ALL.concat([["adversarial", ADVERSARIAL]])) {
    for (const event of layout.events) {
      for (const line of event.labelLines) {
        const width = line.length * TIMELINE.labelSize * CHAR_WIDTH_RATIO;
        if (width > TIMELINE.labelWidth + 0.5) {
          over.push(`${name}/${event.key}: ${width.toFixed(0)}px`);
        }
      }
    }
  }
  check(
    "no wrapped line exceeds the reading measure the layout wraps to",
    over.length === 0,
    over.join("; "),
  );
}

/* ----------------------------------------------------------------------- */
/* 5. The spine is clipped to the events                                    */
/* ----------------------------------------------------------------------- */

console.log("the spine claims no time either side of the document");

for (const [name, layout] of ALL) {
  const first = layout.events[0];
  const last = layout.events[layout.events.length - 1];
  check(
    `${name}: the spine starts at the first dot and ends at the last`,
    first !== undefined &&
      last !== undefined &&
      layout.spineY0 === first.dotY &&
      layout.spineY1 === last.dotY,
    `spine ${layout.spineY0}–${layout.spineY1}, dots ${first?.dotY}–${last?.dotY}`,
  );
  check(
    `${name}: and stops short of both canvas edges`,
    layout.spineY0 > 0 && layout.spineY1 < layout.height,
    `spine ${layout.spineY0}–${layout.spineY1} in a ${layout.height} box`,
  );
}

/* ----------------------------------------------------------------------- */
/* 6. The wrapping is real, not a truncation                                */
/* ----------------------------------------------------------------------- */

console.log("every label is drawn in full");

{
  const lost = [];
  for (const [name, layout] of ALL.concat([["adversarial", ADVERSARIAL]])) {
    for (const event of layout.events) {
      /* Rejoined with single spaces, because that is what a greedy word wrap
         does to the runs of whitespace between words. A label with an
         embedded newline is normalised the same way on both sides. */
      const drawn = event.labelLines.join(" ").replace(/\s+/g, " ").trim();
      const source = event.label.replace(/\s+/g, " ").trim();
      if (drawn !== source) lost.push(`${name}/${event.key}`);
    }
  }
  check(
    "the drawn lines rejoin to the label exactly — nothing is truncated",
    lost.length === 0,
    lost.join(", "),
  );
}

/* ----------------------------------------------------------------------- */
/* 7. It is total                                                           */
/* ----------------------------------------------------------------------- */

console.log("the layout is total (the canvas draws whatever parsed)");

{
  /* Built in code rather than parsed: the grammar refuses a document with no
     periods, but the MCP tools and the Mermaid importer both construct models
     directly, and a layout that threw here would take the whole page down
     rather than drawing an empty canvas. */
  const empty = layoutTimeline({
    version: "1.0",
    kind: "timeline",
    metadata: { title: "Empty", createdAt: "", updatedAt: "" },
    periods: [],
  });
  check(
    "a document with no periods lays out rather than throwing",
    empty.events.length === 0 && empty.height > 0,
    JSON.stringify(empty),
  );
  check(
    "and its spine collapses rather than running the canvas",
    empty.spineY0 === empty.spineY1,
    `${empty.spineY0}–${empty.spineY1}`,
  );

  const oneWord = layoutTimeline({
    version: "1.0",
    kind: "timeline",
    metadata: { title: "One", createdAt: "", updatedAt: "" },
    periods: [{ label: "P", events: [{ label: "x" }] }],
  });
  check(
    "a single one-character event still gets a box the focus ring fits in",
    oneWord.events[0].y1 - oneWord.events[0].dotY >= TIMELINE.ringRadius,
    `${(oneWord.events[0].y1 - oneWord.events[0].dotY).toFixed(1)} < ${TIMELINE.ringRadius}`,
  );
}

/* ----------------------------------------------------------------------- */
/* The sheet                                                               */
/* ----------------------------------------------------------------------- */

/* THE SURFACE MUST NOT SIT ON THE DRAWING'S OWN EDGE. This canvas gained a
   `--node` panel when the three kinds that draw on a ruled ground were made to
   look like one product rather than one exception and two drawings on the wall.

   The gantt got there first and got it wrong first: its panel was drawn at the
   drawing's own bounds, which put a hard stroked edge exactly where its section
   headings sit, on screen and in every exported file. The period rules and the rail labels run just as
   close to this drawing's edge, so the same mistake is available here — and it
   is invisible to every geometry assertion above, all of which measure the
   drawing and not the box around it.

   So the relation is what gets asserted: the panel contains the drawing with
   air on every side, and the leftover stays outside so the panel's stroke is
   not half-clipped by the viewBox. Screen/file parity needs no assertion — both
   take the box from `diagramSurfaceBox` — but that they still go THROUGH it
   does. */
{
  const canvas = readFileSync(
    path.join(ROOT, "src/features/timeline/components/timeline-diagram.tsx"),
    "utf8",
  );
  const exportSrc = readFileSync(
    path.join(ROOT, "src/features/timeline/export/render-svg.ts"),
    "utf8",
  );
  check(
    `the surface holds the drawing with air on every side (${DIAGRAM_SURFACE_PAD} in, ${TIMELINE_FRAME_PAD - DIAGRAM_SURFACE_PAD} out)`,
    DIAGRAM_SURFACE_PAD > 0 && DIAGRAM_SURFACE_PAD < TIMELINE_FRAME_PAD,
    "the surface is drawn at the drawing's own bounds, or runs to the trim — " +
      "either way a stroked edge lands on the drawing's own text",
  );
  check(
    "the canvas draws the shared surface around the drawing",
    canvas.includes(
      "<DiagramSurface width={layout.width} height={layout.height} />",
    ),
    "this canvas paints no sheet, or paints a rect of its own — a drawing " +
      "straight on the well's ground beside two that sit on paper",
  );
  check(
    "the canvas frames the sheet so the surface is not on the trim",
    canvas.includes("${-TIMELINE_FRAME_PAD} ${-TIMELINE_FRAME_PAD}"),
    "the viewBox still starts at the drawing's origin — the surface then " +
      "hangs outside the box and its stroke is clipped",
  );
  check(
    "the file paints its surface from the shared geometry",
    exportSrc.includes("diagramSurfaceMarkup("),
    "the exporter emits no panel, or one of its own — a downloaded diagram " +
      "is framed differently from the one on screen",
  );
}

/* ----------------------------------------------------------------------- */

console.log("");
if (failures > 0) {
  console.error(`${failures} of ${assertions} assertions failed.`);
  process.exit(1);
}
console.log(`All ${assertions} assertions passed.`);

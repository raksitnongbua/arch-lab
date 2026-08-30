#!/usr/bin/env node
/**
 * Lifecycle layout check. Loads the REAL `layoutLifecycle` from
 * `src/features/lifecycle/lib/layout.ts` through Node's type stripping, so
 * this measures the geometry the canvas and the SVG exporter actually draw
 * rather than a copy of it.
 *
 * Every assertion here is RELATIONAL or MEASURED — "does not overlap",
 * "inside", "left of", "strictly increasing" — never a restatement of a
 * constant. `codebase.md` names the failure mode: an assertion that says
 * `spineX === 460` passes forever and catches nothing.
 *
 * What it proves, and why each rule is here:
 *
 *   1. NO TWO TEXT BOXES OVERLAP, anywhere on the canvas — state labels,
 *      state descriptions, exit labels, exit conditions and the subject
 *      heading, all against each other. THIS IS THE ASSERTION THE WHOLE
 *      LAYOUT EXISTS FOR, and it is harder here than on any other canvas in
 *      the repo because there are TWO text columns whose heights are solved
 *      independently and then reconciled. The boxes are rebuilt HERE from the
 *      wrapped line counts rather than taken from the layout's own `y0`/`y1`,
 *      so a layout that both places and measures against a wrong height
 *      cannot pass by agreeing with itself.
 *   2. THE SPINE'S ORDER IS DECLARATION ORDER. `states[i]` is below
 *      `states[i-1]`, always, and the ids come back in the file's own order.
 *      This is the property that makes the picture readable as elapsed time
 *      rather than as a graph layout — it is the whole difference from the
 *      flowchart, and it is the one a rank solver would quietly take away.
 *   3. A BRANCH NEVER CROSSES A STATE IT DOES NOT TOUCH. Every segment of
 *      every rejoin path is measured against every text box and every state's
 *      dot: the vertical run must sit in the reserved channel lane that
 *      nothing else may occupy, and the horizontal run into the spine must
 *      land in the GAP above its target rather than inside any state's box.
 *   4. THE HEIGHTS ARE DERIVED FROM THE CONTENT, proved by DIFFERENCE rather
 *      than by reading the code: a state with branches is measurably taller
 *      than one without, and a multi-line label taller than a one-line one. A
 *      fixed row pitch passes clause 1 and fails these — it is what separates
 *      "no collisions" from "not a grid".
 *   5. EVERYTHING IS INSIDE THE CANVAS, and the two text columns stay in
 *      their own lanes. Off-box coordinates are invisible rather than
 *      wrong-looking, which is how illustrations ship broken.
 *   6. THE WRAPPING IS REAL. Every drawn line must be an actual segment of
 *      its source string, and the lines rejoined must reproduce it — a layout
 *      that silently truncated a long label would pass every geometric
 *      assertion above while throwing away content.
 *   7. UNREACHABILITY AGREES WITH THE MODEL. A state after a final one is
 *      marked unreachable, and the boundary is the one
 *      `lifecycleReachableThrough` states — the canvas fades exactly what
 *      `validate_lifecycle` reports, or the two halves disagree about the
 *      same document.
 *   8. IT IS TOTAL. An empty document, a document whose exit names a state
 *      that is not there, and a single one-character state all produce a
 *      layout rather than throwing, because the canvas's contract is that it
 *      draws whatever parsed — and the MCP tools and hand-built models reach
 *      it without going through the parser's refusals.
 *
 * Exits non-zero on any failure. Run with: pnpm check:lifecycle-layout
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { registerTsResolution } from "./lib/resolve-ts.mjs";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const load = registerTsResolution(ROOT);

const { parseLifecycleText } = await load("src/features/archtext/index.ts");
const { layoutLifecycle, lifecycleHitRegions, LIFECYCLE, LIFECYCLE_FRAME_PAD } =
  await load("src/features/lifecycle/lib/layout.ts");
const { LIFECYCLE_EXAMPLE } = await load(
  "src/features/lifecycle/input/example.ts",
);
const { listLifecycleExampleIds, loadLifecycleExample } = await load(
  "src/features/lifecycle/service/example-service.ts",
);
const { lifecycleReachableThrough } = await load("src/types/lifecycle.ts");
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

const seedFile = parseLifecycleText(LIFECYCLE_EXAMPLE);
const seed = layoutLifecycle(seedFile);

/* EVERY REGISTERED EXAMPLE, not only the seed, and derived from the registry
   so a third example is covered the day it is added rather than the day
   somebody remembers to list it here (`codebase.md`: a hardcoded list cannot
   notice the thing it has never heard of). */
const ALL = [
  ["seed", seedFile, seed],
  ...listLifecycleExampleIds().map((id) => {
    const example = loadLifecycleExample(id);
    return [
      id,
      example.status === "ok" ? example.file : null,
      example.status === "ok" ? layoutLifecycle(example.file) : null,
    ];
  }),
].filter(([, , value]) => value !== null);

check(
  `every bundled document lays out (${ALL.length} documents, from the registry)`,
  ALL.length >= 3,
  `only ${ALL.length} laid out — a registered example failed to parse`,
);

/* ----------------------------------------------------------------------- */
/* The boxes text really occupies — rebuilt, never trusted                  */
/* ----------------------------------------------------------------------- */

/**
 * Every drawn run of text on a canvas, as a rectangle, computed from the LINE
 * COUNTS and the type metrics rather than read off any `y0`/`y1`.
 *
 * REBUILT ON PURPOSE, which is clause 1's whole point: if this read the
 * layout's own boxes, a layout that placed elements by one rule and sized them
 * by another would agree with itself and pass. Vertical extents are baseline
 * minus the font size to baseline plus a descender — deliberately GENEROUS, so
 * a near-miss counts as a collision.
 *
 * The two columns are distinguished by their x range, because that is what
 * makes the non-collision claim non-trivial: state text lives right of the
 * spine and exit text left of it, so a bug that put one in the other's lane
 * shows up here as an overlap rather than as a silently different picture.
 */
function textBoxes(layout) {
  const boxes = [];
  const rightRun = (lines, firstBaseline, lineHeight, size, what) => {
    if (lines.length === 0) return;
    const width = Math.max(
      ...lines.map((line) => line.length * size * CHAR_WIDTH_RATIO),
    );
    boxes.push({
      what,
      x0: LIFECYCLE.stateLabelX,
      x1: LIFECYCLE.stateLabelX + width,
      y0: firstBaseline - size,
      y1: firstBaseline + (lines.length - 1) * lineHeight + size * 0.3,
    });
  };
  const leftRun = (lines, firstBaseline, lineHeight, size, what) => {
    if (lines.length === 0) return;
    const width = Math.max(
      ...lines.map((line) => line.length * size * CHAR_WIDTH_RATIO),
    );
    boxes.push({
      what,
      x0: LIFECYCLE.branchTextRight - width,
      x1: LIFECYCLE.branchTextRight,
      y0: firstBaseline - size,
      y1: firstBaseline + (lines.length - 1) * lineHeight + size * 0.3,
    });
  };

  rightRun(
    layout.subject.labelLines,
    layout.subject.labelY,
    LIFECYCLE.subjectLineHeight,
    LIFECYCLE.subjectSize,
    "subject",
  );
  if (layout.subject.descY !== null) {
    rightRun(
      layout.subject.descriptionLines,
      layout.subject.descY,
      LIFECYCLE.subjectDescLineHeight,
      LIFECYCLE.subjectDescSize,
      "subject note",
    );
  }
  for (const state of layout.states) {
    rightRun(
      state.labelLines,
      state.labelY,
      LIFECYCLE.stateLineHeight,
      LIFECYCLE.stateSize,
      `state ${state.id}`,
    );
    if (state.descY !== null) {
      rightRun(
        state.descriptionLines,
        state.descY,
        LIFECYCLE.stateDescLineHeight,
        LIFECYCLE.stateDescSize,
        `state ${state.id} note`,
      );
    }
  }
  for (const exit of layout.exits) {
    leftRun(
      exit.labelLines,
      exit.labelY,
      LIFECYCLE.exitLineHeight,
      LIFECYCLE.exitSize,
      `exit ${exit.key} label`,
    );
    if (exit.whenY !== null) {
      leftRun(
        exit.whenLines,
        exit.whenY,
        LIFECYCLE.whenLineHeight,
        LIFECYCLE.whenSize,
        `exit ${exit.key} when`,
      );
    }
    if (exit.descY !== null) {
      leftRun(
        exit.descriptionLines,
        exit.descY,
        LIFECYCLE.whenLineHeight,
        LIFECYCLE.whenSize,
        `exit ${exit.key} note`,
      );
    }
  }
  return boxes;
}

const overlaps = (a, b) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/* ----------------------------------------------------------------------- */
/* 1. Nothing collides                                                      */
/* ----------------------------------------------------------------------- */

console.log("nothing collides (the assertion the layout exists for)");

for (const [name, , layout] of ALL) {
  const boxes = textBoxes(layout);
  const clashes = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      if (overlaps(boxes[i], boxes[j])) {
        clashes.push(`${boxes[i].what} × ${boxes[j].what}`);
      }
    }
  }
  check(
    `${name}: no two labels overlap, at the wrapping they actually get (${boxes.length} runs)`,
    clashes.length === 0,
    clashes.join("; "),
  );
}

/* THE ADVERSARIAL DOCUMENT, which the bundled examples cannot supply: long
   labels beside one-word ones, a state carrying three branches, two branches
   returning to the SAME state, and a return that travels the length of the
   document. A fixed row pitch passes on the bundled documents and fails here,
   which is the point of writing it. */
console.log("nothing collides on a document built to break a grid");

const ADVERSARIAL_TEXT = `archlab 1.0 lifecycle
title "Adversarial"

@lifecycle
  subject "${"A subject with a very long name ".repeat(3).trim()}"
    desc "${"note ".repeat(40).trim()}"
  state a "A"
  state b "${"word ".repeat(30).trim()}"
    desc "${"note ".repeat(50).trim()}"
    exit "${"outcome ".repeat(6).trim()}" ends
      when "${"because ".repeat(20).trim()}"
    exit "Short" ends
    exit "Back to A" rejoins a
      when "${"because ".repeat(10).trim()}"
  state c "C"
  state d "D"
    exit "Also back to A" rejoins a
      when "it happens twice"
    exit "Back to C" rejoins c
  state e "E" ends
`;
const ADVERSARIAL_FILE = parseLifecycleText(ADVERSARIAL_TEXT);
const ADVERSARIAL = layoutLifecycle(ADVERSARIAL_FILE);

{
  const boxes = textBoxes(ADVERSARIAL);
  const clashes = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      if (overlaps(boxes[i], boxes[j])) {
        clashes.push(`${boxes[i].what} × ${boxes[j].what}`);
      }
    }
  }
  check(
    "a document of long labels, three branches on one state and two returns to one target collides nowhere",
    clashes.length === 0,
    clashes.join("; "),
  );
  check(
    "and the long labels really did wrap — the case is not passing vacuously",
    ADVERSARIAL.states.some((state) => state.labelLines.length >= 3) &&
      ADVERSARIAL.exits.some((exit) => exit.whenLines.length >= 3),
    "nothing wrapped far enough for this document to be exercising the collision case",
  );
}

const MEASURED = [...ALL, ["adversarial", ADVERSARIAL_FILE, ADVERSARIAL]];

/* ----------------------------------------------------------------------- */
/* 2. The spine's order IS the declaration order                            */
/* ----------------------------------------------------------------------- */

console.log("the spine's order is the declaration order (not a rank solver)");

for (const [name, file, layout] of MEASURED) {
  check(
    `${name}: the laid-out ids are the file's ids, in the file's order`,
    JSON.stringify(layout.states.map((state) => state.id)) ===
      JSON.stringify(file.states.map((state) => state.id)),
    `${layout.states.map((s) => s.id).join(",")} vs ${file.states.map((s) => s.id).join(",")}`,
  );
  const descending = layout.states.filter(
    (state, index) => index > 0 && state.dotY <= layout.states[index - 1].dotY,
  );
  check(
    `${name}: every state's dot sits strictly below the one before it`,
    descending.length === 0,
    `${descending.map((s) => s.id).join(", ")} — a state that did not advance down the page would break the reading of the picture as elapsed time`,
  );
  check(
    `${name}: every dot is on the spine's own x, and the spine is clipped to them`,
    layout.spineX === LIFECYCLE.spineX &&
      layout.spineY0 === layout.states[0].dotY &&
      layout.spineY1 === layout.states[layout.states.length - 1].dotY,
    `spine ${layout.spineY0}–${layout.spineY1}, dots ${layout.states[0]?.dotY}–${layout.states[layout.states.length - 1]?.dotY}`,
  );
}

/* ----------------------------------------------------------------------- */
/* 3. A branch never crosses a state it does not touch                      */
/* ----------------------------------------------------------------------- */

console.log("a returning branch crosses nothing it does not touch");

for (const [name, , layout] of MEASURED) {
  const returns = layout.exits.filter((exit) => exit.rejoinPath !== null);
  if (returns.length === 0) {
    check(`${name}: has no returning branch to measure`, true);
    continue;
  }

  const boxes = textBoxes(layout);

  /* THE CHANNEL IS EMPTY, which is what makes the whole claim possible: the
     vertical leg travels in a lane the layout reserves, so it cannot enter any
     text box in either column. Asserted against the boxes rather than against
     `LIFECYCLE.branchTextLeft`, so a layout that moved a column into the lane
     fails here rather than passing on a constant that no longer describes it. */
  const inLane = boxes.filter((box) => box.x0 <= LIFECYCLE.channelLaneRight);
  check(
    `${name}: nothing is drawn in the reserved channel lane`,
    inLane.length === 0,
    `${inLane.map((box) => box.what).join(", ")} reaches x=${Math.min(...inLane.map((b) => b.x0))}, inside the lane that ends at ${LIFECYCLE.channelLaneRight}`,
  );

  const channels = returns.map((exit) => exit.rejoinPath.channelX);
  check(
    `${name}: every return has its own channel (${channels.length} of them)`,
    new Set(channels).size === channels.length &&
      channels.every(
        (x) => x >= LIFECYCLE.channelX0 && x <= LIFECYCLE.channelLaneRight,
      ),
    `channels ${channels.join(", ")} — two returns sharing one column would draw over each other`,
  );

  /* THE HORIZONTAL LEG INTO THE SPINE lands in the GAP above its target, never
     inside a state's box. Measured against every state's own [y0, y1] — and
     exits live inside their state's box by construction, so clearing the
     states clears the branch lane too. */
  const byId = new Map(layout.states.map((state) => [state.id, state]));
  const crossings = [];
  for (const exit of returns) {
    const path = exit.rejoinPath;
    /* THE FIRST STATE IS THE ONE EXEMPTION, and it is forced rather than
       granted: the "gap above" the first state is the air under the subject,
       which is off the top of the spine, so a join placed there points into
       blank canvas. The layout clamps that one join down onto the spine's
       start — which is the first state's own dot, and therefore inside the
       first state's own BOX. Both rules below would fire on it.

       The exemption is written against the target's IDENTITY, never against a
       y tolerance, so a join that drifts onto any other dot still fails. And
       the box rule is not simply waived for it: that rectangle spans both
       columns and is mostly empty at the dot's height, so the leg is measured
       against the real INK instead, below — a stricter test than the one being
       skipped, not a looser one. */
    const targetIsFirst = path.targetId === layout.states[0]?.id;
    for (const state of layout.states) {
      const isTargetsOwnBox = targetIsFirst && state.id === path.targetId;
      if (!isTargetsOwnBox && path.joinY > state.y0 && path.joinY < state.y1) {
        crossings.push(
          `${exit.key} joins at y=${path.joinY.toFixed(1)}, inside ${state.id} (${state.y0.toFixed(1)}–${state.y1.toFixed(1)})`,
        );
      }
    }
    if (targetIsFirst) {
      for (const box of boxes) {
        if (
          path.joinY > box.y0 &&
          path.joinY < box.y1 &&
          box.x1 > path.channelX &&
          box.x0 < layout.spineX
        ) {
          crossings.push(
            `${exit.key} joins at y=${path.joinY.toFixed(1)}, through ${box.what}`,
          );
        }
      }
    }
    const target = byId.get(path.targetId);
    if (target !== undefined && !targetIsFirst && path.joinY >= target.y0) {
      crossings.push(
        `${exit.key} joins at y=${path.joinY.toFixed(1)}, at or below its target ${target.id}'s top (${target.y0.toFixed(1)})`,
      );
    }
  }
  check(
    `${name}: every return meets the spine in a gap, above the state it rejoins`,
    crossings.length === 0,
    crossings.join("; "),
  );

  /* AND THE PLACE IT MEETS IS ON THE LINE. This is the assertion the rule
     above only LOOKED like it was making, and the gap between the two shipped:
     a rejoin to the first state was placed in the gap under the subject, which
     is above the spine's own start, so its arrowhead pointed into blank canvas
     about 23 units clear of anything. Every lifecycle check passed — "above
     the target's top" was true, and nothing asked whether the target's top was
     on the track. The starter document rejoins its first state, so this was
     the first lifecycle most readers ever saw. */
  const offSpine = returns.filter(
    (exit) =>
      exit.rejoinPath.joinY < layout.spineY0 - 0.001 ||
      exit.rejoinPath.joinY > layout.spineY1 + 0.001,
  );
  check(
    `${name}: every return's arrowhead lands on the spine, not past its end`,
    offSpine.length === 0,
    offSpine
      .map(
        (exit) =>
          `${exit.key} points at y=${exit.rejoinPath.joinY.toFixed(1)}, outside the spine (${layout.spineY0.toFixed(1)}–${layout.spineY1.toFixed(1)})`,
      )
      .join("; "),
  );

  /* THE DEPARTURE LEG runs left from the exit's own dot at a y BELOW that
     exit's text — running it beside the dot would cross the exit's own label,
     which is right-aligned in the lane the branch has to travel through. */
  const departureClashes = [];
  for (const exit of returns) {
    const path = exit.rejoinPath;
    if (path.departY <= exit.y1) {
      departureClashes.push(
        `${exit.key} leaves at y=${path.departY.toFixed(1)}, inside its own box (ends ${exit.y1.toFixed(1)})`,
      );
    }
    for (const box of boxes) {
      if (
        path.departY > box.y0 &&
        path.departY < box.y1 &&
        box.x1 > path.channelX &&
        box.x0 < LIFECYCLE.branchDotX
      ) {
        departureClashes.push(
          `${exit.key} leaves at y=${path.departY.toFixed(1)}, through ${box.what}`,
        );
      }
    }
  }
  check(
    `${name}: every return leaves below its own text, through no other run`,
    departureClashes.length === 0,
    departureClashes.join("; "),
  );

  /* AND IT NEVER TOUCHES A DOT IT IS NOT AIMED AT. The vertical leg is in the
     empty lane, so this is really about the horizontal legs: neither may pass
     through a state's dot. */
  const dotHits = [];
  for (const exit of returns) {
    const path = exit.rejoinPath;
    for (const state of layout.states) {
      const nearDot = Math.abs(state.dotY - path.joinY) < LIFECYCLE.dotRadius;
      if (nearDot && state.id !== path.targetId) {
        dotHits.push(`${exit.key} passes through ${state.id}'s dot`);
      }
      if (Math.abs(state.dotY - path.departY) < LIFECYCLE.dotRadius) {
        dotHits.push(`${exit.key} departs through ${state.id}'s dot`);
      }
    }
  }
  check(
    `${name}: no return runs through a state's dot`,
    dotHits.length === 0,
    dotHits.join("; "),
  );
}

/* ----------------------------------------------------------------------- */
/* 4. The heights come from the content, not a pitch                        */
/* ----------------------------------------------------------------------- */

console.log(
  "the heights come from the content (this is what makes it not a grid)",
);

{
  const height = (state) => state.y1 - state.y0;
  const plain = ADVERSARIAL.states.find((state) => state.id === "a");
  const branched = ADVERSARIAL.states.find((state) => state.id === "b");
  const twoBranches = ADVERSARIAL.states.find((state) => state.id === "d");

  check(
    "a state with branches is taller than one without",
    plain !== undefined &&
      branched !== undefined &&
      height(branched) > height(plain),
    plain === undefined || branched === undefined
      ? "the fixture does not contain both shapes"
      : `${height(branched).toFixed(1)} vs ${height(plain).toFixed(1)}`,
  );
  check(
    "a state with two branches is taller than one with none",
    twoBranches !== undefined &&
      plain !== undefined &&
      height(twoBranches) > height(plain),
    twoBranches === undefined
      ? "the fixture has no two-branch state"
      : `${height(twoBranches).toFixed(1)} vs ${height(plain).toFixed(1)}`,
  );

  /* THE SAME CLAIM STATED AS A NEGATIVE, because it is the one a grid would
     satisfy: the set of state heights must not be a single value. A layout
     with a row pitch produces one number however much each state holds. */
  const distinct = new Set(
    ADVERSARIAL.states.map((state) => Math.round(height(state))),
  );
  check(
    "state heights are not all one number — a row pitch would make them so",
    distinct.size >= 3,
    `only ${distinct.size} distinct height(s): ${[...distinct].join(", ")}`,
  );

  const exitHeights = new Set(
    ADVERSARIAL.exits.map((exit) => Math.round(exit.y1 - exit.y0)),
  );
  check(
    "and neither are the exit heights — each is solved from its own text",
    exitHeights.size >= 2,
    `only ${exitHeights.size} distinct exit height(s)`,
  );
}

/* ----------------------------------------------------------------------- */
/* 5. Everything is inside the canvas, and in its own lane                  */
/* ----------------------------------------------------------------------- */

console.log("everything is inside the canvas, and in its own lane");

for (const [name, , layout] of MEASURED) {
  const outside = [];
  for (const box of textBoxes(layout)) {
    if (box.x0 < 0 || box.x1 > layout.width) {
      outside.push(
        `${box.what} spans x ${box.x0.toFixed(0)}–${box.x1.toFixed(0)}`,
      );
    }
    if (box.y0 < 0 || box.y1 > layout.height) {
      outside.push(
        `${box.what} spans y ${box.y0.toFixed(0)}–${box.y1.toFixed(0)}`,
      );
    }
  }
  for (const state of layout.states) {
    if (state.dotY < 0 || state.dotY > layout.height) {
      outside.push(`${state.id} dot at y=${state.dotY.toFixed(1)}`);
    }
  }
  for (const exit of layout.exits) {
    if (exit.dotY < 0 || exit.dotY > layout.height) {
      outside.push(`exit ${exit.key} dot at y=${exit.dotY.toFixed(1)}`);
    }
  }
  check(
    `${name}: every box, dot and baseline is inside the canvas`,
    outside.length === 0,
    outside.join("; "),
  );

  /* THE TWO COLUMNS STAY ON THEIR OWN SIDES OF THE SPINE, which is the
     picture's grammar rather than a tidiness rule: everything right of the
     line is where the subject goes, everything left of it is where it stops
     going, and a run that crossed would make that sentence false. */
  const strayed = textBoxes(layout).filter((box) =>
    box.what.startsWith("exit")
      ? box.x1 > layout.spineX
      : box.x0 < layout.spineX,
  );
  check(
    `${name}: state text stays right of the spine and exit text left of it`,
    strayed.length === 0,
    strayed.map((box) => box.what).join(", "),
  );
}

/* THE MEASURE IS ACTUALLY HONOURED, which is a different claim from "inside
   the canvas": a wrap that overshot its column by a little would still fit the
   1040-unit box and would still be wrong, because the measure is what makes
   the text readable rather than what makes it fit. */
{
  const over = [];
  for (const [name, , layout] of MEASURED) {
    const widest = (line, size) => line.length * size * CHAR_WIDTH_RATIO;
    for (const state of layout.states) {
      for (const line of state.labelLines) {
        if (
          widest(line, LIFECYCLE.stateSize) >
          LIFECYCLE.stateLabelWidth + 0.5
        ) {
          over.push(`${name}/${state.id} label`);
        }
      }
    }
    const branchMeasure =
      LIFECYCLE.branchTextRight - LIFECYCLE.branchTextLeft + 0.5;
    for (const exit of layout.exits) {
      for (const line of exit.labelLines) {
        if (widest(line, LIFECYCLE.exitSize) > branchMeasure) {
          over.push(`${name}/${exit.key} label`);
        }
      }
      for (const line of exit.whenLines) {
        if (widest(line, LIFECYCLE.whenSize) > branchMeasure) {
          over.push(`${name}/${exit.key} when`);
        }
      }
    }
  }
  check(
    "no wrapped line exceeds the measure its own column wraps to",
    over.length === 0,
    over.join("; "),
  );
}

/* ----------------------------------------------------------------------- */
/* 6. The wrapping is real, not a truncation                                */
/* ----------------------------------------------------------------------- */

console.log("every label is drawn in full");

{
  const lost = [];
  const same = (lines, source) =>
    lines.join(" ").replace(/\s+/g, " ").trim() ===
    source.replace(/\s+/g, " ").trim();
  for (const [name, file, layout] of MEASURED) {
    if (!same(layout.subject.labelLines, file.subject.label)) {
      lost.push(`${name}/subject`);
    }
    for (const state of layout.states) {
      if (!same(state.labelLines, state.label))
        lost.push(`${name}/${state.id}`);
    }
    for (const exit of layout.exits) {
      if (!same(exit.labelLines, exit.label)) lost.push(`${name}/${exit.key}`);
    }
  }
  check(
    "the drawn lines rejoin to their source exactly — nothing is truncated",
    lost.length === 0,
    lost.join(", "),
  );
}

/* ----------------------------------------------------------------------- */
/* 7. Unreachability agrees with the model                                  */
/* ----------------------------------------------------------------------- */

console.log("the canvas fades exactly what the validator reports");

{
  const STRANDED = parseLifecycleText(`archlab 1.0 lifecycle
title "Stranded"

@lifecycle
  subject "Thing"
  state a "A"
  state b "B" ends
  state c "C"
  state d "D"
`);
  const layout = layoutLifecycle(STRANDED);
  const through = lifecycleReachableThrough(STRANDED);
  const wrong = layout.states.filter(
    (state, index) => state.reachable !== index <= through,
  );
  check(
    "a state after a final one is drawn unreachable, on the model's own boundary",
    wrong.length === 0 && through === 1,
    `boundary ${through}; disagreeing: ${wrong.map((s) => s.id).join(", ")}`,
  );
  check(
    "and every state in a document that ends at its last state is reachable",
    ALL.every(([, , value]) => value.states.every((state) => state.reachable)),
    "a bundled example is drawing states the subject cannot reach",
  );
}

/* ----------------------------------------------------------------------- */
/* 8. It is total                                                           */
/* ----------------------------------------------------------------------- */

console.log("the layout is total (the canvas draws whatever parsed)");

{
  /* Built in code rather than parsed: the grammar refuses a document with no
     states, but the MCP tools construct models directly, and a layout that
     threw here would take the whole page down rather than drawing an empty
     canvas. */
  const empty = layoutLifecycle({
    version: "1.0",
    kind: "lifecycle",
    metadata: { title: "Empty", createdAt: "", updatedAt: "" },
    subject: { label: "Nothing" },
    states: [],
  });
  check(
    "a document with no states lays out rather than throwing",
    empty.states.length === 0 && empty.height > 0,
    JSON.stringify(empty).slice(0, 200),
  );
  check(
    "and its spine collapses rather than running the canvas",
    empty.spineY0 === empty.spineY1,
    `${empty.spineY0}–${empty.spineY1}`,
  );

  /* THE DANGLING REJOIN, which the parser refuses and a hand-built model can
     still produce. Drawing a line to `undefined` would be worse than drawing a
     terminal branch, so the router leaves the path null rather than routing to
     nowhere. */
  const dangling = layoutLifecycle({
    version: "1.0",
    kind: "lifecycle",
    metadata: { title: "Dangling", createdAt: "", updatedAt: "" },
    subject: { label: "Thing" },
    states: [
      { id: "a", label: "A", exits: [{ label: "Back", rejoins: "ghost" }] },
    ],
  });
  check(
    "an exit naming a state that is not there gets no path rather than a route to nowhere",
    dangling.exits.length === 1 && dangling.exits[0].rejoinPath === null,
    JSON.stringify(dangling.exits[0]),
  );

  const oneChar = layoutLifecycle({
    version: "1.0",
    kind: "lifecycle",
    metadata: { title: "One", createdAt: "", updatedAt: "" },
    subject: { label: "x" },
    states: [{ id: "a", label: "x" }],
  });
  check(
    "a single one-character state still gets a box the focus ring fits in",
    oneChar.states[0].y1 - oneChar.states[0].dotY >= LIFECYCLE.ringRadius,
    `${(oneChar.states[0].y1 - oneChar.states[0].dotY).toFixed(1)} < ${LIFECYCLE.ringRadius}`,
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
   headings sit, on screen and in every exported file. The branch text and the returning channels run just as
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
    path.join(ROOT, "src/features/lifecycle/components/lifecycle-diagram.tsx"),
    "utf8",
  );
  const exportSrc = readFileSync(
    path.join(ROOT, "src/features/lifecycle/export/render-svg.ts"),
    "utf8",
  );
  check(
    `the surface holds the drawing with air on every side (${DIAGRAM_SURFACE_PAD} in, ${LIFECYCLE_FRAME_PAD - DIAGRAM_SURFACE_PAD} out)`,
    DIAGRAM_SURFACE_PAD > 0 && DIAGRAM_SURFACE_PAD < LIFECYCLE_FRAME_PAD,
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
    canvas.includes("${-LIFECYCLE_FRAME_PAD} ${-LIFECYCLE_FRAME_PAD}"),
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
console.log("a click lands on the ink, not on the row around it");

/* IT WAS THE WHOLE ROW — the full canvas width and the full height a state
   occupies — so the empty band left of the branch lane, the empty band right of
   the label and every gap between them selected that state. On this canvas the
   ink is a narrow column of dots, a column of words and a lane of exits; most
   of what a pointer crosses is the space around them. The gantt had the same
   defect and the same fix.

   MEASURED THROUGH THE FUNCTION THE CANVAS DRAWS WITH, which is why it lives in
   `lib/layout.ts`: a copy beside the element — in a file this script cannot
   parse at all — would mean checking a re-derivation and calling it the canvas.
   Two halves, each self-consistent, free to disagree. */
{
  const boxes = (d) =>
    [...d.matchAll(/M (-?[\d.]+) (-?[\d.]+) H (-?[\d.]+) V (-?[\d.]+)/g)].map(
      (m) => ({
        x0: Number(m[1]),
        y0: Number(m[2]),
        x1: Number(m[3]),
        y1: Number(m[4]),
      }),
    );

  let rowArea = 0;
  let hitArea = 0;
  const offCanvas = [];
  const missing = [];
  for (const [name, , layout] of ALL) {
    for (const state of layout.states) {
      const exits = layout.exits.filter((exit) => exit.from === state.id);
      const regions = boxes(lifecycleHitRegions(state, exits));
      rowArea += LIFECYCLE.width * Math.max(1, state.y1 - state.y0);
      for (const box of regions) {
        hitArea += (box.x1 - box.x0) * (box.y1 - box.y0);
        if (box.x0 < 0 || box.x1 > LIFECYCLE.width) {
          offCanvas.push(
            `${name}/${state.id}: ${box.x0.toFixed(1)}–${box.x1.toFixed(1)}`,
          );
        }
      }
      /* ONE REGION FOR THE STATE AND ONE PER WAY OUT. Fewer means a way out
         stopped being clickable and nothing else would say so — the exits sit
         far off to the left and belong to this state's focus group, which is
         what the full-row target used to give for free. */
      if (regions.length !== exits.length + 1) {
        missing.push(
          `${name}/${state.id}: ${regions.length} region(s), want ${exits.length + 1}`,
        );
      }
      /* THE DOT AND ITS WORDS ARE ONE BOX. A 6.5-unit dot is not a target on
         its own, and the run of spine between it and the label is a hole a
         pointer would fall through if they were separate. */
      const stateBox = regions[0];
      if (
        stateBox !== undefined &&
        (stateBox.x0 > LIFECYCLE.spineX || stateBox.x1 < LIFECYCLE.stateLabelX)
      ) {
        missing.push(
          `${name}/${state.id}: its box ${stateBox.x0.toFixed(1)}–${stateBox.x1.toFixed(1)} misses the dot at ${LIFECYCLE.spineX} or the label at ${LIFECYCLE.stateLabelX}`,
        );
      }
    }
  }

  const share = hitArea / rowArea;
  check(
    `the clickable area is a fraction of the row (${(share * 100).toFixed(1)}%)`,
    share < 0.5,
    `${(share * 100).toFixed(1)}% — the empty canvas around the ink is a target again, and every near-miss selects a state`,
  );
  check(
    `every state keeps a region for itself and one per way out (${missing.length} exception(s))`,
    missing.length === 0,
    missing.slice(0, 3).join("; "),
  );
  check(
    "no region runs off the canvas",
    offCanvas.length === 0,
    `${offCanvas.slice(0, 3).join("; ")} — a target outside the viewBox cannot be clicked`,
  );
}

/* ----------------------------------------------------------------------- */

console.log("");
if (failures > 0) {
  console.error(`${failures} of ${assertions} assertions failed.`);
  process.exit(1);
}
console.log(`All ${assertions} assertions passed.`);

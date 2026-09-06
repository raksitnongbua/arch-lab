#!/usr/bin/env node
/**
 * PRESENTATION FIT check — the arithmetic behind "will this read on a slide?".
 *
 * A diagram wider than the frame it is shown in is not cropped, it is SHRUNK,
 * and its labels shrink with it — so a diagram that reads perfectly at the size
 * its author is looking at can be unreadable in the deck it was drawn for. This
 * is the one question the author cannot answer by looking at their own screen,
 * and `purpose.md` calls presentation the product.
 *
 * WHAT THIS PINS THAT NOTHING ELSE CAN. `SMALLEST_TYPE_PX` is a hand-maintained
 * twin of the exporter's own `metaSize`, and it has to be: the exporter is
 * React-adjacent and cannot be loaded by a check script, while this arithmetic
 * has to be. `dry.md` allows that only when a `check:*` script pins the pair —
 * so the exporter's literal is read out of its source here. If someone changes
 * the export's smallest type, the floor stops describing the file that ships and
 * this fails.
 *
 * Run with: pnpm check:presentation-fit
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
  DEFAULT_PRESENTATION_FRAME,
  LEGIBLE_FLOOR_PX,
  PRESENTATION_FRAMES,
  SMALLEST_TYPE_PX,
  legibleHeightLimit,
  legibleWidthLimit,
  presentationFit,
  presentationWarning,
} = await load("src/lib/presentation-fit.ts");

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

console.log("\n1. The floor describes the file that actually ships");

check("SMALLEST_TYPE_PX is the exporter's own smallest type", () => {
  /* THE HAND-MAINTAINED TWIN. The C4 exporter draws a node's meta line — the
     technology, the `[Go 1.22]` — at `metaSize`, and that is the smallest thing
     in the file. This module cannot import it (the exporter reaches React, and
     type stripping cannot follow that), so the number is restated and pinned
     here instead, which is the arrangement `dry.md` permits. */
  const exporter = read("src/features/viewer/export/render-svg.ts");
  const match = /const metaSize = (\d+);/.exec(exporter);
  assert.ok(match, "the exporter's metaSize is no longer a plain literal");
  assert.equal(
    Number(match[1]),
    SMALLEST_TYPE_PX,
    `the export draws its smallest type at ${match[1]}px and this module ` +
      `measures ${SMALLEST_TYPE_PX}px — the legibility floor is describing a ` +
      "file that does not exist",
  );
});

console.log("\n2. Fitting");

check("a diagram smaller than its frame is left alone", () => {
  /* NEVER SCALED UP. Enlarging would report a legibility that depends on a
     viewer choosing to zoom, and every surface that does this fitting leaves a
     small figure at its own size. */
  const fit = presentationFit(400, 300);
  assert.equal(fit.scale, 1);
  assert.equal(fit.smallestTypePx, SMALLEST_TYPE_PX);
  assert.ok(fit.legible);
});

check("the tighter axis decides the fit", () => {
  const frame = DEFAULT_PRESENTATION_FRAME;
  // Short and very wide: width binds.
  const wide = presentationFit(frame.width * 4, 10, frame);
  assert.ok(Math.abs(wide.scale - 0.25) < 1e-9, `scale ${wide.scale}`);
  // Narrow and very tall: height binds.
  const tall = presentationFit(10, frame.height * 4, frame);
  assert.ok(Math.abs(tall.scale - 0.25) < 1e-9, `scale ${tall.scale}`);
});

check("the floor is the number the warning quotes", () => {
  /* Otherwise the advice could tell an author to clear a bar the code does not
     measure against — the two are one fact and are read from one constant. */
  const frame = DEFAULT_PRESENTATION_FRAME;
  const warning = presentationWarning(frame.width * 3, 10, frame);
  assert.match(
    warning,
    new RegExp(`under the ${LEGIBLE_FLOOR_PX}px`),
    `the warning does not quote LEGIBLE_FLOOR_PX (${LEGIBLE_FLOOR_PX})`,
  );
});

check("the limit and the verdict agree, exactly at the boundary", () => {
  /* A limit that disagreed with the check by a pixel would be an author told
     to keep it under a width that is still refused. */
  for (const frame of PRESENTATION_FRAMES) {
    const limit = legibleWidthLimit(frame);
    assert.ok(
      presentationFit(limit, 1, frame).legible,
      `${frame.id}: ${limit}px is the advertised limit and is not legible`,
    );
    assert.ok(
      !presentationFit(limit + 40, 1, frame).legible,
      `${frame.id}: comfortably past the limit is still reported legible`,
    );
    const tallLimit = legibleHeightLimit(frame);
    assert.ok(
      presentationFit(1, tallLimit, frame).legible,
      `${frame.id}: the advertised height limit is not legible`,
    );
  }
});

console.log("\n3. What the author is told");

check("nothing is said when there is nothing to say", () => {
  /* A line that appears every time is a line that gets skipped, and this is
     reported beside a size the author already has. */
  assert.equal(presentationWarning(400, 300), null);
});

check("the warning names a target, not just a complaint", () => {
  const frame = DEFAULT_PRESENTATION_FRAME;
  const warning = presentationWarning(frame.width * 3, 400, frame);
  assert.ok(warning !== null, "an oversized diagram raised nothing");
  assert.match(
    warning,
    /shrunk to \d+%/,
    "it does not say how much it shrinks",
  );
  assert.match(
    warning,
    new RegExp(`${legibleWidthLimit(frame)}px wide`),
    "it does not name the width to aim for — 'it will be too small' is a " +
      "complaint, 'keep it under 1422px' is something to do",
  );
  assert.match(
    warning,
    /overview/,
    "it does not offer the other remedy, which is the one C4 is built for",
  );
});

check("a diagram over on HEIGHT is told about its height", () => {
  const frame = DEFAULT_PRESENTATION_FRAME;
  const warning = presentationWarning(200, frame.height * 3, frame);
  assert.ok(warning !== null);
  assert.match(
    warning,
    new RegExp(`${legibleHeightLimit(frame)}px tall`),
    "a tall diagram was told to shorten its width",
  );
});

console.log("\n4. The frames");

check("every frame is landscape, positive, and distinctly shaped", () => {
  const ratios = new Set();
  for (const frame of PRESENTATION_FRAMES) {
    assert.ok(frame.width > 0 && frame.height > 0, `${frame.id} is degenerate`);
    assert.ok(
      frame.width >= frame.height,
      `${frame.id} is portrait — every screen a diagram is presented on is ` +
        "landscape, which is the whole premise of the column-layout advice too",
    );
    /* The label has to slot into "shrunk to 41% to fit ___" — so what is
       asserted is that it DOES, not that it looks a particular way. The first
       version of this checked for a lowercase first letter and failed "A4
       landscape", which is a proper noun and perfectly good prose: the check
       was testing the spelling of the answer instead of the answer. */
    const sentence = presentationWarning(frame.width * 3, 10, frame);
    assert.ok(
      sentence !== null && sentence.includes(`to fit ${frame.label}`),
      `${frame.id}'s label does not read in the sentence it is written for`,
    );
    ratios.add((frame.width / frame.height).toFixed(2));
  }
  assert.equal(
    ratios.size,
    PRESENTATION_FRAMES.length,
    "two frames share an aspect ratio, so one of them can never change an " +
      "answer the other did not",
  );
});

check("the module stays loadable by a check script", () => {
  const source = read("src/lib/presentation-fit.ts");
  assert.doesNotMatch(
    source,
    /^import /m,
    "the module grew an import; if it reaches React every assertion above " +
      "stops running and reports a stack trace instead of a verdict",
  );
});

console.log(
  failures === 0
    ? `\nAll ${assertions} presentation-fit assertions passed.`
    : `\n${failures} of ${assertions} assertion(s) FAILED`,
);
process.exit(failures === 0 ? 0 : 1);

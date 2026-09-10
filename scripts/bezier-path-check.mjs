/**
 * Proves `lib/bezier-path.ts` draws exactly what `@xyflow/react`'s
 * `getBezierPath` draws.
 *
 * WHY THIS EXISTS. The connector curve moved off React Flow because that
 * export is client-only and `/api/render` has to draw a C4 model on the
 * server. Every C4 diagram on screen, in every exported SVG and PNG, and in
 * every share link's preview is drawn by this curve — so a reimplementation
 * that is merely CLOSE would silently redraw the entire product, and would do
 * it in the direction nobody looks at: a connector two pixels off is not a
 * failure anybody reports, it is a diagram that quietly stopped matching the
 * one in last month's deck.
 *
 * React Flow's function runs perfectly well in plain Node — only Next's
 * bundler objects to it — so the original is right here to compare against.
 * That is what makes this a MEASUREMENT rather than a restatement: nothing in
 * this file names an expected path, so it cannot pass by agreeing with a
 * hardcoded copy of the answer.
 *
 * STRINGS ARE COMPARED, NOT NUMBERS, deliberately. The path string is what
 * ships in the SVG, so formatting is part of the contract — a rounding change
 * or a stray space is a real difference in the file a reader downloads.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { getBezierPath, Position } from "@xyflow/react";

import { registerTsResolution } from "./lib/resolve-ts.mjs";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
registerTsResolution(ROOT);

const { bezierPath, DEFAULT_CURVATURE } = await import(
  path.join(ROOT, "src/lib/bezier-path.ts")
);

let failures = 0;
let compared = 0;

function check(label, condition, detail) {
  if (condition) return;
  failures += 1;
  console.error(
    `FAIL: ${label}${detail === undefined ? "" : `\n      ${detail}`}`,
  );
}

/* The four sides, paired every way round — 16 combinations, each of which
   takes a different arm of the control-point switch at both ends. */
const SIDES = [
  ["left", Position.Left],
  ["right", Position.Right],
  ["top", Position.Top],
  ["bottom", Position.Bottom],
];

/* Endpoint pairs chosen to hit BOTH arms of the control offset at both ends:
   a target below-right of the source makes the distances positive (the linear
   arm), and a target above-left makes them negative (the square-root arm,
   which is the one a naive reimplementation gets wrong). Zero-length and
   axis-aligned cases are in here because a degenerate line is where geometry
   usually breaks. */
const POINTS = [
  [0, 0, 120, 200],
  [0, 0, -120, -200],
  [300, 40, 40, 300],
  [-80, 250, 250, -80],
  [0, 0, 0, 0],
  [0, 0, 240, 0],
  [0, 0, 0, 240],
  [17.5, -3.25, 411.75, 96.5],
  [1000, 1000, 999, 1001],
];

for (const [sourceX, sourceY, targetX, targetY] of POINTS) {
  for (const [sourceSide, sourceEnum] of SIDES) {
    for (const [targetSide, targetEnum] of SIDES) {
      const [expectedPath, expectedLabelX, expectedLabelY] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition: sourceEnum,
        targetX,
        targetY,
        targetPosition: targetEnum,
      });
      const actual = bezierPath({
        sourceX,
        sourceY,
        sourcePosition: sourceSide,
        targetX,
        targetY,
        targetPosition: targetSide,
      });

      const where = `(${sourceX},${sourceY})${sourceSide} → (${targetX},${targetY})${targetSide}`;
      check(
        `path matches React Flow for ${where}`,
        actual.path === expectedPath,
        `react-flow: ${expectedPath}\n      ours:       ${actual.path}`,
      );
      check(
        `label point matches React Flow for ${where}`,
        actual.labelX === expectedLabelX && actual.labelY === expectedLabelY,
        `react-flow: ${expectedLabelX},${expectedLabelY}\n      ours:       ${actual.labelX},${actual.labelY}`,
      );
      compared += 1;
    }
  }
}

/* The default is not incidental — it is the number every existing diagram was
   drawn with, so it belongs in the comparison rather than only in a comment. */
check(
  "the curvature default is React Flow's own 0.25",
  DEFAULT_CURVATURE === 0.25,
  `DEFAULT_CURVATURE is ${DEFAULT_CURVATURE}`,
);

if (failures > 0) {
  console.error(`\n${failures} bezier assertion(s) failed.`);
  process.exit(1);
}

console.log(
  `bezier path matches @xyflow/react across ${compared} endpoint/side combinations`,
);

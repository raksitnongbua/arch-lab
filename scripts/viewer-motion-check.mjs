#!/usr/bin/env node
/**
 * C4 connector-motion check — the rules that keep a moving connector from
 * lying about what kind of relationship it is.
 *
 * BOTH OF THESE SHIPPED BROKEN, reported as "animation of c4 is broken, line
 * overlapped between animation and stable line", and neither was visible in a
 * diff because every individual value looked reasonable on its own:
 *
 *   1. THE OVERLAY WAS THE SAME WIDTH AS THE LINE IT RIDES. Base and drift
 *      were both `stroke-width: 1.5`, so each dash did not highlight the
 *      connector — it REPLACED it over its own length, and the round caps
 *      pushed half a stroke past that at both ends. A solid relationship came
 *      out as alternating patches of two colours: a broken line. The comment
 *      above the rule claimed the drift was "thinner than the base stroke",
 *      which is how the intent survived while the code stopped meeting it.
 *
 *   2. AN ASYNC EDGE WORE TWO DASH RHYTHMS AT ONCE. The base's `6 4` in user
 *      units and the overlay's `5 9` in pathLength-normalised units share no
 *      common period and never line up, so the travelling dashes landed half
 *      in the static gaps and half on the static dashes.
 *
 * Both fixes are RELATIONAL — "thinner than", "the same period as", "not on
 * top of" — so they are asserted as relations here rather than as the literal
 * numbers, which would pass just as happily after someone tunes one side.
 *
 * Run with: pnpm check:viewer-motion
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const canvas = read("src/features/viewer/components/viewer-canvas.tsx");
const edge = read("src/features/viewer/components/viewer-edge.tsx");
const constants = read("src/features/viewer/lib/canvas-constants.ts");
const frames = read("src/features/viewer/export/frames.ts");
const exportSvg = read("src/features/viewer/export/render-svg.ts");
const globals = read("src/app/globals.css");

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

/** `stroke-width` inside the first rule whose selector text contains `sel`. */
function widthIn(source, sel) {
  const rule = source.match(
    new RegExp(
      `${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`,
    ),
  );
  if (rule === null) return null;
  const width = rule[1].match(/stroke-width:\s*([\d.]+)/);
  return width === null ? null : Number(width[1]);
}

/* ---- 1. the overlay must stay UNDER the line it rides -------------------- */

check("the resting drift is strictly thinner than the base stroke", () => {
  const base = widthIn(canvas, ".viewer-canvas .viewer-edge-base");
  const drift = widthIn(canvas, ".viewer-canvas .viewer-edge-drift");
  assert.ok(base !== null && drift !== null, "a stroke-width is missing");
  assert.ok(
    drift < base,
    `drift ${drift} must be < base ${base}, or each dash replaces the ` +
      `connector instead of highlighting it and the line reads as broken`,
  );
});

check("the same holds while hovering, where both strokes thicken", () => {
  const base = widthIn(canvas, ".react-flow__edge:hover .viewer-edge-base");
  const drift = widthIn(canvas, ".react-flow__edge:hover .viewer-edge-drift");
  assert.ok(base !== null && drift !== null, "a hover stroke-width is missing");
  assert.ok(drift < base, `hover drift ${drift} must be < base ${base}`);
});

check("the drift paints with the shared token, not a second spelling", () => {
  assert.match(
    canvas,
    /\.viewer-canvas \.viewer-edge-drift \{[^}]*stroke: var\(--edge-drift\)/s,
  );
  assert.match(globals, /--edge-drift:/);
});

check("--edge-drift is defined in BOTH themes, or dark mode loses it", () => {
  const occurrences = globals.match(/--edge-drift:/g) ?? [];
  assert.equal(occurrences.length, 2, `found ${occurrences.length}, want 2`);
});

/* ---- 2. one dash rhythm per connector ------------------------------------ */

check("a dashed edge gets the march, never the overlay", () => {
  assert.match(edge, /const isDashed = data\?\.edge\.style === "dashed"/);
  assert.match(edge, /const showRestingDash = restingMotion && !isDashed/);
  assert.match(edge, /const showDashMarch = restingMotion && isDashed/);
});

check("the async dash is one shared constant, not three copies", () => {
  assert.match(constants, /export const EDGE_BASE_DASH_ON = 6/);
  assert.match(constants, /export const EDGE_BASE_DASH_OFF = 4/);
  // The edge draws it and the export re-emits it — both from the constant.
  assert.match(edge, /strokeDasharray: isDashed \? EDGE_BASE_DASH : undefined/);
  assert.match(exportSvg, /stroke-dasharray="\$\{EDGE_BASE_DASH\}"/);
  // Scoped to CONNECTORS. A boundary <rect> is also drawn `6 4`, and that is
  // a dashed receding box — a different thing that means something else and
  // must not be coupled to the relationship dash by a shared constant.
  const edgeEmit = exportSvg.match(/`<path class="af-export-edge"[^`]*`/);
  assert.ok(edgeEmit, "the exported edge path is not emitted where expected");
  assert.doesNotMatch(
    edgeEmit[0],
    /stroke-dasharray="[\d\s]+"/,
    "a hand-written copy of the async dash is back on the connector",
  );
});

check("the march steps exactly one period, or the loop seams", () => {
  const period = 6 + 4;
  const block = canvas.match(
    /@keyframes viewer-edge-dash-march \{([\s\S]*?)\n\}/,
  );
  assert.ok(block, "the march keyframes are missing");
  assert.match(block[1], /from \{ stroke-dashoffset: 0; \}/);
  assert.ok(
    block[1].includes("to { stroke-dashoffset: -${EDGE_BASE_DASH_PERIOD}; }"),
    `the step must be the constant, not a literal ${period}: ${block[1].trim()}`,
  );
});

/* ---- 3. the gate, and what reduced motion does with each --------------- */

check("the march is gated on the same attribute as the drift", () => {
  assert.match(
    canvas,
    /\[data-af-idle="on"\] \.viewer-canvas \.viewer-edge-base-marching \{\s*animation: viewer-edge-dash-march/s,
  );
});

check("reduced motion PARKS the march but REMOVES the overlay", () => {
  // Different treatments on purpose: a still dashed line is a meaningful
  // resting frame, a still overlay is a stray dash pattern that changes what
  // the connector says.
  const reduced = canvas.slice(canvas.indexOf("prefers-reduced-motion"));
  assert.match(
    reduced,
    /\.viewer-edge-base-marching[^}]*\{[^}]*animation: none;[^}]*stroke-dashoffset: 0;/s,
  );
  assert.match(reduced, /\.viewer-edge-drift[^{]*\{\s*display: none;/s);
});

/* ---- 4. the GIF must not turn a solid relationship dashed ---------------- */

check(
  "the animated export overlays solid edges instead of dashing them",
  () => {
    // Stamping the drift pattern onto the connector made every synchronous call
    // render as an asynchronous one — a GIF that misreports the architecture.
    assert.match(
      frames,
      /const drift = document_\.createElementNS\(SVG_NS, "path"\)/,
    );
    assert.match(frames, /edge\.after\(drift\)/);
    assert.doesNotMatch(
      frames,
      /edge\.setAttribute\("stroke-dasharray"/,
      "the exporter is writing a dash pattern onto the connector itself again",
    );
  },
);

check("the overlay is inserted AFTER the edge — SVG has no z-index", () => {
  assert.doesNotMatch(frames, /edge\.before\(drift\)/);
  assert.match(frames, /edge\.after\(drift\)/);
});

check("a dashed edge marches its own dash in the export too", () => {
  assert.match(frames, /getAttribute\("data-style"\) === "dashed"/);
  assert.match(frames, /const period = dashPeriodOf\(edge\)/);
  assert.match(
    exportSvg,
    /data-style="\$\{edge\.style === "dashed" \? "dashed" : "solid"\}"/,
  );
});

check("the export drift is thinner than the 1.5 stroke it rides", () => {
  const width = frames.match(/const DRIFT_WIDTH = ([\d.]+)/);
  assert.ok(width, "DRIFT_WIDTH is not declared");
  const emitted = exportSvg.match(
    /class="af-export-edge"[^`]*?stroke-width="([\d.]+)"/,
  );
  assert.ok(emitted, "the exported edge has no stroke-width");
  assert.ok(
    Number(width[1]) < Number(emitted[1]),
    `export drift ${width[1]} must be < edge ${emitted[1]}`,
  );
});

check("the export paints the drift with the canvas's resolved token", () => {
  assert.match(frames, /driftColor/);
  assert.match(read("src/features/viewer/export/theme.ts"), /edgeDrift/);
  assert.match(
    read("src/features/viewer/export/export-button.tsx"),
    /theme\.edgeDrift/,
  );
});

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} viewer-motion assertions passed.`);

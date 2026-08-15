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

/* ---- 1. the resting overlay must not blot out the line it rides --------- */

check("every resting band is a SINGLE travelling one, not a repeat", () => {
  // This is the fix for the reported bug, stated structurally. A repeating
  // pattern (dash + gap summing to less than the path) touches the whole line
  // at once; a band whose gap fills the remaining path is on the wire in one
  // place at a time, so the stroke underneath is never in question.
  const bands = [
    ...canvas.matchAll(
      /^\.viewer-canvas \.viewer-edge-rest-(glow|tail|head) \{([^}]*)\}/gm,
    ),
  ];
  assert.equal(bands.length, 3, `found ${bands.length} rest bands, want 3`);
  for (const [, name, body] of bands) {
    const dash = body.match(/stroke-dasharray:\s*([\d.]+)\s+([\d.]+)/);
    assert.ok(dash, `${name} has no dasharray`);
    const lit = Number(dash[1]);
    const gap = Number(dash[2]);
    assert.equal(
      lit + gap,
      100,
      `${name} must span the whole normalised path (pathLength=100), or the ` +
        `pattern repeats along the connector and covers it`,
    );
  }
});

check("the visible bands are no wider than the stroke they ride", () => {
  const base = widthIn(canvas, ".viewer-canvas .viewer-edge-base");
  assert.ok(base !== null, "the base stroke-width is missing");
  for (const name of ["tail", "head"]) {
    const width = widthIn(canvas, `.viewer-canvas .viewer-edge-rest-${name}`);
    assert.ok(width !== null, `${name} has no stroke-width`);
    assert.ok(
      width <= base,
      `${name} at ${width} is wider than the base ${base} — a band wider ` +
        `than its line reads as a break in the line`,
    );
  }
  // The halo is the one exception: it is wide ON PURPOSE and blurred, so it
  // never presents an edge that could be mistaken for the connector's own.
  const glow = canvas.match(/\.viewer-edge-rest-glow \{([^}]*)\}/);
  assert.ok(glow, "the glow band is missing");
  assert.match(glow[1], /filter: blur\(/, "a wide band must be blurred");
  const opacity = Number(glow[1].match(/opacity:\s*([\d.]+)/)?.[1] ?? 1);
  assert.ok(opacity < 0.25, `glow opacity ${opacity} is too solid for a halo`);
});

check(
  "the bands share one leading edge — each starts at its own lit length",
  () => {
    // Three bands whose keyframes did not agree would read as three lights
    // chasing each other rather than one comet with a trail.
    for (const name of ["glow", "tail", "head"]) {
      const rule = canvas.match(
        new RegExp(`\\.viewer-edge-rest-${name} \\{([^}]*)\\}`),
      );
      const lit = Number(rule[1].match(/stroke-dasharray:\s*([\d.]+)/)[1]);
      const frames_ = canvas.match(
        new RegExp(`@keyframes viewer-edge-rest-${name} \\{([\\s\\S]*?)\\n\\}`),
      );
      assert.ok(frames_, `${name} has no keyframes`);
      const from = Number(
        frames_[1].match(/from \{ stroke-dashoffset: (-?[\d.]+)/)[1],
      );
      const to = Number(
        frames_[1].match(/to \{ stroke-dashoffset: (-?[\d.]+)/)[1],
      );
      assert.equal(from, lit, `${name} must start at its lit length ${lit}`);
      assert.equal(
        to,
        lit - 100,
        `${name} must travel exactly one whole path, ending at ${lit - 100}`,
      );
    }
  },
);

check("resting motion stays subordinate to selection", () => {
  // If the resting comet matched the selected one, selecting an edge would
  // stop meaning anything.
  const motion = read("src/features/viewer/lib/motion.ts");
  const rest = Number(motion.match(/edgeRest: (\d+)/)[1]);
  const flow = Number(motion.match(/edgeFlow: (\d+)/)[1]);
  assert.ok(
    rest > flow * 2,
    `rest ${rest}ms must be far slower than ${flow}ms`,
  );
  const restHead = widthIn(canvas, ".viewer-canvas .viewer-edge-rest-head");
  const flowHead = widthIn(canvas, ".viewer-canvas .viewer-edge-flow-head");
  assert.ok(
    restHead < flowHead,
    `rest head ${restHead} must be thinner than the selected head ${flowHead}`,
  );
});

check("the stagger is derived from the edge id, never its index", () => {
  // An index-based delay re-staggers every connector whenever one is added.
  assert.match(edge, /function restPhaseMs\(edgeId: string/);
  assert.match(edge, /animationDelay: `-\$\{restDelayMs\}ms`/);
  assert.match(edge, /restPhaseMs\(id, VIEWER_DURATIONS\.edgeRest\)/);
});

check("the drift paints with the shared token, not a second spelling", () => {
  assert.match(
    canvas,
    /\.viewer-canvas \.viewer-edge-rest-tail \{[^}]*stroke: var\(--edge-drift\)/s,
  );
  assert.match(globals, /--edge-drift:/);
});

check("--edge-drift is defined in BOTH themes, or dark mode loses it", () => {
  const occurrences = globals.match(/--edge-drift:/g) ?? [];
  assert.equal(occurrences.length, 2, `found ${occurrences.length}, want 2`);
});

/* ---- 2. one dash rhythm per connector ------------------------------------ */

check("a dashed edge gets the march, never the comet", () => {
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
  assert.match(reduced, /\.viewer-edge-rest[^{]*\{\s*display: none;/s);
});

/* ---- 4. the GIF must not turn a solid relationship dashed ---------------- */

check(
  "the animated export overlays solid edges instead of dashing them",
  () => {
    // Stamping the drift pattern onto the connector made every synchronous call
    // render as an asynchronous one — a GIF that misreports the architecture.
    assert.match(frames, /document_\.createElementNS\(SVG_NS, "path"\)/);
    assert.match(frames, /anchor\.after\(path_\)/);
    assert.doesNotMatch(
      frames,
      /edge\.setAttribute\("stroke-dasharray"/,
      "the exporter is writing a dash pattern onto the connector itself again",
    );
  },
);

check("the overlay is inserted AFTER the edge — SVG has no z-index", () => {
  assert.doesNotMatch(frames, /\.before\(path_\)/);
  assert.match(frames, /anchor\.after\(path_\)/);
  // …and the bands go on halo-first, head-last, for the same reason.
  const bands = frames.match(/const REST_BANDS = \[([\s\S]*?)\] as const;/);
  assert.ok(bands, "REST_BANDS is not declared");
  const widths = [...bands[1].matchAll(/width: ([\d.]+)/g)].map((m) =>
    Number(m[1]),
  );
  assert.equal(widths.length, 3, "want three bands");
  assert.ok(widths[0] > widths[2] || widths[0] >= widths[1], "halo goes first");
});

check("a dashed edge marches its own dash in the export too", () => {
  assert.match(frames, /getAttribute\("data-style"\) === "dashed"/);
  assert.match(frames, /const period = dashPeriodOf\(edge\)/);
  assert.match(
    exportSvg,
    /data-style="\$\{edge\.style === "dashed" \? "dashed" : "solid"\}"/,
  );
});

check("the exported bands mirror the canvas's, value for value", () => {
  // The GIF and the page are two renderers of one look; the moment their band
  // tables disagree the loop stops being a record of what the reader saw.
  const bands = frames.match(/const REST_BANDS = \[([\s\S]*?)\] as const;/);
  assert.ok(bands, "REST_BANDS is not declared");
  const exported = [
    ...bands[1].matchAll(/lit: ([\d.]+), width: ([\d.]+)/g),
  ].map((m) => `${m[1]}/${m[2]}`);
  const onScreen = ["glow", "tail", "head"].map((name) => {
    const rule = canvas.match(
      new RegExp(`\\.viewer-edge-rest-${name} \\{([^}]*)\\}`),
    );
    const lit = rule[1].match(/stroke-dasharray:\s*([\d.]+)/)[1];
    const width = rule[1].match(/stroke-width:\s*([\d.]+)/)[1];
    return `${lit}/${width}`;
  });
  assert.deepEqual(exported, onScreen);
});

check("the export paints the drift with the canvas's resolved token", () => {
  assert.match(frames, /driftColor/);
  assert.match(frames, /primaryColor/);
  const theme = read("src/features/viewer/export/theme.ts");
  assert.match(theme, /edgeDrift/);
  assert.match(theme, /primary: "--primary"/);
  const button = read("src/features/viewer/export/export-button.tsx");
  assert.match(button, /theme\.edgeDrift/);
  assert.match(button, /theme\.primary/);
});

/* ----------------------------------------------------------------------- */
/* The playground's pre-paint fold: CSS and TypeScript name the same thing  */
/* ----------------------------------------------------------------------- */

check(
  "the source-fold attribute in globals.css matches the TypeScript constant",
  () => {
    /* CSS cannot import a constant, so the selector is a hand-maintained twin
       of `SOURCE_FOLD_ATTRIBUTE`. If they drift, nothing breaks loudly — the
       pre-paint script stamps an attribute no rule reads, and the fold goes
       back to flashing on every load, which is exactly the bug the script was
       added to remove. */
    const fold = read("src/features/playground/lib/source-fold.ts");
    const attribute = /SOURCE_FOLD_ATTRIBUTE = "([^"]+)"/.exec(fold)?.[1];
    assert.ok(attribute, "SOURCE_FOLD_ATTRIBUTE not found — has it moved?");
    assert.match(
      globals,
      new RegExp(`\\[${attribute}="collapsed"\\]`),
      `globals.css has no rule for [${attribute}="collapsed"]`,
    );
    /* Both halves of what the fold hides, or a collapsed rail leaves its
       divider hanging in the gutter. */
    for (const hook of ["data-af-source-pane", "data-af-source-divider"]) {
      assert.match(
        globals,
        new RegExp(`\\[${hook}\\]`),
        `no rule targets [${hook}]`,
      );
      assert.match(
        read("src/components/ui/split-workbench.tsx"),
        new RegExp(hook),
        `split-workbench renders no ${hook} hook for the stylesheet to aim at`,
      );
    }
  },
);

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} viewer-motion assertions passed.`);

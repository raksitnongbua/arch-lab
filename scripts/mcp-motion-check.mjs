#!/usr/bin/env node
/**
 * `/mcp` page motion check.
 *
 * THE HAZARD THIS EXISTS FOR is specific and silent: every entrance on this
 * page starts at `opacity: 0`, so an entrance that does not finish leaves
 * DOCUMENTATION PERMANENTLY INVISIBLE. There is no error, no empty box, no
 * layout shift to notice — the text is simply not there, and the page still
 * looks deliberate. That is much worse than no animation at all.
 *
 * Two things keep it from happening, and both are asserted here:
 *
 *   1. Every entrance carries `both` fill, so it holds its final frame. With
 *      the global reduced-motion backstop (0.01ms, one iteration) that is also
 *      what makes the page correct for a reader who wants no motion: it lands
 *      on the end state instead of the start one.
 *   2. Nothing on this page is scroll-driven. An `animation-timeline` would
 *      look better and would leave text hidden wherever the timeline did not
 *      run, which is the trade this page deliberately refuses.
 *
 * The rest is the house rule for ambient loops: parked on a frame that MEANS
 * something, and motion-only overlays removed rather than frozen.
 *
 * Run with: pnpm check:mcp-motion
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const css = read("src/features/mcp/styles/mcp-motion.css");
const globals = read("src/app/globals.css");
const guide = read("src/features/mcp/components/mcp-guide.tsx");
const figure = read("src/features/mcp/components/mcp-round-trip.tsx");

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

/** The declarations of the first rule whose selector is exactly `selector`. */
function ruleBody(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`^${escaped} \\{([^}]*)\\}`, "m"));
  return match === null ? null : match[1];
}

/* ---- 1. the stylesheet is actually loaded -------------------------------- */

check("globals.css imports the page's stylesheet", () => {
  // A feature stylesheet nobody imports is invisible in exactly the way this
  // whole check is about.
  assert.match(
    globals,
    /@import "\.\.\/features\/mcp\/styles\/mcp-motion\.css"/,
  );
});

/* ---- 2. no entrance can strand its content ------------------------------- */

check("every entrance holds its final frame with `both`", () => {
  for (const name of ["af-mcp-rise", "af-mcp-fade", "af-mcp-rule"]) {
    const body = ruleBody(css, `.${name}`);
    assert.ok(body !== null, `.${name} is not declared`);
    assert.match(
      body,
      /animation:[^;]*\bboth\b/,
      `.${name} must use \`both\` fill — without it the element snaps back to ` +
        `opacity 0 and the text is gone for good`,
    );
  }
});

check("every entrance keyframe starts hidden and ENDS UNSTATED", () => {
  // A `to { opacity: … }` on an entrance is the other way to strand content:
  // it would override the element's natural state instead of handing back to
  // it. These are all `from`-only for that reason.
  for (const name of ["af-mcp-rise", "af-mcp-fade"]) {
    const block = css.match(
      new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`),
    );
    assert.ok(block, `@keyframes ${name} is missing`);
    assert.match(block[1], /from \{/, `${name} must start from a hidden state`);
    assert.doesNotMatch(
      block[1],
      /\bto \{/,
      `${name} must not declare a \`to\` frame — let it land on the element's own state`,
    );
  }
});

check("nothing on this page is scroll-driven", () => {
  // Deliberate: a view() timeline that does not run leaves text invisible, and
  // this is documentation.
  assert.doesNotMatch(css, /animation-timeline/);
  assert.doesNotMatch(guide, /animation-timeline/);
});

check("the page stays server-rendered — no client directive crept in", () => {
  // The entrances are CSS on complete markup. The moment this needs an
  // IntersectionObserver it also needs a client component, and the page's
  // whole design (and its SSR'd endpoint) depends on it not having one.
  assert.doesNotMatch(guide, /^"use client"/m);
  assert.doesNotMatch(figure, /^"use client"/m);
});

/* ---- 3. ambient loops park on a frame that means something --------------- */

/*
 * ALL the reduced-motion blocks concatenated, not just the last one — the
 * stylesheet has several (hover sits with the cards, the loops sit with the
 * figure), and slicing from the last occurrence silently skipped the earlier
 * ones. A check that reads the wrong half of a file passes for the wrong
 * reason.
 */
const reduced = (
  css.match(/@media \(prefers-reduced-motion[\s\S]*?\n\}/g) ?? []
).join("\n");
assert.ok(reduced.length > 0, "no reduced-motion block in mcp-motion.css");

check("the round-trip chips park VISIBLE, not hidden", () => {
  // Parking them hidden would leave an empty figure still claiming to explain
  // the round trip.
  assert.match(
    reduced,
    /\.af-mcp-call,\s*\.af-mcp-verdict \{[^}]*opacity: 1;/s,
  );
  assert.match(
    reduced,
    /\.af-mcp-call,\s*\.af-mcp-verdict \{[^}]*animation: none;/s,
  );
});

check("the travelling band is REMOVED, not frozen", () => {
  // A stopped comet is a bright stripe lying across a wire — not a wire at
  // rest. Same rule as the diagram canvases.
  assert.match(
    reduced,
    /\.af-mcp-wire-flow \{[^}]*animation: none;[^}]*display: none;/s,
  );
});

check("the live-dot pulse parks fully on, not mid-fade", () => {
  assert.match(reduced, /\.af-mcp-pulse \{[^}]*opacity: 1;/s);
});

check("hover keeps its answer but drops the movement", () => {
  // Hover still has to say "you are pointing at this"; it just says it without
  // moving anything.
  assert.match(reduced, /\.af-mcp-card:hover \{\s*transform: none;\s*\}/);
});

/* ---- 4. the figure cannot advertise a tool that does not exist ----------- */

check("the round trip names a tool from the catalogue, never a literal", () => {
  assert.match(guide, /toolName=\{MCP_TOOLS\[0\]\?\.name/);
  assert.match(figure, /toolName: string/);
});

check("the figure is hidden from the accessibility tree", () => {
  // Every word in it is said in the prose around it; a screen reader walking a
  // decorative wire diagram learns nothing new.
  assert.match(figure, /aria-hidden="true"/);
});

/* ---- 5. one clock, or three parts stop describing one round trip --------- */

check("the round trip runs on a single shared clock", () => {
  assert.match(figure, /const CLOCK = "\d+ms"/);
  assert.match(figure, /"--af-mcp-clock": CLOCK/);
  for (const name of ["af-mcp-wire-flow", "af-mcp-verdict", "af-mcp-call"]) {
    const body = ruleBody(css, `.${name}`);
    assert.ok(body !== null, `.${name} is not declared`);
    assert.match(
      body,
      /var\(--af-mcp-clock\)/,
      `.${name} must run on the shared clock, or the parts drift apart`,
    );
  }
});

check("the comet's halo and head share one leading edge", () => {
  // Each band starts at its OWN lit length; mismatch and they chase each other
  // instead of reading as one light.
  const pairs = [
    ["af-mcp-trip", "af-mcp-wire-flow-glow"],
    ["af-mcp-trip-head", "af-mcp-wire-flow-head"],
  ];
  for (const [keyframes, band] of pairs) {
    const block = css.match(
      new RegExp(`@keyframes ${keyframes} \\{([\\s\\S]*?)\\n\\}`),
    );
    assert.ok(block, `@keyframes ${keyframes} is missing`);
    const from = Number(block[1].match(/stroke-dashoffset: (-?[\d.]+)/)[1]);
    const body = ruleBody(css, `.${band}`);
    const lit = Number(body.match(/stroke-dasharray: ([\d.]+)/)[1]);
    assert.equal(
      from,
      lit,
      `${band} starts at ${from} but is lit for ${lit} — the bands will not ` +
        `share a leading edge`,
    );
  }
});

/* ---- 6. no colour literals ----------------------------------------------- */

check("the stylesheet paints from tokens only", () => {
  const literals = css.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g) ?? [];
  assert.deepEqual(literals, [], `colour literals: ${literals.join(", ")}`);
});

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} mcp-motion assertions passed.`);

#!/usr/bin/env node
/**
 * Home page dot-grid check.
 *
 * THE HAZARD is that this component is VENDORED. It came from React Bits, and
 * upstream's version breaks four rules this codebase enforces everywhere else:
 * it paints from a hardcoded hex, it ignores both motion preferences, it runs
 * `requestAnimationFrame` forever, and it binds `click` to `window` so every
 * click anywhere on the page fires a shockwave. Each of those was fixed on the
 * way in. None of them is visible in a screenshot, and all four come back for
 * free the moment somebody re-pastes the upstream file to "update" it.
 *
 * So this asserts the four adaptations, plus the two things that make the
 * hand-off from the server-rendered field invisible:
 *
 *   1. No colour literal anywhere — the dots read CSS custom properties, so the
 *      theme picker governs them like everything else.
 *   2. Both motion preferences are consulted, and refusing them still renders
 *      the static field rather than nothing.
 *   3. The canvas is `pointer-events: none`. It covers the hero; a canvas that
 *      took clicks would swallow every one meant for the call to action.
 *   4. Pointer handlers are bounds-checked against the canvas rect, because the
 *      listeners must live on `window` and must not react to the whole document.
 *   5. The loop can park — there is a path that returns without scheduling
 *      another frame.
 *   6. The canvas grid and the CSS tile are built from ONE pitch value, so the
 *      two fields cannot drift onto different lattices.
 *
 * Run with: pnpm check:dot-grid
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const source = read("src/features/marketing/dot-grid.tsx");
const page = read("src/app/page.tsx");

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

/* ---- 1. tokens, never literals ------------------------------------------- */

check("the dots are painted from tokens, with no colour literal", () => {
  /* `rgb(...)` built from resolved channels is how the canvas paints — that is
     the token, converted. What must not appear is a colour CONSTANT: upstream's
     default was a violet hex, and a hex here is a colour the theme cannot reach.
     COMMENTS ARE STRIPPED FIRST, because the file's header quotes that upstream
     default in order to explain why it is gone — and a check that cannot tell a
     cited value from a used one forces the documentation to go vague to pass. */
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const literals = code.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
  const allowed = new Set(["#000000"]); // the fillStyle-rejection sentinel
  const offenders = literals.filter((hex) => !allowed.has(hex));
  assert.deepEqual(offenders, [], `colour literals: ${offenders.join(", ")}`);
  assert.match(
    source,
    /baseVar = "--[\w-]+"/,
    "the base colour is not a custom-property name",
  );
  assert.match(
    source,
    /activeVar = "--[\w-]+"/,
    "the active colour is not a custom-property name",
  );
});

/* ---- 2. both motion preferences ----------------------------------------- */

check("both motion preferences are consulted", () => {
  for (const hook of ["useReducedMotion", "useIdleMotion"]) {
    assert.ok(
      source.includes(`${hook}()`),
      `${hook} is not called — upstream has no notion of either preference`,
    );
  }
  assert.match(
    source,
    /const animated = !reducedMotion && idleMotion/,
    "the two preferences are not combined into one gate",
  );
});

check("refusing motion still leaves a field of dots on screen", () => {
  /* The static layer is rendered unconditionally and only the CANVAS is gated,
     which is what makes "no motion" mean "the dots hold still" rather than "the
     background disappears". */
  const gated = source.match(/\{animated \? \(\s*<canvas/);
  assert.notEqual(gated, null, "the canvas is not the thing being gated");
  assert.ok(
    /backgroundImage: `radial-gradient\(circle at/.test(source),
    "there is no CSS dot field to fall back to",
  );
  assert.ok(
    source.indexOf("backgroundImage: `radial-gradient") <
      source.indexOf("{animated ? ("),
    "the static field must be declared before the gated canvas, or it would " +
      "paint over the live one",
  );
});

/* ---- 3. the canvas must not eat clicks ---------------------------------- */

check("the canvas cannot take pointer events", () => {
  const canvasTag = source.match(/<canvas[\s\S]*?\/>/);
  assert.notEqual(canvasTag, null, "no canvas element found");
  assert.ok(
    canvasTag[0].includes("pointer-events-none"),
    "the canvas covers the hero — without this it swallows every click meant " +
      "for the copy and the call to action beneath it",
  );
});

/* ---- 4. window listeners, gated on the canvas box ---------------------- */

check("pointer handlers are bounds-checked against the canvas", () => {
  assert.ok(
    source.includes('window.addEventListener("pointerdown"'),
    "no pointerdown listener",
  );
  /* Upstream reacts to a click anywhere in the document. Both handlers here
     compute the rect and return early when the pointer is outside it. */
  const gates = source.match(/getBoundingClientRect\(\)/g) ?? [];
  assert.ok(
    gates.length >= 2,
    `only ${gates.length} rect read(s) — each of the two handlers needs one`,
  );
  assert.match(
    source,
    /if \(x < 0 \|\| y < 0 \|\| x > rect\.width \|\| y > rect\.height\) return;/,
    "the pointerdown handler does not reject presses outside the canvas",
  );
  assert.match(
    source,
    /const inside =\s*\n?\s*x >= 0 && y >= 0 && x <= rect\.width && y <= rect\.height;/,
    "the move handler does not compute whether the pointer is over the dots",
  );
});

/* ---- 5. the loop parks -------------------------------------------------- */

check("the draw loop can stop instead of running forever", () => {
  /* Upstream's `draw` ends in an unconditional `requestAnimationFrame(draw)`.
     This one only reschedules while something is moving. */
  assert.match(
    source,
    /if \(!moving\) \{\s*\n\s*running = false;\s*\n\s*return;\s*\n\s*\}/,
    "there is no path out of the loop — a still background would hold a frame " +
      "budget for as long as the tab is open",
  );
  assert.ok(
    source.includes("cancelAnimationFrame"),
    "the effect does not cancel its pending frame on unmount",
  );
});

/* ---- 6. one lattice, two painters -------------------------------------- */

check("the canvas and the CSS tile share one pitch", () => {
  assert.match(
    source,
    /const pitch = dotSize \+ gap;/,
    "the pitch is not derived once",
  );
  /* Both painters must consume that value and nothing else: the static field as
     a `background-size`, the canvas as its loop step. A second expression for
     either is how the two fields end up a few pixels apart and the hand-off
     flickers. */
  assert.match(
    source,
    /backgroundSize: `\$\{pitch\}px \$\{pitch\}px`/,
    "the CSS tile does not use `pitch`",
  );
  assert.ok(
    (source.match(/\+= pitch/g) ?? []).length === 2,
    "the canvas loop does not step by `pitch` in both axes",
  );
});

/* ---- 7. it is actually rendered ---------------------------------------- */

check("the home page renders it", () => {
  assert.ok(page.includes("<DotGrid "), "<DotGrid /> is imported but not used");
  /* A percentage height here would build a dot for every lattice point of the
     whole document — the backdrop is `inset-0` of a page thousands of pixels
     tall — and each one costs a fill per frame. */
  assert.match(
    page,
    /h-\[\d+px\][^>]*>\s*\n?\s*<DotGrid|<DotGrid[\s\S]{0,200}?\/>/,
    "the dot grid is not inside a pixel-bounded box",
  );
  assert.ok(
    /className="absolute inset-x-0 top-0 h-\[\d+px\]/.test(page),
    "the layer holding the dot grid has no absolute pixel height",
  );
});

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} dot-grid assertions passed.`);

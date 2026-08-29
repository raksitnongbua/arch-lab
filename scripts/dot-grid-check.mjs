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

import { contrast, flatten, parseOklch } from "./lib/oklch.mjs";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const source = read("src/features/marketing/dot-grid.tsx");
/* The VALUES moved out of the component when the studio panel arrived — they are
   a store's defaults now, not parameter defaults. This check followed them
   rather than being loosened: what it measures is the shipped configuration,
   wherever that lives. */
const config = read("src/features/marketing/dot-grid-config.ts");
const studio = read("src/features/marketing/dot-grid-studio.tsx");
const gate = read("src/features/marketing/dot-grid-studio-gate.tsx");
const page = read("src/app/page.tsx");
const globals = read("src/app/globals.css");

/**
 * `text` with comments removed.
 *
 * Every assertion below that forbids a token — a hex literal, `localStorage`,
 * `useSearchParams` — has to run on CODE, because the files DOCUMENT why those
 * things are absent and a check that cannot tell a citation from a use forces the
 * documentation to go vague in order to pass. That happened three times while
 * these rules were being written, which is why it is a function.
 */
const codeOf = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

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
  const literals =
    codeOf(source + config + studio).match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
  /* The rejection sentinel is a literal by necessity — it has to be a colour no
     theme could produce, so that `fillStyle` still reading it back means the
     browser refused the token. It is never painted. It also must not be
     `#000000`, which is what the first version used and is exactly why a refused
     token turned into black dots on a black ground. */
  const allowed = new Set(["#010203"]);
  assert.ok(
    !source.includes('SENTINEL = "#000000"'),
    "the rejection sentinel is pure black — a valid colour, so a refused token " +
      "reads back as a paintable value and the dots come out black",
  );
  const offenders = literals.filter((hex) => !allowed.has(hex));
  assert.deepEqual(offenders, [], `colour literals: ${offenders.join(", ")}`);
  for (const key of ["baseVar", "activeVar"]) {
    assert.match(
      config,
      new RegExp(`${key}: "--[\\w-]+"`),
      `${key} is not a custom-property name`,
    );
  }
  /* The panel offers a LIST OF TOKENS rather than a colour input, for the same
     reason: a hex chosen while looking at one theme is wrong in the other six.
     A `type="color"` here would be the upstream customiser's control, and it
     would quietly make the field theme-blind again. */
  assert.ok(
    !/type="color"/.test(studio),
    "the studio offers a colour picker — it must offer DOT_GRID_TOKENS instead",
  );
  assert.ok(
    /DOT_GRID_TOKENS.map/.test(studio),
    "the studio does not build its colour choices from DOT_GRID_TOKENS",
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
  /* `fixed`, and this one is worth an assertion of its own: with `absolute` the
     layer starts BELOW the header — the header is in normal flow, so the page
     begins after it — and the navbar row has nothing behind it but the flat
     ground. That shipped, and a screenshot of it had 25,800 non-black pixels
     immediately below the header and exactly zero inside it. Fixed positioning
     resolves against the viewport, so the field runs behind the header and the
     header's fading ground has something to reveal. */
  assert.ok(
    /className="fixed inset-x-0 top-0 h-\[\d+px\]/.test(page),
    "the dot layer is not `fixed` — an `absolute` layer starts below the header " +
      "and leaves the navbar a flat bar with no field behind it",
  );
  /* A percentage height would build a dot for every lattice point of the
     viewport's full height regardless of the fade, and each one costs a fill per
     frame. */
  assert.match(
    page,
    /h-\[\d+px\][^>]*>[\s\S]{0,400}?<DotGrid/,
    "the dot grid is not inside a pixel-bounded box",
  );
});

/* ---- 8. THE ONE THAT MATTERS: a dot you can actually see ---------------- */

check("the backdrop's negative z-index is contained", () => {
  /* THE ONE THAT MATTERS MOST, and it was found by sampling a screenshot rather
     than by any rule here: the dot field was correct, measured, wired, served —
     and painted underneath `body`'s opaque `bg-background` on every frame.
     The backdrop sits at `-z-10`. CSS painting order inside a stacking context
     puts negative-z-index descendants BEFORE the backgrounds of in-flow
     descendants, so without a stacking context on the backdrop's own parent the
     nearest one is the root element — and `body`'s background then covers the
     entire backdrop. Nothing about that is visible in the markup, the styles or
     any of the twelve assertions above it. */
  assert.match(
    page,
    /<div className="relative isolate flex flex-1 flex-col overflow-hidden">/,
    "the page root is not an `isolate` stacking context, so the backdrop's " +
      "`-z-10` resolves against the root element and `body`'s background paints " +
      "over every layer in it",
  );
  assert.ok(
    /className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"/.test(
      page,
    ),
    "the backdrop no longer carries `-z-10` — if that is deliberate, this " +
      "assertion and the `isolate` above it need rewriting together, because " +
      "without a negative z-index the backdrop paints OVER the page's text",
  );
  /* `body` is the layer that was covering it. Named here so that removing the
     opaque body background — which would also fix the symptom — cannot silently
     leave a rule behind that no longer describes anything. */
  assert.match(
    read("src/app/globals.css"),
    /body \{\n\s*@apply bg-background/,
    "`body` no longer paints an opaque background; the isolate above is then " +
      "belt and braces rather than the fix, and this comment should say so",
  );
});

check("the static field is hidden only by evidence of real dots", () => {
  /* THIS IS THE OTHER HALF OF THE SHIPPED BUG. The first version hid the static
     field the moment the two colour tokens resolved, and then a refused colour
     left a blank canvas over a hidden field — the one outcome worse than either
     half failing on its own. Whatever flag drops the field must be set INSIDE
     the draw loop, after it has counted dots it actually painted. */
  const gate = /opacity: (\w+) \? 0 : undefined/.exec(source);
  assert.notEqual(gate, null, "the static field's opacity is not gated at all");
  const setter = `set${gate[1][0].toUpperCase()}${gate[1].slice(1)}`;
  assert.ok(
    new RegExp(`if \\(drew > 0\\) ${setter}\\(true\\)`).test(source),
    `\`${gate[1]}\` is not set from a painted-dot count — it must be ` +
      `\`if (drew > 0) ${setter}(true)\` inside the loop, or the field can be ` +
      `hidden before anything replaces it`,
  );
  assert.ok(
    !new RegExp(`${setter}\\(true\\);?\\n\\s*\\}, \\[`).test(source),
    `${setter} is called at the end of an effect rather than from the loop`,
  );
});

check("the mask does not quietly undo the measurement below", () => {
  /* An elliptical mask multiplies every measured ratio by an alpha that falls
     off in two axes, so a dot 750px off centre was a fifth of what the numbers
     below assert. A vertical fade leaves every dot in the band at full strength,
     which is what makes those numbers describe the screen. */
  /* Scoped to the DOT layer. Searching the whole file found the line grid's own
     elliptical mask first and reported it as this one — the backdrop has several
     masked layers and only this layer's mask bears on the numbers below. */
  const layerAt = page.indexOf("h-[820px] opacity-");
  assert.notEqual(layerAt, -1, "cannot find the dot layer");
  const mask = /maskImage:\s*\n?\s*"([^"]+)"/.exec(page.slice(layerAt));
  assert.notEqual(mask, null, "the dot layer has no mask");
  assert.ok(
    mask[1].startsWith("linear-gradient(to bottom,"),
    `the mask is "${mask[1]}" — a radial or elliptical fade makes the measured ` +
      `contrast true only at the centre`,
  );
  assert.ok(
    !/\d%/.test(mask[1]),
    `the mask uses percentages ("${mask[1]}") — this layer's parent is the whole ` +
      `page, so a percentage is measured against a box nobody sees the bottom of`,
  );
});

/**
 * The value of a token inside a theme's block, or from `:root` if the theme does
 * not override it — the same fallback the cascade performs.
 */
function tokenIn(selector, token) {
  const block = new RegExp(`^${selector} \\{([\\s\\S]*?)\\n\\}`, "m").exec(
    globals,
  );
  const own =
    block === null
      ? null
      : new RegExp(`^  ${token}: ([^;]+);`, "m").exec(block[1]);
  if (own !== null) return own[1].trim();
  const root = /^:root \{([\s\S]*?)\n\}/m.exec(globals);
  const fallback =
    root === null
      ? null
      : new RegExp(`^  ${token}: ([^;]+);`, "m").exec(root[1]);
  return fallback === null ? null : fallback[1].trim();
}

/**
 * The floor a dot has to clear against its own ground, as a WCAG ratio.
 *
 * 1.5:1 is not a standard — a decorative background answers to no guideline, and
 * that is exactly why this number has to be written down somewhere. It is set
 * from the two failures: the field shipped once at 1.32:1 and once at 1.20:1,
 * and in both cases nobody could see it. 1.5 sits above both and below the
 * 1.86–1.98 the field measures now, so it fails a regression toward either
 * without pinning the design to one value.
 */
const MIN_DOT_CONTRAST = 1.5;

/**
 * The smallest dot whose measured contrast still describes what is on screen.
 *
 * THIS REPLACED AN AREA FLOOR, and the reason is worth keeping because the floor
 * was wrong for an instructive reason. It required a dot to cover 0.8% of its
 * cell, derived from a 2px dot at 1.32:1 that "could not be seen" — except that
 * dot could not be seen because the entire backdrop was painting underneath
 * `body`'s opaque background. Every observation the floor was calibrated on came
 * from that period, so the floor was measuring a bug rather than a perceptual
 * limit. Once the layer actually rendered, a 1px lattice read better than a 3px
 * one, and the shipped design is 1px.
 *
 * What survives is a narrower rule that does NOT depend on that evidence: below
 * one CSS pixel a dot is anti-aliased into a fraction of its own colour, so the
 * contrast the assertion above measures would overstate what reaches the screen.
 * At 1px and up the two agree, and visibility is governed by contrast alone —
 * which is the assertion to protect.
 */
const MIN_DOT_SIZE = 1;

/**
 * Every theme, and which alpha applies to it.
 *
 * DERIVED FROM `THEMES`, not typed out, and that is the whole point of this
 * list: the first version of this check measured `:root` and `.dark` only. The
 * field was reported invisible on `midnight` — a theme it had never looked at,
 * whose ground is pure black and whose `--node-border` is its own value. Two
 * themes checked out of seven is five themes unchecked.
 *
 * The alpha comes from the `dark:` variant, which `globals.css` defines as
 * `.dark, .midnight, .contrast` — so those three take the second opacity and
 * the rest take the first. That mapping is asserted below rather than assumed,
 * because a theme added to the variant and not to this list would be measured
 * against the wrong alpha and pass while being invisible.
 */
const THEME_BLOCKS = (() => {
  const list = /export const THEMES = \[([\s\S]*?)\] as const;/.exec(
    read("src/lib/constants.ts"),
  );
  assert.notEqual(list, null, "cannot read THEMES from lib/constants.ts");
  const variant = /@custom-variant dark \(&:is\(([^)]*)\)\)/.exec(globals);
  assert.notEqual(variant, null, "cannot read the dark custom-variant");
  const darkFamily = new Set(
    [...variant[1].matchAll(/\.([\w-]+)/g)].map((m) => m[1]),
  );
  return [...list[1].matchAll(/"([\w-]+)"/g)].map((m) => ({
    name: m[1],
    /* `light` is the bare `:root` block — it is the default palette rather than
       a class, which is why it alone has no selector of its own. */
    selector: m[1] === "light" ? ":root" : `.${m[1]}`,
    dark: darkFamily.has(m[1]),
  }));
})();

check("every theme in THEMES is measured here", () => {
  assert.ok(
    THEME_BLOCKS.length >= 7,
    `only ${THEME_BLOCKS.length} theme(s) found — the list did not parse`,
  );
  const darkNames = THEME_BLOCKS.filter((t) => t.dark).map((t) => t.name);
  assert.deepEqual(
    darkNames.sort(),
    ["blueprint", "contrast", "dark", "midnight"],
    `the dark family is ${darkNames.join(", ")} — if that changed, the alpha ` +
      `each theme is measured with changed too`,
  );
});

check("a dot is visible on every theme's ground", () => {
  const base = /baseVar: "(--[\w-]+)"/.exec(config)?.[1];
  assert.notEqual(base, undefined, "cannot find the base colour token");

  /* The alphas are on the WRAPPER in page.tsx, not in the component, so this has
     to read both files — and that split is the reason a measurement here is
     worth having: neither file alone shows what the reader sees. */
  const layer =
    /className="fixed inset-x-0 top-0 h-\[\d+px\] opacity-\[([\d.]+)\] dark:opacity-\[([\d.]+)\]"/.exec(
      page,
    );
  assert.notEqual(layer, null, "cannot find the dot layer's opacities");

  for (const { name: label, selector, dark } of THEME_BLOCKS) {
    const alpha = Number(dark ? layer[2] : layer[1]);
    const dot = parseOklch(tokenIn(selector, base));
    const ground = parseOklch(tokenIn(selector, "--background"));
    assert.notEqual(dot, null, `${label}: ${base} is not an oklch value`);
    assert.notEqual(
      ground,
      null,
      `${label}: --background is not an oklch value`,
    );

    const seen = flatten({ rgb: dot.rgb, alpha }, ground);
    const got = contrast(seen, ground.rgb);
    assert.ok(
      got >= MIN_DOT_CONTRAST,
      `${label}: a dot measures ${got.toFixed(2)}:1 against its ground at ` +
        `opacity ${alpha} — under ${MIN_DOT_CONTRAST}:1 it is not there. ` +
        `Raise the opacity, or move to a lighter token: ${base} at full ` +
        `strength is ${contrast(dot.rgb, ground.rgb).toFixed(2)}:1, which is ` +
        `the ceiling.`,
    );
  }
});

check("a dot is at least one pixel, so the contrast above is honest", () => {
  const dotSize = Number(/dotSize: ([\d.]+),/.exec(config)?.[1]);
  const gap = Number(/gap: ([\d.]+),/.exec(config)?.[1]);
  assert.ok(
    Number.isFinite(dotSize) && Number.isFinite(gap),
    "cannot read dotSize and gap",
  );
  assert.ok(
    dotSize >= MIN_DOT_SIZE,
    `a ${dotSize}px dot is sub-pixel — it will be anti-aliased into a fraction ` +
      `of its colour, so the contrast measured above is not what reaches the ` +
      `screen`,
  );
  /* The pitch is half the backdrop's line grid, so the two lattices coincide.
     Growing the dot has to come out of the gap. */
  assert.equal(
    dotSize + gap,
    28,
    `pitch is ${dotSize + gap}px; the backdrop's line grid is 56px and the two ` +
      `must stay harmonic — take the change out of \`gap\`, not the pitch`,
  );
});

check("the header does not re-blacken the field it now sits over", () => {
  const header = read("src/components/layout/header.tsx");
  /* The header's ground fades downward in two layers — a gradient for the colour
     and a mask for the blur. Both halves are needed: a gradient with an unmasked
     blur puts the seam straight back at the header's bottom edge. */
  assert.match(
    header,
    /bg-gradient-to-b from-background\/\d+ via-background\/\d+ to-transparent/,
    "the header's ground is a flat tint again — a uniform tint ends somewhere, " +
      "and wherever it ends there is an edge across the field behind it",
  );
  assert.match(
    header,
    /maskImage: "linear-gradient\(to bottom, black \d+%, transparent 100%\)"/,
    "the header's blur is not masked, so it stops dead at the bottom edge",
  );
  /* The blur is the legibility device, not the tint. The tint thinned to /45
     at the midline (2026-08) on the strength of the blur averaging busy canvas
     content — /live can scroll an accent-coloured node straight under the nav,
     where raw content measures 3.6:1 against `--foreground` in `dark`. That
     only holds while the blur's solid stop clears the text band, which ends at
     ~66% of the 64px row: a mask that releases the blur earlier (the old 45%
     did) puts raw canvas behind the second half of the nav text. */
  const blurStop = Number(
    /maskImage: "linear-gradient\(to bottom, black (\d+)%/.exec(header)?.[1],
  );
  assert.ok(
    Number.isFinite(blurStop) && blurStop >= 60,
    `the blur mask releases at ${blurStop}% — before the nav text band ends ` +
      `(~66% of the row), so busy canvas content shows raw behind the text ` +
      `the thinned tint no longer covers`,
  );
  /* The HEADER'S OWN className only. Comments in the file discuss the border
     that was removed, and the mobile dropdown below the header legitimately has
     one — it is a popover over content, not a rule across the field. */
  const headerClass = /<header\b[\s\S]*?className="([^"]*)"/.exec(
    codeOf(header),
  );
  assert.notEqual(headerClass, null, "cannot read the header's className");
  assert.ok(
    !/border-b/.test(headerClass[1]),
    `the header has a bottom border again ("${headerClass[1]}"); the fade ` +
      `replaced it, and a rule across a dot field is the hard edge this was ` +
      `meant to remove`,
  );
  /* Opaque at the top would be a black strip across the lattice. */
  const top = Number(/from-background\/(\d+)/.exec(header)?.[1]);
  assert.ok(
    Number.isFinite(top) && top <= 95,
    `the header's ground starts at ${top}% — at 100% the top of the row is a ` +
      `solid band over the field`,
  );
});

/* ---- 9. the studio stays a tool ----------------------------------------- */

check("the studio costs a visitor nothing", () => {
  /* Two properties, and both are load-bearing. If the panel were a static import
     its code would ship in the home page's bundle for everyone; if it were not
     gated it would render for everyone. A decorative background's tuning panel
     must not be either. */
  assert.match(
    gate,
    /dynamic\(\s*\(\) => import\("\.\/dot-grid-studio"\)/,
    "the panel is not a dynamic import, so its code ships to every visitor",
  );
  assert.match(
    gate,
    /\{ ssr: false \}/,
    "the panel is server-rendered, which defeats the point of the gate",
  );
  assert.match(
    gate,
    /new URLSearchParams\(window\.location\.search\)\.has\("dots"\)/,
    "the gate does not read `?dots` from the URL",
  );
  /* `useSearchParams` would opt the whole route out of static rendering to
     support a panel almost nobody opens. */
  assert.ok(
    !/useSearchParams/.test(codeOf(gate + page)),
    "`useSearchParams` on this route makes `/` dynamic for every visitor",
  );
});

check("nothing the studio changes is persisted", () => {
  /* The panel is a way to FIND values; the way one is KEPT is the copy button and
     an edit to `dot-grid-config.ts`. A localStorage write here would turn a
     developer tool into a user setting for a background nobody wants to
     configure — and then into a migration when the shape changes. */
  for (const [label, text] of [
    ["the studio", codeOf(studio)],
    ["the config store", codeOf(config)],
  ]) {
    assert.ok(
      !/localStorage|sessionStorage|document\.cookie/.test(text),
      `${label} persists its state; the defaults in source are the design`,
    );
  }
  assert.match(
    studio,
    /dotGridAsSource/,
    "the studio has no way to emit the values it found, so tuning cannot be kept",
  );
});

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} dot-grid assertions passed.`);

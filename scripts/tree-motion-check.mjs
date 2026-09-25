/**
 * `check:tree-motion` — the tree canvas's paint and motion rules.
 *
 * THE FIRST ASSERTION IS THE REASON THIS FILE EXISTS. Every class the
 * stylesheet targets must actually be emitted by the component, and every
 * class the component emits must be targeted. A CSS selector that matches
 * nothing is not an error — nothing in the toolchain reports it — and this
 * canvas shipped exactly that bug: a template literal lost its leading space,
 * every odd cell got the class `aft-tree-cellis-alt`, `.aft-tree-cell` stopped
 * applying, and those cells fell out of `position: absolute` into normal flow
 * at the left edge of the pane. `new-diagram-type.md` names the failure in its
 * standing rules and records that it had already shipped once. It has now
 * shipped twice, and this is the check that ends it.
 *
 * The rest:
 *
 *   - MOTION OPTS OUT TWICE — `prefers-reduced-motion` AND the app-wide idle
 *     toggle — and the resting state is what a no-JS reader gets.
 *   - NO SVG `filter` ON A CONNECTOR, ever. A percentage filter region is in
 *     objectBoundingBox units and a horizontal or vertical line has a
 *     zero-extent box in one axis, so the region collapses and the paint lands
 *     somewhere else entirely. Three commits went into chasing the bands that
 *     produced on the ER canvas.
 *   - FOCUS DIMS, IT DOES NOT REPAINT. No stroke, fill, width or arrowhead
 *     changes in either direction — the rule two kinds broke before it was
 *     written down. Only opacity may move under `.is-dim`.
 *   - THE DRAWING PAINTS NO GROUND of its own: the ruled ground belongs to the
 *     pane, and a card on the drawing made this the one canvas of the ten
 *     sitting on its own colour.
 *
 * Exits non-zero on any failure. Run with: pnpm check:tree-motion
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const css = read("src/features/tree/styles/tree-motion.css");
const diagram = read("src/features/tree/components/tree-diagram.tsx");
const viewer = read("src/features/tree/components/tree-viewer.tsx");
const components = `${diagram}\n${viewer}`;

let failures = 0;
let assertions = 0;
const ok = (label) => {
  assertions += 1;
  console.log(`  ✓ ${label}`);
};
const fail = (label, detail) => {
  assertions += 1;
  failures += 1;
  console.error(`  ✗ ${label}`);
  if (detail) console.error(`    ${detail}`);
};
const check = (label, condition, detail) =>
  condition ? ok(label) : fail(label, detail);

/* ----------------------------------------------------------------------- */
console.log("\n1. Every styled class is emitted, and every emitted class is styled");

/** Class names the stylesheet targets, minus the shared ones it only rides. */
const styled = new Set(
  [...css.matchAll(/\.(aft-tree[a-z0-9-]*)/g)].map((match) => match[1]),
);

/* The component builds class lists from arrays, so a name appears as its own
   quoted string. That is also what makes the concatenation bug visible here:
   `aft-tree-cellis-alt` would appear in neither set. */
const emitted = new Set(
  [...components.matchAll(/"(aft-tree[a-z0-9-]*)"/g)].map((match) => match[1]),
);
/* Template-built names, e.g. `aft-b${n}` and the accent classes. */
const emittedDynamic = [...components.matchAll(/`(aft-[a-z0-9-]*)\$\{/g)].map(
  (match) => match[1],
);

const modifiers = new Set(["is-alt", "is-dim", "is-root", "is-leaf", "is-branch"]);
const unmatchedStyle = [...styled].filter(
  (name) => !emitted.has(name) && !emittedDynamic.some((stem) => name.startsWith(stem)),
);
check(
  "every `aft-tree*` class the stylesheet targets is emitted by a component",
  unmatchedStyle.length === 0,
  `styled but never emitted: ${unmatchedStyle.join(", ")} — a selector that ` +
    "matches nothing is not an error, which is how the cell bug hid",
);

const unmatchedEmit = [...emitted].filter((name) => !styled.has(name));
check(
  "every `aft-tree*` class a component emits is targeted by the stylesheet",
  unmatchedEmit.length === 0,
  `emitted but never styled: ${unmatchedEmit.join(", ")} — either a typo or ` +
    "dead markup",
);

/* The modifiers are appended, so they are checked as their own set: a lost
   space merges one into the base name and BOTH sets lose it. */
for (const modifier of modifiers) {
  const usedInCss = css.includes(`.${modifier}`);
  const usedInTsx = components.includes(`"${modifier}"`);
  if (!usedInCss && !usedInTsx) continue;
  check(
    `the \`${modifier}\` modifier is both emitted and styled`,
    usedInCss && usedInTsx,
    usedInCss
      ? "styled but no component emits it"
      : "emitted but nothing styles it",
  );
}

/* A class list must be JOINED, never concatenated — the rule the bug broke. */
check(
  "no class list is built by pasting a modifier onto a base name",
  !/className=\{`aft-tree-[a-z-]*\$\{/.test(components),
  "a template literal building a class name is one lost space away from " +
    "producing a class that matches nothing",
);

/* ----------------------------------------------------------------------- */
console.log("\n2. Motion opts out twice");

check(
  "reduced motion is honoured",
  /@media \(prefers-reduced-motion: reduce\)/.test(css),
  "a reader who asked the OS for stillness must get it",
);
check(
  "the app-wide idle-motion toggle is honoured",
  /data-motion="off"/.test(css),
  "the in-product toggle is the second opt-out, and it is not optional",
);
check(
  "nothing animates at rest",
  !/@keyframes/.test(css) && !/animation:/.test(css),
  "a tree's connectors carry nothing along them — removing motion here loses " +
    "no information, which is the standing test",
);

/* ----------------------------------------------------------------------- */
console.log("\n3. Focus dims, it does not repaint");

const dimBlocks = [...css.matchAll(/\.is-dim[^{]*\{([^}]*)\}/g)].map((m) => m[1]);
check(
  "a dimmed element changes opacity and nothing else",
  dimBlocks.length > 0 &&
    dimBlocks.every((body) =>
      body
        .split(";")
        .map((line) => line.trim())
        .filter(Boolean)
        .every((line) => /^opacity\s*:/.test(line)),
    ),
  "a focused line that recolours is a new border appearing where one already " +
    "was — this was added and removed twice on other canvases",
);

check(
  "no SVG filter is applied to a connector",
  !/filter\s*:/.test(css),
  "a percentage filter region collapses on a flat path and paints bands " +
    "across the diagram — `check:er-motion` bought this rule",
);

/* ----------------------------------------------------------------------- */
console.log("\n4. The drawing paints no ground of its own");

check(
  "the ruled ground is mounted on the PANE, at the camera's scale",
  /CANVAS_RULE_CLASS/.test(viewer) && /groundFieldCss\(/.test(viewer),
  "on the drawing the ground clips to the drawing's box, leaving a " +
    "half-ruled pane",
);
check(
  "the diagram itself mounts no ground",
  !/CANVAS_RULE_CLASS|canvas-rule-dot|canvas-rule-line/.test(diagram),
  "a ground inside the drawing is the half-ruled pane this rule exists to end",
);
check(
  "the scroll container paints no card of its own",
  /\.aft-tree-scroll\s*\{[^}]*background:\s*transparent/.test(css),
  "a card here covers the pane's ground and makes this the one canvas of the " +
    "ten sitting on its own colour",
);

/* ----------------------------------------------------------------------- */
console.log("\n5. Colour is derived, never declared");

/* THE ASSERTION THAT WAS NOT ENOUGH, kept and strengthened. It used to check
   that the stylesheet REFERENCED `--chart-1`, which it did — while nothing in
   the project defined that token, so every branch accent resolved to its
   fallback and the whole tree drew in the border colour. A custom property
   that resolves to nothing is not an error. Now the accents are checked
   against tokens that are actually declared, in every theme. */
{
  const globals = fs.readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8");
  const referenced = [...css.matchAll(/--ac:\s*var\((--[a-z0-9-]+)\)/g)].map(
    (match) => match[1],
  );
  const unique = [...new Set(referenced)];
  check(
    "every branch accent names a token this project defines",
    unique.length >= 5 &&
      unique.every((token) => globals.includes(`${token}:`)),
    `referenced ${unique.join(", ")} — one of them is declared nowhere, so it ` +
      "resolves to its fallback and the branch colour silently disappears",
  );
}
check(
  "no literal colour is written into this stylesheet",
  !/#[0-9a-fA-F]{3,8}\b/.test(css) && !/\brgb\(/.test(css),
  "a literal colour works in one theme and breaks in the other five",
);

/* ----------------------------------------------------------------------- */

console.log("");
if (failures > 0) {
  console.error(`${failures} of ${assertions} assertions failed.`);
  process.exit(1);
}
console.log(`All ${assertions} assertions passed.`);

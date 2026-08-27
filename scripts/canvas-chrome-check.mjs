/**
 * Keeps the navigation chrome one control in one corner.
 *
 *   node scripts/canvas-chrome-check.mjs
 *
 * Seven canvases wear the zoom cluster and two of them also carry the minimap.
 * `components/ui/zoom-pill.tsx` exists because the CONTROLS drifted apart once
 * already — one pill grew `+`/`−` while the others kept a bare readout — and
 * sharing the classes fixed that. It did not fix the CORNER, and nothing was
 * watching: by the time this check was written the ER and data-dictionary
 * viewers were pinning the cluster bottom-right while the other five pinned it
 * bottom-left. Same controls, two products.
 *
 * `purpose.md` asks for a `check:*` behind any customisation surface, in the
 * manner of `check:themes`: a half-populated option ships a choice that makes
 * the diagram look broken. This is that check for the navigation corner. It is
 * a SOURCE scan, because the chrome is positioning on React components that
 * type stripping cannot execute — the same tactic `check:shortcuts` and
 * `check:viewer-motion` use.
 *
 * Each assertion names the failure it prevents. A scan that merely restated the
 * implementation would pass forever.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(ROOT, relative), "utf8");

/**
 * The same source with its comments removed, for assertions that pin CODE.
 *
 * `canvas-edit-check.mjs` carries this helper and the warning that bought it,
 * and this file needed it within a minute of being written: the minimap's own
 * header explains what `!right-3` USED to be, so an assertion that the class is
 * gone matched the sentence saying it is gone. A regex over a source file
 * matches prose as readily as syntax.
 */
const readCode = (relative) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

let failures = 0;
function check(label, condition, failure) {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${label}\n    ${failure}`);
  }
}

console.log("canvas-chrome-check");

/* -------------------------------------------------------------------------- */
/* 1. One corner, on every canvas that has a zoom cluster                      */
/* -------------------------------------------------------------------------- */

console.log("\nEvery zoom cluster is in the bottom-right corner");

/* The two C4 canvases mount inside React Flow, so their corner is a `Panel`
   position; the other five are absolutely positioned over their own SVG. Both
   spellings are listed rather than normalised, because the point is to catch a
   new canvas that picks the other corner in EITHER idiom. */
const REACT_FLOW_CANVASES = [
  ["C4 viewer", "src/features/viewer/components/viewer-canvas.tsx"],
  ["C4 editor", "src/features/editor/components/canvas.tsx"],
];
const OVERLAY_CANVASES = [
  ["sequence", "src/features/sequence/components/sequence-viewer.tsx"],
  ["flowchart", "src/features/flowchart/components/flowchart-viewer.tsx"],
  ["use-case", "src/features/usecase/components/usecase-viewer.tsx"],
  ["ER", "src/features/er/components/er-viewer.tsx"],
  ["dictionary", "src/features/dict/components/dict-viewer.tsx"],
];

for (const [name, file] of REACT_FLOW_CANVASES) {
  const source = read(file);
  check(
    `${name}: the cluster sits in a bottom-right Panel`,
    /<Panel position="bottom-right">/.test(source),
    "the camera controls left the shared corner — a reader who learned them " +
      "on one canvas now hunts for them on this one",
  );
}

/**
 * The `className` expression the zoom cluster is mounted with.
 *
 * Read as a WINDOW around `ZOOM_PILL_CLASSES` rather than by matching a literal
 * class string, because `prettier-plugin-tailwindcss` sorts the classes: this
 * check's first negative test passed against a canvas that HAD been flipped
 * back to the left corner, because the literal it looked for had been reordered
 * from `bottom-3 left-3` to `left-3 bottom-3` behind it. An assertion that
 * depends on class order is an assertion the formatter can switch off.
 */
function clusterMount(source) {
  /* Every canvas names `ZOOM_PILL_CLASSES` twice — once in its import list and
     once where the cluster is mounted — and the import is the earlier of the
     two. Anchoring on the first hit windowed the import and reported that five
     canvases had no right-edge offset, which was the check being wrong rather
     than the canvases. Take the last mention that reads like JSX. */
  const windows = [];
  let from = 0;
  for (;;) {
    const at = source.indexOf("ZOOM_PILL_CLASSES", from);
    if (at === -1) break;
    const window = source.slice(Math.max(0, at - 400), at + 40);
    if (window.includes("className")) windows.push(window);
    from = at + 1;
  }
  return windows.length === 0 ? null : windows[windows.length - 1];
}

for (const [name, file] of OVERLAY_CANVASES) {
  const mount = clusterMount(readCode(file));
  check(
    `${name}: the cluster is mounted at all`,
    mount !== null,
    "no `ZOOM_PILL_CLASSES` mount found — this canvas lost its zoom cluster, " +
      "or the check can no longer find it",
  );
  check(
    `${name}: pinned to the right edge`,
    mount !== null && /right-\d/.test(mount),
    "the cluster has no right-edge offset, so it cannot be in the corner the " +
      "other six share",
  );
  check(
    `${name}: and not to the left`,
    mount !== null && !/left-\d/.test(mount),
    "this canvas pins the zoom cluster bottom-LEFT — the corner five canvases " +
      "moved away from, which is how the two-corner split started",
  );
}

/* -------------------------------------------------------------------------- */
/* 2. The map docks over the cluster rather than pinning itself                */
/* -------------------------------------------------------------------------- */

console.log("\nThe minimap docks above the cluster it answers with");

const minimap = readCode("src/components/ui/canvas-minimap.tsx");
check(
  "the minimap does not position itself",
  /!static/.test(minimap) && !/!right-3/.test(minimap),
  "the map is pinning its own corner again — it will drift away from the " +
    "zoom cluster, which is the split this arrangement exists to close",
);
check(
  "the minimap is still withheld below `sm`",
  /hidden[^"]*sm:!block/.test(minimap),
  "a 160px map on a phone covers a meaningful share of the diagram it is " +
    "describing, and the diagram is the content",
);

for (const [name, file] of REACT_FLOW_CANVASES) {
  const source = read(file);
  check(
    `${name}: the map is stacked with the cluster, not loose in the tree`,
    /<CanvasMinimap \/>[\s\S]{0,400}?(ViewerZoomControls|ZoomIndicator)/.test(
      source,
    ),
    "the map is mounted outside the cluster's column — the two halves of " +
      '"where am I / how close am I" have separated again',
  );
}

/* -------------------------------------------------------------------------- */
/* 3. Closed by default, and reachable without the keyboard                    */
/* -------------------------------------------------------------------------- */

console.log("\nThe minimap is off until asked for, and the button says so");

for (const [name, file] of REACT_FLOW_CANVASES) {
  const source = read(file);
  check(
    `${name}: the map renders only while open`,
    /\{minimap\.open \? <CanvasMinimap \/> : null\}/.test(source),
    "the map renders unconditionally — every diagram opens with a thumbnail " +
      "on it again, in every review and every screenshot",
  );
}

const hook = readCode("src/components/ui/use-minimap.ts");
check(
  "closed is the default",
  /useState\(false\)/.test(hook),
  "the map now opens with the canvas, which is the default this feature was " +
    "changed to remove",
);
check(
  "typing is exempt from the bare `m` binding",
  /isTyping\(event\.target\)/.test(hook),
  "the first single-letter shortcut in this app would fire while the reader " +
    "is typing — `m` in the source pane would toggle a map instead of " +
    "typing a letter",
);
check(
  "a modifier means the reader meant something else",
  /event\.metaKey \|\| event\.ctrlKey \|\| event\.altKey/.test(hook),
  "⌘M minimises the window on a Mac; claiming it fights the operating system",
);

const toggle = readCode("src/components/ui/minimap-toggle.tsx");
check(
  "the toggle carries the state for a screen reader",
  /aria-pressed=\{open\}/.test(toggle),
  "the open/closed state is left to the icon, so it does not exist for " +
    "anyone not looking at it",
);
check(
  "the accessible name is the ACTION, not the state",
  /aria-label=\{open \? "Hide the minimap" : "Show the minimap"\}/.test(toggle),
  "a control named for its state tells a screen-reader user what IS rather " +
    "than what pressing it does — the lesson `canvas-lock-button.tsx` bought",
);
check(
  "the shortcut is named on the control",
  /\(M\)/.test(toggle),
  "this viewer has no shortcut sheet, so a key named nowhere on screen is a " +
    "key nobody learns",
);

/* -------------------------------------------------------------------------- */
/* 4. The left corner keeps only what is not camera chrome                     */
/* -------------------------------------------------------------------------- */

console.log("\nThe left corner holds the drag mode and nothing else");

const viewer = read("src/features/viewer/components/viewer-canvas.tsx");
check(
  "the drag-mode toggle stays bottom-left",
  /<Panel position="bottom-left">[\s\S]{0,200}?<ViewerModeToggle/.test(viewer),
  "the mode toggle followed the camera controls into the shared cluster — it " +
    "governs what a PRESS does, exists on one of seven canvases, and folding " +
    "it in is how shared chrome starts differing per canvas",
);
check(
  "no zoom cluster is left in the bottom-left panel",
  !/<Panel position="bottom-left">[\s\S]{0,300}?ViewerZoomControls/.test(
    viewer,
  ),
  "the cluster is mounted in both corners at once",
);

if (failures > 0) {
  console.error(`\ncanvas-chrome-check: ${failures} problem(s).`);
  process.exit(1);
}
console.log("\nPASS");

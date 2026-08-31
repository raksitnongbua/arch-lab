/**
 * Keeps the chrome around a diagram — and the ground under it — one thing,
 * whatever the notation is.
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
 * SECTION 6 IS THE SAME DEFECT ON A BIGGER SURFACE, found later: the WELL —
 * the ground the drawing sits on — was being decided per notation too, and six
 * of the nine had forgotten it, so the shade behind a diagram changed when the
 * reader changed kind. It is derived from the kind table rather than from a
 * list typed here, for the reason `codebase.md` gives: a hardcoded list cannot
 * notice the notation it has never heard of, which is how this drift got in.
 *
 * Each assertion names the failure it prevents. A scan that merely restated the
 * implementation would pass forever.
 */

import { existsSync, readFileSync } from "node:fs";
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
    /* WALK BACK THROUGH `className`s UNTIL ONE STATES A HORIZONTAL POSITION,
       and that one is the cluster's mount.
       
       A fixed 400-character window was tried and swept in whatever markup
       happened to sit above the cluster: the flowchart canvas grew a Select/Pan
       toggle mounted `left-3` immediately before its zoom pill, and this
       reported the pill itself was on the left. Taking only the NEAREST
       `className` was then too tight in the other direction — the ER and
       dictionary canvases mount `<div className={ZOOM_PILL_CLASSES}>` inside a
       positioned parent, so the nearest one states no position at all.
       
       Walking back until a position appears is what both shapes have in
       common, and it stops before reaching a SIBLING's classes because a
       sibling that is positioned is a different element in a different corner —
       which is exactly what must not be mistaken for this one. Capped so a
       cluster with no position anywhere still fails rather than walking to the
       top of the file. */
    let cn = at;
    let mount = null;
    for (let depth = 0; depth < 3; depth += 1) {
      cn = source.lastIndexOf("className", cn - 1);
      if (cn === -1) break;
      const slice = source.slice(cn, at + 40);
      mount ??= slice;
      if (
        /\b(?:right|left)-\d/.test(
          source.slice(cn, source.indexOf("\n", cn) + 1),
        )
      ) {
        mount = slice;
        break;
      }
    }
    if (mount !== null) windows.push(mount);
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
  /<Panel position="bottom-left">[\s\S]{0,200}?<CanvasModeToggle/.test(viewer),
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

/* -------------------------------------------------------------------------- */
/* 5. The diagram's footer strip is one strip, whatever the notation           */
/* -------------------------------------------------------------------------- */

console.log("\nBoth panes' footer strips are built to the same metrics");

/* WHY THIS IS THE SAME SUBJECT as the corners above. A reader switches notation
   by TYPING — the same pane re-renders as C4 or as a sequence diagram — so the
   chrome around the drawing has to be the one chrome or the switch reads as
   moving between two products. Section 1 pins that for the zoom cluster. This
   pins it for the footer under the diagram, which is the other row a reader
   uses on every notation, and which had drifted: the five non-C4 canvases were
   built to the pane's TOP strip (`px-3 py-1`) while the C4 shell's footer used
   `px-5 sm:px-8` and a taller row, so the same buttons sat in a row 8px shorter
   with a quarter of the side padding — most visible in immersive mode, where
   Share and Export are hidden and the toolbar is all that is left.

   THE EXPECTATION IS READ FROM THE C4 SHELL, never hardcoded here: it is the
   pane the other five were asked to match, so a deliberate change there should
   move this check's expectation with it rather than fail it. */
{
  const shell = read("src/features/viewer/components/viewer-shell.tsx");
  const playground = read(
    "src/features/playground/components/view-playground.tsx",
  );

  /** The classes on the row inside a footer's bordered ground, as tokens. */
  const footerRow = (source) =>
    (/"(mx-auto flex w-full max-w-7xl[^"]*)"/.exec(source)?.[1] ?? "")
      .split(/\s+/)
      .filter((token) => token !== "");

  /* SIZING ONLY, and what counts as sizing is read off the C4 row rather than
     typed here: every width ceiling and horizontal pad it wears is a metric the
     other five have to wear too, so a deliberate change there moves this
     expectation with it instead of failing. The two rows legitimately differ in
     LAYOUT — the C4 footer stacks a title block above its controls on a phone
     (`flex-col gap-3`) and the other five have no title to stack — so asserting
     the whole string would forbid a difference that is correct. */
  const expected = footerRow(shell);
  const actual = footerRow(playground);
  const sizing = expected.filter((token) =>
    /^(max-w-|px-|sm:px-|md:px-|lg:px-)/.test(token),
  );
  const missing = sizing.filter((token) => !actual.includes(token));
  check(
    "the non-C4 footer pads to the same metrics as the C4 shell's",
    sizing.length > 0 && missing.length === 0,
    sizing.length === 0
      ? "the C4 footer row was not found, so nothing was compared"
      : `the C4 footer pads with ${sizing.join(" ")}; the other five are missing ${missing.join(", ")}`,
  );

  /* THE HEIGHT PAIR, which is a two-value rule rather than one: the row is
     shorter in immersive because the description above it is gone. Both panes
     have to make the same trade or one notation's toolbar jumps on entering the
     mode while the other's does not. */
  const heightPair = (source) => /isImmersive \? "py-2" : "py-3"/.test(source);
  check(
    "both footers tighten by the same step in immersive mode",
    heightPair(shell) && heightPair(playground),
    "one pane changes its footer height on entering immersive and the other " +
      "does not, so the row moves when the notation does",
  );

  /* NO GHOST BUTTON IN THAT ROW. Share and Export are `outline` in both footers
     because they are literally the same components; a ghost control beside them
     is borderless in a row of bordered ones, and in immersive — where Share and
     Export are hidden — it is the whole toolbar reading as a weaker control set
     than the C4 one. */
  const footerRegion =
    /"mx-auto flex w-full max-w-7xl[\s\S]*?<\/section>/.exec(playground)?.[0] ??
    "";
  check(
    "the non-C4 footer holds no ghost control beside the outlined ones",
    footerRegion !== "" && !/variant: "ghost"/.test(footerRegion),
    "a borderless button in a row of bordered ones is the drift this section " +
      "exists to catch",
  );
}

/* -------------------------------------------------------------------------- */
/* 6. One ground under every diagram, whatever the notation                    */
/* -------------------------------------------------------------------------- */

console.log("\nThe well under a diagram is the same colour in every notation");

/* WHY THIS IS THE SAME SUBJECT AGAIN, and the sharpest case of it yet. The
   sections above pin chrome that sits AROUND the drawing; this pins the ground
   the drawing sits ON, which is the largest single surface in the pane and the
   whole screen in immersive mode.

   It had drifted the same way and further. `globals.css` sits `--canvas` ΔL
   0.010 under `--background` in all six themes and calls it "the diagram well,
   deliberately below the chrome" — so the well is a decision the palette has
   already made. The wiring made it nine times: the sequence, flowchart and
   use-case viewers painted `bg-canvas` on their own scroll box, the two C4
   canvases got it from React Flow's class, and ER, the dictionary, the gantt,
   the timeline and the lifecycle painted nothing at all and showed the
   playground pane's `bg-background` instead. Six of nine notations were showing
   chrome where a well belongs, in every theme, and nothing was watching.

   THE FIX THESE ASSERTIONS DEFEND is not "paint it in the other six": that is
   the same nine-way decision with a bigger blast radius, and the tenth notation
   forgets it too. The HOST that owns the pane paints the well once, from
   `components/ui/diagram-well.tsx`, and no viewer paints its own ground. */

/* DERIVED FROM THE KIND TABLE, never a hand-listed nine. `KIND_BLURB` is a
   total `Record<SeedKind, string>`, so a tenth notation cannot compile without
   a row in it — which makes it the one list in this repo that cannot fall
   behind the notations that exist. `codebase.md` names the alternative and what
   it costs: a hardcoded list cannot notice the thing it has never heard of, and
   this defect plus four others on the same branch were exactly that. */
const KINDS = [
  ...readCode("src/features/playground/lib/kind-copy.ts").matchAll(
    /^ {2}([a-z][a-z0-9]*):\s*$|^ {2}([a-z][a-z0-9]*): "/gm,
  ),
]
  .map((match) => match[1] ?? match[2])
  .filter((kind) => kind !== undefined);

check(
  "the kind table still yields every notation",
  KINDS.length >= 9,
  `only ${KINDS.length} kind(s) parsed out of \`kind-copy.ts\` — every ` +
    "assertion below would be passing vacuously over a short list, which is " +
    "the failure this section is written against",
);

/** The well's one definition, which everything below is measured against. */
const wellToken = /DIAGRAM_WELL_CLASSES =\s*"([^"]+)"/.exec(
  readCode("src/components/ui/diagram-well.tsx"),
)?.[1];

/* COLOUR AND MATERIAL TRAVEL TOGETHER, which is why this is a SET rather than
   one name. `bg-canvas` is the well's colour; `af-canvas-sheet` is its material
   — the paper fibre, the e-ink particles, the glass sheen — which is fixed to
   the sheet and therefore belongs on this element rather than inside a camera
   (`lib/canvas-ground.ts` argues the split). A host given one and not the other
   shows a theme's paper as a flat cream rectangle, and nothing else would say
   so. Exactly these two, in this order: an extra class here reaches every well
   in the app at once. */
check(
  "the well is the CANVAS token and its material, and nothing else",
  wellToken === "bg-canvas af-canvas-sheet",
  `the shared well resolves to \`${wellToken ?? "nothing"}\` — the palette ` +
    "puts `--canvas` below `--background` on purpose, so grounding the " +
    "diagram on the chrome colour flattens the recess in all six themes at " +
    "once instead of in six notations one at a time; and dropping " +
    "`af-canvas-sheet` silently removes the material layer from all nine",
);

/* THE EIGHT NON-C4 NOTATIONS. Each ships a `<kind>-viewer.tsx` mounted by the
   playground and a `<kind>-example-view.tsx` mounted by its example route, and
   the file names are derived from the kind rather than listed — a tenth
   notation that names its files by the same convention is picked up with no
   edit here, and one that does not fails loudly rather than silently going
   unchecked. C4 is handled separately below: it has neither file, because its
   canvas is React Flow inside a shell of its own. */
for (const kind of KINDS.filter((kind) => kind !== "c4")) {
  const viewer = `src/features/${kind}/components/${kind}-viewer.tsx`;
  const example = `src/features/${kind}/components/${kind}-example-view.tsx`;

  check(
    `${kind}: its viewer and example view are where the convention says`,
    existsSync(path.join(ROOT, viewer)) && existsSync(path.join(ROOT, example)),
    `expected ${viewer} and ${example} — this notation is in the kind table ` +
      "but its diagram surfaces are not where every other kind's are, so " +
      "nothing below can prove its ground is right",
  );
  if (!existsSync(path.join(ROOT, viewer))) continue;

  /* NO GROUND IN THE VIEWER. `bg-canvas/60` and `bg-background/95` are detail
     cards and docks floating OVER the drawing, which is a different job — the
     lookahead lets those through and catches only a full-strength ground. */
  check(
    `${kind}: the viewer paints no ground of its own`,
    !/\bbg-(canvas|background)(?![-/\w])/.test(readCode(viewer)),
    "this viewer grounds itself, which is the arrangement that drifted: " +
      "three notations did it, five did not, and the ground behind a diagram " +
      "changed shade when the reader changed notation",
  );

  check(
    `${kind}: its example page mounts the shared well`,
    /<DiagramWell(\s|>)/.test(readCode(example)),
    "this example page wraps its viewer in a bare div, so the diagram lands " +
      "on whatever the page happens to be — the well is `DiagramWell`, and " +
      "reaching for it is what keeps all nine grounds one colour",
  );
}

/* THE TWO HOSTS THAT ARE NOT EXAMPLE PAGES. Both take the well as the shared
   constant rather than the literal class, so the token has exactly one
   definition and `wellToken` above is a real measurement of all of them. */
for (const [name, file] of [
  [
    "the playground's diagram pane",
    "src/features/playground/components/view-playground.tsx",
  ],
  ["the C4 viewer shell", "src/features/viewer/components/viewer-shell.tsx"],
  ["the C4 editor shell", "src/features/editor/components/editor-shell.tsx"],
]) {
  check(
    `${name} paints the well from the shared constant`,
    /DIAGRAM_WELL_CLASSES/.test(readCode(file)),
    "this host owns a diagram pane and does not state the well — the pane " +
      "falls back to page chrome, which is what five notations were showing",
  );
}

/* AND THE TWO C4 CANVASES DO NOT. React Flow paints its own root, which is how
   C4 came to be the one family whose well was right by accident: the canvas set
   it, not the shell. Same rule as the eight above now — the shell grounds the
   pane, the canvas draws on it. */
for (const [name, file] of REACT_FLOW_CANVASES) {
  check(
    `${name}: the canvas paints no ground of its own`,
    !/\bbg-(canvas|background)(?![-/\w])/.test(readCode(file)),
    "the canvas grounds itself again, so C4's well is set in a different " +
      "place from the other eight and can drift from them without either " +
      "side looking wrong on its own",
  );
}

/* SECTION 7 — THE WELL MUST NOT POSITION ITS HOST.
   `.af-canvas-sheet` needs a containing block for its `::before`, and it takes
   one with `position: relative`. Every custom class in `globals.css` is
   UNLAYERED, and an unlayered declaration beats every layered one regardless of
   specificity — so that `relative` beat Tailwind's `.fixed`, which lives in
   `@layer utilities`. The playground's sequence/flowchart/use-case pane wears
   both at once (`DIAGRAM_WELL_CLASSES` plus `fixed inset-0 z-50` in immersive),
   and it silently stayed in the page flow: immersive mode rendered at pane size
   with the site header above it, which everyone read as a z-index fight.
   Naming the layer is the fix, and it is invisible — nothing about a rule that
   simply says `position: relative` announces that it must lose. */
const SHEET_CSS = read("src/app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");

check(
  "the well's position is layered, so a host's own position utility wins",
  /@layer\s+components\s*\{\s*\.af-canvas-sheet\s*\{[^}]*\bposition:\s*relative\b/.test(
    SHEET_CSS,
  ),
  "`.af-canvas-sheet` sets `position` outside `@layer components` — an " +
    "unlayered rule outranks `@layer utilities`, so it overrides `fixed` on " +
    "any host that wears the well and positions itself, and immersive mode " +
    "stops covering the viewport",
);

check(
  "the well's unlayered rule carries isolation and nothing that outranks a host",
  !/(^|\n)\.af-canvas-sheet\s*\{[^}]*\bposition:/.test(SHEET_CSS),
  "the layered and unlayered halves of `.af-canvas-sheet` have been merged " +
    "back into one rule — `isolation` needs its unlayered weight (a host " +
    "overriding it lets the `-1` material layer escape) and `position` must " +
    "not have it; they are two rules for that reason",
);

if (failures > 0) {
  console.error(`\ncanvas-chrome-check: ${failures} problem(s).`);
  process.exit(1);
}
console.log("\nPASS");

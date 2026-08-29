#!/usr/bin/env node
/**
 * The canvas well's SHEET is fixed, legible, subordinate, and opt-in — measured.
 *
 * THE ASSERTION THIS SCRIPT EXISTS FOR IS SECTION 1, and its absence is what
 * let a defect ship. The ground used to be painted IN THE DRAWING'S OWN
 * COORDINATES — an SVG `<pattern>` in `userSpaceOnUse` units inside each
 * diagram's `<svg>`, and React Flow `<Background>` layers on the two C4 hosts,
 * both of which multiply by the camera. So zooming out shrank the ground along
 * with the drawing. Every assertion in the previous version of this file passed
 * while that was true, because every one of them measured COLOUR: it asked
 * whether the ground could be seen and whether it stayed under the ink, and
 * never once asked how big a tile was on screen.
 *
 * The ground is now the SHEET: one CSS background on the pane that owns the
 * diagram (`components/ui/diagram-well.tsx`), fixed at every zoom AND every
 * pan. Section 1 computes the on-screen tile pitch at the app's own zoom
 * clamps and fails if it moves; section 2 does the same for pan. They are
 * relational rather than descriptive on purpose — a check that restated "the
 * background is on the well" would pass forever and catch nothing, which is
 * precisely what the old geometry section did.
 *
 * `purpose.md` asks for a `check:*` behind any customisation surface, in the
 * manner of `check:themes`: a half-populated option ships a choice that makes
 * the diagram look broken. A textured sheet is opt-in, so "complete" here does
 * NOT mean every theme sets every token. It means three things, and this script
 * proves all three:
 *
 *   1. **THE DEFAULT IS SILENT.** A theme that does not opt in must resolve
 *      `--canvas-sheet` to `none` and both ink tokens to `transparent` — no
 *      texture at all behind the drawing. Five of the nine themes are in that
 *      state deliberately and `globals.css` argues each one; what this
 *      assertion stops is a theme picking a texture up by ACCIDENT (an alias
 *      pointed at the wrong token, a value pasted into `:root`), which would
 *      put marks behind every diagram in a theme nobody was looking at.
 *   2. **WHERE IT IS USED, IT IS READABLE AS A MATERIAL.** A tiled sheet is two
 *      strengths — wire and chain, minor and major, fine and coarse — and they
 *      must be distinguishable FROM EACH OTHER (two strengths a reader cannot
 *      tell apart is one strength drawn twice, the "renders monotone" failure
 *      `check:flowchart-palette` exists for) and each from the ground it is
 *      drawn on, or it is not there at all.
 *   3. **AND IT STAYS UNDER THE INK.** Every sheet ink and every theme's
 *      `--canvas-grid` sits below a fraction of that same theme's `--edge`.
 *      A ground competing with the lines drawn on it is the one failure that
 *      makes the drawing harder to read rather than merely uglier.
 *
 * A SINGLE BAND IS NOT A TILE, and the seam says so out loud rather than
 * bending: `glass` sets `--canvas-sheet-repeat: no-repeat` and carries exactly
 * ONE ink, because glass has a highlight and not a grain. Section 4 branches on
 * that token, so a theme cannot skip an ink it owes — or smuggle a second one
 * past the separation floor — by choosing the other word.
 *
 * THE THEME LIST IS READ FROM `THEMES` AND THE NOTATION LIST FROM THE KIND
 * TABLE, never typed here. `codebase.md`: a check written from a hand-listed
 * set "cannot notice the thing it has never heard of". A tenth notation and a
 * tenth theme are both measured by this script on the day they are declared,
 * whether or not anyone remembers this file.
 *
 * Exits non-zero on any failure. Run with: pnpm check:canvas-grid
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { contrast, luminance, parseOklch } from "./lib/oklch.mjs";
import { resolveToken, tokensOf } from "./lib/theme-css.mjs";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const CSS = read("src/app/globals.css");
const CONSTANTS = read("src/lib/constants.ts");

let failures = 0;
let assertions = 0;
const check = (label, ok, detail) => {
  assertions += 1;
  if (ok) {
    console.log(`  ✓ ${label}`);
    return;
  }
  failures += 1;
  console.error(`  ✗ ${label}`);
  if (detail !== undefined) console.error(`    ${detail}`);
};

/* COMMENTS STRIPPED for every assertion that pins CODE, the `theme-check.mjs`
   precaution: each pattern below is also described in prose beside the code it
   pins, so a scan over raw source would match the sentence and pass with the
   code deleted. */
const readCode = (rel) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const THEMES = [
  ...(/export const THEMES = \[([^\]]*)\]/.exec(CONSTANTS)?.[1] ?? "").matchAll(
    /"([a-z-]+)"/g,
  ),
].map((m) => m[1]);

const baseline = tokensOf(CSS, "light");

/* DERIVED FROM THE KIND TABLE, never a hand-listed nine — the same source
   `check:canvas-chrome` uses for the well's colour, and for the same reason:
   `KIND_BLURB` is a total `Record<SeedKind, string>`, so a tenth notation
   cannot compile without a row in it. A tenth kind therefore fails HERE, on the
   day it is declared, rather than shipping groundless. */
const KINDS = [
  ...readCode("src/features/playground/lib/kind-copy.ts").matchAll(
    /^ {2}([a-z][a-z0-9]*):\s*$|^ {2}([a-z][a-z0-9]*): "/gm,
  ),
]
  .map((match) => match[1] ?? match[2])
  .filter((kind) => kind !== undefined);

/* The two React Flow hosts. C4 is both rather than one because the VIEWER had
   no ground for its entire life — the editor's grid made the gap invisible to
   anyone developing with a model open. A kind is not covered until every
   surface that draws it is. */
const C4_HOSTS = [
  "src/features/editor/components/canvas.tsx",
  "src/features/viewer/components/viewer-canvas.tsx",
];

/* Every host that owns a diagram pane and must therefore paint the well. */
const WELL_HOSTS = [
  ["the playground", "src/features/playground/components/view-playground.tsx"],
  ["the C4 editor shell", "src/features/editor/components/editor-shell.tsx"],
  ["the C4 viewer shell", "src/features/viewer/components/viewer-shell.tsx"],
];

const WELL = "src/components/ui/diagram-well.tsx";
const WELL_CODE = readCode(WELL);

/* ----------------------------------------------------------------------- */
/* 0. The sheet is MOUNTED once, by the pane — for every kind               */
/* ----------------------------------------------------------------------- */

console.log("the sheet is mounted once, by the pane that owns the diagram");

check(
  `the kind table still yields every notation (${KINDS.length})`,
  KINDS.length >= 9,
  `only ${KINDS.length} kind(s) parsed out of \`kind-copy.ts\` — every ` +
    "assertion below would be passing vacuously over a short list",
);

check(
  "the well class carries the ground's colour AND its sheet",
  /DIAGRAM_WELL_CLASSES\s*=\s*"[^"]*\bbg-canvas\b[^"]*"/.test(WELL_CODE) &&
    /DIAGRAM_WELL_CLASSES\s*=\s*"[^"]*\baf-canvas-sheet\b[^"]*"/.test(
      WELL_CODE,
    ),
  "diagram-well.tsx no longer pairs `bg-canvas` with `af-canvas-sheet` — a " +
    "host that gets one and not the other is the nine-way drift this file " +
    "was written to end, with the texture as a second thing to forget",
);

check(
  "`.af-canvas-sheet` paints from the tokens, not from a literal",
  /\.af-canvas-sheet\s*\{[^}]*background-image:\s*var\(--canvas-sheet\)/.test(
    CSS,
  ),
  "the one rule that paints every canvas ground has stopped reading " +
    "`--canvas-sheet`, so a theme's texture cannot reach the pane",
);

for (const [name, file] of WELL_HOSTS) {
  check(
    `${name} paints the well`,
    /DIAGRAM_WELL_CLASSES/.test(readCode(file)),
    `${file} no longer applies the well class, so its pane shows page chrome ` +
      "where every other pane shows a sheet",
  );
}

/* THE EIGHT NON-C4 EXAMPLE PAGES reach the same class through `<DiagramWell>`.
   The file name is derived from the kind, the convention `check:canvas-chrome`
   relies on. */
for (const kind of KINDS.filter((kind) => kind !== "c4")) {
  const view = `src/features/${kind}/components/${kind}-example-view.tsx`;
  if (!existsSync(path.join(ROOT, view))) {
    check(
      `${kind}: its example view is where the convention says`,
      false,
      `expected ${view} — this notation is in the kind table but its example ` +
        "page is not where every other kind's is",
    );
    continue;
  }
  check(
    `${kind}: its example page hands the pane to <DiagramWell>`,
    /<DiagramWell\b/.test(readCode(view)),
    "this example page owns its own pane and paints no well, so the ground " +
      "behind this notation is the page's chrome",
  );
}

/* ----------------------------------------------------------------------- */
/* 1. THE PITCH DOES NOT MOVE WITH THE CAMERA                              */
/* ----------------------------------------------------------------------- */

console.log("\nthe sheet does not scale with the zoom");

/* HOW THIS IS COMPUTED RATHER THAN ASSERTED. Each way of painting a ground has
   a known relationship between the pitch it is DECLARED at and the pitch a
   reader MEASURES on screen at camera zoom `z`. The mechanisms in use are
   discovered from the source below, so a ground that comes back inside the
   camera is evaluated with the camera's own multiplier and fails on the
   arithmetic — not on a regex that happens to know its name. */
const MECHANISM = {
  /* A CSS background on the pane. The camera lives on a DESCENDANT in every
     host (the `<svg>`'s transform, React Flow's viewport `<div>`), so nothing
     between this background and the screen is scaled. */
  "sheet-on-pane": (declared) => declared,
  /* An SVG `<pattern>` in `userSpaceOnUse` units inside the drawing's own
     `<svg>`: the pattern is in the drawing's coordinate space by construction,
     so the camera multiplies it. This is what shipped, and what broke. */
  "svg-pattern": (declared, zoom) => declared * zoom,
  /* React Flow's `<Background>` reads the viewport transform itself and scales
     its pattern with it — the same defect by a different route. */
  "react-flow-background": (declared, zoom) => declared * zoom,
};

/* The app's own clamps, read from the editor's constants rather than invented,
   so the range measured is the range a reader can actually reach. */
const EDITOR_CONSTANTS = readCode(
  "src/features/editor/lib/canvas-constants.ts",
);
const MIN_ZOOM = Number(/MIN_ZOOM = ([\d.]+)/.exec(EDITOR_CONSTANTS)?.[1]);
const MAX_ZOOM = Number(/MAX_ZOOM = ([\d.]+)/.exec(EDITOR_CONSTANTS)?.[1]);
check(
  `the zoom range is read from the app (${MIN_ZOOM}×–${MAX_ZOOM}×)`,
  Number.isFinite(MIN_ZOOM) &&
    Number.isFinite(MAX_ZOOM) &&
    MIN_ZOOM > 0 &&
    MAX_ZOOM > MIN_ZOOM,
  "MIN_ZOOM/MAX_ZOOM could not be read out of editor/lib/canvas-constants.ts, " +
    "so the pitch below would be compared at zoom levels this script invented",
);

/* Every ground the app paints, and the mechanism each one uses. Discovered, not
   listed: the point is to notice a ground that comes BACK into the camera. */
const grounds = [];
if (/af-canvas-sheet/.test(WELL_CODE))
  grounds.push({ where: "the diagram well", mechanism: "sheet-on-pane" });
for (const kind of KINDS.filter((kind) => kind !== "c4")) {
  const diagram = `src/features/${kind}/components/${kind}-diagram.tsx`;
  if (!existsSync(path.join(ROOT, diagram))) continue;
  const code = readCode(diagram);
  if (
    /<CanvasField\b|patternUnits="userSpaceOnUse"[\s\S]{0,400}--canvas-/.test(
      code,
    )
  )
    grounds.push({ where: `${kind}'s <svg>`, mechanism: "svg-pattern" });
}
for (const host of C4_HOSTS) {
  if (/<Background\b/.test(readCode(host)))
    grounds.push({
      where: host.split("/").pop(),
      mechanism: "react-flow-background",
    });
}

check(
  `exactly one ground is painted, and it is the pane's (${grounds.length} found)`,
  grounds.length === 1 && grounds[0].mechanism === "sheet-on-pane",
  grounds.length === 0
    ? "no ground is painted anywhere — every canvas is bare"
    : `found: ${grounds.map((g) => `${g.where} (${g.mechanism})`).join(", ")}` +
        " — a ground inside the drawing scales with the camera, which is the " +
        "defect the sheet replaced",
);

/* A NOMINAL PITCH, because the property under test is scale-invariance rather
   than a particular number: whatever a tile is declared at, a reader must
   measure the same thing at 10% and at 400%. */
const NOMINAL_PITCH = 16;
for (const ground of grounds) {
  const pitchAt = MECHANISM[ground.mechanism];
  const atMin = pitchAt(NOMINAL_PITCH, MIN_ZOOM);
  const atRest = pitchAt(NOMINAL_PITCH, 1);
  const atMax = pitchAt(NOMINAL_PITCH, MAX_ZOOM);
  check(
    `${ground.where}: one tile is ${atRest}px at every zoom (${atMin} / ${atRest} / ${atMax})`,
    atMin === atRest && atMax === atRest,
    `a tile measures ${atMin}px at ${MIN_ZOOM}× and ${atMax}px at ${MAX_ZOOM}× ` +
      "— the ground shrinks and grows with the drawing, so the reader is not " +
      "looking at a sheet the drawing sits on",
  );
}

/* AND THE DECLARED GEOMETRY IS ABSOLUTE. A tiled sheet measured in `em` would
   move with the root font size and one in `vw` with the window, neither of
   which is the drawing — but both would pass the mechanism test above, so they
   are excluded here rather than assumed away. */
for (const theme of THEMES) {
  const tokens = tokensOf(CSS, theme) ?? baseline;
  const sheet = resolveToken("--canvas-sheet", tokens, baseline);
  if (sheet === "none") continue;
  const size = resolveToken("--canvas-sheet-size", tokens, baseline);
  const repeat = resolveToken("--canvas-sheet-repeat", tokens, baseline);
  const declared = `${sheet} ${size}`;
  const relative = [
    ...declared.matchAll(/[\d.]+(em|rem|vw|vh|vmin|vmax|ch|ex)\b/g),
  ].map((m) => m[0]);
  /* Percentages are allowed ONLY for a single band, where they size to the pane
     — itself outside the camera — rather than to a tile. In a repeating sheet a
     percentage is a tile whose size depends on the box, which is not a sheet. */
  const percents =
    repeat === "no-repeat"
      ? []
      : [...size.matchAll(/[\d.]+%/g)].map((m) => m[0]);
  check(
    `${theme}: its sheet is declared in absolute lengths`,
    relative.length === 0 && percents.length === 0,
    `found ${[...relative, ...percents].join(", ")} — a tile in a relative ` +
      "unit is fixed against the wrong thing",
  );
}

/* THE TWO PITCHES, AND THE OPPOSITE THING EACH KIND OF SHEET OWES.
   A ruling — two `repeating-linear-gradient` strengths, which is what `paper`'s
   weave and `blueprint`'s sheet are — must have its coarse pitch a WHOLE
   MULTIPLE of its fine one, or the heavy marks fall between the light ones
   instead of on them and the sheet reads as moire rather than as a material.
   A speckle — tiled `radial-gradient` layers, which is what `eink` is — owes
   the exact opposite: its two pitches must be COPRIME, so the layers never
   re-align and the eye cannot resolve a lattice out of them. A speckle that
   tiles on a common multiple is a grid with gaps, which is the one thing a
   dither must not be. Both are measured; neither is assumed from the theme's
   name. */
const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));

for (const theme of THEMES) {
  const tokens = tokensOf(CSS, theme) ?? baseline;
  const sheet = resolveToken("--canvas-sheet", tokens, baseline);
  if (sheet === "none") continue;
  if (resolveToken("--canvas-sheet-repeat", tokens, baseline) === "no-repeat")
    continue;
  const size = resolveToken("--canvas-sheet-size", tokens, baseline);
  /* The pitch is wherever the theme states it: in the gradient's own stops for
     a repeating gradient, in `background-size` for a tiled one. Marks under 2px
     are the mark's own width, not the distance between marks. */
  const pitches = [...`${sheet} ${size}`.matchAll(/([\d.]+)px/g)]
    .map((m) => Number(m[1]))
    .filter((n) => n >= 2);
  const unique = [...new Set(pitches)].sort((a, b) => a - b);
  const [fine, ...rest] = unique;
  const speckle = /radial-gradient/.test(sheet);
  if (unique.length < 2) {
    check(
      `${theme}: its sheet states two pitches`,
      false,
      `found ${unique.join(", ") || "none"} — a tiled sheet is two strengths ` +
        "at two pitches, or it is a single lattice",
    );
    continue;
  }
  if (speckle) {
    const shared = rest.filter((p) => gcd(p, fine) !== 1);
    check(
      `${theme}: its speckle pitches are coprime (${unique.join(", ")}px)`,
      shared.length === 0,
      `${shared.join(", ")}px shares a factor with ${fine}px, so the two ` +
        "layers re-align every few tiles and the speckle resolves into a grid",
    );
  } else {
    const offBeat = rest.filter((p) => p % fine !== 0);
    check(
      `${theme}: its coarse pitch is a whole multiple of its fine one (${unique.join(", ")}px)`,
      offBeat.length === 0,
      `${offBeat.join(", ")}px does not divide by ${fine}px, so the coarse ` +
        "marks fall between the fine ones instead of on them",
    );
  }
}

/* ----------------------------------------------------------------------- */
/* 2. AND IT DOES NOT PAN                                                   */
/* ----------------------------------------------------------------------- */

console.log("\nthe sheet does not pan, and does not drift");

const SHEET_RULE = /\.af-canvas-sheet\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? "";

check(
  "the sheet is attached to the pane's own box",
  /background-attachment:\s*scroll\b/.test(SHEET_RULE) &&
    !/background-attachment:\s*(local|fixed)\b/.test(SHEET_RULE),
  "`local` glues the background to the scrolled CONTENT, which is the old " +
    "behaviour by another route; `fixed` glues it to the VIEWPORT, so the " +
    "sheet slides under the pane as the page scrolls. Only `scroll` pins it " +
    "to the pane itself",
);

check(
  "the sheet's origin is a constant, not something the camera can write",
  /background-position:\s*0 0;/.test(SHEET_RULE) &&
    !/background-position:[^;]*var\(/.test(SHEET_RULE),
  "a `background-position` fed from a custom property is a pan waiting to be " +
    "wired up — the sheet's origin is the pane's corner and nothing else",
);

/* THE DRIFT REGRESSION, named because it was real: the hero's miniature canvas
   animated its background-position by one cell, and a sheet that slides is the
   thing this change exists to stop being. */
const ANIMATES_SHEET = new RegExp(
  "@keyframes\\s+([\\w-]+)\\s*\\{[^@]*?background-position[^@]*?\\}\\s*\\}",
  "g",
);
const animated = [...CSS.matchAll(ANIMATES_SHEET)].map((m) => m[1]);
const sheetAnimations = animated.filter((name) =>
  new RegExp(`\\.af-canvas-sheet[^{]*\\{[^}]*animation:[^;]*${name}`, "s").test(
    CSS,
  ),
);
check(
  "nothing animates the sheet's position",
  sheetAnimations.length === 0,
  `${sheetAnimations.join(", ")} moves a background-position on the sheet — ` +
    "a drifting ground is a ground that pans, slowly",
);

/* ----------------------------------------------------------------------- */
/* 3. Opt-in: silent unless a theme has an argument                         */
/* ----------------------------------------------------------------------- */

/* A sheet has to be SEEN against its ground, but it is furniture rather than
   content, so the 3:1 non-text floor is the wrong instrument — every shipped
   grid in this app sits between 1.16:1 and 1.34:1 and is correct at that. What
   a ground must clear is visibility; what it must NOT clear is the ink drawn
   on top of it. */
const VISIBLE_MIN = 1.1;
/* And the two strengths must part from each other by more than they part from
   the ground, or the "coarse" one is just a slightly louder fine one. */
const INK_SEPARATION_MIN = 1.4;

console.log("\nthe sheet is silent unless a theme opts in");

const opted = [];
for (const theme of THEMES) {
  const tokens = tokensOf(CSS, theme) ?? baseline;
  const sheet = resolveToken("--canvas-sheet", tokens, baseline);
  const ink = resolveToken("--canvas-sheet-ink", tokens, baseline);
  const strong = resolveToken("--canvas-sheet-ink-strong", tokens, baseline);
  const repeat = resolveToken("--canvas-sheet-repeat", tokens, baseline);

  if (sheet === "none") {
    check(
      `${theme}: no sheet, and no ink left lying about`,
      ink === "transparent" && strong === "transparent",
      `--canvas-sheet is \`none\` but its inks are ${ink} / ${strong}; a theme ` +
        "that paints no texture must carry no ink for one, or the next edit " +
        "to the shared rule switches on a ground nobody chose",
    );
    continue;
  }
  if (repeat === "no-repeat") {
    check(
      `${theme}: one band, so exactly one ink`,
      ink !== "transparent" && strong === "transparent",
      `ink ${ink}, strong ${strong} — a single band is one highlight; a second ` +
        "strength on it is a texture wearing a band's declaration",
    );
  } else {
    check(
      `${theme}: a tiled sheet, so BOTH strengths rather than half of one`,
      ink !== "transparent" && strong !== "transparent",
      `ink ${ink}, strong ${strong} — a material tiled in one strength is the ` +
        "single-colour lattice this seam exists to move past",
    );
  }
  check(
    `${theme}: its sheet is drawn in its own ink tokens`,
    /var\(--canvas-sheet-ink\)/.test(sheet) &&
      (repeat === "no-repeat" ||
        /var\(--canvas-sheet-ink-strong\)/.test(sheet)),
    "the texture hardcodes a colour, so the values measured below are not the " +
      "values painted — the whole measurement would be of a token nobody uses",
  );
  opted.push({ theme, tokens, ink, strong, repeat });
}

console.log("\nwhere a theme sheets its ground, the sheet reads as material");

if (opted.length === 0) {
  check(
    "at least one theme exercises the seam",
    false,
    "every theme opted out — the mechanism is unused and unmeasured, which is " +
      "dead code carrying a check that proves nothing",
  );
}

/* THE CEILING IS RELATIVE, not absolute, and that is the point. `contrast`'s
   grid is nearly twice `midnight`'s in absolute terms and both are right,
   because each is read against its own theme's connector. What must never
   happen is a ground competing with the lines drawn ON it — so the bar is a
   fraction of the SAME theme's `--edge`. */
const INK_FRACTION_MAX = 0.6;

for (const { theme, tokens, ink, strong, repeat } of opted) {
  const ground = parseOklch(resolveToken("--canvas", tokens, baseline));
  const pen = parseOklch(resolveToken("--edge", tokens, baseline));
  const lo = parseOklch(ink);
  const hi = repeat === "no-repeat" ? null : parseOklch(strong);
  if (ground === null || lo === null || pen === null) {
    check(`${theme}: every sheet token resolves to a colour`, false, ink);
    continue;
  }
  const inked = contrast(pen.rgb, ground.rgb);
  const onGround = (c) => contrast(c.rgb, ground.rgb);
  const failed = [];
  if (onGround(lo) < VISIBLE_MIN)
    failed.push(`the fine ink is ${onGround(lo).toFixed(3)}:1 on the canvas`);
  if (onGround(lo) / inked > INK_FRACTION_MAX)
    failed.push(
      `the fine ink is ${((onGround(lo) / inked) * 100).toFixed(0)}% of --edge`,
    );
  if (hi !== null) {
    if (onGround(hi) < VISIBLE_MIN)
      failed.push(
        `the coarse ink is ${onGround(hi).toFixed(3)}:1 on the canvas`,
      );
    if (onGround(hi) / inked > INK_FRACTION_MAX)
      failed.push(
        `the coarse ink is ${((onGround(hi) / inked) * 100).toFixed(0)}% of ` +
          `its own --edge contrast, over ${INK_FRACTION_MAX * 100}% — a ground ` +
          "must stay under the ink drawn on it",
      );
    const apart = contrast(hi.rgb, lo.rgb);
    if (apart < INK_SEPARATION_MIN)
      failed.push(
        `the two strengths are ${apart.toFixed(3)}:1 apart, under ${INK_SEPARATION_MIN}`,
      );
    if (onGround(hi) <= onGround(lo))
      failed.push("the coarse ink is not the louder of the two");
  }
  const apart = hi === null ? null : contrast(hi.rgb, lo.rgb);
  check(
    `${theme}: fine ${onGround(lo).toFixed(3)}:1` +
      (hi === null
        ? " (one band)"
        : `, coarse ${onGround(hi).toFixed(3)}:1, apart ${apart.toFixed(3)}:1`),
    failed.length === 0,
    failed.join("; "),
  );
}

/* ----------------------------------------------------------------------- */
/* 4. The well itself, in every theme                                       */
/* ----------------------------------------------------------------------- */

console.log("\nthe well stays at or below the chrome it is set into");

/* THE RELATIONSHIP `--canvas` EXISTS FOR, and until this assertion nothing
   measured it. `globals.css` calls the token "the diagram well, deliberately
   below the chrome" and every theme sets it that way by hand — so the one
   property the token is named for was enforced by nobody, and lightening a
   ground far enough to invert it would have shipped green.
   AT OR BELOW, not strictly below: `midnight` and `contrast` set the well to
   their page colour exactly (a true-black OLED ground and a near-black
   accessibility ground), which is those palettes' own argument rather than a
   drift — a well recessed out of pure black would have to be LIGHTER than the
   page, which is the opposite of what the token means. Equality is the floor
   of the rule, not an exemption from it. */
for (const theme of THEMES) {
  const tokens = tokensOf(CSS, theme) ?? baseline;
  const well = parseOklch(resolveToken("--canvas", tokens, baseline));
  const chrome = parseOklch(resolveToken("--background", tokens, baseline));
  if (well === null || chrome === null) {
    check(`${theme}: --canvas and --background both resolve`, false);
    continue;
  }
  const wellLit = luminance(well.rgb);
  const chromeLit = luminance(chrome.rgb);
  const step = contrast(chrome.rgb, well.rgb);
  check(
    `${theme}: the well is ${wellLit <= chromeLit + 1e-9 ? `${step.toFixed(3)}:1 under` : "ABOVE"} its chrome`,
    wellLit <= chromeLit + 1e-9,
    "the diagram well is LIGHTER than the page it is set into, which inverts " +
      "the recess `--canvas` exists to draw — the drawing would read as " +
      "printed on top of the chrome rather than inset into it",
  );
}

console.log("\nevery theme's grid is visible, and quieter than its own ink");

/* `--canvas-grid` IS NO LONGER THE SHEET, and it is measured here anyway —
   more carefully than before, not less. It is the hairline the gantt's time
   ticks and the lifecycle's rail are drawn in, and those are drawn IN the
   diagram; nothing else measures them. Shipped spread is 0.14 (contrast) to
   0.44 (pastel); 0.6 leaves room to tune without licensing a grid that shouts. */
for (const theme of THEMES) {
  const tokens = tokensOf(CSS, theme) ?? baseline;
  const grid = parseOklch(resolveToken("--canvas-grid", tokens, baseline));
  const ground = parseOklch(resolveToken("--canvas", tokens, baseline));
  const pen = parseOklch(resolveToken("--edge", tokens, baseline));
  if (grid === null || ground === null || pen === null) {
    check(`${theme}: --canvas-grid, --canvas and --edge all resolve`, false);
    continue;
  }
  const seen = contrast(grid.rgb, ground.rgb);
  const inked = contrast(pen.rgb, ground.rgb);
  const fraction = seen / inked;
  const failed = [];
  if (seen < VISIBLE_MIN)
    failed.push(`${seen.toFixed(3)}:1 on its canvas, under ${VISIBLE_MIN}`);
  if (fraction > INK_FRACTION_MAX)
    failed.push(
      `${(fraction * 100).toFixed(0)}% of its own --edge contrast, over ` +
        `${INK_FRACTION_MAX * 100}% — a grid must stay under the ink drawn on it`,
    );
  check(
    `${theme}: grid ${seen.toFixed(3)}:1 on canvas, ${(fraction * 100).toFixed(0)}% of its ink`,
    failed.length === 0,
    failed.join("; "),
  );
}

/* ----------------------------------------------------------------------- */
/* 5. And the sheet is in no export                                         */
/* ----------------------------------------------------------------------- */

console.log("\nno exported file carries the sheet");

/* THE DECISION, AND IT SURVIVED THE REVERSAL RATHER THAN BEING INHERITED FROM
   IT. Making the ground the sheet is an argument that the ground is NOT part of
   the drawing — paper under the pencil, not a layer of it — so the case for
   keeping it out of a downloaded file got stronger, not weaker: an export is
   the drawing lifted off the sheet and set down on a slide. The backdrop rect
   every exporter paints is not a counter-example; that exists so dark strokes
   are legible on a viewer's black background, which is an obligation about
   READING the file rather than a claim that the ground is content. The line is
   the one `viewer/export/theme.ts` already draws for `roleTexture`: a role
   texture is content, because under `eink` it is the only thing telling a
   database from a queue; the canvas ground is chrome, because it says where the
   drawing is being read.
   IT USED TO BE FALSE IN ONE OF NINE. This section previously only grepped the
   `render-svg.ts` files, and eight of them are string builders that cannot
   carry what they never write — but `sequence/export/render-svg.ts` CLONES THE
   LIVE `<svg>`, so the in-drawing field went into every exported sequence
   diagram while the assertion passed. Moving the ground onto the pane closes
   that by construction, and this section now asserts the construction: the
   ground is not inside any drawing, so no clone can pick it up. */
for (const kind of KINDS.filter((kind) => kind !== "c4")) {
  const diagram = `src/features/${kind}/components/${kind}-diagram.tsx`;
  if (!existsSync(path.join(ROOT, diagram))) continue;
  check(
    `${kind}: its <svg> contains no ground for a clone to carry`,
    !/--canvas-sheet|<CanvasField\b/.test(readCode(diagram)),
    "the ground is back inside the drawing, so a DOM-cloning exporter ships " +
      "the screen's texture in the downloaded file — and it scales again",
  );
}
for (const kind of KINDS.filter((kind) => kind !== "c4")) {
  const exporter = `src/features/${kind}/export/render-svg.ts`;
  if (!existsSync(path.join(ROOT, exporter))) continue;
  check(
    `${kind}: its exporter draws no ground of its own`,
    !/--canvas-sheet|CanvasField/.test(readCode(exporter)),
    "the downloaded file would carry the screen's ground — decide that " +
      "deliberately and rewrite this assertion, do not let it drift in",
  );
}

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(
    `\n${failures} of ${assertions} canvas-grid assertion(s) FAILED`,
  );
  process.exit(1);
}
console.log(`\nAll ${assertions} canvas-grid assertions passed.`);

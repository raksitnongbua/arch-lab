#!/usr/bin/env node
/**
 * The canvas well's FIELD is legible, subordinate, and opt-in — measured.
 *
 * The well is ruled by three stacked React Flow `<Background>` layers (see
 * `editor/lib/canvas-constants.ts` for the mechanism and `globals.css` for the
 * policy). That is a new customisation surface, and `purpose.md` is explicit
 * about what one owes: a `check:*` proving every variant is complete and
 * legible, "in the manner of `check:themes`" — because "a half-populated option
 * is worse than no option: it ships a choice that makes the diagram look
 * broken".
 *
 * A ruled ground is opt-in, so "complete" here does NOT mean every theme sets
 * every token. It means two things instead, and this script proves both:
 *
 *   1. **THE DEFAULT IS UNTOUCHED.** A theme that does not opt in must resolve
 *      `--canvas-dot` to its own `--canvas-grid` and both rule tokens to
 *      `transparent` — byte-for-byte the single-strength dot field the canvas
 *      had before the seam existed. This is the assertion that lets the seam be
 *      added without re-auditing seven palettes, so it is the one that must not
 *      rot: a theme picking up a rule colour by accident (an alias pointed at
 *      the wrong token, a value pasted into `:root`) would put lines behind
 *      every diagram in a theme nobody was looking at.
 *   2. **WHERE IT IS USED, IT IS READABLE AS RULING.** Major and minor must be
 *      distinguishable FROM EACH OTHER — two rules a reader cannot tell apart
 *      is one rule drawn twice, which is the "renders monotone" failure
 *      `check:flowchart-palette` exists for — and each must be distinguishable
 *      from the canvas it is drawn on, or it is not there at all.
 *
 * AND IT CLOSES A GAP THAT PREDATES THE SEAM. Nothing measured `--canvas-grid`
 * at ALL. `check:dot-grid` looks like it does and does not: its floor is on
 * `--node-border`, the token the marketing dot field is configured to paint
 * with. So the grid on the actual diagram canvas — in every theme, for the
 * whole life of the project — was protected by nothing, and a theme whose grid
 * had been dimmed into invisibility or brightened over its own connectors would
 * have shipped green. Section 3 measures it in every theme.
 *
 * THE THEME LIST IS READ FROM `THEMES`, never typed here. `codebase.md`: a
 * check written from a hand-listed set "cannot notice the thing it has never
 * heard of". A ninth theme is measured by this script on the day it is
 * declared, whether or not anyone remembers this file.
 *
 * Exits non-zero on any failure. Run with: pnpm check:canvas-grid
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { contrast, parseOklch } from "./lib/oklch.mjs";
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

const THEMES = [
  ...(/export const THEMES = \[([^\]]*)\]/.exec(CONSTANTS)?.[1] ?? "").matchAll(
    /"([a-z-]+)"/g,
  ),
].map((m) => m[1]);

const baseline = tokensOf(CSS, "light");

/* ----------------------------------------------------------------------- */
/* 0. The field is MOUNTED — for every kind, on the page the reader opens    */
/* ----------------------------------------------------------------------- */

/* THIS IS THE SECTION WHOSE ABSENCE SHIPPED THE BUG. The first version of this
   script measured token VALUES and the one renderer it knew about, and passed
   with 70 green assertions while eight of the nine notations drew no field at
   all — `<Background>` existed in exactly one file, the C4 editor, and nothing
   asserted that any other canvas painted anything. A palette check that never
   asks "is this on the page?" cannot notice a grid nobody can see.

   DERIVED FROM THE KIND TABLE, never a hand-listed nine — the same source
   `check:canvas-chrome` uses for the well's colour, and for the same reason:
   `KIND_BLURB` is a total `Record<SeedKind, string>`, so a tenth notation
   cannot compile without a row in it. A tenth kind therefore fails HERE, on
   the day it is declared, rather than shipping fieldless. */

console.log("every notation actually paints the field");

/* COMMENTS STRIPPED, the `theme-check.mjs` precaution: each pattern below is
   also described in prose beside the code it pins, so a scan over raw source
   would match the sentence and pass with the code deleted. */
const readCode = (rel) =>
  readFileSync(path.join(ROOT, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const KINDS = [
  ...readCode("src/features/playground/lib/kind-copy.ts").matchAll(
    /^ {2}([a-z][a-z0-9]*):\s*$|^ {2}([a-z][a-z0-9]*): "/gm,
  ),
]
  .map((match) => match[1] ?? match[2])
  .filter((kind) => kind !== undefined);

check(
  `the kind table still yields every notation (${KINDS.length})`,
  KINDS.length >= 9,
  `only ${KINDS.length} kind(s) parsed out of \`kind-copy.ts\` — every ` +
    "assertion below would be passing vacuously over a short list",
);

/* THE THREE LAYERS, AND THE TOKEN EACH ONE PAINTS. Both mechanisms are held to
   the same table: React Flow's `<Background>` for the two C4 hosts, and the
   in-SVG `<CanvasField>` for the other eight. */
const LAYERS = [
  ["--canvas-dot", "canvas-dots"],
  ["--canvas-rule", "canvas-rule-minor"],
  ["--canvas-rule-major", "canvas-rule-major"],
];

/* C4 IS BOTH REACT FLOW HOSTS, and it is two rather than one because the
   VIEWER had no field for its entire life — the editor's grid made the gap
   invisible to anyone developing with a model open. A kind is not covered
   until every surface that draws it is. */
const C4_HOSTS = [
  "src/features/editor/components/canvas.tsx",
  "src/features/viewer/components/viewer-canvas.tsx",
];

for (const host of C4_HOSTS) {
  const code = readCode(host);
  const missing = LAYERS.filter(
    ([token, id]) =>
      !new RegExp(`id="${id}"[\\s\\S]{0,300}?color="var\\(${token}\\)"`).test(
        code,
      ),
  ).map(([, id]) => id);
  check(
    `c4: ${host.split("/").pop()} mounts all three <Background> layers`,
    missing.length === 0,
    `missing ${missing.join(", ")} — this React Flow canvas draws no field, ` +
      "which is exactly the state the C4 viewer shipped in",
  );
  const ids = [...code.matchAll(/<Background[\s\S]{0,80}?id="([a-z-]+)"/g)].map(
    (m) => m[1],
  );
  check(
    `c4: ${host.split("/").pop()} gives every layer a distinct id`,
    ids.length === 3 && new Set(ids).size === 3,
    `ids: ${ids.join(", ") || "none"} — React Flow keys its <pattern> off the ` +
      "id, so a duplicate makes both layers paint one colour",
  );
}

/* THE OTHER EIGHT draw plain SVG and carry the field inside their own `<svg>`,
   in the drawing's coordinates. The file name is derived from the kind, the
   same convention `check:canvas-chrome` relies on. */
for (const kind of KINDS.filter((kind) => kind !== "c4")) {
  const diagram = `src/features/${kind}/components/${kind}-diagram.tsx`;
  if (!existsSync(path.join(ROOT, diagram))) {
    check(
      `${kind}: its diagram component is where the convention says`,
      false,
      `expected ${diagram} — this notation is in the kind table but its ` +
        "drawing surface is not where every other kind's is",
    );
    continue;
  }
  const code = readCode(diagram);
  check(
    `${kind}: its <svg> mounts the shared field`,
    /<CanvasField\b/.test(code),
    "this diagram paints no field, so its well is bare in every theme — the " +
      "defect this section exists for. The field belongs INSIDE the <svg>: a " +
      "ground on the pane detaches, because this canvas pans, scrolls or zooms",
  );
}

/* AND THE FIELD IS NOT IN ANY EXPORT. Screen chrome, not diagram content: it
   says where a drawing is being read, not what it means, and a diagram dropped
   into a deck should arrive as the drawing. It holds today by CONSTRUCTION —
   every exporter is a separate string builder that imports layout only — and
   this assertion is what stops the two renderers quietly converging. */
for (const kind of KINDS.filter((kind) => kind !== "c4")) {
  const exporter = `src/features/${kind}/export/render-svg.ts`;
  if (!existsSync(path.join(ROOT, exporter))) continue;
  const code = readCode(exporter);
  check(
    `${kind}: its exporter carries no field`,
    !/CanvasField|--canvas-rule|--canvas-dot/.test(code),
    "the downloaded file would carry the screen's grid — decide that " +
      "deliberately and rewrite this assertion, do not let it drift in",
  );
}

console.log("\nthe field's geometry is one definition");

{
  const constants = readCode("src/features/editor/lib/canvas-constants.ts");
  const step = /CANVAS_RULE_MAJOR_STEP = (\d+(?:\.\d+)?)/.exec(constants)?.[1];
  check(
    `the major rule falls on a whole multiple of the minor pitch (every ${step})`,
    step !== undefined && Number.isInteger(Number(step)) && Number(step) > 1,
    `CANVAS_RULE_MAJOR_STEP is ${step ?? "absent"} — a fractional step puts ` +
      "heavy lines BETWEEN light ones rather than on them, which reads as moire",
  );
  const minor = Number(
    /CANVAS_RULE_WIDTH = (\d+(?:\.\d+)?)/.exec(constants)?.[1],
  );
  const major = Number(
    /CANVAS_RULE_MAJOR_WIDTH = (\d+(?:\.\d+)?)/.exec(constants)?.[1],
  );
  check(
    `the major rule is drawn heavier than the minor (${major} vs ${minor})`,
    Number.isFinite(minor) && Number.isFinite(major) && major > minor,
    "a ruled sheet separates its two rules by WEIGHT first; colour alone makes " +
      "the major line merely a lighter minor line",
  );
  /* ONE PITCH FOR BOTH MECHANISMS. The in-SVG field and React Flow's layers
     must tile identically or a reader changing notation sees the grid change
     size, so both read these constants rather than typing a number. */
  check(
    "the shared in-SVG field reads the same constants React Flow does",
    /CANVAS_FIELD_GAP|CANVAS_RULE_MAJOR_STEP/.test(
      readCode("src/components/ui/canvas-field.tsx"),
    ),
    "components/ui/canvas-field.tsx hardcodes its geometry — the eight SVG " +
      "notations would rule at a different pitch from the two C4 canvases",
  );
}

/* ----------------------------------------------------------------------- */
/* 1 + 2. Opt-in: silent by default, legible where used                     */
/* ----------------------------------------------------------------------- */

/* A rule has to be SEEN against its ground, but it is furniture rather than
   content, so the 3:1 non-text floor is the wrong instrument — every shipped
   grid in this app sits between 1.16:1 and 1.34:1 and is correct at that. What
   a grid line must clear is visibility; what it must NOT clear is the ink drawn
   on top of it. */
const VISIBLE_MIN = 1.1;
/* And the two rules must part from each other by more than they part from the
   ground, or the "major" is just a slightly brighter minor. */
const RULE_SEPARATION_MIN = 1.4;

console.log("\nthe rule layers are silent unless a theme opts in");

const opted = [];
for (const theme of THEMES) {
  const tokens = tokensOf(CSS, theme) ?? baseline;
  const dot = resolveToken("--canvas-dot", tokens, baseline);
  const grid = resolveToken("--canvas-grid", tokens, baseline);
  const minor = resolveToken("--canvas-rule", tokens, baseline);
  const major = resolveToken("--canvas-rule-major", tokens, baseline);

  const rules = [minor, major].filter((v) => v !== "transparent");
  if (rules.length === 0) {
    check(
      `${theme}: unchanged — dots in its own --canvas-grid, no ruling`,
      dot === grid,
      `--canvas-dot resolves to ${dot} but --canvas-grid is ${grid}; a theme ` +
        `that opts out must paint exactly the field it painted before the seam`,
    );
    continue;
  }
  check(
    `${theme}: opts in, and sets BOTH rules rather than half of one`,
    minor !== "transparent" && major !== "transparent",
    `minor ${minor}, major ${major} — a sheet ruled in one strength is the ` +
      `single-colour grid the seam exists to move past`,
  );
  opted.push({ theme, tokens, dot, minor, major });
}

console.log("\nwhere a theme rules its ground, the ruling reads as ruling");

if (opted.length === 0) {
  check(
    "at least one theme exercises the seam",
    false,
    "every theme opted out — the mechanism is unused and unmeasured, which is " +
      "dead code carrying a check that proves nothing",
  );
}

for (const { theme, tokens, dot, minor, major } of opted) {
  const ground = parseOklch(resolveToken("--canvas", tokens, baseline));
  const ink = parseOklch(resolveToken("--edge", tokens, baseline));
  const lo = parseOklch(minor);
  const hi = parseOklch(major);
  if (ground === null || lo === null || hi === null || ink === null) {
    check(`${theme}: every rule token resolves to a colour`, false, minor);
    continue;
  }
  const onGround = (c) => contrast(c.rgb, ground.rgb);
  const failed = [];
  if (onGround(lo) < VISIBLE_MIN)
    failed.push(`minor is ${onGround(lo).toFixed(3)}:1 on the canvas`);
  if (onGround(hi) < VISIBLE_MIN)
    failed.push(`major is ${onGround(hi).toFixed(3)}:1 on the canvas`);
  const apart = contrast(hi.rgb, lo.rgb);
  if (apart < RULE_SEPARATION_MIN)
    failed.push(
      `major/minor is ${apart.toFixed(3)}:1, under ${RULE_SEPARATION_MIN}`,
    );
  if (onGround(hi) <= onGround(lo))
    failed.push("the major rule is not the louder of the two");
  /* A dot field AND a ruling in one well is two grids, not a ruled sheet. */
  if (dot !== "transparent")
    failed.push(
      `--canvas-dot is ${dot}: dots at the minor pitch land on the rule ` +
        `intersections and read as beads on it`,
    );
  check(
    `${theme}: minor ${onGround(lo).toFixed(3)}:1, major ${onGround(hi).toFixed(3)}:1, ` +
      `apart ${apart.toFixed(3)}:1`,
    failed.length === 0,
    failed.join("; "),
  );
}

/* ----------------------------------------------------------------------- */
/* 3. The gap: --canvas-grid itself, in every theme                         */
/* ----------------------------------------------------------------------- */

console.log("\nevery theme's grid is visible, and quieter than its own ink");

/* THE CEILING IS RELATIVE, not absolute, and that is the point. `contrast`'s
   grid is nearly twice `midnight`'s in absolute terms and both are right,
   because each is read against its own theme's connector. What must never
   happen is a grid competing with the lines drawn ON it — so the bar is a
   fraction of the SAME theme's `--edge`. Shipped spread is 0.14 (contrast) to
   0.44 (pastel); 0.6 leaves room to tune without licensing a grid that shouts. */
const INK_FRACTION_MAX = 0.6;

for (const theme of THEMES) {
  const tokens = tokensOf(CSS, theme) ?? baseline;
  const grid = parseOklch(resolveToken("--canvas-grid", tokens, baseline));
  const ground = parseOklch(resolveToken("--canvas", tokens, baseline));
  const ink = parseOklch(resolveToken("--edge", tokens, baseline));
  if (grid === null || ground === null || ink === null) {
    check(`${theme}: --canvas-grid, --canvas and --edge all resolve`, false);
    continue;
  }
  const seen = contrast(grid.rgb, ground.rgb);
  const inked = contrast(ink.rgb, ground.rgb);
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

if (failures > 0) {
  console.error(
    `\n${failures} of ${assertions} canvas-grid assertion(s) FAILED`,
  );
  process.exit(1);
}
console.log(`\nAll ${assertions} canvas-grid assertions passed.`);

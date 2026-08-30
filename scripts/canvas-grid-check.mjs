#!/usr/bin/env node
/**
 * The ground under a diagram is legible, subordinate, ATTACHED, and adaptive —
 * measured, over the app's real zoom range.
 *
 * THE PROPERTY THIS SCRIPT EXISTS FOR, and the reason it is one function over a
 * range rather than a set of greps: **the on-screen pitch never leaves the
 * band**. Two shipped models failed exactly that and both passed a check suite.
 *
 *   1. A world-space grid at ONE pitch. It multiplied by the camera without
 *      limit — 0.8px at the 10% clamp, 64px at the 400% one, a 40× spread — so
 *      the ground was a grey wash at one end and four lines on a page at the
 *      other. Every assertion about its COLOUR was green throughout.
 *   2. A screen-space grid, fixed. The pitch was then always comfortable and
 *      the ground stopped moving with the drawing, so panning slid the diagram
 *      across a stationary field.
 *
 * So section 1 loads `lib/canvas-ground.ts` — the real module, not a copy — and
 * sweeps it across `MIN_ZOOM`…`MAX_ZOOM` read from `canvas-constants.ts`. A
 * ladder that stops covering the range fails on arithmetic, not on a regex that
 * knows a variable's name.
 *
 * AND IT HOLDS THE TWO-LAYER SPLIT, which is the finding the second model lost.
 * A RULE is measurement: it lives in the drawing's space and subdivides. A
 * MATERIAL is the sheet: paper fibre does not get finer when you lean in, so it
 * is fixed in sheet space and must be provably unaffected by pan and zoom.
 * Section 4 measures that the material layer scales with nothing.
 *
 * KEPT FROM THE PREVIOUS MODEL, unchanged in value: the per-theme visibility
 * floor (1.1:1), the ≤60%-of-`--edge` ceiling, the well-below-chrome assertion,
 * and the mount assertion derived from `KIND_BLURB`. No floor and no ceiling was
 * moved to make this change pass.
 *
 * RETIRED, and said out loud rather than quietly dropped: the 1.4:1 major/minor
 * SEPARATION floor. It was calibrated on two independently chosen colour
 * tokens; the ladder paints ONE ink at two alphas, which cannot reach 1.4:1
 * against itself by construction. Section 3 asserts the three channels that
 * replace it — alpha, stroke weight, and a 5× difference in pitch.
 *
 * THE THEME LIST IS READ FROM `THEMES`, never typed here. A ninth theme is
 * measured on the day it is declared, whether or not anyone remembers this file.
 *
 * Exits non-zero on any failure. Run with: pnpm check:canvas-grid
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { contrast, flatten, luminance, parseOklch } from "./lib/oklch.mjs";
import { resolveToken, tokensOf } from "./lib/theme-css.mjs";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const CSS = read("src/app/globals.css");
const CONSTANTS = read("src/lib/constants.ts");

/* THE REAL MODULE, loaded through Node's type stripping. `codebase.md`: a check
   loads the library code the app ships rather than a copy of it, or it measures
   a second implementation that agrees with nothing. */
const ground = await import("../src/lib/canvas-ground.ts");

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

/* COMMENTS STRIPPED, the `theme-check.mjs` precaution: each pattern below is
   also described in prose beside the code it pins, so a scan over raw source
   would match the sentence and pass with the code deleted. */
const readCode = (rel) =>
  readFileSync(path.join(ROOT, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/* ----------------------------------------------------------------------- */
/* 1. THE LADDER COVERS THE ZOOM RANGE, and never leaves the band           */
/* ----------------------------------------------------------------------- */

console.log("the on-screen pitch never leaves the readable band");

/* THE CLAMPS ARE READ, NOT TYPED. Two cameras in this app have different ones
   (the editor goes to 400%, the C4 viewer to 250%), and the ladder has to cover
   the widest range any of them can reach. Reading both means a clamp widened
   tomorrow re-tests the ladder on the day it moves. */
const ZOOM_SOURCES = [
  "src/features/editor/lib/canvas-constants.ts",
  "src/features/viewer/lib/canvas-constants.ts",
  "src/components/ui/use-canvas-zoom.ts",
];
const clamps = [];
for (const rel of ZOOM_SOURCES) {
  const code = readCode(rel);
  const lo = /(?:MIN_ZOOM|ZOOM_MIN) = (\d+(?:\.\d+)?)/.exec(code)?.[1];
  const hi = /(?:MAX_ZOOM|ZOOM_MAX) = (\d+(?:\.\d+)?)/.exec(code)?.[1];
  if (lo !== undefined && hi !== undefined) {
    clamps.push({ rel, lo: Number(lo), hi: Number(hi) });
  }
}
check(
  `every camera's clamp was found (${clamps.length} of ${ZOOM_SOURCES.length})`,
  clamps.length === ZOOM_SOURCES.length,
  "a clamp that cannot be parsed is a stretch of zoom the sweep below never " +
    "visits, which is precisely how the last two ground models passed green",
);
const MIN_ZOOM = Math.min(...clamps.map((c) => c.lo));
const MAX_ZOOM = Math.max(...clamps.map((c) => c.hi));

/* A GEOMETRIC sweep, not a linear one. The ladder is a ratio machine — every
   interesting event in it (a level entering the band, a fade starting) happens
   at a multiplicative step — so linear samples would crowd the top of the range
   and skip most of the bottom, where the first model actually failed. */
const SAMPLES = 4000;
const zoomAt = (i) => MIN_ZOOM * (MAX_ZOOM / MIN_ZOOM) ** (i / (SAMPLES - 1));

const outOfBand = [];
const bare = [];
const negative = [];
let quietest = { zoom: null, ink: Infinity };
let coarsest = 0;
let finest = Infinity;
for (let i = 0; i < SAMPLES; i += 1) {
  const zoom = zoomAt(i);
  const levels = ground.groundLevels(zoom);
  if (levels.length === 0) {
    bare.push(zoom);
    continue;
  }
  let ink = 0;
  for (const level of levels) {
    if (
      level.screenPitch < ground.GROUND_BAND_MIN_PX - 1e-9 ||
      level.screenPitch > ground.GROUND_BAND_MAX_PX + 1e-9
    ) {
      outOfBand.push(`${zoom.toFixed(3)}× → ${level.screenPitch.toFixed(2)}px`);
    }
    if (level.index < 0) negative.push(`${zoom.toFixed(3)}×`);
    ink += level.opacity;
    coarsest = Math.max(coarsest, level.screenPitch);
    finest = Math.min(finest, level.screenPitch);
  }
  if (ink < quietest.ink) quietest = { zoom, ink };
}

check(
  `the ladder paints something at every zoom in ${MIN_ZOOM}×–${MAX_ZOOM}×`,
  bare.length === 0,
  `${bare.length} sampled zooms had NO level in the band (first: ` +
    `${bare[0]?.toFixed(3)}×) — the reader loses the ground entirely there`,
);
check(
  `every painted level lands in ${ground.GROUND_BAND_MIN_PX}–${ground.GROUND_BAND_MAX_PX}px ` +
    `(observed ${finest.toFixed(2)}–${coarsest.toFixed(2)}px)`,
  outOfBand.length === 0,
  `${outOfBand.length} out-of-band levels, e.g. ${outOfBand.slice(0, 3).join(", ")} — ` +
    "this is the single property both previous ground models failed",
);
/* THE FLOOR IS A PROPERTY OF THE MODULE, NOT OF TODAY'S CLAMPS. A rung below
   level 0 cannot reach the band under about 5× magnification, so the app's own
   0.1–4 sweep can never exercise the clamp — it would pass with the clamp
   deleted. So the module is asked directly, over a range far wider than any
   camera can reach: no scale, however absurd, may produce a rule finer than the
   grid the drawing snaps to, because that offers a precision the document
   cannot express. */
{
  const wild = [];
  for (let i = 0; i <= 600; i += 1) {
    const scale = 0.001 * 10 ** (i / 100);
    for (const level of ground.groundLevels(scale)) {
      if (level.index < 0) wild.push(`${scale.toFixed(3)}×`);
    }
  }
  check(
    "the ladder never goes finer than the grid the drawing snaps to",
    negative.length === 0 && wild.length === 0,
    `negative rungs at ${[...negative, ...wild].slice(0, 3).join(", ")}`,
  );
}
/* The FLOOR of the cross-fade. Mid-transition each of the two visible levels is
   faint, and what must hold is that the SUM never collapses — otherwise there
   is a zoom at which the ground blinks out and back. Compared against a single
   settled minor level, which is the quietest state the ladder ever rests in. */
check(
  `the cross-fade never dips below one settled minor level ` +
    `(quietest total ${quietest.ink.toFixed(3)} at ${quietest.zoom?.toFixed(3)}×)`,
  quietest.ink >= ground.GROUND_MINOR_OPACITY,
  `total ink falls to ${quietest.ink.toFixed(3)}, under ` +
    `${ground.GROUND_MINOR_OPACITY} — the ground visibly thins as the reader ` +
    "zooms through that point, which is the artefact the fade exists to hide",
);
/* THE 40× SPREAD, NAMED. The first model's on-screen pitch ranged over
   MAX_ZOOM/MIN_ZOOM; the band's own ratio is the ceiling this replaces it with,
   and stating it as a bound makes a widened band fail here rather than in a
   reader's eye. */
check(
  `the on-screen pitch spans ${(coarsest / finest).toFixed(1)}×, not ` +
    `${(MAX_ZOOM / MIN_ZOOM).toFixed(0)}×`,
  coarsest / finest <=
    ground.GROUND_BAND_MAX_PX / ground.GROUND_BAND_MIN_PX + 1e-9,
  "the spread exceeds the band it is supposed to be confined to",
);

/* THE LADDER STEP MUST BE A WHOLE MULTIPLE. A fractional step puts a coarse
   level's heavy lines BETWEEN the fine ones rather than on them, which reads as
   moire rather than as ruling — the same requirement the single-pitch model had
   between its minor and major rules, carried forward. */
/* AND THE BAND ITSELF IS BOUNDED, because every assertion above reads the band
   from the module and would therefore bless any band at all — widen it to
   8–900px and the sweep goes green while the reader gets model one back. So
   these two numbers are absolute, and they are the only absolute numbers in
   this file. They are not the approved values (8 and 90) restated, which would
   forbid tuning; they are the outer limits of the claim "this is a field of
   divisions": under ~4px a pitch stops resolving into divisions and reads as
   tone, and over ~160px there are too few cells across a pane for the eye to
   read a lattice at all — it is four lines on a page. Moving either needs the
   argument written here replaced, not the number edited. */
check(
  `the band stays inside what reads as a field (${ground.GROUND_BAND_MIN_PX}–${ground.GROUND_BAND_MAX_PX}px)`,
  ground.GROUND_BAND_MIN_PX >= 4 && ground.GROUND_BAND_MAX_PX <= 160,
  "a band this wide makes every assertion above vacuous — they all measure " +
    "against the band, so widening it is how model one comes back green",
);
check(
  `each rung is a whole multiple of the last (×${ground.GROUND_RATIO})`,
  Number.isInteger(ground.GROUND_RATIO) && ground.GROUND_RATIO > 1,
  `GROUND_RATIO is ${ground.GROUND_RATIO}`,
);
/* AND THE BAND MUST BE WIDER THAN THE STEP, or a level can leave before its
   successor arrives and the ground steps rather than fades. */
check(
  `the band (${(ground.GROUND_BAND_MAX_PX / ground.GROUND_BAND_MIN_PX).toFixed(2)}×) ` +
    `is wider than the ladder step (${ground.GROUND_RATIO}×)`,
  ground.GROUND_BAND_MAX_PX / ground.GROUND_BAND_MIN_PX > ground.GROUND_RATIO,
  "levels cannot overlap, so the ground changes pitch in a jump",
);

/* ----------------------------------------------------------------------- */
/* 2. THE LADDER IS MOUNTED — every notation, one model, two mechanisms      */
/* ----------------------------------------------------------------------- */

console.log("\nevery notation paints the ladder, and none paints its own");

/* DERIVED FROM THE KIND TABLE, never a hand-listed nine — the same source
   `check:canvas-chrome` uses for the well's colour. `KIND_BLURB` is a total
   `Record<SeedKind, string>`, so a tenth notation cannot compile without a row
   in it and therefore fails HERE on the day it is declared, rather than
   shipping groundless. */
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

const C4_HOSTS = [
  "src/features/editor/components/canvas.tsx",
  "src/features/viewer/components/viewer-canvas.tsx",
];
for (const host of C4_HOSTS) {
  const code = readCode(host);
  const name = host.split("/").pop();
  check(
    `c4: ${name} mounts the shared ladder`,
    /<CanvasGroundLayers\s*\/>/.test(code),
    "this React Flow canvas paints no ground, which is exactly the state the " +
      "C4 viewer shipped in for its whole life",
  );
  /* A HOST MUST NOT KEEP A `<Background>` OF ITS OWN. This is the assertion
     that would have caught the first model: a fixed-gap layer left behind
     beside the ladder paints a second grid at a pitch nothing adapts. */
  check(
    `c4: ${name} keeps no <Background> of its own`,
    !/<Background\b/.test(code),
    "a hand-mounted <Background> has a fixed `gap`, so its on-screen pitch is " +
      "`gap × zoom` — unbounded, which is model one",
  );
}

const groundLayers = readCode("src/components/ui/canvas-ground-layers.tsx");
check(
  "the React Flow layers read the shared ladder, and the live viewport",
  /groundLevels\(/.test(groundLayers) && /useViewport\(\)/.test(groundLayers),
  "canvas-ground-layers.tsx either invents its own pitches or reads a zoom " +
    "that does not re-render — a ground frozen at the last unrelated render",
);
check(
  "the React Flow layers mount BOTH shapes, so a theme decides in CSS",
  /BackgroundVariant\.Dots/.test(groundLayers) &&
    /BackgroundVariant\.Lines/.test(groundLayers) &&
    /var\(--canvas-rule-dot\)/.test(groundLayers) &&
    /var\(--canvas-rule-line\)/.test(groundLayers),
  "one shape is missing, so a theme that rules in the other gets a bare well " +
    "— or the shape is being picked in JavaScript, which cannot be right on " +
    "the first frame",
);

/* THE OTHER EIGHT PAINT THE PANE, NOT THE DRAWING — and that REVERSES a
   decision this branch recorded, so it is asserted in both directions.

   The ladder used to be a `<rect>` sized to the diagram's own box, inside its
   `<svg>`, on the argument that a finite drawing on a ruled sheet is what a
   sheet of paper is. That argument is about the DOCUMENT; the ground is the
   SHEET, and a sheet does not stop where the drawing stops. A pane half ruled
   and half bare reads as a rendering fault, and it made changing notation
   change whether the paper reached the edges — while C4, the canvas most people
   open first, always filled its pane. So: the ground fills the well in all
   nine, and no drawing carries one. */
const paneGround = [];
for (const kind of KINDS.filter((kind) => kind !== "c4")) {
  const viewer = `src/features/${kind}/components/${kind}-viewer.tsx`;
  const diagram = `src/features/${kind}/components/${kind}-diagram.tsx`;
  if (
    !existsSync(path.join(ROOT, viewer)) ||
    !existsSync(path.join(ROOT, diagram))
  ) {
    check(
      `${kind}: its viewer and diagram are where the convention says`,
      false,
    );
    continue;
  }
  /* IMPORT LINES STRIPPED. A constant that is imported and never used reads
     identically to one that is used, and deleting the usage is the one-line
     way this regresses — it was the mutation that first passed here. */
  const viewerCode = readCode(viewer).replace(/^import[\s\S]*?;$/gm, "");
  paneGround.push(kind);
  check(
    `${kind}: its PANE paints the ladder, at its own camera's scale`,
    /CANVAS_RULE_CLASS/.test(viewerCode) &&
      /groundFieldCss\([A-Za-z.]+\)/.test(viewerCode),
    "this viewer paints no ground, or paints one with no idea what scale it " +
      "is read at — a ladder that cannot adapt. The ground belongs on the " +
      "SCROLL PANE: on the drawing it stops at the drawing's edge, and on a " +
      "non-scrolling ancestor it stops moving with the drawing",
  );
  check(
    `${kind}: its DRAWING carries no ground of its own`,
    !/CanvasField|canvas-rule-dot|canvas-rule-line/.test(readCode(diagram)),
    "a ground inside the `<svg>` is clipped to the drawing's box, which is the " +
      "half-ruled pane this reversal exists to end — and on the sequence " +
      "canvas it would also be cloned into every exported file twice over",
  );
}
check(
  `all eight non-C4 notations ground their pane (${paneGround.length})`,
  paneGround.length === 8,
  `only ${paneGround.join(", ")} — a notation missing here is measured by ` +
    "nothing above",
);

/* THE DIAGRAM GETS A BACKGROUND, AND IT IS A PANEL.
   A ground that fills the pane runs under every drawing, and a drawing sitting
   straight on it has no edge. The surface is one shared component —
   `DiagramSurface` on screen, `diagramSurfaceMarkup` in the exporters —
   mounted by the three kinds below, and it is now `--node` filled and
   `--node-border` ruled: the dictionary's panel, the pair every canvas here
   already uses for a shape against its background. It was a line-only `--border`
   rule with an optional per-theme translucent wash; `lib/diagram-surface.ts`
   carries the whole history and the panel section further down carries the
   arithmetic.

   ASSERTED IN BOTH PLACES, because a screen surface with no exported twin is a
   download that does not look like the screen.

   THESE REPLACE A PAIR THAT HAD GONE STALE TWICE: first grepping for a
   gantt-only `rx={12}` markup shape that stopped existing when the surface
   became shared, then grepping for the wash tokens that stopped existing when
   it became a panel. Both times the assertion kept passing on the wrong thing
   or was ready to. */
const SURFACE_KINDS = ["timeline", "gantt", "lifecycle"];
{
  for (const kind of SURFACE_KINDS) {
    /* IMPORT LINES STRIPPED, the same precaution the pane-ground checks take
       above: a `DiagramSurface` imported and never rendered reads identically
       to one that is rendered, and deleting the usage is the one-line way this
       regresses. */
    const diagramCode = readCode(
      `src/features/${kind}/components/${kind}-diagram.tsx`,
    ).replace(/^import[\s\S]*?;$/gm, "");
    check(
      `${kind}: its drawing sits on the shared surface, not in a hole in the ground`,
      /<DiagramSurface\s/.test(diagramCode),
      "the drawing lost its sheet — on `blueprint` the frame is quieter than " +
        "the ruling, so without the surface the diagram area reads as nothing",
    );
    /* FROM THE THEME, NOT FROM A LITERAL, and both halves of the pair: an
       exporter that resolved only the fill would download a panel with no
       edge, which is precisely the mark the panel depends on. */
    const exportCode = readCode(`src/features/${kind}/export/render-svg.ts`);
    check(
      `${kind}: the exported file carries the same panel, from the theme`,
      /diagramSurfaceMarkup\(\{[\s\S]{0,240}?stroke:\s*theme\.nodeBorder/.test(
        exportCode,
      ) &&
        /diagramSurfaceMarkup\(\{[\s\S]{0,240}?fill:\s*theme\.node\b/.test(
          exportCode,
        ),
      "the download paints its diagram surface from something other than the " +
        "resolved `--node` / `--node-border` pair, so a downloaded file stops " +
        "agreeing with the screen that produced it",
    );
  }
  /* AND THE SEAM IS TOKENS, NEVER LITERALS. The screen twin and the exporter
     resolve the same two custom properties; a literal on either side is a
     canvas that stops following the theme AND a screen that stops agreeing
     with its own download. */
  {
    const seam = readCode("src/components/ui/diagram-surface.tsx");
    check(
      "the surface paints the panel from the tokens, on both halves",
      /fill="var\(--node\)"/.test(seam) &&
        /stroke="var\(--node-border\)"/.test(seam),
      "`DiagramSurface` hardcodes its panel (or paints only half of it), so a " +
        "theme change moves the export and leaves the screen behind",
    );
    /* THE GEOMETRY IS STILL THE SHARED ONE. A panel drawn at a hand-typed box
       is the bug `DIAGRAM_SURFACE_PAD` exists for — a stroked edge landing on
       the drawing's own text — and it would look correct in whichever pane its
       author checked. */
    check(
      "the surface takes its box from the shared `diagramSurfaceBox`",
      /diagramSurfaceBox\(/.test(seam) &&
        /rx=\{DIAGRAM_SURFACE_RADIUS\}/.test(seam),
      "`DiagramSurface` derives its own geometry, so the screen and the three " +
        "exporters can frame one drawing two different ways",
    );
    /* AND THE DICTIONARY CUTS THE SAME CORNER. Its panel is per-SECTION rather
       than per-drawing, so it does not share the box — but the radius was a
       hand-typed `10` in its canvas and a second one in its exporter, and the
       surface adopting the dictionary's treatment is exactly the moment those
       stop being allowed to drift apart. `dry.md`: a value that exists in one
       place is interpolated, never retyped. */
    for (const rel of [
      "src/features/dict/components/dict-diagram.tsx",
      "src/features/dict/export/render-svg.ts",
    ]) {
      const dictCode = readCode(rel);
      check(
        `${rel.split("/").pop()}: its panel cuts the shared corner`,
        /DIAGRAM_SURFACE_RADIUS/.test(dictCode),
        "the dictionary's section panel hand-types its corner radius, so the " +
          "dictionary and the three sheet-mounting notations — which now draw " +
          "the same `--node` on `--node-border` panel — can round differently",
      );
    }
  }
  /* AND NO KIND CUTS A HOLE. `--canvas` painted over the ground inside a
     drawing is a clearing, which puts a hard edge on the sheet exactly where
     the drawing's edge already is. */
  for (const kind of KINDS.filter((kind) => kind !== "c4")) {
    const diagram = `src/features/${kind}/components/${kind}-diagram.tsx`;
    if (!existsSync(path.join(ROOT, diagram))) continue;
    const code = readCode(diagram);
    const knockout =
      /<rect[^>]*width=\{layout\.width\}[^>]*fill="var\(--canvas\)"/.test(code);
    check(
      `${kind}: it does not cut a hole in the ground`,
      !knockout,
      "a full-bleed `--canvas` rect inside the drawing hides the sheet under " +
        "it — the ground apologising for existing. Give the drawing a surface " +
        "instead, the way gantt and dict do",
    );
  }
}

console.log(
  "\nevery theme's diagram panel is complete, and nothing is lost on it",
);

/* THE SURFACE IS A CUSTOMISATION SURFACE, so it gets a check that measures
   EVERY theme rather than the one that looked wrong. `purpose.md`: a new
   customisation surface needs a script proving every variant complete and
   legible, "in the manner of `check:themes` and `check:icon-contrast`" — a
   half-populated option ships a choice that makes the diagram look broken.

   IT LIVES HERE rather than in a script of its own because this file already
   loads `THEMES`, the token resolver and the oklch maths, and a second copy of
   all three is exactly what `dry.md` forbids. It is also the right neighbour:
   the numbers below are relative to the grid contrast this file already
   measures.

   WHAT THIS REPLACED, and why the arithmetic changed shape. The surface used to
   be a 1px `--border` rule plus a per-theme translucent WASH of the sheet's own
   ruling ink, and this section held that wash to a ceiling (0.4), to a
   quieter-than-its-own-ruling comparison, and to the drawing's ink floors. All
   five of those constants had nothing left to guard the moment the surface
   became `--node` on `--node-border`: there is no strength to cap, no ink to
   compare against the ruling, and no opt-in to pin off. Deleting them without
   replacement would have left the largest single area in three notations
   measured by nothing at all, which is how the wash got to 0.6 in the first
   place.

   THE PROPERTY IT GUARDS NOW IS THE ONE THE PANEL RESTS ON: `--node` on
   `--canvas` is ALREADY MEASURED IN EVERY THEME, which is the entire reason
   the surface is that pair rather than a bespoke tint. That claim is only true
   while both tokens are real, present and separable in all nine, so it is
   asserted rather than assumed.

   AND THE SEPARATION IS IN THE RULE, NOT THE FILL — the finding that decided
   what to measure. The panel's fill lifts the area by 1.033:1 (`paper`) to
   1.135:1 (`pastel`) against the canvas: under the 1.1:1 ground-visibility
   floor in six of the nine, and deliberately so, because a fill that separated
   by itself would be spending the drawing's own contrast budget to do it. What
   marks the document is `--node-border`, at 2.664:1 (`pastel`) to 13.663:1
   (`contrast`). So the floor below is on the RULE. A floor on the fill would
   fail six themes that look correct, and — worse — would invite someone to
   darken `--node` to pass it, which is the wash's whole failure re-run through
   a different token.

   `--border` IS WHY THE FLOOR IS WHERE IT IS. The rule this panel replaced was
   drawn in `--border`, which measures 1.181:1 to 1.864:1 on the canvas in
   eight of the nine themes — a chrome hairline, under or barely over the
   visibility floor, which is exactly why `blueprint` needed a wash to be seen
   at all. `PANEL_RULE_MIN` sits above every one of those eight and below every
   `--node-border`, so it is the number that distinguishes the treatment that
   worked from the treatment that did not, rather than a round number chosen to
   pass.

   And the drawing must still read ON the panel, at the same floors the palette
   checks hold its ink to everywhere else. */

/* Both tokens must be a real colour. `paper` and `eink` set their ROLE fills
   (`--node-person`, `--flow-decision`, …) to `transparent` on purpose — that is
   how a line-art theme is declared, and `check:eink`, `check:gantt-palette` and
   `check:flowchart-palette` all derive "this theme is line art" from
   `fill.alpha === 0`. The SURFACE is not a role: a transparent surface is not
   line art, it is no sheet, and the drawing falls back onto bare ruling. This
   assertion is what keeps a future line-art pass from "completing the set" by
   emptying the one fill that must stay filled. */
const PANEL_MIN_ALPHA = 0.5;
/* Above every `--border` (max 1.864:1, on `blueprint`) and below every
   `--node-border` (min 2.664:1, on `pastel`) — see the header above. */
const PANEL_RULE_MIN = 2;
/* The palette checks' own floors, not new numbers: connectors at 3:1 and text
   at 4.5:1, measured on the panel because that is what the drawing now sits on
   rather than on the canvas. */
const PANEL_EDGE_MIN = 3;
const PANEL_TEXT_MIN = 4.5;

for (const theme of THEMES) {
  const tokens = tokensOf(CSS, theme);
  if (tokens === null) continue;
  const canvas = parseOklch(resolveToken("--canvas", tokens, baseline));
  const node = parseOklch(resolveToken("--node", tokens, baseline));
  const nodeBorder = parseOklch(
    resolveToken("--node-border", tokens, baseline),
  );
  const edge = parseOklch(resolveToken("--edge", tokens, baseline));
  const text = parseOklch(resolveToken("--foreground", tokens, baseline));
  if ([canvas, node, nodeBorder, edge, text].some((c) => c === null)) {
    check(`${theme}: its diagram panel's tokens resolve`, false);
    continue;
  }

  check(
    `${theme}: its panel is a real surface, not a transparent one (--node α ${node.alpha}, --node-border α ${nodeBorder.alpha})`,
    node.alpha >= PANEL_MIN_ALPHA && nodeBorder.alpha >= PANEL_MIN_ALPHA,
    "the diagram surface is painted from --node and --node-border, and one of " +
      `them is under α ${PANEL_MIN_ALPHA} in this theme — the three ` +
      "sheet-mounting notations would draw their whole drawing straight onto " +
      "the well's ruling. A transparent ROLE fill is how a line-art theme is " +
      "declared and is correct; a transparent SURFACE is a missing sheet",
  );

  /* COMPOSITED THE WAY THE BROWSER PAINTS IT: the panel is flattened onto the
     canvas for its own alpha first (`glass` declares `--node` at 0.62), and
     every reading below is against that composite rather than against the raw
     token — which would report a surface no reader ever sees. */
  const panel = flatten(node, canvas);
  const ruleVsCanvas = contrast(flatten(nodeBorder, canvas), canvas.rgb);
  const fillVsCanvas = contrast(panel, canvas.rgb);
  const edgeOnPanel = contrast(flatten(edge, { rgb: panel }), panel);
  const textOnPanel = contrast(flatten(text, { rgb: panel }), panel);

  check(
    `${theme}: its panel's edge marks the document (${ruleVsCanvas.toFixed(3)}:1)`,
    ruleVsCanvas >= PANEL_RULE_MIN,
    `--node-border measures ${ruleVsCanvas.toFixed(3)}:1 against --canvas, ` +
      `under the ${PANEL_RULE_MIN}:1 floor. The panel's fill separates by only ` +
      `${fillVsCanvas.toFixed(3)}:1 by design, so the rule is the whole mark — ` +
      "under this floor the reader cannot see where the document stops, which " +
      "is the failure the line-only surface had on `blueprint`",
  );
  check(
    `${theme}: connectors still read on the panel (${edgeOnPanel.toFixed(2)}:1)`,
    edgeOnPanel >= PANEL_EDGE_MIN,
    `--edge measures ${edgeOnPanel.toFixed(2)}:1 on the panel, under ` +
      `${PANEL_EDGE_MIN}:1 — the sheet the drawing sits on is swallowing the ` +
      "drawing",
  );
  check(
    `${theme}: text still reads on the panel (${textOnPanel.toFixed(2)}:1)`,
    textOnPanel >= PANEL_TEXT_MIN,
    `--foreground measures ${textOnPanel.toFixed(2)}:1 on the panel, under ` +
      `${PANEL_TEXT_MIN}:1`,
  );
}

/* THE PANNING MECHANISM, and it is one CSS keyword. `local` means "this
   background is part of the scrolled content", which is exactly what a rule is
   and exactly what the material below must never be. `scroll` (the initial
   value) would pin the ground to the pane while the drawing slides over it —
   which is the second rejected model, reintroduced by deleting one line. */
{
  const rule = /\.af-canvas-rule \{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? "";
  check(
    "the rule layer scrolls WITH the drawing",
    /background-attachment:\s*local/.test(rule),
    "`.af-canvas-rule` does not claim `local` attachment, so the ground is " +
      "pinned to the pane and panning slides the drawing across it",
  );
  check(
    "the rule layer tiles rather than stretching",
    /background-repeat:\s*repeat/.test(rule),
    "a ground that does not repeat covers one tile of the pane",
  );
}

/* The shared renderer emits BOTH shapes for every level, so a theme decides in
   CSS and the first frame is right with no post-hydration swap. */
{
  const renderer = readCode("src/lib/canvas-ground.ts");
  check(
    "the pane renderer emits both shapes, from the shared ladder",
    /groundLevels\(scale\)/.test(renderer) &&
      /--canvas-rule-dot/.test(renderer) &&
      /--canvas-rule-line/.test(renderer),
    "`groundFieldCss` invents its own pitches, or paints only one shape so a " +
      "theme that rules in the other gets a bare well",
  );
  check(
    "the pane renderer sizes its tile in SCREEN pixels",
    /screenPitch\}px/.test(renderer),
    "a tile sized in world units does not track the camera, so the ladder's " +
      "whole point — a readable on-screen pitch — is lost",
  );
}

/* ----- and the ground IS in every export ------------------------------- */

/* THIS REVERSES THE OTHER DECISION THIS BRANCH RECORDED. The ground used to be
   kept OUT of every exported file, on the argument that it is screen chrome —
   "an export is the drawing lifted off the sheet". A `blueprint` that exports
   without its ruling is not a blueprint and a `paper` export without its grain
   is not paper; the sheet is part of how the diagram reads, which is what the
   theme work is for. The old argument also proved too much: `--canvas` has
   always been written into every file by reasoning that would have excluded it.

   The assertion therefore FLIPS, and the branch that made the old one wrong is
   still the branch that matters. Eight exporters build their own `<svg>` from
   layout and must be told to emit the ground; the ninth CLONES THE LIVE `<svg>`,
   which no longer carries a ground at all now that it lives on the pane — so
   that one must put it back. Same defect as before, from the other direction:
   the path that used to carry the ground when nobody wanted it is the path that
   would now silently drop it.

   WHAT THIS ASSERTION IS ABOUT is whether the sheet reaches the file at all.
   The three surface kinds emit `resolveExportGround`'s `defs`/`layers` pair
   full-bleed and directly; they used to reach it through a helper that split
   the ground around a frosted diagram surface, and that helper is gone with
   the frost — `lib/diagram-surface.ts` records why.

   BOTH HALVES OF THE PAIR, and the reason is a hole this assertion actually
   had. It used to ask a non-cloning exporter for `ground.defs` alone. Deleting
   the `ground.layers(...)` push from an exporter therefore left it GREEN — and
   that is the worst shape a ground defect can take, because `defs` only
   DECLARES the patterns. A file with the declarations and no painted layer is
   a valid SVG carrying a fully-specified ground it never draws: it opens to a
   bare canvas and nothing anywhere reports it. `defs` without `layers` is the
   silent half; requiring both is what makes the assertion mean what its name
   has always claimed. All nine exporters already satisfy it, so this tightens
   the guard without asking anyone to change a file. */
const exporters = [];
for (const kind of [...KINDS.filter((kind) => kind !== "c4"), "viewer"]) {
  const exporter = `src/features/${kind}/export/render-svg.ts`;
  if (!existsSync(path.join(ROOT, exporter))) continue;
  exporters.push(kind);
  const code = readCode(exporter);
  const clones = /cloneNode\(/.test(code);
  check(
    `${kind}: its export carries the ground it was read on` +
      (clones ? " (clone path — it has to be put back)" : ""),
    /resolveExportGround\(\)/.test(code) &&
      /ground\.layers\(/.test(code) &&
      (clones || /ground\.defs/.test(code)),
    clones
      ? "this exporter copies what is on screen, and the screen's ground is on " +
          "the PANE — outside the clone. A file from this path silently loses " +
          "the sheet while the other eight keep it"
      : "this exporter writes its own `<svg>` and never mentions the ground, " +
          "so a blueprint downloads without its ruling and paper without grain",
  );
}
check(
  `every notation's exporter was measured (${exporters.length})`,
  exporters.length >= 9,
  `only ${exporters.join(", ")} — an exporter this loop cannot find is an ` +
    "exporter nothing above has an opinion about",
);

/* AN EXPORT HAS NO CAMERA, so the rule layer must be evaluated once at the
   document's own scale rather than swept. `groundLevels(1)` is that evaluation,
   and it must yield exactly the rungs the band puts there — not zero (a file
   with no ground) and not a cross-fade (two half-faded lattices in a still
   image, which is a smudge rather than a ruling). */
{
  const atRest = ground.groundLevels(1);
  check(
    `an export takes the rung its own scale selects (${atRest.length}: ` +
      `${atRest.map((l) => `${l.screenPitch}px`).join(", ") || "none"})`,
    atRest.length >= 1 &&
      atRest.every(
        (level) => level.opacity > 0.5 * ground.GROUND_MINOR_OPACITY,
      ),
    "at scale 1 the ladder paints nothing, or paints only levels caught " +
      "mid-fade — an export has no zoom to resolve them",
  );
  const exportGround = readCode("src/features/viewer/export/ground.ts");
  check(
    "the export ground reads the ladder at the document's scale, not the screen's",
    /groundLevels\(1\)/.test(exportGround),
    "the exporter sweeps or guesses a zoom that an exported file does not have",
  );
  /* THE GRAIN IS NOT RESTATED IN TYPESCRIPT. The exporter decodes the theme's
     own data URI, so `globals.css` stays the single definition — the contract
     being that the chain's last primitive is named `result='grain'`. */
  check(
    "the export lifts its grain from the theme's own definition",
    /decodeURIComponent/.test(exportGround) &&
      !/feTurbulence/.test(exportGround),
    "the exporter restates the turbulence parameters, which is a second copy " +
      "of the texture that will drift from the one on screen",
  );
  for (const [, uri] of CSS.matchAll(
    /--canvas-sheet-grain:\s*url\("([^"]*)"\)/g,
  )) {
    check(
      "that grain names its output, so an export can composite onto it",
      /result='grain'/.test(uri),
      'the exporter\'s `feComposite in2="grain"` would dangle, and a dangling ' +
        "`in2` paints black over the whole drawing",
    );
  }
}

/* ----------------------------------------------------------------------- */
/* 3. THE RULE LAYER: silent unless a theme opts in, legible where used     */
/* ----------------------------------------------------------------------- */

/* A rule has to be SEEN against its ground, but it is furniture rather than
   content, so the 3:1 non-text floor is the wrong instrument — every shipped
   grid in this app sits between 1.1:1 and 1.8:1 and is correct at that. What a
   ground must clear is visibility; what it must NOT clear is the ink drawn on
   top of it. Both numbers are unchanged from the previous model. */
const VISIBLE_MIN = 1.1;
const INK_FRACTION_MAX = 0.6;

/* The composite of an ink at alpha over a ground. `flatten` in `lib/oklch.mjs`
   answers a different question (a token that CARRIES an alpha); this is a paint
   the ladder applies. */
const over = (ink, groundRgb, alpha) =>
  ink.map((v, i) => v * alpha + groundRgb[i] * (1 - alpha));

console.log("\nthe rule layer says nothing unless a theme names an ink");

const ruled = [];
for (const theme of THEMES) {
  const tokens = tokensOf(CSS, theme) ?? baseline;
  const dot = resolveToken("--canvas-rule-dot", tokens, baseline);
  const line = resolveToken("--canvas-rule-line", tokens, baseline);
  const inks = [dot, line].filter((value) => value !== "transparent");
  /* ONE SHAPE OR NONE. A theme painting dots AND lines puts a dot on every rule
     intersection of the same ladder level — beads on a string, not a ruled
     sheet — and it is the same mistake in both directions, so it is worth an
     assertion rather than a convention. */
  check(
    `${theme}: rules in at most one shape (${inks.length === 0 ? "none" : inks.length === 1 ? (dot === "transparent" ? "lines" : "dots") : "BOTH"})`,
    inks.length <= 1,
    "dots at a level's pitch land exactly on that level's rule intersections",
  );
  if (inks.length === 1) ruled.push({ theme, tokens, ink: inks[0] });
}

check(
  "at least one theme exercises the rule layer",
  ruled.length > 0,
  "every theme opted out — the ladder is dead code carrying a check that " +
    "proves nothing",
);

console.log("\nwhere a theme rules its ground, both strengths read correctly");

for (const { theme, tokens, ink } of ruled) {
  const groundColour = parseOklch(resolveToken("--canvas", tokens, baseline));
  const edge = parseOklch(resolveToken("--edge", tokens, baseline));
  const inkColour = parseOklch(ink);
  if (groundColour === null || edge === null || inkColour === null) {
    check(`${theme}: its rule ink resolves to a colour`, false, ink);
    continue;
  }
  const at = (alpha) =>
    contrast(over(inkColour.rgb, groundColour.rgb, alpha), groundColour.rgb);
  const minor = at(ground.GROUND_MINOR_OPACITY);
  const major = at(ground.GROUND_MAJOR_OPACITY);
  const inked = contrast(edge.rgb, groundColour.rgb);
  const failed = [];
  if (minor < VISIBLE_MIN)
    failed.push(`minor is ${minor.toFixed(3)}:1, under ${VISIBLE_MIN}`);
  if (major / inked > INK_FRACTION_MAX)
    failed.push(
      `major is ${((major / inked) * 100).toFixed(0)}% of this theme's own ` +
        `--edge contrast, over ${INK_FRACTION_MAX * 100}%`,
    );
  if (major <= minor) failed.push("the major strength is not the louder one");
  check(
    `${theme}: minor ${minor.toFixed(3)}:1, major ${major.toFixed(3)}:1, ` +
      `${((major / inked) * 100).toFixed(0)}% of its ink`,
    failed.length === 0,
    failed.join("; "),
  );
}

/* THE THREE CHANNELS that replace the retired 1.4:1 colour separation. One ink
   at two alphas cannot part from itself by colour, so the difference has to be
   carried elsewhere — and it is carried further than it was: a 5× pitch step is
   a far stronger cue than a shade. */
check(
  `the two strengths differ in alpha (${ground.GROUND_MINOR_OPACITY} → ${ground.GROUND_MAJOR_OPACITY})`,
  ground.GROUND_MAJOR_OPACITY > ground.GROUND_MINOR_OPACITY,
  "the major strength is not louder than the minor one",
);
check(
  `the two strengths differ in weight (${ground.GROUND_LINE_WIDTH_PX.join(" → ")}px lines, ` +
    `${ground.GROUND_DOT_SIZE_PX.join(" → ")}px dots)`,
  ground.GROUND_LINE_WIDTH_PX[1] > ground.GROUND_LINE_WIDTH_PX[0] &&
    ground.GROUND_DOT_SIZE_PX[1] > ground.GROUND_DOT_SIZE_PX[0],
  "a ruled sheet separates its strengths by WEIGHT first; alpha alone makes " +
    "the major rule merely a fainter minor one",
);
/* And the strengths must actually be REACHED, not merely declared. The ladder
   interpolates them across the band, so a band the levels never span would
   leave both ends unused and every level painting the same middling grey. */
{
  const reached = [];
  for (let i = 0; i < SAMPLES; i += 1) {
    for (const level of ground.groundLevels(zoomAt(i))) {
      if (level.opacity > 0.99 * ground.GROUND_MAJOR_OPACITY)
        reached.push("major");
      if (
        level.opacity > 0 &&
        level.opacity < 1.01 * ground.GROUND_MINOR_OPACITY
      )
        reached.push("minor");
    }
  }
  check(
    "both strengths are actually reached somewhere in the zoom range",
    reached.includes("major") && reached.includes("minor"),
    `only ${[...new Set(reached)].join(", ") || "neither"} occurs — the other ` +
      "end of the strength ramp is decorative",
  );
}

/* ----------------------------------------------------------------------- */
/* 4. THE MATERIAL LAYER: fixed to the sheet, and provably so              */
/* ----------------------------------------------------------------------- */

console.log(
  "\nthe material layer is the sheet, and does not move with the drawing",
);

const sheetRule =
  /\.af-canvas-sheet::before \{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? "";
check(
  "the material is painted by the well, not by any canvas",
  sheetRule !== "" && /position:\s*absolute/.test(sheetRule),
  "`.af-canvas-sheet::before` is missing — a material drawn inside a canvas " +
    "would be multiplied by that canvas's camera, which is model one",
);
check(
  "the well class carries BOTH the colour and the material",
  /DIAGRAM_WELL_CLASSES = "bg-canvas af-canvas-sheet"/.test(
    readCode("src/components/ui/diagram-well.tsx"),
  ),
  "a host painting one and not the other shows a theme's paper as a flat " +
    "rectangle",
);
/* THE INVARIANCE IS STRUCTURAL, and these are the three ways it could stop
   being. A `background-attachment` of `local` glues the paint to scrolled
   content — the detached-ground failure by another route; a `var()` position
   lets a camera write into it; and a keyframe on the position makes the sheet
   drift under a still drawing. */
check(
  "the material is not glued to scrolled content",
  !/background-attachment:\s*local/.test(sheetRule),
  "`local` makes the material scroll with the drawing, which is the one thing " +
    "the sheet must not do",
);
check(
  "the material's geometry is absolute, never a camera-written variable",
  !/mask-position|background-position/.test(sheetRule),
  "a position on the sheet layer is a seam a camera can be threaded through",
);
{
  const animated = [...CSS.matchAll(/@keyframes ([\w-]+) \{([\s\S]*?)\n\}/g)]
    .filter(([, name, body]) => /canvas-sheet/.test(name + body))
    .map(([, name]) => name);
  check(
    "no keyframe moves the material",
    animated.length === 0,
    `${animated.join(", ")} animates the sheet — a ground in permanent motion ` +
      "is a ground the reader reads as separate from the drawing",
  );
}
/* THE TILE IS RASTERISED ONCE. `--canvas-sheet-tile` and the width baked into
   each grain data URI are a TypeScript-free CSS/CSS pair with no import between
   them, so they are pinned here: a mask sized differently from its own image
   resamples the noise and the stitching stops meeting. */
{
  const tile = /--canvas-sheet-tile:\s*(\d+)px/.exec(CSS)?.[1];
  const grains = [...CSS.matchAll(/--canvas-sheet-grain:\s*url\("([^"]*)"\)/g)];
  check(
    `the grain tile is one number (${tile ?? "absent"}px)`,
    tile !== undefined && grains.length > 0,
    "no tile size, or no theme names a grain",
  );
  for (const [, uri] of grains) {
    const width = /width='(\d+)'/.exec(uri)?.[1];
    check(
      `a grain tile is drawn at the size the mask tiles it at (${width}px)`,
      width === tile,
      `the SVG is ${width}px wide but the mask tiles at ${tile}px — the noise ` +
        "is resampled and the stitched edges no longer meet",
    );
    /* STITCHING IS LOAD-BEARING. Without it `feTurbulence` does not join across
       the tile edge and the reader sees a grid at the tile pitch — the exact
       artefact a grain is chosen over a lattice to avoid. */
    check(
      "that grain stitches across its tile edge",
      /stitchTiles='stitch'/.test(uri),
      "unstitched turbulence shows a seam every tile, which is a lattice with " +
        "extra steps",
    );
    check(
      "that grain is fractal noise with more than one octave",
      /type='fractalNoise'/.test(uri) &&
        Number(/numOctaves='(\d+)'/.exec(uri)?.[1]) > 1,
      "a single octave of turbulence has a dominant frequency, which is the " +
        "period a grain exists not to have",
    );
  }
  /* AND IT IS A MASK, NOT AN IMAGE, so nine themes tint one definition. A
     coloured data URI would be one copy of the texture per theme. */
  for (const [, uri] of grains) {
    check(
      "that grain carries no colour of its own",
      !/%23[0-9a-fA-F]{3,8}|oklch|rgb\(/.test(uri),
      "a hardcoded colour in the grain means a second copy for the next theme",
    );
  }
  check(
    "the material takes its colour from a token, through a mask",
    /background-color:\s*var\(--canvas-sheet-ink\)/.test(sheetRule) &&
      /mask-image:\s*var\(--canvas-sheet-grain\)/.test(sheetRule),
    "the grain is being painted directly rather than masking a themed ink",
  );
}

console.log("\nevery material clears its floor, and stays under its own ink");

/* A MATERIAL'S FLOOR IS NOT A RULE'S FLOOR, and this is the one place a number
   was added rather than kept. A rule is a small number of discrete marks and
   must each be seen; a material is a FIELD, and a field of marks at 1.07:1 is
   visible as a surface where one line at 1.07:1 is not. So: at least one mark
   in each material must clear the rule floor (the material is visible AT ALL),
   and no mark may fall under MATERIAL_MIN (it is not literally absent).
   `paper`'s quieter half is the mark this exists for — it measures 1.069:1 and
   cannot reach 1.1:1 at any ink, because 0.07 alpha over that canvas cannot,
   even in pure black. It was not brightened to pass. */
const MATERIAL_MIN = 1.05;
/* Mean alpha of fractal noise is half its range; a stepped grain lights the
   fraction its table says. These are the numbers a reader actually sees, so
   they are what gets measured — not the layer opacity, which no pixel wears. */
const meanFactor = (uri) => {
  const table = /tableValues='([^']*)'/.exec(uri)?.[1];
  if (table === undefined) return 0.5;
  const values = table.trim().split(/\s+/).map(Number);
  return values.reduce((a, b) => a + b, 0) / values.length;
};

for (const theme of THEMES) {
  const tokens = tokensOf(CSS, theme);
  if (tokens === null) continue;
  const grain = /url\("([^"]*)"\)/.exec(
    tokens.get("--canvas-sheet-grain") ?? "",
  )?.[1];
  const band = tokens.get("--canvas-sheet-band");
  const layerOpacity = Number(tokens.get("--canvas-sheet-opacity") ?? NaN);
  const hasBand = band !== undefined && band !== "none";
  const hasGrain = grain !== undefined;
  /* HALF A MATERIAL IS WORSE THAN NONE — `purpose.md`: a half-populated option
     "ships a choice that makes the diagram look broken". Both halves are one
     line from each other, and each fails silently in a different direction: a
     grain with no opacity paints nothing and reads as a broken feature, and an
     opacity with no grain and no band paints a FLAT INK WASH over the entire
     well. The ink is deliberately not part of this — every theme inherits one
     from the baseline, which is what makes the texture themeable at all. */
  if (!hasGrain && !hasBand) {
    check(
      `${theme}: names no material, and paints none`,
      !(layerOpacity > 0),
      `--canvas-sheet-opacity is ${layerOpacity} with no grain and no band — ` +
        "the well takes a flat wash of the sheet ink at that strength",
    );
    continue;
  }
  if (hasGrain) {
    check(
      `${theme}: its grain is given a strength to paint at`,
      Number.isFinite(layerOpacity) && layerOpacity > 0,
      `--canvas-sheet-opacity is ${tokens.get("--canvas-sheet-opacity") ?? "inherited (0)"} ` +
        "— the grain is declared and invisible, which reads as a broken theme",
    );
  }
  const groundColour = parseOklch(resolveToken("--canvas", tokens, baseline));
  const edge = parseOklch(resolveToken("--edge", tokens, baseline));
  const inkColour = parseOklch(
    resolveToken("--canvas-sheet-ink", tokens, baseline),
  );
  if (groundColour === null || edge === null || inkColour === null) {
    check(`${theme}: its sheet ink resolves`, false);
    continue;
  }
  const inked = contrast(edge.rgb, groundColour.rgb);
  const marks = [];
  if (hasGrain) {
    marks.push(
      ["peak", layerOpacity],
      ["mean", layerOpacity * meanFactor(grain)],
    );
  }
  if (hasBand) {
    const peak = Number(
      /var\(--canvas-sheet-ink\) (\d+(?:\.\d+)?)%/.exec(band)?.[1],
    );
    marks.push(["band", peak / 100]);
  }
  const measured = marks.map(([name, alpha]) => [
    name,
    contrast(over(inkColour.rgb, groundColour.rgb, alpha), groundColour.rgb),
  ]);
  const failed = [];
  if (!measured.some(([, ratio]) => ratio >= VISIBLE_MIN))
    failed.push(`no mark reaches ${VISIBLE_MIN}:1 — the material is not there`);
  for (const [name, ratio] of measured) {
    if (ratio < MATERIAL_MIN)
      failed.push(`${name} is ${ratio.toFixed(3)}:1, under ${MATERIAL_MIN}`);
    if (ratio / inked > INK_FRACTION_MAX)
      failed.push(
        `${name} is ${((ratio / inked) * 100).toFixed(0)}% of this theme's ink`,
      );
  }
  check(
    `${theme}: ${measured.map(([n, r]) => `${n} ${r.toFixed(3)}:1`).join(", ")}`,
    failed.length === 0,
    failed.join("; "),
  );
  /* THE ONE TYPESCRIPT/CSS PAIR THIS FEATURE HAS. CSS cannot read TypeScript
     and an SVG `<linearGradient>` is not a CSS gradient, so `GROUND_SHEEN`
     drives the export and `globals.css` spells the same four numbers for the
     screen. `dry.md` requires a `check:*` on exactly this shape, and this is
     it — a screen sheen at one angle and a file sheen at another is the kind of
     drift nobody notices until the two are held side by side. */
  if (hasBand) {
    const sheen = ground.GROUND_SHEEN;
    const flat = band.replace(/\s+/g, " ");
    const angle = Number(
      /^linear-gradient\( ?(-?\d+(?:\.\d+)?)deg/.exec(flat)?.[1],
    );
    const stops = [...flat.matchAll(/(\d+(?:\.\d+)?)%/g)].map((m) =>
      Number(m[1]),
    );
    /* Four percentages, in source order: the first stop, the ink strength
       inside the `color-mix`, the peak stop's position, and the last stop. */
    const [from, peak, mid, to] = stops;
    check(
      `${theme}: its CSS sheen matches GROUND_SHEEN (${angle}deg, ${from}% → ${to}%, peak ${peak}% at ${mid}%)`,
      angle === sheen.angleDeg &&
        from === sheen.from * 100 &&
        to === sheen.to * 100 &&
        peak === sheen.peak * 100 &&
        mid === 50,
      `the stylesheet says ${angle}deg ${from}/${peak}/${to} and TypeScript ` +
        `says ${sheen.angleDeg}deg ${sheen.from * 100}/${sheen.peak * 100}/` +
        `${sheen.to * 100} — the screen and the exported file would disagree`,
    );
  }
  /* A BAND IS NOT A TILE. `glass` gets both layers only because its sheen is a
     single band with the working grid's slot left free; a band that repeated
     would be a second field and the argument for allowing both collapses. */
  if (hasBand) {
    check(
      `${theme}: its sheen is one band, not a field`,
      /background-repeat:\s*no-repeat/.test(sheetRule) &&
        !/repeating-/.test(band),
      "a repeating sheen is a second ground competing with the rule layer",
    );
  }
}

/* ----------------------------------------------------------------------- */
/* 5. The well itself, in every theme                                       */
/* ----------------------------------------------------------------------- */

console.log("\nthe well stays at or below the chrome it is set into");

/* AT OR BELOW, not strictly below: `midnight` and `contrast` set the well to
   their page colour exactly, which is those palettes' own argument rather than
   a drift. Equality is the floor of the rule, not an exemption from it. */
for (const theme of THEMES) {
  const tokens = tokensOf(CSS, theme) ?? baseline;
  const well = parseOklch(resolveToken("--canvas", tokens, baseline));
  const chrome = parseOklch(resolveToken("--background", tokens, baseline));
  if (well === null || chrome === null) {
    check(`${theme}: --canvas and --background both resolve`, false);
    continue;
  }
  const ok = luminance(well.rgb) <= luminance(chrome.rgb) + 1e-9;
  check(
    `${theme}: the well is ${ok ? `${contrast(chrome.rgb, well.rgb).toFixed(3)}:1 under` : "ABOVE"} its chrome`,
    ok,
    "the diagram well is LIGHTER than the page it is set into, which inverts " +
      "the recess `--canvas` exists to draw",
  );
}

console.log(
  "\nevery theme's --canvas-grid is visible, and quieter than its ink",
);

/* `--canvas-grid` IS NO LONGER THE WELL'S FIELD and still needs measuring —
   but by whom changed, and this comment named the wrong readers while the
   defect below was live. It is now read ONLY by things drawn on `--canvas`
   itself: the home page's ruled backdrop and the marketing dot field. Every
   mark inside a diagram has been moved off it, and the sweep after this one
   holds them off it.

   THE MEASUREMENT IS AGAINST `--canvas` BECAUSE THAT IS WHAT IT IS DRAWN ON,
   which was true again only after that move. In between, the gantt's ticks,
   the timeline's axis and rule and the lifecycle's spine all read this token
   while sitting on the `--node` panel, and this section went on measuring them
   against the canvas they had left. `midnight` passed here at 1.159:1 and
   measured 1.030:1 against the panel actually under it — a line a reader
   reported as simply not there. Floor and ceiling are unchanged; the readers
   are what had to move. */
for (const theme of THEMES) {
  const tokens = tokensOf(CSS, theme) ?? baseline;
  const grid = parseOklch(resolveToken("--canvas-grid", tokens, baseline));
  const groundColour = parseOklch(resolveToken("--canvas", tokens, baseline));
  const edge = parseOklch(resolveToken("--edge", tokens, baseline));
  if (grid === null || groundColour === null || edge === null) {
    check(`${theme}: --canvas-grid, --canvas and --edge all resolve`, false);
    continue;
  }
  const seen = contrast(grid.rgb, groundColour.rgb);
  const fraction = seen / contrast(edge.rgb, groundColour.rgb);
  const failed = [];
  if (seen < VISIBLE_MIN)
    failed.push(`${seen.toFixed(3)}:1 on its canvas, under ${VISIBLE_MIN}`);
  if (fraction > INK_FRACTION_MAX)
    failed.push(
      `${(fraction * 100).toFixed(0)}% of its own --edge contrast, over ` +
        `${INK_FRACTION_MAX * 100}%`,
    );
  check(
    `${theme}: grid ${seen.toFixed(3)}:1 on canvas, ${(fraction * 100).toFixed(0)}% of its ink`,
    failed.length === 0,
    failed.join("; "),
  );
}

console.log("\nnothing drawn on the panel is measured against the canvas");

/* THE ASSERTION THE SECTION ABOVE ONLY LOOKED LIKE IT WAS MAKING. Its numbers
   were right and its subject was wrong: it measured `--canvas-grid` against
   `--canvas` while four canvases read that token from marks sitting on a
   `--node` panel. Every theme passed. On `midnight` the timeline's axis, the
   lifecycle's spine and the gantt's day ticks were all at 1.030:1 or below
   against the ground actually behind them, and the first anyone knew was a
   reader saying the line was not there.

   So the rule is about WHO MAY READ THE TOKEN, not about its value: a mark on
   the panel must paint from the `--node` family or from `--edge`, both of
   which are measured against `--node` by construction. `--canvas-grid` is the
   ground's own ruling and belongs to things drawn on the ground.

   DERIVED FROM THE FILESYSTEM, never from a list of kind names — `codebase.md`
   records three checks in this repo that passed while the feature under them
   was broken, all for the same reason: a hardcoded list cannot notice the
   thing it has never heard of. A fifth notation that draws on the surface is
   covered the day it is written. */
{
  const FEATURES = path.join(ROOT, "src/features");
  const onSurface = [];
  /* COMMENTS STRIPPED BEFORE SCANNING, and this is not tidiness — the first
     run of this sweep failed on all three fixed files, because the prose
     explaining WHY the token was abandoned says its name. `check:lifecycle-
     motion` carries the same stripper for the same reason: an assertion that
     forbids a mechanism by name will always match the paragraph arguing
     against it, and passing it a raw file makes a correct fix look like the
     defect. */
  const stripComments = (code) =>
    code.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
  for (const feature of readdirSync(FEATURES).sort()) {
    /* THE MARKER IS THE SURFACE ITSELF, asked of the code rather than of a
       register beside it. TWO SPELLINGS, because there are two ways onto the
       panel: three kinds render the shared `DiagramSurface` (or emit
       `diagramSurfaceMarkup`), and the dictionary draws its own panel by hand
       and shares only the corner radius. The first pass of this sweep knew
       only the first spelling and silently dropped the dictionary — caught by
       the count assertion below, which exists for exactly that. */
    const files = [
      `${feature}/components/${feature}-diagram.tsx`,
      `${feature}/export/render-svg.ts`,
      `${feature}/styles/${feature}-motion.css`,
    ]
      .map((rel) => path.join(FEATURES, rel))
      .filter((abs) => existsSync(abs))
      .map((abs) => [abs, stripComments(readFileSync(abs, "utf8"))]);
    if (files.length === 0) continue;
    const draws = files.some(([, code]) =>
      /DiagramSurface|diagramSurfaceMarkup|DIAGRAM_SURFACE_RADIUS/.test(code),
    );
    if (!draws) continue;
    const offenders = files
      .filter(([, code]) => /--canvas-grid|theme\.canvasGrid/.test(code))
      .map(([abs]) => path.relative(ROOT, abs));
    onSurface.push([feature, offenders]);
  }

  check(
    `every kind that draws on the surface was found (${onSurface.map(([f]) => f).join(", ")})`,
    onSurface.length >= 4,
    `only ${onSurface.length} — the marker stopped matching, so the sweep below proves nothing`,
  );
  for (const [feature, offenders] of onSurface) {
    check(
      `${feature}: draws on the panel, so it reads no --canvas-grid`,
      offenders.length === 0,
      `${offenders.join(", ")} paints the ground's own ruling onto a --node panel, where it is not measured against anything`,
    );
  }
}

/* ----------------------------------------------------------------------- */
/* 6. The home page shows the ground the canvas shows                       */
/* ----------------------------------------------------------------------- */

console.log("\nthe illustrations of a canvas read the canvas's own ground");

/* THREE PICTURES OF ONE PRODUCT. The hero card and the MCP box each carried a
   hand-typed grid (28px and 22px) under a comment claiming it matched "the
   editor surface", which painted neither. A claim nothing enforces is the
   failure mode `codebase.md` habit 4 is about, so it is enforced. */
for (const rel of [
  "src/features/marketing/hero-diagram.tsx",
  "src/features/marketing/mcp-flow.tsx",
]) {
  const code = readCode(rel);
  const name = rel.split("/").pop();
  check(
    `${name} paints the ladder rather than a grid of its own`,
    /groundFieldCss\(/.test(code),
    "this illustration invents a pitch, so the picture of the product and the " +
      "product disagree — which is what it did before, in a token the canvas " +
      "does not even use",
  );
  check(
    `${name} hardcodes no background pitch`,
    !/backgroundSize:\s*"\d+px/.test(code),
    "a literal tile size beside a derived one is the pair drifting again",
  );
}
/* THE DRIFT MUST BE A WHOLE CELL or the loop is not seamless — and the cell is
   now the ladder's, so the distance cannot be typed into the stylesheet. */
{
  const drift = /@keyframes af-hero-grid-drift \{([\s\S]*?)\n\}/.exec(CSS)?.[1];
  check(
    "the hero's drift reads its distance from the ladder",
    drift !== undefined &&
      /var\(--af-hero-grid-pitch\)/.test(drift) &&
      !/\d+px/.test(drift),
    "a hardcoded drift distance stopped being one whole cell the moment the " +
      "ladder chose the pitch, and the loop visibly jumps once a cycle",
  );
  check(
    "and the hero writes that property from the same call that draws the field",
    /--af-hero-grid-pitch/.test(
      readCode("src/features/marketing/hero-diagram.tsx"),
    ),
    "the stylesheet reads a property nothing sets, so the drift is zero",
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

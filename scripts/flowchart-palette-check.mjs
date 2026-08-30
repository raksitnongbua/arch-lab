#!/usr/bin/env node
/**
 * The flowchart shape palette is complete, legible and DISTINCT — measured
 * per shape × theme, not eyeballed.
 *
 * The flowchart gives every one of its six shapes its own colour pair
 * (`--flow-<shape>` / `--flow-<shape>-border`, globals.css), four of them
 * aliased onto the C4 role tokens and two minted for the shapes no role
 * covers. That surface has failure modes `check:themes` cannot see, each of
 * which this script exists to catch:
 *
 *   1. **A dangling alias or renamed token.** The renderer paints
 *      `var(--flow-step)` and the exporter resolves the same name via
 *      `FLOW_SHAPE_TOKENS`; a token missing from the CSS is an invalid
 *      paint (SVG fill falls back, usually to black) in whichever theme
 *      lacks it. The token names are loaded from the REAL
 *      `FLOW_SHAPE_TOKENS` table through type stripping, so a rename on
 *      either side fails here before it ships.
 *   2. **An illegible pair in one theme.** Thresholds are WCAG 2.1: text on
 *      its own fill ≥4.5:1 (SC 1.4.3), the border against its own fill and
 *      against the canvas ≥3:1 (SC 1.4.11 non-text) — the same minimums the
 *      C4 role tokens are held to in `check:themes`. Text and border are
 *      ALSO measured against the surface wash's deepest stop (the
 *      border-into-fill fold from `lib/wash.ts`), because that gradient top
 *      is the darkest pixel a label can actually sit near.
 *   3. **Two shapes collapsing into one colour.** The original palette
 *      mapped `start` and `end` onto one violet role and a six-node chart
 *      of terminators rendered monotone — the shipped complaint this
 *      palette answers. Distance is OKLab ΔE (Ottosson; a just-noticeable
 *      difference is ≈0.002): start↔end must be unmistakably two colours
 *      (fills ≥0.06, ≈30 JND; borders ≥0.15), and NO two shapes may sit
 *      within 0.02 (≈10 JND) on fills or 0.05 on borders — "not equal"
 *      alone would bless two violets one bit apart.
 *   4. **The CSS wash drifting from the TS wash.** `.af-node-wash` cannot
 *      import `lib/wash.ts`, so its four stops are genuinely duplicated;
 *      each percentage is pinned to the module's constants here (the
 *      `check:sequence-motion` precedent for TS↔CSS pairs).
 *
 * Exits non-zero on any failure. Run with: pnpm check:flowchart-palette
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  contrast,
  flatten,
  oklchDeltaE,
  parseOklch,
  washMixLinear,
} from "./lib/oklch.mjs";
import { resolveToken, tokensOf } from "./lib/theme-css.mjs";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

/* ----------------------------------------------------------------------- */
/* Module resolution: `@/*` alias + extensionless relative imports -> .ts   */
/* ----------------------------------------------------------------------- */

registerHooks({
  resolve(specifier, context, nextResolve) {
    let resolved = specifier;
    if (resolved.startsWith("@/")) {
      resolved = pathToFileURL(path.join(ROOT, "src", resolved.slice(2))).href;
    }
    if (
      (resolved.startsWith("./") || resolved.startsWith("../")) &&
      typeof context.parentURL === "string"
    ) {
      resolved = new URL(resolved, context.parentURL).href;
    }
    if (resolved.startsWith("file:")) {
      const asPath = fileURLToPath(resolved);
      const isFile = existsSync(asPath) && statSync(asPath).isFile();
      if (!isFile) {
        if (existsSync(`${asPath}.ts`)) {
          resolved = pathToFileURL(`${asPath}.ts`).href;
        } else if (existsSync(path.join(asPath, "index.ts"))) {
          resolved = pathToFileURL(path.join(asPath, "index.ts")).href;
        }
      }
    }
    return nextResolve(resolved, context);
  },
});

const { FLOW_SHAPE_TOKENS } = await import(
  pathToFileURL(path.join(ROOT, "src/features/flowchart/lib/shapes.ts")).href
);
const {
  WASH_BOTTOM_FRACTION,
  WASH_LOW_OFFSET,
  WASH_MID_OFFSET,
  WASH_STROKE_FRACTION,
} = await import(pathToFileURL(path.join(ROOT, "src/lib/wash.ts")).href);

/* ----------------------------------------------------------------------- */
/* Harness                                                                  */
/* ----------------------------------------------------------------------- */

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

const CSS = readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8");
const CONSTANTS = readFileSync(path.join(ROOT, "src/lib/constants.ts"), "utf8");

const THEMES = [
  ...(/export const THEMES = \[([^\]]*)\]/.exec(CONSTANTS)?.[1] ?? "").matchAll(
    /"([a-z-]+)"/g,
  ),
].map((m) => m[1]);
const SHAPES = Object.keys(FLOW_SHAPE_TOKENS);

const baseline = tokensOf(CSS, "light");
if (baseline === null) {
  console.error("could not parse the :root block of globals.css");
  process.exit(1);
}

/* ----------------------------------------------------------------------- */
/* 1+2: every shape resolves, and every resolved pair is legible            */
/* ----------------------------------------------------------------------- */

/* Thresholds (see the header for sources):
 * WCAG 2.1 SC 1.4.3 — text ≥4.5:1; SC 1.4.11 — non-text (borders) ≥3:1. */
const TEXT_MIN = 4.5;
const BORDER_MIN = 3;

console.log(
  `every shape × theme pair resolves and clears its minimums (${SHAPES.length} shapes × ${THEMES.length} themes)`,
);

/** { theme -> { shape -> { fill, border } as parsed oklch } } for part 3. */
const resolved = new Map();

for (const theme of THEMES) {
  const tokens = theme === "light" ? baseline : tokensOf(CSS, theme);
  if (tokens === null) {
    check(`${theme}: has a CSS block`, false, "check:themes owns this case");
    continue;
  }
  const themeColor = (token) =>
    parseOklch(resolveToken(token, tokens, baseline));
  /* Everything is measured as SEEN, the theme-check rule: a translucent
     fill (glass) is flattened over the canvas before anything is measured
     against it. */
  const canvas = themeColor("--canvas");
  const name = themeColor("--node-foreground");
  const meta = themeColor("--node-meta");
  if (canvas === null || name === null || meta === null) {
    check(
      `${theme}: canvas and node text tokens parse`,
      false,
      "cannot measure this theme at all",
    );
    continue;
  }
  const byShape = new Map();
  resolved.set(theme, byShape);
  const failed = [];
  const expect = (what, got, min) => {
    if (got < min) {
      failed.push(`${what} is ${got.toFixed(2)}:1, needs ${min}:1`);
    }
  };
  for (const shape of SHAPES) {
    const fill = themeColor(FLOW_SHAPE_TOKENS[shape].fill);
    const border = themeColor(FLOW_SHAPE_TOKENS[shape].border);
    if (fill === null || border === null) {
      failed.push(
        `${shape}: ${FLOW_SHAPE_TOKENS[shape].fill}/-border does not resolve ` +
          `to a colour — the shape would paint the SVG fallback (black)`,
      );
      continue;
    }
    byShape.set(shape, { fill, border });
    const fillSeen = flatten(fill, canvas);
    const borderSeen = flatten(border, canvas);
    /* The wash's deepest stop: the darkest surface a label or border edge
       actually meets once the gradient is on (lib/wash.ts fraction). */
    const washTop = washMixLinear(fillSeen, borderSeen, WASH_STROKE_FRACTION);
    expect(`${shape}: name on fill`, contrast(name.rgb, fillSeen), TEXT_MIN);
    expect(`${shape}: meta on fill`, contrast(meta.rgb, fillSeen), TEXT_MIN);
    expect(`${shape}: name on wash top`, contrast(name.rgb, washTop), TEXT_MIN);
    expect(`${shape}: meta on wash top`, contrast(meta.rgb, washTop), TEXT_MIN);
    expect(
      `${shape}: border on its fill`,
      contrast(borderSeen, fillSeen),
      BORDER_MIN,
    );
    expect(
      `${shape}: border on wash top`,
      contrast(borderSeen, washTop),
      BORDER_MIN,
    );
    /* Border against the canvas: the outline is what separates the shape
       from the page it sits on — a border that vanishes into the canvas
       makes the silhouette (the non-colour signal) unreadable. */
    expect(
      `${shape}: border on canvas`,
      contrast(borderSeen, canvas.rgb),
      BORDER_MIN,
    );
  }
  check(
    `${theme}: all ${SHAPES.length} shapes resolve and clear ${TEXT_MIN}:1 text / ${BORDER_MIN}:1 border`,
    failed.length === 0,
    failed.join("; "),
  );
}

/* ----------------------------------------------------------------------- */
/* 3: no two shapes are effectively the same colour                         */
/* ----------------------------------------------------------------------- */

/* OKLab ΔE floors (header, item 3). start↔end carries its own, higher floor
 * because terminators are the pair a real chart is most likely to be built
 * from — the exact document that shipped monotone. */
const PAIR_FILL_MIN = 0.02;
const PAIR_BORDER_MIN = 0.05;
const TERMINATOR_FILL_MIN = 0.06;
const TERMINATOR_BORDER_MIN = 0.15;

console.log("\nshape colours stay distinct (OKLab ΔE, measured)");

for (const [theme, byShape] of resolved) {
  if (byShape.size !== SHAPES.length) continue; // resolution already failed
  const failed = [];
  for (let i = 0; i < SHAPES.length; i += 1) {
    for (let j = i + 1; j < SHAPES.length; j += 1) {
      const a = byShape.get(SHAPES[i]);
      const b = byShape.get(SHAPES[j]);
      const dFill = oklchDeltaE(a.fill.oklch, b.fill.oklch);
      const dBorder = oklchDeltaE(a.border.oklch, b.border.oklch);
      if (dFill < PAIR_FILL_MIN) {
        failed.push(
          `${SHAPES[i]}/${SHAPES[j]} fills ΔE ${dFill.toFixed(3)} < ${PAIR_FILL_MIN}`,
        );
      }
      if (dBorder < PAIR_BORDER_MIN) {
        failed.push(
          `${SHAPES[i]}/${SHAPES[j]} borders ΔE ${dBorder.toFixed(3)} < ${PAIR_BORDER_MIN}`,
        );
      }
    }
  }
  const start = byShape.get("start");
  const end = byShape.get("end");
  const dTerm = oklchDeltaE(start.fill.oklch, end.fill.oklch);
  const dTermBorder = oklchDeltaE(start.border.oklch, end.border.oklch);
  check(
    `${theme}: no pair collides, and start↔end reads as two colours ` +
      `(fills ΔE ${dTerm.toFixed(3)} ≥ ${TERMINATOR_FILL_MIN}, borders ${dTermBorder.toFixed(3)} ≥ ${TERMINATOR_BORDER_MIN})`,
    failed.length === 0 &&
      dTerm >= TERMINATOR_FILL_MIN &&
      dTermBorder >= TERMINATOR_BORDER_MIN,
    failed.join("; "),
  );
}

/* ----------------------------------------------------------------------- */
/* 4: the CSS wash stops equal lib/wash.ts                                  */
/* ----------------------------------------------------------------------- */

console.log("\nthe .af-node-wash stops match lib/wash.ts (CSS cannot import)");

{
  const rule = /\.af-node-wash \{[^}]*\}/.exec(CSS)?.[0] ?? "";
  const percents = [...rule.matchAll(/([\d.]+)%/g)].map((m) => Number(m[1]));
  const expected = [
    WASH_STROKE_FRACTION * 100,
    WASH_MID_OFFSET * 100,
    WASH_LOW_OFFSET * 100,
    WASH_BOTTOM_FRACTION * 100,
  ];
  // Compared to a tolerance, not for equality: the fractions are authored as
  // 0..1 and scaled here, so `0.14 * 100` is 14.000000000000002 in binary
  // floating point and would never equal the CSS `14`. A tolerance far below
  // one percentage point still catches a genuine retune of either side.
  const STOP_TOLERANCE = 1e-6;
  check(
    `.af-node-wash carries exactly the stops ${expected
      .map((p) => Number(p.toFixed(6)))
      .join("% / ")}%`,
    percents.length === expected.length &&
      percents.every((p, i) => Math.abs(p - expected[i]) < STOP_TOLERANCE),
    `CSS has [${percents.join(", ")}] — retuning one side silently forks the wash ` +
      `between the screen and the exported file`,
  );
}

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} palette assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} palette assertions passed.`);

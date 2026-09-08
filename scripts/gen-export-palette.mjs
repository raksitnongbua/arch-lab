/**
 * Generates `features/viewer/export/palette.generated.ts` — every theme's
 * `ExportTheme` as concrete sRGB, resolved from `globals.css` without a
 * browser.
 *
 * WHY THIS EXISTS. `resolveExportTheme()` reads the palette off the LIVE
 * computed styles, which is the right answer on screen and no answer at all
 * in a route handler: the render route (`/api/render`) draws a diagram on the
 * server, where there is no document to compute from. The two honest options
 * were a hand-written palette table — a sixth place every new theme has to be
 * edited, and the first one nothing would fail on when it is forgotten — or
 * deriving the table from the CSS that already holds the palette. This is the
 * second.
 *
 * SO THE CSS STAYS THE ONE SOURCE OF TRUTH. Adding a theme is still the five
 * edits the `THEMES` note in `lib/constants.ts` lists; this file makes the
 * sixth automatic, and `check:export-palette` fails when the checked-in output
 * no longer matches what `globals.css` says. Never hand-edit the output.
 *
 * The maths is `scripts/lib/oklch.mjs` and the cascade model is
 * `scripts/lib/theme-css.mjs` — the same pair `theme-check.mjs` measures the
 * palette with, so this generator cannot bless a colour that check rejects.
 * What the browser does with an expression, this does arithmetically:
 * `var()` aliases resolve against the active theme (`resolveToken`), and
 * `color-mix(in oklch, …)` is lerped on the oklch axes over the shorter hue
 * arc, which is what the specification asks for.
 *
 * Usage: `pnpm gen:export-palette` writes the file;
 * `pnpm check:export-palette` proves the checked-in copy is current.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { oklchToLinear, parseOklch, toSrgbCss } from "./lib/oklch.mjs";
import { resolveToken, tokensOf } from "./lib/theme-css.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CSS_PATH = join(ROOT, "src/app/globals.css");
const CONSTANTS_PATH = join(ROOT, "src/lib/constants.ts");
const OUT_PATH = join(ROOT, "src/features/viewer/export/palette.generated.ts");

const CSS = readFileSync(CSS_PATH, "utf8");
const CONSTANTS = readFileSync(CONSTANTS_PATH, "utf8");

/* ------------------------------------------------------------------ tokens */

/* Mirrors TOKEN_VARS / ROLE_TOKEN_VARS / FLOW_SHAPE_TOKENS in
   `features/viewer/export/theme.ts`, and every fallback below mirrors that
   function's own. The two lists ARE a duplication, and a deliberate one: this
   script runs in Node with no TypeScript in it, and the alternative — reading
   the table out of the module through `resolve-ts.mjs` — would make the
   generator depend on the shape of a module it is generating a sibling of.
   `check:export-palette` closes the loop by regenerating, so a token added
   there and forgotten here shows up as a palette that does not build. */
const SCALARS = [
  ["canvas", "--canvas", "#ffffff"],
  ["node", "--node", "#ffffff"],
  ["nodeForeground", "--node-foreground", "#1f2430"],
  ["nodeBorder", "--node-border", "#8a8f9d"],
  ["edge", "--edge", "#7d828f"],
  ["primary", "--primary", "#4f46e5"],
  ["accent", "--accent", "#22b8cf"],
  ["destructive", "--destructive", "#e5484d"],
  ["destructiveForeground", "--destructive-foreground", "#ffffff"],
  ["mutedForeground", "--muted-foreground", "#6a7080"],
  ["foreground", "--foreground", "#1f2430"],
];

const ROLES = {
  person: ["--node-person", "--node-person-border"],
  internal: ["--node-internal", "--node-internal-border"],
  external: ["--node-external", "--node-external-border"],
  database: ["--node-database", "--node-database-border"],
  queue: ["--node-queue", "--node-queue-border"],
};

const FLOW_SHAPES = {
  start: ["--flow-start", "--flow-start-border"],
  end: ["--flow-end", "--flow-end-border"],
  step: ["--flow-step", "--flow-step-border"],
  decision: ["--flow-decision", "--flow-decision-border"],
  io: ["--flow-io", "--flow-io-border"],
  call: ["--flow-call", "--flow-call-border"],
};

/* -------------------------------------------------------------- resolution */

/** A resolved token value as `{ oklch, alpha }`, or null when unparseable. */
function coordsOf(raw, themeTokens, baseline, depth = 8) {
  if (raw === null || raw === undefined || depth === 0) return null;
  const value = raw.trim();

  const ref = /^var\((--[a-z0-9-]+)\)$/.exec(value);
  if (ref !== null) {
    return coordsOf(
      resolveToken(ref[1], themeTokens, baseline),
      themeTokens,
      baseline,
      depth - 1,
    );
  }

  if (value.startsWith("color-mix(")) {
    return mixCoords(value, themeTokens, baseline, depth);
  }

  const parsed = parseOklch(value);
  if (parsed === null) return null;
  return { oklch: parsed.oklch, alpha: parsed.alpha };
}

/**
 * `color-mix(in oklch, <a> <p>%, <b>)` on the oklch axes.
 *
 * Only the `in oklch` form appears in the palette and only that form is
 * accepted: silently treating an `in srgb` mix as an oklch one would ship a
 * colour the screen never showed. An omitted percentage is the remainder, as
 * the specification says, and hue takes the SHORTER arc — the default for a
 * polar space.
 */
function mixCoords(value, themeTokens, baseline, depth) {
  const inner = /^color-mix\(\s*in\s+oklch\s*,\s*(.+)\)$/s.exec(value);
  if (inner === null) return null;

  const parts = splitTopLevel(inner[1]);
  if (parts.length !== 2) return null;

  const sides = parts.map((part) => {
    const percent = /\s([\d.]+)%$/.exec(part);
    const colour = percent === null ? part : part.slice(0, percent.index);
    return {
      weight: percent === null ? null : Number.parseFloat(percent[1]) / 100,
      coords: coordsOf(colour.trim(), themeTokens, baseline, depth - 1),
    };
  });
  if (sides.some((side) => side.coords === null)) return null;

  let [wa, wb] = sides.map((side) => side.weight);
  if (wa === null && wb === null) [wa, wb] = [0.5, 0.5];
  else if (wa === null) wa = 1 - wb;
  else if (wb === null) wb = 1 - wa;
  const total = wa + wb;
  if (total === 0) return null;
  const t = wb / total;

  const [a, b] = sides.map((side) => side.coords);
  // Shorter hue arc, then normalized back into [0, 360).
  let dh = b.oklch[2] - a.oklch[2];
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  const hue = (a.oklch[2] + dh * t + 360) % 360;

  return {
    oklch: [
      a.oklch[0] + (b.oklch[0] - a.oklch[0]) * t,
      a.oklch[1] + (b.oklch[1] - a.oklch[1]) * t,
      hue,
    ],
    alpha: a.alpha + (b.alpha - a.alpha) * t,
  };
}

/** Splits on commas that are not inside parentheses. */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if (ch === "," && depth === 0) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts.filter((part) => part !== "");
}

/* ------------------------------------------------------------------- build */

const THEMES = [
  ...(/export const THEMES = \[([^\]]*)\]/.exec(CONSTANTS)?.[1] ?? "").matchAll(
    /"([a-z]+)"/g,
  ),
].map((m) => m[1]);

if (THEMES.length === 0) {
  console.error("gen:export-palette — could not read THEMES from constants.ts");
  process.exit(1);
}

const baseline = tokensOf(CSS, "light");
if (baseline === null) {
  console.error("gen:export-palette — the :root (light) block did not parse");
  process.exit(1);
}

const failures = [];

function paletteFor(theme) {
  const tokens = theme === "light" ? baseline : tokensOf(CSS, theme);
  if (tokens === null) {
    failures.push(`${theme}: no CSS block`);
    return null;
  }

  /** A token as a concrete colour string, falling back like the browser path. */
  const paint = (token, fallback) => {
    const coords = coordsOf(
      resolveToken(token, tokens, baseline),
      tokens,
      baseline,
    );
    if (coords === null) {
      failures.push(`${theme}: ${token} did not resolve`);
      return fallback;
    }
    return toSrgbCss(oklchToLinear(...coords.oklch), coords.alpha);
  };

  const scalars = Object.fromEntries(
    SCALARS.map(([key, token, fallback]) => [key, paint(token, fallback)]),
  );

  const pairs = (table) =>
    Object.fromEntries(
      Object.entries(table).map(([key, [fill, border]]) => [
        key,
        {
          fill: paint(fill, scalars.node),
          border: paint(border, scalars.nodeBorder),
        },
      ]),
    );

  /** A bare numeric token — mirrors `finiteOr` in `theme.ts`. */
  const number = (token, fallback) => {
    const parsed = Number.parseFloat(
      resolveToken(token, tokens, baseline) ?? "",
    );
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const rawOpacity = Number.parseFloat(
    resolveToken("--role-texture-opacity", tokens, baseline) ?? "",
  );

  return {
    ...scalars,
    // Each of these three falls back to another RESOLVED token rather than a
    // literal, exactly as `resolveExportTheme` does: a palette that cannot
    // resolve the mix shows the drift in the connector's own colour, and one
    // that cannot resolve the cap paints it in the brand colour.
    edgeDrift: paint("--edge-drift", scalars.edge),
    criticalCap: paint("--gantt-critical", scalars.primary),
    nodeMeta: paint("--node-meta", scalars.mutedForeground),
    canvasGrid: paint("--canvas-grid", scalars.nodeBorder),
    nodeRoles: pairs(ROLES),
    flowShapes: pairs(FLOW_SHAPES),
    tagFill: {
      lightness: number("--tag-fill-l", 0.93),
      chromaCap: number("--tag-fill-c", 0.055),
    },
    roleTexture: {
      ink: paint("--role-texture-ink", scalars.nodeBorder),
      // Degrades to 0 — no texture — which is the safe direction: a plainer
      // diagram, never a lattice at an unintended opacity.
      opacity: Number.isFinite(rawOpacity) ? rawOpacity : 0,
    },
  };
}

const palettes = {};
for (const theme of THEMES) {
  const palette = paletteFor(theme);
  if (palette !== null) palettes[theme] = palette;
}

if (failures.length > 0) {
  console.error("gen:export-palette — unresolved tokens:");
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

/* ------------------------------------------------------------------- write */

const HEADER = `/**
 * GENERATED by \`scripts/gen-export-palette.mjs\` from \`app/globals.css\`.
 * Do not edit: run \`pnpm gen:export-palette\`. \`pnpm check:export-palette\`
 * fails when this file and the CSS disagree.
 *
 * Every theme's export palette as concrete sRGB, for the callers that have no
 * document to compute styles from — the render route draws a diagram on the
 * server, where \`resolveExportTheme()\` cannot run. On screen that function is
 * still the only right answer, because it reads the palette the reader is
 * actually looking at; this table is what the server has instead.
 */

import type { Theme } from "@/lib/constants";

import type { ExportTheme } from "./theme";

/** Every theme in \`THEMES\`, resolved. */
export const EXPORT_PALETTES: Record<Theme, ExportTheme> = `;

const FOOTER = `;

/**
 * One theme's palette, for a caller holding a name it has already validated
 * against \`THEMES\`. Unknown names cannot be constructed through \`Theme\`, so
 * there is no fallback here to disagree with the route's own default.
 */
export function exportPaletteFor(theme: Theme): ExportTheme {
  return EXPORT_PALETTES[theme];
}
`;

writeFileSync(
  OUT_PATH,
  `${HEADER}${JSON.stringify(palettes, null, 2)} as const${FOOTER}`,
  "utf8",
);

console.log(
  `gen:export-palette — wrote ${THEMES.length} palettes to ${OUT_PATH.slice(ROOT.length + 1)}`,
);

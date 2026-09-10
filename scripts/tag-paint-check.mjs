/**
 * Proves `lib/tag-paint.ts` rebuilds an author's `tagcolor` the same way the
 * rest of the suite says the palette works.
 *
 * WHY A SECOND IMPLEMENTATION EXISTS AT ALL. On screen the tag fill is a
 * relative-colour expression the browser evaluates, and the export path used
 * to read the answer back off a canvas pixel — exact, and impossible in a
 * route handler. So `/api/render` computes it. That is two implementations of
 * one recipe, which `dry.md` is right to be suspicious of; this check is the
 * price of the second one.
 *
 * IT MEASURES AGAINST `scripts/lib/oklch.mjs`, the conversion `theme-check`
 * and `canvas-edit-check` already use to audit every tag fill's contrast — so
 * the fill this ships and the fill those checks bless cannot be different
 * colours. `canvas-edit-check.mjs` performs the identical rebuild inline
 * (`parseHex` → `oklchToLinear(fillL, min(C, fillC), h)`); that expression is
 * the reference, and it is written out here rather than imported so a reader
 * can see what is being compared.
 *
 * WHAT IT CANNOT PROVE is that a browser agrees to the last byte, because
 * there is no browser here. That is exactly why `resolveTagPaint` was left
 * alone: the canvas and the download still take the browser's own answer, so
 * a rounding disagreement can only ever affect a server-drawn image, never the
 * bytes a reader downloads.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

import { oklchToLinear, parseHex } from "./lib/oklch.mjs";
import { resolveToken, tokensOf } from "./lib/theme-css.mjs";
import { registerTsResolution } from "./lib/resolve-ts.mjs";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
registerTsResolution(ROOT);

const { tagPaint } = await import(path.join(ROOT, "src/lib/tag-paint.ts"));

const CSS = readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8");
const CONSTANTS = readFileSync(path.join(ROOT, "src/lib/constants.ts"), "utf8");

const THEMES = [
  ...(/export const THEMES = \[([^\]]*)\]/.exec(CONSTANTS)?.[1] ?? "").matchAll(
    /"([a-z]+)"/g,
  ),
].map((m) => m[1]);

const baseline = tokensOf(CSS, "light");

let failures = 0;
let compared = 0;
const check = (label, ok, detail) => {
  if (ok) return;
  failures += 1;
  console.error(
    `FAIL: ${label}${detail === undefined ? "" : `\n      ${detail}`}`,
  );
};

const gammaEncode = (c) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
const toHex = (linear) =>
  `#${linear
    .map((c) =>
      Math.round(Math.min(1, Math.max(0, gammaEncode(c))) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

/* Hues all the way round, plus the greys and the near-black/near-white ends
   where the chroma cap does nothing and the hue is undefined — the cases a
   naive implementation divides by zero on. */
const COLOURS = [
  "#e5484d",
  "#f5a524",
  "#30a46c",
  "#0091ff",
  "#8e4ec6",
  "#000000",
  "#ffffff",
  "#808080",
  "#010203",
  "#fefdfc",
];

const FALLBACK = { fill: "#ffffff", stroke: "#8a8f9d" };

for (const theme of THEMES) {
  const tokens = theme === "light" ? baseline : tokensOf(CSS, theme);
  const lightness = Number.parseFloat(
    resolveToken("--tag-fill-l", tokens, baseline),
  );
  const chromaCap = Number.parseFloat(
    resolveToken("--tag-fill-c", tokens, baseline),
  );
  check(
    `${theme}: both tag-fill pins are numbers`,
    Number.isFinite(lightness) && Number.isFinite(chromaCap),
    `--tag-fill-l=${lightness} --tag-fill-c=${chromaCap}`,
  );

  for (const colour of COLOURS) {
    const hex = parseHex(colour);
    const [, chroma, hue] = hex.oklch;
    const expected = toHex(
      oklchToLinear(lightness, Math.min(chroma, chromaCap), hue),
    );

    const actual = tagPaint(colour, { lightness, chromaCap }, FALLBACK);
    check(
      `${theme}: ${colour} rebuilds to the audited fill`,
      actual.fill === expected,
      `oklch.mjs: ${expected}\n      tag-paint.ts: ${actual.fill}`,
    );
    /* The stroke is the author's colour ITSELF, never reconstructed — the
       on-screen border is the raw value, and a rebuilt stroke would be a
       second colour nobody chose. */
    check(
      `${theme}: ${colour} keeps the author's own stroke`,
      actual.stroke === colour,
      `stroke came back as ${actual.stroke}`,
    );
    compared += 1;
  }
}

/* A colour the grammar accepts and this cannot canonicalise must degrade
   WHOLE — an author stroke around a role-palette fill would read as a
   rendering bug rather than a degradation. */
for (const exotic of [
  "rebeccapurple",
  "oklch(0.7 0.1 200)",
  "",
  "not a colour",
]) {
  const actual = tagPaint(
    exotic,
    { lightness: 0.93, chromaCap: 0.055 },
    FALLBACK,
  );
  check(
    `"${exotic}" degrades to the whole fallback pair`,
    actual.fill === FALLBACK.fill && actual.stroke === FALLBACK.stroke,
    `got ${JSON.stringify(actual)}`,
  );
}

/* `normalizeTint` canonicalises more than long hex, and the fill must follow
   the canonical form rather than the spelling. */
for (const [written, canonical] of [
  ["#ABC", "#aabbcc"],
  ["rgb(229, 72, 77)", "#e5484d"],
]) {
  const a = tagPaint(written, { lightness: 0.93, chromaCap: 0.055 }, FALLBACK);
  const b = tagPaint(
    canonical,
    { lightness: 0.93, chromaCap: 0.055 },
    FALLBACK,
  );
  check(
    `${written} is treated as ${canonical}`,
    a.fill === b.fill && a.stroke === canonical,
    `${JSON.stringify(a)} vs ${JSON.stringify(b)}`,
  );
}

if (failures > 0) {
  console.error(`\n${failures} tag-paint assertion(s) failed.`);
  process.exit(1);
}

console.log(
  `tag paint matches the audited oklch rebuild across ${compared} theme/colour pairs`,
);

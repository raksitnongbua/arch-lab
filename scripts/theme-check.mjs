#!/usr/bin/env node
/**
 * Every theme is complete, and legible — measured, not eyeballed.
 *
 * Themes here are pure data: a class selector reassigning the token set, which
 * makes a new one cheap to add and just as cheap to get wrong. Two failures
 * are invisible until someone is looking at the theme in question:
 *
 *   1. **A missing block.** `THEMES` in `lib/constants.ts` drives the provider
 *      and the picker, so a name listed there with no matching CSS block is
 *      offered to readers and silently renders as the `:root` (light) palette.
 *   2. **A partial block.** Anything a dark-family theme omits falls back to
 *      the LIGHT value — so one forgotten token is white text on a white card,
 *      in one theme only.
 *
 * And then contrast. `globals.css` already records measured ratios for the two
 * original themes (AF-E6-S1: node-border ≥3:1 against --node), which is the
 * standard every later theme has to meet too. The ratios below are computed
 * from the oklch values themselves, so a palette cannot claim a figure it does
 * not hit.
 *
 * The conversion is validated against the two figures globals.css documents —
 * if this file's maths drifts, those stop reproducing and the check fails
 * loudly rather than blessing a bad palette. That check caught a real error
 * while this was written: the luminance formula wants LINEAR sRGB, and
 * gamma-decoding it a second time reported 1.45:1 where the file says 3.61:1.
 *
 * Exits non-zero on any failure. Run with: pnpm check:themes
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

/* ----------------------------------------------------------------------- */
/* Colour maths                                                             */
/* ----------------------------------------------------------------------- */

/** oklch -> LINEAR sRGB. */
function oklchToLinear(L, C, h) {
  const rad = (h * Math.PI) / 180;
  const a = C * Math.cos(rad);
  const b = C * Math.sin(rad);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.min(1, Math.max(0, v)));
}

/* Already linear, so no gamma decode — see the header. */
const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const parseOklch = (value) => {
  const m = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(value ?? "");
  return m === null ? null : oklchToLinear(+m[1], +m[2], +m[3]);
};

/* ----------------------------------------------------------------------- */
/* The maths reproduces what globals.css already claims                     */
/* ----------------------------------------------------------------------- */

console.log("the conversion agrees with the figures globals.css records");

{
  const dark = contrast(
    parseOklch("oklch(0.55 0.024 275)"),
    parseOklch("oklch(0.215 0.02 275)"),
  );
  const light = contrast(
    parseOklch("oklch(0.62 0.012 265)"),
    parseOklch("oklch(1 0 0)"),
  );
  check(
    `dark node-border/node reproduces 3.61:1 (got ${dark.toFixed(2)})`,
    Math.abs(dark - 3.61) < 0.05,
  );
  check(
    `light node-border/node reproduces 3.64:1 (got ${light.toFixed(2)})`,
    Math.abs(light - 3.64) < 0.05,
  );
}

/* ----------------------------------------------------------------------- */
/* Every declared theme has a complete block                                */
/* ----------------------------------------------------------------------- */

console.log("\nevery theme in THEMES has a complete CSS block");

const declared = [
  ...(/export const THEMES = \[([^\]]*)\]/.exec(CONSTANTS)?.[1] ?? "").matchAll(
    /"([a-z-]+)"/g,
  ),
].map((m) => m[1]);

/** Token map for a selector; `:root` is the light baseline every theme falls back to. */
function tokensOf(selector) {
  const pattern =
    selector === "light"
      ? /^:root \{(.*?)^\}/ms
      : new RegExp(`^\\.${selector} \\{(.*?)^\\}`, "ms");
  const body = pattern.exec(CSS)?.[1];
  if (body === undefined) return null;
  return new Map(
    [...body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [
      m[1],
      m[2].trim(),
    ]),
  );
}

const baseline = tokensOf("light");
check("the :root (light) baseline parses", baseline !== null);

const palettes = new Map();
for (const theme of declared) {
  const tokens = tokensOf(theme);
  if (tokens === null) {
    check(
      `${theme}: has a CSS block`,
      false,
      `no \`.${theme} { … }\` in globals.css — it would render as light`,
    );
    continue;
  }
  check(`${theme}: has a CSS block`, true);
  palettes.set(theme, tokens);

  /* A theme that redefines --background must redefine every CONCRETE COLOUR:
     anything it omits silently inherits the LIGHT value. Only concrete colours
     — a length like --radius is theme-independent, and an indirection like
     `--node-fill: var(--node)` resolves per theme on its own, so demanding
     either would fail correct code, which is how a check teaches people to
     ignore it. */
  if (theme === "light") continue;
  const isConcreteColour = (value) =>
    (value.includes("oklch(") || value.trimStart().startsWith("#")) &&
    !value.includes("var(");
  const missing = [...baseline.entries()]
    .filter(([, value]) => isConcreteColour(value))
    .map(([token]) => token)
    .filter((token) => !tokens.has(token));
  check(
    `${theme}: redefines every token the baseline declares (${tokens.size})`,
    missing.length === 0,
    `missing: ${missing.join(", ")} — these would fall back to the light value`,
  );
}

/* ----------------------------------------------------------------------- */
/* Dark-family themes also wear .dark                                       */
/* ----------------------------------------------------------------------- */

console.log("\nevery dark-family theme is in the dark variant");

{
  /* Tailwind's `dark:` utilities key off ONE selector, so a dark-family theme
     missing from it takes the light branch of every one of them while its
     tokens are dark. Stamping a second class on <html> is the obvious
     alternative and is impossible — next-themes writes through DOMTokenList,
     which rejects a token containing a space ("dark midnight" throws
     InvalidCharacterError), which is exactly how this was found. */
  const variant = /@custom-variant dark \(([^)]*)\)/.exec(CSS)?.[1] ?? "";
  const colorScheme =
    /((?:\s*html\.[a-z-]+,?)+)\s*\{\s*color-scheme: dark/.exec(CSS)?.[1] ?? "";

  const missingVariant = [];
  const missingScheme = [];
  for (const [theme, tokens] of palettes) {
    /* "dark family" is decided by the PALETTE, not the name: a background
       darker than its foreground is the definition that cannot go stale. */
    const bg = parseOklch(tokens.get("--background"));
    const fg = parseOklch(tokens.get("--foreground"));
    if (bg === null || fg === null || luminance(bg) >= luminance(fg)) continue;
    if (!variant.includes(`.${theme} `)) missingVariant.push(theme);
    if (!colorScheme.includes(`html.${theme}`)) missingScheme.push(theme);
  }
  check(
    "every dark-family theme appears in the `dark` custom-variant",
    missingVariant.length === 0,
    `${missingVariant.join(", ")} — every dark: utility would use its light branch`,
  );
  check(
    "every dark-family theme sets color-scheme: dark",
    missingScheme.length === 0,
    `${missingScheme.join(", ")} — native scrollbars and form controls stay light`,
  );
}

/* ----------------------------------------------------------------------- */
/* Contrast, per theme                                                      */
/* ----------------------------------------------------------------------- */

console.log("\ncontrast (measured from the oklch values themselves)");

/** [foreground token, background token, minimum ratio, what it is for]. */
const PAIRS = [
  ["--foreground", "--background", 7, "body text"],
  ["--muted-foreground", "--background", 4.5, "secondary text"],
  ["--node-foreground", "--node", 7, "a node's title"],
  ["--node-meta", "--node", 4.5, "a node's technology line"],
  /* AF-E6-S1. A node's border is what tells one kind from another, so it is
     held to the non-text UI minimum against its own fill. */
  ["--node-border", "--node", 3, "a node's outline"],
  ["--node-person-border", "--node-person", 3, "a person card's outline"],
  [
    "--node-internal-border",
    "--node-internal",
    3,
    "an internal card's outline",
  ],
  [
    "--node-external-border",
    "--node-external",
    3,
    "an external card's outline",
  ],
  ["--node-database-border", "--node-database", 3, "a database card's outline"],
  ["--node-queue-border", "--node-queue", 3, "a queue card's outline"],
  ["--primary", "--background", 3, "the primary accent"],
];

for (const [theme, tokens] of palettes) {
  const value = (token) => tokens.get(token) ?? baseline.get(token);
  const failed = [];
  for (const [fg, bg, min, what] of PAIRS) {
    const a = parseOklch(value(fg));
    const b = parseOklch(value(bg));
    if (a === null || b === null) continue; // not an oklch value (a color-mix, say)
    const got = contrast(a, b);
    if (got < min) {
      failed.push(
        `${what}: ${fg} on ${bg} is ${got.toFixed(2)}:1, needs ${min}:1`,
      );
    }
  }
  check(
    `${theme}: every measured pair clears its minimum`,
    failed.length === 0,
    failed.join("; "),
  );
}

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} theme assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} theme assertions passed.`);

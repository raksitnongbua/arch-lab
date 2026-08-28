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
 * original themes (: node-border ≥3:1 against --node), which is the
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
 * AND THEN REACHABILITY, which is a third way a theme fails invisibly: a
 * complete, legible palette nobody can select is not offered. The picker lives
 * in the site header, and immersive mode covers the site header with a fixed
 * canvas — so for the length of the one mode built for presenting a diagram to
 * a room, every theme in `THEMES` was unreachable. That is the mode where the
 * choice matters most (a projector is not a laptop screen), and the only way
 * out was to leave the mode. One section below scans the two hosts that own an
 * immersive strip and pins the control into both of them.
 *
 * AND THE DEFAULT, which is not a palette question at all but is decided in the
 * same two files. It follows `prefers-color-scheme` now, resolved into a real
 * theme name before first paint (`lib/theme-default.ts`), and every part of
 * that mechanism is invisible when it breaks: a seed that runs after
 * next-themes reads storage is a write nobody consumes, a `System` row that
 * does not set the flag is a row that forgets by the next load, and a
 * `themeColor` left behind is a coloured bar around a differently-coloured
 * page. What the script DOES is proved by `src/lib/theme-default.test.ts`,
 * which executes the string; the last section pins the wiring no unit test can
 * see.
 *
 * Exits non-zero on any failure. Run with: pnpm check:themes
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { contrast, flatten, luminance, parseOklch } from "./lib/oklch.mjs";
import { tokensOf } from "./lib/theme-css.mjs";

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
/* Colour maths: shared with check:flowchart-palette — `./lib/oklch.mjs`.   */
/* The self-validation below is what keeps the shared copy honest.          */
/* ----------------------------------------------------------------------- */

/* ----------------------------------------------------------------------- */
/* The maths reproduces what globals.css already claims                     */
/* ----------------------------------------------------------------------- */

console.log("the conversion agrees with the figures globals.css records");

{
  const opaque = (v) => parseOklch(v).rgb;
  const dark = contrast(
    opaque("oklch(0.55 0.024 275)"),
    opaque("oklch(0.215 0.02 275)"),
  );
  const light = contrast(
    opaque("oklch(0.62 0.012 265)"),
    opaque("oklch(1 0 0)"),
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

/* Block parsing is shared with check:flowchart-palette — ./lib/theme-css.mjs. */
const baseline = tokensOf(CSS, "light");
check("the :root (light) baseline parses", baseline !== null);

const palettes = new Map();
for (const theme of declared) {
  const tokens = tokensOf(CSS, theme);
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
    if (bg === null || fg === null || luminance(bg.rgb) >= luminance(fg.rgb))
      continue;
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
  /* A node's border is what tells one kind from another, so it is
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
  /* Everything is measured as SEEN: a translucent surface is flattened over
     the page behind it, and text is flattened over that surface. */
  const page = parseOklch(value("--background"));
  for (const [fg, bg, min, what] of PAIRS) {
    const a = parseOklch(value(fg));
    const b = parseOklch(value(bg));
    if (a === null || b === null || page === null) continue; // a color-mix, say
    const under = flatten(b, page);
    const got = contrast(flatten(a, { rgb: under, alpha: 1 }), under);
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
/* Reachability — the picker survives the mode that hides the site header    */
/* ----------------------------------------------------------------------- */

console.log("\nthe picker is reachable in immersive mode");

/* COMMENTS STRIPPED, the `canvas-edit-check.mjs` precaution: every one of these
   patterns is also DESCRIBED in prose beside the code it pins, so a scan over
   the raw source would match the sentence saying what the code does and pass
   with the code deleted. */
const readCode = (rel) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

check(
  "the site header still carries the picker, unconditionally",
  /<ThemeToggle\s*\/>/.test(readCode("src/components/layout/header.tsx")),
  "the header's copy is the one every non-immersive route relies on; the " +
    "immersive strips below are a second home, not a replacement",
);

/* THE TWO HOSTS THAT OWN AN IMMERSIVE STRIP, and it is exactly two: the C4
   shell (which every C4 host mounts — the playground, the bundled model page)
   and the playground's section for the other five notations. A third would
   need adding here; `purpose.md` fixes the order of work for a new notation and
   this is one of the surfaces it lands on. */
for (const host of [
  "src/features/viewer/components/viewer-shell.tsx",
  "src/features/playground/components/view-playground.tsx",
]) {
  const code = readCode(host);
  /* GATED ON THE MODE, opening UPWARD, in one pattern — because the two
     failures are different and both silent. Ungated, the strip shows a second
     picker on every screen that already has one in the header. Anchored
     `top-full`, the menu opens off the bottom of the viewport from a footer
     strip and the reader sees a sliver of its first row. */
  check(
    `${host.split("/").pop()} offers the picker while immersive, opening upward`,
    /isImmersive \?\s*\(\s*<ThemeToggle[\s\S]{0,400}?panelSide="up"/.test(code),
    "either the picker is not gated on immersive (a second copy of a control " +
      'the header already carries) or it is not passing panelSide="up" (a menu ' +
      "opening off the bottom of the pane it was opened from)",
  );
}

/* ----------------------------------------------------------------------- */
/* The default a first-time visitor gets, and the chrome around it          */
/* ----------------------------------------------------------------------- */

console.log("\nthe system-derived default");

/* ORDER IS THE WHOLE MECHANISM. `lib/theme-default.ts` writes the resolved
   theme name into storage; next-themes' own blocking script then reads it. Both
   are pre-paint, so if the seed ever renders AFTER `<Providers>` the read
   happens first, the seed is a write nobody consumes, and every first-time
   visitor silently goes back to one unconditional default — with nothing on
   screen to show it. What the script DOES is proved by
   `src/lib/theme-default.test.ts`, which executes the string; this pins where
   it runs, which no unit test can see. */
{
  const layout = readCode("src/app/layout.tsx");
  const seed = layout.indexOf('id="theme-default"');
  const providers = layout.indexOf("<Providers>");
  check(
    "the seed script renders before <Providers>, where next-themes' script is",
    seed !== -1 && providers !== -1 && seed < providers,
    "the seed must run before next-themes reads storage; beforeInteractive puts " +
      "it in <head> only while it is rendered above the provider that owns the " +
      "body script",
  );
}

/* THE PICKER OFFERS THE STATE, not just the palettes. Without a `System` row
   the default is system-aware exactly once and there is no way back to
   following — a reader who tries any other theme has silently pinned it
   forever. And the row is only worth having if selecting it WRITES the flag,
   which is the half a scan can catch: a row that merely applied the resolved
   palette would look identical on the click and forget by the next load. */
{
  const picker = readCode("src/components/layout/theme-toggle.tsx");
  check(
    "the picker offers a System row that records the choice",
    /label="System"/.test(picker) && /writeFollowSystem\(true\)/.test(picker),
    "the System row is what makes following reachable a second time; setting " +
      "the theme without setting the flag forgets by the next load",
  );
  check(
    "choosing a palette pins it, clearing the flag",
    /writeFollowSystem\(false\)/.test(picker),
    "a palette chosen while following must clear the flag, or the root's OS " +
      "listener overwrites the reader's choice the next time the system changes",
  );
}

/* THE SERVER-SAFE HALF STAYS SERVER-SAFE. `lib/theme-default.ts` is imported by
   the root layout, a server component, so it may not depend on React hooks —
   the preference store lives in `lib/theme-follow.ts` for that reason. Turbopack
   does fail the build on this, but only at `pnpm build`, and the fix is a file
   split rather than a one-line edit: naming it here says why the two files
   exist before somebody helpfully merges them back. */
check(
  "the module the root layout imports has no React dependency",
  !/from "react"/.test(read("src/lib/theme-default.ts")),
  "a server component cannot import a module that depends on hooks; the store " +
    "and its hooks belong in lib/theme-follow.ts",
);

/* THE LIVE HALF, MOUNTED ONCE AND AT THE ROOT. The pre-paint script covers
   every load; the listener covers a system that changes with the page already
   on screen. It belongs beside the provider because `ThemeToggle` mounts twice
   on a playground route (the header and the immersive strip), and two listeners
   would race to write the same value on every change. */
check(
  "the OS-change listener is mounted inside the provider, once",
  /<FollowSystemTheme \/>/.test(readCode("src/app/providers.tsx")),
  "without it, a reader following the system has to reload to see a change " +
    "their machine made while the tab was open",
);

/* THE BROWSER CHROME AGREES WITH THE GROUND IT WRAPS. `viewport.themeColor` is
   two hand-converted hex values keyed on `prefers-color-scheme` — the same
   question the default is keyed on — and hand-converted is why this is checked:
   the palette moves in `globals.css` and nothing else in the repo would notice
   that the phone's title bar is still painting the old one. Measured, not
   eyeballed, from the same oklch parser the contrast assertions use. */
const hex = (oklch) => {
  const parsed = parseOklch(oklch);
  if (parsed === null) return null;
  return `#${parsed.rgb
    .map((channel) =>
      Math.round(Math.min(1, Math.max(0, channel)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
};

{
  const layout = read("src/app/layout.tsx");
  /* The two themes the default resolves to, in the order the media queries
     name them: `:root` is what the `light` theme renders as (it has no block of
     its own — see `tokensOf`), and `.contrast` is the dark side. */
  for (const [scheme, selector] of [
    ["light", "light"],
    ["dark", "contrast"],
  ]) {
    const tokens = tokensOf(CSS, selector);
    const expected = tokens === null ? null : hex(tokens.get("--background"));
    const declared = new RegExp(
      `media:\\s*"\\(prefers-color-scheme:\\s*${scheme}\\)"\\s*,\\s*color:\\s*"(#[0-9a-f]{6})"`,
      "i",
    ).exec(layout)?.[1];
    check(
      `themeColor for a ${scheme} system is the ${selector} palette's own ground`,
      expected !== null && declared?.toLowerCase() === expected,
      `viewport.themeColor declares ${declared ?? "nothing"} for ${scheme}; ` +
        `the ${selector} palette's --background converts to ${expected ?? "an unparsed value"}`,
    );
  }
}

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} theme assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} theme assertions passed.`);

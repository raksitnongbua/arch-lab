#!/usr/bin/env node
/**
 * Social-card check — the OpenGraph cards must exist per document kind, share
 * one frame, and contain nothing Satori cannot draw.
 *
 * Three failures this prevents, all of which shipped or nearly shipped:
 *
 *   1. ONE CARD FOR TWO DOCUMENT KINDS. The root card's copy read "C4
 *      architecture diagrams", so a shared sequence link previewed as an advert
 *      for the other half of the product. Each playground now carries its own
 *      card, and this asserts they exist rather than trusting a file convention
 *      nobody re-checks.
 *   2. TOFU. `next/og` renders with Satori and no font is fetched, so a glyph
 *      outside the fallback's coverage draws as a hollow box. `.alab ⇄ JSON`
 *      did exactly that, and it is invisible in code review — the character
 *      looks fine in an editor. Card copy is therefore restricted to Latin-1
 *      plus a short allowlist of typography this design actually uses.
 *   3. `oklch()`. Satori cannot parse it, and the theme is authored in it — so
 *      a colour copied from `globals.css` into a card silently renders black.
 *
 * Static source assertions, in the same spirit as share-parity-check.mjs.
 * Run with: pnpm check:og-cards
 */

import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(ROOT, relative), "utf8");

/* CODE ONLY. Both content assertions below are about what Satori is asked to
   draw, and every one of these files EXPLAINS the rule it follows in prose —
   the frame's header says "Satori does not parse `oklch()`", the sequence card
   says it will not render a diagram at 1200x630. Testing the raw source made
   the documentation fail the check it documents. */
const code = (relative) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

let assertions = 0;
let failures = 0;
const check = (label, ok, detail) => {
  assertions += 1;
  if (ok) {
    console.log(`  ✓ ${label}`);
    return;
  }
  failures += 1;
  console.error(`  ✗ ${label}`);
  if (detail) console.error(`    ${detail}`);
};

/** Every card, and the route each one is the preview for. */
const CARDS = [
  ["src/app/opengraph-image.tsx", "/ (and every route without its own)"],
  ["src/app/view/c4/opengraph-image.tsx", "/view/c4"],
  ["src/app/view/sequence/opengraph-image.tsx", "/view/sequence"],
];
const FRAME = "src/features/marketing/og/card.tsx";

console.log("og-cards-check");

for (const [file, route] of CARDS) {
  check(
    `${route} has a card (${path.basename(path.dirname(file))})`,
    existsSync(path.join(ROOT, file)),
  );
  if (!existsSync(path.join(ROOT, file))) continue;
  const source = read(file);
  for (const named of ["alt", "size", "contentType"]) {
    check(
      `${route}: exports \`${named}\` (Next reads the metadata from these)`,
      new RegExp(`export const ${named}\\b`).test(source),
    );
  }
  check(
    `${route}: takes its size from OG_SIZE, not a re-typed 1200x630`,
    source.includes("OG_SIZE") && !/\b1200\b/.test(code(file)),
  );
  check(
    `${route}: builds on the shared OgCard frame`,
    source.includes("OgCard"),
  );
}

/* ---- no glyph the fallback font cannot draw ------------------------------
 * Latin-1 covers the copy; the allowlist is the typography this design uses on
 * purpose (middot separators, em dash, ellipsis, arrows in a couple of labels).
 * Anything else is a tofu box waiting to ship. */
const ALLOWED = new Set(["·", "—", "–", "…", "→", "⇢"]);
for (const [file, route] of [...CARDS, [FRAME, "the shared frame"]]) {
  if (!existsSync(path.join(ROOT, file))) continue;
  const source = read(file);
  const offenders = [
    ...new Set(
      [...source].filter(
        (character) =>
          character.codePointAt(0) > 0xff && !ALLOWED.has(character),
      ),
    ),
  ];
  check(
    `${route}: every character is one the fallback font can draw`,
    offenders.length === 0,
    offenders.length > 0
      ? `would render as tofu: ${offenders.map((c) => `${c} (U+${c.codePointAt(0).toString(16).toUpperCase()})`).join(", ")}`
      : undefined,
  );
}

/* ---- Satori cannot parse oklch(), and the theme is authored in it -------- */
for (const [file, route] of [...CARDS, [FRAME, "the shared frame"]]) {
  if (!existsSync(path.join(ROOT, file))) continue;
  check(
    `${route}: no oklch() (Satori would render it black)`,
    !code(file).includes("oklch("),
  );
}

check(
  "the frame keeps the lane colours in step with the stylesheet",
  (() => {
    const frame = read(FRAME);
    const css = read("src/app/globals.css");
    const lanes = /lanes: \[([^\]]+)\]/.exec(frame)?.[1] ?? "";
    const hexes = [...lanes.matchAll(/#[0-9a-f]{6}/gi)].map((m) =>
      m[0].toLowerCase(),
    );
    return (
      hexes.length === 5 &&
      hexes.every((hex) => css.toLowerCase().includes(hex))
    );
  })(),
  "every OG.lanes hex must appear in globals.css as a --seq-lane-* value",
);

if (failures > 0) {
  console.error(`\nog-cards-check: ${failures} of ${assertions} failed.`);
  process.exit(1);
}
console.log(`\nog-cards-check: all ${assertions} assertions passed.`);

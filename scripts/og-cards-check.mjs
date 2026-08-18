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

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { oklchToLinear } from "./lib/oklch.mjs";

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
  /* The sequence card lives with the REAL sequence page, which is the short
     route (`/view/seq`) — that is the URL every minted share link carries, and
     a preview is fetched for the URL as shared. It used to sit at
     `/view/sequence`, which the pair's flip turned into an alias, and for as
     long as it did every minted link previewed with the ROOT card: "C4
     architecture diagrams", the other document kind, which is the exact bug
     this card exists to fix. */
  ["src/app/view/seq/opengraph-image.tsx", "/view/seq"],
  /* The third and fourth document kinds get their cards WITH their routes,
     not after the first mis-preview — a `/view/flow` or `/view/uc` link
     previewing as the landing page (or as any other kind) is exactly the
     failure mode item 1 records. */
  ["src/app/view/flow/opengraph-image.tsx", "/view/flow"],
  ["src/app/view/uc/opengraph-image.tsx", "/view/uc"],
  /* `/mcp` is not a document kind and gets a card anyway, because "no card"
     is not neutral — Next serves the ROOT one, so every link to the connect
     guide previewed as "Architecture diagrams that survive review" over a C4
     stack. The page's readers are shopping for an MCP server; the preview was
     answering a different question. Listed here so the card cannot quietly
     disappear in a refactor and take the same silence back with it. */
  ["src/app/mcp/opengraph-image.tsx", "/mcp"],
];

/**
 * Cards that are a RE-EXPORT of one above rather than their own drawing.
 * `/view/sequence` needs one so the example routes nested under it inherit a
 * sequence-shaped preview instead of the root card — but it must stay a
 * re-export, because two copies of a card are two cards that can disagree.
 */
const REEXPORTED_CARDS = [
  [
    "src/app/view/sequence/opengraph-image.tsx",
    "src/app/view/seq/opengraph-image.tsx",
    "/view/sequence/[exampleId]",
  ],
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

/* ---- the re-exported cards point at a real one, and draw nothing ---------- */

for (const [file, target, route] of REEXPORTED_CARDS) {
  check(
    `${route} inherits a card (${file.split("/").slice(-2).join("/")})`,
    existsSync(path.join(ROOT, file)),
  );
  if (!existsSync(path.join(ROOT, file))) continue;
  const source = read(file);
  const targetName = path.basename(target, ".tsx");
  check(
    `${route}: re-exports the ${targetName} card rather than redrawing it`,
    source.includes(
      `from "../${path.basename(path.dirname(target))}/${targetName}"`,
    ) && /export\s*\{[^}]*\bdefault\b/.test(source),
    source.slice(0, 200),
  );
  for (const named of ["alt", "size", "contentType"]) {
    check(
      `${route}: re-exports \`${named}\` (Next reads it from this segment)`,
      new RegExp(`\\b${named}\\b`).test(source),
    );
  }
  check(
    `${route}: draws nothing of its own — one card, two mounting points`,
    !source.includes("OgCard"),
  );
}

/* ---- no glyph the fallback font cannot draw ------------------------------
 * Latin-1 covers the copy; the allowlist is the typography this design uses on
 * purpose (middot separators, em dash, ellipsis, arrows in a couple of labels).
 * Anything else is a tofu box waiting to ship. */
/* «» (U+00AB/U+00BB) pass the Latin-1 test below by codepoint — named here
   anyway because the use-case card leans on them («include» is that
   diagram's vocabulary) and a future tightening of this check must not
   silently turn the card's one term of art into tofu. */
const ALLOWED = new Set(["·", "—", "–", "…", "→", "⇢", "«", "»"]);
for (const [file, route] of [
  ...CARDS,
  ...REEXPORTED_CARDS.map(([file, , route]) => [file, route]),
  [FRAME, "the shared frame"],
]) {
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

/**
 * `oklch(...)` as `#rrggbb`, the way a browser would paint it.
 *
 * Satori cannot parse `oklch()`, which is the whole reason the card carries hex
 * at all — so the conversion has to happen somewhere, and doing it here means the
 * hexes in the card are checked against the tokens rather than trusted.
 */
function tokenHex(value) {
  const m = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(value ?? "");
  if (m === null) return null;
  return (
    "#" +
    oklchToLinear(+m[1], +m[2], +m[3])
      .map((v) =>
        Math.round(
          255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055),
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

/** Which `OG` key mirrors which token. */
const OG_TOKENS = {
  background: "--background",
  card: "--card",
  border: "--border",
  foreground: "--foreground",
  muted: "--muted-foreground",
  primary: "--primary",
  accent: "--accent",
  grid: "--canvas-grid",
};

check(
  "the card's palette is the DEFAULT theme's, converted exactly",
  (() => {
    /* THE COUPLING THIS PINS IS HAND-MAINTAINED AND WAS SILENT. The card exists
       to look like the page a click lands on, so its palette has to be the
       default theme's — and until this assertion the two were joined by nothing
       but a comment. The default has now moved twice (dark's ground was retuned,
       then the default became `contrast`) and each time the card had to be
       re-derived by hand; the first time, nothing would have complained if it had
       not been.
       Derived from `DEFAULT_THEME` rather than from a theme name typed here, so
       moving the default is one edit and this follows it. */
    const constants = read("src/lib/constants.ts");
    const theme = /DEFAULT_THEME: Theme = "([\w-]+)"/.exec(constants)?.[1];
    if (theme === undefined) return false;
    const selector = theme === "light" ? ":root" : `\\.${theme}`;
    const css = read("src/app/globals.css");
    const block = new RegExp(`^${selector} \\{([\\s\\S]*?)\\n\\}`, "m").exec(
      css,
    );
    if (block === null) return false;

    const frame = read(FRAME);
    const mismatched = [];
    for (const [key, token] of Object.entries(OG_TOKENS)) {
      const declared =
        new RegExp(`^  ${token}: ([^;]+);`, "m").exec(block[1]) ??
        new RegExp(`^  ${token}: ([^;]+);`, "m").exec(
          /^:root \{([\s\S]*?)\n\}/m.exec(css)?.[1] ?? "",
        );
      const want = tokenHex(declared?.[1]);
      const got = new RegExp(`${key}: "(#[0-9a-fA-F]{6})"`).exec(frame)?.[1];
      if (want === null || got === undefined || want !== got.toLowerCase()) {
        mismatched.push(
          `${key}: card has ${got}, ${token} converts to ${want}`,
        );
      }
    }
    if (mismatched.length > 0)
      console.error("    " + mismatched.join("\n    "));
    return mismatched.length === 0;
  })(),
  "every OG neutral and accent must be the exact conversion of the same token in DEFAULT_THEME's block",
);

check(
  "the browser-chrome colour is the same ground",
  (() => {
    /* `themeColor` paints the phone's own chrome around the page. A value left
       behind by a theme change is a coloured bar around a differently-coloured
       page, which is more noticeable on a phone than anything else on this list. */
    const constants = read("src/lib/constants.ts");
    const theme = /DEFAULT_THEME: Theme = "([\w-]+)"/.exec(constants)?.[1];
    const selector = theme === "light" ? ":root" : `\\.${theme}`;
    const css = read("src/app/globals.css");
    const block = new RegExp(`^${selector} \\{([\\s\\S]*?)\\n\\}`, "m").exec(
      css,
    );
    const want = tokenHex(
      new RegExp("^  --background: ([^;]+);", "m").exec(block?.[1] ?? "")?.[1],
    );
    const got = /themeColor: "(#[0-9a-fA-F]{6})"/.exec(
      read("src/app/layout.tsx"),
    )?.[1];
    return want !== null && got !== undefined && want === got.toLowerCase();
  })(),
  "layout.tsx's themeColor must be DEFAULT_THEME's --background, converted",
);

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

/* -------------------------------------------------------------------------- */
/* The tab icon parses                                                         */
/* -------------------------------------------------------------------------- */

/**
 * `src/app/icon.svg` is served as the favicon, and a favicon that fails to
 * parse has nowhere to report it: the browser silently draws its own default
 * globe, the page looks unbranded, and nothing in the build, the types or the
 * other checks says a word. That shipped — the file's own comment named the
 * theme tokens the CSS way, `--primary`, and XML forbids a double hyphen
 * inside a comment, so the whole file was unparseable.
 *
 * Parsed with a real XML parser rather than pattern-matched, because the
 * failure was a rule about comments that no reasonable regex would have been
 * written to catch.
 */
{
  const iconPath = path.join(ROOT, "src/app/icon.svg");
  const svg = readFileSync(iconPath, "utf8");
  /* Node ships no XML parser, so a real one is used where the machine has it.
     `xmllint` comes with libxml2 and is present on macOS and most CI images;
     where it is not, the rule below still runs, and the rule is what actually
     caught this. */
  let parseError = null;
  let parserRan = false;
  try {
    execFileSync("xmllint", ["--noout", iconPath], { stdio: "pipe" });
    parserRan = true;
  } catch (error) {
    const stderr = error?.stderr?.toString() ?? "";
    if (error?.code === "ENOENT") {
      console.log("  · xmllint not installed — skipping the XML parse");
    } else {
      parserRan = true;
      parseError = stderr.trim() || "xmllint rejected the file";
    }
  }
  if (parserRan) {
    check(
      "src/app/icon.svg is well-formed XML (browsers silently ignore one that is not)",
      parseError === null,
      parseError ?? undefined,
    );
  }
  check(
    "the tab icon carries no double hyphen (invalid inside an XML comment)",
    !/<!--[\s\S]*?--[\s\S]*?-->/.test(svg.replace(/<!--|-->/g, "\u0000")),
    "a `--` inside the comment makes the whole file unparseable",
  );
}

if (failures > 0) {
  console.error(`\nog-cards-check: ${failures} of ${assertions} failed.`);
  process.exit(1);
}
console.log(`\nog-cards-check: all ${assertions} assertions passed.`);

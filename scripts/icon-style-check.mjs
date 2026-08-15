#!/usr/bin/env node
/**
 * The icon registry's invariants, checked at the source level.
 *
 * The registry draws from exactly two places — products from the `thesvg`
 * package, concepts from lucide — and every rule here corresponds to a defect
 * that actually shipped while it drew from three:
 *
 *   1. **One slug space, nothing lost.** The model stores slugs and never
 *      artwork, so a slug that disappears silently blanks the icon in every
 *      document naming it.
 *   2. **Ink is detected in both spellings AND both quote styles.** Bun
 *      declares its colour as `style="fill:…"` and Oracle as `style='fill:…'`;
 *      a pattern reading only one of those fails silently, rendering the icon
 *      wrongly rather than throwing.
 *   3. **`monochrome` is derived, never declared.** A hand-set flag shipped
 *      marks that carried no ink of their own, so nothing gave them a fill,
 *      they fell back to black and vanished on a dark canvas.
 *   4. **Strategy matches the package.** `withMono` promises two different
 *      drawings; if upstream stops publishing a mono it silently degrades to
 *      one drawing shown twice.
 *   5. **Selection beats derivation.** Never strip a mark's ink when upstream
 *      already draws the monochrome version.
 *   6. **Derivation is licensed.** Producing a monochrome rendering is a
 *      derivative work; the allowlist must stay an allowlist.
 *   7. **Everything drawn parses and can be seen.** `check:icon-contrast`
 *      settles visibility properly by rendering; the cheap source-level rules
 *      here catch the common shapes without needing librsvg.
 *
 * Every rule judges ONLY the artwork the registry actually draws
 * (`scripts/lib/icon-artwork.mjs`). Checking every variant of every imported
 * module was tried three times and cried wolf each time: a mark that imports
 * `variants` to reach its ink-free `mono` also carries a white `default` it
 * never renders.
 *
 * Exits non-zero on any failure. Run with: pnpm check:icon-style
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import {
  collectRenderedArtwork,
  hasBakedInk,
  strategyOf,
} from "./lib/icon-artwork.mjs";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const require = createRequire(import.meta.url);
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const BRAND = read("src/features/editor/lib/icons/brand.tsx");
const GENERIC = read("src/features/editor/lib/icons/generic.tsx");
const REGISTRY = read("src/features/editor/lib/icons/registry.ts");
const EMBED = read("src/features/editor/lib/icons/embed.tsx");
const MARKUP = read("src/features/viewer/export/icon-markup.ts");

const RENDERED = collectRenderedArtwork();
const STRATEGY = strategyOf();
const DERIVABLE = new Set(
  [
    ...(
      /const DERIVABLE_LICENCES = new Set\(\[([\s\S]*?)\]\)/.exec(BRAND)?.[1] ??
      ""
    ).matchAll(/"([^"]+)"/g),
  ].map((m) => m[1]),
);

let failures = 0;
let assertions = 0;

function check(label, ok, detail) {
  assertions += 1;
  if (ok) {
    console.log(`  ✓ ${label}`);
    return;
  }
  failures += 1;
  console.error(`  ✗ ${label}`);
  if (detail !== undefined) console.error(`    ${detail}`);
}

/* ----------------------------------------------------------------------- */
/* 1. Two sources, one slug space                                           */
/* ----------------------------------------------------------------------- */

console.log("two sources (products and concepts), one slug space");

{
  const brandSlugs = [...BRAND.matchAll(/^\s+slug: "([a-z0-9-]+)",$/gm)].map(
    (m) => m[1],
  );
  const genericSlugs = [
    ...GENERIC.matchAll(/^\s+slug: "([a-z0-9-]+)",$/gm),
  ].map((m) => m[1]);
  const all = [...brandSlugs, ...genericSlugs];
  const duplicates = all.filter((s, i) => all.indexOf(s) !== i);

  check(
    `every slug is defined exactly once (${brandSlugs.length} products + ${genericSlugs.length} concepts)`,
    duplicates.length === 0 && all.length > 100,
    duplicates.length > 0
      ? `defined twice: ${[...new Set(duplicates)].join(", ")}`
      : "the set shrank unexpectedly — did a source fail to parse?",
  );
  check(
    "no hand-drawn icon set survives",
    !/from "\.\/svg\//.test(REGISTRY) && !/HAND_AUTHORED/.test(REGISTRY),
    "a third visual family is what made colour mode incoherent",
  );
  check(
    "concepts are drawn by lucide, not by embedded package artwork",
    /from "lucide-react"/.test(GENERIC) && !/from "thesvg/.test(GENERIC),
    "a queue has no brand colour; lucide already draws the rest of the app",
  );
  check(
    "concepts declare no separate mono artwork",
    !/SvgMono:/.test(GENERIC),
    "there is no coloured version of an abstract glyph to switch to",
  );
}

/* ----------------------------------------------------------------------- */
/* 2. Ink detection: both spellings, both quote styles                      */
/* ----------------------------------------------------------------------- */

console.log("\nink detection (each gap here shipped a bug)");

{
  const fn = /export function hasBakedInk\([\s\S]*?\n}/.exec(EMBED)?.[0] ?? "";
  check(
    "embed.tsx tests fill/stroke ATTRIBUTES",
    /\(\?:fill\|stroke\)=/.test(fn),
  );
  check(
    "embed.tsx also tests fill/stroke inside style=",
    /style=/.test(fn) && /fill\|stroke/.test(fn),
    'Bun declares its ink as style="fill:#fbf0df"',
  );
  check(
    "embed.tsx matches BOTH quote styles",
    /\["'\]/.test(fn),
    "Oracle declares its ink as style='fill:#C74634' — single quotes",
  );
  check(
    "`none` and `currentColor` are not treated as ink",
    fn.includes("none") && fn.includes("currentColor"),
  );
}

/* ----------------------------------------------------------------------- */
/* 3. monochrome is derived from the artwork                                */
/* ----------------------------------------------------------------------- */

console.log("\nmonochrome is derived, never declared");

check(
  "brandDef computes `monochrome` with hasBakedInk",
  /const monochrome = hasBakedInk\(art\.colour\) === null;/.test(BRAND),
  "a hand-set flag shipped marks that vanished on a dark canvas",
);
check(
  "no brand entry hand-declares `monochrome`",
  !/^\s+monochrome: (true|false),$/m.test(
    BRAND.slice(BRAND.indexOf("const BRAND_ENTRIES")),
  ),
);

/* ----------------------------------------------------------------------- */
/* 4. Strategy matches what each package publishes                          */
/* ----------------------------------------------------------------------- */

console.log("\nartwork strategy matches the package");

{
  const wrong = [];
  const derivedButPublished = [];
  for (const [slug, kind] of STRATEGY) {
    const drawn = RENDERED.filter((job) => job.slug === slug);
    if (drawn.length === 0) {
      wrong.push(`${slug} renders nothing`);
      continue;
    }
    const mod = require(`thesvg/${drawn[0].module}`);
    if (kind === "withMono" && mod.variants?.mono === undefined) {
      wrong.push(`${slug}: withMono but no mono variant published`);
    }
    if (
      (kind === "derivedMono" || kind === "derivedMonoOnly") &&
      mod.variants?.mono !== undefined
    ) {
      derivedButPublished.push(slug);
    }
  }
  check(
    `every mark's strategy matches its package (${STRATEGY.size} marks)`,
    wrong.length === 0,
    wrong.join("; "),
  );
  check(
    "nothing is derived that upstream publishes a mono for",
    derivedButPublished.length === 0,
    `${derivedButPublished.join(", ")} — selection beats derivation`,
  );
  check(
    "every mono artwork is ink-free, so currentColor reaches it",
    RENDERED.filter((j) => j.style === "mono").every(
      (j) => hasBakedInk(j.art) === null,
    ),
    "a baked ink cannot follow the theme",
  );
}

/* ----------------------------------------------------------------------- */
/* 5. Derivation is licensed                                                */
/* ----------------------------------------------------------------------- */

console.log("\nderived mono (the one place a mark is modified)");

{
  const derived = [...STRATEGY].filter(
    ([, kind]) => kind === "derivedMono" || kind === "derivedMonoOnly",
  );
  const offenders = [];
  for (const [slug] of derived) {
    const job = RENDERED.find((j) => j.slug === slug);
    const licence = String(require(`thesvg/${job.module}`).license);
    if (!DERIVABLE.has(licence)) offenders.push(`${slug} (${licence})`);
  }
  check(
    `every derived mono is licensed for a derivative (${derived.length} marks)`,
    offenders.length === 0 && derived.length > 0,
    offenders.length > 0
      ? `${offenders.join(", ")} — leave these coloured rather than guessing`
      : "none parsed — has derivedMono been renamed?",
  );
  check(
    "the licence allowlist is an allowlist, not a denylist",
    /const DERIVABLE_LICENCES = new Set\(\[/.test(BRAND),
    "an unrecognised licence must stop the build, not be assumed permissive",
  );
}

/* ----------------------------------------------------------------------- */
/* 6. Everything drawn parses, and is not obviously unseeable               */
/* ----------------------------------------------------------------------- */

console.log("\nevery artwork we draw parses and can be seen");

{
  const source = /const ROOT_RE =\s*(\/\^[\s\S]*?\/);/.exec(EMBED)?.[1];
  let rootRe = null;
  try {
    rootRe = source === null ? null : eval(source);
  } catch {
    rootRe = null;
  }
  check(
    "embed.tsx's ROOT_RE could be read (this check is only as good as that)",
    rootRe instanceof RegExp,
  );
  if (rootRe instanceof RegExp) {
    const unparseable = RENDERED.filter((job) => !rootRe.test(job.art));
    check(
      `every drawn artwork matches the root pattern (${RENDERED.length})`,
      unparseable.length === 0,
      `${unparseable.map((j) => `${j.slug}/${j.style}`).join(", ")} — splitPackagedSvg would throw at module load`,
    );
  }

  const isWhite = (c) =>
    /^#(fff|ffffff|fefefe|fffefc)$/i.test(c) || c === "white";
  const invisible = [];
  const misshapen = [];
  for (const job of RENDERED) {
    const inks = [
      ...new Set(
        [
          ...job.art.matchAll(
            /(?:fill|stroke)\s*[:=]\s*["']?(#[0-9a-fA-F]{3,8}|white)/g,
          ),
        ].map((m) => m[1].toLowerCase()),
      ),
    ].filter((c) => c !== "none");
    /* A gradient is visible ink this test cannot read, so artwork carrying one
       is never called invisible — that false positive rejected Next.js and
       Python, which are fine. */
    if (inks.length > 0 && inks.every(isWhite) && !/url\(#/.test(job.art)) {
      invisible.push(`${job.slug}/${job.style}`);
    }
    const viewBox = /viewBox=["']([^"']+)["']/.exec(job.art)?.[1];
    if (viewBox !== undefined) {
      const box = viewBox.split(/[\s,]+/).map(Number);
      const ratio = box[2] / box[3];
      if (ratio > 3 || ratio < 0.34)
        misshapen.push(`${job.slug} ${ratio.toFixed(1)}:1`);
    }
  }
  check(
    "no drawn artwork is white ink only (invisible on a light canvas)",
    invisible.length === 0,
    `${invisible.join(", ")} — route it through the mono artwork instead`,
  );
  check(
    "no drawn artwork is wordmark-shaped (illegible in a square slot)",
    misshapen.length === 0,
    `${[...new Set(misshapen)].join(", ")} — an icon slot is square and small`,
  );
}

/* ----------------------------------------------------------------------- */
/* 7. Export parity                                                         */
/* ----------------------------------------------------------------------- */

console.log("\nexport parity");

check(
  "the icon markup cache is keyed by style AND slug",
  /`\$\{style\}:\$\{def\.slug\}`/.test(MARKUP),
  "a slug-only key lets the first export decide every later one's artwork",
);
check(
  "the C4 exporter threads a style through to the icons",
  /iconStyle\?: IconStyle;/.test(
    read("src/features/viewer/export/render-svg.ts"),
  ),
);
check(
  "packagedSvgComponent always sets fill=currentColor",
  /fill="currentColor"/.test(EMBED),
  "artwork that omits a fill must inherit the theme's ink, not the browser's black",
);
check(
  "mono falls back to the colour artwork rather than deriving one",
  /source\.SvgMono \?\? source\.Svg/.test(REGISTRY),
);

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} icon assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} icon assertions passed.`);

#!/usr/bin/env node
/**
 * The mono/colour switch, checked where it can actually be checked.
 *
 * The registry is `.tsx` and Node's type stripping cannot load it, so this
 * script does what the check scripts here always do: it reads the SOURCE for
 * the decisions, and the PACKAGE for the artwork facts those decisions rest
 * on. Every rule below corresponds to a defect this feature has already
 * shipped once, or to one the design would ship silently:
 *
 *   1. **Ink is detected in both spellings.** Bun declares its colour as
 *      `style="fill:…"`, so an attribute-only test called it ink-free, handed
 *      it `currentColor` — which a style declaration outranks — and believed a
 *      mark was monochrome while it painted itself.
 *   2. **`monochrome` is derived, never declared.** Hand-set flags shipped
 *      three marks (Oracle, Traefik, and the white-ink brands) as "coloured"
 *      while carrying no ink, so nothing gave them a fill, they fell back to
 *      SVG-default black, and they vanished on a dark canvas.
 *   3. **Every icon importing `variants` really has a `mono`**, and every icon
 *      importing `svg` really has none. The split is a bundle decision —
 *      `variants` costs ~150KB of artwork nothing renders — so an icon on the
 *      wrong side is either a broken mono mode or dead weight.
 *   4. **The export cache is keyed by style.** A slug-only key means the first
 *      export wins and every later one embeds the wrong artwork.
 *   5. **Nothing recolours a coloured mark**: `currentColor` is only ever
 *      forced onto artwork that carries no ink of its own.
 *
 * Exits non-zero on any failure. Run with: pnpm check:icon-style
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const require = createRequire(import.meta.url);
const read = (relative) => readFileSync(path.join(ROOT, relative), "utf8");

const BRAND = read("src/features/editor/lib/icons/brand.tsx");
const REGISTRY = read("src/features/editor/lib/icons/registry.ts");
const MARKUP = read("src/features/viewer/export/icon-markup.ts");

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

/**
 * The SAME test `brand.tsx` applies, deliberately duplicated rather than
 * imported — the module is `.tsx` and unloadable here. Both spellings, because
 * rule 1 above exists.
 */
function bakedInk(svg) {
  const attr = /\b(?:fill|stroke)="(?!none\b|currentColor\b)[^"]+"/.exec(svg);
  if (attr !== null) return attr[0];
  const styled =
    /style="[^"]*\b(?:fill|stroke)\s*:\s*(?!none\b|currentColor\b)[^;"]+/.exec(
      svg,
    );
  return styled === null ? null : styled[0];
}

/* ----------------------------------------------------------------------- */
/* 1. The ink test in the source covers both spellings                      */
/* ----------------------------------------------------------------------- */

console.log("ink detection (an attribute-only test shipped a bug)");

{
  const fn = /function hasBakedInk\([\s\S]*?\n}/.exec(BRAND)?.[0] ?? "";
  check(
    "brand.tsx tests fill/stroke ATTRIBUTES",
    /\\b\(\?:fill\|stroke\)="/.test(fn),
  );
  check(
    "brand.tsx also tests fill/stroke inside style=",
    /style="\[\^"\]\*/.test(fn) && /fill\|stroke/.test(fn),
    "Bun declares its ink as style=\"fill:#fbf0df\" — an attribute-only test misses it",
  );
  check(
    "`none` and `currentColor` are not treated as ink",
    fn.includes("none") && fn.includes("currentColor"),
  );
}

/* ----------------------------------------------------------------------- */
/* 2. monochrome is derived from the artwork, not declared per entry        */
/* ----------------------------------------------------------------------- */

console.log("\nmonochrome is derived");

check(
  "brandDef computes `monochrome` with hasBakedInk",
  /const monochrome = hasBakedInk\(art\.colour\) === null;/.test(BRAND),
  "a hand-set flag shipped three invisible-on-dark marks",
);
check(
  "no brand entry hand-declares `monochrome`",
  !/^\s+monochrome: (true|false),$/m.test(
    BRAND.slice(BRAND.indexOf("const BRAND_ENTRIES")),
  ),
);

/* ----------------------------------------------------------------------- */
/* 3. The variants/svg import split matches what the package ships          */
/* ----------------------------------------------------------------------- */

console.log("\nartwork imports match the package (a bundle decision)");

{
  const importedSlugs = [
    ...BRAND.matchAll(/from "thesvg\/([a-z0-9-]+)"/g),
  ].map((m) => m[1]);

  /* Which binding each module is imported with, read from its own block. */
  const blocks = [...BRAND.matchAll(/import \{([^}]*)\} from "thesvg\/([a-z0-9-]+)";/g)];
  const usesVariants = new Map();
  for (const [, bindings, slug] of blocks) {
    usesVariants.set(slug, /\bvariants as /.test(bindings));
  }

  /* The third case: brands that are monochrome in BOTH styles. They import
     `variants` to reach an ink-free variant that may not be named `mono` —
     OpenAI ships none, and its `light` is the ink-free one — so they are
     exempt from the mono-variant rule and checked on ink instead. */
  const alwaysMonoNames = new Set(
    [...BRAND.matchAll(/art: alwaysMono\((\w+)Slug/g)].map((m) => m[1]),
  );
  const alwaysMonoSlugs = new Set(
    blocks
      .filter(([, bindings]) =>
        [...alwaysMonoNames].some((name) =>
          new RegExp(`\\b(?:slug) as ${name}Slug\\b`).test(bindings),
        ),
      )
      .map(([, , slug]) => slug),
  );

  const wrongSide = [];
  const paintedAlwaysMono = [];
  for (const slug of importedSlugs) {
    const mod = require(`thesvg/${slug}`);
    const imported = usesVariants.get(slug);

    if (alwaysMonoSlugs.has(slug)) {
      const art = mod.variants?.mono ?? mod.variants?.light;
      if (art === undefined || bakedInk(art) !== null) {
        paintedAlwaysMono.push(slug);
      }
      continue;
    }
    const hasMono = mod.variants?.mono !== undefined;
    if (hasMono !== imported) {
      wrongSide.push(`${slug} (mono=${hasMono}, imports variants=${imported})`);
    }
  }

  check(
    `every icon is imported on the right side of the split (${importedSlugs.length} icons)`,
    wrongSide.length === 0,
    `${wrongSide.join("; ")} — \`variants\` costs ~3KB of unrendered artwork; \`svg\` cannot reach mono`,
  );
  check(
    `the always-mono brands really are ink-free (${alwaysMonoSlugs.size} of them)`,
    paintedAlwaysMono.length === 0 && alwaysMonoSlugs.size > 0,
    paintedAlwaysMono.length > 0
      ? `${paintedAlwaysMono.join(", ")} bake in ink — they would be invisible in one theme`
      : "none were detected — has alwaysMono() been renamed?",
  );
}

/* ----------------------------------------------------------------------- */
/* 4. Mono artwork is genuinely ink-free where we claim currentColor        */
/* ----------------------------------------------------------------------- */

console.log("\nmono artwork inherits rather than paints");

{
  const monoSlugs = [...BRAND.matchAll(/art: withMono\((\w+)Slug/g)].map(
    (m) => m[1],
  );
  const importedSlugs = [
    ...BRAND.matchAll(/import \{[^}]*\} from "thesvg\/([a-z0-9-]+)";/g),
  ].map((m) => m[1]);

  const painted = [];
  for (const slug of importedSlugs) {
    const mono = require(`thesvg/${slug}`).variants?.mono;
    if (mono === undefined) continue;
    if (bakedInk(mono) !== null) painted.push(slug);
  }
  check(
    "every shipped `mono` variant is ink-free (so currentColor reaches it)",
    painted.length === 0,
    `${painted.join(", ")} bake in ink — currentColor would not reach the paths`,
  );
  check(
    `the curated set actually uses them (${monoSlugs.length} withMono entries)`,
    monoSlugs.length > 0,
  );
}

/* ----------------------------------------------------------------------- */
/* 5. Export parity: the markup cache is keyed by style                     */
/* ----------------------------------------------------------------------- */

console.log("\nexport parity");

check(
  "the icon markup cache is keyed by style AND slug",
  /`\$\{style\}:\$\{def\.slug\}`/.test(MARKUP),
  "a slug-only key lets the first export decide every later one's artwork",
);
check(
  "embeddedIconSvg takes the style rather than assuming one",
  /style: IconStyle,?\s*\n\): string \{/.test(MARKUP) ||
    /size: number,\s*\n\s*color: string,\s*\n\s*style: IconStyle,/.test(MARKUP),
);
check(
  "the C4 exporter threads a style through to the icons",
  /iconStyle\?: IconStyle;/.test(read("src/features/viewer/export/render-svg.ts")),
);

/* ----------------------------------------------------------------------- */
/* 6. currentColor is only ever forced onto ink-free artwork                */
/* ----------------------------------------------------------------------- */

console.log("\nthe no-recolour rule");

check(
  "brandSvgComponent only sets fill=currentColor when monochrome",
  /const fill = monochrome \? "currentColor" : undefined;/.test(BRAND),
  "forcing currentColor onto a coloured mark is the licence breach the registry forbids",
);
check(
  "the registry still states the no-recolour rule",
  /NEVER recoloured/.test(REGISTRY),
);
check(
  "mono falls back to the colour artwork rather than deriving one",
  /source\.SvgMono \?\? source\.Svg/.test(REGISTRY),
);

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} icon-style assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} icon-style assertions passed.`);

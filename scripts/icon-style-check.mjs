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
const OVERLAY = read("src/features/editor/lib/icons/colour-overlay.tsx");
/* The sanitiser and component factory are SHARED by brand.tsx and the colour
   overlay, so they live in embed.tsx — that is where these rules apply now. */
const EMBED = read("src/features/editor/lib/icons/embed.tsx");

/** Read OUT of brand.tsx so the two lists cannot drift. */
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
  const fn = /export function hasBakedInk\([\s\S]*?\n}/.exec(EMBED)?.[0] ?? "";
  check(
    "embed.tsx tests fill/stroke ATTRIBUTES",
    /\(\?:fill\|stroke\)=/.test(fn),
  );
  check(
    "embed.tsx also tests fill/stroke inside style=",
    /style=/.test(fn) && /fill\|stroke/.test(fn),
    'Bun declares its ink as style="fill:#fbf0df" — an attribute-only test misses it',
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
  const importedSlugs = [...BRAND.matchAll(/from "thesvg\/([a-z0-9-]+)"/g)].map(
    (m) => m[1],
  );

  /* Which binding each module is imported with, read from its own block. */
  const blocks = [
    ...BRAND.matchAll(/import \{([^}]*)\} from "thesvg\/([a-z0-9-]+)";/g),
  ];
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
/* 4b. The colour overlay lands on real slugs                               */
/* ----------------------------------------------------------------------- */

console.log("\ncolour overlay (a key matching no slug does nothing, silently)");

{
  const handSlugs = new Set(
    [
      ...REGISTRY.slice(
        REGISTRY.indexOf("HAND_AUTHORED_DEFS"),
        REGISTRY.indexOf("const CATEGORY_RANK"),
      ).matchAll(/^\s+slug: "([a-z0-9-]+)",/gm),
    ].map((m) => m[1]),
  );
  const table = OVERLAY.slice(
    OVERLAY.indexOf("COLOUR_ARTWORK"),
    OVERLAY.indexOf("export const COLOUR_OVERLAY"),
  );
  const keys = [...table.matchAll(/^\s+"?([a-z0-9-]+)"?:/gm)].map((m) => m[1]);
  const orphans = keys.filter((slug) => !handSlugs.has(slug));

  check(
    `every overlay key names a hand-authored icon (${keys.length} keys)`,
    orphans.length === 0 && keys.length > 0,
    orphans.length > 0
      ? `${orphans.join(", ")} — the overlay would be ignored for these`
      : "no keys parsed — has COLOUR_ARTWORK been renamed?",
  );
  check(
    "the overlay is applied to colour, and never to mono",
    /colour: COLOUR_OVERLAY\[source\.slug\] \?\? source\.Svg/.test(REGISTRY) &&
      /mono: source\.SvgMono \?\? source\.Svg/.test(REGISTRY),
    "mono mode must keep the hand-authored house mark",
  );
  check(
    "the overlay imports `svg` only, never `variants`",
    !/variants as/.test(OVERLAY),
    "mono comes from the hand-authored icon, so packaged mono variants are dead weight",
  );
}

/* ----------------------------------------------------------------------- */
/* 4c. Every embedded artwork actually parses                               */
/* ----------------------------------------------------------------------- */

console.log("\nevery artwork parses (a throw here takes down every page)");

{
  /* The SAME root pattern embed.tsx uses, read OUT of it rather than retyped,
     so this cannot pass while the real one fails. `splitPackagedSvg` throws at
     module load, and the registry is imported by every canvas — so one
     unparseable icon is not one missing icon, it is a blank site. `pnpm build`
     does catch it at prerender, but only after a full build; this names the
     icon in a second.

     nginx is why this exists: it arrives with an XML COMMENT after the
     declaration, the prologue pattern allowed only `<?xml …?>`, and the
     registry threw for every reader. */
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
    "the pattern was reshaped — update the extraction above",
  );

  if (rootRe instanceof RegExp) {
    const unparseable = [];
    for (const [file, text] of [
      ["brand", BRAND],
      ["overlay", OVERLAY],
    ]) {
      const blocks = [
        ...text.matchAll(/import \{([^}]*)\} from "thesvg\/([a-z0-9-]+)";/g),
      ];
      for (const [, bindings, slug] of blocks) {
        const mod = require(`thesvg/${slug}`);
        /* Every artwork that could reach a component, not just the default:
           mono and light are embedded too, and a broken one crashes the same
           way. */
        const arts = /\bvariants as /.test(bindings)
          ? Object.values(mod.variants ?? {})
          : [mod.svg];
        for (const art of arts) {
          if (typeof art === "string" && !rootRe.test(art)) {
            unparseable.push(`${file}:${slug}`);
            break;
          }
        }
      }
    }
    check(
      "every embedded artwork matches the root pattern",
      unparseable.length === 0,
      `${unparseable.join(", ")} — splitPackagedSvg would throw at module load`,
    );
  }
}

/* ----------------------------------------------------------------------- */
/* 4d. Derived mono artwork is licensed for it                              */
/* ----------------------------------------------------------------------- */

console.log("\nderived mono (the one place a mark is modified)");

{
  /* Producing a monochrome rendering is a DERIVATIVE WORK. It runs only for
     marks upstream publishes no mono for, and only where the licence clearly
     permits it — `vuedotjs` is why the check is not optional: the package
     ships Vue's mono under CC-BY-NC-SA-4.0, non-commercial and share-alike,
     so adopting it would have traded a cosmetic inconsistency for a licence
     problem. Vue is derived from its own MIT artwork instead. */
  const derived = [
    ...BRAND.matchAll(/art: derivedMono\((\w+)Slug, \w+Svg, \w+Licence\)/g),
  ].map((m) => m[1]);
  const blocks = [
    ...BRAND.matchAll(/import \{([^}]*)\} from "thesvg\/([a-z0-9-]+)";/g),
  ];

  const offenders = [];
  const stillPublished = [];
  for (const name of derived) {
    const block = blocks.find(([, bindings]) =>
      new RegExp(`\\bslug as ${name}Slug\\b`).test(bindings),
    );
    if (block === undefined) continue;
    const mod = require(`thesvg/${block[2]}`);
    if (!DERIVABLE.has(String(mod.license))) {
      offenders.push(`${block[2]} (${mod.license})`);
    }
    if (mod.variants?.mono !== undefined) stillPublished.push(block[2]);
  }

  check(
    `every derived mono is licensed for a derivative (${derived.length} marks)`,
    offenders.length === 0 && derived.length > 0,
    offenders.length > 0
      ? `${offenders.join(", ")} — leave these coloured rather than guessing`
      : "none parsed — has derivedMono been renamed?",
  );
  check(
    "nothing is derived that upstream now publishes a mono for",
    stillPublished.length === 0,
    `${stillPublished.join(", ")} — prefer the published variant; selection beats derivation`,
  );
  check(
    "the licence allowlist is an allowlist, not a denylist",
    /const DERIVABLE_LICENCES = new Set\(\[/.test(BRAND),
    "an unrecognised licence must stop the build, not be assumed permissive",
  );
}

/* ----------------------------------------------------------------------- */
/* 4e. No artwork that cannot be seen, or cannot fit                        */
/* ----------------------------------------------------------------------- */

console.log("\nartwork is legible in the slot it gets");

{
  /* Two defects that a build cannot catch, because neither is malformed:
     white ink is a CORRECT file for a dark background we do not have, and a
     wordmark is a correct logo for a slot we do not have. Both shipped: five
     overlay icons rendered invisible on a light canvas, and Oracle's 7.7:1
     logotype was an illegible smear at 16px. Found by rasterising the set and
     looking at it — so these rules exist to make looking unnecessary. */
  const isWhite = (colour) =>
    /^#(fff|ffffff|fefefe|fffefc)$/i.test(colour) || colour === "white";

  /* Which modules take the always-mono route, resolved from the entry list
     back to the import block that named them. */
  const alwaysMonoNames = new Set(
    [...BRAND.matchAll(/art: alwaysMono\((\w+)Slug/g)].map((m) => m[1]),
  );
  const alwaysMonoModules = new Set(
    [...BRAND.matchAll(/import \{([^}]*)\} from "thesvg\/([a-z0-9-]+)";/g)]
      .filter(([, bindings]) =>
        [...alwaysMonoNames].some((name) =>
          new RegExp(`\\bslug as ${name}Slug\\b`).test(bindings),
        ),
      )
      .map(([, , slug]) => slug),
  );

  const invisible = [];
  const misshapen = [];
  for (const [label, text] of [
    ["brand", BRAND],
    ["overlay", OVERLAY],
  ]) {
    for (const [, bindings, slug] of text.matchAll(
      /import \{([^}]*)\} from "thesvg\/([a-z0-9-]+)";/g,
    )) {
      const mod = require(`thesvg/${slug}`);
      /* Only the artwork this module can actually render: `svg` where it
         imports `svg`, the variants where it imports `variants`. */
      /* Only what this entry RENDERS. An `alwaysMono` brand imports
         `variants` but draws the ink-free one, so judging it by
         `variants.default` — white, by definition, which is why it takes that
         route — would reject Vercel and OpenAI for the very reason they were
         handled correctly. */
      const arts = !/\bvariants as /.test(bindings)
        ? [mod.svg]
        : alwaysMonoModules.has(slug)
          ? [mod.variants?.mono ?? mod.variants?.light]
          : [mod.variants?.default, mod.variants?.mono];

      for (const art of arts.filter((a) => typeof a === "string")) {
        const inks = [
          ...new Set(
            [
              ...art.matchAll(
                /(?:fill|stroke)\s*[:=]\s*["']?(#[0-9a-fA-F]{3,8}|white)/g,
              ),
            ].map((m) => m[1].toLowerCase()),
          ),
        ].filter((c) => c !== "none");
        /* A gradient or pattern IS visible ink this test cannot read, so an
           artwork carrying one is never called invisible — that false
           positive would reject Next.js and Python, which are fine. */
        const painted = /url\(#/.test(art);
        if (inks.length > 0 && inks.every(isWhite) && !painted) {
          invisible.push(`${label}:${slug}`);
        }
        const viewBox = /viewBox=["']([^"']+)["']/.exec(art)?.[1];
        if (viewBox !== undefined) {
          const box = viewBox.split(/[\s,]+/).map(Number);
          const ratio = box[2] / box[3];
          if (ratio > 3 || ratio < 0.34) {
            misshapen.push(`${label}:${slug} ${ratio.toFixed(1)}:1`);
          }
        }
      }
    }
  }

  check(
    "no artwork is white ink only (invisible on a light canvas)",
    invisible.length === 0,
    `${[...new Set(invisible)].join(", ")} — drawn for a dark background; the hand-authored icon follows the theme instead`,
  );
  check(
    "no artwork is wordmark-shaped (illegible in a square slot)",
    misshapen.length === 0,
    `${[...new Set(misshapen)].join(", ")} — an icon slot is square and small`,
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
  /iconStyle\?: IconStyle;/.test(
    read("src/features/viewer/export/render-svg.ts"),
  ),
);

/* ----------------------------------------------------------------------- */
/* 6. currentColor is only ever forced onto ink-free artwork                */
/* ----------------------------------------------------------------------- */

console.log("\nthe no-recolour rule");

check(
  "packagedSvgComponent always sets fill=currentColor",
  /fill="currentColor"/.test(EMBED),
  /* Setting it only for marks classed monochrome was the earlier rule and it
     shipped a bug: `fill` is inherited, so the root value reaches ONLY paths
     that declare none — which the spec then resolves to black. Withholding it
     left Spring Boot, Spark, Celery and Istio black-on-black. It cannot
     recolour a mark that states its own colour. */
  "artwork that omits a fill must inherit the theme's ink, not the browser's black",
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
  console.error(
    `\n${failures} of ${assertions} icon-style assertion(s) FAILED`,
  );
  process.exit(1);
}
console.log(`\nAll ${assertions} icon-style assertions passed.`);

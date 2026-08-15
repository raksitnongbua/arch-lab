/**
 * What the icon registry ACTUALLY RENDERS, resolved from the entries.
 *
 * Shared by `check:icon-style` and `check:icon-contrast` because both kept
 * making the same mistake independently: judging artwork the registry never
 * draws. A brand that imports `variants` to reach its ink-free `mono` also
 * carries a white `default` it never renders, and three separate assertions
 * failed it for that — GitHub, Vercel and OpenAI were each "invisible on a
 * light canvas" according to a check reading a variant nothing shows.
 *
 * So the resolution lives in ONE place and returns one list: every (slug,
 * style, artwork) triple the registry can put on screen, and nothing else.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  "..",
);
const require = createRequire(import.meta.url);

export const BRAND_SOURCE = readFileSync(
  path.join(ROOT, "src/features/editor/lib/icons/brand.tsx"),
  "utf8",
);

/** Ink the artwork paints itself with — both spellings, both quote styles. */
export function hasBakedInk(svg) {
  const attr = /\b(?:fill|stroke)=(["'])(?!none\b|currentColor\b)[^"']+\1/.exec(
    svg,
  );
  if (attr !== null) return attr[0];
  const styled =
    /style=(["'])[^"']*\b(?:fill|stroke)\s*:\s*(?!none\b|currentColor\b)[^;"']+/.exec(
      svg,
    );
  return styled === null ? null : styled[0];
}

/** The same artwork with its colour removed — mirrors `embed.tsx: stripInk`. */
export function stripInk(svg) {
  return svg
    .replace(/\s(?:fill|stroke)=(["'])(?!none\b|currentColor\b)[^"']*\1/g, "")
    .replace(/\sstyle=(["'])([^"']*)\1/g, (_m, _q, decls) => {
      const kept = decls
        .split(";")
        .filter(
          (d) => !/^\s*(?:fill|stroke)\s*:\s*(?!none\b|currentColor\b)/.test(d),
        )
        .join(";")
        .trim();
      return kept === "" ? "" : ` style="${kept}"`;
    });
}

/** Import alias → the package module behind it. */
function moduleAliases() {
  const aliases = new Map();
  for (const [, bindings, mod] of BRAND_SOURCE.matchAll(
    /import \{([^}]*)\} from "thesvg\/([a-z0-9-]+)";/g,
  )) {
    for (const m of bindings.matchAll(/\w+ as (\w+)/g)) aliases.set(m[1], mod);
  }
  return aliases;
}

/**
 * Every artwork the registry can draw: `{ slug, style, art, module }`.
 * `style` is "colour", "mono", or "both" where one drawing serves each.
 */
export function collectRenderedArtwork() {
  const aliases = moduleAliases();
  const pkg = (alias) => {
    const mod = aliases.get(alias);
    if (mod === undefined) throw new Error(`no import provides ${alias}`);
    return { mod, ...require(`thesvg/${mod}`) };
  };
  const jobs = [];
  const add = (slug, style, art, module) => {
    if (typeof art === "string") jobs.push({ slug, style, art, module });
  };

  for (const [, slug, raw] of BRAND_SOURCE.matchAll(
    /slug: "([a-z0-9-]+)",[\s\S]*?art: ([\s\S]*?),\n  \},/g,
  )) {
    /* Whitespace-collapsed before matching, and every pattern below tolerates
       the spacing either side of a bracket: Prettier reflows these calls
       between one line and four depending on their length, and a pattern
       pinned to one layout breaks the moment the formatter runs. */
    const expr = raw.replace(/\s+/g, " ").trim();
    let m;
    if ((m = /^withMono\(\s*"[^"]+",\s*(\w+)\s*\)/.exec(expr))) {
      const p = pkg(m[1]);
      add(slug, "colour", p.variants?.default, p.mod);
      add(slug, "mono", p.variants?.mono, p.mod);
    } else if ((m = /^alwaysMono\(\s*"[^"]+",\s*(\w+)\s*\)/.exec(expr))) {
      const p = pkg(m[1]);
      add(slug, "both", p.variants?.mono ?? p.variants?.light, p.mod);
    } else if ((m = /^colourOnly\(\s*(\w+)\s*\)/.exec(expr))) {
      const p = pkg(m[1]);
      add(slug, "both", p.svg, p.mod);
    } else if ((m = /^derivedMonoOnly\(\s*"[^"]+",\s*(\w+),/.exec(expr))) {
      const p = pkg(m[1]);
      add(slug, "both", stripInk(p.svg), p.mod);
    } else if ((m = /^derivedMono\(\s*"[^"]+",\s*(\w+),/.exec(expr))) {
      const p = pkg(m[1]);
      add(slug, "colour", p.svg, p.mod);
      add(slug, "mono", stripInk(p.svg), p.mod);
    } else if ((m = /^monoFromAlternate\(\s*"[^"]+",\s*(\w+),\s*(\w+),/.exec(expr))) {
      const colour = pkg(m[1]);
      const mono = pkg(m[2]);
      add(slug, "colour", colour.svg, colour.mod);
      add(slug, "mono", mono.variants?.mono, mono.mod);
    } else {
      throw new Error(`${slug}: unrecognised artwork strategy — ${expr}`);
    }
  }
  return jobs;
}

/** Which strategy each slug uses, for assertions that care. */
export function strategyOf() {
  const byslug = new Map();
  for (const [, slug, raw] of BRAND_SOURCE.matchAll(
    /slug: "([a-z0-9-]+)",[\s\S]*?art: ([\s\S]*?),\n  \},/g,
  )) {
    byslug.set(slug, /^(\w+)\(/.exec(raw.trim())?.[1] ?? "unknown");
  }
  return byslug;
}

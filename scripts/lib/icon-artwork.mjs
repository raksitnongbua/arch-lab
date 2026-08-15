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

/**
 * The node-card fills and their accent inks, READ FROM THE STYLESHEET rather
 * than restated here — an icon does not sit on the page background, it sits on
 * a tinted card, and the two are far enough apart that testing the wrong one
 * misses real bugs. Kong is why: its single ink (#003459) is within one
 * luminance step of the blue container card, so the mark vanished into the
 * node while every check that measured it against the PAGE said it was fine.
 */
export function nodeCardColours() {
  const css = readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8");
  const oklch = (L, C, h) => {
    const rad = (h * Math.PI) / 180;
    const a = C * Math.cos(rad),
      b = C * Math.sin(rad);
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.291485548 * b;
    const l = l_ ** 3,
      m = m_ ** 3,
      sc = s_ ** 3;
    const lin = [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * sc,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * sc,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * sc,
    ];
    return (
      "#" +
      lin
        .map((v) => {
          const e =
            v <= 0.0031308
              ? 12.92 * v
              : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055;
          return Math.round(Math.min(1, Math.max(0, e)) * 255)
            .toString(16)
            .padStart(2, "0");
        })
        .join("")
    );
  };
  const roles = ["person", "internal", "external", "database", "queue"];
  const found = new Map();
  for (const [, name, L, C, h] of css.matchAll(
    /--(node(?:-[a-z]+)*):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/g,
  )) {
    if (!found.has(name)) found.set(name, []);
    found.get(name).push(oklch(+L, +C, +h));
  }
  /* Each token appears twice: the light `:root` block first, the dark one
     second. A theme is a card fill plus the accent the icon is painted in. */
  const themes = [0, 1].map((i) => ({
    cards: ["node", ...roles.map((r) => `node-${r}`)]
      .map((n) => found.get(n)?.[i])
      .filter(Boolean),
    ink: found.get("node-border")?.[i],
  }));
  return { light: themes[0], dark: themes[1] };
}

/** Relative luminance of a #rrggbb colour, 0-255. */
export function luminanceOf(hex) {
  return (
    0.2126 * parseInt(hex.slice(1, 3), 16) +
    0.7152 * parseInt(hex.slice(3, 5), 16) +
    0.0722 * parseInt(hex.slice(5, 7), 16)
  );
}

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
    } else if (
      (m = /^monoFromAlternate\(\s*"[^"]+",\s*(\w+),\s*(\w+),/.exec(expr))
    ) {
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

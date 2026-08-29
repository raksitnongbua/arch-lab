#!/usr/bin/env node
/**
 * EVERY ROLE IS TELLABLE FROM EVERY OTHER ROLE, in every theme — measured on
 * what is PAINTED, not on the token.
 *
 * WHY THIS EXISTS, which is a failure the rest of the suite cannot see. Eight
 * themes separate the node roles by HUE, and the ΔE floors that guard them
 * (`check:themes`, `check:flowchart-palette`, `check:gantt-palette`) are
 * calibrated on hue-separated pairs: `light`'s person and internal fills clear
 * the 0.02 fill floor at ΔE 0.027 while measuring **1.010:1** against each
 * other, and that reads perfectly because the whole separation is hue. OKLab ΔE
 * does not care WHICH axis carries the distance, so a greyscale palette meets
 * the identical floor with two patches **1.078:1** apart — one colour with two
 * names. Every existing check passes on such a palette. That is not a
 * hypothesis: the `eink` block was written, and `check:themes`,
 * `check:flowchart-palette`, `check:gantt-palette`, `check:canvas-grid`,
 * `check:dot-grid` and `check:canvas-edit` all returned green over a diagram
 * whose seven role fills spanned 1.078:1 at the worst pair.
 *
 * So this script asks the question those cannot: **when this theme is applied,
 * can a reader tell these two things apart?** A pair passes on any ONE of three
 * channels, and needing all three to fail before it fails is what keeps the
 * rule from inventing work for the eight themes that were already fine:
 *
 *   1. CHROMA-PLANE distance — hue and saturation, measured with lightness
 *      REMOVED. This is the channel the existing ΔE floor was really measuring
 *      all along; isolating it is the whole fix, because it can no longer be
 *      met by two greys.
 *   2. LUMINANCE contrast — a pair genuinely separated by lightness.
 *      `blueprint`'s internal/external sit at chroma-plane 0.003 and pass here,
 *      at 1.344:1, which is why the floor is a real measurement rather than a
 *      number picked to make eink work.
 *   3. TEXTURE — two different tile geometries. Only a theme that opts into
 *      `--role-texture-opacity` may spend this one, and it is the only channel
 *      `eink` has.
 *
 * IT IS A FAMILY GUARD, NOT AN `eink` SCRIPT. It sweeps every theme in
 * `THEMES`, so the next low-chroma palette anyone writes cannot ship
 * identity-blind with a green suite behind it — which is exactly how this one
 * nearly did, twice.
 *
 * THE ROLE SET IS DERIVED FROM THE DATA, never typed here: the union of the C4
 * role table, the flowchart shape table, the use-case kind table and the gantt's
 * state rules, resolved through `:root`'s aliases to the concrete fills behind
 * them. `codebase.md`: "a hardcoded list cannot notice the thing it has never
 * heard of" — a hand-listed five would not notice a sixth role, which is the
 * precise way three checks in this repo passed while the feature under them was
 * broken.
 *
 * Exits non-zero on any failure. Run with: pnpm check:eink
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { contrast, parseOklch } from "./lib/oklch.mjs";
import { registerTsResolution } from "./lib/resolve-ts.mjs";
import { resolveToken, tokensOf } from "./lib/theme-css.mjs";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const load = registerTsResolution(ROOT);
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const CSS = read("src/app/globals.css");
const CONSTANTS = read("src/lib/constants.ts");
const GANTT_CSS = read("src/features/gantt/styles/gantt-motion.css");

const {
  ROLE_TEXTURES,
  TEXTURE_ANGLE,
  TEXTURE_STROKE,
  TEXTURE_TILE,
  textureCoverage,
  textureTilePaths,
} = await load("src/lib/role-texture.ts");
const { ROLE_COLOR_VARS, TEXTURE_BY_ROLE } = await load(
  "src/features/editor/lib/node-colors.ts",
);
const { FLOW_SHAPE_TOKENS, TEXTURE_BY_SHAPE } = await load(
  "src/features/flowchart/lib/shapes.ts",
);
const { USECASE_KIND_TOKENS, USECASE_ROLE_BY_KIND } = await load(
  "src/features/usecase/lib/shapes.ts",
);
const { TEXTURE_BY_STATE, hatchTilePaths } = await load(
  "src/features/gantt/lib/layout.ts",
);

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

const THEMES = [
  ...(/export const THEMES = \[([^\]]*)\]/.exec(CONSTANTS)?.[1] ?? "").matchAll(
    /"([a-z-]+)"/g,
  ),
].map((m) => m[1]);
const baseline = tokensOf(CSS, "light");

/* ----------------------------------------------------------------------- */
/* The role set, derived                                                    */
/* ----------------------------------------------------------------------- */

console.log("the role set is derived from the tables, not listed here");

/** `var(--foo)` / `--foo` → `--foo`. */
const tokenName = (value) =>
  (/--[a-z0-9-]+/.exec(String(value)) ?? [""])[0] || null;

/**
 * Follow `:root`'s `var()` aliases to the CONCRETE fill behind a token — the
 * flowchart's `--flow-start` IS `--node-queue`, and treating the alias as its
 * own role would report a distinction the palette does not draw.
 */
const canonical = (token) => {
  let current = token;
  for (let hop = 0; hop < 8; hop += 1) {
    const value = baseline.get(current);
    if (value === undefined || !value.includes("var(")) return current;
    const next = tokenName(value);
    if (next === null || next === current) return current;
    current = next;
  }
  return current;
};

/* The gantt's state → fill pairs, read out of its own stylesheet: CSS cannot be
   imported, so this is the reconciliation `check:gantt-palette` performs for
   the same table and for the same reason. */
const ganttStateFills = new Map();
{
  const base =
    /\.af-gantt-bar-fill\s*\{[^}]*?fill:\s*var\((--[a-z0-9-]+)\)/.exec(
      GANTT_CSS,
    );
  if (base !== null) ganttStateFills.set("planned", canonical(base[1]));
  for (const m of GANTT_CSS.matchAll(
    /\.af-gantt-row\[data-state="([a-z-]+)"\]\s*\.af-gantt-bar-fill\s*\{[^}]*?fill:\s*var\((--[a-z0-9-]+)\)/g,
  )) {
    ganttStateFills.set(m[1], canonical(m[2]));
  }
}

/** canonical fill token → the texture whichever table assigns it. */
const textureByFill = new Map();
const claim = (token, texture, source) => {
  const key = canonical(token);
  const existing = textureByFill.get(key);
  if (existing !== undefined && existing.texture !== texture) {
    check(
      `${key}: one texture, not two`,
      false,
      `${existing.source} says ${existing.texture}, ${source} says ${texture} — ` +
        `one fill wearing two geometries is two roles the reader cannot name`,
    );
    return;
  }
  textureByFill.set(key, { texture, source });
};

for (const [role, vars] of Object.entries(ROLE_COLOR_VARS)) {
  claim(tokenName(vars.fill), TEXTURE_BY_ROLE[role], `TEXTURE_BY_ROLE.${role}`);
}
for (const [shape, tokens] of Object.entries(FLOW_SHAPE_TOKENS)) {
  claim(tokens.fill, TEXTURE_BY_SHAPE[shape], `TEXTURE_BY_SHAPE.${shape}`);
}
for (const [kind, tokens] of Object.entries(USECASE_KIND_TOKENS)) {
  claim(
    tokens.fill,
    TEXTURE_BY_ROLE[USECASE_ROLE_BY_KIND[kind]],
    `USECASE_ROLE_BY_KIND.${kind}`,
  );
}

const ROLE_FILLS = [...textureByFill.keys()].sort();
check(
  `every role a diagram can paint has a texture (${ROLE_FILLS.length} roles: ${ROLE_FILLS.map((t) => t.replace(/^--/, "")).join(", ")})`,
  ROLE_FILLS.length > 0 &&
    ROLE_FILLS.every((token) =>
      ROLE_TEXTURES.includes(textureByFill.get(token).texture),
    ),
  "a fill with no texture is a role that vanishes in a hue-free theme",
);

/* A role added to a table but never given a texture would be caught above only
   if it reached `textureByFill` at all — an `undefined` texture does. This is
   the other half: every gantt state's fill must be one of the roles, or the
   gantt paints something no table knows about. */
check(
  `every gantt state paints a known role (${[...ganttStateFills.keys()].join(", ")})`,
  ganttStateFills.size > 0 &&
    [...ganttStateFills.values()].every((token) => textureByFill.has(token)),
  `${[...ganttStateFills.entries()]
    .filter(([, token]) => !textureByFill.has(token))
    .map(([state, token]) => `${state}→${token}`)
    .join(
      ", ",
    )} — a bar painted with a fill no role table claims cannot be given a texture`,
);

/* ----------------------------------------------------------------------- */
/* The three channels                                                       */
/* ----------------------------------------------------------------------- */

/* FLOORS, SET FROM THE EXISTING PALETTES rather than chosen to admit `eink`.
   Measured across the eight themes that predate this check, the weakest
   chroma-plane pair is `paper`'s person/internal at 0.023 and the weakest
   lightness-carried pair is `blueprint`'s internal/external at 1.344:1. Both
   floors sit below what those already hold and above what a grey ladder can
   reach: `eink`'s widest role pair is 1.164:1, so no arrangement of greys
   sneaks through the luminance door. */
const CHROMA_SEP_MIN = 0.02;
const LUMA_SEP_MIN = 1.25;

const lab = ([L, C, h]) => [
  L,
  C * Math.cos((h * Math.PI) / 180),
  C * Math.sin((h * Math.PI) / 180),
];
/** OKLab distance with LIGHTNESS REMOVED — the hue/saturation channel alone. */
const chromaSeparation = (a, b) => {
  const A = lab(a);
  const B = lab(b);
  return Math.hypot(A[1] - B[1], A[2] - B[2]);
};

console.log("\nevery role pair is distinguishable, per theme");

for (const theme of THEMES) {
  const tokens = theme === "light" ? baseline : tokensOf(CSS, theme);
  if (tokens === null) continue;
  const opacity = Number.parseFloat(
    resolveToken("--role-texture-opacity", tokens, baseline) ?? "0",
  );
  const textures = opacity > 0;
  const failed = [];
  for (let i = 0; i < ROLE_FILLS.length; i += 1) {
    for (let j = i + 1; j < ROLE_FILLS.length; j += 1) {
      const a = parseOklch(resolveToken(ROLE_FILLS[i], tokens, baseline));
      const b = parseOklch(resolveToken(ROLE_FILLS[j], tokens, baseline));
      if (a === null || b === null) continue;
      const chroma = chromaSeparation(a.oklch, b.oklch);
      const luma = contrast(a.rgb, b.rgb);
      const ta = textureByFill.get(ROLE_FILLS[i]).texture;
      const tb = textureByFill.get(ROLE_FILLS[j]).texture;
      const byTexture = textures && ta !== tb;
      if (chroma >= CHROMA_SEP_MIN || luma >= LUMA_SEP_MIN || byTexture) {
        continue;
      }
      failed.push(
        `${ROLE_FILLS[i].replace(/^--/, "")}/${ROLE_FILLS[j].replace(/^--/, "")}: ` +
          `chroma ${chroma.toFixed(3)} (<${CHROMA_SEP_MIN}), ${luma.toFixed(3)}:1 (<${LUMA_SEP_MIN})` +
          (textures ? `, both wear ${ta}` : ", theme paints no texture"),
      );
    }
  }
  check(
    `${theme}: all ${(ROLE_FILLS.length * (ROLE_FILLS.length - 1)) / 2} pairs separate` +
      (textures ? " (texture available)" : " (on colour alone)"),
    failed.length === 0,
    failed.join("; "),
  );
}

/* ----------------------------------------------------------------------- */
/* What the texture actually paints                                         */
/* ----------------------------------------------------------------------- */

console.log("\nthe texture is visible, and does not flatten the fills");

/* A texture that cannot be seen is a role marker that is not there; one that is
   too heavy stops being a marker ON a fill and becomes a fill of its own,
   dragging every textured role toward one another — the failure
   `check:gantt-motion` measures for the duration hatch, in the one theme where
   the same texture is carrying the MEANING rather than decorating it. */
const TEXTURE_VISIBLE_MIN = 1.06;
const FLATTEN_CEILING = 0.35;

for (const theme of THEMES) {
  const tokens = theme === "light" ? baseline : tokensOf(CSS, theme);
  if (tokens === null) continue;
  const opacity = Number.parseFloat(
    resolveToken("--role-texture-opacity", tokens, baseline) ?? "0",
  );
  if (!(opacity > 0)) continue;
  const ink = parseOklch(resolveToken("--role-texture-ink", tokens, baseline));
  if (ink === null) {
    check(`${theme}: the texture ink resolves`, false, "--role-texture-ink");
    continue;
  }
  const problems = [];
  for (const token of ROLE_FILLS) {
    const { texture } = textureByFill.get(token);
    if (texture === "plain") continue;
    const fill = parseOklch(resolveToken(token, tokens, baseline));
    if (fill === null) continue;
    const seen = contrast(ink.rgb, fill.rgb);
    if (seen < TEXTURE_VISIBLE_MIN) {
      problems.push(
        `${token}: ink is ${seen.toFixed(3)}:1 on the fill it rules — invisible`,
      );
    }
    /* How far the tile's ink drags the fill's mean: coverage × opacity. Held
       under a ceiling so the ladder's own ordering survives being textured. */
    const wash = textureCoverage(texture) * opacity;
    if (wash > FLATTEN_CEILING) {
      problems.push(
        `${token}: the tile washes ${(wash * 100).toFixed(1)}% of the fill toward the ink`,
      );
    }
  }
  check(
    `${theme}: every texture is legible on its own fill and stays a marker`,
    problems.length === 0,
    problems.join("; "),
  );
}

/* ----------------------------------------------------------------------- */
/* The gantt is the one place two textures meet                             */
/* ----------------------------------------------------------------------- */

console.log("\nno gantt state rules at the duration hatch's angle");

/* THE COLLISION, stated as geometry rather than as a rule to remember. A gantt
   bar carries `af-gantt-hatch` — 45° diagonals meaning "this span has a
   duration" — and a gantt's state fills ARE four of the role tokens, so a role
   texture lands on the very same rect. Two textures at ONE angle superpose into
   one texture and both meanings are lost. Derived from the gantt's own tile
   paths, so retuning the hatch re-runs this rather than silently invalidating
   the assignment it was chosen against. */
const hatchAngles = new Set(
  hatchTilePaths()
    .map((d) => {
      const n = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map(Number);
      if (n.length < 4) return null;
      const [x1, y1, x2, y2] = n;
      /* Negated dy: an SVG y-axis points down, and an angle measured without
         that flip names the mirror of the line actually drawn. */
      const deg = (Math.atan2(-(y2 - y1), x2 - x1) * 180) / Math.PI;
      return ((deg % 180) + 180) % 180;
    })
    .filter((a) => a !== null),
);

check(
  `the duration hatch's angle is read from its own tile (${[...hatchAngles].map((a) => a.toFixed(0) + "°").join(", ")})`,
  hatchAngles.size > 0,
  "hatchTilePaths() produced no measurable angle — the collision below cannot be checked",
);

/* AND THE TABLE THE CANVAS ACTUALLY READS AGREES WITH THE STYLESHEET. The
   state → role pairing is genuinely duplicated — `gantt-motion.css` declares it
   in `fill:` rules and `lib/layout.ts` restates it in `TEXTURE_BY_STATE`,
   because CSS cannot be imported. Without this assertion `TEXTURE_BY_STATE`
   could pair `done`'s queue COLOUR with `internal`'s RULING and the bar would be
   internally consistent while telling a reader the wrong role — and the comment
   above that table, which names this check as its pin, would be asserting a
   coupling nothing enforced. */
{
  const wrong = [...ganttStateFills.entries()]
    .filter(([state, token]) => {
      const expected = textureByFill.get(token)?.texture;
      return expected !== undefined && TEXTURE_BY_STATE[state] !== expected;
    })
    .map(
      ([state, token]) =>
        `${state}: the stylesheet paints ${token} (${textureByFill.get(token).texture}) but TEXTURE_BY_STATE says ${TEXTURE_BY_STATE[state]}`,
    );
  check(
    `TEXTURE_BY_STATE matches the fills gantt-motion.css declares (${ganttStateFills.size} states)`,
    wrong.length === 0 &&
      [...ganttStateFills.keys()].every(
        (state) => TEXTURE_BY_STATE[state] !== undefined,
      ),
    wrong.join("; ") ||
      `a state in the stylesheet has no entry in TEXTURE_BY_STATE — its bars paint a colour with no ruling`,
  );
}

const collisions = [...ganttStateFills.entries()].filter(([, token]) => {
  const entry = textureByFill.get(token);
  if (entry === undefined) return false;
  const angle = TEXTURE_ANGLE[entry.texture];
  return angle !== null && hatchAngles.has(((angle % 180) + 180) % 180);
});
check(
  `no state a gantt paints shares that angle (${[...ganttStateFills.entries()].map(([s, t]) => `${s}:${textureByFill.get(t)?.texture ?? "?"}`).join(", ")})`,
  collisions.length === 0,
  `${collisions.map(([s]) => s).join(", ")} — a role ruled at the hatch's own angle ` +
    `superposes into it, and the bar stops saying either which state it is or that it has a span`,
);

/* ----------------------------------------------------------------------- */
/* The two renditions draw the same tile                                    */
/* ----------------------------------------------------------------------- */

console.log("\nthe CSS and SVG renditions draw the same geometry");

/* CSS cannot import `lib/role-texture.ts`, so `globals.css` genuinely repeats
   its pitch, weight and angle — the `.af-node-wash` / `lib/wash.ts` situation,
   pinned the same way. The angle needs a CONVERSION, not a comparison: an SVG
   y-axis points down while a CSS gradient angle runs clockwise from up, so the
   two are mirrored in y and the same stripe is `180 − angle`. Spelling both as
   45 would render a C4 node and a flowchart node with opposite slants for one
   role — two halves, each self-consistent, that disagree. */
const cssAngleFor = (svgAngle) => (((180 - svgAngle) % 180) + 180) % 180;

for (const texture of ROLE_TEXTURES) {
  if (texture === "plain") continue;
  const block = new RegExp(
    `--tex-${texture}:\\s*([\\s\\S]*?);\\s*(?:\\n\\s*(?:--|\\}|/\\*))`,
  ).exec(CSS)?.[1];
  if (block === undefined || block === null) {
    check(
      `--tex-${texture} is declared`,
      false,
      "no such token in globals.css",
    );
    continue;
  }
  if (texture === "dots") {
    const r = /transparent\s+([\d.]+)px/.exec(block)?.[1];
    check(
      `--tex-dots stipples at the module's radius (${r}px)`,
      Number(r) === 0.85,
      `CSS says ${r}px; role-texture.ts draws r=0.85`,
    );
    continue;
  }
  const angles = [...block.matchAll(/(-?[\d.]+)deg/g)].map((m) => Number(m[1]));
  const widths = [...block.matchAll(/var\(--tex-ink\) 0 ([\d.]+)px/g)].map(
    (m) => Number(m[1]),
  );
  const pitches = [...block.matchAll(/transparent [\d.]+px ([\d.]+)px/g)].map(
    (m) => Number(m[1]),
  );
  const expectedAngles =
    texture === "cross"
      ? [cssAngleFor(90), cssAngleFor(0)]
      : [cssAngleFor(TEXTURE_ANGLE[texture])];
  check(
    `--tex-${texture}: ${angles.map((a) => a + "deg").join(" + ")} is the SVG tile mirrored, at ${TEXTURE_STROKE}px on a ${TEXTURE_TILE}px pitch`,
    angles.length === expectedAngles.length &&
      angles.every(
        (a, i) => ((a % 180) + 180) % 180 === expectedAngles[i] % 180,
      ) &&
      widths.every((w) => w === TEXTURE_STROKE) &&
      pitches.every((p) => p === TEXTURE_TILE),
    `CSS draws ${angles.join("/")}deg at ${widths.join("/")}px on ${pitches.join("/")}px; ` +
      `the module says ${expectedAngles.join("/")}deg (from SVG ${TEXTURE_ANGLE[texture]}°) at ${TEXTURE_STROKE}px on ${TEXTURE_TILE}px`,
  );
}

/* Every geometry in the vocabulary actually draws something (except `plain`,
   which is a deliberate member). A texture that returns no paths and no dot is
   a role silently sharing `plain`'s appearance. */
check(
  "every texture but `plain` draws a mark",
  ROLE_TEXTURES.filter((t) => t !== "plain").every(
    (t) => textureTilePaths(t).length > 0 || t === "dots",
  ),
  "a geometry that paints nothing is a second `plain` under another name",
);

/* ----------------------------------------------------------------------- */
/* Every C4 node type has SOMETHING that paints its texture                 */
/* ----------------------------------------------------------------------- */

console.log("\nevery C4 node type can actually paint its texture");

/* C4's live view is HTML, so its texture rides in `.af-node-wash`'s
   `background-image` — which means a box type that does NOT carry that class
   has nowhere for `--node-texture` to land, and its role marker silently is not
   drawn. Nothing else would report it: the property is still set, the theme is
   still correct, and the node just quietly loses its identity. `externalSystem`
   is the one type deliberately without a wash, and it is also the one role
   whose texture is `plain` — so the rule is "textured ⇒ washed OR an SVG
   silhouette", and if someone ever gives `external` a texture, or takes the
   wash off `container`, this is what says so. */
{
  const shapes = read("src/features/editor/components/nodes/node-shapes.tsx");
  const classes = new Map(
    [
      ...(
        /SHAPE_WRAPPER_CLASSES: Record<C4NodeType, string> = \{([\s\S]*?)\n\};/.exec(
          shapes,
        )?.[1] ?? ""
      ).matchAll(/^\s*([a-zA-Z]+):\s*\n?\s*"([^"]*)"/gm),
    ].map((m) => [m[1], m[2]]),
  );
  const svgSilhouette = new Set(
    [
      ...(
        /function hasSvgSilhouette[\s\S]*?\n\}/.exec(shapes)?.[0] ?? ""
      ).matchAll(/type === "([a-zA-Z]+)"/g),
    ].map((m) => m[1]),
  );
  const { COLOR_ROLE_BY_TYPE } = await load(
    "src/features/editor/lib/node-colors.ts",
  );
  const unpainted = Object.entries(COLOR_ROLE_BY_TYPE)
    .filter(([type, role]) => {
      if (TEXTURE_BY_ROLE[role] === "plain") return false;
      if (svgSilhouette.has(type)) return false;
      return !(classes.get(type) ?? "").includes("af-node-wash");
    })
    .map(([type, role]) => `${type} (${role}: ${TEXTURE_BY_ROLE[role]})`);
  check(
    `every textured type carries the wash or an SVG silhouette (${classes.size} types parsed)`,
    classes.size > 0 && unpainted.length === 0,
    `${unpainted.join(", ")} — --node-texture is set on these nodes and nothing paints it, ` +
      "so the role marker is silently absent in a theme that has no hue to fall back on",
  );
}

/* ----------------------------------------------------------------------- */
/* The export carries it — the texture is CONTENT, not chrome               */
/* ----------------------------------------------------------------------- */

console.log("\nevery exporter that paints a role also paints its texture");

/* THE DISTINCTION THAT DECIDES THIS, and it is not the one the canvas field
   settled. The well's grid is deliberately kept OUT of exports because a
   diagram dropped into a deck should arrive as the drawing — `check:canvas-grid`
   asserts its ABSENCE from every `render-svg.ts`. A role texture is the
   opposite case: under a hue-free theme it is the ONLY thing separating a
   database from a queue, so an export without it is not a tidier diagram, it is
   a diagram that lost its meaning. Hence the mirrored assertion — presence,
   here, where that check asserts absence. */
const strip = (rel) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/* THE GUARD LIVES IN ONE PLACE, and this asserts the shape of that rather than
   its spelling. `TextureRegistry.ref()` answers `null` for a non-texturing
   theme and for `plain`, so every exporter inherits the zero-opacity rule by
   going through it — the arrangement `WashRegistry` already established. An
   exporter that built a `url(#…)` by hand would be outside the guard and would
   put an invisible overlay into eight themes' downloads; requiring the registry
   is what makes that impossible rather than merely discouraged. */
{
  const registry = strip("src/features/viewer/export/texture-registry.ts");
  check(
    "the export registry refuses to paint when the theme does not texture",
    /opacity\s*<=\s*0|opacity\s*===?\s*0|!\(this\.opacity\s*>\s*0\)/.test(
      registry,
    ) && /return null/.test(registry),
    "TextureRegistry.ref() must answer null at zero opacity — it is the single " +
      "point every exporter inherits that rule from",
  );
}

for (const rel of [
  "src/features/viewer/export/render-svg.ts",
  "src/features/flowchart/export/render-svg.ts",
  "src/features/usecase/export/render-svg.ts",
  "src/features/gantt/export/render-svg.ts",
]) {
  const kind = rel.split("/").slice(-3, -2)[0];
  const code = strip(rel);
  check(
    `${kind}: the exporter carries the role texture into the file`,
    /TextureRegistry/.test(code) && /\.markup\(\)/.test(code),
    "this exporter draws role-coloured shapes but ships no texture — under a " +
      "hue-free theme its download is a diagram whose roles are one colour, " +
      "which is the one thing the canvas grid's exclusion is NOT a precedent for",
  );
  check(
    `${kind}: and skips the whole overlay when the registry declines`,
    /!==\s*null/.test(code),
    'a `fill="none"` rect is still a rect: the null answer must skip the ' +
      "element, or every untextured node ships a stray shape",
  );
}

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(
    `\n${failures} of ${assertions} role-identity assertion(s) FAILED`,
  );
  process.exit(1);
}
console.log(`\nAll ${assertions} role-identity assertions passed.`);

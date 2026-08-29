/**
 * ROLE TEXTURE — the channel that carries "which kind of thing is this?" when
 * colour cannot. ONE recipe, four renditions, in the manner of `wash.ts`.
 *
 * WHY IT EXISTS. Every other theme separates the node roles by HUE: `light`'s
 * person and internal fills sit at ΔE 0.027 and **1.010:1** against each other,
 * which is a perfectly good separation because it is carried entirely by hue.
 * Take the hue away — a greyscale palette, a photocopy, an e-reader, a reader
 * with achromatopsia — and the same ΔE floor is met by two greys 1.078:1 apart,
 * which is one colour with two names. The floors in `check:themes`,
 * `check:flowchart-palette` and `check:gantt-palette` are HUE-CALIBRATED and
 * would hand a green tick to a diagram whose six flowchart shapes are
 * indistinguishable. That is not a hypothetical: it is the measured reason the
 * `eink` theme was twice refused, and this module is what answers it.
 *
 * SO IDENTITY MOVES INTO GEOMETRY. Seven roles, seven tile geometries, drawn in
 * ONE ink colour. Colour is deliberately NOT the differentiator — if it were,
 * the texture would be the same idea as the fill and would fail in the same
 * places. A reader tells a database from a queue because one is ruled in
 * horizontal lines and the other in back-slanted ones, at any colour depth, on
 * any medium, including a monochrome one.
 *
 * AN OPT-IN SEAM, NOT A SET EVERY THEME COMPLETES — exactly the arrangement
 * `--canvas-rule` already uses for the well's ruling (see `:root` in
 * `globals.css`, which records who may texture a ground and why the list stops
 * where it does). `--role-texture-opacity` is `0` in `:root`, so the overlays
 * are painted by every theme and VISIBLE in none of them but `eink`. Eight
 * existing themes render exactly what they rendered before, byte for byte in
 * their exports, because a zero-opacity theme emits no overlay at all.
 *
 * Do not switch this on for a theme that already separates by hue. Two
 * differentiators for one meaning is how a reader stops being able to read
 * either — the argument `gantt-motion.css` makes about stroke weight, and the
 * same reason `contrast` refuses the canvas ruling.
 *
 * THE FOUR RENDITIONS, which must never drift apart:
 *
 *   1. `<RoleTextureDefs>` (`components/ui/role-texture.tsx`) — the shared
 *      `<pattern>` set in a diagram's own `<svg>`, the mechanism `CanvasField`
 *      established and `af-gantt-hatch` used before it;
 *   2. the `--tex-*` tokens in `globals.css`, layered into `.af-node-wash`'s own
 *      `background-image` — the CSS rendition, for C4's live view, whose nodes
 *      are HTML boxes an SVG `<pattern>` cannot reach. It rides IN the wash's
 *      declaration because an element has one `background-image`, so a separate
 *      rule would replace the wash rather than stack with it;
 *   3. `textureTilePaths()` below, re-emitted by each exporter, because a
 *      downloaded file carries no stylesheet;
 *   4. `scripts/eink-check.mjs`, which loads this module and measures what the
 *      geometry actually paints rather than trusting the names.
 *
 * Pure and erasable (no DOM, no React) so the check scripts can load it
 * through Node's type stripping, the same contract `wash.ts` keeps.
 */

/**
 * The seven geometries. The vocabulary is CLOSED and the names describe the
 * MARK, not the role — a texture is a shape, and binding the name to a meaning
 * here would put the role table in two places.
 */
export const ROLE_TEXTURES = [
  "plain",
  "dots",
  "vertical",
  "horizontal",
  "hatch-forward",
  "hatch-back",
  "cross",
] as const;

export type RoleTexture = (typeof ROLE_TEXTURES)[number];

/**
 * The tile edge, in diagram user units. EIGHT, against the gantt's ten and the
 * canvas field's twenty-eight, and the spread is deliberate: three lattices are
 * visible at once on a gantt bar (the well's field under it, this texture on
 * it, the duration hatch over it) and three pitches that share a common factor
 * beat against each other. 8, 10 and 28 do not.
 */
export const TEXTURE_TILE = 8;

/** Stroke weight of a ruled texture. Finer than the canvas ruling (1) so a
 *  texture never competes with the drawing it sits inside. */
export const TEXTURE_STROKE = 0.9;

/** Radius of a stipple dot. */
export const TEXTURE_DOT_RADIUS = 0.85;

/**
 * THE ANGLE A TEXTURE RULES AT, in degrees, or `null` for a geometry that has
 * no single angle (`plain`, `dots`, `cross`).
 *
 * EXPORTED BECAUSE THE GANTT NEEDS IT, and this is the one real collision in
 * the design. A gantt bar already carries `af-gantt-hatch` — 45° diagonals that
 * mean "this span has duration" — and a gantt's four state fills ARE the C4
 * role tokens, so a role texture lands on the very same rect. Two textures at
 * the same angle superpose into one texture and the reader loses both meanings.
 * So no state a gantt can paint may be assigned a 45° geometry, and
 * `check:eink` asserts exactly that, deriving the state → role map from
 * `gantt-motion.css` and the hatch angle from the gantt's own tile paths rather
 * than from anything typed twice.
 */
export const TEXTURE_ANGLE: Record<RoleTexture, number | null> = {
  plain: null,
  dots: null,
  vertical: 90,
  horizontal: 0,
  "hatch-forward": 45,
  "hatch-back": 135,
  cross: null,
};

/**
 * The share of a tile the ink covers, 0..1 — the number that decides how much
 * a texture DARKENS the fill it lies on, and therefore whether two textured
 * roles are still two colours after they are textured.
 *
 * Computed from the geometry rather than measured off a raster: a ruled line of
 * width w at pitch p covers w/p of the tile; `cross` rules twice and subtracts
 * the overlap; `dots` cover πr²/p². `check:eink` folds this through
 * `--role-texture-opacity` to get each role's PAINTED mean luminance, which is
 * the thing a reader actually sees and the only honest input to a "can these be
 * told apart?" assertion.
 */
export function textureCoverage(texture: RoleTexture): number {
  const p = TEXTURE_TILE;
  const w = TEXTURE_STROKE;
  switch (texture) {
    case "plain":
      return 0;
    case "dots":
      return (Math.PI * TEXTURE_DOT_RADIUS ** 2) / p ** 2;
    case "vertical":
    case "horizontal":
      return w / p;
    /* A diagonal at 45° crosses a tile over a length of p√2 rather than p, so
       one line covers √2 times what an axis-aligned one does. */
    case "hatch-forward":
    case "hatch-back":
      return (w * Math.SQRT2) / p;
    /* Two rulings minus the square where they cross, or the corner is counted
       twice and the coverage reads heavier than it paints. */
    case "cross":
      return (2 * w) / p - (w / p) ** 2;
  }
}

/**
 * The tile's paths, in a `TEXTURE_TILE`-square `patternUnits="userSpaceOnUse"`
 * tile. Empty for `plain`, which is a real member of the vocabulary rather than
 * an absence: `external` means "not ours" and is the one role the palette keeps
 * deliberately quiet in every theme, so leaving it untextured is the same
 * decision the other eight themes make by giving it a near-neutral fill and no
 * wash.
 *
 * `dots` is returned separately by `textureTileDot()` because it is a circle,
 * not a stroked path, and folding it into this list would make every consumer
 * branch on the string anyway.
 */
export function textureTilePaths(texture: RoleTexture): string[] {
  const p = TEXTURE_TILE;
  switch (texture) {
    case "plain":
    case "dots":
      return [];
    case "vertical":
      return [`M0,0 L0,${p}`];
    case "horizontal":
      return [`M0,0 L${p},0`];
    /* Both diagonals are drawn so the ruling continues across the tile seam.
       One line per tile leaves a visible break at every corner — the same
       reason `af-gantt-hatch` carries two paths for one apparent ruling. */
    case "hatch-forward":
      return [`M0,${p} L${p},0`, `M${-p},${p} L0,0`];
    case "hatch-back":
      return [`M0,0 L${p},${p}`, `M${-p},0 L0,${p}`];
    case "cross":
      return [`M0,0 L0,${p}`, `M0,0 L${p},0`];
  }
}

/** The stipple's one circle, or `null` for every other geometry. */
export function textureTileDot(
  texture: RoleTexture,
): { cx: number; cy: number; r: number } | null {
  if (texture !== "dots") return null;
  return {
    cx: TEXTURE_TILE / 2,
    cy: TEXTURE_TILE / 2,
    r: TEXTURE_DOT_RADIUS,
  };
}

/** The `<pattern>` id a texture is published under, shared per diagram. */
export const textureId = (texture: RoleTexture): string => `af-tex-${texture}`;

/**
 * The `fill` value a shape uses to wear a texture, or `"none"` for `plain`.
 *
 * `"none"` RATHER THAN AN EMPTY PATTERN, because a `plain` role should emit no
 * overlay element at all: an invisible rect over every external node is a hit
 * target nobody wanted and a node in the accessibility tree that says nothing.
 */
export const textureFill = (texture: RoleTexture): string =>
  texture === "plain" ? "none" : `url(#${textureId(texture)})`;

/**
 * The CSS rendition's `background-image` layer for a texture, or `none`.
 *
 * Names a token rather than spelling the gradient, so the geometry lives in
 * `globals.css` beside the wash it layers over and this module stays free of a
 * second copy of it. `check:eink` pins those tokens to the constants above.
 */
export const textureCssImage = (texture: RoleTexture): string =>
  texture === "plain" ? "none" : `var(--tex-${texture})`;

/**
 * The matching `background-size`. Only the stipple needs one: a
 * `repeating-linear-gradient` carries its own pitch, where a `radial-gradient`
 * is one dot stretched over the box until a size tiles it.
 */
export const textureCssSize = (texture: RoleTexture): string =>
  texture === "dots" ? `${TEXTURE_TILE}px ${TEXTURE_TILE}px` : "auto";

/**
 * The exporters' rendition of the tile — concrete `ink`, no `var()`, because a
 * downloaded file resolves no custom properties (the constraint
 * `viewer/export/theme.ts` exists for). Returns the whole `<pattern>` element.
 *
 * Emitted only when a theme actually textures: `opacity` is `0` in every theme
 * but `eink`, and an exporter that emitted these anyway would change the bytes
 * of eight themes' exports to paint nothing.
 */
export function texturePatternMarkup(
  texture: RoleTexture,
  ink: string,
  opacity: number,
): string {
  if (texture === "plain") return "";
  const dot = textureTileDot(texture);
  const body =
    dot !== null
      ? `<circle cx="${dot.cx}" cy="${dot.cy}" r="${dot.r}" fill="${ink}" fill-opacity="${opacity}"/>`
      : textureTilePaths(texture)
          .map(
            (d) =>
              `<path d="${d}" fill="none" stroke="${ink}" ` +
              `stroke-width="${TEXTURE_STROKE}" stroke-opacity="${opacity}" stroke-linecap="butt"/>`,
          )
          .join("");
  return (
    `<pattern id="${textureId(texture)}" patternUnits="userSpaceOnUse" ` +
    `width="${TEXTURE_TILE}" height="${TEXTURE_TILE}">${body}</pattern>`
  );
}

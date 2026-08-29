/**
 * THE GROUND UNDER A DIAGRAM — the adaptive ladder, in one function.
 *
 * This is the THIRD model the canvas ground has had, and the two it replaces
 * are both recorded here because each was right about half of it.
 *
 *   1. **World space, ONE pitch.** The ground lived in the drawing's own
 *      coordinates, so it panned and zoomed with the drawing — correct — but a
 *      single pitch multiplied by the camera without limit. Across the app's
 *      own clamps that is a 40× spread: at 10% the field collapsed into a grey
 *      wash, at 400% the cells were the size of a node. A ruler whose divisions
 *      change size is not a ruler.
 *   2. **Screen space, FIXED.** The pitch was then comfortable at every zoom —
 *      correct — but the ground stopped moving with the drawing, so panning
 *      slid the diagram across a stationary field and the paper read as
 *      detached from the pencil.
 *
 * THE MODEL HERE KEEPS BOTH HALVES. The ladder is in world space, so every
 * line still belongs to the drawing and pans and zooms with it. But there is
 * not one pitch — there are several, each {@link GROUND_RATIO}× the last, and
 * a level is painted only while its ON-SCREEN pitch sits inside a readable
 * band, cross-fading in and out at the band's edges. Zoom in and a finer level
 * appears; zoom out and the finest fades while a coarser one takes over. The
 * whole rule is one line:
 *
 *     screenPitch = worldPitch × scale, drawn while screenPitch is in the band
 *
 * so the on-screen pitch stays inside {@link GROUND_BAND_MIN_PX}…
 * {@link GROUND_BAND_MAX_PX} across the entire zoom range. That property — not
 * the pitch, not the opacity — is what both earlier models failed, and
 * `check:canvas-grid` asserts it by sweeping this function over the app's real
 * `MIN_ZOOM`/`MAX_ZOOM` rather than by reading the code.
 *
 * WHAT THIS IS *NOT*: the material layer. A rule is MEASUREMENT — it describes
 * the drawing's space, so it lives in that space and subdivides as you look
 * closer, which is what a ruler does. A material is the SHEET — paper fibre
 * does not get finer when you lean in, and a weave that subdivided would be
 * claiming the paper is made of paper. The material layer is therefore fixed in
 * sheet space and lives entirely in `globals.css` (`--canvas-sheet`), with no
 * code here and no knowledge of the camera. Do not merge the two.
 *
 * THE MARKS ARE SIZED IN SCREEN PIXELS while the PITCH is in world units, and
 * that pairing is deliberate rather than an inconsistency. Where the lines fall
 * is a fact about the drawing; how heavy the ink is, is a fact about looking.
 * A ruler's divisions move when you slide the ruler and its engraving does not
 * get thicker when you lean in. React Flow's `<Background>` already works this
 * way (`gap` in flow units, `lineWidth`/`size` in pixels), which is why the two
 * mechanisms can read one function.
 */

/**
 * World pitch of level 0, and the FLOOR of the ladder: nothing finer is ever
 * drawn.
 *
 * It is `GRID_SIZE` on purpose — the quantum a dragged node already snaps to.
 * The finest rule the reader can be shown is therefore exactly the finest
 * position the drawing can hold, so zooming past it would offer a precision
 * the document cannot express. The consequence is visible at the top of the
 * range: at 400% only one level is in the band, because there is nothing below
 * level 0 to bring in.
 */
export const GROUND_BASE = 8;

/**
 * Class on the group every SVG canvas draws its ladder into.
 *
 * IT EXISTS FOR ONE EXPORTER. Eight of the nine `render-svg.ts` files are
 * string builders that import layout and nothing else, so they cannot carry a
 * field they never write. `sequence/export/render-svg.ts` CLONES THE LIVE
 * `<svg>`, which means everything on screen is in the downloaded file unless
 * something takes it out — and under the previous model nothing did, so the
 * screen's grid went into every exported sequence diagram while a grep-based
 * assertion passed green. That exporter drops this class by name, and
 * `check:canvas-grid` asserts it still does.
 */
export const CANVAS_FIELD_CLASS = "af-canvas-field";

/**
 * Ladder step. FIVE, the drafting convention, and the reason the band can be
 * as narrow as it is: 90/8 is 11.25, and 11.25/5 = 2.25, so through most of the
 * range exactly two levels are inside the band at once — one settling in while
 * the other fades out. A larger ratio would leave stretches with a single level
 * and a visible jump between them; a smaller one would crowd three or four
 * levels into the band and read as mud.
 */
export const GROUND_RATIO = 5;

/**
 * The readable band, in SCREEN pixels. Below the floor a field stops being
 * divisions and becomes tone; above the ceiling it stops being a field and
 * becomes four lines on a page.
 */
export const GROUND_BAND_MIN_PX = 8;
export const GROUND_BAND_MAX_PX = 90;

/**
 * The two strengths, as alpha over the theme's rule ink.
 *
 * ONE INK AT TWO ALPHAS, not two colours. Under the previous model the minor
 * and major rules were separately chosen tokens and a check held them 1.4:1
 * apart; here they are the same ink pressed harder, which is what a drafting
 * pen actually does, and they cannot reach 1.4:1 against each other by
 * construction. They are separated on THREE channels instead — alpha, stroke
 * weight ({@link GROUND_LINE_WIDTH_PX}) and a 5× difference in pitch — and the
 * last of those is far the strongest cue.
 *
 * These numbers were lowered from 0.34/0.50 on explicit feedback that the
 * ground was too loud. Do not raise them. If a theme cannot clear the
 * visibility floor at 0.16, that theme's INK is the thing to change.
 */
export const GROUND_MINOR_OPACITY = 0.16;
export const GROUND_MAJOR_OPACITY = 0.26;

/** Mark weights, in screen pixels, at the minor and major strengths. */
export const GROUND_LINE_WIDTH_PX = [1, 1.5] as const;
export const GROUND_DOT_SIZE_PX = [1.5, 2] as const;

/** A level of the ladder, resolved for one camera scale. */
export interface GroundLevel {
  /** Rung of the ladder. 0 is {@link GROUND_BASE}; never negative. */
  index: number;
  /** Pitch in the DRAWING's units — what the pattern is tiled at. */
  worldPitch: number;
  /** Pitch in screen pixels. Always inside the band. */
  screenPitch: number;
  /** Alpha to paint this level at, cross-fade already applied. */
  opacity: number;
  /** Stroke weight in SCREEN pixels, for the ruled variant. */
  lineWidthPx: number;
  /** Dot diameter in SCREEN pixels, for the dotted variant. */
  dotSizePx: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * The band's SETTLED interior — the stretch where a level is neither fading in
 * nor fading out, which is one octave inside each edge.
 */
const SETTLED_MIN_PX = GROUND_BAND_MIN_PX * 2;
const SETTLED_MAX_PX = GROUND_BAND_MAX_PX / 2;

/**
 * How far up the SETTLED interior a pitch sits — 0 where a level has just
 * finished arriving, 1 where it is about to start leaving.
 *
 * IT RAMPS OVER THE INTERIOR, NOT OVER THE WHOLE BAND, and that was a bug the
 * check caught rather than a preference. Ramping over the full 8–90px meant the
 * major strength was only approached at the ceiling — where the cross-fade has
 * already multiplied it to nothing — so 0.26 was a number no pixel ever wore
 * and every level painted some middling grey. The strengths are the strengths a
 * SETTLED level is painted at, so the ramp has to live where levels settle.
 * `check:canvas-grid` asserts both ends are actually reached inside the app's
 * own zoom clamps.
 */
const bandPosition = (screenPitch: number): number =>
  clamp01(
    Math.log(screenPitch / SETTLED_MIN_PX) /
      Math.log(SETTLED_MAX_PX / SETTLED_MIN_PX),
  );

/**
 * The cross-fade: a level fades over the LAST OCTAVE at each end of the band.
 *
 * An octave — a factor of two — rather than a fixed pixel margin, because the
 * band is a ratio and a fade measured in pixels would be abrupt at one end and
 * languid at the other. With a 5× ladder the two fades never overlap on the
 * same level, and while one level is fading in at 8–16px its coarser partner is
 * at 40–80px and fully settled, which is what keeps the total ink steady.
 */
const fade = (screenPitch: number): number =>
  clamp01(Math.log2(screenPitch / GROUND_BAND_MIN_PX)) *
  clamp01(Math.log2(GROUND_BAND_MAX_PX / screenPitch));

/**
 * The levels to paint at a given camera scale, finest first.
 *
 * STRENGTH IS A FUNCTION OF THE LEVEL'S OWN SCREEN PITCH, not of its rank in
 * the returned list. Ranking would be simpler and is wrong: the moment a new
 * coarse level crosses the ceiling at zero opacity, the level below it would
 * flip from major to minor and pop, on a frame where nothing visible had
 * changed. Reading strength off the pitch makes the coarser of two visible
 * levels the louder one automatically, and makes it continuous.
 *
 * @param scale multiplier from drawing units to screen pixels — the camera the
 * host already owns. There is no second source of truth for it.
 */
export function groundLevels(scale: number): GroundLevel[] {
  if (!Number.isFinite(scale) || scale <= 0) return [];
  const first = Math.max(
    0,
    Math.ceil(
      Math.log(GROUND_BAND_MIN_PX / (GROUND_BASE * scale)) /
        Math.log(GROUND_RATIO),
    ),
  );
  const last = Math.floor(
    Math.log(GROUND_BAND_MAX_PX / (GROUND_BASE * scale)) /
      Math.log(GROUND_RATIO),
  );
  const levels: GroundLevel[] = [];
  for (let index = first; index <= last; index += 1) {
    const worldPitch = GROUND_BASE * GROUND_RATIO ** index;
    const screenPitch = worldPitch * scale;
    const t = bandPosition(screenPitch);
    const opacity =
      fade(screenPitch) * lerp(GROUND_MINOR_OPACITY, GROUND_MAJOR_OPACITY, t);
    /* A level sitting exactly on a band edge paints nothing; returning it
       would have every consumer mount a layer that draws air. */
    if (opacity <= 0) continue;
    levels.push({
      index,
      worldPitch,
      screenPitch,
      opacity,
      lineWidthPx: lerp(GROUND_LINE_WIDTH_PX[0], GROUND_LINE_WIDTH_PX[1], t),
      dotSizePx: lerp(GROUND_DOT_SIZE_PX[0], GROUND_DOT_SIZE_PX[1], t),
    });
  }
  return levels;
}

/** The ladder as CSS backgrounds — pitch, marks and opacity already resolved. */
export interface GroundFieldCss {
  backgroundImage: string;
  backgroundSize: string;
  /** Pitch of the coarsest painted level, px. A drift must be a whole one of
   * these or its loop is not seamless. */
  pitchPx: number;
}

/**
 * THE SAME LADDER, FOR AN ILLUSTRATION OF A CANVAS RATHER THAN A CANVAS.
 *
 * The home page draws two pictures of the product — the hero card and the MCP
 * exchange box — and both used to claim in a comment that their ground
 * "matches the editor surface" while painting a hand-typed 28px and 22px line
 * grid in a token the canvas does not use. Three illustrations of one product,
 * three grounds, none of them equal to the thing they claimed to match, and
 * nothing pinning any of them.
 *
 * These have no camera, so they are the ladder at scale 1 — which is a real
 * reading of it, not a special case: it is what a reader sees on opening a
 * document before touching the zoom. Both shapes are emitted for the same
 * reason the canvas emits both, so a theme that rules in lines rules these too.
 *
 * The alpha is baked into each layer's colour rather than set as an element
 * opacity, because CSS has no per-background-layer opacity and the levels are
 * meant to differ.
 */
export function groundFieldCss(scale: number): GroundFieldCss {
  const levels = groundLevels(scale);
  const images: string[] = [];
  const sizes: string[] = [];
  for (const level of levels) {
    const ink = (token: string): string =>
      `color-mix(in oklab, var(${token}) ${(level.opacity * 100).toFixed(2)}%, transparent)`;
    const radius = level.dotSizePx / 2;
    const tile = `${level.screenPitch}px ${level.screenPitch}px`;
    images.push(
      `radial-gradient(circle at 0 0, ${ink("--canvas-rule-dot")} ${radius}px, transparent ${radius + 0.5}px)`,
      `linear-gradient(to right, ${ink("--canvas-rule-line")} 0 ${level.lineWidthPx}px, transparent ${level.lineWidthPx}px)`,
      `linear-gradient(to bottom, ${ink("--canvas-rule-line")} 0 ${level.lineWidthPx}px, transparent ${level.lineWidthPx}px)`,
    );
    sizes.push(tile, tile, tile);
  }
  return {
    backgroundImage: images.join(", "),
    backgroundSize: sizes.join(", "),
    pitchPx: levels.at(-1)?.screenPitch ?? GROUND_BASE,
  };
}

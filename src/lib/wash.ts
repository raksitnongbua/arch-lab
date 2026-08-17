/**
 * The node surface wash — ONE recipe, three consumers. A soft top-light
 * gradient that folds a node's own border colour into its fill: deepest at
 * the top edge, flat through the band the text sits on, returning faintly at
 * the bottom (the design argument lives with `.af-node-wash` in
 * `globals.css`). It is painted three ways that must never drift apart:
 *
 *   1. `.af-node-wash` in `globals.css` — CSS cannot import these constants,
 *      so its percentages are genuinely duplicated and
 *      `check:flowchart-palette` pins each stop to the values here;
 *   2. `<WashGradient>` (`components/ui/wash-gradient.tsx`) — the same stops
 *      as a per-instance SVG gradient, for on-screen SVG shapes a CSS
 *      background cannot follow;
 *   3. `WashRegistry` below — the exporters' concrete-sRGB rendition, because
 *      a downloaded file can carry neither `var()` nor `color-mix()`.
 *
 * Lived in `viewer/export/render-svg.ts` until the flowchart exporter needed
 * the identical registry; per the shared-code rule it moved here rather than
 * growing a second copy one feature away.
 *
 * Pure and erasable (no DOM, no React) so the check scripts can load it
 * through Node's type stripping.
 */

/**
 * How much border colour the wash folds into a fill (= CSS .af-node-wash):
 * the lit top edge, and the shallow grounding fold at the bottom. Kept as a
 * pair so a future retune stays one edit next to the stops it feeds.
 */
export const WASH_STROKE_FRACTION = 0.14;
export const WASH_BOTTOM_FRACTION = 0.07;

/**
 * Where the gradient returns to the flat fill (top of the text band) and
 * where the grounding fold begins — offsets along the node's height, 0..1.
 */
export const WASH_MID_OFFSET = 0.55;
export const WASH_LOW_OFFSET = 0.82;

/** Parse the exporter's concrete colours: `#rrggbb` or `rgba(r, g, b, a)`. */
function parseSrgb(color: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (hex !== null) {
    const value = parseInt(hex[1], 16);
    return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
  }
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(color.trim());
  if (rgba !== null) {
    return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])];
  }
  return null;
}

/**
 * A wash stop's colour: `fraction` of the stroke folded into the fill. On
 * screen this is `color-mix(in oklab, …)`; here it is a plain sRGB lerp
 * because this module is deliberately DOM-free (see resolveTagPaint's
 * counter-case: THERE the browser must do the work, because an author mix is
 * 100% of the fill — a wrong space would visibly recolour the card. At a 14%
 * fold the two spaces differ by well under one 8-bit channel step, so
 * duplicating the browser's oklab pipeline would buy nothing and cost the
 * module its DOM-freeness). Falls back to the flat fill when a colour fails
 * to parse.
 */
export function washMixColor(
  fill: string,
  stroke: string,
  fraction: number,
): string {
  const f = parseSrgb(fill);
  const s = parseSrgb(stroke);
  if (f === null || s === null) return fill;
  const mix = (a: number, b: number): number =>
    Math.round(a + (b - a) * fraction);
  const hex = (channel: number): string =>
    channel.toString(16).padStart(2, "0");
  return `#${hex(mix(f[0], s[0]))}${hex(mix(f[1], s[1]))}${hex(mix(f[2], s[2]))}`;
}

/** The wash's deepest (top-edge) stop — also the flat paint for rim/tabs. */
export function washTopColor(fill: string, stroke: string): string {
  return washMixColor(fill, stroke, WASH_STROKE_FRACTION);
}

/**
 * One wash gradient per DISTINCT paint pair (not per node — parallel
 * containers share one def), collected while nodes render and emitted into
 * `<defs>`. `objectBoundingBox` units (the SVG default) make a single def
 * correct for every node that references it, wherever it sits.
 */
export class WashRegistry {
  private readonly idByKey = new Map<string, string>();
  private readonly defs: string[] = [];

  /** The `url(#…)` fill reference for this paint pair. */
  ref(fill: string, stroke: string): string {
    const key = `${fill}|${stroke}`;
    const existing = this.idByKey.get(key);
    if (existing !== undefined) return `url(#${existing})`;
    const id = `af-wash-${this.idByKey.size}`;
    this.idByKey.set(key, id);
    // Four stops, mirroring `.af-node-wash` exactly: lit 14% top edge, the
    // flat middle band the text sits on, and the 7% grounding bottom.
    this.defs.push(
      `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0" stop-color="${washTopColor(fill, stroke)}"/>` +
        `<stop offset="${WASH_MID_OFFSET}" stop-color="${fill}"/>` +
        `<stop offset="${WASH_LOW_OFFSET}" stop-color="${fill}"/>` +
        `<stop offset="1" stop-color="${washMixColor(fill, stroke, WASH_BOTTOM_FRACTION)}"/>` +
        `</linearGradient>`,
    );
    return `url(#${id})`;
  }

  markup(): string {
    return this.defs.join("");
  }
}

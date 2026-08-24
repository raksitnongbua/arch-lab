/**
 * Shared oklch → WCAG colour maths for the check scripts. One definition,
 * imported by `theme-check.mjs` and `flowchart-palette-check.mjs`: both
 * measure the same palette tokens, and two copies of the conversion would
 * let one check bless what the other rejects. theme-check validates this
 * maths against the two figures globals.css records, so a drift here fails
 * loudly there.
 */

/**
 * oklch -> LINEAR sRGB. Clamped to [0,1] per channel, which is exactly what
 * a browser does with a slightly out-of-gamut token.
 */
export function oklchToLinear(L, C, h) {
  const rad = (h * Math.PI) / 180;
  const a = C * Math.cos(rad);
  const b = C * Math.sin(rad);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.min(1, Math.max(0, v)));
}

/* Input is already linear, so no gamma decode — decoding twice once
 * reported 1.45:1 where the palette measures 3.61:1 (theme-check header). */
export const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** WCAG contrast ratio between two linear-sRGB triples. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * A token as linear sRGB, plus its alpha.
 *
 * ALPHA IS NOT IGNORED, and that is the whole reason this returns a pair. The
 * `glass` theme's surfaces are translucent — `oklch(1 0 0 / 0.55)` — so what a
 * reader sees is the surface composited over whatever is behind it. Measuring
 * the token alone would report the contrast of a card that does not exist, and
 * would flatter every translucent palette ever added here.
 */
export const parseOklch = (value) => {
  const m =
    /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?/.exec(
      value ?? "",
    );
  if (m === null) return null;
  return {
    rgb: oklchToLinear(+m[1], +m[2], +m[3]),
    alpha: m[4] === undefined ? 1 : +m[4],
    oklch: [+m[1], +m[2], +m[3]],
  };
};

/** `over` composited under `colour`, in linear light. */
export const flatten = (colour, over) =>
  colour.alpha >= 1
    ? colour.rgb
    : colour.rgb.map(
        (c, i) => c * colour.alpha + over.rgb[i] * (1 - colour.alpha),
      );

/**
 * OKLab distance between two oklch triples — the perceptual "are these two
 * colours the same colour?" metric (Ottosson's OKLab, where a just-noticeable
 * difference is on the order of 0.002 and the axes are ~uniform).
 */
export function oklchDeltaE([L1, C1, h1], [L2, C2, h2]) {
  const lab = (L, C, h) => [
    L,
    C * Math.cos((h * Math.PI) / 180),
    C * Math.sin((h * Math.PI) / 180),
  ];
  const a = lab(L1, C1, h1);
  const b = lab(L2, C2, h2);
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

const gammaEncode = (c) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
const gammaDecode = (c) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

/**
 * `#rrggbb` -> `{ rgb, oklch }` (linear sRGB triple + [L, C, h]), the inverse
 * direction of `oklchToLinear` (Ottosson's matrices both ways). Needed by
 * `canvas-edit-check.mjs`, which has to REBUILD what the browser does with a
 * `tagColors` hex — `oklch(from <hex> var(--tag-fill-l) min(c, var(--tag-fill-c)) h)`
 * — before it can measure the result; nothing else in the suite starts from a
 * hex. `null` for anything that is not six hex digits, which is also this
 * suite's answer to shorthand: the app's palette and the serializer only ever
 * carry the long form.
 */
export function parseHex(value) {
  const m = /^#([0-9a-f]{6})$/i.exec(value ?? "");
  if (m === null) return null;
  const rgb = [0, 2, 4].map((i) =>
    gammaDecode(parseInt(m[1].slice(i, i + 2), 16) / 255),
  );
  const [r, g, b] = rgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m_ - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m_ + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m_ - 0.808675766 * s;
  let h = (Math.atan2(bb, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { rgb, oklch: [L, Math.hypot(a, bb), h] };
}

/**
 * The wash's deepest stop in linear sRGB: `fraction` of the stroke folded
 * into the fill. Lerped on GAMMA-ENCODED channels because that is precisely
 * what the exporter ships (`lib/wash.ts` mixes 8-bit sRGB bytes); measuring
 * the same recipe the file carries keeps this the worst case the reader can
 * actually receive.
 */
export function washMixLinear(fillLinear, strokeLinear, fraction) {
  return fillLinear.map((c, i) =>
    gammaDecode(
      gammaEncode(c) +
        (gammaEncode(strokeLinear[i]) - gammaEncode(c)) * fraction,
    ),
  );
}

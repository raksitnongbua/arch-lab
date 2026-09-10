/**
 * The author's `tagcolor` as a concrete fill and stroke, computed rather than
 * asked of a browser.
 *
 * ON SCREEN the fill is a relative-colour expression the browser evaluates —
 * `oklch(from <tag> var(--tag-fill-l) min(c, var(--tag-fill-c)) h)`, the
 * recipe `editor/lib/node-colors.ts: tagFillCss` owns and argues for. The
 * export path used to get its concrete answer by painting that expression onto
 * a canvas and reading the pixel back, which is exact and needs a document.
 * `/api/render` has none, so a server-drawn diagram dropped every author
 * colour and fell back to the role palette.
 *
 * ═══ WHY THIS DOES NOT REPLACE THE BROWSER PATH ═══
 *
 * `resolveTagPaint` in `viewer/export/theme.ts` is unchanged and still the
 * only thing the canvas and the download use. That is deliberate, and the
 * reason is in the grammar: `tagcolor` reads an arbitrary quoted string with
 * no validation (`archtext/lib/parse.ts`), so an author may legitimately write
 * `rebeccapurple` or `rgb(1 2 3)` — and a browser renders all of it. Unifying
 * on the arithmetic here would have quietly regressed those documents on the
 * screen to buy the server a colour it can degrade from safely.
 *
 * So this handles what it can prove — anything `normalizeTint` canonicalises
 * to `#rrggbb`, which covers hex, short hex, `rgb()` and the named tints the
 * product's own pickers write — and hands back the theme's undifferentiated
 * pair for anything else. A server-drawn diagram therefore shows author
 * colours for every document the app itself can produce, and the plain role
 * palette for the exotic remainder, which is the same direction every other
 * degradation in the render path takes.
 *
 * The arithmetic is pinned to `scripts/lib/oklch.mjs` — the implementation
 * `check:themes` and `check:canvas-edit` measure the palette with — by
 * `check:tag-paint`, so the two cannot drift.
 */

import { normalizeTint } from "./tint";

/** The theme's two pins for a constructed tag fill. */
export interface TagFillPins {
  /** `--tag-fill-l`: the lightness every tag fill lands on. */
  lightness: number;
  /** `--tag-fill-c`: the chroma ceiling, so a vivid tag cannot outshout. */
  chromaCap: number;
}

export interface TagPaint {
  fill: string;
  stroke: string;
}

const gammaEncode = (channel: number): number =>
  channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;

const gammaDecode = (channel: number): number =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

/** `#rrggbb` → oklch `[L, C, h]`. Ottosson's matrices, the inverse direction
 * of {@link oklchToSrgb}. */
function hexToOklch(hex: string): [number, number, number] {
  const [r, g, b] = [0, 2, 4].map((i) =>
    gammaDecode(Number.parseInt(hex.slice(i + 1, i + 3), 16) / 255),
  ) as [number, number, number];

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  let hue = (Math.atan2(bb, a) * 180) / Math.PI;
  if (hue < 0) hue += 360;
  return [lightness, Math.hypot(a, bb), hue];
}

/**
 * oklch → `#rrggbb`, clamped per channel.
 *
 * Clamping is what a browser does with a slightly out-of-gamut token, and the
 * chroma cap above means the inputs here sit well inside sRGB anyway.
 */
function oklchToSrgb(L: number, C: number, h: number): string {
  const rad = (h * Math.PI) / 180;
  const a = C * Math.cos(rad);
  const b = C * Math.sin(rad);

  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const channels = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((channel) => {
    const encoded = gammaEncode(Math.min(1, Math.max(0, channel)));
    return Math.round(Math.min(1, Math.max(0, encoded)) * 255)
      .toString(16)
      .padStart(2, "0");
  });

  return `#${channels.join("")}`;
}

/**
 * The fill and stroke for one `tagcolor` value.
 *
 * The STROKE is the author's colour itself — canonicalised, never
 * reconstructed, because that is what the on-screen border is. The FILL is
 * the author's hue at the theme's pinned lightness and capped chroma, which
 * is what keeps a tag fill legible under a palette the author never saw.
 *
 * Returns `fallback` whole when the colour is not one this can canonicalise:
 * a half-answer — the author's stroke around a role-palette fill — would look
 * like a rendering bug rather than a degradation.
 */
export function tagPaint(
  tagColor: string,
  pins: TagFillPins,
  fallback: TagPaint,
): TagPaint {
  const canonical = normalizeTint(tagColor);
  if (canonical === null) return fallback;

  const [, chroma, hue] = hexToOklch(canonical);
  return {
    fill: oklchToSrgb(pins.lightness, Math.min(chroma, pins.chromaCap), hue),
    stroke: canonical,
  };
}

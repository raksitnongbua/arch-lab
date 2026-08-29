/**
 * The free colour option's safety construction: any hex an author picks is
 * bent — as little as possible, never silently — into a colour that stays
 * legible on EVERY theme, before it is ever written into the file.
 *
 * WHY THIS EXISTS. `NODE_TAG_PALETTE`'s header refuses a free picker because
 * the raw hex paints the node's BORDER, and unlike the fill (whose lightness
 * `tagFillCss` pins per theme) nothing constructs the border: a picker that
 * writes the hex verbatim can hand an author a stroke that vanishes against a
 * theme they are not looking at. The product owner asked for the free picker
 * anyway, so the reason moves here: the picker ships, and this module is what
 * keeps the invisible-node outcome impossible. The decision, of the three
 * that were on the table, is CLAMP RATHER THAN WARN OR PREVIEW-ONLY — a
 * warning must be read and can be ignored, a per-theme preview asks the
 * author to audit eight themes by eye, but a construction cannot be skipped.
 * The trade (the exact hex may shift) is disclosed in the form the moment it
 * happens, and the author's HUE — the part of a colour choice that carries
 * its identity — is never changed.
 *
 * HOW. The contrast bar is the palette's own, measured by `check:canvas-edit`
 * the same way it measures the five built-ins: the stroke must hold >=3:1
 * against the constructed tag fill on every theme (the node title's >=7:1 on
 * that fill holds for every hue by construction — the fill's lightness and
 * chroma cap are theme tokens — and the check sweeps it anyway). A single
 * safe lightness for all hues does not exist: the sweep that sized this found
 * near-magenta needing L >= ~0.61 on the dark themes while near-cyan needs
 * L <= ~0.58 on the light ones. So the clamp solves PER HUE: keep the
 * author's hue, cap chroma at the palette band's top, and move lightness the
 * shortest distance into the interval where every theme passes — which the
 * sweep found non-empty for every hue at every chroma up to the cap.
 *
 * THE THEME NUMBERS ARE A DELIBERATE TWIN of `--tag-fill-l` / `--tag-fill-c`
 * in `globals.css` (CSS cannot be imported), and of the oklch maths in
 * `scripts/lib/oklch.mjs` (the check suite cannot be imported by app code).
 * Both pairs are pinned by `check:canvas-edit`: the fill table against the
 * parsed stylesheet, the conversions against the check suite's own on a
 * colour grid. Change any of the four in step or that check fails.
 */

import { THEMES, type Theme } from "@/lib/constants";

/**
 * Each theme's `--tag-fill-l` / `--tag-fill-c` — the two tokens `tagFillCss`
 * builds the on-screen fill from. Values are the stylesheet's, verbatim;
 * `check:canvas-edit` fails if either side moves alone. Typed over `Theme` so
 * an eighth theme fails to compile here until it declares its fill band.
 */
export const TAG_FILL_BY_THEME: Record<Theme, { l: number; c: number }> = {
  light: { l: 0.93, c: 0.055 },
  paper: { l: 0.93, c: 0.055 },
  pastel: { l: 0.93, c: 0.055 },
  glass: { l: 0.93, c: 0.055 },
  dark: { l: 0.33, c: 0.06 },
  midnight: { l: 0.275, c: 0.06 },
  contrast: { l: 0.2, c: 0.06 },
  blueprint: { l: 0.33, c: 0.06 },
  /* The LIGHT family's own pin, taken verbatim. `eink` is a greyscale palette
     but this entry is not about the theme's colours — it is the band an
     AUTHOR'S `tagColors` fill is rebuilt at, and every entry here narrows one
     interval shared by all nine themes. Reusing a pin four themes already hold
     narrows it by nothing; inventing a greyscale one would repeat blueprint's
     regression, where a new band closed the interval for the greens and the
     free picker started refusing `#00ff88`. */
  eink: { l: 0.93, c: 0.055 },
};

/**
 * The stroke bar every offered colour meets on every theme — WCAG 3:1, the
 * non-text minimum, the same figure the palette swatches are measured
 * against. `KEEP` is the shipped bar; `TARGET` adds headroom so a colour
 * constructed at the bar survives the 8-bit hex quantisation that follows —
 * and the gap between them is what makes the clamp IDEMPOTENT: everything
 * this module emits passes `KEEP`, so feeding an output back in returns it
 * byte-identical instead of chasing the bar again.
 */
const KEEP_BAR = 3;
const TARGET_BAR = 3.12;

/**
 * Chroma cap for an ADJUSTED colour — the top of the band the curated
 * palette sits in (its header records the L≈0.61, C 0.11–0.17 sweep). A hex
 * that already passes every theme is kept verbatim, cap and all; the cap
 * applies only once lightness has to move, because at extreme chroma the
 * passing lightness interval thins toward nothing.
 */
const ADJUSTED_CHROMA_CAP = 0.17;

/** Lightness scan resolution. One 8-bit channel step is ~0.002 in oklch L,
 *  so half that: the scan cannot miss an interval quantisation can hit. */
const L_STEP = 0.0025;

/* -------------------------------------------------------------------------- */
/* oklch <-> sRGB — Ottosson's matrices, the same ones scripts/lib/oklch.mjs   */
/* carries (pinned against it by check:canvas-edit, see the file header)       */
/* -------------------------------------------------------------------------- */

const gammaEncode = (c: number): number =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
const gammaDecode = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

/** oklch -> linear sRGB, clamped per channel exactly as a browser clamps a
 *  slightly out-of-gamut value. */
export function oklchToLinearRgb(
  L: number,
  C: number,
  h: number,
): [number, number, number] {
  const rad = (h * Math.PI) / 180;
  const a = C * Math.cos(rad);
  const b = C * Math.sin(rad);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.min(1, Math.max(0, v)));
  return [rgb[0], rgb[1], rgb[2]];
}

/** `#rrggbb` -> linear sRGB + [L, C, h]. Callers hand it the LONG form only;
 *  `presentableTagColor` owns expanding shorthand before anything converts. */
export function hexToOklch(hex: string): {
  rgb: [number, number, number];
  oklch: [number, number, number];
} | null {
  const m = /^#([0-9a-f]{6})$/.exec(hex);
  if (m === null) return null;
  const [r, g, b] = [0, 2, 4].map((i) =>
    gammaDecode(Number.parseInt(m[1].slice(i, i + 2), 16) / 255),
  );
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m_ - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m_ + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m_ - 0.808675766 * s;
  let h = (Math.atan2(bb, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { rgb: [r, g, b], oklch: [L, Math.hypot(a, bb), h] };
}

/** oklch -> `#rrggbb`, gamut-clamped then gamma-encoded to 8-bit. */
export function oklchToHex(L: number, C: number, h: number): string {
  return `#${oklchToLinearRgb(L, C, h)
    .map((c) =>
      Math.round(gammaEncode(c) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

const luminance = ([r, g, b]: [number, number, number]): number =>
  0.2126 * r + 0.7152 * g + 0.0722 * b;

/** WCAG contrast between two linear-sRGB triples. */
export function wcagContrast(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/* -------------------------------------------------------------------------- */
/* The clamp                                                                   */
/* -------------------------------------------------------------------------- */

/** The stroke's worst contrast across every theme's constructed fill —
 *  `oklch(from <hex> tag-fill-l min(c, tag-fill-c) h)`, rebuilt here exactly
 *  as the browser (and the check's audit loop) builds it. */
function worstStrokeContrast(
  strokeRgb: [number, number, number],
  C: number,
  h: number,
): number {
  let worst = Number.POSITIVE_INFINITY;
  for (const theme of THEMES) {
    const fill = TAG_FILL_BY_THEME[theme];
    const ratio = wcagContrast(
      strokeRgb,
      oklchToLinearRgb(fill.l, Math.min(C, fill.c), h),
    );
    if (ratio < worst) worst = ratio;
  }
  return worst;
}

/**
 * An author's colour input, made presentable, or `null` when it is not a hex
 * colour at all. Accepts `#rgb` and `#rrggbb` in either case; always returns
 * lowercase long form, because that is the only spelling the serializer and
 * the audit machinery carry.
 *
 * `adjusted: false` means the hex is returned VERBATIM — it already holds the
 * bar on every theme, so the author gets exactly the colour they typed.
 * `adjusted: true` means lightness moved (and chroma was capped) to the
 * nearest point where every theme passes; the hue never moves. The form
 * discloses the adjustment; nothing downstream needs to care which case it
 * was.
 */
export function presentableTagColor(
  input: string,
): { hex: string; adjusted: boolean } | null {
  const trimmed = input.trim().toLowerCase();
  const long = /^#[0-9a-f]{6}$/.test(trimmed)
    ? trimmed
    : /^#[0-9a-f]{3}$/.test(trimmed)
      ? `#${[...trimmed.slice(1)].map((d) => d + d).join("")}`
      : null;
  if (long === null) return null;
  const parsed = hexToOklch(long);
  if (parsed === null) return null;
  const [L, C, h] = parsed.oklch;

  if (worstStrokeContrast(parsed.rgb, C, h) >= KEEP_BAR) {
    return { hex: long, adjusted: false };
  }

  /* Chroma descends only if the capped level leaves no passing lightness —
     the sweep found none such down to C=0, where the interval is widest, so
     the loop terminates with an answer rather than a fallback colour. */
  for (
    let c = Math.min(C, ADJUSTED_CHROMA_CAP);
    c >= 0;
    c = c < 0.02 ? -1 : c * 0.85
  ) {
    /* The passing lightness interval nearest the author's own L. Scanned
       rather than solved in closed form: the constraint set (dark fills push
       L up, light fills push it down) makes one interval in practice, and a
       scan at half-quantisation resolution cannot be argued with. */
    let lo = -1;
    let hi = -1;
    for (let l = 0; l <= 1; l += L_STEP) {
      const passes =
        worstStrokeContrast(oklchToLinearRgb(l, c, h), c, h) >= TARGET_BAR;
      if (passes && lo === -1) lo = l;
      if (passes) hi = l;
      // Past the interval and below the author's L there is nothing nearer.
      if (!passes && hi !== -1 && l > L) break;
    }
    if (lo === -1) continue;
    const clamped = Math.min(Math.max(L, lo), hi);
    const hex = oklchToHex(clamped, c, h);
    /* Verify the QUANTISED colour, not the ideal one: rounding to 8-bit can
       shave the margin, and what ships is the hex. TARGET_BAR's headroom over
       KEEP_BAR is sized so this passes; the guard is here for the day a
       band constant moves. */
    const quantised = hexToOklch(hex);
    if (
      quantised !== null &&
      worstStrokeContrast(quantised.rgb, c, h) >= KEEP_BAR
    ) {
      return { hex, adjusted: true };
    }
  }
  /* Unreachable while the theme table holds a passing interval at C=0 for
     every hue (the check sweeps exactly this); typed rather than thrown so a
     regression degrades to "no custom colour" instead of a crashed form. */
  return null;
}

/**
 * The tag a free colour is stored under: `c-<its own hex digits>` — derived
 * from the colour so the SAME pick on a second element lands on the SAME tag,
 * and `revisedNodeEdit` then joins the existing `tagcolor` line instead of
 * minting a twin. Ten elements in one custom colour cost the header one line,
 * the same economy the named palette has; the name never collides with an
 * author's own vocabulary unless they authored this exact spelling — and if
 * they did, wearing a colour to a DIFFERENT hex, the suffix walk below steps
 * aside rather than silently painting their colour: the module never rewrites
 * an existing `tagcolor` line, so reusing the name would apply their hex, not
 * the picked one.
 *
 * `hex` must be `presentableTagColor`'s output — the tag names the colour
 * that ships, not the colour that was typed.
 */
export function freeColorTag(
  hex: string,
  tagColors: Readonly<Record<string, string>> | undefined,
): string {
  const base = `c-${hex.slice(1)}`;
  let candidate = base;
  for (let n = 2; ; n += 1) {
    const existing = tagColors?.[candidate] ?? "";
    if (existing === "" || existing.toLowerCase() === hex) return candidate;
    candidate = `${base}-${n}`;
  }
}

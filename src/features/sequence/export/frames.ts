/**
 * The frames of the animated GIF: the diagram's own idle motion, as a loop.
 *
 * WHAT IT SHOWS. Exactly what the viewer shows at rest — a travelling highlight
 * riding each call, replies marching their dash — going round once. The whole
 * diagram is present in every frame; nothing is revealed or hidden. This is a
 * loop of the living diagram, not a walkthrough of it.
 *
 * IT DOES NOT RECORD THE SCREEN. The on-screen motion is CSS, and capturing it
 * would mean sampling the compositor at a frame rate we do not control, on a tab
 * that may be throttled or scrolled away. Each frame is SYNTHESISED instead, by
 * setting every animated dash to the offset it would hold at that phase. The
 * output is therefore deterministic — the same document produces the same GIF on
 * any machine, whether or not the tab was visible — which a recording could
 * never promise.
 *
 * WHY THE CLOCKS ARE NOT THE APP'S. On screen the comet takes 4200ms per
 * traversal and a reply's dash 2750ms per period, and those two do not divide
 * into each other: over any finite window one of them is caught mid-cycle. That
 * is fine for motion that never stops and fatal for a LOOP, where the last frame
 * must hand back to the first without a jump. So the export picks its own
 * window and fits WHOLE cycles of both into it — one comet traversal and a
 * round number of dash periods. The result loops seamlessly at the cost of the
 * reply marching a little faster than it does on screen, which is the right
 * trade: nobody compares a GIF to the page side by side, and everybody sees a
 * stutter at the loop point.
 */

import { GIF_SMOOTHNESS, rasterise, type GifSmoothness } from "@/lib/gif";

import { renderSequenceSvg } from "./render-svg";

/**
 * Target WIDTH IN PIXELS per sharpness. A sequence diagram's own width varies
 * with participant count, so the export renders to a fixed width and lets the
 * height follow — unlike the C4 exporter's `C4_SHARPNESS`, which multiplies the
 * diagram's natural size. Same three names, different unit.
 */
export const GIF_SHARPNESS = {
  standard: 720,
  sharp: 1080,
  compact: 540,
} as const;

export type GifSharpness = keyof typeof GIF_SHARPNESS;

/**
 * Re-exported so this module stays the one place the sequence exporter and
 * `scripts/sequence-gif-check.mjs` read its GIF settings from; the presets
 * themselves are shared with the C4 exporter in `@/lib/gif`.
 */
export { GIF_SMOOTHNESS };
export type { GifSmoothness };

export interface GifQuality {
  sharpness: GifSharpness;
  smoothness: GifSmoothness;
}

export const DEFAULT_GIF_QUALITY: GifQuality = {
  sharpness: "standard",
  smoothness: "standard",
};

/**
 * Dash periods a reply completes per loop. An INTEGER, which is the whole point:
 * a fractional count leaves the dash mid-stride when the loop wraps.
 */
const REPLY_PERIODS = 4;

/** The reply dash's period in user units — `6 + 5`, matching the stylesheet. */
const REPLY_PERIOD = 11;

/**
 * The comet bands and their dash lengths, from sequence-motion.css. Each band
 * starts its cycle at its own dash length and travels one whole path (100
 * units, because the bands carry `pathLength="100"`), which is what keeps the
 * three aligned on one leading edge.
 */
const BANDS: readonly { selector: string; lit: number }[] = [
  { selector: ".af-seq-flow-glow", lit: 30 },
  { selector: ".af-seq-flow-tail", lit: 22 },
  { selector: ".af-seq-flow-head", lit: 9 },
];

export interface SequenceFrames {
  frames: { rgba: Uint8ClampedArray; delayMs: number }[];
  width: number;
  height: number;
}

/**
 * Builds one loop of the diagram's idle motion.
 *
 * Returns null when there is nothing moving to capture — a diagram with no
 * animated line would produce twenty identical frames, and calling that an
 * animation is worse than declining it.
 */
export async function buildSequenceFrames(
  source: SVGSVGElement,
  quality: GifQuality = DEFAULT_GIF_QUALITY,
  /** Called after each frame, so a caller can show progress. */
  onProgress?: (done: number, total: number) => void,
): Promise<SequenceFrames | null> {
  const maxEdge = GIF_SHARPNESS[quality.sharpness];
  const { frames: frameCount, delayMs } = GIF_SMOOTHNESS[quality.smoothness];
  const base = renderSequenceSvg(source, { keepMotion: true });
  if (base === null) return null;

  const scale = Math.min(1, maxEdge / Math.max(base.width, base.height));
  const width = Math.max(1, Math.round(base.width * scale));
  const height = Math.max(1, Math.round(base.height * scale));

  /*
   * Phases are applied to a PARSED copy of the exported SVG, never to the live
   * DOM: mutating the real diagram would flash every intermediate phase on
   * screen while the export ran, and would leave the reader's view altered if
   * anything threw partway through.
   */
  const parser = new DOMParser();
  const probe = parser.parseFromString(base.svg, "image/svg+xml");
  /*
   * A malformed serialisation yields a <parsererror> document rather than
   * throwing, and every `querySelectorAll` on it then returns nothing. Left
   * unchecked that arrives as "no moving parts" — reported to the user as
   * "nothing to animate", which is a lie about a real failure. Say what
   * happened instead.
   */
  if (probe.querySelector("parsererror") !== null) {
    throw new Error(
      "the diagram could not be re-parsed for export (malformed SVG)",
    );
  }
  const movingParts =
    probe.documentElement.querySelectorAll(".af-seq-flow-head").length +
    probe.documentElement.querySelectorAll('[data-kind="reply"] .af-seq-line')
      .length;
  if (movingParts === 0) return null;

  const frames: { rgba: Uint8ClampedArray; delayMs: number }[] = [];

  for (let index = 0; index < frameCount; index += 1) {
    // `t` never reaches 1: frame 0 and frame `frameCount` would be identical,
    // so the loop would hold one phase twice and read as a hitch.
    const t = index / frameCount;
    const document_ = parser.parseFromString(base.svg, "image/svg+xml");
    const root = document_.documentElement;

    // The comet: one full traversal per loop. Offsets count DOWN, which walks
    // the band along the path's own direction — source to target.
    for (const band of BANDS) {
      for (const node of root.querySelectorAll(band.selector)) {
        setStyle(node, "stroke-dashoffset", `${band.lit - 100 * t}`);
      }
    }

    // The reply dash: whole periods per loop, so the wrap is invisible.
    const replyOffset = REPLY_PERIOD * (1 - ((t * REPLY_PERIODS) % 1));
    for (const node of root.querySelectorAll(
      '[data-kind="reply"] .af-seq-line',
    )) {
      setStyle(node, "stroke-dashoffset", `${replyOffset}`);
    }

    frames.push({
      rgba: await rasterise(
        new XMLSerializer().serializeToString(root),
        width,
        height,
      ),
      delayMs,
    });
    onProgress?.(index + 1, frameCount);
    /*
     * Yield to the browser between frames. Rasterising is synchronous work per
     * frame, and twenty of them back to back never lets a paint through — the
     * tab looks frozen and any progress the caller reports is invisible until
     * the whole export is done, which is worse than no progress at all.
     */
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  return { frames, width, height };
}

/** Appends one declaration, keeping the inlined computed styles intact. */
function setStyle(node: Element, property: string, value: string): void {
  const existing = node.getAttribute("style");
  node.setAttribute(
    "style",
    existing === null || existing === ""
      ? `${property}:${value}`
      : `${existing};${property}:${value}`,
  );
}

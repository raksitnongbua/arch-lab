/**
 * The frames of an animated C4 export: the connectors drifting, as a loop.
 *
 * WHAT IT SHOWS. What the canvas shows at rest — every connector carrying a
 * marching dash, so direction reads without hunting for the arrowhead. That is
 * the one thing a still of a C4 diagram cannot say, and it is the reason this
 * export exists rather than being a slideshow of the four levels.
 *
 * WHY IT ANIMATES A STRING. The sequence viewer is one SVG element, so its GIF
 * clones the live node. A C4 diagram is React Flow: HTML nodes positioned by
 * transforms with SVG edges between them, and there is no single element to
 * clone. Its still export already solves that by rendering SVG from the MODEL
 * (`render-svg.ts`), so the animation starts from the same string and gives each
 * frame its own dash offset. One renderer, two outputs — the still and the loop
 * can never disagree about what the diagram looks like.
 *
 * The dash pattern and period are the canvas's own (`viewer-canvas.tsx`), so the
 * exported loop marches exactly like the page.
 */

import { encodeGif, type GifFrame } from "./gif";

const SVG_NS = "http://www.w3.org/2000/svg";

/** A path's own dash period, so the march steps by exactly one of them. */
function dashPeriodOf(edge: Element): number | null {
  const raw = edge.getAttribute("stroke-dasharray");
  if (raw === null) return null;
  const parts = raw
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
  if (parts.length === 0) return null;
  const sum = parts.reduce((a, b) => a + b, 0);
  // An odd-length list repeats to become even ("6" is "6 6"), so its true
  // period is twice the written sum.
  return parts.length % 2 === 0 ? sum : sum * 2;
}
import type { RenderedSvg } from "./render-svg";

/**
 * The resting comet's three bands, mirroring viewer-canvas.tsx exactly: each
 * starts its cycle at its own dash length and travels one whole path (100
 * units, from pathLength), which is what keeps the three sharing a single
 * leading edge instead of chasing each other.
 *
 * The comet is an OVERLAY, exactly as it is on screen, and the distinction is
 * not cosmetic. Stamping a dash pattern onto the connector itself — which is
 * what this did first — draws every SOLID relationship as a dashed line, and
 * dashed means ASYNCHRONOUS in C4. The GIF was reporting synchronous calls as
 * asynchronous ones: a diagram that says something untrue about the system,
 * which is worse than a diagram that does not move.
 */
const REST_BANDS = [
  { lit: 26, width: 5, opacity: 0.18, tone: "primary" },
  { lit: 18, width: 1.5, opacity: 0.5, tone: "drift" },
  { lit: 7, width: 1.5, opacity: 0.95, tone: "primary" },
] as const;

/** The async dash's fallback period, when a path declares none. */
const DASH_PERIOD = 10;

export const C4_SHARPNESS = { compact: 1, standard: 1.5, sharp: 2 } as const;

/** Frames per loop, and the delay that keeps every preset ~1.4s long. */
export const C4_SMOOTHNESS = {
  simple: { frames: 12, delayMs: 120 },
  standard: { frames: 20, delayMs: 70 },
  smooth: { frames: 30, delayMs: 50 },
} as const;

export type C4Sharpness = keyof typeof C4_SHARPNESS;
export type C4Smoothness = keyof typeof C4_SMOOTHNESS;

export interface C4GifQuality {
  sharpness: C4Sharpness;
  smoothness: C4Smoothness;
}

export const DEFAULT_C4_GIF_QUALITY: C4GifQuality = {
  sharpness: "standard",
  smoothness: "standard",
};

/** A guard on total work, so a huge model cannot ask for a gigapixel encode. */
const MAX_FRAME_PIXELS = 1_600_000;

async function rasterise(
  svg: string,
  width: number,
  height: number,
): Promise<Uint8ClampedArray> {
  const url = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    const image = new Image();
    image.decoding = "sync";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("A frame's SVG could not be decoded as an image."));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (context === null) {
      throw new Error("Could not create a 2D canvas context for the GIF.");
    }
    context.drawImage(image, 0, 0, width, height);
    return context.getImageData(0, 0, width, height).data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Encodes one loop of the diagram's drifting connectors.
 *
 * Returns null when the diagram has no connectors: every frame would be
 * identical, and a GIF of a still is worse than declining to make one.
 */
export async function renderDiagramGif(
  rendered: RenderedSvg,
  quality: C4GifQuality = DEFAULT_C4_GIF_QUALITY,
  onProgress?: (done: number, total: number) => void,
  /** The canvas's own `--edge-drift`, already resolved (see theme.ts). */
  driftColor: string = "currentColor",
  /** The canvas's own `--primary`, already resolved (see theme.ts). */
  primaryColor: string = driftColor,
): Promise<Uint8Array | null> {
  const { frames: frameCount, delayMs } = C4_SMOOTHNESS[quality.smoothness];

  const requested = C4_SHARPNESS[quality.sharpness];
  const area = rendered.width * rendered.height * requested * requested;
  const scale =
    area > MAX_FRAME_PIXELS
      ? requested * Math.sqrt(MAX_FRAME_PIXELS / area)
      : requested;
  const width = Math.max(1, Math.round(rendered.width * scale));
  const height = Math.max(1, Math.round(rendered.height * scale));

  const parser = new DOMParser();
  const probe = parser.parseFromString(rendered.svg, "image/svg+xml");
  if (probe.querySelector("parsererror") !== null) {
    throw new Error("the rendered diagram is not valid SVG");
  }
  if (probe.querySelectorAll(".af-export-edge").length === 0) return null;

  const frames: GifFrame[] = [];
  for (let index = 0; index < frameCount; index += 1) {
    // Never reaches 1: the last frame would repeat the first and the loop would
    // hold one phase twice.
    const t = index / frameCount;
    const document_ = parser.parseFromString(rendered.svg, "image/svg+xml");
    const root = document_.documentElement;

    for (const edge of root.querySelectorAll(".af-export-edge")) {
      if (edge.getAttribute("data-style") === "dashed") {
        // Already dashed, and that dash means "asynchronous". March it where
        // it stands: one rhythm on the line, and moving a pattern the edge
        // already owns cannot change what it says.
        const period = dashPeriodOf(edge) ?? DASH_PERIOD;
        edge.setAttribute("stroke-dashoffset", String(period * (1 - t)));
        continue;
      }
      /*
       * Solid: leave the connector alone and lay the comet over it. Each band
       * is inserted AFTER the edge — SVG has no z-index, so a sibling inserted
       * before it would be painted underneath and never seen — and the bands
       * go on in order, halo first and head last, for the same reason.
       *
       * No per-edge stagger here, unlike the canvas. A GIF is a short loop
       * seen end to end, so staggered bands would simply mean most connectors
       * are dark in most frames; on screen the stagger is what stops twenty
       * edges pulsing as one mechanism, but a loop has no "meanwhile".
       */
      const d = edge.getAttribute("d") ?? "";
      let anchor: Element = edge;
      for (const band of REST_BANDS) {
        const path_ = document_.createElementNS(SVG_NS, "path");
        path_.setAttribute("d", d);
        path_.setAttribute("pathLength", "100");
        path_.setAttribute("fill", "none");
        path_.setAttribute(
          "stroke",
          band.tone === "primary" ? primaryColor : driftColor,
        );
        path_.setAttribute("stroke-width", String(band.width));
        path_.setAttribute("stroke-linecap", "round");
        path_.setAttribute("stroke-opacity", String(band.opacity));
        path_.setAttribute("stroke-dasharray", `${band.lit} ${100 - band.lit}`);
        // Counting DOWN from the band's own lit length walks it along the
        // path's own direction — source to target.
        path_.setAttribute("stroke-dashoffset", String(band.lit - 100 * t));
        anchor.after(path_);
        anchor = path_;
      }
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
    // Yield, or the frames run back to back with no paint between them and the
    // tab looks frozen while progress goes unreported.
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  return encodeGif(frames, width, height);
}

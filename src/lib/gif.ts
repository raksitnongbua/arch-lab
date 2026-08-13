/**
 * The parts of GIF export that are the same whatever is being animated.
 *
 * Both exporters — the C4 diagram's drifting connectors and the sequence
 * diagram's running message lines — reached this point independently and ended
 * up with a byte-identical rasteriser and a value-identical set of smoothness
 * presets. This is that overlap, once.
 *
 * SHARPNESS is deliberately NOT here. It is the one axis the two genuinely
 * disagree on: the C4 exporter scales a diagram of unknown size by a multiplier,
 * while the sequence exporter targets a pixel width. Same three names, different
 * units and different meaning — so each keeps its own, named to say which.
 */

/**
 * The two axes a reader can trade off, and why they are separate.
 *
 * SHARPNESS is pixels: how big the image is, and therefore whether small labels
 * survive. SMOOTHNESS is frames per loop: how finely the motion is sampled.
 * They are independent — a big jerky GIF and a small fluid one are both
 * reasonable things to want — so folding them into one "quality" slider would
 * force a choice nobody asked for.
 *
 * Every preset holds the LOOP DURATION at roughly 1.4 seconds, so raising
 * smoothness adds frames without slowing the animation down. Delays are whole
 * multiples of 10ms because GIF stores hundredths of a second and rounds
 * anything else silently.
 */
export const GIF_SMOOTHNESS = {
  simple: { frames: 12, delayMs: 120 },
  standard: { frames: 20, delayMs: 70 },
  smooth: { frames: 30, delayMs: 50 },
} as const;

export type GifSmoothness = keyof typeof GIF_SMOOTHNESS;

/**
 * Draws an SVG string onto a canvas and hands back its raw RGBA pixels — one
 * frame, ready for the quantiser.
 *
 * Goes through a blob URL and an `Image` rather than `svg+xml;base64`: the
 * source is a whole standalone document per frame, and base64 would inflate
 * every one of them by a third for no gain. The SVG is self-contained by
 * construction, so the canvas is never tainted and `getImageData` always
 * succeeds.
 *
 * `decoding = "sync"` and the `onload` await together are what make the frame
 * order deterministic; without them the encoder can reach a frame the browser
 * has not finished decoding.
 */
export async function rasterise(
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

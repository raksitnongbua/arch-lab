/**
 * SVG string → PNG blob, and the file-download plumbing both new exporters
 * share.
 *
 * WHY THIS IS SHARED AND THE OLDER EXPORTERS ARE NOT (yet). The C4, sequence,
 * flowchart and use-case exporters each carry their own copy of this
 * rasterise-and-encode block — four copies of the same twenty lines, which is
 * exactly what `dry.md` calls the expensive kind of duplication. Rather than
 * add a fifth and a sixth, the ER and dictionary exporters share this one.
 * Folding the existing four into it is a worthwhile follow-up and deliberately
 * NOT done here: they are working code with their own check scripts, and
 * rewriting four exporters to land two is how a feature turns into a
 * regression.
 */

import { rasterise } from "@/lib/gif";

export interface RenderedSvg {
  svg: string;
  width: number;
  height: number;
}

/**
 * Rasterises to PNG at `scale`x. 2 is the default because a diagram dropped
 * into a deck or a doc is almost always viewed on a display denser than the
 * one it was exported from, and an image that was sharp on export and soft in
 * the deck is the whole reason to offer a scale at all.
 */
export async function svgToPngBlob(
  rendered: RenderedSvg,
  scale = 2,
): Promise<Blob> {
  const width = Math.round(rendered.width * scale);
  const height = Math.round(rendered.height * scale);
  const pixels = await rasterise(rendered.svg, width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("Could not create a 2D canvas context for the PNG.");
  }
  /* Re-wrapped: the rasteriser's view may sit over a shared buffer, which the
     ImageData constructor's types refuse. */
  context.putImageData(
    new ImageData(new Uint8ClampedArray(pixels), width, height),
    0,
    0,
  );
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) reject(new Error("PNG encoding failed."));
      else resolve(blob);
    }, "image/png");
  });
}

/** Hands the browser a file. Revoked on the next frame — revoking immediately
 * races the download in Safari. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  requestAnimationFrame(() => {
    URL.revokeObjectURL(url);
  });
}

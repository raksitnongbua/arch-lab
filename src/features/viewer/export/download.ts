/**
 * Turning a rendered SVG document into a downloaded file. SVG downloads the
 * text as-is; PNG rasterises OUR OWN standalone SVG through an `Image` and a
 * `<canvas>` at a fixed scale factor — no DOM screenshot, no dependency.
 *
 * The SVG is self-contained by construction (see `render-svg.ts`), so the
 * canvas is never tainted and `toBlob` always succeeds.
 */

import type { RenderedSvg } from "./render-svg";

/** Rasterisation scale for PNG — 2× keeps text crisp on hi-DPI screens. */
export const PNG_SCALE = 2;

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the navigation a tick before revoking.
  window.setTimeout(() => URL.revokeObjectURL(url), 5_000);
}

/** Safe cross-platform file stem from a model title. */
export function fileStem(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "diagram" : slug;
}

export function downloadSvg(rendered: RenderedSvg, filename: string): void {
  triggerDownload(
    new Blob([rendered.svg], { type: "image/svg+xml;charset=utf-8" }),
    filename,
  );
}

export async function downloadPng(
  rendered: RenderedSvg,
  filename: string,
  scale: number = PNG_SCALE,
): Promise<void> {
  const svgUrl = URL.createObjectURL(
    new Blob([rendered.svg], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    const image = new Image();
    image.decoding = "sync";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("The rendered SVG could not be decoded as an image."));
      image.src = svgUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(rendered.width * scale));
    canvas.height = Math.max(1, Math.round(rendered.height * scale));
    const context = canvas.getContext("2d");
    if (context === null) {
      throw new Error("Could not create a 2D canvas context for PNG export.");
    }
    context.scale(scale, scale);
    context.drawImage(image, 0, 0, rendered.width, rendered.height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result === null) reject(new Error("PNG encoding failed."));
        else resolve(result);
      }, "image/png");
    });
    triggerDownload(blob, filename);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

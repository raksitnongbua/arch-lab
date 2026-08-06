/**
 * Turning a rendered SVG document into a downloaded file. SVG downloads the
 * text as-is; PNG rasterises OUR OWN standalone SVG through an `Image` and a
 * `<canvas>` at a fixed scale factor — no DOM screenshot, no dependency.
 *
 * The SVG is self-contained by construction (see `render-svg.ts`), so the
 * canvas is never tainted and `toBlob` always succeeds.
 */

import type { C4Diagram } from "@/types";

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

/**
 * A diagram's path inside a multi-diagram archive:
 * `01-context-shopflow-platform-system-context.svg`.
 *
 * The numeric prefix is what preserves drill order — `unzip -l` and every file
 * manager sort by name, so without it the archive comes out alphabetical and
 * scatters the levels. The level then names the altitude, and the title slug
 * says which diagram, since one model can hold several component views.
 *
 * `used` guards the case the slug alone cannot: two diagrams with the same
 * title. Duplicate names inside a ZIP are legal, but they extract to one file
 * silently overwriting the other — which would drop a diagram from the export
 * with nothing to indicate it happened.
 */
export function archiveEntryName(
  diagram: Pick<C4Diagram, "level" | "title">,
  index: number,
  extension: string,
  used: Set<string>,
): string {
  const base = `${String(index + 1).padStart(2, "0")}-${diagram.level}-${fileStem(diagram.title)}`;
  let name = `${base}.${extension}`;
  let suffix = 2;
  while (used.has(name)) {
    name = `${base}-${suffix}.${extension}`;
    suffix += 1;
  }
  used.add(name);
  return name;
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

/** Hands an already-built archive (or any blob) to the browser. */
export function downloadBlob(blob: Blob, filename: string): void {
  triggerDownload(blob, filename);
}

/**
 * Rasterises to a PNG blob WITHOUT downloading it — the half of `downloadPng`
 * that the multi-diagram export needs, because those bytes go into a zip
 * rather than to the user.
 *
 * Split out rather than duplicated: an export-all that rasterised through its
 * own copy of this would be free to drift from the single-diagram path, and
 * "the PNG in the zip does not match the PNG from the same button" is a bug
 * nobody would think to look for.
 */
export async function renderPngBlob(
  rendered: RenderedSvg,
  scale: number = PNG_SCALE,
): Promise<Blob> {
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

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result === null) reject(new Error("PNG encoding failed."));
        else resolve(result);
      }, "image/png");
    });
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

export async function downloadPng(
  rendered: RenderedSvg,
  filename: string,
  scale: number = PNG_SCALE,
): Promise<void> {
  triggerDownload(await renderPngBlob(rendered, scale), filename);
}

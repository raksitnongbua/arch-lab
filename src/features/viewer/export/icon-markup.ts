/**
 * Inline-SVG markup for the stack icons, for embedding inside an exported
 * diagram. The registry's icons are React components — the hand-authored
 * `currentColor` set and the thesvg brand marks alike (registry.ts header) —
 * so the export path renders each one once into a detached DOM node with the
 * real React renderer and captures its `innerHTML` — no `react-dom/server`
 * import (which Next.js client bundles reject), no duplicated icon paths, and
 * byte-for-byte the same artwork the viewer shows. That capture is what makes
 * export parity hold for brand icons BY CONSTRUCTION: the exported markup is
 * the same string the canvas renders, own colours included, not a second
 * drawing of the logo.
 *
 * Results are memoised per icon slug — sound because every registry icon is
 * theme-independent: monochrome icons take colour from the OUTSIDE (the
 * `<g color>` wrapper below) — the hand-authored set and the three ink-free
 * brand marks alike — and coloured brand marks carry fixed colours of their
 * own.
 * A theme-dependent icon would need this cache keyed by theme and is one
 * reason the registry chooses a single artwork per slug rather than per-theme
 * variants.
 */

import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import type { C4Node } from "@/types";

import { resolveIcon } from "@/features/editor/lib/icons/registry";

const markupBySlug = new Map<string, string>();

/** Renders (once) and returns the raw `<svg …>…</svg>` markup for a node's icon. */
function iconMarkup(node: Pick<C4Node, "icon" | "type">): string {
  const { def } = resolveIcon(node);
  const cached = markupBySlug.get(def.slug);
  if (cached !== undefined) return cached;

  const host = document.createElement("div");
  const root = createRoot(host);
  // flushSync: the markup must exist synchronously, before unmount below.
  // Called from an event handler, never during a React render pass.
  flushSync(() => {
    root.render(createElement(def.Svg));
  });
  const markup = host.innerHTML;
  root.unmount();

  markupBySlug.set(def.slug, markup);
  return markup;
}

/**
 * The node's icon as embeddable SVG: positioned at (x, y), sized `size`.
 * The `<g color>` wrapper resolves the MONOCHROME icons' `currentColor` to
 * the given concrete colour (`color` is inheritable as a presentation
 * attribute) — which is what the three ink-free brand marks want too, since
 * they inherit their fill. A COLOURED brand mark carries explicit fills that
 * never reference `currentColor`, so for it the wrapper is inert and the mark
 * keeps its own colours — exactly as on canvas, and as the registry's
 * no-recolour rule requires. The size injection relies on brand components stripping the
 * upstream `width`/`height` (brand.tsx) — a duplicate attribute would be
 * invalid XML and break PNG rasterisation.
 */
export function embeddedIconSvg(
  node: Pick<C4Node, "icon" | "type">,
  x: number,
  y: number,
  size: number,
  color: string,
): string {
  const markup = iconMarkup(node);
  const positioned = markup.replace(
    /^<svg\s/,
    `<svg x="${x}" y="${y}" width="${size}" height="${size}" `,
  );
  return `<g color="${color}">${positioned}</g>`;
}

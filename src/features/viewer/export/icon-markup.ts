/**
 * Inline-SVG markup for the stack icons, for embedding inside an exported
 * diagram. The registry's icons are React components (hand-authored inline
 * SVG, `currentColor` throughout), so the export path renders each one once
 * into a detached DOM node with the real React renderer and captures its
 * `innerHTML` — no `react-dom/server` import (which Next.js client bundles
 * reject), no duplicated icon paths, and byte-for-byte the same artwork the
 * viewer shows.
 *
 * Results are memoised per icon slug: the registry is a fixed set of static
 * components, so one render each per session is all it ever costs.
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
 * The node's icon as embeddable SVG: positioned at (x, y), sized `size`,
 * strokes/fills resolved to the given concrete colour (the icons follow
 * `currentColor`, and `color` is inheritable as a presentation attribute).
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

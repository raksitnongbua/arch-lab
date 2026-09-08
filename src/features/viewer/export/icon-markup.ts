/**
 * Inline-SVG markup for the stack icons, for embedding inside an exported
 * diagram. The registry's icons are React components — the hand-authored
 * `currentColor` set and the thesvg brand marks alike (registry.ts header) —
 * so the export path renders each one once and captures the markup: no
 * duplicated icon paths, and byte-for-byte the same artwork the viewer shows.
 * That capture is what makes export parity hold for brand icons BY
 * CONSTRUCTION: the exported markup is the same string the canvas renders,
 * own colours included, not a second drawing of the logo.
 *
 * TWO RENDERERS, ONE RECIPE, and that is what {@link createIconEmbedder} is
 * for. Rendering a component to markup is the only step that differs between
 * a browser and a route handler — the cache, the positioning and the
 * `<g color>` wrapper are the same work either way, and were duplicated once
 * before this factory existed.
 *
 * THIS MODULE IMPORTS NEITHER RENDERER, and that is not tidiness — it is what
 * makes `/api/render` possible at all. `embeddedIconSvg` lived here with its
 * `react-dom/client` import, `render-svg.ts` imported it to use as a default,
 * and so importing the C4 renderer from a route handler failed to compile:
 * "You're importing a component that imports react-dom/client." A default is
 * an import, and an import is a bundle. So the browser embedder sits in
 * `icon-markup-client.ts` with the directive it needs, the server takes
 * {@link omitIcon} below, and the caller says which one it is —
 * `renderDiagramSvg` cannot guess and no longer pretends to.
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

import type { ComponentType, SVGProps } from "react";

import type { C4Node } from "@/types";

import { resolveIcon } from "@/features/editor/lib/icons/registry";
import type { IconStyle } from "@/lib/icon-style";

import { positionIconSvg } from "./icon-position";

/** One registry icon's artwork, as the registry stores it. */
export type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * The seam the C4 renderer draws icons through. Both embedders are built by
 * {@link createIconEmbedder} and so wear this shape by construction; a caller
 * passing its own must take the arguments in this order.
 */
export type EmbedIcon = (
  node: Pick<C4Node, "icon" | "type">,
  x: number,
  y: number,
  size: number,
  color: string,
  style: IconStyle,
) => string;

/**
 * An embedder over one way of turning an icon component into markup.
 *
 * The cache belongs to the embedder rather than the module: two embedders
 * never run in the same process, and a shared cache keyed only by style and
 * slug would let whichever renderer ran first decide the artwork for the
 * other.
 */
export function createIconEmbedder(
  toMarkup: (component: IconComponent) => string,
): EmbedIcon {
  /**
   * Keyed by STYLE AND SLUG, not slug alone. A slug-only key was the shape
   * before the mono/colour switch existed and is now a parity bug waiting to
   * happen: the first export of a diagram would win the cache entry, and every
   * later export would embed that artwork no matter which style the canvas was
   * showing — a coloured PNG of a mono board, or the reverse, depending only on
   * which the reader exported first.
   */
  const markupByStyleAndSlug = new Map<string, string>();

  const iconMarkup = (
    node: Pick<C4Node, "icon" | "type">,
    style: IconStyle,
  ): string => {
    const { def } = resolveIcon(node);
    const key = `${style}:${def.slug}`;
    const cached = markupByStyleAndSlug.get(key);
    if (cached !== undefined) return cached;

    const markup = toMarkup(def.byStyle[style]);
    markupByStyleAndSlug.set(key, markup);
    return markup;
  };

  /**
   * The node's icon as embeddable SVG: positioned at (x, y), sized `size`.
   * The `<g color>` wrapper resolves the MONOCHROME icons' `currentColor` to
   * the given concrete colour (`color` is inheritable as a presentation
   * attribute) — which is what the three ink-free brand marks want too, since
   * they inherit their fill. A COLOURED brand mark carries explicit fills that
   * never reference `currentColor`, so for it the wrapper is inert and the mark
   * keeps its own colours — exactly as on canvas, and as the registry's
   * no-recolour rule requires. Geometry is REPLACED, not prepended
   * (`./icon-position.ts`): this used to trust icon components to strip their
   * own `width`/`height`, and when the generic icons became lucide components
   * that stopped being true and every export of a board carrying one failed to
   * rasterise at all.
   */
  return (node, x, y, size, color, style) => {
    const positioned = positionIconSvg(iconMarkup(node, style), x, y, size);
    return `<g color="${color}">${positioned}</g>`;
  };
}

/**
 * AN EMBEDDER THAT DRAWS NO ICON — what the server has instead of one, today.
 *
 * The registry's marks are React components, and rendering a component to
 * markup needs a React renderer: `react-dom/client` needs a document, and
 * `react-dom/server` is rejected outright inside Next's route graph ("You're
 * importing a component that imports react-dom/server"). So a diagram drawn by
 * `/api/render` currently arrives with its nodes' shapes, fills, borders and
 * labels — and no logos.
 *
 * THAT IS A REAL LOSS AND NOT A DESIGN, which is why this is named for what it
 * does rather than dressed up as a policy. `purpose.md` calls the icon set one
 * of the customisation surfaces the product promises, and a container labelled
 * "MongoDB" without its mark is exactly the flattening the render route was
 * built to avoid. The way out is a build-time table of slug → markup so the
 * server needs no renderer at all, checked against the components the canvas
 * draws; `scripts/lib/icon-artwork.mjs` already extracts the brand half of it.
 * Until that exists, this returns nothing rather than a placeholder — a wrong
 * mark is worse than an absent one.
 */
export const omitIcon: EmbedIcon = () => "";

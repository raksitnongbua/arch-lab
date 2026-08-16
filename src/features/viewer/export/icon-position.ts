/**
 * Placing an icon's own `<svg>` root inside an exported diagram.
 *
 * PURE AND ALONE IN A FILE because it is the piece that broke and the piece a
 * test can reach: `icon-markup.ts` renders React into a real DOM node, so it
 * cannot be loaded by the `check:*` harness at all, and the bug below shipped
 * behind exactly that gap.
 *
 * THE BUG. Positioning used to be a bare prefix — `markup.replace(/^<svg\s/,
 * '<svg x=… width=… ')` — with a comment saying it relied on the icon
 * components stripping their upstream `width`/`height`. Nothing enforced that.
 * When the generic icons became `lucide-react` components, they rendered
 * `width="24" height="24"` of their own, so every export of a diagram using
 * one produced `<svg … width="20" … width="24" …>`. A duplicate attribute is
 * not well-formed XML, an SVG that is not well-formed XML does not decode as
 * an image, and the whole export died with "the rendered SVG could not be
 * decoded" — PNG download and clipboard copy alike, for the entire board,
 * because of one icon.
 *
 * So the geometry is now REPLACED rather than prepended, and the icon's own
 * artwork attributes (`viewBox`, `fill`, `class`, everything else) are left
 * exactly as they were — that is what keeps the exported mark byte-identical
 * to the canvas one.
 */

/**
 * The root attributes an icon must not bring with it: the export decides where
 * the mark sits and how big it is, and the source's own copies are what
 * collide. `viewBox` is deliberately NOT here — it is the artwork's own
 * coordinate system and removing it would scale every icon wrongly.
 */
const GEOMETRY_ATTRS = ["x", "y", "width", "height"] as const;

/**
 * `<svg …>` markup for one icon, positioned at (x, y) and sized `size`.
 *
 * Accepts markup that already carries any of those four attributes and wins:
 * whatever the icon library emits, the diagram's geometry is the one that
 * survives. Returns the input unchanged if it is not an `<svg>` root, which
 * cannot happen for a registry icon but is not worth throwing over.
 */
export function positionIconSvg(
  markup: string,
  x: number,
  y: number,
  size: number,
): string {
  const root = /^<svg\b([^>]*)>/.exec(markup);
  if (root === null) return markup;

  let attrs = root[1];
  for (const name of GEOMETRY_ATTRS) {
    /* Quote-agnostic, and anchored on a word boundary so `height` does not
       also match inside `stroke-height`-shaped names: the same lesson the
       brand-ink sanitiser learned when Oracle turned up with single quotes. */
    attrs = attrs.replace(new RegExp(`\\s${name}=(["'])[^"']*\\1`, "gi"), "");
  }

  return `<svg x="${x}" y="${y}" width="${size}" height="${size}"${attrs}>${markup.slice(root[0].length)}`;
}

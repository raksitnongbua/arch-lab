/* NO REACT IN THIS MODULE, and no "use client" either — that pair is the
   whole point of it. `IconStyle` and `DEFAULT_ICON_STYLE` are wanted in
   places that must stay server-renderable: the SVG exporter takes the default
   when there is no reader to ask, and `/api/render` reads a style off a query
   string with no reader at all.

   IT USED TO HOLD THE HOOK, on the argument that the directive was what would
   have dragged this into the client bundle and that omitting it was enough.
   That was wrong in one direction nobody had tested: a bare
   `useSyncExternalStore` import is rejected by the RSC graph whether or not a
   directive is present, so the first server module to import
   `DEFAULT_ICON_STYLE` failed to compile — "This API is only available in
   Client Components." The reactive half now lives in `icon-style-store.ts`
   with the directive it needs, and the comment that used to promise this
   file was server-renderable is now true. */

/**
 * How stack icons are painted: the reader's preference, not the document's.
 *
 * WHY THIS IS NOT IN THE MODEL. It was offered as an `.alab` directive and
 * deliberately rejected: it is a rendering choice, in the same class as the
 * light/dark theme, and putting it in the format would mean a grammar
 * keyword, a serializer branch, round-trip coverage, MCP docs and the VS Code
 * grammar — all to record something no diagram is ABOUT. The cost of that
 * choice is real and worth stating: a share link does not carry the style, so
 * a recipient sees their own preference rather than the sender's. If that
 * ever needs to travel, the directive is the change to make — deliberately,
 * and with the format work it implies.
 *
 * MONO IS THE DEFAULT because it is the only setting that makes the whole
 * board agree: the 59 hand-authored marks are `currentColor` and have no
 * coloured artwork, so colour mode is always a MIXTURE of coloured brand
 * logos and monochrome house icons. Mono renders every icon in one ink that
 * follows the theme.
 */
export type IconStyle = "mono" | "colour";

export const DEFAULT_ICON_STYLE: IconStyle = "mono";

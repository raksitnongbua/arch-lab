/**
 * WHAT A BROKEN RENDER URL LOOKS LIKE — an SVG that says what went wrong.
 *
 * The route is consumed as an `<img>` in someone else's document, and an
 * `<img>` that 400s is a broken-image glyph: the reader learns that something
 * is wrong and nothing about what, and the author who pasted the link has no
 * way to find out either. So every refusal is drawn instead — the payload was
 * truncated by the app that carried it, the link expired, the document does
 * not parse — in the same palette the diagram would have used.
 *
 * The STATUS CODE still tells the truth for anything that reads it (a 404 is
 * a 404 even when its body is a picture); this is about what a person sees.
 */

import { escapeXml } from "@/lib/svg-markup";
import type { ExportTheme } from "@/features/viewer/export/theme";

const WIDTH = 640;
const PADDING = 28;
const LINE_HEIGHT = 20;
/** Wraps on the same crude ratio the exporters measure text with. */
const CHARS_PER_LINE = 68;

/** Greedy wrap — no font metrics on the server, and none needed for prose. */
function wrap(text: string): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line === "") line = word;
    else if (`${line} ${word}`.length <= CHARS_PER_LINE) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== "") lines.push(line);
  return lines;
}

/**
 * A card carrying `headline` and `detail`.
 *
 * `detail` is text the caller's own URL produced — a parser message, a codec
 * failure — so it is escaped, never interpolated raw. Nothing else in this
 * document comes from the request.
 */
export function renderErrorCard(
  headline: string,
  detail: string,
  theme: ExportTheme,
): { svg: string; width: number; height: number } {
  const lines = wrap(detail);
  const height = PADDING * 2 + LINE_HEIGHT * (lines.length + 2);

  const body = lines
    .map(
      (line, index) =>
        `<text x="${PADDING}" y="${PADDING + LINE_HEIGHT * (index + 2.4)}" ` +
        `font-family="ui-sans-serif, system-ui, sans-serif" font-size="13" ` +
        `fill="${theme.mutedForeground}">${escapeXml(line)}</text>`,
    )
    .join("");

  return {
    width: WIDTH,
    height,
    svg:
      `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" ` +
      `viewBox="0 0 ${WIDTH} ${height}" role="img" ` +
      `aria-label="${escapeXml(`${headline}. ${detail}`)}">` +
      `<rect width="${WIDTH}" height="${height}" fill="${theme.canvas}"/>` +
      `<rect x="0.5" y="0.5" width="${WIDTH - 1}" height="${height - 1}" ` +
      `fill="none" stroke="${theme.nodeBorder}"/>` +
      `<rect x="0" y="0" width="4" height="${height}" fill="${theme.destructive}"/>` +
      `<text x="${PADDING}" y="${PADDING + LINE_HEIGHT}" ` +
      `font-family="ui-sans-serif, system-ui, sans-serif" font-size="15" ` +
      `font-weight="600" fill="${theme.foreground}">${escapeXml(headline)}</text>` +
      body +
      `</svg>`,
  };
}

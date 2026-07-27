/**
 * Resolving the live theme tokens to concrete colours at export time.
 *
 * The exported SVG must be self-contained: a `var(--foo)` reference renders
 * wrong (usually black) the moment the file leaves the page, and the tokens
 * are authored in `oklch(...)`, which some rasterisers still refuse. So each
 * token is read from the LIVE computed styles (whichever theme is active)
 * and normalised through a 2D canvas: assigning `fillStyle` makes the
 * browser parse the colour and serialise it back as `#rrggbb` /
 * `rgba(…)` — concrete sRGB, no custom properties, no oklch.
 *
 * This file is the one place export code is allowed to materialise colour
 * values; components everywhere else stay on semantic tokens.
 */

/** The subset of semantic tokens the exported diagram paints with. */
export interface ExportTheme {
  canvas: string;
  node: string;
  nodeForeground: string;
  nodeBorder: string;
  edge: string;
  muted: string;
  mutedForeground: string;
  foreground: string;
}

const TOKEN_VARS: Record<keyof ExportTheme, string> = {
  canvas: "--canvas",
  node: "--node",
  nodeForeground: "--node-foreground",
  nodeBorder: "--node-border",
  edge: "--edge",
  muted: "--muted",
  mutedForeground: "--muted-foreground",
  foreground: "--foreground",
};

/**
 * Parse `raw` through the canvas colour machinery → `#rrggbb` (or
 * `rgba(…)` when translucent). Painting a pixel and reading it back gives
 * plain sRGB bytes — `fillStyle`'s own getter can echo modern serialisations
 * like `lab(…)`, which strict SVG rasterisers outside the browser refuse.
 * Returns null when the browser cannot parse the value.
 */
function normalizeColor(
  context: CanvasRenderingContext2D,
  raw: string,
): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  // Sentinel first: if the assignment below is rejected, fillStyle keeps its
  // previous value — the sentinel makes "rejected" detectable.
  context.fillStyle = "#010203";
  const sentinel = context.fillStyle;
  context.fillStyle = trimmed;
  if (context.fillStyle === sentinel && trimmed !== "#010203") return null;

  context.clearRect(0, 0, 1, 1);
  context.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
  if (a < 255) {
    return `rgba(${r}, ${g}, ${b}, ${Math.round((a / 255) * 1000) / 1000})`;
  }
  const hex = (channel: number): string =>
    channel.toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/**
 * Reads the export palette from the document's LIVE computed styles — the
 * active theme, light or dark, exactly as rendered. Must run in the browser.
 */
export function resolveExportTheme(): ExportTheme {
  const styles = getComputedStyle(document.documentElement);
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  const resolve = (variable: string, fallback: string): string => {
    const raw = styles.getPropertyValue(variable);
    if (context === null) return raw.trim() || fallback;
    return normalizeColor(context, raw) ?? fallback;
  };

  return {
    canvas: resolve(TOKEN_VARS.canvas, "#ffffff"),
    node: resolve(TOKEN_VARS.node, "#ffffff"),
    nodeForeground: resolve(TOKEN_VARS.nodeForeground, "#1f2430"),
    nodeBorder: resolve(TOKEN_VARS.nodeBorder, "#8a8f9d"),
    edge: resolve(TOKEN_VARS.edge, "#7d828f"),
    muted: resolve(TOKEN_VARS.muted, "#eef0f4"),
    mutedForeground: resolve(TOKEN_VARS.mutedForeground, "#6a7080"),
    foreground: resolve(TOKEN_VARS.foreground, "#1f2430"),
  };
}

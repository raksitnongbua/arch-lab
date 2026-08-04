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

import type { NodeColorRole } from "@/features/editor/lib/node-colors";

/** The subset of semantic tokens the exported diagram paints with. */
export interface ExportTheme {
  canvas: string;
  node: string;
  nodeForeground: string;
  nodeBorder: string;
  edge: string;
  mutedForeground: string;
  /** Secondary text ON node fills — `--node-meta`, not the panel muted. */
  nodeMeta: string;
  foreground: string;
  /**
   * Per-role node fill/border (the `--node-person`… family), resolved to
   * concrete sRGB like every other entry, so the export shows the same
   * type differentiation as the canvas.
   */
  nodeRoles: Record<NodeColorRole, { fill: string; border: string }>;
}

const TOKEN_VARS = {
  canvas: "--canvas",
  node: "--node",
  nodeForeground: "--node-foreground",
  nodeBorder: "--node-border",
  edge: "--edge",
  mutedForeground: "--muted-foreground",
  nodeMeta: "--node-meta",
  foreground: "--foreground",
} as const;

const ROLE_TOKEN_VARS: Record<NodeColorRole, { fill: string; border: string }> =
  {
    person: { fill: "--node-person", border: "--node-person-border" },
    internal: { fill: "--node-internal", border: "--node-internal-border" },
    external: { fill: "--node-external", border: "--node-external-border" },
    database: { fill: "--node-database", border: "--node-database-border" },
    queue: { fill: "--node-queue", border: "--node-queue-border" },
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

  const node = resolve(TOKEN_VARS.node, "#ffffff");
  const nodeBorder = resolve(TOKEN_VARS.nodeBorder, "#8a8f9d");
  const role = (key: NodeColorRole): { fill: string; border: string } => ({
    // Fall back to the undifferentiated pair — an export from a browser that
    // somehow lacks the role tokens degrades to the pre-colour look, never
    // to black.
    fill: resolve(ROLE_TOKEN_VARS[key].fill, node),
    border: resolve(ROLE_TOKEN_VARS[key].border, nodeBorder),
  });

  return {
    canvas: resolve(TOKEN_VARS.canvas, "#ffffff"),
    node,
    nodeForeground: resolve(TOKEN_VARS.nodeForeground, "#1f2430"),
    nodeBorder,
    edge: resolve(TOKEN_VARS.edge, "#7d828f"),
    mutedForeground: resolve(TOKEN_VARS.mutedForeground, "#6a7080"),
    // Falls back to the muted tone rather than a literal: same "degrade to
    // the pre-colour look" rule as the role fills below.
    nodeMeta: resolve(TOKEN_VARS.nodeMeta, "#6a7080"),
    foreground: resolve(TOKEN_VARS.foreground, "#1f2430"),
    nodeRoles: {
      person: role("person"),
      internal: role("internal"),
      external: role("external"),
      database: role("database"),
      queue: role("queue"),
    },
  };
}

/**
 * A `tagColors` paint pair as concrete colours, for the exporter. On screen
 * the border is the author's colour verbatim and the fill is the rebuilt
 * `oklch(from tag var(--tag-fill-l) min(c, var(--tag-fill-c)) h)`
 * (node-colors.ts: `tagFillCss` has the design). The export must ship
 * RESULTS, not expressions — so the two theme pins are read from the live
 * computed styles, inlined into the exact same relative-colour expression,
 * and the whole thing is parsed through the canvas normaliser (the border
 * likewise — an author may write any CSS colour, not just hex). Rejected
 * alternative: re-implementing the oklch rebuild arithmetic here — the
 * browser that painted the screen is right there, and two implementations
 * of one recipe will drift. The fallbacks degrade to the theme's
 * undifferentiated pair rather than a broken export.
 */
export function resolveTagPaint(
  tagColor: string,
  theme: Pick<ExportTheme, "node" | "nodeBorder">,
): { fill: string; stroke: string } {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) return { fill: theme.node, stroke: theme.nodeBorder };
  const styles = getComputedStyle(document.documentElement);
  const lightness = styles.getPropertyValue("--tag-fill-l").trim();
  const chromaCap = styles.getPropertyValue("--tag-fill-c").trim();
  const fill =
    lightness === "" || chromaCap === ""
      ? null
      : normalizeColor(
          context,
          `oklch(from ${tagColor} ${lightness} min(c, ${chromaCap}) h)`,
        );
  const stroke = normalizeColor(context, tagColor);
  return {
    fill: fill ?? theme.node,
    stroke: stroke ?? theme.nodeBorder,
  };
}

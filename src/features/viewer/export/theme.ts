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
// Cross-feature on purpose, the inverse of the flowchart exporter's import
// of this module: FLOW_SHAPE_TOKENS is the ONE shape→token table, and
// restating the token names here would let the resolved palette drift from
// what the screen paints.
import { FLOW_SHAPE_TOKENS } from "@/features/flowchart/lib/shapes";
import type { FlowchartNodeShape } from "@/types";

/** The subset of semantic tokens the exported diagram paints with. */
export interface ExportTheme {
  canvas: string;
  node: string;
  nodeForeground: string;
  nodeBorder: string;
  edge: string;
  /**
   * The resting drift that rides on a connector (`--edge-drift`). Resolved
   * here so the animated GIF paints the canvas's own colour rather than a
   * second guess at it.
   */
  edgeDrift: string;
  /** `--primary`, for the resting comet's head and halo in an animated export. */
  primary: string;
  /**
   * `--accent`, and the `--destructive` pair. Added for the dictionary
   * exporter's flag badges, which are the first export surface to paint with
   * either: `unique` is drawn in the accent and `pii` is the one solid badge,
   * whose fill and label are a pair the theme already guarantees against each
   * other. Resolved here rather than approximated at the call site, so an
   * exported dictionary carries the same badge colours the reader saw.
   */
  accent: string;
  destructive: string;
  destructiveForeground: string;
  mutedForeground: string;
  /** Secondary text ON node fills — `--node-meta`, not the panel muted. */
  nodeMeta: string;
  /**
   * `--canvas-grid`, the hairline the canvas rules itself with. Added for the
   * gantt exporter, which is the first export surface to draw a measured
   * AXIS: its ticks and its section rules are the same hairline the screen
   * draws, and approximating them with the node border would make an exported
   * axis heavier than the one the reader saw.
   */
  canvasGrid: string;
  /** `--border` — the hairline the diagram area's own frame is ruled with. */
  border: string;
  /** The gantt's critical-path cap. Aliases `--primary` in every theme but
   * `pastel`, where the cap's 3:1-against-four-state-fills requirement and the
   * brand colour disagree. Resolved, never assumed to equal `primary`. */
  criticalCap: string;
  foreground: string;
  /**
   * Per-role node fill/border (the `--node-person`… family), resolved to
   * concrete sRGB like every other entry, so the export shows the same
   * type differentiation as the canvas.
   */
  nodeRoles: Record<NodeColorRole, { fill: string; border: string }>;
  /**
   * Per-shape flowchart fill/border (the `--flow-start`… family), resolved
   * to concrete sRGB like every other entry — the flowchart export's
   * counterpart of `nodeRoles`.
   */
  flowShapes: Record<FlowchartNodeShape, { fill: string; border: string }>;
  /**
   * THE ROLE TEXTURE, resolved to a concrete ink and a number — the channel
   * that carries "which kind of thing is this?" when the palette has no hue
   * (`lib/role-texture.ts` has the argument).
   *
   * IT IS CONTENT, NOT CHROME, and that is the whole reason it is here. The
   * canvas field is deliberately kept OUT of exports because a diagram dropped
   * into a deck should arrive as the drawing; a role texture is the opposite
   * case — under `eink` it is the ONLY thing telling a database from a queue,
   * so an export that dropped it would be a diagram that lost its meaning
   * rather than a diagram that lost its background.
   *
   * `opacity: 0` in all eight other themes, and every exporter is required to
   * emit NOTHING at zero rather than an invisible overlay — that is what keeps
   * their exported bytes identical to what they were before this existed.
   */
  roleTexture: { ink: string; opacity: number };
  /**
   * THE DIAGRAM SHEET'S WASH, resolved to a concrete ink and a number — the
   * same shape as `roleTexture` above, and for the same reason.
   *
   * A `blueprint` export frames its plan on a sheet whose `--border` is
   * deliberately quieter than the drafting ruling behind it, so without the
   * wash the downloaded file shows a drawing floating on bare grid — a
   * different picture from the one the reader was looking at when they pressed
   * Download, which is the failure export parity exists to prevent.
   *
   * `opacity: 0` in all eight other themes, and every exporter is required to
   * emit the `fill="none"` it emitted before this existed rather than an
   * invisible fill — that is what keeps their exported bytes identical.
   */
  diagramSurface: { fill: string; opacity: number };
}

const TOKEN_VARS = {
  canvas: "--canvas",
  node: "--node",
  nodeForeground: "--node-foreground",
  nodeBorder: "--node-border",
  edge: "--edge",
  edgeDrift: "--edge-drift",
  primary: "--primary",
  mutedForeground: "--muted-foreground",
  nodeMeta: "--node-meta",
  canvasGrid: "--canvas-grid",
  /* The hairline every rule in the app is drawn with. Resolved here because
     `diagramSurfaceMarkup` draws the diagram AREA with it, and the exported
     frame has to be the colour the screen framed it in. */
  border: "--border",
  criticalCap: "--gantt-critical",
  foreground: "--foreground",
  accent: "--accent",
  destructive: "--destructive",
  destructiveForeground: "--destructive-foreground",
  roleTextureInk: "--role-texture-ink",
  diagramSurfaceFill: "--diagram-surface-fill",
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

  /*
   * A token whose value is an EXPRESSION — `color-mix(…, var(--edge) …)` — is
   * not reliably usable straight out of `getPropertyValue`: what comes back
   * depends on how far the engine has substituted, and the canvas parser
   * rejects anything still holding a `var()`. Painting it onto a probe element
   * and reading `color` back always yields a plain resolved `rgb(…)`, because
   * that is a real used value rather than a custom property's token stream.
   */
  const resolveExpression = (variable: string, fallback: string): string => {
    const probe = document.createElement("span");
    probe.style.cssText = `position:absolute;visibility:hidden;color:var(${variable})`;
    document.body.append(probe);
    try {
      const used = getComputedStyle(probe).color;
      if (used === "") return fallback;
      return context === null ? used : (normalizeColor(context, used) ?? used);
    } finally {
      probe.remove();
    }
  };

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
  // Same degradation rule as `role` above. getComputedStyle substitutes the
  // var() aliases (start/step/io/call point at role tokens), so each shape
  // arrives as its own concrete pair.
  const flowShape = (
    key: FlowchartNodeShape,
  ): { fill: string; border: string } => ({
    fill: resolve(FLOW_SHAPE_TOKENS[key].fill, node),
    border: resolve(FLOW_SHAPE_TOKENS[key].border, nodeBorder),
  });

  /* The ink is an INDIRECTION (`var(--node-border)` in the baseline), so it
     needs the probe path rather than the raw property — the same reason
     `--edge-drift` does. The opacity is a bare number and parses directly; a
     value that does not parse degrades to 0, i.e. to no texture, which is the
     safe direction: a missing texture is a plainer diagram, where a texture at
     an unintended opacity is a diagram with a lattice over it. */
  const roleTextureOpacity = Number.parseFloat(
    styles.getPropertyValue("--role-texture-opacity"),
  );

  /* Same two-part treatment, same reasons: the fill is an INDIRECTION
     (`var(--canvas-grid)` in the baseline) and needs the probe path, and a
     non-finite opacity degrades to 0 — a plainer file, never a wash at an
     unintended strength. */
  const canvasGrid = resolve(TOKEN_VARS.canvasGrid, nodeBorder);
  const diagramSurfaceOpacity = Number.parseFloat(
    styles.getPropertyValue("--diagram-surface-opacity"),
  );

  return {
    roleTexture: {
      ink: resolveExpression(TOKEN_VARS.roleTextureInk, nodeBorder),
      opacity: Number.isFinite(roleTextureOpacity) ? roleTextureOpacity : 0,
    },
    diagramSurface: {
      fill: resolveExpression(TOKEN_VARS.diagramSurfaceFill, canvasGrid),
      opacity: Number.isFinite(diagramSurfaceOpacity)
        ? diagramSurfaceOpacity
        : 0,
    },
    canvas: resolve(TOKEN_VARS.canvas, "#ffffff"),
    border: resolve(TOKEN_VARS.border, "#d9d9de"),
    node,
    nodeForeground: resolve(TOKEN_VARS.nodeForeground, "#1f2430"),
    nodeBorder,
    edge: resolve(TOKEN_VARS.edge, "#7d828f"),
    // Falls back to the plain edge ink: an export that cannot resolve the mix
    // shows the drift in the connector's own colour, never a stray literal.
    primary: resolve(TOKEN_VARS.primary, "#4f46e5"),
    // Falls back to `--primary`, which is what it aliases in six of the seven
    // themes — never to a literal, so a browser that cannot resolve the token
    // still exports a cap in the brand colour rather than a stray indigo.
    criticalCap: resolveExpression(
      TOKEN_VARS.criticalCap,
      resolve(TOKEN_VARS.primary, "#4f46e5"),
    ),
    accent: resolve(TOKEN_VARS.accent, "#22b8cf"),
    destructive: resolve(TOKEN_VARS.destructive, "#e5484d"),
    destructiveForeground: resolve(TOKEN_VARS.destructiveForeground, "#ffffff"),
    edgeDrift: resolveExpression(
      TOKEN_VARS.edgeDrift,
      resolve(TOKEN_VARS.edge, "#7d828f"),
    ),
    mutedForeground: resolve(TOKEN_VARS.mutedForeground, "#6a7080"),
    // Falls back to the muted tone rather than a literal: same "degrade to
    // the pre-colour look" rule as the role fills below.
    nodeMeta: resolve(TOKEN_VARS.nodeMeta, "#6a7080"),
    // Falls back to the node border rather than a grey literal: a browser that
    // cannot resolve the grid token still rules the axis in a theme colour.
    // Hoisted above, because the surface wash falls back to it in turn.
    canvasGrid,
    foreground: resolve(TOKEN_VARS.foreground, "#1f2430"),
    nodeRoles: {
      person: role("person"),
      internal: role("internal"),
      external: role("external"),
      database: role("database"),
      queue: role("queue"),
    },
    flowShapes: {
      start: flowShape("start"),
      end: flowShape("end"),
      step: flowShape("step"),
      decision: flowShape("decision"),
      io: flowShape("io"),
      call: flowShape("call"),
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

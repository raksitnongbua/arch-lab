/**
 * Model → standalone SVG. The export path draws the CURRENT diagram straight
 * from the model — the same geometry the viewer renders (node positions and
 * sizes verbatim; edge curves through the editor's real
 * `getFloatingAnchors` / `getParallelEdgePath`) — rather than screenshotting
 * the DOM, so the output is clean vector art at any size.
 *
 * Self-containment is the contract:
 *   - every colour is a concrete sRGB value resolved from the live theme
 *     tokens (`./theme.ts`) — never `var(--…)`, never `oklch(…)`;
 *   - stack icons are embedded inline (`./icon-markup.ts`) — no `href` to
 *     anything;
 *   - fonts are system stacks only — no webfont references.
 *
 * Shapes mirror the viewer's per-type silhouettes: person's rounded
 * shoulders, the software system's heavier border, the external system's
 * dashed receding box, the database cylinder, the queue pipe, the
 * component's UML tab glyph, the code element's sharp corners and mono
 * name. Colours mirror the canvas's role palette and `tagColors` overrides
 * (`node-colors.ts` is the one table both consult). Text is
 * laid out with a conservative character-width estimate (SVG has no
 * automatic wrapping), wrapped to the node's width and ellipsised where the
 * viewer clamps.
 */

import type { C4Diagram, C4Edge, C4Node, C4NodeType } from "@/types";
import { isBoundaryPlaceholder } from "@/types";

import {
  getFloatingAnchors,
  getParallelEdgePath,
  labelBiasByEdgeId,
  type NodeRect,
} from "@/features/editor/lib/edge-geometry";
import {
  colorRoleForNode,
  COLOR_ROLE_BY_TYPE,
  EXTERNAL_NODE_OPACITY,
  resolveTagColor,
} from "@/features/editor/lib/node-colors";
import {
  placeFrames,
  FRAME_LABEL_BAND,
} from "@/features/editor/lib/frame-layout";

import {
  C4_ABSTRACTION,
  SHAPE_LABEL,
  shapeAddsInformation,
} from "../lib/labels";
import { embeddedIconSvg } from "./icon-markup";
import type { ExportTheme } from "./theme";

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

const PADDING = 56;
/** Vertical room above the diagram for the title block. */
const HEADER_HEIGHT = 64;

const FONT_SANS =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
const FONT_MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

/** Conservative average glyph width per font-size unit (sans). */
const CHAR_WIDTH_RATIO = 0.58;
const MONO_CHAR_WIDTH_RATIO = 0.62;

const ICON_SIZE = 16;
const ICON_GAP = 6;

const LEVEL_LABEL: Record<C4Diagram["level"], string> = {
  context: "Context",
  container: "Container",
  component: "Component",
  code: "Code",
};

/* -------------------------------------------------------------------------- */
/* Small helpers                                                               */
/* -------------------------------------------------------------------------- */

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const fmt = (value: number): string => String(Math.round(value * 100) / 100);

function estimateWidth(text: string, fontSize: number, mono = false): number {
  return (
    text.length * fontSize * (mono ? MONO_CHAR_WIDTH_RATIO : CHAR_WIDTH_RATIO)
  );
}

/** Greedy word wrap to `maxWidth` estimated pixels, at most `maxLines`. */
function wrapText(
  text: string,
  fontSize: number,
  maxWidth: number,
  maxLines: number,
): string[] {
  const maxChars = Math.max(
    4,
    Math.floor(maxWidth / (fontSize * CHAR_WIDTH_RATIO)),
  );
  const words = text.split(/\s+/).filter((word) => word !== "");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current === "" ? word : `${current} ${word}`;
    if (candidate.length <= maxChars || current === "") {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && current !== "") lines.push(current);
  if (lines.length === maxLines && current !== "" && !lines.includes(current)) {
    // Overflow beyond the last allowed line — ellipsise it.
    const last = lines[maxLines - 1];
    lines[maxLines - 1] = `${last.slice(0, Math.max(1, maxChars - 1))}…`;
  }
  // Hard-break any single word longer than the line.
  return lines.map((line) =>
    line.length > maxChars
      ? `${line.slice(0, Math.max(1, maxChars - 1))}…`
      : line,
  );
}

function ellipsize(text: string, fontSize: number, maxWidth: number): string {
  const maxChars = Math.max(
    4,
    Math.floor(maxWidth / (fontSize * CHAR_WIDTH_RATIO)),
  );
  return text.length <= maxChars ? text : `${text.slice(0, maxChars - 1)}…`;
}

/** Path for a rectangle with per-corner radii (person's shoulders). */
function roundedRectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  tl: number,
  tr: number,
  br: number,
  bl: number,
): string {
  return [
    `M ${fmt(x + tl)} ${fmt(y)}`,
    `H ${fmt(x + w - tr)}`,
    `A ${fmt(tr)} ${fmt(tr)} 0 0 1 ${fmt(x + w)} ${fmt(y + tr)}`,
    `V ${fmt(y + h - br)}`,
    `A ${fmt(br)} ${fmt(br)} 0 0 1 ${fmt(x + w - br)} ${fmt(y + h)}`,
    `H ${fmt(x + bl)}`,
    `A ${fmt(bl)} ${fmt(bl)} 0 0 1 ${fmt(x)} ${fmt(y + h - bl)}`,
    `V ${fmt(y + tl)}`,
    `A ${fmt(tl)} ${fmt(tl)} 0 0 1 ${fmt(x + tl)} ${fmt(y)}`,
    "Z",
  ].join(" ");
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/* -------------------------------------------------------------------------- */
/* The surface wash                                                            */
/* -------------------------------------------------------------------------- */

/**
 * How much border colour the wash folds into a fill (= CSS .af-node-wash):
 * the lit top edge, and the shallow grounding fold at the bottom. Kept as a
 * pair so a future retune stays one edit next to the CSS it mirrors.
 *
 * ANIMATION IS DELIBERATELY FLATTENED HERE. The canvas's motion — the
 * staggered entrance, the hover lift and role-tinted glow, the selection
 * comet — is all interaction state, and an SVG file has no interactions:
 * the export renders the diagram's RESTING frame (every node landed, no
 * glow, no comet), which is exactly what the screen shows once you stop
 * touching it. Rejected alternative: SMIL/CSS animation inside the SVG —
 * most rasterisers and design tools ignore it, so it would only make the
 * file's first paint disagree with its own thumbnail. The gradients, which
 * ARE part of the resting frame, export for real via the defs below.
 */
const WASH_STROKE_FRACTION = 0.14;
const WASH_BOTTOM_FRACTION = 0.07;

/** Parse the exporter's concrete colours: `#rrggbb` or `rgba(r, g, b, a)`. */
function parseSrgb(color: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (hex !== null) {
    const value = parseInt(hex[1], 16);
    return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
  }
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(color.trim());
  if (rgba !== null) {
    return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])];
  }
  return null;
}

/**
 * The wash's top-stop colour: 10% stroke folded into the fill. On screen
 * this is `color-mix(in oklab, …)`; here it is a plain sRGB lerp because
 * this module is deliberately DOM-free (see resolveTagPaint's counter-case:
 * THERE the browser must do the work, because an author mix is 100% of the
 * fill — a wrong space would visibly recolour the card. At a 10% fold the
 * two spaces differ by well under one 8-bit channel step, so duplicating
 * the browser's oklab pipeline would buy nothing and cost the module its
 * DOM-freeness). Falls back to the flat fill when a colour fails to parse.
 */
function washMixColor(fill: string, stroke: string, fraction: number): string {
  const f = parseSrgb(fill);
  const s = parseSrgb(stroke);
  if (f === null || s === null) return fill;
  const mix = (a: number, b: number): number =>
    Math.round(a + (b - a) * fraction);
  const hex = (channel: number): string =>
    channel.toString(16).padStart(2, "0");
  return `#${hex(mix(f[0], s[0]))}${hex(mix(f[1], s[1]))}${hex(mix(f[2], s[2]))}`;
}

/** The wash's deepest (top-edge) stop — also the flat paint for rim/tabs. */
function washTopColor(fill: string, stroke: string): string {
  return washMixColor(fill, stroke, WASH_STROKE_FRACTION);
}

/**
 * One wash gradient per DISTINCT paint pair (not per node — parallel
 * containers share one def), collected while nodes render and emitted into
 * `<defs>`. `objectBoundingBox` units (the SVG default) make a single def
 * correct for every node that references it, wherever it sits.
 */
class WashRegistry {
  private readonly idByKey = new Map<string, string>();
  private readonly defs: string[] = [];

  /** The `url(#…)` fill reference for this paint pair. */
  ref(fill: string, stroke: string): string {
    const key = `${fill}|${stroke}`;
    const existing = this.idByKey.get(key);
    if (existing !== undefined) return `url(#${existing})`;
    const id = `af-wash-${this.idByKey.size}`;
    this.idByKey.set(key, id);
    // Four stops, mirroring `.af-node-wash` exactly: lit 14% top edge, the
    // flat middle band the text sits on, and the 7% grounding bottom.
    this.defs.push(
      `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0" stop-color="${washTopColor(fill, stroke)}"/>` +
        `<stop offset="0.55" stop-color="${fill}"/>` +
        `<stop offset="0.82" stop-color="${fill}"/>` +
        `<stop offset="1" stop-color="${washMixColor(fill, stroke, WASH_BOTTOM_FRACTION)}"/>` +
        `</linearGradient>`,
    );
    return `url(#${id})`;
  }

  markup(): string {
    return this.defs.join("");
  }
}

/* -------------------------------------------------------------------------- */
/* Node silhouettes                                                            */
/* -------------------------------------------------------------------------- */

interface ShapeResult {
  markup: string;
  /** Extra top inset the content column must respect (database rim). */
  contentTopInset: number;
  /** Extra horizontal inset per side (queue caps). */
  contentSideInset: number;
}

/**
 * Fill/stroke for one node, mirroring the canvas exactly: the author's
 * `tagColors` entry (materialised by `paintForTagColor`, since the on-screen
 * wash is a CSS `color-mix` the file cannot carry) wins, then the colour
 * role's resolved tokens. Same precedence, same one table — node-colors.ts.
 */
function nodePaint(
  node: C4Node,
  theme: ExportTheme,
  tagColors: Readonly<Record<string, string>> | undefined,
  paintForTagColor: (tagColor: string) => { fill: string; stroke: string },
): { fill: string; stroke: string } {
  const tagColor = resolveTagColor(node, tagColors);
  if (tagColor !== null) return paintForTagColor(tagColor);
  const role = theme.nodeRoles[colorRoleForNode(node)];
  return { fill: role.fill, stroke: role.border };
}

function nodeShape(
  node: C4Node,
  theme: ExportTheme,
  paint: { fill: string; stroke: string },
  wash: WashRegistry,
): ShapeResult {
  const { x, y } = node.position;
  const { width: w, height: h } = node.size;
  const stroke = `stroke="${paint.stroke}"`;
  // Every surface except the externalSystem card takes the wash gradient —
  // keyed off the TYPE, exactly like `SHAPE_WRAPPER_CLASSES` (the wash
  // rides the per-type class list on screen). A tag-external person is
  // therefore washed here too, matching the canvas pixel for pixel; its
  // grey-on-grey wash is imperceptible anyway.
  const washed = node.type !== "externalSystem";
  const fill = `fill="${washed ? wash.ref(paint.fill, paint.stroke) : paint.fill}"`;
  // Small details that sit in the washed band (cylinder rim, glyph tabs)
  // paint the wash TOP flat — mirrors `.af-node-wash-fill`.
  const washTop = washed ? washTopColor(paint.fill, paint.stroke) : paint.fill;

  switch (node.type) {
    case "person":
      return {
        markup: `<path d="${roundedRectPath(x, y, w, h, 28, 28, 12, 12)}" ${fill} ${stroke} stroke-width="1.5"/>`,
        contentTopInset: 0,
        contentSideInset: 0,
      };
    case "softwareSystem":
      return {
        markup: `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" rx="8" ${fill} ${stroke} stroke-width="2"/>`,
        contentTopInset: 0,
        contentSideInset: 0,
      };
    case "externalSystem":
      // Dashed border as ever; the receding grey now comes from the
      // `external` role's fill rather than a hardcoded --muted read.
      return {
        markup: `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" rx="8" ${fill} ${stroke} stroke-width="1.5" stroke-dasharray="6 4"/>`,
        contentTopInset: 0,
        contentSideInset: 0,
      };
    case "container":
      return {
        markup: `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" rx="8" ${fill} ${stroke} stroke-width="1.5"/>`,
        contentTopInset: 0,
        contentSideInset: 0,
      };
    case "component": {
      // Box + the UML component glyph in the top-left corner.
      const gx = x + 6;
      const gy = y + 6;
      // Glyph in the node's accent + wash-top tab fills — node-shapes.tsx.
      const glyph =
        `<g fill="none" stroke="${paint.stroke}" stroke-width="1.2">` +
        `<path d="M ${fmt(gx + 4.5)} ${fmt(gy + 1.5)} h 8 v 11 h -8"/>` +
        `<rect x="${fmt(gx + 1)}" y="${fmt(gy + 3.5)}" width="6" height="2.6" fill="${washTop}"/>` +
        `<rect x="${fmt(gx + 1)}" y="${fmt(gy + 7.9)}" width="6" height="2.6" fill="${washTop}"/>` +
        `</g>`;
      return {
        markup:
          `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" rx="6" ${fill} ${stroke} stroke-width="1.5"/>` +
          glyph,
        contentTopInset: 0,
        contentSideInset: 0,
      };
    }
    case "codeElement":
      return {
        markup: `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" rx="2" ${fill} ${stroke} stroke-width="1.5"/>`,
        contentTopInset: 0,
        contentSideInset: 0,
      };
    case "database": {
      // Cylinder: rim ellipse over a body with a matching bottom bulge.
      const rim = clamp(h * 0.114, 6, 14);
      const inset = 2;
      const left = x + inset;
      const right = x + w - inset;
      const rx = (right - left) / 2;
      const body =
        `M ${fmt(left)} ${fmt(y + rim)} L ${fmt(left)} ${fmt(y + h - rim)} ` +
        `A ${fmt(rx)} ${fmt(rim)} 0 0 0 ${fmt(right)} ${fmt(y + h - rim)} ` +
        `L ${fmt(right)} ${fmt(y + rim)}`;
      return {
        markup:
          `<path d="${body}" ${fill} ${stroke} stroke-width="1.5"/>` +
          // Flat wash-top rim: the lit face of the cylinder (node-shapes).
          `<ellipse cx="${fmt(x + w / 2)}" cy="${fmt(y + rim)}" rx="${fmt(rx)}" ry="${fmt(rim)}" fill="${washTop}" ${stroke} stroke-width="1.5"/>`,
        contentTopInset: rim,
        contentSideInset: 0,
      };
    }
    case "queue": {
      // Horizontal pipe: open rim at the left, closed cap at the right.
      const cap = clamp(w * 0.068, 8, 16);
      const top = y + 1;
      const bottom = y + h - 1;
      const ry = (bottom - top) / 2;
      const body =
        `M ${fmt(x + cap)} ${fmt(top)} L ${fmt(x + w - cap)} ${fmt(top)} ` +
        `A ${fmt(cap)} ${fmt(ry)} 0 0 1 ${fmt(x + w - cap)} ${fmt(bottom)} ` +
        `L ${fmt(x + cap)} ${fmt(bottom)}`;
      return {
        markup:
          `<path d="${body}" ${fill} ${stroke} stroke-width="1.5"/>` +
          `<ellipse cx="${fmt(x + cap)}" cy="${fmt(y + h / 2)}" rx="${fmt(cap)}" ry="${fmt(ry)}" ${fill} ${stroke} stroke-width="1.5"/>`,
        contentTopInset: 0,
        contentSideInset: cap,
      };
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Node content (icon + name + meta + description)                             */
/* -------------------------------------------------------------------------- */

function nodeContent(
  node: C4Node,
  theme: ExportTheme,
  shape: ShapeResult,
  paint: { fill: string; stroke: string },
): string {
  const { x, y } = node.position;
  const { width: w, height: h } = node.size;
  const cx = x + w / 2;
  const innerWidth = w - 24 - shape.contentSideInset * 2;
  const mono = node.type === "codeElement";

  const nameSize = 13;
  const metaSize = 10;
  const descSize = 10;
  const nameLineHeight = 16;
  const smallLineHeight = 12;

  const nameLines = wrapText(
    node.name,
    nameSize,
    innerWidth - ICON_SIZE - ICON_GAP,
    3,
  );
  const meta =
    node.technology !== undefined && node.technology !== ""
      ? `[${C4_ABSTRACTION[node.type]}: ${node.technology}]`
      : `[${C4_ABSTRACTION[node.type]}]`;
  const description =
    node.description !== undefined && node.description !== ""
      ? ellipsize(node.description, descSize, innerWidth)
      : null;

  const totalHeight =
    nameLines.length * nameLineHeight +
    smallLineHeight +
    (description !== null ? smallLineHeight : 0);
  const contentTop = y + shape.contentTopInset;
  const contentHeight = h - shape.contentTopInset;
  let cursorY = contentTop + contentHeight / 2 - totalHeight / 2;

  const parts: string[] = [];

  // Name block: icon to the left of the (possibly wrapped) name.
  const nameBlockWidth = Math.max(
    ...nameLines.map((line) => estimateWidth(line, nameSize, mono)),
    1,
  );
  const rowWidth = ICON_SIZE + ICON_GAP + nameBlockWidth;
  const rowLeft = cx - rowWidth / 2;
  const nameCenterX = rowLeft + ICON_SIZE + ICON_GAP + nameBlockWidth / 2;
  const nameBlockHeight = nameLines.length * nameLineHeight;
  parts.push(
    embeddedIconSvg(
      node,
      rowLeft,
      cursorY + nameBlockHeight / 2 - ICON_SIZE / 2,
      ICON_SIZE,
      // Accent-tinted, like the renderers (node-chrome.tsx explains).
      paint.stroke,
    ),
  );
  for (const line of nameLines) {
    parts.push(
      `<text x="${fmt(nameCenterX)}" y="${fmt(cursorY + nameLineHeight * 0.72)}" text-anchor="middle" font-family="${mono ? FONT_MONO : FONT_SANS}" font-size="${nameSize}" font-weight="500" fill="${theme.nodeForeground}">${escapeXml(line)}</text>`,
    );
    cursorY += nameLineHeight;
  }

  // nodeMeta, not mutedForeground — the ON-fill secondary text token, and
  // the description drops its old opacity for the same measured-contrast
  // reason as the renderers (node-chrome.tsx).
  parts.push(
    `<text x="${fmt(cx)}" y="${fmt(cursorY + smallLineHeight * 0.72)}" text-anchor="middle" font-family="${FONT_SANS}" font-size="${metaSize}" fill="${theme.nodeMeta}">${escapeXml(ellipsize(meta, metaSize, innerWidth))}</text>`,
  );
  cursorY += smallLineHeight;

  if (description !== null) {
    parts.push(
      `<text x="${fmt(cx)}" y="${fmt(cursorY + smallLineHeight * 0.72)}" text-anchor="middle" font-family="${FONT_SANS}" font-size="${descSize}" fill="${theme.nodeMeta}">${escapeXml(description)}</text>`,
    );
  }

  return parts.join("");
}

/* -------------------------------------------------------------------------- */
/* Edges                                                                       */
/* -------------------------------------------------------------------------- */

/** Group parallel edges by unordered endpoint pair (mirrors the canvas). */
function parallelGroups(
  edges: readonly C4Edge[],
): Map<string, { index: number; count: number }> {
  const byPair = new Map<string, string[]>();
  for (const edge of edges) {
    const key =
      edge.source < edge.target
        ? `${edge.source}|${edge.target}`
        : `${edge.target}|${edge.source}`;
    const list = byPair.get(key);
    if (list) list.push(edge.id);
    else byPair.set(key, [edge.id]);
  }
  const out = new Map<string, { index: number; count: number }>();
  for (const ids of byPair.values()) {
    ids.forEach((id, index) => out.set(id, { index, count: ids.length }));
  }
  return out;
}

function nodeRectOf(node: C4Node): NodeRect {
  return {
    x: node.position.x,
    y: node.position.y,
    width: node.size.width,
    height: node.size.height,
  };
}

function edgeMarkup(
  diagram: C4Diagram,
  theme: ExportTheme,
  markerId: string,
): string {
  const groups = parallelGroups(diagram.edges);
  const labelBias = labelBiasByEdgeId(diagram.edges);
  const rectById = new Map(
    diagram.nodes.map((node) => [node.id, nodeRectOf(node)]),
  );
  const parts: string[] = [];

  for (const edge of diagram.edges) {
    const source = rectById.get(edge.source);
    const target = rectById.get(edge.target);
    if (source === undefined || target === undefined) continue;

    const anchors = getFloatingAnchors(source, target);
    const group = groups.get(edge.id) ?? { index: 0, count: 1 };
    const { path, labelX, labelY } = getParallelEdgePath({
      ...anchors,
      parallelIndex: group.index,
      parallelCount: group.count,
      labelBias: labelBias.get(edge.id) ?? 0,
    });

    const dash = edge.style === "dashed" ? ' stroke-dasharray="6 4"' : "";
    const markerEnd =
      edge.direction === "none" ? "" : ` marker-end="url(#${markerId})"`;
    const markerStart =
      edge.direction === "bidirectional"
        ? ` marker-start="url(#${markerId})"`
        : "";
    parts.push(
      // The class is the ANIMATED EXPORT's handle on this path. A GIF of a C4
      // diagram is the connectors drifting, exactly as the canvas shows them at
      // rest, and the frame builder needs to find the connectors in a finished
      // SVG string to give each frame its dash offset. Marking them here is the
      // only way it can — an exported path is otherwise indistinguishable from
      // a node's border. It costs a class on a still that ignores it.
      `<path class="af-export-edge" d="${path}" fill="none" stroke="${theme.edge}" stroke-width="1.5"${dash}${markerEnd}${markerStart}/>`,
    );

    // Label chip — only when there is something to say (the on-screen
    // "Unlabelled relationship" affordance is an interaction, not content).
    const label = edge.label ?? "";
    const technology = edge.technology ?? "";
    if (label === "" && technology === "") continue;

    const labelSize = 10;
    const techSize = 9;
    const lines: Array<{
      text: string;
      size: number;
      mono: boolean;
      color: string;
    }> = [];
    if (label !== "") {
      lines.push({
        text: ellipsize(label, labelSize, 176),
        size: labelSize,
        mono: false,
        color: theme.foreground,
      });
    }
    if (technology !== "") {
      lines.push({
        text: `[${ellipsize(technology, techSize, 168)}]`,
        size: techSize,
        mono: true,
        color: theme.mutedForeground,
      });
    }
    const chipWidth =
      Math.max(...lines.map((l) => estimateWidth(l.text, l.size, l.mono))) + 14;
    const chipHeight = lines.length * 13 + 8;
    const chipX = labelX - chipWidth / 2;
    const chipY = labelY - chipHeight / 2;
    parts.push(
      `<rect x="${fmt(chipX)}" y="${fmt(chipY)}" width="${fmt(chipWidth)}" height="${fmt(chipHeight)}" rx="5" fill="${theme.canvas}" fill-opacity="0.92" stroke="${theme.nodeBorder}" stroke-opacity="0.6"/>`,
    );
    let lineY = chipY + 4;
    for (const line of lines) {
      parts.push(
        `<text x="${fmt(labelX)}" y="${fmt(lineY + 13 * 0.72)}" text-anchor="middle" font-family="${line.mono ? FONT_MONO : FONT_SANS}" font-size="${line.size}" fill="${line.color}">${escapeXml(line.text)}</text>`,
      );
      lineY += 13;
    }
  }

  return parts.join("");
}

/* -------------------------------------------------------------------------- */
/* Legend                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The key. c4model.com/diagrams/notation: "all diagrams must include a key
 * explaining notation (shapes, colors, borders, line types, arrow heads)."
 *
 * On screen a reader can click a node and read the detail panel; an exported
 * image has no such recourse — it lands in a wiki page where five colours and
 * six silhouettes are on their own. So the key ships with the FILE, and it is
 * the export, not the canvas, that grew one.
 *
 * Every row is DERIVED from the diagram, never a fixed list: one row per node
 * type actually drawn, relationship rows only for the line styles actually
 * used, a boundary row only when frames exist. A key describing a queue on a
 * diagram with no queue is noise, and worse, it invites the reader to hunt
 * for one.
 */

const LEGEND_GAP_ABOVE = 30;
const LEGEND_TITLE_SIZE = 11;
const LEGEND_TITLE_HEIGHT = 20;
const LEGEND_ROW_HEIGHT = 20;
const LEGEND_TEXT_SIZE = 10;
const LEGEND_SWATCH_WIDTH = 34;
const LEGEND_SWATCH_HEIGHT = 13;
const LEGEND_SWATCH_GAP = 8;
const LEGEND_COLUMN_GAP = 26;
/** Arrow-head size for the key's sample lines — see `legendLine`. */
const LEGEND_MARKER_SIZE = 9;

interface LegendRow {
  /** Swatch markup, drawn in a 26×13 box whose top-left is (0, 0). */
  swatch: (x: number, y: number) => string;
  text: string;
}

/**
 * A miniature of the real silhouette, in the same role colours the node
 * itself is painted with — shape, fill, border weight and dash all reproduced,
 * because those are the four things the key exists to explain. Drawn from the
 * same `theme.nodeRoles` table the nodes read, so a key cannot describe a
 * palette the image does not have.
 */
function legendSwatch(
  type: C4NodeType,
  theme: ExportTheme,
): (x: number, y: number) => string {
  const role = COLOR_ROLE_BY_TYPE[type];
  const paint = theme.nodeRoles[role];
  const w = LEGEND_SWATCH_WIDTH;
  const h = LEGEND_SWATCH_HEIGHT;

  return (x, y) => {
    const base =
      `fill="${paint.fill}" stroke="${paint.border}" ` +
      (type === "softwareSystem" ? 'stroke-width="2"' : 'stroke-width="1"') +
      (type === "externalSystem" ? ' stroke-dasharray="3 2"' : "");
    const dim =
      type === "externalSystem" ? ` opacity="${EXTERNAL_NODE_OPACITY}"` : "";

    if (type === "database") {
      // Cylinder: the same rim-ellipse + body construction as nodeShape,
      // scaled into the swatch box.
      const ry = 2.5;
      return (
        `<g${dim}>` +
        `<path d="M ${fmt(x)} ${fmt(y + ry)} A ${fmt(w / 2)} ${fmt(ry)} 0 0 1 ${fmt(x + w)} ${fmt(y + ry)} ` +
        `L ${fmt(x + w)} ${fmt(y + h - ry)} A ${fmt(w / 2)} ${fmt(ry)} 0 0 1 ${fmt(x)} ${fmt(y + h - ry)} Z" ${base}/>` +
        `<path d="M ${fmt(x)} ${fmt(y + ry)} A ${fmt(w / 2)} ${fmt(ry)} 0 0 0 ${fmt(x + w)} ${fmt(y + ry)}" ` +
        `fill="none" stroke="${paint.border}" stroke-width="1"/>` +
        `</g>`
      );
    }
    if (type === "queue") {
      // Pipe: rounded end caps, open left rim.
      const rx = 3.5;
      return (
        `<g${dim}>` +
        `<path d="M ${fmt(x + rx)} ${fmt(y)} L ${fmt(x + w - rx)} ${fmt(y)} ` +
        `A ${fmt(rx)} ${fmt(h / 2)} 0 0 1 ${fmt(x + w - rx)} ${fmt(y + h)} ` +
        `L ${fmt(x + rx)} ${fmt(y + h)} ` +
        `A ${fmt(rx)} ${fmt(h / 2)} 0 0 1 ${fmt(x + rx)} ${fmt(y)} Z" ${base}/>` +
        `</g>`
      );
    }
    if (type === "person") {
      // Rounded shoulders: a big top radius, a modest bottom one.
      return `<g${dim}><path d="${roundedRectPath(x, y, w, h, 5, 5, 2, 2)}" ${base}/></g>`;
    }
    const r = type === "codeElement" ? 1 : type === "component" ? 2 : 3;
    return `<g${dim}><path d="${roundedRectPath(x, y, w, h, r, r, r, r)}" ${base}/></g>`;
  };
}

/**
 * A sample relationship line, arrow head included.
 *
 * Draws with `LEGEND_MARKER_SIZE`, not the diagram's 14px head: at that size
 * two heads on a 34px swatch overlap into an unreadable blob, and the row
 * that most needs to be legible is exactly the bidirectional one.
 */
function legendLine(
  theme: ExportTheme,
  markerId: string,
  { dashed = false, bidirectional = false } = {},
): (x: number, y: number) => string {
  const w = LEGEND_SWATCH_WIDTH;
  return (x, y) => {
    const mid = y + LEGEND_SWATCH_HEIGHT / 2;
    // The head overhangs the path end, so the line stops short of the box.
    return (
      `<path d="M ${fmt(x + (bidirectional ? 4 : 0))} ${fmt(mid)} L ${fmt(x + w - 4)} ${fmt(mid)}" ` +
      `fill="none" stroke="${theme.edge}" stroke-width="1.5"` +
      (dashed ? ' stroke-dasharray="4 3"' : "") +
      ` marker-end="url(#${markerId})"` +
      (bidirectional ? ` marker-start="url(#${markerId})"` : "") +
      `/>`
    );
  };
}

/**
 * The rows this diagram needs, in reading order: elements first (the boxes a
 * reader decodes before anything else), then line styles, then scenery.
 */
function legendRowsFor(
  diagram: C4Diagram,
  theme: ExportTheme,
  markerId: string,
): LegendRow[] {
  const rows: LegendRow[] = [];

  // One row per node TYPE present, not per colour role: two types can share a
  // role (a person tagged `external` goes grey) and the reader still has two
  // different silhouettes in front of them.
  const typesPresent: C4NodeType[] = [];
  for (const node of diagram.nodes) {
    if (!typesPresent.includes(node.type)) typesPresent.push(node.type);
  }
  typesPresent.sort(
    (a, b) => LEGEND_TYPE_ORDER.indexOf(a) - LEGEND_TYPE_ORDER.indexOf(b),
  );
  for (const type of typesPresent) {
    rows.push({
      swatch: legendSwatch(type, theme),
      // "Database — Container" rather than a bare "Database": the whole point
      // of the relabelling is that the silhouette and the classification are
      // different facts, and the key is where they are reconciled. Only where
      // they ARE different, though — `shapeAddsInformation` is what keeps this
      // from emitting "Software system — Software System".
      text: shapeAddsInformation(type)
        ? `${SHAPE_LABEL[type]} — ${C4_ABSTRACTION[type]}`
        : SHAPE_LABEL[type],
    });
  }

  if (diagram.nodes.some((node) => isBoundaryPlaceholder(node))) {
    rows.push({
      swatch: (x, y) =>
        `<g opacity="0.6"><path d="${roundedRectPath(x, y, LEGEND_SWATCH_WIDTH, LEGEND_SWATCH_HEIGHT, 3, 3, 3, 3)}" ` +
        `fill="${theme.node}" stroke="${theme.nodeBorder}" stroke-width="1"/></g>`,
      text: "Faded — shown for context, defined one level up",
    });
  }

  const edges = diagram.edges;
  if (edges.some((edge) => edge.style !== "dashed")) {
    rows.push({
      swatch: legendLine(theme, markerId),
      text: "Relationship, in the arrow's direction",
    });
  }
  if (edges.some((edge) => edge.style === "dashed")) {
    rows.push({
      swatch: legendLine(theme, markerId, { dashed: true }),
      text: "Asynchronous relationship",
    });
  }
  if (edges.some((edge) => edge.direction === "bidirectional")) {
    rows.push({
      swatch: legendLine(theme, markerId, { bidirectional: true }),
      text: "Relationship in both directions",
    });
  }

  if ((diagram.frames ?? []).length > 0) {
    rows.push({
      swatch: (x, y) =>
        `<rect x="${fmt(x)}" y="${fmt(y)}" width="${LEGEND_SWATCH_WIDTH}" height="${LEGEND_SWATCH_HEIGHT}" rx="3" ` +
        `fill="${theme.nodeBorder}" fill-opacity="0.06" stroke="${theme.nodeBorder}" stroke-opacity="0.7" ` +
        `stroke-width="1" stroke-dasharray="4 3"/>`,
      text: "Boundary — a labelled grouping, not a deployable thing",
    });
  }

  return rows;
}

/** Reading order for the key: actors, then software, then the data layer. */
const LEGEND_TYPE_ORDER: readonly C4NodeType[] = [
  "person",
  "softwareSystem",
  "container",
  "component",
  "codeElement",
  "database",
  "queue",
  "externalSystem",
];

interface LegendLayout {
  rows: LegendRow[];
  columns: number;
  rowsPerColumn: number;
  columnWidth: number;
  /** Total vertical space the block claims, gap above included. */
  height: number;
  /** Narrowest page content width that renders without clipping. */
  minContentWidth: number;
}

function layoutLegend(rows: LegendRow[], contentWidth: number): LegendLayout {
  const widest = rows.reduce(
    (max, row) => Math.max(max, estimateWidth(row.text, LEGEND_TEXT_SIZE)),
    0,
  );
  const columnWidth =
    LEGEND_SWATCH_WIDTH + LEGEND_SWATCH_GAP + widest + LEGEND_COLUMN_GAP;
  const columns = Math.max(
    1,
    Math.min(rows.length, Math.floor(contentWidth / columnWidth)),
  );
  const rowsPerColumn = Math.ceil(rows.length / columns);
  return {
    rows,
    columns,
    rowsPerColumn,
    columnWidth,
    height:
      LEGEND_GAP_ABOVE +
      LEGEND_TITLE_HEIGHT +
      rowsPerColumn * LEGEND_ROW_HEIGHT,
    // One column, minus the trailing gutter that has nothing after it.
    minContentWidth: columnWidth - LEGEND_COLUMN_GAP,
  };
}

/** Emits the key at page coordinates — outside the diagram's transform. */
function legendMarkup(
  layout: LegendLayout,
  left: number,
  top: number,
  theme: ExportTheme,
): string {
  const parts = [
    `<text x="${fmt(left)}" y="${fmt(top + LEGEND_TITLE_SIZE)}" font-family="${FONT_SANS}" ` +
      `font-size="${LEGEND_TITLE_SIZE}" font-weight="600" fill="${theme.foreground}">Key</text>`,
  ];
  layout.rows.forEach((row, index) => {
    const column = Math.floor(index / layout.rowsPerColumn);
    const rowIndex = index % layout.rowsPerColumn;
    const x = left + column * layout.columnWidth;
    const y = top + LEGEND_TITLE_HEIGHT + rowIndex * LEGEND_ROW_HEIGHT;
    const swatchTop = y + (LEGEND_ROW_HEIGHT - LEGEND_SWATCH_HEIGHT) / 2;
    parts.push(row.swatch(x, swatchTop));
    parts.push(
      `<text x="${fmt(x + LEGEND_SWATCH_WIDTH + LEGEND_SWATCH_GAP)}" ` +
        `y="${fmt(swatchTop + LEGEND_SWATCH_HEIGHT - 3)}" font-family="${FONT_SANS}" ` +
        `font-size="${LEGEND_TEXT_SIZE}" fill="${theme.mutedForeground}">${escapeXml(row.text)}</text>`,
    );
  });
  return `<g>${parts.join("")}</g>`;
}

/* -------------------------------------------------------------------------- */
/* The document                                                                 */
/* -------------------------------------------------------------------------- */

export interface RenderedSvg {
  svg: string;
  width: number;
  height: number;
}

export interface RenderDiagramOptions {
  /** The model's `metadata.tagColors` — the author's colour overrides. */
  tagColors?: Readonly<Record<string, string>>;
  /**
   * Materialises an author tag colour into a concrete fill/stroke pair
   * (`export/theme.ts: resolveTagPaint`). Injected rather than imported so
   * this module stays DOM-free — the mix needs the browser's colour parser.
   */
  paintForTagColor?: (tagColor: string) => { fill: string; stroke: string };
  /**
   * Draw the key beneath the diagram. Defaults to TRUE: c4model.com requires
   * one, and the exported file is precisely the artefact whose reader cannot
   * click a node to find out what grey means. Opt out for a diagram being
   * embedded somewhere that already carries a shared key.
   */
  includeLegend?: boolean;
}

/**
 * Renders one diagram of a model to a complete standalone SVG document.
 * `theme` must come from `resolveExportTheme()` at export time so the file
 * matches the theme the user is looking at.
 */
export function renderDiagramSvg(
  diagram: C4Diagram,
  modelTitle: string,
  theme: ExportTheme,
  options: RenderDiagramOptions = {},
): RenderedSvg {
  // Bounds over the model geometry (the viewer's own fit logic).
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of diagram.nodes) {
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + node.size.width);
    maxY = Math.max(maxY, node.position.y + node.size.height);
  }
  // Frames extend past their members by the layout pad, so the bounds have to
  // grow with them — otherwise the outermost border is clipped off the edge of
  // the exported image, which is exactly the part a reader looks for.
  const placedFrames = placeFrames(diagram);
  for (const frame of placedFrames) {
    minX = Math.min(minX, frame.x);
    minY = Math.min(minY, frame.y);
    maxX = Math.max(maxX, frame.x + frame.width);
    maxY = Math.max(maxY, frame.y + frame.height);
  }
  if (minX === Infinity) {
    minX = 0;
    minY = 0;
    maxX = 320;
    maxY = 120;
  }

  const markerId = "af-arrow";

  // The key is laid out BEFORE the page is sized: it can widen a narrow
  // diagram (a two-node context view is narrower than one legend column) and
  // it always lengthens the page. Both have to be known before `width` and
  // `height` are fixed, or the key renders off the edge of its own image.
  const legendMarkerId = `${markerId}-key`;
  const legendRows =
    (options.includeLegend ?? true) && diagram.nodes.length > 0
      ? legendRowsFor(diagram, theme, legendMarkerId)
      : [];
  const diagramWidth = maxX - minX;
  const legend =
    legendRows.length > 0 ? layoutLegend(legendRows, diagramWidth) : null;
  const contentWidth =
    legend === null
      ? diagramWidth
      : Math.max(diagramWidth, legend.minContentWidth);

  const width = Math.ceil(contentWidth + PADDING * 2);
  const height = Math.ceil(
    maxY - minY + PADDING * 2 + HEADER_HEIGHT + (legend?.height ?? 0),
  );
  const translateX = PADDING - minX;
  const translateY = PADDING + HEADER_HEIGHT - minY;
  const legendTop = PADDING + HEADER_HEIGHT + (maxY - minY) + LEGEND_GAP_ABOVE;

  // The root diagram's title usually IS the model title — don't say it twice.
  const heading =
    diagram.title === modelTitle
      ? modelTitle
      : `${modelTitle} — ${diagram.title}`;
  const subtitle =
    `${LEVEL_LABEL[diagram.level]} view — ${diagram.nodes.length} element` +
    `${diagram.nodes.length === 1 ? "" : "s"}, ${diagram.edges.length} relationship` +
    `${diagram.edges.length === 1 ? "" : "s"}`;

  // Without an injected materialiser (an older caller), author overrides
  // degrade to role colours rather than shipping an unresolvable color-mix.
  const paintForTagColor = options.paintForTagColor;
  const tagColors =
    paintForTagColor !== undefined ? options.tagColors : undefined;

  // Populated as a side effect of rendering the nodes below, then emitted
  // into <defs> — one gradient per distinct paint pair, not per node.
  const wash = new WashRegistry();

  // Outermost first (placeFrames guarantees the order), and before the edge
  // layer: a frame is scenery, so nothing it encloses should be dimmed by it.
  const framesMarkup = placedFrames
    .map(
      (frame) =>
        `<rect x="${fmt(frame.x)}" y="${fmt(frame.y)}" width="${fmt(frame.width)}" height="${fmt(frame.height)}" rx="12" ` +
        // Same ink and the same two alphas the on-screen layer uses
        // (`bg-node-border/[0.06]`, `border-node-border/70`), so an export and
        // the canvas cannot drift apart as the theme changes.
        `fill="${theme.nodeBorder}" fill-opacity="0.06" stroke="${theme.nodeBorder}" stroke-opacity="0.7" stroke-width="1" stroke-dasharray="6 4"/>`,
    )
    .join("");

  // Captions emit AFTER the nodes, mirroring the canvas: the rectangle belongs
  // behind the diagram, but an edge crossing the top band would paint over the
  // name. A canvas-filled plate punches the same gap through the dashed border
  // that `bg-canvas` does on screen. Its width is estimated from the character
  // count — the exporter has no text metrics, and a slightly generous plate is
  // invisible against the canvas whereas a short one would clip the gap.
  const frameLabelsMarkup = placedFrames
    .map((frame) => {
      const plateWidth = Math.min(
        Math.max(0, frame.width - 20),
        frame.label.length * 6.1 + 12,
      );
      const x = frame.x + 10;
      const y = frame.y + (FRAME_LABEL_BAND - 16) / 2;
      return (
        `<g>` +
        `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(plateWidth)}" height="16" rx="3" fill="${theme.canvas}"/>` +
        `<text x="${fmt(x + 6)}" y="${fmt(y + 12)}" font-family="${FONT_SANS}" font-size="11" font-weight="500" fill="${theme.mutedForeground}">${escapeXml(frame.label)}</text>` +
        `</g>`
      );
    })
    .join("");

  const nodesMarkup = diagram.nodes
    .map((node) => {
      const paint = nodePaint(
        node,
        theme,
        tagColors,
        paintForTagColor ??
          (() => ({ fill: theme.node, stroke: theme.nodeBorder })),
      );
      const shape = nodeShape(node, theme, paint, wash);
      // Same dim ladder as the renderers, from the same constants: a
      // placeholder recedes furthest; an external-ROLE element (type or
      // Mermaid-residue tag) recedes a step.
      const opacity = isBoundaryPlaceholder(node)
        ? ' opacity="0.6"'
        : colorRoleForNode(node) === "external"
          ? ` opacity="${EXTERNAL_NODE_OPACITY}"`
          : "";
      return `<g${opacity}>${shape.markup}${nodeContent(node, theme, shape, paint)}</g>`;
    })
    .join("");

  const emptyNotice =
    diagram.nodes.length === 0
      ? `<text x="${fmt(minX + 160)}" y="${fmt(minY + 64)}" text-anchor="middle" font-family="${FONT_SANS}" font-size="13" fill="${theme.mutedForeground}">This diagram has no elements.</text>`
      : "";

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="af-title">` +
    `<title id="af-title">${escapeXml(`${heading} (${LEVEL_LABEL[diagram.level]} view)`)}</title>` +
    `<defs>` +
    `<marker id="${markerId}" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="14" markerHeight="14" markerUnits="userSpaceOnUse" orient="auto-start-reverse">` +
    `<path d="M 1 1 L 11 6 L 1 11 Z" fill="${theme.edge}"/>` +
    `</marker>` +
    (legend !== null
      ? `<marker id="${legendMarkerId}" viewBox="0 0 12 12" refX="10" refY="6" ` +
        `markerWidth="${LEGEND_MARKER_SIZE}" markerHeight="${LEGEND_MARKER_SIZE}" ` +
        `markerUnits="userSpaceOnUse" orient="auto-start-reverse">` +
        `<path d="M 1 1 L 11 6 L 1 11 Z" fill="${theme.edge}"/>` +
        `</marker>`
      : "") +
    wash.markup() +
    `</defs>` +
    `<rect width="${width}" height="${height}" fill="${theme.canvas}"/>` +
    `<text x="${PADDING}" y="${PADDING - 22}" font-family="${FONT_SANS}" font-size="16" font-weight="600" fill="${theme.foreground}">${escapeXml(heading)}</text>` +
    `<text x="${PADDING}" y="${PADDING - 2}" font-family="${FONT_SANS}" font-size="11" fill="${theme.mutedForeground}">${escapeXml(subtitle)}</text>` +
    `<g transform="translate(${fmt(translateX)} ${fmt(translateY)})">` +
    framesMarkup +
    edgeMarkup(diagram, theme, markerId) +
    nodesMarkup +
    frameLabelsMarkup +
    emptyNotice +
    `</g>` +
    // Page furniture, not model space: emitted outside the transform so the
    // key keeps its own scale and left margin whatever the diagram's origin.
    (legend !== null ? legendMarkup(legend, PADDING, legendTop, theme) : "") +
    `</svg>`;

  return { svg, width, height };
}

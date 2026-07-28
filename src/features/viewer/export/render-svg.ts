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
 * dashed muted box, the database cylinder, the queue pipe, the component's
 * UML tab glyph, the code element's sharp corners and mono name. Text is
 * laid out with a conservative character-width estimate (SVG has no
 * automatic wrapping), wrapped to the node's width and ellipsised where the
 * viewer clamps.
 */

import type { C4Diagram, C4Edge, C4Node } from "@/types";
import { isBoundaryPlaceholder } from "@/types";

import {
  getFloatingAnchors,
  getParallelEdgePath,
  labelBiasByEdgeId,
  type NodeRect,
} from "@/features/editor/lib/edge-geometry";

import { TYPE_LABEL } from "../lib/labels";
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
/* Node silhouettes                                                            */
/* -------------------------------------------------------------------------- */

interface ShapeResult {
  markup: string;
  /** Extra top inset the content column must respect (database rim). */
  contentTopInset: number;
  /** Extra horizontal inset per side (queue caps). */
  contentSideInset: number;
}

function nodeShape(node: C4Node, theme: ExportTheme): ShapeResult {
  const { x, y } = node.position;
  const { width: w, height: h } = node.size;
  const stroke = `stroke="${theme.nodeBorder}"`;
  const fill = `fill="${theme.node}"`;

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
      return {
        markup: `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" rx="8" fill="${theme.muted}" ${stroke} stroke-width="1.5" stroke-dasharray="6 4"/>`,
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
      const glyph =
        `<g fill="none" stroke="${theme.mutedForeground}" stroke-width="1.2">` +
        `<path d="M ${fmt(gx + 4.5)} ${fmt(gy + 1.5)} h 8 v 11 h -8"/>` +
        `<rect x="${fmt(gx + 1)}" y="${fmt(gy + 3.5)}" width="6" height="2.6" fill="${theme.node}"/>` +
        `<rect x="${fmt(gx + 1)}" y="${fmt(gy + 7.9)}" width="6" height="2.6" fill="${theme.node}"/>` +
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
          `<ellipse cx="${fmt(x + w / 2)}" cy="${fmt(y + rim)}" rx="${fmt(rx)}" ry="${fmt(rim)}" ${fill} ${stroke} stroke-width="1.5"/>`,
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
      ? `[${TYPE_LABEL[node.type]}: ${node.technology}]`
      : `[${TYPE_LABEL[node.type]}]`;
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
      theme.nodeForeground,
    ),
  );
  for (const line of nameLines) {
    parts.push(
      `<text x="${fmt(nameCenterX)}" y="${fmt(cursorY + nameLineHeight * 0.72)}" text-anchor="middle" font-family="${mono ? FONT_MONO : FONT_SANS}" font-size="${nameSize}" font-weight="500" fill="${theme.nodeForeground}">${escapeXml(line)}</text>`,
    );
    cursorY += nameLineHeight;
  }

  parts.push(
    `<text x="${fmt(cx)}" y="${fmt(cursorY + smallLineHeight * 0.72)}" text-anchor="middle" font-family="${FONT_SANS}" font-size="${metaSize}" fill="${theme.mutedForeground}">${escapeXml(ellipsize(meta, metaSize, innerWidth))}</text>`,
  );
  cursorY += smallLineHeight;

  if (description !== null) {
    parts.push(
      `<text x="${fmt(cx)}" y="${fmt(cursorY + smallLineHeight * 0.72)}" text-anchor="middle" font-family="${FONT_SANS}" font-size="${descSize}" fill="${theme.mutedForeground}" opacity="0.85">${escapeXml(description)}</text>`,
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
      `<path d="${path}" fill="none" stroke="${theme.edge}" stroke-width="1.5"${dash}${markerEnd}${markerStart}/>`,
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
/* The document                                                                 */
/* -------------------------------------------------------------------------- */

export interface RenderedSvg {
  svg: string;
  width: number;
  height: number;
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
  if (minX === Infinity) {
    minX = 0;
    minY = 0;
    maxX = 320;
    maxY = 120;
  }

  const width = Math.ceil(maxX - minX + PADDING * 2);
  const height = Math.ceil(maxY - minY + PADDING * 2 + HEADER_HEIGHT);
  const translateX = PADDING - minX;
  const translateY = PADDING + HEADER_HEIGHT - minY;

  const markerId = "af-arrow";
  // The root diagram's title usually IS the model title — don't say it twice.
  const heading =
    diagram.title === modelTitle
      ? modelTitle
      : `${modelTitle} — ${diagram.title}`;
  const subtitle =
    `${LEVEL_LABEL[diagram.level]} view — ${diagram.nodes.length} element` +
    `${diagram.nodes.length === 1 ? "" : "s"}, ${diagram.edges.length} relationship` +
    `${diagram.edges.length === 1 ? "" : "s"}`;

  const nodesMarkup = diagram.nodes
    .map((node) => {
      const shape = nodeShape(node, theme);
      const opacity = isBoundaryPlaceholder(node)
        ? ' opacity="0.6"'
        : node.type === "externalSystem"
          ? ' opacity="0.9"'
          : "";
      return `<g${opacity}>${shape.markup}${nodeContent(node, theme, shape)}</g>`;
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
    `</defs>` +
    `<rect width="${width}" height="${height}" fill="${theme.canvas}"/>` +
    `<text x="${PADDING}" y="${PADDING - 22}" font-family="${FONT_SANS}" font-size="16" font-weight="600" fill="${theme.foreground}">${escapeXml(heading)}</text>` +
    `<text x="${PADDING}" y="${PADDING - 2}" font-family="${FONT_SANS}" font-size="11" fill="${theme.mutedForeground}">${escapeXml(subtitle)}</text>` +
    `<g transform="translate(${fmt(translateX)} ${fmt(translateY)})">` +
    edgeMarkup(diagram, theme, markerId) +
    nodesMarkup +
    emptyNotice +
    `</g>` +
    `</svg>`;

  return { svg, width, height };
}

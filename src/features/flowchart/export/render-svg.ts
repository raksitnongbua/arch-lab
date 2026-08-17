/**
 * `FlowchartLabFile` → standalone SVG string.
 *
 * WHY FROM THE MODEL, where the sequence exporter clones the live DOM
 * (`sequence/export/render-svg.ts` argues that side). The sequence clone
 * exists to avoid a second renderer drifting from the first — but a
 * flowchart's ENTIRE geometry already lives in one pure function
 * (`lib/layout.ts`) and its shape outlines in another (`lib/shapes.ts`),
 * both shared with the screen renderer, so a from-model exporter duplicates
 * no geometry at all: the only thing restated here is which colour goes on
 * which shape, and that resolves through the same token table
 * (`FLOW_SHAPE_TOKENS`, concretised by `resolveExportTheme`) the screen
 * paints from. What from-model buys in exchange:
 *   - no mounted diagram required — a share preview, an MCP surface or a
 *     batch export can produce the file headless;
 *   - concrete sRGB colours via `resolveExportTheme` (the C4 exporter's
 *     machinery, reused not reimplemented), which strict rasterisers outside
 *     the browser accept where cloned `oklch()` computed styles can fail;
 *   - no computed-style walk, whose quote-escaping hazards the sequence
 *     exporter documents at length.
 *
 * Self-containment is the contract, same as the C4 exporter: every colour a
 * concrete value from the live theme (light or dark, exactly as rendered),
 * fonts a system stack, nothing referenced by URL. The interactive-only
 * chrome (hit targets, focus states, the details dock) never existed here to
 * be dropped.
 *
 * ANIMATION HOOKS: nodes and edges are wrapped in `<g>` groups carrying
 * `af-export-flow-*` classes, `data-flow-rank` (an edge wears its SOURCE's
 * rank) and `data-flow-kind` ("draw" for forward/self edges, "fade" for back
 * edges). In the still SVG and the PNG these are inert bytes — no stylesheet
 * ever ships with the file — but they are the CONTRACT `./frames.ts` phases
 * the GIF by, and `check:flowchart-gif` asserts both sides still speak it: a
 * renamed hook here would otherwise surface as the GIF exporter silently
 * reporting "nothing to animate". The heading and group frames deliberately
 * carry NO hook — they are context, present in every GIF frame, which is
 * also what guarantees no frame is ever blank.
 */

import { rasterise } from "@/lib/gif";
import { escapeXml, fmt } from "@/lib/svg-markup";
import { TINT_WASH_OPACITY } from "@/lib/tint";
// The C4 exporter's wash registry, shared: both files bake the on-screen
// surface gradient into <defs> as concrete sRGB stops.
import { WashRegistry } from "@/lib/wash";
import type { FlowchartLabFile } from "@/types";

// Cross-feature on purpose, the same imports the C4 exporter leans on: one
// definition of the author-colour precedence and of "resolve a theme token
// to a concrete colour".
import { resolveTagColor } from "@/features/editor/lib/node-colors";
import type { ExportTheme } from "@/features/viewer/export/theme";
import { resolveTagPaint } from "@/features/viewer/export/theme";

import type { LaidFlowNode } from "../lib/layout";
import { FLOW, layoutFlowchart } from "../lib/layout";
import {
  arrowHeadPath,
  roundedPolylinePath,
  shapeGeometry,
} from "../lib/shapes";

const FONT_SANS =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

/** What the download path writes (SVG) or rasterises (PNG). */
export interface RenderedFlowchartSvg {
  svg: string;
  width: number;
  height: number;
}

/**
 * Renders the whole document. `theme` must come from `resolveExportTheme()`
 * at export time so the file matches the screen the reader is looking at;
 * injected rather than resolved here so this function stays callable from
 * anywhere that already holds a palette.
 */
export function renderFlowchartSvg(
  file: FlowchartLabFile,
  theme: ExportTheme,
): RenderedFlowchartSvg {
  const layout = layoutFlowchart(file);
  const parts: string[] = [];
  const push = (part: string): void => {
    parts.push(part);
  };

  push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" ` +
      `viewBox="0 0 ${layout.width} ${layout.height}" font-family="${FONT_SANS}">`,
  );
  // Explicit backdrop: without one the file composites over whatever the
  // viewer paints behind it — black in most image viewers.
  push(
    `<rect x="0" y="0" width="${layout.width}" height="${layout.height}" fill="${theme.canvas}"/>`,
  );

  /* ---- groups (context first — the paint order the screen uses) ---------- */
  for (const group of layout.groups) {
    const wash =
      group.tint !== undefined
        ? `fill="${escapeXml(group.tint)}" fill-opacity="${TINT_WASH_OPACITY}"`
        : `fill="${theme.canvas}" fill-opacity="0.45"`;
    push(
      `<rect x="${fmt(group.x)}" y="${fmt(group.y)}" width="${fmt(group.width)}" height="${fmt(group.height)}" rx="10" ${wash} stroke="${theme.nodeBorder}" stroke-width="1" stroke-dasharray="4 3"/>`,
    );
    push(
      `<text x="${fmt(group.x + 10)}" y="${fmt(group.y + FLOW.groupLabelFontSize + 7)}" font-size="${FLOW.groupLabelFontSize}" font-weight="600" fill="${theme.mutedForeground}">${escapeXml(group.label)}</text>`,
    );
  }

  /* ---- edges -------------------------------------------------------------- */
  const rankOf = new Map(layout.nodes.map((node) => [node.id, node.rank]));
  for (const edge of layout.edges) {
    if (edge.points.length < 2) continue;
    push(
      `<g class="af-export-flow-edge" data-flow-rank="${rankOf.get(edge.from) ?? 0}" data-flow-kind="${edge.back ? "fade" : "draw"}">`,
    );
    const dash = edge.back ? ' stroke-dasharray="6 4"' : "";
    push(
      `<path class="af-export-flow-line" d="${roundedPolylinePath(edge.points)}" fill="none" stroke="${theme.edge}" stroke-width="1.5"${dash}/>`,
    );
    push(
      `<path class="af-export-flow-head" d="${arrowHeadPath(edge.points)}" fill="${theme.edge}" stroke="none"/>`,
    );
    const box = edge.labelBox;
    if (box !== null) {
      push(`<g class="af-export-flow-elabel">`);
      push(
        `<rect x="${fmt(box.x)}" y="${fmt(box.y)}" width="${fmt(box.width)}" height="${fmt(box.height)}" rx="4" fill="${theme.canvas}" fill-opacity="0.88"/>`,
      );
      edge.labelLines.forEach((line, index) => {
        push(
          `<text x="${fmt(box.x + FLOW.labelPadX)}" y="${fmt(
            box.y +
              FLOW.labelPadY +
              index * FLOW.labelLineHeight +
              FLOW.labelFontSize -
              2,
          )}" font-size="${FLOW.labelFontSize}" font-style="italic" fill="${theme.mutedForeground}">${escapeXml(line)}</text>`,
        );
      });
      push(`</g>`);
    }
    push(`</g>`);
  }

  /* ---- nodes -------------------------------------------------------------- */
  // Node markup is buffered so the wash <defs> can be emitted BEFORE it:
  // the registry only learns its gradients while nodes render, and strict
  // rasterisers are happiest with defs preceding first use — the C4
  // exporter's ordering.
  const wash = new WashRegistry();
  const nodeParts: string[] = [];
  for (const node of layout.nodes) {
    nodeParts.push(
      `<g class="af-export-flow-node" data-flow-rank="${node.rank}">`,
    );
    const paint = nodePaint(node, file.metadata.tagColors, theme);
    // The surface wash rides every shape, mirroring the screen renderer's
    // per-node gradient — a flat export beside a washed canvas would fail
    // the "the file matches the screen" contract.
    const washFill = wash.ref(paint.fill, paint.stroke);
    const geometry = shapeGeometry(node);
    if (geometry.rect !== undefined) {
      nodeParts.push(
        `<rect x="${fmt(node.x)}" y="${fmt(node.y)}" width="${fmt(node.width)}" height="${fmt(node.height)}" rx="${fmt(geometry.rect.rx)}" fill="${washFill}" stroke="${paint.stroke}" stroke-width="1.5"/>`,
      );
    }
    if (geometry.path !== undefined) {
      nodeParts.push(
        `<path d="${geometry.path}" fill="${washFill}" stroke="${paint.stroke}" stroke-width="1.5" stroke-linejoin="round"/>`,
      );
    }
    if (geometry.rails !== undefined) {
      for (const rail of geometry.rails) {
        nodeParts.push(
          `<path d="${rail}" fill="none" stroke="${paint.stroke}" stroke-width="1"/>`,
        );
      }
    }
    const textTop = node.cy - node.labelBox.height / 2;
    node.lines.forEach((line, index) => {
      nodeParts.push(
        `<text x="${fmt(node.cx)}" y="${fmt(textTop + index * FLOW.lineHeight + FLOW.nodeFontSize)}" text-anchor="middle" font-size="${FLOW.nodeFontSize}" font-weight="600" fill="${theme.nodeForeground}">${escapeXml(line)}</text>`,
      );
    });
    if (node.technology !== undefined) {
      nodeParts.push(
        `<text x="${fmt(node.cx)}" y="${fmt(
          textTop + node.lines.length * FLOW.lineHeight + FLOW.metaFontSize + 1,
        )}" text-anchor="middle" font-size="${FLOW.metaFontSize}" fill="${theme.nodeMeta}">[${escapeXml(node.technology)}]</text>`,
      );
    }
    nodeParts.push(`</g>`);
  }
  push(`<defs>${wash.markup()}</defs>`);
  for (const part of nodeParts) push(part);

  /* ---- heading ------------------------------------------------------------ */
  layout.heading.titleLines.forEach((line, index) => {
    push(
      `<text x="${FLOW.marginX}" y="${fmt(FLOW.marginTop + FLOW.titleFontSize + index * FLOW.titleLineHeight)}" font-size="${FLOW.titleFontSize}" font-weight="600" fill="${theme.foreground}">${escapeXml(line)}</text>`,
    );
  });
  layout.heading.descriptionLines.forEach((line, index) => {
    push(
      `<text x="${FLOW.marginX}" y="${fmt(
        FLOW.marginTop +
          layout.heading.titleLines.length * FLOW.titleLineHeight +
          FLOW.titleDescriptionGap +
          FLOW.descriptionFontSize +
          index * FLOW.descriptionLineHeight,
      )}" font-size="${FLOW.descriptionFontSize}" fill="${theme.mutedForeground}">${escapeXml(line)}</text>`,
    );
  });

  push("</svg>");
  return { svg: parts.join(""), width: layout.width, height: layout.height };
}

/**
 * The concrete paint for one node: the author's `tagColors` entry (resolved
 * through the SAME oklch rebuild the screen uses, via `resolveTagPaint`)
 * beats the shape's token pair — identical precedence to the screen renderer
 * and to C4's `nodeColorStyle`.
 */
function nodePaint(
  node: LaidFlowNode,
  tagColors: Readonly<Record<string, string>> | undefined,
  theme: ExportTheme,
): { fill: string; stroke: string } {
  const tagColor = resolveTagColor(
    { tags: node.tags === undefined ? undefined : [...node.tags] },
    tagColors,
  );
  if (tagColor !== null) return resolveTagPaint(tagColor, theme);
  const shape = theme.flowShapes[node.shape];
  return { fill: shape.fill, stroke: shape.border };
}

/**
 * Rasterises the rendered SVG to a PNG blob at `scale`× — through the SHARED
 * rasteriser in `@/lib/gif` (blob URL → Image → canvas), not a private copy:
 * both existing exporters converged on that code once already.
 */
export async function renderFlowchartPngBlob(
  rendered: RenderedFlowchartSvg,
  scale = 2,
): Promise<Blob> {
  const width = Math.round(rendered.width * scale);
  const height = Math.round(rendered.height * scale);
  const pixels = await rasterise(rendered.svg, width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("Could not create a 2D canvas context for the PNG.");
  }
  // Re-wrapped: the rasteriser's view may sit over a shared buffer, which
  // the ImageData constructor's types refuse.
  context.putImageData(
    new ImageData(new Uint8ClampedArray(pixels), width, height),
    0,
    0,
  );
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) reject(new Error("PNG encoding failed."));
      else resolve(blob);
    }, "image/png");
  });
}

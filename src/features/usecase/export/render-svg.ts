/**
 * `UseCaseLabFile` → standalone SVG string.
 *
 * FROM THE MODEL, the flowchart exporter's choice for the flowchart's own
 * reason: this diagram's entire geometry already lives in one pure function
 * (`lib/layout.ts`) and its shape outlines in another (`lib/shapes.ts`),
 * both shared with the screen renderer, so a from-model exporter duplicates
 * no geometry at all — the only thing restated is which colour goes on
 * which kind, and that resolves through the same tables the screen paints
 * from (`USECASE_KIND_TOKENS` / `USECASE_ROLE_BY_KIND`). What from-model
 * buys: headless export (a share preview or MCP surface needs no mounted
 * diagram), concrete sRGB via `resolveExportTheme`'s machinery, and no
 * computed-style walk.
 *
 * Self-containment is the contract, same as every exporter here: every
 * colour a concrete value from the live theme, fonts a system stack,
 * nothing referenced by URL.
 *
 * EDGE MARKUP IS THE KIND, MACHINE-READABLY: each edge group carries
 * `data-uc-kind`, an arrowhead is `af-export-uc-head`, a generalization
 * triangle `af-export-uc-tri` (canvas-filled — HOLLOW). These classes are
 * inert bytes in the file, but they are the contract
 * `scripts/usecase-layout-check.mjs` reads to prove an association ships
 * with NO arrowhead and a generalization's triangle is hollow and at the
 * parent end — rename them and that proof fails rather than silently
 * testing nothing.
 *
 * No GIF export, deliberately: the one animation is the first-paint reveal,
 * and a use-case diagram at rest holds still by design (`lib/motion.ts`
 * carries the argument) — there is no loop worth shipping.
 */

import { rasterise } from "@/lib/gif";
import { escapeXml, fmt } from "@/lib/svg-markup";
import { TINT_WASH_OPACITY } from "@/lib/tint";
// The C4/flowchart exporters' wash registry, shared: the on-screen surface
// gradient baked into <defs> as concrete sRGB stops.
import { WashRegistry } from "@/lib/wash";
import type { UseCaseLabFile } from "@/types";

// Cross-feature on purpose, the imports every exporter leans on: one
// definition of the author-colour precedence and of "resolve a theme token
// to a concrete colour".
import { resolveTagColor } from "@/features/editor/lib/node-colors";
import type { ExportTheme } from "@/features/viewer/export/theme";
import { resolveTagPaint } from "@/features/viewer/export/theme";

import type { LaidUseCaseElement } from "../lib/layout";
import { layoutUseCase, UC } from "../lib/layout";
import {
  actorFigure,
  BOUNDARY_RADIUS,
  DEPENDENCY_DASH,
  dependencyHeadPath,
  generalizationTrianglePath,
  polylinePath,
  USECASE_ROLE_BY_KIND,
} from "../lib/shapes";

const FONT_SANS =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

/** What the download path writes (SVG) or rasterises (PNG). */
export interface RenderedUseCaseSvg {
  svg: string;
  width: number;
  height: number;
}

/**
 * Renders the whole document. `theme` must come from `resolveExportTheme()`
 * at export time so the file matches the screen the reader is looking at;
 * injected rather than resolved here so this stays callable from anywhere
 * that already holds a palette — including the check script, which passes a
 * stub palette in Node.
 */
export function renderUseCaseSvg(
  file: UseCaseLabFile,
  theme: ExportTheme,
): RenderedUseCaseSvg {
  const layout = layoutUseCase(file);
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

  /* ---- boundaries (context first — the paint order the screen uses) ------ */
  for (const boundary of layout.boundaries) {
    const wash =
      boundary.tint !== undefined
        ? `fill="${escapeXml(boundary.tint)}" fill-opacity="${TINT_WASH_OPACITY}"`
        : `fill="${theme.canvas}" fill-opacity="0.45"`;
    push(
      `<rect x="${fmt(boundary.x)}" y="${fmt(boundary.y)}" width="${fmt(boundary.width)}" height="${fmt(boundary.height)}" rx="${BOUNDARY_RADIUS}" ${wash} stroke="${theme.nodeBorder}" stroke-width="1.25"/>`,
    );
    push(
      `<text x="${fmt(boundary.labelBox.x)}" y="${fmt(boundary.labelBox.y + UC.boundaryTitleFontSize)}" font-size="${UC.boundaryTitleFontSize}" font-weight="600" fill="${theme.mutedForeground}">${escapeXml(boundary.label)}</text>`,
    );
  }

  /* ---- edges -------------------------------------------------------------- */
  for (const edge of layout.edges) {
    if (edge.points.length < 2) continue;
    push(`<g class="af-export-uc-edge" data-uc-kind="${edge.kind}">`);
    const dash =
      edge.kind === "dependency"
        ? ` stroke-dasharray="${DEPENDENCY_DASH}"`
        : "";
    push(
      `<path class="af-export-uc-line" d="${polylinePath(edge.points)}" fill="none" stroke="${theme.edge}" stroke-width="1.5"${dash}/>`,
    );
    if (edge.kind === "dependency") {
      push(
        `<path class="af-export-uc-head" d="${dependencyHeadPath(edge.points)}" fill="${theme.edge}" stroke="none"/>`,
      );
    }
    if (edge.kind === "generalization") {
      // HOLLOW: the canvas colour fills the triangle — the UML "is-a" mark.
      push(
        `<path class="af-export-uc-tri" d="${generalizationTrianglePath(edge)}" fill="${theme.canvas}" stroke="${theme.edge}" stroke-width="1.5" stroke-linejoin="round"/>`,
      );
    }
    const box = edge.labelBox;
    if (box !== null) {
      push(`<g class="af-export-uc-elabel">`);
      push(
        `<rect x="${fmt(box.x)}" y="${fmt(box.y)}" width="${fmt(box.width)}" height="${fmt(box.height)}" rx="4" fill="${theme.canvas}" fill-opacity="0.88"/>`,
      );
      edge.labelLines.forEach((line, index) => {
        push(
          `<text x="${fmt(box.x + UC.labelPadX)}" y="${fmt(
            box.y +
              UC.labelPadY +
              index * UC.labelLineHeight +
              UC.labelFontSize -
              2,
          )}" font-size="${UC.labelFontSize}" font-style="italic" fill="${theme.mutedForeground}">${escapeXml(line)}</text>`,
        );
      });
      push(`</g>`);
    }
    push(`</g>`);
  }

  /* ---- elements ------------------------------------------------------------
   * Buffered so the wash <defs> can be emitted BEFORE first use — the C4
   * exporter's ordering, which strict rasterisers prefer. */
  const wash = new WashRegistry();
  const elementParts: string[] = [];
  for (const element of layout.elements) {
    const paint = elementExportPaint(element, file.metadata.tagColors, theme);
    elementParts.push(
      `<g class="af-export-uc-element" data-uc-kind="${element.kind}">`,
    );
    if (element.kind === "usecase") {
      const washFill = wash.ref(paint.fill, paint.stroke);
      elementParts.push(
        `<ellipse cx="${fmt(element.cx)}" cy="${fmt(element.cy)}" rx="${fmt(element.rx)}" ry="${fmt(element.ry)}" fill="${washFill}" stroke="${paint.stroke}" stroke-width="1.5"/>`,
      );
      const textTop = element.cy - element.labelBox.height / 2;
      element.lines.forEach((line, index) => {
        elementParts.push(
          `<text x="${fmt(element.cx)}" y="${fmt(textTop + index * UC.lineHeight + UC.nodeFontSize)}" text-anchor="middle" font-size="${UC.nodeFontSize}" font-weight="600" fill="${theme.nodeForeground}">${escapeXml(line)}</text>`,
        );
      });
      if (element.technology !== undefined) {
        elementParts.push(
          `<text x="${fmt(element.cx)}" y="${fmt(
            textTop +
              element.lines.length * UC.lineHeight +
              UC.metaFontSize +
              1,
          )}" text-anchor="middle" font-size="${UC.metaFontSize}" fill="${theme.nodeMeta}">[${escapeXml(element.technology)}]</text>`,
        );
      }
    } else {
      const figure = actorFigure(element);
      elementParts.push(
        `<circle cx="${fmt(figure.head.cx)}" cy="${fmt(figure.head.cy)}" r="${fmt(figure.head.r)}" fill="${paint.fill}" stroke="${paint.stroke}" stroke-width="1.5"/>`,
      );
      for (const stroke of figure.strokes) {
        elementParts.push(
          `<path d="${stroke}" fill="none" stroke="${paint.stroke}" stroke-width="1.5" stroke-linecap="round"/>`,
        );
      }
      element.lines.forEach((line, index) => {
        elementParts.push(
          `<text x="${fmt(element.cx)}" y="${fmt(element.labelBox.y + index * UC.lineHeight + UC.nodeFontSize)}" text-anchor="middle" font-size="${UC.nodeFontSize}" font-weight="600" fill="${theme.foreground}">${escapeXml(line)}</text>`,
        );
      });
      if (element.technology !== undefined) {
        elementParts.push(
          `<text x="${fmt(element.cx)}" y="${fmt(
            element.labelBox.y +
              element.lines.length * UC.lineHeight +
              UC.metaFontSize +
              1,
          )}" text-anchor="middle" font-size="${UC.metaFontSize}" fill="${theme.mutedForeground}">[${escapeXml(element.technology)}]</text>`,
        );
      }
    }
    elementParts.push(`</g>`);
  }
  push(`<defs>${wash.markup()}</defs>`);
  for (const part of elementParts) push(part);

  /* ---- heading ------------------------------------------------------------ */
  layout.heading.titleLines.forEach((line, index) => {
    push(
      `<text x="${UC.marginX}" y="${fmt(UC.marginTop + UC.titleFontSize + index * UC.titleLineHeight)}" font-size="${UC.titleFontSize}" font-weight="600" fill="${theme.foreground}">${escapeXml(line)}</text>`,
    );
  });
  layout.heading.descriptionLines.forEach((line, index) => {
    push(
      `<text x="${UC.marginX}" y="${fmt(
        UC.marginTop +
          layout.heading.titleLines.length * UC.titleLineHeight +
          UC.titleDescriptionGap +
          UC.descriptionFontSize +
          index * UC.descriptionLineHeight,
      )}" font-size="${UC.descriptionFontSize}" fill="${theme.mutedForeground}">${escapeXml(line)}</text>`,
    );
  });

  push("</svg>");
  return { svg: parts.join(""), width: layout.width, height: layout.height };
}

/**
 * The concrete paint for one element: the author's `tagColors` entry
 * (resolved through the SAME oklch rebuild the screen uses) beats the
 * kind's token pair — identical precedence to the screen renderer. The
 * kind's pair is read through `ExportTheme.nodeRoles` with
 * `USECASE_ROLE_BY_KIND`, the same aliases the stylesheet declares, so the
 * export and the screen cannot resolve different pairs.
 */
function elementExportPaint(
  element: LaidUseCaseElement,
  tagColors: Readonly<Record<string, string>> | undefined,
  theme: ExportTheme,
): { fill: string; stroke: string } {
  const tagColor = resolveTagColor(
    { tags: element.tags === undefined ? undefined : [...element.tags] },
    tagColors,
  );
  if (tagColor !== null) return resolveTagPaint(tagColor, theme);
  const role = theme.nodeRoles[USECASE_ROLE_BY_KIND[element.kind]];
  return { fill: role.fill, stroke: role.border };
}

/**
 * Rasterises the rendered SVG to a PNG blob at `scale`× — through the
 * SHARED rasteriser in `@/lib/gif` (blob URL → Image → canvas), not a
 * private copy: every exporter converged on that code already.
 */
export async function renderUseCasePngBlob(
  rendered: RenderedUseCaseSvg,
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

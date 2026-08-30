/**
 * `ErLabFile` → a standalone SVG string, rendered FROM THE MODEL. Same
 * contract as `features/dict/export/render-svg.ts`: it shares `layoutEr` with
 * the canvas, so the file and the screen cannot disagree about a box or a
 * route, and duplicates only the PAINTING — because the canvas paints with
 * `var(--token)`, which means nothing in a file opened outside the app.
 *
 * THE CROW'S FEET ARE COMPOSED THE SAME WAY HERE as in the canvas — a BAR for
 * "at least one", a RING for "zero allowed", a FAN for "many" — and from the
 * layout's own direction vectors, so an exported foot faces the box it touches
 * exactly as the drawn one does. Getting this wrong is invisible until someone
 * opens the file: a reversed foot is still a foot.
 *
 * NO ANIMATION IS EMITTED: the pulse and the focus current are reading aids
 * for someone watching the page, and a still frame of a travelling mark is a
 * stray dash.
 */

import type { ErLabFile } from "@/types";

import type { ExportTheme } from "@/features/viewer/export/theme";
import { resolveExportGround } from "@/features/viewer/export/ground";
import type { RenderedSvg } from "@/features/viewer/export/render-svg";

import {
  ER,
  LABEL_PLATE_HALF_HEIGHT,
  labelPlateWidth,
  layoutEr,
} from "../lib/layout";
import type { LaidErEnd } from "../lib/layout";

const FONT_SANS =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

const esc = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** One end's glyph, composed from the same two marks the canvas composes. */
function endGlyph(end: LaidErEnd, stroke: string): string {
  const { x, y, dx, dy, cardinality } = end;
  const ax = dx * ER.footLength;
  const ay = dy * ER.footLength;
  const px = -dy * ER.footSpread;
  const py = dx * ER.footSpread;
  const many = cardinality === "one-or-more" || cardinality === "zero-or-more";
  const optional =
    cardinality === "zero-or-one" || cardinality === "zero-or-more";
  const barT = many ? 1 : 0.55;
  const bx = x + ax * barT;
  const by = y + ay * barT;

  const parts: string[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number): void => {
    parts.push(
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round"/>`,
    );
  };
  if (many) {
    line(x, y, x + ax + px, y + ay + py);
    line(x, y, x + ax - px, y + ay - py);
    line(x, y, x + ax, y + ay);
  }
  line(bx + px, by + py, bx - px, by - py);
  if (optional) {
    parts.push(
      `<circle cx="${x + ax * (many ? 1.7 : 1.4)}" cy="${y + ay * (many ? 1.7 : 1.4)}" ` +
        `r="${ER.footSpread * 0.6}" fill="none" stroke="${stroke}" stroke-width="1.6"/>`,
    );
  }
  return parts.join("");
}

export function renderErSvg(file: ErLabFile, theme: ExportTheme): RenderedSvg {
  const layout = layoutEr(file);
  const parts: string[] = [];
  const push = (part: string): void => {
    parts.push(part);
  };

  /* THE GROUND THE DRAWING WAS READ ON — the sheet, carried into the file.
     `viewer/export/ground.ts` records why this reverses an earlier decision to
     keep it out. Directly after the backdrop and before any of the drawing, so
     it is under everything; full-bleed, including any export padding, because
     a sheet does not stop where the drawing stops. */
  const ground = resolveExportGround();
  push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" ` +
      `viewBox="0 0 ${layout.width} ${layout.height}" font-family="${FONT_SANS}">`,
  );
  push(
    `<rect x="0" y="0" width="${layout.width}" height="${layout.height}" fill="${theme.canvas}"/>`,
  );
  push(`<defs>${ground.defs}</defs>`);
  push(ground.layers(0, 0, layout.width, layout.height));

  /* Relationships first, so a line is never drawn over a box it only passes —
     the paint order the canvas uses. */
  for (const relationship of layout.relationships) {
    const d = relationship.points
      .map((point, at) => `${at === 0 ? "M" : "L"} ${point.x} ${point.y}`)
      .join(" ");
    push(
      `<path d="${d}" fill="none" stroke="${theme.edge}" stroke-width="1.5" stroke-linejoin="round"` +
        (relationship.kind === "non-identifying"
          ? ' stroke-dasharray="6 5"'
          : "") +
        "/>",
    );
    push(endGlyph(relationship.fromEnd, theme.edge));
    push(endGlyph(relationship.toEnd, theme.edge));
    if (relationship.label !== undefined) {
      const label = relationship.label;
      /* The same plate the canvas draws — node surface, node border,
         node-foreground text. Sized with the shared character ratio, not a
         hand-tuned multiplier, so the exported label cannot overhang a plate
         the screen's does not. */
      const plate = labelPlateWidth(label);
      push(
        `<rect x="${relationship.labelX - plate / 2}" y="${relationship.labelY - 11}" ` +
          `width="${plate}" height="${LABEL_PLATE_HALF_HEIGHT * 2}" rx="${LABEL_PLATE_HALF_HEIGHT}" fill="${theme.node}" ` +
          `stroke="${theme.nodeBorder}" stroke-width="1"/>`,
      );
      push(
        `<text x="${relationship.labelX}" y="${relationship.labelY}" text-anchor="middle" ` +
          `dominant-baseline="central" font-size="12" font-weight="500" ` +
          `fill="${theme.nodeForeground}">${esc(label)}</text>`,
      );
    }
  }

  for (const entity of layout.entities) {
    push(
      `<rect x="${entity.x}" y="${entity.y}" width="${entity.width}" height="${entity.height}" ` +
        `rx="12" fill="${theme.node}" stroke="${theme.nodeBorder}" stroke-width="1.2"/>`,
    );
    /* The header band, as a top-rounded path so it follows the box's own
       radius above and sits flush on the rule below. */
    const r = 12;
    const h = ER.headerHeight;
    push(
      `<path d="M ${entity.x} ${entity.y + h} L ${entity.x} ${entity.y + r} ` +
        `Q ${entity.x} ${entity.y} ${entity.x + r} ${entity.y} ` +
        `L ${entity.x + entity.width - r} ${entity.y} ` +
        `Q ${entity.x + entity.width} ${entity.y} ${entity.x + entity.width} ${entity.y + r} ` +
        `L ${entity.x + entity.width} ${entity.y + h} Z" fill="${theme.primary}" opacity="0.11"/>`,
    );
    if (entity.attributes.length > 0) {
      push(
        `<line x1="${entity.x}" y1="${entity.y + h}" x2="${entity.x + entity.width}" y2="${entity.y + h}" ` +
          `stroke="${theme.nodeBorder}" stroke-width="1.2"/>`,
      );
    }
    push(
      `<text x="${entity.x + ER.padX}" y="${entity.y + h / 2}" dominant-baseline="central" ` +
        `font-size="${ER.labelSize}" font-weight="650" fill="${theme.nodeForeground}">${esc(entity.label)}</text>`,
    );
    if (entity.technology !== undefined) {
      push(
        `<text x="${entity.x + entity.width - ER.padX}" y="${entity.y + h / 2}" text-anchor="end" ` +
          `dominant-baseline="central" font-size="${ER.rowSize - 1}" fill="${theme.nodeMeta}">${esc(entity.technology)}</text>`,
      );
    }
    for (const attribute of entity.attributes) {
      push(
        `<text x="${attribute.nameX}" y="${attribute.y}" dominant-baseline="central" ` +
          `font-size="${ER.rowSize}" fill="${theme.nodeForeground}">${esc(attribute.name)}</text>`,
      );
      if (attribute.keysX !== null) {
        push(
          `<text x="${attribute.keysX}" y="${attribute.y}" text-anchor="end" dominant-baseline="central" ` +
            `font-size="${ER.rowSize - 1.5}" font-weight="700" letter-spacing="0.3" ` +
            `fill="${theme.primary}">${esc(attribute.keys)}</text>`,
        );
      }
      push(
        `<text x="${attribute.typeX}" y="${attribute.y}" text-anchor="end" dominant-baseline="central" ` +
          `font-size="${ER.rowSize}" fill="${theme.nodeMeta}">${esc(attribute.type)}</text>`,
      );
    }
  }

  push("</svg>");
  return { svg: parts.join(""), width: layout.width, height: layout.height };
}

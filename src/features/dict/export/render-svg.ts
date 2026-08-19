/**
 * `DictLabFile` → a standalone SVG string, rendered FROM THE MODEL.
 *
 * NOT A CLONE OF THE LIVE DOM, the rule every exporter here follows bar the
 * sequence one. Rendering from the model means an export is correct
 * mid-scroll, needs no element on screen, and can run in a check script — in
 * Node, where there is no DOM at all.
 *
 * IT SHARES `layoutDict` WITH THE CANVAS, so the file and the screen cannot
 * disagree about a column width or a wrapped line. What is duplicated is only
 * the PAINTING, and only because the canvas paints with `var(--token)` — which
 * means nothing in a file opened outside the app — while this paints the
 * concrete colours `resolveExportTheme()` read out of the live document at
 * export time. That is the whole reason two renderers exist.
 *
 * NO ANIMATION IS EMITTED. The canvas's reveal is a reading aid for someone
 * watching the page; a still image of a half-revealed table is just a table
 * with rows missing.
 */

import type { DictLabFile } from "@/types";

import type { ExportTheme } from "@/features/viewer/export/theme";
import type { RenderedSvg } from "@/features/viewer/export/render-svg";

import { BADGE, COLUMN_LABEL, DICT, layoutDict } from "../lib/layout";
import type { DictColumn } from "../lib/layout";

const FONT_SANS =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
const FONT_MONO =
  "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

/** XML-escape — every string here comes from a user document. */
const esc = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** The badge palette, resolved. Mirrors `FLAG_PAINT` in the canvas: outlined
 * for all but `pii`, the one solid badge. */
function badgePaint(
  flag: string,
  theme: ExportTheme,
): { mark: string; solid: boolean; text: string } {
  if (flag === "required") {
    return { mark: theme.primary, solid: false, text: theme.primary };
  }
  if (flag === "unique") {
    return { mark: theme.accent, solid: false, text: theme.accent };
  }
  if (flag === "pii") {
    return {
      mark: theme.destructive,
      solid: true,
      text: theme.destructiveForeground,
    };
  }
  return { mark: theme.nodeMeta, solid: false, text: theme.nodeMeta };
}

export function renderDictSvg(
  file: DictLabFile,
  theme: ExportTheme,
): RenderedSvg {
  const layout = layoutDict(file);
  const right = layout.columnX.source + layout.columnWidth.source;
  const parts: string[] = [];
  const push = (part: string): void => {
    parts.push(part);
  };

  push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" ` +
      `viewBox="0 0 ${layout.width} ${layout.height}" font-family="${FONT_SANS}">`,
  );
  /* An explicit backdrop: without one the file composites over whatever the
     viewer paints behind it — black in most image viewers. */
  push(
    `<rect x="0" y="0" width="${layout.width}" height="${layout.height}" fill="${theme.canvas}"/>`,
  );

  if (layout.title !== null) {
    push(
      `<text x="${layout.columnX.name - DICT.padX}" y="${layout.titleY}" dominant-baseline="central" ` +
        `font-size="22" font-weight="700" fill="${theme.foreground}">${esc(layout.title)}</text>`,
    );
  }

  for (const section of layout.sections) {
    push(
      `<text x="${layout.columnX.name}" y="${section.y + DICT.sectionHeight / 2 - 4}" ` +
        `dominant-baseline="central" font-size="${DICT.labelSize}" font-weight="650" ` +
        `fill="${theme.foreground}">${esc(section.label)}</text>`,
    );
    if (section.technology !== undefined) {
      push(
        `<text x="${right}" y="${section.y + DICT.sectionHeight / 2 - 4}" text-anchor="end" ` +
          `dominant-baseline="central" font-size="${DICT.cellSize - 1}" ` +
          `fill="${theme.mutedForeground}">${esc(section.technology)}</text>`,
      );
    }
    push(
      `<rect x="${layout.columnX.name - DICT.padX}" y="${section.headerY - DICT.padX * 0.5}" ` +
        `width="${right - layout.columnX.name + DICT.padX * 2}" ` +
        `height="${section.y + section.height - section.headerY + DICT.padX * 0.5}" ` +
        `rx="10" fill="${theme.node}" stroke="${theme.nodeBorder}" stroke-width="1"/>`,
    );
    for (const column of Object.keys(COLUMN_LABEL) as DictColumn[]) {
      push(
        `<text x="${layout.columnX[column] + DICT.padX}" y="${section.headerY + DICT.headerHeight / 2}" ` +
          `dominant-baseline="central" font-size="${DICT.headerSize}" font-weight="600" ` +
          `letter-spacing="0.6" fill="${theme.mutedForeground}">${esc(COLUMN_LABEL[column].toUpperCase())}</text>`,
      );
    }
    push(
      `<line x1="${layout.columnX.name}" y1="${section.headerY + DICT.headerHeight}" ` +
        `x2="${right}" y2="${section.headerY + DICT.headerHeight}" stroke="${theme.nodeBorder}" stroke-width="1"/>`,
    );

    section.fields.forEach((field, index) => {
      if (index > 0) {
        push(
          `<line x1="${layout.columnX.name - DICT.padX * 0.4}" y1="${field.y}" ` +
            `x2="${right + DICT.padX * 0.4}" y2="${field.y}" stroke="${theme.nodeBorder}" ` +
            `stroke-width="1" opacity="0.55"/>`,
        );
      }
      const baseline = field.y + DICT.lineHeight * 1.15;
      const description = field.cells.find((c) => c.column === "description");

      for (const cell of field.cells) {
        if (cell.column === "flags") {
          let x = cell.x;
          for (const flag of field.flags) {
            const paint = badgePaint(flag, theme);
            const width =
              flag.length * BADGE.size * BADGE.ratio + BADGE.padX * 2;
            push(
              `<rect x="${x}" y="${baseline - BADGE.height / 2}" width="${width}" ` +
                `height="${BADGE.height}" rx="${BADGE.radius}" fill="${paint.solid ? paint.mark : "none"}" ` +
                `stroke="${paint.mark}" stroke-width="1.3"/>`,
            );
            push(
              `<text x="${x + width / 2}" y="${baseline}" text-anchor="middle" ` +
                `dominant-baseline="central" font-size="${BADGE.size}" font-weight="700" ` +
                `letter-spacing="0.2" fill="${paint.text}">${esc(flag)}</text>`,
            );
            x += width + BADGE.gap;
          }
          continue;
        }
        const mono = cell.column === "name" || cell.column === "type";
        cell.lines.forEach((line, lineIndex) => {
          push(
            `<text x="${cell.x}" y="${baseline + lineIndex * DICT.lineHeight}" ` +
              `dominant-baseline="central" font-size="${DICT.cellSize}" ` +
              `font-weight="${cell.column === "name" ? 600 : 400}" ` +
              (mono ? `font-family="${FONT_MONO}" ` : "") +
              `fill="${cell.column === "description" ? theme.nodeForeground : theme.nodeMeta}">${esc(line)}</text>`,
          );
        });
      }

      [
        field.values === undefined ? null : `Values: ${field.values}`,
        field.example === undefined ? null : `e.g. ${field.example}`,
      ]
        .filter((line): line is string => line !== null)
        .forEach((line, extraIndex) => {
          push(
            `<text x="${description?.x ?? layout.columnX.description + DICT.padX}" ` +
              `y="${baseline + (Math.max(1, description?.lines.length ?? 1) + extraIndex) * DICT.lineHeight}" ` +
              `dominant-baseline="central" font-size="${DICT.cellSize - 1}" font-style="italic" ` +
              `fill="${theme.mutedForeground}">${esc(line)}</text>`,
          );
        });
    });
  }

  push("</svg>");
  return { svg: parts.join(""), width: layout.width, height: layout.height };
}

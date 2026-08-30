/**
 * `TimelineLabFile` → a standalone SVG string, rendered FROM THE MODEL. Same
 * contract as `features/gantt/export/render-svg.ts` and
 * `features/er/export/render-svg.ts`: it shares `layoutTimeline` with the
 * canvas, so the file and the screen cannot disagree about where a dot sits,
 * how a sentence wrapped or how tall a period band is, and duplicates only the
 * PAINTING — because the canvas paints with `var(--token)`, which means
 * nothing in a file opened outside the app, while this paints the concrete
 * colours `resolveExportTheme()` read out of the live document.
 *
 * THE WRAPPING IS NOT DUPLICATED. `labelLines` and `descriptionLines` come off
 * the layout, already wrapped by the same `wrapText` the canvas draws from —
 * an exported label that broke at a different word from the drawn one would be
 * a picture that contradicts the screenshot beside it, and re-wrapping here
 * would be a second answer to a question the layout already answered.
 *
 * NO ANIMATION IS EMITTED: the entrance, the spine sweep and the focus breathe
 * are reading aids for someone watching the page, and a still frame of a
 * travelling mark is a stray dash. Nothing focus-related is emitted either —
 * an export has no focus, so every event paints at full strength. There is no
 * hatch-style exception here, unlike the gantt's, because nothing on this
 * canvas is textured: what the file ships is exactly the resting frame.
 */

import { diagramHeadingMarkup } from "@/lib/diagram-heading";
import { diagramSurfaceMarkup } from "@/lib/diagram-surface";
import type { TimelineLabFile } from "@/types";

import type { ExportTheme } from "@/features/viewer/export/theme";
import { resolveExportGround } from "@/features/viewer/export/ground";
import type { RenderedSvg } from "@/features/viewer/export/render-svg";

import {
  TIMELINE_HEADING_METRICS,
  TIMELINE,
  layoutTimeline,
} from "../lib/layout";

/**
 * Air around the exported diagram, on all four sides, in user units.
 *
 * WHY THE FILE NEEDS ITS OWN. Nothing on this canvas is laid out with a
 * margin: the period rail starts at x=0 and the period rules run from x=0. On
 * screen that is fine because the viewer supplies the air in CSS (`px-5 py-6
 * sm:px-8` on the scroll box) — but an exported file inherits no stylesheet,
 * so without this the rail comes out flush against the left edge. The raster
 * step adds nothing either: `renderPngBlob` is a pure scale-and-blit.
 *
 * WHY 40. There is NO shared export margin in this repo — each kind carries
 * its own and they disagree on purpose (C4 56, ER 40, gantt 40, dictionary 28,
 * flowchart and use case 28). This is a wide canvas with a rail and a text
 * column, much closer to the gantt's plot than to a compact table, so it takes
 * the same 40. It lives in this file rather than in `TIMELINE` deliberately:
 * `TIMELINE` is shared with the on-screen canvas and the layout check, and the
 * screen already has its air from CSS — putting the pad in the geometry would
 * move every dot on the page to fix a file.
 */
const EXPORT_PADDING = 40;

const FONT_SANS =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

/** XML-escape — every string here comes from a user document. */
const esc = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function renderTimelineSvg(
  file: TimelineLabFile,
  theme: ExportTheme,
): RenderedSvg {
  const layout = layoutTimeline(file);
  const parts: string[] = [];
  const push = (part: string): void => {
    parts.push(part);
  };
  const text = (
    x: number,
    y: number,
    body: string,
    attributes: string,
  ): void => {
    push(`<text x="${x}" y="${y}" ${attributes}>${esc(body)}</text>`);
  };

  /* The FILE is the diagram plus its air; the layout keeps its own coordinates
     and is translated into place, which is the C4 exporter's arrangement. The
     background rect is emitted OUTSIDE that group so it covers the padding too
     — inside it, the ground would be inset by exactly the margin it exists to
     fill and the pad would export transparent. */
  const width = layout.width + EXPORT_PADDING * 2;
  const height = layout.height + EXPORT_PADDING * 2;

  /* THE GROUND THE DRAWING WAS READ ON — the sheet, carried into the file.
     `viewer/export/ground.ts` records why this reverses an earlier decision to
     keep it out. Directly after the backdrop and before any of the drawing, so
     it is under everything; full-bleed, including any export padding, because
     a sheet does not stop where the drawing stops. */
  const ground = resolveExportGround();
  push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
      `viewBox="0 0 ${width} ${height}" font-family="${FONT_SANS}">`,
  );
  push(
    `<rect x="0" y="0" width="${width}" height="${height}" fill="${theme.canvas}"/>`,
  );
  push(`<defs>${ground.defs}</defs>`);
  push(ground.layers(0, 0, width, height));
  /* THE DIAGRAM'S SHEET, painted on the ground and under the drawing — the
     same panel the screen draws, from the same geometry, so a downloaded file
     is framed the way the reader saw it. Outside the translate below, because
     it is positioned in the FILE's coordinates and told where the drawing's
     origin lands. */
  push(
    diagramSurfaceMarkup({
      width: layout.width,
      height: layout.height,
      stroke: theme.nodeBorder,
      fill: theme.node,
      originX: EXPORT_PADDING,
      originY: EXPORT_PADDING,
    }),
  );
  push(`<g transform="translate(${EXPORT_PADDING} ${EXPORT_PADDING})">`);

  /* THE DOCUMENT'S TITLE, first inside the group so it sits in the drawing's
     own coordinates — the same block the canvas draws, from the same metrics.
     An exported timeline with no title belongs to nothing. */
  push(
    diagramHeadingMarkup({
      heading: layout.heading,
      x: TIMELINE.railWidth - 100,
      top: 0,
      metrics: TIMELINE_HEADING_METRICS,
      titleFill: theme.foreground,
      descriptionFill: theme.mutedForeground,
    }),
  );

  /* Period rules first, so nothing is ruled across — the paint order the
     canvas uses, for the same reason. */
  for (const period of layout.periods) {
    push(
      `<line x1="0" y1="${period.ruleY}" x2="${TIMELINE.width - 20}" y2="${period.ruleY}" ` +
        `stroke="${theme.canvasGrid}" stroke-width="1" opacity="0.55"/>`,
    );
    text(
      TIMELINE.railWidth,
      period.labelY,
      period.label.toUpperCase(),
      `text-anchor="end" font-size="${TIMELINE.periodSize}" font-weight="600" ` +
        `letter-spacing="0.13em" fill="${theme.mutedForeground}"`,
    );
  }

  push(
    `<line x1="${layout.spineX}" y1="${layout.spineY0}" x2="${layout.spineX}" y2="${layout.spineY1}" ` +
      `stroke="${theme.canvasGrid}" stroke-width="2" stroke-linecap="round"/>`,
  );

  for (const event of layout.events) {
    push(
      `<circle cx="${layout.spineX}" cy="${event.dotY}" r="${TIMELINE.dotRadius}" ` +
        `fill="${theme.node}" stroke="${theme.primary}" stroke-width="2.25"/>`,
    );
    event.labelLines.forEach((line, index) => {
      text(
        TIMELINE.labelX,
        event.labelY + index * TIMELINE.labelLineHeight,
        line,
        `font-size="${TIMELINE.labelSize}" fill="${theme.nodeForeground}"`,
      );
    });
    if (event.descY !== null) {
      const descY = event.descY;
      event.descriptionLines.forEach((line, index) => {
        text(
          TIMELINE.labelX,
          descY + index * TIMELINE.descLineHeight,
          line,
          `font-size="${TIMELINE.descSize}" fill="${theme.nodeMeta}"`,
        );
      });
    }
  }

  push("</g>");
  push("</svg>");
  return { svg: parts.join(""), width, height };
}

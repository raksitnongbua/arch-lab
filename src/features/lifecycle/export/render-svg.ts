/**
 * `LifecycleLabFile` → a standalone SVG string, rendered FROM THE MODEL. Same
 * contract as `features/timeline/export/render-svg.ts` and
 * `features/gantt/export/render-svg.ts`: it shares `layoutLifecycle` with the
 * canvas, so the file and the screen cannot disagree about where a dot sits,
 * how a sentence wrapped, or which channel a returning branch travelled in,
 * and it duplicates only the PAINTING — because the canvas paints with
 * `var(--token)`, which means nothing in a file opened outside the app, while
 * this paints the concrete colours `resolveExportTheme()` read out of the live
 * document.
 *
 * THE WRAPPING IS NOT DUPLICATED. Every `*Lines` array comes off the layout,
 * already wrapped by the same `wrapText` the canvas draws from — an exported
 * label that broke at a different word from the drawn one would be a picture
 * that contradicts the screenshot beside it, and re-wrapping here would be a
 * second answer to a question the layout already answered. THE REJOIN ROUTES
 * ARE NOT DUPLICATED EITHER, and that matters more: a second router here could
 * put a branch through a state the on-screen one avoids, and the file would be
 * wrong in exactly the way nobody re-checks.
 *
 * NO ANIMATION IS EMITTED: the entrance, the spine sweep and the focused
 * travelling dash are reading aids for someone watching the page, and a still
 * frame of a travelling mark is a stray dash. Nothing focus-related is emitted
 * either — an export has no focus, so every row paints at full strength,
 * EXCEPT an unreachable state, which is faded here as it is on screen: that
 * fade is a fact about the document rather than a state of the canvas, so a
 * file that dropped it would say the subject can get somewhere it cannot.
 */

import { diagramHeadingMarkup } from "@/lib/diagram-heading";
import { diagramSurfaceMarkup } from "@/lib/diagram-surface";
import type { LifecycleLabFile } from "@/types";

import type { ExportTheme } from "@/features/viewer/export/theme";
import { resolveExportGround } from "@/features/viewer/export/ground";
import type { RenderedSvg } from "@/features/viewer/export/render-svg";

import {
  LIFECYCLE_HEADING_METRICS,
  LIFECYCLE,
  layoutLifecycle,
} from "../lib/layout";

/**
 * Air around the exported diagram, on all four sides, in user units.
 *
 * WHY THE FILE NEEDS ITS OWN. Nothing on this canvas is laid out with a
 * margin: the rejoin channels start at x=20 and the subject heading sits at
 * the top pad. On screen that is fine because the viewer supplies the air in
 * CSS (`px-5 py-6 sm:px-8` on the scroll box) — but an exported file inherits
 * no stylesheet, so without this the leftmost channel comes out almost flush
 * against the edge. The raster step adds nothing either: `renderPngBlob` is a
 * pure scale-and-blit.
 *
 * WHY 40. There is NO shared export margin in this repo — each kind carries
 * its own and they disagree on purpose (C4 56, ER 40, gantt 40, timeline 40,
 * dictionary 28, flowchart and use case 28). This is a wide canvas with two
 * text columns and a routing lane, the same family as the gantt's plot and the
 * timeline's rail, so it takes the same 40. It lives in this file rather than
 * in `LIFECYCLE` deliberately: `LIFECYCLE` is shared with the on-screen canvas
 * and the layout check, and the screen already has its air from CSS — putting
 * the pad in the geometry would move every dot on the page to fix a file.
 */
const EXPORT_PADDING = 40;

/** What an unreachable state is faded to. The stylesheet's own
 * `[data-reachable="0"]` opacity, duplicated because CSS cannot be imported
 * here — `check:lifecycle-motion` pins the pair, exactly as it pins the
 * stagger cap. */
const UNREACHABLE_OPACITY = 0.42;

const FONT_SANS =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

/** XML-escape — every string here comes from a user document. */
const esc = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function renderLifecycleSvg(
  file: LifecycleLabFile,
  theme: ExportTheme,
): RenderedSvg {
  const layout = layoutLifecycle(file);
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
     An exported lifecycle with no title belongs to nothing. */
  push(
    diagramHeadingMarkup({
      heading: layout.heading,
      x: LIFECYCLE.channelX0,
      top: 0,
      metrics: LIFECYCLE_HEADING_METRICS,
      titleFill: theme.foreground,
      descriptionFill: theme.mutedForeground,
    }),
  );

  layout.subject.labelLines.forEach((line, index) => {
    text(
      LIFECYCLE.stateLabelX,
      layout.subject.labelY + index * LIFECYCLE.subjectLineHeight,
      line,
      `font-size="${LIFECYCLE.subjectSize}" font-weight="600" fill="${theme.foreground}"`,
    );
  });
  if (layout.subject.descY !== null) {
    const descY = layout.subject.descY;
    layout.subject.descriptionLines.forEach((line, index) => {
      text(
        LIFECYCLE.stateLabelX,
        descY + index * LIFECYCLE.subjectDescLineHeight,
        line,
        `font-size="${LIFECYCLE.subjectDescSize}" fill="${theme.mutedForeground}"`,
      );
    });
  }

  push(
    `<line x1="${layout.spineX}" y1="${layout.spineY0}" x2="${layout.spineX}" y2="${layout.spineY1}" ` +
      `stroke="${theme.canvasGrid}" stroke-width="2" stroke-linecap="round"/>`,
  );

  for (const state of layout.states) {
    /* The whole row in ONE group so the unreachable fade lands on the state
       AND its departures together, which is what the canvas's `.af-lc-row`
       does. Fading only the dot would leave a full-strength branch hanging off
       a ghost. */
    push(state.reachable ? "<g>" : `<g opacity="${UNREACHABLE_OPACITY}">`);

    for (const exit of layout.exits.filter((e) => e.from === state.id)) {
      push(
        `<path d="M ${layout.spineX} ${state.dotY} L ${layout.spineX} ${exit.dotY} L ${LIFECYCLE.branchDotX} ${exit.dotY}" ` +
          `fill="none" stroke="${theme.edge}" stroke-width="1.5" stroke-linejoin="round"/>`,
      );
      push(
        `<circle cx="${LIFECYCLE.branchDotX}" cy="${exit.dotY}" r="${LIFECYCLE.exitDotRadius}" ` +
          `fill="${theme.canvas}" stroke="${theme.edge}" stroke-width="1.75"/>`,
      );
      const path = exit.rejoinPath;
      if (path === null) {
        const barX = LIFECYCLE.branchDotX - LIFECYCLE.exitDotRadius - 4;
        push(
          `<line x1="${barX}" y1="${exit.dotY - LIFECYCLE.stopBarHalf}" x2="${barX}" y2="${exit.dotY + LIFECYCLE.stopBarHalf}" ` +
            `stroke="${theme.primary}" stroke-width="2.25" stroke-linecap="round"/>`,
        );
      } else {
        push(
          `<path d="M ${LIFECYCLE.branchDotX} ${exit.dotY} L ${LIFECYCLE.branchDotX} ${path.departY} ` +
            `L ${path.channelX} ${path.departY} L ${path.channelX} ${path.joinY} L ${layout.spineX} ${path.joinY}" ` +
            `fill="none" stroke="${theme.edge}" stroke-width="1.5" stroke-linejoin="round"/>`,
        );
        push(
          `<path d="M ${layout.spineX} ${path.joinY} l -8 -4 l 0 8 z" fill="${theme.edge}"/>`,
        );
      }

      exit.labelLines.forEach((line, index) => {
        text(
          LIFECYCLE.branchTextRight,
          exit.labelY + index * LIFECYCLE.exitLineHeight,
          line,
          `text-anchor="end" font-size="${LIFECYCLE.exitSize}" font-weight="600" fill="${theme.nodeForeground}"`,
        );
      });
      if (exit.whenY !== null) {
        const whenY = exit.whenY;
        exit.whenLines.forEach((line, index) => {
          text(
            LIFECYCLE.branchTextRight,
            whenY + index * LIFECYCLE.whenLineHeight,
            line,
            `text-anchor="end" font-size="${LIFECYCLE.whenSize}" fill="${theme.nodeMeta}"`,
          );
        });
      }
      if (exit.descY !== null) {
        const exitDescY = exit.descY;
        exit.descriptionLines.forEach((line, index) => {
          text(
            LIFECYCLE.branchTextRight,
            exitDescY + index * LIFECYCLE.whenLineHeight,
            line,
            `text-anchor="end" font-size="${LIFECYCLE.whenSize}" fill="${theme.nodeMeta}"`,
          );
        });
      }
    }

    push(
      `<circle cx="${layout.spineX}" cy="${state.dotY}" r="${LIFECYCLE.dotRadius}" ` +
        `fill="${theme.node}" stroke="${theme.primary}" stroke-width="2.25"/>`,
    );
    if (state.final) {
      const barY = state.dotY + LIFECYCLE.dotRadius + 5;
      push(
        `<line x1="${layout.spineX - LIFECYCLE.stopBarHalf}" y1="${barY}" x2="${layout.spineX + LIFECYCLE.stopBarHalf}" y2="${barY}" ` +
          `stroke="${theme.primary}" stroke-width="2.25" stroke-linecap="round"/>`,
      );
    }

    state.labelLines.forEach((line, index) => {
      text(
        LIFECYCLE.stateLabelX,
        state.labelY + index * LIFECYCLE.stateLineHeight,
        line,
        `font-size="${LIFECYCLE.stateSize}" font-weight="600" fill="${theme.nodeForeground}"`,
      );
    });
    if (state.descY !== null) {
      const descY = state.descY;
      state.descriptionLines.forEach((line, index) => {
        text(
          LIFECYCLE.stateLabelX,
          descY + index * LIFECYCLE.stateDescLineHeight,
          line,
          `font-size="${LIFECYCLE.stateDescSize}" fill="${theme.nodeMeta}"`,
        );
      });
    }

    push("</g>");
  }

  push("</g>");
  push("</svg>");
  return { svg: parts.join(""), width, height };
}

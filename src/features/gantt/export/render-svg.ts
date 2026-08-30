/**
 * `GanttLabFile` → a standalone SVG string, rendered FROM THE MODEL. Same
 * contract as `features/er/export/render-svg.ts` and
 * `features/dict/export/render-svg.ts`: it shares `layoutGantt` with the
 * canvas, so the file and the screen cannot disagree about a bar's start, a
 * row's order or a connector's route, and duplicates only the PAINTING —
 * because the canvas paints with `var(--token)`, which means nothing in a file
 * opened outside the app, while this paints the concrete colours
 * `resolveExportTheme()` read out of the live document.
 *
 * THE AXIS LABELS ARE NOT DUPLICATED. `axisLabel` and `axisCaption` come from
 * `../lib/axis`, the same two functions the canvas calls, because an exported
 * axis whose ticks read `W3` where the screen read `21 Sep` would be a picture
 * that contradicts the screenshot beside it — and the calendar rule (UTC,
 * whole days, month ticks drop the day) is exactly the kind of thing a second
 * copy gets subtly wrong.
 *
 * THE STATE COLOURS ARE LOOKED UP, NOT LISTED. Each reporting state resolves
 * to the same theme pair the stylesheet names — three of them live on the
 * role ramp (`nodeRoles`) and `at-risk` on the flowchart's decision pair
 * (`flowShapes`) — so a theme that retunes its ramp retunes the export with
 * it. Writing hex here is how an exported "done" bar ends up a different
 * green from the drawn one.
 *
 * NO ANIMATION IS EMITTED: the entrance, the ambient current, the axis sweep
 * and the focus breathe are reading aids for someone watching the page, and a
 * still frame of a travelling mark is a stray dash. Nothing focus-related is
 * emitted either — an export has no focus, so every row paints at full
 * strength.
 *
 * THE BAR HATCH IS THE ONE EXCEPTION, and it is not an exception to that rule
 * so much as a consequence of it. The hatch is not a travelling mark: it is
 * VISIBLE AT REST on the canvas, part of what a bar looks like when nothing is
 * moving (the stylesheet argues why). This file's job is the resting frame, so
 * omitting it would make the exported file disagree with the screen under
 * reduced motion, with the idle toggle off, and on the crawlable example
 * pages. It is emitted STILL — the tile, no marching group — from
 * `hatchTilePaths()`, which the canvas draws from too, so the two cannot hold
 * different ideas of where a stripe goes.
 */

import { diagramHeadingMarkup } from "@/lib/diagram-heading";
import { diagramSurfaceMarkup } from "@/lib/diagram-surface";
import type { GanttLabFile } from "@/types";

import type { ExportTheme } from "@/features/viewer/export/theme";
import { resolveExportGround } from "@/features/viewer/export/ground";
import type { RenderedSvg } from "@/features/viewer/export/render-svg";

import { TextureRegistry } from "@/features/viewer/export/texture-registry";

import { arrowPoints, axisCaption, axisLabel } from "../lib/axis";
import {
  GANTT_HEADING_METRICS,
  GANTT,
  TEXTURE_BY_STATE,
  hatchTilePaths,
  layoutGantt,
} from "../lib/layout";
import type { LaidGanttItem } from "../lib/layout";

/**
 * The hatch's stroke opacity, duplicated from `--gantt-hatch-opacity` in
 * `gantt-motion.css` because CSS cannot be imported. `check:gantt-motion`
 * pins the pair, in the manner `--gantt-row-cap`/`GANTT.waveCap` are already pinned —
 * an export whose texture is heavier than the screen's is a file that shows
 * the four reporting states less separated than the app does.
 */
const HATCH_OPACITY = 0.18;

/**
 * Air around the exported diagram, on all four sides, in user units.
 *
 * WHY THE FILE NEEDS ITS OWN. Nothing on this canvas is laid out with a margin:
 * the axis caption and every section label start at x=0, the section rules run
 * from x=0, and the last row ends 18 units above the bottom. An exported file
 * inherits no stylesheet, so the PNG came out with the label rail flush against
 * the left edge. The raster step adds nothing either: `renderPngBlob` is a pure
 * scale-and-blit of `width × scale` by `height × scale` drawn at the origin.
 * The crop was in the SVG.
 *
 * AND THE SCREEN NEEDS THE SAME ONE. This header used to say the screen was
 * fine because the viewer supplies the air in CSS (`px-5 py-6 sm:px-8` on the
 * scroll box). That was true until the well grew a field: `CanvasField` is
 * drawn inside the canvas's own `<svg>`, so the ruled sheet now ends exactly
 * where the section headings begin and the CSS padding sits OUTSIDE it, between
 * the sheet and the pane. The screen therefore frames the drawing with
 * `GANTT_FRAME_PAD`, which is this number — see `../lib/layout` for why that
 * lives beside `GANTT` rather than in it.
 *
 * WHY 40, AND WHY THE LITERAL STAYS HERE. There is NO shared export margin in
 * this repo — each kind carries its own, and they disagree on purpose: C4 uses
 * 56 (it also has a title block), ER 40, the dictionary 28, flowchart and use
 * case 28. This canvas is a wide ruled plot much closer to ER's boxes than to a
 * compact dictionary table, so it takes ER's 40. It is spelled out here rather
 * than imported because `check:gantt-layout` reads this literal out of the
 * source to prove the pad is a whole number of hatch tiles — and the same check
 * asserts it equals `GANTT_FRAME_PAD`, so the file and the screen cannot drift
 * into framing the same plan two different ways.
 *
 * A MULTIPLE OF `GANTT.hatchTile`, which is not decoration. The hatch is
 * `patternUnits="userSpaceOnUse"`, so translating the content translates the
 * tile grid with it; the stripes stay locked to the bars either way, but a pad
 * that is a whole number of tiles keeps the grid's PHASE identical to the
 * unpadded file, and an integer pad keeps the 1.6-unit hairlines off half-pixel
 * boundaries at `scale: 1`.
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

/**
 * A bar's fill and border, from the token pair the stylesheet names for that
 * state. A total lookup rather than `find(...)  ?? fallback`: the state is
 * already resolved and closed by the time the layout hands it over, so the key
 * guarantees a hit.
 */
function barPaint(
  state: LaidGanttItem["state"],
  theme: ExportTheme,
): { fill: string; border: string } {
  switch (state) {
    case "done":
      return theme.nodeRoles.queue;
    case "active":
      return theme.nodeRoles.internal;
    case "at-risk":
      return theme.flowShapes.decision;
    case "planned":
      return theme.nodeRoles.external;
  }
}

export function renderGanttSvg(
  file: GanttLabFile,
  theme: ExportTheme,
): RenderedSvg {
  const layout = layoutGantt(file);
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
  /* The plan's own surface — one of the THREE sheet-mounting kinds, with the
     timeline and the lifecycle; `lib/diagram-surface.ts` argues why a spine on
     a ruled ground wants a sheet as much as a lattice does. It holds the
     drawing with `EXPORT_SURFACE_PADDING` of air inside it, and what is left of
     the export padding shows as a margin around it. `--node` fills it and
     `--node-border` rules it, in every theme. */
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

  /* THE ROLE TEXTURES the bars actually wear, collected before the `<defs>` is
     written so only the used tiles are emitted. Under every theme but `eink`
     the registry declines every request and this contributes nothing — not an
     empty `<defs>`, not an invisible overlay — which is what keeps the other
     eight themes' exported bytes identical to what they were.

     THE ROLE TEXTURE IS CONTENT HERE, unlike the well's grid, which this file
     deliberately omits: a gantt's four state fills ARE role tokens, so in a
     hue-free theme this lattice is the only thing saying which state a bar is
     in. Dropping it would export a plan whose bars all report the same thing. */
  const textures = new TextureRegistry(theme);
  const barTextures = new Map<LaidGanttItem, string | null>();
  for (const item of layout.items) {
    if (item.milestone) continue;
    barTextures.set(item, textures.ref(TEXTURE_BY_STATE[item.state]));
  }

  /* The hatch tile, once, exactly as the canvas defines it minus the marching
     group. `edgeDrift` and the opacity are the stylesheet's own token and
     number; keeping them in step with `--gantt-hatch-opacity` is what
     `check:gantt-motion` asserts, since CSS cannot be imported here. */
  push(
    `<defs><pattern id="af-gantt-hatch" patternUnits="userSpaceOnUse" ` +
      `width="${GANTT.hatchTile}" height="${GANTT.hatchTile}">` +
      hatchTilePaths()
        .map(
          (d) =>
            `<path d="${d}" fill="none" stroke="${theme.edgeDrift}" ` +
            `stroke-width="${GANTT.hatchStroke}" stroke-opacity="${HATCH_OPACITY}" stroke-linecap="butt"/>`,
        )
        .join("") +
      `</pattern>` +
      textures.markup() +
      `</defs>`,
  );
  push(`<g transform="translate(${EXPORT_PADDING} ${EXPORT_PADDING})">`);

  /* THE DOCUMENT'S TITLE, first inside the group so it sits in the drawing's
     own coordinates — the same block the canvas draws, from the same metrics.
     An exported gantt with no title belongs to nothing. */
  push(
    diagramHeadingMarkup({
      heading: layout.heading,
      x: 0,
      top: 0,
      metrics: GANTT_HEADING_METRICS,
      titleFill: theme.foreground,
      descriptionFill: theme.mutedForeground,
    }),
  );

  /* The axis first: its grid runs the full height of the plot, so anything
     drawn after sits on top of it. Painting it last would rule lines across
     every bar — the paint order the canvas uses, for the same reason. */
  const axisY = layout.plotTop - 8;
  for (const tick of layout.ticks) {
    push(
      `<line x1="${tick.x}" y1="${axisY}" x2="${tick.x}" y2="${layout.height - 12}" ` +
        `stroke="${theme.nodeBorder}" stroke-opacity="0.4" stroke-width="1" opacity="0.55"/>`,
    );
  }
  push(
    `<line x1="${GANTT.plotX0}" y1="${axisY}" x2="${GANTT.plotX1}" y2="${axisY}" ` +
      `stroke="${theme.nodeBorder}" stroke-opacity="0.4" stroke-width="1"/>`,
  );
  const axisTextAttributes = `font-size="10" fill="${theme.mutedForeground}"`;
  for (const tick of layout.ticks) {
    text(
      tick.x + 4,
      layout.plotTop - 14,
      axisLabel(file, tick, layout.tickStep),
      axisTextAttributes,
    );
  }
  text(0, layout.plotTop - 14, axisCaption(file, layout), axisTextAttributes);

  for (const section of layout.sections) {
    text(
      0,
      section.y + 16,
      section.label.toUpperCase(),
      `font-size="9.5" font-weight="600" letter-spacing="0.13em" ` +
        `fill="${theme.mutedForeground}"`,
    );
    push(
      `<line x1="0" y1="${section.ruleY}" x2="${GANTT.plotX1}" y2="${section.ruleY}" ` +
        `stroke="${theme.nodeBorder}" stroke-opacity="0.4" stroke-width="1" opacity="0.7"/>`,
    );
  }

  for (const item of layout.items) {
    if (item.milestone) {
      push(
        `<polygon points="${item.x0},${item.midY - GANTT.milestoneRadius} ` +
          `${item.x0 + GANTT.milestoneRadius},${item.midY} ` +
          `${item.x0},${item.midY + GANTT.milestoneRadius} ` +
          `${item.x0 - GANTT.milestoneRadius},${item.midY}" ` +
          `fill="${theme.node}" stroke="${theme.criticalCap}" stroke-width="2"/>`,
      );
      text(
        item.x0 + GANTT.milestoneRadius + 8,
        item.midY + 4,
        item.label,
        `font-size="12" font-weight="500" fill="${theme.nodeForeground}"`,
      );
      continue;
    }

    /* A one-day bar on a two-year plan would otherwise be sub-pixel; the
       clamp is the layout's, so the exported bar is never narrower than the
       drawn one. */
    const width = Math.max(item.x1 - item.x0, GANTT.minBarWidth);
    const paint = barPaint(item.state, theme);
    text(
      GANTT.railWidth - 8,
      item.midY + 4,
      item.label,
      `text-anchor="end" font-size="12.5" fill="${theme.nodeForeground}"`,
    );
    push(
      `<rect x="${item.x0}" y="${item.barY}" width="${width}" height="${GANTT.barHeight}" rx="4" ` +
        `fill="${paint.fill}" stroke="${paint.border}" stroke-width="1.25"/>`,
    );
    /* THE ROLE TEXTURE FIRST, THEN THE DURATION HATCH — the canvas's own order,
       and the order is the meaning: the state is a property of the bar and the
       hatch is a wash over whatever the bar is. Neither may rule at the other's
       angle, which is why no state a gantt can paint is assigned 45°;
       `check:eink` derives both the hatch's angle and the state→role map rather
       than trusting this comment. `null` under every non-texturing theme, and
       then no element is written at all. */
    const barTexture = barTextures.get(item) ?? null;
    if (barTexture !== null) {
      push(
        `<rect x="${item.x0}" y="${item.barY}" width="${width}" height="${GANTT.barHeight}" rx="4" ` +
          `fill="${barTexture}"/>`,
      );
    }
    /* Over the fill, UNDER the cap — the same paint order the canvas uses, and
       for the same reason: the cap is the only per-bar criticality signal and
       nothing translucent may lie on it. */
    push(
      `<rect x="${item.x0}" y="${item.barY}" width="${width}" height="${GANTT.barHeight}" rx="4" ` +
        `fill="url(#af-gantt-hatch)"/>`,
    );
    if (item.critical) {
      push(
        `<rect x="${item.x0}" y="${item.barY}" width="${GANTT.criticalCapWidth}" ` +
          `height="${GANTT.barHeight}" rx="1.5" fill="${theme.criticalCap}"/>`,
      );
    }
    text(
      item.x0 + width + 8,
      item.midY + 4,
      `${item.duration}d`,
      `font-size="10.5" fill="${theme.nodeMeta}"`,
    );
  }

  /* Connectors last, so they sit above the bars they join. */
  for (const dependency of layout.dependencies) {
    const ink = dependency.critical ? theme.criticalCap : theme.edge;
    push(
      `<path d="${dependency.path}" fill="none" stroke="${ink}" ` +
        `stroke-width="${dependency.critical ? 2.1 : 1.4}" stroke-linecap="round"/>`,
    );
    push(`<polygon points="${arrowPoints(dependency)}" fill="${ink}"/>`);
  }

  push("</g>");
  push("</svg>");
  return { svg: parts.join(""), width, height };
}

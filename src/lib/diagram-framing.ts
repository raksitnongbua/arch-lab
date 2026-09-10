/**
 * How much sheet a diagram is drawn on — the frame around the drawing, chosen
 * at export time rather than fixed by the renderer.
 *
 * WHY IT IS A CHOICE. An exported diagram has two destinations that want
 * opposite things. A README or a ticket wants the drawing and nothing else,
 * because the page around it supplies the margin; a SLIDE wants a fixed
 * rectangle, because a 16:9 deck letterboxes anything that is not one — and
 * it letterboxes it in ITS colour, usually white, which puts a bright band
 * around a `midnight` diagram. Exporting the frame the deck needs is the only
 * way to control that band, and it costs nothing to offer.
 *
 * ═══ TWO HALVES, AND ONLY ONE OF THEM IS GENERIC ═══
 *
 *   - **The aspect presets are pure geometry.** Expanding a viewBox
 *     symmetrically to a ratio needs to know nothing about the notation, so
 *     {@link reframeSvg} does it to a finished SVG string and every notation
 *     gets it for the same twenty lines.
 *   - **`trim` is not.** It means "drop the outer margin", and only the
 *     renderer knows what its own margin is — for C4 that is the 56px
 *     `PADDING` its exporter has always added. So `trim` is threaded INTO the
 *     C4 renderer as a padding override, and {@link framingPadding} is the
 *     one place that says so.
 *
 * A NOTATION WITH NO REMOVABLE MARGIN THEREFORE TREATS `trim` AS `fit`, and
 * that is a real limitation rather than an oversight: the other eight bake
 * their margins into layout, where taking them out would move every
 * coordinate rather than crop the sheet. It is stated on the route parameter
 * and in the export menu rather than left for a reader to discover by seeing
 * nothing happen.
 */

/**
 * The frames, in the order the menu offers them: the two that follow the
 * drawing first, then the fixed rectangles.
 */
export const DIAGRAM_FRAMINGS = ["fit", "trim", "16x9", "4x3", "1x1"] as const;

export type DiagramFraming = (typeof DIAGRAM_FRAMINGS)[number];

/**
 * The frame every export produced before this existed, and still the default
 * everywhere — including a render URL that names no framing at all. A reader
 * who has not asked for a rectangle should not be handed one.
 */
export const DEFAULT_DIAGRAM_FRAMING: DiagramFraming = "fit";

/** What the menu calls each one, and what it says the frame does. */
export const DIAGRAM_FRAMING_LABEL: Record<
  DiagramFraming,
  { name: string; detail: string }
> = {
  fit: { name: "Fit", detail: "The drawing with its usual margin" },
  trim: { name: "Trim", detail: "Tight to the drawing — hairline margin" },
  "16x9": { name: "16:9", detail: "Letterboxed for a slide" },
  "4x3": { name: "4:3", detail: "Letterboxed for a 4:3 deck" },
  "1x1": { name: "1:1", detail: "Square, for social" },
};

/**
 * The width÷height a frame is expanded to, or null for the two that follow
 * the drawing's own shape.
 */
const FRAMING_RATIO: Record<DiagramFraming, number | null> = {
  fit: null,
  trim: null,
  "16x9": 16 / 9,
  "4x3": 4 / 3,
  "1x1": 1,
};

/**
 * A framing name from a URL or a stored preference, or the default.
 *
 * An unknown value takes the default rather than refusing, the same rule
 * `/api/render` applies to an unknown theme: a diagram in the ordinary frame
 * is a better answer to a typo than a card explaining the spelling of a
 * ratio.
 */
export function parseDiagramFraming(raw: string | null): DiagramFraming {
  return DIAGRAM_FRAMINGS.includes(raw as DiagramFraming)
    ? (raw as DiagramFraming)
    : DEFAULT_DIAGRAM_FRAMING;
}

/**
 * What `trim` leaves, and it is deliberately not zero.
 *
 * A diagram's title block and its drawing share a left edge, so at zero the
 * heading's first character sits ON the boundary — which reads as a picture
 * that was cropped too far rather than one with no margin, and is the first
 * thing anyone would report as a bug. Twelve pixels is below the threshold
 * where a margin looks intentional and above the one where text looks
 * clipped.
 */
export const TRIM_PADDING = 12;

/**
 * The margin override a framing implies, or `undefined` for "whatever the
 * renderer's own margin is".
 *
 * `undefined` rather than the renderer's number, because the caller does not
 * know it and should not: each notation's margin is its own business, and a
 * caller that had to pass it back in would be a second place the constant
 * lives. Only `trim` overrides — a LETTERBOXED frame keeps the ordinary
 * margin on purpose, since the drawing is about to gain a much larger band on
 * two sides and removing the small even one first would leave the picture
 * touching the sheet on the other two.
 */
export function framingPadding(framing: DiagramFraming): number | undefined {
  return framing === "trim" ? TRIM_PADDING : undefined;
}

export interface FramedSvg {
  svg: string;
  width: number;
  height: number;
}

/**
 * The sheet painter, as `viewer/export/ground.ts` shapes it. Structural
 * rather than imported so this module stays free of the export feature —
 * it is used by a route handler as well as by the canvas.
 */
export interface SheetGround {
  layers: (x: number, y: number, width: number, height: number) => string;
}

/** Escape a colour so it can sit inside a RegExp. */
const escapeRegExp = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A coordinate at 2-decimal precision, matching `lib/svg-markup.ts`. */
const fmt = (value: number): string => String(Math.round(value * 100) / 100);

/**
 * Expand a finished SVG's frame to a fixed aspect ratio, centring the drawing
 * in it. Returns the input unchanged for the framings that have no ratio.
 *
 * IT ONLY EVER GROWS THE FRAME. Fitting a drawing to a ratio by CROPPING
 * would cut elements off, and scaling it down inside a fixed pixel box would
 * make the same diagram a different size depending on its shape. Expanding
 * the short axis is the one operation that cannot lose anything.
 *
 * ═══ THE SHEET IS RELAID, NOT EXTENDED ═══
 *
 * The frame is not just a colour. On `blueprint` it is ruled, on `paper` it
 * has grain, on `glass` a sheen crosses it — and `ground.ts` opens with the
 * argument that a sheet does not stop where the drawing stops. The first
 * version of this function grew the frame and painted the new band in flat
 * `--canvas`, which put an unruled margin around a ruled blueprint: the
 * drawing sat on a sheet that visibly ended.
 *
 * SO THE SHEET IS REMOVED AND PAINTED AGAIN over the whole new frame. It
 * cannot merely be ADDED alongside the builder's own, and the reason is the
 * sheen: it is a gradient in objectBoundingBox units, so a second one over a
 * different rectangle is a second band of light rather than the same band
 * made longer. The ruling and the grain would double their opacity in the
 * overlap for the same reason.
 *
 * The removal is anchored on ids rather than on position: every ground layer
 * is a `<rect>` painted through an `af-ground-…` pattern, filter or gradient
 * — `ground.ts` names them all — and the backdrop is the one rect filled with
 * the canvas colour. Those two rules find the sheet in all nine builders
 * without any of them agreeing on a marker, and `check:diagram-framing`
 * asserts the result: one sheet, spanning the frame, in every notation.
 *
 * IT DEGRADES TO THE OLD BEHAVIOUR rather than to a broken file. A caller
 * with no ground — `/api/render`, where `resolveExportGround` returns its
 * empty pair because there is no document to read styles from — repaints a
 * plain backdrop and nothing else, which is exactly what the server draws
 * everywhere anyway.
 *
 * WHY NOT THREAD THE FRAME INTO THE BUILDERS, which is the version with no
 * string handling at all: they do not agree on what a frame is. Four take a
 * `layout.bounds`, five pass `0, 0, width, height`, and C4's backdrop carries
 * no origin at all — so "pass the final frame in" is a normalisation of nine
 * renderers, not a parameter. That is a worthwhile refactor and a separate
 * one; doing it here would put nine untested edits behind a bug fix.
 */
export function reframeSvg(
  rendered: FramedSvg,
  framing: DiagramFraming,
  canvas: string,
  ground?: SheetGround,
): FramedSvg {
  const ratio = FRAMING_RATIO[framing];
  if (ratio === null) return rendered;

  const root = /^<svg\b[^>]*>/.exec(rendered.svg);
  const box = root === null ? null : /\bviewBox="([^"]+)"/.exec(root[0]);
  if (root === null || box === null) return rendered;

  const [x, y, w, h] = box[1].split(/\s+/).map(Number);
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) {
    return rendered;
  }

  /* ROUNDED ONCE, HERE, and every consumer below reads these. The frame, the
     backdrop and the ground's rects have to agree exactly: rounding at each
     use site instead left the sheet drawn at `-546.7222222222222` under a
     viewBox at `-546.72` — a sub-pixel seam, and sixteen digits of it in
     every coordinate the ground emits. */
  const round2 = (value: number): number => Math.round(value * 100) / 100;
  const raw = w / h < ratio ? { w: h * ratio, h } : { w, h: w / ratio };
  const grown = { w: round2(raw.w), h: round2(raw.h) };
  const nx = round2(x - (raw.w - w) / 2);
  const ny = round2(y - (raw.h - h) / 2);

  const openTag = root[0]
    .replace(/\bwidth="[^"]*"/, `width="${Math.round(grown.w)}"`)
    .replace(/\bheight="[^"]*"/, `height="${Math.round(grown.h)}"`)
    .replace(
      /\bviewBox="[^"]*"/,
      `viewBox="${fmt(nx)} ${fmt(ny)} ${fmt(grown.w)} ${fmt(grown.h)}"`,
    );

  /* THE OLD SHEET, LIFTED OUT. The backdrop is the one rect filled with the
     canvas colour — only the first, because a node could legitimately carry
     that fill — and the ground layers are every rect painted through an
     `af-ground-…` paint. Both survive a caller with no ground: there is then
     nothing matching the second rule and the first is simply repainted. */
  const body = rendered.svg
    .slice(root[0].length)
    .replace(
      new RegExp(`<rect\\b[^>]*fill="${escapeRegExp(canvas)}"[^>]*/>`),
      "",
    )
    .replace(/<rect\b[^>]*url\(#af-ground-[^>]*\/>/g, "");

  const sheet =
    `<rect x="${fmt(nx)}" y="${fmt(ny)}" width="${fmt(grown.w)}" ` +
    `height="${fmt(grown.h)}" fill="${canvas}"/>` +
    (ground?.layers(nx, ny, grown.w, grown.h) ?? "");

  /* AFTER THE ACCESSIBLE NAME, not before it. `<title>` is conventionally the
     first child — some viewers show it as a tooltip — and a rect ahead of it
     would take that place for no reason. */
  const afterDesc = body.indexOf("</desc>");
  const at = afterDesc === -1 ? 0 : afterDesc + "</desc>".length;

  return {
    svg: openTag + body.slice(0, at) + sheet + body.slice(at),
    width: Math.round(grown.w),
    height: Math.round(grown.h),
  };
}

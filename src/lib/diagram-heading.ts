import { escapeXml } from "@/lib/svg-markup";
import { CHAR_WIDTH_RATIO, wrapText } from "@/lib/text-metrics";

/**
 * The block of text at the top of a diagram: the document's title, and its
 * description under it.
 *
 * WHY IT IS ON THE CANVAS AT ALL, rather than only in the page chrome. The
 * canvas is what gets EXPORTED and SHARED, and the reader an exported image
 * reaches is usually not the one who exported it. A picture of a plan with no
 * title is a row of bars belonging to nothing; a timeline with no title is a
 * list of dates nobody can place. The sequence canvas made this call first and
 * the dictionary made it again in the same words.
 *
 * WHY IT IS SHARED. This function was written three times — in the sequence,
 * flowchart and use-case layouts — with identical bodies and a different
 * constant table each. Adding the gantt, the timeline and the lifecycle would
 * have made six. The only things that genuinely differ per notation are the
 * METRICS and the width the text may wrap to, so those are the parameters and
 * the arithmetic is written once. `dry.md` names this exact shape: identical
 * bodies with a renamed parameter.
 *
 * The three callers that predate it produce byte-identical layouts through it —
 * their own layout checks measure the heading's height and the position of
 * everything under it, and would say so loudly otherwise.
 */

/** One notation's type scale for its heading. Every value is in drawing units. */
export interface DiagramHeadingMetrics {
  titleFontSize: number;
  titleLineHeight: number;
  descriptionFontSize: number;
  descriptionLineHeight: number;
  /** Description lines past this are dropped and the last gets an ellipsis. */
  descriptionMaxLines: number;
  /** Air between the title's last line and the description's first. */
  titleDescriptionGap: number;
  /** Air between the block and whatever the notation draws under it. */
  headingGap: number;
}

export interface DiagramHeading {
  /** The title WRAPPED — the renderer draws these, never the raw string. */
  titleLines: readonly string[];
  /** Empty when the document carries no description. */
  descriptionLines: readonly string[];
  /** Total height including `headingGap`, so a caller reserves this and no
   * more. Callers that draw no heading still reserve it — see `isEmpty`. */
  height: number;
  /** The widest line, so a canvas narrower than its own title can widen. */
  width: number;
}

/**
 * Approximate rendered width at a font size.
 *
 * The same character-ratio estimate every layout in this repo uses, and for
 * the same reason: these modules must stay PURE, and a real measurement needs
 * a DOM. Duplicated as a private helper in several layouts before this; it is
 * the one arithmetic this module needs and it belongs beside `wrapText`.
 */
export function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * CHAR_WIDTH_RATIO;
}

/**
 * Wraps and measures a document's heading.
 *
 * `wrapWidth` is the caller's business because each notation has a different
 * idea of how wide its content is — a flowchart's widest rank, the span
 * between a sequence's first and last lifeline, the plot area of a gantt — and
 * a heading that wraps to a width the drawing does not have looks like a
 * mistake in the drawing rather than in the text.
 */
export function layoutDiagramHeading({
  title,
  description,
  wrapWidth,
  metrics,
}: {
  title: string;
  description: string | undefined;
  wrapWidth: number;
  metrics: DiagramHeadingMetrics;
}): DiagramHeading {
  const titleLines = wrapText(title, wrapWidth, metrics.titleFontSize);

  let descriptionLines: string[] = [];
  if (description !== undefined && description.trim() !== "") {
    const all = wrapText(description, wrapWidth, metrics.descriptionFontSize);
    descriptionLines = all.slice(0, metrics.descriptionMaxLines);
    if (all.length > descriptionLines.length) {
      /* Ellipsis on the last kept line, so a clipped description LOOKS
         clipped rather than reading as a sentence that simply ends oddly. */
      const lastIndex = descriptionLines.length - 1;
      descriptionLines[lastIndex] = `${descriptionLines[lastIndex]}…`;
    }
  }

  const height =
    titleLines.length * metrics.titleLineHeight +
    (descriptionLines.length === 0
      ? 0
      : metrics.titleDescriptionGap +
        descriptionLines.length * metrics.descriptionLineHeight) +
    metrics.headingGap;

  const width = Math.max(
    0,
    ...titleLines.map((line) => estimateTextWidth(line, metrics.titleFontSize)),
    ...descriptionLines.map((line) =>
      estimateTextWidth(line, metrics.descriptionFontSize),
    ),
  );

  return { titleLines, descriptionLines, height, width };
}

/**
 * Whether a heading has nothing to draw.
 *
 * A document's `title` is required by the schema but may be the empty string,
 * and `wrapText("")` yields no lines. A caller that reserved `headingGap` for
 * a block with no text in it would open every such diagram with a band of
 * nothing, so the notations that adopted a heading last check this and reserve
 * zero instead.
 */
export function isHeadingEmpty(heading: DiagramHeading): boolean {
  return (
    heading.titleLines.length === 0 && heading.descriptionLines.length === 0
  );
}

/**
 * The heading as SVG markup, for the exporters.
 *
 * The twin of `DiagramHeadingText`, and it must stay the twin: an exported
 * file carries no stylesheet, so both write the type scale and the two colours
 * as attributes, from the same metrics. Colours arrive as plain strings
 * because an exporter has already resolved its theme to concrete sRGB.
 *
 * Returns the empty string when there is nothing to draw, so a caller can push
 * it unconditionally.
 */
export function diagramHeadingMarkup({
  heading,
  x,
  top,
  metrics,
  titleFill,
  descriptionFill,
}: {
  heading: DiagramHeading;
  x: number;
  top: number;
  metrics: DiagramHeadingMetrics;
  titleFill: string;
  descriptionFill: string;
}): string {
  if (isHeadingEmpty(heading)) return "";

  const spans = (lines: readonly string[], lineHeight: number): string =>
    lines
      .map(
        (line, index) =>
          `<tspan x="${x}"${index === 0 ? "" : ` dy="${lineHeight}"`}>` +
          `${escapeXml(line)}</tspan>`,
      )
      .join("");

  const title =
    heading.titleLines.length === 0
      ? ""
      : `<text x="${x}" y="${top + metrics.titleFontSize}" ` +
        `font-size="${metrics.titleFontSize}" font-weight="600" ` +
        `fill="${titleFill}">` +
        `${spans(heading.titleLines, metrics.titleLineHeight)}</text>`;

  const descriptionTop =
    top +
    heading.titleLines.length * metrics.titleLineHeight +
    metrics.titleDescriptionGap +
    metrics.descriptionFontSize;
  const description =
    heading.descriptionLines.length === 0
      ? ""
      : `<text x="${x}" y="${descriptionTop}" ` +
        `font-size="${metrics.descriptionFontSize}" ` +
        `fill="${descriptionFill}">` +
        `${spans(heading.descriptionLines, metrics.descriptionLineHeight)}</text>`;

  return title + description;
}

/**
 * The accessible name and description of an exported diagram.
 *
 * AN EXPORTED SVG IS THE ONE ARTEFACT THAT LEAVES THIS APP. It gets pasted into
 * a README, a wiki page, a deck — surfaces where nothing else supplies alt
 * text, and where the diagram is often the only thing on the page carrying the
 * argument. Eight of the nine exporters emitted no accessible name at all, so
 * for a screen reader those files were an unlabelled graphic: not a diagram
 * with a poor description, an object with none.
 *
 * DESCRIBE THE CONTENT, NOT THE GEOMETRY. `<desc>` says what the picture is
 * ABOUT — the subject and what it holds — and never narrates the drawing. A
 * shape-by-shape reading ("a blue rectangle connected to a cylinder") is worse
 * than no description at all: it costs a listener the same time as the real
 * one and leaves them knowing nothing, and it is what a description
 * auto-generated from a scene graph always becomes. The author's own
 * `description` line is preferred over anything composed here for exactly that
 * reason — it is the only text in the document written to say what the diagram
 * means.
 *
 * IDS ARE SLUG-PREFIXED, and that is not tidiness. `id` is document-wide in
 * SVG, and two diagrams inlined into one HTML page — two figures in a README
 * rendered to a page, an OG card beside a viewer — would otherwise both claim
 * `af-title`; `aria-labelledby` then resolves to whichever came first, so the
 * second diagram is announced with the first one's name. The C4 exporter
 * shipped with exactly that fixed id.
 *
 * PURE — no imports beyond two helpers of the same kind, no DOM, so
 * `check:svg-a11y` can build the strings and assert their shape rather than
 * grepping the exporters for a promise.
 */

import { slugify } from "./slug";
import { escapeXml } from "./svg-markup";

/**
 * The cap on an accessible NAME. A name is announced in full before the
 * listener can act on it and is repeated in every landmark listing, so a
 * sentence in this slot is read as an obstacle. The description carries the
 * detail, and it has no cap because a listener reaches it only by asking.
 */
export const MAX_SVG_TITLE_LENGTH = 60;

export interface SvgAccessibility {
  /**
   * `role` and `aria-labelledby`, ready to interpolate into the `<svg>` tag.
   * Leading space included, so a caller cannot join it wrongly.
   */
  attributes: string;
  /**
   * `<title>` and `<desc>`, which MUST be the first children of the `<svg>`
   * element — before `<defs>`, before any drawing. Assistive technology reads
   * the first `<title>` it meets, and a `<title>` inside a `<defs>`-declared
   * marker that happened to come earlier would win.
   */
  elements: string;
  titleId: string;
  descId: string;
}

export interface SvgAccessibilityInput {
  /** The diagram's own title. */
  title: string;
  /**
   * The author's `description` line, when the document has one. Preferred over
   * `summary` — it is the one sentence written to say what the diagram means.
   */
  description?: string | null;
  /**
   * A composed fallback describing what the diagram CONTAINS, for a document
   * whose author wrote no description. One sentence, in the notation's own
   * terms ("a container view of 12 elements and 15 relationships"), never a
   * reading of the shapes.
   */
  summary: string;
  /**
   * Distinguishes this diagram's ids from another's in the same HTML document.
   * The diagram's own id where it has one, otherwise its title.
   */
  idSeed: string;
}

/** Trims to the cap on a word boundary, so a name never ends mid-word. */
function clampName(text: string): string {
  if ([...text].length <= MAX_SVG_TITLE_LENGTH) return text;
  const cut = text.slice(0, MAX_SVG_TITLE_LENGTH - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > MAX_SVG_TITLE_LENGTH / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export function svgAccessibility(
  input: SvgAccessibilityInput,
): SvgAccessibility {
  const slug = slugify(input.idSeed, "diagram");
  const titleId = `${slug}-title`;
  const descId = `${slug}-desc`;

  const name = clampName(input.title.trim() === "" ? "Diagram" : input.title);
  const described =
    input.description !== null &&
    input.description !== undefined &&
    input.description.trim() !== ""
      ? input.description.trim()
      : input.summary;

  return {
    attributes: ` role="img" aria-labelledby="${titleId} ${descId}"`,
    elements:
      `<title id="${titleId}">${escapeXml(name)}</title>` +
      `<desc id="${descId}">${escapeXml(described)}</desc>`,
    titleId,
    descId,
  };
}

/** `n thing` / `n things`, for composing a summary without a plural bug. */
export function countOf(n: number, singular: string, plural?: string): string {
  return `${n} ${n === 1 ? singular : (plural ?? `${singular}s`)}`;
}

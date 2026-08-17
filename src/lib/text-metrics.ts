/**
 * Text-width estimates shared by every surface that lays out SVG text without
 * a DOM to measure in.
 *
 * The C4 exporter and the sequence layout both size boxes from character
 * counts, and both were carrying their own copy of the ratio below with a
 * comment claiming it was "the same estimate for the whole codebase". It is one
 * estimate now.
 *
 * Deliberately CONSERVATIVE — an overestimate leaves a box slightly roomy,
 * whereas an underestimate clips text that has no ellipsis to fall back on.
 */

/** Average glyph width per font-size unit, sans-serif. */
export const CHAR_WIDTH_RATIO = 0.58;

/** The same for monospace, whose glyphs are wider and uniform. */
export const MONO_CHAR_WIDTH_RATIO = 0.62;

/**
 * Greedy word wrap to a pixel width, using the same conservative estimate as
 * everything else in this file. Lived in the sequence layout first; promoted
 * here when the flowchart layout needed the identical algorithm — one wrap,
 * one answer, per the house one-name-per-concept rule. (The C4 exporter's
 * `wrapTextClamped` stays separate on purpose: it ellipsises at a line cap,
 * which is a genuinely different contract, and the two names say so.)
 *
 * THIS EXISTS BECAUSE THE BOX USED TO LIE. A sequence note's width was capped
 * while its text stayed one unbroken `<text>` element, so a 250-character
 * caveat drew a single 1600px line straight through both walls of its own box
 * and off the canvas (SVG extents are computed from the box, not the text).
 * Wrapping is what makes the box the truth about the text.
 *
 * A word longer than the whole line (a URL, a `filter[...]=...` query string)
 * is HARD-SPLIT rather than allowed to overhang: overhang is the bug this
 * function exists to remove, and a broken URL that stays inside the box is
 * more useful than an intact one that vanishes off the canvas.
 *
 * The hard split lands on GRAPHEME-CLUSTER boundaries, never on a raw index.
 * Thai (and every script that writes vowels and tone marks as combining
 * characters) has no spaces between words, so a Thai label IS one long
 * "word" and the hard split is its only wrap — and `slice(perLine)` split
 * base characters from their marks, opening the continuation line with an
 * orphaned combining mark drawn on a dotted circle (a user-visible defect,
 * found with a real Thai document). `Intl.Segmenter` grapheme rules are
 * locale-independent Unicode, so the layout stays deterministic in Node and
 * the browser alike; for plain ASCII every cluster is one char and the
 * output is byte-identical to the old slice.
 */
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** A word split into segments of at most `perLine` UTF-16 units, breaking
 * only between grapheme clusters (an oversize single cluster stands alone
 * rather than being cut through). */
function hardSplit(word: string, perLine: number): string[] {
  const parts: string[] = [];
  let part = "";
  for (const { segment } of GRAPHEMES.segment(word)) {
    if (part !== "" && part.length + segment.length > perLine) {
      parts.push(part);
      part = "";
    }
    part += segment;
  }
  if (part !== "") parts.push(part);
  return parts;
}

export function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
): string[] {
  const charWidth = Math.max(1, fontSize * CHAR_WIDTH_RATIO);
  const perLine = Math.max(1, Math.floor(maxWidth / charWidth));
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    const flush = (): void => {
      lines.push(line);
      line = "";
    };
    for (const word of paragraph.split(/\s+/).filter((w) => w !== "")) {
      let rest = word;
      // A word that cannot fit on a line of its own, split at the line width
      // — between grapheme clusters, per the header's Thai argument.
      if (rest.length > perLine) {
        const parts = hardSplit(rest, perLine);
        rest = parts.pop() ?? "";
        for (const part of parts) {
          if (line !== "") flush();
          lines.push(part);
        }
      }
      const candidate = line === "" ? rest : `${line} ${rest}`;
      if (candidate.length <= perLine) line = candidate;
      else {
        if (line !== "") flush();
        line = rest;
      }
    }
    lines.push(line);
  }
  // A trailing empty line only happens for text ending in a newline; an empty
  // string keeps one line so a box built from it still has a height.
  while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

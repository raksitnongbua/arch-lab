/**
 * ONE spelling for a colour a document carries — lowercase `#rrggbb`.
 *
 * Two readers write tints into the model (the `.alab` sequence grammar and
 * the Mermaid importer) and the renderer reads them back, so "what counts as
 * a colour" has to be one answer. Without normalisation `#BFDFFF`,
 * `#bfdfff`, `rgb(191, 223, 255)` and `Aqua` are four different documents
 * that draw identically — which breaks the byte-identical round trip the
 * whole format is built on.
 *
 * WHAT IS ACCEPTED is exactly what Mermaid users write in a `rect` or a
 * `box`, and nothing more: hex in both lengths, `rgb()`/`rgba()`, and the
 * short list of named colours their docs use. An unrecognised colour is
 * REFUSED (`null`), never passed through: a value the renderer has to hand
 * to CSS unvalidated is a value that can carry `url(...)` or a var reference
 * into an SVG we export and someone else opens.
 *
 * Alpha is discarded rather than kept. The tint is drawn as a wash at a
 * fixed opacity the renderer owns (see `SequenceFragment.tint`), so a
 * document's own alpha would be a second, contradicting answer to the same
 * question.
 */

/** The wash a tint is painted at. Low enough that a mid-tone hue stays
 * legible under both themes' text, strong enough to read as a region. */
export const TINT_WASH_OPACITY = 0.18;

/**
 * The named colours Mermaid's own `rect`/`box` examples use. A deliberately
 * SHORT list, not the CSS palette: every name here is one somebody has
 * actually typed into a `box` line, and an unknown name failing loudly beats
 * 148 names that mostly never appear.
 */
const NAMED_TINTS: Readonly<Record<string, string>> = {
  aqua: "#00ffff",
  aliceblue: "#f0f8ff",
  beige: "#f5f5dc",
  black: "#000000",
  blue: "#0000ff",
  cyan: "#00ffff",
  gray: "#808080",
  grey: "#808080",
  green: "#008000",
  honeydew: "#f0fff0",
  lavender: "#e6e6fa",
  lightblue: "#add8e6",
  lightgreen: "#90ee90",
  lightgrey: "#d3d3d3",
  lightyellow: "#ffffe0",
  mistyrose: "#ffe4e1",
  orange: "#ffa500",
  pink: "#ffc0cb",
  red: "#ff0000",
  salmon: "#fa8072",
  seashell: "#fff5ee",
  silver: "#c0c0c0",
  white: "#ffffff",
  yellow: "#ffff00",
};

/** `transparent`, and Mermaid's own way of saying "no tint at all". Not a
 * failure and not a colour: the caller gets `null` and writes no tint, which
 * is the same document as one that never asked for one. */
const NO_TINT: ReadonlySet<string> = new Set(["transparent", "none"]);

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB_RE =
  /^rgba?\(\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/i;

function channel(value: number): string {
  return Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0");
}

/**
 * Normalises a colour to lowercase `#rrggbb`, or `null` when it is not a
 * colour this format stores (including an explicit "no tint").
 *
 * Callers decide what `null` means: the `.alab` parser reports it as a
 * located error, because the author typed something and deserves to be told
 * it was ignored; the Mermaid importer drops it silently, because it is
 * importing somebody else's document and the caveat already says colour can
 * be lost.
 */
export function normalizeTint(input: string): string | null {
  const text = input.trim().toLowerCase();
  if (text === "" || NO_TINT.has(text)) return null;

  const named = NAMED_TINTS[text];
  if (named !== undefined) return named;

  if (HEX_RE.test(text)) {
    const body = text.slice(1);
    return body.length === 3
      ? `#${body[0]}${body[0]}${body[1]}${body[1]}${body[2]}${body[2]}`
      : `#${body}`;
  }

  const rgb = RGB_RE.exec(text);
  if (rgb !== null) {
    return `#${channel(Number(rgb[1]))}${channel(Number(rgb[2]))}${channel(Number(rgb[3]))}`;
  }
  return null;
}

/** Whether a value already IS the canonical spelling — the check a
 * serializer needs before writing a tint it did not normalise itself. */
export function isNormalizedTint(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/.test(value);
}

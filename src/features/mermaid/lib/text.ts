/**
 * Text codecs shared by the parser and the emitter. Mermaid C4 labels carry
 * line breaks as `<br/>` (or `<br>` / `<br />`); the arch-flow model stores
 * real newlines. Quotes travel as `\"` inside Mermaid strings.
 *
 * Imported by `scripts/mermaid-check.mjs` through Node's type stripping:
 * keep the syntax erasable.
 */

const BR_PATTERN = /<br\s*\/?>/gi;

/** Decodes `<br/>`, `<br>` and `<br />` (any case) into real newlines. */
export function decodeInlineBreaks(text: string): string {
  return text.replace(BR_PATTERN, "\n");
}

/** Re-encodes real line breaks as `<br/>` for Mermaid output. */
export function encodeInlineBreaks(text: string): string {
  return text.replace(/\r\n|\r|\n/g, "<br/>");
}

/** Escapes text for a double-quoted Mermaid string argument. */
export function escapeMermaidString(text: string): string {
  return encodeInlineBreaks(text.replace(/\\/g, "\\\\").replace(/"/g, '\\"'));
}

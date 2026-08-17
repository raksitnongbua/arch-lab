/**
 * Helpers for building standalone SVG markup as strings — shared by the
 * exporters that render from the model (`viewer/export/render-svg.ts`,
 * `flowchart/export/render-svg.ts`) and the flowchart shape geometry that
 * feeds both a React renderer and a string renderer. Each of these carried
 * its own copy of both helpers before this file existed, which is exactly
 * the drift dry.md forbids.
 */

/** Escape text for use in SVG/XML content and attribute values. */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** A coordinate at 2-decimal precision — compact markup, sub-pixel exact. */
export const fmt = (value: number): string =>
  String(Math.round(value * 100) / 100);

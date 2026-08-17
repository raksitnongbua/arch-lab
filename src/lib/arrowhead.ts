/**
 * A filled SVG arrowhead at a polyline's end, oriented along its final
 * segment. Lived in `flowchart/lib/shapes.ts` until the use-case renderer
 * needed the identical triangle for its «include»/«extend» dependencies —
 * promoted here rather than copied, per the one-definition rule in
 * `dry.md`. The dimensions stay with each feature (the flowchart's
 * `ARROW_LENGTH` pair, the use-case's dependency head) because arrow weight
 * is tuned per canvas; the GEOMETRY is the shared thing.
 *
 * Pure and erasable (no DOM, no React) so the check scripts can load any
 * module that imports it through Node's type stripping.
 */

import { fmt } from "@/lib/svg-markup";

export interface ArrowheadPoint {
  x: number;
  y: number;
}

/** Works for any approach angle; degenerate inputs return an empty path. */
export function arrowheadPathAt(
  points: readonly ArrowheadPoint[],
  length: number,
  halfWidth: number,
): string {
  if (points.length < 2) return "";
  const tip = points[points.length - 1];
  const from = points[points.length - 2];
  const len = Math.hypot(tip.x - from.x, tip.y - from.y) || 1;
  const ux = (tip.x - from.x) / len;
  const uy = (tip.y - from.y) / len;
  const baseX = tip.x - ux * length;
  const baseY = tip.y - uy * length;
  // Perpendicular of (ux, uy) is (-uy, ux).
  const leftX = baseX - uy * halfWidth;
  const leftY = baseY + ux * halfWidth;
  const rightX = baseX + uy * halfWidth;
  const rightY = baseY - ux * halfWidth;
  return `M ${fmt(tip.x)} ${fmt(tip.y)} L ${fmt(leftX)} ${fmt(leftY)} L ${fmt(rightX)} ${fmt(rightY)} Z`;
}

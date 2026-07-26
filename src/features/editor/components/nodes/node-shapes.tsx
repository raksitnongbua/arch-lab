"use client";

/**
 * Per-type node shape treatments (AF-E3-S1). Two layers:
 *
 * - `SHAPE_WRAPPER_CLASSES` — border/fill/radius classes for box-like types.
 *   `database` and `queue` draw NO CSS box; their silhouette is SVG.
 * - `NodeShapeLayer` — the absolutely-positioned SVG silhouette (cylinder,
 *   pipe) or corner glyph (UML component tabs). Colours come exclusively from
 *   the semantic tokens via `fill-node` / `stroke-node-border`.
 */

import type { C4NodeType } from "@/types";

/** Wrapper classes per type. Empty ⇒ the silhouette is drawn by the SVG layer. */
export const SHAPE_WRAPPER_CLASSES: Record<C4NodeType, string> = {
  // C4 person: box with strongly rounded shoulders.
  person: "rounded-t-[28px] rounded-b-xl border border-node-border bg-node",
  // The system in focus: strongest border weight on the canvas.
  softwareSystem: "rounded-lg border-2 border-node-border bg-node",
  // External: muted fill + dashed border (AF-E3-S1).
  externalSystem: "rounded-lg border border-dashed border-node-border bg-muted",
  container: "rounded-lg border border-node-border bg-node",
  component: "rounded-md border border-node-border bg-node",
  // Code element: sharp corners + mono name (set in chrome).
  codeElement: "rounded-sm border border-node-border bg-node",
  database: "",
  queue: "",
};

/** Types whose silhouette is SVG rather than a CSS box. */
export function hasSvgSilhouette(type: C4NodeType): boolean {
  return type === "database" || type === "queue";
}

export interface NodeShapeLayerProps {
  type: C4NodeType;
}

/**
 * The SVG layer behind the node content. Uses `preserveAspectRatio="none"` +
 * `vectorEffect="non-scaling-stroke"` so the silhouette stretches with the
 * node while the border stays 1.5px.
 */
export function NodeShapeLayer({
  type,
}: NodeShapeLayerProps): React.JSX.Element | null {
  if (type === "database") {
    // Cylinder: top ellipse rim + body. ViewBox matches the 176×88 default.
    return (
      <svg
        aria-hidden="true"
        className="absolute inset-0 size-full"
        viewBox="0 0 176 88"
        preserveAspectRatio="none"
      >
        <path
          d="M4 12v64c0 6.6 37.6 10 84 10s84-3.4 84-10V12"
          className="fill-node stroke-node-border"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
        <ellipse
          cx="88"
          cy="12"
          rx="84"
          ry="10"
          className="fill-node stroke-node-border"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  }

  if (type === "queue") {
    // Horizontal pipe: open rim at the left, closed cap at the right.
    return (
      <svg
        aria-hidden="true"
        className="absolute inset-0 size-full"
        viewBox="0 0 176 88"
        preserveAspectRatio="none"
      >
        <path
          d="M14 4h146c7.2 0 13 17.9 13 40s-5.8 40-13 40H14"
          className="fill-node stroke-node-border"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
        <ellipse
          cx="14"
          cy="44"
          rx="12"
          ry="40"
          className="fill-node stroke-node-border"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  }

  if (type === "component") {
    // UML component glyph: two tabs on a small rectangle, top-left corner.
    return (
      <svg
        aria-hidden="true"
        className="absolute top-1.5 left-1.5 h-3.5 w-3.5 text-muted-foreground"
        viewBox="0 0 14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.2}
      >
        <path d="M4.5 1.5h8v11h-8" />
        <rect x="1" y="3.5" width="6" height="2.6" className="fill-node" />
        <rect x="1" y="7.9" width="6" height="2.6" className="fill-node" />
      </svg>
    );
  }

  return null;
}

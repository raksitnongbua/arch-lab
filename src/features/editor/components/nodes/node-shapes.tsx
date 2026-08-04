"use client";

/**
 * Per-type node shape treatments (AF-E3-S1). Two layers:
 *
 * - `SHAPE_WRAPPER_CLASSES` — border/fill/radius classes for box-like types.
 *   `database` and `queue` draw NO CSS box; their silhouette is SVG.
 * - `NodeShapeLayer` — the absolutely-positioned SVG silhouette (cylinder,
 *   pipe) or corner glyph (UML component tabs).
 *
 * Every paint goes through `--node-fill` / `--node-stroke` — the per-node
 * custom properties set by `lib/node-colors.ts` (role token, or the author's
 * `tagColors` hex) and defaulted in globals.css. This table stays pure
 * GEOMETRY (radius, border weight, dash); if it named colours per type the
 * type→colour mapping would live twice. The `af-node-wash` classes are not
 * an exception: the wash (globals.css) is itself expressed in the same two
 * variables, so it recolours with the node.
 */

import { useId } from "react";

import type { C4NodeType } from "@/types";

/** Wrapper classes per type. Empty ⇒ the silhouette is drawn by the SVG layer. */
export const SHAPE_WRAPPER_CLASSES: Record<C4NodeType, string> = {
  // C4 person: box with strongly rounded shoulders.
  person:
    "rounded-t-[28px] rounded-b-xl border border-(--node-stroke) bg-(--node-fill) af-node-wash",
  // The system in focus: strongest border weight on the canvas.
  softwareSystem:
    "rounded-lg border-2 border-(--node-stroke) bg-(--node-fill) af-node-wash",
  // External: dashed border (AF-E3-S1); the receding grey fill now arrives
  // via the `external` colour role rather than a hardcoded bg-muted here.
  // NO wash: external cards stay deliberately flat — matte, not lit — so
  // "not our code" recedes one more notch behind the vivid roles.
  externalSystem:
    "rounded-lg border border-dashed border-(--node-stroke) bg-(--node-fill)",
  container:
    "rounded-lg border border-(--node-stroke) bg-(--node-fill) af-node-wash",
  component:
    "rounded-md border border-(--node-stroke) bg-(--node-fill) af-node-wash",
  // Code element: sharp corners + mono name (set in chrome).
  codeElement:
    "rounded-sm border border-(--node-stroke) bg-(--node-fill) af-node-wash",
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
 * The stops of the surface wash, as an SVG gradient the silhouettes can
 * reference — the exact recipe `.af-node-wash` paints on box nodes
 * (globals.css: lit 14% top edge, flat middle band, 7% grounding bottom),
 * rebuilt here because a CSS background cannot follow a cylinder or pipe
 * path. Per-instance id: a shared one would make every node paint with
 * whichever defs mounted first.
 */
function WashGradient({ id }: { id: string }): React.JSX.Element {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        {/* style, not the stop-color attribute: custom properties only
            resolve through the CSS cascade — `stop-color="var(--x)"` as an
            attribute value is treated as an invalid colour and paints
            black. */}
        <stop
          offset="0"
          style={{
            stopColor:
              "color-mix(in oklab, var(--node-stroke) 14%, var(--node-fill))",
          }}
        />
        <stop offset="0.55" style={{ stopColor: "var(--node-fill)" }} />
        <stop offset="0.82" style={{ stopColor: "var(--node-fill)" }} />
        <stop
          offset="1"
          style={{
            stopColor:
              "color-mix(in oklab, var(--node-stroke) 7%, var(--node-fill))",
          }}
        />
      </linearGradient>
    </defs>
  );
}

/**
 * The SVG layer behind the node content. Uses `preserveAspectRatio="none"` +
 * `vectorEffect="non-scaling-stroke"` so the silhouette stretches with the
 * node while the border stays 1.5px.
 */
export function NodeShapeLayer({
  type,
}: NodeShapeLayerProps): React.JSX.Element | null {
  // useId's delimiters are not valid inside url(#…) — same sanitising rule
  // as the viewer's outline gradient.
  const gradientId = `af-node-wash-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  if (type === "database") {
    // Cylinder: top ellipse rim + body. ViewBox matches the 176×88 default.
    return (
      <svg
        aria-hidden="true"
        className="absolute inset-0 size-full"
        viewBox="0 0 176 88"
        preserveAspectRatio="none"
      >
        <WashGradient id={gradientId} />
        <path
          d="M4 12v64c0 6.6 37.6 10 84 10s84-3.4 84-10V12"
          fill={`url(#${gradientId})`}
          className="stroke-(--node-stroke)"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
        {/* The rim takes the wash TOP flat — it IS the lit face of the
            cylinder, and running the gradient again inside a 20px-tall
            ellipse just banded. */}
        <ellipse
          cx="88"
          cy="12"
          rx="84"
          ry="10"
          className="af-node-wash-fill stroke-(--node-stroke)"
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
        <WashGradient id={gradientId} />
        <path
          d="M14 4h146c7.2 0 13 17.9 13 40s-5.8 40-13 40H14"
          fill={`url(#${gradientId})`}
          className="stroke-(--node-stroke)"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
        <ellipse
          cx="14"
          cy="44"
          rx="12"
          ry="40"
          fill={`url(#${gradientId})`}
          className="stroke-(--node-stroke)"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  }

  if (type === "component") {
    // UML component glyph: two tabs on a small rectangle, top-left corner.
    // Strokes in the node's own accent (--node-stroke) rather than the old
    // neutral muted-foreground, so the glyph joins the coloured chrome; the
    // tab rects punch through with the WASH TOP fill because they sit in
    // the washed band of the card, where plain --node-fill left ghost seams.
    return (
      <svg
        aria-hidden="true"
        className="absolute top-1.5 left-1.5 h-3.5 w-3.5 text-(--node-stroke)"
        viewBox="0 0 14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.2}
      >
        <path d="M4.5 1.5h8v11h-8" />
        <rect
          x="1"
          y="3.5"
          width="6"
          height="2.6"
          className="af-node-wash-fill"
        />
        <rect
          x="1"
          y="7.9"
          width="6"
          height="2.6"
          className="af-node-wash-fill"
        />
      </svg>
    );
  }

  return null;
}

"use client";

/**
 * Per-type node shape treatments. Two layers:
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

import { RoleTexturePattern } from "@/components/ui/role-texture";
import { WashGradient } from "@/components/ui/wash-gradient";
import type { C4NodeType } from "@/types";

import { TEXTURE_BY_ROLE } from "../../lib/node-colors";

/** Wrapper classes per type. Empty ⇒ the silhouette is drawn by the SVG layer. */
export const SHAPE_WRAPPER_CLASSES: Record<C4NodeType, string> = {
  // C4 person: box with strongly rounded shoulders.
  person:
    "rounded-t-[28px] rounded-b-xl border border-(--node-stroke) bg-(--node-fill) af-node-wash",
  // The system in focus: strongest border weight on the canvas.
  softwareSystem:
    "rounded-lg border-2 border-(--node-stroke) bg-(--node-fill) af-node-wash",
  // External: dashed border; the receding grey fill now arrives
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
 * The SVG layer behind the node content. Uses `preserveAspectRatio="none"` +
 * `vectorEffect="non-scaling-stroke"` so the silhouette stretches with the
 * node while the border stays 1.5px.
 */
export function NodeShapeLayer({
  type,
}: NodeShapeLayerProps): React.JSX.Element | null {
  // useId's delimiters are not valid inside url(#…) — same sanitising rule
  // as the viewer's outline gradient.
  const instance = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const gradientId = `af-node-wash-${instance}`;
  /* PER-INSTANCE, like the wash beside it, and NOT the shared `textureId()`
     the diagram canvases use. These silhouettes are separate inline `<svg>`
     documents — one per node, no shared root — so a `<pattern>` mounted on a
     diagram's `<defs>` is simply not reachable from here, and a fixed id would
     put the same id on every node on the board. The other C4 types need none
     of this: their box is HTML, textured by `--node-texture` in
     `nodeColorStyle`, and only these two have no CSS box to carry it. */
  const texturePatternId = `af-node-tex-${instance}`;

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
        <defs>
          <RoleTexturePattern
            texture={TEXTURE_BY_ROLE.database}
            id={texturePatternId}
          />
        </defs>
        <path
          d="M4 12v64c0 6.6 37.6 10 84 10s84-3.4 84-10V12"
          fill={`url(#${gradientId})`}
          className="stroke-(--node-stroke)"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
        {/* The role texture on the cylinder's BODY only, repeating the same
            path over the wash and under the rim. The rim is the lit top face
            (see the note below) — ruling it would flatten the one cue that
            makes this read as a cylinder rather than a stadium. No stroke: the
            outline is already drawn once above, and a second one would double
            its weight. Note the tile is stretched by `preserveAspectRatio
            ="none"` exactly as the silhouette is, so a very wide node rules
            slightly wider than 8 units — the same distortion the border avoids
            only because `non-scaling-stroke` exempts it. */}
        <path
          d="M4 12v64c0 6.6 37.6 10 84 10s84-3.4 84-10V12"
          fill={`url(#${texturePatternId})`}
          pointerEvents="none"
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
        <defs>
          <RoleTexturePattern
            texture={TEXTURE_BY_ROLE.queue}
            id={texturePatternId}
          />
        </defs>
        <path
          d="M14 4h146c7.2 0 13 17.9 13 40s-5.8 40-13 40H14"
          fill={`url(#${gradientId})`}
          className="stroke-(--node-stroke)"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
        {/* The pipe's body, ruled. Drawn before the open rim so the rim's own
            fill covers it — the rim is the mouth of the pipe and a texture
            running across it would close the pipe. */}
        <path
          d="M14 4h146c7.2 0 13 17.9 13 40s-5.8 40-13 40H14"
          fill={`url(#${texturePatternId})`}
          pointerEvents="none"
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

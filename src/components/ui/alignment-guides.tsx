"use client";

/**
 * The hairlines a canvas draws while a drag is snapped, saying WHAT it
 * snapped to.
 *
 * WITHOUT THESE A SNAP IS A GLITCH. An element that stops following the
 * pointer for six units and then jumps looks like a dropped frame unless
 * something on screen says "because this edge lines up with that one". The
 * guide is the whole explanation, so it is not optional decoration on the
 * snap — the two ship together.
 *
 * PRESENTATIONAL ONLY, and in `components/ui` because two canvases draw them
 * — `canvas-editing.md`: "Where the two share a control, it belongs in
 * `components/ui` rather than in one feature." Each canvas owns the state;
 * this owns the drawing, so the two can never disagree about what a guide
 * looks like.
 *
 * DRAWN INSIDE THE VIEWPORT, through `ViewportPortal`, so a guide is stated
 * in flow coordinates and pans and zooms with the diagram it describes. The
 * thickness is divided by the zoom for the same reason: a rule that thickens
 * as the reader zooms in stops reading as a measurement.
 */

import { ViewportPortal, useViewport } from "@xyflow/react";

import type { AlignmentGuide } from "@/lib/align-snap";

export function AlignmentGuides({
  guides,
}: {
  guides: readonly AlignmentGuide[];
}): React.JSX.Element | null {
  const { zoom } = useViewport();

  if (guides.length === 0) return null;

  // The guide must read as a hairline at every zoom level.
  const thickness = 1 / Math.max(zoom, 0.0001);

  return (
    <ViewportPortal>
      {guides.map((guide) => (
        <div
          key={guide.id}
          aria-hidden="true"
          className="pointer-events-none absolute bg-accent"
          style={
            guide.orientation === "vertical"
              ? {
                  left: guide.position,
                  top: guide.from,
                  width: thickness,
                  height: guide.to - guide.from,
                }
              : {
                  left: guide.from,
                  top: guide.position,
                  width: guide.to - guide.from,
                  height: thickness,
                }
          }
        />
      ))}
    </ViewportPortal>
  );
}

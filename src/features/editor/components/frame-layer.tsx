"use client";

/**
 * Draws a diagram's grouping frames behind its nodes.
 *
 * Rendered through React Flow's `ViewportPortal` rather than as React Flow
 * NODES, which was the other obvious option. Nodes would have brought the
 * whole interaction surface with them — selection, focus order, drag, the
 * node-click handler's type union, the dimming stylesheet's selectors — and
 * every one of those would then need turning back off, because a frame is
 * scenery, not an element you can click. The portal renders inside the same
 * transformed viewport (so frames pan and zoom with the diagram, for free)
 * and nothing else about the canvas has to learn that frames exist.
 *
 * `pointer-events: none` on the layer is the other half of that: a frame
 * covers a large area, and swallowing clicks meant for the canvas underneath
 * would break panning across the middle of a diagram.
 *
 * Outer frames paint first (`placeFrames` returns them outermost-first), so a
 * child's fill lands on top of its parent's and nesting reads as depth rather
 * than as two overlapping washes.
 */

import { ViewportPortal } from "@xyflow/react";

import { placeFrames, FRAME_LABEL_BAND } from "../lib/frame-layout";
import type { C4Diagram } from "@/types";

export interface FrameLayerProps {
  diagram: C4Diagram;
}

export function FrameLayer({ diagram }: FrameLayerProps): React.JSX.Element {
  const frames = placeFrames(diagram);
  if (frames.length === 0) return <></>;

  return (
    <>
      {/* Rectangles: behind everything, because a frame is scenery. */}
      <ViewportPortal>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0"
        >
          {frames.map((frame) => (
            <div
              key={frame.id}
              className="absolute rounded-xl border border-dashed border-node-border/70 bg-node-border/[0.06]"
              style={{
                transform: `translate(${frame.x}px, ${frame.y}px)`,
                width: frame.width,
                height: frame.height,
              }}
            />
          ))}
        </div>
      </ViewportPortal>

      {/*
       * Captions in a SEPARATE layer, lifted above the edge layer.
       * A backdrop alone would not be enough: the rectangles sit under the
       * edges, so a connector crossing the top band painted straight over the
       * label. Raising just the text — never the rectangle — keeps the frame
       * behind the diagram while its name stays readable. The band the
       * geometry reserves is empty of nodes, so nothing is hidden by this.
       */}
      <ViewportPortal>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0"
          style={{ zIndex: 5 }}
        >
          {frames.map((frame) => (
            <span
              key={frame.id}
              // `bg-canvas` punches a gap through the dashed border and any
              // edge behind it, the way a boundary caption is normally drawn.
              className="absolute truncate rounded bg-canvas px-1.5 font-medium text-muted-foreground"
              style={{
                transform: `translate(${frame.x + 10}px, ${frame.y + (FRAME_LABEL_BAND - 16) / 2}px)`,
                maxWidth: Math.max(0, frame.width - 20),
                fontSize: 11,
                lineHeight: "16px",
              }}
            >
              {frame.label}
            </span>
          ))}
        </div>
      </ViewportPortal>
    </>
  );
}

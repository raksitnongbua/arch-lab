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

import { useCallback, useState } from "react";
import { useReactFlow, ViewportPortal } from "@xyflow/react";

import { placeFrames, FRAME_LABEL_BAND } from "../lib/frame-layout";
import type { C4Diagram } from "@/types";

export interface FrameLayerProps {
  diagram: C4Diagram;
}

/** Breathing room around a frame when zooming to it. */
const FOCUS_PADDING = 0.12;

/** Matches the canvas's own camera easing; 0 under reduced motion. */
const FOCUS_DURATION = 320;

export function FrameLayer({ diagram }: FrameLayerProps): React.JSX.Element {
  const { fitBounds } = useReactFlow();
  const frames = placeFrames(diagram);
  // The focused frame. Persists — this is a selection indicator the reader
  // asked for, so it stays until they point somewhere else.
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const focusFrame = useCallback(
    (rect: { x: number; y: number; width: number; height: number }) => {
      // Read at click time, not at mount: the OS setting can change while the
      // page is open, and a camera flight is exactly the kind of motion the
      // preference exists to stop.
      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      fitBounds(rect, {
        padding: FOCUS_PADDING,
        duration: reduced ? 0 : FOCUS_DURATION,
      });
    },
    [fitBounds],
  );

  // Clicking the focused frame's own caption clears it, so the indicator can
  // be dismissed without hunting for somewhere neutral to click.
  const toggleFocus = useCallback((id: string) => {
    setFocusedId((cur) => (cur === id ? null : id));
  }, []);

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
              className="absolute"
              style={{
                transform: `translate(${frame.x}px, ${frame.y}px)`,
                width: frame.width,
                height: frame.height,
              }}
            >
              {/*
               * The border is SVG, not a CSS `border-dashed`, because CSS
               * cannot offset a border's dashes — and offsetting them is the
               * whole effect. It also means screen and export draw the outline
               * the same way.
               */}
              <svg
                className="absolute inset-0"
                width={frame.width}
                height={frame.height}
                aria-hidden="true"
              >
                <rect
                  className={
                    focusedId === frame.id ? "af-frame-march" : undefined
                  }
                  // Inset by half the stroke so the outline sits inside the
                  // measured rectangle instead of straddling its edge.
                  x={1}
                  y={1}
                  width={Math.max(0, frame.width - 2)}
                  height={Math.max(0, frame.height - 2)}
                  rx={11}
                  fill="var(--node-border)"
                  fillOpacity={0.06}
                  stroke="var(--node-border)"
                  strokeOpacity={focusedId === frame.id ? 1 : 0.7}
                  strokeWidth={focusedId === frame.id ? 2 : 1}
                  strokeDasharray="6 4"
                  pathLength={100}
                />
              </svg>
            </div>
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
       *
       * NOT aria-hidden: these are real buttons, and hiding a focusable
       * control from assistive tech is worse than not offering it at all. The
       * LAYER keeps pointer-events none so only the buttons take clicks —
       * making the whole rectangle a hit target was the obvious reading of
       * "click a frame" and is wrong here, because swallowing drags across
       * the middle of a diagram would cost panning, the most-used gesture on
       * this canvas, to buy a shortcut.
       */}
      <ViewportPortal>
        <div
          className="pointer-events-none absolute top-0 left-0"
          style={{ zIndex: 5 }}
        >
          {frames.map((frame) => (
            <button
              key={frame.id}
              type="button"
              onClick={() => {
                focusFrame(frame);
                toggleFocus(frame.id);
              }}
              // The name says what the control DOES; the frame's own label is
              // already inside it.
              // A toggle now, so it has to say so: the caption both zooms and
              // marks the frame as focused, and pressing it again clears that.
              aria-pressed={focusedId === frame.id}
              aria-label={`Zoom to the ${frame.label} frame`}
              // `bg-canvas` punches a gap through the dashed border and any
              // edge behind it, the way a boundary caption is normally drawn.
              className="pointer-events-auto absolute cursor-zoom-in truncate rounded bg-canvas px-1.5 font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              style={{
                transform: `translate(${frame.x + 10}px, ${frame.y + (FRAME_LABEL_BAND - 16) / 2}px)`,
                maxWidth: Math.max(0, frame.width - 20),
                fontSize: 11,
                lineHeight: "16px",
              }}
            >
              {frame.label}
            </button>
          ))}
        </div>
      </ViewportPortal>
    </>
  );
}

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

import { useCallback, useId, useState } from "react";
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
  // Which frame is mid-trace. Cleared by the animation's own end event rather
  // than a timer, so the two can never disagree about when it finished.
  const [tracingId, setTracingId] = useState<string | null>(null);
  const gradientId = useId();

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

  const traceFrame = useCallback((id: string) => {
    // Restart even when the same caption is clicked twice: dropping to null
    // first unmounts the animated rect, so React remounts it and the
    // animation replays instead of silently doing nothing.
    setTracingId(null);
    requestAnimationFrame(() => {
      setTracingId(id);
    });
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
              className="absolute rounded-xl border border-dashed border-node-border/70 bg-node-border/[0.06]"
              style={{
                transform: `translate(${frame.x}px, ${frame.y}px)`,
                width: frame.width,
                height: frame.height,
              }}
            >
              {tracingId === frame.id ? (
                <svg
                  className="absolute inset-0 overflow-visible"
                  width={frame.width}
                  height={frame.height}
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
                      <stop
                        offset="0%"
                        stopColor="var(--primary)"
                        stopOpacity="0"
                      />
                      <stop offset="50%" stopColor="var(--primary)" />
                      <stop
                        offset="100%"
                        stopColor="var(--accent)"
                        stopOpacity="0"
                      />
                    </linearGradient>
                  </defs>
                  <rect
                    className="af-frame-trace"
                    // Inset by half the stroke so the band sits ON the border
                    // rather than straddling outside it.
                    x={1}
                    y={1}
                    width={Math.max(0, frame.width - 2)}
                    height={Math.max(0, frame.height - 2)}
                    rx={11}
                    fill="none"
                    stroke={`url(#${gradientId})`}
                    strokeWidth={2}
                    pathLength={100}
                    onAnimationEnd={() => {
                      setTracingId((cur) => (cur === frame.id ? null : cur));
                    }}
                  />
                </svg>
              ) : null}
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
                traceFrame(frame.id);
              }}
              // The name says what the control DOES; the frame's own label is
              // already inside it.
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

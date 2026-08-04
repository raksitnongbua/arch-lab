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

import { useCallback, useEffect, useId, useState } from "react";
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
  // Scoped per component instance: the viewer and the editor can both be
  // mounted, and duplicate SVG ids would make one steal the other's paint.
  const rainbowId = useId();

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

  // Anything else dismisses it: a node, an edge, empty canvas, Escape.
  //
  // Listening on the document rather than wiring `onPaneClick` and
  // `onNodeClick` through both canvases — the viewer and the editor each own
  // their own handlers, and threading a callback through both to clear one
  // piece of local state would couple three files to it. `pointerdown` in the
  // CAPTURE phase so this still runs when a handler underneath stops
  // propagation, which the canvas does for its own selection.
  useEffect(() => {
    if (focusedId === null) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("[data-frame-hit]") !== null
      ) {
        return;
      }
      setFocusedId(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFocusedId(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [focusedId]);

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
                className="absolute inset-0 overflow-visible"
                width={frame.width}
                height={frame.height}
                aria-hidden="true"
              >
                {/*
                 * The clickable band: a fat transparent stroke along the
                 * perimeter, hit-tested on the STROKE only. The caption alone
                 * was a small target, but making the whole rectangle clickable
                 * would swallow drags across the middle of a diagram and cost
                 * panning. The border is the frame's own edge, so it is both a
                 * big target and an unsurprising one — and the interior stays
                 * pass-through for nodes and the pane underneath.
                 */}
                <rect
                  data-frame-hit=""
                  x={1}
                  y={1}
                  width={Math.max(0, frame.width - 2)}
                  height={Math.max(0, frame.height - 2)}
                  rx={11}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={16}
                  className="cursor-zoom-in"
                  // `stroke` — hit-tested on the band only, so the frame's
                  // interior never intercepts a click meant for a node or a
                  // drag meant for the pane.
                  style={{ pointerEvents: "stroke" }}
                  onClick={() => {
                    focusFrame(frame);
                    toggleFocus(frame.id);
                  }}
                />
                {focusedId === frame.id ? (
                  <defs>
                    {/*
                     * A full spectrum around the outline. `gradientUnits`
                     * defaults to the bounding box, so the sweep spans the
                     * frame whatever its size — a fixed user-space gradient
                     * would compress to a single hue on a small child frame.
                     */}
                    <linearGradient id={rainbowId} x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="oklch(0.72 0.19 20)" />
                      <stop offset="20%" stopColor="oklch(0.78 0.17 70)" />
                      <stop offset="40%" stopColor="oklch(0.8 0.17 140)" />
                      <stop offset="60%" stopColor="oklch(0.75 0.15 195)" />
                      <stop offset="80%" stopColor="oklch(0.68 0.19 280)" />
                      <stop offset="100%" stopColor="oklch(0.72 0.19 20)" />
                    </linearGradient>
                  </defs>
                ) : null}
                <rect
                  className={
                    focusedId === frame.id
                      ? "af-frame-march af-frame-hue"
                      : undefined
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
                  stroke={
                    focusedId === frame.id
                      ? `url(#${rainbowId})`
                      : "var(--node-border)"
                  }
                  strokeOpacity={focusedId === frame.id ? 1 : 0.7}
                  strokeWidth={focusedId === frame.id ? 2 : 1}
                  // Absolute units, NOT pathLength-normalised: with
                  // pathLength=100 a dash is a PERCENTAGE of the perimeter, so
                  // the outer frame drew ~200px dashes while a small one drew
                  // tiny ones. Real pixels keep every frame's dash identical,
                  // and a constant px offset per second means they all march
                  // at the same speed too.
                  strokeDasharray="6 4"
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
              data-frame-hit=""
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

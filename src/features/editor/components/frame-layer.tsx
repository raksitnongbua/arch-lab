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
 *
 * Focus runs in TWO MODES — uncontrolled (the editor, the read-only viewer:
 * this layer holds the focused id and dismisses it itself) and controlled
 * (the editable viewer, where a focused frame is a SELECTION with a details
 * card): see `FrameLayerProps.onSelect` for the argument.
 */

import { useCallback, useEffect, useState } from "react";
import { useReactFlow, ViewportPortal } from "@xyflow/react";

import { placeFrames, FRAME_LABEL_BAND } from "../lib/frame-layout";
import type { C4Diagram } from "@/types";

export interface FrameLayerProps {
  diagram: C4Diagram;
  /**
   * Clear whatever the canvas currently has selected. Focusing a frame and
   * selecting a node are two different "this is what you are looking at"
   * indicators, and they live in different components — the canvas owns node
   * selection, this owns frame focus — so neither can turn the other off on
   * its own. Without this, focusing a frame left a node's comet still running
   * and the diagram claimed two focal points at once. Uncontrolled mode only:
   * a host that passes `onSelect` clears its other selections itself.
   */
  onFocus?: () => void;
  /**
   * CONTROLLED focus, as a pair: when `onSelect` is present the layer stops
   * holding focus state of its own — `selectedFrameId` is the focused frame,
   * a click reports the next value (`null` on a dismissing second click)
   * through `onSelect`, and the document-level dismissal listeners below are
   * NOT installed, because the host owns dismissal along with the state.
   *
   * The pair exists for the editable viewer canvas, where a focused frame is
   * a SELECTION — it opens a details card whose rename form the reader types
   * into. The uncontrolled layer's "any pointerdown elsewhere dismisses"
   * rule would close that selection on the first click INTO the card, so the
   * state has to live where the card's lifetime is decided. The editor and
   * the read-only viewer pass neither prop and keep the uncontrolled
   * behaviour unchanged.
   */
  selectedFrameId?: string | null;
  onSelect?: (frameId: string | null) => void;
}

/** Breathing room around a frame when zooming to it. */
const FOCUS_PADDING = 0.12;

/** Matches the canvas's own camera easing; 0 under reduced motion. */
const FOCUS_DURATION = 320;

export function FrameLayer({
  diagram,
  onFocus,
  selectedFrameId,
  onSelect,
}: FrameLayerProps): React.JSX.Element {
  const { fitBounds } = useReactFlow();
  const frames = placeFrames(diagram);
  const controlled = onSelect !== undefined;
  // The focused frame. Persists — this is a selection indicator the reader
  // asked for, so it stays until they point somewhere else. Local state only
  // while uncontrolled; a controlled host's answer supersedes it below.
  const [localFocusedId, setLocalFocusedId] = useState<string | null>(null);
  const focusedId = controlled ? (selectedFrameId ?? null) : localFocusedId;

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
  // be dismissed without hunting for somewhere neutral to click. Controlled,
  // the toggle is only REPORTED — the host decides what a frame selection
  // displaces, so `onFocus` is not called on its behalf.
  const toggleFocus = useCallback(
    (id: string) => {
      if (onSelect !== undefined) {
        onSelect(focusedId === id ? null : id);
        return;
      }
      setLocalFocusedId((cur) => {
        const next = cur === id ? null : id;
        // Only when taking focus, not when giving it up: clearing on release
        // would wipe a selection the reader made after focusing the frame.
        if (next !== null) onFocus?.();
        return next;
      });
    },
    [onFocus, onSelect, focusedId],
  );

  // Anything else dismisses it: a node, an edge, empty canvas, Escape.
  //
  // Listening on the document rather than wiring `onPaneClick` and
  // `onNodeClick` through both canvases — the viewer and the editor each own
  // their own handlers, and threading a callback through both to clear one
  // piece of local state would couple three files to it. `pointerdown` in the
  // CAPTURE phase so this still runs when a handler underneath stops
  // propagation, which the canvas does for its own selection.
  useEffect(() => {
    // Controlled: the host owns dismissal (its pane click, its node click,
    // its Escape ladder). Installing these too would close the host's frame
    // selection on the first click into the details card it just opened.
    if (controlled) return;
    if (focusedId === null) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("[data-frame-hit]") !== null
      ) {
        return;
      }
      setLocalFocusedId(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLocalFocusedId(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [controlled, focusedId]);

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
              // Controlled (the editable viewer), the same press also SELECTS
              // the boundary — it opens the details card — so the name says
              // select, not zoom: the zoom is the camera helping, the
              // selection is what the reader pressed for.
              data-frame-hit=""
              aria-pressed={focusedId === frame.id}
              aria-label={
                controlled
                  ? `Select the ${frame.label} boundary`
                  : `Zoom to the ${frame.label} frame`
              }
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

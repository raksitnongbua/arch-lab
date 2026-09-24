"use client";

/**
 * The tree canvas's camera — or rather, the one thing it has instead of one.
 *
 * WHY THIS EXISTS AT ALL. The gantt, timeline and lifecycle canvases are SVG
 * and shrink to their pane for free: `max-width: 100%` on a `viewBox`ed root
 * scales the whole drawing. This canvas cannot take that deal, because its
 * boxes are HTML — the author's prose has to WRAP, and SVG `<text>` does not
 * (`./tree-diagram.tsx`). Absolutely positioned HTML at fixed pixel
 * coordinates has no equivalent of `viewBox`: it overflows its pane and the
 * reader is left scrolling a diagram that was supposed to fit.
 *
 * So the scale is computed rather than inherited: measure the pane, divide,
 * and apply one `transform` to the whole stage. `useMeasuredScale` is the
 * shared loop that decides WHEN to measure — on mount, on resize, when the
 * source rail collapses — so this does not grow a second resize observer
 * beside the six that already exist.
 *
 * IT ONLY EVER SHRINKS. The scale is clamped at 1, because a small tree blown
 * up to fill a wide pane reads as a mistake: the type grows, the rules grow,
 * and a four-node breakdown ends up looking like a poster. Every other canvas
 * here makes the same call.
 */

import { useCallback, useRef, useState } from "react";

import { useMeasuredScale } from "@/components/ui/use-measured-scale";
import { CANVAS_RULE_CLASS, groundFieldCss } from "@/lib/canvas-ground";
import { cn } from "@/lib/utils";
import type { TreeLabFile } from "@/types";

import { layoutTree } from "../lib/layout";
import { TreeDiagram } from "./tree-diagram";

export function TreeViewer({ file }: { file: TreeLabFile }) {
  const paneRef = useRef<HTMLDivElement | null>(null);
  const layout = layoutTree(file);
  const { width } = layout;
  /* The column band the diagram draws above the tree, plus the caption row.
     Kept here because the pane has to RESERVE the scaled height and
     `transform` does not affect layout: without this the pane keeps the
     unscaled height and leaves a band of dead space under a shrunk diagram. */
  const naturalHeight = layout.height + (layout.columns.length > 0 ? 30 : 0);
  const title = file.metadata?.title ?? "";

  const measure = useCallback(() => {
    const pane = paneRef.current;
    if (pane === null) return 1;
    /* `clientWidth` INCLUDES PADDING, and the pane has some. Fitting against
       it would size the drawing to the padded box and let it run under its own
       gutters — the measurement has to be the CONTENT box. */
    const style = window.getComputedStyle(pane);
    const available =
      pane.clientWidth -
      Number.parseFloat(style.paddingLeft) -
      Number.parseFloat(style.paddingRight);
    if (!(available > 0) || width === 0) return 1;
    return Math.min(1, available / width);
  }, [width]);

  const fitScale = useMeasuredScale(paneRef, measure);

  /* ZOOM IS A MULTIPLIER ON FIT, not an absolute scale. "Fit" is the state a
     reader returns to, and it changes whenever the pane does — a numeric zoom
     would drift away from it on every resize and the reset would land
     somewhere the reader did not leave. 1 is always exactly fit. */
  const [zoom, setZoom] = useState(1);
  const scale = fitScale * zoom;

  /* A FOCUS, NOT A SELECTION: clicking a node lights it, everything it is part
     of, and everything under it, and dims the rest. Clicking it again — or the
     backdrop — clears it. Nothing is edited, so there is no selected state to
     keep beyond the look. */
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const step = (by: number) =>
    setZoom((current) =>
      Math.min(3, Math.max(0.4, Math.round((current + by) * 10) / 10)),
    );

  return (
    /* THE GROUND GOES ON THE PANE, never inside the drawing: on the drawing
       it would be clipped to the drawing's box, leaving a half-ruled pane.
       It is told the camera's scale because the ladder is a question about
       SCREEN size — a rung chosen for the unscaled drawing lands below the
       legible floor once the camera shrinks it. */
    <div
      ref={paneRef}
      className={cn("aft-tree-pane", CANVAS_RULE_CLASS)}
      style={groundFieldCss(scale)}
      /* THE BACKDROP CLEARS THE FOCUS. A reader who has dimmed most of the
         diagram needs a way out that is not hunting for the node they pressed,
         and the empty pane is the largest target on screen. */
      onClick={(event) => {
        if (event.target === event.currentTarget) setFocusedId(null);
      }}
    >
      {/* THE CAPTION SITS OUTSIDE THE CAMERA, at full size. Inside it, it both
          shrank with the drawing and stole height the pane had not reserved —
          the pane measures the STAGE, so a caption within it pushed the last
          row past the clip. A title is chrome rather than diagram, and chrome
          does not zoom. */}
      <div className="aft-tree-chrome">
        {title === "" ? null : <p className="aft-tree-title">{title}</p>}
        <div className="aft-tree-zoom">
          <button
            type="button"
            onClick={() => step(-0.2)}
            aria-label="Zoom out"
          >
            −
          </button>
          {/* The label reads the EFFECTIVE scale, not the multiplier: a reader
              wants to know how big the drawing is, and on a narrow pane fit is
              already well under 1. */}
          <button
            type="button"
            onClick={() => setZoom(1)}
            aria-label="Reset zoom to fit"
          >
            {Math.round(scale * 100)}%
          </button>
          <button type="button" onClick={() => step(0.2)} aria-label="Zoom in">
            +
          </button>
        </div>
      </div>
      {/* The box that RESERVES the scaled height. `transform` does not affect
          layout, so without this the shrunk drawing would still hold its full
          height open and leave a band of dead space under it. */}
      <div style={{ height: naturalHeight * scale }}>
        <div
          className="aft-tree-camera"
          style={{ transform: `scale(${scale})`, width }}
        >
          <TreeDiagram
            file={file}
            showTitle={false}
            focusedId={focusedId}
            onFocus={setFocusedId}
          />
        </div>
      </div>
    </div>
  );
}

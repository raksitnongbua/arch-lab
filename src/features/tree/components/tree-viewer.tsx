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

import { useRef, useState } from "react";

import { Scan, ZoomIn, ZoomOut } from "lucide-react";

import { ZoomMenu } from "@/components/ui/zoom-menu";
import {
  ZOOM_BUTTON_CLASSES,
  ZOOM_IN_TITLE,
  ZOOM_OUT_TITLE,
  ZOOM_PILL_CLASSES,
} from "@/components/ui/zoom-pill";
import { useCanvasZoom, ZOOM_MAX } from "@/components/ui/use-canvas-zoom";

import { CANVAS_RULE_CLASS, groundFieldCss } from "@/lib/canvas-ground";
import { cn } from "@/lib/utils";
import type { TreeLabFile } from "@/types";

import { layoutTree } from "../lib/layout";
import { TreeDiagram } from "./tree-diagram";

export function TreeViewer({ file }: { file: TreeLabFile }) {
  const paneRef = useRef<HTMLDivElement | null>(null);
  const layout = layoutTree(file);
  const { width } = layout;
  /* The column band the diagram draws above the tree. The camera has to be
     told the FULL content height or "fit" would scale to the tree alone and
     clip the headers off the top. */
  const naturalHeight =
    layout.height +
    (layout.columns.length > 0 || layout.levels.length > 0 ? 30 : 0);
  const title = file.metadata?.title ?? "";

  /* THE HOUSE CAMERA, not a private one. The first version of this canvas had
     its own fit measurement and its own multiplier, which meant the tree
     zoomed on different steps from every other diagram and its reset button
     did not mean what the pill's does. `useCanvasZoom` owns fit, the step
     ladder, the clamps and the pan, so 400% and a pinch behave identically
     across the product. */
  const camera = useCanvasZoom({
    paneRef,
    contentWidth: width,
    contentHeight: naturalHeight,
  });
  const scale = camera.scale;

  /* A FOCUS, NOT A SELECTION: pressing a node lights it, everything it is part
     of, and everything under it, and dims the rest. Nothing is edited, so
     there is no selected state to keep beyond the look. */
  const [focusedId, setFocusedId] = useState<string | null>(null);

  return (
    /* THE GROUND GOES ON THE PANE, never inside the drawing: on the drawing
       it would be clipped to the drawing's box, leaving a half-ruled pane.
       It is told the camera's scale because the ladder is a question about
       SCREEN size — a rung chosen for the unscaled drawing lands below the
       legible floor once the camera shrinks it. */
    /* THE FRAME DOES NOT SCROLL; THE PANE INSIDE IT DOES. The zoom pill used
       to sit inside the pane, which becomes a scroll container the moment the
       drawing outgrows it — so the pill scrolled away with the diagram instead
       of staying in its corner. Anchoring it to a frame that never scrolls is
       what keeps it where every other canvas puts it. */
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={paneRef}
        className={cn("aft-tree-pane", CANVAS_RULE_CLASS)}
        style={groundFieldCss(scale)}
        /* THE BACKDROP CLEARS THE FOCUS. A reader who has dimmed most of the
         diagram needs a way out that is not hunting for the node they pressed,
         and the empty pane is the largest target on screen. */
        onClick={(event) => {
          /* `consumePanClick` READS AND CLEARS, so it must be called exactly
           once per click. Without it, the click that ends a pan would clear
           the reader's focus every time they dragged the canvas. */
          if (camera.consumePanClick()) return;
          /* ANY EMPTY SPACE CLEARS, not just the pane element itself. The first
           version compared `target` to `currentTarget`, which meant only the
           bare pane counted — and the drawing's own panel covers most of the
           pane, so the largest empty area on screen did nothing. What a reader
           means by "somewhere else" is anywhere that is not a control, so the
           test is whether the click landed on one. */
          const onControl =
            event.target instanceof Element &&
            /* THE WIRE IS NOT A BUTTON but it is a control: it is an SVG path,
             so `closest("button")` misses it and the backdrop would clear the
             focus the same click that the wire had just set. */
            event.target.closest("button, .aft-tree-wire-hit") !== null;
          if (!onControl) setFocusedId(null);
        }}
      >
        {/* THE CAPTION SITS OUTSIDE THE CAMERA, at full size. Inside it, it both
          shrank with the drawing and stole height the pane had not reserved —
          the pane measures the STAGE, so a caption within it pushed the last
          row past the clip. A title is chrome rather than diagram, and chrome
          does not zoom. */}
        {title === "" ? null : <p className="aft-tree-title">{title}</p>}

        {/* The box that RESERVES the scaled height. `transform` does not affect
          layout, so without this the shrunk drawing would still hold its full
          height open and leave a band of dead space under it. */}
        {/* RESERVES BOTH AXES. `transform` does not affect layout, so the
            pane learns nothing about a scaled drawing's size from the camera
            alone: without the height it left a band of dead space under a
            shrunk tree, and without the WIDTH it never knew the drawing was
            wider than itself, so there was nothing to scroll sideways and a
            zoomed-in tree simply had its right-hand columns cut off. */}
        <div style={{ width: width * scale, height: naturalHeight * scale }}>
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

      {/* THE HOUSE ZOOM PILL — the same control, classes and gesture hints
          every other canvas mounts, in the same corner, so the tree does not
          teach a reader a second way to zoom. */}
      <div className="pointer-events-auto absolute right-3 bottom-3 z-20">
        <div className={ZOOM_PILL_CLASSES}>
          <button
            type="button"
            onClick={camera.zoomOut}
            title={ZOOM_OUT_TITLE}
            aria-label="Zoom out"
            className={ZOOM_BUTTON_CLASSES}
          >
            <ZoomOut aria-hidden="true" className="size-4" />
          </button>
          <ZoomMenu
            percent={camera.percent}
            isFit={camera.isFit}
            maxZoom={ZOOM_MAX}
            onFit={camera.fit}
            onZoomTo={camera.zoomTo}
            title="Zoom level"
            keyboardHint=""
          />
          <button
            type="button"
            onClick={camera.zoomIn}
            title={ZOOM_IN_TITLE}
            aria-label="Zoom in"
            className={ZOOM_BUTTON_CLASSES}
          >
            <ZoomIn aria-hidden="true" className="size-4" />
          </button>
          <button
            type="button"
            onClick={camera.fit}
            title="Fit the diagram to the pane"
            aria-label="Fit to pane"
            className={ZOOM_BUTTON_CLASSES}
          >
            <Scan aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

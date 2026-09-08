"use client";

/**
 * Where a fixed-size HTML control goes when it has to sit over a point INSIDE
 * a drawing.
 *
 * WHY IT EXISTS — the bug it is the fix for. The use-case heading editor and
 * the dictionary title editor were both native forms mounted in a
 * `foreignObject` inside the canvas's own `<svg>`. Everything inside that
 * element is multiplied by the viewBox-to-viewport ratio, and the use-case
 * camera's "fit" deliberately MAGNIFIES a small drawing — so on a compact
 * document in a wide pane the form painted at between 2.5x and 4.7x: a 14px
 * label at 36-66px, an Apply button larger than the diagram's own nodes, a
 * form as wide as the whole boundary. The measurement is in
 * `check:usecase-layout`'s own section header.
 *
 * The counter-example was already in the codebase: the canvas lock button and
 * the zoom pill are the right size at every zoom because they are absolutely
 * positioned HTML SIBLINGS of the `<svg>`, never children of it. So is
 * anything positioned through here.
 *
 * `getScreenCTM`, NOT ARITHMETIC ON ZOOM AND SCROLL. It is the same matrix the
 * canvases' drags already invert to turn a client point into a layout unit
 * (`toLayoutUnits` in `usecase-viewer.tsx`); this is that conversion run
 * forwards. Doing it by hand would have to account separately for the viewBox
 * origin — which goes NEGATIVE the moment an element is pinned left of or
 * above the origin — for `preserveAspectRatio` letterboxing, which changes
 * with the pane's aspect ratio, and for any page transform above the pane.
 * The matrix already knows all three.
 *
 * THE RESULT IS IN THE PANE'S CONTENT COORDINATES, not in client pixels, so
 * the overlay is mounted as a child of the pane and SCROLLS AND CLIPS WITH THE
 * DRAWING rather than floating free of it. The caller's pane needs
 * `position: relative` for that.
 *
 * AND IT IS CLAMPED INTO WHAT THE READER CAN SEE. Both editors previously
 * clamped their unit-space box inside the drawing, for a real reason: an
 * `<svg>` clips its viewport, so a form hanging off the edge of a small
 * document had its Apply row shaved off with nothing on screen to say so. That
 * intent is kept here, in screen space — the box is pulled back inside the
 * pane's visible rectangle, which is the thing that can actually cut it off
 * now.
 */

import { useCallback, useEffect, useState } from "react";

/** A box in the drawing's own LAYOUT UNITS. */
export interface CanvasOverlayAnchor {
  x: number;
  y: number;
}

/** Where to put the overlay, in the pane's CONTENT coordinates (CSS px). */
export interface CanvasOverlayPosition {
  left: number;
  top: number;
}

/**
 * @param paneRef the scroll container the overlay is mounted inside. Must be a
 * positioned element, or `left`/`top` resolve against the wrong box.
 * @param svgRef the live `<svg>` the anchor's units belong to.
 * @param anchor the point the overlay's top-left wants, in LAYOUT UNITS —
 * `null` while there is nothing to place.
 * @param size the overlay's own size in CSS PIXELS. It is a fixed on-screen
 * size and must never be derived from the layout: that is the whole point of
 * positioning a control this way rather than drawing it.
 * @returns the position, or `null` until the pane and the matrix can be read.
 */
export function useCanvasOverlayPosition({
  paneRef,
  svgRef,
  anchor,
  size,
}: {
  paneRef: React.RefObject<HTMLElement | null>;
  svgRef: React.RefObject<SVGSVGElement | null>;
  anchor: CanvasOverlayAnchor | null;
  size: { width: number; height: number };
}): CanvasOverlayPosition | null {
  const [position, setPosition] = useState<CanvasOverlayPosition | null>(null);
  /* Read off the anchor and the size as NUMBERS rather than holding the
     objects: a caller writing `anchor={{ x, y }}` inline would otherwise
     re-arm the effect on every render, and the effect installs listeners. */
  const anchorX = anchor?.x ?? null;
  const anchorY = anchor?.y ?? null;
  const { width, height } = size;

  const measure = useCallback((): CanvasOverlayPosition | null => {
    const pane = paneRef.current;
    const svg = svgRef.current;
    if (pane === null || svg === null || anchorX === null || anchorY === null) {
      return null;
    }
    const matrix = svg.getScreenCTM();
    if (matrix === null) return null;
    const point = svg.createSVGPoint();
    point.x = anchorX;
    point.y = anchorY;
    const onScreen = point.matrixTransform(matrix);

    const paneBox = pane.getBoundingClientRect();
    /* An absolutely positioned child resolves against the pane's PADDING box,
       which does not move when the pane scrolls — so the scroll offset is
       added back to turn a client point into a content one. */
    const wanted = {
      left: onScreen.x - paneBox.left + pane.scrollLeft,
      top: onScreen.y - paneBox.top + pane.scrollTop,
    };
    /* The visible rectangle, in those same content coordinates. */
    const view = {
      left: pane.scrollLeft,
      top: pane.scrollTop,
      right: pane.scrollLeft + pane.clientWidth,
      bottom: pane.scrollTop + pane.clientHeight,
    };
    return {
      left: Math.max(
        view.left,
        Math.min(wanted.left, Math.max(view.left, view.right - width)),
      ),
      top: Math.max(
        view.top,
        Math.min(wanted.top, Math.max(view.top, view.bottom - height)),
      ),
    };
  }, [paneRef, svgRef, anchorX, anchorY, width, height]);

  useEffect(() => {
    const pane = paneRef.current;
    if (pane === null || anchorX === null || anchorY === null) {
      setPosition(null);
      return;
    }
    const update = (): void => {
      setPosition(measure());
    };
    update();
    /* THREE THINGS MOVE THE ANCHOR UNDER A STILL OVERLAY, and each has its own
       listener:

         - the reader PANS, which is a scroll of the pane (passive — nothing
           here writes layout);
         - the PANE changes size — the source rail collapsing, immersive mode,
           the window;
         - the CAMERA moves, which is why the `<svg>` itself is observed and
           not only its pane. A zoom resizes the drawing and leaves the pane
           alone, and the anchor is in layout units so it does not move either;
           the svg's own box is the thing that changed. Observing it is what
           replaced passing the scale in, which was a dependency the hook never
           read.

       A change of DOCUMENT needs nothing: it arrives as different anchor
       numbers, which re-arm this effect. */
    pane.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const observer = new ResizeObserver(update);
    observer.observe(pane);
    const svg = svgRef.current;
    if (svg !== null) observer.observe(svg);
    return () => {
      pane.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      observer.disconnect();
    };
  }, [paneRef, svgRef, anchorX, anchorY, measure]);

  return position;
}

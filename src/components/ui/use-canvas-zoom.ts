"use client";

/**
 * The house camera as a hook: fit-by-default, numeric zoom, a scroll anchor
 * kept across a change, and trackpad pinch / ctrl+wheel claimed and clamped.
 *
 * WHY THIS EXISTS AS A HOOK when four viewers already have this logic inline.
 * The C4, sequence, flowchart and use-case viewers each carry their own copy —
 * about 150 lines apiece — and adding a fifth and sixth for ER and the
 * dictionary would have been the cheap thing to write and the expensive thing
 * to own, which is what `codebase.md` now names as the most common cause of
 * defects on this branch. So the two new canvases share this one.
 *
 * FOLDING THE EXISTING FOUR ONTO IT IS THE FOLLOW-UP, deliberately not done
 * here: they are working code with their own check scripts and their own
 * documented deviations (the sequence viewer claims gestures the others do
 * not), and rewriting four cameras to land two is how a feature becomes a
 * regression. This hook was written to their shape rather than a new one, so
 * the adoption is a deletion rather than a redesign.
 *
 * IT ALSO OWNS DRAG-TO-PAN, because panning and zooming are one camera and
 * splitting them across two hooks means two things reading the same scroll
 * offsets. The drag defers to anything that owns a click, so focusing a table
 * still works.
 *
 * THE ANCHOR IS THE SUBTLE PART. Zooming changes the scrollable size, so a
 * naive implementation leaves the reader looking somewhere else. The anchor is
 * kept as FRACTIONS of the scrollable content plus the viewport point they
 * were under — the both-modes-safe quantity, because it survives the switch
 * between "fit" and a numeric scale, where absolute pixels do not.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { ZOOM_STEP } from "@/components/ui/zoom-pill";

/** The house clamps. Same numbers every viewer uses, so 400% means one thing. */
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 4;

export interface CanvasZoom {
  /** `"fit"` or a multiplier. */
  zoom: number | "fit";
  /** The multiplier actually in effect, with `"fit"` resolved. */
  scale: number;
  isFit: boolean;
  percent: number;
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  zoomTo: (scale: number) => void;
}

/**
 * THE PANE REF IS PASSED IN, not returned. Returning it read cleanly but
 * `react-hooks` refuses a ref handed back out of a hook and then read during
 * render — refs are not render inputs, and a component that re-renders on one
 * changing is a component with a bug waiting. The caller owns the ref and
 * attaches it; this only reads it inside effects and handlers, which is where
 * a ref may be read.
 */
export function useCanvasZoom({
  paneRef,
  contentWidth,
  contentHeight,
  onAnnounce,
}: {
  paneRef: React.RefObject<HTMLDivElement | null>;
  contentWidth: number;
  contentHeight: number;
  onAnnounce?: (message: string) => void;
}): CanvasZoom {
  const [zoom, setZoom] = useState<number | "fit">("fit");
  /* Re-measured on resize, because "fit" is a function of the pane and the
     pane changes when the source rail is collapsed or the window resized. */
  const [fitScale, setFitScale] = useState(1);

  const measureFit = useCallback((): number => {
    const pane = paneRef.current;
    if (pane === null) return 1;
    const width = pane.clientWidth - 24;
    const height = pane.clientHeight - 24;
    if (width <= 0 || height <= 0 || contentWidth <= 0 || contentHeight <= 0) {
      return 1;
    }
    /* Never magnify to fit: a small diagram blown up to fill a wide pane
       reads as a mistake, and the reader can zoom in if they want that. */
    return Math.min(1, width / contentWidth, height / contentHeight);
  }, [paneRef, contentWidth, contentHeight]);

  useEffect(() => {
    const pane = paneRef.current;
    if (pane === null) return;
    const update = (): void => {
      setFitScale(measureFit());
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(pane);
    return () => {
      observer.disconnect();
    };
  }, [paneRef, measureFit]);

  const anchor = useRef<{
    cx: number;
    cy: number;
    vx: number;
    vy: number;
  } | null>(null);

  const apply = useCallback(
    (next: number, at?: { x: number; y: number }) => {
      const pane = paneRef.current;
      if (pane !== null && pane.scrollWidth > 0 && pane.scrollHeight > 0) {
        const vx = at?.x ?? pane.clientWidth / 2;
        const vy = at?.y ?? pane.clientHeight / 2;
        anchor.current = {
          cx: (pane.scrollLeft + vx) / pane.scrollWidth,
          cy: (pane.scrollTop + vy) / pane.scrollHeight,
          vx,
          vy,
        };
      }
      const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
      setZoom(clamped);
      onAnnounce?.(
        `Zoom ${Math.round(clamped * 100)} percent. Scroll or drag the pane to pan.`,
      );
      return clamped;
    },
    [paneRef, onAnnounce],
  );

  /* Restored AFTER the new size has been laid out, or the fractions are
     applied against the old scrollWidth and the view jumps. */
  useEffect(() => {
    const saved = anchor.current;
    if (saved === null) return;
    anchor.current = null;
    const pane = paneRef.current;
    if (pane === null) return;
    pane.scrollLeft = saved.cx * pane.scrollWidth - saved.vx;
    pane.scrollTop = saved.cy * pane.scrollHeight - saved.vy;
  }, [paneRef, zoom]);

  const scale = zoom === "fit" ? fitScale : zoom;

  /* CENTRED ON FIRST PAINT. A diagram larger than its pane used to open on its
     top-left corner, which for a wide schema is the emptiest part of it — the
     reader's first move was always a drag toward the middle. Once only: after
     that the scroll position is the reader's, and re-centring on every content
     change would fight them as they type. */
  const centred = useRef(false);
  useEffect(() => {
    if (centred.current) return;
    const pane = paneRef.current;
    if (pane === null || pane.scrollWidth === 0) return;
    if (
      pane.scrollWidth <= pane.clientWidth &&
      pane.scrollHeight <= pane.clientHeight
    ) {
      /* Nothing overflows yet — `safe center` is already doing the centring,
         and claiming the one-shot here would spend it on a no-op. */
      return;
    }
    centred.current = true;
    pane.scrollLeft = (pane.scrollWidth - pane.clientWidth) / 2;
    pane.scrollTop = (pane.scrollHeight - pane.clientHeight) / 2;
  }, [paneRef, scale, contentWidth, contentHeight]);

  const step = useCallback(
    (direction: 1 | -1) => {
      apply(scale * (direction === 1 ? ZOOM_STEP : 1 / ZOOM_STEP));
    },
    [scale, apply],
  );

  /* Trackpad pinch and ctrl/⌘ + wheel, CLAIMED so the browser does not zoom
     the whole page instead — which is what happens without `preventDefault`,
     and is the single most jarring thing a canvas can do. Coalesced into one
     frame: a pinch fires dozens of events and re-rendering on each one drops
     the gesture's smoothness. */
  useEffect(() => {
    const pane = paneRef.current;
    if (pane === null) return;
    let pending: number | null = null;
    let frame: number | null = null;

    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = pane.getBoundingClientRect();
      const at = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      const base = pending ?? scale;
      pending = Math.min(
        ZOOM_MAX,
        Math.max(ZOOM_MIN, base * Math.exp(-event.deltaY / 300)),
      );
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        const next = pending;
        pending = null;
        if (next !== null) apply(next, at);
      });
    };

    pane.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      pane.removeEventListener("wheel", onWheel);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [paneRef, scale, apply]);

  /* DRAG TO PAN. Scrollbars alone are not how anyone moves around a diagram —
     the gesture people reach for is grabbing the canvas — and on a zoomed-in
     schema the scrollbars may not even be near the pointer.
     
     POINTER EVENTS, not mouse: one implementation covers a trackpad, a mouse
     and a touch screen, and `setPointerCapture` keeps the drag alive when the
     pointer leaves the pane mid-gesture, which is the common way a drag ends
     up half-applied.
     
     IT DEFERS TO THE THINGS THAT OWN A CLICK. A primary-button press on an
     entity is a FOCUS, not a pan, so a drag only starts on a target that is
     not interactive — otherwise clicking a table would jitter the canvas and
     sometimes fail to focus at all. A middle-button drag always pans, because
     nothing else claims it. */
  useEffect(() => {
    const pane = paneRef.current;
    if (pane === null) return;
    let origin: {
      x: number;
      y: number;
      left: number;
      top: number;
      id: number;
    } | null = null;

    const onDown = (event: PointerEvent): void => {
      if (event.button !== 0 && event.button !== 1) return;
      if (
        event.button === 0 &&
        (event.target as Element | null)?.closest(
          '[role="button"],a,button,input,textarea,select',
        ) !== null
      ) {
        return;
      }
      origin = {
        x: event.clientX,
        y: event.clientY,
        left: pane.scrollLeft,
        top: pane.scrollTop,
        id: event.pointerId,
      };
      pane.setPointerCapture(event.pointerId);
      pane.style.cursor = "grabbing";
    };

    const onMove = (event: PointerEvent): void => {
      if (origin === null || event.pointerId !== origin.id) return;
      event.preventDefault();
      pane.scrollLeft = origin.left - (event.clientX - origin.x);
      pane.scrollTop = origin.top - (event.clientY - origin.y);
    };

    const onUp = (event: PointerEvent): void => {
      if (origin === null || event.pointerId !== origin.id) return;
      origin = null;
      pane.style.cursor = "";
      if (pane.hasPointerCapture(event.pointerId)) {
        pane.releasePointerCapture(event.pointerId);
      }
    };

    pane.addEventListener("pointerdown", onDown);
    pane.addEventListener("pointermove", onMove);
    pane.addEventListener("pointerup", onUp);
    pane.addEventListener("pointercancel", onUp);
    return () => {
      pane.removeEventListener("pointerdown", onDown);
      pane.removeEventListener("pointermove", onMove);
      pane.removeEventListener("pointerup", onUp);
      pane.removeEventListener("pointercancel", onUp);
    };
  }, [paneRef]);

  return {
    zoom,
    scale,
    isFit: zoom === "fit",
    percent: Math.round(scale * 100),
    zoomIn: () => step(1),
    zoomOut: () => step(-1),
    fit: () => {
      setZoom("fit");
      onAnnounce?.("Diagram fitted to view — the whole diagram is on screen.");
    },
    zoomTo: (next: number) => apply(next),
  };
}

"use client";

/**
 * Canvas overlay (bottom-left): the camera controls the viewer owns.
 *
 *  - Zoom out / zoom in — one {@link ZOOM_STEP} press either way, clamped by
 *    React Flow to the viewer's own `MIN_ZOOM`/`MAX_ZOOM`. These used to be
 *    absent, leaving ctrl-scroll and pinch as the ONLY way to magnify a
 *    diagram: a gesture nobody is told about, unavailable on a plain mouse
 *    wheel, and impossible from the keyboard except through a shortcut sheet
 *    the viewer does not have (the sheet is the editor's). The buttons carry
 *    the gesture in their tooltip, so the control teaches the shortcut rather
 *    than replacing it.
 *  - Zoom readout — the live percentage straight from the React Flow
 *    viewport (`useViewport` re-renders on every zoom change, so it tracks
 *    wheel, pinch, fit and programmatic zooms alike). Clicking it resets
 *    zoom to exactly 100%.
 *  - Fit view — recentres and rescales the current diagram to fill the
 *    canvas, with the same padding every automatic fit uses. Animated with
 *    the shared `fitView` duration; under `prefers-reduced-motion`,
 *    `duration()` returns 0 and React Flow snaps instead of animating.
 *
 * Order matches the sequence viewer's pill — out, readout, in, fit — because
 * they are the same control on two canvases and the chrome comes from one
 * place (`components/ui/zoom-pill.tsx`). Mounted inside the React Flow tree
 * (Panel), so it rides along into immersive and native-fullscreen modes.
 */

import { Scan, ZoomIn, ZoomOut } from "lucide-react";
import { useReactFlow, useViewport } from "@xyflow/react";

import {
  ZOOM_BUTTON_CLASSES,
  ZOOM_IN_TITLE,
  ZOOM_OUT_TITLE,
  ZOOM_PILL_CLASSES,
  ZOOM_READOUT_CLASSES,
  ZOOM_STEP,
} from "@/components/ui/zoom-pill";
import { duration } from "@/features/editor/lib/motion";

import { FIT_PADDING } from "../lib/canvas-constants";

export function ViewerZoomControls(): React.JSX.Element {
  const { fitView, zoomTo, getZoom } = useReactFlow();
  const { zoom } = useViewport();
  const percent = Math.round(zoom * 100);

  /* Read the zoom at CLICK time rather than closing over the render's value:
     a wheel zoom between renders would otherwise step from a stale base and
     the diagram would jump backwards under the press. */
  const step = (direction: 1 | -1) => {
    const next = getZoom() * (direction === 1 ? ZOOM_STEP : 1 / ZOOM_STEP);
    void zoomTo(next, { duration: duration("fitView") });
  };

  return (
    <div className={ZOOM_PILL_CLASSES}>
      <button
        type="button"
        onClick={() => step(-1)}
        aria-label="Zoom out"
        title={ZOOM_OUT_TITLE}
        className={ZOOM_BUTTON_CLASSES}
      >
        <ZoomOut aria-hidden="true" className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => {
          void zoomTo(1, { duration: duration("fitView") });
        }}
        aria-label={`Zoom ${percent} percent — reset to 100 percent`}
        title="Actual size (100%)"
        className={ZOOM_READOUT_CLASSES}
      >
        {percent}%
      </button>
      <button
        type="button"
        onClick={() => step(1)}
        aria-label="Zoom in"
        title={ZOOM_IN_TITLE}
        className={ZOOM_BUTTON_CLASSES}
      >
        <ZoomIn aria-hidden="true" className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => {
          void fitView({ padding: FIT_PADDING, duration: duration("fitView") });
        }}
        aria-label="Fit diagram to view"
        title="Fit diagram to view"
        className={ZOOM_BUTTON_CLASSES}
      >
        <Scan aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}

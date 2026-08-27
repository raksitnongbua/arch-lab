"use client";

/**
 * Canvas overlay (bottom-right, under the minimap): the camera controls the
 * viewer owns.
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
 *    wheel, pinch, fit and programmatic zooms alike). Clicking it opens the
 *    preset menu (Fit / 50 / 100 / 200%, filtered by this canvas's own 250%
 *    clamp): "show me this at 200%" is a destination, not four `+` presses.
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

import { IconStyleToggle } from "@/components/ui/icon-style-toggle";
import { ZoomMenu } from "@/components/ui/zoom-menu";
import {
  ZOOM_BUTTON_CLASSES,
  ZOOM_IN_TITLE,
  ZOOM_OUT_TITLE,
  ZOOM_PILL_CLASSES,
  ZOOM_STEP,
} from "@/components/ui/zoom-pill";
import { duration } from "@/features/editor/lib/motion";

import { FIT_PADDING, MAX_ZOOM } from "../lib/canvas-constants";

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
      <ZoomMenu
        percent={percent}
        /* React Flow has no "fitted" state to read back — a fit is just a
           viewport — so the readout always shows a number here. Only the
           sequence viewer, whose fit is a real mode, ever shows "Fit". */
        isFit={false}
        maxZoom={MAX_ZOOM}
        onFit={() => {
          void fitView({ padding: FIT_PADDING, duration: duration("fitView") });
        }}
        onZoomTo={(scale) => {
          void zoomTo(scale, { duration: duration("fitView") });
        }}
        title="Choose a zoom level"
      />
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
      {/* A hairline, not a gap: the icon style is a different KIND of
          control from the zoom cluster beside it — one changes how much you
          see, the other how it is drawn — and grouping them without a divider
          invites reading the toggle as another zoom step. */}
      <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-border/70" />
      <IconStyleToggle />
    </div>
  );
}

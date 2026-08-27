"use client";

/**
 * Zoom controls. Owned by ; mounted by `canvas.tsx` in the
 * bottom-right panel, beneath the minimap.
 *
 * It was a bare percentage for a long time, and that made the editor the only
 * canvas here where zooming in needed a gesture (⌘/ctrl + scroll, pinch) or a
 * keystroke you had to open the shortcut sheet to learn — the readout looked
 * like a control and did only one thing, which is worse than looking inert.
 * Now it is the same pill as the two viewers, from the same chrome module, and
 * the buttons name the gesture and the shortcut in their tooltips so the sheet
 * stays a reference rather than a prerequisite.
 *
 * `shift+1` / `shift+0` remain the keyboard route (`SHORTCUT_GROUPS`,
 * "Navigate"); these buttons deliberately do not register new bindings.
 */

import { Scan, ZoomIn, ZoomOut } from "lucide-react";
import { useReactFlow, useViewport } from "@xyflow/react";

import { IconStyleToggle } from "@/components/ui/icon-style-toggle";
import { MinimapToggle } from "@/components/ui/minimap-toggle";
import { ZoomMenu } from "@/components/ui/zoom-menu";
import {
  ZOOM_BUTTON_CLASSES,
  ZOOM_IN_TITLE,
  ZOOM_OUT_TITLE,
  ZOOM_PILL_CLASSES,
  ZOOM_STEP,
} from "@/components/ui/zoom-pill";

import { FIT_VIEW_PADDING_PX, MAX_ZOOM } from "../lib/canvas-constants";
import { duration } from "../lib/motion";

export function ZoomIndicator({
  minimapOpen,
  onMinimapToggle,
}: {
  minimapOpen: boolean;
  onMinimapToggle: () => void;
}): React.JSX.Element {
  const { zoom } = useViewport();
  const { fitView, zoomTo, getZoom } = useReactFlow();
  const percent = Math.round(zoom * 100);

  /* Read at CLICK time, not from the render's closure: a wheel zoom landing
     between renders would otherwise make the button step from a stale base. */
  const step = (direction: 1 | -1) => {
    const next = getZoom() * (direction === 1 ? ZOOM_STEP : 1 / ZOOM_STEP);
    void zoomTo(next, { duration: duration("fitView") });
  };

  const fit = (): void => {
    void fitView({
      /* The `px` unit is load-bearing: a bare number is a FRACTION of the
         viewport to React Flow, so `48` would pad by 4800%. Same string the
         `shift+1` binding in `canvas.tsx` passes. */
      padding: `${FIT_VIEW_PADDING_PX}px`,
      duration: duration("fitView"),
    });
  };

  return (
    <div className={ZOOM_PILL_CLASSES}>
      <MinimapToggle open={minimapOpen} onToggle={onMinimapToggle} />
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
        isFit={false}
        maxZoom={MAX_ZOOM}
        onFit={fit}
        onZoomTo={(scale) => {
          void zoomTo(scale, { duration: duration("fitView") });
        }}
        title="Choose a zoom level"
        keyboardHint="shift + 1 fits · shift + 0 is 100%"
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
        onClick={fit}
        aria-label="Fit the diagram to the view"
        title="Fit to view — shift + 1"
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

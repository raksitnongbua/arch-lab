"use client";

/**
 * A measurement of the pane, kept current across resizes — one definition for
 * the six viewers that need one.
 *
 * WHY IT EXISTS. The ground's adaptive ladder needs the camera's SCALE, and
 * three of the app's cameras express "fit" as a mode rather than a number: the
 * scale is only known once the pane has been measured, and it changes when the
 * source rail collapses, the window resizes, or immersive mode opens. Three
 * viewers already had a `measureFitScale` callback for stepping out of fit —
 * a callback, not state, so nothing re-rendered when the pane changed size.
 * The other three canvases (gantt, timeline, lifecycle) have no camera at all
 * and are shrunk by `max-width: 100%`, which is a scale nobody was computing.
 *
 * WHAT IT IS NOT: a second source of truth for zoom. The caller supplies the
 * measurement; this only decides WHEN to take it. A viewer with a numeric zoom
 * must use that number and not this hook.
 *
 * `useCanvasZoom` keeps its own copy of this loop rather than calling here,
 * deliberately: it measures inside a hook that also owns pan, anchoring and the
 * clamps, and splitting the observer out would mean two things reading the same
 * element's box on different frames.
 */

import { useCallback, useEffect, useState } from "react";

/**
 * @param paneRef the element whose box the measurement depends on.
 * @param measure taken on mount and on every resize of that element. Must be
 * stable — wrap it in `useCallback`.
 * @returns the latest measurement; `1` before the first one lands, which is the
 * correct scale for an unshrunk canvas rather than a placeholder.
 */
export function useMeasuredScale(
  paneRef: React.RefObject<HTMLElement | null>,
  measure: () => number,
): number {
  const [scale, setScale] = useState(1);
  const update = useCallback(() => {
    setScale(measure());
  }, [measure]);
  useEffect(() => {
    const pane = paneRef.current;
    if (pane === null) return;
    update();
    const observer = new ResizeObserver(update);
    observer.observe(pane);
    return () => {
      observer.disconnect();
    };
  }, [paneRef, update]);
  return scale;
}

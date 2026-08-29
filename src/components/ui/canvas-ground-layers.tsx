"use client";

/**
 * THE WELL'S RULE LAYER on the two React Flow canvases — the same ladder the
 * other eight notations draw in SVG, expressed in `<Background>` layers.
 *
 * ONE MODEL, TWO MECHANISMS. `lib/canvas-ground.ts` decides which levels are
 * readable at the current camera and how loud each one is;
 * `components/ui/canvas-field.tsx` paints those levels for the eight SVG kinds
 * and this paints them here. Neither owns a number. A reader changing notation
 * must not see the ground change pitch, and the only way to guarantee that is
 * for both to call one function.
 *
 * REACT FLOW'S `<Background>` IS ALREADY THE RIGHT SHAPE: `gap` is in flow
 * units and `lineWidth`/`size` are in screen pixels, which is exactly the
 * world-pitch / screen-weight pairing the ladder needs. So the only thing this
 * component adds is WHICH gaps to mount, and at what opacity.
 *
 * `useViewport()` RATHER THAN A PROP, and rather than `getZoom()`. It
 * re-renders on every zoom change, so it tracks wheel, pinch, fit and
 * programmatic zooms alike — the argument `viewer-zoom-controls.tsx` already
 * makes for the zoom readout. Reading a viewport imperatively would freeze the
 * ground at whatever the camera was on the last unrelated render.
 *
 * BOTH SHAPES ARE MOUNTED FOR EVERY LEVEL and one of the two is transparent in
 * every theme. Whether a theme rules its ground in dots or in lines is a theme
 * decision, and this app resolves those in CSS so the first frame is right with
 * no post-hydration swap. A `<Background>` painting `transparent` costs one
 * `<svg>` that draws nothing; the alternative costs a frame of wrong ground.
 *
 * A DISTINCT `id` PER LAYER is not decoration: React Flow keys its `<pattern>`
 * off the id, so two layers sharing one make both paint whichever mounted
 * first. The level index is in the id for that reason.
 */

import { Fragment } from "react";

import { Background, BackgroundVariant, useViewport } from "@xyflow/react";

import { groundLevels } from "@/lib/canvas-ground";

export function CanvasGroundLayers(): React.JSX.Element {
  const { zoom } = useViewport();
  return (
    <>
      {groundLevels(zoom).map((level) => (
        <Fragment key={level.index}>
          <Background
            id={`canvas-ground-dots-${level.index}`}
            variant={BackgroundVariant.Dots}
            gap={level.worldPitch}
            size={level.dotSizePx}
            color="var(--canvas-rule-dot)"
            style={{ opacity: level.opacity }}
          />
          <Background
            id={`canvas-ground-lines-${level.index}`}
            variant={BackgroundVariant.Lines}
            gap={level.worldPitch}
            lineWidth={level.lineWidthPx}
            color="var(--canvas-rule-line)"
            style={{ opacity: level.opacity }}
          />
        </Fragment>
      ))}
    </>
  );
}

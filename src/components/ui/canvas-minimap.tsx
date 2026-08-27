"use client";

/**
 * A thumbnail of the whole diagram with a rectangle showing where you are
 * looking, docked directly ABOVE the zoom cluster in the bottom-right corner.
 *
 * WHY IT EARNS ITS PIXELS. Zoomed past fit, a C4 diagram loses the one thing a
 * diagram is for: you can read a container but no longer see what it sits
 * inside, and the only way back was Fit — throwing the zoom away to answer
 * "where am I?". The minimap answers it without moving the camera, and
 * `pannable`/`zoomable` make it a way to travel as well as a way to look.
 *
 * WHY IT DOCKS INSTEAD OF PINNING ITSELF. It used to carry its own
 * `!right-3 !bottom-3` and sit in the opposite corner from the zoom pill, which
 * put the two halves of one question a full screen-width apart: the map answers
 * "where am I", zoom answers "how close am I", and a reader mid-diagram needed
 * both. `!static` hands positioning to the caller's column so the map stacks
 * over the cluster that drives it — the arrangement Miro and Figma both use,
 * and the reason a reader can find it without being told.
 *
 * ONE COMPONENT, TWO CANVASES, on purpose: this is pure chrome (colours, size,
 * corner) over React Flow's own `MiniMap`, and the viewer and the editor
 * differing in how a node is coloured on a thumbnail would be a difference
 * nobody chose. Node colour comes from a CSS token rather than per-type hues —
 * at 160px a node is four pixels wide, so hue is noise and only the SHAPE of
 * the graph reads.
 *
 * Hidden below `sm`: on a phone the map would cover a meaningful share of the
 * canvas it is describing, and the diagram is the content.
 */

import { MiniMap } from "@xyflow/react";

export function CanvasMinimap(): React.JSX.Element {
  return (
    <MiniMap
      pannable
      zoomable
      ariaLabel="Diagram minimap — drag to pan, scroll to zoom"
      /* Tokens, not literals: the map has to survive a theme switch, and the
         viewer's canvas already owns these two colours. */
      nodeColor="var(--node-border)"
      nodeStrokeWidth={0}
      maskColor="color-mix(in oklch, var(--canvas) 68%, transparent)"
      /* `!static` overrides React Flow's own absolute placement so the caller's
         column owns the corner — see the header. */
      className="!static !m-0 hidden overflow-hidden !rounded-lg !border !border-border/70 !bg-card/80 shadow-sm backdrop-blur sm:!block"
      style={{ width: 160, height: 108 }}
    />
  );
}

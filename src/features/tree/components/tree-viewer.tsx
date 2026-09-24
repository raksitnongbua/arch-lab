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

import { useCallback, useRef } from "react";

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

  const measure = useCallback(() => {
    const pane = paneRef.current;
    if (pane === null) return 1;
    const available = pane.clientWidth;
    if (available === 0 || width === 0) return 1;
    return Math.min(1, available / width);
  }, [width]);

  const scale = useMeasuredScale(paneRef, measure);

  return (
    /* THE GROUND GOES ON THE PANE, never inside the drawing: on the drawing
       it would be clipped to the drawing's box, leaving a half-ruled pane.
       It is told the camera's scale because the ladder is a question about
       SCREEN size — a rung chosen for the unscaled drawing lands below the
       legible floor once the camera shrinks it. */
    <div
      ref={paneRef}
      className={cn("aft-tree-pane", CANVAS_RULE_CLASS)}
      style={{ ...groundFieldCss(scale), height: naturalHeight * scale }}
    >
      <div
        className="aft-tree-camera"
        style={{ transform: `scale(${scale})`, width }}
      >
        <TreeDiagram file={file} />
      </div>
    </div>
  );
}

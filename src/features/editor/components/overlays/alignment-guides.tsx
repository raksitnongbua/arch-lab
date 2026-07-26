"use client";

/**
 * Alignment guides (AF-E1-S3) — COMPLETE in Batch 1, owned by T1-B for the
 * sprint. `canvas.tsx` computes alignment during a drag and publishes guide
 * lines here; this overlay renders them in flow coordinates inside the React
 * Flow viewport so they pan and zoom with the diagram. Guides appear only
 * while a dragged node is genuinely snapped to a sibling's edge or centre.
 */

import { ViewportPortal, useViewport } from "@xyflow/react";
import { create } from "zustand";

export interface AlignmentGuide {
  id: string;
  orientation: "horizontal" | "vertical";
  /** Flow-space coordinate of the line: y for horizontal, x for vertical. */
  position: number;
  /** Flow-space extent of the line along its own axis. */
  from: number;
  to: number;
}

interface AlignmentGuidesState {
  guides: AlignmentGuide[];
}

const useAlignmentGuidesStore = create<AlignmentGuidesState>(() => ({
  guides: [],
}));

/** Imperative setters for the canvas drag handlers. */
export function setAlignmentGuides(guides: AlignmentGuide[]): void {
  const current = useAlignmentGuidesStore.getState().guides;
  if (current.length === 0 && guides.length === 0) return;
  useAlignmentGuidesStore.setState({ guides });
}

export function clearAlignmentGuides(): void {
  setAlignmentGuides([]);
}

export function AlignmentGuides(): React.JSX.Element | null {
  const guides = useAlignmentGuidesStore((s) => s.guides);
  const { zoom } = useViewport();

  if (guides.length === 0) return null;

  // The guide must read as a hairline at every zoom level.
  const thickness = 1 / Math.max(zoom, 0.0001);

  return (
    <ViewportPortal>
      {guides.map((guide) => (
        <div
          key={guide.id}
          aria-hidden="true"
          className="pointer-events-none absolute bg-accent"
          style={
            guide.orientation === "vertical"
              ? {
                  left: guide.position,
                  top: guide.from,
                  width: thickness,
                  height: guide.to - guide.from,
                }
              : {
                  left: guide.from,
                  top: guide.position,
                  width: guide.to - guide.from,
                  height: thickness,
                }
          }
        />
      ))}
    </ViewportPortal>
  );
}

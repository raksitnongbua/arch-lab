"use client";

/**
 * The editor canvas's guide STATE. The drawing lives in
 * `components/ui/alignment-guides`, shared with the `/live` C4 canvas, and
 * the geometry in `lib/align-snap` — one definition of a snap, one of a
 * hairline, and this holds only the answer for this canvas.
 *
 * A STORE RATHER THAN A PROP because this canvas publishes guides from
 * imperative drag handlers that do not own the overlay's render. The viewer
 * canvas holds the same answer in ordinary state; neither is wrong, and
 * neither can draw a guide the other would draw differently.
 */

import { create } from "zustand";

import { AlignmentGuides as GuideLines } from "@/components/ui/alignment-guides";
import type { AlignmentGuide } from "@/lib/align-snap";

export type { AlignmentGuide };

interface AlignmentGuidesState {
  guides: readonly AlignmentGuide[];
}

const useAlignmentGuidesStore = create<AlignmentGuidesState>(() => ({
  guides: [],
}));

/** Imperative setters for the canvas drag handlers. */
export function setAlignmentGuides(guides: readonly AlignmentGuide[]): void {
  const current = useAlignmentGuidesStore.getState().guides;
  if (current.length === 0 && guides.length === 0) return;
  useAlignmentGuidesStore.setState({ guides });
}

export function clearAlignmentGuides(): void {
  setAlignmentGuides([]);
}

export function AlignmentGuides(): React.JSX.Element | null {
  const guides = useAlignmentGuidesStore((s) => s.guides);
  return <GuideLines guides={guides} />;
}

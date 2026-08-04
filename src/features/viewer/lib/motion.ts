/**
 * Viewer-local motion constants. The editor's `lib/motion.ts` is frozen
 * after Batch 1, so durations the editor never needed live here instead —
 * same convention, same single reduced-motion authority (the CSS behind
 * these values carries its own `prefers-reduced-motion` fallback, see
 * viewer-canvas.tsx).
 */

import { DURATIONS } from "@/features/editor/lib/motion";

export const VIEWER_DURATIONS = {
  /**
   * One full source → target traversal of the selected connector's luminous
   * gradient band (and one pulse of the arrowhead it arrives at). Slow on
   * purpose: it must read as steady directional current, not a blink.
   */
  edgeFlow: 1600,
  /** Cross-fade when the rest of the diagram dims behind a selection. */
  edgeFocus: DURATIONS.nodeIn,
  /** Hover emphasis on a connector — mirrors the editor's hover band. */
  edgeHover: DURATIONS.hover,
  /**
   * One node's entrance (fade + slight rise) when a diagram loads or a
   * drill/climb lands. Slightly longer than the 320ms level transition so
   * the last cards are still settling as the camera finishes — the two
   * reads as one move, not a transition followed by a second show.
   */
  nodeEnter: 360,
  /** Per-node entrance offset, in diagram reading order (top-left first). */
  nodeEnterStagger: 24,
  /** Ceiling on the total stagger — a 40-node diagram must not trickle in. */
  nodeEnterMaxDelay: 264,
  /** Connectors fade in once the first cards have landed. */
  edgeEnter: 240,
  edgeEnterDelay: 200,
} as const;

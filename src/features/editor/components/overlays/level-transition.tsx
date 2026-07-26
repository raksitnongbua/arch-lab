"use client";

/**
 * STUB — ownership transfers to T2-C in Batch 2 (AF-E2-S4 animated level
 * transitions).
 *
 * Contract (dev-handoff §4.4): props-free, mounted by `canvas.tsx`, reads the
 * store itself (`activeDiagramId` changes drive it). The real implementation
 * animates `transform`/`opacity` only, uses `duration("levelTransition")`
 * from `../../lib/motion`, and cuts instantly under reduced motion.
 */

export function LevelTransition(): React.JSX.Element | null {
  return null;
}

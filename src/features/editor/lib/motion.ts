/**
 * Motion helper (dev-handoff §4.8). Frozen after Batch 1. Every animated
 * surface in the editor reads its duration from here so reduced-motion is
 * honoured in exactly one place — never re-check the media query in a
 * component.
 */

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export const DURATIONS = {
  hover: 120,
  nodeIn: 180,
  nodeOut: 140,
  edgeDraw: 200,
  selection: 100,
  levelTransition: 320, // within the 250–400ms band (AF-E2-S4)
  fitView: 300,
  themeCrossfade: 150,
} as const;

/**
 * The duration to actually animate with: 0 when the user asked for reduced
 * motion, the configured value otherwise.
 */
export function duration(key: keyof typeof DURATIONS): number {
  return prefersReducedMotion() ? 0 : DURATIONS[key];
}

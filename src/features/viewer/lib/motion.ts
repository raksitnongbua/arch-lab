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
  /**
   * Time for the resting marching dash to advance by exactly ONE dash period
   * — not one traversal of the connector.
   *
   * Per-period is what makes the loop seamless: the pattern repeats along the
   * whole path, so shifting it by one full period lands on a state
   * indistinguishable from the start, and the animation can restart with no
   * visible hitch however long the connector is. Per-traversal timing would
   * instead make every edge's dashes travel at a different speed, since
   * `pathLength` normalisation fixes the pattern's length in path units, not
   * in pixels.
   *
   * At this value a dash crosses a whole connector in roughly four seconds:
   * clearly moving, never hurried. The selected edge's comet (`edgeFlow`)
   * stays much brighter and faster so selecting a connector still reads as an
   * escalation.
   */
  edgeDrift: 900,
  /**
   * One source → target traversal of a SOLID connector's resting comet.
   *
   * Deliberately far slower than the selected comet's `edgeFlow` (1600ms) —
   * this runs on every solid connector at once, all the time, so it has to
   * sit at the edge of notice. The two clocks are what keep resting motion
   * and selection from reading as the same event: selecting a connector
   * makes its light more than three times faster and much brighter.
   *
   * Per TRAVERSAL, not per period, because there is one band on the wire
   * rather than a repeating pattern; the loop is seamless because the band
   * has left the path entirely by the time the cycle restarts.
   */
  edgeRest: 5200,
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

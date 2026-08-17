/**
 * Flowchart-feature motion constants — the one definition of every duration
 * the flowchart trace AND the idle pulse animate with, and the pure timing
 * arithmetic the GIF exporter samples.
 *
 * WHERE THIS SITS IN THE MOTION LAYERING. The existing three `motion.ts`
 * files form a deliberate downstream-only chain: `editor` is the frozen root,
 * `viewer` extends it (importing `DURATIONS`), and `sequence` hangs off the
 * same root (importing `prefersReducedMotion`). This file is a FOURTH leaf at
 * the same downstream tier as `sequence` — it imports from NONE of its
 * siblings, and nothing here should ever be imported by them. Two reasons:
 *   1. Sibling-to-sibling constants would let tuning one canvas silently
 *      re-time another. The viewer's `nodeEnter: 360` and this file's
 *      `nodeEnter: 200` look like duplication; they are not — the C4 value
 *      paces a grid of cards arriving at once, this one paces a single rank
 *      inside a longer staged trace, and the two will be tuned apart.
 *   2. It does not even take `prefersReducedMotion` from the editor root,
 *      because the trace needs no JS reduced-motion read at all: it plays at
 *      FIRST PAINT, before any hook has run, so reduced motion is honoured
 *      entirely by the `prefers-reduced-motion: no-preference` media query in
 *      `styles/flowchart-motion.css` (the same mechanism the sequence
 *      diagram's opening settle uses, for the same mechanical reason — a
 *      JS-written custom property arrives too late to suppress a first-paint
 *      animation). The IDLE PULSE's JS gate lives in the shared
 *      `@/lib/idle-motion` (read by the viewer, stamped as `data-af-idle`),
 *      which is app infrastructure, not a sibling feature — this file only
 *      owns the pulse's clock.
 *
 * Pure and framework-free on purpose: `scripts/flowchart-motion-check.mjs`
 * and `scripts/flowchart-gif-check.mjs` load this file through Node's type
 * stripping, so the numbers the checks assert are the numbers the app ships.
 *
 * CSS cannot import TypeScript, so the values below are duplicated as the
 * `var()` FALLBACKS in `styles/flowchart-motion.css` — and the fallback is
 * what always runs, because nothing stamps the `--flow-*` properties at
 * runtime (the whole trace is a first-paint animation). `check:flowchart-
 * motion` pins each fallback to its constant here so the pair cannot drift.
 */

/** All values in ms. */
export const FLOWCHART_DURATIONS = {
  /**
   * One node's entrance (fade + a small rise). Long enough that a rank reads
   * as ARRIVING rather than flickering on; short enough that, overlapped with
   * the stagger below, the whole trace stays inside the presentation budget.
   */
  nodeEnter: 200,
  /**
   * The beat between consecutive RANKS. Deliberately shorter than one
   * node-plus-edge story (edgeDelay + edgeDraw = 310ms), so consecutive ranks
   * are always mid-flight together and the reveal reads as one continuous
   * sweep down the page — the same overlap reasoning as the sequence
   * viewer's `focusStagger`. A stagger past that sum would turn the trace
   * into a slideshow of ranks.
   */
  rankStagger: 140,
  /**
   * Ceiling on the rank delay — seven beats of `rankStagger`. A forty-rank
   * flowchart must not trickle in for ten seconds (the C4 viewer caps its
   * node stagger for the same reason); ranks past the cap arrive together.
   * The cap is applied identically in CSS (`min()` in the delay calc) and in
   * `flowRankDelay` below, and BOTH stay monotone in rank — which is what
   * keeps "nothing starts before what it flows from" true even after the cap
   * flattens the schedule.
   */
  maxDelay: 980,
  /**
   * How long after its SOURCE rank begins an edge starts drawing. Positive,
   * so an arrow never leaves a box that has not started arriving; smaller
   * than `rankStagger`, so the arrow is already under way when its TARGET
   * rank lands — the line leads the eye to the box, never the box to the
   * line; smaller than `nodeEnter`, so the source is still settling as its
   * arrow leaves and the two read as one gesture. `check:flowchart-motion`
   * asserts all three relations.
   */
  edgeDelay: 90,
  /** One edge drawing source → target (stroke-dashoffset over pathLength 1). */
  edgeDraw: 220,
  /**
   * Delay before the arrowhead fades in, from the edge's own start — the
   * line reaches it first. With `headFade` it ends 20ms after the line
   * completes, so the head landing is the full stop of each hop.
   */
  headDelay: 140,
  /** Arrowhead (and edge-label) fade duration. */
  headFade: 100,
  /**
   * IDLE PULSE — how long after an edge's own trace beat (`--flow-edge-at`)
   * its resting pulse first enters, once the app-wide idle-motion toggle
   * allows it (lib/idle-motion.ts; the reveal itself is never gated — an
   * entrance is motion the reader asked for by opening the page).
   *
   * A CONSTANT past the WORST-CASE trace end, not a per-chart JS-stamped
   * value, and that is load-bearing: the idle gate attribute is in the
   * server-rendered markup (the preference's server snapshot is "on"), so a
   * pulse may legally start before any hook has run, and only a static delay
   * can promise it still starts after the trace has settled. The first pulse
   * anywhere begins at `edgeDelay + idleStart`; `check:flowchart-motion`
   * holds that at or past `flowTraceTotalMs` of a bottomless chart, plus a
   * breath — the trace must visibly FINISH before the echo begins.
   */
  idleStart: 1600,
  /**
   * One idle-pulse cycle per edge — the band crosses, then the edge rests
   * dark for the remainder. The sequence viewer's ambient register (its
   * comet is 4200ms for the same "plays behind a speaker" reason); NOT
   * imported from it, per this file's sibling-independence rule — the two
   * will be tuned apart. Fixed period + fixed per-rank phases (each edge
   * delays by its own trace beat) is what makes the cascade loop without
   * drift: every relation between edges repeats identically each cycle.
   */
  idlePeriod: 4200,
} as const;

/**
 * A per-edge phase offset for the IDLE pulse, in ms within one `idlePeriod`.
 *
 * WHY THE IDLE CASCADE IS SCATTERED AND THE TRACE IS NOT. The first cut gave
 * every edge its trace beat as its pulse phase, so the resting chart re-walked
 * the ranks in strict order forever — faithful to the entrance, and mechanical
 * to watch: a chart at rest looked like it was replaying its own tutorial on a
 * timer. Scattering the phases makes the resting state read as a system with
 * traffic on it rather than a loop on a reel, which is what ambient motion is
 * for. The TRACE keeps its strict rank order untouched: that one is a narration
 * of causality and must never let light move before what it flows from.
 *
 * DERIVED, NOT RANDOM. `Math.random()` would re-scatter on every re-render (a
 * re-parse would visibly reshuffle a resting chart) and would break the GIF
 * exporter's frame-for-frame determinism, which `check:flowchart-gif` pins. So
 * the scatter is a hash of the edge's own index: stable for the life of a
 * document, identical in the browser and in an export, and spread evenly
 * enough across the period that no two neighbours share a phase. Knuth's
 * multiplicative constant, taken mod the period.
 */
export function flowPulsePhase(index: number): number {
  const hashed = Math.imul(index + 1, 2654435761) >>> 0;
  return hashed % FLOWCHART_DURATIONS.idlePeriod;
}

/**
 * When rank `rank`'s nodes begin, in ms from the trace's start. Monotone
 * non-decreasing in rank BY CONSTRUCTION (min of two monotone terms), which
 * is the property the whole choreography rests on: an element can only start
 * after the element it flows from because delays never decrease downstream.
 */
export function flowRankDelay(rank: number): number {
  return Math.min(
    rank * FLOWCHART_DURATIONS.rankStagger,
    FLOWCHART_DURATIONS.maxDelay,
  );
}

/** When an edge LEAVING rank `sourceRank` begins drawing. */
export function flowEdgeDelay(sourceRank: number): number {
  return flowRankDelay(sourceRank) + FLOWCHART_DURATIONS.edgeDelay;
}

/**
 * The trace's full length for a chart whose deepest rank is `maxRank` — the
 * latest finishing element, which is one of: the last rank's nodes, the last
 * edge's line, or that edge's arrowhead. The GIF exporter samples exactly
 * this window, so the exported loop and the on-screen trace share one clock.
 */
export function flowTraceTotalMs(maxRank: number): number {
  const d = FLOWCHART_DURATIONS;
  return Math.max(
    flowRankDelay(maxRank) + d.nodeEnter,
    flowEdgeDelay(maxRank) + d.edgeDraw,
    flowEdgeDelay(maxRank) + d.headDelay + d.headFade,
  );
}

/**
 * Progress of one animation window at time `timeMs`: 0 before `startMs`,
 * 1 from `startMs + durationMs` on, eased in between.
 *
 * The easing is quadratic ease-out — an approximation of the CSS `ease-out`
 * the on-screen trace uses, not a clone of it. The GIF samples its own clock
 * at 12–30 frames per trace, far below the compositor's rate, so matching
 * the cubic-bezier exactly would change nothing a viewer can see; what
 * matters is that both decelerate into their end state, and that this stays
 * a pure function the check scripts can call.
 */
export function flowProgressAt(
  startMs: number,
  durationMs: number,
  timeMs: number,
): number {
  if (timeMs <= startMs) return 0;
  if (timeMs >= startMs + durationMs || durationMs <= 0) return 1;
  const linear = (timeMs - startMs) / durationMs;
  return 1 - (1 - linear) * (1 - linear);
}

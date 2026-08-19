/**
 * Use-case-feature motion constants — the one definition of every duration
 * the use-case reveal and its idle gestures animate with.
 *
 * WHERE THIS SITS IN THE MOTION LAYERING. The four existing `motion.ts`
 * files form a downstream-only chain rooted at `editor`: `viewer` extends
 * it, `sequence` and `flowchart` hang off the same tier as independent
 * leaves. This file is a FIFTH leaf at that tier — it imports from NO
 * sibling, and nothing here should ever be imported by one. The reasons are
 * the flowchart leaf's, verbatim in spirit:
 *   1. Sibling-to-sibling constants would let tuning one canvas silently
 *      re-time another. The flowchart's `edgeDraw: 220` and this file's
 *      `edgeDraw: 240` look like duplication; they are not — the flowchart
 *      draws many short hops in a staged trace, this draws a handful of
 *      long spokes in one closing beat, and the two will be tuned apart.
 *   2. It takes nothing from the editor root either, not even
 *      `prefersReducedMotion`: the reveal plays at FIRST PAINT, before any
 *      hook has run, so reduced motion is honoured entirely by the
 *      `prefers-reduced-motion: no-preference` media query in
 *      `styles/usecase-motion.css` — a JS-written custom property arrives
 *      too late to suppress a first-paint animation.
 *
 * THE MOTION MODEL. The entrance is a composed reveal in the diagram's own
 * reading order — the cast walks on (actors staggered in the layout's
 * placement order), the boundary settles into place as the system's edge,
 * the use cases fill the box column by column, the lines connect them — and
 * the resting diagram then carries two AMBIENT gestures while the app-wide
 * idle-motion toggle allows it: the dashed dependencies march their own
 * dash, and the associations breathe (a non-travelling brightening).
 *
 * THE STAGGERS NAME PLACEMENT, NEVER PRIORITY — the constraint that let the
 * earlier "no stagger" ruling be reversed without inventing an order the
 * document never states:
 *   - Actors stagger by `cast`, the layout's own vertical placement order
 *     (both flanks filling downward). The layout already DREW that order;
 *     restating it in time adds no claim.
 *   - Use cases stagger by `wave`, their COLUMN inside the boundary. A
 *     left-to-right column fill reads as the box filling in, not as a
 *     ranking, because columns are visibly a packing, not a list.
 *   Both staggers are CAPPED (`castCap`, `waveCap`) so a crowded document
 *   compresses instead of trickling — the flowchart's rank-cap rule.
 *
 * THE IDLE GESTURES, and why each fits a diagram with no flow:
 *   - The MARCH is the canvas-wide rule beside `@keyframes af-frame-march`
 *     in globals.css: only the kind that is already dashed may march. An
 *     «include»/«extend» dependency is dashed BY IDENTITY, so its dash may
 *     walk — the line itself stirs, without any light claiming traffic.
 *   - The BREATH is a soft brightening of an association that swells and
 *     fades IN PLACE. It never travels, because an association is
 *     undirected by type and a band riding it would assert a direction the
 *     model forbids (the layout check pins "no arrowhead" for the same
 *     reason; this is that rule's motion form).
 *   A marching band or travelling pulse on associations stays REJECTED:
 *   motion that travels narrates flow, and this document has none.
 *
 * Pure and framework-free: `scripts/usecase-motion-check.mjs` loads this
 * file through Node's type stripping. CSS cannot import TypeScript, so the
 * values are duplicated as the `var()` FALLBACKS in
 * `styles/usecase-motion.css` — and the fallback is what always runs,
 * because nothing stamps the `--uc-*` DURATION properties at runtime (the
 * per-element `--uc-cast`/`--uc-wave`/`--uc-breath-phase` stamps are
 * server-rendered inline styles, present at first paint). That check pins
 * each fallback to its constant here so the pair cannot drift.
 */

/** All values in ms unless noted. The reveal's four phases run in this
 * order, separated by `phaseGap`; `usecaseRevealTotalMs()` is the pinned
 * worst-case total. */
export const USECASE_DURATIONS = {
  /** One actor's fade-and-rise — the cast, first. */
  actorEnter: 220,
  /** Per-`cast` beat between actors — the walk-on. */
  castStagger: 60,
  /** The walk-on's ceiling: a ten-actor document compresses to this rather
   * than delaying the boundary by ten beats. Also the worst case the
   * boundary's own delay is built from, so phase order survives any cast. */
  castCap: 120,
  /** The boundary settles in — the system's edge, second. */
  boundaryEnter: 200,
  /** One use case's rise inside the boundary, third. */
  nodeEnter: 200,
  /** Per-`wave` (column) beat among use cases — the box filling in. */
  waveStagger: 70,
  /** The column fill's ceiling, the cast cap's twin. */
  waveCap: 140,
  /** The beat between consecutive phases — long enough that each phase
   * reads as its own statement, short enough that the reveal stays one
   * gesture rather than a slideshow. */
  phaseGap: 90,
  /** Associations and generalizations draw end to end; dependencies fade in
   * whole instead — a dashoffset draw would overwrite their identifying
   * dash, the same rule the flowchart holds for its loop dash. */
  edgeDraw: 240,
  /** Arrowheads, triangles and edge labels fade this long after their
   * edge's own start — the line reaches them first. */
  headDelay: 160,
  headFade: 90,
  /** Rest between the reveal's end and the first ambient motion. A constant
   * past the worst-case reveal tail (pinned relationally by the check),
   * never a per-document JS value: the idle gate ships in server markup, so
   * ambient motion may legally begin before hydration, and only a static
   * delay can promise it still begins after the reveal has settled. */
  idleStart: 700,
  /** One breath cycle — slow enough to read as ambience, not as blinking. */
  breathPeriod: 5200,
} as const;

/** When the LINES phase begins, in ms from first paint — the worst case
 * over any document, because both staggers are capped. Mirrored in the
 * stylesheet as the `--uc-edge-at` calc; the check pins the mirror. */
export function usecaseEdgeAtMs(): number {
  const d = USECASE_DURATIONS;
  return (
    d.castCap +
    d.actorEnter +
    d.phaseGap +
    d.boundaryEnter +
    d.phaseGap +
    d.waveCap +
    d.nodeEnter +
    d.phaseGap
  );
}

/**
 * The whole reveal's worst-case length. `check:usecase-motion` pins this
 * under the presentation budget the flowchart's trace already answers to —
 * that canvas's first clock shipped at 2180ms and was rejected as TOO SLOW,
 * so the ceiling exists to keep a retune from quietly rebuilding a loading
 * screen out of an entrance.
 */
export function usecaseRevealTotalMs(): number {
  const d = USECASE_DURATIONS;
  return usecaseEdgeAtMs() + Math.max(d.edgeDraw, d.headDelay + d.headFade);
}

/**
 * A deterministic per-edge phase within one breath period, so the
 * associations breathe out of step (a lockstep swell reads as the page
 * blinking) — the flowchart's `flowPulsePhase` idiom, kept local because
 * feature leaves do not import each other (see the header). NEVER
 * Math.random(): a re-render must not visibly reshuffle a diagram at rest,
 * and the same-index-same-phase property is what the check asserts.
 */
export function usecaseBreathPhase(index: number): number {
  const hashed = Math.imul(index + 1, 2654435761) >>> 0;
  /* Capped at HALF the period, not the whole one. Scattering across the full
     period meant an edge could wait the settle plus a complete cycle before its
     first light — measured at 6.6s, which is indistinguishable from "there is
     no animation" to anyone who glances at the page, and it was reported as
     exactly that. Half still de-synchronises the lines; it just bounds the
     wait. `usecaseFirstLightMs` is the number the check pins. */
  return hashed % Math.round(USECASE_DURATIONS.breathPeriod / 2);
}

/**
 * The longest any association waits before its first drift — the settle plus
 * the worst scatter. Pinned by `check:usecase-layout` against a budget, because
 * "ambient" stops being ambient and becomes "broken" once a reader has looked
 * away before anything moved.
 */
export function usecaseFirstLightMs(): number {
  return (
    USECASE_DURATIONS.idleStart + Math.round(USECASE_DURATIONS.breathPeriod / 2)
  );
}

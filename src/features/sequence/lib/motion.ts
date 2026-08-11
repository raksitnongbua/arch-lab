/**
 * Sequence-feature motion constants — the one definition of every duration
 * the sequence viewer animates with, following the convention of
 * `viewer/lib/motion.ts` / `editor/lib/motion.ts`: components never hardcode
 * a millisecond, and reduced motion is honoured through the shared
 * `prefersReducedMotion` helper in exactly one place (the viewer writes
 * these values as `--seq-*` custom properties, zeroed under reduced motion,
 * and `styles/sequence-motion.css` reads only those properties).
 */

import { prefersReducedMotion } from "@/features/editor/lib/motion";

export { prefersReducedMotion };

export const SEQUENCE_DURATIONS = {
  /**
   * One arrow drawing source → target when it is focused. Longer than the
   * editor's 200ms edgeDraw on purpose: there the draw is feedback for an
   * action the user just performed; here it IS the answer to the click —
   * "this is the message you asked about" — so it has to be watchable, not
   * merely perceptible.
   */
  messageDraw: 420,
  /** Arrowhead fade once the line has mostly arrived. */
  headFade: 160,
  /** Delay before the head fades in — the line reaches it first. */
  headDelay: 280,
  /**
   * Per-message delay when a PARTICIPANT's whole message set draws. Small
   * enough that the draws overlap into one calm sweep down the page (each
   * draw is 420ms, so consecutive messages are always mid-flight together),
   * large enough that the step ORDER is visible — the set should read as
   * one gesture, not a stampede and not a flipbook.
   */
  focusStagger: 90,
  /** Cross-fade when focus dims the rest of the diagram (matches the
   * viewer's edgeFocus escalation feel). */
  focusFade: 180,
  /**
   * The idle drift's clock: milliseconds per DASH PERIOD, not per traversal —
   * the same reasoning as `viewer/lib/motion.ts` (`edgeDrift`): the loop
   * advances the pattern by exactly one period per cycle, so per-period
   * timing gives every message the same dash speed, where per-traversal
   * timing would make short and long arrows march at different rates
   * (pathLength fixes the pattern in path units, not pixels). A touch slower
   * than the C4 canvas's 900ms: a sequence diagram stacks many parallel
   * horizontal lines, and at equal speed the column of them reads busier
   * than C4's sparse beziers.
   */
  idleDrift: 1100,
} as const;

/**
 * The custom-property map the viewer stamps on the diagram root. Under
 * reduced motion every duration is 0ms, which parks each animation on its
 * final (meaningful) frame — the CSS `both` fills guarantee the final frame
 * is the element's natural, complete state, never a mid-draw one.
 *
 * `reduced` is a PARAMETER rather than a fresh `prefersReducedMotion()` read:
 * the viewer already tracks the media query reactively (its
 * `useReducedMotion` store), and a second, unsynchronised read here can
 * disagree with the one React rendered with — the same "one source of truth
 * per rule" discipline as everything else in this feature.
 */
export function sequenceMotionVars(reduced: boolean): Record<string, string> {
  const ms = (value: number) => `${reduced ? 0 : value}ms`;
  return {
    "--seq-draw": ms(SEQUENCE_DURATIONS.messageDraw),
    "--seq-head": ms(SEQUENCE_DURATIONS.headFade),
    "--seq-head-delay": ms(SEQUENCE_DURATIONS.headDelay),
    "--seq-stagger": ms(SEQUENCE_DURATIONS.focusStagger),
    "--seq-focus": ms(SEQUENCE_DURATIONS.focusFade),
    "--seq-idle": ms(SEQUENCE_DURATIONS.idleDrift),
    // The idle dash is the one animation a 0ms duration cannot park
    // meaningfully: it is motion and NOTHING else, so its zero state is a
    // stray static dash overlay, not a natural frame. Reduced motion
    // therefore removes the element outright (this var), mirroring what the
    // stylesheet's own `prefers-reduced-motion` block does — the JS route
    // (this function) and the media-query route must end in the same place.
    // The stylesheet's fallback for this var is `none`, so SSR markup shows
    // no idle dash until the viewer mounts — the same contract as the 0ms
    // duration fallbacks.
    "--seq-idle-display": reduced ? "none" : "inline",
  };
}

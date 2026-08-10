/**
 * Sequence-feature motion constants — the one definition of every duration
 * the sequence player animates with, following the convention of
 * `viewer/lib/motion.ts` / `editor/lib/motion.ts`: components never hardcode
 * a millisecond, and reduced motion is honoured through the shared
 * `prefersReducedMotion` helper in exactly one place (the player writes
 * these values as `--seq-*` custom properties, zeroed under reduced motion,
 * and `styles/sequence-motion.css` reads only those properties).
 */

import { prefersReducedMotion } from "@/features/editor/lib/motion";

export { prefersReducedMotion };

export const SEQUENCE_DURATIONS = {
  /**
   * One arrow drawing source → target. Longer than the editor's 200ms
   * edgeDraw on purpose: there the draw is feedback for an action the user
   * just performed; here it IS the content — the reveal is what playback
   * shows, so it has to be watchable, not merely perceptible.
   */
  messageDraw: 420,
  /** Arrowhead fade once the line has mostly arrived. */
  headFade: 160,
  /** Delay before the head fades in — the line reaches it first. */
  headDelay: 280,
  /** Notes, fragment boxes and dividers fading in at their reveal step. */
  scaffoldFade: 240,
  /** Cross-fade when focus dims the rest of the diagram (matches the
   * viewer's edgeFocus escalation feel). */
  focusFade: 180,
  /**
   * Auto-play cadence: one step per interval. Slower than any single
   * animation (draw 420ms + head 160ms) so each arrow fully lands and rests
   * before the next departs — "a readable pace", not a flipbook.
   */
  autoAdvance: 1300,
} as const;

/**
 * The custom-property map the player stamps on the diagram root. Under
 * reduced motion every duration is 0ms, which parks each animation on its
 * final (meaningful) frame — the CSS `both`/`backwards` fills guarantee the
 * final frame is the element's natural, complete state, never a mid-draw one.
 *
 * `reduced` is a PARAMETER rather than a fresh `prefersReducedMotion()` read:
 * the player already tracks the media query reactively (its
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
    "--seq-scaffold": ms(SEQUENCE_DURATIONS.scaffoldFade),
    "--seq-focus": ms(SEQUENCE_DURATIONS.focusFade),
  };
}
